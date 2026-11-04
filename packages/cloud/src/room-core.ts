// The room: ALL of the logic of a project's room, over ports, so that every scenario of
// `cloud-document` runs in Node over a fake socket pair, a fake storage and a fake clock. The Durable
// Object (`room.ts`) only wires the platform to these ports.
//
// One room holds one project's Yjs document (`document.ts`). Everything that touches it (a client's
// message, a push, a restore, a read, the timers) runs one at a time through a queue, so that the
// document a transaction is validated against is the one it was applied to, and a reader never sees
// a change before it was checked.
//
// A transaction that breaks a rule is rolled back by rebuilding the document from the last encoded
// state (`base`) and the updates committed since (`log`): the cost of a rollback is the document's,
// the cost of an ordinary update is its own.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import * as Y from "yjs";
import {
  DOCUMENT_LIMITS,
  DocumentError,
  PUSH,
  RESTORE,
  applyFiles,
  checkChange,
  cleanse,
  cloudDoc,
  collectChanges,
  collisionsOf,
  mergeChanges,
  restoreFiles,
  snapshot,
  validateChanges,
  type Changes,
  type CloudDoc,
  type DocumentCode,
  type DocumentLimits,
} from "./document.js";
import type { MaterialiseInput } from "./materialise.js";
import {
  ATTACHMENT_BYTES,
  AWARENESS_MESSAGE_BYTES,
  AWARENESS_TIMEOUT_MS,
  AwarenessRate,
  fitRecord,
  parseAwareness,
  peerOf,
  type AwarenessRecord,
  type PeerMap,
} from "./room-awareness.js";
import {
  CLOSE_CODE,
  CLOSE_DISCONNECTED,
  KIND,
  frame,
  jsonFrame,
  parseFrame,
  toBytes,
} from "./room-protocol.js";
import {
  GUEST_PREFIX,
  RoomError,
  parsePush,
  type DisconnectTarget,
  type LiveGrant,
  type LiveSession,
  type LiveState,
  type PushRequest,
  type RoomErrorCode,
  type RoomFiles,
  type RoomIdentity,
  type RoomRole,
  type RoomStats,
} from "./rooms.js";

/** At most one write of the document to storage per this many milliseconds while changes arrive. */
export const PERSIST_INTERVAL_MS = 1_000;
/** A change is never left unwritten longer than this, however the writes are scheduled. */
export const PERSIST_MAX_WAIT_MS = 10_000;
/** The room materialises this long after the last change. */
export const MATERIALISE_DELAY_MS = 30_000;
/** The encoded document is stored in chunks of at most this many bytes (a storage value is capped at 2 MB). */
export const CHUNK_BYTES = 1024 * 1024;
/** Updates kept for a rollback beyond this many bytes make the room encode the document again. */
const REBASE_LOG_BYTES = 4 * 1024 * 1024;
/** A live session lasts this long at most (`live-sessions`, "Starting and ending a session"). */
export const LIVE_SESSION_MS = 24 * 60 * 60_000;
/** A live session ends once the room has been empty this long. */
export const LIVE_IDLE_MS = 60 * 60_000;
/** Open connections without an account from one client address; the next is `connections.limit`. */
export const GUEST_CONNECTIONS_PER_ADDRESS = 10;

/** The persisted state of a room: the revision and the encoded document in chunks. */
export interface StoredRoom {
  readonly revision: number;
  readonly chunks: readonly Uint8Array[];
}

/**
 * A live session as the room keeps it: the record, and since when the room has had nobody in it
 * (the idle hour is counted from there, after a wake too).
 */
export interface StoredLive extends LiveSession {
  readonly emptySince?: number;
}

/** The room's storage. The chunks and the revision are written in ONE storage transaction. */
export interface RoomStorage {
  /** What was persisted; undefined for a room never written. */
  load(): StoredRoom | undefined;
  /** Replaces the stored chunks and revision, atomically. */
  save(revision: number, chunks: readonly Uint8Array[]): void;
  /** Deletes everything the room stored, the live session included. */
  destroy(): void;
  /** The live session the room holds, if one is on. */
  live(): StoredLive | undefined;
  /** Replaces the live session's record; `undefined` deletes it. May throw. */
  setLive(live: StoredLive | undefined): void;
}

/** A connection, with the identity the Worker gave it (which survives a hibernation). */
export interface RoomSocket {
  readonly info: RoomIdentity & { readonly id: string };
  /**
   * What the room kept of this client's last awareness state, in the socket's attachment on the
   * platform, so that it survives a hibernation; undefined for a client that has none.
   */
  readonly awareness: AwarenessRecord | undefined;
  /** Keeps a client's awareness record with its socket (`undefined` forgets it). May throw. */
  keepAwareness(record: AwarenessRecord | undefined): void;
  send(data: Uint8Array): void;
  close(code: number, reason: string): void;
}

/** What the room needs from its surroundings. */
export interface RoomPorts {
  readonly storage: RoomStorage;
  /** Milliseconds since the epoch. */
  now(): number;
  setTimer(milliseconds: number, run: () => void): unknown;
  clearTimer(handle: unknown): void;
  /**
   * Asks the platform to call `RoomCore.alarm()` at this time (milliseconds since the epoch), replacing
   * the alarm it held: the room has at most one. The alarm outlives the object, so it fires after a
   * hibernation. It serves three moments, the earliest of which it is set for: the next awareness
   * timeout, the live session's end and the idle hour after the last client left.
   */
  setAlarm(at: number): Promise<void> | void;
  /** Every open connection of the room. */
  sockets(): readonly RoomSocket[];
  /** The project's id, for `materialise()`. */
  projectId(): string;
  /** Whether `project_blobs` holds the hash for this project. */
  hasBlob(hash: string): Promise<boolean>;
  materialise(input: MaterialiseInput): Promise<{ rowsWritten: number } | "gone">;
  randomBytes(length: number): Uint8Array;
  /** A line for the log: never the content of a file, a path or a person. */
  warn(message: string): void;
  /** Limits narrower than `CLOUD_LIMITS`, for the tests. */
  readonly limits?: Partial<RoomLimits>;
}

