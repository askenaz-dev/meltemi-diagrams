import {
  isToken,
  type Arg,
  type Block,
  type CstElement,
  type KeywordStatement,
  type LineIndex,
  type Span,
  type Statement,
  type Token,
  type DiagnosticData,
} from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import {
  ALL_ELEMENT_KINDS,
  ELEMENT_ONLY_PROPERTIES,
  FLOW_PROFILE,
  FREE_ELEMENT_KINDS,
  FREE_PROFILE,
  PEN_PROPERTIES,
  PEN_REFUSED_PROPERTIES,
  PEN_WIDTH_RANGE,
  RELATION_ONLY_PROPERTIES,
  RULE_KINDS,
  SEQUENCE_PROFILE,
  STICKY_PROPERTIES,
  STICKY_REFUSED_PROPERTIES,
  STYLE_PROPERTIES,
  THEME_COLOR_TOKENS,
  isFreeStyleProperty,
  profileTakesShape,
  takesShape,
  profileTakesRotation,
  takesRotation,
  type ProfileSchema,
  type PropertyTable,
  type ValueSpec,
} from "./schema.js";
import type {
  ClassDefinition,
  ClassUse,
  IconUse,
  RuleEntry,
  RuleKind,
  StyleValue,
} from "./types.js";

/** A property value: a string, a number, or a `(width, height)` size. */
export type Value = string | number | { readonly width: number; readonly height: number };

export type ValueResult =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly message: string; readonly hints?: string[] };

export interface ReportOptions {
  readonly hints?: string[];
  readonly related?: { message: string; at: CstElement | Span }[];
  readonly data?: DiagnosticData;
}

/** Reports a diagnostic; flow diagrams count errors, theme blocks add them to the bag. */
export type Reporter = (
  code: string,
  message: string,
  at: CstElement | Span,
  options?: ReportOptions,
) => void;

/** The hint that lists the color tokens, in the interface language. */
function colorTokenHint(): string {
  return messages().hints.values.colorTokens(THEME_COLOR_TOKENS);
}

export function spanOf(element: CstElement | { start: number; end: number }): Span {
  return { start: element.start, end: element.end };
}

/** True when the statement itself (not its nested blocks) contains a syntax error. */
export function headerHasError(stmt: Statement): boolean {
  if (stmt.kind === "Error") return true;
  const check = (children: readonly CstElement[]): boolean =>
    children.some((child) => {
      if (isToken(child)) return child.kind === "Unknown" || child.malformed === true;
      if (child.kind === "Block") return false;
      if (child.kind === "BlockChain")
        return child.clauses.some((clause) => check(clause.children));
      return child.hasError;
    });
  return check(stmt.children);
}

/** The token of a reference made of a single identifier. */
export function singleIdent(arg: Arg | undefined): Token | undefined {
  return arg?.kind === "QualifiedRef" && arg.parts.length === 1 ? arg.parts[0] : undefined;
}

/** An argument as messages name it: code as written, a string with its quotes, or its kind. */
export function describeArg(arg: Arg): string {
  switch (arg.kind) {
    case "QualifiedRef":
      return `\`${arg.text}\``;
    case "StringLiteral":
      return arg.token.text;
    case "NumberLiteral":
      return `\`${arg.token.text}\``;
    default:
      return arg.kind === "Tuple" ? messages().words.tuple : messages().words.list;
  }
}

/** The values a spec accepts, in the interface language, completing "`<name>` expects …". */
export function describeSpec(spec: ValueSpec): string {
  const words = messages().words.spec;
  switch (spec.kind) {
    case "enum":
      return words.oneOf(spec.values);
    case "string":
      return words.string;
    case "color":
      return spec.tokens ? words.colorOrToken : words.color;
    case "icon":
      return words.icon;
    case "time":
      return spec.min !== undefined || spec.max !== undefined
        ? words.timeRange(spec.min ?? 0, spec.max)
        : words.time;
    case "repeat":
      return spec.max !== undefined ? words.repeatUpTo(spec.max) : words.repeat;
    case "keywordOrNumber":
      return words.keywordOrNumber(spec.keywords, spec.min, spec.max);
    case "number":
      return spec.values ? words.oneOf(spec.values) : words.numberRange(spec.min, spec.max);
    case "size":
      return words.size(spec.min, spec.max);
    case "classes":
      return words.classes;
    case "name":
      return words.name;
    case "names":
      return words.names;
    case "link":
      return words.link;
    case "url":
      return words.url;
    case "tag":
      return words.tag;
  }
}

