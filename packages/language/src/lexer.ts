import { createDiagnostic, type Diagnostic, type DiagnosticInput } from "./diagnostics.js";
import { messages } from "./messages/index.js";
import { LineIndex } from "./positions.js";
import type { Token, TokenKind, Trivia, TriviaKind } from "./tokens.js";

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

const CH_TAB = 9;
const CH_LF = 10;
const CH_VT = 11;
const CH_FF = 12;
const CH_CR = 13;
const CH_SPACE = 32;
const CH_QUOTE = 34;
const CH_PERCENT = 37;
const CH_LPAREN = 40;
const CH_RPAREN = 41;
const CH_STAR = 42;
const CH_COMMA = 44;
const CH_MINUS = 45;
const CH_DOT = 46;
const CH_SLASH = 47;
const CH_COLON = 58;
const CH_SEMICOLON = 59;
const CH_LT = 60;
const CH_GT = 62;
const CH_LBRACKET = 91;
const CH_BACKSLASH = 92;
const CH_RBRACKET = 93;
const CH_LBRACE = 123;
const CH_RBRACE = 125;
const CH_BOM = 0xfeff;

const SINGLE_CHAR_TOKENS = new Map<number, TokenKind>([
  [CH_LBRACE, "LBrace"],
  [CH_RBRACE, "RBrace"],
  [CH_LPAREN, "LParen"],
  [CH_RPAREN, "RParen"],
  [CH_LBRACKET, "LBracket"],
  [CH_RBRACKET, "RBracket"],
  [CH_COLON, "Colon"],
  [CH_SEMICOLON, "Semicolon"],
  [CH_COMMA, "Comma"],
  [CH_DOT, "Dot"],
]);

const ESCAPES = new Map<string, string>([
  ['"', '"'],
  ["\\", "\\"],
  ["n", "\n"],
  ["t", "\t"],
]);

