// One open cloud project: its Yjs document, kept in IndexedDB, spoken to its room over a socket,
// and bound to the Studio so that the person's edits become transactions and the room's changes
// become edits (`cloud-projects`, "The page"). It loads from this browser at once, connects and
// syncs; it keeps working when the connection drops and merges on reconnect; when the room refuses
// a change it takes the room's state back and goes on.
//
// Opening is two steps so that the page can swap projects in one go: `prepare` does the waiting
// (this browser's copy, or the room's answer when there is none), `attach` binds the Studio.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import * as Y from "yjs";
import type { Selection } from "../history.js";
import type { Studio } from "../studio.js";
import { createBinding, type Binding, type BindingError, type Timers } from "./binding.js";
import { hasCode, type ApiFailure, type CloudApi } from "./client.js";
import { REMOTE, isLocalOrigin, type Collision } from "./doc.js";
import { codeText, explainFailure, explainRefusal, type CloudWords } from "./explain.js";
import type { CloudDatabase, ProjectStore, StoredDoc } from "./persistence.js";
import { Presence, pageOf } from "./presence.js";
import {
  RoomConnection,
  type RoomHello,
  type RoomPhase,
  type SocketFactory,
  type Stop,
} from "./room.js";
import { connectionStatus, sameStatus, type ConnectionStatus } from "./status.js";

/** How long a project with no copy in this browser waits for the room's first answer. */
export const FIRST_ANSWER_MS = 10_000;
/** "Saving…" lasts this long after the person's last change was sent. */
export const SAVED_AFTER_MS = 1500;
/** A connection that stayed open this long after the person's last change delivered it. */
export const CONFIRM_AFTER_MS = 4000;
/** The document is written to this browser this long after the room's last change. */
export const SNAPSHOT_AFTER_MS = 5000;
/**
 * The most the person's changes wait for the service to answer a removed image or font (see
 * `removeBinary`): a slow answer never holds the person's work back longer than this.
 */
export const DELETE_HOLD_MS = 3000;
/** The most the page offers the room in one message: below the room's own limit. */
export const RESEND_LIMIT = CLOUD_LIMITS.message - 1024;

/** The origin of an update that came from this browser's own copy. */
const PERSISTED = Symbol("meltemi.persisted");

/** A call to the service that failed, thrown inside the binding's transfers so that it can word it. */
export class CallFailed extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.code ?? `The service answered ${failure.status}.`);
    this.name = "CallFailed";
  }
}

/** What an open project needs from the page. */
export interface ProjectDeps {
  readonly studio: Studio;
  readonly api: CloudApi;
  /** This browser's database; unavailable where IndexedDB is. */
  readonly database: CloudDatabase;
  readonly socket: SocketFactory;
  /**
   * The room's address, read at every attempt: a guest's name or a live session's token is in it,
   * and a guest who renames themselves reconnects with the new one.
   */
  readonly address: string | (() => string);
  readonly timers: Timers;
  /** Whether the browser says it is online. */
  readonly online: () => boolean;
  /** The code pane's selection in the open file. */
  readonly selection: () => Selection | undefined;
  /** The file the person had open in this project in this browser, if any. */
  readonly lastOpen: () => string | undefined;
  readonly words: () => CloudWords;
  /** A message for the status line. */
  readonly report: (message: string) => void;
  /** The connection's status changed. */
  readonly status: (status: ConnectionStatus) => void;
  /** Random bytes for file ids (tests make them deterministic). */
  readonly random?: (length: number) => Uint8Array;
  readonly sendInterval?: number;
  /** The page's clock in milliseconds, for presence (`Date.now` unless a test turns it by hand). */
  readonly now?: () => number;
  /**
   * The person is a viewer of the project (`project-sharing`): it connects as one, receives the
   * room's changes and sends none (the binding and the socket both refuse to), and keeps no copy
   * in this browser (a project someone may stop sharing is not left behind).
   */
  readonly readOnly?: boolean;
  /**
   * The person has no account (`live-sessions`): the project is kept nowhere in this browser, as a
   * viewer's is, though a guest of a session that lets guests edit writes through the room.
   */
  readonly keepsNothing?: boolean;
  /** The room said hello: who this connection is, and the live session that admitted it, if any. */
  readonly helloed?: (hello: RoomHello) => void;
  /**
   * The room stopped the connection for good: the live session that admitted it ended
   * (`session.ended`), or this network holds as many connections without an account as it may
   * (`connections.limit`). Nothing reconnects until `rejoin`.
   */
  readonly stopped?: (reason: Stop) => void;
  /**
   * The room said hello with a role that differs from the one the project was opened with (a
   * viewer was promoted, an editor demoted while the page was away). The caller opens the project
   * again in the mode the role gives; this project goes on until it is closed.
   */
  readonly roleChanged?: (role: string) => void;
  /** The room refused something with `access.denied` (4403): the person's role may have changed. */
  readonly accessDenied?: () => void;
}