/** A number without a unit or with `px`. */
function plainNumber(arg: Arg | undefined): number | undefined {
  if (arg?.kind !== "NumberLiteral") return undefined;
  return arg.unit === null || arg.unit === "px" ? arg.value : undefined;
}

/** Checks one argument against a value spec. `classes` is read by `readClasses`. */
export function checkArg(arg: Arg, spec: ValueSpec, name: string): ValueResult {
  const fail = (message: string, hints?: string[]): ValueResult => ({ ok: false, message, hints });
  const m = messages();
  const expects = () => m.diagnostics.values.expects(name, describeSpec(spec));
  switch (spec.kind) {
    case "enum": {
      const word = singleIdent(arg);
      if (word && spec.values.includes(word.text)) return { ok: true, value: word.text };
      return fail(m.diagnostics.values.invalidEnum(describeArg(arg), name, spec.values));
    }
    case "string":
      if (arg.kind === "StringLiteral") return { ok: true, value: arg.value };
      return fail(m.diagnostics.common.expectsString(name), [m.hints.example(`${name} "text"`)]);
    case "color": {
      if (arg.kind === "StringLiteral" && arg.value.trim() !== "") {
        return { ok: true, value: arg.value };
      }
      const word = singleIdent(arg);
      if (spec.tokens && word && (THEME_COLOR_TOKENS as readonly string[]).includes(word.text)) {
        return { ok: true, value: `@${word.text}` };
      }
      if (spec.tokens && word) {
        return fail(m.diagnostics.values.notColorToken(word.text), [
          colorTokenHint(),
          m.hints.values.cssColor(name, word.text),
        ]);
      }
      return fail(
        expects(),
        spec.tokens
          ? [m.hints.values.colorOrToken(name), colorTokenHint()]
          : [m.hints.example(`${name} "#1f6feb"`)],
      );
    }
    case "icon":
      if (arg.kind === "StringLiteral" && /^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/.test(arg.value)) {
        return { ok: true, value: arg.value };
      }
      return fail(m.diagnostics.values.expectsIcon(name), [m.hints.values.iconForm]);
    case "time":
      if (arg.kind === "NumberLiteral") {
        if (arg.unit === null) {
          return fail(m.diagnostics.values.timeUnit(name), [m.hints.values.timeUnit]);
        }
        if (arg.unit === "ms" || arg.unit === "s") {
          const ms = arg.unit === "s" ? Math.round(arg.value * 1000 * 1000) / 1000 : arg.value;
          const above = spec.min === undefined ? ms > 0 : ms >= spec.min;
          if (above && ms <= (spec.max ?? Infinity)) return { ok: true, value: ms };
        }
      }
      return fail(
        spec.min !== undefined || spec.max !== undefined
          ? expects()
          : m.diagnostics.values.expectsTime(name),
      );
    case "repeat": {
      const word = singleIdent(arg);
      if (word?.text === "forever") return { ok: true, value: "forever" };
      if (
        arg.kind === "NumberLiteral" &&
        arg.unit === null &&
        Number.isInteger(arg.value) &&
        arg.value > 0 &&
        arg.value <= (spec.max ?? Infinity)
      ) {
        return { ok: true, value: arg.value };
      }
      return fail(expects());
    }
    case "keywordOrNumber": {
      const word = singleIdent(arg);
      if (word && spec.keywords.includes(word.text)) return { ok: true, value: word.text };
      const value = plainNumber(arg);
      if (value !== undefined && value >= spec.min && value <= spec.max) return { ok: true, value };
      return fail(expects());
    }
    case "number": {
      const value = plainNumber(arg);
      const fits =
        value !== undefined &&
        value >= spec.min &&
        value <= spec.max &&
        (!spec.values || spec.values.includes(value));
      if (fits) return { ok: true, value };
      return fail(expects());
    }
    case "size": {
      if (arg.kind === "Tuple" && arg.items.length === 2) {
        const width = plainNumber(arg.items[0] as Arg);
        const height = plainNumber(arg.items[1] as Arg);
        const inRange = (n: number | undefined) =>
          n !== undefined && n >= spec.min && n <= spec.max;
        if (inRange(width) && inRange(height)) {
          return { ok: true, value: { width: width!, height: height! } };
        }
      }
      return fail(expects(), [m.hints.example(`${name} (1280, 720)`)]);
    }
    case "classes":
    case "names":
      return fail(expects());
    case "name": {
      const word = singleIdent(arg);
      if (word) return { ok: true, value: word.text };
      return fail(expects());
    }
    case "link":
      if (arg.kind === "QualifiedRef" && (arg.parts.length === 2 || arg.parts.length === 3)) {
        return { ok: true, value: arg.text };
      }
      return fail(expects(), [m.hints.values.link]);
    case "url":
      if (arg.kind === "StringLiteral" && isSafeUrl(arg.value))
        return { ok: true, value: arg.value };
      return fail(expects(), [m.hints.values.url]);
    case "tag":
      if (arg.kind !== "StringLiteral") {
        return fail(m.diagnostics.common.expected(TAG_FORM), [m.hints.example('tag "PKCE"')]);
      }
      if (!isTagText(arg.value)) return fail(m.diagnostics.sequence.tagOneLine);
      return { ok: true, value: arg.value };
  }
}

