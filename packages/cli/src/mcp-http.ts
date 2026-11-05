/**
 * The local MCP server's listener (`mcp-local-server`, "The command" and "Only this machine"):
 * Node's `node:http` on `127.0.0.1`, each request turned into a web `Request` for the stateless
 * handler of `@meltemi/diagrams-mcp` (the one the hosted endpoint serves with) and its `Response`
 * streamed back.
 *
 * A server on the loopback is still reachable by every page the person opens (by DNS rebinding,
 * or a form posted to `127.0.0.1`) and by every account of the machine, so in this order, before
 * the handler reads anything: a `Host` that is not a loopback name is `403`; an `Origin` other than
 * the server's own address is `403`; with a key, a request without it as its bearer token is `401`;
 * a path other than `/mcp` is `404`; a method other than `POST` is `405`; a protocol version the SDK
 * does not serve is `400`; a body over 24 MiB is `413`, never read past the cap.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  MAX_MCP_BYTES,
  finished,
  localhostAllowedHostnames,
  methodNotAllowed,
  refusedVersion,
  rpcError,
  tooLarge,
  validateHostHeader,
  type McpHttpHandler,
} from "@meltemi/diagrams-mcp";

/** The port the server listens on when `--port` does not say. */
export const DEFAULT_MCP_PORT = 7373;
/** The path of the endpoint, as the hosted one. */
export const MCP_PATH = "/mcp";
/** The shortest key `MELTEMI_MCP_KEY` may hold. */
export const MIN_KEY_LENGTH = 16;

/** The address the server listens on: the loopback, never another interface. */
const LOOPBACK = "127.0.0.1";

export interface LocalServerOptions {
  /** The port; 0 picks a free one. */
  readonly port: number;
  /** The handler that answers a request the door let through. */
  readonly handler: McpHttpHandler;
  /** The key every request must carry as its bearer token (`MELTEMI_MCP_KEY`), if any. */
  readonly key?: string | undefined;
}

export interface LocalServer {
  /** The server's address, `http://127.0.0.1:<port>/mcp`. */
  readonly url: string;
  readonly port: number;
  /** Stops listening and ends the connections; resolves once it has. */
  close(): Promise<void>;
  /** Settles when the server has stopped, by `close` or otherwise. */
  readonly closed: Promise<void>;
}

/** The port is taken: another `mdg mcp`, or another program. */
export class PortInUse extends Error {
  constructor(readonly port: number) {
    super(`127.0.0.1:${port} is in use`);
  }
}

const digest = (text: string) => createHash("sha256").update(text).digest();

/** Whether a request carries the key as its bearer token, compared in constant time. */
function carriesKey(request: IncomingMessage, key: string): boolean {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match !== null && timingSafeEqual(digest(match[1]!.trim()), digest(key));
}

/** The request's headers as web headers (a repeated header joined, as `fetch` would). */
function webHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

/** The body, read up to `MAX_MCP_BYTES`; undefined when it is larger (the rest is not read). */
async function readCapped(request: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_MCP_BYTES) return undefined;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    total += chunk.byteLength;
    if (total > MAX_MCP_BYTES) return undefined;
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

/** Writes a web `Response` on Node's response, its body streamed as it comes. */
async function send(response: Response, out: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  out.writeHead(response.status, headers);
  if (response.body === null) {
    out.end();
    return;
  }
  const reader = response.body.getReader();
  // A client that goes away ends the answer's stream too.
  out.on("close", () => void reader.cancel().catch(() => undefined));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise((resolve) => out.once("drain", resolve));
    }
  } catch {
    // The client went away while the answer was streamed: nothing is left to say.
  } finally {
    out.end();
  }
}

/** A JSON-RPC refusal of the door. */
const forbidden = (why: string) => rpcError(403, -32000, `Forbidden: ${why}`);

/** What the door answers before the handler, or undefined to let the request through. */
function door(
  request: IncomingMessage,
  port: number,
  key: string | undefined,
): Response | undefined {
  const host = validateHostHeader(request.headers.host, localhostAllowedHostnames());
  if (!host.ok) return forbidden("the Host header does not name this machine.");
  const origin = request.headers.origin;
  if (
    origin !== undefined &&
    origin !== `http://${LOOPBACK}:${port}` &&
    origin !== `http://localhost:${port}`
  ) {
    return forbidden("a page of another origin cannot reach this server.");
  }
  if (key !== undefined && !carriesKey(request, key)) {
    return rpcError(401, -32000, "Unauthorized: this server asks for its key as a bearer token.", {
      "WWW-Authenticate": "Bearer",
    });
  }
  const path = new URL(request.url ?? "/", `http://${LOOPBACK}`).pathname;
  if (path !== MCP_PATH) return rpcError(404, -32000, `Not found: the endpoint is ${MCP_PATH}.`);
  if (request.method !== "POST") return methodNotAllowed();
  return refusedVersion(
    new Request(`http://${LOOPBACK}:${port}${MCP_PATH}`, { headers: webHeaders(request) }),
  );
}

/** Starts the server; rejects with `PortInUse` when the port is taken. */
export function startLocalServer(options: LocalServerOptions): Promise<LocalServer> {
  let port = options.port;
  const server = createServer((request, out) => {
    void (async () => {
      const refused = door(request, port, options.key);
      if (refused) {
        request.resume();
        await send(refused, out);
        return;
      }
      const bytes = await readCapped(request);
      if (bytes === undefined) {
        await send(tooLarge(), out);
        request.destroy();
        return;
      }
      const forwarded = new Request(`http://${LOOPBACK}:${port}${MCP_PATH}`, {
        method: "POST",
        headers: webHeaders(request),
        body: bytes,
      });
      await send(finished(await options.handler.fetch(forwarded)), out);
    })().catch(() => {
      if (!out.headersSent) {
        out.writeHead(500, { "Content-Type": "application/json" });
      }
      out.end();
    });
  });
  // An idle client keeps no connection open past its answer for long.
  server.keepAliveTimeout = 5_000;
  const closed = new Promise<void>((resolve) => server.once("close", () => resolve()));
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE" ? new PortInUse(options.port) : error);
    });
    server.listen(options.port, LOOPBACK, () => {
      const address = server.address();
      port = typeof address === "object" && address !== null ? address.port : options.port;
      resolve({
        url: `http://${LOOPBACK}:${port}${MCP_PATH}`,
        port,
        closed,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
