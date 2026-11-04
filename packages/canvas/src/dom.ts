const SVG = "http://www.w3.org/2000/svg";

type Attributes = Record<string, string | number | boolean | undefined>;

function setAttributes(element: Element, attributes: Attributes): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? "" : String(value));
  }
}

/** An HTML element with attributes and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setAttributes(element, attributes);
  element.append(...children);
  return element;
}

/** An SVG element with attributes. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Node[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  setAttributes(element, attributes);
  element.append(...children);
  return element;
}

/** A 16 × 16 icon from path data, drawn with the current colour. */
export function icon(paths: string, filled = false): SVGSVGElement {
  const svg = s("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" });
  for (const d of paths.split("|")) {
    svg.append(
      s("path", {
        d,
        fill: filled ? "currentColor" : "none",
        stroke: filled ? "none" : "currentColor",
        "stroke-width": 1.3,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  }
  return svg;
}

/** Icons of the toolbar, as path data separated by `|`. */
export const ICONS = {
  layers: "M8 2.5l6 3-6 3-6-3z|M2 8.5l6 3 6-3|M2 11.5l6 3 6-3",
  library: "M2.5 3.5h4v9h-4z|M8.5 3.5h5v4h-5z|M8.5 9.5h5v3h-5z",
  eye: "M1.5 8c1.8-3 4-4.5 6.5-4.5s4.7 1.5 6.5 4.5c-1.8 3-4 4.5-6.5 4.5S3.3 11 1.5 8z|M8 10a2 2 0 100-4 2 2 0 000 4z",
  eyeOff:
    "M1.5 8c1.8-3 4-4.5 6.5-4.5s4.7 1.5 6.5 4.5c-1.8 3-4 4.5-6.5 4.5S3.3 11 1.5 8z|M2.5 2.5l11 11",
  plus: "M8 3v10|M3 8h10",
  /** The + at the end of a list: a plus with shorter arms, drawn heavier in its round button. */
  listAdd: "M8 4v8|M4 8h8",
  up: "M8 12V4|M4.5 7.5L8 4l3.5 3.5",
  down: "M8 4v8|M4.5 8.5L8 12l3.5-3.5",
  node: "M2.5 4.5h11v7h-11z",
  decision: "M8 2.5l5.5 5.5L8 13.5 2.5 8z",
  data: "M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2v7c0 1.1-2.2 2-5 2s-5-.9-5-2z|M3 4.5c0 1.1 2.2 2 5 2s5-.9 5-2",
  note: "M3 4h10|M3 7h10|M3 10h7",
  tag: "M3.5 5.5h9a2.5 2.5 0 0 1 0 5h-9a2.5 2.5 0 0 1 0-5z",
  group: "M2 3.5h12v9H2z|M2 6h12",
  plainContainer: "M2.5 3.5h11v9h-11z|M5 6.5h6v3H5z",
  /** A column: a tall frame with a title band and two cards one under the other. */
  column:
    "M4 1.5h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z|M3 4h10|M5.5 6h5v2.5h-5z|M5.5 10h5v2.5h-5z",
  /** A row: a wide frame with two cards side by side. */
  row: "M2.5 3h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z|M3.5 5.5h4v5h-4z|M8.5 5.5h4v5h-4z",
  box: "M4.5 4.5h7a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z",
  text: "M3.5 4h9|M8 4v8.5|M6.5 12.5h3",
  /** A sticky note: a square card of paper with its bottom right corner folded over. */
  sticky: "M2.5 2.5h11v8l-3 3h-8z|M13.5 10.5h-3v3",
  icon: "M8 2.25l5 2.9v5.7l-5 2.9-5-2.9v-5.7z|M3.2 5.2L8 8l4.8-2.8|M8 8v5.6",
  image: "M2.5 3.5h11v9h-11z|M2.5 10.5l3-3 3 3 2-2 3 3|M10.5 6h.01",
  front: "M5.5 5.5h8v8h-8z|M10.5 5.5v-3h-8v8h3",
  back: "M2.5 2.5h8v8h-8z|M5.5 10.5v3h8v-8h-3",
  convert: "M2.5 3.5h4v3h-4z|M9.5 9.5h4v3h-4z|M4.5 6.5v3h5|M7.5 7.5l2 2-2 2",
  connect: "M2.5 8h9|M9 5l3 3-3 3",
  relation: "M2.5 3.5h3v3h-3z|M10.5 9.5h3v3h-3z|M5.5 5l5 5.5|M8 10.5h2.5V8",
  zoomIn: "M7 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M9.6 9.6L13 13|M5.5 7h3|M7 5.5v3",
  zoomOut: "M7 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M9.6 9.6L13 13|M5.5 7h3",
  fit: "M2.5 5.5v-3h3|M10.5 2.5h3v3|M13.5 10.5v3h-3|M5.5 13.5h-3v-3",
  grid: "M2.5 2.5h11v11h-11z|M6.2 2.5v11|M9.8 2.5v11|M2.5 6.2h11|M2.5 9.8h11",
  /** The Pointer tool: a dot with the trail it leaves. */
  pointer:
    "M2.5 12.5c1.7-.3 3.2-1.4 4.4-3.2|M12.8 6a2.1 2.1 0 1 1-4.2 0 2.1 2.1 0 0 1 4.2 0z|M6.9 9.3L8.9 7.6",
  /** The pen: a pencil, its point at the bottom left, its collar and its band. */
  pen: "M2.5 13.5l1.2-3.4 7.7-7.7a1.6 1.6 0 0 1 2.3 2.3L6 12.3z|M3.7 10.1L6 12.3|M9.7 4.1L12 6.4",
  /** The highlighter: a marker with a chisel point over the mark it leaves. */
  highlighter: "M4.7 8.3l6.2-6.2 3 3-6.2 6.2z|M4.7 8.3l-1.5 3 1.5 1.5 3-1.5|M2 14.6h7.5",
  /** The eraser: a block of rubber in two parts, tilted over the line it rubs on. */
  eraser: "M2.5 9.9l7.4-7.4 3.6 3.6-7.4 7.4z|M4.4 7.9l3.7 3.7|M6.1 13.5h7.4",
  snap: "M4 2.5v5a4 4 0 0 0 8 0v-5|M4 5h2.5|M9.5 5H12",
  minimap: "M2.5 3.5h11v9h-11z|M8 8h4v3H8z",
  /** The properties: a frame with a bar at the right holding two rows, unlike the other panes. */
  inspector: "M2.5 3h11v10h-11z|M9.5 3v10|M11 6h1.5|M11 8.5h1.5",
  arrange: "M2.5 3.5h4v3h-4z|M9.5 9.5h4v3h-4z|M4.5 6.5v3h5",
  export: "M8 10V2.5|M5 5.5l3-3 3 3|M3 9.5v4h10v-4",
  play: "M5 3.5l8 4.5-8 4.5z",
  pause: "M5 3.5v9|M11 3.5v9",
  story: "M2.5 4.5h11v7h-11z|M6.5 6.5l3.5 1.5-3.5 1.5z",
  close: "M4 4l8 8|M12 4l-8 8",
  search: "M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z|M10 10l3.5 3.5",
  lock: "M4.5 7.5h7v6h-7z|M6 7.5v-2a2 2 0 0 1 4 0v2",
  minus: "M4 8h8",
  participant: "M4.5 2.5h7v4h-7z|M8 6.5v7",
  actor: "M8 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z|M8 5.5v4|M5 7h6|M8 9.5l-2.5 4|M8 9.5l2.5 4",
  boundary: "M3 5v5|M3 7.5h2.5|M10 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  control: "M8 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M8 4.5l2-1.5|M8 4.5l2 1.5",
  entity: "M8 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z|M4.5 13h7",
  database:
    "M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2v7c0 1.1-2.2 2-5 2s-5-.9-5-2z|M3 4.5c0 1.1 2.2 2 5 2s5-.9 5-2",
  collections: "M4.5 4.5h7v4h-7z|M6 3h7v4",
  queue: "M3.5 5h9a1.5 3 0 0 1 0 6h-9a1.5 3 0 0 1 0-6z|M12.5 5a1.5 3 0 0 0 0 6",
  participants: "M2.5 2.5h4v3h-4z|M9.5 2.5h4v3h-4z|M4.5 5.5v8|M11.5 5.5v8",
  fragment: "M2.5 3.5h11v9h-11z|M2.5 6.5h4l1.5-1.5v-1.5",
  /**
   * Activate the receiver: a lifeline with its bar, and the message that comes into the bar.
   */
  activate: "M10.5 1.5v2.5|M10.5 12.5v2|M9 4h3v8.5H9z|M1.5 7h5.5|M5.5 5.5L7 7 5.5 8.5",
  divider: "M2.5 7h11|M2.5 9h11",
  delay: "M4 8h.01|M8 8h.01|M12 8h.01",
  person: "M8 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z|M3.5 13.5v-2.5a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v2.5z",
  system: "M2.5 3.5h11v9h-11z",
  container: "M2.5 4.5h11v7h-11z|M4.5 7h4",
  datastore:
    "M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2v7c0 1.1-2.2 2-5 2s-5-.9-5-2z|M3 4.5c0 1.1 2.2 2 5 2s5-.9 5-2",
  component: "M4.5 3.5h9v9h-9z|M2.5 5.5h4v2h-4z|M2.5 8.5h4v2h-4z",
  model: "M2.5 3.5h4v3h-4z|M9.5 3.5h4v3h-4z|M6 11h4v3H6z|M4.5 6.5v2h7v-2|M8 8.5V11",
  /** Back to what applies without a written value: an arrow turning back. */
  reset: "M4.2 6.2a4.25 4.25 0 1 1-.45 3.3|M3.75 3.5v2.9h2.9",
  /** An icon that no pack has: a question mark, drawn in a dashed tile. */
  missing: "M6.1 6.1a1.95 1.95 0 1 1 2.75 1.8c-.52.24-.85.7-.85 1.25v.35|M8 11.75h.01",
};

/** Removes every child of an element. */
export function clear(element: Element): void {
  while (element.firstChild) element.firstChild.remove();
}

/** The ARIA names of the modifiers the catalogs write in shown keys, in both languages. */
const ARIA_MODIFIERS: Record<string, string> = {
  Ctrl: "Control",
  Cmd: "Meta",
  Shift: "Shift",
  Mayús: "Shift",
  Alt: "Alt",
};

/**
 * A key as a title shows it ("Ctrl+Alt+B", "Mayús+1", "L") written as `aria-keyshortcuts` wants
 * it ("Control+Alt+B", "Shift+1", "L"): the modifiers by their ARIA names, Cmd as Meta, a plus key
 * as "Plus". An empty key gives an empty string.
 */
export function ariaKeyshortcuts(shown: string): string {
  if (shown === "") return "";
  const parts = shown.endsWith("+") ? [...shown.slice(0, -1).split("+"), "Plus"] : shown.split("+");
  return parts
    .filter((part) => part !== "")
    .map((part) => ARIA_MODIFIERS[part] ?? part)
    .join("+");
}
