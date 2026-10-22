import type { Box, Point } from "@meltemi/diagrams-editor/canvas";

/*
 * Other people's selections and pointers (`live-collaboration`). This file is the logic of the layer
 * that draws them, with no DOM: reading and checking what the host sent, the colour of a tag's text,
 * where the outlines and the stacked tags go, and where each cursor's tip is. `presence-layer.ts`
 * draws what this computes.
 */

/** A colour as its three channels, 0 to 255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** What a person is drawn in when the host sends a colour that cannot be read: a neutral grey. */
export const FALLBACK_COLOUR = "#6b7280";

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION = /^(rgba?|hsla?)\(([^()]*)\)$/i;

/** One argument of `rgb()` or `hsl()`: a number or a percentage, `null` when it is neither. */
function argument(text: string): { readonly value: number; readonly percent: boolean } | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(%|deg)?$/i.exec(text);
  if (!match) return null;
  return { value: Number(match[1]), percent: match[2] === "%" };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.min(1, Math.max(0, s));
  const light = Math.min(1, Math.max(0, l));
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t: number): number => {
    const x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hue + 1 / 3) * 255),
    g: Math.round(channel(hue) * 255),
    b: Math.round(channel(hue - 1 / 3) * 255),
  };
}

/**
 * Reads a CSS colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` and `hsl()`/`hsla()`
 * in the comma or the space form. The alpha is ignored (a tag is solid). Anything else, named
 * colours and `var()` included, is `undefined`: the canvas never hands a string it did not read to
 * the page's styles.
 */
export function parseColour(text: string): Rgb | undefined {
  const value = text.trim();
  const hex = HEX.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length <= 4) digits = [...digits].map((c) => c + c).join("");
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  const fn = FUNCTION.exec(value);
  if (!fn) return undefined;
  const parts = fn[2]!.split(/[\s,/]+/).filter((part) => part !== "");
  if (parts.length < 3 || parts.length > 4) return undefined;
  const args = parts.slice(0, 3).map(argument);
  if (args.some((a) => a === null)) return undefined;
  const [a, b, c] = args as { value: number; percent: boolean }[];
  if (fn[1]!.toLowerCase().startsWith("rgb")) {
    const scale = (x: { value: number; percent: boolean }) =>
      Math.round(Math.min(255, Math.max(0, x.percent ? (x.value * 255) / 100 : x.value)));
    return { r: scale(a!), g: scale(b!), b: scale(c!) };
  }
  return hslToRgb(a!.value, b!.value / 100, c!.value / 100);
}

const pair = (n: number): string => n.toString(16).padStart(2, "0");

/** `#rrggbb`, the one spelling the layer writes into styles and attributes. */
export function toHex(colour: Rgb): string {
  return `#${pair(colour.r)}${pair(colour.g)}${pair(colour.b)}`;
}

/** The relative luminance of a colour, 0 (black) to 1 (white), as WCAG defines it. */
export function luminance(colour: Rgb): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** The WCAG contrast ratio between two luminances, 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The colour of the text of a tag on `background`: black or white, whichever contrasts more. The
 * better of the two is never below 4.58:1, so a name reads on any colour a host may send.
 */
export function tagTextColour(background: Rgb): "#000000" | "#ffffff" {
  const l = luminance(background);
  return contrastRatio(l, 1) >= contrastRatio(l, 0) ? "#ffffff" : "#000000";
}

/** A person as the layer draws them: everything checked, the colours written out. */
export interface PersonView {
  /** Shown verbatim, as a text node. */
  readonly name: string;
  /** `#rrggbb`. */
  readonly colour: string;
  /** The text colour of the tag, for contrast with `colour`. */
  readonly text: "#000000" | "#ffffff";
  readonly selection: readonly string[];
  /** Where the person's pointer is, in diagram units; undefined when the host sent none that will do. */
  readonly pointer: Point | undefined;
}

/** Bounds on what a host may send, so that a hostile or broken message cannot flood the page. */
export const MAX_PEOPLE = 50;
export const MAX_SELECTED = 1000;
export const MAX_NAME = 200;
const MAX_ID = 10_000;
/** How far from the origin a pointer may be, in diagram units: the room's own bound. */
export const MAX_POINTER = 1_000_000;

