import type { Span } from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";

/** A JSON value with the span of its text. Objects keep their members in source order. */
export type JsonValue =
  | { readonly kind: "object"; readonly span: Span; readonly members: readonly JsonMember[] }
  | { readonly kind: "array"; readonly span: Span; readonly items: readonly JsonValue[] }
  | { readonly kind: "string"; readonly span: Span; readonly value: string }
  | { readonly kind: "number"; readonly span: Span; readonly value: number }
  | { readonly kind: "boolean"; readonly span: Span; readonly value: boolean }
  | { readonly kind: "null"; readonly span: Span };

export interface JsonMember {
  readonly key: string;
  readonly keySpan: Span;
  readonly value: JsonValue;
}

export type JsonParseResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly message: string; readonly span: Span };

class JsonError extends Error {
  constructor(
    message: string,
    readonly span: Span,
  ) {
    super(message);
  }
}

/**
 * Parses strict JSON (RFC 8259) and keeps the span of every key and value, so manifest
 * diagnostics can point at the exact text. Never throws; the first error is returned with its span.
 */
export function parseJsonWithPositions(text: string): JsonParseResult {
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  // The reasons are written in the interface language of the moment the text is read.
  const t = messages().json;

  const fail = (message: string, start = pos, end = Math.min(pos + 1, text.length)): never => {
    throw new JsonError(message, { start, end: Math.max(end, start) });
  };
  const describe = () => (pos >= text.length ? t.endOfFile : `\`${text[pos]}\``);

  const skipSpace = () => {
    while (pos < text.length && " \t\n\r".includes(text[pos]!)) pos++;
  };

  const parseString = (): { value: string; span: Span } => {
    const start = pos;
    pos++;
    let value = "";
    for (;;) {
      if (pos >= text.length) fail(t.unterminatedString, start, pos);
      const char = text[pos]!;
      if (char === '"') {
        pos++;
        return { value, span: { start, end: pos } };
      }
      if (char === "\\") {
        const escape = text[pos + 1];
        const simple: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (escape !== undefined && escape in simple) {
          value += simple[escape];
          pos += 2;
          continue;
        }
        if (escape === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(pos + 2, pos + 6))) {
          value += String.fromCharCode(parseInt(text.slice(pos + 2, pos + 6), 16));
          pos += 6;
          continue;
        }
        fail(t.invalidEscape, pos, pos + 2);
      }
      if (char.charCodeAt(0) < 0x20) fail(t.controlCharacter);
      value += char;
      pos++;
    }
  };

  const parseValue = (): JsonValue => {
    skipSpace();
    const start = pos;
    const char = text[pos];
    if (char === "{") {
      pos++;
      const members: JsonMember[] = [];
      skipSpace();
      if (text[pos] === "}") {
        pos++;
        return { kind: "object", span: { start, end: pos }, members };
      }
      for (;;) {
        skipSpace();
        if (text[pos] !== '"') fail(t.propertyName(describe()));
        const key = parseString();
        skipSpace();
        if (text[pos] !== ":") fail(t.colon(describe()));
        pos++;
        const value = parseValue();
        members.push({ key: key.value, keySpan: key.span, value });
        skipSpace();
        if (text[pos] === ",") {
          const comma = pos;
          pos++;
          skipSpace();
          if (text[pos] === "}") fail(t.trailingComma("}"), comma, comma + 1);
          continue;
        }
        if (text[pos] === "}") {
          pos++;
          return { kind: "object", span: { start, end: pos }, members };
        }
        fail(t.commaOrBrace(describe()));
      }
    }
    if (char === "[") {
      pos++;
      const items: JsonValue[] = [];
      skipSpace();
      if (text[pos] === "]") {
        pos++;
        return { kind: "array", span: { start, end: pos }, items };
      }
      for (;;) {
        items.push(parseValue());
        skipSpace();
        if (text[pos] === ",") {
          const comma = pos;
          pos++;
          skipSpace();
          if (text[pos] === "]") fail(t.trailingComma("]"), comma, comma + 1);
          continue;
        }
        if (text[pos] === "]") {
          pos++;
          return { kind: "array", span: { start, end: pos }, items };
        }
        fail(t.commaOrBracket(describe()));
      }
    }
    if (char === '"') {
      const { value, span } = parseString();
      return { kind: "string", span, value };
    }
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(pos));
    if (number && number[0].length > 0) {
      pos += number[0].length;
      return { kind: "number", span: { start, end: pos }, value: Number(number[0]) };
    }
    for (const [word, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (text.startsWith(word, pos)) {
        pos += word.length;
        const span = { start, end: pos };
        return value === null ? { kind: "null", span } : { kind: "boolean", span, value };
      }
    }
    return fail(t.value(describe()));
  };

  try {
    const value = parseValue();
    skipSpace();
    if (pos < text.length) fail(t.afterValue(describe()));
    return { ok: true, value };
  } catch (error) {
    if (error instanceof JsonError) return { ok: false, message: error.message, span: error.span };
    throw error;
  }
}
