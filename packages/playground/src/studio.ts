import type { EditPlan } from "@meltemi/diagrams-edit";
import {
  CanvasSession,
  ProjectSessions,
  moveFileEdits,
  type DocumentAnalysis,
  type HostMessage,
  type SessionResult,
} from "@meltemi/diagrams-editor";
import type { Locale } from "@meltemi/diagrams-i18n";
import {
  applyTextEdits,
  sortDiagnostics,
  type Diagnostic,
  type TextEdit,
} from "@meltemi/diagrams-language";
import { MANIFEST_NAME, type Workspace } from "@meltemi/diagrams-project";
import { History, type Selection } from "./history.js";
import { MemoryHost, ROOT, isTextContent } from "./files.js";
import { settle, type LazyFiles } from "./lazy.js";
import { messages } from "./messages/index.js";

/** Analysis waits for this pause in typing, in milliseconds. */
export const ANALYSIS_DELAY = 250;

/**
 * A change of the project's files, for a listener that keeps them somewhere else (the cloud
 * project's document). Every file operation of the studio reports one or more of these, once the
 * files are changed.
 */
export interface StudioChange {
  /**
   * `text`: a text file changed. `add`: a file appeared, or an image or font's bytes were replaced
   * (`before` then holds the old bytes). `delete`: a file went. `rename`: a file moved.
   */
  readonly kind: "text" | "add" | "delete" | "rename";
  /** The file's path; after a rename, the new one. */
  readonly path: string;
  /** For `rename`, the path the file had. */
  readonly from?: string;
  /** `text`: the text before. `add`: the bytes it replaced. `delete`: what the file held. */
  readonly before?: string | Uint8Array;
  /** `text`: the text after. `add`: the file's content. */
  readonly after?: string | Uint8Array;
  /**
   * The user step this belongs to: the changes one action makes, in several files, share it, and
   * later steps have greater numbers. A bound document groups its undo by it.
   */
  readonly step: number;
  /** Typing in the code pane, which coalesces with the typing before it. */
  readonly typing: boolean;
  /** Made from outside the page's own actions (a document's change): not the person's edit. */
  readonly remote: boolean;
  /** Where the caret was before the change, when the code pane told. */
  readonly selectionBefore?: Selection;
  /** Where the caret goes after the change, when the code pane or the canvas told. */
  readonly selectionAfter?: Selection;
}

