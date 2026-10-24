import type { Arg, KeywordStatement, TextEdit } from "@meltemi/diagrams-language";
import type { Element } from "@meltemi/diagrams-model";
import { reject, requireElement, type EditContext, type TextContext } from "./context.js";
import { verifyNoNewErrors } from "./insert.js";
import { messages, reasons } from "./messages/index.js";
import type { OperationOf } from "./plan.js";
import type { Dependent } from "./types.js";

/** The words after the text of a note's declaration: `on` and the target that follows it. */
export interface AttachmentArgs {
  /** The argument before `on`: the note's text (or its id when it has none). */
  readonly before: Arg;
  readonly word: Arg;
  readonly target: Arg;
}

const isOn = (arg: Arg | undefined): boolean => arg?.kind === "QualifiedRef" && arg.text === "on";

/** The `on <target>` clause of a note's statement, or undefined when it has none. */
export function attachmentArgs(note: Element): AttachmentArgs | undefined {
  const node = note.node;
  if (note.kind !== "note" || node?.kind !== "KeywordStatement") return undefined;
  const args = node.args;
  const at = args.findIndex((arg, i) => i >= 2 && isOn(arg));
  const target = args[at + 1];
  return at < 0 || !target ? undefined : { before: args[at - 1]!, word: args[at], target };
}

/** The edit that takes ` on <target>` out of a note's statement, keeping its block and comments. */
export function stripAttachment(note: Element): TextEdit | undefined {
  const clause = attachmentArgs(note);
  return clause && { start: clause.before.end, end: clause.target.end, newText: "" };
}

/**
 * A note attached to something about to go, as a dependent of the removal and the edit that
 * leaves the note without its clause: a note's text is the person's words, so it stays.
 */
export function attachmentDependent(
  ctx: TextContext,
  note: Element,
): { dependent: Dependent; edit: TextEdit } | undefined {
  const edit = stripAttachment(note);
  if (!edit || !note.node) return undefined;
  const lines = ctx.compilation.parse.lines;
  return {
    edit,
    dependent: {
      kind: "attachment",
      name: note.id,
      description: messages().dependents.attachment(note.id, lines.location(note.node.start).line),
      range: lines.range(note.node),
    },
  };
}

/** Whether `path` is an element a note of the diagram may be attached to. */
function attachable(ctx: EditContext, note: Element, path: string): boolean {
  if (path === note.id) return false;
  const element = ctx.diagram.elementsById.get(path);
  // A view draws entities, and notes attach to what it draws.
  return ctx.diagram.type === "c4" ? element?.entity != null : element !== undefined;
}

/**
 * Writes, replaces or removes the `on <element>` clause of a note, in the same declaration and
 * with the smallest edit: the clause follows the note's text and the block stays where it is.
 */
export function attachNote(ctx: EditContext, op: OperationOf<"attachNote">): TextEdit[] {
  const note = requireElement(ctx, op.note);
  const r = reasons().attach;
  if (note.kind !== "note" || note.node?.kind !== "KeywordStatement") {
    reject("edit.invalid-value", r.onlyNotes(note.id, note.kind));
  }
  const clause = attachmentArgs(note);
  const node = note.node as KeywordStatement;
  if (op.element === null) {
    const edit = stripAttachment(note);
    return edit ? [edit] : [];
  }
  if (op.element === note.id) reject("edit.invalid-value", r.self(note.id));
  if (!attachable(ctx, note, op.element)) {
    if (ctx.diagram.type === "c4") {
      reject("edit.unsafe-target", r.notDrawn(op.element, ctx.diagram.id));
    }
    requireElement(ctx, op.element);
  }
  if (clause?.target.kind === "QualifiedRef" && clause.target.text === op.element) return [];
  const edits: TextEdit[] = clause
    ? [{ start: clause.target.start, end: clause.target.end, newText: op.element }]
    : [
        {
          start: (node.args[1] ?? node.args[0]!).end,
          end: (node.args[1] ?? node.args[0]!).end,
          newText: ` on ${op.element}`,
        },
      ];
  verifyNoNewErrors(ctx, edits);
  return edits;
}
