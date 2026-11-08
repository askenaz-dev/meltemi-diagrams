import { type CstNode, type TextEdit } from "@meltemi/diagrams-language";
import {
  type Compilation,
  type Element,
  type FlowDiagram,
  type PlaceEntry,
  type RouteEndpoint,
  type RouteEntry,
} from "@meltemi/diagrams-model";
import { reject, type EditContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { routeParts } from "./routes.js";

/** What `clearPlacement` removes from a diagram: the places and the routes it touches. */
export interface ClearedPlacement {
  /** `place` statements of arranged elements and groups. */
  readonly places: readonly PlaceEntry[];
  /** Routes with waypoints: their `via` goes, and the whole route when nothing else is written. */
  readonly routes: readonly RouteEntry[];
}

/**
 * What `layout auto` ignores in a diagram, as the layout reports it with
 * `layout.placement-ignored`: the places of arranged elements and groups and the waypoints of
 * routes. A band (a top-level group with a place, a size and nothing inside) stays where it is
 * written in `auto`, and what a list holds is placed by the list, so their places are kept.
 */
export function placementToClear(diagram: FlowDiagram): ClearedPlacement {
  const childless = (group: Element) =>
    !diagram.elements.some((child) => child.groupPath.includes(group.id));
  const placed = new Set(
    diagram.placement.filter((e) => e.statement === "place").map((e) => e.target),
  );
  const sized = new Set(
    diagram.placement.filter((e) => e.statement === "size").map((e) => e.target),
  );
  const isList = (id: string) => (diagram.elementsById.get(id)?.list ?? null) !== null;
  const kept = (element: Element | undefined) =>
    element !== undefined &&
    ((element.kind === "group" &&
      element.groupPath.length === 0 &&
      placed.has(element.id) &&
      sized.has(element.id) &&
      childless(element)) ||
      element.groupPath.some(isList));
  const places = diagram.placement.filter(
    (e): e is PlaceEntry => e.statement === "place" && !kept(diagram.elementsById.get(e.target)),
  );
  const routes = diagram.placement.filter(
    (e): e is RouteEntry => e.statement === "route" && e.via.length > 0,
  );
  return { places, routes };
}

/** What `clearPlacement` would remove from a diagram of a compilation, counted. */
export function placementCleared(
  compilation: Compilation,
  diagram: string,
): { readonly places: number; readonly routes: number } {
  const found = compilation.document.diagrams.find((d) => d.id === diagram);
  if (!found) return { places: 0, routes: 0 };
  const cleared = placementToClear(found);
  return { places: cleared.places.length, routes: cleared.routes.length };
}

/** An end the route pins: a named port, or a compass side with or without its point. */
const pinned = (end: RouteEndpoint) => end.explicitPort && end.port !== "auto";

/**
 * Removes what `layout auto` ignores (`placementToClear`): the places, and the `via` list of every
 * route, removing a route that pins neither end; a `placement` block left without statements and
 * without comments goes too.
 */
export function clearPlacement(ctx: EditContext, _op: OperationOf<"clearPlacement">): TextEdit[] {
  const { places, routes } = placementToClear(ctx.diagram);
  const removed = new Set<CstNode>(places.map((p) => p.node));
  const edits: TextEdit[] = [];
  for (const route of routes) {
    if (!pinned(route.from) && !pinned(route.to)) {
      removed.add(route.node);
      continue;
    }
    const parts = routeParts(route.node);
    if (!parts.viaList || !parts.toRef) {
      reject("edit.unsafe-target", reasons().relations.routeUnreadable);
    }
    // ` via [...]` goes, from the end of the `to` endpoint (or its point).
    const after = (parts.toAt ?? parts.toRef).end;
    edits.push({ start: after, end: parts.viaList.end, newText: "" });
  }
  if (removed.size === 0) return edits;
  // A block that loses every statement goes with them, unless a comment is written in it.
  for (const owner of ctx.diagram.placementBlocks) {
    const block = owner.block;
    if (!block || block.statements.length === 0) continue;
    if (!block.statements.every((s) => removed.has(s))) continue;
    if (/\/\/|\/\*/.test(ctx.text.slice(block.open.end, block.close.start))) continue;
    removed.add(owner);
  }
  return [...edits, ...deleteStatements(ctx.text, ctx.compilation.parse.root, [...removed])];
}
