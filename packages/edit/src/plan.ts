import { createLine, setLinePoints } from "./lines.js";
import { createPen, setPenPoints } from "./pens.js";
import {
  applyTextEdits,
  invertTextEdits,
  isIdentifierText,
  isToken,
  parse,
  tokensOf,
  type Arg,
  type CstNode,
  type TextEdit,
  type Token,
  type Tuple,
} from "@meltemi/diagrams-language";
import {
  compile,
  relationLabelSpan,
  relationNameAnchor,
  singleIdent,
  type Compilation,
  type Element,
  type LabelEntry,
  type PlaceEntry,
  type PlacementEntry,
  type Point,
  type Relation,
  type RouteEntry,
  type SizeEntry,
} from "@meltemi/diagrams-model";
import {
  Rejected,
  createContext,
  createTextContext,
  insertStatement,
  isListGroup,
  reject,
  requireElement,
  requireNamedRelation,
  requireNumbers,
  type EditContext,
  type TextContext,
} from "./context.js";
import {
  createEntity,
  createModelContext,
  createModelRelation,
  excludeEntity,
  forgetModelRelation,
  includeEntity,
  isCombination,
  reconnectModelRelation,
  rewriteRouteEnd,
  refuseInView,
  removeEntity,
  removeModelRelation,
  renameEntity,
  setEntityProperty,
  setLocalLabel,
  setModelRelationProperty,
  type ModelContext,
} from "./c4.js";
import { composeEdits, planBatch } from "./batch.js";
import { attachmentDependent, attachNote } from "./attachments.js";
import { createElement, createRelation, requirePortOf, usedIds } from "./create.js";
import { deleteStatements } from "./delete.js";
import { createDiagram } from "./diagrams.js";
import { endpointText, requireEndPosition, routeParts } from "./routes.js";
import { insertAfter } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import { setClasses, setDescription, setElementKind, setElementLabel } from "./labels.js";
import { reconnectRelation, removeRelation, renameRelation, setRelationLine } from "./relations.js";
import {
  convertToFree,
  removedLinks,
  renameLayer,
  renameLinks,
  reorderElement,
  setElementProperty,
  setElementSource,
} from "./free.js";
import {
  addBranch,
  insertEvent,
  moveEvent,
  participantEvents,
  nestedInCalls,
  refuseFlowGeometry,
  eventIdsOf,
  removeEvent,
  renameEvent,
  setEventText,
  setFragmentOperator,
  setNotePlacement,
  toggleActivation,
  reorderParticipant,
  setFragmentCondition,
  setSpacing,
  nestInCall,
  unnestCall,
  unwrapFragment,
  wrapInFragment,
} from "./sequence.js";
import {
  addPort,
  convertToContainer,
  groupElements,
  insertFragment,
  moveElement,
  removePort,
  ungroup,
} from "./structure.js";
import { setDiagramProperty, setStyleProperty } from "./styles.js";
import { removeAnimation, setAnimation } from "./animate.js";
import { createTheme, removeThemeToken, setThemeToken } from "./themes.js";
import {
  insertScene,
  insertStoryAction,
  removeStoryAction,
  renameInStories,
  setStoryTiming,
  storyDependents,
} from "./stories.js";
import {
  formatNumber,
  formatPoint,
  formatPoints,
  hasOnlyWhitespaceTrivia,
  isCommentTrivia,
  lineIndent,
  quoteString,
  sameNumber,
} from "./text.js";
import type {
  ApplyResult,
  Dependent,
  DependentKind,
  EditOperation,
  EditPlan,
  PlanOptions,
  PlanResult,
  VersionedDocument,
} from "./types.js";

export type OperationOf<K extends EditOperation["kind"]> = Extract<EditOperation, { kind: K }>;

/**
 * Turns a structured operation into minimal text edits against the compiled text.
 * Only the tokens that change are replaced; comments and formatting elsewhere are untouched.
 */
export function planEdit(
  compilation: Compilation,
  operation: EditOperation,
  options: PlanOptions = {},
): PlanResult {
  if (operation.kind === "batch") {
    return planBatch(compilation, operation.operations, { ...options, plan: planEdit });
  }
  try {
    const ctx: TextContext =
      "model" in operation
        ? createModelContext(createTextContext(compilation), operation.model)
        : "story" in operation || "theme" in operation || operation.kind === "createDiagram"
          ? createTextContext(compilation)
          : createContext(compilation, operation.diagram);
    const edits =
      "model" in operation
        ? runModel(ctx as ModelContext, operation)
        : "story" in operation
          ? runStory(ctx, operation)
          : "theme" in operation
            ? runTheme(ctx, operation)
            : operation.kind === "createDiagram"
              ? createDiagram(ctx, operation)
              : run(ctx as EditContext, operation);
    verifyResult(ctx, edits);
    const plan: EditPlan = {
      operation,
      baseRevision: options.revision ?? 0,
      edits,
      inverse: invertTextEdits(ctx.text, edits),
      notes: ctx.notes,
    };
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, rejection: error.rejection };
    throw error;
  }
}

/** Applies a plan to the document it was planned for, producing the next revision. */
export function applyEdits(
  document: VersionedDocument,
  plan: Pick<EditPlan, "baseRevision" | "edits">,
): ApplyResult {
  if (document.revision !== plan.baseRevision) {
    return {
      ok: false,
      rejection: {
        code: "edit.stale-revision",
        reason: reasons().targets.staleRevision(plan.baseRevision, document.revision),
      },
    };
  }
  return {
    ok: true,
    document: { text: applyTextEdits(document.text, plan.edits), revision: document.revision + 1 },
  };
}

