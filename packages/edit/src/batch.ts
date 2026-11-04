import {
  applyTextEdits,
  invertTextEdits,
  normalizeTextEdits,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { compile, type Compilation } from "@meltemi/diagrams-model";
import type { EditOperation, EditPlan, PlanOptions, PlanResult } from "./types.js";

/** A piece of the current text: a range of the base text, or text that an edit inserted. */
type Piece =
  | { readonly kind: "base"; readonly start: number; readonly end: number }
  | { readonly kind: "new"; readonly text: string };

const pieceLength = (piece: Piece) =>
  piece.kind === "base" ? piece.end - piece.start : piece.text.length;

/** Cuts `pieces` at `offset` of the text they spell, so that a piece boundary falls there. */
function splitAt(pieces: Piece[], offset: number): number {
  let position = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const length = pieceLength(piece);
    if (offset === position) return i;
    if (offset < position + length) {
      const cut = offset - position;
      const [left, right]: [Piece, Piece] =
        piece.kind === "base"
          ? [
              { kind: "base", start: piece.start, end: piece.start + cut },
              { kind: "base", start: piece.start + cut, end: piece.end },
            ]
          : [
              { kind: "new", text: piece.text.slice(0, cut) },
              { kind: "new", text: piece.text.slice(cut) },
            ];
      pieces.splice(i, 1, left, right);
      return i + 1;
    }
    position += length;
  }
  return pieces.length;
}

/** Applies edits, given against the text the pieces spell, to the pieces. */
function applyToPieces(pieces: Piece[], text: string, edits: readonly TextEdit[]): void {
  // From the end, so earlier offsets stay valid.
  const sorted = normalizeTextEdits(text, edits);
  for (let k = sorted.length - 1; k >= 0; k--) {
    const edit = sorted[k]!;
    // Split at the start first: splitting at the end never moves the start's index.
    const start = splitAt(pieces, edit.start);
    const end = splitAt(pieces, edit.end);
    const inserted: Piece[] = edit.newText === "" ? [] : [{ kind: "new", text: edit.newText }];
    pieces.splice(start, end - start, ...inserted);
  }
}

/**
 * The edits against the base text that produce the text the pieces spell. Base text that
 * survives in place is untouched; everything between two surviving runs becomes one edit.
 */
function editsFromPieces(pieces: readonly Piece[], baseLength: number): TextEdit[] {
  const edits: TextEdit[] = [];
  let cursor = 0;
  let pending = "";
  let pendingStart: number | null = null;
  const flush = (end: number) => {
    if (pendingStart !== null || end > cursor) {
      const start = pendingStart ?? cursor;
      edits.push({ start, end, newText: pending });
    }
    pending = "";
    pendingStart = null;
  };
  for (const piece of pieces) {
    if (piece.kind === "new") {
      pendingStart ??= cursor;
      pending += piece.text;
      continue;
    }
    if (piece.start === piece.end) continue;
    if (piece.start !== cursor || pendingStart !== null) flush(piece.start);
    cursor = piece.end;
  }
  if (pendingStart !== null || cursor < baseLength) flush(baseLength);
  return edits;
}

/**
 * One set of edits against `base` doing what `first` does and then `second`, given against the
 * text `first` leaves.
 */
export function composeEdits(
  base: string,
  first: readonly TextEdit[],
  second: readonly TextEdit[],
): TextEdit[] {
  const pieces: Piece[] = base.length > 0 ? [{ kind: "base", start: 0, end: base.length }] : [];
  applyToPieces(pieces, base, first);
  applyToPieces(pieces, applyTextEdits(base, first), second);
  return editsFromPieces(pieces, base.length);
}

/**
 * Plans several operations as one edit against the compiled text: each one is planned on the
 * text left by the previous ones, and the results are composed back onto the base text. A
 * refusal of any operation refuses the batch and names the operation.
 */
export function planBatch(
  compilation: Compilation,
  operations: readonly EditOperation[],
  options: PlanOptions & {
    /** Plans one operation; `planEdit`, passed in to keep the modules acyclic. */
    readonly plan: (compilation: Compilation, operation: EditOperation) => PlanResult;
  },
): PlanResult {
  const base = compilation.text;
  const pieces: Piece[] = base.length > 0 ? [{ kind: "base", start: 0, end: base.length }] : [];
  const notes: string[] = [];
  let current = compilation;
  let text = base;
  for (let i = 0; i < operations.length; i++) {
    const result = options.plan(current, operations[i]!);
    if (!result.ok) {
      return { ok: false, rejection: { ...result.rejection, operationIndex: i } };
    }
    notes.push(...result.plan.notes);
    if (result.plan.edits.length === 0) continue;
    applyToPieces(pieces, text, result.plan.edits);
    text = applyTextEdits(text, result.plan.edits);
    if (i < operations.length - 1) current = compile(text, compilation.options);
  }
  const edits = editsFromPieces(pieces, base.length);
  const plan: EditPlan = {
    operation: operations.length === 1 ? operations[0]! : { kind: "batch", operations },
    baseRevision: options.revision ?? 0,
    edits,
    inverse: invertTextEdits(base, edits),
    notes,
  };
  return { ok: true, plan };
}