export interface RoomLimits extends DocumentLimits {
  /** Bytes of one message. */
  readonly message: number;
  /** Clients in one room. */
  readonly clients: number;
  /** Bytes a socket's attachment may take (the identity and the awareness record together). */
  readonly attachment: number;
}

const DEFAULT_LIMITS: RoomLimits = {
  ...DOCUMENT_LIMITS,
  message: CLOUD_LIMITS.message,
  clients: CLOUD_LIMITS.clients,
  attachment: ATTACHMENT_BYTES,
};

/**
 * What a transaction came to. `pending` is an update that waits for what it depends on: the room
 * does not keep it (see `transact`), so the client has to be asked for what is missing.
 */
type Outcome =
  | { ok: true; update?: Uint8Array; pending?: true }
  | { ok: false; code: DocumentCode | "internal" };

const noop = (): void => {};

/** What a socket's `send` or `close` may do when the other end is gone: nothing that matters. */
function attempt(run: () => void): void {
  try {
    run();
  } catch {
    // The connection is already closing; nobody is left to tell.
  }
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0] as Uint8Array;
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

const RANK: Readonly<Record<RoomRole, number>> = { viewer: 1, editor: 2, owner: 3 };

/** Bytes as lowercase hexadecimal. */
function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether two tokens are the same, in a time that does not depend on where they differ. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) differ |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differ === 0;
}

/** A time in milliseconds since the epoch, as the answers write one. */
const iso = (at: number): string => new Date(at).toISOString();

/** The encoded state split into chunks of at most `CHUNK_BYTES`; one (maybe empty) chunk at least. */
export function toChunks(bytes: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += CHUNK_BYTES) {
    chunks.push(bytes.subarray(at, at + CHUNK_BYTES));
  }
  return chunks.length > 0 ? chunks : [bytes];
}

export class RoomCore {
  /** The limits the room is built with. */
  private readonly standard: RoomLimits;
  /** The limits in force: `standard`, with the client limit the development tool may have lowered. */
  private limits: RoomLimits;
  private doc: Y.Doc = new Y.Doc();
  private cloud: CloudDoc = cloudDoc(this.doc);
  private revision = 0;

  /** The encoded document at the last point known good, and the updates committed since. */
  private base: Uint8Array = Y.encodeStateAsUpdate(this.doc);
  private log: Uint8Array[] = [];
  private logBytes = 0;

  private dirty = false;
  private firstDirtyAt: number | undefined;
  private lastWriteAt = Number.NEGATIVE_INFINITY;
  private persistTimer: unknown;

  private materialiseTimer: unknown;
  private materialisedRevision = -1;
  private materialising: Promise<boolean> | undefined;

  private queue: Promise<unknown> = Promise.resolve();
  /** Sockets the room has closed itself and that may still deliver a message. */
  private readonly closing = new Set<string>();
  /** Clients asked for what an update of theirs lacked, and that have not sent a whole one since. */
  private readonly asked = new Set<string>();

  /**
   * The project was deleted and the room destroyed. Until the deletion is complete the Worker still
   * admits a caller who was let in before it (an editor's script reconnecting, a stale token), and
   * that caller must not write the document again into the storage that was just emptied: nothing
   * would ever name it. A room that was destroyed refuses what comes after; the project ids are
   * never reused, and the platform's own eviction ends the object with its memory of this.
   */
  private destroyed = false;

  private storageWrites = 0;
  private materialisations = 0;
  private materialiseFailures = 0;
  private d1RowsWritten = 0;
  private messages = 0;
  private awarenessMessages = 0;
  private awarenessDropped = 0;

  /** The kind 2 messages of each client in the last second, by connection id (not kept across a hibernation). */
  private readonly rates = new Map<string, AwarenessRate>();
  /** The time the platform's alarm was last set for, while this object knows it is still set. */
  private alarmAt: number | undefined;
  /** The live session, as the storage holds it (`live-sessions`); read again when the object is built. */
  private live: StoredLive | undefined;

  constructor(private readonly ports: RoomPorts) {
    this.standard = { ...DEFAULT_LIMITS, ...ports.limits };
    this.limits = this.standard;
    this.load();
    try {
      this.live = ports.storage.live();
    } catch {
      // A record that cannot be read admits nobody; the owner starts another session.
      ports.warn("room: the live session could not be read");
    }
  }

  /**
   * Lowers the number of clients the room admits from now on (the development tool, for the browser
   * suite: the real limit is twenty); `undefined` goes back to the room's own. Nobody connected is
   * cut. Answers the limit now in force.
   */
  limitClients(clients?: number): number {
    const limit = Math.max(1, Math.min(clients ?? this.standard.clients, this.standard.clients));
    this.limits = { ...this.standard, clients: limit };
    return limit;
  }

  // ---- Loading, persisting --------------------------------------------------------------------

