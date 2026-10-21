import { messages } from "../messages/index.js";

/** Values of the PlantUML preprocessor: strings, integers and JSON data. */
export type Value = string | number | JsonValue;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class ExprError extends Error {}

export function truthy(value: Value): boolean {
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return value !== "" && value !== "0" && value.toLowerCase() !== "false";
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null;
}

export function toText(value: Value): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function toNumber(value: Value): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : 0;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string }
  | { kind: "name"; name: string }
  | { kind: "op"; op: string }
  | { kind: "json"; value: JsonValue }
  | { kind: "end" };

const OPS = [
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<",
  ">",
  "!",
  "+",
  "-",
  "*",
  "/",
  "%",
  "(",
  ")",
  ",",
];

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\" && text[j + 1] === ch) {
          s += ch;
          j += 2;
          continue;
        }
        s += text[j];
        j++;
      }
      if (j >= text.length) throw new ExprError(messages().preprocessor.unclosedString(text));
      out.push({ kind: "str", value: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(text.slice(i))!;
      out.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === "[" || ch === "{") {
      const end = matchJson(text, i);
      const raw = text.slice(i, end + 1);
      try {
        out.push({ kind: "json", value: JSON.parse(raw) as JsonValue });
      } catch {
        throw new ExprError(messages().common.invalidJson(raw));
      }
      i = end + 1;
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z0-9_]+/.exec(text.slice(i));
      if (!m) throw new ExprError(messages().preprocessor.unexpected("$", text));
      out.push({ kind: "var", name: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_%]/.test(ch)) {
      const m = /^%?[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))!;
      out.push({ kind: "name", name: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => text.startsWith(o, i));
    if (op) {
      out.push({ kind: "op", op });
      i += op.length;
      continue;
    }
    throw new ExprError(messages().preprocessor.unexpected(ch, text));
  }
  out.push({ kind: "end" });
  return out;
}

function matchJson(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"') quote = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new ExprError(messages().preprocessor.unclosedJson(text));
}

export interface ExprHost {
  variable(name: string): Value | undefined;
  call(name: string, args: Value[]): Value;
}

/** Evaluates a preprocessor expression. Bare words are strings. */
export function evaluate(text: string, host: ExprHost): Value {
  const tokens = tokenize(text);
  let pos = 0;
  const peek = () => tokens[pos]!;
  const isOp = (op: string) => {
    const t = peek();
    return t.kind === "op" && t.op === op;
  };
  const expectOp = (op: string) => {
    if (!isOp(op)) throw new ExprError(messages().preprocessor.expectedIn(op, text));
    pos++;
  };

  const or = (): Value => {
    let left = and();
    while (isOp("||")) {
      pos++;
      const right = and();
      left = truthy(left) || truthy(right) ? 1 : 0;
    }
    return left;
  };
  const and = (): Value => {
    let left = cmp();
    while (isOp("&&")) {
      pos++;
      const right = cmp();
      left = truthy(left) && truthy(right) ? 1 : 0;
    }
    return left;
  };
  const cmp = (): Value => {
    const left = add();
    const t = peek();
    if (t.kind === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.op)) {
      pos++;
      const right = add();
      const numeric = typeof left === "number" && typeof right === "number";
      const a = numeric ? (left as number) : toText(left);
      const b = numeric ? (right as number) : toText(right);
      switch (t.op) {
        case "==":
          return a === b ? 1 : 0;
        case "!=":
          return a !== b ? 1 : 0;
        case "<":
          return a < b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        default:
          return a >= b ? 1 : 0;
      }
    }
    return left;
  };
  const add = (): Value => {
    let left = mul();
    for (;;) {
      if (isOp("+")) {
        pos++;
        const right = mul();
        left =
          typeof left === "number" && typeof right === "number"
            ? left + right
            : toText(left) + toText(right);
      } else if (isOp("-")) {
        pos++;
        left = toNumber(left) - toNumber(mul());
      } else return left;
    }
  };
  const mul = (): Value => {
    let left = unary();
    for (;;) {
      if (isOp("*")) {
        pos++;
        left = toNumber(left) * toNumber(unary());
      } else if (isOp("/")) {
        pos++;
        const d = toNumber(unary());
        left = d === 0 ? 0 : Math.trunc(toNumber(left) / d);
      } else if (isOp("%")) {
        pos++;
        const d = toNumber(unary());
        left = d === 0 ? 0 : toNumber(left) % d;
      } else return left;
    }
  };
  const unary = (): Value => {
    if (isOp("!")) {
      pos++;
      return truthy(unary()) ? 0 : 1;
    }
    if (isOp("-")) {
      pos++;
      return -toNumber(unary());
    }
    return primary();
  };
  const args = (): Value[] => {
    expectOp("(");
    const out: Value[] = [];
    if (isOp(")")) {
      pos++;
      return out;
    }
    for (;;) {
      out.push(or());
      if (isOp(",")) {
        pos++;
        continue;
      }
      expectOp(")");
      return out;
    }
  };
  const primary = (): Value => {
    const t = peek();
    switch (t.kind) {
      case "num":
        pos++;
        return t.value;
      case "str":
        pos++;
        return t.value;
      case "json":
        pos++;
        return t.value;
      case "var": {
        pos++;
        if (isOp("(")) return host.call(t.name, args());
        const value = host.variable(t.name);
        if (value === undefined) {
          throw new ExprError(messages().preprocessor.undefinedVariable(t.name));
        }
        return value;
      }
      case "name": {
        pos++;
        if (isOp("(")) return host.call(t.name, args());
        const value = host.variable(t.name);
        return value ?? t.name;
      }
      case "op":
        if (t.op === "(") {
          pos++;
          const v = or();
          expectOp(")");
          return v;
        }
        throw new ExprError(messages().preprocessor.unexpected(t.op, text));
      default:
        throw new ExprError(messages().preprocessor.incomplete(text));
    }
  };

  const value = or();
  if (peek().kind !== "end") throw new ExprError(messages().preprocessor.trailing(text));
  return value;
}