export type PrepareResult =
  | { readonly ok: true; readonly project: CloudProject }
  /**
   * `full`: the room turned the page away because it holds as many people as it may; `stopped`: it
   * stopped the connection for a reason a retry would meet again; neither: no answer in time.
   */
  | { readonly ok: false; readonly full?: true; readonly stopped?: Stop };

/**
 * Codes of a refusal that is not about the person's change: the page keeps its document. A room
 * that is full turns the page away; one that answers `awareness.rate` closed a socket that sent
 * too many presence states, which says nothing of the text.
 */
const KEEPS_DOCUMENT = new Set(["room.full", "awareness.rate"]);

/** What a viewer's project keeps in this browser: nothing. */
const NO_STORE: ProjectStore = {
  available: false,
  load: () => Promise.resolve(undefined),
  append: () => undefined,
  compact: () => Promise.resolve(),
  flush: () => Promise.resolve(),
};

export class CloudProject {
  private doc = new Y.Doc();
  private binding: Binding | undefined;
  private readonly store: ProjectStore;
  private connection!: RoomConnection;
  /** Whether the person's changes may not be in the room yet. */
  private dirty = false;
  /** The person's updates since the last hello: offered again at the next one. */
  private outbox: Uint8Array[] = [];
  /** Which binding's updates are live: a refused document's are not sent or kept. */
  private generation = 0;
  /** After a refusal: the document that takes the room's state, and then replaces the old one. */
  private recovering: Y.Doc | undefined;
  private saving = false;
  private everOpen = false;
  /** The project was deleted (from another device): nothing will connect again. */
  private vanished = false;
  /** The person can no longer write here: this browser's copy was dropped and is never written again. */
  private forgotten = false;
  private phase: Exclude<RoomPhase, "idle"> = "connecting";
  private shown: ConnectionStatus | undefined;
  private closed = false;
  /** Whether the document came from this browser's copy. */
  private restored = false;
  private answeredFirst: (() => void) | undefined;
  /** Ends the wait for the room's first answer without one (the room is full). */
  private refusedFirst: (() => void) | undefined;
  private savedTimer: unknown;
  private confirmTimer: unknown;
  private snapshotTimer: unknown;
  private listener: { doc: Y.Doc; run: (update: Uint8Array, origin: unknown) => void } | undefined;
  /** The calls on one image or font at a time: each waits for the one before it on the same path. */
  private readonly lanes = new Map<string, Promise<void>>();
  /** The removals of images and fonts (`DELETE`) on their way. */
  private readonly deleting = new Set<Promise<void>>();
  /** The person's changes that wait for those removals, in order. */
  private held: Uint8Array[] = [];
  private holdTimer: unknown;

  /** A viewer: nothing of this page's reaches the room, and nothing is kept in this browser. */
  private readonly viewer: boolean;
  /** The room refused the last socket because it holds as many people as it may (`room.full`). */
  private roomFull = false;
  /** Why the room stopped the connection for good, until the page rejoins. */
  private stopReason: Stop | undefined;
  /** A room that cannot be reached is given up before the first answer's wait is over. */
  private quick = false;
  /** A person without an account: nothing of the project is kept in this browser. */
  private readonly keepsNothing: boolean;
  /**
   * Who else is in the project and where (`live-collaboration`). It lives as long as the project
   * does; the page gives it the person's file, caret and canvas selection (`presence.attach`).
   */
  readonly presence: Presence;

