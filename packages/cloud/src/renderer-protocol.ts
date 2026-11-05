// What the renderer object (`ProjectRenderer`, `renderer.ts`) is asked and answers (`mcp-previews`).
// The Worker hands it a project's files at a revision; it answers a picture and a report beside it,
// so a client that cannot see the picture can still judge the drawing. Nothing here touches the
// platform: the object, the Node tests and the measurements all read these shapes.

import { parseTime } from "@meltemi/diagrams-motion";

/** The PNG width when the request names none, in pixels. */
export const DEFAULT_PNG_WIDTH = 1280;
/** The widest PNG a preview draws; a wider request is refused (`request.invalid`). */
export const MAX_PNG_WIDTH = 2048;
/** The narrowest PNG a preview draws. */
export const MIN_PNG_WIDTH = 16;
/**
 * The most pixels a PNG holds (2048 × 2048). A tall diagram at the asked width would pass it: the
 * picture is then drawn narrower, keeping its proportions, and the report says `fitted`. The bound
 * keeps the rasteriser's memory (four bytes a pixel, in an isolate of 128 MB) in hand.
 */
export const MAX_PNG_PIXELS = MAX_PNG_WIDTH * MAX_PNG_WIDTH;
/** How many answers an object keeps: an unchanged revision asked again costs no drawing. */
export const CACHE_ENTRIES = 20;
/** The most diagnostics a report lists; `truncated` says when there were more. */
export const MAX_REPORT_DIAGNOSTICS = 50;

export type PreviewFormat = "svg" | "png";

/**
 * A preview to draw: the files of a project at `revision` (as the room's snapshot gives them, path
 * to text, and the images and fonts they use, path to bytes), the file to draw and what of it.
 */
export interface RenderRequest {
  /** The room's revision the files are at; with the rest of the request, the key of the cache. */
  readonly revision: number;
  /** Path (from the project's root, as the room keeps it) to text. */
  readonly files: Readonly<Record<string, string>>;
  /** Path to the bytes of an image or a font the files use, fetched from R2 by the caller. */
  readonly binaries?: Readonly<Record<string, Uint8Array>>;
  /** The `.meltemi` file to draw, a path of `files`. */
  readonly file: string;
  /** The diagram of the file to draw; the file's first diagram when left out. */
  readonly diagram?: string;
  /** A story of the file: its frame at `at` (its end by default) is drawn instead of a diagram. */
  readonly story?: string;
  /** The time of the frame, as the command line's `--at` (`2.4s`, `1500ms`) or milliseconds. */
  readonly at?: string | number;
  readonly format: PreviewFormat;
  /** PNG only: the picture's width in pixels, 1280 when left out, at most 2048. */
  readonly width?: number;
  /** A theme over the diagram's own, as the command line's `--theme`. */
  readonly theme?: string;
}