  /** Reassembles the document from the chunks the storage holds. */
  private load(): void {
    const stored = this.ports.storage.load();
    if (!stored) return;
    const bytes = concat(stored.chunks);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, bytes);
    // A state that holds an update which never integrated (and the root it named) is never the
    // base of a rollback: that would bring the same fault back at every rebuild.
    const { pending } = cleanse(doc);
    this.install(doc);
    this.base = pending ? Y.encodeStateAsUpdate(doc) : bytes;
    this.revision = stored.revision;
  }

  private install(doc: Y.Doc): void {
    this.doc = doc;
    this.cloud = cloudDoc(doc);
  }

  /** Marks the document changed: schedules the write and the materialisation. */
  private changed(): void {
    this.dirty = true;
    this.firstDirtyAt ??= this.ports.now();
    this.schedulePersist();
    this.armMaterialise();
  }

  /**
   * A throttle, not a debounce: the first change is written at once, then at most once per
   * `PERSIST_INTERVAL_MS` while changes keep arriving, and once more after the last one; and in any
   * case no later than `PERSIST_MAX_WAIT_MS` after the first change that is not yet written.
   */
  private schedulePersist(): void {
    if (this.persistTimer !== undefined) return;
    const now = this.ports.now();
    const sinceWrite = this.lastWriteAt + PERSIST_INTERVAL_MS - now;
    const mustBy = (this.firstDirtyAt ?? now) + PERSIST_MAX_WAIT_MS - now;
    const wait = Math.max(0, Math.min(sinceWrite, mustBy));
    this.persistTimer = this.ports.setTimer(wait, () => {
      this.persistTimer = undefined;
      void this.enqueue(() => this.persist());
    });
  }

  /** Writes the encoded document and the revision now (in the queue). */
  private persist(): void {
    if (this.persistTimer !== undefined) {
      this.ports.clearTimer(this.persistTimer);
      this.persistTimer = undefined;
    }
    if (!this.dirty) return;
    const encoded = Y.encodeStateAsUpdate(this.doc);
    try {
      this.ports.storage.save(this.revision, toChunks(encoded));
    } catch {
      // Nothing is lost: the document is still here and still dirty. Try again in a moment.
      this.ports.warn("room: the document could not be written to storage");
      this.persistTimer = this.ports.setTimer(PERSIST_INTERVAL_MS, () => {
        this.persistTimer = undefined;
        void this.enqueue(() => this.persist());
      });
      return;
    }
    this.storageWrites++;
    this.dirty = false;
    this.firstDirtyAt = undefined;
    this.lastWriteAt = this.ports.now();
    this.setBase(encoded);
  }

  private setBase(encoded: Uint8Array): void {
    this.base = encoded;
    this.log = [];
    this.logBytes = 0;
  }

  /** Writes now, whatever the throttle says: for the platform to call before the room goes away. */
  flush(): Promise<void> {
    return this.enqueue(() => this.persist());
  }

  // ---- Transactions ---------------------------------------------------------------------------

  /** Runs one thing at a time, in the order it was asked. A failure belongs to its caller alone. */
  private enqueue<T>(run: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(run);
    this.queue = result.then(noop, noop);
    return result;
  }

  /** Puts the document back as it was at the last committed update. */
  private rollback(): void {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.base);
    for (const update of this.log) Y.applyUpdate(doc, update);
    this.install(doc);
  }

  /**
   * Makes a change to the document and either keeps it or takes it back. `run` makes the change;
   * what it changed is checked against the rules of the document; a change that breaks one is
   * rolled back. The revision rises once, for a change that kept something.
   *
   * An update that waits for what it depends on (the room lost its last second, or the client sent
   * too little) is not kept: Yjs would hold it in the document, where it would be written to
   * storage with the rest, be brought back by every rollback and every reload, and make the room
   * ask for what is missing at every later update. It is dropped, and the outcome says it was
   * (`pending`), so that the client is asked for what the room lacks and answers with all of it.
   * The same goes for a root type that decoding created for an update that integrated nothing: it
   * is a document of another shape, which no rule would otherwise look at, and it is refused.
   */
  private async transact(
    run: () => void,
    known: ReadonlySet<string> = new Set(),
  ): Promise<Outcome> {
    const cloud = this.cloud;
    const seen: Changes[] = [];
    const updates: Uint8Array[] = [];
    const onAfter = (transaction: Y.Transaction) => seen.push(collectChanges(cloud, transaction));
    const onUpdate = (update: Uint8Array) => updates.push(update);
    cloud.doc.on("afterTransaction", onAfter);
    cloud.doc.on("update", onUpdate);
    let code: DocumentCode | "internal" | undefined;
    try {
      run();
    } catch (error) {
      if (error instanceof DocumentError) {
        code = error.code;
      } else {
        this.ports.warn("room: a change could not be applied");
        code = "doc.invalid";
      }
    } finally {
      cloud.doc.off("afterTransaction", onAfter);
      cloud.doc.off("update", onUpdate);
    }
    // What the change left in the document that is not part of it goes now, before anything below
    // (a rule, a rollback, a write to storage) can see it.
    const { pending, stray, clean } = cleanse(cloud.doc);
    if (stray) code ??= "doc.invalid";
    // Nothing was integrated: the change was known already, waits for what it depends on, or was
    // refused before it touched the document.
    if (updates.length === 0) {
      // A root that holds content cannot have come without an update; rebuilding is the safe answer.
      if (!clean) this.rollback();
      if (code !== undefined) return { ok: false, code };
      return pending ? { ok: true, pending: true } : { ok: true };
    }
    const update = updates.length === 1 ? (updates[0] as Uint8Array) : Y.mergeUpdates(updates);

    let measured: Uint8Array | undefined;
    if (code === undefined) {
      try {
        code = await validateChanges(cloud, mergeChanges(seen), {
          hasBlob: async (hash) => known.has(hash) || (await this.ports.hasBlob(hash)),
          // An upper bound that costs nothing; only a document near the limit is encoded to be sure.
          encodedBytes: () => {
            const bound = this.base.length + this.logBytes + update.length;
            if (bound <= this.limits.documentBytes) return bound;
            measured = Y.encodeStateAsUpdate(cloud.doc);
            return measured.length;
          },
          limits: this.limits,
        });
      } catch {
        this.ports.warn("room: a change could not be checked");
        code = "internal";
      }
    }
    if (code !== undefined) {
      this.rollback();
      return { ok: false, code };
    }

    this.revision++;
    if (measured) {
      this.setBase(measured);
    } else {
      this.log.push(update);
      this.logBytes += update.length;
      if (this.logBytes > REBASE_LOG_BYTES) this.setBase(Y.encodeStateAsUpdate(this.doc));
    }
    return pending ? { ok: true, update, pending: true } : { ok: true, update };
  }

  // ---- Sockets --------------------------------------------------------------------------------

  /** Sends an update to every client but one. */
  private broadcast(update: Uint8Array, except?: string): void {
    this.relay(frame(KIND.update, update), except);
  }

  /** Sends a message to every client but one that is not being closed. */
  private relay(message: Uint8Array, except?: string): void {
    for (const socket of this.ports.sockets()) {
      if (socket.info.id === except || this.closing.has(socket.info.id)) continue;
      attempt(() => socket.send(message));
    }
  }

  /** Tells a client what rule it broke and closes its socket with the code that goes with it. */
  private refuse(socket: RoomSocket, code: RoomErrorCode): void {
    this.closing.add(socket.info.id);
    attempt(() => socket.send(jsonFrame(KIND.error, { code })));
    attempt(() => socket.close(CLOSE_CODE[code], code));
  }

  private openClients(except?: string): number {
    return this.ports.sockets().filter((s) => s.info.id !== except && !this.closing.has(s.info.id))
      .length;
  }

  /**
   * The viewer whose place a person who can write takes in a full room: of the viewers and the
   * guests (a guest of any role gives up a place as a viewer does), the newest socket of the person
   * who holds the most (so that one account that opened many sockets to keep the room full loses its
   * own first). Undefined when nobody in the room is a viewer or a guest.
   */
  private viewerToMakeRoom(except: string): RoomSocket | undefined {
    const viewers = this.ports
      .sockets()
      .filter(
        (s) =>
          s.info.id !== except &&
          !this.closing.has(s.info.id) &&
          (s.info.role === "viewer" || s.info.guest === true),
      );
    const held = new Map<string, number>();
    for (const viewer of viewers) held.set(viewer.info.sub, (held.get(viewer.info.sub) ?? 0) + 1);
    let chosen: RoomSocket | undefined;
    let most = 0;
    for (const viewer of viewers) {
      const count = held.get(viewer.info.sub) ?? 0;
      if (count >= most) {
        most = count;
        chosen = viewer;
      }
    }
    return chosen;
  }

  /** The live session, unless its time is up (the alarm that ends it may not have run yet). */
  private currentLive(): StoredLive | undefined {
    const live = this.live;
    return live && this.ports.now() < live.until ? live : undefined;
  }

  /**
   * What a connection the Worker passes is admitted as, before the platform accepts its socket
   * (`live-sessions`, "Joining with the link"). The identity is the Worker's; a `guest:` sub is a
   * person without an account and nothing else, and the other way round (either mismatch is the
   * Worker's fault: `internal`). With a token, the token must be the current session's, or the
   * upgrade is answered `404 project.not-found` and nothing is said of why (a destroyed room has no
   * session; without a token, `connect` refuses what comes after a deletion); the role is then the
   * higher of the person's own and the session's, and the connection is marked as the session's,
   * so that it is cut when the session ends. Without one, a guest only looks.
   */
  admit(identity: RoomIdentity, token: string | undefined): RoomIdentity {
    const guest = identity.guest === true;
    if (identity.sub.startsWith(GUEST_PREFIX) !== guest) throw new RoomError("internal");
    const { live: _given, ...own } = identity;
    if (token === undefined) return guest ? { ...own, role: "viewer" } : own;
    const live = this.currentLive();
    if (!live || !sameToken(token, live.token)) throw new RoomError("project.not-found");
    const granted: RoomRole = live.guestsEdit ? "editor" : "viewer";
    return {
      ...own,
      role: RANK[own.role] >= RANK[granted] ? own.role : granted,
      live: live.id,
    };
  }

  /** Open connections without an account from an address, but one. */
  private fromAddress(address: string, except: string): number {
    return this.ports
      .sockets()
      .filter(
        (s) =>
          s.info.id !== except &&
          !this.closing.has(s.info.id) &&
          s.info.guest === true &&
          (s.info.address ?? "") === address,
      ).length;
  }

  /**
   * A client has connected (the platform accepted its socket, admitted by `admit`): one the session
   * admitted after that session ended is told `session.ended`; the eleventh connection without an
   * account from one address is refused with `connections.limit`; the 21st is refused with
   * `room.full`, unless it is the owner or an editor with an account and a viewer or a guest holds a
   * place, which that one gives up (it is told `room.full`, as if it had come last): a room full of
   * people who only read, of guests, or of one account's sockets, must not keep the owner and the
   * editors out. The others get `hello` and the room's state vector, which tells the client what the
   * room already holds so that it can send what the room lacks.
   */
  connect(socket: RoomSocket): Promise<void> {
    return this.enqueue(() => {
      if (this.destroyed) {
        this.refuse(socket, "project.not-found");
        return;
      }
      const live = this.currentLive();
      if (socket.info.live !== undefined && socket.info.live !== live?.id) {
        this.refuse(socket, "session.ended");
        return;
      }
      if (
        socket.info.guest === true &&
        this.fromAddress(socket.info.address ?? "", socket.info.id) >= GUEST_CONNECTIONS_PER_ADDRESS
      ) {
        this.refuse(socket, "connections.limit");
        return;
      }
      if (this.openClients(socket.info.id) >= this.limits.clients) {
        const writes = socket.info.role !== "viewer" && socket.info.guest !== true;
        const viewer = writes ? this.viewerToMakeRoom(socket.info.id) : undefined;
        if (!viewer) {
          this.refuse(socket, "room.full");
          return;
        }
        this.refuse(viewer, "room.full");
      }
      const { id, sub, name, picture, role } = socket.info;
      const admittedBy = socket.info.live !== undefined ? live : undefined;
      attempt(() =>
        socket.send(
          jsonFrame(KIND.hello, {
            role,
            revision: this.revision,
            limits: {
              files: this.limits.files,
              documentBytes: this.limits.documentBytes,
              textCharacters: this.limits.textCharacters,
              message: this.limits.message,
              clients: this.limits.clients,
            },
            collisions: collisionsOf(this.cloud),
            you: { id, sub, name, picture, guest: socket.info.guest === true },
            live: admittedBy
              ? { until: iso(admittedBy.until), guestsEdit: admittedBy.guestsEdit }
              : null,
          }),
        ),
      );
      attempt(() => socket.send(frame(KIND.sync, Y.encodeStateVector(this.doc))));
      // The others' presence, in one message; the newcomer is announced when it sends a state.
      const peers = this.peersOf(id);
      if (Object.keys(peers).length > 0)
        attempt(() => socket.send(jsonFrame(KIND.awareness, peers)));
    });
  }

  /** A message from a client. It never rejects: a client's mistake closes that client's socket. */
  message(socket: RoomSocket, data: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    this.messages++;
    return this.enqueue(async () => {
      try {
        await this.handle(socket, data);
      } catch {
        this.ports.warn("room: a message could not be handled");
        this.refuse(socket, "internal");
      }
    });
  }

  private async handle(
    socket: RoomSocket,
    data: string | ArrayBuffer | ArrayBufferView,
  ): Promise<void> {
    if (this.closing.has(socket.info.id)) return;
    // The protocol is binary: a text frame is not one of its messages.
    if (typeof data === "string") return this.refuse(socket, "doc.invalid");
    const bytes = toBytes(data);
    if (bytes.length > this.limits.message) return this.refuse(socket, "message.too-large");
    const message = parseFrame(bytes);
    if (!message) return this.refuse(socket, "doc.invalid");

    switch (message.kind) {
      case KIND.sync: {
        let missing: Uint8Array;
        try {
          missing = Y.encodeStateAsUpdate(this.doc, message.payload);
        } catch {
          return this.refuse(socket, "doc.invalid");
        }
        attempt(() => socket.send(frame(KIND.update, missing)));
        return;
      }
      case KIND.update:
        if (socket.info.role === "viewer") return this.refuse(socket, "access.denied");
        return this.applyFromClient(socket, message.payload);
      case KIND.awareness:
        return this.awarenessFrom(socket, bytes);
      default:
        // `hello` and `error` only go from the room to a client; any other kind is not a kind.
        return this.refuse(socket, "doc.invalid");
    }
  }

  private async applyFromClient(socket: RoomSocket, update: Uint8Array): Promise<void> {
    const outcome = await this.transact(() => Y.applyUpdate(this.doc, update, socket.info.id));
    if (!outcome.ok) return this.refuse(socket, outcome.code);
    if (outcome.update) {
      this.broadcast(outcome.update, socket.info.id);
      this.changed();
    }
    // An update that waited for what it depends on (the room lost its last second, or the client
    // sent too little) was not kept: say what the room holds, and the client answers with what is
    // missing and with that update again. Once per client until one of its updates is whole, so
    // that two ends that each lack something cannot answer one another for ever.
    if (!outcome.pending) {
      this.asked.delete(socket.info.id);
    } else if (!this.asked.has(socket.info.id)) {
      this.asked.add(socket.info.id);
      attempt(() => socket.send(frame(KIND.sync, Y.encodeStateVector(this.doc))));
    }
  }

  // ---- Awareness ------------------------------------------------------------------------------

  /**
   * A kind 2 message. The room never lets awareness take a connection down: a message that is over
   * 16 KiB (the kind byte included) closes its sender, and the rate closes a flood (`awareness.rate`),
   * but a message beyond 20 a second, or one that is not a state, is dropped and counted. A state is
   * relayed to every other client with the sender's identity in `user` (whatever the message said),
   * and its file and caret are kept in the socket's attachment with the time, so that they survive a
   * hibernation; a viewer publishes like anybody else.
   */
  private async awarenessFrom(socket: RoomSocket, bytes: Uint8Array): Promise<void> {
    this.awarenessMessages++;
    if (bytes.length > AWARENESS_MESSAGE_BYTES) return this.refuse(socket, "message.too-large");
    const { id } = socket.info;
    let rate = this.rates.get(id);
    if (!rate) this.rates.set(id, (rate = new AwarenessRate()));
    const now = this.ports.now();
    const verdict = rate.hit(now);
    if (verdict === "close") return this.refuse(socket, "awareness.rate");
    const parsed = verdict === "ok" ? parseAwareness(bytes.subarray(1)) : undefined;
    if (!parsed) {
      this.awarenessDropped++;
      return;
    }

    if ("remove" in parsed) {
      if (socket.awareness === undefined) return;
      this.keepAwareness(socket, undefined);
      this.relay(jsonFrame(KIND.awareness, { [id]: null }), id);
      return;
    }
    const { state } = parsed;
    const peer = peerOf(socket.info, state);
    this.keepAwareness(
      socket,
      fitRecord(
        socket.info,
        {
          colour: peer.user.colour,
          ...(state.file !== undefined ? { file: state.file } : {}),
          ...(state.caret ? { caret: state.caret } : {}),
          seen: now,
        },
        this.limits.attachment,
      ),
    );
    this.relay(jsonFrame(KIND.awareness, { [id]: peer }), id);
    await this.armAlarm();
  }

  /** Keeps a record in a socket's attachment; a platform that cannot is no reason to fail the message. */
  private keepAwareness(socket: RoomSocket, record: AwarenessRecord | undefined): void {
    try {
      socket.keepAwareness(record);
    } catch {
      this.ports.warn("room: an awareness state could not be kept");
    }
  }

  /** The states of the clients but one, as the room sends them: those not yet silent for thirty seconds. */
  private peersOf(except: string): PeerMap {
    const now = this.ports.now();
    const peers: PeerMap = {};
    for (const other of this.ports.sockets()) {
      const record = other.awareness;
      if (other.info.id === except || this.closing.has(other.info.id) || !record) continue;
      if (now >= record.seen + AWARENESS_TIMEOUT_MS) continue;
      peers[other.info.id] = peerOf(
        other.info,
        {
          ...(record.file !== undefined ? { file: record.file } : {}),
          ...(record.caret ? { caret: record.caret } : {}),
        },
        record.colour,
      );
    }
    return peers;
  }

  /**
   * The next moment the room has something to do by the clock, or undefined: the earliest of the
   * next awareness timeout (of the clients but `gone`), the live session's end, and the idle hour
   * after the last client left while the room is empty.
   */
  private nextAlarm(gone: ReadonlySet<string> = new Set()): number | undefined {
    let earliest: number | undefined;
    const consider = (at: number) => {
      if (earliest === undefined || at < earliest) earliest = at;
    };
    for (const socket of this.ports.sockets()) {
      const seen = socket.awareness?.seen;
      if (seen !== undefined && !gone.has(socket.info.id)) consider(seen + AWARENESS_TIMEOUT_MS);
    }
    const live = this.live;
    if (live) {
      consider(live.until);
      if (live.emptySince !== undefined && this.openClients() === 0) {
        consider(live.emptySince + LIVE_IDLE_MS);
      }
    }
    return earliest;
  }

  /**
   * Makes sure the platform's alarm is set for the earliest moment the room has something to do
   * (`nextAlarm`). It is set when this object does not know it is (a first state, a session started,
   * or the object was built again) or knows it is set for later, and not on every message: a state
   * refreshed after the alarm was set only makes the alarm come early, and `alarm()` sets the next
   * one. A failure is logged and retried by the next state.
   */
  private async armAlarm(): Promise<void> {
    const at = this.nextAlarm();
    if (at === undefined || (this.alarmAt !== undefined && this.alarmAt <= at)) return;
    try {
      await this.ports.setAlarm(at);
      this.alarmAt = at;
    } catch {
      this.ports.warn("room: the alarm could not be set");
    }
  }

  /**
   * The platform's alarm fired (possibly in an object built again after a hibernation): drops every
   * state that was not refreshed for thirty seconds and tells the clients that remain; ends the live
   * session when its time is up or the room has been empty for an hour; and sets the next alarm. The
   * sockets of the states dropped stay open: a client that sends a state again is back. Nothing of
   * awareness is written to the room's storage.
   */
  alarm(): Promise<void> {
    return this.enqueue(async () => {
      this.alarmAt = undefined;
      const now = this.ports.now();
      const gone: string[] = [];
      for (const socket of this.ports.sockets()) {
        const seen = socket.awareness?.seen;
        if (seen === undefined) continue;
        if (now >= seen + AWARENESS_TIMEOUT_MS) {
          this.keepAwareness(socket, undefined);
          gone.push(socket.info.id);
        }
      }
      // Each client is told of the others that are gone, not of itself.
      if (gone.length > 0) {
        for (const socket of this.ports.sockets()) {
          if (this.closing.has(socket.info.id)) continue;
          const others = gone.filter((id) => id !== socket.info.id);
          if (others.length === 0) continue;
          const removed: PeerMap = Object.fromEntries(others.map((id) => [id, null]));
          attempt(() => socket.send(jsonFrame(KIND.awareness, removed)));
        }
      }
      const live = this.live;
      if (
        live &&
        (now >= live.until ||
          (live.emptySince !== undefined &&
            this.openClients() === 0 &&
            now >= live.emptySince + LIVE_IDLE_MS))
      ) {
        this.endSession();
      }
      const next = this.nextAlarm(new Set(gone));
      if (next === undefined) return;
      try {
        await this.ports.setAlarm(next);
        this.alarmAt = next;
      } catch {
        this.ports.warn("room: the alarm could not be set");
      }
    });
  }

  /** A socket has closed (by the client, by the room or by an error). */
  async closed(socket: RoomSocket): Promise<void> {
    const started = await this.enqueue(async () => {
      this.closing.delete(socket.info.id);
      this.asked.delete(socket.info.id);
      this.rates.delete(socket.info.id);
      // The others stop seeing a client that had a state, at once.
      if (socket.awareness !== undefined) {
        this.relay(jsonFrame(KIND.awareness, { [socket.info.id]: null }), socket.info.id);
      }
      if (this.openClients(socket.info.id) > 0) return undefined;
      // The last client left: write now, and materialise without waiting for the timer.
      this.persist();
      const started = this.startMaterialise();
      // A live session counts its idle hour from now, after a wake too.
      const live = this.live;
      if (live && !this.destroyed) {
        this.live = { ...live, emptySince: this.ports.now() };
        this.saveLive();
        await this.armAlarm();
      }
      return started;
    });
    if (started?.done) await started.done;
  }

  /** Closes the sockets the target names; answers how many. */
  disconnect(target: DisconnectTarget = {}): number {
    let closed = 0;
    for (const socket of this.ports.sockets()) {
      if (target.id !== undefined && socket.info.id !== target.id) continue;
      if (target.sub !== undefined && socket.info.sub !== target.sub) continue;
      if (target.except !== undefined && socket.info.sub === target.except) continue;
      this.closing.add(socket.info.id);
      attempt(() => socket.close(CLOSE_DISCONNECTED, "disconnected"));
      closed++;
    }
    return closed;
  }

  // ---- The live session -----------------------------------------------------------------------

  /** Writes the live session's record as it is in memory; a failure is logged (the memory still holds it). */
  private saveLive(): void {
    try {
      this.ports.storage.setLive(this.live);
    } catch {
      this.ports.warn("room: the live session could not be written");
    }
  }

  /** The connections a session admitted that are open now. */
  private admittedBy(live: LiveSession): RoomSocket[] {
    return this.ports
      .sockets()
      .filter((s) => s.info.live === live.id && !this.closing.has(s.info.id));
  }

  private liveState(live: StoredLive): LiveState {
    const { emptySince: _emptySince, ...session } = live;
    return { ...session, guests: this.admittedBy(live).length };
  }

  /**
   * Ends the live session (the owner ended it, its time is up, or the room was empty for an hour):
   * the record goes, and every connection the session admitted is told `session.ended` and closed,
   * so that its page stops reconnecting with the token. Connections that came without it stay.
   */
  private endSession(): void {
    const live = this.live;
    if (!live) return;
    const admitted = this.admittedBy(live);
    this.live = undefined;
    this.saveLive();
    for (const socket of admitted) this.refuse(socket, "session.ended");
  }

  /**
   * Starts the live session (`PUT …/live`): a new id and a token of 128 random bits, guests may edit
   * unless `guestsEdit` says otherwise, for twenty-four hours. A session that is on is answered as it
   * is, with `guestsEdit` applied when it is given and differs: the connections it admitted are then
   * cut as a change of access cuts them, and reconnect with the role it gives now. The record is
   * written before the answer: a session the room could not keep is `internal`, not a link.
   */
  startLive(request: { guestsEdit?: boolean }): Promise<LiveState> {
    return this.enqueue(async () => {
      if (this.destroyed) throw new RoomError("project.not-found");
      if (this.live && !this.currentLive()) this.endSession();
      let live = this.live;
      if (!live) {
        const now = this.ports.now();
        live = {
          id: hex(this.ports.randomBytes(8)),
          token: hex(this.ports.randomBytes(16)),
          guestsEdit: request.guestsEdit ?? true,
          startedAt: now,
          until: now + LIVE_SESSION_MS,
          ...(this.openClients() === 0 ? { emptySince: now } : {}),
        };
        try {
          this.ports.storage.setLive(live);
        } catch {
          this.ports.warn("room: the live session could not be written");
          throw new RoomError("internal");
        }
        this.live = live;
      } else if (request.guestsEdit !== undefined && request.guestsEdit !== live.guestsEdit) {
        live = { ...live, guestsEdit: request.guestsEdit };
        this.live = live;
        this.saveLive();
        for (const socket of this.admittedBy(live)) {
          this.closing.add(socket.info.id);
          attempt(() => socket.close(CLOSE_DISCONNECTED, "disconnected"));
        }
      }
      await this.armAlarm();
      return this.liveState(live);
    });
  }

  /** The live session that is on, or null (`GET …/live`). */
  readLive(): Promise<LiveState | null> {
    return this.enqueue(() => {
      const live = this.currentLive();
      return live ? this.liveState(live) : null;
    });
  }

  /** Ends the live session if one is on (`DELETE …/live`). */
  endLive(): Promise<void> {
    return this.enqueue(() => this.endSession());
  }

  /** What a token is worth now: the session's end and whether guests edit, or null when it is not current. */
  checkLive(token: string): Promise<LiveGrant | null> {
    return this.enqueue(() => {
      const live = this.currentLive();
      if (this.destroyed || !live || !sameToken(token, live.token)) return null;
      return { until: live.until, guestsEdit: live.guestsEdit };
    });
  }

  // ---- Reads and pushes -----------------------------------------------------------------------

  /** The latest files by path, from the document (never from D1). */
  readFiles(): Promise<RoomFiles> {
    return this.enqueue(() => ({ revision: this.revision, ...snapshot(this.cloud) }));
  }

  /**
   * A push as one transaction with origin `push` (see `applyFiles`). `ifRevision` that is not the
   * current revision is `revision.mismatch` carrying it; a path that breaks the rule is
   * `path.invalid` and a hash the project never uploaded `blob.unknown`; nothing is applied then.
   */
  push(request: PushRequest): Promise<{ revision: number }> {
    return this.enqueue(async () => {
      if (this.destroyed) throw new RoomError("project.not-found");
      const body = parsePush(request);
      if (!body) throw new RoomError("doc.invalid");
      try {
        checkChange(body);
      } catch (error) {
        throw error instanceof DocumentError ? new RoomError(error.code) : error;
      }
      if (body.ifRevision !== undefined && body.ifRevision !== this.revision) {
        throw new RoomError("revision.mismatch", { revision: this.revision });
      }
      const hashes = await this.checkBlobs(Object.values(body.binaries ?? {}));
      const outcome = await this.transact(
        () =>
          applyFiles(this.cloud, body, {
            origin: PUSH,
            random: (length) => this.ports.randomBytes(length),
          }),
        hashes,
      );
      return this.committed(outcome);
    });
  }

  /**
   * Makes the room hold exactly these files (a version restored), as one transaction with origin
   * `restore`. `ifRevision` that is not the current revision is `revision.mismatch` carrying it:
   * what a restore replaces is what the version recorded before it was made, or nothing is replaced.
   */
  restore(
    files: Readonly<Record<string, string>>,
    binaries: Readonly<Record<string, string>>,
    ifRevision?: number,
  ): Promise<{ revision: number }> {
    return this.enqueue(async () => {
      if (this.destroyed) throw new RoomError("project.not-found");
      const body = parsePush({ files, binaries });
      if (!body) throw new RoomError("doc.invalid");
      try {
        checkChange(body, { deletes: false });
      } catch (error) {
        throw error instanceof DocumentError ? new RoomError(error.code) : error;
      }
      if (ifRevision !== undefined && ifRevision !== this.revision) {
        throw new RoomError("revision.mismatch", { revision: this.revision });
      }
      const hashes = await this.checkBlobs(Object.values(binaries));
      const outcome = await this.transact(
        () =>
          restoreFiles(this.cloud, files, binaries, {
            origin: RESTORE,
            random: (length) => this.ports.randomBytes(length),
          }),
        hashes,
      );
      return this.committed(outcome);
    });
  }

  /** The hashes of a change that the project holds; `blob.unknown` for the first it does not. */
  private async checkBlobs(hashes: readonly (string | null)[]): Promise<Set<string>> {
    const known = new Set<string>();
    for (const hash of hashes) {
      if (hash === null || known.has(hash)) continue;
      let held: boolean;
      try {
        held = await this.ports.hasBlob(hash);
      } catch {
        this.ports.warn("room: a binary could not be looked up");
        throw new RoomError("internal");
      }
      if (!held) throw new RoomError("blob.unknown");
      known.add(hash);
    }
    return known;
  }

  /** The end of a push or a restore: tell the clients, schedule the writes, answer the revision. */
  private committed(outcome: Outcome): { revision: number } {
    if (!outcome.ok) throw new RoomError(outcome.code);
    if (outcome.update) {
      this.broadcast(outcome.update);
      this.changed();
    }
    return { revision: this.revision };
  }

  // ---- Materialisation ------------------------------------------------------------------------

  /** Thirty seconds after the last change. */
  private armMaterialise(): void {
    if (this.materialiseTimer !== undefined) this.ports.clearTimer(this.materialiseTimer);
    this.materialiseTimer = this.ports.setTimer(MATERIALISE_DELAY_MS, () => {
      this.materialiseTimer = undefined;
      void this.enqueue(() => this.startMaterialise()).then((started) => started.done, noop);
    });
  }

  /**
   * Takes the document as it is and starts materialising it, unless it was already materialised
   * at this revision. The queue waits only for the snapshot: the writes go on beside the room, so
   * that typing is not held up by R2 or D1. A failure is logged without content and the next
   * trigger tries again; the document is never touched by it.
   */
  private startMaterialise(): { done: Promise<boolean> | undefined } {
    if (this.materialising) return { done: this.materialising };
    // Revision 0 is a document nobody has changed: there is nothing to materialise, and a room
    // that was destroyed must never write an empty project over what the store holds.
    if (this.revision === 0 || this.materialisedRevision === this.revision) {
      return { done: undefined };
    }
    const shot = snapshot(this.cloud);
    const input: MaterialiseInput = {
      projectId: this.ports.projectId(),
      revision: this.revision,
      files: shot.files,
      binaries: shot.binaries,
    };
    this.materialisations++;
    const run = (async (): Promise<boolean> => {
      try {
        const result = await this.ports.materialise(input);
        if (result !== "gone") this.d1RowsWritten += result.rowsWritten;
        this.materialisedRevision = input.revision;
        return true;
      } catch {
        this.materialiseFailures++;
        this.ports.warn("room: the files could not be materialised");
        return false;
      } finally {
        this.materialising = undefined;
      }
    })();
    this.materialising = run;
    return { done: run };
  }

  /**
   * Materialises now (before a version is made). Answers the revision the files in the store are at,
   * or false when they could not be written. Changes that arrive while it runs get one more run, no
   * more, so the revision answered may be behind the room's: a caller that must act on exactly the
   * state it recorded passes it back (`restore`'s `ifRevision`).
   */
  async materialiseNow(): Promise<{ revision: number } | false> {
    for (let attempts = 0; attempts < 3; attempts++) {
      const started = await this.enqueue(() => this.startMaterialise());
      if (!started.done) return { revision: this.revision };
      if (!(await started.done)) return false;
      if (this.materialisedRevision === this.revision) return { revision: this.revision };
    }
    return { revision: this.materialisedRevision };
  }

  // ---- The end of a room, and its counters ----------------------------------------------------

  /** The project was deleted: drop the storage, tell the clients and close them. */
  destroy(): Promise<void> {
    return this.enqueue(() => {
      for (const handle of [this.persistTimer, this.materialiseTimer]) {
        if (handle !== undefined) this.ports.clearTimer(handle);
      }
      this.persistTimer = undefined;
      this.materialiseTimer = undefined;
      this.alarmAt = undefined;
      this.rates.clear();
      this.asked.clear();
      // The live session goes with the room: its token admits nobody afterwards.
      this.live = undefined;
      this.ports.storage.destroy();
      for (const socket of this.ports.sockets()) this.refuse(socket, "project.not-found");
      this.install(new Y.Doc());
      this.setBase(Y.encodeStateAsUpdate(this.doc));
      this.revision = 0;
      this.dirty = false;
      this.firstDirtyAt = undefined;
      this.lastWriteAt = Number.NEGATIVE_INFINITY;
      this.materialisedRevision = -1;
      this.destroyed = true;
    });
  }

  stats(): RoomStats {
    return {
      revision: this.revision,
      clients: this.ports.sockets().length,
      storageWrites: this.storageWrites,
      materialisations: this.materialisations,
      materialiseFailures: this.materialiseFailures,
      d1RowsWritten: this.d1RowsWritten,
      messages: this.messages,
      awareness: this.awarenessMessages,
      awarenessDropped: this.awarenessDropped,
    };
  }
}
