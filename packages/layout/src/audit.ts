import type { Point } from "@meltemi/diagrams-model";
import type { TextMeasurer } from "./measure.js";
import type { GroupItem, Scene, SceneItem, TextItem } from "./scene.js";

/** A rectangle in scene pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A text of the scene with the box its glyphs cover and the drawing it belongs to. */
export interface PlacedText {
  readonly text: string;
  readonly box: Box;
  /** The id of the element, relation, event or label that draws it; `frame` for the frame. */
  readonly owner: string;
  readonly role: GroupItem["role"];
}

/** A label that is cut, or that overlaps another label, a box or a connector. */
export type LabelProblem =
  | {
      readonly kind: "cut";
      readonly text: PlacedText;
      /** What cuts it: its own shape, the background behind it, or the edge of the picture. */
      readonly by: "shape" | "background" | "picture";
      /** How far the text goes beyond it, in pixels. */
      readonly overflow: number;
    }
  | {
      readonly kind: "overlap";
      readonly text: PlacedText;
      /** Another label, the box of an element, or a connector. */
      readonly other: {
        readonly kind: "text" | "box" | "connector";
        readonly owner: string;
        readonly text?: string;
      };
    };

export interface AuditOptions {
  /**
   * Elements drawn on the sheet by hand as annotations (tags, notes, free texts and icons): their
   * labels may lie on boxes, as a badge on a corner does, but not on other labels.
   */
  readonly annotations?: ReadonlySet<string>;
  /** Free diagrams: the layer of each element; labels may lie on boxes of other layers. */
  readonly layers?: ReadonlyMap<string, string>;
}

/** Overlaps smaller than this, in pixels, are rounding, not collisions. */
const TOLERANCE = 0.75;

const intersects = (a: Box, b: Box) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOLERANCE &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOLERANCE;

const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x - TOLERANCE &&
  inner.y >= outer.y - TOLERANCE &&
  inner.x + inner.width <= outer.x + outer.width + TOLERANCE &&
  inner.y + inner.height <= outer.y + outer.height + TOLERANCE;