  private constructor(
    readonly id: string,
    private readonly deps: ProjectDeps,
  ) {
    this.viewer = deps.readOnly === true;
    this.keepsNothing = deps.keepsNothing === true;
    this.presence = new Presence({
      doc: () => this.doc,
      timers: deps.timers,
      now: deps.now ?? (() => Date.now()),
      page: pageOf(typeof deps.address === "function" ? deps.address() : deps.address),
      send: (payload) => this.connection.sendAwareness(payload),
    });
    this.store =
      this.viewer || this.keepsNothing
        ? NO_STORE
        : deps.database.project(
            id,
            { snapshot: () => Y.encodeStateAsUpdate(this.doc), unsynced: () => this.dirty },
            () => {
              // The browser stopped keeping the project: say so (before it is open, `attach` does).
              if (this.binding && !this.closed) deps.report(deps.words().status.notKept);
              this.refresh();
            },
          );
  }

  /**
   * Gets a project ready: loads this browser's copy, connects to the room, and, when there is no
   * copy, waits for the room's first answer (or gives up after `FIRST_ANSWER_MS`). With `quick`, a
   * room that cannot even be reached (two sockets in a row that failed before any answer) is given
   * up at once: an anonymous visitor has the snapshot to read instead. The Studio is not touched;
   * `attach()` does that.
   */
  static async prepare(
    id: string,
    deps: ProjectDeps,
    options: { needsCopy?: boolean; quick?: boolean } = {},
  ): Promise<PrepareResult> {
    const project = new CloudProject(id, deps);
    project.quick = options.quick === true;
    const stored = await project.store.load();
    const restored = stored !== undefined && project.restore(stored);
    // With the service out of reach, only this browser's copy can open the project.
    if (!restored && options.needsCopy) return { ok: false };
    project.begin();
    if (!restored && !(await project.firstAnswer())) {
      // A room that is full, or that stopped the connection, says so at once: there is nothing to
      // wait ten seconds for.
      const full = project.roomFull;
      const stopped = project.stopReason;
      project.close();
      if (stopped) return { ok: false, stopped };
      return full ? { ok: false, full: true } : { ok: false };
    }
    return { ok: true, project };
  }

  /** The connection's status now. */
  get status(): ConnectionStatus | undefined {
    return this.shown;
  }

  /** Binds the Studio to the document: the project's files replace the Studio's, and edits go both ways. */
  attach(): void {
    if (this.closed || this.binding) return;
    this.bind(this.doc, this.deps.lastOpen());
    this.watch(this.doc);
    // A project that came from the room, not from this browser, is kept at once.
    if (!this.restored) this.keep();
    // A viewer and a guest keep nothing on purpose: there is nothing to say about it.
    if (!this.store.available && !this.viewer && !this.keepsNothing) {
      this.deps.report(this.deps.words().status.notKept);
    }
    this.refresh();
  }

  /** The browser came online or went offline, or the page came back to the front. */
  network(): void {
    this.refresh();
    if (this.deps.online()) this.connection.retryNow();
    // A page that was in the background may have been silent: the room hears from it again.
    this.presence.resend();
  }

  /** Forgets what the person could undo or redo: a restored version replaced the files. */
  clearUndo(): void {
    this.binding?.clearUndo();
  }

  /**
   * Connects again after the room stopped the connection (the address may say something else now: a
   * live session's token dropped, another name), or reconnects at once with the new address.
   */
  rejoin(): void {
    if (this.closed) return;
    this.stopReason = undefined;
    if (this.connection.phase === "idle") this.connection.connect();
    else this.connection.reopen();
    this.refresh();
  }

  /** Sends what is waiting and keeps the document in this browser now, as the page is left. */
  flush(): void {
    this.binding?.flush();
    // The page may be gone in a moment: what waits for a removed image's answer goes now.
    this.release();
    if (!this.closed) this.keep();
  }

