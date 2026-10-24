// Presence in an open cloud project (`live-collaboration`, "Presence"): what this page tells the
// room about the person (the file they have open, where the caret or selection is in it, what is
// selected on the canvas, where the pointer is over it) and what the room tells it about the others. Nothing here touches a DOM, a
// socket or a clock of its own: the connection, the timers and the page's own state are handed in,
// so a test plays all of them. Nothing of presence is saved, exported or written to this browser.
//
// The page sends its state when it changes, at most four times a second, and again every fifteen
// seconds as a heartbeat so that the room keeps it; it never sends who the person is (the room
// knows, and says it on everything it relays). When the socket is not open there are no peers: the
// room tells the page about everyone again when the connection returns, and the page tells the
// room about itself.

import { presenceColour } from "@meltemi/diagrams-project";
import type * as Y from "yjs";
import type { Timers } from "./binding.js";
import { cloudDoc, resolveFiles, type DocFile } from "./doc.js";
import {
  PeerBook,
  canvasPeople,
  drawnCarets,
  whoIsHere,
  type CanvasPerson,
  type DrawnCaret,
  type Peer,
  type Person,
} from "./presence-model.js";
import {
  MAX_ID_LENGTH,
  MAX_LASER_MS,
  MAX_LASER_POINTS,
  MAX_SELECTED,
  decodeAwareness,
  encodeCaret,
  encodeLocal,
  type LaserPoint,
  type LocalState,
  type PointerPosition,
} from "./presence-wire.js";
import type { RoomPhase } from "./room.js";

/** The most bytes of canvas ids one state carries: the room closes a client whose message tops 16 KiB. */
const SELECTION_BYTES = 12_000;

/** The state leaves at most this often, in milliseconds. */
export const THROTTLE_MS = 250;
/** The state is sent again after this long without a send, so that the room keeps it. */
export const HEARTBEAT_MS = 15_000;
/** A pointer that has not moved for this long leaves the state (the others stop drawing it). */
export const POINTER_IDLE_MS = 3_000;
/**
 * A peer the room has not spoken of for this long is forgotten. The room takes a silent client out
 * after thirty seconds and says so; this is only for a page that never heard it say so.
 */
export const PEER_TIMEOUT_MS = 45_000;

/** The code pane's selection in the open file; `backward` when the caret is at its start. */
export interface PaneSelection {
  readonly start: number;
  readonly end: number;
  readonly backward?: boolean;
}

/** What the page tells presence about the person. */
export interface PresenceSource {
  /** The path of the file open in the Studio. */
  open(): string;
  selection(): PaneSelection | undefined;
  /** The ids selected on the canvas. */
  canvas(): readonly string[];
}

/**
 * What presence reads of the page: the file the Studio has open, and the ids its canvas session
 * has selected in that file (the canvas reports every selection to the session, and the session
 * keeps it); `selection` is the code pane's.
 */
export function studioSource(
  studio: { readonly open: string; readonly session: { readonly selected: readonly string[] } },
  selection: () => PaneSelection | undefined,
): PresenceSource {
  return {
    open: () => studio.open,
    selection,
    // No file open has no canvas: asking the Studio's session would make one for nothing.
    canvas: () => (studio.open === "" ? [] : studio.session.selected),
  };
}

/**
 * The ids to publish of a canvas selection: as many as fit the room's cap on a message (16 KiB,
 * and a message over it closes the socket), none empty or absurdly long, and no more than the room
 * is told of.
 */
export function fitSelection(selected: readonly string[]): string[] {
  const ids: string[] = [];
  let room = SELECTION_BYTES;
  for (const id of selected) {
    if (ids.length >= MAX_SELECTED) break;
    if (id === "" || id.length > MAX_ID_LENGTH) continue;
    // The id as JSON takes its bytes in UTF-8, its quotes and a comma.
    room -= new TextEncoder().encode(id).byteLength + 3;
    if (room < 0) break;
    ids.push(id);
  }
  return ids;
}

export interface PresenceOptions {
  /** The project's document now (it is another one after the room refused a change). */
  readonly doc: () => Y.Doc;
  readonly timers: Timers;
  /** The page's clock, in milliseconds. */
  readonly now: () => number;
  /** The page's address, for the rule an avatar's address must pass. */
  readonly page: string;
  /** Sends a kind 2 payload; false when the connection cannot carry it now. */
  readonly send: (payload: Uint8Array) => boolean;
}

