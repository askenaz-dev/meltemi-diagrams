import { lastToken, walk, type List, type SourceFile } from "./cst.js";
import type { Diagnostic } from "./diagnostics.js";
import { createDiagnostic } from "./diagnostics.js";
import { diffLines } from "./diff.js";
import { messages } from "./messages/index.js";
import { parse } from "./parser.js";
import { detectLineEnding, type TextEdit } from "./text-edits.js";
import type { Token, TokenKind } from "./tokens.js";

export interface FormatOptions {
  /** Spaces per indentation level (1 to 8) or `"tab"`; default 2. */
  readonly indent?: number | "tab";
}

export type FormatResult =
  | {
      readonly ok: true;
      readonly text: string;
      /** Line-range replacements that turn the input into `text`; empty when unchanged. */
      readonly edits: readonly TextEdit[];
      readonly changed: boolean;
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const NO_SPACE_BEFORE: ReadonlySet<TokenKind> = new Set([
  "Comma",
  "Semicolon",
  "Colon",
  "Dot",
  "RParen",
  "RBracket",
]);
const NO_SPACE_AFTER: ReadonlySet<TokenKind> = new Set(["LParen", "LBracket", "Dot"]);
const OPENERS: ReadonlySet<TokenKind> = new Set(["LBrace", "LParen", "LBracket"]);
const CLOSERS: ReadonlySet<TokenKind> = new Set(["RBrace", "RParen", "RBracket"]);
const BLOCK_ITEMS = new Set([
  "DiagramBlock",
  "ThemeBlock",
  "ModelBlock",
  "StoryBlock",
  "ExportBlock",
]);
/** Columns a `pen` statement fits in on one line, and the lines of its filled point list. */
const FILL_COLUMNS = 100;
/** Columns a tab counts for when a line is measured. */
const TAB_COLUMNS = 4;

/**
 * Lays out a source in the canonical format. Only spaces, line breaks and indentation change:
 * token text and order, and every comment, are kept. Files with syntax errors are refused.
 * A `pen` statement's point list is printed filled to 100 columns, not one item per line.
 */
export function formatSource(text: string, options: FormatOptions = {}): FormatResult {
  const indent = options.indent ?? 2;
  if (indent !== "tab" && !(Number.isInteger(indent) && indent >= 1 && indent <= 8)) {
    const parsed = parse("");
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(parsed.lines, {
          code: "format.invalid-option",
          message: messages().diagnostics.invalidIndent(JSON.stringify(indent)),
          span: { start: 0, end: 0 },
        }),
      ],
    };
  }
  const parsed = parse(text);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) return { ok: false, diagnostics: errors };

  const formatted = print(parsed.tokens, parsed.root.items, penLists(parsed.root, parsed.tokens), {
    unit: indent === "tab" ? "\t" : " ".repeat(indent),
    eol: detectLineEnding(text),
  });
  const edits = formatted === text ? [] : diffLines(text, formatted);
  return { ok: true, text: formatted, edits, changed: formatted !== text };
}

interface PrintSettings {
  readonly unit: string;
  readonly eol: string;
}

interface TopLevelSpan {
  readonly start: number;
  readonly end: number;
  readonly kind: string;
}

/** A `pen` statement's point list, by token index. */
interface PenList {
  /** The `pen` keyword. */
  readonly first: number;
  /** The list's `[`. */
  readonly open: number;
  /** The statement's last token. */
  readonly last: number;
}

/** The point list of every `pen` statement (its first list argument), in source order. */
function penLists(root: SourceFile, tokens: readonly Token[]): PenList[] {
  const index = new Map<Token, number>();
  tokens.forEach((token, i) => index.set(token, i));
  const found: PenList[] = [];
  walk(root, (node) => {
    if (node.kind !== "KeywordStatement" || node.keyword.text !== "pen") return;
    const list = node.args.find((arg): arg is List => arg.kind === "List");
    const end = lastToken(node);
    const first = index.get(node.keyword);
    const open = list === undefined ? undefined : index.get(list.open);
    const last = end === undefined ? undefined : index.get(end);
    if (first !== undefined && open !== undefined && last !== undefined) {
      found.push({ first, open, last });
    }
  });
  return found.sort((a, b) => a.first - b.first);
}