/** The form of a sequence tag, as messages name it. */
export const TAG_FORM = '`tag "Text"`';

/** Whether a text may be a tag: one line, not empty. */
export function isTagText(text: string): boolean {
  return text.trim() !== "" && !/[\r\n]/.test(text);
}

/**
 * Whether a URL may be written into an export: `http:`, `https:` and `mailto:` URLs, and relative
 * ones; never another scheme, such as `javascript:` or `file:`, nor control characters.
 */
export function isSafeUrl(url: string): boolean {
  const text = url.trim();
  if (text === "" || text !== url || /\s/.test(text)) return false;
  // Control characters never belong in a link.
  for (const char of text) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(text);
  if (scheme) return /^(https?|mailto)$/i.test(scheme[1]!);
  return !text.startsWith("//") && !text.startsWith("\\");
}

/** Reads `class a, b`: every argument must be one identifier. */
export function readClasses(
  stmt: KeywordStatement,
  lines: LineIndex,
  report: Reporter,
): ClassUse[] | undefined {
  if (stmt.block || stmt.chain) {
    const m = messages();
    report("prop.invalid-value", m.diagnostics.values.classNoBlock, stmt.block ?? stmt.chain!, {
      hints: [m.hints.values.declareClasses],
    });
    return undefined;
  }
  if (stmt.args.length === 0) {
    const m = messages();
    report("prop.invalid-value", m.diagnostics.values.classEmpty, stmt.keyword, {
      hints: [m.hints.example("class critical, proposed")],
    });
    return undefined;
  }
  const uses: ClassUse[] = [];
  for (const arg of stmt.args) {
    const token = singleIdent(arg);
    if (!token) {
      report(
        "prop.invalid-value",
        messages().diagnostics.values.invalidClass(describeArg(arg)),
        arg,
      );
      return undefined;
    }
    uses.push({ name: token.text, range: lines.range(spanOf(token)) });
  }
  return uses;
}

/** Reads the single value of a property statement. */
export function readStatementValue(
  stmt: KeywordStatement,
  spec: ValueSpec,
  name: string,
  report: Reporter,
): Value | undefined {
  if (stmt.block || stmt.chain) {
    report(
      "prop.invalid-value",
      messages().diagnostics.common.doesNotTakeBlock(name),
      stmt.block ?? stmt.chain!,
    );
    return undefined;
  }
  const [arg, extra] = stmt.args;
  if (!arg) {
    report(
      "prop.invalid-value",
      messages().diagnostics.values.needsValue(name, describeSpec(spec)),
      stmt.keyword,
    );
    return undefined;
  }
  if (extra) {
    report("prop.invalid-value", messages().diagnostics.values.oneValue(name), extra);
    return undefined;
  }
  const result = checkArg(arg, spec, name);
  if (result.ok) return result.value;
  report("prop.invalid-value", result.message, arg, { hints: result.hints });
  return undefined;
}

export interface PropertyBlock {
  readonly values: Record<string, Value>;
  /** The keyword token of each property that has a value. */
  readonly tokens: Record<string, Token>;
  /** Classes of a `class` property; empty when there is none. */
  readonly classes: ClassUse[];
  /** The `class` keyword, when the block applies classes. */
  readonly classToken: Token | undefined;
  /** The `icon` value with the range of the written string, when it is valid. */
  readonly icon: IconUse | undefined;
}

/** The hint for a property used on a target it does not apply to. */
export function targetHint(name: string): string {
  const hints = messages().hints.values;
  if (name === "opacity") return hints.opacityTargets;
  return ELEMENT_ONLY_PROPERTIES.includes(name)
    ? hints.appliesToElements(name)
    : hints.appliesToRelations(name);
}

