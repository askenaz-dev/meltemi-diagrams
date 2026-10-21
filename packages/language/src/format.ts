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

/**
 * Lays out a source in the canonical format. Only spaces, line breaks and indentation change:
 * token text and order, and every comment, are kept. Files with syntax errors are refused.
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

  const formatted = print(parsed.tokens, parsed.root.items, {
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

function print(
  tokens: readonly Token[],
  items: readonly TopLevelSpan[],
  settings: PrintSettings,
): string {
  // ------------------------------------------------------------ structural facts
  const partner = new Map<number, number>();
  const stack: number[] = [];
  tokens.forEach((token, i) => {
    if (OPENERS.has(token.kind)) stack.push(i);
    else if (CLOSERS.has(token.kind)) {
      const open = stack.pop();
      if (open !== undefined) {
        partner.set(open, i);
        partner.set(i, open);
      }
    }
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

  const depth = () => open.filter((o) => o.kind === "LBrace" || o.expanded).length;
  const insideExpandedGroup = () => {
    const top = open[open.length - 1];
    return top !== undefined && top.kind !== "LBrace" && top.expanded;
  };

  const newLines = (count: number, level: number) => {
    lines.push(line.replace(/[ \t]+$/, ""));
    if (count >= 2) lines.push("");
    line = settings.unit.repeat(level);
  };

  const breaksFor = (isToken: boolean): number => {
    if (!started) return 0;
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

  const needsSpace = (token: Token): boolean => {
    if (lastKind === null) return false;
    if (lastKind === "comment") return true;
    if (NO_SPACE_BEFORE.has(token.kind) || NO_SPACE_AFTER.has(lastKind)) return false;
    // `api["API"]`: a bracket written right after an identifier is a shorthand declaration.
    if (
      token.kind === "LBracket" &&
      lastKind === "Identifier" &&
      lastToken !== null &&
      lastToken.end === token.start &&
      token.leadingTrivia.length === 0
    ) {
      return false;
    }
    return true;
  };

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
