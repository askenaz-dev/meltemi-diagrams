import { pointInShape } from "@meltemi/diagrams-layout/shapes";
import { center, contains, unionBox, type Box, type Point } from "./geometry.js";
import { intoFrame } from "./turning.js";
import type { ShapeName } from "./protocol.js";

/** Ids of the boxes fully inside a rectangle, in the order of `boxes`. */
export function selectInRect(
  boxes: ReadonlyMap<string, Box>,
  rect: Box,
  lines: ReadonlyMap<string, readonly Point[]> = new Map(),
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
  return [
    ...[...boxes].filter(([, box]) => contains(normal, box)).map(([id]) => id),
    ...[...lines].filter(([, line]) => line.length > 0 && line.every(inside)).map(([id]) => id),
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
