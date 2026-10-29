import type { EditOperation } from "@meltemi/diagrams-edit";
import {
  DEFAULT_PEN_WIDTH,
  groupHeaderOf,
  layoutDiagram,
  stacked,
  StyleResolver,
  typeScale,
  type Box,
  type LayoutResult,
} from "@meltemi/diagrams-layout";
import { MAIN_LAYER, type Element, type FlowDiagram, type Point } from "@meltemi/diagrams-model";
import { diagramView, type DiagramView, type DocumentAnalysis } from "./analysis.js";

/**
 * The interior origin of a group of a free diagram, which its children's places are measured
 * from: the layout's origin of its children, or for an empty group its padding and its own header
 * (the padding alone when it is untitled). (0, 0) for the top level and for flow diagrams, whose
 * places are in diagram coordinates.
 */
export function interiorOf(view: DiagramView, group: string | null): Point {
  const layout = view.layout;
  if (group === null || view.diagram.type !== "free" || !layout) return { x: 0, y: 0 };
  for (const element of view.diagram.elements) {
    if (element.groupPath[element.groupPath.length - 1] !== group) continue;
    const origin = layout.origins?.get(element.id);
    if (origin) return origin;
  }
  const element = view.diagram.elementsById.get(group);
  const box = layout.boxes?.get(group);
  const theme = layout.theme;
  if (!element || !box || !theme) return { x: 0, y: 0 };
  const style = new StyleResolver(theme, view.diagram).element(element);
  return { x: box.x + theme.groupPadding, y: box.y + groupHeaderOf(element, style, theme) };
}

const parentId = (e: Element) => e.groupPath[e.groupPath.length - 1] ?? null;
const layerOf = (e: Element) => e.layer ?? MAIN_LAYER;

/** Whether an element keeps its points in its statement: a free line or a pen stroke. */
export function keepsPoints(element: Element): boolean {
  return element.kind === "line" || element.kind === "pen";
}

/**
 * The list group (`layout column` or `layout row`) that places an element of a free diagram: its
 * group when that group is a list, which puts its children one after another and takes no
 * `place` for them. Undefined for any other element, and for lines and pens, which keep their
 * points in a list as in any group.
 */
export function placingList(diagram: FlowDiagram, element: Element): string | undefined {
  if (diagram.type !== "free" || keepsPoints(element)) return undefined;
  const parent = parentId(element);
  return parent !== null && diagram.elementsById.get(parent)?.list ? parent : undefined;
}

/**
 * Whether alignment and distribution move an element: not a group, a line or a pen, which have no
 * edges to line up, nor a child of a list, which its list places.
 */
export function alignable(diagram: FlowDiagram, element: Element): boolean {
  return (
    element.kind !== "group" && !keepsPoints(element) && placingList(diagram, element) === undefined
  );
}

/**
 * The `convertToContainer` operation for a flow node or a free box, with the elements drawn
 * stacked on it as its children: siblings declared after it on its layer whose box lies inside
 * its own (the composition checks' stack rule). Free children are placed in the interior the
 * group will have; the group keeps the size it is drawn with. Undefined when it is not drawn.
 */
export function containerOperation(
  view: DiagramView,
  id: string,
):
  | {
      readonly operation: EditOperation & { kind: "convertToContainer" };
      readonly children: readonly string[];
    }
  | undefined {
  const diagram = view.diagram;
  const layout = view.layout;
  const element = diagram.elementsById.get(id);
  const box = layout?.boxes?.get(id);
  const theme = layout?.theme;
  if (!element || !box || !theme || !layout?.boxes) return undefined;
  const boxes = layout.boxes;
  const after = diagram.elements.slice(diagram.elements.indexOf(element) + 1);
  const children = after.filter((e) => {
    const inner = boxes.get(e.id);
    // Lines and pens keep their points where they are: they are drawings over the box.
    return (
      inner !== undefined &&
      !keepsPoints(e) &&
      parentId(e) === parentId(element) &&
      layerOf(e) === layerOf(element) &&
      stacked(box, inner)
    );
  });
  const free = diagram.type === "free";
  // The interior of the group the box becomes: below its title band when it keeps a title.
  const style = new StyleResolver(theme, diagram).element(element);
  const origin = { x: box.x + theme.groupPadding, y: box.y + groupHeaderOf(element, style, theme) };
  return {
    operation: {
      kind: "convertToContainer",
      diagram: view.id,
      element: id,
      children: children.map((child) => {
        const inner = boxes.get(child.id)!;
        return free
          ? {
              id: child.id,
              at: {
                x: Math.round(inner.x + inner.width / 2 - origin.x),
                y: Math.round(inner.y + inner.height / 2 - origin.y),
              },
            }
          : { id: child.id };
      }),
      size: { width: Math.round(box.width), height: Math.round(box.height) },
    },
    children: children.map((c) => c.id),
  };
}

