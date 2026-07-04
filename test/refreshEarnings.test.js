import assert from "node:assert/strict";
import test from "node:test";
import {
  carryOverEvents,
  collectFailedDates,
  dedupeEvents,
  directoryFromEvents,
  findProfile,
  shouldRejectRefresh,
} from "../src/refreshEarnings.js";

test("shouldRejectRefresh rejects a >50% drop from a healthy cache", () => {
  const reason = shouldRejectRefresh(1000, 400);
  assert.match(reason, /1000 to 400/);
});

test("shouldRejectRefresh allows normal fluctuation", () => {
  assert.equal(shouldRejectRefresh(1000, 700), null);
  assert.equal(shouldRejectRefresh(1000, 500), null);
});

test("shouldRejectRefresh never blocks growth from a small or empty cache", () => {
  assert.equal(shouldRejectRefresh(0, 0), null);
  assert.equal(shouldRejectRefresh(199, 10), null);
});

test("carryOverEvents keeps previous events only for failed dates", () => {
  const previous = [
    { id: "a", reportDate: "2026-07-06" },
    { id: "b", reportDate: "2026-07-07" },
    { id: "c", reportDate: "2026-07-08" },
  ];
  const carried = carryOverEvents(previous, ["2026-07-07"]);
  assert.deepEqual(carried.map((event) => event.id), ["b"]);
  assert.deepEqual(carryOverEvents(previous, []), []);
});

test("collectFailedDates keeps only ISO dates and sorts them", () => {
  const errors = [
    { date: "2026-07-09", message: "timeout" },
    { date: "stock-directory", message: "500" },
    { date: "2026-07-07", message: "429" },
  ];
  assert.deepEqual(collectFailedDates(errors), ["2026-07-07", "2026-07-09"]);
});

test("dedupeEvents lets later (fresher) events win by id", () => {
  const events = [
    { id: "x", name: "old" },
    { id: "x", name: "new" },
    { id: "y", name: "only" },
  ];
  const deduped = dedupeEvents(events);
  assert.equal(deduped.length, 2);
  assert.equal(deduped.find((event) => event.id === "x").name, "new");
});

test("directoryFromEvents rebuilds enrichment profiles from cached events", () => {
  const events = [
    { symbol: "AAPL", sector: "Technology", industry: "Hardware", country: "United States" },
    { symbol: "NOSECTOR", sector: "" },
  ];
  const directory = directoryFromEvents(events);
  assert.equal(directory.size, 1);
  assert.equal(directory.get("AAPL").sector, "Technology");
});

test("findProfile falls back to dash and slash symbol variants", () => {
  const directory = new Map([
    ["BRK-B", { sector: "Finance" }],
    ["XYZ/A", { sector: "Utilities" }],
  ]);
  assert.equal(findProfile("BRK.B", directory).sector, "Finance");
  assert.equal(findProfile("XYZ.A", directory).sector, "Utilities");
  assert.equal(findProfile("MISSING", directory), null);
});
