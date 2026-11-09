import type { Point } from "@meltemi/diagrams-editor/canvas";
import { s } from "./dom.js";

/** Six screen pixels beyond either painted edge, independent of document zoom. */
export const connectorHitWidth = (width: number, zoom: number): number =>
  width + 12 / Math.max(zoom, 1e-3);

/** A real connector stroke, excluding the zero-opacity decorative traces and particles. */
function connectorStroke(element: Element): element is SVGPathElement | SVGPolylineElement {
  return (
    (element.tagName.toLowerCase() === "path" || element.tagName.toLowerCase() === "polyline") &&
    element.getAttribute("stroke") !== null &&
    element.getAttribute("stroke") !== "none" &&
    element.getAttribute("opacity") !== "0" &&
    !element.classList.contains("mdg-hit")
  );
}

/** Sample a curve for rectangle crossing; straight polylines retain their exact vertices. */
function strokePoints(element: SVGPathElement | SVGPolylineElement): Point[] {
  if (element instanceof SVGPolylineElement)
    return Array.from({ length: element.points.numberOfItems }, (_, index) => {
      const point = element.points.getItem(index);
      return { x: point.x, y: point.y };
    });
  const length = element.getTotalLength();
  const count = Math.max(1, Math.min(4096, Math.ceil(length / 2)));
  return Array.from({ length: count + 1 }, (_, index) => {
    const point = element.getPointAtLength((length * index) / count);
    return { x: point.x, y: point.y };
  });
}

/**
 * Canvas-only continuous targets under every real connector piece. The animated SVG's own
 * stroke may deliberately ignore pointer events; these targets never carry its motion classes.
 */
export function addConnectorHits(
  root: SVGSVGElement,
  zoom: number,
  offset: Point,
  freeLines: ReadonlySet<string> = new Set(),
): Map<string, readonly (readonly Point[])[]> {
  const strokes = new Map<string, readonly (readonly Point[])[]>();
  for (const group of root.querySelectorAll<SVGGElement>(
    'g[data-role="relation"][data-id], g[data-role="element"][data-id]',
  )) {
    const id = group.getAttribute("data-id")!;
    if (group.getAttribute("data-role") !== "relation" && !freeLines.has(id)) continue;
    const pieces: Point[][] = [];
    const rootMatrix = root.getScreenCTM();
    for (const drawn of [...group.children].filter(connectorStroke)) {
      const width = Number(drawn.getAttribute("stroke-width")) || 1;
      const hit = s(drawn.tagName.toLowerCase() as "path" | "polyline", {
        class: "mdg-hit mdg-connector-hit",
        "data-stroke-width": width,
        fill: "none",
        stroke: "transparent",
        "stroke-width": connectorHitWidth(width, zoom),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "pointer-events": "visibleStroke",
      });
      for (const name of ["d", "points", "transform", "clip-path"])
        if (drawn.hasAttribute(name)) hit.setAttribute(name, drawn.getAttribute(name)!);
      group.insertBefore(hit, group.firstChild);
      // Free lines can be rotated as a group. Rectangle tests use diagram coordinates,
      // rather than the local coordinates of an individual SVG primitive.
      const screen = drawn.getScreenCTM();
      const intoRoot = rootMatrix && screen ? rootMatrix.inverse().multiply(screen) : undefined;
      pieces.push(
        strokePoints(drawn).map((point) => {
          const at = intoRoot ? new DOMPoint(point.x, point.y).matrixTransform(intoRoot) : point;
          return { x: at.x - offset.x, y: at.y - offset.y };
        }),
      );
    }
    // An empty list is meaningful: do not fall back to a route hidden wholly by title holes.
    strokes.set(id, pieces);
  }
  return strokes;
}

/** The reach of connector bodies is measured on the screen, like the reach of pen strokes. */
export function syncConnectorHits(root: Element, zoom: number): void {
  for (const hit of root.querySelectorAll<SVGElement>(".mdg-connector-hit[data-stroke-width]"))
    hit.setAttribute(
      "stroke-width",
      String(connectorHitWidth(Number(hit.dataset.strokeWidth), zoom)),
    );
}
