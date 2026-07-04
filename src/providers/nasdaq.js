import { classifyMarketCap, formatMarketCap, parseMarketCap } from "../marketCap.js";
import { fetchJson, snippet } from "./http.js";

const endpoint = "https://api.nasdaq.com/api/calendar/earnings";
const screenerEndpoint = "https://api.nasdaq.com/api/screener/stocks";

export async function fetchNasdaqEarnings(date, fetchOptions = {}) {
  const url = new URL(endpoint);
  url.searchParams.set("date", date);

  const payload = await fetchJson(url, {
    headers: requestHeaders,
    label: `Nasdaq earnings for ${date}`,
    timeoutMs: 15_000,
    ...fetchOptions,
  });

  const rows = extractRows(payload, `Nasdaq earnings for ${date}`);
  return rows.map((row) => normalizeNasdaqRow(row, date));
}

export async function fetchNasdaqStockDirectory(fetchOptions = {}) {
  const url = new URL(screenerEndpoint);
  url.searchParams.set("tableonly", "true");
  url.searchParams.set("download", "true");

  const payload = await fetchJson(url, {
    headers: requestHeaders,
    label: "Nasdaq screener",
    timeoutMs: 30_000,
    ...fetchOptions,
  });

  const rows = extractRows(payload, "Nasdaq screener");
  if (!rows.length) {
    throw new Error("Nasdaq screener returned zero rows; keeping previous enrichment data.");
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

// Verified Nasdaq behavior (2026-07): both endpoints answer rCode 200 with
// data.rows as an array; days without earnings either keep the data object
// with rows null, or (far-future dates) send data null plus bCodeMessage code
// 1002 "No record found". Anything else (missing status, non-200 rCode,
// unexplained null data) means a blocked or broken response and must fail
// loudly, not become "[]".
const noRecordCode = 1002;

export function extractRows(payload, label) {
  const rCode = payload?.status?.rCode;
  if (rCode !== 200) {
    const detail = payload?.status?.bCodeMessage?.[0]?.errorMessage || payload?.message;
    throw new Error(
      `${label} payload reported rCode ${rCode ?? "missing"}${detail ? `: ${detail}` : ""}`,
    );
  }

  if (!payload.data || typeof payload.data !== "object") {
    if (payload.status?.bCodeMessage?.some((entry) => entry?.code === noRecordCode)) {
      return [];
    }
    throw new Error(`${label} payload has no data object: ${snippet(JSON.stringify(payload))}`);
  }

  const rows = payload.data.rows;
  if (Array.isArray(rows)) {
    return rows;
  }

  if (rows === null || rows === undefined) {
    return [];
  }

  throw new Error(`${label} payload has unexpected rows type: ${snippet(JSON.stringify(rows))}`);
}

export function normalizeNasdaqRow(row, reportDate) {
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
