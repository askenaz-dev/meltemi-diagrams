// The Worker the renderer's measurements run (`renderer-bench.ts`): the service's own renderer
// object (`ProjectRenderer` of `src/renderer.ts`, the same class and bundle) behind three routes a
// measurement needs and the service does not have. It exists only under `wrangler dev`, on the
// laptop; nothing deploys it.
//
//   GET  /ping                   the Worker alone, for the cost of a request
//   GET  /stats?object=<name>    the object's counters, for the cost of a call to it
//   POST /render?object=<name>   a render request as JSON; answers the report and the bytes' size
//                                and SHA-256

import type { RendererNamespaceLike } from "../../src/renderer-client.js";
import type { RenderRequest } from "@meltemi/diagrams-mcp/preview";

export { ProjectRenderer } from "../../src/renderer.js";

interface BenchEnv {
  readonly RENDERERS: RendererNamespaceLike;
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

export default {
  async fetch(request: Request, env: BenchEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ping") return new Response("ok");
    const name = url.searchParams.get("object") ?? "bench";
    const stub = env.RENDERERS.get(env.RENDERERS.idFromName(name));
    if (url.pathname === "/stats") return Response.json(await stub.stats());
    if (url.pathname === "/render" && request.method === "POST") {
      const body = (await request.json()) as RenderRequest;
      const outcome = await stub.render(body);
      if (!outcome.ok) return Response.json(outcome, { status: 422 });
      return Response.json({
        cached: outcome.cached,
        contentType: outcome.contentType,
        size: outcome.bytes.length,
        sha256: hex(await crypto.subtle.digest("SHA-256", outcome.bytes)),
        report: outcome.report,
      });
    }
    return new Response("not found", { status: 404 });
  },
};
