import type { AlignEdge, ConstraintEntry, Point } from "@meltemi/diagrams-model";
import { messages } from "./messages/index.js";

/** A box the solver may move, given by its centre and size. */
export interface SolverBox {
  center: Point;
  readonly width: number;
  readonly height: number;
  /** Fixed boxes never move: placed ones in `assisted`, every one in `manual`. */
  readonly fixed: boolean;
}

export interface ConstraintConflict {
  readonly entry: ConstraintEntry;
  /** Why it does not hold, in the interface language of the moment it was found. */
  readonly message: string;
}

const ROUNDS = 20;
const TOLERANCE = 0.5;

function edgeValue(box: SolverBox, edge: AlignEdge): number {
  switch (edge) {
    case "top":
      return box.center.y - box.height / 2;
    case "middle":
      return box.center.y;
    case "bottom":
      return box.center.y + box.height / 2;
    case "left":
      return box.center.x - box.width / 2;
    case "center":
      return box.center.x;
    case "right":
      return box.center.x + box.width / 2;
  }
}

const horizontalEdge = (edge: AlignEdge) =>
  edge === "left" || edge === "center" || edge === "right";

function setEdge(box: SolverBox, edge: AlignEdge, value: number): void {
  const delta = value - edgeValue(box, edge);
  box.center = horizontalEdge(edge)
    ? { x: box.center.x + delta, y: box.center.y }
    : { x: box.center.x, y: box.center.y + delta };
}

/** The gap between two boxes, edge to edge, along the axis on which they are furthest apart. */
function gap(a: SolverBox, b: SolverBox): { value: number; axis: "x" | "y" } {
  const dx = Math.abs(a.center.x - b.center.x) - (a.width + b.width) / 2;
  const dy = Math.abs(a.center.y - b.center.y) - (a.height + b.height) / 2;
  return dx >= dy ? { value: dx, axis: "x" } : { value: dy, axis: "y" };
}

const along = (box: SolverBox, axis: "x" | "y") => (axis === "x" ? box.center.x : box.center.y);
const extent = (box: SolverBox, axis: "x" | "y") => (axis === "x" ? box.width : box.height);
const moveTo = (box: SolverBox, axis: "x" | "y", value: number) => {
  box.center = axis === "x" ? { x: value, y: box.center.y } : { x: box.center.x, y: value };
};

/**
 * Moves free boxes until every constraint holds, for a bounded number of rounds, and returns the
 * constraints that still do not hold. Fixed boxes never move.
 */
export function solveConstraints(
  constraints: readonly ConstraintEntry[],
  boxes: ReadonlyMap<string, SolverBox>,
  defaultAxis: "horizontal" | "vertical",
  spacing: number,
): ConstraintConflict[] {
  const members = (entry: ConstraintEntry) =>
    entry.targets.map((id) => boxes.get(id)).filter((b): b is SolverBox => b !== undefined);
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (const entry of constraints) {
      const list = members(entry);
      if (list.length < 2) continue;
      if (entry.edge) {
        const edge = entry.edge;
        const fixed = list.find((b) => b.fixed);
        const reference = fixed
          ? edgeValue(fixed, edge)
          : list.reduce((sum, b) => sum + edgeValue(b, edge), 0) / list.length;
        for (const box of list) {
          if (!box.fixed && Math.abs(edgeValue(box, edge) - reference) > TOLERANCE) {
            setEdge(box, edge, reference);
            moved = true;
          }
        }
      } else if (entry.kind === "order") {
        const axis = (entry.axis ?? defaultAxis) === "horizontal" ? "x" : "y";
        for (let i = 1; i < list.length; i++) {
          const previous = list[i - 1]!;
          const current = list[i]!;
          const needed = (extent(previous, axis) + extent(current, axis)) / 2 + spacing;
          if (along(current, axis) - along(previous, axis) >= needed - TOLERANCE) continue;
          if (!current.fixed) moveTo(current, axis, along(previous, axis) + needed);
          else if (!previous.fixed) moveTo(previous, axis, along(current, axis) - needed);
          else continue;
          moved = true;
        }
      } else if (entry.kind === "distance" && entry.distance !== null) {
        const [a, b] = list as [SolverBox, SolverBox];
        const current = gap(a, b);
        if (current.value >= entry.distance - TOLERANCE) continue;
        const push = entry.distance - current.value;
        const mover = !b.fixed ? b : !a.fixed ? a : undefined;
        if (!mover) continue;
        const other = mover === b ? a : b;
        const direction = along(mover, current.axis) >= along(other, current.axis) ? 1 : -1;
        moveTo(mover, current.axis, along(mover, current.axis) + direction * push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return conflicts(constraints, boxes, defaultAxis);
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Constraints that do not hold for the current boxes. */
function conflicts(
  constraints: readonly ConstraintEntry[],
  boxes: ReadonlyMap<string, SolverBox>,
  defaultAxis: "horizontal" | "vertical",
): ConstraintConflict[] {
  const found: ConstraintConflict[] = [];
  const words = messages().diagnostics;
  for (const entry of constraints) {
    const list = entry.targets.map((id) => [id, boxes.get(id)] as const).filter(([, b]) => b);
    if (list.length < 2) continue;
    if (entry.edge) {
      const edge = entry.edge;
      const values = list.map(([id, b]) => [id, edgeValue(b!, edge)] as const);
      const [firstId, first] = values[0]!;
      const worst = values.reduce((w, v) =>
        Math.abs(v[1] - first) > Math.abs(w[1] - first) ? v : w,
      );
      const difference = Math.abs(worst[1] - first);
      if (difference > TOLERANCE) {
        found.push({
          entry,
          message: words.alignConflict(
            entry.kind,
            entry.targets,
            edge,
            worst[0],
            round(difference),
            firstId,
          ),
        });
      }
    } else if (entry.kind === "order") {
      const axis = (entry.axis ?? defaultAxis) === "horizontal" ? "x" : "y";
      for (let i = 1; i < list.length; i++) {
        const [previousId, previous] = list[i - 1]!;
        const [currentId, current] = list[i]!;
        if (along(current!, axis) <= along(previous!, axis)) {
          found.push({
            entry,
            message: words.orderConflict(entry.targets, currentId, axis, previousId),
          });
          break;
        }
      }
    } else if (entry.kind === "distance" && entry.distance !== null) {
      const [[aId, a], [bId, b]] = list as [[string, SolverBox], [string, SolverBox]];
      const current = gap(a, b).value;
      if (current < entry.distance - TOLERANCE) {
        found.push({
          entry,
          message: words.distanceConflict(aId, bId, round(Math.max(0, current)), entry.distance),
        });
      }
    }
  }
  return found;
}
