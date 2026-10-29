import {
  applyTextEdits,
  isToken,
  tokensOf,
  type Block,
  type KeywordStatement,
  type ShorthandDeclaration,
  type Statement,
  type TextEdit,
  type Token,
  type Trivia,
} from "@meltemi/diagrams-language";
import { compile, type Element } from "@meltemi/diagrams-model";
import {
  insertStatement,
  reject,
  requireElement,
  type EditContext,
  type TextContext,
} from "./context.js";
import { reasons } from "./messages/index.js";
import { hasOnlyWhitespaceTrivia, isCommentTrivia, lineIndent, lineStart } from "./text.js";

/** Keywords that declare an element. */
export const DECLARATION_KEYWORDS: ReadonlySet<string> = new Set([
  "node",
  "decision",
  "data",
  "group",
  "note",
  "tag",
  "box",
  "text",
  "icon",
  "image",
  "sticky",
  "line",
  "pen",
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
]);

/**
 * A group's own statements, which come before its children: what its block says of the group,
 * the arrangement of a list included.
 */
export const GROUP_OWN_KEYWORDS: readonly string[] = [
  "description",
  "class",
  "layer",
  "link",
  "url",
  "layout",
  "spacing",
  "align",
];

/** Diagram properties, which come first in a diagram body. */
export const DIAGRAM_PROPERTY_KEYWORDS: ReadonlySet<string> = new Set([
  "direction",
  "layout",
  "routing",
  "theme",
  "title",
  "description",
  "preset",
  "canvas",
  "layers",
  "autonumber",
  "spacing",
  "level",
  "scope",
]);

const NOTE_POSITIONS: ReadonlySet<string> = new Set(["over", "left", "right"]);

/** The text of a single-identifier argument. */
const word = (arg: KeywordStatement["args"][number] | undefined): string | undefined =>
  arg?.kind === "QualifiedRef" && arg.parts.length === 1 ? arg.parts[0]!.text : undefined;

/** `note [id] over|left|right …`: a note event of a sequence diagram, not a declaration. */
function isNoteEvent(statement: KeywordStatement): boolean {
  if (statement.keyword.text !== "note") return false;
  const [first, second] = statement.args;
  return (
    NOTE_POSITIONS.has(word(second) ?? "") ||
    (NOTE_POSITIONS.has(word(first) ?? "") && second?.kind === "QualifiedRef")
  );
}

export function isDeclaration(statement: Statement): boolean {
  return (
    statement.kind === "ShorthandDeclaration" ||
    (statement.kind === "KeywordStatement" &&
      DECLARATION_KEYWORDS.has(statement.keyword.text) &&
      !isNoteEvent(statement))
  );
}

export function isKeyword(
  statement: Statement,
  ...keywords: string[]
): statement is KeywordStatement {
  return statement.kind === "KeywordStatement" && keywords.includes(statement.keyword.text);
}

/** The body of the diagram. */
export function diagramBody(ctx: EditContext): Block {
  const body = ctx.diagram.block;
  if (!body) reject("edit.unsafe-target", reasons().targets.noBody(ctx.diagram.id));
  return body;
}

/** The block that holds the children of a group, with the start of its statement. */
export function groupBlock(ctx: EditContext, id: string): { block: Block; owner: number } {
  const group = requireElement(ctx, id);
  if (group.kind !== "group") reject("edit.unsafe-target", reasons().groups.notGroup(id));
  const node = group.node;
  if (node?.kind !== "KeywordStatement" || !node.block) {
    reject("edit.unsafe-target", reasons().groups.noBlock(id));
  }
  return { block: node.block, owner: node.start };
}

/** The declaring statement of an element, or undefined for an implicit element. */
export function declarationOf(
  element: Element,
): ShorthandDeclaration | KeywordStatement | undefined {
  return element.node;
}

/**
 * Inserts a statement right after `after` in `block`, on a new line with the same indentation,
 * or joined with `; ` when `after` shares its line with the next statement.
 */
export function insertAfter(
  ctx: TextContext,
  block: Block,
  after: Statement,
  render: (indent: string | null) => string,
): TextEdit {
  const children = block.children;
  let newline: Token | undefined;
  for (let i = children.indexOf(after) + 1; i < children.length; i++) {
    const child = children[i]!;
    // A trailing `;` before the line break keeps the new statement on its own line.
    if (isToken(child) && child.kind === "Semicolon") continue;
    if (isToken(child) && child.kind === "Newline") newline = child;
    break;
  }
  if (newline) {
    const sameLineAsOpen =
      lineStart(ctx.text, after.start) === lineStart(ctx.text, block.open.start);
    const indent = sameLineAsOpen
      ? lineIndent(ctx.text, block.open.start) + ctx.unit
      : lineIndent(ctx.text, after.start);
    return { start: newline.start, end: newline.start, newText: ctx.eol + indent + render(indent) };
  }
  return { start: after.end, end: after.end, newText: `; ${render(null)}` };
}

/**
 * Inserts a statement before `before`: on its own line with the same indentation when `before`
 * starts a line, or followed by `; ` otherwise.
 */
export function insertBefore(
  ctx: TextContext,
  before: Statement,
  render: (indent: string | null) => string,
): TextEdit {
  const start = lineStart(ctx.text, before.start);
  const indent = lineIndent(ctx.text, before.start);
  if (start + indent.length === before.start) {
    return { start, end: start, newText: indent + render(indent) + ctx.eol };
  }
  return { start: before.start, end: before.start, newText: `${render(null)}; ` };
}

/**
 * Inserts a statement where a new declaration belongs in `block`: after the last declaration,
 * else after the last diagram property (in the diagram body), else first, else last.
 */
