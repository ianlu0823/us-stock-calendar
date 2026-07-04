import { readEarningsCache, writeEarningsCache } from "./cache.js";
import { daysBetween, getRefreshRange, listDates } from "./dateRange.js";
import { sleep } from "./providers/http.js";
import { fetchNasdaqEarnings, fetchNasdaqStockDirectory } from "./providers/nasdaq.js";

const maxConcurrentRequests = 4;
const interBatchDelayMs = 400;
const rejectMinimumPreviousEvents = 200;
const rejectDropRatio = 0.5;

export async function refreshEarnings(options = {}) {
  const range = {
    ...getRefreshRange(),
    ...options,
  };

  const totalDays = daysBetween(range.startDate, range.endDate);
  if (totalDays < 0 || totalDays > 120) {
    throw new Error("Refresh range must be between 0 and 120 days.");
  }

  const previousCache = await readEarningsCache();
  const previousEvents = Array.isArray(previousCache?.events) ? previousCache.events : [];

  const dates = listDates(range.startDate, range.endDate);
  const batches = chunk(dates, maxConcurrentRequests);
  const events = [];
  const errors = [];

  let stockDirectory;
  try {
    stockDirectory = await fetchNasdaqStockDirectory();
  } catch (error) {
    errors.push({
      date: "stock-directory",
      message: error.message || String(error),
    });
    stockDirectory = directoryFromEvents(previousEvents);
  }

  for (const [batchIndex, batch] of batches.entries()) {
    if (batchIndex > 0) {
      await sleep(interBatchDelayMs);
    }

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

  const failedDates = collectFailedDates(errors);
  const enrichedEvents = events.map((event) => enrichEvent(event, stockDirectory));
  const carriedEvents = carryOverEvents(previousEvents, failedDates);
  const sortedEvents = dedupeEvents([...carriedEvents, ...enrichedEvents]).sort(compareEvents);

  // Compare against previous events inside the new window only, so a correct
  // refresh after a long idle gap (window shifted past a busy earnings season)
  // is not falsely rejected.
  const previousInWindow = previousEvents.filter(
    (event) => event.reportDate >= range.startDate && event.reportDate <= range.endDate,
  ).length;
  const rejectReason = options.force
    ? null
    : shouldRejectRefresh(previousInWindow, sortedEvents.length);

  if (rejectReason) {
    const rejectedCache = {
      events: previousEvents,
      meta: {
        ...previousCache.meta,
        status: "rejected",
        lastRefreshAttemptAt: new Date().toISOString(),
        rejectReason,
        errors,
      },
    };
    await writeEarningsCache(rejectedCache);
    return rejectedCache;
  }

  // staleDates lists only days actually showing carried-over data; days that
  // failed with nothing to carry stay visible via errors. When every date
  // failed, keep the old updatedAt so the frontend staleness warning still
  // reflects the age of the data being shown.
  const staleDates = [...new Set(carriedEvents.map((event) => event.reportDate))].sort();
  const allDatesFailed = failedDates.length === dates.length;
  const cache = {
    events: sortedEvents,
    meta: {
      source: "nasdaq",
      status: errors.length ? "partial" : "ok",
      updatedAt: allDatesFailed ? (previousCache?.meta?.updatedAt ?? null) : new Date().toISOString(),
      lastRefreshAttemptAt: new Date().toISOString(),
      startDate: range.startDate,
      endDate: range.endDate,
      eventCount: sortedEvents.length,
      stockDirectoryCount: stockDirectory.size,
      staleDates,
      errors,
    },
  };

  await writeEarningsCache(cache);
  return cache;
}

export async function getCachedEarnings() {
  return readEarningsCache();
}

// A refresh that loses more than half of a previously healthy cache is far more
// likely to be a silently broken fetch than a real calendar change; keep the old
// data and surface the rejection instead of overwriting. options.force bypasses.
export function shouldRejectRefresh(previousCount, nextCount) {
  if (previousCount < rejectMinimumPreviousEvents) {
    return null;
  }

  if (nextCount >= previousCount * rejectDropRatio) {
    return null;
  }

  return `Refusing to overwrite cache: event count would drop from ${previousCount} to ${nextCount}. Re-run with force to override.`;
}

export function carryOverEvents(previousEvents, failedDates) {
  if (!failedDates.length) {
    return [];
  }

  const failed = new Set(failedDates);
  return previousEvents.filter((event) => failed.has(event.reportDate));
}

export function collectFailedDates(errors) {
  return errors
    .map((error) => error.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
}

export function dedupeEvents(events) {
  const byId = new Map();
  events.forEach((event) => {
    byId.set(event.id, event);
  });
  return [...byId.values()];
}

export function directoryFromEvents(previousEvents) {
  const directory = new Map();
  previousEvents.forEach((event) => {
    if (event.symbol && event.sector && !directory.has(event.symbol)) {
      directory.set(event.symbol, {
        sector: event.sector,
        industry: event.industry || "",
        country: event.country || "",
        lastSale: event.lastSale || "",
        netChange: event.netChange || "",
        percentChange: event.percentChange || "",
      });
    }
  });
  return directory;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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

export function findProfile(symbol, stockDirectory) {
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