/** The plan that undoes `plan` once it has been applied and produced `revision`. */
export function inversePlan(plan: EditPlan, revision: number): EditPlan {
  return { ...plan, baseRevision: revision, edits: plan.inverse, inverse: plan.edits, notes: [] };
}

type ModelOperation = Extract<EditOperation, { model: string }>;

function runModel(ctx: ModelContext, operation: ModelOperation): TextEdit[] {
  switch (operation.kind) {
    case "createEntity":
      return createEntity(ctx, operation);
    case "renameEntity":
      return renameEntity(ctx, operation);
    case "removeEntity":
      return removeEntity(ctx, operation);
    case "setEntityProperty":
      return setEntityProperty(ctx, operation);
    case "createModelRelation":
      return createModelRelation(ctx, operation);
    case "reconnectModelRelation":
      return reconnectModelRelation(ctx, operation);
    case "removeModelRelation":
      return removeModelRelation(ctx, operation);
    case "setModelRelationProperty":
      return setModelRelationProperty(ctx, operation);
  }
}

type StoryOperation = Extract<EditOperation, { story: string }>;

function runStory(ctx: TextContext, operation: StoryOperation): TextEdit[] {
  switch (operation.kind) {
    case "setStoryTiming":
      return setStoryTiming(ctx, operation);
    case "insertStoryAction":
      return insertStoryAction(ctx, operation);
    case "removeStoryAction":
      return removeStoryAction(ctx, operation);
    case "insertScene":
      return insertScene(ctx, operation);
  }
}

type ThemeOperation = Extract<EditOperation, { theme: string }>;

function runTheme(ctx: TextContext, operation: ThemeOperation): TextEdit[] {
  switch (operation.kind) {
    case "createTheme":
      return createTheme(ctx, operation);
    case "setThemeToken":
      return setThemeToken(ctx, operation);
    case "removeThemeToken":
      return removeThemeToken(ctx, operation);
  }
}

function run(
  ctx: EditContext,
  operation: Exclude<
    EditOperation,
    { kind: "batch" | "createDiagram" } | ModelOperation | StoryOperation | ThemeOperation
  >,
): TextEdit[] {
  if (["setPosition", "setSize", "setRoute", "arrange"].includes(operation.kind)) {
    refuseFlowGeometry(ctx, operation.kind);
  }
  // A move between groups and a conversion to a container explain their own refusal in C4 views.
  if (operation.kind !== "moveElement" && operation.kind !== "convertToContainer") {
    refuseInView(ctx, operation);
  }
  if (
    operation.kind === "setRelationLabel" &&
    ctx.diagram.type === "c4" &&
    !isCombination(ctx.diagram, operation.relation)
  ) {
    reject("edit.invalid-value", reasons().relations.modelLabel(operation.relation));
  }
  if (
    operation.kind === "removeRelation" &&
    ctx.diagram.type === "c4" &&
    !isCombination(ctx.diagram, operation.relation)
  ) {
    reject("edit.invalid-value", reasons().relations.modelRemove(operation.relation));
  }
  switch (operation.kind) {
    case "setPosition":
      return setPosition(ctx, operation);
    case "setSize":
      return setSize(ctx, operation);
    case "setRoute":
      return setRoute(ctx, operation);
    case "setLabelAnchor":
      return setLabelAnchor(ctx, operation);
    case "setRelationLabel":
      return setRelationLabel(ctx, operation);
    case "materializeRelationId":
      return materializeRelationId(ctx, operation);
    case "renameElement":
      return renameElement(ctx, operation);
    case "removeElement":
      return removeElement(ctx, operation);
    case "arrange":
      return arrange(ctx, operation);
    case "createElement":
      return createElement(ctx, operation);
    case "attachNote":
      return attachNote(ctx, operation);
    case "createRelation":
      return createRelation(ctx, operation);
    case "createLine":
      return createLine(ctx, operation);
    case "setLinePoints":
      return setLinePoints(ctx, operation);
    case "createPen":
      return createPen(ctx, operation);
    case "setPenPoints":
      return setPenPoints(ctx, operation);
    case "renameRelation":
      return renameRelation(ctx, operation);
    case "removeRelation":
      return removeRelation(ctx, operation);
    case "reconnectRelation":
      return reconnectRelation(ctx, operation);
    case "setRelationLine":
      return setRelationLine(ctx, operation);
    case "setElementLabel":
      return setElementLabel(ctx, operation);
    case "setDescription":
      return setDescription(ctx, operation);
    case "setElementKind":
      return setElementKind(ctx, operation);
    case "setClasses":
      return setClasses(ctx, operation);
    case "setStyleProperty":
      return setStyleProperty(ctx, operation);
    case "setAnimation":
      return setAnimation(ctx, operation);
    case "removeAnimation":
      return removeAnimation(ctx, operation);
    case "setDiagramProperty":
      return setDiagramProperty(ctx, operation);
    case "addPort":
      return addPort(ctx, operation);
    case "removePort":
      return removePort(ctx, operation);
    case "groupElements":
      return groupElements(ctx, operation);
    case "ungroup":
      return ungroup(ctx, operation);
    case "convertToContainer":
      return convertToContainer(ctx, operation);
    case "insertFragment":
      return insertFragment(ctx, operation);
    case "reorderElement":
      return reorderElement(ctx, operation);
    case "moveElement":
      return moveElement(ctx, operation);
    case "renameLayer":
      return renameLayer(ctx, operation);
    case "setElementProperty":
      return setElementProperty(ctx, operation);
    case "setElementSource":
      return setElementSource(ctx, operation);
    case "convertToFree":
      return convertToFree(ctx, operation);
    case "reorderParticipant":
      return reorderParticipant(ctx, operation);
    case "moveEvent":
      return moveEvent(ctx, operation);
    case "setSpacing":
      return setSpacing(ctx, operation);
    case "insertEvent":
      return insertEvent(ctx, operation);
    case "wrapInFragment":
      return wrapInFragment(ctx, operation);
    case "nestInCall":
      return nestInCall(ctx, operation);
    case "unnestCall":
      return unnestCall(ctx, operation);
    case "unwrapFragment":
      return unwrapFragment(ctx, operation);
    case "addBranch":
      return addBranch(ctx, operation);
    case "setFragmentCondition":
      return setFragmentCondition(ctx, operation);
    case "removeEvent":
      return removeEvent(ctx, operation);
    case "includeEntity":
      return includeEntity(ctx, operation);
    case "excludeEntity":
      return excludeEntity(ctx, operation);
    case "setLocalLabel":
      return setLocalLabel(ctx, operation);
    case "forgetModelRelation":
      return forgetModelRelation(ctx, operation);
    case "rewriteRouteEnd":
      return rewriteRouteEnd(ctx, operation);
    case "renameEvent":
      return renameEvent(ctx, operation);
    case "toggleActivation":
      return toggleActivation(ctx, operation);
    case "setEventText":
      return setEventText(ctx, operation);
    case "setNotePlacement":
      return setNotePlacement(ctx, operation);
    case "setFragmentOperator":
      return setFragmentOperator(ctx, operation);
  }
}

