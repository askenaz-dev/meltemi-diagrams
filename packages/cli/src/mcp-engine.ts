/**
 * The local server's engine (`mcp-local-server`, "The drawing and the checking on the machine"):
 * the renderer object's core and engine (`@meltemi/diagrams-mcp/node`), made once per process on the
 * first call, with the core's cache of its last twenty answers in memory. A check loads no
 * rasteriser; the first PNG starts resvg and makes the raster faces.
 *
 * ELK and resvg are synchronous, so drawing calls are made one at a time, in the order they came:
 * one promise queue serialises them, and the other tools run meanwhile.
 */

import type {
  CatalogOutcome,
  CatalogRequest,
  RenderOutcome,
  RenderRequest,
  RendererCore,
  ValidateOutcome,
  ValidateRequest,
} from "@meltemi/diagrams-mcp/preview";
import { nodeRenderer } from "@meltemi/diagrams-mcp/node";

/** What the tools ask of the engine. */
export interface DrawingEngine {
  render(request: RenderRequest): Promise<RenderOutcome>;
  validate(request: ValidateRequest): Promise<ValidateOutcome>;
  catalog(request: CatalogRequest): Promise<CatalogOutcome>;
}

/** What draws: the renderer's core, or a stand-in of the tests. */
type Core = Pick<RendererCore, "render" | "validate" | "catalog">;

export class LocalEngine implements DrawingEngine {
  private core: Core | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    toolVersion: string,
    private readonly make: () => Core = () => nodeRenderer({ toolVersion }),
  ) {}

  /** Runs `work` once every call before it has ended. */
  private turn<T>(work: (core: Core) => Promise<T>): Promise<T> {
    const next = this.queue.then(() => work((this.core ??= this.make())));
    // The queue goes on whether this call succeeded or not.
    this.queue = next.catch(() => undefined);
    return next;
  }

  render(request: RenderRequest): Promise<RenderOutcome> {
    return this.turn((core) => core.render(request));
  }

  validate(request: ValidateRequest): Promise<ValidateOutcome> {
    return this.turn((core) => core.validate(request));
  }

  catalog(request: CatalogRequest): Promise<CatalogOutcome> {
    return this.turn((core) => core.catalog(request));
  }
}
