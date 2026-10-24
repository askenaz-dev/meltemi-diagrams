import {
  ARROW_KINDS,
  SHAPES,
  SHAPE_SIZES,
  shapeOutline,
  type ArrowKind,
  type Box,
  type ShapeName,
} from "@meltemi/diagrams-editor/canvas";
import { s } from "./dom.js";
import { messages } from "./messages/index.js";

/**
 * The families of pictures the canvas draws instead of words: the inspector's line styles, route
 * kinds, corners, heads, shapes, icon positions and label positions, and the palette's arrow kinds
 * (`->`, `-->`, `<->`, `<-->`).
 */
export type GlyphFamily =
  | "line"
  | "route"
  | "corners"
  | "arrowStart"
  | "arrowEnd"
  | "shape"
  | "iconPosition"
  | "labelPosition"
  | "sketch"
  | "textAlign"
  | "verticalAlign"
  | "arrow";

/**
 * How an icon chosen in the icon picker or a library is put on the canvas: as the shape of a node
 * or box (`shape icon`, its label below), in a box of the current shape beside its label, or
 * (free diagrams) as an `icon` object alone.
 */
export type IconPlacement = "icon" | "box" | "only";

const WIDTH = 32;
const HEIGHT = 16;
const MID = HEIGHT / 2;
/** The narrower pictures of the icon and label positions, five or four of which share a row. */
const NARROW = 24;

/** The families drawn in a narrow picture. */
const narrow = (family: GlyphFamily) => family === "iconPosition" || family === "labelPosition";

const isShape = (value: string): value is ShapeName =>
  (SHAPES as readonly string[]).includes(value);
const isArrowKind = (value: string): value is ArrowKind =>
  (ARROW_KINDS as readonly string[]).includes(value);

type Shape = SVGElement;

const stroked = (d: string, extra: Record<string, string | number> = {}): Shape =>
  s("path", {
    d,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...extra,
  });

const filled = (d: string): Shape => s("path", { d, fill: "currentColor", stroke: "none" });

const circle = (cx: number, cy: number, r: number, fill: boolean): Shape =>
  s("circle", {
    cx,
    cy,
    r,
    fill: fill ? "currentColor" : "none",
    stroke: "currentColor",
    "stroke-width": 1.5,
  });

/** A head drawn at the right end of a line from x 3 to x 29; the start mirrors it. */
function head(kind: string): Shape[] {
  const tip = 29;
  const L = 7;
  const W = 6;
  const line = (to: number) => stroked(`M3 ${MID} H${to}`);
  const bar = (x: number) => stroked(`M${x} ${MID - 4} V${MID + 4}`);
  const foot = stroked(`M${tip} ${MID - 4} L${tip - L} ${MID} L${tip} ${MID + 4}`);
  const triangle = `M${tip} ${MID} L${tip - L} ${MID - W / 2} L${tip - L} ${MID + W / 2} Z`;
  const diamond = `M${tip} ${MID} L${tip - 5} ${MID - W / 2} L${tip - 10} ${MID} L${tip - 5} ${MID + W / 2} Z`;
  switch (kind) {
    case "triangle":
      return [line(tip - L), filled(triangle)];
    case "triangleOutline":
      return [line(tip - L), stroked(triangle)];
    case "open":
      return [
        line(tip),
        stroked(`M${tip - L} ${MID - W / 2} L${tip} ${MID} L${tip - L} ${MID + W / 2}`),
      ];
    case "diamond":
      return [line(tip - 10), filled(diamond)];
    case "diamondOutline":
      return [line(tip - 10), stroked(diamond)];
    case "circle":
      return [line(tip - 6), circle(tip - 3, MID, 3, true)];
    case "circleOutline":
      return [line(tip - 6), circle(tip - 3, MID, 3, false)];
    case "bar":
      return [line(tip), bar(tip - 3)];
    case "cross":
      return [
        line(tip),
        stroked(
          `M${tip - 7} ${MID - 3.5} L${tip - 1} ${MID + 3.5} M${tip - 7} ${MID + 3.5} L${tip - 1} ${MID - 3.5}`,
        ),
      ];
    case "many":
      return [line(tip), foot];
    case "oneOrMany":
      return [line(tip), foot, bar(tip - 10)];
    case "onlyOne":
      return [line(tip), bar(tip - 3), bar(tip - 7)];
    case "zeroOrOne":
      return [
        line(tip - 13),
        stroked(`M${tip - 7} ${MID} H${tip}`),
        bar(tip - 3),
        circle(tip - 10, MID, 3, false),
      ];
    case "zeroOrMany":
      return [
        line(tip - 13),
        stroked(`M${tip - 7} ${MID} H${tip}`),
        foot,
        circle(tip - 10, MID, 3, false),
      ];
    default:
      return [line(tip)];
  }
}

