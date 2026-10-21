import type { Element, FlowDiagram, Point, Relation } from "@meltemi/diagrams-model";
import type { ResolvedStyle } from "./styles.js";

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The group padding and title band that set the interior origin of a group. */
export interface FrameTheme {
  readonly groupPadding: number;
  readonly groupHeader: number;
}

/** The innermost group declaring an element, or null. */
export function parentOf(element: Element): string | null {
  return element.groupPath[element.groupPath.length - 1] ?? null;
}

/**
 * Whether a group is untitled: its label is `""`, it has no `description` and its resolved style
 * has no `icon`. An untitled group is a plain container: it draws no title band.
 */
export function isUntitledGroup(
  group: Pick<Element, "label" | "description">,
  style: Pick<ResolvedStyle, "icon">,
): boolean {
  return group.label === "" && !group.description && !style.icon;
}

/**
 * The header of a group, the room above its interior: the theme's `groupHeader` for a titled
 * group, `groupPadding` for an untitled one. Hosts that compute interior origins use the same rule.
 */
export function groupHeaderOf(
  group: Pick<Element, "label" | "description">,
  style: Pick<ResolvedStyle, "icon">,
  theme: FrameTheme,
): number {
  return isUntitledGroup(group, style) ? theme.groupPadding : theme.groupHeader;
}

/** A rectangle relative to an element's centre. */
interface Extent {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The size of a free group without a `size` statement: its padding, the farthest right and bottom
 * edges of its placed children measured from the interior origin, and its padding again, below its
 * header. The group is never narrower than its title. A child's `extent`, relative to its centre,
 * is what it draws beyond its box too (the label of an icon shape); its box by default.
 */
export function derivedGroupSize(
  children: readonly { place: Point; size: Size; extent?: Extent }[],
  padding: number,
  header: number,
  titleWidth: number,
): Size {
  let right = 0;
  let bottom = 0;
  for (const { place, size, extent } of children) {
    right = Math.max(right, place.x + (extent ? extent.x + extent.width : size.width / 2));
    bottom = Math.max(bottom, place.y + (extent ? extent.y + extent.height : size.height / 2));
  }
  return {
    width: Math.max(padding + right + padding, titleWidth),
    height: header + bottom + padding,
  };
}

/** The interior origin of a group: its top-left corner inside the padding and the header. */
export function interiorOrigin(center: Point, size: Size, padding: number, header: number): Point {
  return {
    x: center.x - size.width / 2 + padding,
    y: center.y - size.height / 2 + header,
  };
}

export interface FreeFrames {
  /** Centres in diagram coordinates of every element whose place and enclosing groups are known. */
  readonly centers: Map<string, Point>;
  /** The written or derived size of every placed group. */
  readonly groupSizes: Map<string, Size>;
}

/**
 * Frames of a free diagram (decision 0018): `place` statements of group children are relative to
 * the interior origin of their group. Group sizes are computed from the innermost group outwards,
 * then centres from the outermost group inwards. Children of a group without a place are skipped.
 * `headerOf` gives each group's header (see `groupHeaderOf`), `titleWidth` its minimum width, and
 * `extentOf` what a leaf of a size draws about its centre when it is more than its box.
 */
export function freeFrames(
  diagram: FlowDiagram,
  local: ReadonlyMap<string, Point>,
  written: ReadonlyMap<string, Size>,
  leafSizes: ReadonlyMap<string, Size>,
  theme: Pick<FrameTheme, "groupPadding">,
  titleWidth: (group: Element) => number,
  headerOf: (group: Element) => number,
  extentOf?: (id: string, size: Size) => Extent | undefined,
): FreeFrames {
  const sizeOf = new Map<string, Size>(leafSizes);
  const groupSizes = new Map<string, Size>();
  const groups = diagram.elements.filter((e) => e.kind === "group");
  for (const group of [...groups].sort((a, b) => b.groupPath.length - a.groupPath.length)) {
    const explicit = written.get(group.id);
    const size =
      explicit ??
      derivedGroupSize(
        diagram.elements.flatMap((child) => {
          if (parentOf(child) !== group.id) return [];
          const place = local.get(child.id);
          const childSize = sizeOf.get(child.id);
          if (!place || !childSize) return [];
          // Groups are their box; leaves may draw beyond it.
          const extent =
            child.kind !== "group" && extentOf ? extentOf(child.id, childSize) : undefined;
          return [{ place, size: childSize, ...(extent ? { extent } : {}) }];
        }),
        theme.groupPadding,
        headerOf(group),
        titleWidth(group),
      );
    sizeOf.set(group.id, size);
    if (local.has(group.id)) groupSizes.set(group.id, size);
  }

  const centers = new Map<string, Point>();
  const origins = new Map<string, Point>();
  const outerFirst = [...diagram.elements].sort((a, b) => a.groupPath.length - b.groupPath.length);
  for (const element of outerFirst) {
    const place = local.get(element.id);
    if (!place) continue;
    const parent = parentOf(element);
    const origin = parent === null ? { x: 0, y: 0 } : origins.get(parent);
    if (!origin) continue;
    const center = { x: origin.x + place.x, y: origin.y + place.y };
    centers.set(element.id, center);
    if (element.kind === "group") {
      origins.set(
        element.id,
        interiorOrigin(center, sizeOf.get(element.id)!, theme.groupPadding, headerOf(element)),
      );
    }
  }
  return { centers, groupSizes };
}

/** One drawable of a free diagram in paint order. */
export type Paintable =
  | { readonly kind: "group"; readonly element: Element }
  | { readonly kind: "element"; readonly element: Element }
  | { readonly kind: "relation"; readonly relation: Relation };

/**
 * Paint order of a free diagram: layer by layer from back to front; within a layer, groups (outer
 * before inner), then the other objects in source order, then relations.
 */
export function paintOrder(diagram: FlowDiagram): Paintable[] {
  const layers = diagram.properties.layers;
  const main = layers.indexOf("main");
  const index = (layer: string | null) => {
    const i = layer === null ? main : layers.indexOf(layer);
    return i < 0 ? main : i;
  };
  const order: Paintable[] = [];
  for (let layer = 0; layer < layers.length; layer++) {
    const elements = diagram.elements.filter((e) => index(e.layer) === layer);
    const groups = elements
      .filter((e) => e.kind === "group")
      .sort((a, b) => a.groupPath.length - b.groupPath.length);
    for (const element of groups) order.push({ kind: "group", element });
    for (const element of elements) {
      if (element.kind !== "group") order.push({ kind: "element", element });
    }
    for (const relation of diagram.relations) {
      if (index(relation.layer) === layer) order.push({ kind: "relation", relation });
    }
  }
  return order;
}