/**
 * The first value of the statement of a block whose keyword is `keyword` (a token of
 * `PropertyBlock.tokens`), for a diagnostic on the value rather than on the property.
 */
export function argumentOf(block: Block, keyword: Token): Arg | undefined {
  for (const stmt of block.statements) {
    if (stmt.kind === "KeywordStatement" && stmt.keyword === keyword) return stmt.args[0];
  }
  return undefined;
}

/**
 * Reads `name value` statements from a block against a property table. `unknownHint` gives the
 * hint of an unknown statement, in the interface language, when one is reported; `owner` names the
 * block in messages (`element`, `relation`, `style`, `animate`, `class` or `rule`).
 */
export function readPropertyBlock(
  block: Block,
  table: PropertyTable,
  unknownHint: () => string,
  owner: string,
  lines: LineIndex,
  report: Reporter,
  /** The statements the block accepts, offered by fixes for an unknown one; the table's keys. */
  accepted: readonly string[] = Object.keys(table),
): PropertyBlock {
  const values: Record<string, Value> = {};
  const tokens: Record<string, Token> = {};
  let classes: ClassUse[] = [];
  let classToken: Token | undefined;
  let icon: IconUse | undefined;
  const seen = new Map<string, Token>();
  for (const stmt of block.statements) {
    if (stmt.kind === "Error" || headerHasError(stmt)) continue;
    if (stmt.kind !== "KeywordStatement") {
      report("prop.unknown", messages().diagnostics.values.onlyProperties(owner), stmt, {
        hints: [unknownHint()],
        data: { candidates: accepted },
      });
      continue;
    }
    const name = stmt.keyword.text;
    const spec = table[name];
    if (!spec) {
      const m = messages();
      const hints = name === "class" ? [m.hints.values.classesCannotApply] : [unknownHint()];
      report("prop.unknown", m.diagnostics.values.unknownProperty(name, owner), stmt.keyword, {
        hints,
        ...(name === "class" ? {} : { data: { candidates: accepted } }),
      });
      continue;
    }
    const first = seen.get(name);
    if (first) {
      const m = messages();
      report("prop.duplicate", m.diagnostics.common.setMoreThanOnce(name), stmt.keyword, {
        related: [{ message: m.related.firstSet, at: first }],
      });
      continue;
    }
    seen.set(name, stmt.keyword);
    if (spec.kind === "classes") {
      const uses = readClasses(stmt, lines, report);
      if (uses) {
        classes = uses;
        classToken = stmt.keyword;
      }
      continue;
    }
    const value = readStatementValue(stmt, spec, name, report);
    if (value !== undefined) {
      values[name] = value;
      tokens[name] = stmt.keyword;
      if (name === "icon" && typeof value === "string") {
        icon = { reference: value, range: lines.range(spanOf(stmt.args[0]!)) };
      }
    }
  }
  return { values, tokens, classes, classToken, icon };
}

/** The hint of an unknown property of a class or rule, in the interface language. */
function styleHint(): string {
  return messages().hints.values.styleProperties(Object.keys(STYLE_PROPERTIES));
}

function styleValues(values: Record<string, Value>): Record<string, StyleValue> {
  const result: Record<string, StyleValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string" || typeof value === "number") result[name] = value;
  }
  return result;
}

/**
 * Reports the free style properties of a block read in a flow diagram, and removes them from the
 * values. Theme blocks keep them: they apply wherever the theme styles a free diagram.
 */
export function refuseFreeProperties(
  values: Record<string, unknown>,
  tokens: Record<string, Token>,
  report: Reporter,
): void {
  for (const [name, token] of Object.entries(tokens)) {
    if (!isFreeStyleProperty(name)) continue;
    const m = messages();
    report("prop.invalid-value", m.diagnostics.values.freeOnly(name), token, {
      hints: [name === "opacity" ? m.hints.values.freeOpacity : m.hints.values.freeProperties],
    });
    delete values[name];
  }
}

/** Whether a rule kind targets elements of the profile; theme rules accept every kind. */
function ruleKindFits(kind: string, profile: ProfileSchema | undefined): boolean {
  return !profile || profile.ruleKinds.includes(kind);
}

