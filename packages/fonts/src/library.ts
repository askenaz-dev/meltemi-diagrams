// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- fontkit ships no types, and other packages compile these sources directly.
/// <reference path="./fontkit.d.ts" />
import * as fontkit from "fontkit";
import {
  FALLBACK_FAMILIES,
  bundledFamily,
  formatUnicodeRange,
  nearestWeight,
  parseUnicodeRange,
  resolveFontStack,
  type BundledFamily,
} from "./families.js";
import { messages } from "./messages/index.js";

/**
 * Reads a file of a bundled font package by its package-relative path, such as
 * `@fontsource/inter/unicode.json` or `inter-ui/web/Inter-Regular.woff2`.
 */
export type FontFileReader = (path: string) => Uint8Array | undefined;

export type FontFormat = "woff2" | "woff" | "truetype" | "opentype";

/**
 * A font file to embed as an `@font-face` rule: a bundled WOFF2 subset limited by `unicodeRange`
 * to the characters used, or a whole project font with an empty `unicodeRange`.
 */
export interface EmbeddedFace {
  readonly family: string;
  readonly weight: number;
  /** The heaviest weight the file stands for when the family has no heavier face. */
  readonly weightTo?: number;
  readonly subset: string;
  readonly format: FontFormat;
  readonly data: Uint8Array;
  readonly unicodeRange: string;
}

/** A font of a project's `assets/fonts/`, as registered with `addFont`. */
export interface ProjectFont {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly format: FontFormat;
  /** True when the font's `fsType` forbids embedding; it is used for measurement only. */
  readonly restricted: boolean;
  readonly source: string;
}

export type AddFontResult =
  | { readonly ok: true; readonly font: ProjectFont }
  | { readonly ok: false; readonly message: string };

interface ProjectFace {
  readonly info: ProjectFont;
  readonly font: fontkit.Font;
  readonly data: Uint8Array;
}

/** The format of font data from its signature. */
export function fontFormat(data: Uint8Array): FontFormat | undefined {
  const tag = String.fromCharCode(...data.subarray(0, 4));
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "opentype";
  if (tag === "true" || (data[0] === 0 && data[1] === 1 && data[2] === 0 && data[3] === 0)) {
    return "truetype";
  }
  return undefined;
}

/** True when an `fsType` value is restricted-licence embedding (bit 1 alone among bits 0 to 3). */
export function restrictsEmbedding(fsType: number): boolean {
  return (fsType & 0x000f) === 0x0002;
}

function numericFlags(
  value: number | { readonly [flag: string]: boolean | undefined },
  bits: Readonly<Record<string, number>>,
): number {
  if (typeof value === "number") return value;
  let result = 0;
  for (const [flag, bit] of Object.entries(bits)) if (value[flag]) result |= bit;
  return result;
}

/** Text drawn as a path in pixel units: baseline at y = 0, starting at x = 0, y down. */
export interface TextOutline {
  readonly d: string;
  readonly width: number;
}

interface SubsetInfo {
  readonly name: string;
  readonly ranges: readonly [number, number][];
}

/** A font able to draw part of a text, in the order fonts are tried for each character. */
interface Source {
  readonly key: string;
  readonly font: fontkit.Font;
  readonly ranges: readonly [number, number][] | null;
}

/** A run of text that one font draws; `null` when no bundled font has the characters. */
interface Run {
  readonly source: Source | null;
  readonly text: string;
}

const AVERAGE_FALLBACK = 0.55;
const ESTIMATED_CAP_HEIGHT = 0.7;

/**
 * Measures, outlines and embeds text with the bundled fonts. Each character is drawn by the
 * requested family when it has the glyph, otherwise by the fallback families, as browsers do.
 * Parsed fonts and widths are cached, so one library serves a whole CLI run or editor session.
 */
export class FontLibrary {
  private readonly subsetTables = new Map<string, SubsetInfo[] | null>();
  private readonly fonts = new Map<string, fontkit.Font | null>();
  private readonly widths = new Map<string, number>();
  private readonly missing = new Set<string>();
  /** Project fonts by lower-case family name, then by `weight|style`. */
  private readonly project = new Map<string, { family: string; faces: Map<string, ProjectFace> }>();

