/** Mermaid's classic node shapes, by their delimiters. Longer openers are tried first. */
const SHAPES: readonly (readonly [
  open: string,
  closers: readonly (readonly [string, string])[],
])[] = [
  ["(((", [[")))", "doublecircle"]]],
  ["((", [["))", "circle"]]],
  ["([", [["])", "stadium"]]],
  ["[[", [["]]", "subroutine"]]],
  ["[(", [[")]", "cylinder"]]],
  [
    "[/",
    [
      ["/]", "lean_right"],
      ["\\]", "trapezoid"],
    ],
  ],
  [
    "[\\",
    [
      ["\\]", "lean_left"],
      ["/]", "inv_trapezoid"],
    ],
  ],
  ["{{", [["}}", "hexagon"]]],
  ["(", [[")", "round"]]],
  ["[", [["]", "rect"]]],
  ["{", [["}", "rhombus"]]],
  [">", [["]", "asymmetric"]]],
];

export interface ShapeMatch {
  readonly shape: string;
  /** The label as written, quotes included. */
  readonly raw: string;
  /** Index of the label in the text. */
  readonly labelIndex: number;
  /** Index after the closing delimiter. */
  readonly end: number;
}

/** Reads a classic shape at `pos`, such as `[Label]` or `{{"Label"}}`. */
export function readShape(text: string, pos: number): ShapeMatch | null {
  for (const [open, closers] of SHAPES) {
    if (!text.startsWith(open, pos)) continue;
    const start = pos + open.length;
    let i = start;
    while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
    if (text[i] === '"') {
      const close = text.indexOf('"', i + 1);
      if (close < 0) continue;
      let j = close + 1;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
      for (const [closer, shape] of closers) {
        if (text.startsWith(closer, j)) {
          return { shape, raw: text.slice(i, close + 1), labelIndex: i, end: j + closer.length };
        }
      }
      continue;
    }
    let best: { at: number; closer: string; shape: string } | null = null;
    for (const [closer, shape] of closers) {
      const at = text.indexOf(closer, start);
      if (at >= 0 && (best === null || at < best.at)) best = { at, closer, shape };
    }
    if (best) {
      return {
        shape: best.shape,
        raw: text.slice(start, best.at),
        labelIndex: start,
        end: best.at + best.closer.length,
      };
    }
  }
  return null;
}

/**
 * Mermaid's shapes by their classic names and the `shape` each is drawn with; `approx` marks the
 * forms drawn as the nearest shape: the double ring and the mirrored parallelogram and trapezoid.
 */
export const MERMAID_SHAPES: Readonly<Record<string, { shape: string; approx?: boolean }>> = {
  rect: { shape: "rectangle" },
  round: { shape: "rounded" },
  stadium: { shape: "pill" },
  subroutine: { shape: "framed" },
  cylinder: { shape: "cylinder" },
  circle: { shape: "circle" },
  doublecircle: { shape: "circle", approx: true },
  asymmetric: { shape: "flag" },
  rhombus: { shape: "diamond" },
  hexagon: { shape: "hexagon" },
  lean_right: { shape: "parallelogram" },
  lean_left: { shape: "parallelogram", approx: true },
  trapezoid: { shape: "trapezoid" },
  inv_trapezoid: { shape: "trapezoid", approx: true },
  document: { shape: "document" },
  triangle: { shape: "triangle" },
};

/** Flowchart shapes that are kinds of their own; the others are `node`s with a `shape` style. */
export const FLOW_KIND_OF_SHAPE: Readonly<Record<string, string>> = {
  rect: "node",
  round: "node",
  rhombus: "decision",
  cylinder: "data",
};

/**
 * The `@{ shape: … }` names of Mermaid 11 and the shape they stand for: a name of
 * `MERMAID_SHAPES`, or the stored-data (`h_cylinder`) and text forms.
 */
export const NAMED_SHAPES: Readonly<Record<string, string>> = {
  rect: "rect",
  rectangle: "rect",
  proc: "rect",
  process: "rect",
  rounded: "round",
  event: "round",
  stadium: "stadium",
  pill: "stadium",
  terminal: "stadium",
  "fr-rect": "subroutine",
  subproc: "subroutine",
  subprocess: "subroutine",
  subroutine: "subroutine",
  "framed-rectangle": "subroutine",
  cyl: "cylinder",
  db: "cylinder",
  database: "cylinder",
  cylinder: "cylinder",
  circle: "circle",
  circ: "circle",
  "dbl-circ": "doublecircle",
  "double-circle": "doublecircle",
  diam: "rhombus",
  decision: "rhombus",
  diamond: "rhombus",
  question: "rhombus",
  hex: "hexagon",
  hexagon: "hexagon",
  prepare: "hexagon",
  "lean-r": "lean_right",
  "lean-right": "lean_right",
  "in-out": "lean_right",
  "lean-l": "lean_left",
  "lean-left": "lean_left",
  "out-in": "lean_left",
  "trap-b": "trapezoid",
  priority: "trapezoid",
  "trapezoid-bottom": "trapezoid",
  "trap-t": "inv_trapezoid",
  manual: "inv_trapezoid",
  "inv-trapezoid": "inv_trapezoid",
  "trapezoid-top": "inv_trapezoid",
  odd: "asymmetric",
  doc: "document",
  document: "document",
  tri: "triangle",
  extract: "triangle",
  triangle: "triangle",
  "h-cyl": "h_cylinder",
  das: "h_cylinder",
  "horizontal-cylinder": "h_cylinder",
  "lin-cyl": "h_cylinder",
  disk: "h_cylinder",
  "lined-cylinder": "h_cylinder",
  "bow-rect": "h_cylinder",
  "stored-data": "h_cylinder",
  text: "text",
  comment: "text",
  brace: "text",
  "brace-l": "text",
  "brace-r": "text",
  braces: "text",
};
