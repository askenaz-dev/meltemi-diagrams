import type { Span } from "@meltemi/diagrams-language";
import type { C4Level } from "../c4.js";
import { messages } from "../messages/index.js";
import { splitLines, type Reporter, type SourceLine } from "../report.js";
import {
  evaluate,
  ExprError,
  toNumber,
  toText,
  truthy,
  type JsonValue,
  type Value,
} from "./expr.js";
import { basename, dirname, isAbsolutePath, isInside, joinPath, normalizePath } from "./paths.js";

export const MAX_EXPANSION_DEPTH = 100;
export const MAX_OUTPUT_LINES = 100_000;
const MAX_LOOP = 1000;

export interface PreprocessOptions {
  readonly fileName?: string;
  readonly readFile?: (path: string) => string | undefined;
  readonly includeRoot?: string;
}

/** What preprocessing learnt about the libraries a source includes. */
export interface Libraries {
  /** The C4-PlantUML library was included. */
  c4: boolean;
  /** The level its file name states. */
  c4Level: C4Level | null;
  c4Dynamic: boolean;
  /** `C4_Deployment` or `C4_Sequence`, which are not imported. */
  c4Unsupported: string | null;
}

export interface PreprocessResult {
  readonly lines: SourceLine[];
  readonly libraries: Libraries;
}

class PreprocessError extends Error {
  constructor(
    message: string,
    readonly span: Span,
    readonly code: "import.preprocessor" | "import.include" = "import.preprocessor",
  ) {
    super(message);
  }
}

class Return {
  constructor(readonly value: Value) {}
}

interface Param {
  name: string;
  default?: string;
}

interface Callable {
  name: string;
  params: Param[];
  lines: SourceLine[];
  unquoted: boolean;
  /** One-line functions: `!function $f($a) !return $a + 1`. */
  inlineReturn?: string;
}

interface Define {
  params: string[] | null;
  body: string;
}

interface Frame {
  file: string;
  dir: string;
}

const C4_FILE =
  /(?:^|[/<])C4_(Context|Container|Component|Dynamic|Deployment|Sequence)(?:\.puml)?>?$/;
const C4_ANY = /(?:^|[/<])C4(?:\.puml)?>?$/;

/** Runs the PlantUML preprocessor over the lines of one diagram. */
export class Preprocessor {
  private readonly globals = new Map<string, Value>();
  private readonly scopes: Map<string, Value>[] = [];
  private readonly defines = new Map<string, Define>();
  private readonly longDefines = new Map<string, Callable>();
  private readonly procedures = new Map<string, Callable>();
  private readonly functions = new Map<string, Callable>();
  private readonly included = new Set<string>();
  private readonly includeStack: string[] = [];
  private readonly out: SourceLine[] = [];
  private depth = 0;
  private muted = 0;
  readonly libraries: Libraries = {
    c4: false,
    c4Level: null,
    c4Dynamic: false,
    c4Unsupported: null,
  };
  private readonly root: string;
  private readonly file: string;

  constructor(
    private readonly reporter: Reporter,
    private readonly options: PreprocessOptions,
  ) {
    this.file = normalizePath(options.fileName ?? "source.puml");
    this.root = normalizePath(options.includeRoot ?? dirname(this.file));
  }

  run(lines: readonly SourceLine[]): PreprocessResult {
    try {
      this.exec(lines, { file: this.file, dir: dirname(this.file) });
    } catch (error) {
      if (error instanceof PreprocessError) {
        this.report(error);
      } else if (error instanceof Return) {
        // `!return` outside a function: ignore what follows.
      } else throw error;
    }
    return { lines: this.out, libraries: this.libraries };
  }