function lineShapes(kind: string): Shape[] {
  if (kind === "dashed") return [stroked(`M3 ${MID} H29`, { "stroke-dasharray": "4 3" })];
  if (kind === "dotted") return [stroked(`M3 ${MID} H29`, { "stroke-dasharray": "0 3.5" })];
  return [stroked(`M3 ${MID} H29`)];
}

function routeShapes(kind: string): Shape[] {
  switch (kind) {
    case "polyline":
      return [stroked("M4 13 L28 3")];
    case "orthogonal":
      return [stroked("M4 13 H16 V3 H28")];
    case "bezier":
      return [stroked("M4 13 C16 13 16 3 28 3")];
    default:
      // Automatic: a route with a spark, chosen for you.
      return [
        stroked("M4 13 H12 V6 H22", { "stroke-dasharray": "3 2" }),
        filled("M26 2 L27.2 5 L30 6 L27.2 7 L26 10 L24.8 7 L22 6 L24.8 5 Z"),
      ];
  }
}

/** How a theme paints strokes: a straight line, a lightly wobbly one, a rough double one. */
function sketchShapes(level: string): Shape[] {
  if (level === "light") return [stroked("M4 9 Q10 6.6 16 8.2 T28 7.4")];
  if (level === "rough") {
    return [
      stroked("M4 9.6 Q9 5.4 15 8.6 T28 6.8"),
      stroked("M4.6 8 Q10 10.6 16 7.4 T27.4 8.8", { "stroke-width": 1 }),
    ];
  }
  return [stroked(`M4 ${MID} H28`)];
}

function cornerShapes(kind: string): Shape[] {
  return kind === "rounded" ? [stroked("M6 14 V9 Q6 3 12 3 H27")] : [stroked("M6 14 V3 H27")];
}

/**
 * Where a shape's picture is drawn: its default proportions fitted into `width` by `height` and
 * centred in a picture of `frame`, so that a square and a circle look square and a rectangle and
 * an ellipse wide. A value that is not a shape is placed as `rounded`.
 */
export function pictureBox(
  value: string,
  frame: { readonly width: number; readonly height: number },
  width: number,
  height: number,
): Box {
  const size = SHAPE_SIZES[isShape(value) ? value : "rounded"];
  const scale = Math.min(width / size.width, height / size.height);
  const w = size.width * scale;
  const h = size.height * scale;
  return { x: (frame.width - w) / 2, y: (frame.height - h) / 2, width: w, height: h };
}

/** The outline of a shape in its picture box: the layout's own, so the picture is what is drawn. */
function outlineIn(
  value: string,
  frame: { readonly width: number; readonly height: number },
  width: number,
  height: number,
): string {
  const shape = isShape(value) ? value : "rounded";
  const box = pictureBox(shape, frame, width, height);
  // The layout's corner of 8 would make a picture this small a pill.
  const options = shape === "rounded" ? { radius: Math.min(3, box.height / 4) } : {};
  return shapeOutline(shape, box, options).d;
}

/**
 * The path of a small cube, the mark that stands for "an icon" in the pictures: a hexagon seen
 * from above with its three inner edges, `size` wide around `(cx, cy)`.
 */
export function cubePath(cx: number, cy: number, size: number): string {
  const r = size / 2;
  const n = (v: number) => Math.round(v * 100) / 100;
  const dx = r * 0.87;
  const top = `M${n(cx)} ${n(cy - r)} L${n(cx + dx)} ${n(cy - r / 2)} L${n(cx + dx)} ${n(cy + r / 2)} L${n(cx)} ${n(cy + r)} L${n(cx - dx)} ${n(cy + r / 2)} L${n(cx - dx)} ${n(cy - r / 2)} Z`;
  const inner = `M${n(cx - dx)} ${n(cy - r / 2)} L${n(cx)} ${n(cy)} L${n(cx + dx)} ${n(cy - r / 2)} M${n(cx)} ${n(cy)} V${n(cy + r)}`;
  return `${top} ${inner}`;
}

/** The mark of an icon in a picture: a cube in the current colour. */
const cube = (cx: number, cy: number, size: number, width = 1.3): Shape =>
  stroked(cubePath(cx, cy, size), { "stroke-width": width });

/** A short line of text in a picture, from `x1` to `x2` at `y`. */
const textLine = (x1: number, x2: number, y: number): Shape =>
  stroked(`M${x1} ${y} H${x2}`, { "stroke-width": 1.4, opacity: 0.7 });