/** What the room's hello says about this connection: `{ id, sub, ... }`. */
function whoYouAre(you: unknown): { id: string | undefined; sub: string | undefined } {
  if (you === null || typeof you !== "object") return { id: undefined, sub: undefined };
  const { id, sub } = you as { id?: unknown; sub?: unknown };
  return {
    id: typeof id === "string" && id !== "" ? id : undefined,
    sub: typeof sub === "string" && sub !== "" ? sub : undefined,
  };
}

export class Presence {
  private readonly book: PeerBook;
  private readonly listeners = new Set<() => void>();
  private source: PresenceSource | undefined;
  /** Whether the room's socket is open: nothing is sent before, and there are no peers after. */
  private open = false;
  private clientId = "self";
  private ownSub: string | undefined;
  /** What the person's inputs were when the state was last looked at, to skip what did not move. */
  private lastInputs: string | undefined;
  /** The state last sent, as text: the same state is only sent again as a heartbeat. */
  private lastSent: string | undefined;
  /** Whether the person moved since the last send. */
  private dirty = false;
  /** Whether a send happened less than `THROTTLE_MS` ago: moves wait for the window to end. */
  private windowOpen = false;
  private windowTimer: unknown;
  private heartbeatTimer: unknown;
  private sweepTimer: unknown;
  private destroyed = false;
  /** Where the person's pointer is over the canvas, while it moves there. */
  private pointerAt: PointerPosition | undefined;
  private pointerTimer: unknown;
  /**
   * The points of the Pointer trail not yet sent: the most recent 64, `t` since the first. A state
   * carries them once and clears them; a heartbeat never carries one.
   */
  private laserPoints: LaserPoint[] = [];
  /** When the first of `laserPoints` was made, by the page's clock, and the diagram it is on. */
  private laserFirst = 0;
  private laserDiagram: string | undefined;
  /** How many batches the person made: a batch is a change of the state. */
  private laserCount = 0;

  constructor(private readonly options: PresenceOptions) {
    this.book = new PeerBook(options.page);
  }

  // The person ---------------------------------------------------------------------------------

  /** Starts publishing what the page says about the person (the file open, the caret, the canvas). */
  attach(source: PresenceSource): void {
    if (this.destroyed) return;
    this.source = source;
    this.lastInputs = undefined;
    this.moved();
  }

  /** The person's file, caret, selection or canvas selection may have changed. */
  moved(): void {
    const source = this.source;
    if (!source || this.destroyed) return;
    const inputs = this.inputs(source);
    if (inputs === this.lastInputs) return;
    this.lastInputs = inputs;
    this.dirty = true;
    // A burst of moves waits for the window to end, and then sends the last of them.
    if (this.open && !this.windowOpen) this.publish(false);
  }

  /**
   * The person's pointer moved over the canvas (in diagram units, over `diagram`), or left it
   * (undefined). It goes out with the rest of the state, in the same message and at the same pace,
   * and leaves it three seconds after it stopped moving: a pointer that rests is nobody's business.
   */
  pointer(at: PointerPosition | undefined): void {
    if (this.destroyed) return;
    const { timers } = this.options;
    timers.clear(this.pointerTimer);
    this.pointerTimer = undefined;
    this.pointerAt =
      at && Number.isFinite(at.x) && Number.isFinite(at.y)
        ? {
            x: Math.round(at.x) || 0,
            y: Math.round(at.y) || 0,
            ...(at.diagram !== undefined && at.diagram !== "" ? { diagram: at.diagram } : {}),
          }
        : undefined;
    if (this.pointerAt) {
      this.pointerTimer = timers.set(() => {
        this.pointerTimer = undefined;
        this.pointerAt = undefined;
        this.moved();
      }, POINTER_IDLE_MS);
    }
    this.moved();
  }

