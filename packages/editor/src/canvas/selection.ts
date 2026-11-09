import { pointInShape, turnedOutline } from "@meltemi/diagrams-layout/shapes";
import { center, contains, unionBox, type Box, type Point } from "./geometry.js";
import { intoFrame } from "./turning.js";
import type { ShapeName } from "./protocol.js";

export interface RectangleSelectionOptions {
  readonly mode?: "contain" | "cross";
  /** Containers require full enclosure even when a band crosses their children. */
  readonly groups?: ReadonlySet<string>;
  readonly shapes?: ReadonlyMap<string, Stacked & { readonly labelBox?: Box }>;
  /** Visible stroke pieces, split at protected title gaps; also free lines and pens. */
  readonly strokes?: ReadonlyMap<string, readonly (readonly Point[])[]>;
}

/** Whether a segment touches the closed rectangle, including its boundary. */
function segmentCrossesRect(a: Point, b: Point, rect: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides = [-dx, dx, -dy, dy];
  const distances = [
    a.x - rect.x,
    rect.x + rect.width - a.x,
    a.y - rect.y,
    rect.y + rect.height - a.y,
  ];
  let enter = 0;
  let leave = 1;
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i]!;
    const distance = distances[i]!;
    if (side === 0) {
      if (distance < 0) return false;
      continue;
    }
    const at = distance / side;
    if (side < 0) enter = Math.max(enter, at);
    else leave = Math.min(leave, at);
    if (enter > leave) return false;
  }
  return true;
}

/** Whether any part of a drawn stroke touches a normalized selection rectangle. */
export function strokeCrossesRect(points: readonly Point[], rect: Box): boolean {
  if (points.length === 1) return contains(rect, { ...points[0]!, width: 0, height: 0 });
  return points.slice(1).some((point, index) => segmentCrossesRect(points[index]!, point, rect));
}

function shapeCrossesRect(shape: Stacked & { readonly labelBox?: Box }, rect: Box): boolean {
  const intersects = (box: Box) =>
    box.x <= rect.x + rect.width &&
    box.x + box.width >= rect.x &&
    box.y <= rect.y + rect.height &&
    box.y + box.height >= rect.y;
  if (shape.labelBox && intersects(shape.labelBox)) return true;
  const outline = turnedOutline(
    shape.shape,
    shape.box,
    shape.rotation ?? 0,
    shape.radius === undefined ? {} : { radius: shape.radius },
  );
  if (outline.length > 0 && strokeCrossesRect([...outline, outline[0]!], rect)) return true;
  // The rectangle can sit wholly inside a large shape without crossing its outline.
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].some((point) =>
    pointInShape(
      shape.shape,
      shape.box,
      intoFrame(point, shape.box, shape.rotation),
      shape.radius === undefined ? {} : { radius: shape.radius },
    ),
  );
}