/** What the studio delegates to a bound document: undo and redo over the person's own edits. */
export interface DocumentUndo {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** How a change is flagged: see `StudioChange`. */
interface ChangeFlags {
  typing?: boolean;
  remote?: boolean;
  selectionBefore?: Selection;
  selectionAfter?: Selection;
}

/** What the studio needs from the page. */
export interface StudioEnvironment {
  readonly toolVersion: string;
  readonly fonts: LazyFiles;
  /** The bundled assets: `tabler/<file>`, `icons/<prefix>.json`, `libraries/<id>.json`. */
  readonly assets: LazyFiles;
  /** The exports of the bundled ELK worker module. */
  readonly elk: () => unknown;
}

/** What the studio tells the page. */
export interface StudioListener {
  /** A file's text changed other than by typing in the code pane (canvas, undo, fixes). */
  text?(path: string, text: string, selection?: Selection): void;
  /** The open file was analysed. */
  analysis?(analysis: OpenAnalysis): void;
  /** Files were added, removed or renamed, or another file was opened. */
  files?(): void;
  /** A file's content changed, by any means. */
  changed?(path: string): void;
  /** A file was added, deleted, renamed or its text changed (see `StudioChange`). */
  change?(change: StudioChange): void;
  /** Messages for the canvas. */
  canvas?(messages: readonly HostMessage[]): void;
  /** The canvas asks to show a range of the open file. */
  reveal?(range: { start: number; end: number; focus: boolean }): void;
  /** The canvas asks for something only the page can do. */
  request?(result: SessionResult): void;
  /** A short message for the status line and screen readers. */
  status?(message: string): void;
  /** The studio entered or left view mode (`Studio.setReadOnly`). */
  readOnly?(on: boolean): void;
}

/** The analysis of the open file: a `.meltemi` file's, or the problems of another file. */
export interface OpenAnalysis {
  readonly path: string;
  readonly revision: number;
  readonly text: string;
  /** Undefined for files that are not `.meltemi` sources. */
  readonly document: DocumentAnalysis | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

/** Problems of every file of the project, by path. */
export type ProjectProblems = ReadonlyMap<string, { errors: number; warnings: number }>;

/** What a `.meltemi` file declares, as the explorer lists it (`Studio.outlines`). */
export interface FileOutline {
  readonly diagrams: readonly {
    readonly id: string;
    readonly title: string | null;
    readonly type: "flow" | "free" | "sequence" | "c4";
  }[];
  readonly stories: readonly { readonly id: string; readonly title: string | null }[];
  readonly models: number;
  readonly themes: number;
}

const absolute = (path: string) => `${ROOT}/${path}`;

/**
 * The page's project and everything that follows it: the files in memory, their revisions and
 * history, the project compiler with the page's fonts, icons and ELK, the analysis of the open
 * file and the canvas session that edits it. It plays the role VS Code plays for the extension.
 */
export class Studio {
  readonly host = new MemoryHost();
  readonly history = new History();
  /** One canvas session per file, as VS Code has one canvas per document. */
  private readonly canvases = new Map<string, CanvasSession>();
  private sessions: ProjectSessions;
  private openPath = "";
  private readonly revisions = new Map<string, number>();
  private current: OpenAnalysis | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<StudioListener>();
  /** The document that keeps the person's undo, in a cloud project; else `history` does. */
  private bound: DocumentUndo | undefined;
  private steps = 0;
  /** The step being made, while a file operation runs. */
  private stepNumber: number | undefined;
  /** Changes made in the step under way, reported when it ends. */
  private queued: StudioChange[] = [];
  /** View mode: the project is shown and never edited (`project-sharing`, "Viewing by link"). */
  private viewOnly = false;
  /** While a batch runs: whether it owes the listeners one report of the files and an analysis. */
  private batched: { files: boolean } | undefined;

  constructor(private readonly environment: StudioEnvironment) {
    this.sessions = this.newSessions();
    const renew = () => {
      this.renew();
      this.analyzeNow();
    };
    environment.fonts.onArrive(renew);
    environment.assets.onArrive(renew);
  }

