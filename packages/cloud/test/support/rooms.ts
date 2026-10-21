// Test support for the rooms: `memoryRooms()` is `RoomsApi` over the room's own logic (`RoomCore`)
// with in-memory ports, a fake clock with timers, and fake sockets. The rules, the revisions, the
// throttle and the validation are the real ones; only the platform is missing. The project routes
// and their tests are built on it (`h.rooms` of the harness).
//
// `RoomClient` is a page's end of a socket: a Y.Doc, the messages it got, the way it closed.

import { serialize } from "node:v8";
import * as Y from "yjs";
import { cloudDoc, type CloudDoc } from "../../src/document.js";
import { fail, type ErrorCode } from "../../src/errors.js";
import type { MaterialiseInput } from "../../src/materialise.js";
import type { AwarenessRecord } from "../../src/room-awareness.js";
import {
  RoomCore,
  type RoomLimits,
  type RoomSocket,
  type RoomStorage,
} from "../../src/room-core.js";
import { KIND, frame, jsonFrame, parseFrame } from "../../src/room-protocol.js";
import {
  RoomError,
  type DisconnectTarget,
  type PushRequest,
  type RoomIdentity,
  type RoomLimitsRequest,
  type RoomStats,
  type RoomsApi,
} from "../../src/rooms.js";
import type { CloudStore } from "../../src/store/types.js";

/** The clock the rooms use: `now()` in milliseconds. `FakeClock` of the harness satisfies it. */
export interface RoomClock {
  now(): Date;
  advance(ms: number): void;
}

// ---------------------------------------------------------------------------------------------
// Time: timers that fire when the clock reaches them

interface Timer {
  readonly at: number;
  readonly run: () => void;
  readonly order: number;
}

/** Gives up the thread so that what a timer started (the room's queue) settles before the next one. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export class FakeTimers {
  private readonly timers = new Set<Timer>();
  private count = 0;

  constructor(private readonly clock: RoomClock) {}

  set = (milliseconds: number, run: () => void): unknown => {
    const timer: Timer = {
      at: this.clock.now().getTime() + milliseconds,
      run,
      order: this.count++,
    };
    this.timers.add(timer);
    return timer;
  };

  clear = (handle: unknown): void => {
    this.timers.delete(handle as Timer);
  };

  /** Timers waiting. */
  get pending(): number {
    return this.timers.size;
  }

  /** Moves the clock forward, running every timer that falls due on the way, in order. */
  async advance(milliseconds: number): Promise<void> {
    const target = this.clock.now().getTime() + milliseconds;
    await settle();
    for (;;) {
      let next: Timer | undefined;
      for (const timer of this.timers) {
        if (timer.at > target) continue;
        if (!next || timer.at < next.at || (timer.at === next.at && timer.order < next.order)) {
          next = timer;
        }
      }
      if (!next) break;
      this.timers.delete(next);
      const now = this.clock.now().getTime();
      if (next.at > now) this.clock.advance(next.at - now);
      next.run();
      await settle();
    }
    const now = this.clock.now().getTime();
    if (target > now) this.clock.advance(target - now);
    await settle();
  }
}

// ---------------------------------------------------------------------------------------------
// Storage

export interface Saved {
  readonly at: number;
  readonly revision: number;
  readonly chunks: number;
  readonly bytes: number;
}

/** The room's storage in memory, recording every write. */
export class MemoryStorage implements RoomStorage {
  revision = 0;
  chunks: Uint8Array[] | undefined;
  /** Every write, in order. */
  readonly saves: Saved[] = [];
  destroyed = 0;
  /** Makes the next writes fail, for the tests of a storage that refuses. */
  failures = 0;

  constructor(private readonly now: () => number = () => 0) {}

  load() {
    return this.chunks ? { revision: this.revision, chunks: this.chunks } : undefined;
  }

  save(revision: number, chunks: readonly Uint8Array[]): void {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("the storage refused the write");
    }
    // A copy, as a real storage has: the room may keep reusing its buffers.
    this.chunks = chunks.map((chunk) => chunk.slice());
    this.revision = revision;
    this.saves.push({
      at: this.now(),
      revision,
      chunks: chunks.length,
      bytes: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
    });
  }

  destroy(): void {
    this.chunks = undefined;
    this.revision = 0;
    this.destroyed++;
  }

  /** The document the storage holds, decoded. */
  document(): Y.Doc {
    const doc = new Y.Doc();
    // The chunks are slices of ONE encoded update: it is the whole that is applied.
    const chunks = this.chunks ?? [];
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    if (bytes.length > 0) Y.applyUpdate(doc, bytes);
    return doc;
  }
}

