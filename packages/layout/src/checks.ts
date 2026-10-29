import type { Diagnostic, Range } from "@meltemi/diagrams-language";
import type { Element, FlowDiagram, Point, Relation } from "@meltemi/diagrams-model";
import type { Box } from "./geometry.js";
import { messages } from "./messages/index.js";
import { crossedBoxes } from "./routing.js";
import { segmentCrossesPolygon } from "./shapes.js";

/** A drawn connector for the checks: its polyline, whether it is curved, and its label pill. */
export interface CheckedConnector {
  readonly relation: Relation;
  readonly points: readonly Point[];
  readonly curved: boolean;
  readonly label: Box | undefined;
}

/**
 * The kinds drawn as boxes that may not overlap: flow kinds, free boxes and stickies (whose card
 * is a rectangle), and C4 entities.
 */
const BOX_KINDS: ReadonlySet<string> = new Set([
  "node",
  "decision",
  "data",
  "box",
  "sticky",
  "person",
  "system",
  "container",
  "datastore",
  "component",
]);
const EPSILON = 0.5;
/** Shortest shared stretch of two collinear connectors that is reported. */
export const CONNECTOR_OVERLAP = 24;

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    b.x < a.x + a.width - EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    b.y < a.y + a.height - EPSILON
  );
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  );
}

/** How far in from a side of the outer box a stacked box lies, at least, on one of its sides. */
const STACK_INSET = 1;

/**
 * Whether `inner` is stacked on `outer`: inside it, and at least `STACK_INSET` in from one of its
 * sides. Two boxes that coincide hold each other, but one hides the other: they are no stack.
 * Hosts use the same rule to find the boxes a box holds (a stack is the later box of a layer).
 */
export function stacked(outer: Box, inner: Box): boolean {
  return (
    contains(outer, inner) &&
    Math.max(
      inner.x - outer.x,
      inner.y - outer.y,
      outer.x + outer.width - (inner.x + inner.width),
      outer.y + outer.height - (inner.y + inner.height),
    ) >=
      STACK_INSET - 1e-9
  );
}

/** Whether a segment crosses the inside of a box. */
function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  // Liang-Barsky clipping against the box shrunk by a pixel.
  const inner = { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 };
  if (inner.width <= 0 || inner.height <= 0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - inner.x],
    [dx, inner.x + inner.width - a.x],
    [-dy, a.y - inner.y],
    [dy, inner.y + inner.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 < t1;
}

function horizontal(p: Point, q: Point): boolean {
  return Math.abs(p.y - q.y) < EPSILON;
}

function verticalSeg(p: Point, q: Point): boolean {
  return Math.abs(p.x - q.x) < EPSILON;
}

/** The length two axis-aligned segments share when they lie on the same line. */
function sharedLength(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (horizontal(a1, a2) && horizontal(b1, b2) && Math.abs(a1.y - b1.y) < EPSILON) {
    const lo = Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
    const hi = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x));
    return Math.max(0, hi - lo);
  }
  if (verticalSeg(a1, a2) && verticalSeg(b1, b2) && Math.abs(a1.x - b1.x) < EPSILON) {
    const lo = Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
    const hi = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y));
    return Math.max(0, hi - lo);
  }
  return 0;
}

