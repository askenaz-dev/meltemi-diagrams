import {
  type CstNode,
  type KeywordStatement,
  type RelationStatement,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import {
  arrowToken,
  relationNameAnchor,
  type Relation,
  type RouteEntry,
} from "@meltemi/diagrams-model";
import { reject, requireElement, requireNamedRelation, type EditContext } from "./context.js";
import { freeId, requirePortOf } from "./create.js";
import { deleteStatements } from "./delete.js";
import { endpointText, requireEndPosition, routeParts } from "./routes.js";
import { insertPlacements, removeListItems, requireNewId, type OperationOf } from "./plan.js";
import { messages, reasons } from "./messages/index.js";
import { eventDependents, eventIdsOf, nestedInCalls } from "./sequence.js";
import { renameInStories, storyDependents } from "./stories.js";

/** A relation by id or by key (`<from>-><to>#<n>`). */
export function requireRelation(ctx: EditContext, name: string): Relation {
  const relation = ctx.diagram.relationsByKey.get(name);
  if (!relation) {
    reject("edit.unsafe-target", reasons().relations.missing(name, ctx.diagram.id));
  }
  return relation;
}

export function renameRelation(ctx: EditContext, op: OperationOf<"renameRelation">): TextEdit[] {
  const relation = requireNamedRelation(ctx, op.relation);
  if (op.newId === relation.id) return [];
  requireNewId(ctx, op.newId);
  const tokens = new Map<number, Token>();
  for (const reference of ctx.diagram.references) {
    if (reference.targetKind === "relation" && reference.target === relation.id) {
      tokens.set(reference.token.start, reference.token);
    }
  }
  return [
    ...[...tokens.values()].map((t) => ({ start: t.start, end: t.end, newText: op.newId })),
    ...renameInStories(ctx.compilation, ctx.diagram.id, relation.id!, op.newId, "relation"),
  ];
}

/**
 * Statements that only target the given relation ids, and edits that drop those ids from the
 * statements shared with other targets.
 */
export function relationDependents(
  ctx: EditContext,
  ids: ReadonlySet<string>,
): { statements: CstNode[]; edits: TextEdit[] } {
  const statements: CstNode[] = [];
  for (const entry of ctx.diagram.placement) {
    if (
      (entry.statement === "route" || entry.statement === "label" || entry.statement === "space") &&
      ids.has(entry.target)
    ) {
      statements.push(entry.node);
    }
  }
  const partial = new Map<KeywordStatement, Set<number>>();
  for (const entry of [...ctx.diagram.styles, ...ctx.diagram.animations]) {
    if (entry.targetKind !== "relation" || !ids.has(entry.target)) continue;
    const index = entry.node.args.findIndex((arg) => arg.start === entry.targetRange.start.offset);
    const set = partial.get(entry.node) ?? new Set<number>();
    if (index >= 0) set.add(index);
    partial.set(entry.node, set);
  }
  const edits: TextEdit[] = [];
  for (const [node, indices] of partial) {
    if (indices.size >= node.args.length) statements.push(node);
    else edits.push(...removeListItems(node.args, indices));
  }
  return { statements, edits };
}

export function removeRelation(ctx: EditContext, op: OperationOf<"removeRelation">): TextEdit[] {
  const relation = requireRelation(ctx, op.relation);
  // A call goes with the events of its block, and everything goes with what names them.
  const nested = nestedInCalls(ctx, new Set([relation.key]));
  const removed = new Set([
    relation,
    ...nested.flatMap((e) =>
      e.kind === "message" ? [ctx.diagram.relationsByKey.get(e.relation)!] : [],
    ),
  ]);
  const relationIds = new Set([...removed].flatMap((r) => (r.id === null ? [] : [r.id])));
  const eventIds = eventIdsOf(nested);
  const relations = relationDependents(ctx, relationIds);
  const events = eventDependents(ctx, eventIds);
  const dependents = {
    statements: [...relations.statements, ...events.statements],
    edits: [...relations.edits, ...events.edits],
  };
  // An implicit endpoint mentioned by no other relation would disappear: keep it declared.
  const keep: string[] = [];
  for (const end of new Set([...removed].flatMap((r) => [r.from, r.to]))) {
    const element = ctx.diagram.elementsById.get(end);
    if (!element?.implicit) continue;
    const mentions = ctx.diagram.relations.filter((r) => r.from === end || r.to === end);
    if (mentions.every((r) => removed.has(r))) keep.push(end);
  }
  // Story actions that name what goes lose it, or go when it was their only target.
  const stories = storyDependents(
    ctx.compilation,
    ctx.diagram.id,
    new Set([...relationIds, ...eventIds]),
  );
  const edits: TextEdit[] = [
    ...dependents.edits,
    ...stories.edits,
    ...deleteStatements(ctx.text, ctx.compilation.parse.root, stories.statements),
  ];
  if (keep.length > 0) {
    edits.push({
      start: relation.node.start,
      end: relation.node.end,
      newText: keep.map((id) => `${ctx.diagram.elementsById.get(id)!.kind} ${id}`).join("; "),
    });
    ctx.notes.push(messages().notes.keptEnds(keep));
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, dependents.statements));
  } else {
    edits.push(
      ...deleteStatements(ctx.text, ctx.compilation.parse.root, [
        relation.node,
        ...dependents.statements,
      ]),
    );
  }
  return edits;
}