/** A diagnostic as a report lists it: where it is (path, 1-based line and column) and what it says. */
export interface ReportDiagnostic {
  readonly path: string;
  readonly code: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

/** What a preview says beside its picture. */
export interface RenderReport {
  readonly revision: number;
  readonly format: PreviewFormat;
  /** The picture's size: pixels of the PNG, units of the SVG. */
  readonly width: number;
  readonly height: number;
  /** How many elements and relations the picture draws. */
  readonly elements: number;
  readonly relations: number;
  /** The file's diagnostics and those the layout found (warnings: a picture with an error is refused). */
  readonly diagnostics: readonly ReportDiagnostic[];
  /**
   * The families the text asks for that the renderer does not hold: measured with the bundled
   * fallback (Inter, then IBM Plex Sans) and, in a PNG, drawn with it. Empty when every text was
   * measured and drawn with its own font.
   */
  readonly estimatedFonts: readonly string[];
  /** True when the diagnostics were more than `MAX_REPORT_DIAGNOSTICS`. */
  readonly truncated: boolean;
  /** PNG only: true when the asked width would pass `MAX_PNG_PIXELS` and a narrower one was drawn. */
  readonly fitted?: boolean;
}

/** A drawn preview: the bytes of the picture, its type and its report. */
export interface RenderSuccess {
  readonly ok: true;
  readonly contentType: "image/png" | "image/svg+xml";
  readonly bytes: Uint8Array;
  readonly report: RenderReport;
  /** True when the answer came from the object's cache (the bytes are the first answer's). */
  readonly cached: boolean;
}

/** Why a preview was not drawn. */
export type RenderErrorCode =
  /** The request is not one the renderer reads: a width over the limit, an unknown file or diagram. */
  | "request.invalid"
  /** The file has an error, or nothing in it can be drawn: `diagnostics` says what. */
  | "diagram.invalid";

export interface RenderFailure {
  readonly ok: false;
  readonly code: RenderErrorCode;
  readonly message: string;
  readonly diagnostics?: readonly ReportDiagnostic[];
}

export type RenderOutcome = RenderSuccess | RenderFailure;

/** A request as the renderer uses it: every default applied. */
export interface ValidRequest {
  readonly revision: number;
  readonly files: Readonly<Record<string, string>>;
  readonly binaries: Readonly<Record<string, Uint8Array>>;
  readonly file: string;
  readonly diagram: string | null;
  readonly story: string | null;
  readonly at: number | null;
  readonly format: PreviewFormat;
  /** The PNG width; null for an SVG. */
  readonly width: number | null;
  readonly theme: string | null;
}

export function failure(
  code: RenderErrorCode,
  message: string,
  diagnostics?: readonly ReportDiagnostic[],
): RenderFailure {
  return { ok: false, code, message, ...(diagnostics ? { diagnostics } : {}) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The request with its defaults, or why it is not one (the message names the field). */
export function validateRequest(value: unknown): ValidRequest | RenderFailure {
  const bad = (message: string) => failure("request.invalid", message);
  if (!isRecord(value)) return bad("The request is not an object.");
  const { revision, files, binaries, file, diagram, story, at, format, width, theme } = value;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return bad("`revision` is not a whole number.");
  }
  if (!isRecord(files) || !Object.values(files).every((text) => typeof text === "string")) {
    return bad("`files` is not a map of paths to text.");
  }
  if (
    binaries !== undefined &&
    (!isRecord(binaries) || !Object.values(binaries).every((b) => b instanceof Uint8Array))
  ) {
    return bad("`binaries` is not a map of paths to bytes.");
  }
  if (typeof file !== "string" || !Object.hasOwn(files, file)) {
    return bad("`file` does not name a file of `files`.");
  }
  if (format !== "svg" && format !== "png") return bad('`format` is neither "svg" nor "png".');
  if (diagram !== undefined && typeof diagram !== "string") return bad("`diagram` is not text.");
  if (story !== undefined && typeof story !== "string") return bad("`story` is not text.");
  if (diagram !== undefined && story !== undefined) {
    return bad("`diagram` and `story` name two things to draw; give one.");
  }
  let time: number | null = null;
  if (at !== undefined) {
    time = typeof at === "number" ? (at >= 0 && Number.isFinite(at) ? at : null) : null;
    if (typeof at === "string") time = parseTime(at);
    if (time === null) return bad("`at` is not a time such as 2.4s or 1500ms.");
  }
  let pixels: number | null = null;
  if (format === "png") {
    pixels = DEFAULT_PNG_WIDTH;
    if (width !== undefined) {
      if (typeof width !== "number" || !Number.isInteger(width)) {
        return bad("`width` is not a whole number of pixels.");
      }
      if (width > MAX_PNG_WIDTH) return bad(`\`width\` is over the limit of ${MAX_PNG_WIDTH}.`);
      if (width < MIN_PNG_WIDTH) return bad(`\`width\` is under ${MIN_PNG_WIDTH}.`);
      pixels = width;
    }
  } else if (width !== undefined) {
    return bad("`width` is for a PNG; an SVG is drawn at its own size.");
  }
  if (theme !== undefined && typeof theme !== "string") return bad("`theme` is not text.");
  return {
    revision,
    files: files as Readonly<Record<string, string>>,
    binaries: (binaries ?? {}) as Readonly<Record<string, Uint8Array>>,
    file,
    diagram: diagram ?? null,
    story: story ?? null,
    at: time,
    format,
    width: pixels,
    theme: theme ?? null,
  };
}

/**
 * The key of a request in the cache: the revision and everything that changes the picture. The
 * files are not in it: at one revision the room holds one set of files.
 */
export function cacheKeyOf(request: ValidRequest): string {
  return JSON.stringify([
    request.revision,
    request.file,
    request.diagram,
    request.story,
    request.at,
    request.format,
    request.width,
    request.theme,
  ]);
}
