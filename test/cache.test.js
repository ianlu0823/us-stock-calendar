import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// DATA_DIR must be set before the module reads it at import time.
const scratchDir = await mkdtemp(join(tmpdir(), "cache-test-"));
process.env.DATA_DIR = scratchDir;
const { bootstrapEarningsCache, readEarningsCache } = await import("../src/cache.js");

test.after(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

const sampleCache = {
  events: [{ id: "2026-07-16:TSM:Jun/2026", symbol: "TSM", reportDate: "2026-07-16" }],
  meta: { source: "nasdaq", status: "ok", updatedAt: "2026-07-05T00:00:00.000Z" },
};

test("bootstrapEarningsCache is a no-op without a url", async () => {
  assert.equal(await bootstrapEarningsCache({ url: "" }), null);
});

test("bootstrapEarningsCache fetches, persists, and returns the remote cache", async () => {
  let seenHeaders;
  const fetchImpl = async (url, init) => {
    seenHeaders = init.headers;
    return { ok: true, status: 200, json: async () => sampleCache };
  };

  const cache = await bootstrapEarningsCache({
    url: "https://example.test/cache.json",
    token: "tkn",
    fetchImpl,
  });

  assert.equal(cache.events.length, 1);
  assert.equal(seenHeaders.Authorization, "Bearer tkn");

  const persisted = JSON.parse(await readFile(join(scratchDir, "earnings-cache.json"), "utf8"));
  assert.equal(persisted.events[0].symbol, "TSM");

  const readBack = await readEarningsCache();
  assert.equal(readBack.events[0].symbol, "TSM");
});

test("bootstrapEarningsCache returns null on http errors and bad payloads", async () => {
  assert.equal(
    await bootstrapEarningsCache({
      url: "https://example.test/cache.json",
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    }),
    null,
  );

  assert.equal(
    await bootstrapEarningsCache({
      url: "https://example.test/cache.json",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) }),
    }),
    null,
  );
});
