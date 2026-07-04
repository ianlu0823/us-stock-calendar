import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractRows, normalizeNasdaqRow } from "../src/providers/nasdaq.js";

const weekday = loadFixture("nasdaq-earnings-weekday.json");
const weekend = loadFixture("nasdaq-earnings-weekend.json");

test("extractRows returns rows from a real weekday payload", () => {
  const rows = extractRows(weekday, "test");
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length > 0);
  assert.ok(rows[0].symbol);
});

test("extractRows treats a real weekend payload (rows: null) as an empty day", () => {
  assert.deepEqual(extractRows(weekend, "test"), []);
});

test("extractRows throws on non-200 rCode", () => {
  const payload = { data: null, status: { rCode: 403, bCodeMessage: [{ errorMessage: "blocked" }] } };
  assert.throws(() => extractRows(payload, "test"), /rCode 403.*blocked/);
});

test("extractRows throws when status is missing entirely", () => {
  assert.throws(() => extractRows({ some: "html-ish thing" }, "test"), /rCode missing/);
});

test("extractRows treats far-future 'No record found' (code 1002) as an empty day", () => {
  // Real payload shape observed live on 2026-07-05 for dates ~2 months out.
  const payload = {
    data: null,
    message: null,
    status: {
      rCode: 200,
      bCodeMessage: [{ code: 1002, errorMessage: "Earnings Calendar: No record found." }],
      developerMessage: null,
    },
  };
  assert.deepEqual(extractRows(payload, "test"), []);
});

test("extractRows throws when data is missing without a no-record marker", () => {
  const payload = { data: null, status: { rCode: 200 } };
  assert.throws(() => extractRows(payload, "test"), /no data object/);
});

test("extractRows throws on unexpected rows type", () => {
  const payload = { data: { rows: "not-an-array" }, status: { rCode: 200 } };
  assert.throws(() => extractRows(payload, "test"), /unexpected rows type/);
});

test("normalizeNasdaqRow maps a real Nasdaq row", () => {
  const row = extractRows(weekday, "test")[0];
  const event = normalizeNasdaqRow(row, "2026-07-08");

  assert.equal(event.reportDate, "2026-07-08");
  assert.equal(event.symbol, String(row.symbol).trim().toUpperCase());
  assert.equal(typeof event.marketCap === "number" || event.marketCap === null, true);
  assert.ok(["premarket", "afterhours", "unknown"].includes(event.reportTime));
  assert.ok(event.id.startsWith("2026-07-08:"));
  assert.equal(event.source, "nasdaq");
});

test("normalizeNasdaqRow handles missing fields without throwing", () => {
  const event = normalizeNasdaqRow({}, "2026-07-08");
  assert.equal(event.symbol, "");
  assert.equal(event.marketCap, null);
  assert.equal(event.marketCapTier, "unknown");
  assert.equal(event.reportTime, "unknown");
});

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}