  /**
   * The person's Pointer made `points` (diagram units, `t` since the first of them) over `diagram`.
   * They wait with the ones not yet sent, rebased to the first of all, the most recent 64 kept and
   * none older than a second than the newest, and go out with the next state, which they bring
   * forward: a stroke is a change, at the same pace as the rest.
   */
  laser(points: readonly LaserPoint[], diagram?: string): void {
    if (this.destroyed || points.length === 0) return;
    const now = this.options.now();
    const span = Math.max(...points.map((p) => p.t));
    // The batch ended now: its first point was `span` ago.
    const start = now - span;
    if (this.laserPoints.length === 0 || diagram !== this.laserDiagram) {
      this.laserPoints = [];
      this.laserFirst = start;
      this.laserDiagram = diagram;
    }
    for (const p of points) {
      this.laserPoints.push({ x: p.x, y: p.y, t: Math.round(start + p.t - this.laserFirst) });
    }
    if (this.laserPoints.length > MAX_LASER_POINTS) {
      this.laserPoints = this.laserPoints.slice(-MAX_LASER_POINTS);
    }
    // Rebased to the first point kept, and none lasting past `MAX_LASER_MS`.
    const newest = this.laserPoints[this.laserPoints.length - 1]!.t;
    this.laserPoints = this.laserPoints.filter((p) => newest - p.t <= MAX_LASER_MS);
    const base = this.laserPoints[0]!.t;
    this.laserFirst += base;
    this.laserPoints = this.laserPoints.map((p) => ({ x: p.x, y: p.y, t: p.t - base }));
    this.laserCount++;
    this.moved();
  }

  /** The cheapest description of what the state would be made of. */
  private inputs(source: PresenceSource): string {
    const selection = source.selection();
    const caret = selection
      ? `${selection.start},${selection.end},${selection.backward === true ? "b" : "f"}`
      : "-";
    const pointer = this.pointerAt;
    const at = pointer ? `${pointer.x},${pointer.y},${pointer.diagram ?? ""}` : "-";
    return `${source.open()}\n${caret}\n${at}\n${this.laserCount}\n${source.canvas().join("\n")}`;
  }

