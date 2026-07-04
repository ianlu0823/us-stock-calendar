const defaultTimeoutMs = 15_000;
const defaultRetries = 2;
const baseBackoffMs = 800;
const maxBackoffMs = 8_000;

export async function fetchJson(url, options = {}) {
  const {
    headers,
    label = "Request",
    timeoutMs = defaultTimeoutMs,
    retries = defaultRetries,
    fetchImpl = fetch,
    sleepImpl = sleep,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleepImpl(backoffMs(attempt, lastError));
    }

    let response;
    try {
      response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = new Error(`${label} network error: ${error.message || error}`);
      continue;
    }

    if (isRetryableStatus(response.status)) {
      await safeText(response);
      lastError = withRetryAfter(new Error(`${label} failed: ${response.status}`), response);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${label} failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      // Akamai block pages arrive as HTML with status 200; often transient,
      // so retry these like 429s instead of failing the date outright.
      const body = await safeText(response);
      lastError = new Error(
        `${label} returned non-JSON (${contentType || "no content-type"}): ${snippet(body)}`,
      );
      continue;
    }

    try {
      return await response.json();
    } catch (error) {
      lastError = new Error(`${label} returned malformed JSON: ${error.message || error}`);
    }
  }

  throw lastError;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function snippet(text, length = 160) {
  return String(text ?? "").replaceAll(/\s+/g, " ").trim().slice(0, length);
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function withRetryAfter(error, response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    error.retryAfterMs = Math.min(retryAfter * 1000, maxBackoffMs * 2);
  }
  return error;
}

function backoffMs(attempt, lastError) {
  if (lastError?.retryAfterMs) {
    return lastError.retryAfterMs;
  }

  const exponential = baseBackoffMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseBackoffMs;
  return Math.min(exponential + jitter, maxBackoffMs);
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
