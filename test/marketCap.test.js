import assert from "node:assert/strict";
import test from "node:test";
import { classifyMarketCap, formatMarketCap, parseMarketCap } from "../src/marketCap.js";

test("parseMarketCap handles the formats Nasdaq actually sends", () => {
  assert.equal(parseMarketCap("$9,422,608,150"), 9_422_608_150);
  assert.equal(parseMarketCap("9422608150"), 9_422_608_150);
  assert.equal(parseMarketCap(123), 123);
  assert.equal(parseMarketCap("N/A"), null);
  assert.equal(parseMarketCap(""), null);
  assert.equal(parseMarketCap(undefined), null);
  assert.equal(parseMarketCap("garbage"), null);
});

test("classifyMarketCap tiers", () => {
  assert.equal(classifyMarketCap(250_000_000_000), "mega");
  assert.equal(classifyMarketCap(50_000_000_000), "large");
  assert.equal(classifyMarketCap(1_000_000_000), "small");
  assert.equal(classifyMarketCap(null), "unknown");
  assert.equal(classifyMarketCap(0), "unknown");
});

test("formatMarketCap renders human-readable values", () => {
  assert.equal(formatMarketCap(1_500_000_000_000), "$1.50T");
  assert.equal(formatMarketCap(9_400_000_000), "$9.4B");
  assert.equal(formatMarketCap(250_000_000), "$250.0M");
  assert.equal(formatMarketCap(null), "Unknown");
});