  /** The state of the person now, in the format of the room; undefined when nothing is attached. */
  private state(): LocalState | undefined {
    const source = this.source;
    if (!source) return undefined;
    const path = source.open();
    const file = this.fileAt(path);
    if (!file) return {};
    let caret: LocalState["caret"];
    const selection = source.selection();
    if (file.kind === "text" && file.text && selection) {
      const forward = selection.backward !== true;
      caret = encodeCaret(
        file.text,
        forward ? selection.start : selection.end,
        forward ? selection.end : selection.start,
      );
    }
    const ids = fitSelection(source.canvas());
    const pointer = this.pointerAt;
    const laser = this.laserPoints.length > 0;
    return {
      file: file.id,
      ...(caret ? { caret } : {}),
      ...(ids.length > 0 || pointer || laser
        ? {
            canvas: {
              selection: ids,
              ...(pointer ? { pointer } : {}),
              ...(laser
                ? {
                    laser: {
                      ...(this.laserDiagram !== undefined ? { diagram: this.laserDiagram } : {}),
                      points: this.laserPoints,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };
  }

  /** Sends the state now. `force` sends it though it is the one the room already has (a heartbeat). */
  private publish(force: boolean): void {
    if (!this.open || this.destroyed) return;
    const state = this.state();
    if (!state) return;
    const text = JSON.stringify(state);
    this.dirty = false;
    // A batch leaves once, in this state or not at all: a stale trail is of no use to anyone.
    this.laserPoints = [];
    if (!force && text === this.lastSent) return;
    if (!this.options.send(encodeLocal(this.clientId, state))) {
      // The socket cannot carry it: the next hello sends it.
      this.dirty = true;
      return;
    }
    this.lastSent = text;
    this.startWindow();
    this.startHeartbeat();
  }

  private startWindow(): void {
    const { timers } = this.options;
    timers.clear(this.windowTimer);
    this.windowOpen = true;
    this.windowTimer = timers.set(() => {
      this.windowTimer = undefined;
      this.windowOpen = false;
      if (this.dirty) this.publish(false);
    }, THROTTLE_MS);
  }

  private startHeartbeat(): void {
    const { timers } = this.options;
    timers.clear(this.heartbeatTimer);
    this.heartbeatTimer = timers.set(() => {
      this.heartbeatTimer = undefined;
      this.publish(true);
    }, HEARTBEAT_MS);
  }

  // The room ---------------------------------------------------------------------------------

  /** The connection's phase changed. Anything but open leaves no peers and sends nothing. */
  phase(phase: RoomPhase): void {
    if (this.destroyed) return;
    if (phase === "open") {
      this.open = true;
      return;
    }
    this.open = false;
    const { timers } = this.options;
    timers.clear(this.windowTimer);
    timers.clear(this.heartbeatTimer);
    this.windowTimer = this.heartbeatTimer = undefined;
    this.windowOpen = false;
    this.laserPoints = [];
    if (this.book.clear()) this.notify();
    this.stopSweep();
  }

  /** The room said hello: who this connection is, and the state goes out whole. */
  opened(you: unknown): void {
    if (this.destroyed) return;
    this.open = true;
    const { id, sub } = whoYouAre(you);
    this.clientId = id ?? "self";
    this.ownSub = sub;
    this.book.setOwn(id);
    // A stroke made while the socket was closed is stale: it is not sent.
    this.laserPoints = [];
    // A room that knows nothing of this connection yet: the state it had is not its state.
    this.lastSent = undefined;
    this.windowOpen = false;
    this.options.timers.clear(this.windowTimer);
    this.windowTimer = undefined;
    this.publish(true);
  }

  /** Sends the state again now (the page came back to the front, say). */
  resend(): void {
    this.publish(true);
  }

  /** A kind 2 payload of the room: the others' states, or their removal. */
  receive(payload: Uint8Array): void {
    if (this.destroyed) return;
    const entries = decodeAwareness(payload);
    if (entries.length === 0) return;
    if (this.book.apply(entries, this.options.now())) this.notify();
    this.sweepLater();
  }

  /** A peer the room never told the page had left would stay for ever: none stays long unheard. */
  private sweepLater(): void {
    if (this.sweepTimer !== undefined || this.book.size === 0) return;
    this.sweepTimer = this.options.timers.set(() => {
      this.sweepTimer = undefined;
      if (this.book.expire(this.options.now(), PEER_TIMEOUT_MS)) this.notify();
      this.sweepLater();
    }, HEARTBEAT_MS);
  }

  private stopSweep(): void {
    this.options.timers.clear(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  /** Stops for good: no timer is left, no listener is called. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    const { timers } = this.options;
    timers.clear(this.windowTimer);
    timers.clear(this.heartbeatTimer);
    timers.clear(this.pointerTimer);
    this.stopSweep();
    this.windowTimer = this.heartbeatTimer = this.pointerTimer = undefined;
    this.pointerAt = undefined;
    this.laserPoints = [];
    this.source = undefined;
    this.book.clear();
    this.listeners.clear();
  }

  // What the page shows -------------------------------------------------------------------------

  /** Hears the others change: someone came, went, moved, or opened another file. */
  listen(run: () => void): () => void {
    this.listeners.add(run);
    return () => this.listeners.delete(run);
  }

  private notify(): void {
    for (const run of [...this.listeners]) run();
  }

  /** The others, as the room last told. */
  get peers(): readonly Peer[] {
    return this.book.list();
  }

  /** The file of the document shown under a path, if any. */
  private fileAt(path: string): DocFile | undefined {
    if (path === "") return undefined;
    for (const file of resolveFiles(cloudDoc(this.options.doc())).files.values()) {
      if (file.shown === path) return file;
    }
    return undefined;
  }

  /**
   * The colour the others see this person in (`presenceColour` of their `sub`, the room's own
   * word), for the Pointer's trail and cursor; undefined until the room has said who this is.
   */
  get colour(): string | undefined {
    return this.ownSub === undefined ? undefined : presenceColour(this.ownSub);
  }

  /** The people of the header: see `whoIsHere`. */
  people(): Person[] {
    const files = resolveFiles(cloudDoc(this.options.doc())).files;
    return whoIsHere(this.book.list(), files, this.ownSub);
  }

  /** The carets to draw in the file shown under `path`, whose text on the pane is `text`. */
  carets(path: string, text: string, fallbackName: string): DrawnCaret[] {
    const file = this.fileAt(path);
    return drawnCarets(
      this.book.list(),
      file?.id,
      this.options.doc(),
      file?.text,
      text.length,
      fallbackName,
    );
  }

  /**
   * The selections and pointers for the canvas of the file shown under `path`, `diagram` being the
   * diagram it shows (a pointer over another diagram of the file is not drawn).
   */
  canvas(path: string, fallbackName: string, diagram?: string): CanvasPerson[] {
    return canvasPeople(this.book.list(), this.fileAt(path)?.id, fallbackName, diagram);
  }
}

/** The page's address for a room's: `wss:` is `https:` and `ws:` is `http:`. */
export function pageOf(address: string): string {
  try {
    const url = new URL(address);
    url.protocol =
      url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
    return url.origin;
  } catch {
    return address;
  }
}
