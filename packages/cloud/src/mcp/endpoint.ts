// The MCP endpoint's serving (`mcp-server`, "The endpoint"), behind the door of `routes/mcp.ts`, which
// imports this module the first time a request reaches it: the SDK, `zod` and the catalogue's schemas
// are evaluated then, so an isolate that never serves an MCP request never evaluates them.
//
// Streamable HTTP, stateless: every request stands alone, is authenticated by its bearer token and
// gets a server of its own, built by `createMcpHandler` of `@modelcontextprotocol/server` (the 2025
// revisions through its stateless leg, which answers as an event stream, and the 2026-07-28 revision
// as JSON); no session id is issued. In this order, before the SDK reads anything: a protocol version
// the SDK does not serve is `400`, a request without a token the service holds is `401` (the cookie
// is never taken: `caller.ts`), and a body over 24 MiB is `413`, never read past the cap.

import {
  SUPPORTED_PROTOCOL_VERSIONS,
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import type { Ctx } from "../context.js";
import { ApiError, errorResponse } from "../errors.js";
import { readCappedBytes } from "../http.js";
import { authenticate } from "./caller.js";
import { createServer } from "./server.js";
import type { McpSession } from "./tool.js";

/**
 * The most a request may weigh: an image of 10 MiB as base64 (13.4 MiB) and its JSON-RPC envelope
 * fit, and so does a push of a document's worth of text.
 */
export const MAX_MCP_BYTES = 24 * 1024 * 1024;

/** The first revision of the modern era, which the SDK's modern leg answers (or refuses) itself. */
const FIRST_MODERN_REVISION = "2026-07-28";

/** A JSON-RPC error the endpoint answers before the SDK, in the SDK's own shape. */
export function rpcError(
  status: number,
  code: number,
  message: string,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Whether the SDK serves a protocol version a request names (a revision of the modern era is its to judge). */
function servedVersion(version: string): boolean {
  if ((SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(version) && version >= FIRST_MODERN_REVISION;
}

let handler: McpHttpHandler | undefined;

/**
 * The handler, made once per isolate: it holds nothing of a request. Each request's caller reaches
 * the server it builds through `authInfo.extra`. `responseMode` is `auto`, which answers a single
 * JSON body as `json` would, since no tool sends anything before its result (`json` makes the SDK
 * print a warning for every handler it builds).
 */
function mcpHandler(): McpHttpHandler {
  handler ??= createMcpHandler(
    (context) => {
      const session = context.authInfo?.extra?.["session"] as McpSession | undefined;
      if (!session) throw new Error("an MCP request reached the server without its caller");
      return createServer(session);
    },
    {
      legacy: "stateless",
      responseMode: "auto",
      maxRequestBodySize: MAX_MCP_BYTES,
      // A request the SDK refuses is answered; its text may hold what the client sent, so it is not logged.
      onerror: () => {},
    },
  );
  return handler;
}

/** Serves a `POST /mcp` whose `Origin` the door has let through. */
export async function serveMcp(ctx: Ctx): Promise<Response> {
  const { request } = ctx;
  const version = request.headers.get("MCP-Protocol-Version");
  if (version !== null && !servedVersion(version)) {
    return rpcError(
      400,
      -32000,
      `Bad Request: unsupported protocol version (supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}).`,
    );
  }

  let session: McpSession;
  try {
    const caller = await authenticate(request, ctx.deps);
    session = {
      op: { env: ctx.env, deps: ctx.deps, config: ctx.config, principal: caller.principal },
      caller,
    };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const refused = errorResponse(error);
    refused.headers.set("WWW-Authenticate", 'Bearer realm="meltemi-diagrams"');
    return refused;
  }

  const bytes = await readCappedBytes(request, MAX_MCP_BYTES);
  if (bytes === undefined) {
    return rpcError(413, -32000, `The request is over ${MAX_MCP_BYTES / 1024 / 1024} MiB.`);
  }
  // The body as it was read through the cap: the SDK reads this copy, never the client's stream.
  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Uint8Array(bytes),
  });
  const response = await mcpHandler().fetch(forwarded, {
    authInfo: {
      token: "",
      clientId: session.caller.clientId,
      scopes: [...session.caller.scopes],
      extra: { session },
    },
  });
  const answer = new Response(response.body, response);
  answer.headers.set("X-Content-Type-Options", "nosniff");
  if (!answer.headers.has("Cache-Control")) answer.headers.set("Cache-Control", "no-store");
  return answer;
}
