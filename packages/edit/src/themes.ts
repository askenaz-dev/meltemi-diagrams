import {
  isIdentifierText,
  type Block,
  type KeywordStatement,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { THEME_TOKENS, type ThemeDefinition } from "@meltemi/diagrams-model";
import { insertStatement, reject, type TextContext } from "./context.js";
import { deleteStatements } from "./delete.js";
import { isKeyword, verifyNoNewErrors } from "./insert.js";
import { reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { formatNumber, quoteString } from "./text.js";

/** The theme block of the file with this id, or a rejection that says why there is none. */
function requireTheme(ctx: TextContext, id: string): ThemeDefinition & { block: Block } {
  const theme = ctx.compilation.document.themes.find((t) => t.id === id);
  if (!theme) {
    reject("edit.unsafe-target", reasons().themes.missing(id));
  }
  const block = theme.node.block;
  if (block.kind !== "Block") reject("edit.unsafe-target", reasons().themes.noBlock(id));
  return { ...theme, block };
}

/** Writes a token value as the theme block expects it. */
export function formatThemeValue(token: string, value: string | number): string {
  const spec = THEME_TOKENS[token];
  if (!spec) {
    reject(
      "edit.invalid-value",
      reasons().themes.notToken(
        token,
        Object.keys(THEME_TOKENS).filter((t) => t !== "extends"),
      ),
    );
  }
  switch (spec.kind) {
    case "color":
    case "string":
      if (String(value).trim() === "")
        reject("edit.invalid-value", reasons().themes.needsValue(token));
      return quoteString(String(value));
    case "enum":
      if (typeof value !== "string" || !spec.values.includes(value)) {
        reject("edit.invalid-value", reasons().themes.notValue(String(value), token, spec.values));
      }
      return value;
    case "number": {
      const number = Number(value);
      if (String(value).trim() === "" || !Number.isFinite(number)) {
        reject("edit.invalid-value", reasons().values.takesNumber(token));
      }
      return formatNumber(number);
    }
    case "time": {
      const ms = Number(value);
      if (String(value).trim() === "" || !Number.isFinite(ms)) {
        reject("edit.invalid-value", reasons().themes.takesTime(token));
      }
      return `${formatNumber(ms)}ms`;
    }
    default:
      return reject("edit.invalid-value", reasons().themes.notWritable(token));
  }
}

/** The statement of a token in a theme block, when it is written. */
function tokenStatement(block: Block, token: string): KeywordStatement | undefined {
  return block.statements.find((s): s is KeywordStatement => isKeyword(s, token));
}

export function createTheme(ctx: TextContext, op: OperationOf<"createTheme">): TextEdit[] {
  if (!isIdentifierText(op.theme)) {
    reject("edit.invalid-value", reasons().ids.notValid(op.theme));
  }
  if (ctx.compilation.document.themes.some((t) => t.id === op.theme)) {
    reject("edit.id-conflict", reasons().themes.exists(op.theme));
  }
  const { eol, unit } = ctx;
  const body = op.extends === null ? "" : `${eol}${unit}extends ${quoteString(op.extends)}${eol}`;
  const block = `theme ${op.theme} {${body}}`;
  const items = ctx.compilation.parse.root.items;
  const themes = items.filter((i) => i.kind === "ThemeBlock");
  const lead = items.filter((i) => i.kind === "Header" || i.kind === "ImportStatement");
  const after = themes[themes.length - 1] ?? lead[lead.length - 1];
  const edits: TextEdit[] = after
    ? [{ start: after.end, end: after.end, newText: `${eol}${eol}${block}` }]
    : [{ start: 0, end: 0, newText: `${block}${eol}${eol}` }];
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function setThemeToken(ctx: TextContext, op: OperationOf<"setThemeToken">): TextEdit[] {
  const theme = requireTheme(ctx, op.theme);
  const value = formatThemeValue(op.token, op.value);
  const statement = tokenStatement(theme.block, op.token);
  let edits: TextEdit[];
  if (statement) {
    const first = statement.args[0];
    const last = statement.args[statement.args.length - 1];
    if (!first || !last) reject("edit.unsafe-target", reasons().themes.tokenUnreadable(op.token));
    if (ctx.text.slice(first.start, last.end) === value) return [];
    edits = [{ start: first.start, end: last.end, newText: value }];
  } else {
    edits = [insertStatement(ctx, theme.block, theme.node.start, () => `${op.token} ${value}`)];
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}

export function removeThemeToken(
  ctx: TextContext,
  op: OperationOf<"removeThemeToken">,
): TextEdit[] {
  const theme = requireTheme(ctx, op.theme);
  if (op.token === "extends") {
    reject("edit.invalid-value", reasons().themes.keepsBase);
  }
  const statement = tokenStatement(theme.block, op.token);
  if (!statement) return [];
  const edits = deleteStatements(ctx.text, ctx.compilation.parse.root, [statement]);
  verifyNoNewErrors(ctx, edits);
  return edits;
}