/**
 * The first moved element that lands stacked on a node or box of its layer, which is no
 * container: the hint that converting the box would carry the element with it.
 */
export function stackedAfterMove(
  view: DiagramView,
  ids: readonly string[],
  delta: Point,
): { readonly inner: string; readonly outer: string } | undefined {
  const diagram = view.diagram;
  const boxes = view.layout?.boxes;
  if (!boxes || (diagram.type !== "flow" && diagram.type !== "free")) return undefined;
  const moved = new Set(ids);
  const moves = (e: Element) => moved.has(e.id) || e.groupPath.some((g) => moved.has(g));
  for (const id of ids) {
    const element = diagram.elementsById.get(id);
    const box = boxes.get(id);
    // A stroke or a line over a box is a drawing on it, which no container carries.
    if (!element || !box || keepsPoints(element)) continue;
    const landed = { ...box, x: box.x + delta.x, y: box.y + delta.y };
    // The smallest box that holds it, which is the one it is seen on.
    let outer: { id: string; area: number } | undefined;
    for (const other of diagram.elements) {
      if (other.kind === "group" || keepsPoints(other) || moves(other)) continue;
      if (layerOf(other) !== layerOf(element)) continue;
      const holder = boxes.get(other.id);
      if (!holder || !stacked(holder, landed)) continue;
      const area = holder.width * holder.height;
      if (!outer || area < outer.area) outer = { id: other.id, area };
    }
    if (outer) return { inner: id, outer: outer.id };
  }
  return undefined;
}

/**
 * The operations that keep the groups an element leaves or enters drawn where they are, for a
 * move of `leaving` into `target` (null: the top level), in one edit with it:
 *
 * - a group left with no children that lacks `place` or `size` gets the place and the size it is
 *   drawn with, as an empty group needs both;
 * - in a free diagram, a placed group without `size` that is left or entered gets the size it is
 *   drawn with, so that its interior, where its children are placed, does not move: the element
 *   lands where it was dropped and the other children stay.
 */
export function steadyGroups(
  view: DiagramView,
  leaving: readonly string[],
  target: string | null,
): EditOperation[] {
  const diagram = view.diagram;
  const boxes = view.layout?.boxes;
  if (!boxes || leaving.length === 0) return [];
  const has = (statement: "place" | "size", id: string) =>
    diagram.placement.some((p) => p.statement === statement && p.target === id);
  const parentOf = (id: string) => {
    const path = diagram.elementsById.get(id)?.groupPath ?? [];
    return path[path.length - 1] ?? null;
  };
  const sources = new Set(
    leaving.map(parentOf).filter((g): g is string => g !== null && g !== target),
  );
  const ops: EditOperation[] = [];
  for (const group of target === null ? sources : new Set([...sources, target])) {
    const box = boxes.get(group);
    const placed = has("place", group);
    if (!box || (placed && has("size", group))) continue;
    const emptied =
      sources.has(group) &&
      diagram.elements.every(
        (e) => e.groupPath[e.groupPath.length - 1] !== group || leaving.includes(e.id),
      );
    // A list grows and shrinks with its children, whose places it sets: it keeps no size of the
    // moment unless it is left empty.
    const list = Boolean(diagram.elementsById.get(group)?.list);
    if (!emptied && (list || !(placed && diagram.type === "free"))) continue;
    if (!placed) {
      // Relative to the interior of its own group in free diagrams.
      const origin = diagram.type === "free" ? view.layout?.origins?.get(group) : undefined;
      ops.push({
        kind: "setPosition",
        diagram: view.id,
        element: group,
        x: Math.round(box.x + box.width / 2 - (origin?.x ?? 0)),
        y: Math.round(box.y + box.height / 2 - (origin?.y ?? 0)),
      });
    }
    ops.push({
      kind: "setSize",
      diagram: view.id,
      element: group,
      width: Math.round(box.width),
      height: Math.round(box.height),
    });
  }
  return ops;
}

