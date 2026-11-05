// The renderer's core in Node, with exactly the files the Worker bundles (`renderer-files.ts` and the
// measured font files of `scripts/renderer-bundle.ts`), read from the installed packages, and resvg
// started from its WebAssembly bytes. ELK is the installed `elkjs`, as the command line loads it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { measuredFontFiles } from "../../scripts/renderer-bundle.js";
import { RendererCore, memoryPreviewCache, type PreviewCache } from "../../src/renderer-core.js";
import { PreviewEngine } from "../../src/renderer-engine.js";
import {
  ASSET_FILES,
  MEASURED_FAMILIES,
  RASTER_FILES,
  type BundledFile,
} from "../../src/renderer-files.js";
import { RASTER_FACES, sfntFromWoff } from "../../src/renderer-fonts.js";
import { startRaster } from "../../src/renderer-raster.js";

/** The cloud package's folder: the bundle's `source` paths are relative to it. */
export const CLOUD = fileURLToPath(new URL("../../", import.meta.url));

const read = (file: BundledFile) => new Uint8Array(readFileSync(join(CLOUD, file.source)));

/** The cloud package's version, the product's. */
export const TOOL_VERSION = (
  JSON.parse(readFileSync(join(CLOUD, "package.json"), "utf8")) as { version: string }
).version;

let engine: PreviewEngine | undefined;

/** One engine for the tests of a file, over the bundle's files on disk, as an object keeps one. */
export function nodeEngine(): PreviewEngine {
  if (engine) return engine;
  const fonts = new Map(measuredFontFiles().map((file) => [file.path, read(file)]));
  const assets = new Map(
    ASSET_FILES.map((file) => [file.path, readFileSync(join(CLOUD, file.source), "utf8")]),
  );
  engine = new PreviewEngine({
    toolVersion: TOOL_VERSION,
    fonts: (path) => fonts.get(path),
    measured: MEASURED_FAMILIES,
    assets: (path) => assets.get(path),
  });
  return engine;
}

let faces: Promise<readonly Uint8Array[]> | undefined;

/** The four raster faces made TrueType, with resvg started. */
export function nodeRasterFonts(): Promise<readonly Uint8Array[]> {
  faces ??= (async () => {
    await startRaster(
      readFileSync(join(CLOUD, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm")),
    );
    return Promise.all(
      RASTER_FACES.map((face, i) => sfntFromWoff(read(RASTER_FILES[i]!), face.family)),
    );
  })();
  return faces;
}

/** A renderer core over `cache` (in memory by default) with the Node resources. */
export function nodeRenderer(cache: PreviewCache = memoryPreviewCache()): RendererCore {
  return new RendererCore({ cache, engine: nodeEngine, rasterFonts: nodeRasterFonts });
}

/** The width and height a PNG's header gives, or undefined when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return undefined;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
