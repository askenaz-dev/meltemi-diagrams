// What the renderer object draws with in the Worker: the bundled files (`renderer-bundle.js`) as
// the engine's readers, ELK's main-thread dispatcher and resvg started from its compiled module.
// The object imports this module the first time it draws; the files, ELK and resvg are separate
// modules of the Worker imported then, so an isolate that never draws never instantiates them. Like
// `renderer.ts`, this file is compiled by the Workers program only: Node cannot import data modules.

import { loadBundle } from "./renderer-bundle.js";
import {
  MEASURED_FAMILIES,
  PreviewEngine,
  RASTER_FACES,
  sfntFromWoff,
  startRaster,
} from "@meltemi/diagrams-mcp/preview";

const TEXT = new TextEncoder();

/**
 * Loads `elk-worker.min.js`, a CommonJS module of the Worker (`rules` in wrangler.jsonc), as the
 * module it exports. The file starts ELK as a real web worker when there is a `self` and no
 * `document`, which is the case in the Worker: it would then take over `self.onmessage` and export
 * nothing. A `document` is there while the module is evaluated, and gone after.
 */
async function loadElk(): Promise<unknown> {
  const scope = globalThis as { document?: unknown };
  const had = "document" in scope;
  if (!had) scope.document = {};
  try {
    const module = (await import("elkjs/lib/elk-worker.min.js")) as { default?: unknown };
    return module.default ?? module;
  } finally {
    if (!had) delete scope.document;
  }
}

/** The engine, and the faces of a PNG with resvg started (on the first PNG, once). */
export interface RendererRuntime {
  readonly engine: PreviewEngine;
  rasterFonts(): Promise<readonly Uint8Array[]>;
}

export async function loadRuntime(): Promise<RendererRuntime> {
  const [bundle, elk] = await Promise.all([loadBundle(), loadElk()]);
  const engine = new PreviewEngine({
    toolVersion: bundle.toolVersion,
    fonts: (path) => {
      const file = bundle.fonts[path];
      if (file === undefined) return undefined;
      return typeof file === "string" ? TEXT.encode(file) : new Uint8Array(file);
    },
    measured: MEASURED_FAMILIES,
    assets: (path) => bundle.assets[path],
    loadElkWorker: () => elk,
  });
  let faces: Promise<readonly Uint8Array[]> | undefined;
  const rasterFonts = (): Promise<readonly Uint8Array[]> => {
    if (!faces) {
      const making = (async () => {
        await startRaster(bundle.wasm);
        return Promise.all(
          RASTER_FACES.map((face) =>
            sfntFromWoff(new Uint8Array(bundle.raster[face.path]!), face.family),
          ),
        );
      })();
      // A failure is tried again by the next PNG rather than kept.
      making.catch(() => {
        if (faces === making) faces = undefined;
      });
      faces = making;
    }
    return faces;
  };
  return { engine, rasterFonts };
}