/** The `icon` shape: the icon itself, its label under it. */
function iconShapeShapes(frame: { readonly width: number; readonly height: number }): Shape[] {
  const cx = frame.width / 2;
  const size = frame.height * 0.66;
  return [
    cube(cx, size / 2 + 0.75, size),
    textLine(cx - size * 0.45, cx + size * 0.45, frame.height - 1.25),
  ];
}

function shapeShapes(value: string): Shape[] {
  if (value === "icon") return iconShapeShapes({ width: WIDTH, height: HEIGHT });
  return [stroked(outlineIn(value, { width: WIDTH, height: HEIGHT }, WIDTH - 4, HEIGHT - 3))];
}

/**
 * Where an element's icon goes, in a 24 × 16 box (`iconPosition`): beside the text on the left or
 * the right, above or below it, or large at the centre with the label at the bottom.
 */
function iconPositionShapes(value: string): Shape[] {
  const frame = s("rect", {
    x: 1.5,
    y: 1.5,
    width: 21,
    height: 13,
    rx: 2.5,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.2,
    opacity: 0.55,
  });
  switch (value) {
    case "right":
      return [frame, cube(17.5, 8, 6), textLine(5, 12.5, 6.5), textLine(7.5, 12.5, 9.5)];
    case "top":
      return [frame, cube(12, 6, 5.5), textLine(8.5, 15.5, 11.75)];
    case "bottom":
      return [frame, textLine(8.5, 15.5, 4.5), cube(12, 10, 5.5)];
    case "center":
      return [frame, cube(12, 7.25, 8), textLine(10, 14, 12.75)];
    default:
      return [frame, cube(6.5, 8, 6), textLine(11.5, 19, 6.5), textLine(11.5, 16.5, 9.5)];
  }
}

/**
 * Where the label of a centred icon goes (`labelPosition`): the icon, and the label's line at its
 * top, bottom, left or right.
 */
function labelPositionShapes(value: string): Shape[] {
  switch (value) {
    case "top":
      return [textLine(8, 16, 2.5), cube(12, 9.75, 8)];
    case "left":
      return [textLine(2, 8.5, 8), cube(15.5, 8, 8)];
    case "right":
      return [cube(8.5, 8, 8), textLine(15.5, 22, 8)];
    default:
      return [cube(12, 6.25, 8), textLine(8, 16, 13.5)];
  }
}

/**
 * A 32 × 20 picture of a way to put an icon on the canvas, for the placement control of the icon
 * picker and the Libraries panel: the icon above its label, the icon in a box beside two lines of
 * text, or the icon alone.
 */
export function placementGlyph(placement: IconPlacement): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 32 20",
    width: 32,
    height: 20,
    "aria-hidden": "true",
    focusable: "false",
    "data-placement": placement,
  });
  if (placement === "icon") svg.append(cube(16, 7.5, 11), textLine(11, 21, 17.5));
  else if (placement === "only") svg.append(cube(16, 10, 15));
  else {
    svg.append(
      s("rect", {
        x: 1.5,
        y: 3.5,
        width: 29,
        height: 13,
        rx: 3,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.2,
      }),
      cube(8, 10, 6.5),
      textLine(13.5, 26, 8.5),
      textLine(13.5, 22, 11.75),
    );
  }
  return svg;
}

/**
 * A relation of a kind: a line, dashed for `-->`, `---` and `<-->`, with a head at one end, both,
 * or neither for the lines `--` and `---`, drawn with the same stroke so the six read as one family.
 */
function arrowShapes(kind: string): Shape[] {
  const known = isArrowKind(kind) ? kind : "->";
  const dashed = known === "-->" || known === "<-->" || known === "---";
  const twoWay = known.startsWith("<");
  const headless = known === "--" || known === "---";
  const L = 7;
  const W = 6;
  const tip = 29;
  const dash: Record<string, string> = dashed ? { "stroke-dasharray": "4 3" } : {};
  if (headless) return [stroked(`M3 ${MID} H${tip}`, dash)];
  const start = twoWay ? 3 + L : 3;
  const line = stroked(`M${start} ${MID} H${tip - L}`, dash);
  const end = filled(`M${tip} ${MID} L${tip - L} ${MID - W / 2} L${tip - L} ${MID + W / 2} Z`);
  if (!twoWay) return [line, end];
  const begin = filled(`M3 ${MID} L${3 + L} ${MID - W / 2} L${3 + L} ${MID + W / 2} Z`);
  return [line, begin, end];
}

/**
 * A picture of one value of a family, drawn with the current colour: 32 by 16, or 24 by 16 for the
 * icon and label positions.
 */
