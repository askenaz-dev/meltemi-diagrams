import type { GroupItem, Scene, SceneItem, TextItem } from "./scene.js";

/** A colour as red, green and blue channels from 0 to 255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Reads an opaque colour written in hexadecimal (`#rgb`, `#rrggbb`, or with an alpha of `ff`) or
 * as `rgb(r, g, b)`; anything else, a translucent colour included, is `null`: the contrast audit
 * leaves what it cannot weigh unchecked.
 */
export function parseColour(text: string): Rgb | null {
  const value = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex !== undefined) {
    const digits =
      hex.length === 3 || hex.length === 4
        ? [...hex].map((d) => d + d).join("")
        : hex.length === 6 || hex.length === 8
          ? hex
          : null;
    if (digits === null) return null;
    if (digits.length === 8 && digits.slice(6) !== "ff") return null;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    value,
  );
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
    if (r > 255 || g > 255 || b > 255) return null;
    if (rgb[4] !== undefined && Number(rgb[4]) !== 1) return null;
    return { r, g, b };
  }
  return null;
}

/** The colour as `#rrggbb`, upper case, as messages write it. */
export function hexOf(colour: Rgb): string {
  const two = (n: number) => n.toString(16).padStart(2, "0");
  return `#${two(colour.r)}${two(colour.g)}${two(colour.b)}`.toUpperCase();
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance as WCAG 2 defines it. */
export function luminance(colour: Rgb): number {
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** The contrast ratio of two colours as WCAG 2 defines it, from 1 to 21, unrounded. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The least ratio for normal text, and for large text (WCAG 2, level AA). */
export const TEXT_CONTRAST = 4.5;
export const LARGE_TEXT_CONTRAST = 3;

/** Large text: 24 px, or 18.66 px (14 pt) and bold. */
export function isLargeText(size: number, weight: number): boolean {
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

/** A text drawn on a fill too close to its colour. */
export interface ContrastProblem {
  /** The id of the element, relation, event or label whose group draws it; `scene` outside any. */
  readonly owner: string;
  readonly text: string;
  /** Upper-case `#rrggbb` of the text and of the fill behind it. */
  readonly color: string;
  readonly fill: string;
  /** The ratio, unrounded, and the least it needed. */
  readonly ratio: number;
  readonly needed: number;
  /** Other texts of the scene with the same colours, after the first, by owner. */
  readonly others: readonly string[];
}

export interface ContrastOptions {
  /** The order owners are reported in: the one with the smallest key first (its source offset). */
  readonly order?: (owner: string) => number;
}

interface Fill {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The opaque colour painted, or `null` when it cannot be weighed (translucent, a gradient). */
  readonly colour: Rgb | null;
}

const contains = (fill: Fill, x: number, y: number) =>
  x >= fill.x && x <= fill.x + fill.width && y >= fill.y && y <= fill.y + fill.height;

const painted = (fill: string) => {
  const value = fill.trim().toLowerCase();
  return value !== "" && value !== "none" && value !== "transparent";
};

/**
 * Checks that every text of a laid-out scene can be read against the fill painted behind it: the
 * last filled shape before it, in paint order, that contains the centre of the text, else the
 * scene's background. A text whose fill cannot be weighed (opacity below 1, a gradient, a
 * pattern, an image, a colour that is not hexadecimal or `rgb()`) is left unchecked. Problems are
 * one for each pair of colours, on the owner that comes first in `order`, naming the others.
 * Groups drawn in their own units (icons, the brand mark) are skipped; a turned group is read in
 * its own coordinates, where its box and its texts agree.
 */
export function auditContrast(scene: Scene, options: ContrastOptions = {}): ContrastProblem[] {
  const fills: Fill[] = [];
  const background = parseColour(scene.background);
  const found: {
    owner: string;
    text: string;
    color: Rgb;
    fill: Rgb;
    ratio: number;
    needed: number;
  }[] = [];

  const behind = (x: number, y: number): Rgb | null | undefined => {
    for (let i = fills.length - 1; i >= 0; i--) {
      const fill = fills[i]!;
      if (contains(fill, x, y)) return fill.colour;
    }
    return background;
  };

  const check = (item: TextItem, owner: string) => {
    if (item.text.trim() === "") return;
    const color = parseColour(item.fill);
    if (!color) return;
    // The anchor's x is the start, the middle or the end of the line; its y is the centre.
    const fill = behind(item.x, item.y);
    if (!fill) return;
    const ratio = contrastRatio(color, fill);
    const needed = isLargeText(item.size, item.weight) ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST;
    if (ratio < needed) found.push({ owner, text: item.text, color, fill, ratio, needed });
  };

  const walk = (
    items: readonly SceneItem[],
    group: GroupItem | undefined,
    translucent: boolean,
  ) => {
    for (const item of items) {
      if (item.kind === "group") {
        // Icons and the brand mark are drawn in their own units; a turn keeps the box's.
        if (item.transform && !item.transform.startsWith("rotate(")) continue;
        // A pen stroke is drawn over what it marks.
        if (item.freehand) continue;
        const faded =
          translucent ||
          (item.opacity !== undefined && item.opacity < 1) ||
          (item.styleOpacity !== undefined && item.styleOpacity < 1);
        walk(item.items, item, faded);
      } else if (item.kind === "rect") {
        if (!painted(item.fill)) continue;
        const opaque = !translucent && (item.opacity === undefined || item.opacity >= 1);
        fills.push({
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          colour: opaque ? parseColour(item.fill) : null,
        });
      } else if (item.kind === "path") {
        // A shape's path fills the box of the element that draws it; other paths (arrowheads,
        // icons' strokes) are too small to hold a text and have no box to read.
        if (!painted(item.fill) || !group?.bounds) continue;
        if (group.role !== "element" && group.role !== "event") continue;
        const opaque =
          !translucent &&
          (item.opacity === undefined || item.opacity >= 1) &&
          (item.fillOpacity === undefined || item.fillOpacity >= 1);
        const { x, y, width, height } = group.bounds;
        fills.push({ x, y, width, height, colour: opaque ? parseColour(item.fill) : null });
      } else if (item.kind === "image") {
        fills.push({ x: item.x, y: item.y, width: item.width, height: item.height, colour: null });
      } else if (item.kind === "text") {
        if (translucent) continue;
        check(item, group?.id ?? "scene");
      }
    }
  };
  walk(scene.items, undefined, false);

  const order = options.order ?? (() => 0);
  const pairs = new Map<string, typeof found>();
  for (const problem of found) {
    const key = `${hexOf(problem.color)}|${hexOf(problem.fill)}`;
    const list = pairs.get(key);
    if (list) list.push(problem);
    else pairs.set(key, [problem]);
  }
  const problems: ContrastProblem[] = [];
  for (const list of pairs.values()) {
    // The first in source order; the paint order breaks ties.
    const first = list.reduce((best, p) => (order(p.owner) < order(best.owner) ? p : best));
    problems.push({
      owner: first.owner,
      text: first.text,
      color: hexOf(first.color),
      fill: hexOf(first.fill),
      ratio: first.ratio,
      needed: first.needed,
      others: list.filter((p) => p !== first).map((p) => p.owner),
    });
  }
  return problems.sort((a, b) => order(a.owner) - order(b.owner));
}

/**
 * A text colour that passes against `fill`: `ink` when it does, else black or white, whichever
 * gives the higher ratio.
 */
export function passingColour(fill: string, ink: string, needed: number): string {
  const background = parseColour(fill);
  const preferred = parseColour(ink);
  if (!background) return ink;
  if (preferred && contrastRatio(preferred, background) >= needed) return hexOf(preferred);
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  return contrastRatio(black, background) >= contrastRatio(white, background)
    ? "#000000"
    : "#FFFFFF";
}
