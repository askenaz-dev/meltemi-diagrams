import type { DiagramStarterId } from "@meltemi/diagrams-edit/starters";
import { s } from "../ui.js";

const paint = {
  blue: "var(--starter-blue)",
  blueSoft: "var(--starter-blue-soft)",
  cyan: "var(--starter-cyan)",
  cyanSoft: "var(--starter-cyan-soft)",
  amber: "var(--starter-amber)",
  amberSoft: "var(--starter-amber-soft)",
  line: "var(--starter-line)",
  paper: "var(--starter-paper)",
};

function box(
  x: number,
  y: number,
  width: number,
  height: number,
  fill = paint.paper,
  stroke = paint.line,
  radius = 5,
): SVGRectElement {
  return s("rect", { x, y, width, height, rx: radius, fill, stroke });
}

function path(d: string, stroke = paint.line): SVGPathElement {
  return s("path", { d, stroke });
}

/** Local arrowheads avoid marker IDs shared by several copies of the dialog. */
function arrow(d: string, x: number, y: number, stroke = paint.blue, left = false): SVGGElement {
  const base = x + (left ? 5 : -5);
  return s(
    "g",
    {},
    path(d, stroke),
    s("path", {
      d: `M${x} ${y}L${base} ${y - 3.2}V${y + 3.2}Z`,
      fill: stroke,
      stroke: "none",
    }),
  );
}

function sticky(x: number, y: number, color: string, soft: string, angle: number): SVGGElement {
  return s(
    "g",
    { transform: `rotate(${angle} ${x + 23} ${y + 21})` },
    s("path", {
      d: `M${x} ${y}h46v34l-8 8H${x}Z`,
      fill: soft,
      stroke: color,
    }),
    path(`M${x + 38} ${y + 42}v-8h8`, color),
  );
}

const drawings: Record<DiagramStarterId, () => SVGElement[]> = {
  flow: () => [
    arrow("M60 44H92", 92, 44),
    arrow("M128 44h20V19h22", 170, 19, paint.cyan),
    arrow("M110 62v7h60", 170, 69, paint.amber),
    box(10, 32, 50, 24, paint.blueSoft, paint.blue),
    s("path", {
      d: "M110 26l18 18-18 18-18-18Z",
      fill: paint.amberSoft,
      stroke: paint.amber,
    }),
    box(170, 7, 57, 24, paint.cyanSoft, paint.cyan),
    box(170, 57, 57, 24, paint.amberSoft, paint.amber),
  ],
  sequence: () => [
    ...[42, 120, 198].map((x) =>
      s("path", { d: `M${x} 25V81`, "stroke-dasharray": "3 4", opacity: 0.75 }),
    ),
    box(116, 35, 8, 25, paint.blueSoft, paint.blue, 2),
    box(194, 49, 8, 24, paint.cyanSoft, paint.cyan, 2),
    arrow("M42 40h74", 116, 40),
    arrow("M124 55h70", 194, 55, paint.cyan),
    s("g", { "stroke-dasharray": "4 3" }, arrow("M194 73H42", 42, 73, paint.amber, true)),
    box(20, 8, 44, 17, paint.blueSoft, paint.blue),
    box(98, 8, 44, 17, paint.blueSoft, paint.blue),
    box(176, 8, 44, 17, paint.cyanSoft, paint.cyan),
  ],
  c4: () => [
    s("rect", {
      x: 91,
      y: 7,
      width: 136,
      height: 74,
      rx: 8,
      fill: paint.paper,
      "stroke-dasharray": "5 4",
    }),
    s("circle", { cx: 32, cy: 26, r: 7, fill: paint.cyanSoft, stroke: paint.cyan }),
    s("path", {
      d: "M19 54v-7a13 13 0 0 1 26 0v7Z",
      fill: paint.cyanSoft,
      stroke: paint.cyan,
    }),
    arrow("M50 45h65", 115, 45),
    box(115, 28, 87, 35, paint.blueSoft, paint.blue),
    path("M125 39h67", paint.blue),
  ],
  gantt: () => [
    path("M37 12h189M37 12v69"),
    ...[45, 90, 135, 180, 225].map((x) =>
      s("path", { d: `M${x} 9V81`, opacity: 0.4, "stroke-width": 1 }),
    ),
    arrow("M98 31h13v21h13", 124, 52, paint.line),
    arrow("M177 52h5v22h5", 187, 74, paint.line),
    box(43, 24, 55, 14, paint.blueSoft, paint.blue, 4),
    box(124, 45, 53, 14, paint.cyanSoft, paint.cyan, 4),
    box(187, 67, 37, 14, paint.amberSoft, paint.amber, 4),
  ],
  whiteboard: () => [
    path("M15 12h77"),
    sticky(17, 30, paint.amber, paint.amberSoft, -7),
    sticky(87, 20, paint.cyan, paint.cyanSoft, 5),
    path("M156 31c20-17 15 33 34 9s19 2 34-9", paint.blue),
    path("M159 68c20-5 42 3 60-2", paint.amber),
    s("circle", { cx: 197, cy: 57, r: 4, fill: paint.blueSoft, stroke: paint.blue }),
  ],
  kanban: () => [
    ...[13, 87, 161].map((x) => box(x, 7, 65, 74, paint.paper, paint.line, 6)),
    box(18, 12, 55, 10, paint.blueSoft, "none", 3),
    box(92, 12, 55, 10, paint.cyanSoft, "none", 3),
    box(166, 12, 55, 10, paint.amberSoft, "none", 3),
    box(20, 30, 51, 17, paint.blueSoft, paint.blue, 3),
    box(20, 54, 51, 17, paint.blueSoft, paint.blue, 3),
    box(94, 30, 51, 25, paint.cyanSoft, paint.cyan, 3),
    box(168, 30, 51, 17, paint.amberSoft, paint.amber, 3),
  ],
  free: () => [
    s("ellipse", { cx: 38, cy: 47, rx: 19, ry: 16, fill: paint.cyanSoft, stroke: paint.cyan }),
    box(88, 20, 61, 42, paint.blueSoft, paint.blue),
    s("rect", {
      x: 82,
      y: 14,
      width: 73,
      height: 54,
      rx: 1,
      stroke: paint.blue,
      "stroke-dasharray": "3 3",
    }),
    ...[
      [82, 14],
      [155, 14],
      [82, 68],
      [155, 68],
    ].map(([x, y]) => box(x! - 2.5, y! - 2.5, 5, 5, paint.paper, paint.blue, 1)),
    s("path", {
      d: "M198 22l21 34h-42Z",
      fill: paint.amberSoft,
      stroke: paint.amber,
    }),
    s("path", {
      d: "M141 54l5 23 6-8 10-2Z",
      fill: paint.line,
      stroke: paint.paper,
      "stroke-width": 1.5,
    }),
  ],
};

/** Illustrative possibilities for each kind, rather than snapshots of an empty starter. */
export function starterPreview(kind: DiagramStarterId): SVGSVGElement {
  return s(
    "svg",
    {
      class: "starter-preview",
      viewBox: "0 0 240 88",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: paint.line,
      "stroke-width": 1.8,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    ...drawings[kind](),
  );
}