  listen(listener: StudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit<K extends keyof StudioListener>(
    key: K,
    ...args: Parameters<NonNullable<StudioListener[K]>>
  ): void {
    for (const listener of this.listeners) {
      (listener[key] as ((...a: typeof args) => void) | undefined)?.(...args);
    }
  }

  /** Whether the studio is in view mode: it shows the project and refuses every edit of the person's. */
  get readOnly(): boolean {
    return this.viewOnly;
  }

  /**
   * Enters or leaves view mode. While on, the person's edits are dropped here, at the one place
   * every edit passes: typing (`setText`), `applyEdits` (completions, fixes, rename, format and
   * the canvas's plans), adding, deleting, renaming and replacing files, `undo` and `redo`
   * (which also report nothing to undo). What a bound document brings in (`remote`) still
   * arrives, so that a viewer follows the room. Listeners hear the change.
   */
  setReadOnly(on: boolean): void {
    if (this.viewOnly === on) return;
    this.viewOnly = on;
    // What the history holds was made before view mode, or is not the viewer's to undo.
    this.history.clear();
    this.emit("readOnly", on);
  }

  /**
   * Hands undo and redo to a document that keeps the person's own edits (a cloud project), or back
   * to the studio's history with `undefined`. The document reads `open` to know the file asked
   * about, and writes what it undoes through `replaceText` and the file operations as remote.
   */
  bindDocument(document: DocumentUndo | undefined): void {
    this.bound = document;
    // What the history holds was made before, or is not the document's to undo.
    this.history.clear();
  }

  /**
   * Whether a document is bound (this one, if given), which is to say whether this is a cloud
   * project: the page keeps a cloud project in its document, not in the browser's storage for
   * the anonymous one.
   */
  isBound(document?: DocumentUndo): boolean {
    return document === undefined ? this.bound !== undefined : this.bound === document;
  }

  /**
   * Puts the caret of the open file back where it was: a file operation reopens the code pane,
   * which resets it, and a remote one must not move the person's caret.
   */
  restoreSelection(path: string, selection: Selection): void {
    if (path === this.openPath && this.host.has(path)) {
      this.emit("text", path, this.text(path), selection);
    }
  }

  /**
   * Runs a file operation as one user step: the changes it reports share a step number, and are
   * reported once the operation is over, so that a listener finds the studio consistent and may
   * call it.
   */
  private inStep<T>(work: () => T): T {
    if (this.stepNumber !== undefined) return work();
    this.stepNumber = ++this.steps;
    try {
      return work();
    } finally {
      this.stepNumber = undefined;
      const changes = this.queued;
      this.queued = [];
      for (const change of changes) this.emit("change", change);
    }
  }

  /**
   * Runs several file operations as one step, and tells the listeners once, at the end: `files`
   * and the analysis of the open file wait for it, so that a document's one transaction that
   * deletes or renames hundreds of files costs one analysis and one rebuild of the file list, not
   * one per file. The files and the changes themselves are made and reported as usual.
   */
  batch<T>(work: () => T): T {
    if (this.batched) return work();
    return this.inStep(() => {
      const owed = { files: false };
      this.batched = owed;
      try {
        return work();
      } finally {
        this.batched = undefined;
        if (owed.files) {
          this.emit("files");
          this.analyzeNow();
        }
      }
    });
  }

  /**
   * Tells the listeners the files changed or another file opened, and analyses the open file: now,
   * after the typing pause with `later` (a burst of arrivals is then analysed once), or when the
   * batch under way ends.
   */
  private filesChanged(later = false): void {
    if (this.batched) {
      this.batched.files = true;
      return;
    }
    this.emit("files");
    if (later) this.schedule();
    else this.analyzeNow();
  }

  private emitChange(
    change: Pick<StudioChange, "kind" | "path" | "from" | "before" | "after">,
    flags: ChangeFlags = {},
  ): void {
    const reported: StudioChange = {
      ...change,
      step: this.stepNumber ?? ++this.steps,
      typing: flags.typing ?? false,
      remote: flags.remote ?? false,
      ...(flags.selectionBefore ? { selectionBefore: flags.selectionBefore } : {}),
      ...(flags.selectionAfter ? { selectionAfter: flags.selectionAfter } : {}),
    };
    if (this.stepNumber === undefined) this.emit("change", reported);
    else this.queued.push(reported);
  }

  /**
   * Reports a file that now holds `content` where it held `before` (undefined: nothing). Text that
   * stays text is a `text` change; bytes that stay bytes are an `add` over the old bytes; a file
   * that changes kind is a `delete` and an `add`.
   */
  private announce(
    path: string,
    before: string | Uint8Array | undefined,
    content: string | Uint8Array,
    flags: ChangeFlags,
  ): void {
    if (before === undefined) {
      this.emitChange({ kind: "add", path, after: content }, flags);
    } else if (isTextContent(path, before) && isTextContent(path, content)) {
      const previous = typeof before === "string" ? before : new TextDecoder().decode(before);
      const next = typeof content === "string" ? content : new TextDecoder().decode(content);
      if (previous !== next) {
        this.emitChange({ kind: "text", path, before: previous, after: next }, flags);
      }
    } else if (!isTextContent(path, before) && !isTextContent(path, content)) {
      this.emitChange({ kind: "add", path, before, after: content }, flags);
    } else {
      this.emitChange({ kind: "delete", path, before }, flags);
      this.emitChange({ kind: "add", path, after: content }, flags);
    }
  }

  /** Stores a file the page adds or replaces: revision, history and the change it reports. */
  private putFile(path: string, content: string | Uint8Array, flags: ChangeFlags = {}): void {
    const before = this.host.get(path);
    this.host.write(path, content);
    this.revisions.set(path, this.revision(path) + 1);
    this.history.forget(path);
    this.announce(path, before, content, flags);
  }

  /** A compiler of the page's files; `locale` sets the language of what it exports. */
  private newSessions(locale?: Locale): ProjectSessions {
    return new ProjectSessions({
      toolVersion: this.environment.toolVersion,
      host: this.host,
      fontReader: this.environment.fonts.read,
      assetReader: this.environment.assets.text,
      loadElkWorker: this.environment.elk,
      ...(locale ? { locale } : {}),
    });
  }

  /** Starts the compiler afresh (libraries cache the files they missed); analyses again. */
  renew(): void {
    this.sessions = this.newSessions();
    this.current = undefined;
  }

  /** The project compiler of the page, for exports and services across files. */
  get projects(): ProjectSessions {
    return this.sessions;
  }

  /** The canvas session of the open file. */
  get session(): CanvasSession {
    let session = this.canvases.get(this.openPath);
    if (!session) {
      const created: CanvasSession = new CanvasSession({
        grid: 14,
        // The file the session belongs to, which a rename moves.
        path: () => {
          for (const [path, canvas] of this.canvases) if (canvas === created) return absolute(path);
          return undefined;
        },
        project: () => this.workspace.manifest().text !== undefined,
      });
      session = created;
      this.canvases.set(this.openPath, session);
    }
    return session;
  }

  /** The workspace of the project. */
  get workspace(): Workspace {
    return this.sessions.forFolder(ROOT);
  }

  /** The relative path of the open file. */
  get open(): string {
    return this.openPath;
  }

  /** The absolute path the compiler knows a file by. */
  absolute(path: string): string {
    return absolute(path);
  }

  /** The relative path of a compiler path, or undefined outside the project. */
  relative(path: string): string | undefined {
    return this.host.relative(path);
  }

  /** The last analysis of the open file. */
  get analysis(): OpenAnalysis | undefined {
    return this.current;
  }

  revision(path = this.openPath): number {
    return this.revisions.get(path) ?? 1;
  }

  text(path = this.openPath): string {
    return this.host.text(path) ?? "";
  }

  /**
   * Replaces the project with these files and opens one of them. Listeners hear a `delete` for
   * each file that goes and an `add` or `text` change for each that stays or arrives, as one step.
   */
  load(
    files: Iterable<readonly [string, string | Uint8Array]>,
    open?: string,
    options: { remote?: boolean } = {},
  ): void {
    if (this.viewOnly && !options.remote) return;
    const incoming = [...files];
    this.inStep(() => {
      const flags = { remote: options.remote ?? false };
      const previous = new Map(this.host.paths().map((p) => [p, this.host.get(p)!] as const));
      for (const path of previous.keys()) this.host.delete(path);
      for (const [path, content] of incoming) this.host.write(path, content);
      const kept = new Set(incoming.map(([path]) => path));
      for (const [path, before] of previous) {
        if (!kept.has(path)) this.emitChange({ kind: "delete", path, before }, flags);
      }
      for (const [path, content] of incoming)
        this.announce(path, previous.get(path), content, flags);
      this.revisions.clear();
      this.history.clear();
      this.canvases.clear();
      this.renew();
      this.openPath = "";
      this.current = undefined;
      this.select(open && this.host.has(open) ? open : this.firstSource());
    });
  }

  /** The first `.meltemi` file, diagrams first, or the first file. */
  firstSource(): string {
    const paths = this.host.paths();
    return (
      paths.find((p) => p.startsWith("diagrams/") && p.endsWith(".meltemi")) ??
      paths.find((p) => p.endsWith(".meltemi")) ??
      paths[0] ??
      ""
    );
  }

  /** Opens a file of the project. */
  select(path: string): void {
    if (path === this.openPath && this.current) return;
    this.openPath = path;
    this.current = undefined;
    this.filesChanged();
  }

  /**
   * Adds or replaces files, then lets the compiler see the new set. `remote` files come from a
   * bound document: listeners are told so, and when no file is open the first source opens.
   * `later` waits for the typing pause to analyse, for files that arrive one by one (the bytes of
   * a project's images) and need one analysis between them, not one each.
   */
  addFiles(
    files: Iterable<readonly [string, string | Uint8Array]>,
    open?: string,
    options: { remote?: boolean; later?: boolean } = {},
  ): void {
    const remote = options.remote ?? false;
    if (this.viewOnly && !remote) return;
    this.inStep(() => {
      for (const [path, content] of files) this.putFile(path, content, { remote });
      this.renew();
      if (open === undefined && remote && this.openPath === "") open = this.firstSource();
      if (open !== undefined) this.select(open);
      else this.filesChanged(options.later);
    });
  }

  deleteFile(path: string, options: { remote?: boolean } = {}): void {
    if (this.viewOnly && !options.remote) return;
    const before = this.host.get(path);
    if (!this.host.delete(path)) return;
    this.inStep(() => {
      this.emitChange({ kind: "delete", path, before }, { remote: options.remote ?? false });
      this.history.forget(path);
      this.canvases.delete(path);
      this.revisions.delete(path);
      this.renew();
      if (path === this.openPath) {
        this.openPath = "";
        this.select(this.firstSource());
      } else this.filesChanged();
    });
  }

  /**
   * Renames a file. The person's rename is a move (`moveFiles`): the imports that name the file
   * follow it. A rename a bound document brings (`remote`) only moves the file: the other device's
   * edits of the imports arrive as their own changes.
   */
  renameFile(from: string, to: string, options: { remote?: boolean } = {}): boolean {
    if (!options.remote) return this.moveFiles([[from, to]]) !== undefined;
    if (!this.host.has(from) || this.host.has(to)) return false;
    this.inStep(() => {
      this.relocate(from, to, true);
      this.renew();
      this.current = undefined;
      this.filesChanged();
    });
    return true;
  }

  /**
   * Moves files as one step of the person's: each `[from, to]` in order, and the imports of the
   * project rewritten so that they still name the same files (decision 0048). Refused (undefined)
   * in view mode, or when a file is missing or a target is taken, counting the moves before it;
   * nothing is moved then. Answers the files whose imports changed and those left as they were
   * because they do not parse, by their paths after the moves.
   */
  moveFiles(
    moves: readonly (readonly [string, string])[],
  ): { readonly edited: readonly string[]; readonly skipped: readonly string[] } | undefined {
    if (this.viewOnly || moves.length === 0) return undefined;
    const taken = new Set(this.host.paths());
    for (const [from, to] of moves) {
      if (!taken.has(from) || taken.has(to) || from === to) return undefined;
      taken.delete(from);
      taken.add(to);
    }
    const planned = moveFileEdits(
      this.sessions,
      moves.map(([from, to]) => ({ from: absolute(from), to: absolute(to) })),
    );
    const edits = new Map<string, readonly TextEdit[]>();
    for (const [file, list] of planned.edits) {
      const relative = this.relative(file);
      if (relative !== undefined) edits.set(relative, list);
    }
    const skipped = planned.skipped.flatMap((file) => this.relative(file) ?? []);
    this.inStep(() => {
      for (const [from, to] of moves) this.relocate(from, to, false);
      const changes = [...edits].map(([path, list]) => {
        const before = this.text(path);
        return { path, before, after: applyTextEdits(before, list) };
      });
      for (const change of changes) {
        this.write(change.path, change.after);
        this.emit("text", change.path, change.after);
      }
      if (!this.bound) {
        this.history.recordMoves(
          moves.map(([from, to]) => ({ from, to })),
          changes,
        );
      }
      this.renew();
      this.current = undefined;
      this.filesChanged();
    });
    return { edited: [...edits.keys()], skipped };
  }

  /**
   * Moves one file and what the studio keeps of it: its canvas, its revision and, unless an undo
   * already moved them, its stacks of the history.
   */
  private relocate(from: string, to: string, remote: boolean, history = true): void {
    this.host.rename(from, to);
    this.emitChange({ kind: "rename", path: to, from }, { remote });
    if (history) this.history.forget(from, to);
    const canvas = this.canvases.get(from);
    this.canvases.delete(from);
    if (canvas) this.canvases.set(to, canvas);
    this.revisions.set(to, this.revision(from) + 1);
    this.revisions.delete(from);
    this.workspaceOf(from).invalidate(absolute(from));
    if (from === this.openPath) this.openPath = to;
  }

  /**
   * Changes a file's text. Typing in the code pane coalesces in the history and waits for the
   * typing pause; other changes are analysed at once and shown in the code pane.
   */
  setText(
    path: string,
    text: string,
    options: { typing?: boolean; before?: Selection; after?: Selection } = {},
  ): void {
    if (this.viewOnly) return;
    const before = this.text(path);
    if (before === text) return;
    // A bound document keeps the person's undo; the history is for the anonymous project.
    if (!this.bound) {
      this.history.record(
        [
          {
            path,
            before,
            after: text,
            ...(options.before ? { selectionBefore: options.before } : {}),
            ...(options.after ? { selectionAfter: options.after } : {}),
          },
        ],
        options.typing ?? false,
      );
    }
    this.inStep(() => {
      this.write(path, text, {
        typing: options.typing ?? false,
        ...(options.before ? { selectionBefore: options.before } : {}),
        ...(options.after ? { selectionAfter: options.after } : {}),
      });
      if (options.typing) this.schedule();
      else {
        this.emit("text", path, text, options.after);
        this.analyzeNow();
      }
    });
  }

  /**
   * Puts a text in a file as a bound document has it (a remote change, an undo): the host is
   * written, listeners hear `text` with `selection` and no history is recorded. The analysis
   * follows after the typing pause, or at once with `now`. `remote` tells `change` listeners the
   * person did not make it, so that the document does not take it back as an edit.
   */
  replaceText(
    path: string,
    text: string,
    options: { remote?: boolean; selection?: Selection; now?: boolean } = {},
  ): void {
    if (this.viewOnly && !options.remote) return;
    if (this.host.has(path) && this.text(path) === text) return;
    this.inStep(() => {
      this.write(path, text, { remote: options.remote ?? false });
      this.emit("text", path, text, options.selection);
    });
    if (options.now) this.analyzeNow();
    else this.schedule();
  }

  /** Applies edits to several files as one step of the history. */
  applyEdits(edits: ReadonlyMap<string, readonly TextEdit[]>, selection?: Selection): void {
    if (this.viewOnly) return;
    const changes = [...edits]
      .filter(([path, list]) => list.length > 0 && this.host.has(path))
      .map(([path, list]) => {
        const before = this.text(path);
        return { path, before, after: applyTextEdits(before, list) };
      });
    if (changes.length === 0) return;
    if (!this.bound) {
      this.history.record(
        changes.map((c) =>
          c.path === this.openPath && selection ? { ...c, selectionAfter: selection } : c,
        ),
      );
    }
    this.inStep(() => {
      for (const change of changes) {
        const here = change.path === this.openPath;
        this.write(
          change.path,
          change.after,
          here && selection ? { selectionAfter: selection } : {},
        );
        this.emit("text", change.path, change.after, here ? selection : undefined);
      }
      this.analyzeNow();
    });
  }

  /** Undoes the person's last step: in a cloud project the bound document's, else the history's. */
  undo(): boolean {
    if (this.viewOnly) return false;
    if (this.bound) return this.bound.undo();
    return this.restore(this.history.undo(this.openPath, (p) => this.host.text(p)));
  }

  redo(): boolean {
    if (this.viewOnly) return false;
    if (this.bound) return this.bound.redo();
    return this.restore(this.history.redo(this.openPath, (p) => this.host.text(p)));
  }

  canUndo(): boolean {
    if (this.viewOnly) return false;
    return this.bound ? this.bound.canUndo() : this.history.canUndo(this.openPath);
  }

  canRedo(): boolean {
    if (this.viewOnly) return false;
    return this.bound ? this.bound.canRedo() : this.history.canRedo(this.openPath);
  }

  private restore(restored: ReturnType<History["undo"]>): boolean {
    if (!restored) return false;
    const moves = restored.moves ?? [];
    if (restored.texts.size === 0 && moves.length === 0) return false;
    this.inStep(() => {
      // The history already moved its stacks with the files; the files follow.
      for (const move of moves) this.relocate(move.from, move.to, false, false);
      for (const [path, text] of restored.texts) {
        this.write(path, text);
        this.emit("text", path, text, path === this.openPath ? restored.selection : undefined);
      }
      if (moves.length > 0) {
        this.renew();
        this.current = undefined;
        this.filesChanged();
      } else this.analyzeNow();
    });
    return true;
  }

  private write(path: string, text: string, flags: ChangeFlags = {}): void {
    const before = this.host.text(path);
    this.host.write(path, text);
    this.revisions.set(path, this.revision(path) + 1);
    // Files of the project are read through the workspace's cache.
    this.workspaceOf(path).invalidate(absolute(path));
    // The open file reads the others, such as the file of its project's theme.
    if (path !== this.openPath) this.current = undefined;
    if (path === MANIFEST_NAME || !path.endsWith(".meltemi")) this.renew();
    this.emit("changed", path);
    this.emitChange(
      before === undefined
        ? { kind: "add", path, after: text }
        : { kind: "text", path, before, after: text },
      flags,
    );
  }

  private workspaceOf(path: string): Workspace {
    return this.sessions.forFile(absolute(path));
  }

  /** Analyses after the typing pause. */
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.analyzeNow(), ANALYSIS_DELAY);
  }