  constructor(private readonly read: FontFileReader) {}

  /**
   * Registers a project font under the family, weight and style it declares. The same family,
   * weight and style registered twice keeps the first file.
   */
  addFont(data: Uint8Array, source: string): AddFontResult {
    // Problems are written in the interface language of the moment the font is added.
    const t = messages().fonts;
    const format = fontFormat(data);
    if (!format) return { ok: false, message: t.format };
    let font: fontkit.Font;
    try {
      font = fontkit.create(data);
    } catch (error) {
      return { ok: false, message: t.unreadable((error as Error).message) };
    }
    const os2 = font["OS/2"];
    const family = (font.familyName ?? "").trim();
    if (family === "") return { ok: false, message: t.noFamily };
    const fsType = numericFlags(os2?.fsType ?? 0, {
      noEmbedding: 0x0002,
      viewOnly: 0x0004,
      editable: 0x0008,
    });
    const fsSelection = numericFlags(os2?.fsSelection ?? 0, { italic: 0x0001 });
    const info: ProjectFont = {
      family,
      weight: os2?.usWeightClass || 400,
      style: (fsSelection & 1) !== 0 || (font.italicAngle ?? 0) !== 0 ? "italic" : "normal",
      format,
      restricted: restrictsEmbedding(fsType),
      source,
    };
    const key = family.toLowerCase();
    const entry = this.project.get(key) ?? { family, faces: new Map<string, ProjectFace>() };
    const faceKey = `${info.weight}|${info.style}`;
    if (!entry.faces.has(faceKey)) entry.faces.set(faceKey, { info, font, data });
    this.project.set(key, entry);
    return { ok: true, font: info };
  }

  /** The project fonts registered so far. */
  projectFonts(): ProjectFont[] {
    return [...this.project.values()].flatMap((entry) =>
      [...entry.faces.values()].map((f) => f.info),
    );
  }

  /** Whether a family's text may be embedded or outlined; false for restricted project fonts. */
  embeddable(family: string): boolean {
    const entry = this.project.get(family.toLowerCase());
    return !entry || [...entry.faces.values()].every((face) => !face.info.restricted);
  }

