import {
  type CstElement,
  type DiagnosticBag,
  type LineIndex,
  type Range,
  type Span,
  type ThemeBlock,
  type Token,
} from "@meltemi/diagrams-language";
import { messages } from "./messages/index.js";
import { BUILT_IN_THEMES, THEME_TOKENS } from "./schema.js";
import {
  StyleDefinitions,
  headerHasError,
  readStatementValue,
  spanOf,
  type ReportOptions,
} from "./style-values.js";
import type { ThemeDefinition } from "./types.js";

/** The hint that lists the tokens of a theme block, in the interface language. */
function tokenHint(): string {
  return messages().hints.theme.tokens(Object.keys(THEME_TOKENS));
}

/** Reads a `theme <id> { }` block into a definition, reporting bad tokens. */
export function analyzeThemeBlock(
  node: ThemeBlock,
  id: Token,
  lines: LineIndex,
  bag: DiagnosticBag,
): ThemeDefinition {
  const report = (
    code: string,
    message: string,
    at: CstElement | Span,
    options: ReportOptions = {},
  ): void => {
    bag.add({
      code,
      message,
      span: "kind" in at ? spanOf(at) : at,
      hints: options.hints,
      data: options.data,
      related: options.related?.map((r) => ({
        message: r.message,
        span: "kind" in r.at ? spanOf(r.at) : r.at,
      })),
    });
  };
  const tokens: Record<string, string | number> = {};
  const seen = new Map<string, Token>();
  const definitions = new StyleDefinitions(lines, report);
  let extendsValue: string | null = null;
  let extendsSpan: Span | null = null;
  const block = node.block.kind === "Block" ? node.block : undefined;

  for (const stmt of block?.statements ?? []) {
    if (stmt.kind === "Error" || headerHasError(stmt)) continue;
    if (stmt.kind !== "KeywordStatement") {
      report("prop.unknown", messages().diagnostics.theme.onlyTokens, stmt, {
        hints: [tokenHint()],
        data: { candidates: Object.keys(THEME_TOKENS) },
      });
      continue;
    }
    const name = stmt.keyword.text;
    if (name === "class") {
      definitions.addClass(stmt);
      continue;
    }
    if (name === "rule") {
      definitions.addRule(stmt);
      continue;
    }
    const spec = THEME_TOKENS[name];
    if (!spec) {
      report("prop.unknown", messages().diagnostics.theme.unknownToken(name), stmt.keyword, {
        hints: [tokenHint()],
        data: { candidates: Object.keys(THEME_TOKENS) },
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
    const value = readStatementValue(stmt, spec, name, report);
    if (value === undefined || typeof value === "object") continue;
    if (name === "extends") {
      extendsValue = String(value);
      extendsSpan = spanOf(stmt.args[0]!);
    } else {
      tokens[name] = value;
    }
  }

  return {
    id: id.text,
    extends: extendsValue,
    extendsRange: extendsSpan ? lines.range(extendsSpan) : null,
    tokens,
    classes: definitions.classes,
    rules: definitions.rules,
    icons: definitions.icons,
    range: lines.range(spanOf(node)),
    idRange: lines.range(spanOf(id)),
    node,
  };
}

/**
 * Reports unknown bases and inheritance cycles among the themes of one file. Names that start with
 * an import binding (`corp`, `company.corporate`) are left to project compilation.
 */
export function checkThemeBases(
  themes: readonly ThemeDefinition[],
  bag: DiagnosticBag,
  importBindings: ReadonlySet<string> = new Set(),
): void {
  const byId = new Map(themes.map((t) => [t.id, t]));
  const imported = (name: string) =>
    importBindings.has(name) || importBindings.has(name.split(".")[0]!);
  for (const theme of themes) {
    if (theme.extends === null || imported(theme.extends)) continue;
    if (
      !(BUILT_IN_THEMES as readonly string[]).includes(theme.extends) &&
      !byId.has(theme.extends)
    ) {
      const m = messages();
      bag.add({
        code: "theme.unknown-base",
        message: m.diagnostics.theme.unknownBase(theme.id, theme.extends),
        span: toSpan(theme.extendsRange ?? theme.idRange),
        hints: [m.hints.theme.builtIn(BUILT_IN_THEMES)],
      });
    }
  }
  for (const theme of themes) {
    const visited = new Set<string>([theme.id]);
    let current = theme.extends;
    while (current !== null && byId.has(current)) {
      if (current === theme.id) {
        const m = messages();
        bag.add({
          code: "theme.cycle",
          message: m.diagnostics.theme.cycle(theme.id),
          span: toSpan(theme.idRange),
          hints: [m.hints.theme.cycle],
        });
        break;
      }
      if (visited.has(current)) break;
      visited.add(current);
      current = byId.get(current)!.extends;
    }
  }
}

function toSpan(range: Range): Span {
  return { start: range.start.offset, end: range.end.offset };
}