  /** Analyses the open file now and tells the code pane and the canvas. */
  analyzeNow(): OpenAnalysis | undefined {
    clearTimeout(this.timer);
    const path = this.openPath;
    if (path === "") {
      this.current = undefined;
      this.emit("canvas", [{ type: "empty", revision: 0, message: messages().studio.noFiles }]);
      return undefined;
    }
    const revision = this.revision(path);
    if (this.current?.path === path && this.current.revision === revision) return this.current;
    const text = this.text(path);
    let analysis: OpenAnalysis;
    if (path.endsWith(".meltemi")) {
      const document = this.sessions.analyze(absolute(path), undefined, revision);
      analysis = { path, revision, text, document, diagnostics: document.diagnostics };
    } else {
      const diagnostics =
        path === MANIFEST_NAME ? sortDiagnostics([...this.workspace.manifest().diagnostics]) : [];
      analysis = { path, revision, text, document: undefined, diagnostics };
    }
    this.current = analysis;
    this.emit("analysis", analysis);
    if (analysis.document) this.emit("canvas", this.session.update(analysis.document));
    else {
      const m = messages().studio;
      this.emit("canvas", [
        {
          type: "empty",
          revision,
          message: path === MANIFEST_NAME ? m.manifest : m.openSource,
        },
      ]);
    }
    return analysis;
  }

