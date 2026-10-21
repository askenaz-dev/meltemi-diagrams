import type { EditOperation } from "@meltemi/diagrams-edit";
import {
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
    return (
      inner !== undefined &&
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
    if (!element || !box) continue;
    const landed = { ...box, x: box.x + delta.x, y: box.y + delta.y };
    // The smallest box that holds it, which is the one it is seen on.
    let outer: { id: string; area: number } | undefined;
    for (const other of diagram.elements) {
      if (other.kind === "group" || moves(other) || layerOf(other) !== layerOf(element)) continue;
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
    if (!emptied && !(placed && diagram.type === "free")) continue;
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
 * Centres of elements and sizes of groups from laid-out boxes. In free diagrams the centres of
 * group children are written relative to their group's interior (`origins`), and groups get a
 * place and a size.
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
    if (!box) continue;
    const origin = free ? origins?.get(element.id) : undefined;
    positions.set(element.id, {
      x: box.x + box.width / 2 - (origin?.x ?? 0),
      y: box.y + box.height / 2 - (origin?.y ?? 0),
    });
    if (element.kind === "group") sizes.set(element.id, { width: box.width, height: box.height });
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
      noteSize: scale.note,
      tagSize: scale.tag,
    },
  };
}
