import { analyzeDocument, type DocumentAnalysis } from "@meltemi/diagrams-editor";
import {
  buildCatalog,
  type CatalogBuild,
  type CatalogOptions,
  type ExportContext,
  type ProjectSessions,
} from "@meltemi/diagrams-editor/node";
import type { EditOperation } from "@meltemi/diagrams-edit";
import type { Range, TextEdit } from "@meltemi/diagrams-language";
import { MANIFEST_NAME, joinPath, toProjectPath, type Workspace } from "@meltemi/diagrams-project";
import * as vscode from "vscode";

/** Debounce of analyses after typing, in milliseconds. */
export const ANALYSIS_DELAY = 120;

export const isMeltemi = (document: vscode.TextDocument): boolean =>
  document.languageId === "meltemi" &&
  (document.uri.scheme === "file" || document.uri.scheme === "untitled");

/**
 * One analysis per open `.meltemi` document version, shared by the language providers, the
 * diagnostics and the canvas. Files of a project are analysed inside it, with unsaved text as
 * overlays; an edit to one file refreshes the other open files of the project.
 */
export class Analyses implements vscode.Disposable {
  private readonly cache = new Map<string, DocumentAnalysis>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The version last announced for each document, so a version is announced once. */
  private readonly announced = new Map<string, number>();
  private readonly changed = new vscode.EventEmitter<vscode.TextDocument>();
  private readonly disposables: vscode.Disposable[] = [];

  /** Fires after a document was analysed again. */
  readonly onDidAnalyze = this.changed.event;

