// The Worker's side of the renderer object: `RenderersApi` over the `RENDERERS` binding, the one
// way the service draws a preview (`mcp-previews`). The object is reached through RPC: the request
// and its answer (the picture's bytes and the report) cross as structured data, and a request the
// object cannot draw is an answer (`ok: false`), never an exception. The files are the caller's to
// give: the room's snapshot at the revision it names, and the binaries they use, from R2.

import type {
  RendererStats,
  CatalogOutcome,
  CatalogRequest,
  RenderOutcome,
  RenderRequest,
  ValidateOutcome,
  ValidateRequest,
  InspectStoryRequest,
  InspectStoryOutcome,
} from "@meltemi/diagrams-mcp/preview";

/** What a renderer object answers, as far as the Worker calls it. */
export interface RendererStubLike {
  inspectStory(request: InspectStoryRequest): Promise<InspectStoryOutcome>;
  render(request: RenderRequest): Promise<RenderOutcome>;
  validate(request: ValidateRequest): Promise<ValidateOutcome>;
  catalog(request: CatalogRequest): Promise<CatalogOutcome>;
  stats(): Promise<RendererStats>;
}

/** What `env.RENDERERS` is: a Durable Object namespace, as far as this file uses it. */
export interface RendererNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): RendererStubLike;
}

/** Previews of a project, drawn by its renderer object. */
export interface RenderersApi {
  inspectStory(projectId: string, request: InspectStoryRequest): Promise<InspectStoryOutcome>;
  render(projectId: string, request: RenderRequest): Promise<RenderOutcome>;
  /** Checks files of the project (`validate`, and `write_files` before it pushes). */
  validate(projectId: string, request: ValidateRequest): Promise<ValidateOutcome>;
  /** Builds the project's catalog (`publish`). */
  catalog(projectId: string, request: CatalogRequest): Promise<CatalogOutcome>;
  stats(projectId: string): Promise<RendererStats>;
}

export function durableRenderers(namespace: RendererNamespaceLike): RenderersApi {
  const stub = (projectId: string) => namespace.get(namespace.idFromName(projectId));
  return {
    inspectStory: (projectId, request) => stub(projectId).inspectStory(request),
    render: (projectId, request) => stub(projectId).render(request),
    validate: (projectId, request) => stub(projectId).validate(request),
    catalog: (projectId, request) => stub(projectId).catalog(request),
    stats: (projectId) => stub(projectId).stats(),
  };
}
