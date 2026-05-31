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
      return {
        events: [],
        meta: {
          source: "nasdaq",
          status: "empty",
          updatedAt: null,
        },
      };
    }
    throw error;
  }
}

export async function writeEarningsCache(cache) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