export function insertDeclaration(
  ctx: EditContext,
  block: Block,
  owner: number,
  render: (indent: string | null) => string,
  anchorKinds: (statement: Statement) => boolean = isDeclaration,
): TextEdit {
  const statements = block.statements;
  const anchors = statements.filter(anchorKinds);
  const last = anchors[anchors.length - 1];
  if (last) return insertAfter(ctx, block, last, render);
  const properties = statements.filter(
    (s) => s.kind === "KeywordStatement" && DIAGRAM_PROPERTY_KEYWORDS.has(s.keyword.text),
  );
  const property = properties[properties.length - 1];
  if (property && block === ctx.diagram.block) return insertAfter(ctx, block, property, render);
  const first = statements[0];
  if (first) return insertBefore(ctx, first, render);
  return insertStatement(ctx, block, owner, render);
}

/**
 * The comments on the lines right above a statement of `block`, which belong to it: line breaks
 * that follow a line break and end a line that holds only comments. A blank line ends them.
 */
export function commentsAbove(block: Block, statement: Statement): Trivia[] {
  const children = block.children;
  const above: Trivia[] = [];
  for (let i = children.indexOf(statement) - 1; i > 0; i--) {
    const child = children[i]!;
    const previous = children[i - 1]!;
    if (!isToken(child) || child.kind !== "Newline") break;
    if (!isToken(previous) || previous.kind !== "Newline") break;
    const comments = child.leadingTrivia.filter(isCommentTrivia);
    if (comments.length === 0) break;
    above.unshift(...comments);
  }
  return above;
}

/**
 * Inserts a statement before `before`, a statement of `block`: on a line of its own above the
 * comment lines that belong to `before` when it starts a line, or followed by `; ` otherwise.
 */
export function insertBeforeStatement(
  ctx: TextContext,
  block: Block,
  before: Statement,
  render: (indent: string | null) => string,
): TextEdit {
  const first = commentsAbove(block, before)[0];
  if (!first) return insertBefore(ctx, before, render);
  const start = lineStart(ctx.text, first.start);
  const indent = lineIndent(ctx.text, before.start);
  return { start, end: start, newText: indent + render(indent) + ctx.eol };
}

/**
 * Inserts a declaration into `block`, the diagram body when `body` is true or a group's block
 * otherwise: before `before` when given, else after the last declaration, else after a group's
 * own statements. A block written on one line that is empty, or that holds only a group's own
 * statements, opens onto lines, so that the declarations go on lines of their own.
 */
export function insertIntoBlock(
  ctx: EditContext,
  block: Block,
  owner: number,
  body: boolean,
  render: (indent: string | null) => string,
  before?: Statement,
): TextEdit {
  if (before) return insertBeforeStatement(ctx, block, before, render);
  const close = block.close;
  const lineBreaks = block.children.some((c) => isToken(c) && c.kind === "Newline");
  const own = !body && !block.statements.some(isDeclaration);
  const quiet = [...tokensOf(block)].every((t) => t === block.open || hasOnlyWhitespaceTrivia(t));
  const opens =
    !lineBreaks &&
    isToken(close) &&
    quiet &&
    (block.statements.length === 0 ||
      (own && block.statements.every((s) => isKeyword(s, ...GROUP_OWN_KEYWORDS))));
  if (opens) {
    const indent = lineIndent(ctx.text, owner);
    const inner = indent + ctx.unit;
    const lines = [
      ...block.statements.map((s) => ctx.text.slice(s.start, s.end)),
      render(inner),
    ].map((line) => inner + line);
    return {
      start: block.open.end,
      end: close.start,
      newText: `${ctx.eol}${lines.join(ctx.eol)}${ctx.eol}${indent}`,
    };
  }
  return insertDeclaration(
    ctx,
    block,
    owner,
    render,
    own ? (s) => isKeyword(s, ...GROUP_OWN_KEYWORDS) : isDeclaration,
  );
}

/**
 * Inserts a `style` statement with the diagram's: after the last `style` statement of the body,
 * else as its last statement. A group takes no `style` statement, so its children's go here.
 */
export function insertDiagramStyle(ctx: EditContext, text: string): TextEdit {
  const body = diagramBody(ctx);
  const styles = body.statements.filter((s) => isKeyword(s, "style"));
  const last = styles[styles.length - 1];
  return last
    ? insertAfter(ctx, body, last, () => text)
    : insertStatement(ctx, body, ctx.diagram.node.start, () => text);
}

/** Re-indents a statement's text from `from` to `to`, line by line after the first. */
export function reindent(text: string, from: string, to: string): string {
  return text
    .split(/(\r?\n)/)
    .map((part, i) => {
      if (i === 0 || i % 2 === 1 || part.trim() === "") return part;
      return part.startsWith(from) ? to + part.slice(from.length) : to + part.trimStart();
    })
    .join("");
}

/**
 * Refuses edits that would add errors to the document: the result is compiled, and any error in
 * the diagram that was not there before becomes an `edit.invalid-value` rejection.
 */
export function verifyNoNewErrors(ctx: TextContext, edits: readonly TextEdit[]): void {
  if (edits.length === 0) return;
  const key = (d: { code: string; message: string }) => `${d.code}:${d.message}`;
  const before = new Set(
    ctx.compilation.diagnostics.filter((d) => d.severity === "error").map(key),
  );
  const after = compile(
    applyTextEdits(ctx.text, edits),
    ctx.compilation.options,
  ).diagnostics.filter((d) => d.severity === "error" && !before.has(key(d)));
  const first = after[0];
  if (first) reject("edit.invalid-value", first.message);
}
