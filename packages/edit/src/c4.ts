import {
  applyTextEdits,
  isIdentifierText,
  isToken,
  type Block,
  type CstNode,
  type KeywordStatement,
  type Statement,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import {
  ENTITY_CHILDREN,
  ENTITY_KINDS,
  defaultEntities,
  isSafeUrl,
  type Compilation,
  type EntityReference,
  compile,
  singleIdent,
  type FlowDiagram,
  type ModelDefinition,
  type ModelEntity,
  type ModelRelation,
  type Relation,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, type EditContext, type TextContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { attachmentDependent } from "./attachments.js";
import { insertAfter, insertBefore, verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { endpointText, requireEndPosition, routeParts } from "./routes.js";
import { storyDependents } from "./stories.js";
import { quoteString } from "./text.js";
import type { Dependent, DependentKind } from "./types.js";

// ---------------------------------------------------------------------- views

/** Operations a C4 view accepts; the others write declarations the view does not have. */
const VIEW_OPERATIONS: ReadonlySet<string> = new Set([
  // A view declares notes: `createElement` refuses every other kind there.
  "createElement",
  "attachNote",
  "setPosition",
  "setSize",
  "setRoute",
  "setLabelAnchor",
  "arrange",
  "setDiagramProperty",
  "setStyleProperty",
  "setAnimation",
  "removeAnimation",
  "createRelation",
  "removeRelation",
  "setRelationLabel",
  "includeEntity",
  "excludeEntity",
  "setLocalLabel",
  "forgetModelRelation",
  "rewriteRouteEnd",
  "materializeRelationId",
]);

/**
 * Operations a note of a view takes as any element does, since the note is a declaration of the
 * view: its text, id, classes and url, and its removal with the placement and styles it has.
 */
const NOTE_OPERATIONS: ReadonlySet<string> = new Set([
  "renameElement",
  "removeElement",
  "setElementLabel",
  "setClasses",
  "setElementProperty",
]);

/** The operation fields that name the element it acts on. */
interface ElementTarget {
  readonly kind: string;
  readonly element?: string | null;
  readonly target?: string;
  readonly targetKind?: string;
}

/** Refuses an operation that does not apply to a C4 view, naming the ones that do. */
export function refuseInView(ctx: EditContext, operation: ElementTarget): void {
  const { kind } = operation;
  if (ctx.diagram.type !== "c4" || VIEW_OPERATIONS.has(kind)) return;
  if (NOTE_OPERATIONS.has(kind) && operation.targetKind !== "relation") {
    const id = operation.element ?? operation.target;
    const element = id === undefined ? undefined : ctx.diagram.elementsById.get(id);
    if (element?.kind === "note" && element.entity === null) return;
  }
  reject("edit.invalid-value", reasons().c4.notInView(kind, ctx.diagram.c4?.model ?? ""));
}

function requireView(ctx: EditContext): NonNullable<FlowDiagram["c4"]> {
  const c4 = ctx.diagram.c4;
  if (!c4) reject("edit.unsafe-target", reasons().c4.notView(ctx.diagram.id));
  return c4;
}

/** Relations of the view that are combinations written in it, not model relations. */
export function isCombination(diagram: FlowDiagram, key: string): boolean {
  return diagram.c4?.combined.includes(key) ?? false;
}

/** The block of the view's diagram. */
function viewBody(ctx: EditContext): Block {
  const block = ctx.diagram.block;
  if (!block) reject("edit.unsafe-target", reasons().c4.viewNoBody(ctx.diagram.id));
  return block;
}

/** The statement after which a view statement goes: the last of level, scope, include, exclude. */
function viewAnchor(ctx: EditContext, words: readonly string[]): Statement | undefined {
  const body = viewBody(ctx);
  let anchor: Statement | undefined;
  for (const stmt of body.statements) {
    if (stmt.kind === "KeywordStatement" && words.includes(stmt.keyword.text)) anchor = stmt;
  }
  return anchor;
}

function insertViewStatement(ctx: EditContext, text: string, after: readonly string[]): TextEdit {
  const body = viewBody(ctx);
  const anchor = viewAnchor(ctx, after);
  if (anchor) return insertAfter(ctx, body, anchor, () => text);
  const first = body.statements[0];
  return first
    ? insertBefore(ctx, first, () => text)
    : insertStatement(ctx, body, ctx.diagram.node.start, () => text);
}

/**
 * Declares a note in a view: after its last note, else after the lists and labels and before the
 * blocks, where the language keeps what a view says about what it draws.
 */
export function insertViewNote(ctx: EditContext, text: string): TextEdit {
  return insertViewStatement(ctx, text, ["level", "scope", "include", "exclude", "label", "note"]);
}

function requireEntity(ctx: EditContext, path: string): ModelEntity {
  const model = requireView(ctx).resolved?.definition;
  if (!model) reject("edit.unsafe-target", reasons().c4.unresolved);
  const entity = model.entitiesByPath.get(path);
  if (!entity) reject("edit.unsafe-target", reasons().c4.noEntity(model.id, path));
  return entity;
}

export function includeEntity(ctx: EditContext, op: OperationOf<"includeEntity">): TextEdit[] {
  const c4 = requireView(ctx);
  requireEntity(ctx, op.entity);
  if (ctx.diagram.elementsById.has(op.entity)) return [];
  let edits: TextEdit[];
  const excluded = c4.excludes.findIndex((e) => e.path === op.entity);
  if (excluded >= 0 && c4.excludeNode) {
    edits =
      c4.excludes.length === 1
        ? deleteStatements(ctx.text, ctx.compilation.parse.root, [c4.excludeNode])
        : removeListItems(c4.excludeNode.args, new Set([excluded]));
  } else if (c4.includes !== null && c4.includeNode) {
    const last = c4.includeNode.args[c4.includeNode.args.length - 1]!;
    edits = [{ start: last.end, end: last.end, newText: `, ${op.entity}` }];
  } else {
    // The default set becomes an explicit list, so that nothing else changes.
    const drawn = ctx.diagram.elements.filter((e) => e.kind !== "group").map((e) => e.id);
    edits = [
      insertViewStatement(ctx, `include ${[...drawn, op.entity].join(", ")}`, ["level", "scope"]),
    ];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The view statements that only target an element, and edits that drop it from shared ones. */
function viewDependents(
  ctx: TextContext,
  diagram: FlowDiagram,
  id: string,
): { statements: CstNode[]; edits: TextEdit[]; dependents: Dependent[] } {
  const lines = ctx.compilation.parse.lines;
  const statements: CstNode[] = [];
  const edits: TextEdit[] = [];
  const dependents: Dependent[] = [];
  const depend = (kind: DependentKind, name: string, node: CstNode) => {
    statements.push(node);
    dependents.push({
      kind,
      name,
      description: messages().dependents.statement(kind, name, lines.location(node.start).line),
      range: lines.range(node),
    });
  };
  const gone = new Set(
    diagram.relations.filter((r) => r.from === id || r.to === id).map((r) => r.key),
  );
  // A note of the view attached to the entity stays, without its `on` clause.
  for (const note of diagram.elements) {
    if (note.attachedTo !== id) continue;
    const attached = attachmentDependent(ctx, note);
    if (!attached) continue;
    dependents.push(attached.dependent);
    edits.push(attached.edit);
  }
  for (const entry of diagram.placement) {
    if (entry.target === id || gone.has(entry.target))
      depend(entry.statement as DependentKind, entry.target, entry.node);
  }
  for (const label of diagram.c4?.labels ?? []) {
    if (label.target === id || gone.has(label.target)) depend("label", label.target, label.node);
  }
  for (const relation of diagram.relations) {
    if (gone.has(relation.key) && isCombination(diagram, relation.key))
      depend("relation", relation.key, relation.node);
  }
  const partial = new Map<KeywordStatement, Set<number>>();
  for (const entry of [...diagram.styles, ...diagram.animations]) {
    if (entry.target !== id && !gone.has(entry.target)) continue;
    const index = entry.node.args.findIndex((a) => a.start === entry.targetRange.start.offset);
    const set = partial.get(entry.node) ?? new Set<number>();
    if (index >= 0) set.add(index);
    partial.set(entry.node, set);
    dependents.push({
      kind: "properties" in entry ? "style" : "animate",
      name: entry.target,
      description: messages().dependents.statement(
        "properties" in entry ? "style" : "animate",
        entry.target,
        lines.location(entry.node.start).line,
      ),
      range: lines.range(entry.node),
    });
  }
  for (const [node, indices] of partial) {
    if (indices.size >= node.args.length) statements.push(node);
    else edits.push(...removeListItems(node.args, indices));
  }
  for (const constraint of diagram.constraints) {
    const index = constraint.targets.indexOf(id);
    if (index < 0) continue;
    if (constraint.kind === "distance" || constraint.targets.length <= 2)
      depend("constraint", constraint.kind, constraint.node);
    else
      edits.push(
        ...removeListItems(
          constraint.node.args.slice(0, constraint.targets.length),
          new Set([index]),
        ),
      );
  }
  return { statements, edits, dependents };
}

export function excludeEntity(ctx: EditContext, op: OperationOf<"excludeEntity">): TextEdit[] {
  const c4 = requireView(ctx);
  requireEntity(ctx, op.entity);
  const element = ctx.diagram.elementsById.get(op.entity);
  if (!element) return [];
  if (element.kind === "group") {
    reject("edit.unsafe-target", reasons().c4.isScope(op.entity));
  }
  const dependents = viewDependents(ctx, ctx.diagram, op.entity);
  if (!op.cascade && dependents.dependents.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().c4.removingFromView(op.entity, dependents.dependents.length),
      dependents.dependents,
    );
  }
  const edits: TextEdit[] = [...dependents.edits];
  const deleted: CstNode[] = [...dependents.statements];
  const included = c4.includes?.findIndex((e) => e.path === op.entity) ?? -1;
  if (included >= 0 && c4.includeNode) {
    if (c4.includes!.length === 1) deleted.push(c4.includeNode);
    else edits.push(...removeListItems(c4.includeNode.args, new Set([included])));
  } else if (c4.excludeNode) {
    const last = c4.excludeNode.args[c4.excludeNode.args.length - 1]!;
    edits.push({ start: last.end, end: last.end, newText: `, ${op.entity}` });
  } else {
    edits.push(insertViewStatement(ctx, `exclude ${op.entity}`, ["level", "scope", "include"]));
  }
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, deleted));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function setLocalLabel(ctx: EditContext, op: OperationOf<"setLocalLabel">): TextEdit[] {
  const c4 = requireView(ctx);
  if (!ctx.diagram.elementsById.has(op.target) && !ctx.diagram.relationsByKey.has(op.target)) {
    reject("edit.unsafe-target", reasons().c4.notDrawn(op.target, ctx.diagram.id));
  }
  const entry = c4.labels.find((l) => l.target === op.target);
  let edits: TextEdit[];
  if (op.label === null || op.label === "") {
    if (!entry) return [];
    edits = deleteStatements(ctx.text, ctx.compilation.parse.root, [entry.node]);
  } else if (entry) {
    const arg = entry.node.args[1]!;
    const quoted = quoteString(op.label);
    if (arg.kind === "StringLiteral" && arg.token.text === quoted) return [];
    edits = [{ start: arg.start, end: arg.end, newText: quoted }];
  } else {
    const relation = ctx.diagram.relationsByKey.get(op.target);
    if (relation && relation.id === null) {
      reject("edit.anonymous-relation", reasons().relations.unnamed(op.target));
    }
    edits = [
      insertViewStatement(ctx, `label ${op.target} ${quoteString(op.label)}`, [
        "level",
        "scope",
        "include",
        "exclude",
        "label",
      ]),
    ];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

// ---------------------------------------------------------------------- models

/** What model operations work on: the text and one model of it. */
export interface ModelContext extends TextContext {
  readonly model: ModelDefinition;
}

export function createModelContext(ctx: TextContext, id: string): ModelContext {
  const model = ctx.compilation.document.models.find((m) => m.id === id);
  if (!model) reject("edit.unsafe-target", reasons().c4.noModel(id));
  if (model.node.hasError) reject("edit.unsafe-target", reasons().c4.modelErrors(id));
  return { ...ctx, model };
}

function requireModelEntity(ctx: ModelContext, path: string): ModelEntity {
  const entity = ctx.model.entitiesByPath.get(path);
  if (!entity) reject("edit.unsafe-target", reasons().c4.noEntity(ctx.model.id, path));
  return entity;
}

function requireModelRelation(ctx: ModelContext, key: string): ModelRelation {
  const relation = ctx.model.relationsByKey.get(key);
  if (!relation) reject("edit.unsafe-target", reasons().c4.noRelation(ctx.model.id, key));
  return relation;
}

function modelBody(ctx: ModelContext): Block {
  const block = ctx.model.node.block;
  if (block.kind !== "Block") reject("edit.unsafe-target", reasons().c4.modelNoBody);
  return block;
}

/**
 * Every reference of the file to entities of the model: in the model, its views, links and the
 * stories of its views.
 */
export function entityReferences(
  compilation: Compilation,
  model: ModelDefinition,
): EntityReference[] {
  const found: EntityReference[] = [...model.references];
  const local = (diagram: FlowDiagram | null) =>
    diagram?.c4 !== null &&
    diagram?.c4.resolved?.file === null &&
    diagram.c4.resolved.definition.id === model.id;
  for (const diagram of compilation.document.diagrams) {
    for (const reference of diagram.entityReferences) {
      if (reference.role === "link" ? reference.model === model.id : local(diagram)) {
        found.push(reference);
      }
    }
  }
  for (const story of compilation.document.stories) {
    for (const reference of story.entityReferences) {
      if (reference.view.file === null && local(reference.view.diagram)) found.push(reference);
    }
  }
  return found;
}

export function renameEntity(ctx: ModelContext, op: OperationOf<"renameEntity">): TextEdit[] {
  const entity = requireModelEntity(ctx, op.entity);
  if (op.newId === entity.id) return [];
  if (!isIdentifierText(op.newId)) {
    reject("edit.invalid-id", reasons().ids.invalidEntity(op.newId));
  }
  const sibling = entity.parent ? `${entity.parent}.${op.newId}` : op.newId;
  if (ctx.model.entitiesByPath.has(sibling)) {
    reject("edit.id-conflict", reasons().c4.entityExists(sibling, ctx.model.id));
  }
  const tokens = new Map<number, Token>();
  for (const reference of entityReferences(ctx.compilation, ctx.model)) {
    if (reference.path === entity.path) tokens.set(reference.token.start, reference.token);
  }
  const edits = [...tokens.values()].map((t) => ({
    start: t.start,
    end: t.end,
    newText: op.newId,
  }));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The entities nested in an entity, at any depth. */
function descendants(model: ModelDefinition, path: string): ModelEntity[] {
  return model.entities.filter((e) => e.path.startsWith(`${path}.`));
}

export function removeEntity(ctx: ModelContext, op: OperationOf<"removeEntity">): TextEdit[] {
  const entity = requireModelEntity(ctx, op.entity);
  const model = ctx.model;
  const removed = new Set([entity.path, ...descendants(model, entity.path).map((e) => e.path)]);
  const lines = ctx.compilation.parse.lines;
  const statements: CstNode[] = [entity.node];
  const edits: TextEdit[] = [];
  const dependents: Dependent[] = [];
  const depend = (kind: DependentKind, name: string, node: CstNode) => {
    statements.push(node);
    dependents.push({
      kind,
      name,
      description: messages().dependents.statement(kind, name, lines.location(node.start).line),
      range: lines.range(node),
    });
  };
  for (const child of descendants(model, entity.path)) {
    dependents.push({
      kind: "element",
      name: child.path,
      description: messages().dependents.statement(child.kind, child.path, child.range.start.line),
      range: child.range,
    });
  }
  for (const relation of model.relations) {
    if (removed.has(relation.from) || removed.has(relation.to))
      depend("relation", relation.key, relation.node);
  }
  const relationKeys = new Set(
    model.relations.filter((r) => removed.has(r.from) || removed.has(r.to)).map((r) => r.key),
  );
  // Views of this model in the file: list entries, labels, placement, styles and combinations.
  for (const diagram of ctx.compilation.document.diagrams) {
    const c4 = diagram.c4;
    if (!c4 || c4.resolved?.file !== null || c4.resolved.definition.id !== model.id) continue;
    if (c4.scope !== null && removed.has(c4.scope)) {
      reject("edit.unsafe-target", reasons().c4.opensScope(diagram.id, c4.scope));
    }
    for (const [list, node] of [
      [c4.includes ?? [], c4.includeNode],
      [c4.excludes, c4.excludeNode],
    ] as const) {
      if (!node) continue;
      const indices = new Set(list.flatMap((e, i) => (removed.has(e.path) ? [i] : [])));
      if (indices.size === 0) continue;
      if (indices.size === node.args.length) depend("element", node.keyword.text, node);
      else {
        edits.push(...removeListItems(node.args, indices));
        dependents.push({
          kind: "element",
          name: node.keyword.text,
          description: messages().dependents.viewList(
            node.keyword.text,
            diagram.id,
            lines.location(node.start).line,
          ),
          range: lines.range(node),
        });
      }
    }
    for (const label of c4.labels) {
      if (removed.has(label.target) || relationKeys.has(label.target))
        depend("label", label.target, label.node);
    }
    // The notes of the view attached to a removed entity stay, without their clause.
    for (const note of diagram.elements) {
      if (note.attachedTo === null || !removed.has(note.attachedTo)) continue;
      const attached = attachmentDependent(ctx, note);
      if (!attached) continue;
      dependents.push(attached.dependent);
      edits.push(attached.edit);
    }
    for (const entry of diagram.placement) {
      const target = entry.target;
      const relation = diagram.relationsByKey.get(target);
      const touches =
        removed.has(target) || (relation && relation.sources.some((s) => relationKeys.has(s)));
      if (touches) depend(entry.statement as DependentKind, target, entry.node);
    }
    for (const entry of [...diagram.styles, ...diagram.animations]) {
      if (!removed.has(entry.target) && !relationKeys.has(entry.target)) continue;
      depend("properties" in entry ? "style" : "animate", entry.target, entry.node);
    }
    for (const reference of diagram.entityReferences) {
      if (reference.role !== "relation" || !removed.has(reference.path)) continue;
      const combined = diagram.relations.find(
        (r) =>
          isCombination(diagram, r.key) &&
          r.node.start <= reference.token.start &&
          reference.token.end <= r.node.end,
      );
      if (combined) depend("relation", combined.key, combined.node);
    }
    const stories = storyDependents(ctx.compilation, diagram.id, removed);
    statements.push(...stories.statements);
    edits.push(...stories.edits);
    dependents.push(...stories.dependents);
  }
  // Links of other diagrams to the removed entities.
  for (const diagram of ctx.compilation.document.diagrams) {
    for (const link of diagram.links) {
      if (
        link.target === "model" &&
        link.binding === null &&
        link.diagram === model.id &&
        removed.has(link.element)
      ) {
        depend("link", link.text, link.node);
      }
    }
  }
  if (!op.cascade && dependents.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().c4.removingEntity(entity.path, dependents.length),
      dependents,
    );
  }
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, statements));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The written string argument after the id of an entity, or undefined. */
function labelArg(entity: ModelEntity) {
  const arg = entity.node.args[1];
  return arg?.kind === "StringLiteral" ? arg : undefined;
}

/** Writes, replaces or (with null) removes one statement of a block, adding the block if needed. */
function setBlockStatement(
  ctx: TextContext,
  owner: KeywordStatement | Statement,
  block: Block | undefined,
  keyword: string,
  text: string | null,
): TextEdit[] {
  const existing = block?.statements.find(
    (s): s is KeywordStatement => s.kind === "KeywordStatement" && s.keyword.text === keyword,
  );
  if (text === null) {
    if (!existing) return [];
    // A block left empty goes too.
    if (block && block.statements.length === 1)
      return [{ start: block.fullStart, end: block.end, newText: "" }];
    return deleteStatements(ctx.text, ctx.compilation.parse.root, [existing]);
  }
  if (existing) {
    if (ctx.text.slice(existing.start, existing.end) === text) return [];
    return [{ start: existing.start, end: existing.end, newText: text }];
  }
  if (block) {
    // Properties go before child entities and relations.
    const first = block.statements[0];
    return [
      first
        ? insertBefore(ctx, first, () => text)
        : insertStatement(ctx, block, owner.start, () => text),
    ];
  }
  return [{ start: owner.end, end: owner.end, newText: ` { ${text} }` }];
}

export function setEntityProperty(
  ctx: ModelContext,
  op: OperationOf<"setEntityProperty">,
): TextEdit[] {
  const entity = requireModelEntity(ctx, op.entity);
  const node = entity.node;
  let edits: TextEdit[];
  switch (op.property) {
    case "label": {
      const current = labelArg(entity);
      const value = op.value === null || op.value === "" ? null : String(op.value);
      if (value === null || value === entity.id) {
        edits = current ? [{ start: node.args[0]!.end, end: current.end, newText: "" }] : [];
      } else {
        const quoted = quoteString(value);
        edits = current
          ? current.token.text === quoted
            ? []
            : [{ start: current.start, end: current.end, newText: quoted }]
          : [{ start: node.args[0]!.end, end: node.args[0]!.end, newText: ` ${quoted}` }];
      }
      break;
    }
    case "url":
    case "description":
    case "technology":
      if (
        op.property === "url" &&
        op.value !== null &&
        op.value !== "" &&
        !isSafeUrl(String(op.value))
      ) {
        reject("edit.invalid-value", reasons().values.unsafeUrl(String(op.value)));
      }
      edits = setBlockStatement(
        ctx,
        node,
        node.block,
        op.property,
        op.value === null || op.value === ""
          ? null
          : `${op.property} ${quoteString(String(op.value))}`,
      );
      break;
    case "external": {
      if (entity.kind !== "person" && entity.kind !== "system") {
        reject("edit.invalid-value", reasons().c4.external);
      }
      const on = op.value === true || op.value === "true";
      edits = setBlockStatement(ctx, node, node.block, "external", on ? "external" : null);
      break;
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** A free id among the siblings of a new entity. */
function freshEntityId(ctx: ModelContext, parent: string | null, kind: string): string {
  for (let n = 1; ; n++) {
    const id = `${kind}${n}`;
    if (!ctx.model.entitiesByPath.has(parent ? `${parent}.${id}` : id)) return id;
  }
}

export function createEntity(ctx: ModelContext, op: OperationOf<"createEntity">): TextEdit[] {
  if (!(ENTITY_KINDS as readonly string[]).includes(op.entityKind)) {
    reject("edit.invalid-value", reasons().c4.notEntityKind(op.entityKind, ENTITY_KINDS));
  }
  const parent = op.parent ? requireModelEntity(ctx, op.parent) : null;
  const allowed = ENTITY_CHILDREN[parent?.kind ?? "model"]!;
  if (!allowed.includes(op.entityKind)) {
    reject("edit.invalid-value", reasons().c4.misplaced(op.entityKind, parent));
  }
  const id = op.id ?? freshEntityId(ctx, parent?.path ?? null, op.entityKind);
  if (!isIdentifierText(id)) reject("edit.invalid-id", reasons().ids.notValid(id));
  const path = parent ? `${parent.path}.${id}` : id;
  if (ctx.model.entitiesByPath.has(path)) reject("edit.id-conflict", reasons().c4.pathExists(path));
  const label = op.label ?? id[0]!.toUpperCase() + id.slice(1);
  const text = `${op.entityKind} ${id} ${quoteString(label)}`;
  let edits: TextEdit[];
  const block = parent ? parent.node.block : modelBody(ctx);
  if (!block) {
    edits = [
      {
        start: parent!.node.end,
        end: parent!.node.end,
        newText: ` {${ctx.eol}${indentOf(ctx, parent!.node)}${ctx.unit}${text}${ctx.eol}${indentOf(ctx, parent!.node)}}`,
      },
    ];
  } else {
    // After the last entity of the block, else first.
    const entities = block.statements.filter(
      (s) =>
        s.kind === "KeywordStatement" &&
        (ENTITY_KINDS as readonly string[]).includes(s.keyword.text),
    );
    const last = entities[entities.length - 1];
    edits = [
      last
        ? insertAfter(ctx, block, last, () => text)
        : insertStatement(ctx, block, (parent?.node ?? ctx.model.node).start, () => text),
    ];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

function indentOf(ctx: TextContext, node: { start: number }): string {
  const start = ctx.text.lastIndexOf("\n", node.start - 1) + 1;
  return /^[ \t]*/.exec(ctx.text.slice(start))![0];
}

export function createModelRelation(
  ctx: ModelContext,
  op: OperationOf<"createModelRelation">,
): TextEdit[] {
  requireModelEntity(ctx, op.from);
  requireModelEntity(ctx, op.to);
  if (op.id !== undefined && !isIdentifierText(op.id))
    reject("edit.invalid-id", reasons().ids.notValid(op.id));
  if (op.id !== undefined && ctx.model.relationsByKey.has(op.id)) {
    reject("edit.id-conflict", reasons().c4.relationExists(op.id));
  }
  const label = op.label ? `: ${quoteString(op.label)}` : "";
  const id = op.id ? ` as ${op.id}` : "";
  const block = op.technology ? ` { technology ${quoteString(op.technology)} }` : "";
  const text = `${op.from} -> ${op.to}${label}${id}${block}`;
  const body = modelBody(ctx);
  // After the last relation at the root, else after the last statement.
  const relations = body.statements.filter((s) => s.kind === "RelationStatement");
  const last = relations[relations.length - 1] ?? body.statements[body.statements.length - 1];
  const edits = [
    last
      ? insertAfter(ctx, body, last, () => text)
      : insertStatement(ctx, body, ctx.model.node.start, () => text),
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Moves one end of a model relation to another entity; the label, id and block stay. */
export function reconnectModelRelation(
  ctx: ModelContext,
  op: OperationOf<"reconnectModelRelation">,
): TextEdit[] {
  const relation = requireModelRelation(ctx, op.relation);
  const entity = requireModelEntity(ctx, op.entity);
  const current = op.end === "from" ? relation.from : relation.to;
  if (current === entity.path) return [];
  const ref = op.end === "from" ? relation.node.source : relation.node.target;
  if (ref.kind !== "QualifiedRef") {
    reject("edit.unsafe-target", reasons().c4.endUnreadable(relation.key));
  }
  if (op.position !== undefined) requireEndPosition(op.port, op.position);
  // The path from the root resolves wherever the statement sits: the lookup from the enclosing
  // entity outwards ends at the root.
  const moved: TextEdit = { start: ref.start, end: ref.end, newText: entity.path };
  const edits: TextEdit[] = [moved];
  // The routes of the file's views follow the end the views now draw.
  if (relation.id !== null) {
    const after = compile(applyTextEdits(ctx.text, [moved]), ctx.compilation.options);
    const removed: CstNode[] = [];
    for (const diagram of ctx.compilation.document.diagrams) {
      const c4 = diagram.c4;
      if (!c4 || c4.resolved?.file !== null || c4.resolved.definition.id !== ctx.model.id) continue;
      const routes = routeStatements(diagram, relation.id);
      if (routes.length === 0) continue;
      const now = after.document.diagrams.find((d) => d.id === diagram.id);
      const drawn = now?.relations.find((r) => r.id === relation.id);
      const pinned =
        diagram.id === op.view && op.port !== undefined
          ? { port: op.port, ...(op.position !== undefined ? { position: op.position } : {}) }
          : undefined;
      const followed = followRoutes(ctx.text, ctx.model, routes, drawn, op.end, pinned);
      edits.push(...followed.edits);
      removed.push(...followed.removed);
    }
    edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, removed));
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The `route <id>` statements of a view, whether the analyser took them or not. */
function routeStatements(diagram: FlowDiagram, id: string): KeywordStatement[] {
  const found: KeywordStatement[] = [];
  for (const owner of diagram.placementBlocks) {
    for (const stmt of owner.block?.statements ?? []) {
      if (stmt.kind !== "KeywordStatement" || stmt.keyword.text !== "route") continue;
      if (singleIdent(stmt.args[0])?.text === id) found.push(stmt);
    }
  }
  return found;
}

/** The compass sides and `auto`: the ports every entity has, which carry over to another. */
const COMPASS: ReadonlySet<string> = new Set(["north", "south", "east", "west", "auto"]);

/** A route end as written: the entity it names, and the port after it when it has one. */
function writtenEnd(
  model: ModelDefinition,
  text: string,
): { element: string; port: string | null } {
  if (model.entitiesByPath.has(text)) return { element: text, port: null };
  const dot = text.lastIndexOf(".");
  if (dot > 0 && model.entitiesByPath.has(text.slice(0, dot))) {
    return { element: text.slice(0, dot), port: text.slice(dot + 1) };
  }
  return { element: text, port: null };
}

/**
 * The edits that make a view's routes of a relation end where the view now draws its moved end:
 * the end rewritten with the drawn entity, a compass port carried over, a named port and a point
 * dropped (or `pinned`, the port and point of a drop on this view), the other end and the
 * waypoints kept; a route the view no longer draws the relation for goes; a route whose end
 * already meets the drawn one stays as it is.
 */
function followRoutes(
  text: string,
  model: ModelDefinition,
  routes: readonly KeywordStatement[],
  drawn: Relation | undefined,
  end: "from" | "to",
  pinned: { readonly port: string | null; readonly position?: number } | undefined,
): { edits: TextEdit[]; removed: KeywordStatement[] } {
  const edits: TextEdit[] = [];
  const removed: KeywordStatement[] = [];
  for (const route of routes) {
    if (!drawn) {
      removed.push(route);
      continue;
    }
    const parts = routeParts(route);
    const arg = end === "from" ? parts.fromRef : parts.toRef;
    const at = end === "from" ? parts.fromAt : parts.toAt;
    if (arg?.kind !== "QualifiedRef") {
      reject("edit.unsafe-target", reasons().relations.routeUnreadable);
    }
    const target = end === "from" ? drawn.from : drawn.to;
    const written = writtenEnd(model, text.slice(arg.start, arg.end));
    let newText: string;
    if (pinned) newText = endpointText(target, pinned.port, pinned.position);
    else if (written.element === target) continue;
    else {
      const port = written.port !== null && COMPASS.has(written.port) ? written.port : null;
      newText = endpointText(target, port);
    }
    const stop = (at ?? arg).end;
    if (newText !== text.slice(arg.start, stop)) {
      edits.push({ start: arg.start, end: stop, newText });
    }
  }
  return { edits, removed };
}

/**
 * The routes of a relation in a view of a file other than the model's, once the model moved one of
 * its ends (the compilation already resolves the moved model): they follow the end the view
 * draws now, as `reconnectModelRelation` makes them follow in the model's own file.
 */
export function rewriteRouteEnd(ctx: EditContext, op: OperationOf<"rewriteRouteEnd">): TextEdit[] {
  const c4 = requireView(ctx);
  const model = c4.resolved?.definition;
  if (!model) reject("edit.unsafe-target", reasons().c4.unresolved);
  const routes = routeStatements(ctx.diagram, op.relation);
  if (routes.length === 0) return [];
  const drawn = ctx.diagram.relations.find((r) => r.id === op.relation);
  const followed = followRoutes(ctx.text, model, routes, drawn, op.end, undefined);
  const edits = [
    ...followed.edits,
    ...deleteStatements(ctx.text, ctx.compilation.parse.root, followed.removed),
  ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Removes a model relation with the statements of the file's views that name it. Without
 * `cascade`, those statements and the views that draw the relation (other than `op.view`) are
 * listed as dependents.
 */
/**
 * What a view holds about a model relation: the statements that name it by its key, or by a
 * combination standing for it alone, as statements to delete, edits that take it out of shared
 * lists, and dependents; with the view itself as drawing it when `listDrawn`.
 */
function relationStatements(
  ctx: TextContext,
  diagram: FlowDiagram,
  key: string,
  listDrawn: boolean,
): { statements: CstNode[]; edits: TextEdit[]; dependents: Dependent[] } {
  const c4 = diagram.c4;
  const lines = ctx.compilation.parse.lines;
  const statements: CstNode[] = [];
  const edits: TextEdit[] = [];
  const dependents: Dependent[] = [];
  if (!c4) return { statements, edits, dependents };
  const depend = (kind: DependentKind, name: string, node: CstNode) => {
    statements.push(node);
    dependents.push({
      kind,
      name,
      description: messages().dependents.statement(kind, name, lines.location(node.start).line),
      range: lines.range(node),
    });
  };
  const keys = new Set([key]);
  let drawn = false;
  for (const shown of diagram.relations) {
    if (!shown.sources.includes(key)) continue;
    drawn = true;
    if (isCombination(diagram, shown.key) && shown.sources.every((k) => k === key)) {
      keys.add(shown.key);
      depend("relation", shown.key, shown.node);
    }
  }
  if (drawn && listDrawn) {
    dependents.push({
      kind: "relation",
      name: diagram.id,
      description: messages().dependents.drawnIn(
        key,
        diagram.id,
        lines.location(diagram.node.start).line,
      ),
      range: lines.range(diagram.node),
    });
  }
  for (const entry of diagram.placement) {
    if (keys.has(entry.target)) depend(entry.statement as DependentKind, entry.target, entry.node);
  }
  for (const label of c4.labels) {
    if (keys.has(label.target)) depend("label", label.target, label.node);
  }
  // A style or an animation of several targets loses this one; of this one alone, it goes.
  const partial = new Map<KeywordStatement, Set<number>>();
  for (const entry of [...diagram.styles, ...diagram.animations]) {
    if (!keys.has(entry.target)) continue;
    const index = entry.node.args.findIndex((a) => a.start === entry.targetRange.start.offset);
    const set = partial.get(entry.node) ?? new Set<number>();
    if (index >= 0) set.add(index);
    partial.set(entry.node, set);
    const kind = "properties" in entry ? "style" : "animate";
    dependents.push({
      kind,
      name: entry.target,
      description: messages().dependents.statement(
        kind,
        entry.target,
        lines.location(entry.node.start).line,
      ),
      range: lines.range(entry.node),
    });
  }
  for (const [node, indices] of partial) {
    if (indices.size >= node.args.length) statements.push(node);
    else edits.push(...removeListItems(node.args, indices));
  }
  const stories = storyDependents(ctx.compilation, diagram.id, keys);
  statements.push(...stories.statements);
  edits.push(...stories.edits);
  dependents.push(...stories.dependents);
  // An entity the view drew only for this relation leaves its default set, with what names it.
  const model = c4.resolved?.definition;
  if (model && c4.includes === null) {
    const without: ModelDefinition = {
      ...model,
      relations: model.relations.filter((r) => r.key !== key),
    };
    const after = defaultEntities(without, c4.level, c4.scope);
    for (const path of defaultEntities(model, c4.level, c4.scope)) {
      if (after.has(path) || !diagram.elementsById.has(path)) continue;
      dependents.push({
        kind: "element",
        name: path,
        description: messages().dependents.leavesView(path, diagram.id),
        range: lines.range(diagram.node),
      });
      // What the entity's own removal would take, less what the relation's already takes.
      const leaving = viewDependents(ctx, diagram, path);
      const taken = new Set(statements.map((s) => s.start));
      const listed = new Set(dependents.map((d) => `${d.range.start.offset}:${d.description}`));
      statements.push(...leaving.statements.filter((s) => !taken.has(s.start)));
      edits.push(...leaving.edits);
      dependents.push(
        ...leaving.dependents.filter(
          (d) => !listed.has(`${d.range.start.offset}:${d.description}`),
        ),
      );
    }
  }
  return { statements, edits, dependents };
}

export function removeModelRelation(
  ctx: ModelContext,
  op: OperationOf<"removeModelRelation">,
): TextEdit[] {
  const relation = requireModelRelation(ctx, op.relation);
  const statements: CstNode[] = [relation.node];
  const edits: TextEdit[] = [];
  const dependents: Dependent[] = [];
  for (const diagram of ctx.compilation.document.diagrams) {
    const c4 = diagram.c4;
    if (!c4 || c4.resolved?.file !== null || c4.resolved.definition.id !== ctx.model.id) continue;
    const found = relationStatements(ctx, diagram, relation.key, diagram.id !== op.view);
    statements.push(...found.statements);
    edits.push(...found.edits);
    dependents.push(...found.dependents);
  }
  if (!op.cascade && dependents.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().c4.removingRelation(relation.key, dependents.length),
      dependents,
    );
  }
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, statements));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Takes a model relation out of a view whose model is in another file: the statements that name
 * it go (with `cascade`), or are listed as dependents, with the view as drawing it.
 */
export function forgetModelRelation(
  ctx: EditContext,
  op: OperationOf<"forgetModelRelation">,
): TextEdit[] {
  requireView(ctx);
  const { statements, edits, dependents } = relationStatements(
    ctx,
    ctx.diagram,
    op.relation,
    op.listDrawn ?? true,
  );
  if (!op.cascade && dependents.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().c4.removingRelation(op.relation, dependents.length),
      dependents,
    );
  }
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, statements));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function setModelRelationProperty(
  ctx: ModelContext,
  op: OperationOf<"setModelRelationProperty">,
): TextEdit[] {
  const relation = requireModelRelation(ctx, op.relation);
  const node = relation.node;
  const value = op.value === null || op.value === "" ? null : op.value;
  let edits: TextEdit[];
  switch (op.property) {
    case "label": {
      const label = node.label && isToken(node.label) ? node.label : undefined;
      if (value === null) {
        edits =
          label && node.colon ? [{ start: node.colon.start, end: label.end, newText: "" }] : [];
      } else {
        const quoted = quoteString(value);
        edits = label
          ? label.text === quoted
            ? []
            : [{ start: label.start, end: label.end, newText: quoted }]
          : [{ start: node.target.end, end: node.target.end, newText: `: ${quoted}` }];
      }
      break;
    }
    case "id": {
      if (value === null) reject("edit.invalid-value", reasons().c4.keepsId);
      if (!isIdentifierText(value)) reject("edit.invalid-id", reasons().ids.notValid(value));
      if (value !== relation.id && ctx.model.relationsByKey.has(value)) {
        reject("edit.id-conflict", reasons().c4.relationExists(value));
      }
      if (relation.id !== null) {
        // The id and the view statements that use it.
        const tokens: { start: number; end: number }[] = [
          { start: relation.idRange!.start.offset, end: relation.idRange!.end.offset },
        ];
        for (const diagram of ctx.compilation.document.diagrams) {
          const c4 = diagram.c4;
          if (!c4 || c4.resolved?.file !== null || c4.resolved.definition.id !== ctx.model.id)
            continue;
          for (const reference of diagram.references) {
            if (reference.targetKind === "relation" && reference.target === relation.id)
              tokens.push(reference.token);
          }
        }
        edits = [...new Map(tokens.map((t) => [t.start, t])).values()].map((t) => ({
          start: t.start,
          end: t.end,
          newText: value,
        }));
      } else {
        const anchor = node.label && isToken(node.label) ? node.label.end : node.target.end;
        edits = [{ start: anchor, end: anchor, newText: ` as ${value}` }];
      }
      break;
    }
    case "technology":
    case "description":
      edits = setBlockStatement(
        ctx,
        node,
        node.block,
        op.property,
        value === null ? null : `${op.property} ${quoteString(value)}`,
      );
      break;
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export type { Statement };
