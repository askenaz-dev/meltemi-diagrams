import type {
  Element,
  FlowDiagram,
  ListAlign,
  ListLayout,
  Point,
  Relation,
} from "@meltemi/diagrams-model";
import type { ResolvedStyle } from "./styles.js";

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The group padding and title band that set the interior origin of a group. */
export interface FrameTheme {
  readonly groupPadding: number;
  readonly groupHeader: number;
  /** The theme's group title size, which the header's band is drawn for. */
  readonly groupTitleSize?: number;
}

/** The innermost group declaring an element, or null. */
export function parentOf(element: Element): string | null {
  return element.groupPath[element.groupPath.length - 1] ?? null;
}

/** Whether an element is a list: a free group whose block writes `layout column|row`. */
export function isList(element: Pick<Element, "kind" | "list">): boolean {
  return element.kind === "group" && element.list !== null;
}

/** Whether a list places a child of its own: elements and groups; lines and pens keep their points. */
export function listPlaces(child: Pick<Element, "kind">): boolean {
  return child.kind !== "line" && child.kind !== "pen";
}

/**
 * Everything a list holds, at any depth, by id, with the outermost list around it: the box an
 * engine arranges in its place, since no engine arranges what a list holds.
 */
export function listHolders(diagram: FlowDiagram): Map<string, string> {
  const holders = new Map<string, string>();
  for (const element of diagram.elements) {
    const outermost = element.groupPath.find((id) => {
      const group = diagram.elementsById.get(id);
      return group !== undefined && isList(group);
    });
    if (outermost !== undefined) holders.set(element.id, outermost);
  }
  return holders;
}

/** How a list group arranges its children, its defaults applied. */
export interface ListArrangement {
  /** `column` stacks the children from top to bottom, `row` from left to right. */
  readonly layout: ListLayout;
  /** The distance between two children: the group's `spacing`, else half the theme's `groupPadding`. */
  readonly spacing: number;
  /** Where the children sit across the axis: the group's `align`, else `start`. */
  readonly align: ListAlign;
  /**
   * The children the list places, in source order: its elements and groups, not its lines and
   * pens, which keep their written points.
   */
  readonly children: readonly string[];
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
  style: Pick<ResolvedStyle, "icon" | "fontSize">,
  theme: FrameTheme,
): number {
  if (isUntitledGroup(group, style)) return theme.groupPadding;
  // A written title size larger than the theme's grows the band by the title's line, keeping
  // the band's spare room around it (decision 0067).
  if (style.fontSize === undefined || theme.groupTitleSize === undefined) return theme.groupHeader;
  const spare = Math.round(theme.groupHeader - 1.25 * theme.groupTitleSize);
  return Math.max(theme.groupHeader, Math.round(style.fontSize * 1.25) + spare);
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
  /** The written, derived or arranged size of every placed group, a list's children included. */
  readonly groupSizes: Map<string, Size>;
  /**
   * The size of every element and group, placed or not: leaves at their own size or the one a list
   * stretches them to, groups at their written, derived or arranged size.
   */
  readonly sizes: ReadonlyMap<string, Size>;
  /** The leaves a list stretches across its axis (`align stretch`), at their stretched size. */
  readonly stretched: ReadonlyMap<string, Size>;
  /** How every list group arranges its children, by group id. */
  readonly lists: ReadonlyMap<string, ListArrangement>;
  /**
   * The centres in diagram coordinates of a group and of everything it holds when the group's
   * centre is `center`: for a list an engine arranged as one box.
   */
  within(group: string, center: Point): Map<string, Point>;
}