/** Safety net: a plan must never make the document syntactically worse. */
function verifyResult(ctx: TextContext, edits: readonly TextEdit[]): void {
  if (edits.length === 0) return;
  const count = (diagnostics: readonly { severity: string; code: string }[]) =>
    diagnostics.filter((d) => d.severity === "error").length;
  const before = count(ctx.compilation.parse.diagnostics);
  const after = count(parse(applyTextEdits(ctx.text, edits)).diagnostics);
  if (after > before) {
    reject("edit.unsafe-result", reasons().targets.unparsable);
  }
}

// ---------------------------------------------------------------------- placement

function findEntry<T extends PlacementEntry>(
  ctx: EditContext,
  statement: T["statement"],
  target: string,
): T | undefined {
  return ctx.diagram.placement.find(
    (p): p is T => p.statement === statement && p.target === target,
  );
}

/** Refuses to add a statement when an invalid one for the same target already exists. */
function guardInvalidStatement(ctx: EditContext, keyword: string, target: string): void {
  const recorded = new Set<CstNode>(ctx.diagram.placement.map((p) => p.node));
  for (const owner of ctx.diagram.placementBlocks) {
    for (const stmt of owner.block?.statements ?? []) {
      if (stmt.kind !== "KeywordStatement" || stmt.keyword.text !== keyword || recorded.has(stmt))
        continue;
      if (singleIdent(stmt.args[0])?.text !== target) continue;
      const line = ctx.compilation.parse.lines.location(stmt.start).line;
      reject("edit.unsafe-target", reasons().targets.invalidStatement(keyword, target, line));
    }
  }
}

function insertPlacement(ctx: EditContext, statement: string): TextEdit {
  const blocks = ctx.diagram.placementBlocks;
  const owner = blocks[blocks.length - 1];
  if (owner?.block) return insertStatement(ctx, owner.block, owner.start, () => statement);
  const body = ctx.diagram.block;
  if (!body) reject("edit.unsafe-target", reasons().targets.noBody(ctx.diagram.id));
  return insertStatement(
    ctx,
    body,
    ctx.diagram.node.start,
    (indent) =>
      indent === null
        ? `placement { ${statement} }`
        : `placement {${ctx.eol}${indent}${ctx.unit}${statement}${ctx.eol}${indent}}`,
    { blankLineBefore: true },
  );
}

function numberEdit(arg: Arg | undefined, value: number, suffix = ""): TextEdit[] {
  if (arg?.kind !== "NumberLiteral")
    reject("edit.unsafe-target", reasons().placement.expectedNumber);
  if (sameNumber(arg.value, value)) return [];
  return [{ start: arg.token.start, end: arg.token.end, newText: formatNumber(value) + suffix }];
}

function pointEdits(tuple: Arg | undefined, point: Point): TextEdit[] {
  if (tuple?.kind !== "Tuple") reject("edit.unsafe-target", reasons().placement.expectedPoint);
  const [x, y] = (tuple as Tuple).items;
  return [...numberEdit(x, point.x), ...numberEdit(y, point.y)];
}

export function setPosition(ctx: EditContext, op: OperationOf<"setPosition">): TextEdit[] {
  requireNumbers(op.x, op.y);
  refuseLine(requireElement(ctx, op.element));
  // Dragging a box in an automatic view switches it to `assisted` (decision 0015).
  const mode = assistedMode(ctx);
  const entry = findEntry<PlaceEntry>(ctx, "place", op.element);
  if (entry) return [...mode, ...pointEdits(entry.node.args[2], { x: op.x, y: op.y })];
  guardInvalidStatement(ctx, "place", op.element);
  return [
    ...mode,
    insertPlacement(ctx, `place ${op.element} at ${formatPoint({ x: op.x, y: op.y })}`),
  ];
}

/** A free line or a pen takes no `place` or `size`: its points are written in its statement. */
function refuseLine(element: Element): void {
  if (element.kind === "line") reject("edit.invalid-value", reasons().lines.points(element.id));
  if (element.kind === "pen") reject("edit.invalid-value", reasons().pens.points(element.id));
}

