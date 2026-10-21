// DOM helpers of the player's runtime. Strings always become text nodes: nothing a document says
// is ever parsed as markup.

export const SVG_NS = "http://www.w3.org/2000/svg";

/** An HTML element with attributes and children; `false` leaves an attribute out. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | boolean> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false) continue;
    element.setAttribute(name, value === true ? "" : value);
  }
  element.append(...children);
  return element;
}

/** An SVG element with attributes. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/** A 16 × 16 stroked icon from paths separated by `|`. */
export function icon(paths: string): SVGSVGElement {
  const svg = svgEl("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
  for (const d of paths.split("|")) svg.append(svgEl("path", { d }));
  return svg;
}

/** An attribute selector value, quoted. */
export const quote = (text: string): string => `"${text.replace(/["\\]/g, "\\$&")}"`;

/** A URL the panel may link to: the schemes `url` accepts. */
export const safeUrl = (url: string | null): string | null =>
  url !== null && /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;

/** The host of a URL for a card's line, or the URL itself. */
export function urlHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "mailto:" ? parsed.pathname : parsed.host;
  } catch {
    return url;
  }
}

export const ICONS = {
  play: "M5 3.5l8 4.5-8 4.5z",
  pause: "M5.5 3.5v9|M10.5 3.5v9",
  previous: "M4 3.5v9|M12.5 3.5L6.5 8l6 4.5z",
  next: "M12 3.5v9|M3.5 3.5l6 4.5-6 4.5z",
  static: "M2.5 3.5h11v9h-11z|M5 6.5h6|M5 9.5h4",
  zoomIn: "M8 4v8|M4 8h8",
  zoomOut: "M4 8h8",
  fit: "M3 6V3h3|M10 3h3v3|M13 10v3h-3|M6 13H3v-3",
  close: "M4 4l8 8|M12 4l-8 8",
  up: "M8 12.5v-9|M4 7.5l4-4 4 4",
  open: "M8 4v8|M4 8h8",
  external: "M9 3h4v4|M13 3L7.5 8.5|M11 9.5V13H3V5h3.5",
};
