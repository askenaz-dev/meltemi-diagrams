import {
  applyTextEdits,
  isIdentifierText,
  isToken,
  type Block,
  type CstNode,
  type KeywordStatement,
  type Statement,
  type TextEdit,
  type Trivia,
} from "@meltemi/diagrams-language";
import {
  MAIN_LAYER,
  PORTS,
  compile,
  type Element,
  type FlowDiagram,
  type RouteEntry,
} from "@meltemi/diagrams-model";
import { composeEdits } from "./batch.js";
import {
  createContext,
  insertStatement,
  isListGroup,
  reject,
  requireElement,
  requireIndex,
  requireNumbers,
  type EditContext,
} from "./context.js";
import { declarationText } from "./create.js";
import { deleteStatements } from "./delete.js";
import { storyDependents } from "./stories.js";
import {
  DIAGRAM_PROPERTY_KEYWORDS,
  GROUP_OWN_KEYWORDS,
  commentsAbove,
  diagramBody,
  groupBlock,
  insertBefore,
  insertDeclaration,
  insertIntoBlock,
  isDeclaration,
  isKeyword,
  reindent,
  verifyNoNewErrors,
} from "./insert.js";
import { blockOfParent, ownLines, removedLinks } from "./free.js";
import { messages, reasons } from "./messages/index.js";
import {
  insertPlacements,
  removeListItems,
  requireNewId,
  setPosition,
  setSize,
  type OperationOf,
} from "./plan.js";
import { setDiagramProperty, setStyleProperty } from "./styles.js";
import type { Dependent } from "./types.js";
import { isCommentTrivia, lineIndent, lineStart, quoteString } from "./text.js";

// ---------------------------------------------------------------------- ports

export function addPort(ctx: EditContext, op: OperationOf<"addPort">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  if (!isIdentifierText(op.name) || (PORTS as readonly string[]).includes(op.name)) {
    reject("edit.invalid-id", reasons().ports.invalidName(op.name));
  }
  if (element.ports.some((p) => p.name === op.name)) {
    reject("edit.id-conflict", reasons().ports.exists(op.element, op.name));
  }
  const position = op.position ?? 0.5;
  if (!(position >= 0 && position <= 1)) {
    reject("edit.invalid-value", reasons().ports.position);
  }
  const percent = Math.round(position * 100);
  const text = `port ${op.name} ${op.side}${percent === 50 ? "" : ` ${percent}%`}`;
  const node = element.node;
  if (!node) reject("edit.unsafe-target", reasons().ports.declareFirst(op.element));
  const edits: TextEdit[] = node.block
    ? [insertStatement(ctx, node.block, node.start, () => text)]
    : [{ start: node.end, end: node.end, newText: ` { ${text} }` }];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

function routesUsingPort(ctx: EditContext, element: string, port: string): RouteEntry[] {
  return ctx.diagram.placement.filter(
    (p): p is RouteEntry =>
      p.statement === "route" &&
      [p.from, p.to].some((end) => end.element === element && end.named && end.port === port),
  );
}

export function removePort(ctx: EditContext, op: OperationOf<"removePort">): TextEdit[] {
  const element = requireElement(ctx, op.element);
  const block = element.node?.block;
  const statement = block?.statements.find(
    (s) => isKeyword(s, "port") && s.args[0]?.kind === "QualifiedRef" && s.args[0].text === op.name,
  );
  if (!block || !statement) {
    reject("edit.unsafe-target", reasons().ports.missing(op.element, op.name));
  }
  const routes = routesUsingPort(ctx, op.element, op.name);
  if (routes.length > 0) {
    const lines = ctx.compilation.parse.lines;
    const dependents: Dependent[] = routes.map((r) => ({
      kind: "route",
      name: r.target,
      description: messages().dependents.statement(
        "route",
        r.target,
        lines.location(r.node.start).line,
      ),
      range: lines.range(r.node),
    }));
    reject("edit.has-dependents", reasons().ports.usedByRoutes(op.name, routes.length), dependents);
  }
  if (block.statements.length === 1)
    return [{ start: block.fullStart, end: block.end, newText: "" }];
  return deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
}

// ---------------------------------------------------------------------- groups

export function groupElements(ctx: EditContext, op: OperationOf<"groupElements">): TextEdit[] {
  if (op.elements.length === 0) reject("edit.unsafe-target", reasons().groups.select);
  requireNewId(ctx, op.id);
  const elements = op.elements.map((id) => requireElement(ctx, id));
  const parent = (e: (typeof elements)[number]) => e.groupPath[e.groupPath.length - 1] ?? null;
  const owner = parent(elements[0]!);
  if (elements.some((e) => parent(e) !== owner)) {
    reject("edit.unsafe-target", reasons().groups.sameGroup);
  }
  const declared = elements
    .filter((e) => e.node)
    .map((e) => e.node as Statement)
    .sort((a, b) => a.start - b.start);
  const implicit = elements.filter((e) => !e.node);
  const first = declared[0];
  const base = first ? lineIndent(ctx.text, first.start) : "";
  const inner = base + ctx.unit;
  const body = [
    ...declared.map((s) =>
      reindent(ctx.text.slice(s.start, s.end), lineIndent(ctx.text, s.start), inner),
    ),
    ...implicit.map((e) => declarationText(e.kind, e.id, e.label, ctx.diagram.type)),
  ];
  const text = (indent: string | null) =>
    indent === null
      ? `group ${op.id} ${quoteString(op.label)} { ${body.join("; ")} }`
      : `group ${op.id} ${quoteString(op.label)} {${ctx.eol}${body
          .map((line) => indent + ctx.unit + line)
          .join(ctx.eol)}${ctx.eol}${indent}}`;
  if (!first) {
    // Only implicit elements: the group goes where a declaration would.
    const { block, start } = ownerBlock(ctx, owner);
    return [insertDeclaration(ctx, block, start, text)];
  }
  const edits: TextEdit[] = [{ start: first.start, end: first.end, newText: text(base) }];
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, declared.slice(1)));
  return edits;
}

