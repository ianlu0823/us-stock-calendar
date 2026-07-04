import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson } from "../src/providers/http.js";

const noSleep = async () => {};

test("fetchJson returns parsed JSON on success", async () => {
  const fetchImpl = sequence([jsonResponse({ ok: true })]);
  const payload = await fetchJson("https://example.test", { fetchImpl, sleepImpl: noSleep });
  assert.deepEqual(payload, { ok: true });
});

test("fetchJson retries 429 and succeeds", async () => {
  const fetchImpl = sequence([
    jsonResponse({}, { status: 429 }),
    jsonResponse({ ok: true }),
  ]);
  const payload = await fetchJson("https://example.test", {
    label: "Test",
    fetchImpl,
    sleepImpl: noSleep,
  });
  assert.deepEqual(payload, { ok: true });
  assert.equal(fetchImpl.calls, 2);
});

test("fetchJson gives up after exhausting retries on 429", async () => {
  const fetchImpl = sequence([
    jsonResponse({}, { status: 429 }),
    jsonResponse({}, { status: 429 }),
    jsonResponse({}, { status: 429 }),
  ]);
  await assert.rejects(
    fetchJson("https://example.test", { label: "Test", retries: 2, fetchImpl, sleepImpl: noSleep }),
    /Test failed: 429/,
  );
  assert.equal(fetchImpl.calls, 3);
});

test("fetchJson does not retry non-retryable statuses", async () => {
  const fetchImpl = sequence([jsonResponse({}, { status: 404 })]);
  await assert.rejects(
    fetchJson("https://example.test", { label: "Test", fetchImpl, sleepImpl: noSleep }),
    /Test failed: 404/,
  );
  assert.equal(fetchImpl.calls, 1);
});

test("fetchJson retries non-JSON bodies (HTML block pages) and throws a readable error", async () => {
  const fetchImpl = sequence([
    htmlResponse("<html><body>Access Denied</body></html>"),
    htmlResponse("<html><body>Access Denied</body></html>"),
    htmlResponse("<html><body>Access Denied</body></html>"),
  ]);
  await assert.rejects(
    fetchJson("https://example.test", { label: "Test", retries: 2, fetchImpl, sleepImpl: noSleep }),
    /Test returned non-JSON \(text\/html\).*Access Denied/,
  );
  assert.equal(fetchImpl.calls, 3);
});

test("fetchJson recovers when a block page clears on retry", async () => {
  const fetchImpl = sequence([
    htmlResponse("<html><body>Access Denied</body></html>"),
    jsonResponse({ ok: true }),
  ]);
  const payload = await fetchJson("https://example.test", {
    label: "Test",
    fetchImpl,
    sleepImpl: noSleep,
  });
  assert.deepEqual(payload, { ok: true });
});

test("fetchJson retries network errors", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("socket hang up");
    }
    return jsonResponse({ ok: true });
  };
  const payload = await fetchJson("https://example.test", {
    label: "Test",
    fetchImpl,
    sleepImpl: noSleep,
  });
  assert.deepEqual(payload, { ok: true });
  assert.equal(calls, 2);
});

function sequence(responses) {
  const fetchImpl = async () => {
    fetchImpl.calls += 1;
    const next = responses.shift();
    if (!next) {
      throw new Error("sequence exhausted");
    }
    return next;
  };
  fetchImpl.calls = 0;
  return fetchImpl;
}

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function htmlResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/html" }),
    json: async () => {
      throw new Error("not json");
    },
    text: async () => body,
  };
}