/**
 * Whether a box holds a stroke through `points` of `width`: the box of its points grown by half
 * its width on every side, as the layout bounds a pen.
 */
function holdsStroke(box: Box, points: readonly Point[], width: number): boolean {
  const half = width / 2;
  const slack = 1e-6;
  return points.every(
    (p) =>
      p.x - half >= box.x - slack &&
      p.x + half <= box.x + box.width + slack &&
      p.y - half >= box.y - slack &&
      p.y + half <= box.y + box.height + slack,
  );
}

/**
 * The group a stroke through `points` (diagram coordinates) of `width` belongs to, from `start`
 * (the innermost group under its first point, or the group it is in) outwards: the first that is
 * not a list and whose drawn box holds the whole stroke, so that a stroke never grows a list nor
 * moves the children it places; the top level (null) when none does. `start` as it is when it is
 * no group of a drawn free diagram, which the edit judges.
 */
export function strokeParent(
  view: DiagramView,
  start: string | null,
  points: readonly Point[],
  width: number,
): string | null {
  const diagram = view.diagram;
  const group = start === null ? undefined : diagram.elementsById.get(start);
  const boxes = view.layout?.boxes;
  if (start === null || group?.kind !== "group" || diagram.type !== "free" || !boxes) return start;
  for (const id of [start, ...[...group.groupPath].reverse()]) {
    const candidate = diagram.elementsById.get(id);
    const box = boxes.get(id);
    if (candidate && candidate.list === null && box && holdsStroke(box, points, width)) return id;
  }
  return null;
}

/**
 * The `setSize` that keeps a plain group of a free diagram drawn as it is while a stroke goes into
 * it or moves in it: a group without `size` derives its size from what it holds and grows about
 * its centre, which moves its interior and every child placed in it. The size is written as drawn,
 * unrounded, so that the interior stays where it is to the hundredth. Nothing for the top level,
 * a list (which grows with its children) or a group with a size.
 */
export function steadySize(view: DiagramView, group: string | null): EditOperation[] {
  const diagram = view.diagram;
  if (group === null || diagram.type !== "free") return [];
  const element = diagram.elementsById.get(group);
  const box = view.layout?.boxes?.get(group);
  if (element?.kind !== "group" || element.list !== null || !box) return [];
  if (diagram.placement.some((p) => p.statement === "size" && p.target === group)) return [];
  return [
    { kind: "setSize", diagram: view.id, element: group, width: box.width, height: box.height },
  ];
}

/**
 * The operations that draw the pen `element` through `points`, in diagram coordinates, as a drag
 * or a scale of its stroke leaves it: its points in its group's interior. A pen in a list, which
 * would grow the list and move the children it places, goes out first to the nearest group around
 * the list that is not a list and holds the stroke (`strokeParent`), or to the top level, so that
 * it lands where it is dropped. `parent` is the group it ends in, which the caller keeps steady
 * (`steadySize`).
 */
export function penOperations(
  view: DiagramView,
  element: Element,
  points: readonly Point[],
): { readonly operations: EditOperation[]; readonly parent: string | null } {
  const diagram = view.diagram;
  const current = parentId(element);
  const width = view.layout?.pens?.get(element.id)?.width ?? DEFAULT_PEN_WIDTH;
  const parent =
    current !== null && diagram.elementsById.get(current)?.list
      ? strokeParent(view, current, points, width)
      : current;
  const operations: EditOperation[] = [];
  if (parent !== current) {
    operations.push({ kind: "moveElement", diagram: view.id, element: element.id, parent });
  }
  const origin = interiorOf(view, parent);
  operations.push({
    kind: "setPenPoints",
    diagram: view.id,
    element: element.id,
    points: points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
  });
  return { operations, parent };
}