/** Contained objects, or crossed drawing when explicitly requested, in source order. */
export function selectInRect(
  boxes: ReadonlyMap<string, Box>,
  rect: Box,
  lines: ReadonlyMap<string, readonly Point[]> = new Map(),
  options: RectangleSelectionOptions = {},
): string[] {
  const normal: Box = {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
  const inside = (p: Point) =>
    p.x >= normal.x &&
    p.x <= normal.x + normal.width &&
    p.y >= normal.y &&
    p.y <= normal.y + normal.height;
  const crossed = (id: string, line: readonly Point[]) =>
    (options.strokes?.get(id) ?? [line]).some((piece) => strokeCrossesRect(piece, normal));
  return [
    ...[...boxes]
      .filter(([id, box]) => {
        if (options.mode !== "cross" || options.groups?.has(id)) return contains(normal, box);
        if (options.strokes?.has(id)) return crossed(id, []);
        const shape = options.shapes?.get(id);
        if (shape) return shapeCrossesRect(shape, normal);
        return (
          box.x <= normal.x + normal.width &&
          box.x + box.width >= normal.x &&
          box.y <= normal.y + normal.height &&
          box.y + box.height >= normal.y
        );
      })
      .map(([id]) => id),
    ...[...lines]
      .filter(([id, line]) =>
        options.mode === "cross" ? crossed(id, line) : line.length > 0 && line.every(inside),
      )
      .map(([id]) => id),
  ];
}

/** Adds or removes `id` (Shift or Ctrl click), or selects only it. */
export function toggleSelection(
  selection: readonly string[],
  id: string,
  additive: boolean,
): string[] {
  if (!additive) return [id];
  return selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
}

/** The next (`1`) or previous (`-1`) id in source order, wrapping around. */
export function nextInOrder(
  order: readonly string[],
  current: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (order.length === 0) return undefined;
  const index = current === undefined ? -1 : order.indexOf(current);
  if (index < 0) return step > 0 ? order[0] : order[order.length - 1];
  return order[(index + step + order.length) % order.length];
}

export type Direction = "left" | "right" | "up" | "down";

/**
 * The box nearest to `current` in a direction: its centre must lie in that half-plane, and
 * distance across the direction counts twice as much as distance along it. Of two boxes with one
 * centre, such as a stack, the nested (smaller) one comes first.
 */
export function nearestInDirection(
  boxes: ReadonlyMap<string, Box>,
  current: string,
  direction: Direction,
): string | undefined {
  const from = boxes.get(current);
  if (!from) return undefined;
  const c = center(from);
  let best: { id: string; score: number; centre: Point; area: number } | undefined;
  for (const [id, box] of boxes) {
    if (id === current) continue;
    const p = center(box);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const along =
      direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    const score = along + 2 * across;
    const area = box.width * box.height;
    const concentric =
      best !== undefined &&
      Math.abs(best.centre.x - p.x) < 0.5 &&
      Math.abs(best.centre.y - p.y) < 0.5;
    if (!best || (concentric ? area < best.area : score < best.score)) {
      best = { id, score, centre: p, area };
    }
  }
  return best?.id;
}

/** An element as the searches under a point see it: its box and the shape drawn in it. */
export interface Stacked {
  readonly id: string;
  readonly box: Box;
  /** The point must lie inside the shape's outline: a diamond's empty corners hold nothing. */
  readonly shape: ShapeName;
  /** Degrees the element is turned about the centre of its box; absent when upright. */
  readonly rotation?: number;
  /** The corner radius its outline is drawn with, where it has one. */
  readonly radius?: number;
}

/**
 * The stack under a point, front to back: the elements of `painted` (listed back to front, in the
 * order they are painted, without those of hidden layers) whose shape holds the point, its
 * outline included. Every search under a point starts here: the element a press reaches, the box
 * a connector end attaches to, the group a new element or a drop goes into, and Alt+click.
 */
export function stackAt<T extends Stacked>(painted: readonly T[], point: Point): T[] {
  return painted
    .filter((e) =>
      pointInShape(
        e.shape,
        e.box,
        intoFrame(point, e.box, e.rotation),
        e.radius === undefined ? {} : { radius: e.radius },
      ),
    )
    .reverse();
}

/**
 * What Alt+click selects in the stack under the pointer (front to back): the element below
 * `current`, wrapping round to the top; the one below the topmost when `current` is not in it.
 */
export function belowInStack(
  stack: readonly string[],
  current: string | undefined,
): string | undefined {
  if (stack.length === 0) return undefined;
  const index = current === undefined ? -1 : stack.indexOf(current);
  return index < 0 ? stack[Math.min(1, stack.length - 1)] : stack[(index + 1) % stack.length];
}

/** Whether `id` is `ancestor` or lies inside it, following `parentOf`. */
function within(
  id: string,
  ancestors: ReadonlySet<string>,
  parentOf: (id: string) => string | null | undefined,
): boolean {
  let current: string | null | undefined = id;
  // A guard against a cycle that a broken render could hold.
  for (let depth = 0; current && depth < 256; depth++) {
    if (ancestors.has(current)) return true;
    current = parentOf(current);
  }
  return false;
}

/** An element as a drop sees it: a group or not, where it is drawn. */
export interface Droppable extends Stacked {
  readonly kind: string;
}

/**
 * The group a dragged selection lands in: the innermost group whose box holds the centre of the
 * dragged selection's box, which is the frontmost one painted; the dragged elements and what lies
 * inside them are left out. `painted` lists the elements back to front, and `parentOf` gives every
 * element's group. A group on a hidden layer (`hidden`) is no new target, but one that already
 * holds a dragged element still holds it while the centre stays in its box. Null when the centre
 * is outside every group.
 */
export function dropTarget<T extends Droppable>(
  painted: readonly T[],
  dragged: readonly string[],
  centre: Point,
  parentOf: (id: string) => string | null | undefined,
  hidden: (element: T) => boolean = () => false,
): string | null {
  const moving = new Set(dragged);
  const holding = new Set<string>();
  for (const id of dragged) {
    // A guard against a cycle that a broken render could hold.
    let group = parentOf(id);
    for (let depth = 0; group && depth < 256; depth++, group = parentOf(group)) holding.add(group);
  }
  const reachable = painted.filter((e) => !hidden(e) || holding.has(e.id));
  const target = stackAt(reachable, centre).find(
    (e) => e.kind === "group" && !within(e.id, moving, parentOf),
  );
  return target?.id ?? null;
}

/** An element as a drag sees its group: the group, and whether a group has a `place`. */
export interface Carried {
  readonly id: string;
  readonly kind: string;
  readonly parent: string | null;
  readonly placed: boolean;
}

/**
 * The dragged elements that keep their group whatever the drop: all the children of a group
 * without `place`, when every one of them is dragged. That group is drawn around its children, so
 * it moves with them, as a group is moved by dragging its contents.
 */
export function carriedChildren(
  elements: readonly Carried[],
  dragged: readonly string[],
): Set<string> {
  const moving = new Set(dragged);
  const carried = new Set<string>();
  for (const group of elements) {
    if (group.kind !== "group" || group.placed) continue;
    const children = elements.filter((e) => e.parent === group.id);
    if (children.length > 0 && children.every((c) => moving.has(c.id))) {
      for (const child of children) carried.add(child.id);
    }
  }
  return carried;
}

/**
 * Whether a drop into `target` gives one of the dragged elements another parent: of those whose
 * group is not dragged with them, the ones whose group is not `target`. Those of `kept` (see
 * `carriedChildren`) keep their group whatever the target.
 */
export function changesParent(
  dragged: readonly string[],
  target: string | null,
  parentOf: (id: string) => string | null | undefined,
  kept: ReadonlySet<string> = new Set(),
): boolean {
  const moving = new Set(dragged);
  return dragged.some((id) => {
    if (kept.has(id)) return false;
    const parent = parentOf(id) ?? null;
    const outermost = parent === null || !within(parent, moving, parentOf);
    return outermost && parent !== target;
  });
}

/** A free grid cell near `target` that no box covers, for elements created from the keyboard. */
export function freeCell(
  boxes: readonly Box[],
  target: Point,
  size: { width: number; height: number },
  grid: number,
): Point {
  const step = Math.max(grid, 1) * 2;
  for (let ring = 0; ring < 40; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (const [dx, dy] of [
        [i, -ring],
        [i, ring],
        [-ring, i],
        [ring, i],
      ] as const) {
        const p = {
          x: Math.round((target.x + dx * (size.width + step)) / grid) * grid,
          y: Math.round((target.y + dy * (size.height + step)) / grid) * grid,
        };
        const box = { x: p.x - size.width / 2, y: p.y - size.height / 2, ...size };
        if (
          !boxes.some(
            (b) =>
              b.x < box.x + box.width &&
              box.x < b.x + b.width &&
              b.y < box.y + box.height &&
              box.y < b.y + b.height,
          )
        ) {
          return p;
        }
      }
    }
  }
  return target;
}

export { unionBox };
