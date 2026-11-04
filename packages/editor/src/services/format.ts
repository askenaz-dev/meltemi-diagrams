import { formatSource, type TextEdit } from "@meltemi/diagrams-language";
import type { DocumentAnalysis } from "../analysis.js";

/** The smallest single edit that turns `before` into `after`. */
export function minimalEdit(before: string, after: string): TextEdit | undefined {
  if (before === after) return undefined;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { start, end: endBefore, newText: after.slice(start, endAfter) };
}

/** Formats the document with the project's options: one edit, or none. */
export function formatDocument(analysis: DocumentAnalysis): TextEdit[] {
  const result = formatSource(analysis.text, analysis.formatOptions);
  if (!result.ok || !result.changed) return [];
  const edit = minimalEdit(analysis.text, result.text);
  return edit ? [edit] : [];
}