  /** The family a CSS font stack resolves to: a project family or a bundled one. */
  family(stack: string): string | undefined {
    for (const part of stack.split(",")) {
      const name = part
        .trim()
        .replace(/^["']|["']$/g, "")
        .toLowerCase();
      const project = this.project.get(name);
      if (project) return project.family;
      const bundled = resolveFontStack(name);
      if (bundled) return bundled;
    }
    return undefined;
  }

  /** The project face of a family nearest to a weight, normal style first. */
  private projectFace(family: string, weight: number): ProjectFace | undefined {
    const entry = this.project.get(family.toLowerCase());
    if (!entry) return undefined;
    const faces = [...entry.faces.values()];
    const normal = faces.filter((f) => f.info.style === "normal");
    const pool = normal.length > 0 ? normal : faces;
    return pool.reduce((best, face) => {
      const d = Math.abs(face.info.weight - weight);
      const bestD = Math.abs(best.info.weight - weight);
      return d < bestD || (d === bestD && face.info.weight > best.info.weight) ? face : best;
    });
  }

  knows(stack: string): boolean {
    return this.family(stack) !== undefined;
  }

  /** Width in pixels of `text` in the font a stack resolves to, with kerning. */
  width(text: string, stack: string, weight: number, size: number): number {
    const family = this.family(stack);
    if (!family) return [...text].length * size * AVERAGE_FALLBACK;
    const { sources, weight: w, average } = this.primary(family, weight);
    const key = `${family}|${w}|${text}`;
    let ems = this.widths.get(key);
    if (ems === undefined) {
      ems = 0;
      for (const run of this.runs(sources, family, w, text)) {
        if (run.source === null) {
          for (const ch of run.text) this.missing.add(ch);
          ems += [...run.text].length * average;
        } else {
          ems += run.source.font.layout(run.text).advanceWidth / run.source.font.unitsPerEm;
        }
      }
      this.widths.set(key, ems);
    }
    return ems * size;
  }

  /** The sources, resolved weight and average advance of a family, bundled or from the project. */
  private primary(
    family: string,
    weight: number,
  ): { sources: Source[]; weight: number; average: number } {
    const face = this.projectFace(family, weight);
    if (face) {
      return {
        sources: [{ key: `project:${face.info.source}`, font: face.font, ranges: null }],
        weight: face.info.weight,
        average: face.font["OS/2"].xAvgCharWidth / face.font.unitsPerEm || AVERAGE_FALLBACK,
      };
    }
    const spec = bundledFamily(family)!;
    const w = nearestWeight(spec, weight);
    return { sources: this.sources(spec, w), weight: w, average: this.averageAdvance(spec, w) };
  }

  /** Characters of `text` that no font of the stack or the fallback families covers. */
  uncovered(text: string, stack: string): string[] {
    const family = this.family(stack);
    if (!family) return [];
    const { sources, weight } = this.primary(family, 400);
    return this.runs(sources, family, weight, text)
      .filter((run) => run.source === null)
      .flatMap((run) => [...run.text]);
  }

  /** Every character measured so far that no bundled font covered. */
  unmeasured(): string[] {
    return [...this.missing];
  }

  /** Cap height of the stack's font in ems, rounded to four decimals. */
  capHeight(stack: string, weight: number): number {
    const family = this.family(stack);
    if (!family) return ESTIMATED_CAP_HEIGHT;
    const font = this.primary(family, weight).sources[0]?.font;
    if (!font) return ESTIMATED_CAP_HEIGHT;
    return Math.round((font.capHeight / font.unitsPerEm) * 10000) / 10000;
  }

  /**
   * The family's script subset files that `text` needs, for embedding. Characters only the
   * complete fonts or fallback families have are left to the viewer's fallback, which keeps the
   * embedded data small; they are still measured and outlined exactly.
   */
  faces(family: string, weight: number, text: string): EmbeddedFace[] {
    const project = this.projectFace(family, weight);
    if (project) {
      if (project.info.restricted) return [];
      return [
        {
          family: this.project.get(family.toLowerCase())!.family,
          weight: project.info.weight,
          subset: project.info.source,
          format: project.info.format,
          data: project.data,
          unicodeRange: "",
        },
      ];
    }
    const spec = bundledFamily(family);
    if (!spec) return [];
    const w = nearestWeight(spec, weight);
    const tables = this.subsetTable(spec);
    const bySubset = new Map<string, Set<number>>();
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const subset = tables.find((s) => inRanges(s.ranges, cp))?.name;
      if (!subset || !this.subsetFont(spec, w, subset)?.hasGlyphForCodePoint(cp)) continue;
      const codePoints = bySubset.get(subset) ?? new Set<number>();
      codePoints.add(cp);
      bySubset.set(subset, codePoints);
    }
    const faces: EmbeddedFace[] = [];
    for (const [subset, codePoints] of [...bySubset].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const data = this.read(subsetPath(spec, w, subset));
      if (!data) continue;
      // The heaviest face of a family that stops short of bold stands for the weights above it.
      const heaviest = spec.weights[spec.weights.length - 1]!;
      faces.push({
        family,
        weight: w,
        ...(w === heaviest && heaviest < 700 ? { weightTo: 700 } : {}),
        subset,
        format: "woff2",
        data,
        unicodeRange: formatUnicodeRange(codePoints),
      });
    }
    return faces;
  }

  /** `text` as one path in pixel units, laid out with kerning; baseline at y = 0. */
  outline(text: string, family: string, weight: number, size: number): TextOutline {
    if (!bundledFamily(family) && !this.project.has(family.toLowerCase()))
      return { d: "", width: 0 };
    const { sources, weight: w, average } = this.primary(family, weight);
    const parts: string[] = [];
    let x = 0;
    for (const run of this.runs(sources, family, w, text)) {
      if (run.source === null) {
        x += [...run.text].length * average * size;
        continue;
      }
      const font = run.source.font;
      const scale = size / font.unitsPerEm;
      const laid = font.layout(run.text);
      laid.glyphs.forEach((glyph, i) => {
        const position = laid.positions[i]!;
        const svg = glyph.path
          .scale(scale, -scale)
          .translate(x + position.xOffset * scale, -position.yOffset * scale)
          .toSVG();
        if (svg) parts.push(roundPath(svg));
        x += position.xAdvance * scale;
      });
    }
    return { d: parts.join(""), width: Math.round(x * 100) / 100 };
  }

  // ---------------------------------------------------------------- internals

  /** Splits text into runs drawn by one font each, trying the sources in order per character. */
  private runs(primary: readonly Source[], family: string, weight: number, text: string): Run[] {
    const sources = [
      ...primary,
      ...FALLBACK_FAMILIES.filter((f) => f !== family).flatMap((f) => {
        const fallback = bundledFamily(f)!;
        return this.sources(fallback, nearestWeight(fallback, weight));
      }),
    ];
    const runs: { source: Source | null; text: string }[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const source =
        cp < 0x20
          ? null
          : (sources.find(
              (s) =>
                (s.ranges === null || inRanges(s.ranges, cp)) && s.font.hasGlyphForCodePoint(cp),
            ) ?? null);
      const last = runs[runs.length - 1];
      if (last && last.source?.key === source?.key) last.text += ch;
      else runs.push({ source, text: ch });
    }
    return runs;
  }

  /** The fonts of a family at one weight: its complete font, or its subsets, latin first. */
  private sources(spec: BundledFamily, weight: number): Source[] {
    const completePath = spec.complete?.[weight];
    if (completePath) {
      const font = this.load(completePath);
      if (font) return [{ key: completePath, font, ranges: null }];
    }
    return this.subsetTable(spec).flatMap((subset) => {
      const font = this.subsetFont(spec, weight, subset.name);
      return font
        ? [{ key: subsetPath(spec, weight, subset.name), font, ranges: subset.ranges }]
        : [];
    });
  }

  private subsetTable(spec: BundledFamily): SubsetInfo[] {
    const name = spec.subsets.package;
    if (!this.subsetTables.has(name)) {
      const bytes = this.read(`${name}/unicode.json`);
      if (!bytes) {
        this.subsetTables.set(name, null);
      } else {
        const table = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>;
        const entries = Object.entries(table)
          .filter(([subset]) => !subset.startsWith("["))
          .map(([subset, value]) => ({ name: subset, ranges: parseUnicodeRange(value) }));
        const rank = (subset: string) => (subset === "latin" ? 0 : subset === "latin-ext" ? 1 : 2);
        entries.sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : 1));
        this.subsetTables.set(name, entries);
      }
    }
    return this.subsetTables.get(name) ?? [];
  }

  private subsetFont(
    spec: BundledFamily,
    weight: number,
    subset: string,
  ): fontkit.Font | undefined {
    return this.load(subsetPath(spec, weight, subset));
  }

  private load(path: string): fontkit.Font | undefined {
    if (!this.fonts.has(path)) {
      const bytes = this.read(path);
      this.fonts.set(path, bytes ? fontkit.create(bytes) : null);
    }
    return this.fonts.get(path) ?? undefined;
  }

  /** Average advance in ems, from the OS/2 table of the family's first font. */
  private averageAdvance(spec: BundledFamily, weight: number): number {
    const font = this.sources(spec, weight)[0]?.font;
    if (!font) return AVERAGE_FALLBACK;
    return font["OS/2"].xAvgCharWidth / font.unitsPerEm;
  }
}

function subsetPath(spec: BundledFamily, weight: number, subset: string): string {
  return `${spec.subsets.package}/files/${spec.subsets.prefix}-${subset}-${weight}-normal.woff2`;
}

function inRanges(ranges: readonly [number, number][], cp: number): boolean {
  return ranges.some(([a, b]) => cp >= a && cp <= b);
}

/** Rounds every number of an SVG path to two decimals to keep outlines compact. */
function roundPath(d: string): string {
  return d.replace(/-?\d*\.\d+(?:e-?\d+)?/g, (n) => {
    const rounded = Math.round(Number(n) * 100) / 100;
    return Object.is(rounded, -0) ? "0" : String(rounded);
  });
}
