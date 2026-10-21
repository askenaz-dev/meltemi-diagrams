import type { Diagnostic, Range, TextEdit } from "@meltemi/diagrams-language";
import * as vscode from "vscode";
import { messages } from "./messages/index.js";

/** A range of the language (1-based lines and columns) as a VS Code range (0-based). */
export function toRange(range: Range): vscode.Range {
  return new vscode.Range(
    range.start.line - 1,
    range.start.column - 1,
    range.end.line - 1,
    range.end.column - 1,
  );
}

/** Offsets of a document as a VS Code range. */
export function offsetRange(
  document: vscode.TextDocument,
  start: number,
  end: number,
): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

/**
 * Adds edits by offset to files of the project other than the edited document, for renames that
 * reach stories in other files.
 */
export async function addFileEdits(
  workspaceEdit: vscode.WorkspaceEdit,
  files: ReadonlyMap<string, readonly TextEdit[]>,
): Promise<void> {
  for (const [path, edits] of files) {
    const uri = vscode.Uri.file(path);
    const target = await vscode.workspace.openTextDocument(uri);
    for (const e of edits)
      workspaceEdit.replace(uri, offsetRange(target, e.start, e.end), e.newText);
  }
}

/** Text edits by offset as one workspace edit on a document. */
export function toWorkspaceEdit(
  document: vscode.TextDocument,
  edits: readonly TextEdit[],
): vscode.WorkspaceEdit {
  const workspaceEdit = new vscode.WorkspaceEdit();
  for (const edit of edits) {
    workspaceEdit.replace(document.uri, offsetRange(document, edit.start, edit.end), edit.newText);
  }
  return workspaceEdit;
}

export function toTextEdits(
  document: vscode.TextDocument,
  edits: readonly TextEdit[],
): vscode.TextEdit[] {
  return edits.map((e) =>
    vscode.TextEdit.replace(offsetRange(document, e.start, e.end), e.newText),
  );
}

const SEVERITY: Readonly<Record<Diagnostic["severity"], vscode.DiagnosticSeverity>> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

/** The message with its hints, as the Problems view shows it, in the interface language. */
export function diagnosticMessage(diagnostic: Diagnostic): string {
  const hints = diagnostic.hints ?? [];
  const t = messages().problems;
  return hints.length > 0
    ? `${diagnostic.message}\n${hints.map((h) => t.hint(h)).join("\n")}`
    : diagnostic.message;
}

export function toDiagnostic(
  document: vscode.TextDocument,
  diagnostic: Diagnostic,
): vscode.Diagnostic {
  const result = new vscode.Diagnostic(
    toRange(diagnostic.range),
    diagnosticMessage(diagnostic),
    SEVERITY[diagnostic.severity] ?? vscode.DiagnosticSeverity.Information,
  );
  result.code = diagnostic.code;
  result.source = "meltemi";
  const related = diagnostic.related ?? [];
  if (related.length > 0) {
    result.relatedInformation = related.map(
      (r) =>
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(document.uri, toRange(r.range)),
          r.message,
        ),
    );
  }
  return result;
}
