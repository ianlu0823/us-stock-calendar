import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = process.env.DATA_DIR || join(root, "data");
const cachePath = join(dataDir, "earnings-cache.json");

export async function readEarningsCache() {
  try {
    const content = await readFile(cachePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      const remote = await bootstrapEarningsCache();
      if (remote) {
        return remote;
      }

      return emptyCache();
    }
    throw error;
  }
}

// On ephemeral hosts (Render Free) the local file disappears on every
// restart; when CACHE_BOOTSTRAP_URL is set, pull the published cache from
// the repo's cache-data branch instead of starting empty. Failure is loud
// but non-fatal: the app still starts and a manual refresh can rebuild.
export async function bootstrapEarningsCache(options = {}) {
  const url = options.url ?? process.env.CACHE_BOOTSTRAP_URL;
  const token = options.token ?? process.env.CACHE_BOOTSTRAP_TOKEN;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!url) {
    return null;
  }

  try {
    const response = await fetchImpl(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`request failed: ${response.status}`);
    }

    const cache = await response.json();
    if (!Array.isArray(cache?.events) || !cache?.meta) {
      throw new Error("payload is not a cache object");
    }

    await writeEarningsCache(cache);
    console.log(`Bootstrapped earnings cache from remote (${cache.events.length} events).`);
    return cache;
  } catch (error) {
    console.error(`Cache bootstrap from ${url} failed: ${error.message || error}`);
    return null;
  }
}

function emptyCache() {
  return {
    events: [],
    meta: {
      source: "nasdaq",
      status: "empty",
      updatedAt: null,
    },
  };
}

export async function writeEarningsCache(cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