/**
 * The operations that keep what the list group `list` holds drawn where it is once the list no
 * longer places it, in the interior of `into`: the list itself when its layout goes, its parent
 * when it is ungrouped (null: the top level). Each child the list places gets its `place` at its
 * drawn centre, and the size it is drawn with when the list stretches it; when the list stays a
 * group, a written size, which was its least size, becomes the size it is drawn with. Lines and
 * pens that leave the list get their drawn points in the new interior. Into another list, which
 * places them in order, the children get no place; nor in an `auto` diagram, whose engine places
 * them, and which a place would make `assisted`.
 */
export function unlistedOperations(
  view: DiagramView,
  list: string,
  into: string | null,
): EditOperation[] {
  const diagram = view.diagram;
  const layout = view.layout;
  const geometry = layout?.lists?.get(list);
  const boxes = layout?.boxes;
  if (diagram.type !== "free" || !geometry || !boxes) return [];
  const d = view.id;
  const sized = (id: string) =>
    diagram.placement.some((p) => p.statement === "size" && p.target === id);
  const size = (id: string, box: Box): EditOperation => ({
    kind: "setSize",
    diagram: d,
    element: id,
    width: Math.round(box.width),
    height: Math.round(box.height),
  });
  const origin = into === list ? geometry.origin : interiorOf(view, into);
  const ops: EditOperation[] = [];
  const intoList = into !== null && into !== list && Boolean(diagram.elementsById.get(into)?.list);
  if (!intoList) {
    for (const id of geometry.children) {
      const box = boxes.get(id);
      if (!box) continue;
      if (view.mode !== "auto") {
        ops.push({
          kind: "setPosition",
          diagram: d,
          element: id,
          x: Math.round(box.x + box.width / 2 - origin.x),
          y: Math.round(box.y + box.height / 2 - origin.y),
        });
      }
      if (geometry.align === "stretch" && !sized(id)) ops.push(size(id, box));
    }
  }
  if (into === list) {
    const box = boxes.get(list);
    if (box && sized(list)) ops.push(size(list, box));
    return ops;
  }
  for (const element of diagram.elements) {
    if (parentId(element) !== list) continue;
    if (element.kind === "pen") {
      const stroke = layout.pens?.get(element.id);
      if (!stroke) continue;
      ops.push({
        kind: "setPenPoints",
        diagram: d,
        element: element.id,
        points: stroke.points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y })),
      });
    } else if (element.kind === "line" && element.line) {
      const at = layout.origins?.get(element.id) ?? { x: 0, y: 0 };
      const moved = (p: Point) => ({
        x: Math.round(p.x + at.x - origin.x),
        y: Math.round(p.y + at.y - origin.y),
      });
      ops.push({
        kind: "setLinePoints",
        diagram: d,
        element: element.id,
        from: moved(element.line.from),
        to: moved(element.line.to),
        via: element.line.via.map(moved),
      });
    }
  }
  return ops;
}

/**
 * Centres of elements and sizes of groups from laid-out boxes. In free diagrams the centres of
 * group children are written relative to their group's interior (`origins`), and groups get a
 * place and a size; lines and pens keep their points, the children of a list get no centre (the
 * list places them) and a list no size (it grows with its children).
 */
function fromBoxes(
  diagram: FlowDiagram,
  boxes: ReadonlyMap<string, Box>,
  origins: ReadonlyMap<string, Point> | undefined,
): {
  positions: Map<string, Point>;
  sizes: Map<string, { width: number; height: number }>;
  writeGroups?: true;
} {
  const positions = new Map<string, Point>();
  const sizes = new Map<string, { width: number; height: number }>();
  const free = diagram.type === "free";
  for (const element of diagram.elements) {
    const box = boxes.get(element.id);
    if (!box || (free && keepsPoints(element))) continue;
    if (placingList(diagram, element) !== undefined) continue;
    const origin = free ? origins?.get(element.id) : undefined;
    positions.set(element.id, {
      x: box.x + box.width / 2 - (origin?.x ?? 0),
      y: box.y + box.height / 2 - (origin?.y ?? 0),
    });
    if (element.kind === "group" && !element.list) {
      sizes.set(element.id, { width: box.width, height: box.height });
    }
  }
  return free ? { positions, sizes, writeGroups: true } : { positions, sizes };
}

