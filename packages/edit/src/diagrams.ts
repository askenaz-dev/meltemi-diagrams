import { LANGUAGE_VERSION, isIdentifierText, type TextEdit } from "@meltemi/diagrams-language";
import type { Compilation } from "@meltemi/diagrams-model";
import { reject, type TextContext } from "./context.js";
import { verifyNoNewErrors } from "./insert.js";
import { reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import { quoteString } from "./text.js";
import type { CreatableDiagramType } from "./types.js";

/** The types `createDiagram` writes, in the order hosts offer them. */
export const CREATABLE_DIAGRAMS: readonly CreatableDiagramType[] = ["flow", "free", "sequence"];

/** The names the top level of a file uses: its blocks and the names its imports bind. */
function topLevelNames(compilation: Compilation): Set<string> {
  const document = compilation.document;
  const names = new Set<string>();
  for (const block of [
    ...document.diagrams,
    ...document.models,
    ...document.themes,
    ...document.stories,
    ...document.exports,
  ]) {
    names.add(block.id);
  }
  for (const block of document.unsupported) if (block.id !== null) names.add(block.id);
  for (const declaration of document.imports) {
    for (const binding of declaration.bindings) names.add(binding.name);
  }
  return names;
}

/**
 * The id `createDiagram` gives a new diagram without one: the first of `diagram1`, `diagram2`…
 * that no diagram, model, theme, story, export or import of the file uses.
 */
export function newDiagramId(compilation: Compilation): string {
  const used = topLevelNames(compilation);
  for (let n = 1; ; n++) if (!used.has(`diagram${n}`)) return `diagram${n}`;
}

/**
 * Appends `diagram <id>: <type> {` and `}` after the last top-level statement, separated by a
 * blank line, with `title "…"` inside when given. A file without a `language` header gets one
 * and a blank line first; an empty file becomes the header and the diagram.
 */
export function createDiagram(ctx: TextContext, op: OperationOf<"createDiagram">): TextEdit[] {
  if (!CREATABLE_DIAGRAMS.includes(op.type)) {
    reject(
      "edit.invalid-value",
      reasons().diagrams.notCreatable(String(op.type), CREATABLE_DIAGRAMS),
    );
  }
  if (op.id !== undefined) {
    if (!isIdentifierText(op.id)) reject("edit.invalid-value", reasons().diagrams.invalidId(op.id));
    if (topLevelNames(ctx.compilation).has(op.id)) {
      reject("edit.invalid-value", reasons().diagrams.taken(op.id));
    }
  }
  const id = op.id ?? newDiagramId(ctx.compilation);
  const { eol, unit, text } = ctx;
  const title = op.title !== undefined ? `${unit}title ${quoteString(op.title)}${eol}` : "";
  const block = `diagram ${id}: ${op.type} {${eol}${title}}`;
  const header = `language ${quoteString(LANGUAGE_VERSION)}`;
  const items = ctx.compilation.parse.root.items;
  const last = items[items.length - 1];
  const edits: TextEdit[] = [];
  if (!last) {
    if (text.trim() === "") {
      // An emptied file, blank lines and all, becomes the header and the diagram.
      edits.push({ start: 0, end: text.length, newText: `${header}${eol}${eol}${block}${eol}` });
    } else {
      // Only comments: the header before them, the diagram after them.
      const separator = /\n\s*$/.test(text) ? eol : `${eol}${eol}`;
      edits.push(
        { start: 0, end: 0, newText: `${header}${eol}${eol}` },
        { start: text.length, end: text.length, newText: `${separator}${block}${eol}` },
      );
    }
  } else {
    if (!items.some((item) => item.kind === "Header")) {
      edits.push({ start: 0, end: 0, newText: `${header}${eol}${eol}` });
    }
    // At the end of the last statement's line, so a comment after it stays on that line.
    const newline = text.indexOf("\n", last.end);
    if (newline < 0) {
      edits.push({ start: text.length, end: text.length, newText: `${eol}${eol}${block}${eol}` });
    } else {
      const at = text[newline - 1] === "\r" && newline - 1 >= last.end ? newline - 1 : newline;
      edits.push({ start: at, end: at, newText: `${eol}${eol}${block}` });
    }
  }
  verifyNoNewErrors(ctx, edits);
  return edits;
}
