// Who else is in the open project and what is drawn of them (`live-collaboration`, "Presence"),
// without a DOM or a socket: the peers the room told about, kept as the room told them, and the
// functions that decide, against the document as it is now, who is listed in the header, which
// carets and selections the code pane draws, and what the canvas is told. A person's identity is
// the room's `user` and nothing a peer's own payload says; their colour is computed from `sub`.

import { presenceColour } from "@meltemi/diagrams-project";
import type * as Y from "yjs";
import type { DocFile } from "./doc.js";
import {
  positionIn,
  readState,
  type AwarenessEntry,
  type EncodedCaret,
  type LaserPoint,
  type PointerPosition,
} from "./presence-wire.js";

/** The most peers kept: a room holds twenty, so more could only be a flood of ids. */
export const MAX_PEERS = 64;

/** One client of the room, as the room last told the page. */
export interface Peer {
  /** The room's id for the connection. */
  readonly id: string;
  readonly sub: string;
  /** May be empty. */
  readonly name: string;
  /** An address the avatar may be drawn from, or undefined. */
  readonly picture: string | undefined;
  /** The colour of the person: computed from `sub`, never taken from the message. */
  readonly colour: string;
  /** A person without an account, as the room says (`live-sessions`). */
  readonly guest: boolean;
  /** The id of the file the client has open, if it said. */
  readonly file: string | undefined;
  readonly caret: EncodedCaret | undefined;
  /** The canvas ids the client has selected. */
  readonly selection: readonly string[];
  /** Where the client's pointer is over its canvas, while it moves there. */
  readonly pointer: PointerPosition | undefined;
  /**
   * The client's last Pointer trail batch, with this page's own count of the batches it has
   * received from the client (`seq`): it grows with each, so the canvas draws a batch once.
   */
  readonly laser?: PeerLaser | undefined;
  /** When the caret last moved, or the client appeared, by the page's clock. */
  readonly movedAt: number;
  /** When the room last spoke of the client. */
  readonly heardAt: number;
  /** When the client first appeared: the order of the header. */
  readonly joinedAt: number;
}

/** A peer's last Pointer trail batch, and which of the batches of the peer it is. */
export interface PeerLaser {
  readonly seq: number;
  readonly diagram: string | undefined;
  readonly points: readonly LaserPoint[];
}

const sameCaret = (a: EncodedCaret | undefined, b: EncodedCaret | undefined): boolean =>
  a?.anchor === b?.anchor && a?.head === b?.head;

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const samePointer = (a: PointerPosition | undefined, b: PointerPosition | undefined): boolean =>
  a?.x === b?.x && a?.y === b?.y && a?.diagram === b?.diagram;

/**
 * The peers of the room, by client id. Nothing here is saved or sent anywhere: when the socket
 * drops the book is emptied, because the room tells the page everyone again when it comes back.
 */
export class PeerBook {
  private readonly peers = new Map<string, Peer>();
  private own: string | undefined;

  /** `page` is the page's address, for the rule an avatar's address must pass. */
  constructor(private readonly page: string) {}

  get size(): number {
    return this.peers.size;
  }

  list(): readonly Peer[] {
    return [...this.peers.values()];
  }

  /** The id the room gave this page: the room does not tell it about itself, and nor does anyone. */
  setOwn(id: string | undefined): void {
    this.own = id;
    if (id !== undefined) this.peers.delete(id);
  }

  /**
   * Takes what the room said about its clients. Returns whether anything a view shows changed
   * (a heartbeat that repeats a state changes nothing). Entries that are not states of the
   * format, or name nobody, are ignored; a `null` removes the client.
   */
  apply(entries: readonly AwarenessEntry[], now: number): boolean {
    let changed = false;
    for (const { id, state } of entries) {
      if (id === this.own) continue;
      if (state === null) {
        changed = this.peers.delete(id) || changed;
        continue;
      }
      const read = readState(state, this.page);
      if (!read) continue;
      const before = this.peers.get(id);
      if (!before && this.peers.size >= MAX_PEERS) continue;
      const next: Peer = {
        id,
        sub: read.user.sub,
        name: read.user.name,
        picture: read.user.picture,
        colour: presenceColour(read.user.sub),
        guest: read.user.guest,
        file: read.file,
        caret: read.caret,
        selection: read.selection,
        pointer: read.pointer,
        // A message with a batch is a new batch; one without keeps the last, which the canvas has.
        laser: read.laser
          ? {
              seq: (before?.laser?.seq ?? 0) + 1,
              diagram: read.laser.diagram,
              points: read.laser.points,
            }
          : before?.laser,
        movedAt:
          before && before.file === read.file && sameCaret(before.caret, read.caret)
            ? before.movedAt
            : now,
        heardAt: now,
        joinedAt: before?.joinedAt ?? now,
      };
      this.peers.set(id, next);
      if (
        !before ||
        before.sub !== next.sub ||
        before.name !== next.name ||
        before.picture !== next.picture ||
        before.guest !== next.guest ||
        before.file !== next.file ||
        !sameCaret(before.caret, next.caret) ||
        !sameList(before.selection, next.selection) ||
        !samePointer(before.pointer, next.pointer) ||
        before.laser?.seq !== next.laser?.seq
      ) {
        changed = true;
      }
    }
    return changed;
  }

  /** Forgets the clients the room has not spoken of for `timeout` milliseconds. */
  expire(now: number, timeout: number): boolean {
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.heardAt <= timeout) continue;
      this.peers.delete(id);
      changed = true;
    }
    return changed;
  }

  /** Forgets everyone. Returns whether anyone was there. */
  clear(): boolean {
    const had = this.peers.size > 0;
    this.peers.clear();
    return had;
  }
}