// ---------------------------------------------------------------------------------------------
// Sockets

export interface Decoded {
  readonly kind: number;
  readonly payload: Uint8Array;
  /** The payload as JSON, for `hello`, `error` and `awareness`. */
  readonly json?: Record<string, unknown>;
}

export function decode(bytes: Uint8Array): Decoded {
  const message = parseFrame(bytes);
  if (!message) throw new Error("an empty message");
  if (
    message.kind === KIND.hello ||
    message.kind === KIND.error ||
    message.kind === KIND.awareness
  ) {
    return {
      ...message,
      json: JSON.parse(new TextDecoder().decode(message.payload)) as Record<string, unknown>,
    };
  }
  return message;
}

/** What the platform lets a socket's attachment hold, in the bytes of the V8 serialisation. */
export const PLATFORM_ATTACHMENT_BYTES = 2048;

/** The room's end of a socket. */
export class FakeConnection implements RoomSocket {
  open = true;
  closed: { code: number; reason: string } | undefined;
  /** Every message the room sent, in order. */
  readonly sent: Uint8Array[] = [];
  /** Makes `send` throw, as a socket whose other end is gone does. */
  broken = false;
  onSend: ((data: Uint8Array) => void) | undefined;
  onClose: (() => void) | undefined;
  /** The awareness record in the socket's attachment: the platform keeps it, the room does not. */
  awareness: AwarenessRecord | undefined;
  /** How many times the room wrote the attachment. */
  attachmentWrites = 0;

  constructor(readonly info: RoomSocket["info"]) {}

  /** The size of the attachment (identity and record) as the platform would serialise it. */
  get attachmentBytes(): number {
    return serialize(this.awareness ? { ...this.info, aw: this.awareness } : this.info).length;
  }

  keepAwareness(record: AwarenessRecord | undefined): void {
    const next = record ? { ...this.info, aw: record } : this.info;
    // The platform refuses an attachment over 2 KiB, and keeps the old one.
    if (serialize(next).length > PLATFORM_ATTACHMENT_BYTES) {
      throw new Error("the attachment is over 2 KiB");
    }
    this.awareness = record;
    this.attachmentWrites++;
  }

  send(data: Uint8Array): void {
    if (!this.open || this.broken) throw new Error("the socket is closed");
    this.sent.push(data);
    this.onSend?.(data);
  }

  close(code: number, reason: string): void {
    if (!this.open) return;
    this.open = false;
    this.closed = { code, reason };
    this.onClose?.();
  }
}

/** A page's end of a socket to a room: its own document, and what the room said. */
export class RoomClient {
  readonly doc: Y.Doc;
  readonly cloud: CloudDoc;
  /** Every message the room sent, decoded, in order. */
  readonly messages: Decoded[] = [];
  /** The codes of the `error` messages the room sent. */
  readonly errors: string[] = [];
  /** The room's state vector, as its last kind 0 message said. */
  roomVector: Uint8Array | undefined;

  /** `doc` is the copy the page already holds when it reconnects; a new page has none. */
  constructor(
    readonly connection: FakeConnection,
    private readonly room: () => RoomCore,
    doc: Y.Doc = new Y.Doc(),
  ) {
    this.doc = doc;
    this.cloud = cloudDoc(doc);
    connection.onSend = (data) => this.receive(data);
  }

  get hello(): Record<string, unknown> | undefined {
    return this.messages.find((message) => message.kind === KIND.hello)?.json;
  }

  /** How the socket closed, if it did. */
  get closed(): { code: number; reason: string } | undefined {
    return this.connection.closed;
  }

  private receive(data: Uint8Array): void {
    const message = decode(data);
    this.messages.push(message);
    if (message.kind === KIND.update) Y.applyUpdate(this.doc, message.payload, "room");
    else if (message.kind === KIND.sync) this.roomVector = message.payload;
    else if (message.kind === KIND.error) this.errors.push(String(message.json?.["code"]));
  }

  /** Sends a message to the room, as the socket would deliver it. */
  send(data: Uint8Array | string): Promise<void> {
    return this.room().message(this.connection, data);
  }

