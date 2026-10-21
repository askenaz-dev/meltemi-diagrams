import { turnPoint } from "@meltemi/diagrams-layout/shapes";
import { center, type Box, type Point } from "./geometry.js";

/**
 * A point of the diagram in the own frame of an element turned by `rotation` degrees about the
 * centre of its box: where it lies on the unturned element. The point itself when it is upright.
 */
export function intoFrame(point: Point, box: Box, rotation: number | undefined): Point {
  return rotation ? turnPoint(point, center(box), -rotation) : point;
}

/** A point of an element's own frame back in the diagram, turned with the element. */
export function outOfFrame(point: Point, box: Box, rotation: number | undefined): Point {
  return rotation ? turnPoint(point, center(box), rotation) : point;
}

/**
 * The axis-aligned box around a box turned by `rotation` degrees about its centre: what a turned
 * element covers for marquees, guides and other people's outlines.
 */
export function turnedBounds(box: Box, rotation: number | undefined): Box {
  if (!rotation) return box;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((p) => outOfFrame(p, box, rotation));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The angle a rotation handle dragged to `pointer` gives an element whose box is centred at
 * `centre`: the pointer's bearing from the centre, 0 straight up and growing clockwise, in whole
 * degrees from 0 to 359, snapped to `step` degrees when `step` is given.
 */
export function bearing(centre: Point, pointer: Point, step?: number): number {
  const radians = Math.atan2(pointer.x - centre.x, centre.y - pointer.y);
  const degrees = (radians * 180) / Math.PI;
  const snapped = step ? Math.round(degrees / step) * step : Math.round(degrees);
  return ((snapped % 360) + 360) % 360;
}