  private report(error: PreprocessError): void {
    this.reporter.add({
      code: error.code,
      severity: error.code === "import.include" ? "warning" : "error",
      message: error.message,
      span: error.span,
      construct:
        error.code === "import.include" ? "plantuml.include.error" : "plantuml.preprocessor",
      status: "dropped",
      essential: true,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Statements

  private exec(lines: readonly SourceLine[], frame: Frame): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const t = line.text.trim();
      if (t.startsWith("'") || t === "") {
        this.emit(line, line.text);
        continue;
      }
      if (!t.startsWith("!")) {
        this.plain(line, frame);
        continue;
      }
      const word = /^!\s*([A-Za-z_]+|\$[A-Za-z0-9_]+)/.exec(t)?.[1] ?? "";
      switch (word) {
        case "if":
        case "ifdef":
        case "ifndef":
          i = this.conditional(lines, i, frame);
          continue;
        case "while":
          i = this.loop(lines, i, frame);
          continue;
        case "foreach":
          i = this.foreach(lines, i, frame);
          continue;
        case "procedure":
        case "function":
        case "unquoted":
        case "final":
          i = this.declare(lines, i);
          continue;
        case "definelong":
          i = this.defineLong(lines, i);
          continue;
        case "define":
          this.define(line, t);
          continue;
        case "undef": {
          const name = t.replace(/^!\s*undef\s+/, "").trim();
          this.defines.delete(name);
          this.longDefines.delete(name);
          continue;
        }
        case "global":
        case "local":
          this.assign(line, t.replace(/^!\s*(global|local)\s+/, "!"), word);
          continue;
        case "include":
        case "include_once":
        case "include_many":
        case "includeurl":
        case "includesub":
        case "includedef":
          // A missing or refused include is reported; the rest of the source still imports.
          try {
            this.include(line, t, word, frame);
          } catch (error) {
            if (!(error instanceof PreprocessError) || error.code !== "import.include") throw error;
            this.report(error);
          }
          continue;
        case "import":
          this.report(
            new PreprocessError(
              messages().preprocessor.importArchives,
              line.span,
              "import.include",
            ),
          );
          continue;
        case "return":
          throw new Return(this.eval(t.replace(/^!\s*return\b/, ""), line));
        case "assert": {
          const m = /^!\s*assert\s+(.*?)(?:\s*:\s*(.*))?$/.exec(t)!;
          if (!truthy(this.eval(m[1]!, line))) {
            throw new PreprocessError(messages().preprocessor.assertion(m[2] ?? m[1]!), line.span);
          }
          continue;
        }
        case "log":
        case "dump_memory":
        case "startsub":
        case "endsub":
          continue;
        case "theme":
          this.reporter.dropped("plantuml.theme", line.span, messages().preprocessor.themes);
          continue;
        case "pragma":
          this.reporter.dropped("plantuml.pragma", line.span, messages().preprocessor.pragma);
          continue;
        case "endif":
        case "else":
        case "elseif":
        case "endwhile":
        case "endfor":
        case "endprocedure":
        case "endfunction":
        case "enddefinelong":
          throw new PreprocessError(messages().preprocessor.unopened(word), line.span);
        default:
          if (word.startsWith("$")) {
            this.assign(line, t, null);
            continue;
          }
          throw new PreprocessError(messages().preprocessor.unknownDirective(word), line.span);
      }
    }
  }

  private emit(line: SourceLine, text: string): void {
    // Function bodies compute a value; their plain lines produce nothing.
    if (this.muted > 0) return;
    if (this.out.length >= MAX_OUTPUT_LINES) {
      throw new PreprocessError(messages().preprocessor.tooManyLines(MAX_OUTPUT_LINES), line.span);
    }
    this.out.push(text === line.text ? line : { ...line, text, generated: true });
  }

  /** A line that is not a directive: procedure calls expand, the rest is substituted. */
  private plain(line: SourceLine, frame: Frame): void {
    const t = line.text.trim();
    const call = /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(t);
    if (call) {
      const name = call[1]!;
      const callable = this.procedures.get(name) ?? this.longDefines.get(name);
      if (callable) {
        const close = matchParen(t, call[0].length - 1);
        if (close >= 0 && t.slice(close + 1).trim() === "") {
          const args = splitArgs(t.slice(call[0].length, close));
          this.invoke(callable, args, line, frame, "procedure");
          return;
        }
      }
    }
    const indent = line.text.length - line.text.trimStart().length;
    this.emit(line, line.text.slice(0, indent) + this.substitute(t, line));
  }

  private invoke(
    callable: Callable,
    rawArgs: string[],
    line: SourceLine,
    frame: Frame,
    as: "procedure" | "function",
  ): Value {
    if (++this.depth > MAX_EXPANSION_DEPTH) {
      throw new PreprocessError(
        messages().preprocessor.tooDeep(callable.name, MAX_EXPANSION_DEPTH),
        line.span,
      );
    }
    try {
      const scope = this.bind(callable, rawArgs, line);
      const generated = callable.lines.map((l) => ({
        ...l,
        span: line.span,
        start: line.start,
        generated: true,
      }));
      this.scopes.push(scope);
      if (as === "function") this.muted++;
      try {
        if (callable.inlineReturn !== undefined) return this.eval(callable.inlineReturn, line);
        if (this.longDefines.get(callable.name) === callable) {
          // Legacy `!definelong` bodies substitute their parameters as words.
          for (const l of generated) {
            let text = l.text;
            for (const [name, value] of scope) text = replaceWord(text, name, toText(value));
            this.plain({ ...l, text }, frame);
          }
          return "";
        }
        try {
          this.exec(generated, frame);
        } catch (error) {
          if (error instanceof Return) {
            if (as === "function") return error.value;
            return "";
          }
          throw error;
        }
        return "";
      } finally {
        if (as === "function") this.muted--;
        this.scopes.pop();
      }
    } finally {
      this.depth--;
    }
  }

  private bind(callable: Callable, rawArgs: string[], line: SourceLine): Map<string, Value> {
    const scope = new Map<string, Value>();
    let index = 0;
    for (const raw of rawArgs) {
      const kv = /^(\$[A-Za-z0-9_]+)\s*=\s*([\s\S]*)$/.exec(raw);
      if (kv) {
        scope.set(kv[1]!, this.argValue(kv[2]!, callable.unquoted, line));
        continue;
      }
      const param = callable.params[index++];
      if (!param) {
        if (raw.trim() === "") continue;
        throw new PreprocessError(
          messages().preprocessor.arguments(callable.name, callable.params.length),
          line.span,
        );
      }
      scope.set(param.name, this.argValue(raw, callable.unquoted, line));
    }
    for (const param of callable.params) {
      if (scope.has(param.name)) continue;
      scope.set(
        param.name,
        param.default !== undefined ? this.argValue(param.default, false, line) : "",
      );
    }
    return scope;
  }

  /**
   * An argument's value: quoted strings lose their quotes, numbers are numbers, expressions with
   * variables or calls are evaluated, and any other text is taken as written.
   */
  private argValue(raw: string, unquoted: boolean, line: SourceLine): Value {
    const t = raw.trim();
    if (t === "") return "";
    if (/^"[^"]*"$/.test(t) || /^'[^']*'$/.test(t)) return t.slice(1, -1);
    if (/^-?[0-9]+$/.test(t)) return Number(t);
    if (!unquoted && /[$%([{]/.test(t)) {
      try {
        return this.eval(t, line, true);
      } catch {
        // Not an expression: fall through to the text.
      }
    }
    return this.substituteVariables(t);
  }

  // -------------------------------------------------------------------------------------------
  // Substitution

  private substitute(text: string, line: SourceLine): string {
    let current = text;
    for (let round = 0; round < 20; round++) {
      let next = this.substituteDefines(current, line);
      next = this.substituteCalls(next, line);
      next = this.substituteVariables(next);
      if (next === current) return next;
      current = next;
    }
    return current;
  }

  private substituteDefines(text: string, line: SourceLine): string {
    let out = text;
    for (const [name, define] of this.defines) {
      if (!out.includes(name)) continue;
      if (define.params === null) {
        out = replaceWord(out, name, define.body);
        continue;
      }
      let search = 0;
      for (;;) {
        const at = findWord(out, name, search);
        if (at < 0) break;
        let open = at + name.length;
        while (out[open] === " ") open++;
        if (out[open] !== "(") {
          search = at + name.length;
          continue;
        }
        const close = matchParen(out, open);
        if (close < 0)
          throw new PreprocessError(messages().preprocessor.callNotClosed(name), line.span);
        const args = splitArgs(out.slice(open + 1, close)).map((a) => a.trim());
        let body = define.body;
        define.params.forEach((param, i) => {
          body = replaceWord(body, param, args[i] ?? "");
        });
        body = body.replace(/\s*##\s*/g, "");
        out = out.slice(0, at) + body + out.slice(close + 1);
        search = at + body.length;
      }
    }
    return out;
  }

  private substituteCalls(text: string, line: SourceLine): string {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const m = /([$%]?[A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(text.slice(i));
      if (!m) break;
      const at = i + m.index;
      const name = m[1]!;
      const before = text[at - 1];
      const known = name.startsWith("%") || this.functions.has(name);
      // `$` and `%` start a name wherever they are; other names need a word boundary.
      const bounded =
        name.startsWith("$") ||
        name.startsWith("%") ||
        before === undefined ||
        !/[A-Za-z0-9_$%]/.test(before);
      if (!known || !bounded) {
        out += text.slice(i, at + m[0].length);
        i = at + m[0].length;
        continue;
      }
      const open = at + m[0].length - 1;
      const close = matchParen(text, open);
      if (close < 0) {
        throw new PreprocessError(messages().preprocessor.callNotClosed(name), line.span);
      }
      const value = this.eval(text.slice(at, close + 1), line);
      out += text.slice(i, at) + toText(value);
      i = close + 1;
    }
    return out + text.slice(i);
  }

  private substituteVariables(text: string): string {
    return text.replace(/\$[A-Za-z0-9_]+/g, (name) => {
      const value = this.variable(name);
      return value === undefined ? name : toText(value);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Values

  variable(name: string): Value | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i]!.get(name);
      if (v !== undefined) return v;
    }
    const global = this.globals.get(name);
    if (global !== undefined) return global;
    const define = this.defines.get(name);
    if (define && define.params === null) return define.body;
    return undefined;
  }

  private eval(text: string, line: SourceLine, lenient = false): Value {
    try {
      return evaluate(text.trim() === "" ? '""' : text, {
        variable: (name) => this.variable(name),
        call: (name, args) => this.call(name, args, line),
      });
    } catch (error) {
      if (error instanceof ExprError) {
        if (lenient) throw error;
        throw new PreprocessError(error.message, line.span);
      }
      throw error;
    }
  }

  private call(name: string, args: Value[], line: SourceLine): Value {
    if (name.startsWith("%")) return this.builtin(name, args, line);
    const fn = this.functions.get(name);
    if (!fn) throw new PreprocessError(messages().preprocessor.notAFunction(name), line.span);
    return this.invoke(
      fn,
      args.map((a) => (typeof a === "string" ? JSON.stringify(a) : toText(a))),
      line,
      { file: this.file, dir: dirname(this.file) },
      "function",
    );
  }

  private builtin(name: string, args: Value[], line: SourceLine): Value {
    const s = (i: number) => toText(args[i] ?? "");
    const n = (i: number) => toNumber(args[i] ?? 0);
    switch (name) {
      case "%strlen":
        return s(0).length;
      case "%substr":
        return args.length > 2 ? s(0).substr(n(1), n(2)) : s(0).substr(n(1));
      case "%strpos":
        return s(0).indexOf(s(1));
      case "%upper":
        return s(0).toUpperCase();
      case "%lower":
        return s(0).toLowerCase();
      case "%string":
        return s(0);
      case "%intval":
        return n(0);
      case "%boolval":
        return truthy(args[0] ?? 0) ? 1 : 0;
      case "%true":
        return 1;
      case "%false":
        return 0;
      case "%not":
        return truthy(args[0] ?? 0) ? 0 : 1;
      case "%newline":
        return "\\n";
      case "%chr":
        return String.fromCharCode(n(0));
      case "%ord":
        return s(0).charCodeAt(0) || 0;
      case "%mod":
        return n(1) === 0 ? 0 : n(0) % n(1);
      case "%dec2hex":
        return n(0).toString(16);
      case "%hex2dec":
        return Number.parseInt(s(0), 16) || 0;
      case "%variable_exists":
        return this.variable(s(0).startsWith("$") ? s(0) : `$${s(0)}`) !== undefined ||
          this.variable(s(0)) !== undefined
          ? 1
          : 0;
      case "%function_exists":
        return this.functions.has(s(0)) || this.procedures.has(s(0)) ? 1 : 0;
      case "%get_variable_value":
        return this.variable(s(0)) ?? "";
      case "%set_variable_value":
        this.globals.set(s(0), args[1] ?? "");
        return "";
      case "%call_user_func": {
        const [fn, ...rest] = args;
        return this.call(toText(fn ?? ""), rest, line);
      }
      case "%size": {
        const v = args[0];
        if (Array.isArray(v)) return v.length;
        if (v !== null && typeof v === "object") return Object.keys(v).length;
        return toText(v ?? "").length;
      }
      case "%splitstr":
        return s(0).split(s(1)) as JsonValue;
      case "%str2json":
        try {
          return JSON.parse(s(0)) as JsonValue;
        } catch {
          throw new PreprocessError(messages().common.invalidJson(s(0)), line.span);
        }
      case "%json_key_exists": {
        const v = args[0];
        return v !== null && typeof v === "object" && !Array.isArray(v) && s(1) in v ? 1 : 0;
      }
      case "%date":
      case "%now":
        return "";
      case "%random":
      case "%feature":
        return 0;
      case "%getenv":
        return "";
      case "%filename":
        return basename(this.file);
      case "%dirpath":
        return dirname(this.file);
      case "%version":
        return "meltemi-import";
      case "%lighten":
      case "%darken":
      case "%reverse_color":
      case "%reverse_hsluv_color":
        return s(0);
      case "%is_dark":
        return 0;
      case "%is_light":
        return 1;
      default:
        throw new PreprocessError(messages().preprocessor.unknownBuiltin(name), line.span);
    }
  }

  private assign(line: SourceLine, text: string, mode: "global" | "local" | null): void {
    const m = /^!\s*(\$[A-Za-z0-9_]+)\s*(\?=|=)\s*([\s\S]*)$/.exec(text.trim());
    if (!m) throw new PreprocessError(messages().common.expected("!$name = value"), line.span);
    const [, name, op, expr] = m as unknown as [string, string, string, string];
    if (op === "?=" && this.variable(name) !== undefined) return;
    let value: Value;
    try {
      value = this.eval(expr, line, true);
    } catch {
      value = stripQuotes(expr.trim());
    }
    const scope = this.scopes[this.scopes.length - 1];
    if (mode === "global" || !scope) this.globals.set(name, value);
    else if (mode === "local" || scope.has(name) || !this.globals.has(name)) scope.set(name, value);
    else this.globals.set(name, value);
  }

  // -------------------------------------------------------------------------------------------
  // Blocks

  /** Finds the lines of a block: `open` nested, `middle` separators at depth 0, `close` the end. */
  private block(
    lines: readonly SourceLine[],
    start: number,
    open: RegExp,
    close: RegExp,
    middle?: RegExp,
  ): { separators: number[]; end: number } {
    let depth = 0;
    const separators: number[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const t = lines[i]!.text.trim();
      if (open.test(t)) depth++;
      else if (close.test(t)) {
        if (depth === 0) return { separators, end: i };
        depth--;
      } else if (middle && depth === 0 && middle.test(t)) separators.push(i);
    }
    throw new PreprocessError(messages().preprocessor.blockNotClosed, lines[start]!.span);
  }

  private conditional(lines: readonly SourceLine[], start: number, frame: Frame): number {
    const { separators, end } = this.block(
      lines,
      start,
      /^!\s*(if|ifdef|ifndef)\b/,
      /^!\s*endif\b/,
      /^!\s*(else|elseif)\b/,
    );
    const heads = [start, ...separators];
    for (let k = 0; k < heads.length; k++) {
      const head = lines[heads[k]!]!;
      const t = head.text.trim();
      const bodyEnd = heads[k + 1] ?? end;
      let take: boolean;
      if (/^!\s*else\s*$/.test(t)) take = true;
      else if (/^!\s*ifdef\b/.test(t)) take = this.defined(t.replace(/^!\s*ifdef\s+/, ""));
      else if (/^!\s*ifndef\b/.test(t)) take = !this.defined(t.replace(/^!\s*ifndef\s+/, ""));
      else take = truthy(this.eval(t.replace(/^!\s*(if|elseif)\b/, ""), head));
      if (take) {
        this.exec(lines.slice(heads[k]! + 1, bodyEnd), frame);
        break;
      }
    }
    return end;
  }

  private defined(name: string): boolean {
    const n = name.trim();
    return this.defines.has(n) || this.longDefines.has(n) || this.variable(n) !== undefined;
  }

  private loop(lines: readonly SourceLine[], start: number, frame: Frame): number {
    const { end } = this.block(lines, start, /^!\s*while\b/, /^!\s*endwhile\b/);
    const head = lines[start]!;
    const cond = head.text.trim().replace(/^!\s*while\b/, "");
    let n = 0;
    while (truthy(this.eval(cond, head))) {
      if (++n > MAX_LOOP)
        throw new PreprocessError(messages().preprocessor.loop(MAX_LOOP), head.span);
      this.exec(lines.slice(start + 1, end), frame);
    }
    return end;
  }

  private foreach(lines: readonly SourceLine[], start: number, frame: Frame): number {
    const { end } = this.block(lines, start, /^!\s*foreach\b/, /^!\s*endfor\b/);
    const head = lines[start]!;
    const m = /^!\s*foreach\s+(\$[A-Za-z0-9_]+)\s+in\s+([\s\S]+)$/.exec(head.text.trim());
    if (!m) {
      throw new PreprocessError(messages().common.expected("!foreach $item in <list>"), head.span);
    }
    const list = this.eval(m[2]!, head);
    const items: JsonValue[] = Array.isArray(list)
      ? list
      : list !== null && typeof list === "object"
        ? Object.keys(list)
        : [];
    if (items.length > MAX_LOOP)
      throw new PreprocessError(messages().preprocessor.loop(MAX_LOOP), head.span);
    for (const item of items) {
      const scope = this.scopes[this.scopes.length - 1];
      (scope ?? this.globals).set(m[1]!, item === null ? "" : (item as Value));
      this.exec(lines.slice(start + 1, end), frame);
    }
    return end;
  }

  private declare(lines: readonly SourceLine[], start: number): number {
    const head = lines[start]!;
    const t = head.text.trim();
    const m =
      /^!\s*(?:(unquoted)\s+)?(?:(final)\s+)?(procedure|function)\s+([$]?[A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(.*)$/.exec(
        t,
      );
    if (!m)
      throw new PreprocessError(
        messages().common.expectedEither("!procedure $name(...)", "!function $name(...)"),
        head.span,
      );
    const [, unquoted, , kind, name, params, rest] = m as unknown as [
      string,
      string | undefined,
      string,
      string,
      string,
      string,
      string,
    ];
    const callable: Callable = {
      name,
      params: parseParams(params),
      lines: [],
      unquoted: unquoted !== undefined,
    };
    const inline = /^!\s*return\b([\s\S]*)$/.exec(rest.trim());
    if (kind === "function" && inline) {
      callable.inlineReturn = inline[1]!;
      this.functions.set(name, callable);
      return start;
    }
    const closer = kind === "procedure" ? /^!\s*end\s*procedure\b/ : /^!\s*end\s*function\b/;
    const opener = /^!\s*(?:unquoted\s+)?(?:final\s+)?(procedure|function)\b/;
    const { end } = this.block(lines, start, opener, closer);
    callable.lines = lines.slice(start + 1, end);
    (kind === "procedure" ? this.procedures : this.functions).set(name, callable);
    return end;
  }

  private defineLong(lines: readonly SourceLine[], start: number): number {
    const head = lines[start]!;
    const m = /^!\s*definelong\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*$/.exec(
      head.text.trim(),
    );
    if (!m) {
      throw new PreprocessError(messages().common.expected("!definelong NAME(args)"), head.span);
    }
    const { end } = this.block(lines, start, /^!\s*definelong\b/, /^!\s*enddefinelong\b/);
    this.longDefines.set(m[1]!, {
      name: m[1]!,
      params: (m[2] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p !== "")
        .map((p) => ({ name: p })),
      lines: lines.slice(start + 1, end),
      unquoted: true,
    });
    return end;
  }

  private define(line: SourceLine, t: string): void {
    const m = /^!\s*define\s+([A-Za-z_$][A-Za-z0-9_]*)(\(([^)]*)\))?(?:\s+([\s\S]*))?$/.exec(t);
    if (!m) {
      throw new PreprocessError(messages().common.expected("!define NAME [value]"), line.span);
    }
    this.defines.set(m[1]!, {
      params:
        m[2] !== undefined
          ? m[3]!
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p !== "")
          : null,
      body: (m[4] ?? "").trim(),
    });
  }

  // -------------------------------------------------------------------------------------------
  // Includes

  private include(line: SourceLine, t: string, word: string, frame: Frame): void {
    const target = t.replace(/^!\s*[a-z_]+\s+/, "").trim();
    const [path = "", sub] = splitSub(target);
    const library = /^<([^>]+)>$/.exec(path);
    const c4 = C4_FILE.exec(path) ?? (C4_ANY.test(path) ? ["", ""] : null);
    if (c4) {
      this.libraries.c4 = true;
      const which = c4[1];
      if (which === "Context") this.libraries.c4Level = "context";
      else if (which === "Container") this.libraries.c4Level = "container";
      else if (which === "Component") this.libraries.c4Level = "component";
      else if (which === "Dynamic") {
        this.libraries.c4Level = "container";
        this.libraries.c4Dynamic = true;
      } else if (which === "Deployment" || which === "Sequence")
        this.libraries.c4Unsupported = `C4_${which}`;
      this.reporter.mapped("plantuml.include.c4");
      return;
    }
    if (library) {
      this.reporter.dropped(
        "plantuml.include.stdlib",
        line.span,
        messages().preprocessor.standardLibrary(library[1]!),
      );
      return;
    }
    if (word === "includeurl" || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
      throw new PreprocessError(messages().preprocessor.remote(path), line.span, "import.include");
    }
    if (isAbsolutePath(path)) {
      throw new PreprocessError(
        messages().preprocessor.absolute(path),
        line.span,
        "import.include",
      );
    }
    const resolved = joinPath(frame.dir, path);
    if (!isInside(resolved, this.root)) {
      throw new PreprocessError(messages().preprocessor.outside(path), line.span, "import.include");
    }
    if (this.includeStack.includes(resolved)) {
      throw new PreprocessError(
        messages().preprocessor.includesItself(path),
        line.span,
        "import.include",
      );
    }
    if (word === "include_once" && this.included.has(resolved)) return;
    const text = this.options.readFile?.(resolved);
    if (text === undefined) {
      throw new PreprocessError(
        this.options.readFile
          ? messages().preprocessor.notFound(path)
          : messages().preprocessor.unreadable(path),
        line.span,
        "import.include",
      );
    }
    this.included.add(resolved);
    this.reporter.mapped("plantuml.include");
    let lines = splitLines(text).map((l) => ({
      ...l,
      span: line.span,
      start: line.start,
      generated: true,
    }));
    if (sub !== undefined) lines = subsection(lines, sub, line);
    lines = lines.filter((l) => !/^\s*@(start|end)[a-z]+/i.test(l.text));
    this.includeStack.push(resolved);
    try {
      this.exec(lines, { file: resolved, dir: dirname(resolved) });
    } finally {
      this.includeStack.pop();
    }
  }
}

function splitSub(target: string): [string, string | undefined] {
  if (target.startsWith("<")) return [target, undefined];
  const bang = target.lastIndexOf("!");
  if (bang > 0) return [target.slice(0, bang).trim(), target.slice(bang + 1).trim()];
  return [target, undefined];
}

/** The lines between `!startsub NAME` and `!endsub`, or the n-th `@startuml` block. */
function subsection(lines: SourceLine[], sub: string, at: SourceLine): SourceLine[] {
  if (/^[0-9]+$/.test(sub)) {
    const blocks: SourceLine[][] = [];
    let current: SourceLine[] | null = null;
    for (const l of lines) {
      if (/^\s*@start/i.test(l.text)) current = [];
      else if (/^\s*@end/i.test(l.text)) {
        if (current) blocks.push(current);
        current = null;
      } else current?.push(l);
    }
    const block = blocks[Number(sub)];
    if (!block) {
      throw new PreprocessError(
        messages().preprocessor.noBlockNumber(sub),
        at.span,
        "import.include",
      );
    }
    return block;
  }
  const out: SourceLine[] = [];
  let inside = false;
  let found = false;
  for (const l of lines) {
    const t = l.text.trim();
    const start = /^!\s*startsub\s+(\S+)/.exec(t);
    if (start) {
      inside = start[1] === sub;
      found ||= inside;
      continue;
    }
    if (/^!\s*endsub\b/.test(t)) {
      inside = false;
      continue;
    }
    if (inside) out.push(l);
  }
  if (!found) {
    throw new PreprocessError(messages().preprocessor.noSubpart(sub), at.span, "import.include");
  }
  return out;
}

function parseParams(text: string): Param[] {
  return splitArgs(text)
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => {
      const m = /^(\$?[A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([\s\S]*))?$/.exec(p);
      if (!m) return { name: p };
      return m[2] !== undefined ? { name: m[1]!, default: m[2].trim() } : { name: m[1]! };
    });
}

/** Splits call arguments on commas outside quotes and brackets. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (text.trim() !== "" || out.length > 0) out.push(text.slice(start));
  return out;
}

function matchParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}

function stripQuotes(text: string): string {
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function findWord(text: string, word: string, from: number): number {
  for (let at = text.indexOf(word, from); at >= 0; at = text.indexOf(word, at + 1)) {
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + word.length])) return at;
  }
  return -1;
}

function replaceWord(text: string, word: string, value: string): string {
  let out = text;
  let from = 0;
  for (;;) {
    const at = findWord(out, word, from);
    if (at < 0) return out;
    out = out.slice(0, at) + value + out.slice(at + word.length);
    from = at + value.length;
  }
}

/** Preprocesses the lines of one diagram. */
export function preprocess(
  reporter: Reporter,
  lines: readonly SourceLine[],
  options: PreprocessOptions,
): PreprocessResult {
  return new Preprocessor(reporter, options).run(lines);
}
