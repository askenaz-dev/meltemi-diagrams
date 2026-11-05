// Streamable HTTP, stateless, as both servers serve it (`mcp-server`, "The endpoint";
// `mcp-local-server`, "The command"): every request stands alone and gets a server of its own, built
// by `createMcpHandler` of `@modelcontextprotocol/server` (the 2025 revisions through its stateless
// leg, which answers as an event stream, and the 2026-07-28 revision as JSON); no session id is
// issued. A protocol version the SDK does not serve is `400`, and a body over 24 MiB is `413`, before
// the SDK reads anything; each server's door asks those, and its own questions, first.

import {
  SUPPORTED_PROTOCOL_VERSIONS,
  createMcpHandler,
  type McpHttpHandler,
  type McpServer,
  type McpServerFactory,
} from "@modelcontextprotocol/server";

/** The SDK's guard against DNS rebinding, which a server on the loopback puts in front of the handler. */
export {
  localhostAllowedHostnames,
  validateHostHeader,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";

/**
 * The most a request may weigh: an image of 10 MiB as base64 (13.4 MiB) and its JSON-RPC envelope
 * fit, and so does a push of a document's worth of text.
 */
export const MAX_MCP_BYTES = 24 * 1024 * 1024;

/** The first revision of the modern era, which the SDK's modern leg answers (or refuses) itself. */
const FIRST_MODERN_REVISION = "2026-07-28";

/** A JSON-RPC error a door answers before the SDK, in the SDK's own shape. */
export function rpcError(
  status: number,
  code: number,
  message: string,
  headers: Readonly<Record<string, string>> = {},
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

/** The `400` of a request naming a protocol version the SDK does not serve, or undefined. */
export function refusedVersion(request: Request): Response | undefined {
  const version = request.headers.get("MCP-Protocol-Version");
  if (version === null || servedVersion(version)) return undefined;
  return rpcError(
    400,
    -32000,
    `Bad Request: unsupported protocol version (supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}).`,
  );
}

/** The `405` of a method other than `POST`: there is no session to open with `GET` or end with `DELETE`. */
export function methodNotAllowed(): Response {
  return rpcError(405, -32000, "Method not allowed: the endpoint answers POST only.", {
    Allow: "POST",
  });
}

/** The `413` of a body over `MAX_MCP_BYTES`. */
export function tooLarge(): Response {
  return rpcError(413, -32000, `The request is over ${MAX_MCP_BYTES / 1024 / 1024} MiB.`);
}

/**
 * The stateless handler over `factory`, which builds a request's server. `responseMode` is `auto`,
 * which answers a single JSON body as `json` would, since no tool sends anything before its result
 * (`json` makes the SDK print a warning for every server it builds). A request the SDK refuses is
 * answered; its text may hold what the client sent, so it is not logged.
 */
export function statelessHandler(
  factory: (context: Parameters<McpServerFactory>[0]) => McpServer | Promise<McpServer>,
): McpHttpHandler {
  return createMcpHandler(factory, {
    legacy: "stateless",
    responseMode: "auto",
    maxRequestBodySize: MAX_MCP_BYTES,
    onerror: () => {},
  });
}

/** An answer of the handler, with the headers every answer carries. */
export function finished(response: Response): Response {
  const answer = new Response(response.body, response);
  answer.headers.set("X-Content-Type-Options", "nosniff");
  if (!answer.headers.has("Cache-Control")) answer.headers.set("Cache-Control", "no-store");
  return answer;
}