function ownerBlock(ctx: EditContext, group: string | null) {
  if (group === null) return { block: diagramBody(ctx), start: ctx.diagram.node.start };
  const node = requireElement(ctx, group).node as KeywordStatement;
  if (!node.block) reject("edit.unsafe-target", reasons().groups.noBlock(group));
  return { block: node.block, start: node.start };
}

export function ungroup(ctx: EditContext, op: OperationOf<"ungroup">): TextEdit[] {
  const group = requireElement(ctx, op.group);
  const node = group.node;
  if (group.kind !== "group" || node?.kind !== "KeywordStatement") {
    reject("edit.unsafe-target", reasons().groups.notGroup(op.group));
  }
  const lines = ctx.compilation.parse.lines;
  const users = ctx.diagram.relations.filter((r) => r.from === op.group || r.to === op.group);
  if (users.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().groups.endOfRelations(op.group, users.length),
      users.map((r) => ({
        kind: "relation",
        name: r.key,
        description: messages().dependents.statement(
          "relation",
          r.key,
          lines.location(r.node.start).line,
        ),
        range: lines.range(r.node),
      })),
    );
  }
  // The group's own statements go with it, a list's arrangement included.
  const own = (s: Statement) => isKeyword(s, ...GROUP_OWN_KEYWORDS);
  const children = (node.block?.statements ?? []).filter((s) => !own(s));
  const indent = lineIndent(ctx.text, node.start);
  const texts = children.map((s) =>
    reindent(ctx.text.slice(s.start, s.end), lineIndent(ctx.text, s.start), indent),
  );
  const edits: TextEdit[] = [];
  const removed: CstNode[] = [];
  if (texts.length === 0) removed.push(node);
  else edits.push({ start: node.start, end: node.end, newText: texts.join(ctx.eol + indent) });
  for (const entry of ctx.diagram.placement) {
    if ((entry.statement === "place" || entry.statement === "size") && entry.target === op.group) {
      removed.push(entry.node);
    }
  }
  const partial = new Map<KeywordStatement, Set<number>>();
  for (const entry of [...ctx.diagram.styles, ...ctx.diagram.animations]) {
    if (entry.targetKind !== "element" || entry.target !== op.group) continue;
    const index = entry.node.args.findIndex((a) => a.start === entry.targetRange.start.offset);
    const set = partial.get(entry.node) ?? new Set<number>();
    if (index >= 0) set.add(index);
    partial.set(entry.node, set);
  }
  for (const [statement, indices] of partial) {
    if (indices.size >= statement.args.length) removed.push(statement);
    else edits.push(...removeListItems(statement.args, indices));
  }
  // Story actions that name the group would name nothing: the group leaves their targets, and an
  // action left without targets goes, as when an element is removed.
  const stories = storyDependents(ctx.compilation, ctx.diagram.id, new Set([op.group]));
  removed.push(...stories.statements);
  edits.push(...stories.edits);
  if (stories.dependents.length > 0) {
    ctx.notes.push(messages().notes.removedStoryTargets(stories.dependents.length, op.group));
  }
  edits.push(...deleteStatements(ctx.text, ctx.compilation.parse.root, removed));
  // Links of other diagrams to the group would point to nothing; they go with it.
  const links = removedLinks(ctx, new Set([op.group]));
  if (links.dependents.length > 0) {
    edits.push(...links.edits);
    ctx.notes.push(messages().notes.removedLinks(links.dependents.length, op.group));
  }
  return edits;
}