/** The profiles whose rules take a kind, for the message of a misplaced rule. */
function profilesOfKind(kind: string): string[] {
  return [FLOW_PROFILE, FREE_PROFILE, SEQUENCE_PROFILE]
    .filter((profile) => profile.ruleKinds.includes(kind))
    .map((profile) => profile.name);
}

/**
 * The style properties a `rule <kind>` refuses besides `shape` and `rotation`: a relation's rule
 * refuses the element properties, a line's none (it takes a relation's properties), a pen's and a
 * sticky's what they do not take, and every other kind's the relation properties.
 */
function ruleRefuses(kind: string): readonly string[] {
  if (kind === "relation") return ELEMENT_ONLY_PROPERTIES;
  if (kind === "line") return [];
  if (kind === "pen") return PEN_REFUSED_PROPERTIES;
  if (kind === "sticky") return STICKY_REFUSED_PROPERTIES;
  return RELATION_ONLY_PROPERTIES;
}

/** The hint of a property a `rule <kind>` refuses: what the kind takes, or where the property goes. */
function ruleRefusalHint(kind: string, name: string): string {
  const hints = messages().hints.values;
  if (kind === "pen") return hints.penProperties(PEN_PROPERTIES);
  if (kind === "sticky") return hints.stickyProperties(STICKY_PROPERTIES);
  return targetHint(name);
}

/**
 * Collects the `class <id> { }` and `rule <kind> { }` statements of a diagram or theme block:
 * classes must be unique, and a property may be set once per rule kind. With a profile, the rule
 * kinds and style properties of that profile are checked.
 */
export class StyleDefinitions {
  readonly classes: ClassDefinition[] = [];
  readonly rules: RuleEntry[] = [];
  /** Icon values of the classes and rules. */
  readonly icons: IconUse[] = [];
  private readonly classIds = new Map<string, Token>();
  private readonly ruleSeen = new Map<string, Token>();

  constructor(
    private readonly lines: LineIndex,
    private readonly report: Reporter,
    private readonly profile?: ProfileSchema,
  ) {}

  /**
   * Whether `rule <kind>` may set `shape`: nodes, free boxes and the kinds of declared types, which
   * are drawn as boxes and extend the free profile's rule kinds.
   */
  private ruleTakesShape(kind: string): boolean {
    if (takesShape(kind)) return true;
    const profile = this.profile;
    return (
      profile?.name === "free" &&
      profile.ruleKinds.includes(kind) &&
      !FREE_PROFILE.ruleKinds.includes(kind)
    );
  }

  private checkProfile(values: Record<string, Value>, tokens: Record<string, Token>): void {
    if (!this.profile) return;
    if (this.profile.name !== "free") refuseFreeProperties(values, tokens, this.report);
    if (tokens.rotation && !profileTakesRotation(this.profile)) {
      this.report(
        "prop.invalid-value",
        messages().diagnostics.values.rotationInProfile(this.profile.name),
        tokens.rotation,
      );
      delete values.rotation;
    }
    if (tokens.shape && !profileTakesShape(this.profile)) {
      this.report(
        "prop.invalid-value",
        messages().diagnostics.values.shapeInProfile(this.profile.name),
        tokens.shape,
      );
      delete values.shape;
    }
  }

  /** Reads `class <id> { ... }`. */
  addClass(stmt: KeywordStatement): void {
    const form = "`class <id> { ... }`";
    const [idArg, extra] = stmt.args;
    const id = singleIdent(idArg);
    if (!id || extra) {
      const m = messages();
      this.report(
        "prop.invalid-value",
        m.diagnostics.common.expected(form),
        extra ?? idArg ?? stmt.keyword,
        {
          hints: [m.hints.example("class critical { stroke danger; width 2 }")],
        },
      );
      return;
    }
    if (stmt.chain || !stmt.block) {
      const m = messages();
      this.report(
        "prop.invalid-value",
        m.diagnostics.common.needsOneBlock(`class ${id.text}`, form),
        stmt.chain ?? stmt.keyword,
        { hints: [m.hints.values.applyClasses] },
      );
      return;
    }
    const block = readPropertyBlock(
      stmt.block,
      STYLE_PROPERTIES,
      styleHint,
      "class",
      this.lines,
      this.report,
    );
    if (block.icon) this.icons.push(block.icon);
    const values = { ...block.values };
    this.checkProfile(values, block.tokens);
    const first = this.classIds.get(id.text);
    if (first) {
      const m = messages();
      this.report("ref.duplicate-id", m.diagnostics.values.duplicateClass(id.text), id, {
        related: [{ message: m.related.firstDeclared, at: first }],
      });
      return;
    }
    this.classIds.set(id.text, id);
    this.classes.push({
      id: id.text,
      properties: styleValues(values),
      range: this.lines.range(spanOf(stmt)),
      idRange: this.lines.range(spanOf(id)),
      node: stmt,
    });
  }

