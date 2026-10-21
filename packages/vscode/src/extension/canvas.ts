import type { EditPlan } from "@meltemi/diagrams-edit";
import type { TextEdit } from "@meltemi/diagrams-language";
import {
  CanvasSession,
  type CanvasSettings,
  type HostMessage,
  type SessionResult,
} from "@meltemi/diagrams-editor";
import { getLocale } from "@meltemi/diagrams-i18n";
import { toProjectPath } from "@meltemi/diagrams-project";
import * as vscode from "vscode";
import { addFileEdits, offsetRange, toWorkspaceEdit } from "./convert.js";
import { isMeltemi, type Analyses } from "./documents.js";
import { messages } from "./messages/index.js";
import { pickImage } from "./pickers.js";
import { CLOSE_DELAY, type CanvasOpening } from "./remember.js";

export const VIEW_TYPE = "meltemi.canvas";

export function canvasSettings(): CanvasSettings {
  const config = vscode.workspace.getConfiguration("meltemi.canvas");
  return {
    grid: Math.max(1, config.get<number>("grid", 14)),
    showGrid: config.get<boolean>("showGrid", true),
    snap: config.get<boolean>("snap", true),
    guides: config.get<boolean>("guides", true),
    minimap: config.get<boolean>("minimap", true),
    inspector: config.get<boolean>("inspector", true),
  };
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}

/**
 * The page of the canvas, with a strict content security policy. Its `lang` is the interface
 * language, which the page's script takes for its own words.
 */
