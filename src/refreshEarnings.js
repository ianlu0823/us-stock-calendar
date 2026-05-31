import { readEarningsCache, writeEarningsCache } from "./cache.js";
import { daysBetween, getRefreshRange, listDates } from "./dateRange.js";
import { fetchNasdaqEarnings, fetchNasdaqEarningsSurprises, fetchNasdaqStockDirectory } from "./providers/nasdaq.js";

const maxConcurrentRequests = 4;

export async function refreshEarnings(options = {}) {
  const range = {
    ...getRefreshRange(),
    ...options,
  };

  const totalDays = daysBetween(range.startDate, range.endDate);
  if (totalDays < 0 || totalDays > 120) {
    throw new Error("Refresh range must be between 0 and 120 days.");
  }

  const dates = listDates(range.startDate, range.endDate);
  const batches = chunk(dates, maxConcurrentRequests);
  let stockDirectory = new Map();
  const events = [];
  const errors = [];

  try {
    stockDirectory = await fetchNasdaqStockDirectory();
  } catch (error) {
    errors.push({
      date: "stock-directory",
      message: error.message || String(error),
    });
  }

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((date) => fetchNasdaqEarnings(date)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        events.push(...result.value);
      } else {
        errors.push({
          date: batch[index],
          message: result.reason?.message || String(result.reason),
        });
      }
    });
  }

  const enrichedEvents = events.map((event) => enrichEvent(event, stockDirectory));
  const previousQuarterEpsBySymbol = await fetchPreviousQuarterEpsBySymbol(enrichedEvents, errors);
  const eventsWithPreviousQuarterEps = enrichedEvents.map((event) =>
    enrichPreviousQuarterEps(event, previousQuarterEpsBySymbol),
  );
  const sortedEvents = dedupeEvents(eventsWithPreviousQuarterEps).sort(compareEvents);
  const cache = {
    events: sortedEvents,
    meta: {
      source: "nasdaq",
      status: errors.length ? "partial" : "ok",
      updatedAt: new Date().toISOString(),
      startDate: range.startDate,
      endDate: range.endDate,
      eventCount: sortedEvents.length,
      stockDirectoryCount: stockDirectory.size,
      errors,
    },
  };

  await writeEarningsCache(cache);
  return cache;
}

export async function getCachedEarnings() {
  return readEarningsCache();
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function dedupeEvents(events) {
  const byId = new Map();
  events.forEach((event) => {
    byId.set(event.id, event);
  });
  return [...byId.values()];
}

function compareEvents(a, b) {
  if (a.reportDate !== b.reportDate) {
    return a.reportDate.localeCompare(b.reportDate);
  }

  return (b.marketCap || 0) - (a.marketCap || 0);
}

function enrichEvent(event, stockDirectory) {
  const profile = findProfile(event.symbol, stockDirectory);
  return {
    ...event,
    sector: profile?.sector || "",
    industry: profile?.industry || "",
    country: profile?.country || "",
    lastSale: profile?.lastSale || "",
    netChange: profile?.netChange || "",
    percentChange: profile?.percentChange || "",
  };
}

async function fetchPreviousQuarterEpsBySymbol(events, errors) {
  const symbols = [
    ...new Set(
      events
        .filter((event) => event.reportTime !== "unknown")
        .map((event) => event.symbol)
        .filter(Boolean),
    ),
  ];
  const batches = chunk(symbols, maxConcurrentRequests);
  const bySymbol = new Map();

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((symbol) => fetchNasdaqEarningsSurprises(symbol)));
    results.forEach((result, index) => {
      const symbol = batch[index];
      if (result.status === "fulfilled") {
        bySymbol.set(symbol, result.value);
      } else {
        errors.push({
          date: `earnings-surprise:${symbol}`,
          message: result.reason?.message || String(result.reason),
        });
      }
    });
  }

  return bySymbol;
}

function enrichPreviousQuarterEps(event, previousQuarterEpsBySymbol) {
  const rows = previousQuarterEpsBySymbol.get(event.symbol) || [];
  const previousQuarter = rows.find((row) => isBeforeReportDate(row.dateReported, event.reportDate)) || rows[0];

  if (!previousQuarter?.eps) {
    return event;
  }

  return {
    ...event,
    previousQuarterEps: previousQuarter.eps,
    previousQuarterReportDate: previousQuarter.dateReported,
    previousQuarterFiscalEnd: previousQuarter.fiscalQuarterEnd,
  };
}

function isBeforeReportDate(dateReported, reportDate) {
  const reported = parseUsDate(dateReported);
  const report = parseReportDate(reportDate);
  return Boolean(reported && report && reported < report);
}

function parseUsDate(value) {
  const [month, day, year] = String(value || "").split("/").map(Number);
  if (!month || !day || !year) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function parseReportDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function findProfile(symbol, stockDirectory) {
  if (stockDirectory.has(symbol)) {
    return stockDirectory.get(symbol);
  }

  const dotAsDash = symbol.replaceAll(".", "-");
  if (stockDirectory.has(dotAsDash)) {
    return stockDirectory.get(dotAsDash);
  }

  const dotAsSlash = symbol.replaceAll(".", "/");
  if (stockDirectory.has(dotAsSlash)) {
    return stockDirectory.get(dotAsSlash);
  }

  return null;
}