/** The bounding box of a polyline. */
function pointsBox(points: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Index pairs `[i, j]` (i < j) of boxes that touch or come within `slack` of each other, in
 * ascending order. Sweeping along x keeps large diagrams fast: only boxes whose x ranges meet are
 * compared.
 */
function nearPairs(boxes: readonly Box[], slack: number): [number, number][] {
  const sorted = boxes.map((_, i) => i).sort((a, b) => boxes[a]!.x - boxes[b]!.x || a - b);
  const pairs: [number, number][] = [];
  for (let s = 0; s < sorted.length; s++) {
    const i = sorted[s]!;
    const a = boxes[i]!;
    const right = a.x + a.width + slack;
    for (let t = s + 1; t < sorted.length; t++) {
      const j = sorted[t]!;
      const b = boxes[j]!;
      if (b.x > right) break;
      if (b.y <= a.y + a.height + slack && a.y <= b.y + b.height + slack) {
        pairs.push(i < j ? [i, j] : [j, i]);
      }
    }
  }
  return pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/** The layer an element or relation is drawn on. */
const layerOf = (item: { readonly layer: string | null }) => item.layer ?? "main";

/**
 * Composition checks (decision D7 of the layout-engine change): overlapping boxes, boxes crossing
 * group edges, labels lying on other connectors, boxes too close to the edge or title band of a
 * placed group, and connectors running along each other. Tags and notes are not checked, nor are
 * the text, icons and images of free diagrams; boxes and groups on different layers overlap on
 * purpose, and a box declared after a box that holds it whole (`stacked`) is a stack, not an
 * overlap; written the other way round, the overlap's hint says to declare the outer box first.
 * `untitled` tells the groups without a title band (see `isUntitledGroup`). `outlines` holds the
 * outline polygon of the boxes drawn with a shape other than a box (see `shapeOutline`): a
 * connector crosses such a box only through its outline, not through its box's empty corners.
 * `labels` holds the labels boxes draw outside them (an icon shape's): a box and its label are two
 * rectangles that overlap other boxes and groups, with nothing between them; a box over another's
 * label is an overlap, never a stack; boxes keep their groups' margins with their labels;
 * connectors cross the boxes.
 */
export function checkComposition(
  diagram: FlowDiagram,
  boxes: ReadonlyMap<string, Box>,
  connectors: readonly CheckedConnector[],
  explicitGroups: ReadonlySet<string>,
  theme: { readonly groupPadding: number; readonly groupHeader: number },
  untitled: (group: Element) => boolean,
  outlines: ReadonlyMap<string, readonly Point[]> = new Map(),
  labels: ReadonlyMap<string, Box> = new Map(),
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // Messages are written in the interface language of the moment the checks run.
  const { diagnostics: words, hints } = messages();
  // `ids` are the elements and relations the message names, for tools that must not read it.
  const warn = (
    code: string,
    message: string,
    range: Range,
    ids: readonly string[],
    hint?: string,
  ) =>
    diagnostics.push({
      code,
      severity: "warning",
      message,
      range,
      ...(hint === undefined ? {} : { hints: [hint] }),
      data: { ids },
    });
  const order = new Map(diagram.elements.map((e, i) => [e.id, i]));
  const later = (a: Element, b: Element) =>
    (order.get(a.id) ?? 0) > (order.get(b.id) ?? 0) ? a : b;

  const shapes = diagram.elements.filter((e) => BOX_KINDS.has(e.kind) && boxes.has(e.id));
  const groups = diagram.elements.filter((e) => e.kind === "group" && boxes.has(e.id));

  /** What a shape draws: its box, and the label outside it if it has one. */
  const partsOf = (id: string): Box[] => {
    const label = labels.get(id);
    return label ? [boxes.get(id)!, label] : [boxes.get(id)!];
  };
  /** The extent of what a shape draws. */
  const extentOf = (id: string): Box => {
    const label = labels.get(id);
    return label ? union(boxes.get(id)!, label) : boxes.get(id)!;
  };
  const meets = (a: readonly Box[], b: readonly Box[]) =>
    a.some((p) => b.some((q) => intersects(p, q)));
  const shapeParts = shapes.map((s) => partsOf(s.id));
  const shapeBoxes = shapes.map((s) => extentOf(s.id));
  for (const [i, j] of nearPairs(shapeBoxes, 0)) {
    // `shapes` keeps the declaration order, so `a` is declared before `b`.
    const a = shapes[i]!;
    const b = shapes[j]!;
    if (layerOf(a) !== layerOf(b)) continue;
    if (!meets(shapeParts[i]!, shapeParts[j]!)) continue;
    // A later box drawn whole inside an earlier one is a stack; a box over a label is not.
    if (stacked(boxes.get(a.id)!, shapeBoxes[j]!)) continue;
    // An earlier box inside a later one is a stack written inner first, and hidden by it.
    const reversed = stacked(boxes.get(b.id)!, shapeBoxes[i]!);
    warn(
      "layout.overlap",
      words.overlap(a.id, b.id),
      later(a, b).range,
      [a.id, b.id],
      reversed ? hints.stackOrder(b.id, a.id) : undefined,
    );
  }
  for (const [index, shape] of shapes.entries()) {
    const box = shapeBoxes[index]!;
    for (const group of groups) {
      if (layerOf(shape) !== layerOf(group)) continue;
      const area = boxes.get(group.id)!;
      if (!meets(shapeParts[index]!, [area])) continue;
      const declared = shape.groupPath.includes(group.id);
      if (declared && contains(area, box)) continue;
      warn(
        "layout.overlap",
        declared ? words.crossesGroup(shape.id, group.id) : words.overlapsGroup(shape.id, group.id),
        shape.range,
        [shape.id, group.id],
      );
    }
  }

  for (const group of groups) {
    if (!explicitGroups.has(group.id)) continue;
    const area = boxes.get(group.id)!;
    const margin = theme.groupPadding / 2;
    // A titled group keeps its title band clear; an untitled one has no band.
    const top = untitled(group) ? margin : theme.groupHeader;
    for (const shape of shapes) {
      if (!shape.groupPath.includes(group.id)) continue;
      // A group on another layer is a backdrop, as for the overlaps above.
      if (layerOf(shape) !== layerOf(group)) continue;
      const box = extentOf(shape.id);
      if (!contains(area, box)) continue; // already reported as crossing the edge
      const tooClose =
        box.x - area.x < margin - EPSILON ||
        area.x + area.width - (box.x + box.width) < margin - EPSILON ||
        area.y + area.height - (box.y + box.height) < margin - EPSILON ||
        box.y - area.y < top - EPSILON;
      if (tooClose) {
        warn("layout.container-margin", words.containerMargin(shape.id, group.id), shape.range, [
          shape.id,
          group.id,
        ]);
      }
    }
  }

  // Labels and connectors in one sweep: connectors first, then the labels.
  const extents = connectors.map((c) => pointsBox(c.points));
  const labelled = connectors.flatMap((c, i) => (c.label ? [i] : []));
  const sweep = [...extents, ...labelled.map((i) => connectors[i]!.label!)];
  const hits: [number, number][] = [];
  for (const [p, q] of nearPairs(sweep, 0)) {
    if (p >= connectors.length || q < connectors.length) continue; // not a connector and a label
    const owner = labelled[q - connectors.length]!;
    if (owner !== p) hits.push([owner, p]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [owner, index] of hits) {
    const connector = connectors[owner]!;
    const other = connectors[index]!;
    const pts = other.points;
    let hit = false;
    for (let k = 1; k < pts.length && !hit; k++)
      hit = segmentHitsBox(pts[k - 1]!, pts[k]!, connector.label!);
    if (hit) {
      warn(
        "layout.label-under-connector",
        words.labelUnderConnector(connector.relation.key, other.relation.key),
        connector.relation.range,
        [connector.relation.key, other.relation.key],
      );
    }
  }

  for (const [i, j] of nearPairs(extents, EPSILON)) {
    const a = connectors[i]!;
    const b = connectors[j]!;
    if (a.curved || b.curved) continue;
    let shared = 0;
    for (let p = 1; p < a.points.length; p++) {
      for (let q = 1; q < b.points.length; q++) {
        shared = Math.max(
          shared,
          sharedLength(a.points[p - 1]!, a.points[p]!, b.points[q - 1]!, b.points[q]!),
        );
      }
    }
    if (shared > CONNECTOR_OVERLAP) {
      warn(
        "layout.connector-overlap",
        words.connectorOverlap(a.relation.key, b.relation.key, Math.round(shared)),
        b.relation.range,
        [a.relation.key, b.relation.key],
      );
    }
  }

  // Connectors through the shapes of their layer that they do not join, nor hold their ends.
  for (const connector of connectors) {
    const relation = connector.relation;
    const holders = new Set(
      [relation.from, relation.to].flatMap((id) => [
        id,
        ...(diagram.elementsById.get(id)?.groupPath ?? []),
      ]),
    );
    const ends = [relation.from, relation.to].flatMap((id) => boxes.get(id) ?? []);
    const extent = pointsBox(connector.points);
    const others = shapes.filter((s) => {
      if (holders.has(s.id) || layerOf(s) !== layerOf(relation)) return false;
      const box = boxes.get(s.id)!;
      // A box an end is stacked inside holds that end.
      if (ends.some((end) => contains(box, end))) return false;
      return (
        box.x <= extent.x + extent.width &&
        extent.x <= box.x + box.width &&
        box.y <= extent.y + extent.height &&
        extent.y <= box.y + box.height
      );
    });
    const crossed = crossedBoxes(
      connector.points,
      others.map((s) => ({ ...boxes.get(s.id)!, id: s.id })),
    ).filter((box) => {
      // A shaped box is crossed through its outline.
      const outline = outlines.get(box.id);
      if (!outline) return true;
      for (let k = 1; k < connector.points.length; k++) {
        if (segmentCrossesPolygon(connector.points[k - 1]!, connector.points[k]!, outline)) {
          return true;
        }
      }
      return false;
    });
    for (const box of crossed) {
      warn(
        "layout.connector-crossing",
        words.connectorCrossing(relation.key, box.id),
        relation.range,
        [relation.key, box.id],
      );
    }
  }
  return diagnostics;
}
