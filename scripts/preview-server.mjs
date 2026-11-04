#!/usr/bin/env node
// Serves a directory over HTTP so exported SVG and HTML files can be viewed in a browser.
// Usage: node scripts/preview-server.mjs [port] [root]   (defaults: 4173, current directory)
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = Number(process.argv[2] ?? 4173);
const root = resolve(process.argv[3] ?? ".");

const TYPES = {
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".meltemi": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function listing(directory, urlPath) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
    .sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    );
  const items = entries
    .map((e) => {
      const name = e.isDirectory() ? `${e.name}/` : e.name;
      return `<li><a href="${escape(join(urlPath, e.name).split(sep).join("/"))}">${escape(name)}</a></li>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>${escape(urlPath)}</title><style>body{font-family:system-ui,sans-serif;margin:24px}li{line-height:1.7}</style><h1>${escape(urlPath)}</h1><ul>${items}</ul>`;
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const urlPath = decodeURIComponent(url.pathname);
  const file = normalize(join(root, urlPath));
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${urlPath}`);
    return;
  }
  if (statSync(file).isDirectory()) {
    const index = join(file, "index.html");
    if (existsSync(index)) {
      response.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
      createReadStream(index).pipe(response);
    } else {
      response.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
      response.end(listing(file, urlPath));
    }
    return;
  }
  response.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