  /** The state vector of this client, sent as kind 0. */
  sync(): Promise<void> {
    return this.send(frame(KIND.sync, Y.encodeStateVector(this.doc)));
  }

  /** Sends everything the room is known to lack (what its state vector says), as kind 1. */
  async push(): Promise<void> {
    await this.send(frame(KIND.update, Y.encodeStateAsUpdate(this.doc, this.roomVector)));
  }

  /**
   * Makes a local change as the page does (one transaction) and sends its update; answers the
   * update's bytes.
   */
  async edit(run: (cloud: CloudDoc) => void): Promise<Uint8Array> {
    let update: Uint8Array = new Uint8Array(0);
    const onUpdate = (u: Uint8Array) => (update = u);
    this.doc.on("update", onUpdate);
    this.doc.transact(() => run(this.cloud), "local");
    this.doc.off("update", onUpdate);
    await this.send(frame(KIND.update, update));
    return update;
  }

  /** The room's messages of one kind. */
  of(kind: number): Decoded[] {
    return this.messages.filter((message) => message.kind === kind);
  }

  /**
   * Publishes this client's awareness state as the page does: a kind 2 message holding one entry,
   * keyed by its connection id. `state` is what the page would send (a `user` in it is a forgery).
   */
  awareness(state: unknown): Promise<void> {
    return this.send(awarenessFrame({ [this.connection.info.id]: state }));
  }

  /** The awareness messages the room sent, as the maps they carry, in order. */
  get peers(): Record<string, Record<string, unknown> | null>[] {
    return this.of(KIND.awareness).map(
      (message) => message.json as Record<string, Record<string, unknown> | null>,
    );
  }

  /** Leaves, as a person closing the page does. */
  async leave(): Promise<void> {
    if (this.connection.open) {
      this.connection.open = false;
      await this.room().closed(this.connection);
    }
  }
}

/** A kind 2 message holding this value as its JSON. */
export const awarenessFrame = (value: unknown): Uint8Array => jsonFrame(KIND.awareness, value);

// ---------------------------------------------------------------------------------------------
// The rooms

export interface MemoryRoomsOptions {
  /** The store whose `project_blobs` the room asks about a hash (a fresh one by default). */
  readonly store: CloudStore;
  readonly clock: RoomClock;
  /** What `materialise()` does; by default it counts and writes no rows. */
  readonly materialise?: (input: MaterialiseInput) => Promise<{ rowsWritten: number } | "gone">;
  /** Limits narrower than the real ones. */
  readonly limits?: Partial<RoomLimits>;
  /** Seeds the ids the room invents. */
  readonly random?: (length: number) => Uint8Array;
}

/** One project's room in memory: the core, its storage and the sockets attached to it. */
export class MemoryRoom {
  core!: RoomCore;
  readonly storage: MemoryStorage;
  readonly connections: FakeConnection[] = [];
  readonly clients: RoomClient[] = [];
  /** What `materialise()` was given, in order. */
  readonly materialised: MaterialiseInput[] = [];
  /** Lines the room logged. */
  readonly warnings: string[] = [];
  private ids = 0;
  /** The timers the current object has set: an eviction takes them with it. */
  private handles = new Set<unknown>();
  /** The platform's alarm for this room (it keeps one, and an eviction does not take it). */
  alarmAt: number | undefined;
  /** Every time the room set the alarm, in order, and for when. */
  readonly alarmsSet: number[] = [];
  /** Makes the next attempts to set the alarm fail. */
  alarmFailures = 0;
  private alarmHandle: unknown;

  constructor(
    readonly projectId: string,
    private readonly rooms: MemoryRoomsContext,
  ) {
    this.storage = new MemoryStorage(() => rooms.clock.now().getTime());
    this.core = this.build();
  }

  /** The platform's side of `setAlarm`: one alarm, replaced by the next; it calls the object that is alive when it fires. */
  private setAlarm(at: number): void {
    if (this.alarmFailures > 0) {
      this.alarmFailures--;
      throw new Error("the platform refused the alarm");
    }
    const { clock, timers } = this.rooms;
    if (this.alarmHandle !== undefined) timers.clear(this.alarmHandle);
    this.alarmsSet.push(at);
    this.alarmAt = at;
    const handle = timers.set(Math.max(0, at - clock.now().getTime()), () => {
      if (this.alarmHandle === handle) {
        this.alarmHandle = undefined;
        this.alarmAt = undefined;
      }
      void this.core.alarm();
    });
    this.alarmHandle = handle;
  }

