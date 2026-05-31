import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getCachedEarnings, refreshEarnings } from "./refreshEarnings.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/healthz" && request.method === "GET") {
    await sendJson(response, {
      ok: true,
      service: "us-stock-calendar",
      time: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    await sendJson(response, await getCachedEarnings());
    return;
  }

  if (url.pathname === "/api/refresh" && request.method === "POST") {
    try {
      await sendJson(response, await refreshEarnings());
    } catch (error) {
      await sendJson(
        response,
        {
          error: error.message || "Refresh failed",
        },
        500,
      );
    }
    return;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    if (request.method === "HEAD") {
      response.end();
    } else {
      createReadStream(filePath).pipe(response);
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

async function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

server.listen(port, host, () => {
  console.log(`US Stock Calendar running at http://${host}:${port}`);
});
