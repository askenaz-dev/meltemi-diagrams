// `/mcp`: the door of the Model Context Protocol endpoint (`mcp-server`, "The endpoint"), through
// which an agent acts on the account's projects with the tools of `mcp/`. A request from a page that
// is not this service's (`Origin`) is `403 request.forbidden`, and a method other than `POST` is `405`
// (the endpoint is stateless: there is no session to open with `GET` or end with `DELETE`), before
// anything else is read; then a protocol version the SDK does not serve is `400`. The token is the
// authorization server's to check (`oauth/provider.ts`: an OAuth access token bound to this endpoint,
// or a `mdg_` API token; anything else is `401` with the challenge that names the metadata), and the
// rest is `mcp/endpoint.ts`. Both are imported the first time a `POST` comes, so that the library, the
// SDK and the catalogue cost nothing to an isolate that never serves one.

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
  const { refusedVersion } = await import("../mcp/endpoint.js");
  const refused = refusedVersion(request);
  if (refused) return refused;
  const { serveProvider } = await import("../oauth/provider.js");
  return serveProvider(ctx);
};