  private build(): RoomCore {
    const { clock, timers, options } = this.rooms;
    const handles = new Set<unknown>();
    this.handles = handles;
    return new RoomCore({
      storage: this.storage,
      now: () => clock.now().getTime(),
      setTimer: (milliseconds, run) => {
        const handle = timers.set(milliseconds, () => {
          handles.delete(handle);
          run();
        });
        handles.add(handle);
        return handle;
      },
      clearTimer: (handle) => {
        handles.delete(handle);
        timers.clear(handle);
      },
      setAlarm: async (at) => this.setAlarm(at),
      sockets: () => this.connections.filter((connection) => connection.open),
      projectId: () => this.projectId,
      hasBlob: (hash) => options.store.hasProjectBlob(this.projectId, hash),
      materialise: async (input) => {
        this.materialised.push(input);
        return options.materialise ? options.materialise(input) : { rowsWritten: 0 };
      },
      randomBytes: options.random ?? this.rooms.random,
      warn: (message) => this.warnings.push(message),
      ...(options.limits ? { limits: options.limits } : {}),
    });
  }

  /**
   * The object is evicted and constructed again over the same storage: whatever was not written
   * is gone, the timers are gone, and the sockets (which the platform keeps) are still there.
   */
  evict(): RoomCore {
    for (const handle of this.handles) this.rooms.timers.clear(handle);
    this.core = this.build();
    return this.core;
  }

  /** Opens a socket as a client of the room (as the platform does once the Worker passed the upgrade). */
  async open(identity: Partial<RoomIdentity> = {}, doc?: Y.Doc): Promise<RoomClient> {
    const info = {
      id: `c${++this.ids}`,
      sub: identity.sub ?? "user-1",
      role: identity.role ?? "owner",
      name: identity.name ?? "Ana",
      picture: identity.picture ?? "",
    };
    const connection = new FakeConnection(info);
    const client = new RoomClient(connection, () => this.core, doc);
    // The platform tells the room when a socket closed, however it closed.
    // A moment later, as the platform does: messages the client had already sent still arrive first.
    connection.onClose = () => setImmediate(() => void this.core.closed(connection));
    this.connections.push(connection);
    this.clients.push(client);
    await this.core.connect(connection);
    return client;
  }
}

interface MemoryRoomsContext {
  readonly clock: RoomClock;
  readonly timers: FakeTimers;
  readonly options: MemoryRoomsOptions;
  readonly random: (length: number) => Uint8Array;
}

/** What the Worker asked of `connect()`. */
export interface ConnectCall {
  readonly projectId: string;
  readonly request: Request;
  readonly identity: RoomIdentity;
  readonly client: RoomClient;
}

export interface MemoryRooms extends RoomsApi {
  /** The room of a project; made when first asked for. */
  room(projectId: string): MemoryRoom;
  /** The `connect()` calls made through the API, in order. */
  readonly connects: ConnectCall[];
  /** The client a `connect()` answer stands for. */
  clientOf(response: Response): RoomClient;
  /** Moves the clock forward, running the timers of every room that fall due. */
  advance(milliseconds: number): Promise<void>;
  readonly timers: FakeTimers;
}

/** An `ApiError` for what a room refused, as the Durable Object's client turns it. */
export function apiErrorOf(error: unknown): unknown {
  if (error instanceof RoomError) return fail(error.code as ErrorCode, undefined, error.details);
  return error;
}

// ---------------------------------------------------------------------------------------------
// Shorthands the tests of the rooms share

/** A project id as the Worker accepts it. */
export const PROJECT = "01h2x5z8kq3m7n9p2r4t";
/** Another project's id. */
export const OTHER_PROJECT = "01h2x5z8kq3m7n9p2r4u";
/** A hash the project has uploaded (see `world`). */
export const HASH = "a".repeat(64);
/** A hash it never uploaded. */
export const UNKNOWN_HASH = "c".repeat(64);

/** File ids as a page would make them. */
export const A = "aaaaaaaaaaaaaaaa";
export const B = "bbbbbbbbbbbbbbbb";
export const C = "cccccccccccccccc";
export const D = "dddddddddddddddd";

/** Adds a text file the way the page does (the text and the path in one transaction) and sends it. */
export function addText(
  client: RoomClient,
  id: string,
  path: string,
  text = "",
): Promise<Uint8Array> {
  return client.edit((cloud) => {
    const created = new Y.Text();
    cloud.files.set(id, created);
    if (text !== "") created.insert(0, text);
    cloud.paths.set(id, path);
  });
}