  /** The analysis of the open `.meltemi` file as its text is now, analysing it if needed. */
  document(): DocumentAnalysis | undefined {
    return this.analyzeNow()?.document;
  }

  /** Errors and warnings of every source of the project and of project.json. */
  problems(): ProjectProblems {
    const counts = new Map<string, { errors: number; warnings: number }>();
    const add = (path: string | undefined, diagnostics: readonly Diagnostic[]) => {
      if (path === undefined || diagnostics.length === 0) return;
      const entry = counts.get(path) ?? { errors: 0, warnings: 0 };
      for (const d of diagnostics) {
        if (d.severity === "error") entry.errors++;
        else if (d.severity === "warning") entry.warnings++;
      }
      counts.set(path, entry);
    };
    const workspace = this.workspace;
    add(MANIFEST_NAME, workspace.manifest().diagnostics);
    for (const [file, compilation] of workspace.compileProject().files) {
      add(this.relative(file), compilation.diagnostics);
    }
    return counts;
  }

  /**
   * What each `.meltemi` file of the project declares, by path: its diagrams and stories in source
   * order, and how many models and themes it holds. A file that does not compile declares what its
   * parse kept. From the project's compilation, which reuses each file's by its text.
   */
  outlines(): Map<string, FileOutline> {
    const outlines = new Map<string, FileOutline>();
    for (const [file, compiled] of this.workspace.compileProject().files) {
      const path = this.relative(file);
      if (path === undefined) continue;
      const document = compiled.compilation.document;
      outlines.set(path, {
        diagrams: document.diagrams.map((d) => ({
          id: d.id,
          title: d.properties.title,
          type: d.type,
        })),
        stories: document.stories.map((s) => ({ id: s.id, title: s.title })),
        models: document.models.length,
        themes: document.themes.length,
      });
    }
    return outlines;
  }

