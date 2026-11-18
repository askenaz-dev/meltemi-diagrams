import { center, type Box, type Point } from "./geometry.js";

/** The default grid of the canvas, in diagram units. */
export const DEFAULT_GRID = 14;
/** How close an edge or centre must be, in screen pixels, to snap to another box. */
export const GUIDE_DISTANCE = 6;
/** The smallest box a resize leaves. */
export const MIN_SIZE = 24;

export interface SnapOptions {
  readonly grid: number;
  /** Snap to the grid. */
  readonly snap: boolean;
  /** Snap to the edges and centres of other boxes. */
  readonly guides: boolean;
  /** Screen pixels per diagram unit, for the guide distance. */
  readonly zoom: number;
  /** Alt is held: no snapping at all, whole pixels. */
  readonly free?: boolean;
}

/** A line a box snapped to: a vertical line at `x` or a horizontal one at `y`, and its extent. */
export interface Guide {
  readonly axis: "x" | "y";
  readonly value: number;
  readonly from: number;
  readonly to: number;
}

export const snapValue = (value: number, grid: number): number =>
  grid > 0 ? Math.round(value / grid) * grid : value;

/** Lines of a box along one axis: start edge, centre, end edge. */
function lines(box: Box, axis: "x" | "y"): number[] {
  return axis === "x"
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height];
}

/**
 * The delta a move writes: the primary box first snaps to the edges and centres of other boxes
 * within the guide distance, and otherwise its centre snaps to the grid. Every box of the
 * selection moves by the same delta.
 */
export function resolveMove(
  primary: Box,
  others: readonly Box[],
  delta: Point,
  options: SnapOptions,
): { delta: Point; guides: Guide[] } {
  if (options.free)
    return { delta: { x: Math.round(delta.x), y: Math.round(delta.y) }, guides: [] };
  const moved: Box = { ...primary, x: primary.x + delta.x, y: primary.y + delta.y };
  const threshold = GUIDE_DISTANCE / Math.max(options.zoom, 0.01);
  const result = { x: Math.round(delta.x), y: Math.round(delta.y) };
  const matches: { axis: "x" | "y"; value: number; other: Box }[] = [];
  for (const axis of ["x", "y"] as const) {
    let best: { shift: number; value: number; other: Box } | undefined;
    if (options.guides) {
      for (const other of others) {
        for (const target of lines(other, axis)) {
          for (const line of lines(moved, axis)) {
            const shift = target - line;
            if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) {
              best = { shift, value: target, other };
            }
          }
        }
      }
    }
    if (best) {
      const distance = delta[axis] + best.shift;
      result[axis] = Math.abs(distance) < 1e-6 ? 0 : distance;
      matches.push({ axis, value: best.value, other: best.other });
    } else if (options.snap) {
      result[axis] = snapValue(center(moved)[axis], options.grid) - center(primary)[axis];
    }
  }
  // Draw each guide through the box after both axes have resolved, including the other axis's snap.
  const snapped = { ...primary, x: primary.x + result.x, y: primary.y + result.y };
  const guides = matches.map(({ axis, value, other }) => {
    const across = axis === "x" ? "y" : "x";
    const size = across === "x" ? "width" : "height";
    return {
      axis,
      value,
      from: Math.min(snapped[across], other[across]),
      to: Math.max(snapped[across] + snapped[size], other[across] + other[size]),
    };
  });
  return { delta: result, guides };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * The box after dragging a resize handle by `delta`: the opposite edges stay, the size snaps to
 * grid multiples and is at least `MIN_SIZE` (rounded up to the grid).
 */
export function resizeBox(box: Box, handle: Handle, delta: Point, options: SnapOptions): Box {
  const grid = options.snap && !options.free ? options.grid : 1;
  const min = Math.ceil(MIN_SIZE / grid) * grid;
  const size = (value: number) =>
    Math.max(min, grid > 1 ? snapValue(value, grid) : Math.round(value));
  let { x, y, width, height } = box;
  if (handle.includes("e")) width = size(box.width + delta.x);
  if (handle.includes("w")) {
    width = size(box.width - delta.x);
    x = box.x + box.width - width;
  }
  if (handle.includes("s")) height = size(box.height + delta.y);
  if (handle.includes("n")) {
    height = size(box.height - delta.y);
    y = box.y + box.height - height;
  }
  return { x, y, width, height };
}

/** The centre of a box, rounded half up, as written in `place`. */
export function writtenCenter(box: Box): Point {
  const c = center(box);
  return { x: Math.floor(c.x + 0.5), y: Math.floor(c.y + 0.5) };
}