/** Types at the end of a text file the client holds, as one transaction, and sends it. */
export function typeInto(client: RoomClient, id: string, text: string): Promise<Uint8Array> {
  return client.edit((cloud) => {
    const file = cloud.files.get(id) as Y.Text;
    file.insert(file.length, text);
  });
}

/** The text of a file the client holds. */
export const textOf = (client: RoomClient, id: string): string =>
  (client.cloud.files.get(id) as Y.Text).toString();

export interface World {
  readonly clock: RoomClock & { set(iso: string): void };
  readonly store: CloudStore;
  readonly rooms: MemoryRooms;
  readonly room: MemoryRoom;
  /** Opens a client of the owner on `PROJECT`'s room. */
  open(identity?: Partial<RoomIdentity>, doc?: Y.Doc): Promise<RoomClient>;
}

/**
 * A room of `PROJECT` over a store that holds the project (its owner is `u1`) and the blob `HASH`,
 * a fake clock and in-memory rooms: what a test of the room's rules needs.
 */
export async function world(options: {
  clock: World["clock"];
  store: CloudStore;
  materialise?: MemoryRoomsOptions["materialise"];
  limits?: MemoryRoomsOptions["limits"];
}): Promise<World> {
  const { store, clock } = options;
  const created = await store.createProject(
    {
      id: PROJECT,
      ownerSub: "u1",
      name: "Project",
      description: "",
      createdAt: clock.now().toISOString(),
    },
    100,
  );
  if (created !== "created") throw new Error("the test project was not created");
  await store.addProjectBlob(PROJECT, HASH);
  const rooms = memoryRooms({
    store,
    clock,
    ...(options.materialise ? { materialise: options.materialise } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
  });
  const room = rooms.room(PROJECT);
  return { clock, store, rooms, room, open: (identity, doc) => room.open(identity, doc) };
}

export function memoryRooms(options: MemoryRoomsOptions): MemoryRooms {
  const timers = new FakeTimers(options.clock);
  let seed = 1;
  const random = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      bytes[i] = seed >>> 24;
    }
    return bytes;
  };
  const context: MemoryRoomsContext = { clock: options.clock, timers, options, random };
  const rooms = new Map<string, MemoryRoom>();
  const connects: ConnectCall[] = [];
  const responses = new WeakMap<Response, RoomClient>();

  const room = (projectId: string): MemoryRoom => {
    let found = rooms.get(projectId);
    if (!found) {
      found = new MemoryRoom(projectId, context);
      rooms.set(projectId, found);
    }
    return found;
  };
  /** Runs a room's operation; what it refuses is thrown as the `ApiError` the Worker would get. */
  const call = async <T>(run: () => Promise<T> | T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      throw apiErrorOf(error);
    }
  };

  const api: MemoryRooms = {
    room,
    connects,
    timers,
    clientOf(response) {
      const client = responses.get(response);
      if (!client) throw new Error("that response is not a socket the rooms opened");
      return client;
    },
    advance: (milliseconds) => timers.advance(milliseconds),

    async connect(projectId, request, identity) {
      const client = await call(() => room(projectId).open(identity));
      const response = new Response(null, { status: 200, headers: { "X-Test-Socket": "open" } });
      responses.set(response, client);
      connects.push({ projectId, request, identity, client });
      return response;
    },
    read: (projectId) => call(() => room(projectId).core.readFiles()),
    push: (projectId, body: PushRequest) => call(() => room(projectId).core.push(body)),
    restore: (projectId, files, binaries, ifRevision) =>
      call(() => room(projectId).core.restore(files, binaries, ifRevision)),
    async materialise(projectId) {
      const materialised = await room(projectId).core.materialiseNow();
      if (!materialised) throw fail("internal");
      return materialised;
    },
    destroy: (projectId) => call(() => room(projectId).core.destroy()),
    async stats(projectId): Promise<RoomStats> {
      return room(projectId).core.stats();
    },
    async disconnect(projectId, target: DisconnectTarget = {}) {
      return { closed: room(projectId).core.disconnect(target) };
    },
    async limits(projectId, request: RoomLimitsRequest) {
      return { clients: room(projectId).core.limitClients(request.clients) };
    },
  };
  return api;
}
