import { readEarningsCache, writeEarningsCache } from "./cache.js";
import { daysBetween, getRefreshRange, listDates } from "./dateRange.js";
import { fetchNasdaqEarnings, fetchNasdaqStockDirectory } from "./providers/nasdaq.js";

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
  const sortedEvents = dedupeEvents(enrichedEvents).sort(compareEvents);
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