  constructor(private readonly sessions: ProjectSessions) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (isMeltemi(e.document) && e.contentChanges.length > 0) this.schedule(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (!isMeltemi(document)) return;
        this.cache.delete(document.uri.toString());
        this.announced.delete(document.uri.toString());
        if (document.uri.scheme === "file") this.sessions.close(this.path(document));
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (isMeltemi(document)) this.refreshProject(document);
      }),
    );
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/{*.meltemi,project.json,assets.lock.json,assets/**,*.png,*.jpg,*.jpeg,*.gif,*.webp,*.svg}",
    );
    const external = (uri: vscode.Uri) => {
      for (const workspace of this.sessions.all()) workspace.invalidate(toProjectPath(uri.fsPath));
      for (const document of vscode.workspace.textDocuments)
        if (isMeltemi(document)) this.schedule(document);
    };
    this.disposables.push(
      watcher,
      watcher.onDidChange(external),
      watcher.onDidCreate(external),
      watcher.onDidDelete(external),
    );
  }

  private path(document: vscode.TextDocument): string {
    return toProjectPath(document.uri.fsPath);
  }

  /** The sessions of every project open in the editor. */
  get projects(): ProjectSessions {
    return this.sessions;
  }

  /** The workspace of a saved document's project, with the document's text as edited. */
  workspaceOf(document: vscode.TextDocument): Workspace {
    this.get(document);
    return this.sessions.forFile(this.path(document));
  }

  /**
   * The catalog of the project of a file or folder (decision 0027), with the text of open
   * documents as edited.
   */
  catalog(target: vscode.Uri, isFolder: boolean, options: CatalogOptions): CatalogBuild {
    for (const document of vscode.workspace.textDocuments) {
      if (isMeltemi(document) && document.uri.scheme === "file") this.get(document);
    }
    const path = toProjectPath(target.fsPath);
    const workspace = isFolder ? this.sessions.forFolder(path) : this.sessions.forFile(path);
    return buildCatalog(workspace, this.sessions, options);
  }

  /** Where a link through an import points, for saved documents of a project. */
  linkDefinition(
    document: vscode.TextDocument,
    offset: number,
  ): { uri: vscode.Uri; range: Range } | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    const found = this.sessions.linkDefinition(this.path(document), offset);
    return found ? { uri: vscode.Uri.file(found.path), range: found.range } : undefined;
  }

  /** Where an entity of an imported model is declared. */
  entityDefinition(
    document: vscode.TextDocument,
    offset: number,
  ): { uri: vscode.Uri; range: Range } | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    const found = this.sessions.entityDefinition(this.path(document), offset);
    return found ? { uri: vscode.Uri.file(found.path), range: found.range } : undefined;
  }

  /** Every use of the entity under a position, across the project. */
  entityReferences(
    document: vscode.TextDocument,
    offset: number,
    includeDeclaration: boolean,
  ): { uri: vscode.Uri; range: Range }[] | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    return this.sessions
      .entityReferences(this.path(document), offset, includeDeclaration)
      ?.map((r) => ({ uri: vscode.Uri.file(r.path), range: r.range }));
  }

  /** The rename of the entity under a position across the project, by file. */
  entityRename(
    document: vscode.TextDocument,
    offset: number,
    newId: string,
  ): ReturnType<ProjectSessions["entityRename"]> {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    return this.sessions.entityRename(this.path(document), offset, newId);
  }

  /** Where an imported view of a story, or a target in it, is declared. */
  storyDefinition(
    document: vscode.TextDocument,
    offset: number,
  ): { uri: vscode.Uri; range: Range } | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    const found = this.sessions.storyDefinition(this.path(document), offset);
    return found ? { uri: vscode.Uri.file(found.path), range: found.range } : undefined;
  }

  /** Every use of a diagram's target across the project, when stories of other files name it. */
  targetReferences(
    document: vscode.TextDocument,
    offset: number,
    includeDeclaration: boolean,
  ): { uri: vscode.Uri; range: Range }[] | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    return this.sessions
      .targetReferences(this.path(document), offset, includeDeclaration)
      ?.map((r) => ({ uri: vscode.Uri.file(r.path), range: r.range }));
  }

  /** The rename of a target of an imported view named in a story, by file. */
  storyTargetRename(
    document: vscode.TextDocument,
    offset: number,
    newId: string,
  ): ReturnType<ProjectSessions["storyTargetRename"]> {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    return this.sessions.storyTargetRename(this.path(document), offset, newId);
  }

  /**
   * What exports of a saved document need: its file in its project, with the unsaved text, and
   * the player's runtime for HTML.
   */
  exportContext(document: vscode.TextDocument, playerScript: string): ExportContext | undefined {
    if (document.uri.scheme !== "file") return undefined;
    this.get(document);
    const workspace = this.sessions.forFile(this.path(document));
    const file = workspace.file(this.path(document));
    if (!file) return undefined;
    return {
      file,
      workspace,
      projects: this.sessions,
      playerScript: () => playerScript,
      // Layout diagnostics are already in the Problems view.
      report: () => undefined,
      printed: new Set(),
    };
  }

  /** Edits in other files of the project that a rename planned in the document needs. */
  storyRenames(
    document: vscode.TextDocument,
    operation: EditOperation,
  ): ReadonlyMap<string, readonly TextEdit[]> {
    if (document.uri.scheme !== "file") return new Map();
    this.get(document);
    return this.sessions.storyRenames(this.path(document), operation);
  }

  /** The root of the project of a saved document, or its folder. */
  projectRoot(document: vscode.TextDocument): string {
    return this.sessions.forFile(this.path(document)).root;
  }

  /** The analysis of the document as it is now. */
  get(document: vscode.TextDocument): DocumentAnalysis {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.revision === document.version) return cached;
    const text = document.getText();
    const analysis =
      document.uri.scheme === "file"
        ? this.sessions.analyze(this.path(document), text, document.version)
        : analyzeDocument({
            text,
            revision: document.version,
            layout: { engine: this.sessions.engine },
          });
    this.cache.set(key, analysis);
    return analysis;
  }

  /** Analyses a document after the typing pause, then announces it. */
  schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (document.isClosed || this.announced.get(key) === document.version) return;
        this.announce(document);
        this.refreshProject(document);
      }, ANALYSIS_DELAY),
    );
  }

  /** Analyses the other open files of the document's project again, which may import it. */
  private refreshProject(document: vscode.TextDocument): void {
    if (document.uri.scheme !== "file") return;
    for (const other of vscode.workspace.textDocuments) {
      if (other === document || !isMeltemi(other) || other.uri.scheme !== "file") continue;
      this.cache.delete(other.uri.toString());
      this.announced.delete(other.uri.toString());
      this.announce(other);
    }
  }

  /**
   * Analyses every open document again from scratch and announces it, for example in a new
   * interface language: the projects forget what they compiled and checked, so diagnostics, which
   * take their words when they are made, are made again.
   */
  analyzeAgain(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.cache.clear();
    this.announced.clear();
    // A changed project.json makes a workspace forget its compilations, plugins and assets.
    for (const workspace of this.sessions.all()) {
      workspace.invalidate(joinPath(workspace.root, MANIFEST_NAME));
    }
    for (const document of vscode.workspace.textDocuments) {
      if (isMeltemi(document)) this.announce(document);
    }
  }

  /** Analyses a document now, without waiting, and announces it once per version. */
  now(document: vscode.TextDocument): DocumentAnalysis {
    const analysis = this.get(document);
    if (this.announced.get(document.uri.toString()) !== document.version) this.announce(document);
    return analysis;
  }

  private announce(document: vscode.TextDocument): void {
    this.get(document);
    this.announced.set(document.uri.toString(), document.version);
    this.changed.fire(document);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const d of this.disposables) d.dispose();
    this.changed.dispose();
  }
}
