// The types of `renderer-bundle.js`, which `scripts/renderer-bundle.ts` generates: the files the
// renderer object carries, as the Worker's rules load them, imported when `loadBundle` is called.

export interface RendererBundle {
  /** The font files the library measures with, by package path (a subset table is text). */
  readonly fonts: Readonly<Record<string, ArrayBuffer | string>>;
  /** The WOFF faces a PNG is drawn with, by package path. */
  readonly raster: Readonly<Record<string, ArrayBuffer>>;
  /** The icon packs and the library, as the engine's asset reader names them, as text. */
  readonly assets: Readonly<Record<string, string>>;
  /** resvg, compiled by the platform. */
  readonly wasm: WebAssembly.Module;
  /** The product's version, the package's: the version the engine presents to `project.json`. */
  readonly toolVersion: string;
}

export declare function loadBundle(): Promise<RendererBundle>;
