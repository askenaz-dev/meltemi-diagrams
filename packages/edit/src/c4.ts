import {
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
  isSafeUrl,
  type Compilation,
  type EntityReference,
  type FlowDiagram,
  type ModelDefinition,
  type ModelEntity,
  type ModelRelation,
} from "@meltemi/diagrams-model";
import { insertStatement, reject, type EditContext, type TextContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { insertAfter, insertBefore, verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { removeListItems, type OperationOf } from "./plan.js";
import { storyDependents } from "./stories.js";
import { quoteString } from "./text.js";
import type { Dependent, DependentKind } from "./types.js";

// ---------------------------------------------------------------------- views

/** Operations a C4 view accepts; the others write declarations the view does not have. */
const VIEW_OPERATIONS: ReadonlySet<string> = new Set([
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
]);

/** Refuses an operation that does not apply to a C4 view, naming the ones that do. */
export function refuseInView(ctx: EditContext, kind: string): void {
  if (ctx.diagram.type !== "c4" || VIEW_OPERATIONS.has(kind)) return;
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
  ctx: EditContext,
  id: string,
): { statements: CstNode[]; edits: TextEdit[]; dependents: Dependent[] } {
  const diagram = ctx.diagram;
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
  const dependents = viewDependents(ctx, op.entity);
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
      reject("edit.anonymous-relation", reasons().c4.nameRelation);
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

export function removeModelRelation(
  ctx: ModelContext,
  op: OperationOf<"removeModelRelation">,
): TextEdit[] {
  const relation = requireModelRelation(ctx, op.relation);
  const statements: CstNode[] = [relation.node];
  // View statements that name the relation by its key.
  for (const diagram of ctx.compilation.document.diagrams) {
    const c4 = diagram.c4;
    if (!c4 || c4.resolved?.file !== null || c4.resolved.definition.id !== ctx.model.id) continue;
    // Combinations that stand for this relation only go too, with what names them.
    const keys = new Set([relation.key]);
    for (const drawn of diagram.relations) {
      if (isCombination(diagram, drawn.key) && drawn.sources.every((k) => k === relation.key)) {
        keys.add(drawn.key);
        statements.push(drawn.node);
      }
    }
    for (const entry of diagram.placement) if (keys.has(entry.target)) statements.push(entry.node);
    for (const label of c4.labels) if (keys.has(label.target)) statements.push(label.node);
    for (const entry of [...diagram.styles, ...diagram.animations]) {
      if (keys.has(entry.target)) statements.push(entry.node);
    }
  }
  const edits = deleteStatements(ctx.text, ctx.compilation.parse.root, statements);
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
