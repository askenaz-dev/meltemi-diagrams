// A preview's SVG made a PNG, with resvg compiled to WebAssembly (`@resvg/resvg-wasm`, MPL-2.0,
// used unmodified). It draws with the fonts it is given and nothing of the system: the four faces of
// `fonts.ts`, and a project's own TrueType, OpenType or WOFF fonts. A family it does not
// hold is drawn with Inter, the default of every generic family but `monospace` (Cascadia Mono).

import { Resvg, initWasm, type InitInput } from "@resvg/resvg-wasm";
import { RASTER_FAMILIES } from "./fonts.js";
import { MAX_PNG_PIXELS } from "./protocol.js";

let started: Promise<void> | undefined;

/**
 * Starts the WebAssembly module, once per isolate (resvg refuses a second start): the compiled
 * module in the Worker, its bytes under Node. Every caller waits for the same start.
 */
export function startRaster(wasm: InitInput | Promise<InitInput>): Promise<void> {
  started ??= initWasm(wasm);
  return started;
}

export interface Raster {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** True when the asked width would have passed `MAX_PNG_PIXELS` and the picture is narrower. */
  readonly fitted: boolean;
}

/**
 * The width a picture of `sceneWidth` × `sceneHeight` units is drawn at for an asked `width`: the
 * asked width, unless the picture would then pass `MAX_PNG_PIXELS`.
 */
export function fittedWidth(width: number, sceneWidth: number, sceneHeight: number): number {
  if (sceneWidth <= 0 || sceneHeight <= 0) return width;
  const height = (width * sceneHeight) / sceneWidth;
  if (width * height <= MAX_PNG_PIXELS) return width;
  return Math.max(1, Math.floor(Math.sqrt((MAX_PNG_PIXELS * sceneWidth) / sceneHeight)));
}

/** Unquotes one name of an escaped `font-family` list. */
function familyName(name: string): string {
  return name.trim().replace(/^(&quot;|"|')|(&quot;|"|')$/g, "");
}

/**
 * resvg draws a text with the first family of its `font-family` list, never one after it: a list
 * that starts with a family it does not hold (the themes' monospace stack starts with
 * `ui-monospace`) would be drawn with Inter, code and tags included. Each list is made to start with
 * the first family of it that `held` names, or with Cascadia Mono when it names `monospace` or
 * `ui-monospace`; a list it holds nothing of is left to the fallback. Only the picture changes: the
 * SVG of an export keeps its lists.
 */
export function rasterFamilies(svg: string, held: ReadonlySet<string>): string {
  const known = new Set([...held].map((family) => family.toLowerCase()));
  return svg.replace(/ font-family="([^"]*)"/g, (whole, list: string) => {
    const names = list.split(",").map(familyName);
    const chosen =
      names.find((name) => known.has(name.toLowerCase())) ??
      (names.some((name) => /^(ui-)?monospace$/i.test(name)) ? "Cascadia Mono" : undefined);
    if (chosen === undefined || names[0]!.toLowerCase() === chosen.toLowerCase()) return whole;
    return ` font-family="&quot;${chosen}&quot;, ${list}"`;
  });
}

/**
 * Draws an SVG as a PNG `width` pixels wide (or narrower, `fitted`), with `fonts` (TTF or OTF) whose
 * families are `families`: the raster faces and a project's own.
 */
export function rasterise(
  svg: string,
  width: number,
  scene: { readonly width: number; readonly height: number },
  fonts: readonly Uint8Array[],
  families: ReadonlySet<string> = RASTER_FAMILIES,
): Raster {
  if (started === undefined) throw new Error("the rasteriser was not started");
  const drawn = fittedWidth(width, scene.width, scene.height);
  const resvg = new Resvg(rasterFamilies(svg, families), {
    fitTo: { mode: "width", value: drawn },
    font: {
      fontBuffers: [...fonts],
      defaultFontFamily: "Inter",
      sansSerifFamily: "Inter",
      serifFamily: "Inter",
      cursiveFamily: "Inter",
      fantasyFamily: "Inter",
      monospaceFamily: "Cascadia Mono",
    },
  });
  try {
    const image = resvg.render();
    try {
      return {
        png: image.asPng(),
        width: image.width,
        height: image.height,
        fitted: drawn < width,
      };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
