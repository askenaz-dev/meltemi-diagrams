import type { Box, Point } from "./geometry.js";

/** A box less `margin` on every side, never less than empty. */
function inset(box: Box, margin: number): Box {
  return {
    x: box.x + margin,
    y: box.y + margin,
    width: Math.max(0, box.width - 2 * margin),
    height: Math.max(0, box.height - 2 * margin),
  };
}

/** A coordinate mapped from one span to another; the middle of the new span from none. */
function mapped(value: number, from: number, size: number, to: number, toSize: number): number {
  return size > 0 ? to + ((value - from) * toSize) / size : to + toSize / 2;
}

/**
 * The points of a pen stroke scaled from its bounds to a new box, as a resize handle scales them:
 * the box of the points (the bounds less half the stroke's width on every side) maps onto the new
 * box less the same margin, so that the stroke keeps its width and its bounds become the box.
 * Along an axis the stroke has no extent on (a dot, a level or upright stroke), it sits in the
 * middle of the box. Diagram coordinates in, diagram coordinates out.
 */
export function scalePenPoints(
  points: readonly Point[],
  bounds: Box,
  box: Box,
  width: number,
): Point[] {
  const from = inset(bounds, width / 2);
  const to = inset(box, width / 2);
  return points.map((p) => ({
    x: mapped(p.x, from.x, from.width, to.x, to.width),
    y: mapped(p.y, from.y, from.height, to.y, to.height),
  }));
}