function isIdentStart(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function isIdentPart(c: number): boolean {
  return isIdentStart(c) || isDigit(c);
}

/** The length of a two-way arrow at `i`: 3 for `<->`, 4 for `<-->`, else 0. */
function twoWayArrowLength(text: string, i: number): number {
  if (text.charCodeAt(i) !== CH_LT || text.charCodeAt(i + 1) !== CH_MINUS) return 0;
  if (text.charCodeAt(i + 2) === CH_GT) return 3;
  return text.charCodeAt(i + 2) === CH_MINUS && text.charCodeAt(i + 3) === CH_GT ? 4 : 0;
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isInlineWhitespace(c: number): boolean {
  return c === CH_SPACE || c === CH_TAB || c === CH_VT || c === CH_FF;
}

/**
 * Splits `.meltemi` text into tokens. Every character ends up either in a token or in the
 * leading trivia of a token, so concatenating trivia and token texts gives back the input.
 */
export function tokenize(text: string, lines: LineIndex = new LineIndex(text)): LexResult {
  return new Lexer(text, lines).run();
}

class Lexer {
  private pos = 0;
  private trivia: Trivia[] = [];
  private triviaStart = 0;
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private firstLineBreak: "\n" | "\r\n" | null = null;
  private reportedMixedLineEndings = false;

  constructor(
    private readonly text: string,
    private readonly lines: LineIndex,
  ) {}

  run(): LexResult {
    const text = this.text;
    const n = text.length;
    while (this.pos < n) {
      const start = this.pos;
      const c = text.charCodeAt(start);

      if (c === CH_BOM && start === 0) {
        this.pos = 1;
        this.pushTrivia("ByteOrderMark", start);
        const { diagnostics, hints } = messages();
        this.report({
          code: "syntax.bom",
          severity: "info",
          message: diagnostics.bom,
          span: { start: 0, end: 1 },
          hints: [hints.bom],
        });
        continue;
      }
      if (isInlineWhitespace(c) || (c === CH_CR && text.charCodeAt(start + 1) !== CH_LF)) {
        this.pos++;
        while (this.pos < n) {
          const d = text.charCodeAt(this.pos);
          if (isInlineWhitespace(d) || (d === CH_CR && text.charCodeAt(this.pos + 1) !== CH_LF)) {
            this.pos++;
          } else break;
        }
        this.pushTrivia("Whitespace", start);
        continue;
      }
      if (c === CH_SLASH && text.charCodeAt(start + 1) === CH_SLASH) {
        this.pos += 2;
        while (this.pos < n) {
          const d = text.charCodeAt(this.pos);
          if (d === CH_LF || (d === CH_CR && text.charCodeAt(this.pos + 1) === CH_LF)) break;
          this.pos++;
        }
        this.pushTrivia("LineComment", start);
        continue;
      }
      if (c === CH_SLASH && text.charCodeAt(start + 1) === CH_STAR) {
        const close = text.indexOf("*/", start + 2);
        if (close < 0) {
          this.pos = n;
          this.report({
            code: "syntax.unterminated-comment",
            message: messages().diagnostics.unterminatedComment,
            span: { start, end: Math.min(n, start + 2) },
          });
        } else {
          this.pos = close + 2;
        }
        this.pushTrivia("BlockComment", start);
        continue;
      }

      if (c === CH_LF) {
        this.pos++;
        this.lineBreak(start, "\n");
        continue;
      }
      if (c === CH_CR) {
        // Only reached for CRLF; lone CR is whitespace.
        this.pos += 2;
        this.lineBreak(start, "\r\n");
        continue;
      }
      if (isIdentStart(c)) {
        this.pos++;
        while (this.pos < n && isIdentPart(text.charCodeAt(this.pos))) this.pos++;
        this.pushToken("Identifier", start);
        continue;
      }
      if (c === CH_MINUS) {
        const c1 = text.charCodeAt(start + 1);
        if (c1 === CH_GT) {
          this.pos += 2;
          this.pushToken("Arrow", start);
          continue;
        }
        if (c1 === CH_MINUS && text.charCodeAt(start + 2) === CH_GT) {
          this.pos += 3;
          this.pushToken("DashedArrow", start);
          continue;
        }
        if (isDigit(c1)) {
          this.number(start);
          continue;
        }
      }
      if (c === CH_LT) {
        // The two-way arrows `<->` and `<-->`; any other `<` is an unexpected character.
        const length = twoWayArrowLength(text, start);
        if (length > 0) {
          this.pos += length;
          this.pushToken(length === 3 ? "BothArrow" : "DashedBothArrow", start);
          continue;
        }
      }
      if (isDigit(c)) {
        this.number(start);
        continue;
      }
      if (c === CH_QUOTE) {
        this.string(start);
        continue;
      }
      const single = SINGLE_CHAR_TOKENS.get(c);
      if (single) {
        this.pos++;
        this.pushToken(single, start);
        continue;
      }
      this.unknown(start);
    }
    this.pushToken("EOF", n);
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private report(input: DiagnosticInput): void {
    this.diagnostics.push(createDiagnostic(this.lines, input));
  }

  private pushTrivia(kind: TriviaKind, start: number): void {
    if (this.trivia.length === 0) this.triviaStart = start;
    this.trivia.push({ kind, text: this.text.slice(start, this.pos), start, end: this.pos });
  }

  private pushToken(
    kind: TokenKind,
    start: number,
    extra?: { value?: string | number; unit?: string | null; malformed?: boolean },
  ): Token {
    const leadingTrivia = this.trivia;
    const token: Token = {
      kind,
      text: this.text.slice(start, this.pos),
      start,
      end: this.pos,
      fullStart: leadingTrivia.length > 0 ? this.triviaStart : start,
      leadingTrivia,
      ...extra,
    };
    this.tokens.push(token);
    this.trivia = [];
    return token;
  }

  private lineBreak(start: number, kind: "\n" | "\r\n"): void {
    const token = this.pushToken("Newline", start);
    if (this.firstLineBreak === null) {
      this.firstLineBreak = kind;
    } else if (kind !== this.firstLineBreak && !this.reportedMixedLineEndings) {
      this.reportedMixedLineEndings = true;
      const name = (k: string) => (k === "\n" ? "LF" : "CRLF");
      const { diagnostics, hints } = messages();
      this.report({
        code: "syntax.mixed-line-endings",
        severity: "warning",
        message: diagnostics.mixedLineEndings(name(kind), name(this.firstLineBreak)),
        span: { start: token.start, end: token.end },
        hints: [hints.lineEndings],
      });
    }
  }

  private number(start: number): void {
    const text = this.text;
    if (text.charCodeAt(this.pos) === CH_MINUS) this.pos++;
    while (isDigit(text.charCodeAt(this.pos))) this.pos++;
    if (text.charCodeAt(this.pos) === CH_DOT && isDigit(text.charCodeAt(this.pos + 1))) {
      this.pos++;
      while (isDigit(text.charCodeAt(this.pos))) this.pos++;
    }
    const numericEnd = this.pos;
    let unit: string | null = null;
    if (isIdentStart(text.charCodeAt(this.pos))) {
      while (this.pos < text.length && isIdentPart(text.charCodeAt(this.pos))) this.pos++;
      unit = text.slice(numericEnd, this.pos);
    } else if (text.charCodeAt(this.pos) === CH_PERCENT) {
      this.pos++;
      unit = "%";
    }
    this.pushToken("Number", start, { value: Number(text.slice(start, numericEnd)), unit });
  }

  private string(start: number): void {
    const text = this.text;
    const n = text.length;
    this.pos = start + 1;
    let value = "";
    let terminated = false;
    let malformed = false;
    while (this.pos < n) {
      const c = text.charCodeAt(this.pos);
      if (c === CH_QUOTE) {
        this.pos++;
        terminated = true;
        break;
      }
      if (c === CH_LF || (c === CH_CR && text.charCodeAt(this.pos + 1) === CH_LF)) break;
      if (c === CH_BACKSLASH) {
        const next = text[this.pos + 1];
        if (next === undefined || next === "\n" || next === "\r") {
          value += "\\";
          this.pos++;
          continue;
        }
        const decoded = ESCAPES.get(next);
        if (decoded !== undefined) {
          value += decoded;
        } else {
          malformed = true;
          value += `\\${next}`;
          const { diagnostics, hints } = messages();
          this.report({
            code: "syntax.invalid-escape",
            message: diagnostics.invalidEscape(`\\${next}`),
            span: { start: this.pos, end: this.pos + 2 },
            hints: [hints.escapes],
          });
        }
        this.pos += 2;
        continue;
      }
      value += text[this.pos];
      this.pos++;
    }
    if (!terminated) {
      malformed = true;
      const { diagnostics, hints } = messages();
      this.report({
        code: "syntax.unterminated-string",
        message: diagnostics.unterminatedString,
        span: { start, end: this.pos },
        hints: [hints.multilineString],
      });
    }
    this.pushToken("String", start, { value, malformed });
  }

  private canStartSomething(i: number): boolean {
    const text = this.text;
    const c = text.charCodeAt(i);
    if (isInlineWhitespace(c) || c === CH_LF || c === CH_CR) return true;
    if (isIdentStart(c) || isDigit(c) || c === CH_QUOTE) return true;
    if (SINGLE_CHAR_TOKENS.has(c)) return true;
    if (c === CH_SLASH) {
      const c1 = text.charCodeAt(i + 1);
      return c1 === CH_SLASH || c1 === CH_STAR;
    }
    if (c === CH_MINUS) {
      const c1 = text.charCodeAt(i + 1);
      return c1 === CH_GT || isDigit(c1) || (c1 === CH_MINUS && text.charCodeAt(i + 2) === CH_GT);
    }
    if (c === CH_LT) return twoWayArrowLength(text, i) > 0;
    return false;
  }

  private unknown(start: number): void {
    this.pos = start + 1;
    while (this.pos < this.text.length && !this.canStartSomething(this.pos)) this.pos++;
    const token = this.pushToken("Unknown", start);
    const chars = token.text;
    const m = messages();
    const hints: string[] = [];
    if (/[=<>]/.test(chars)) hints.push(m.hints.arrows);
    if (/[^\x20-\x7e]/.test(chars)) hints.push(m.hints.identifiers);
    if (chars.startsWith("-")) hints.push(m.hints.minus);
    this.report({
      code: "syntax.unexpected-character",
      message:
        chars.length === 1 || [...chars].length === 1
          ? m.diagnostics.unexpectedCharacter(chars)
          : m.diagnostics.unexpectedCharacters(
              chars.length > 24 ? `${chars.slice(0, 21)}...` : chars,
            ),
      span: { start: token.start, end: token.end },
      hints,
    });
  }
}