/**
 * The `arrange` operation that writes what ELK draws: the unplaced elements around the placed
 * ones (`unplaced`, laid out as `assisted`), or every element anew (`all`, laid out as `auto`),
 * with the bends of the drawn connectors. Undefined when the diagram cannot be arranged.
 */
export function arrangeOperation(
  analysis: DocumentAnalysis,
  diagramId: string,
  scope: "unplaced" | "all",
): EditOperation | undefined {
  return arrangeAttempt(analysis, diagramId, scope).operation;
}

/**
 * The `arrange` operation of `arrangeOperation`, or the first problem that keeps the diagram from
 * being arranged: an error of the text or of the layout, as written in its diagnostic.
 */
export function arrangeAttempt(
  analysis: DocumentAnalysis,
  diagramId: string,
  scope: "unplaced" | "all",
): { readonly operation?: EditOperation; readonly problem?: string } {
  const view = diagramView(analysis, diagramId);
  if (!view || view.diagram.type === "sequence") return {};
  if (view.diagram.hasErrors) {
    // The first error inside the diagram, else the first of the file.
    const range = view.diagram.range;
    const errors = analysis.compilation.diagnostics.filter((d) => d.severity === "error");
    const error =
      errors.find(
        (d) => d.range.start.offset >= range.start.offset && d.range.end.offset <= range.end.offset,
      ) ?? errors[0];
    return error ? { problem: error.message } : {};
  }
  const result: LayoutResult = layoutDiagram(analysis.compilation, view.diagram, {
    ...analysis.layoutOptions,
    layout: scope === "all" ? "auto" : "assisted",
  });
  if (!result.scene || !result.boxes) {
    const error = result.diagnostics.find((d) => d.severity === "error");
    return error ? { problem: error.message } : {};
  }
  const routes =
    scope === "all" && result.connectors
      ? new Map([...result.connectors].map(([key, c]) => [key, c.points]))
      : undefined;
  return {
    operation: {
      kind: "arrange",
      diagram: diagramId,
      ...fromBoxes(view.diagram, result.boxes, result.origins),
      ...(routes ? { routes } : {}),
      scope,
    },
  };
}

/**
 * The `arrange` operation that writes the positions drawn now, so that an `auto` diagram
 * becomes `assisted` without any box moving: the first step of a canvas gesture in `auto`.
 */
export function materializeOperation(view: DiagramView): EditOperation | undefined {
  if (view.mode !== "auto" || !view.layout?.boxes || view.diagram.type === "sequence") {
    return undefined;
  }
  return {
    kind: "arrange",
    diagram: view.id,
    ...fromBoxes(view.diagram, view.layout.boxes, view.layout.origins),
    scope: "all",
  };
}

/** A top-level id not used in the file: `base`, then `base_2`, `base_3`… */
export function freeDiagramId(analysis: DocumentAnalysis, base: string): string {
  const document = analysis.compilation.document;
  const used = new Set<string>([
    ...document.diagrams.map((x) => x.id),
    ...document.themes.map((t) => t.id),
    ...document.unsupported.flatMap((u) => (u.id === null ? [] : [u.id])),
    ...document.imports.flatMap((i) => i.bindings.map((b) => b.name)),
  ]);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/**
 * The `convertToFree` operation that copies a flow diagram, as drawn now, into a new free diagram
 * named `id` (`<diagram>_free` by default), or undefined when the diagram is not drawn.
 */
export function convertOperation(
  analysis: DocumentAnalysis,
  diagramId: string,
  id?: string,
): (EditOperation & { kind: "convertToFree"; id: string }) | undefined {
  const view = diagramView(analysis, diagramId);
  const layout = view?.layout;
  if (!view || view.diagram.type !== "flow" || !layout?.boxes || !layout.theme) return undefined;
  const scale = typeScale(layout.theme);
  return {
    kind: "convertToFree",
    diagram: diagramId,
    id: id ?? freeDiagramId(analysis, `${diagramId}_free`),
    boxes: layout.boxes,
    metrics: {
      groupPadding: layout.theme.groupPadding,
      groupHeader: layout.theme.groupHeader,
      tagSize: scale.tag,
    },
  };
}