// The header ---------------------------------------------------------------------------------------

/** A person of the header: one entry for all the connections of an account. */
export interface Person {
  readonly sub: string;
  /** May be empty: the view words it. */
  readonly name: string;
  readonly picture: string | undefined;
  readonly colour: string;
  /** A person without an account: the header badges them. */
  readonly guest: boolean;
  /** The file the person has open, when the project has it. */
  readonly file: { readonly id: string; readonly path: string } | undefined;
  /** How many connections the account has in the room. */
  readonly connections: number;
}

/**
 * The people to list in the header, in the order they came. Connections of one account are one
 * person, at the file their latest move was in; the account of this page is not listed (the
 * header's account control is already them), and a file the project does not have is no file.
 */
export function whoIsHere(
  peers: readonly Peer[],
  files: ReadonlyMap<string, DocFile>,
  ownSub: string | undefined,
): Person[] {
  const groups = new Map<string, Peer[]>();
  for (const peer of peers) {
    if (peer.sub === ownSub) continue;
    const group = groups.get(peer.sub);
    if (group) group.push(peer);
    else groups.set(peer.sub, [peer]);
  }
  const people: { person: Person; joinedAt: number }[] = [];
  for (const group of groups.values()) {
    // The connection that moved last says where the person is, and how they are called.
    const latest = group.reduce((a, b) => (b.movedAt >= a.movedAt ? b : a));
    const file = latest.file === undefined ? undefined : files.get(latest.file);
    people.push({
      joinedAt: Math.min(...group.map((peer) => peer.joinedAt)),
      person: {
        sub: latest.sub,
        name: latest.name,
        picture: latest.picture,
        colour: latest.colour,
        guest: latest.guest,
        file: file ? { id: file.id, path: file.shown } : undefined,
        connections: group.length,
      },
    });
  }
  return people.sort((a, b) => a.joinedAt - b.joinedAt).map((entry) => entry.person);
}

// The code pane ------------------------------------------------------------------------------------

/** A caret, and the selection around it if any, to draw in the open file. */
export interface DrawnCaret {
  /** The client's id: the node that draws it is kept from one drawing to the next. */
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  /** A person without an account: the flag badges them. */
  readonly guest: boolean;
  /** Where the caret bar goes: the head of the selection. */
  readonly head: number;
  /** The selection, `start` to `end`; equal when it is only a caret. */
  readonly start: number;
  readonly end: number;
  readonly movedAt: number;
}

/**
 * The carets to draw in a file: those of the clients that have it open, resolved against the
 * document as it is now, so that they have moved with every edit since they were sent. A caret
 * that names positions the text does not have (the file is not this one, or not here yet) is not
 * drawn, and offsets are kept inside the `length` the pane shows.
 */
export function drawnCarets(
  peers: readonly Peer[],
  fileId: string | undefined,
  doc: Y.Doc,
  text: Y.Text | undefined,
  length: number,
  fallbackName: string,
): DrawnCaret[] {
  if (fileId === undefined || !text) return [];
  const inside = (offset: number) => Math.max(0, Math.min(offset, length));
  const drawn: DrawnCaret[] = [];
  for (const peer of peers) {
    if (peer.file !== fileId || !peer.caret) continue;
    const anchor = positionIn(peer.caret.anchor, doc, text);
    const head = positionIn(peer.caret.head, doc, text);
    if (anchor === undefined || head === undefined) continue;
    const a = inside(anchor);
    const b = inside(head);
    drawn.push({
      id: peer.id,
      name: peer.name === "" ? fallbackName : peer.name,
      colour: peer.colour,
      guest: peer.guest,
      head: b,
      start: Math.min(a, b),
      end: Math.max(a, b),
      movedAt: peer.movedAt,
    });
  }
  return drawn;
}

// The canvas ---------------------------------------------------------------------------------------

/** What the canvas is told of a person: the `presence` host message's people. */
export interface CanvasPerson {
  readonly name: string;
  readonly colour: string;
  readonly selection: readonly string[];
  /** Where the person's pointer is over the same diagram, in diagram units. */
  readonly pointer?: { readonly x: number; readonly y: number };
  /** The person's last Pointer trail batch over the same diagram: `batch` grows with each one. */
  readonly laser?: { readonly batch: number; readonly points: readonly LaserPoint[] };
}

/**
 * Other people's selections and pointers for the canvas of a file: those of the clients that have
 * the file open and have something selected or a pointer over it. A pointer over another diagram of
 * the file than `diagram` (the one the canvas shows) is not drawn: its coordinates are that
 * diagram's. The canvas ignores the ids its diagram does not hold.
 */
export function canvasPeople(
  peers: readonly Peer[],
  fileId: string | undefined,
  fallbackName: string,
  diagram?: string,
): CanvasPerson[] {
  if (fileId === undefined) return [];
  const people: CanvasPerson[] = [];
  for (const peer of peers) {
    if (peer.file !== fileId) continue;
    const pointer = peer.pointer;
    const here =
      pointer !== undefined &&
      (pointer.diagram === undefined || diagram === undefined || pointer.diagram === diagram);
    // A trail over another diagram of the file than the one shown is not drawn either.
    const laser = peer.laser;
    const trail =
      laser !== undefined &&
      (laser.diagram === undefined || diagram === undefined || laser.diagram === diagram);
    if (peer.selection.length === 0 && !here && !trail) continue;
    people.push({
      name: peer.name === "" ? fallbackName : peer.name,
      colour: peer.colour,
      selection: peer.selection,
      ...(here ? { pointer: { x: pointer.x, y: pointer.y } } : {}),
      ...(trail ? { laser: { batch: laser.seq, points: laser.points } } : {}),
    });
  }
  return people;
}
