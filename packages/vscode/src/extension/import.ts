import { readFileSync } from "node:fs";
import type { ProjectSessions } from "@meltemi/diagrams-editor/node";
import {
  detectFormat,
  importText,
  mergeImport,
  stemOf,
  type ImportFinding,
  type ImportFormat,
  type ImportResult,
} from "@meltemi/diagrams-import";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { toProjectPath } from "@meltemi/diagrams-project";
import * as vscode from "vscode";
import { diagnosticMessage, toRange } from "./convert.js";
import { messages } from "./messages/index.js";

/** Extensions the import commands accept, for file pickers and menus. */
export const IMPORT_EXTENSIONS: readonly string[] = [
  "mmd",
  "mermaid",
  "puml",
  "plantuml",
  "pu",
  "iuml",
  "wsd",
  "md",
  "markdown",
];

/** The filters of the import's file picker, named in the interface language. */
export function importFilters(): Record<string, string[]> {
  return { [messages().importer.filter]: [...IMPORT_EXTENSIONS] };
}

/** What an import command did, for scripts and tests. */
export interface ImportOutcome {
  readonly status: ImportResult["status"] | "cancelled";
  readonly target: string | null;
  readonly written: boolean;
  readonly merged: boolean;
}

type Mode = "merge" | "replace" | "cancel";

const SEVERITY: Readonly<Record<string, vscode.DiagnosticSeverity>> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

