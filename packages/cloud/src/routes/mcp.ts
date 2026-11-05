// `/mcp`: the door of the Model Context Protocol endpoint (`mcp-server`, "The endpoint"), through
// which an agent acts on the account's projects with the tools of `mcp/`. A request from a page that
// is not this service's (`Origin`) is `403 request.forbidden`, and a method other than `POST` is `405`
// (the endpoint is stateless: there is no session to open with `GET` or end with `DELETE`), before
// anything else is read. The rest is `mcp/endpoint.ts`, imported the first time a `POST` comes, so
// that the SDK and the catalogue cost nothing to an isolate that never serves one.

import type { Route } from "../context.js";
import { errorResponse, fail } from "../errors.js";
import { originOf } from "../http.js";

export const mcpRoute: Route = async (ctx) => {
  const { request } = ctx;
  // A page of another site, or of another host of the family, never reaches the tools.
  if (request.headers.has("Origin") && originOf(request) !== ctx.config.origin) {
    return errorResponse(fail("request.forbidden"));
  }
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed: the endpoint answers POST only." },
        id: null,
      }),
      {
        status: 405,
        headers: {
          Allow: "POST",
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  const { serveMcp } = await import("../mcp/endpoint.js");
  return serveMcp(ctx);
};