/** Edits that turn `layout auto`, written or implied, into `layout assisted`. */
function assistedMode(ctx: EditContext): TextEdit[] {
  if (ctx.diagram.properties.layout !== "auto") return [];
  const body = ctx.diagram.block;
  if (!body) reject("edit.unsafe-target", reasons().targets.noBody(ctx.diagram.id));
  for (const stmt of body.statements) {
    if (stmt.kind !== "KeywordStatement" || stmt.keyword.text !== "layout") continue;
    const value = stmt.args[0];
    if (value?.kind !== "QualifiedRef")
      reject("edit.unsafe-target", reasons().placement.layoutUnreadable);
    return [{ start: value.start, end: value.end, newText: "assisted" }];
  }
  // C4 views: after the statements that choose what the view draws.
  if (ctx.diagram.type === "c4") {
    const anchor = [...body.statements]
      .reverse()
      .find(
        (s) =>
          s.kind === "KeywordStatement" &&
          ["level", "scope", "include", "exclude"].includes(s.keyword.text),
      );
    if (anchor) return [insertAfter(ctx, body, anchor, () => "layout assisted")];
  }
  // No `layout` statement: insert one as the first line of the diagram body.
  const newline = body.children.find(
    (c): c is Token => isToken(c) && c.kind === "Newline" && c.start >= body.open.end,
  );
  const first = body.statements[0];
  if (!newline || (first && first.start < newline.start)) {
    return [{ start: body.open.end, end: body.open.end, newText: " layout assisted;" }];
  }
  const indent = first
    ? lineIndent(ctx.text, first.start)
    : lineIndent(ctx.text, ctx.diagram.node.start) + ctx.unit;
  return [
    { start: newline.start, end: newline.start, newText: `${ctx.eol}${indent}layout assisted` },
  ];
}

/**
 * Writes arranged positions as `place` statements and switches the diagram to `assisted`. A list
 * group places its children and grows with them, so its children get no `place` and it gets no
 * `size` from an arrangement. Free lines and pens hold their points in their statements and
 * refuse a `place`, so they get none either.
 */
function arrange(ctx: EditContext, op: OperationOf<"arrange">): TextEdit[] {
  const edits: TextEdit[] = [...assistedMode(ctx)];
  const inserted: string[] = [];
  for (const [id, point] of op.positions) {
    const element = requireElement(ctx, id);
    if (element.kind === "line" || element.kind === "pen") continue;
    if (isListGroup(ctx, element.groupPath[element.groupPath.length - 1])) continue;
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    requireNumbers(rounded.x, rounded.y);
    if (element.kind === "group") {
      const place = findEntry<PlaceEntry>(ctx, "place", id);
      const size = findEntry<SizeEntry>(ctx, "size", id);
      const box = element.list === null ? op.sizes?.get(id) : undefined;
      const dimensions = box ? { x: Math.round(box.width), y: Math.round(box.height) } : undefined;
      if (dimensions) requireNumbers(dimensions.x, dimensions.y);
      if (op.writeGroups) {
        // Free diagrams: every arranged group gets a place and a size.
        if (place) {
          if (op.scope === "all") edits.push(...pointEdits(place.node.args[2], rounded));
        } else {
          guardInvalidStatement(ctx, "place", id);
          inserted.push(`place ${id} at ${formatPoint(rounded)}`);
        }
        if (dimensions && (op.scope === "all" || !place)) {
          if (size) edits.push(...pointEdits(size.node.args[1], dimensions));
          else {
            guardInvalidStatement(ctx, "size", id);
            inserted.push(`size ${id} ${formatPoint(dimensions)}`);
          }
        }
        continue;
      }
      // Groups that fit their children need nothing; placed and sized ones follow them with `all`.
      if (op.scope !== "all") continue;
      if (place) edits.push(...pointEdits(place.node.args[2], rounded));
      if (size && dimensions) edits.push(...pointEdits(size.node.args[1], dimensions));
      continue;
    }
    const entry = findEntry<PlaceEntry>(ctx, "place", id);
    if (entry) {
      if (op.scope === "all") edits.push(...pointEdits(entry.node.args[2], rounded));
      continue;
    }
    guardInvalidStatement(ctx, "place", id);
    inserted.push(`place ${id} at ${formatPoint(rounded)}`);
  }
  if (op.scope === "all") {
    // The engine chooses again where connectors meet the boxes: compass sides and points go and
    // named ports stay; the bends it drew become the waypoints, and a route left with nothing goes.
    const emptied: CstNode[] = [];
    const routed = new Set<string>();
    for (const entry of ctx.diagram.placement) {
      if (entry.statement !== "route") continue;
      routed.add(entry.target);
      const via = bendsOf(op.routes?.get(entry.target));
      if (!entry.from.named && !entry.to.named && via.length === 0) {
        emptied.push(entry.node);
        continue;
      }
      const parts = routeParts(entry.node);
      const free = (ref: Arg | undefined, at: Arg | undefined, end: RouteEntry["from"]) => {
        if (end.named || !ref) return;
        const stop = (at ?? ref).end;
        if (ctx.text.slice(ref.start, stop) !== end.element)
          edits.push({ start: ref.start, end: stop, newText: end.element });
      };
      free(parts.fromRef, parts.fromAt, entry.from);
      free(parts.toRef, parts.toAt, entry.to);
      const after = (parts.toAt ?? parts.toRef!).end;
      if (via.length > 0) {
        const list = formatPoints(via);
        if (!parts.viaList) edits.push({ start: after, end: after, newText: ` via ${list}` });
        else if (ctx.text.slice(parts.viaList.start, parts.viaList.end) !== list)
          edits.push({ start: parts.viaList.start, end: parts.viaList.end, newText: list });
      } else if (parts.viaList) {
        edits.push({ start: after, end: parts.viaList.end, newText: "" });
      }
    }
    // Relations the engine bent that have no route get one, named first when anonymous.
    const named = new Set<string>();
    for (const relation of ctx.diagram.relations) {
      if (routed.has(relation.key)) continue;
      const via = bendsOf(op.routes?.get(relation.key));
      if (via.length === 0) continue;
      let id = relation.id;
      if (id === null) {
        // C4 views take their relations from the model, where they are named.
        if (ctx.diagram.type === "c4" || !relation.node) continue;
        id = relationId(ctx, relation, named);
        const anchor = relationNameAnchor(relation);
        edits.push({ start: anchor, end: anchor, newText: ` as ${id}` });
      }
      guardInvalidStatement(ctx, "route", relation.key);
      inserted.push(`route ${id} from ${relation.from} to ${relation.to} via ${formatPoints(via)}`);
    }
    if (emptied.length > 0) {
      edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, emptied));
      if (inserted.length > 0) {
        // The new places go where the removed routes were: they are inserted into the text the
        // other edits leave, and both are composed into one set of edits.
        const after = compile(applyTextEdits(ctx.text, edits), ctx.compilation.options);
        const next = createContext(after, ctx.diagram.id);
        return composeEdits(ctx.text, edits, [insertPlacements(next, inserted)]);
      }
    }
  }
  if (inserted.length > 0) {
    // One insertion keeps the statements together, one per line, in arrangement order.
    edits.push(insertPlacements(ctx, inserted));
  }
  return edits;
}