  /** Runs work that reads fonts and icons until every file it reads has arrived. */
  settled<T>(work: () => T): Promise<T> {
    return settle([this.environment.fonts, this.environment.assets], work, () => this.renew());
  }

  /**
   * As `settled`, with a compiler whose exported words are in `locale`: the studio's own when that
   * is already the project's language (or no language is asked), else one made for this work.
   */
  settledIn<T>(locale: Locale | undefined, work: (projects: ProjectSessions) => T): Promise<T> {
    if (locale === undefined || locale === this.sessions.contentLocale(this.workspace)) {
      return this.settled(() => work(this.sessions));
    }
    let projects = this.newSessions(locale);
    return settle(
      [this.environment.fonts, this.environment.assets],
      () => work(projects),
      () => (projects = this.newSessions(locale)),
    );
  }

  // Canvas ------------------------------------------------------------------------------------

  /** Handles a message of the canvas, as the extension handles its webview's. */
  receive(message: unknown): void {
    this.handle(this.session.receive(message));
  }

  /** Acts on what the session returned for a message, a paste or a new object. */
  handle(result: SessionResult): void {
    this.emit("canvas", result.messages);
    // In view mode the canvas sends no action, and one that arrives anyway edits nothing.
    if (this.viewOnly) {
      if (result.reveal) this.emit("reveal", result.reveal);
      if (result.clipboard !== undefined || result.command) this.emit("request", result);
      return;
    }
    if (result.plan && !this.applyPlan(result.plan)) {
      this.emit("canvas", [
        {
          type: "rejected",
          code: "edit.stale-revision",
          reason: messages().studio.stale,
        },
      ]);
      const analysis = this.analyzeNow();
      if (analysis?.document) this.emit("canvas", this.session.update(analysis.document));
    }
    if (result.project) this.applyProject(result.project);
    if (result.reveal) this.emit("reveal", result.reveal);
    if (result.clipboard !== undefined || result.readClipboard || result.command || result.pick) {
      this.emit("request", result);
    }
  }

