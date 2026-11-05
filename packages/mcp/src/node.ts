// `@meltemi/diagrams-mcp/node`: the renderer's core under Node, over the installed packages. It is
// given exactly what the Worker's renderer object bundles: the font files of the four measured
// families only (`MEASURED_FAMILIES`; the others are measured with the fallback, as there), the icon
// packs and the library as `createNodeAssetReader` reads them, the four raster faces made TrueType
// and resvg started from its WebAssembly bytes. ELK is the installed `elkjs`, as the command line
// loads it. So a picture drawn here is the one the object draws for the same request.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createNodeAssetReader } from "@meltemi/diagrams-assets/node";
import { BUNDLED_FAMILIES } from "@meltemi/diagrams-fonts";
import { bundledFontFiles, createNodeFontReader } from "@meltemi/diagrams-fonts/node";
import {
  MEASURED_FAMILIES,
  PreviewEngine,
  RASTER_FACES,
  RendererCore,
  memoryPreviewCache,
  sfntFromWoff,
  startRaster,
  type PreviewCache,
} from "./preview/index.js";

const require = createRequire(import.meta.url);

/** This package's version: the product's, which the engine presents to `project.json`. */
export const PACKAGE_VERSION = (require("../package.json") as { version: string }).version;

const MEASURED = BUNDLED_FAMILIES.filter((family) => MEASURED_FAMILIES.has(family.family));

/**
 * Whether the font library reads `path` (a package path, such as `@fontsource/inter/unicode.json`)
 * to measure one of the four measured families: a family's complete files when it has them, else
 * its subset table and the subsets of its weights. The Worker's bundle carries exactly these.
 */
export function isMeasuredFontPath(path: string): boolean {
  return MEASURED.some((family) =>
    family.complete
      ? Object.values(family.complete).includes(path)
      : path.startsWith(`${family.subsets.package}/`),
  );
}

/** The engine's options under Node. */
export interface NodeRendererOptions {
  /** The version the sessions present; this package's by default. */
  readonly toolVersion?: string;
  /** The core's cache; twenty answers in memory by default. */
  readonly cache?: PreviewCache;
}

/** An engine over the installed packages, with only the measured families' font files. */
export function nodeEngine(options: NodeRendererOptions = {}): PreviewEngine {
  const read = createNodeFontReader();
  const measured = new Set(
    bundledFontFiles()
      .map((file) => file.path)
      .filter(isMeasuredFontPath),
  );
  return new PreviewEngine({
    toolVersion: options.toolVersion ?? PACKAGE_VERSION,
    fonts: (path) => (measured.has(path) ? read(path) : undefined),
    measured: MEASURED_FAMILIES,
    assets: createNodeAssetReader(),
  });
}

/** resvg's WebAssembly, as the package ships it. */
export function resvgWasm(): Uint8Array {
  return new Uint8Array(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
}

/** The four raster faces made TrueType, with resvg started. */
export async function nodeRasterFonts(): Promise<readonly Uint8Array[]> {
  await startRaster(resvgWasm());
  const read = createNodeFontReader();
  return Promise.all(
    RASTER_FACES.map(async (face) => {
      const woff = read(face.path);
      if (!woff) throw new Error(`the raster face ${face.path} is not installed`);
      return sfntFromWoff(woff, face.family);
    }),
  );
}

/**
 * A renderer core under Node: the engine is made on the first call, and the raster faces (with
 * resvg) on the first PNG, each once. A failure to make them is tried again by the next call.
 */
export function nodeRenderer(options: NodeRendererOptions = {}): RendererCore {
  let engine: PreviewEngine | undefined;
  let faces: Promise<readonly Uint8Array[]> | undefined;
  return new RendererCore({
    cache: options.cache ?? memoryPreviewCache(),
    engine: () => (engine ??= nodeEngine(options)),
    rasterFonts: () => {
      if (!faces) {
        const making = nodeRasterFonts();
        making.catch(() => {
          if (faces === making) faces = undefined;
        });
        faces = making;
      }
      return faces;
    },
  });
}
