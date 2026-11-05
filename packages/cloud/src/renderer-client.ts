// The Worker's side of the renderer object: `RenderersApi` over the `RENDERERS` binding, the one
// way the service draws a preview (`mcp-previews`). The object is reached through RPC: the request
// and its answer (the picture's bytes and the report) cross as structured data, and a request the
// object cannot draw is an answer (`ok: false`), never an exception. The files are the caller's to
// give: the room's snapshot at the revision it names, and the binaries they use, from R2.

import type { RendererStats } from "./renderer-core.js";
import type { RenderOutcome, RenderRequest } from "./renderer-protocol.js";

/** What a renderer object answers, as far as the Worker calls it. */
export interface RendererStubLike {
  render(request: RenderRequest): Promise<RenderOutcome>;
  stats(): Promise<RendererStats>;
}

/** What `env.RENDERERS` is: a Durable Object namespace, as far as this file uses it. */
export interface RendererNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): RendererStubLike;
}

/** Previews of a project, drawn by its renderer object. */
export interface RenderersApi {
  render(projectId: string, request: RenderRequest): Promise<RenderOutcome>;
  stats(projectId: string): Promise<RendererStats>;
}

export function durableRenderers(namespace: RendererNamespaceLike): RenderersApi {
  const stub = (projectId: string) => namespace.get(namespace.idFromName(projectId));
  return {
    render: (projectId, request) => stub(projectId).render(request),
    stats: (projectId) => stub(projectId).stats(),
  };
}