/** Width of a text in columns, a tab counting for {@link TAB_COLUMNS}. */
function columnsOf(text: string): number {
  return text.length + (text.split("\t").length - 1) * (TAB_COLUMNS - 1);
}

/** Whether one space separates `token` from what was printed before it on the same line. */
function spaceBetween(
  lastKind: TokenKind | "comment" | null,
  last: Token | null,
  token: Token,
): boolean {
  if (lastKind === null) return false;
  if (lastKind === "comment") return true;
  if (NO_SPACE_BEFORE.has(token.kind) || NO_SPACE_AFTER.has(lastKind)) return false;
  // `api["API"]`: a bracket written right after an identifier is a shorthand declaration.
  if (
    token.kind === "LBracket" &&
    lastKind === "Identifier" &&
    last !== null &&
    last.end === token.start &&
    token.leadingTrivia.length === 0
  ) {
    return false;
  }
  return true;
}

function print(
  tokens: readonly Token[],
  items: readonly TopLevelSpan[],
  pens: readonly PenList[],
  settings: PrintSettings,
): string {
  // ------------------------------------------------------------ structural facts
  const partner = new Map<number, number>();
  /** The innermost opener around every token, or -1 at the top level. */
  const enclosing: number[] = [];
  const stack: number[] = [];
  tokens.forEach((token, i) => {
    if (CLOSERS.has(token.kind)) {
      const open = stack.pop();
      if (open !== undefined) {
        partner.set(open, i);
        partner.set(i, open);
      }
    }
    enclosing.push(stack[stack.length - 1] ?? -1);
    if (OPENERS.has(token.kind)) stack.push(i);
  });
  const spansNewline = (open: number) => {
    const close = partner.get(open) ?? open;
    for (let i = open + 1; i < close; i++) if (tokens[i]!.kind === "Newline") return true;
    return false;
  };
  /** Blocks written over several lines, and lists or tuples written over several lines. */
  const expanded = new Set<number>();
  tokens.forEach((token, i) => {
    if (OPENERS.has(token.kind) && spansNewline(i)) expanded.add(i);
  });
  const lastTokenOfItem = new Map<number, number>();
  tokens.forEach((token, i) => {
    if (token.kind === "Newline" || token.kind === "EOF") return;
    const item = items.findIndex((it) => it.end === token.end && token.start >= it.start);
    if (item >= 0) lastTokenOfItem.set(i, item);
  });

  /**
   * Columns of the tokens `from` to `to` printed on one line, with the comments between them.
   * The comments before `from` are not counted.
   */
  const flatColumns = (from: number, to: number): number => {
    let columns = 0;
    let lastKind: TokenKind | "comment" | null = null;
    let last: Token | null = null;
    for (let j = from; j <= to; j++) {
      const token = tokens[j]!;
      if (j > from) {
        for (const trivia of token.leadingTrivia) {
          if (trivia.kind !== "LineComment" && trivia.kind !== "BlockComment") continue;
          columns += (lastKind === null ? 0 : 1) + columnsOf(trivia.text);
          lastKind = "comment";
          last = null;
        }
      }
      if (token.kind === "Newline" || token.kind === "EOF") continue;
      if (spaceBetween(lastKind, last, token)) columns += 1;
      columns += columnsOf(token.text);
      lastKind = token.kind;
      last = token;
    }
    return columns;
  };

  /** Whether a comment between `open` and `close` ends its line or stands on a line of its own. */
  const breakingComment = (open: number, close: number): boolean => {
    for (let j = open + 1; j <= close; j++) {
      for (const trivia of tokens[j]!.leadingTrivia) {
        if (trivia.kind === "LineComment") return true;
        if (
          trivia.kind === "BlockComment" &&
          (trivia.text.includes("\n") || tokens[j - 1]!.kind === "Newline")
        ) {
          return true;
        }
      }
    }
    return false;
  };

  /** The last token of the list item that starts at `from`, with the commas that follow it. */
  const itemEnd = (from: number, close: number): number => {
    let level = 0;
    for (let j = from; j < close; j++) {
      const kind = tokens[j]!.kind;
      if (OPENERS.has(kind)) level++;
      else if (CLOSERS.has(kind)) level--;
      else if (kind === "Comma" && level === 0) {
        let end = j;
        for (let k = j + 1; k < close; k++) {
          const next = tokens[k]!.kind;
          if (next === "Comma") end = k;
          else if (next !== "Newline") break;
        }
        return end;
      }
    }
    return close - 1;
  };

  /**
   * Pen point lists: `true` when filled over several lines, `false` when printed on one line.
   * The choice depends on the statement's tokens, comments and depth only, never on the source's
   * line breaks, so formatting the output again makes the same choice. Later statements are
   * decided first, so a statement's block already knows whether a filled list expands it.
   */
  const fills = new Map<number, boolean>();
  const indentColumns = columnsOf(settings.unit);
  for (const pen of [...pens].reverse()) {
    const close = partner.get(pen.open) ?? pen.open;
    for (let j = pen.open; j < close; j++) expanded.delete(j);
    let levels = 0;
    for (let o = enclosing[pen.first]!; o >= 0; o = enclosing[o]!) levels++;
    // The statement's first line ends at a block written over several lines.
    let end = pen.last;
    for (let j = close + 1; j <= pen.last; j++) {
      if (expanded.has(j)) {
        end = j;
        break;
      }
    }
    const filled =
      breakingComment(pen.open, close) ||
      levels * indentColumns + flatColumns(pen.first, end) > FILL_COLUMNS;
    fills.set(pen.open, filled);
    if (filled) {
      // The list's lines expand every block around the statement.
      expanded.add(pen.open);
      for (let o = enclosing[pen.first]!; o >= 0; o = enclosing[o]!) expanded.add(o);
    }
  }

  // ------------------------------------------------------------ emitter state
  const lines: string[] = [];
  let line = "";
  let started = false;
  let bom = "";
  let pending = 0;
  let lastKind: TokenKind | "comment" | null = null;
  let lastToken: Token | null = null;
  let mustBreak = false;
  /** Exact breaks required before the next token, from structure (expanded openers, commas). */
  let forced: number | null = null;
  let afterItem: { prevBlock: boolean; nextBlock: boolean } | null = null;
  const open: { index: number; expanded: boolean; kind: TokenKind }[] = [];
  /**
   * The pen point list being printed, until its `]`: `item` is set after each of its commas,
   * when the next item is placed on the current line or the next one.
   */
  let fill: {
    readonly open: number;
    readonly close: number;
    readonly filled: boolean;
    item: boolean;
  } | null = null;

  const depth = () => open.filter((o) => o.kind === "LBrace" || o.expanded).length;
  const insideExpandedGroup = () => {
    const top = open[open.length - 1];
    return top !== undefined && top.kind !== "LBrace" && top.expanded;
  };
  /** The text of the line being built after its last line break (a block comment may hold some). */
  const currentLine = () => line.slice(line.lastIndexOf("\n") + 1);

  const newLines = (count: number, level: number) => {
    lines.push(line.replace(/[ \t]+$/, ""));
    if (count >= 2) lines.push("");
    line = settings.unit.repeat(level);
  };

  const breaksFor = (isToken: boolean): number => {
    if (!started) return 0;
    if (fill !== null) {
      // Inside a pen's point list the source's line breaks are dropped: only a comment that
      // stood on a line of its own, the line after a line comment and the fill's breaks remain.
      let breaks = mustBreak || (!isToken && pending > 0) ? 1 : 0;
      if (forced !== null && (isToken || breaks > 0)) breaks = forced;
      return breaks;
    }
    let breaks = Math.min(pending, 2);
    if (mustBreak) breaks = Math.max(breaks, 1);
    if (forced !== null && (isToken || breaks > 0)) breaks = forced;
    if (insideExpandedGroup()) breaks = Math.min(breaks, 1);
    if (afterItem && breaks > 0 && open.length === 0) {
      breaks = afterItem.prevBlock || afterItem.nextBlock ? 2 : Math.max(1, breaks);
    }
    return breaks;
  };

  const consumeBreakState = (breaks: number) => {
    pending = 0;
    mustBreak = false;
    if (breaks > 0 || forced === null) forced = null;
    if (breaks > 0) afterItem = null;
  };

  const emitComment = (comment: string, isLine: boolean) => {
    const breaks = breaksFor(false);
    if (breaks > 0) newLines(breaks, depth());
    else if (line.trim() !== "") line += " ";
    line += comment;
    started = true;
    consumeBreakState(breaks);
    lastKind = "comment";
    lastToken = null;
    if (isLine) mustBreak = true;
  };

  const needsSpace = (token: Token): boolean => spaceBetween(lastKind, lastToken, token);

  // ------------------------------------------------------------ emission
  tokens.forEach((token, i) => {
    for (const trivia of token.leadingTrivia) {
      if (trivia.kind === "ByteOrderMark") bom = trivia.text;
      else if (trivia.kind === "LineComment") emitComment(trivia.text, true);
      else if (trivia.kind === "BlockComment") emitComment(trivia.text, false);
    }
    if (token.kind === "Newline") {
      pending++;
      return;
    }
    if (token.kind === "EOF") return;

    // Closers leave their level before the line is indented.
    if (CLOSERS.has(token.kind)) {
      const top = open.pop();
      if (top?.expanded) forced = 1;
    }

    // A filled pen list moves an item to the next line when it no longer fits on this one.
    if (fill?.filled && fill.item && token.kind !== "Comma" && i !== fill.close) {
      fill.item = false;
      const current = currentLine();
      const width =
        columnsOf(current) + (needsSpace(token) ? 1 : 0) + flatColumns(i, itemEnd(i, fill.close));
      if (current.trim() !== "" && width > FILL_COLUMNS) forced = 1;
    }

    const breaks = breaksFor(true);
    if (breaks > 0) newLines(breaks, depth());
    else if (needsSpace(token)) line += " ";
    line += token.text;
    started = true;
    consumeBreakState(breaks);
    lastKind = token.kind;
    lastToken = token;

    if (OPENERS.has(token.kind)) {
      const isExpanded = expanded.has(i);
      open.push({ index: i, expanded: isExpanded, kind: token.kind });
      if (isExpanded) forced = 1;
      const filled = fills.get(i);
      if (filled !== undefined) {
        fill = { open: i, close: partner.get(i) ?? i, filled, item: false };
      }
    } else if (fill !== null && i === fill.close) {
      fill = null;
    } else if (fill !== null && token.kind === "Comma") {
      if (open[open.length - 1]?.index === fill.open) fill.item = true;
    } else if (token.kind === "Comma" && insideExpandedGroup()) {
      forced = 1;
    }

    const item = lastTokenOfItem.get(i);
    const next = item === undefined ? undefined : items[item + 1];
    if (item !== undefined && next !== undefined && open.length === 0) {
      afterItem = {
        prevBlock: BLOCK_ITEMS.has(items[item]!.kind),
        nextBlock: BLOCK_ITEMS.has(next.kind),
      };
    }
  });

  if (line.trim() !== "" || lines.length > 0) lines.push(line.replace(/[ \t]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return bom;
  return bom + lines.join(settings.eol) + settings.eol;
}