export function canvasHtml(webview: vscode.Webview, extension: vscode.Uri): string {
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extension, "dist", "webview.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extension, "dist", "canvas.css"));
  const n = nonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    `script-src 'nonce-${n}'`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="${getLocale()}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>${messages().canvas.title}</title>
</head>
<body>
<div id="app"></div>
<script nonce="${n}" src="${script}"></script>
</body>
</html>`;
}

/** The canvases that are open, by document. */
export class CanvasPanels {
  private readonly panels = new Map<
    string,
    {
      panel: vscode.WebviewPanel;
      session: CanvasSession;
      /** Handles a message as if the webview had sent it. */
      receive: (message: unknown) => Promise<void>;
      /** Loads the page again, in the interface language. */
      reload: () => void;
    }
  >();

  add(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    session: CanvasSession,
    receive: (message: unknown) => Promise<void>,
    reload: () => void,
  ): void {
    this.panels.set(document.uri.toString(), { panel, session, receive, reload });
  }

  /** Loads every canvas page again, after the interface language changed. */
  reload(): void {
    for (const { reload } of this.panels.values()) reload();
  }

  remove(document: vscode.TextDocument): void {
    this.panels.delete(document.uri.toString());
  }

  has(uri: vscode.Uri): boolean {
    return this.panels.has(uri.toString());
  }

  get(uri: vscode.Uri) {
    return this.panels.get(uri.toString());
  }

  /** The document of the canvas that has focus, if any. */
  active(): vscode.Uri | undefined {
    for (const [key, { panel }] of this.panels) if (panel.active) return vscode.Uri.parse(key);
    return undefined;
  }
}

/**
 * Applies a plan made against the document's current version as one undo step, with the edits a
 * rename needs in the stories of other files of the project.
 */
export async function applyPlan(
  document: vscode.TextDocument,
  plan: EditPlan,
  others: ReadonlyMap<string, readonly TextEdit[]> = new Map(),
): Promise<boolean> {
  if (plan.baseRevision !== document.version || plan.edits.length === 0) return false;
  const edit = toWorkspaceEdit(document, plan.edits);
  await addFileEdits(edit, others);
  return vscode.workspace.applyEdit(edit);
}

/**
 * Makes the edits of other files of the project that a canvas asks: a theme created for the
 * project (its file and the default of `project.json`, which is saved so the project reads it),
 * or an operation on the file that holds the theme being edited.
 */
async function applyProjectEdits(
  document: vscode.TextDocument,
  analyses: Analyses,
  request: NonNullable<SessionResult["project"]>,
): Promise<{ ok: true; message: string } | { ok: false; reason: string }> {
  const t = messages().canvas;
  if (document.uri.scheme !== "file") {
    return { ok: false, reason: t.saveBeforeProjectThemes };
  }
  const sessions = analyses.projects;
  const path = toProjectPath(document.uri.fsPath);
  const edit = new vscode.WorkspaceEdit();
  if (request.kind === "createTheme") {
    const created = sessions.createProjectTheme(path, request.theme, request.extends);
    if (!created.ok) return created;
    for (const file of created.create) {
      edit.createFile(vscode.Uri.file(file.path), {
        overwrite: false,
        contents: new TextEncoder().encode(file.text),
      });
    }
    await addFileEdits(edit, created.edits);
    if (!(await vscode.workspace.applyEdit(edit))) {
      return { ok: false, reason: t.projectNotWritten };
    }
    for (const changed of created.edits.keys()) {
      const opened = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === vscode.Uri.file(changed).fsPath,
      );
      await opened?.save();
    }
    for (const workspace of sessions.all()) {
      for (const changed of [...created.create.map((f) => f.path), ...created.edits.keys()]) {
        workspace.invalidate(toProjectPath(vscode.Uri.file(changed).fsPath));
      }
    }
    return { ok: true, message: t.themeCreated(request.theme) };
  }
  const planned = sessions.planInFile(request.file, request.operation);
  if (!planned.ok) return planned;
  await addFileEdits(edit, new Map([[request.file, planned.edits]]));
  if (!(await vscode.workspace.applyEdit(edit))) {
    return { ok: false, reason: t.fileNotChanged(request.file) };
  }
  return { ok: true, message: t.themeChanged(vscode.workspace.asRelativePath(request.file)) };
}

export interface CanvasHost {
  readonly analyses: Analyses;
  readonly opening: CanvasOpening;
  readonly panels: CanvasPanels;
  readonly exportSvg: (document: vscode.TextDocument) => Promise<void>;
  /** Writes the HTML player of a story or diagram; asks which one without a story. */
  readonly exportPlayer: (
    document: vscode.TextDocument,
    story?: string,
  ) => Promise<vscode.Uri | undefined>;
  /** The player's runtime script, bundled with the extension. */
  readonly playerScript: () => Promise<string>;
  /** The catalog's runtime script (with the player), bundled with the extension. */
  readonly catalogScript: () => Promise<string>;
  /** The generator catalogs name, such as `Meltemi Diagrams 1.0.0`. */
  readonly generator: string;
  /** False once the extension is deactivated, so a closing window is not taken as a choice. */
  readonly active: () => boolean;
}

export class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly extension: vscode.Uri,
    private readonly host: CanvasHost,
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const { analyses, panels } = this.host;
    const settings = canvasSettings();
    const saved = document.uri.scheme === "file";
    const session = new CanvasSession({
      grid: settings.grid,
      ...(saved ? { path: toProjectPath(document.uri.fsPath) } : {}),
      project: () => saved && analyses.workspaceOf(document).manifest().text !== undefined,
    });
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extension, "dist"),
        vscode.Uri.joinPath(this.extension, "media"),
      ],
    };
    panel.webview.html = canvasHtml(panel.webview, this.extension);

    const post = (messages: readonly HostMessage[]) => {
      for (const message of messages) void panel.webview.postMessage(message);
    };
    const refresh = () => post(session.update(analyses.get(document)));

    const handle = async (result: SessionResult): Promise<void> => {
      post(result.messages);
      const others = result.plan
        ? analyses.storyRenames(document, result.plan.operation)
        : undefined;
      if (result.plan && !(await applyPlan(document, result.plan, others))) {
        post([
          {
            type: "rejected",
            code: "edit.stale-revision",
            reason: messages().canvas.textChanged,
          },
        ]);
        refresh();
      }
      // Render the new text without waiting for the typing pause.
      if (result.plan) analyses.now(document);
      if (result.project) {
        const written = await applyProjectEdits(document, analyses, result.project);
        if (written.ok) {
          post([{ type: "status", message: written.message }]);
          analyses.now(document);
          post(session.update(analyses.get(document)));
        } else post([{ type: "rejected", code: "edit.invalid-value", reason: written.reason }]);
      }
      if (result.clipboard !== undefined) await vscode.env.clipboard.writeText(result.clipboard);
      if (result.readClipboard) {
        const text = await vscode.env.clipboard.readText();
        await handle(session.paste(text, result.readClipboard.at));
      }
      if (result.reveal) await this.reveal(document, result.reveal);
      if (result.command === "export") await this.host.exportSvg(document);
      if (result.command === "exportPlayer") await this.host.exportPlayer(document, result.story);
      if (result.command === "openModel") {
        await vscode.commands.executeCommand("meltemi.openModel", document.uri);
      }
      // Icons are chosen in the canvas's own picker; the extension asks only for image files.
      if (result.pick) {
        const { kind, at, parent } = result.pick;
        if (document.uri.scheme !== "file") {
          void vscode.window.showWarningMessage(messages().canvas.saveBeforeImages);
          return;
        }
        const source = await pickImage(document, analyses.projectRoot(document));
        if (source !== undefined) {
          session.update(analyses.get(document));
          await handle(session.createObject(kind, source, at, parent));
        }
      }
    };

    const receive = (message: unknown) => handle(session.receive(message));
    // The page again, in another interface language: like the first one, it gets the settings and
    // asks for the drawing with `ready`, which the session answers in the new language.
    const reload = () => {
      panel.webview.html = canvasHtml(panel.webview, this.extension);
      post([{ type: "settings", settings: canvasSettings() }]);
    };
    panels.add(document, panel, session, receive, reload);
    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((message: unknown) => void receive(message)),
      analyses.onDidAnalyze((changed) => {
        if (changed === document) post(session.update(analyses.get(document)));
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (
          e.textEditor.document !== document ||
          e.kind === vscode.TextEditorSelectionChangeKind.Command
        )
          return;
        post(session.selectAt(document.offsetAt(e.selections[0]!.active)));
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration("meltemi.canvas")) return;
        const next = canvasSettings();
        session.grid = next.grid;
        post([{ type: "settings", settings: next }]);
      }),
    ];
    post([{ type: "settings", settings }]);
    // Analyse now; the webview asks for the state with `ready` once its script runs.
    session.update(analyses.get(document));

    panel.onDidDispose(() => {
      for (const d of disposables) d.dispose();
      panels.remove(document);
      // A close is the user's choice only if the text stays visible and the window stays open.
      setTimeout(() => {
        if (!this.host.active() || document.isClosed) return;
        const visible = vscode.window.visibleTextEditors.some((e) => e.document === document);
        if (visible) this.host.opening.userClosed(document.uri.toString());
      }, CLOSE_DELAY);
    });
  }

  private async reveal(
    document: vscode.TextDocument,
    range: { start: number; end: number; focus: boolean },
  ): Promise<void> {
    const selection = offsetRange(document, range.start, range.end);
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === document);
    if (range.focus || !editor) {
      await vscode.window.showTextDocument(document, {
        ...(editor ? { viewColumn: editor.viewColumn } : { viewColumn: vscode.ViewColumn.Beside }),
        preserveFocus: !range.focus,
        selection,
      });
      return;
    }
    editor.selection = new vscode.Selection(selection.start, selection.end);
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

/** Opens the canvas beside every visible `.meltemi` text editor, as the setting and memory say. */
export function openBesideText(host: CanvasHost): vscode.Disposable[] {
  const open = (editor: vscode.TextEditor | undefined) => {
    if (!editor || !isMeltemi(editor.document)) return;
    const uri = editor.document.uri;
    if (host.panels.has(uri) || !host.opening.shouldOpen(uri.toString())) return;
    void vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
  };
  open(vscode.window.activeTextEditor);
  return [
    vscode.window.onDidChangeActiveTextEditor(open),
    vscode.workspace.onDidCloseTextDocument((document) =>
      host.opening.documentClosed(document.uri.toString()),
    ),
  ];
}