/** A relation written as a relation statement; a `return` answers its call and is refused. */
function writtenRelation(relation: Relation): RelationStatement {
  if (relation.node.kind !== "RelationStatement") {
    reject("edit.invalid-value", reasons().relations.returnAnswers);
  }
  return relation.node;
}

export function setRelationLine(ctx: EditContext, op: OperationOf<"setRelationLine">): TextEdit[] {
  const relation = requireRelation(ctx, op.relation);
  const node = writtenRelation(relation);
  // The heads stay: a two-way arrow stays two-way, a line stays a line.
  const arrow = arrowToken(op.line, relation.heads);
  if (node.arrow.text === arrow) return [];
  return [{ start: node.arrow.start, end: node.arrow.end, newText: arrow }];
}

function routeOf(ctx: EditContext, relation: Relation): RouteEntry | undefined {
  if (relation.id === null) return undefined;
  return ctx.diagram.placement.find(
    (p): p is RouteEntry => p.statement === "route" && p.target === relation.id,
  );
}

export function reconnectRelation(
  ctx: EditContext,
  op: OperationOf<"reconnectRelation">,
): TextEdit[] {
  const relation = requireRelation(ctx, op.relation);
  requireElement(ctx, op.element);
  if (op.port !== undefined) requirePortOf(ctx, op.element, op.port);
  if (op.position !== undefined) requireEndPosition(op.port, op.position);
  const node = writtenRelation(relation);
  const endRef = op.end === "from" ? node.source : node.target;
  const current = op.end === "from" ? relation.from : relation.to;
  const edits: TextEdit[] = [];
  if (current !== op.element) {
    edits.push({ start: endRef.start, end: endRef.end, newText: op.element });
  }
  const route = routeOf(ctx, relation);
  if (route) {
    const endpoint = op.end === "from" ? route.from : route.to;
    const parts = routeParts(route.node);
    const arg = op.end === "from" ? parts.fromRef : parts.toRef;
    const at = op.end === "from" ? parts.fromAt : parts.toAt;
    if (arg?.kind !== "QualifiedRef")
      reject("edit.unsafe-target", reasons().relations.routeUnreadable);
    // A compass port, and its point, carry over to the new element; a named port of the old one
    // does not.
    const keptPort = current !== op.element && endpoint.named ? "auto" : endpoint.port;
    const port = op.port ?? (endpoint.explicitPort ? keptPort : undefined);
    const kept =
      op.port === undefined && port === endpoint.port && endpoint.position !== undefined
        ? Math.round(endpoint.position * 1000) / 10
        : undefined;
    const text = endpointText(op.element, port ?? null, op.position ?? kept);
    const end = (at ?? arg!).end;
    if (text !== ctx.text.slice(arg!.start, end))
      edits.push({ start: arg!.start, end, newText: text });
  } else if (op.port !== undefined && op.port !== "auto") {
    // The new port needs a route, and a route needs a named relation.
    let id = relation.id;
    if (id === null) {
      id = freeId(ctx, `${relation.from}_${relation.to}`, true);
      const anchor = relationNameAnchor(relation);
      edits.push({ start: anchor, end: anchor, newText: ` as ${id}` });
    }
    const pinned = endpointText(op.element, op.port, op.position);
    const from = op.end === "from" ? pinned : `${relation.from}.auto`;
    const to = op.end === "to" ? pinned : `${relation.to}.auto`;
    edits.push(insertPlacements(ctx, [`route ${id} from ${from} to ${to}`]));
  }
  return edits;
}
