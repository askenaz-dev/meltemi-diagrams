import {
  applyTextEdits,
  isToken,
  type Block,
  type KeywordStatement,
  type ShorthandDeclaration,
  type Statement,
  type TextEdit,
  type Token,
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
import { lineIndent, lineStart } from "./text.js";

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
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
]);

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