  /**
   * Makes the edits of other files of the project that the canvas asks: a theme created for the
   * project (its file and the default of `project.json`), or an operation on the file that holds
   * the theme being edited.
   */
  private applyProject(request: NonNullable<SessionResult["project"]>): void {
    this.inStep(() => this.applyProjectStep(request));
  }

  private applyProjectStep(request: NonNullable<SessionResult["project"]>): void {
    const reject = (reason: string) =>
      this.emit("canvas", [{ type: "rejected", code: "edit.invalid-value", reason }]);
    const path = absolute(this.openPath);
    const relativeEdits = (edits: ReadonlyMap<string, readonly TextEdit[]>) =>
      new Map(
        [...edits].flatMap(([file, list]) => {
          const relative = this.relative(file);
          return relative === undefined ? [] : [[relative, list] as const];
        }),
      );
    if (request.kind === "createTheme") {
      const created = this.sessions.createProjectTheme(path, request.theme, request.extends);
      if (!created.ok) return reject(created.reason);
      // The theme's file and the default in project.json arrive together, in one analysis.
      for (const file of created.create) {
        const relative = this.relative(file.path);
        if (relative === undefined) continue;
        this.putFile(relative, file.text);
      }
      this.renew();
      this.applyEdits(relativeEdits(created.edits));
      this.emit("files");
      this.analyzeNow();
      this.status(messages().studio.themeCreated(request.theme));
      return;
    }
    const planned = this.sessions.planInFile(request.file, request.operation);
    if (!planned.ok) return reject(planned.reason);
    const file = this.relative(request.file);
    if (file === undefined) return reject(messages().studio.notInProject(request.file));
    this.applyEdits(new Map([[file, planned.edits]]));
    this.status(messages().studio.themeChanged(file));
  }

  /** Applies a plan made against the open file's current revision, with its story renames. */
  private applyPlan(plan: EditPlan): boolean {
    if (plan.baseRevision !== this.revision() || plan.edits.length === 0) return false;
    const edits = new Map<string, readonly TextEdit[]>([[this.openPath, plan.edits]]);
    for (const [file, list] of this.sessions.storyRenames(
      absolute(this.openPath),
      plan.operation,
    )) {
      const relative = this.relative(file);
      if (relative !== undefined && relative !== this.openPath) edits.set(relative, list);
    }
    this.applyEdits(edits);
    return true;
  }

  /** Tells the canvas to select what the caret is on. */
  caret(offset: number): void {
    if (!this.current?.document || this.current.revision !== this.revision()) return;
    this.emit("canvas", this.session.selectAt(offset));
  }

  /** The canvas state again, for example after it was mounted. */
  refresh(): void {
    const analysis = this.analyzeNow();
    if (analysis?.document) this.emit("canvas", this.session.update(analysis.document));
  }

  status(message: string): void {
    this.emit("status", message);
  }
}
