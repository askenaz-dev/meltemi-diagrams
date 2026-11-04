import { messages } from "./messages/index.js";

export type TokenKind =
  | "Identifier"
  | "String"
  | "Number"
  | "Arrow"
  | "DashedArrow"
  | "BothArrow"
  | "DashedBothArrow"
  | "Line"
  | "DashedLine"
  | "LBrace"
  | "RBrace"
  | "LParen"
  | "RParen"
  | "LBracket"
  | "RBracket"
  | "Colon"
  | "Semicolon"
  | "Comma"
  | "Dot"
  | "Newline"
  | "Unknown"
  | "EOF";

export type TriviaKind = "Whitespace" | "LineComment" | "BlockComment" | "ByteOrderMark";

/** Text that carries no meaning (spaces, tabs, comments, BOM). Attached to the following token. */
export interface Trivia {
  readonly kind: TriviaKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface Token {
  readonly kind: TokenKind;
  /** Exact source text of the token, without trivia. */
  readonly text: string;
  /** Offset of the token text. */
  readonly start: number;
  readonly end: number;
  /** Offset where the leading trivia starts (equals `start` when there is none). */
  readonly fullStart: number;
  readonly leadingTrivia: readonly Trivia[];
  /** Decoded value of a string, or numeric value of a number. */
  readonly value?: string | number;
  /** Unit suffix of a number (`ms`, `s`, `%`, or any identifier), or null. */
  readonly unit?: string | null;
  /** True when the lexer reported an error for this token (unterminated string, bad escape). */
  readonly malformed?: boolean;
}

const PUNCTUATION_TEXT: Partial<Record<TokenKind, string>> = {
  Arrow: "->",
  DashedArrow: "-->",
  BothArrow: "<->",
  DashedBothArrow: "<-->",
  Line: "--",
  DashedLine: "---",
  LBrace: "{",
  RBrace: "}",
  LParen: "(",
  RParen: ")",
  LBracket: "[",
  RBracket: "]",
  Colon: ":",
  Semicolon: ";",
  Comma: ",",
  Dot: ".",
};

export function punctuationText(kind: TokenKind): string | undefined {
  return PUNCTUATION_TEXT[kind];
}

/** Human description of a token for diagnostic messages, in the interface language. */
export function describeToken(token: Token): string {
  switch (token.kind) {
    case "Newline":
      return messages().tokens.endOfLine;
    case "EOF":
      return messages().tokens.endOfFile;
    case "String": {
      const text = token.text.length > 32 ? `${token.text.slice(0, 29)}...` : token.text;
      return messages().tokens.string(text);
    }
    default:
      return `\`${token.text.length > 32 ? `${token.text.slice(0, 29)}...` : token.text}\``;
  }
}

/**
 * The six relation tokens: `->`, `-->`, the two-way `<->` and `<-->`, and the lines without heads
 * `--` and `---`.
 */
export function isArrowKind(kind: TokenKind): boolean {
  return (
    kind === "Arrow" ||
    kind === "DashedArrow" ||
    kind === "BothArrow" ||
    kind === "DashedBothArrow" ||
    kind === "Line" ||
    kind === "DashedLine"
  );
}

export function isIdentifierText(text: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}