export class Importer implements vscode.Disposable {
  /** The reports of imports, named in the interface language when the extension starts. */
  readonly channel = vscode.window.createOutputChannel(messages().importer.channel);
  readonly problems = vscode.languages.createDiagnosticCollection("meltemi-import");
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly sessions: ProjectSessions) {
    // Problems stay on a source until it is imported again or closed.
    this.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((document) => this.problems.delete(document.uri)),
    );
  }

  dispose(): void {
    this.channel.dispose();
    this.problems.dispose();
    for (const s of this.subscriptions) s.dispose();
  }

  register(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand(
        "meltemi.importDiagram",
        (source?: vscode.Uri, target?: vscode.Uri, mode?: Mode) =>
          this.importFile(source, target, mode),
      ),
      vscode.commands.registerCommand(
        "meltemi.convertToMeltemi",
        (source?: vscode.Uri, target?: vscode.Uri, mode?: Mode) =>
          this.importFile(source ?? vscode.window.activeTextEditor?.document.uri, target, mode),
      ),
      vscode.commands.registerCommand(
        "meltemi.importSelection",
        (target?: vscode.Uri, mode?: Mode, format?: ImportFormat) =>
          this.importSelection(target, mode, format),
      ),
    ];
  }

  /** Imports a file; without a source, asks for one. */
  async importFile(source?: vscode.Uri, target?: vscode.Uri, mode?: Mode): Promise<ImportOutcome> {
    const t = messages().importer;
    if (!(source instanceof vscode.Uri)) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: importFilters(),
        openLabel: t.import,
        title: t.importFile,
      });
      if (!picked?.[0]) return cancelled();
      source = picked[0];
    }
    const open = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === source!.toString(),
    );
    let text: string;
    try {
      text = open
        ? open.getText()
        : new TextDecoder().decode(await vscode.workspace.fs.readFile(source));
    } catch (error) {
      void vscode.window.showErrorMessage(t.cannotRead(source.fsPath, (error as Error).message));
      return { status: "failed", target: null, written: false, merged: false };
    }
    const folder = vscode.Uri.joinPath(source, "..");
    const destination =
      target instanceof vscode.Uri
        ? target
        : vscode.Uri.joinPath(folder, `${stemOf(source.path)}.meltemi`);
    return this.run(
      text,
      source,
      source.scheme === "file" ? source.fsPath : source.path,
      destination,
      mode,
    );
  }

  /** Imports the selection of the active editor into a sheet the user names. */
  async importSelection(
    target?: vscode.Uri,
    mode?: Mode,
    format?: ImportFormat,
  ): Promise<ImportOutcome> {
    const t = messages().importer;
    const editor = vscode.window.activeTextEditor;
    const text = editor ? editor.document.getText(editor.selection) : "";
    if (!editor || text.trim() === "") {
      void vscode.window.showWarningMessage(t.selectFirst);
      return cancelled();
    }
    let chosen = format ?? detectFormat(text) ?? undefined;
    if (!chosen) {
      const picked = await vscode.window.showQuickPick(["mermaid", "plantuml", "markdown"], {
        title: t.importSelection,
        placeHolder: t.selectionLanguage,
      });
      if (!picked) return cancelled();
      chosen = picked as ImportFormat;
    }
    const document = editor.document;
    let destination = target instanceof vscode.Uri ? target : undefined;
    if (!destination) {
      destination = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(document.uri, "..", `${stemOf(document.uri.path)}.meltemi`),
        filters: { "Meltemi Diagrams": ["meltemi"] },
        title: t.saveSheet,
      });
      if (!destination) return cancelled();
    }
    // Positions of findings count from the start of the selection.
    const offset = document.offsetAt(editor.selection.start);
    const prefix = document.getText().slice(0, offset).replace(/[^\n]/g, " ");
    const name = document.uri.scheme === "file" ? document.uri.fsPath : document.uri.path;
    return this.run(prefix + text, document.uri, name, destination, mode, chosen);
  }

  private async run(
    text: string,
    source: vscode.Uri,
    fileName: string,
    target: vscode.Uri,
    mode: Mode | undefined,
    format?: ImportFormat,
  ): Promise<ImportOutcome> {
    const workspace =
      source.scheme === "file" ? this.sessions.forFile(toProjectPath(fileName)) : null;
    const registry = workspace?.assets().registry;
    const result = importText(text, {
      ...(format ? { format } : {}),
      fileName: toProjectPath(fileName),
      ...(workspace ? { includeRoot: workspace.root } : {}),
      readFile: (path) => {
        try {
          return readFileSync(path, "utf8");
        } catch {
          return undefined;
        }
      },
      ...(registry ? { hasIcon: (icon: string) => registry.lookup(icon).status === "found" } : {}),
    });
    const t = messages().importer;
    this.report(source, target, result);
    if (result.text === null) {
      void vscode.window.showErrorMessage(
        t.nothingImported(basename(source), result.findings[0]?.message ?? t.unknownError),
      );
      return { status: result.status, target: null, written: false, merged: false };
    }
    let sheet = result.text;
    let merged = false;
    const exists = await stat(target);
    if (exists) {
      const choice =
        mode ??
        (await (async (): Promise<Mode> => {
          const { merge, replace } = t;
          const answer = await vscode.window.showWarningMessage(
            t.exists(basename(target)),
            { modal: true, detail: t.mergeOrReplace },
            merge,
            replace,
          );
          return answer === merge ? "merge" : answer === replace ? "replace" : "cancel";
        })());
      if (choice === "cancel") return cancelled();
      if (choice === "merge") {
        const current = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === target.toString(),
        );
        const existing = current
          ? current.getText()
          : new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
        const mergeResult = mergeImport(existing, sheet);
        sheet = mergeResult.text;
        merged = true;
        this.reportMerge(target, mergeResult.findings);
      }
    }
    await write(target, sheet);
    const document = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("meltemi.openCanvasToSide", target);
    if (result.status === "partial") {
      const show = t.showFindings;
      void vscode.window.showWarningMessage(t.partial(basename(source)), show).then((answer) => {
        if (answer === show) this.channel.show(true);
      });
    }
    return { status: result.status, target: target.toString(), written: true, merged };
  }

  private report(source: vscode.Uri, target: vscode.Uri, result: ImportResult): void {
    const t = messages().importer;
    const name = basename(source);
    this.channel.appendLine(
      t.report(
        source.scheme === "file" ? source.fsPath : source.toString(),
        basename(target),
        result.status,
      ),
    );
    for (const f of result.findings) {
      this.channel.appendLine(
        `  ${name}:${f.range.start.line}:${f.range.start.column}: ${f.severity} ${f.code} ${f.message}`,
      );
    }
    for (const c of result.coverage) {
      this.channel.appendLine(`  ${t.coverage(c.diagram, c.mapped, c.approximated, c.dropped)}`);
    }
    this.problems.set(
      source,
      result.findings.map((f) => toProblem(f)),
    );
  }

  private reportMerge(target: vscode.Uri, findings: readonly Diagnostic[]): void {
    for (const f of findings) {
      this.channel.appendLine(
        `  ${basename(target)}:${f.range.start.line}:${f.range.start.column}: ${f.severity} ${f.code} ${f.message}`,
      );
    }
  }
}

function toProblem(finding: ImportFinding): vscode.Diagnostic {
  const problem = new vscode.Diagnostic(
    toRange(finding.range),
    diagnosticMessage(finding),
    SEVERITY[finding.severity] ?? vscode.DiagnosticSeverity.Information,
  );
  problem.code = finding.code;
  problem.source = "meltemi-import";
  return problem;
}

function cancelled(): ImportOutcome {
  return { status: "cancelled", target: null, written: false, merged: false };
}

function basename(uri: vscode.Uri): string {
  return uri.path.replace(/^.*\//, "");
}

async function stat(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** Writes the sheet; an open document is replaced and saved, so the editor never shows a conflict. */
async function write(uri: vscode.Uri, text: string): Promise<void> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      uri,
      new vscode.Range(open.positionAt(0), open.positionAt(open.getText().length)),
      text,
    );
    await vscode.workspace.applyEdit(edit);
    await open.save();
    return;
  }
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
}