// ---------------------------------------------------------------------- reparenting

/**
 * Turns a flow node or a free box into a container: its styles lose `shape` (`square` and
 * `rectangle` become `radius 0`) while it is still a box, its declaration becomes a group, the
 * children move in, and the group gets the size it is drawn with when it had none. Each step is
 * planned on the text the previous ones leave.
 */
export function convertToContainer(
  ctx: EditContext,
  op: OperationOf<"convertToContainer">,
): TextEdit[] {
  const type = ctx.diagram.type;
  if (type !== "flow" && type !== "free") {
    reject("edit.unsafe-target", reasons().groups.containerProfile);
  }
  const element = requireElement(ctx, op.element);
  if (element.kind !== (type === "free" ? "box" : "node")) {
    reject("edit.unsafe-target", reasons().groups.containerKind(element.id, element.kind));
  }
  if (!element.node) reject("edit.unsafe-target", reasons().groups.containerImplicit(element.id));
  if (element.ports.length > 0) {
    reject(
      "edit.has-dependents",
      reasons().groups.containerPorts(
        element.id,
        element.ports.map((p) => p.name),
      ),
    );
  }
  const parentOf = (e: Element) => e.groupPath[e.groupPath.length - 1] ?? null;
  for (const child of op.children) {
    const found = requireElement(ctx, child.id);
    if (child.id === element.id || parentOf(found) !== parentOf(element)) {
      reject("edit.unsafe-target", reasons().groups.containerChild(child.id, element.id));
    }
    if (child.at) requireNumbers(child.at.x, child.at.y);
  }
  if (op.size) requireNumbers(op.size.width, op.size.height);

  const written = ctx.diagram.styles.filter(
    (e) => e.target === element.id && e.targetKind === "element",
  );
  const shape = written.map((e) => e.properties.shape).find((v) => v !== undefined);
  const hasRadius = written.some((e) => e.properties.radius !== undefined);
  const hasSize = ctx.diagram.placement.some(
    (p) => p.statement === "size" && p.target === element.id,
  );
  const style =
    (property: string, value: string | number | null) =>
    (c: EditContext): TextEdit[] =>
      setStyleProperty(c, {
        kind: "setStyleProperty",
        diagram: op.diagram,
        target: element.id,
        targetKind: "element",
        property,
        value,
      });
  const steps: ((c: EditContext) => TextEdit[])[] = [];
  if (shape !== undefined) {
    // Groups are rectangles: square corners stay square, other shapes go.
    if ((shape === "square" || shape === "rectangle") && !hasRadius) steps.push(style("radius", 0));
    steps.push(style("shape", null));
  }
  steps.push((c) => containerDeclaration(c, c.diagram.elementsById.get(element.id)!));
  for (const child of op.children) {
    steps.push((c) =>
      moveElement(c, {
        kind: "moveElement",
        diagram: op.diagram,
        element: child.id,
        parent: element.id,
        ...(child.at ? { at: child.at } : {}),
      }),
    );
  }
  if (op.size && !hasSize) {
    const size = op.size;
    steps.push((c) =>
      setSize(c, {
        kind: "setSize",
        diagram: op.diagram,
        element: element.id,
        width: size.width,
        height: size.height,
      }),
    );
  }
  const edits = inSequence(ctx, steps);
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** Edits against `ctx` that make each step in turn, each planned on the text the others leave. */
function inSequence(
  ctx: EditContext,
  steps: readonly ((ctx: EditContext) => TextEdit[])[],
): TextEdit[] {
  let edits: TextEdit[] = [];
  let current = ctx;
  for (const step of steps) {
    const next = step(current);
    if (next.length === 0) continue;
    edits = edits.length === 0 ? next : composeEdits(ctx.text, edits, next);
    if (current !== ctx) ctx.notes.push(...current.notes);
    const text = applyTextEdits(ctx.text, edits);
    current = createContext(compile(text, ctx.compilation.options), ctx.diagram.id);
  }
  if (current !== ctx) ctx.notes.push(...current.notes);
  return edits;
}

/**
 * The edit that turns the declaration of a node or a box into a group with the same id, label and
 * block: the head becomes `group <id> "<label>"`, and a declaration without a block gets an empty
 * one over two lines, so that the children moved in go on lines of their own.
 */
export function containerDeclaration(ctx: EditContext, element: Element): TextEdit[] {
  const node = element.node;
  if (!node) reject("edit.unsafe-target", reasons().groups.containerImplicit(element.id));
  const head = `group ${element.id} ${quoteString(element.label)}`;
  if (node.block) return [{ start: node.start, end: node.block.start, newText: `${head} ` }];
  const indent = lineIndent(ctx.text, node.start);
  return [{ start: node.start, end: node.end, newText: `${head} {${ctx.eol}${indent}}` }];
}

/**
 * Moves an element's declaration into the block of the group `parent`, or into the diagram body,
 * after the last declaration there or before the declaration at `index`; an implicit element gains
 * its declaration there. Within its own block, `index` reorders it. With `at`, the element's
 * `place` is written as `setPosition` writes it; into a list group, its `place` goes instead, and
 * `at` is refused. Flow and free diagrams.
 */
export function moveElement(ctx: EditContext, op: OperationOf<"moveElement">): TextEdit[] {
  const type = ctx.diagram.type;
  if (type === "sequence" || type === "c4") {
    reject("edit.unsafe-target", reasons().groups.notMovable(type));
  }
  const element = requireElement(ctx, op.element);
  if (op.parent !== null) {
    const parent = requireElement(ctx, op.parent);
    if (parent.kind !== "group") reject("edit.unsafe-target", reasons().groups.notGroup(op.parent));
    if (op.parent === op.element || parent.groupPath.includes(op.element)) {
      reject("edit.unsafe-target", reasons().groups.intoItself(op.element, op.parent));
    }
  }
  if (op.index !== undefined) requireIndex(op.index);
  // A list places its children: the element goes in at an index and keeps no place.
  const list = isListGroup(ctx, op.parent);
  if (list && op.at)
    reject("edit.invalid-value", reasons().lists.placeInList(op.element, op.parent!));
  if (op.at) requireNumbers(op.at.x, op.at.y);
  const current = element.groupPath[element.groupPath.length - 1] ?? null;
  const moved =
    current === op.parent && op.index === undefined
      ? []
      : moveDeclaration(ctx, element, op.parent, op.index);
  let edits = moved;
  if (list) {
    const place = ctx.diagram.placement.find(
      (p) => p.statement === "place" && p.target === op.element,
    );
    if (place)
      edits = [...edits, ...deleteStatements(ctx.text, ctx.compilation.parse.root, [place.node])];
  }
  if (op.at) {
    const position: OperationOf<"setPosition"> = {
      kind: "setPosition",
      diagram: op.diagram,
      element: op.element,
      x: op.at.x,
      y: op.at.y,
    };
    if (moved.length === 0) edits = setPosition(ctx, position);
    else {
      // The place is planned on the text the move leaves, since a new placement block goes after
      // the last statement of the body, which may be the one that moves; both are composed into
      // one set of edits.
      const after = compile(applyTextEdits(ctx.text, moved), ctx.compilation.options);
      const next = createContext(after, ctx.diagram.id);
      edits = composeEdits(ctx.text, moved, setPosition(next, position));
      ctx.notes.push(...next.notes);
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** What a move takes out of the source block. */
interface Cut {
  /** Edits that remove the declaration with its comments. */
  readonly edits: TextEdit[];
  /** The text that moves, from its first character: comment lines, declaration, trailing comment. */
  readonly text: string;
  /** The indentation the moved lines are relative to: the declaration's. */
  readonly indent: string;
  /** The declaration alone, for a block written on one line. */
  readonly statement: string;
  /** The comments that move with the declaration. */
  readonly comments: readonly Trivia[];
}

/**
 * The edits that move a declaration into the block of `parent` (the diagram body with null),
 * before the declaration at `index` or after the last one; none when it would stay where it is.
 */
function moveDeclaration(
  ctx: EditContext,
  element: Element,
  parent: string | null,
  index?: number,
): TextEdit[] {
  const target =
    parent === null
      ? { block: diagramBody(ctx), owner: ctx.diagram.node.start }
      : groupBlock(ctx, parent);
  const node = element.node;
  // The declarations of the destination, the moved one included when it is already there.
  const declarations = target.block.statements.filter(isDeclaration);
  const at = Math.min(index ?? declarations.length, declarations.length);
  const own = node ? declarations.indexOf(node) : -1;
  if (own >= 0 && (at === own || at === own + 1)) return [];
  const before = declarations[at];
  const declaration = declarationText(element.kind, element.id, element.label, ctx.diagram.type);
  const cut: Cut = node
    ? cutDeclaration(ctx, blockOfParent(ctx, element).block, node)
    : { edits: [], text: declaration, indent: "", statement: declaration, comments: [] };
  let oneLine = false;
  const render = (indent: string | null) => {
    if (indent !== null) return reindent(cut.text, cut.indent, indent);
    oneLine = true;
    return cut.statement;
  };
  const edits = [
    ...cut.edits,
    insertIntoBlock(ctx, target.block, target.owner, parent === null, render, before),
  ];
  // A block written on one line takes the declaration without its comments.
  if (oneLine) {
    const lines = ctx.compilation.parse.lines;
    for (const comment of cut.comments) {
      ctx.notes.push(
        messages().notes.removedComment(lines.location(comment.start).line, comment.text.trim()),
      );
    }
  }
  return edits;
}

/**
 * Takes a declaration out of its block. A declaration on lines of its own goes with the comment
 * lines right above it and its trailing comment; one that shares its line goes alone.
 */
function cutDeclaration(ctx: EditContext, block: Block, node: Statement): Cut {
  const text = ctx.text;
  const statement = text.slice(node.start, node.end);
  const indent = lineIndent(text, node.start);
  const lines = ownLines(text, node);
  if (!lines) {
    const edits = deleteStatements(text, ctx.compilation.parse.root, [node]);
    return { edits, text: statement, indent, statement, comments: [] };
  }
  const children = block.children;
  const index = children.indexOf(node);
  // The comment lines right above, which belong to the declaration.
  const above = commentsAbove(block, node);
  let after = index + 1;
  while (isToken(children[after]) && children[after]!.kind === "Semicolon") after++;
  const terminator = children[after];
  const trailing = isToken(terminator) ? terminator.leadingTrivia.filter(isCommentTrivia) : [];
  const first = above[0];
  const start = first ? lineStart(text, first.start) : lines.start;
  // The moved text stops before the line break, which the insertion writes.
  let end = lines.end - 1;
  if (text[end - 1] === "\r") end--;
  return {
    edits: [{ start, end: lines.end, newText: "" }],
    text: text.slice(first ? first.start : node.start, end).trimEnd(),
    indent,
    statement,
    comments: [...above, ...trailing],
  };
}

// ---------------------------------------------------------------------- fragments

/** The one flow diagram of a fragment, compiled. */
function fragmentDiagram(fragment: string): { text: string; diagram: FlowDiagram } {
  const compilation = compile(fragment);
  const diagrams = compilation.document.diagrams;
  if (diagrams.length !== 1 || diagrams[0]!.hasSyntaxErrors) {
    reject("edit.invalid-value", reasons().insert.notOneDiagram);
  }
  return { text: fragment, diagram: diagrams[0]! };
}

export function insertFragment(ctx: EditContext, op: OperationOf<"insertFragment">): TextEdit[] {
  const { text, diagram } = fragmentDiagram(op.fragment);
  // Implicit elements of the fragment refer to elements of the diagram, existing or not.
  const clashes = [
    ...diagram.elements.filter((e) => !e.implicit).map((e) => e.id),
    ...diagram.relations.flatMap((r) => (r.id === null ? [] : [r.id])),
  ].filter(
    (id) => ctx.diagram.elementsById.has(id) || ctx.diagram.relationsByKey.get(id)?.id === id,
  );
  if (clashes.length > 0) {
    reject("edit.id-conflict", reasons().insert.idsExist(clashes, ctx.diagram.id));
  }
  const layers = withFragmentLayers(ctx, diagram);
  if (layers === null) {
    const edits = fragmentEdits(ctx, text, diagram);
    verifyNoNewErrors(ctx, edits);
    return edits;
  }
  // The layers the fragment uses join the diagram's first; the fragment goes into the text they
  // leave, and both are composed into one set of edits.
  const first = setDiagramProperty(ctx, {
    kind: "setDiagramProperty",
    diagram: ctx.diagram.id,
    property: "layers",
    value: layers.join(", "),
  });
  const after = compile(applyTextEdits(ctx.text, first), ctx.compilation.options);
  const next = createContext(after, ctx.diagram.id);
  const edits = composeEdits(ctx.text, first, fragmentEdits(next, text, diagram));
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * The diagram's layers with those that the fragment's elements and relations use and the diagram
 * lacks; null when the diagram has them all. A layer the fragment declares keeps its side of
 * `main` and its place among its neighbours there, so pasted objects are painted as they were;
 * one it uses without declaring goes right before `main`.
 */
function withFragmentLayers(ctx: EditContext, fragment: FlowDiagram): string[] | null {
  const layers = ctx.diagram.properties.layers;
  const used = new Set<string>();
  for (const item of [...fragment.elements, ...fragment.relations]) {
    if (item.layer !== null && item.layer !== MAIN_LAYER && !layers.includes(item.layer)) {
      used.add(item.layer);
    }
  }
  if (used.size === 0) return null;
  // Both lists hold `main`: the model adds it last when `layers` does not name it.
  const declared = fragment.properties.layers;
  const merged = [...layers];
  const below = (list: readonly string[], layer: string) =>
    list.indexOf(layer) < list.indexOf(MAIN_LAYER);
  for (const [i, layer] of declared.entries()) {
    if (!used.has(layer)) continue;
    const side = below(declared, layer);
    // A neighbour the merged list has on the same side of `main` (or `main` itself): the nearest
    // one before the layer in the fragment, which it follows, else the nearest one after it.
    const fits = (other: string) =>
      merged.includes(other) && (other === MAIN_LAYER || below(merged, other) === side);
    const before = declared.slice(0, i).reverse().find(fits);
    if (before !== undefined) {
      merged.splice(merged.indexOf(before) + 1, 0, layer);
      continue;
    }
    const after = declared.slice(i + 1).find(fits) ?? MAIN_LAYER;
    merged.splice(merged.indexOf(after), 0, layer);
  }
  for (const layer of used) {
    if (!declared.includes(layer)) merged.splice(merged.indexOf(MAIN_LAYER), 0, layer);
  }
  return merged;
}

/** The edits that insert a fragment's statements into the diagram's sections. */
function fragmentEdits(ctx: EditContext, text: string, diagram: FlowDiagram): TextEdit[] {
  const statements = diagram.block?.statements ?? [];
  const sourceIndent = (s: Statement) => lineIndent(text, s.start);
  const body = diagramBody(ctx);
  const firstPlacement = body.statements.find((s) => isKeyword(s, "placement"));
  const indent = firstPlacement
    ? lineIndent(ctx.text, firstPlacement.start)
    : lineIndent(ctx.text, ctx.diagram.node.start) + ctx.unit;
  const pieces = (filter: (s: Statement) => boolean) =>
    statements
      .filter(filter)
      .map((s) => reindent(text.slice(s.start, s.end), sourceIndent(s), indent));

  // Diagram properties and class or rule definitions of the fragment are not carried over.
  const skipped = new Set([
    "placement",
    "style",
    "animate",
    "class",
    "rule",
    ...DIAGRAM_PROPERTY_KEYWORDS,
  ]);
  const content = pieces((s) => s.kind !== "KeywordStatement" || !skipped.has(s.keyword.text));
  const placement = statements
    .filter((s) => isKeyword(s, "placement"))
    .flatMap((s) => (s as KeywordStatement).block?.statements ?? [])
    .map((s) => text.slice(s.start, s.end));
  const styles = pieces((s) => isKeyword(s, "style", "animate"));

  const edits: TextEdit[] = [];
  if (content.length > 0) {
    edits.push(
      firstPlacement
        ? insertBefore(ctx, firstPlacement, (i) => content.join(i === null ? "; " : ctx.eol + i))
        : insertStatement(ctx, body, ctx.diagram.node.start, (i) =>
            content.join(i === null ? "; " : ctx.eol + i),
          ),
    );
  }
  if (placement.length > 0) edits.push(insertPlacements(ctx, placement));
  if (styles.length > 0) {
    edits.push(
      insertStatement(ctx, body, ctx.diagram.node.start, (i) =>
        styles.join(i === null ? "; " : ctx.eol + i),
      ),
    );
  }
  return edits;
}
