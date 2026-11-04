// Ties a cloud project's Yjs document to the Studio (`cloud-projects`, "The page"): the person's
// edits become transactions of the document, the document's remote changes become edits of the
// Studio that keep the caret, and undo covers the person's own edits only. The binding holds no
// socket, no storage and no fetch: the page's room, persistence and client are handed in as
// functions, and updates go out and come in as bytes.

import * as Y from "yjs";
import { isCleanPath, isTextContent } from "../files.js";
import type { Selection } from "../history.js";
import type { DocumentUndo, Studio, StudioChange } from "../studio.js";
import {
  LOCAL,
  LOCAL_FINAL,
  REMOTE,
  cloudDoc,
  isLocalOrigin,
  minimalEdit,
  newFileId,
  resolveFiles,
  sameCollisions,
  sha256Hex,
  type Collision,
  type CloudDoc,
  type DocFile,
} from "./doc.js";

/** Local updates leave at most this often, in milliseconds. */
export const SEND_INTERVAL = 250;

/** Typing within this pause, in milliseconds, is one undo step. */
export const CAPTURE_TIMEOUT = 700;

/** Timers the binding uses, so that tests drive them. */
export interface Timers {
  set(run: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

export const realTimers: Timers = {
  set: (run, milliseconds) => setTimeout(run, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** What can go wrong without the binding being able to say so otherwise. */
export interface BindingError {
  /**
   * `path.invalid`: a path the document would refuse was not written. `binary.unsupported`: an
   * image or font was added and no `uploadBinary` was given. `binary.upload`, `binary.fetch`: the
   * transfer failed (`cause` says why). `internal`: the binding threw while applying a change.
   */
  readonly code:
    "path.invalid" | "binary.unsupported" | "binary.upload" | "binary.fetch" | "internal";
  readonly path?: string;
  readonly cause?: unknown;
}

export interface BindingOptions {
  /** The project's document. Its content is loaded into the Studio when the binding is made. */
  readonly doc: Y.Doc;
  readonly studio: Studio;
  /**
   * Receives the person's own updates, merged, at most every `sendInterval` ms (and at once on
   * `flush` and `destroy`). It may be called while offline: drop the bytes, the next sync of
   * state vectors carries what was missed.
   */
  readonly send: (update: Uint8Array) => void;
  /** Receives every local transaction's update as it happens, for IndexedDB's `updates` store. */
  readonly onLocalUpdate?: (update: Uint8Array) => void;
  /** The code pane's selection in the open file (`playground.code.selection()`). */
  readonly selection?: () => Selection | undefined;
  /** The bytes of an image or font by SHA-256, from the project's blobs. */
  readonly fetchBlob?: (hash: string) => Promise<Uint8Array>;
  /**
   * Stores an image or font the person added (`PUT …/binaries/<path>`). The Worker puts the
   * file's `paths` and `binaries` entries in the room, and they reach the document as a remote
   * update; the binding writes no entry for a binary itself.
   */
  readonly uploadBinary?: (path: string, bytes: Uint8Array) => Promise<void>;
  /**
   * Tells the service the person removed an image or font (`DELETE …/binaries/<path>`), so that
   * its bytes stop counting in the account's usage once nothing else uses them. Called for the
   * person's own removals only (a delete, or a text file put in its place), never for a remote
   * change and never for a rename, and BEFORE the removal is written to the document: the service
   * looks the file up in the room, and it is no longer there once the document's change has
   * arrived. The binding does not wait for it. A file shown as `<path>~<id>` (it lost a collision)
   * has no path the service takes and is not reported.
   */
  readonly removeBinary?: (path: string) => void;
  /** Called with the full list whenever the paths shown under another name change. */
  readonly onCollisions?: (collisions: readonly Collision[]) => void;
  readonly onError?: (error: BindingError) => void;
  /** The file to open (a path as the Studio shows it); else the first source. */
  readonly open?: string;
  readonly timers?: Timers;
  /** Random bytes for file ids (tests make them deterministic). */
  readonly random?: (length: number) => Uint8Array;
  readonly sendInterval?: number;
  /**
   * The person is a viewer of the project (`project-sharing`): the binding only receives. It never
   * writes the document, never calls `send`, `onLocalUpdate`, `uploadBinary` or `removeBinary`
   * (whatever the Studio reports), and has nothing to undo or redo.
   */
  readonly readOnly?: boolean;
}

/** A Studio bound to a document. It is the Studio's undo while it lives. */
export interface Binding extends DocumentUndo {
  readonly doc: Y.Doc;
  /** Applies an update from outside (room, IndexedDB, push) with a non-local origin. */
  apply(update: Uint8Array, origin?: unknown): void;
  /** Sends what is waiting now. */
  flush(): void;
  /** The files shown under `<path>~<id>` because two ids carry one path. */
  collisions(): readonly Collision[];
  /** Resolves when the transfers of images and fonts under way are over. */
  settled(): Promise<void>;
  /**
   * Forgets everything the person could undo or redo. A version restored replaces the files
   * wholesale: the person's earlier steps no longer describe what is there, and undoing one could
   * only change the restored text into something no version ever held.
   */
  clearUndo(): void;
  /** Sends what is waiting, unbinds the Studio and stops listening. */
  destroy(): void;
}

/** Binds a document to a Studio: loads its files into the Studio and keeps both in step. */
export function createBinding(options: BindingOptions): Binding {
  return new StudioBinding(options);
}

// ----------------------------------------------------------------------------------------------

type StackItem = Y.UndoManager["undoStack"][number];

/** A stack item event, as far as the binding reads it. */
interface StackEvent {
  readonly stackItem: StackItem;
  readonly origin: unknown;
}

interface RelativeSelection {
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
}

/** What the binding knows of a file: it mirrors what the Studio shows. */
interface Known {
  readonly id: string;
  /** The path the Studio shows. */
  shown: string;
  readonly kind: "text" | "binary";
  text?: Y.Text;
  manager?: Y.UndoManager;
  hash?: string;
}

/** The local step being written: the group and carets its undo item takes. */
interface Step {
  readonly group: number;
  readonly before?: RelativeSelection;
  readonly after?: Selection;
}

/** The caret of the open file before a remote transaction, as positions of the text. */
interface Caret {
  readonly known: Known;
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  readonly selection: Selection;
}

interface Placed {
  readonly known: Known;
  readonly selection: Selection;
}

/** Stack item meta: the step a transaction belongs to and the carets around it. */
const GROUP = "group";
const BEFORE = "selectionBefore";
const AFTER = "selectionAfter";

const decoder = new TextDecoder();

/** Whether a transaction changed which files exist or where: the three maps, not a text. */
function touchesFiles(tr: Y.Transaction, cloud: CloudDoc): boolean {
  const changed = tr.changed as ReadonlyMap<unknown, unknown>;
  return changed.has(cloud.paths) || changed.has(cloud.files) || changed.has(cloud.binaries);
}

class StudioBinding implements Binding {
  readonly doc: Y.Doc;
  private readonly cloud: CloudDoc;
  private readonly studio: Studio;
  private readonly timers: Timers;
  private readonly interval: number;
  /** Undo of renames, additions and deletions of files: one for the project. */
  private readonly structure: Y.UndoManager;
  private readonly known = new Map<string, Known>();
  private readonly byPath = new Map<string, string>();
  private readonly byText = new Map<Y.Text, Known>();
  private readonly owners = new Map<Y.UndoManager, Known>();
  private readonly tasks = new Set<Promise<void>>();
  private pending: Uint8Array[] = [];
  private armed = false;
  private handle: unknown;
  /** While above zero the binding is changing the Studio, and ignores what it reports. */
  private applying = 0;
  private step: Step | undefined;
  private caret: Caret | undefined;
  private shown: readonly Collision[] = [];
  private destroyed = false;
  private readonly unlisten: () => void;
  /** A viewer: the document is the room's, and nothing of this page's reaches it. */
  private readonly viewer: boolean;

  constructor(private readonly options: BindingOptions) {
    this.viewer = options.readOnly === true;
    this.doc = options.doc;
    this.cloud = cloudDoc(options.doc);
    this.studio = options.studio;
    this.timers = options.timers ?? realTimers;
    this.interval = options.sendInterval ?? SEND_INTERVAL;
    const { paths, files, binaries } = this.cloud;
    // Only changes of the three maps themselves: typing is the texts' own managers'.
    this.structure = new Y.UndoManager([paths, files, binaries], {
      trackedOrigins: new Set<unknown>([LOCAL]),
      captureTimeout: CAPTURE_TIMEOUT,
      captureTransaction: (tr) => touchesFiles(tr, this.cloud),
    });
    this.structure.on("stack-item-added", (event: StackEvent) =>
      this.stamp(event, undefined, false),
    );
    this.structure.on("stack-item-updated", (event: StackEvent) =>
      this.stamp(event, undefined, true),
    );
    this.doc.on("beforeTransaction", this.beforeTransaction);
    this.doc.on("afterTransaction", this.afterTransaction);
    this.doc.on("update", this.updated);
    this.open(options.open);
    this.unlisten = this.studio.listen({ change: this.changed });
    this.studio.bindDocument(this);
  }

  // The interface ----------------------------------------------------------------------------

  apply(update: Uint8Array, origin: unknown = REMOTE): void {
    Y.applyUpdate(this.doc, update, isLocalOrigin(origin) ? REMOTE : origin);
  }

  collisions(): readonly Collision[] {
    return this.shown;
  }

  async settled(): Promise<void> {
    while (this.tasks.size > 0) await Promise.allSettled([...this.tasks]);
  }

  clearUndo(): void {
    if (this.destroyed) return;
    for (const manager of this.managers()) manager.clear();
    // A step in the middle of being written ends here: nothing after it joins what was cleared.
    this.step = undefined;
  }

  flush(): void {
    if (this.armed) {
      this.timers.clear(this.handle);
      this.armed = false;
      this.handle = undefined;
    }
    if (this.pending.length === 0) return;
    const update = this.pending.length === 1 ? this.pending[0]! : Y.mergeUpdates(this.pending);
    this.pending = [];
    if (!this.viewer) this.options.send(update);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.flush();
    this.destroyed = true;
    this.unlisten();
    if (this.studio.isBound(this)) this.studio.bindDocument(undefined);
    this.doc.off("beforeTransaction", this.beforeTransaction);
    this.doc.off("afterTransaction", this.afterTransaction);
    this.doc.off("update", this.updated);
    for (const manager of this.managers()) manager.destroy();
    this.known.clear();
    this.byPath.clear();
    this.byText.clear();
    this.owners.clear();
  }

  // Opening ----------------------------------------------------------------------------------

  /** Loads the document's files into the Studio and starts watching them. */
  private open(open: string | undefined): void {
    const resolved = resolveFiles(this.cloud);
    const texts: [string, string][] = [];
    const binaries: Known[] = [];
    for (const file of resolved.files.values()) {
      const known = this.adopt(file);
      if (file.kind === "text") texts.push([file.shown, file.text!.toString()]);
      else binaries.push(known);
    }
    this.applying++;
    try {
      this.studio.load(texts, open, { remote: true });
    } finally {
      this.applying--;
    }
    for (const known of binaries) this.fetch(known);
    this.notifyCollisions(resolved.collisions);
  }

  private adopt(file: DocFile): Known {
    const known: Known = {
      id: file.id,
      shown: file.shown,
      kind: file.kind,
      ...(file.hash !== undefined ? { hash: file.hash } : {}),
    };
    this.known.set(file.id, known);
    this.byPath.set(file.shown, file.id);
    if (file.text) this.attach(known, file.text);
    return known;
  }

  /** Makes `text` the file's text and gives it its own undo manager. */
  private attach(known: Known, text: Y.Text): void {
    this.detach(known);
    known.text = text;
    this.byText.set(text, known);
    const manager = new Y.UndoManager(text, {
      trackedOrigins: new Set<unknown>([LOCAL]),
      captureTimeout: CAPTURE_TIMEOUT,
    });
    manager.on("stack-item-added", (event: StackEvent) => this.stamp(event, known, false));
    manager.on("stack-item-updated", (event: StackEvent) => this.stamp(event, known, true));
    known.manager = manager;
    this.owners.set(manager, known);
  }

  private detach(known: Known): void {
    if (known.text) this.byText.delete(known.text);
    if (known.manager) {
      this.owners.delete(known.manager);
      known.manager.destroy();
    }
    known.text = undefined;
    known.manager = undefined;
  }

  private forget(known: Known): void {
    this.detach(known);
    this.known.delete(known.id);
    if (this.byPath.get(known.shown) === known.id) this.byPath.delete(known.shown);
  }

  private fileAt(path: string): Known | undefined {
    const id = this.byPath.get(path);
    return id === undefined ? undefined : this.known.get(id);
  }

  private *managers(): Iterable<Y.UndoManager> {
    yield this.structure;
    for (const known of this.known.values()) if (known.manager) yield known.manager;
  }

  private fail(error: BindingError): void {
    if (!this.options.onError) {
      if (error.cause !== undefined) throw error.cause;
      return;
    }
    this.options.onError(error);
  }

  private notifyCollisions(next: readonly Collision[]): void {
    if (sameCollisions(next, this.shown)) return;
    this.shown = next;
    this.options.onCollisions?.(next);
  }

  // Sending ----------------------------------------------------------------------------------

  private readonly updated = (update: Uint8Array, origin: unknown): void => {
    if (this.destroyed || this.viewer || !isLocalOrigin(origin)) return;
    this.options.onLocalUpdate?.(update);
    this.pending.push(update);
    if (this.armed) return;
    this.armed = true;
    this.handle = this.timers.set(() => {
      this.armed = false;
      this.handle = undefined;
      this.flush();
    }, this.interval);
  };

  // The person's edits: Studio -> document ---------------------------------------------------

  private readonly changed = (change: StudioChange): void => {
    // What the binding itself puts in the Studio comes back as a change: it is not an edit.
    if (this.destroyed || this.viewer || this.applying > 0 || change.remote) return;
    // A new edit forgets what was undone, in every file.
    for (const manager of this.managers()) if (manager.canRedo()) manager.clear(false, true);
    switch (change.kind) {
      case "text":
      case "add":
        this.content(change);
        break;
      case "delete":
        this.remove(change);
        break;
      case "rename":
        this.rename(change);
        break;
    }
  };

  /** A file has this content: it is new, or its text or bytes changed. */
  private content(change: StudioChange): void {
    const content = change.after;
    const path = change.path;
    if (content === undefined) return;
    const known = this.fileAt(path);
    const text = isTextContent(path, content);
    // A file the document has keeps the path it has, even one shown as `<path>~<id>`: only a
    // path the document gets from this change has to pass the rule.
    if (text && known?.kind === "text") {
      this.edit(known, typeof content === "string" ? content : decoder.decode(content), change);
      return;
    }
    if (!isCleanPath(path)) {
      this.fail({ code: "path.invalid", path });
      return;
    }
    if (text) {
      this.create(
        path,
        typeof content === "string" ? content : decoder.decode(content),
        change,
        known,
      );
    } else {
      this.upload(path, content as Uint8Array, change, known);
    }
  }

  /** The text of a file in the document becomes `after`, by the smallest edit. */
  private edit(known: Known, after: string, change: StudioChange): void {
    const text = known.text!;
    const manager = known.manager!;
    let before = typeof change.before === "string" ? change.before : undefined;
    if (before === undefined || before.length !== text.length) before = text.toString();
    const edit = minimalEdit(before, after);
    if (!edit) return;
    // Every step but typing starts a new undo item; a deletion or a line break ends the typing one.
    if (!change.typing) manager.stopCapturing();
    this.transact(change, text, () => {
      if (edit.remove > 0) text.delete(edit.index, edit.remove);
      if (edit.insert !== "") text.insert(edit.index, edit.insert);
    });
    if (!change.typing || edit.remove > 0 || edit.insert.includes("\n")) manager.stopCapturing();
  }

  /** A new text file, in place of the file of another kind it replaces, if any. */
  private create(path: string, text: string, change: StudioChange, replacing?: Known): void {
    const id = newFileId(this.options.random);
    const created = new Y.Text();
    this.structure.stopCapturing();
    this.transact(change, undefined, () => {
      if (replacing) this.deleteEntries(replacing.id);
      this.cloud.files.set(id, created);
      if (text !== "") created.insert(0, text);
      this.cloud.paths.set(id, path);
    });
    this.structure.stopCapturing();
    if (replacing) this.forget(replacing);
    this.adopt({ id, path, shown: path, kind: "text", text: created });
    this.settle();
  }

  /** An image or font: the Worker puts its entries in the room; they arrive as a remote update. */
  private upload(path: string, bytes: Uint8Array, change: StudioChange, known?: Known): void {
    const upload = this.options.uploadBinary;
    if (!upload) {
      this.fail({ code: "binary.unsupported", path });
      return;
    }
    if (known?.kind === "text") {
      this.structure.stopCapturing();
      this.transact(change, undefined, () => this.deleteEntries(known.id));
      this.structure.stopCapturing();
      this.forget(known);
    }
    this.track(
      upload(path, bytes).catch((cause: unknown) =>
        this.fail({ code: "binary.upload", path, cause }),
      ),
    );
  }

  private remove(change: StudioChange): void {
    const known = this.fileAt(change.path);
    if (!known) return;
    // An image or a font the service is told to drop cannot come back by undo: its hash is no
    // longer one the project holds. (A text file, or a file that lost a collision, can.)
    const dropped =
      known.kind === "binary" &&
      this.options.removeBinary !== undefined &&
      isCleanPath(known.shown);
    if (dropped) this.options.removeBinary?.(known.shown);
    this.structure.stopCapturing();
    this.transact(
      change,
      undefined,
      () => this.deleteEntries(known.id),
      dropped ? LOCAL_FINAL : LOCAL,
    );
    this.structure.stopCapturing();
    this.forget(known);
    this.settle();
  }

  private rename(change: StudioChange): void {
    const known = change.from === undefined ? undefined : this.fileAt(change.from);
    if (!known) return;
    if (!isCleanPath(change.path)) {
      this.fail({ code: "path.invalid", path: change.path });
      return;
    }
    this.structure.stopCapturing();
    this.transact(change, undefined, () => this.cloud.paths.set(known.id, change.path));
    this.structure.stopCapturing();
    if (this.byPath.get(known.shown) === known.id) this.byPath.delete(known.shown);
    known.shown = change.path;
    this.byPath.set(change.path, known.id);
    this.settle();
  }

  /**
   * After the person changed which files exist or where: a path that two ids carry is shown for
   * one of them as `<path>~<id>`, and a file whose rival went takes its path back, in the Studio
   * as on the device that is not the one that changed it.
   */
  private settle(): void {
    const next = resolveFiles(this.cloud);
    const moves: [Known, string][] = [];
    for (const file of next.files.values()) {
      const known = this.known.get(file.id);
      if (known && known.shown !== file.shown) moves.push([known, file.shown]);
    }
    if (moves.length > 0) {
      this.applying++;
      try {
        this.move(moves);
      } finally {
        this.applying--;
      }
    }
    this.notifyCollisions(next.collisions);
  }

  private deleteEntries(id: string): void {
    this.cloud.files.delete(id);
    this.cloud.paths.delete(id);
    this.cloud.binaries.delete(id);
  }

  /** Runs `work` as one local transaction of the step `change` belongs to. */
  private transact(
    change: StudioChange,
    text: Y.Text | undefined,
    work: () => void,
    origin: typeof LOCAL | typeof LOCAL_FINAL = LOCAL,
  ): void {
    // The caret before the edit is read from the text as it is now, before the edit moves it.
    const before =
      text && change.selectionBefore ? this.relative(text, change.selectionBefore) : undefined;
    this.step = {
      group: change.step,
      ...(before ? { before } : {}),
      ...(change.selectionAfter ? { after: change.selectionAfter } : {}),
    };
    try {
      this.doc.transact(work, origin);
    } finally {
      this.step = undefined;
    }
  }

  /**
   * Gives an item that entered a stack the step it belongs to and its carets. An item made by an
   * undo or a redo is the other stack's copy of the one popped, and keeps its step and carets.
   */
  private stamp(event: StackEvent, known: Known | undefined, updated: boolean): void {
    const meta = event.stackItem.meta;
    if (event.origin instanceof Y.UndoManager) {
      const popped = event.origin.currStackItem;
      if (popped)
        for (const key of [GROUP, BEFORE, AFTER]) {
          if (popped.meta.has(key)) meta.set(key, popped.meta.get(key));
        }
      return;
    }
    const step = this.step;
    if (!step) return;
    if (!updated) {
      meta.set(GROUP, step.group);
      if (step.before) meta.set(BEFORE, step.before);
    }
    if (step.after && known?.text) meta.set(AFTER, this.relative(known.text, step.after));
  }

  private relative(text: Y.Text, selection: Selection): RelativeSelection {
    const at = (offset: number) => Math.max(0, Math.min(offset, text.length));
    const collapsed = selection.start === selection.end;
    return {
      start: Y.createRelativePositionFromTypeIndex(text, at(selection.start), 0),
      end: Y.createRelativePositionFromTypeIndex(text, at(selection.end), collapsed ? 0 : -1),
    };
  }

  // The room's edits: document -> Studio -----------------------------------------------------

  private readonly beforeTransaction = (tr: Y.Transaction): void => {
    this.caret = undefined;
    if (this.destroyed || isLocalOrigin(tr.origin)) return;
    const selection = this.options.selection?.();
    const known = this.fileAt(this.studio.open);
    const text = known?.text;
    if (!selection || !known || !text) return;
    const clamp = (offset: number) => Math.max(0, Math.min(offset, text.length));
    const clamped = { start: clamp(selection.start), end: clamp(selection.end) };
    const relative = this.relative(text, clamped);
    this.caret = { known, start: relative.start, end: relative.end, selection: clamped };
  };

  private readonly afterTransaction = (tr: Y.Transaction): void => {
    const caret = this.caret;
    this.caret = undefined;
    if (this.destroyed || tr.origin === LOCAL || tr.origin === LOCAL_FINAL) return;
    if (tr.changed.size === 0) return;
    try {
      this.reflect(tr, caret);
    } catch (cause) {
      this.fail({ code: "internal", cause });
    }
  };

  /**
   * Shows in the Studio what a transaction changed that the Studio does not have: a remote one,
   * or the person's own undo or redo.
   */
  private reflect(tr: Y.Transaction, caret: Caret | undefined): void {
    const undone = tr.origin instanceof Y.UndoManager ? tr.origin : undefined;
    const structural = touchesFiles(tr, this.cloud);
    const edited: [Y.Text, Known][] = [];
    for (const type of tr.changed.keys()) {
      const known = type instanceof Y.Text ? this.byText.get(type) : undefined;
      if (known) edited.push([known.text!, known]);
    }
    this.applying++;
    try {
      const replaced = structural ? this.reconcile(undone !== undefined) : [];
      const placed = undone ? this.popped(undone) : this.resolve(caret);
      const deliver = new Set<Known>(replaced);
      for (const [text, known] of edited) if (known.text === text) deliver.add(known);
      let restored = false;
      for (const known of deliver) {
        if (this.known.get(known.id) !== known || !known.text) continue;
        const selection = placed?.known === known ? placed.selection : undefined;
        this.studio.replaceText(known.shown, known.text.toString(), {
          remote: true,
          now: undone !== undefined,
          ...(selection ? { selection } : {}),
        });
        if (selection) restored = true;
      }
      // A file operation reopens the code pane, which resets the caret: put it back.
      if (structural && placed && !restored && this.known.get(placed.known.id) === placed.known) {
        this.studio.restoreSelection(placed.known.shown, placed.selection);
      }
    } finally {
      this.applying--;
    }
  }

  /** Where the caret captured before a remote transaction is now. */
  private resolve(caret: Caret | undefined): Placed | undefined {
    const text = caret?.known.text;
    if (!caret || !text || this.known.get(caret.known.id) !== caret.known) return undefined;
    const at = (position: Y.RelativePosition, fallback: number) => {
      const absolute = Y.createAbsolutePositionFromRelativePosition(position, this.doc);
      return absolute && absolute.type === text ? absolute.index : Math.min(fallback, text.length);
    };
    return {
      known: caret.known,
      selection: {
        start: at(caret.start, caret.selection.start),
        end: at(caret.end, caret.selection.end),
      },
    };
  }

  /** Where the caret goes after the manager undid or redid an item, from what the item holds. */
  private popped(manager: Y.UndoManager): Placed | undefined {
    const known = this.owners.get(manager);
    const item = manager.currStackItem;
    const stored = item?.meta.get(manager.undoing ? BEFORE : AFTER) as
      RelativeSelection | undefined;
    if (!known?.text || !stored) return undefined;
    const start = Y.createAbsolutePositionFromRelativePosition(stored.start, this.doc);
    const end = Y.createAbsolutePositionFromRelativePosition(stored.end, this.doc);
    if (!start || !end || start.type !== known.text || end.type !== known.text) return undefined;
    return { known, selection: { start: start.index, end: end.index } };
  }

  /**
   * Makes the Studio's files those of the document: files that went are deleted, renamed ones
   * moved, new ones added. Returns the files whose text is another `Y.Text` now (a deletion
   * undone), which the caller shows.
   */
  private reconcile(opening: boolean): Known[] {
    const next = resolveFiles(this.cloud);
    const fetches: Known[] = [];
    const replaced: Known[] = [];
    // One transaction can delete, rename or add hundreds of files: the Studio shows and analyses
    // the result once, when all of them are done.
    this.studio.batch(() => {
      for (const known of [...this.known.values()]) {
        const file = next.files.get(known.id);
        if (file && file.kind === known.kind) continue;
        this.studio.deleteFile(known.shown, { remote: true });
        this.forget(known);
      }
      const moves: [Known, string][] = [];
      for (const file of next.files.values()) {
        const known = this.known.get(file.id);
        if (known && known.shown !== file.shown) moves.push([known, file.shown]);
      }
      this.move(moves);
      const added: [string, string][] = [];
      for (const file of next.files.values()) {
        const known = this.known.get(file.id);
        if (!known) {
          const created = this.adopt(file);
          if (file.text) added.push([file.shown, file.text.toString()]);
          else fetches.push(created);
        } else if (file.text && known.text !== file.text) {
          this.attach(known, file.text);
          replaced.push(known);
        } else if (file.kind === "binary" && known.hash !== file.hash) {
          known.hash = file.hash;
          fetches.push(known);
        }
      }
      if (added.length > 0) {
        // An undone deletion brings the file back, and the person with it.
        this.studio.addFiles(added, opening ? added[0]![0] : undefined, { remote: true });
      }
    });
    for (const known of fetches) this.fetch(known);
    this.notifyCollisions(next.collisions);
    return replaced;
  }

  /** Renames in an order that never lands on a name still taken; a cycle goes through a hidden one. */
  private move(moves: [Known, string][]): void {
    const queue = [...moves];
    let budget = 2 * queue.length + 2;
    while (queue.length > 0 && budget-- > 0) {
      const free = queue.findIndex(([, to]) => !this.byPath.has(to));
      const [known, to] = free >= 0 ? queue.splice(free, 1)[0]! : queue.shift()!;
      if (free < 0) {
        // Everything left waits for a name that another of them holds: park this one.
        this.rename1(known, `.moving~${known.id}`);
        queue.push([known, to]);
      } else if (!this.rename1(known, to)) {
        // The Studio holds a file the document does not know under that name (a binary being
        // uploaded, say): the document wins.
        this.studio.deleteFile(to, { remote: true });
        this.rename1(known, to);
      }
    }
  }

  private rename1(known: Known, to: string): boolean {
    if (!this.studio.renameFile(known.shown, to, { remote: true })) return false;
    if (this.byPath.get(known.shown) === known.id) this.byPath.delete(known.shown);
    known.shown = to;
    this.byPath.set(to, known.id);
    return true;
  }

  /** Brings the bytes of an image or font into the Studio, unless it already holds them. */
  private fetch(known: Known): void {
    const hash = known.hash;
    if (hash === undefined) return;
    const run = async (): Promise<void> => {
      const present = this.studio.host.get(known.shown);
      if (present instanceof Uint8Array && (await sha256Hex(present)) === hash) return;
      const fetchBlob = this.options.fetchBlob;
      if (!fetchBlob) {
        this.fail({ code: "binary.fetch", path: known.shown });
        return;
      }
      const bytes = await fetchBlob(hash);
      // The file may have been renamed, replaced or deleted while the bytes came.
      if (this.destroyed || this.known.get(known.id) !== known || known.hash !== hash) return;
      const selection = this.options.selection?.();
      const open = this.studio.open;
      this.applying++;
      try {
        // Images arrive one by one: the project is analysed once the last of a burst is in.
        this.studio.addFiles([[known.shown, bytes]], undefined, { remote: true, later: true });
        if (selection && this.studio.open === open) this.studio.restoreSelection(open, selection);
      } finally {
        this.applying--;
      }
    };
    this.track(
      run().catch((cause: unknown) =>
        this.fail({ code: "binary.fetch", path: known.shown, cause }),
      ),
    );
  }

  private track(task: Promise<void>): void {
    const tracked: Promise<void> = task.finally(() => this.tasks.delete(tracked));
    this.tasks.add(tracked);
  }

  // Undo and redo ------------------------------------------------------------------------------

  canUndo(): boolean {
    return !this.viewer && this.candidates(true).length > 0;
  }

  canRedo(): boolean {
    return !this.viewer && this.candidates(false).length > 0;
  }

  undo(): boolean {
    return !this.viewer && this.walk(true);
  }

  redo(): boolean {
    return !this.viewer && this.walk(false);
  }

  /** The stack of a manager that undo (or redo) takes from. */
  private stack(manager: Y.UndoManager, undo: boolean): StackItem[] {
    return undo ? manager.undoStack : manager.redoStack;
  }

  private group(manager: Y.UndoManager, undo: boolean): number {
    const item = this.stack(manager, undo).at(-1);
    return (item?.meta.get(GROUP) as number | undefined) ?? 0;
  }

  /** The managers a step can come from when asked about the open file: its text and the files. */
  private candidates(undo: boolean): Y.UndoManager[] {
    const open = this.fileAt(this.studio.open)?.manager;
    return [open, this.structure].filter(
      (manager): manager is Y.UndoManager => !!manager && this.stack(manager, undo).length > 0,
    );
  }

  /**
   * Undoes the last step of the open file, or the last change of the project's files if that came
   * later, with the top items of the other files that belong to the same step. Redo takes the step
   * undone last, which is the earliest of the steps waiting.
   */
  private walk(undo: boolean): boolean {
    const ordered = this.candidates(undo).sort((a, b) =>
      undo
        ? this.group(b, true) - this.group(a, true)
        : this.group(a, false) - this.group(b, false),
    );
    const primary = ordered[0];
    if (!primary) return false;
    const group = this.group(primary, undo);
    const peers = [...this.managers()].filter(
      (manager) =>
        manager !== primary &&
        this.stack(manager, undo).length > 0 &&
        this.group(manager, undo) === group,
    );
    let moved = false;
    for (const manager of [primary, ...peers]) {
      // A step that added or removed several files left several items on the project's stack.
      do {
        moved = (undo ? manager.undo() : manager.redo()) !== null || moved;
      } while (this.stack(manager, undo).length > 0 && this.group(manager, undo) === group);
    }
    return moved;
  }
}
