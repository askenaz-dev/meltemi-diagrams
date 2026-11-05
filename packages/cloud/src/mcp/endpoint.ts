// The MCP endpoint's serving (`mcp-server`, "The endpoint"), behind the door of `routes/mcp.ts`, which
// imports this module the first time a request reaches it: the SDK, `zod` and the catalogue's schemas
// are evaluated then, so an isolate that never serves an MCP request never evaluates them.
//
// Streamable HTTP, stateless: every request stands alone, is authenticated by its bearer token and
// gets a server of its own, built by the stateless handler of `@modelcontextprotocol/server` that
// `@meltemi/diagrams-mcp` makes for both servers (the 2025 revisions through its stateless leg, which
// answers as an event stream, and the 2026-07-28 revision as JSON); no session id is issued. In this
// order, before the SDK reads anything: a protocol version the SDK does not serve is `400`
// (`refusedVersion`, which the door asks first), a request without a token the authorization server
// or the service holds is `401` (`oauth/provider.ts`, which hands this module the caller; the cookie
// is never taken), and a body over 24 MiB is `413`, never read past the cap.

import {
  MAX_MCP_BYTES,
  finished,
  refusedVersion,
  rpcError,
  statelessHandler,
  tooLarge,
} from "@meltemi/diagrams-mcp";
import type { McpHttpHandler } from "@modelcontextprotocol/server";
import type { Ctx } from "../context.js";
import { readCappedBytes } from "../http.js";
import type { Caller } from "./caller.js";
import { createServer } from "./server.js";
import type { McpSession } from "./tool.js";

export { MAX_MCP_BYTES, refusedVersion, rpcError };

let handler: McpHttpHandler | undefined;

/**
 * The handler, made once per isolate: it holds nothing of a request. Each request's caller reaches
 * the server it builds through `authInfo.extra`.
 */
function mcpHandler(): McpHttpHandler {
  handler ??= statelessHandler((context) => {
    const session = context.authInfo?.extra?.["session"] as McpSession | undefined;
    if (!session) throw new Error("an MCP request reached the server without its caller");
    return createServer(session);
  });
  return handler;
}

/**
 * Serves a `POST /mcp` whose `Origin` and protocol version the door let through and whose token the
 * authorization server's library resolved to `caller`.
 */
export async function serveMcp(ctx: Ctx, caller: Caller): Promise<Response> {
  const { request } = ctx;
  const session: McpSession = {
    op: { env: ctx.env, deps: ctx.deps, config: ctx.config, principal: caller.principal },
    caller,
  };

  const bytes = await readCappedBytes(request, MAX_MCP_BYTES);
  if (bytes === undefined) return tooLarge();
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
  return finished(response);
}
