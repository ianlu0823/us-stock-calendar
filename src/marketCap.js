export function parseMarketCap(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!value || value === "N/A") {
    return null;
  }

  const cleaned = String(value).replace(/[$,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyMarketCap(marketCap) {
  if (!marketCap || marketCap <= 0) {
    return "unknown";
  }

  if (marketCap >= 200_000_000_000) {
    return "mega";
  }

  if (marketCap >= 10_000_000_000) {
    return "large";
  }

  return "small";
}

export function formatMarketCap(marketCap) {
  if (!marketCap || marketCap <= 0) {
    return "Unknown";
  }

  if (marketCap >= 1_000_000_000_000) {
    return `$${(marketCap / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (marketCap >= 1_000_000_000) {
    return `$${(marketCap / 1_000_000_000).toFixed(1)}B`;
  }

  if (marketCap >= 1_000_000) {
    return `$${(marketCap / 1_000_000).toFixed(1)}M`;
  }

  return `$${Math.round(marketCap).toLocaleString("en-US")}`;
}
