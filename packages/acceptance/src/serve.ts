import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

/** An empty page of the served origin, to build checks in. */
export const BLANK_PAGE = "/__blank.html";

export interface ServedFolder {
  /** `http://127.0.0.1:<port>`, without a trailing slash. */
  readonly base: string;
  close(): Promise<void>;
}

/**
 * Serves a folder on 127.0.0.1 with byte ranges, so that videos can seek, and an empty page at
 * {@link BLANK_PAGE}. Nothing outside the folder is served.
 */
export async function serveFolder(root: string): Promise<ServedFolder> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (path === BLANK_PAGE) {
      response.writeHead(200, { "content-type": TYPES[".html"] });
      response.end(
        '<!doctype html><html lang="en"><head><title>Check</title></head><body></body></html>',
      );
      return;
    }
    const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const bytes = readFileSync(file);
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    if (range && (range[1] !== "" || range[2] !== "")) {
      const start =
        range[1] === "" ? Math.max(0, bytes.length - Number(range[2])) : Number(range[1]);
      const end =
        range[1] === "" || range[2] === ""
          ? bytes.length - 1
          : Math.min(Number(range[2]), bytes.length - 1);
      if (start > end || start >= bytes.length) {
        response.writeHead(416, { "content-range": `bytes */${bytes.length}` }).end();
        return;
      }
      response.writeHead(206, {
        "content-type": type,
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${bytes.length}`,
        "content-length": end - start + 1,
      });
      response.end(bytes.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, {
      "content-type": type,
      "accept-ranges": "bytes",
      "content-length": bytes.length,
    });
    response.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