/** A pointer the host sent: two finite numbers within the bound; anything else is no pointer. */
export function readPointer(value: unknown): Point | undefined {
  if (!isObject(value)) return undefined;
  const { x, y } = value;
  const fits = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= MAX_POINTER;
  return fits(x) && fits(y) ? { x, y } : undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Reads the `people` of a `presence` message, which crossed a message channel and is not trusted:
 * what is not a list is nobody; a person without a name or a selection list is left out; ids that
 * are not text are dropped; a colour that cannot be read becomes the neutral one. The lists and
 * the name are cut to a size the page can draw.
 */
export function readPeople(value: unknown): PersonView[] {
  if (!Array.isArray(value)) return [];
  const people: PersonView[] = [];
  for (const entry of value.slice(0, MAX_PEOPLE)) {
    if (!isObject(entry) || typeof entry.name !== "string" || !Array.isArray(entry.selection)) {
      continue;
    }
    const rgb =
      (typeof entry.colour === "string" ? parseColour(entry.colour) : undefined) ??
      parseColour(FALLBACK_COLOUR)!;
    const selection: string[] = [];
    for (const id of entry.selection) {
      if (selection.length >= MAX_SELECTED) break;
      if (typeof id === "string" && id.length <= MAX_ID) selection.push(id);
    }
    people.push({
      name: entry.name.slice(0, MAX_NAME),
      colour: toHex(rgb),
      text: tagTextColour(rgb),
      selection,
      pointer: readPointer(entry.pointer),
    });
  }
  return people;
}

/** A person's cursor: where its tip goes on screen, and where it is in the diagram. */
export interface CursorMark {
  /**
   * Stable from one message to the next for the same person (their colour and name, and which of
   * their pointers it is), so that the layer moves the same cursor instead of drawing another.
   */
  readonly key: string;
  readonly person: PersonView;
  /** The tip, in screen pixels. */
  readonly tip: Point;
  /** The tip, in diagram units: a cursor whose scene point changed glides; one the view moved does not. */
  readonly scene: Point;
}

/**
 * The cursors to draw: one for each person with a pointer, in the order of the message, with the tip
 * where `toScreen` puts the pointer's diagram point (so it points at the same place at every zoom).
 */
export function cursorMarks(
  people: readonly PersonView[],
  toScreen: (point: Point) => Point,
): CursorMark[] {
  const seen = new Map<string, number>();
  const marks: CursorMark[] = [];
  for (const person of people) {
    const pointer = person.pointer;
    if (!pointer) continue;
    const base = `${person.colour}|${person.name}`;
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    marks.push({ key: `${base}|${nth}`, person, tip: toScreen(pointer), scene: pointer });
  }
  return marks;
}

/**
 * What a selected thing is drawn as: a box (elements, events) or a line (relations), in the
 * coordinates of whoever asks; the layer's marks are in screen pixels.
 */
export type PresenceShape =
  | { readonly kind: "box"; readonly box: Box }
  | { readonly kind: "line"; readonly points: readonly Point[] };

/** One person's mark on one thing the scene holds. */
export interface PresenceMark {
  readonly person: PersonView;
  /** The id of the element, relation or event. */
  readonly target: string;
  readonly shape: PresenceShape;
  /** 0 for the first person on this target, 1 for the second, in the order of the message. */
  readonly rank: number;
  /** How many people are drawn on this target. */
  readonly stack: number;
}

/** The most marks drawn at once: a message that selects everything for everyone stays bounded. */
export const MAX_MARKS = 400;

/**
 * The marks to draw: for each person, in order, each selected id that `resolve` knows. Ids the
 * scene does not hold are skipped without a trace; an id listed twice counts once; people on the
 * same target are ranked in the order of the message, so their outlines and tags stack.
 */
export function presenceMarks(
  people: readonly PersonView[],
  resolve: (id: string) => PresenceShape | undefined,
  limit = MAX_MARKS,
): PresenceMark[] {
  const found: { person: PersonView; target: string; shape: PresenceShape }[] = [];
  const counts = new Map<string, number>();
  for (const person of people) {
    const seen = new Set<string>();
    for (const id of person.selection) {
      if (found.length >= limit) break;
      if (seen.has(id)) continue;
      seen.add(id);
      const shape = resolve(id);
      if (!shape) continue;
      found.push({ person, target: id, shape });
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const ranks = new Map<string, number>();
  return found.map((mark) => {
    const rank = ranks.get(mark.target) ?? 0;
    ranks.set(mark.target, rank + 1);
    return { ...mark, rank, stack: counts.get(mark.target)! };
  });
}

/** The height of a tag, and the gap between tags and between a tag and its outline, in pixels. */
export const TAG_HEIGHT = 18;
export const TAG_GAP = 2;
/** How far each extra person's outline on the same box lies outside the previous one. */
export const RANK_STEP = 3;
/** The stroke of a line, and what each extra person on it adds. */
export const LINE_WIDTH = 3;
export const LINE_STEP = 2;

/** The rectangle around a shape. */
export function boundsOf(shape: PresenceShape): Box {
  if (shape.kind === "box") return shape.box;
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The stroke of a line mark: the first person's is the widest and is drawn first, so each person
 * after is a narrower stripe over it and every colour shows.
 */
export function lineWidth(mark: PresenceMark): number {
  return LINE_WIDTH + LINE_STEP * (mark.stack - 1 - mark.rank);
}

/** How far the outermost mark on a target reaches beyond its bounds. */
function reach(mark: PresenceMark): number {
  return mark.shape.kind === "box"
    ? (mark.stack - 1) * RANK_STEP
    : (LINE_WIDTH + LINE_STEP * (mark.stack - 1)) / 2;
}

/**
 * The rectangle of a box mark's outline: the first person's lies on the box's border, inside it
 * (so a press on the outline is a press on the element), each next one `RANK_STEP` outside.
 */
export function outlineBox(box: Box, rank: number): Box {
  const grow = rank * RANK_STEP;
  return {
    x: box.x - grow,
    y: box.y - grow,
    width: box.width + 2 * grow,
    height: box.height + 2 * grow,
  };
}

/**
 * Where the top-left corner of a mark's tag goes. The tags of one target are a column above its
 * top-left corner, the first person's nearest the shape; when the column would leave the stage at
 * the top it goes below the shape instead, so a box at the edge keeps readable tags.
 */
export function tagPlacement(mark: PresenceMark): Point {
  const bounds = boundsOf(mark.shape);
  const step = TAG_HEIGHT + TAG_GAP;
  const out = reach(mark);
  const x = bounds.x - out;
  const highest = bounds.y - out - TAG_GAP - TAG_HEIGHT - (mark.stack - 1) * step;
  if (highest < 0) return { x, y: bounds.y + bounds.height + out + TAG_GAP + mark.rank * step };
  return { x, y: bounds.y - out - TAG_GAP - TAG_HEIGHT - mark.rank * step };
}
