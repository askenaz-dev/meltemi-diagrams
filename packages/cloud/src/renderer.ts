// The Durable Object that draws previews (`ProjectRenderer`, `mcp-previews`, "The renderer object"):
// the platform's side, and nothing else. One object per project (`RENDERERS.idFromName(project
// id)`), apart from the project's room, whose event loop serves the people editing it. The Worker
// calls it through RPC (`renderer-client.ts`); every rule lives in `RendererCore`, tested in Node.
// The engine, its fonts and icons, ELK and resvg are imported the first time the object draws
// (`renderer-runtime.ts`), so an object that answers from its cache, and the Worker around it,
// never evaluate them. Like `room.ts`, this file imports `cloudflare:workers` and so is compiled by
// the Workers program only.

import { DurableObject } from "cloudflare:workers";
import {
  RendererCore,
  type CatalogOutcome,
  type CatalogRequest,
  type RenderOutcome,
  type RenderRequest,
  type RendererStats,
  type ValidateOutcome,
  type ValidateRequest,
} from "@meltemi/diagrams-mcp/preview";
import type { Env } from "./env.js";
import { sqlPreviewCache } from "./renderer-cache.js";
import type { RendererRuntime } from "./renderer-runtime.js";

export class ProjectRenderer extends DurableObject<Env> {
  private readonly core: RendererCore;
  private runtime: Promise<RendererRuntime> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new RendererCore({
      cache: sqlPreviewCache({
        exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings),
        transactionSync: (run) => ctx.storage.transactionSync(run),
      }),
      engine: async () => (await this.loaded()).engine,
      rasterFonts: async () => (await this.loaded()).rasterFonts(),
    });
  }

  /** Draws a preview, or answers it from the cache; a request it cannot draw is an answer too. */
  async render(request: RenderRequest): Promise<RenderOutcome> {
    return this.core.render(request);
  }

  /** Checks a project's files (the MCP tools `validate` and `write_files`). */
  async validate(request: ValidateRequest): Promise<ValidateOutcome> {
    return this.core.validate(request);
  }

  /** Builds a project's catalog (the MCP tool `publish`). */
  async catalog(request: CatalogRequest): Promise<CatalogOutcome> {
    return this.core.catalog(request);
  }

  /** How many pictures the object drew since it started, and how many answers it keeps. */
  async stats(): Promise<RendererStats> {
    return this.core.stats();
  }

  private loaded(): Promise<RendererRuntime> {
    if (!this.runtime) {
      const loading = import("./renderer-runtime.js").then(({ loadRuntime }) => loadRuntime());
      // A start that failed is tried again by the next drawing rather than kept.
      loading.catch(() => {
        if (this.runtime === loading) this.runtime = undefined;
      });
      this.runtime = loading;
    }
    return this.runtime;
  }
}