/**
 * The bends of drawn points, between their ends, rounded to whole units, without repeated points
 * or points in line with their neighbours.
 */
function bendsOf(points: readonly Point[] | undefined): Point[] {
  if (!points || points.length < 3) return [];
  const rounded = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const kept: Point[] = [];
  for (const point of rounded) {
    const last = kept[kept.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    kept.push(point);
  }
  const bends: Point[] = [];
  for (let i = 1; i < kept.length - 1; i++) {
    const [a, b, c] = [bends[bends.length - 1] ?? kept[0]!, kept[i]!, kept[i + 1]!];
    const inLine = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!inLine) bends.push(b);
  }
  for (const bend of bends) requireNumbers(bend.x, bend.y);
  return bends;
}

/** A relation id not used in the diagram nor given in this edit: `<from>_<to>`, then `_2`… */
function relationId(ctx: EditContext, relation: Relation, taken: Set<string>): string {
  const base = `${relation.from}_${relation.to}`.replace(/\./g, "_");
  const used = usedIds(ctx);
  let id = base;
  for (let n = 2; used.has(id) || taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
}

/** Inserts several placement statements at once, one per line, or `; `-joined in one-line blocks. */
export function insertPlacements(ctx: EditContext, statements: readonly string[]): TextEdit {
  const blocks = ctx.diagram.placementBlocks;
  const owner = blocks[blocks.length - 1];
  const join = (indent: string | null) =>
    indent === null ? statements.join("; ") : statements.join(`${ctx.eol}${indent}`);
  if (owner?.block) return insertStatement(ctx, owner.block, owner.start, join);
  const body = ctx.diagram.block;
  if (!body) reject("edit.unsafe-target", reasons().targets.noBody(ctx.diagram.id));
  return insertStatement(
    ctx,
    body,
    ctx.diagram.node.start,
    (indent) =>
      indent === null
        ? `placement { ${statements.join("; ")} }`
        : `placement {${ctx.eol}${indent}${ctx.unit}${statements.join(`${ctx.eol}${indent}${ctx.unit}`)}${ctx.eol}${indent}}`,
    { blankLineBefore: true },
  );
}

export function setSize(ctx: EditContext, op: OperationOf<"setSize">): TextEdit[] {
  requireNumbers(op.width, op.height);
  if (op.width <= 0 || op.height <= 0) reject("edit.invalid-value", reasons().values.positiveSize);
  refuseLine(requireElement(ctx, op.element));
  const entry = findEntry<SizeEntry>(ctx, "size", op.element);
  if (entry) return pointEdits(entry.node.args[1], { x: op.width, y: op.height });
  guardInvalidStatement(ctx, "size", op.element);
  return [insertPlacement(ctx, `size ${op.element} ${formatPoint({ x: op.width, y: op.height })}`)];
}

function setRoute(ctx: EditContext, op: OperationOf<"setRoute">): TextEdit[] {
  const relation = requireNamedRelation(ctx, op.relation);
  // Compass ports, `auto`, or the named ports of the relation's ends; a point needs a compass side.
  if (op.from) requirePortOf(ctx, relation.from, op.from);
  if (op.to) requirePortOf(ctx, relation.to, op.to);
  if (op.fromPosition !== undefined) requireEndPosition(op.from, op.fromPosition);
  if (op.toPosition !== undefined) requireEndPosition(op.to, op.toPosition);
  for (const point of op.via) requireNumbers(point.x, point.y);
  const entry = findEntry<RouteEntry>(ctx, "route", relation.key);
  if (entry) {
    const parts = routeParts(entry.node);
    const edits: TextEdit[] = [];
    const endEdit = (
      ref: Arg | undefined,
      at: Arg | undefined,
      element: string,
      port: string | null | undefined,
      position: number | undefined,
    ) => {
      if (port === undefined) return;
      if (ref?.kind !== "QualifiedRef")
        reject("edit.unsafe-target", reasons().placement.expectedEndpoint);
      const text = endpointText(element, port, position);
      const end = (at ?? ref!).end;
      if (ctx.text.slice(ref!.start, end) !== text)
        edits.push({ start: ref!.start, end, newText: text });
    };
    endEdit(parts.fromRef, parts.fromAt, relation.from, op.from, op.fromPosition);
    endEdit(parts.toRef, parts.toAt, relation.to, op.to, op.toPosition);
    // An end handed back to the layout, or the last bend removed, may leave nothing to keep: then
    // the route goes.
    const free = (
      port: string | null | undefined,
      position: number | undefined,
      written: RouteEntry["from"],
    ) =>
      port === undefined
        ? written.port === "auto" && written.position === undefined
        : port === null || (port === "auto" && position === undefined);
    const emptied = entry.via.length > 0 && op.via.length === 0;
    if (
      (op.from === null || op.to === null || emptied) &&
      free(op.from, op.fromPosition, entry.from) &&
      free(op.to, op.toPosition, entry.to) &&
      op.via.length === 0
    ) {
      return deleteStatements(ctx.text, ctx.compilation.parse.root, [entry.node]);
    }
    const samePoints =
      entry.via.length === op.via.length &&
      entry.via.every((p, i) => sameNumber(p.x, op.via[i]!.x) && sameNumber(p.y, op.via[i]!.y));
    if (!samePoints) {
      if (parts.viaList && op.via.length === 0) {
        // No bends left: ` via [...]` goes.
        const after = (parts.toAt ?? parts.toRef!).end;
        edits.push({ start: after, end: parts.viaList.end, newText: "" });
      } else if (parts.viaList)
        edits.push({
          start: parts.viaList.start,
          end: parts.viaList.end,
          newText: formatPoints(op.via),
        });
      else if (op.via.length > 0) {
        const after = (parts.toAt ?? parts.toRef!).end;
        edits.push({ start: after, end: after, newText: ` via ${formatPoints(op.via)}` });
      }
    }
    return edits;
  }
  // Nothing to write for ends the layout chooses and no waypoints.
  const freeEnd = (port: string | null | undefined, position: number | undefined) =>
    (port === null || port === undefined || port === "auto") && position === undefined;
  if (
    (op.from === null || op.to === null) &&
    freeEnd(op.from, op.fromPosition) &&
    freeEnd(op.to, op.toPosition) &&
    op.via.length === 0
  )
    return [];
  guardInvalidStatement(ctx, "route", relation.key);
  const via = op.via.length > 0 ? ` via ${formatPoints(op.via)}` : "";
  const from = endpointText(
    relation.from,
    op.from === undefined ? "auto" : op.from,
    op.fromPosition,
  );
  const to = endpointText(relation.to, op.to === undefined ? "auto" : op.to, op.toPosition);
  return [insertPlacement(ctx, `route ${relation.key} from ${from} to ${to}${via}`)];
}

function setLabelAnchor(ctx: EditContext, op: OperationOf<"setLabelAnchor">): TextEdit[] {
  // A free line's pill is placed as a relation's, by the line's id.
  const line = ctx.diagram.elementsById.get(op.relation);
  const relation =
    line?.kind === "line" ? { key: line.id } : requireNamedRelation(ctx, op.relation);
  requireNumbers(op.at, op.offset.x, op.offset.y);
  if (op.at < 0 || op.at > 100) reject("edit.invalid-value", reasons().placement.labelPosition);
  const hasOffset = !sameNumber(op.offset.x, 0) || !sameNumber(op.offset.y, 0);
  const entry = findEntry<LabelEntry>(ctx, "label", relation.key);
  if (entry) {
    const [, , percentage, , offsetTuple] = entry.node.args;
    const edits = numberEdit(percentage, op.at, "%");
    if (offsetTuple) edits.push(...pointEdits(offsetTuple, op.offset));
    else if (hasOffset) {
      edits.push({
        start: percentage!.end,
        end: percentage!.end,
        newText: ` offset ${formatPoint(op.offset)}`,
      });
    }
    return edits;
  }
  guardInvalidStatement(ctx, "label", relation.key);
  const offset = hasOffset ? ` offset ${formatPoint(op.offset)}` : "";
  return [insertPlacement(ctx, `label ${relation.key} at ${formatNumber(op.at)}%${offset}`)];
}

// ---------------------------------------------------------------------- relations

function setRelationLabel(ctx: EditContext, op: OperationOf<"setRelationLabel">): TextEdit[] {
  const relation = requireNamedRelation(ctx, op.relation);
  const node = relation.node;
  if (node.kind === "KeywordStatement") {
    // A `return`'s label is the string right after the keyword.
    const span = relationLabelSpan(relation);
    if (op.label === null)
      return span ? [{ start: node.keyword.end, end: span.end, newText: "" }] : [];
    const text = quoteString(op.label);
    if (!span) return [{ start: node.keyword.end, end: node.keyword.end, newText: ` ${text}` }];
    return ctx.text.slice(span.start, span.end) === text
      ? []
      : [{ start: span.start, end: span.end, newText: text }];
  }
  const label = node.label && isToken(node.label) ? node.label : undefined;
  if (op.label === null) {
    if (!label || !node.colon) return [];
    const start = hasOnlyWhitespaceTrivia(node.colon) ? node.colon.fullStart : node.colon.start;
    return [{ start, end: label.end, newText: "" }];
  }
  const quoted = quoteString(op.label);
  if (label)
    return label.text === quoted ? [] : [{ start: label.start, end: label.end, newText: quoted }];
  const end = node.target.end;
  return [{ start: end, end, newText: `: ${quoted}` }];
}

export function requireNewId(ctx: EditContext, id: string): void {
  if (!isIdentifierText(id)) {
    reject("edit.invalid-id", reasons().ids.invalid(id));
  }
  const relation = ctx.diagram.relationsByKey.get(id);
  const event = ctx.diagram.eventsByKey.get(id);
  if (
    ctx.diagram.elementsById.has(id) ||
    (relation && relation.id === id) ||
    (event && event.id === id)
  ) {
    reject("edit.id-conflict", reasons().ids.usedInDiagram(id, ctx.diagram.id));
  }
}

function materializeRelationId(
  ctx: EditContext,
  op: OperationOf<"materializeRelationId">,
): TextEdit[] {
  const relation = ctx.diagram.relationsByKey.get(op.relationKey);
  if (!relation)
    reject("edit.unsafe-target", reasons().relations.missing(op.relationKey, ctx.diagram.id));
  if (relation.id !== null)
    reject("edit.already-named", reasons().relations.alreadyNamed(relation.id));
  // A C4 view names its own combinations; the relations it draws from the model are named there.
  if (ctx.diagram.type === "c4" && !ctx.diagram.c4?.combined.includes(relation.key)) {
    reject("edit.unsafe-target", reasons().c4.nameInModel(relation.key));
  }
  requireNewId(ctx, op.id);
  const anchor = relationNameAnchor(relation);
  return [{ start: anchor, end: anchor, newText: ` as ${op.id}` }];
}

// ---------------------------------------------------------------------- rename

function renameElement(ctx: EditContext, op: OperationOf<"renameElement">): TextEdit[] {
  requireElement(ctx, op.element);
  if (op.newId === op.element) return [];
  requireNewId(ctx, op.newId);
  const tokens = new Map<number, Token>();
  for (const reference of ctx.diagram.references) {
    if (reference.targetKind === "element" && reference.target === op.element) {
      tokens.set(reference.token.start, reference.token);
    }
  }
  noteComments(ctx, ctx.diagram.node, new RegExp(`\\b${op.element}\\b`), (line) =>
    messages().notes.commentMentions(line, op.element),
  );
  return [
    ...[...tokens.values()].map((t) => ({ start: t.start, end: t.end, newText: op.newId })),
    ...renameLinks(ctx, op.element, op.newId),
    ...renameInStories(ctx.compilation, ctx.diagram.id, op.element, op.newId, "element"),
  ];
}

/** Edits that remove the items at `removed` indices from a comma-separated argument list. */
export function removeListItems(args: readonly Arg[], removed: ReadonlySet<number>): TextEdit[] {
  const edits: TextEdit[] = [];
  let i = 0;
  while (i < args.length) {
    if (!removed.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < args.length && removed.has(j + 1)) j++;
    if (j === args.length - 1) {
      // A removed suffix is cut from the end of the last kept item, comma included.
      edits.push({ start: args[i - 1]!.end, end: args[j]!.end, newText: "" });
    } else {
      edits.push({ start: args[i]!.start, end: args[j + 1]!.start, newText: "" });
    }
    i = j + 1;
  }
  return edits;
}

function noteComments(
  ctx: EditContext,
  scope: CstNode | { start: number; end: number },
  pattern: RegExp | null,
  message: (line: number, text: string) => string,
): void {
  const inScope = (start: number, end: number) => start >= scope.start && end <= scope.end;
  for (const token of tokensOf(ctx.compilation.parse.root)) {
    for (const trivia of token.leadingTrivia) {
      if (!isCommentTrivia(trivia) || !inScope(trivia.start, trivia.end)) continue;
      if (pattern && !pattern.test(trivia.text)) continue;
      ctx.notes.push(message(ctx.compilation.parse.lines.location(trivia.start).line, trivia.text));
    }
  }
}

// ---------------------------------------------------------------------- remove

function removeElement(ctx: EditContext, op: OperationOf<"removeElement">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  const diagram = ctx.diagram;
  const lines = ctx.compilation.parse.lines;
  const removedElements = new Set<string>([element.id]);
  for (const other of diagram.elements) {
    if (other.groupPath.includes(element.id)) removedElements.add(other.id);
  }
  const removedRelations = diagram.relations.filter(
    (r) =>
      removedElements.has(r.from) ||
      removedElements.has(r.to) ||
      r.groupPath.some((g) => removedElements.has(g)),
  );
  // A call goes with the events of its block: its messages and returns, notes and fragments.
  const nested = nestedInCalls(ctx, new Set(removedRelations.map((r) => r.key)));
  for (const event of nested) {
    if (event.kind !== "message") continue;
    const relation = diagram.relationsByKey.get(event.relation)!;
    if (!removedRelations.includes(relation)) removedRelations.push(relation);
  }
  const removedRelationIds = new Set(
    removedRelations.flatMap((r) => (r.id === null ? [] : [r.id])),
  );

  const statements: CstNode[] = [];
  const dependents: Dependent[] = [];
  const depend = (kind: DependentKind, name: string, node: CstNode) => {
    statements.push(node);
    const line = lines.location(node.start).line;
    dependents.push({
      kind,
      name,
      description: messages().dependents.statement(kind, name, line),
      range: lines.range(node),
    });
  };

  if (element.node) statements.push(element.node);
  for (const other of diagram.elements) {
    if (other.id !== element.id && removedElements.has(other.id) && other.node)
      depend("element", other.id, other.node);
  }
  // A note attached to what goes stays, without its clause: its text is the person's words.
  const attachmentEdits: TextEdit[] = [];
  for (const other of diagram.elements) {
    if (other.attachedTo === null || removedElements.has(other.id)) continue;
    if (!removedElements.has(other.attachedTo)) continue;
    const attached = attachmentDependent(ctx, other);
    if (!attached) continue;
    dependents.push(attached.dependent);
    attachmentEdits.push(attached.edit);
  }
  for (const relation of removedRelations) depend("relation", relation.key, relation.node);
  for (const entry of diagram.placement) {
    const target =
      entry.statement === "place" || entry.statement === "size" || entry.statement === "gap"
        ? removedElements
        : removedRelationIds;
    // A free line's label pill is placed by a `label` statement as a relation's is.
    const lineLabel = entry.statement === "label" && removedElements.has(entry.target);
    if (target.has(entry.target) || lineLabel) depend(entry.statement, entry.target, entry.node);
  }
  const removedEvents = [
    ...new Set([
      ...participantEvents(ctx, removedElements),
      ...nested.filter((e) => e.kind !== "message"),
    ]),
  ];
  const removedEventIds = eventIdsOf(removedEvents);
  for (const scenario of diagram.scenarios) {
    for (const choice of scenario.choices) {
      if (removedEventIds.has(choice.fragment)) depend("event", choice.fragment, choice.node);
    }
  }
  for (const event of removedEvents) {
    depend("event", event.key, event.node);
    if (event.id !== null) {
      for (const entry of diagram.placement) {
        if (entry.statement === "space" && entry.target === event.id)
          depend("space", entry.target, entry.node);
      }
    }
  }
  // A style or animate statement that lists several targets keeps its statement and loses only
  // the removed targets; it is deleted whole when no target would remain.
  const partial = new Map<(typeof diagram.styles)[number]["node"], Set<number>>();
  for (const entry of [...diagram.styles, ...diagram.animations]) {
    const target =
      entry.targetKind === "element"
        ? removedElements
        : entry.targetKind === "event"
          ? removedEventIds
          : removedRelationIds;
    if (!target.has(entry.target)) continue;
    const kind: DependentKind = "properties" in entry ? "style" : "animate";
    const index = entry.node.args.findIndex((arg) => arg.start === entry.targetRange.start.offset);
    if (entry.node.args.length > 1 && index >= 0) {
      const set = partial.get(entry.node) ?? new Set<number>();
      set.add(index);
      partial.set(entry.node, set);
      const line = lines.location(entry.node.start).line;
      dependents.push({
        kind,
        name: entry.target,
        description: messages().dependents.statement(kind, entry.target, line),
        range: lines.range(entry.node),
      });
    } else {
      depend(kind, entry.target, entry.node);
    }
  }
  for (const [node, indices] of [...partial]) {
    if (indices.size === node.args.length) {
      statements.push(node);
      partial.delete(node);
    }
  }
  // A constraint loses the removed elements, and is deleted whole when it would be left with
  // fewer than two, or is a `distance`, which needs exactly its two.
  const constraintEdits: TextEdit[] = [];
  for (const constraint of diagram.constraints) {
    const removed = new Set(
      constraint.targets.flatMap((target, i) => (removedElements.has(target) ? [i] : [])),
    );
    if (removed.size === 0) continue;
    if (constraint.kind === "distance" || constraint.targets.length - removed.size < 2) {
      depend("constraint", constraint.kind, constraint.node);
      continue;
    }
    // The targets come first; the edge, axis or gap after them stays.
    const targets = constraint.node.args.slice(0, constraint.targets.length);
    constraintEdits.push(...removeListItems(targets, removed));
    const line = lines.location(constraint.node.start).line;
    dependents.push({
      kind: "constraint",
      name: constraint.kind,
      description: messages().dependents.statement("constraint", constraint.kind, line),
      range: lines.range(constraint.node),
    });
  }

  const links = removedLinks(ctx, removedElements);
  dependents.push(...links.dependents);
  const stories = storyDependents(
    ctx.compilation,
    diagram.id,
    new Set([...removedElements, ...removedRelationIds, ...removedEventIds]),
  );
  dependents.push(...stories.dependents);

  if (!op.cascade && dependents.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().elements.usedBy(element.id, dependents.length),
      dependents.sort((a, b) => a.range.start.offset - b.range.start.offset),
    );
  }

  // An implicit element exists only through the relations that mention it. When all of them are
  // removed, keep the element by replacing its first relation with an explicit declaration.
  const keep = new Map<CstNode, string[]>();
  for (const other of diagram.elements) {
    if (!other.implicit || removedElements.has(other.id)) continue;
    const mentions = diagram.relations.filter((r) => r.from === other.id || r.to === other.id);
    if (mentions.length === 0 || !mentions.every((r) => removedRelations.includes(r))) continue;
    // The declaration replaces the outermost removed statement around the first mention: a
    // message inside a removed call goes with the call.
    const first = mentions[0]!.node;
    const anchor = removedRelations
      .map((r) => r.node)
      .filter((n) => n.start <= first.start && first.end <= n.end)
      .reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a), first);
    keep.set(anchor, [...(keep.get(anchor) ?? []), other.id]);
    ctx.notes.push(messages().notes.keptElement(other.id, other.kind));
  }

  const edits = deleteStatements(
    ctx.text,
    ctx.compilation.parse.root,
    statements.filter((s) => ![...keep.keys()].some((k) => k.start <= s.start && s.end <= k.end)),
  );
  for (const [node, indices] of partial) edits.push(...removeListItems(node.args, indices));
  edits.push(...constraintEdits);
  edits.push(...attachmentEdits);
  edits.push(...links.edits);
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, stories.statements));
  edits.push(...stories.edits);
  for (const edit of edits) {
    noteComments(ctx, edit, null, (line, text) =>
      messages().notes.removedComment(line, text.trim()),
    );
  }
  for (const [anchor, ids] of keep) {
    edits.push({
      start: anchor.start,
      end: anchor.end,
      newText: ids.map((id) => `${diagram.elementsById.get(id)!.kind} ${id}`).join("; "),
    });
  }
  return edits;
}
