import { classifyMarketCap, formatMarketCap, parseMarketCap } from "../marketCap.js";

const endpoint = "https://api.nasdaq.com/api/calendar/earnings";
const screenerEndpoint = "https://api.nasdaq.com/api/screener/stocks";

export async function fetchNasdaqEarnings(date) {
  const url = new URL(endpoint);
  url.searchParams.set("date", date);

  const response = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Nasdaq request failed for ${date}: ${response.status}`);
  }

  const payload = await response.json();
  const rows = payload?.data?.rows;

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => normalizeNasdaqRow(row, date));
}

export async function fetchNasdaqStockDirectory() {
  const url = new URL(screenerEndpoint);
  url.searchParams.set("tableonly", "true");
  url.searchParams.set("download", "true");

  const response = await fetch(url, {
    headers: requestHeaders,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Nasdaq screener request failed: ${response.status}`);
  }

  const payload = await response.json();
  const rows = payload?.data?.rows;

  if (!Array.isArray(rows)) {
    return new Map();
  }

  const directory = new Map();
  rows.forEach((row) => {
    const symbol = clean(row.symbol).toUpperCase();
    if (!symbol) {
      return;
    }

    directory.set(symbol, {
      sector: clean(row.sector),
      industry: clean(row.industry),
      country: clean(row.country),
      lastSale: clean(row.lastsale),
      netChange: clean(row.netchange),
      percentChange: clean(row.pctchange),
    });
  });

  return directory;
}

function normalizeNasdaqRow(row, reportDate) {
  const symbol = clean(row.symbol).toUpperCase();
  const marketCap = parseMarketCap(row.marketCap);
  const reportTime = normalizeReportTime(row.time);

  return {
    id: `${reportDate}:${symbol}:${clean(row.fiscalQuarterEnding) || "na"}`,
    symbol,
    name: clean(row.name),
    reportDate,
    reportTime,
    reportTimeLabel: reportTimeLabels[reportTime],
    fiscalQuarterEnding: clean(row.fiscalQuarterEnding),
    epsForecast: clean(row.epsForecast),
    estimatesCount: clean(row.noOfEsts),
    marketCap,
    marketCapDisplay: formatMarketCap(marketCap),
    marketCapTier: classifyMarketCap(marketCap),
    sector: "",
    industry: "",
    country: "",
    lastSale: "",
    netChange: "",
    percentChange: "",
    source: "nasdaq",
  };
}

function normalizeReportTime(value) {
  if (value === "time-pre-market") {
    return "premarket";
  }

  if (value === "time-after-hours") {
    return "afterhours";
  }

  return "unknown";
}

function clean(value) {
  return String(value ?? "").trim();
}

const reportTimeLabels = {
  premarket: "Pre",
  afterhours: "After",
  unknown: "Unknown",
};

const requestHeaders = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
};