/**
 * Frames of a free diagram (decision 0018): `place` statements of group children are relative to
 * the interior origin of their group. Group sizes are computed from the innermost group outwards,
 * then centres from the outermost group inwards. Children of a group without a place are skipped.
 * `headerOf` gives each group's header (see `groupHeaderOf`), `titleWidth` its minimum width, and
 * `extentOf` what a leaf of a size draws about its centre when it is more than its box.
 *
 * A list group (`layout column|row`) places its children itself, whatever `local` says: in source
 * order along its axis from its interior origin, each where the previous one ends plus `spacing`
 * (half `groupPadding` by default), and across the axis at the start of the interior, centred in
 * it, at its end, or with `stretch` as wide (column) or as tall (row) as the interior when the
 * child has no written size. Leaves are stacked by what they draw (`extentOf`). The list is
 * derived as any group is, and a written size is its least size. Its lines and pens keep their
 * written places.
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
  const padding = theme.groupPadding;
  const sizeOf = new Map<string, Size>(leafSizes);
  // Places relative to the parent's interior: the written ones, and those the lists give.
  const places = new Map<string, Point>(local);
  const childrenOf = new Map<string, Element[]>();
  for (const element of diagram.elements) {
    const parent = parentOf(element);
    if (parent === null) continue;
    const known = childrenOf.get(parent);
    if (known) known.push(element);
    else childrenOf.set(parent, [element]);
  }
  // Groups are their box; leaves may draw beyond it.
  const extentAt = (child: Element, size: Size): Extent | undefined =>
    child.kind !== "group" && extentOf ? extentOf(child.id, size) : undefined;
  const derive = (group: Element): Size =>
    derivedGroupSize(
      (childrenOf.get(group.id) ?? []).flatMap((child) => {
        const place = places.get(child.id);
        const size = sizeOf.get(child.id);
        if (!place || !size) return [];
        const extent = extentAt(child, size);
        return [{ place, size, ...(extent ? { extent } : {}) }];
      }),
      padding,
      headerOf(group),
      titleWidth(group),
    );

  const lists = new Map<string, ListArrangement>();
  // The size of each child of a list before the list stretches it.
  const natural = new Map<string, Size>();
  const stretched = new Map<string, Size>();
  /**
   * Places the children of a list: along its axis one after another; across it at the start, or,
   * once the list's `size` is known, by its `align` within the interior.
   */
  const arrange = (group: Element, list: ListArrangement, size?: Size) => {
    const column = list.layout === "column";
    const cross =
      size === undefined
        ? undefined
        : column
          ? size.width - 2 * padding
          : size.height - headerOf(group) - padding;
    let along = 0;
    for (const id of list.children) {
      const child = diagram.elementsById.get(id)!;
      const own = natural.get(id);
      if (!own) continue;
      const stretch = cross !== undefined && list.align === "stretch" && !written.has(id);
      const drawn: Size = !stretch
        ? own
        : column
          ? { width: cross, height: own.height }
          : { width: own.width, height: cross };
      sizeOf.set(id, drawn);
      if (stretch && child.kind !== "group") stretched.set(id, drawn);
      else stretched.delete(id);
      const extent = extentAt(child, drawn) ?? {
        x: -drawn.width / 2,
        y: -drawn.height / 2,
        width: drawn.width,
        height: drawn.height,
      };
      const [start, length] = column ? [extent.y, extent.height] : [extent.x, extent.width];
      const [side, breadth] = column ? [extent.x, extent.width] : [extent.y, extent.height];
      const offset =
        cross === undefined || list.align === "start" || list.align === "stretch"
          ? 0
          : list.align === "center"
            ? (cross - breadth) / 2
            : cross - breadth;
      const main = along - start;
      const across = offset - side;
      places.set(id, column ? { x: across, y: main } : { x: main, y: across });
      along += length + list.spacing;
    }
  };

  const groups = diagram.elements.filter((e) => e.kind === "group");
  for (const group of [...groups].sort((a, b) => b.groupPath.length - a.groupPath.length)) {
    const explicit = written.get(group.id);
    if (group.list === null) {
      sizeOf.set(group.id, explicit ?? derive(group));
      continue;
    }
    const list: ListArrangement = {
      layout: group.list.layout,
      spacing: group.list.spacing ?? padding / 2,
      align: group.list.align ?? "start",
      children: (childrenOf.get(group.id) ?? []).filter(listPlaces).map((child) => child.id),
    };
    lists.set(group.id, list);
    for (const id of list.children) {
      const size = sizeOf.get(id);
      if (size) natural.set(id, size);
    }
    // The list is derived from its children at the start of the interior, then aligns them in it.
    arrange(group, list);
    const derived = derive(group);
    // A written size is the least size: the list grows with its children.
    const size = explicit
      ? {
          width: Math.max(explicit.width, derived.width),
          height: Math.max(explicit.height, derived.height),
        }
      : derived;
    sizeOf.set(group.id, size);
    arrange(group, list, size);
  }
  // A list that the list holding it stretched aligns its children in its new interior.
  for (const group of [...groups].sort((a, b) => a.groupPath.length - b.groupPath.length)) {
    const list = lists.get(group.id);
    if (list) arrange(group, list, sizeOf.get(group.id)!);
  }
  const groupSizes = new Map<string, Size>();
  for (const group of groups) {
    if (places.has(group.id)) groupSizes.set(group.id, sizeOf.get(group.id)!);
  }

  const outerFirst = [...diagram.elements].sort((a, b) => a.groupPath.length - b.groupPath.length);
  /**
   * Centres from the interior origins known, outermost groups first: from the diagram's origin,
   * or only inside the group `inside` from the origin given for it.
   */
  const centersFrom = (
    origins: Map<string, Point>,
    centers: Map<string, Point>,
    inside?: string,
  ): Map<string, Point> => {
    for (const element of outerFirst) {
      if (inside !== undefined && !element.groupPath.includes(inside)) continue;
      const place = places.get(element.id);
      if (!place) continue;
      const parent = parentOf(element);
      const origin =
        parent === null ? (inside === undefined ? { x: 0, y: 0 } : undefined) : origins.get(parent);
      if (!origin) continue;
      const center = { x: origin.x + place.x, y: origin.y + place.y };
      centers.set(element.id, center);
      if (element.kind === "group") {
        origins.set(
          element.id,
          interiorOrigin(center, sizeOf.get(element.id)!, padding, headerOf(element)),
        );
      }
    }
    return centers;
  };
  return {
    centers: centersFrom(new Map(), new Map()),
    groupSizes,
    sizes: sizeOf,
    stretched,
    lists,
    within: (id, center) => {
      const group = diagram.elementsById.get(id)!;
      const origin = interiorOrigin(center, sizeOf.get(id)!, padding, headerOf(group));
      return centersFrom(new Map([[id, origin]]), new Map([[id, center]]), id);
    },
  };
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