  /** Reads `rule <kind> { ... }`. */
  addRule(stmt: KeywordStatement): void {
    const [kindArg, extra] = stmt.args;
    const word = singleIdent(kindArg);
    const kinds = this.profile ? this.profile.ruleKinds : RULE_KINDS;
    if (!kindArg || extra) {
      const m = messages();
      this.report("prop.invalid-value", m.diagnostics.values.ruleShape, extra ?? stmt.keyword, {
        hints: [m.hints.values.kinds(kinds)],
      });
      return;
    }
    // Kinds of declared types count too: the profile lists them.
    if (
      !word ||
      !((RULE_KINDS as readonly string[]).includes(word.text) || kinds.includes(word.text))
    ) {
      this.report(
        "prop.invalid-value",
        messages().diagnostics.values.invalidRuleKind(describeArg(kindArg), kinds),
        kindArg,
      );
      return;
    }
    if (stmt.chain || !stmt.block) {
      this.report(
        "prop.invalid-value",
        messages().diagnostics.values.ruleBlock(word.text),
        stmt.chain ?? stmt.keyword,
      );
      return;
    }
    const kind = word.text as RuleKind;
    if (!ruleKindFits(kind, this.profile)) {
      const m = messages();
      this.report(
        "prop.invalid-value",
        m.diagnostics.values.ruleProfile(kind, profilesOfKind(kind), this.profile!.name),
        word,
        { hints: [m.hints.values.kinds(this.profile!.ruleKinds)] },
      );
      return;
    }
    const block = readPropertyBlock(
      stmt.block,
      STYLE_PROPERTIES,
      styleHint,
      "rule",
      this.lines,
      this.report,
    );
    const values = { ...block.values };
    this.checkProfile(values, block.tokens);
    const properties = styleValues(values);
    if (block.icon) this.icons.push(block.icon);
    for (const [name, token] of Object.entries(block.tokens)) {
      if (!(name in values)) continue;
      if (name === "rotation" && !takesRotation(kind)) {
        this.report(
          "prop.invalid-value",
          messages().diagnostics.values.rotationNotFor(kind, null),
          token,
        );
        delete properties[name];
        continue;
      }
      if (name === "shape" && !this.ruleTakesShape(kind)) {
        this.report(
          "prop.invalid-value",
          messages().diagnostics.values.shapeNotFor(kind, null),
          token,
        );
        delete properties[name];
        continue;
      }
      if (ruleRefuses(kind).includes(name)) {
        const m = messages();
        this.report("prop.invalid-value", m.diagnostics.values.ruleNotFor(name, kind), token, {
          hints: [ruleRefusalHint(kind, name)],
        });
        delete properties[name];
        continue;
      }
      // A pen is drawn one pixel wide at least.
      if (kind === "pen" && name === "width" && properties.width === 0) {
        const m = messages();
        this.report(
          "prop.invalid-value",
          m.diagnostics.values.expects(
            "width",
            describeSpec({ kind: "number", ...PEN_WIDTH_RANGE }),
          ),
          argumentOf(stmt.block, token) ?? token,
          { hints: [m.hints.values.penWidth] },
        );
        delete properties[name];
        continue;
      }
      const key = `${kind}:${name}`;
      const first = this.ruleSeen.get(key);
      if (first) {
        const m = messages();
        this.report("prop.duplicate", m.diagnostics.values.ruleAlreadySet(name, kind), token, {
          related: [{ message: m.related.firstSet, at: first }],
        });
        delete properties[name];
        continue;
      }
      this.ruleSeen.set(key, token);
    }
    this.rules.push({
      kind,
      properties,
      range: this.lines.range(spanOf(stmt)),
      kindRange: this.lines.range(spanOf(word)),
      node: stmt,
    });
  }
}

/** Whether a rule kind is an element kind. */
export function isElementKind(kind: string): boolean {
  return (ALL_ELEMENT_KINDS as readonly string[]).includes(kind);
}

/** Whether a kind is one of the free kinds. */
export function isFreeKind(kind: string): boolean {
  return (FREE_ELEMENT_KINDS as readonly string[]).includes(kind);
}
