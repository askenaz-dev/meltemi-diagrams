import {
  isToken,
  tokensOf,
  type Block,
  type KeywordStatement,
  type RelationStatement,
  type ShorthandDeclaration,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { PARTICIPANT_KINDS, isTagText, type Element, type TagUse } from "@meltemi/diagrams-model";
import { insertStatement, reject, type EditContext } from "./context.js";
import { declarationText } from "./create.js";
import { deleteStatements } from "./delete.js";
import {
  declareImplicit,
  insertAfter,
  insertBeforeStatement,
  verifyNoNewErrors,
} from "./insert.js";
import { reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { isEventStatement } from "./sequence.js";
import { hasOnlyWhitespaceTrivia, lineIndent, quoteString } from "./text.js";

const PARTICIPANTS: ReadonlySet<string> = new Set(PARTICIPANT_KINDS);

/** A participant or a message of a sequence diagram, as the owner of `tag` statements. */
interface TagOwner {
  readonly target: string;
  readonly tags: readonly TagUse[];
  /** The declaration or the message statement; undefined for an implicit participant. */
  readonly node: ShorthandDeclaration | KeywordStatement | RelationStatement | undefined;
  /** Whether the block may hold events: a message's (a call's) may, a participant's may not. */
  readonly events: boolean;
  /** The participant, for one that must be declared before it takes a block. */
  readonly element?: Element;
}

type TagOperation = OperationOf<"addTag"> | OperationOf<"setTag"> | OperationOf<"removeTag">;

/** The participant or message an operation names, refusing anything else. */
function requireOwner(ctx: EditContext, op: TagOperation): TagOwner {
  if (ctx.diagram.type !== "sequence") {
    reject("edit.unsafe-target", reasons().tags.notSequence(ctx.diagram.id));
  }
  if (op.targetKind === "element") {
    const element = ctx.diagram.elementsById.get(op.target);
    if (!element || !PARTICIPANTS.has(element.kind)) {
      reject("edit.unsafe-target", reasons().tags.notOwner(op.target, ctx.diagram.id));
    }
    return { target: op.target, tags: element.tags, node: element.node, events: false, element };
  }
  const relation = ctx.diagram.relationsByKey.get(op.target);
  if (!relation || op.targetKind !== "relation") {
    reject("edit.unsafe-target", reasons().tags.notOwner(op.target, ctx.diagram.id));
  }
  return { target: op.target, tags: relation.tags, node: relation.node, events: true };
}

/** A tag's text: one line, not empty, that no other tag of the owner has. */
function requireText(owner: TagOwner, text: string, except?: number): string {
  if (typeof text !== "string" || !isTagText(text)) {
    reject("edit.invalid-value", reasons().tags.oneLine);
  }
  if (owner.tags.some((tag, i) => i !== except && tag.text === text)) {
    reject("edit.invalid-value", reasons().tags.repeated(owner.target, text));
  }
  return text;
}

/** The `tag` statement of the owner's tag at `index`, refusing an index that names none. */
function requireTag(owner: TagOwner, index: number): { block: Block; statement: KeywordStatement } {
  const tag = Number.isInteger(index) ? owner.tags[index] : undefined;
  if (!tag)
    reject("edit.unsafe-target", reasons().tags.noTag(owner.target, index, owner.tags.length));
  const block = owner.node?.block;
  const statement = block?.statements.find((s) => s.start === tag.range.start.offset);
  if (!block || statement?.kind !== "KeywordStatement") {
    reject("edit.unsafe-target", reasons().tags.unreadable);
  }
  return { block, statement };
}

/** Whether a block is written on one line with nothing but whitespace between its tokens. */
function oneLine(block: Block): boolean {
  return (
    isToken(block.close) &&
    !block.children.some((c) => isToken(c) && c.kind === "Newline") &&
    [...tokensOf(block)].every((t) => t === block.open || hasOnlyWhitespaceTrivia(t))
  );
}

/**
 * Writes `tag "<text>"` in the owner's block: before the tag at `index`, else after the last
 * tag, else after the last property before the block's events, else first. A block written on
 * one line opens onto lines when it gains a second statement; a statement without a block gains
 * a one-line block, and an implicit participant is declared with it where it keeps its column
 * (`declareImplicit`).
 */
export function addTag(ctx: EditContext, op: OperationOf<"addTag">): TextEdit[] {
  const owner = requireOwner(ctx, op);
  const statementText = `tag ${quoteString(requireText(owner, op.text))}`;
  if (op.index !== undefined && !(Number.isInteger(op.index) && op.index >= 0)) {
    reject("edit.unsafe-target", reasons().tags.badIndex(op.index));
  }
  const node = owner.node;
  let edits: TextEdit[];
  if (!node) {
    // An implicit participant: declared with its block where it keeps its column.
    const element = owner.element!;
    const head =
      element.label === element.id
        ? `${element.kind} ${element.id}`
        : declarationText(element.kind, element.id, element.label, "sequence");
    edits = [declareImplicit(ctx, element, `${head} { ${statementText} }`)];
  } else if (!node.block) {
    edits = [{ start: node.end, end: node.end, newText: ` { ${statementText} }` }];
  } else {
    edits = [insertTag(ctx, owner, node.block, node.start, op.index, statementText)];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/** The edit that writes a tag statement into the owner's existing block. */
function insertTag(
  ctx: EditContext,
  owner: TagOwner,
  block: Block,
  ownerStart: number,
  index: number | undefined,
  text: string,
): TextEdit {
  const statements = block.statements;
  const tagged = owner.tags.map((tag) =>
    statements.find((s) => s.start === tag.range.start.offset),
  );
  let position: number;
  const before = index !== undefined ? tagged[index] : undefined;
  const last = tagged[tagged.length - 1];
  if (before) position = statements.indexOf(before);
  else if (last) position = statements.indexOf(last) + 1;
  else {
    // After the last property that comes before the block's events.
    const first = owner.events ? statements.findIndex(isEventStatement) : -1;
    position = first < 0 ? statements.length : first;
  }
  if (statements.length === 0) return insertStatement(ctx, block, ownerStart, () => text);
  if (oneLine(block)) {
    // A second statement: the block opens onto lines, one statement each.
    const indent = lineIndent(ctx.text, ownerStart);
    const inner = indent + ctx.unit;
    const lines = statements.map((s) => ctx.text.slice(s.start, s.end));
    lines.splice(position, 0, text);
    return {
      start: block.open.end,
      end: block.close.start,
      newText: `${ctx.eol}${lines.map((line) => inner + line).join(ctx.eol)}${ctx.eol}${indent}`,
    };
  }
  return position > 0
    ? insertAfter(ctx, block, statements[position - 1]!, () => text)
    : insertBeforeStatement(ctx, block, statements[0]!, () => text);
}

/** Rewrites the text of the owner's tag at `index`. */
export function setTag(ctx: EditContext, op: OperationOf<"setTag">): TextEdit[] {
  const owner = requireOwner(ctx, op);
  const { statement } = requireTag(owner, op.index);
  const quoted = quoteString(requireText(owner, op.text, op.index));
  const value = statement.args[0];
  if (value?.kind !== "StringLiteral") reject("edit.unsafe-target", reasons().tags.unreadable);
  if (value.token.text === quoted) return [];
  const edits = [{ start: value.token.start, end: value.token.end, newText: quoted }];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

/**
 * Deletes the owner's tag at `index`, and the block with it when it held nothing else: no other
 * statement and no comment.
 */
export function removeTag(ctx: EditContext, op: OperationOf<"removeTag">): TextEdit[] {
  const owner = requireOwner(ctx, op);
  const { block, statement } = requireTag(owner, op.index);
  const alone =
    block.statements.length === 1 &&
    isToken(block.close) &&
    [...tokensOf(block)].every((t) => t === block.open || hasOnlyWhitespaceTrivia(t));
  const edits: TextEdit[] = alone
    ? [
        {
          start: hasOnlyWhitespaceTrivia(block.open) ? block.fullStart : block.open.start,
          end: block.end,
          newText: "",
        },
      ]
    : deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  verifyNoNewErrors(ctx, edits);
  return edits;
}
