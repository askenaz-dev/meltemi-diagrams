import {
  buildParentMap,
  isNode,
  isToken,
  type Block,
  type CstElement,
  type CstNode,
  type SourceFile,
  type Span,
  type TextEdit,
  type Token,
} from "@meltemi/diagrams-language";
import { reject } from "./context.js";
import { reasons } from "./messages/index.js";
import {
  firstTokenOf,
  hasOnlyWhitespaceTrivia,
  isBlank,
  isCommentTrivia,
  lineStart,
} from "./text.js";

/** Statements of a block that share physical lines, joined by `;`, and the line break that ends them. */
interface Run {
  readonly items: readonly CstElement[];
  readonly terminator: Token | undefined;
}

const isSemicolon = (element: CstElement | undefined): element is Token =>
  isToken(element) && element.kind === "Semicolon";

const isStatement = (element: CstElement | undefined): element is CstNode => isNode(element);

/**
 * Deletes whole statements with minimal edits:
 * - a statement that owns its lines loses those lines, line breaks included;
 * - a trailing comment on the last line is kept, with its indentation;
 * - a statement that shares its line through `;` is removed with one `;`;
 * - comments outside the deleted statements are never touched.
 */
export function deleteStatements(
  text: string,
  root: SourceFile,
  statements: readonly CstNode[],
): TextEdit[] {
  const parents = buildParentMap(root);
  const ordered = [...new Set(statements)].sort((a, b) => a.start - b.start || b.end - a.end);
  const outermost: CstNode[] = [];
  for (const statement of ordered) {
    if (!outermost.some((o) => o.start <= statement.start && statement.end <= o.end))
      outermost.push(statement);
  }

  const byBlock = new Map<Block, Set<CstNode>>();
  for (const statement of outermost) {
    const parent = parents.get(statement);
    if (!parent || parent.kind !== "Block") {
      reject("edit.unsafe-target", reasons().targets.notInBlock);
    }
    const set = byBlock.get(parent) ?? new Set<CstNode>();
    set.add(statement);
    byBlock.set(parent, set);
  }

  const spans: Span[] = [];
  for (const [block, deleted] of byBlock) spans.push(...blockDeletions(text, block, deleted));
  return mergeSpans(spans).map((span) => ({ start: span.start, end: span.end, newText: "" }));
}

function blockDeletions(text: string, block: Block, deleted: ReadonlySet<CstNode>): Span[] {
  const spans: Span[] = [];
  for (const run of splitRuns(block)) {
    const statements = run.items.filter(isStatement);
    if (!statements.some((s) => deleted.has(s))) continue;
    if (statements.every((s) => deleted.has(s))) {
      const whole = wholeRunDeletion(text, run, statements);
      if (whole) {
        spans.push(whole);
        continue;
      }
    }
    spans.push(...partialRunDeletion(run, deleted));
  }
  return spans;
}

function splitRuns(block: Block): Run[] {
  const runs: Run[] = [];
  let current: CstElement[] = [];
  for (const child of block.children.slice(1, -1)) {
    if (isToken(child) && child.kind === "Newline") {
      if (current.length > 0) runs.push({ items: current, terminator: child });
      current = [];
      continue;
    }
    current.push(child);
  }
  if (current.length > 0) runs.push({ items: current, terminator: undefined });
  return runs;
}

/** Deletes the lines of a run when it is alone on them; undefined when the run shares its lines. */
function wholeRunDeletion(text: string, run: Run, statements: CstNode[]): Span | undefined {
  const start = statements[0]!.start;
  const from = lineStart(text, start);
  if (!isBlank(text.slice(from, start)) || !run.terminator) return undefined;
  const comment = run.terminator.leadingTrivia.find(isCommentTrivia);
  if (comment) return { start, end: comment.start };
  return { start: from, end: run.terminator.end };
}

function partialRunDeletion(run: Run, deleted: ReadonlySet<CstNode>): Span[] {
  const spans: Span[] = [];
  const items = run.items;
  const isDeleted = (element: CstElement | undefined) =>
    isStatement(element) && deleted.has(element);
  let i = 0;
  while (i < items.length) {
    if (!isDeleted(items[i])) {
      i++;
      continue;
    }
    // Extend over consecutive deleted statements separated only by semicolons.
    let lastIndex = i;
    for (;;) {
      let k = lastIndex + 1;
      while (isSemicolon(items[k])) k++;
      if (isDeleted(items[k])) lastIndex = k;
      else break;
    }
    const first = items[i] as CstNode;
    const last = items[lastIndex] as CstNode;
    const nextSemicolon = isSemicolon(items[lastIndex + 1])
      ? (items[lastIndex + 1] as Token)
      : undefined;
    let n = lastIndex + 1;
    while (isSemicolon(items[n])) n++;
    const next = isStatement(items[n]) ? items[n] : undefined;
    const previousSemicolon = isSemicolon(items[i - 1]) ? (items[i - 1] as Token) : undefined;
    let p = i - 1;
    while (isSemicolon(items[p])) p--;
    const previous = isStatement(items[p]) ? items[p] : undefined;

    if (nextSemicolon && next) {
      const nextFirst = firstTokenOf(next)!;
      spans.push({
        start: first.start,
        end: hasOnlyWhitespaceTrivia(nextFirst) ? next.start : nextSemicolon.end,
      });
    } else if (previousSemicolon && previous) {
      const start = hasOnlyWhitespaceTrivia(previousSemicolon)
        ? previousSemicolon.fullStart
        : previousSemicolon.start;
      spans.push({ start, end: nextSemicolon ? nextSemicolon.end : last.end });
    } else {
      const firstToken = firstTokenOf(first)!;
      const start = hasOnlyWhitespaceTrivia(firstToken) ? firstToken.fullStart : first.start;
      spans.push({ start, end: nextSemicolon ? nextSemicolon.end : last.end });
    }
    i = lastIndex + 1;
  }
  return spans;
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end)
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    else merged.push(span);
  }
  return merged;
}