export function glyph(family: GlyphFamily, value: string): SVGSVGElement {
  // The alignments are drawn as the alignment picker draws its cells.
  if (family === "textAlign") return alignGlyph(value);
  if (family === "verticalAlign") return alignGlyph("center", value);
  const width = narrow(family) ? NARROW : WIDTH;
  const svg = s("svg", {
    viewBox: `0 0 ${width} ${HEIGHT}`,
    width,
    height: HEIGHT,
    "aria-hidden": "true",
    focusable: "false",
    "data-glyph": `${family}:${value}`,
  });
  const shapes =
    family === "line"
      ? lineShapes(value)
      : family === "route"
        ? routeShapes(value)
        : family === "corners"
          ? cornerShapes(value)
          : family === "sketch"
            ? sketchShapes(value)
            : family === "shape"
              ? shapeShapes(value)
              : family === "arrow"
                ? arrowShapes(value)
                : family === "iconPosition"
                  ? iconPositionShapes(value)
                  : family === "labelPosition"
                    ? labelPositionShapes(value)
                    : head(value);
  if (family === "arrowStart") {
    // The start's head points left: the end's picture mirrored.
    svg.append(s("g", { transform: `translate(${WIDTH} 0) scale(-1 1)` }, ...shapes));
  } else svg.append(...shapes);
  return svg;
}

/** Where the text block of an alignment picture starts across, and where its lines sit down. */
const ALIGN_ACROSS: Readonly<Record<string, (width: number) => number>> = {
  left: () => 5,
  center: (width) => (22 - width) / 2,
  right: (width) => 17 - width,
};
const ALIGN_DOWN: Readonly<Record<string, number>> = { top: 5, middle: 8, bottom: 11 };

/**
 * A picture of a text alignment, 22 by 16: two lines of text in a box at `horizontal` across and
 * `vertical` down the box, or, without `vertical` (a free text), three lines aligned on their own.
 */
export function alignGlyph(horizontal: string, vertical?: string): SVGSVGElement {
  const svg = s("svg", {
    viewBox: "0 0 22 16",
    width: 22,
    height: 16,
    "aria-hidden": "true",
    focusable: "false",
    "data-glyph": vertical ? `align:${horizontal}-${vertical}` : `align:${horizontal}`,
  });
  const across = ALIGN_ACROSS[horizontal] ?? ALIGN_ACROSS.center!;
  const bar = (x: number, y: number, width: number) =>
    stroked(`M${x} ${y} H${x + width}`, { "stroke-width": 1.6 });
  if (vertical === undefined) {
    // Lines of three lengths, aligned the way the text is.
    const lines = [12, 8, 10].map((width, i) => {
      const start =
        horizontal === "left" ? 3 : horizontal === "right" ? 19 - width : (22 - width) / 2;
      return bar(start, 4 + i * 4, width);
    });
    svg.append(...lines);
    return svg;
  }
  const top = ALIGN_DOWN[vertical] ?? ALIGN_DOWN.middle!;
  svg.append(
    s("rect", {
      x: 1.75,
      y: 1.75,
      width: 18.5,
      height: 12.5,
      rx: 2,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
      opacity: 0.5,
    }),
    bar(across(10), top, 10),
    bar(across(6), top + 2.5, 6),
  );
  return svg;
}

/**
 * A 16 by 16 picture of a shape, drawn like the toolbar's icons, for the box and node buttons; the
 * `icon` shape is a cube over its label.
 */
export function shapeIcon(value: string): SVGSVGElement {
  const d =
    value === "icon"
      ? `${cubePath(8, 6, 10)} M5 14.25 H11`
      : outlineIn(value, { width: 16, height: 16 }, 14, 12);
  return s(
    "svg",
    {
      viewBox: "0 0 16 16",
      "aria-hidden": "true",
      focusable: "false",
      "data-shape": isShape(value) ? value : "rounded",
    },
    s("path", {
      d,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

/**
 * The readable name of a value of a family in the interface language, for labels and titles: a
 * shape, an arrow kind, a place of an icon or a label, or a line style, route kind, corner or head
 * (where `rounded`, `diamond` and `circle` are corners and heads, not shapes). A value the catalog
 * does not name is shown as it is written.
 */
export function glyphName(value: string, family?: GlyphFamily): string {
  const words = messages();
  const names: Readonly<Record<string, string>> =
    family === "shape"
      ? words.shapes
      : family === "arrow"
        ? words.arrowKinds
        : family !== undefined &&
            (narrow(family) || family === "textAlign" || family === "verticalAlign")
          ? words.positions
          : words.glyphs;
  return Object.hasOwn(names, value) ? names[value]! : value;
}