  /** Resolves when everything handed to this browser's database is written. */
  settled(): Promise<void> {
    return this.store.flush();
  }

  /**
   * The person lost the right to write here (a demoted editor): what they made and the room never
   * got can no longer reach it, and a viewer keeps nothing in this browser. The copy goes, the
   * changes in it with it, and nothing writes it again; whoever reopens the project as the
   * viewer's closes this one right after. Left in place, those changes would be offered to the
   * room whenever someone with the right to write opened the project in this browser.
   */
  forgetCopy(): void {
    if (this.closed || this.forgotten || this.viewer) return;
    this.forgotten = true;
    this.dirty = false;
    this.outbox = [];
    this.dropHeld();
    for (const timer of [this.confirmTimer, this.snapshotTimer]) this.deps.timers.clear(timer);
    // After what the store already holds in its queue, or that would write the copy again.
    void this.store.flush().then(() => this.deps.database.forget(this.id));
  }

  /** Unbinds the Studio, closes the socket and keeps the document in this browser. */
  close(): void {
    if (this.closed) return;
    // The binding sends what waits as it goes, while the socket is still open.
    this.binding?.destroy();
    this.binding = undefined;
    this.release();
    this.closed = true;
    this.generation++;
    for (const timer of [this.savedTimer, this.confirmTimer, this.snapshotTimer]) {
      this.deps.timers.clear(timer);
    }
    this.unwatch();
    this.presence.destroy();
    this.connection.close();
    this.answeredFirst?.();
    // The copy of a deleted project is of no use to anyone: it goes with the page's hold on it.
    if (this.vanished) void this.deps.database.forget(this.id);
    else this.keep();
  }

  // This browser's copy -----------------------------------------------------------------------

  /** Puts what was kept in the document; false when it cannot be read (the room's copy is used). */
  private restore(stored: StoredDoc): boolean {
    try {
      const doc = new Y.Doc();
      if (stored.state) Y.applyUpdate(doc, stored.state, PERSISTED);
      for (const update of stored.updates) Y.applyUpdate(doc, update, PERSISTED);
      this.doc = doc;
    } catch {
      return false;
    }
    this.dirty = stored.unsynced;
    this.restored = true;
    // Open folds what was kept into the document, for the next time.
    if (stored.updates.length > 0) this.keep();
    return true;
  }

  /**
   * Writes the document to this browser, folding its updates in, unless the document is still empty:
   * a project the room never answered has no copy, and an empty one would open with no files.
   * (`swap` writes without this check: it replaces the refused copy with the room's.)
   */
  private keep(): void {
    // Nor while the room's state is coming back after a refusal: this document is the refused one.
    // Nor for a project that was deleted: there is nothing left for the copy to sync with.
    // Nor once the person cannot write here: this browser keeps nothing of it (`forgetCopy`).
    if (this.vanished || this.forgotten || this.recovering) return;
    if (Y.encodeStateVector(this.doc).byteLength <= 1) return;
    void this.store.compact();
  }

  /** Writes the document to this browser a moment after the room changed it. */
  private watch(doc: Y.Doc): void {
    this.unwatch();
    const run = (_update: Uint8Array, origin: unknown) => {
      if (doc !== this.doc || origin === PERSISTED || isLocalOrigin(origin)) return;
      this.deps.timers.clear(this.snapshotTimer);
      this.snapshotTimer = this.deps.timers.set(() => {
        this.snapshotTimer = undefined;
        if (!this.closed) this.keep();
      }, SNAPSHOT_AFTER_MS);
    };
    doc.on("update", run);
    this.listener = { doc, run };
  }

  private unwatch(): void {
    if (this.listener) this.listener.doc.off("update", this.listener.run);
    this.listener = undefined;
  }

  // The room -----------------------------------------------------------------------------------