/** The box around every point of some lines. */
function extentOf(lines: readonly (readonly Point[])[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const line of lines) {
    for (const p of line) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether two boxes touch, borders included. */
const intersectsLoose = (a: Box, b: Box) =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

/** How far `inner` goes beyond `outer` on its worst side. */
function overflow(outer: Box, inner: Box): number {
  return Math.max(
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.width - (outer.x + outer.width),
    inner.y + inner.height - (outer.y + outer.height),
  );
}

/** Whether a segment crosses the inside of a box (shrunk by the tolerance). */
function segmentCrosses(a: Point, b: Point, box: Box): boolean {
  const x0 = box.x + TOLERANCE;
  const y0 = box.y + TOLERANCE;
  const x1 = box.x + box.width - TOLERANCE;
  const y1 = box.y + box.height - TOLERANCE;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang–Barsky clipping: the segment crosses when some part of it lies inside.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

interface Owner {
  readonly id: string;
  readonly role: GroupItem["role"];
  /** Elements and events: the box as drawn. */
  readonly box?: Box;
  /** Shaped elements: the inscribed rectangle of their text. */
  readonly inner?: Box;
  /** Icon shapes: the box of their label, drawn outside their own. */
  readonly label?: Box;
  readonly texts: PlacedText[];
  /** Relations: the lines as drawn (a connector passing under a title is drawn in pieces). */
  readonly lines: (readonly Point[])[];
}

/**
 * Checks the labels of a laid-out scene. Every text must lie inside the picture, inside the
 * element that draws it (the inscribed rectangle of a shape other than a box, `SceneBounds.inner`,
 * or the label an icon shape draws outside its box, `SceneBounds.label`),
 * and inside the background drawn just before it (the pill of a relation's label, the band of a
 * guard). No text may overlap another element's text, the box of an element
 * it does not belong to (containers hold labels; annotations may sit on boxes), or a connector
 * other than its own. A container's own texts may lie over the boxes it holds; two texts that
 * coincide are still reported. Text boxes are measured with the scene's fonts, from the cap
 * height above the baseline to the descenders below it.
 */
export function auditLabels(
  scene: Scene,
  measurer: TextMeasurer,
  options: AuditOptions = {},
): LabelProblem[] {
  const annotations = options.annotations ?? new Set<string>();
  const layers = options.layers ?? new Map<string, string>();
  const sameLayer = (a: string, b: string) =>
    (layers.get(a) ?? "main") === (layers.get(b) ?? "main");
  const owners: Owner[] = [];
  const problems: LabelProblem[] = [];
  const view = scene.viewBox ?? { x: 0, y: 0, width: scene.width, height: scene.height };

  const place = (item: TextItem, owner: Owner, background: Box | undefined) => {
    const stack = item.font === "mono" ? scene.fonts.mono : scene.fonts.body;
    const width = measurer.width(item.text, stack, item.weight, item.size);
    const cap = measurer.capHeight(stack, item.weight);
    const top = item.baseline - (cap + 0.06) * item.size;
    const bottom = item.baseline + 0.22 * item.size;
    const x =
      item.anchor === "start"
        ? item.x
        : item.anchor === "end"
          ? item.x - width
          : item.x - width / 2;
    const text: PlacedText = {
      text: item.text,
      box: { x, y: top, width, height: bottom - top },
      owner: owner.id,
      role: owner.role,
    };
    owner.texts.push(text);
    if (!contains(view, text.box)) {
      problems.push({ kind: "cut", text, by: "picture", overflow: overflow(view, text.box) });
    } else if (background && !contains(background, text.box)) {
      problems.push({
        kind: "cut",
        text,
        by: "background",
        overflow: overflow(background, text.box),
      });
    } else if (owner.box && owner.role === "element") {
      // A shape other than a box holds its text in its inscribed rectangle; an icon shape's label
      // is its own text outside it.
      const area = owner.inner ?? owner.box;
      if (!contains(area, text.box) && !(owner.label && contains(owner.label, text.box))) {
        problems.push({ kind: "cut", text, by: "shape", overflow: overflow(area, text.box) });
      }
    }
  };

  const walk = (items: readonly SceneItem[], owner: Owner | undefined) => {
    let background: Box | undefined;
    for (const item of items) {
      if (item.kind === "group") {
        // The brand mark is drawn in its own units; its text sits beside it.
        if (item.transform) continue;
        const next: Owner = {
          id: item.id,
          role: item.role,
          ...(item.bounds
            ? {
                box: {
                  x: item.bounds.x,
                  y: item.bounds.y,
                  width: item.bounds.width,
                  height: item.bounds.height,
                },
                ...(item.bounds.inner ? { inner: item.bounds.inner } : {}),
                ...(item.bounds.label ? { label: item.bounds.label } : {}),
              }
            : {}),
          texts: [],
          lines: [],
        };
        owners.push(next);
        walk(item.items, next);
        background = undefined;
      } else if (item.kind === "polyline" && owner?.role === "relation") {
        owner.lines.push(item.points);
        background = undefined;
      } else if (item.kind === "rect") {
        // A rectangle drawn right before a text in a label is the background it sits on.
        background = owner?.role === "label" ? item : undefined;
      } else if (item.kind === "text") {
        if (item.text.trim() !== "") {
          const target: Owner = owner ?? { id: "scene", role: "frame", texts: [], lines: [] };
          if (!owner) owners.push(target);
          place(item, target, background);
        }
        background = undefined;
      } else {
        background = undefined;
      }
    }
  };
  walk(scene.items, undefined);

  const boxes = owners.filter((o) => o.box && o.role === "element");
  // A container holds other boxes; labels may lie inside it.
  const containers = new Set(
    boxes.filter((o) => boxes.some((p) => p !== o && contains(o.box!, p.box!))).map((o) => o.id),
  );

  // Labels against labels.
  const texts = owners.flatMap((o) => o.texts).sort((a, b) => a.box.x - b.box.x);
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i]!;
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j]!;
      if (b.box.x > a.box.x + a.box.width) break;
      if (a.owner === b.owner) continue;
      if (intersects(a.box, b.box)) {
        problems.push({
          kind: "overlap",
          text: b,
          other: { kind: "text", owner: a.owner, text: a.text },
        });
      }
    }
  }
  // Labels against boxes they do not belong to, sorted by their left edge to stop early.
  const sortedBoxes = [...boxes].sort((a, b) => a.box!.x - b.box!.x);
  const boxOf = new Map(boxes.map((o) => [o.id, o.box!]));
  for (const text of texts) {
    if (annotations.has(text.owner)) continue;
    // A container's own text may lie over the boxes it holds.
    const holder = containers.has(text.owner) ? boxOf.get(text.owner) : undefined;
    for (const owner of sortedBoxes) {
      if (owner.box!.x > text.box.x + text.box.width) break;
      if (owner.id === text.owner || containers.has(owner.id) || annotations.has(owner.id))
        continue;
      if (!sameLayer(owner.id, text.owner)) continue;
      if (holder && contains(holder, owner.box!)) continue;
      if (intersects(owner.box!, text.box)) {
        problems.push({ kind: "overlap", text, other: { kind: "box", owner: owner.id } });
      }
    }
  }
  // Labels against connectors other than their own (a relation's label group has its id).
  const relations = owners
    .filter((o) => o.role === "relation" && o.lines.length > 0)
    .map((o) => ({ owner: o, extent: extentOf(o.lines) }));
  for (const text of texts) {
    for (const { owner: relation, extent } of relations) {
      if (text.owner === relation.id || !intersectsLoose(extent, text.box)) continue;
      const crossed = relation.lines.some((points) => {
        for (let k = 1; k < points.length; k++) {
          if (segmentCrosses(points[k - 1]!, points[k]!, text.box)) return true;
        }
        return false;
      });
      if (crossed) {
        problems.push({ kind: "overlap", text, other: { kind: "connector", owner: relation.id } });
      }
    }
  }
  return problems;
}