  private begin(): void {
    this.connection = new RoomConnection({
      url: this.deps.address,
      socket: this.deps.socket,
      timers: this.deps.timers,
      stateVector: () => Y.encodeStateVector(this.recovering ?? this.doc),
      readOnly: this.viewer,
      events: {
        update: (update) => this.fromRoom(update),
        opened: (hello) => this.opened(hello),
        sync: (vector) => this.roomAsks(vector),
        error: (code) => this.refuse(code),
        refused: (refusal) => this.refuse(refusal.code),
        gone: () => this.gone(),
        stopped: (reason) => this.stoppedBy(reason),
        dropped: (closes) => this.dropped(closes),
        phase: (phase) => {
          this.presence.phase(phase);
          if (phase !== "idle") this.phase = phase;
          this.refresh();
        },
        awareness: (payload) => this.presence.receive(payload),
      },
    });
    this.connection.connect();
    this.refresh();
  }

  /** Waits for the room's first answer; false when it does not come. */
  private firstAnswer(): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = this.deps.timers.set(() => resolve(false), FIRST_ANSWER_MS);
      this.answeredFirst = () => {
        this.deps.timers.clear(timer);
        resolve(true);
      };
      // The room turned the page away: no answer will come.
      this.refusedFirst = () => {
        this.deps.timers.clear(timer);
        resolve(false);
      };
    });
  }

  /** The room said hello: what the page may have made while it was away goes to it now. */
  private opened(hello: RoomHello): void {
    this.everOpen = true;
    this.roomFull = false;
    this.stopReason = undefined;
    this.deps.helloed?.(hello);
    if (this.closed) return;
    // Who this connection is, and where the person is, goes to the room with the first thing it hears.
    this.presence.opened(hello.you);
    // The room's word on the role is the last one: a page opened as a viewer that is told it can
    // write (or the other way round) is opened again by whoever knows how to.
    const viewing = hello.role === "viewer";
    if (hello.role !== undefined && viewing !== this.viewer) {
      this.deps.roleChanged?.(hello.role);
      if (this.closed) return;
    }
    if (!this.recovering && this.dirty && !viewing) {
      this.resend();
      this.markSaving();
      this.confirmLater();
    }
    this.refresh();
  }

  /**
   * Offers the room everything the person made that it may not have: the whole document when it
   * fits in a message, else the changes made since the last hello. The room keeps what it lacks.
   */
  private resend(): void {
    let payload: Uint8Array | undefined;
    const whole = Y.encodeStateAsUpdate(this.doc);
    if (whole.byteLength <= RESEND_LIMIT) payload = whole;
    else if (this.outbox.length > 0) {
      const merged = Y.mergeUpdates(this.outbox);
      if (merged.byteLength <= RESEND_LIMIT) payload = merged;
    }
    this.outbox = [];
    if (payload) this.connection.send(payload);
  }

  /** The room asked for what it lacks, with its state vector. */
  private roomAsks(vector: Uint8Array): void {
    if (this.recovering) return;
    let update: Uint8Array;
    try {
      update = Y.encodeStateAsUpdate(this.doc, vector);
    } catch {
      // A vector the page cannot read: the room's own sync of the page's vector covers the rest.
      return;
    }
    if (update.byteLength <= RESEND_LIMIT) this.connection.send(update);
    else if (this.dirty) this.tooLarge();
  }

  /**
   * What the person made while the room was out of reach is more than one message can carry (a big
   * paste or import made offline), and what they make after it depends on it: the room can never
   * take it. The page does what it does when the room refuses a change, the same words included:
   * it says so, and goes back to the room's state, which a new socket brings with the empty
   * vector of the new document. Marking the change saved would leave every later edit invisible.
   */
  private tooLarge(): void {
    this.refuse("message.too-large");
    this.connection.reopen();
  }

  /** An update of the room's: the Studio hears it through the binding; the first one opens the project. */
  private fromRoom(update: Uint8Array): void {
    if (this.closed) return;
    try {
      if (this.recovering) {
        Y.applyUpdate(this.recovering, update, REMOTE);
        this.swap();
      } else if (this.binding) this.binding.apply(update, REMOTE);
      else Y.applyUpdate(this.doc, update, REMOTE);
    } catch {
      this.deps.report(this.deps.words().project.internal);
    }
    this.answeredFirst?.();
    this.answeredFirst = undefined;
    this.refusedFirst = undefined;
  }

  // Refusals ---------------------------------------------------------------------------------

  /**
   * The room closed because its project was deleted (from another device): the connection has
   * stopped for good. The page says so and keeps what it has; it never writes this browser's copy
   * again, for the project it belongs to no longer exists.
   */
  private gone(): void {
    if (this.closed || this.vanished) return;
    this.vanished = true;
    this.recovering = undefined;
    this.dirty = false;
    this.outbox = [];
    this.dropHeld();
    for (const timer of [this.confirmTimer, this.snapshotTimer]) this.deps.timers.clear(timer);
    this.deps.report(this.deps.words().project.gone);
    this.refresh();
  }

  /**
   * The room stopped the connection for good (`session.ended`, `connections.limit`): the page says
   * nothing itself (whoever opened the project knows what comes next) and does not reconnect. What
   * the person typed and the room never got is not offered again by this connection.
   */
  private stoppedBy(reason: Stop): void {
    if (this.closed) return;
    this.stopReason = reason;
    this.refusedFirst?.();
    this.refusedFirst = undefined;
    this.refresh();
    this.deps.stopped?.(reason);
  }

  /**
   * A socket ended without a refusal. A project deleted while the page was away is refused at the
   * upgrade, and the browser says only that the socket failed: after the second close in a row, and
   * at every doubling after it, the page asks the service whether the project is still there.
   */
  private dropped(closes: number): void {
    // Not reached twice before any answer: the caller has somewhere else to go (`quick`).
    if (this.quick && !this.everOpen && closes >= 2 && this.refusedFirst) {
      this.refusedFirst();
      this.refusedFirst = undefined;
      return;
    }
    if (this.vanished || closes < 2 || (closes & (closes - 1)) !== 0) return;
    void this.askIfGone();
  }

  private async askIfGone(): Promise<void> {
    let answer: Awaited<ReturnType<CloudApi["get"]>>;
    try {
      answer = await this.deps.api.get(this.id);
    } catch {
      return;
    }
    if (this.closed || this.vanished || answer.ok) return;
    const failure = answer.failure;
    if (failure.status === 404 || hasCode(failure, "project.not-found")) {
      this.connection.close();
      this.gone();
    }
  }

  /**
   * The room refused something the page sent. The change is shown in the status line; the text
   * goes back to the room's state: updates stop, the room's state arrives in a new document at the
   * next hello, and the Studio is bound to that one.
   */
  private refuse(code: string): void {
    if (this.closed) return;
    // The person's role may have changed: whoever opened the project looks it up.
    if (code === "access.denied") this.deps.accessDenied?.();
    if (this.closed) return;
    const words = this.deps.words();
    if (KEEPS_DOCUMENT.has(code)) {
      // A room that is full is not a document that was refused: the status line says so, with the
      // page's offer to try again, and the connection keeps retrying by itself.
      this.roomFull = code === "room.full";
      this.deps.report(codeText(code, words.errors) ?? words.errors.other(code));
      this.refresh();
      this.refusedFirst?.();
      this.refusedFirst = undefined;
      return;
    }
    if (this.recovering) return;
    this.deps.report(explainRefusal(code, words));
    this.generation++;
    this.recovering = new Y.Doc();
    this.dirty = false;
    this.outbox = [];
    // What waited belonged to the document the room refused.
    this.dropHeld();
    this.deps.timers.clear(this.confirmTimer);
    this.deps.timers.clear(this.snapshotTimer);
  }

  /** The room's state has arrived in the new document: bind the Studio to it, drop the old one. */
  private swap(): void {
    const fresh = this.recovering;
    if (!fresh) return;
    this.recovering = undefined;
    if (this.binding) {
      const open = this.deps.studio.open;
      this.binding.destroy();
      this.doc = fresh;
      this.bind(fresh, open);
      this.watch(fresh);
    } else this.doc = fresh;
    this.dirty = false;
    this.outbox = [];
    // This browser's copy was the refused one: replace it with the room's.
    if (!this.forgotten) void this.store.compact();
  }

  // The binding -------------------------------------------------------------------------------

  private bind(doc: Y.Doc, open: string | undefined): void {
    const generation = ++this.generation;
    this.binding = createBinding({
      doc,
      studio: this.deps.studio,
      timers: this.deps.timers,
      send: (update) => this.outgoing(generation, update),
      onLocalUpdate: (update) => this.localUpdate(generation, update),
      selection: this.deps.selection,
      fetchBlob: (hash) => this.fetchBlob(hash),
      uploadBinary: (path, bytes) => this.uploadBinary(path, bytes),
      removeBinary: (path) => this.removeBinary(path),
      onCollisions: (collisions) => this.collisions(collisions),
      onError: (error) => this.bindingError(error),
      readOnly: this.viewer,
      ...(open ? { open } : {}),
      ...(this.deps.random ? { random: this.deps.random } : {}),
      ...(this.deps.sendInterval !== undefined ? { sendInterval: this.deps.sendInterval } : {}),
    });
  }

  /** The person made a change: it is kept in this browser, and not yet known to be in the room. */
  private localUpdate(generation: number, update: Uint8Array): void {
    if (generation !== this.generation || this.closed || this.vanished || this.forgotten) return;
    this.dirty = true;
    this.store.append(update);
    this.markSaving();
  }

  /** The person's changes, merged, leave. While the socket is down they wait for the next hello. */
  private outgoing(generation: number, update: Uint8Array): void {
    if (generation !== this.generation || this.closed) return;
    // The change that removes an image from the document waits a moment for the service's answer
    // about its bytes (see `removeBinary`), and what comes after it waits behind it.
    if (this.held.length > 0 || (this.deleting.size > 0 && this.connection.open)) {
      this.held.push(update);
      this.holdTimer ??= this.deps.timers.set(() => {
        // Out of patience: nothing after this waits for a removal that is still unanswered.
        this.deleting.clear();
        this.release();
      }, DELETE_HOLD_MS);
      this.markSaving();
      return;
    }
    this.transmit(update);
  }

  private transmit(update: Uint8Array): void {
    this.outbox.push(update);
    if (this.outbox.length > 32) this.outbox = [Y.mergeUpdates(this.outbox)];
    this.connection.send(update);
    this.markSaving();
    this.confirmLater();
  }

  /** Sends what waited for a removed image's answer, now. */
  private release(): void {
    this.deps.timers.clear(this.holdTimer);
    this.holdTimer = undefined;
    const held = this.held;
    this.held = [];
    if (held.length === 0 || this.closed || this.recovering) return;
    this.transmit(held.length === 1 ? held[0]! : Y.mergeUpdates(held));
  }

  /** Forgets what waited: it belonged to a document that is no longer the page's. */
  private dropHeld(): void {
    this.deps.timers.clear(this.holdTimer);
    this.holdTimer = undefined;
    this.held = [];
  }

  /** "Saving…" until a moment after the last change was sent. */
  private markSaving(): void {
    this.saving = true;
    this.deps.timers.clear(this.savedTimer);
    this.savedTimer = this.deps.timers.set(() => {
      this.savedTimer = undefined;
      this.saving = false;
      this.refresh();
    }, SAVED_AFTER_MS);
    this.refresh();
  }

  /** After a quiet while on an open socket the room has the changes: nothing is owed to it. */
  private confirmLater(): void {
    this.deps.timers.clear(this.confirmTimer);
    this.confirmTimer = this.deps.timers.set(() => {
      this.confirmTimer = undefined;
      if (this.closed || this.recovering || !this.connection.open || !this.dirty) return;
      this.dirty = false;
      this.outbox = [];
      this.keep();
    }, CONFIRM_AFTER_MS);
  }

  private async fetchBlob(hash: string): Promise<Uint8Array> {
    const outcome = await this.deps.api.blob(this.id, hash);
    if (!outcome.ok) throw new CallFailed(outcome.failure);
    return outcome.value;
  }

  private async uploadBinary(path: string, bytes: Uint8Array): Promise<void> {
    // An image or a font is stored in an account: a guest has none to store it in.
    if (this.keepsNothing) {
      throw new CallFailed({ kind: "refused", status: 401, code: "account.required" });
    }
    if (bytes.byteLength > CLOUD_LIMITS.binaryBytes) {
      throw new CallFailed({ kind: "refused", status: 413, code: "quota.binary" });
    }
    const outcome = await this.inLane(path, () => this.deps.api.uploadBinary(this.id, path, bytes));
    if (!outcome.ok) throw new CallFailed(outcome.failure);
  }

  /**
   * The person removed an image or a font: the service is asked to drop it (`DELETE …/binaries/<path>`),
   * which takes its bytes out of the account's usage unless another file of the project (or, for the
   * bytes themselves, a version) still uses them. It works only while the file is still in the room,
   * so it goes first, and the change that removes the file from the document waits for the answer
   * (at most `DELETE_HOLD_MS`; an offline page sends nothing, so it waits for nothing). When it fails
   * the page says nothing: the image is gone from the project either way, and the bytes stay counted
   * until the project is deleted. Nothing calls this for a remote removal, which the page that made
   * it reports itself, nor for a rename.
   */
  private removeBinary(path: string): void {
    const task = this.inLane(path, () => this.deleteBinary(path));
    this.deleting.add(task);
    void task.then(() => {
      this.deleting.delete(task);
      if (this.deleting.size === 0) this.release();
    });
  }

  /** The call, made once more when it failed for a reason that passes: no answer, or the service in trouble. */
  private async deleteBinary(path: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let outcome: Awaited<ReturnType<CloudApi["deleteBinary"]>>;
      try {
        outcome = await this.deps.api.deleteBinary(this.id, path);
      } catch {
        return;
      }
      const failure = outcome.ok ? undefined : outcome.failure;
      const passing = failure?.kind === "unreachable" || (failure?.status ?? 0) >= 500;
      if (!passing || this.closed || this.vanished) return;
    }
  }

  /** Runs a call on an image or a font once the calls before it on the same path are over. */
  private inLane<T>(path: string, call: () => Promise<T>): Promise<T> {
    const before = this.lanes.get(path) ?? Promise.resolve();
    const run = before.then(call);
    // What the next call on the path waits for never fails, whatever this one does.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.lanes.set(path, tail);
    void tail.then(() => {
      if (this.lanes.get(path) === tail) this.lanes.delete(path);
    });
    return run;
  }

  private collisions(collisions: readonly Collision[]): void {
    if (collisions.length === 0) return;
    this.deps.report(this.deps.words().project.collisions(collisions.map((c) => c.shown)));
  }

  private bindingError(error: BindingError): void {
    const words = this.deps.words();
    const path = error.path ?? "";
    switch (error.code) {
      case "path.invalid":
        this.deps.report(words.project.pathInvalid(path));
        break;
      case "binary.unsupported":
        this.deps.report(words.project.binaryUnsupported(path));
        break;
      case "binary.upload": {
        if (error.cause instanceof CallFailed && error.cause.failure.code === "account.required") {
          this.deps.report(words.live.needsAccount.images);
          break;
        }
        const reason =
          error.cause instanceof CallFailed
            ? explainFailure(error.cause.failure, words.errors)
            : words.errors.unreachable;
        this.deps.report(words.project.binaryUpload(path, reason));
        break;
      }
      case "binary.fetch":
        this.deps.report(words.project.binaryFetch(path));
        break;
      default:
        this.deps.report(words.project.internal);
    }
  }

  // Status --------------------------------------------------------------------------------------

  private refresh(): void {
    if (this.closed) return;
    const status = connectionStatus({
      socket: this.phase,
      everOpen: this.everOpen,
      online: this.deps.online(),
      saving: this.saving,
      // A viewer and a guest have nothing to keep: the status never says the browser keeps no copy.
      kept: this.store.available || this.viewer || this.keepsNothing,
      gone: this.vanished,
      full: this.roomFull,
      ...(this.stopReason ? { stopped: this.stopReason } : {}),
    });
    if (sameStatus(status, this.shown)) return;
    this.shown = status;
    this.deps.status(status);
  }
}
