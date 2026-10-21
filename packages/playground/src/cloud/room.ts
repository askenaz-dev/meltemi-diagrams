// The page's side of a project's room (`cloud-document`, "The room's protocol"): one WebSocket to
// `wss://<origin>/rooms/<id>`, binary messages whose first byte is the kind, and a reconnection
// that backs off from one second to thirty. The socket and the timers are handed in, so a test
// plays the room and the clock. What an update means, and what to do about a refusal, is the
// caller's: this module speaks the protocol and keeps the connection.

import type { Timers } from "./binding.js";

/** The first byte of a message. */
export const KIND = { sync: 0, update: 1, awareness: 2, hello: 3, error: 4 } as const;

/**
 * The range of close codes the room uses to say why it closed a socket, and the one that says the
 * project is gone: the room closes every socket with it when its project is deleted.
 */
export const CLOSE_CODES = { first: 4400, last: 4429, gone: 4404 } as const;

/** The wait before the first reconnection, and the longest wait between two. */
export const BACKOFF = { initial: 1000, max: 30_000 } as const;

/** The wait before reopening a socket the room closed over a refusal (it doubles on repeats). */
export const REFUSED_BACKOFF = { initial: 500, max: 30_000 } as const;

/** `WebSocket.OPEN`: the only state in which a socket takes a message. */
const SOCKET_OPEN = 1;

/** The part of a `WebSocket` the room uses. */
export interface RoomSocket {
  /**
   * `WebSocket.readyState`. A browser that was told the connection ended (the room closed it) holds a
   * socket that is closing for a while before it reports the close, and logs an error for every
   * message tried on it; a stand-in with none takes messages as long as the page thinks it is open.
   */
  readonly readyState?: number;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

/** Makes a socket to an address; a real page makes a `WebSocket`. */
export type SocketFactory = (url: string) => RoomSocket;

/** What the room says first: who the page is to the project, and the limits that hold. */
export interface RoomHello {
  readonly role: string | undefined;
  readonly revision: number | undefined;
  readonly limits: unknown;
  readonly collisions: unknown;
  readonly you: unknown;
}

/** The room closed a socket because it refused something the page sent. */
export interface Refusal {
  /** The room's code (`doc.too-large`, `path.invalid`, ...), from its kind 4 message or the close code. */
  readonly code: string;
  /** The close code the socket ended with (4400 to 4429), or what the browser reported. */
  readonly closeCode: number;
}

/** Where the connection is. */
export type RoomPhase =
  /** Nothing asked yet, or the page closed it. */
  | "idle"
  /** A socket is opening, or open and waiting for the room's hello. */
  | "connecting"
  /** The room said hello: updates go and come. */
  | "open"
  /** The socket closed; the next attempt waits for its time. */
  | "waiting";

export interface RoomEvents {
  /** A Yjs update of the room (kind 1): the page applies it as a change from outside. */
  update(update: Uint8Array): void;
  /** The room said hello; the page's state vector has gone out already. */
  opened?(hello: RoomHello): void;
  /** The room sent its own state vector (kind 0): answer with what it lacks. */
  sync?(vector: Uint8Array): void;
  /** The room said it refused something (kind 4); the socket closes next. */
  error?(code: string): void;
  /** The socket closed because of a refusal. The connection reopens by itself after a wait. */
  refused?(refusal: Refusal): void;
  /**
   * The project is gone (the room closed with 4404 because it was deleted, from another device
   * say): the connection stopped for good, and trying again could only be answered the same way.
   */
  gone?(): void;
  /**
   * A socket ended without a refusal (a drop, or an attempt the network or the Worker did not
   * let through): `closes` of them in a row since the room last said hello. A project deleted
   * while the page was away is refused at the upgrade, which the browser reports as nothing but a
   * failed socket: the page asks the service whether the project is still there.
   */
  dropped?(closes: number): void;
  /** The connection's phase changed. */
  phase?(phase: RoomPhase): void;
  /** A presence message of the room (kind 2): the payload after the kind byte (`live-collaboration`). */
  awareness?(payload: Uint8Array): void;
}

export interface RoomOptions {
  readonly url: string;
  readonly socket: SocketFactory;
  readonly timers: Timers;
  /** The page's state vector now, asked after each hello. */
  readonly stateVector: () => Uint8Array;
  readonly events: RoomEvents;
  /**
   * The person is a viewer: the room receives their state vector (so that it answers with what
   * they lack) and nothing else. A viewer's update is refused by the room with 4403, and a page
   * that never sends one never provokes it.
   */
  readonly readOnly?: boolean;
}

/** The address of a project's room: the page's origin over `wss:` (`ws:` when the page is `http:`). */
export function roomUrl(page: string, id: string): string {
  const url = new URL(`/rooms/${encodeURIComponent(id)}`, page);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

/** A message: the kind, then the payload. */
export function frame(kind: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const message = new Uint8Array(1 + payload.byteLength);
  message[0] = kind;
  message.set(payload, 1);
  return message;
}

/** The bytes of a message's data, or undefined when it is not binary. */
function bytesOf(data: unknown): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}

/** The code a close without a kind 4 stands for. */
function codeOfClose(closeCode: number, reason: string | undefined): string {
  if (reason !== undefined && /^[a-z]+(?:[.-][a-z]+)+$/.test(reason)) return reason;
  if (closeCode === 4400) return "doc.invalid";
  if (closeCode === 4403) return "access.denied";
  if (closeCode === 4409) return "room.full";
  if (closeCode === 4413) return "doc.too-large";
  return `close.${closeCode}`;
}

const decoder = new TextDecoder();

function hello(payload: Uint8Array): RoomHello {
  let body: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      body = value as Record<string, unknown>;
    }
  } catch {
    // A hello the page cannot read still means the room is there.
  }
  return {
    role: typeof body["role"] === "string" ? body["role"] : undefined,
    revision: typeof body["revision"] === "number" ? body["revision"] : undefined,
    limits: body["limits"],
    collisions: body["collisions"],
    you: body["you"],
  };
}

/** The code of a kind 4 message. */
function errorCode(payload: Uint8Array): string {
  try {
    const value: unknown = JSON.parse(decoder.decode(payload));
    const code =
      value !== null && typeof value === "object" ? (value as { code?: unknown }).code : "";
    if (typeof code === "string" && code !== "") return code.slice(0, 80);
  } catch {
    // Unreadable: the close code says what it can.
  }
  return "";
}

/**
 * The connection to one room. It reconnects until `close()`: after a close it waits one second,
 * then two, doubling up to thirty, and starts again from one second once the room says hello. A
 * room that refused something is reopened after half a second (doubling on repeats): the caller
 * hears `refused` and decides what the page's document becomes.
 */
export class RoomConnection {
  private socket: RoomSocket | undefined;
  private current: RoomPhase = "idle";
  /** Which socket is the live one: events of an earlier socket are ignored. */
  private generation = 0;
  private timer: unknown;
  private failures = 0;
  private refusals = 0;
  private stopped = false;
  /** What the room said with kind 4 on this socket, until it closes. */
  private said: string | undefined;

  constructor(private readonly options: RoomOptions) {}

  get phase(): RoomPhase {
    return this.current;
  }

  /** Whether updates can go now. */
  get open(): boolean {
    return this.current === "open";
  }

  /** Opens the first socket, or reopens after `close()`. */
  connect(): void {
    this.stopped = false;
    if (this.current === "connecting" || this.current === "open") return;
    this.attempt();
  }

  /**
   * Sends an update (kind 1); false when it cannot go now (the caller keeps it for the next hello)
   * and always for a viewer's connection.
   */
  send(update: Uint8Array): boolean {
    if (this.options.readOnly === true) return false;
    return this.transmit(KIND.update, update);
  }

  /**
   * Sends a presence message (kind 2); false when it cannot go now. Unlike an update it goes for a
   * viewer too: where a viewer is and what they select is theirs to share, and changes nothing.
   */
  sendAwareness(payload: Uint8Array): boolean {
    return this.transmit(KIND.awareness, payload);
  }

  /**
   * Opens a socket now instead of waiting: the browser came back online, the page came back to the
   * front, or the person asked ("Try again" on a room that is full). The wait starts from one second
   * again. A socket the room refused has said why (kind 4) and is as good as closed, but its close
   * reaches a browser late (two seconds, locally): the page does not wait for it, it drops that
   * socket (whose events are ignored from now on) and opens the next one.
   */
  retryNow(): void {
    if (this.stopped) return;
    const refused = this.current === "connecting" && this.said !== undefined;
    if (this.current !== "waiting" && !refused) return;
    this.failures = 0;
    this.refusals = 0;
    const dropped = refused ? this.socket : undefined;
    // The new socket first: it ends the old one's right to speak, so the close below is not heard.
    this.attempt();
    try {
      dropped?.close(1000);
    } catch {
      // Closing is best effort.
    }
  }

  /**
   * Drops the live socket, if any, and opens another one now: the room hears the page's state
   * vector again at its hello, which matters when the page's document was replaced since the last.
   * The old socket's events are ignored from now on.
   */
  reopen(): void {
    if (this.stopped) return;
    this.failures = 0;
    this.refusals = 0;
    const dropped = this.socket;
    this.attempt();
    try {
      dropped?.close(1000);
    } catch {
      // Closing is best effort.
    }
  }

  /** Stops for good: closes the socket and never reconnects. */
  close(): void {
    this.stopped = true;
    this.generation++;
    this.options.timers.clear(this.timer);
    this.timer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.said = undefined;
    try {
      socket?.close(1000);
    } catch {
      // Closing is best effort.
    }
    this.move("idle");
  }

  private move(phase: RoomPhase): void {
    if (this.current === phase) return;
    this.current = phase;
    this.options.events.phase?.(phase);
  }

  private transmit(kind: number, payload: Uint8Array): boolean {
    if (this.current !== "open" || !this.socket) return false;
    // The browser is already closing this socket and has not said so yet (that takes a while after
    // the room closes it): nothing sent now would arrive, and trying logs an error in the console.
    if (this.socket.readyState !== undefined && this.socket.readyState !== SOCKET_OPEN) {
      return false;
    }
    try {
      this.socket.send(frame(kind, payload));
      return true;
    } catch {
      return false;
    }
  }

  private attempt(): void {
    this.options.timers.clear(this.timer);
    this.timer = undefined;
    const generation = ++this.generation;
    this.said = undefined;
    let socket: RoomSocket;
    try {
      socket = this.options.socket(this.options.url);
    } catch {
      this.socket = undefined;
      this.closed(generation, 1006, undefined);
      return;
    }
    this.socket = socket;
    this.move("connecting");
    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => this.message(generation, event.data);
    socket.onclose = (event) => this.closed(generation, event.code, event.reason);
    // A failed attempt closes the socket right after; the close carries all there is to say.
    socket.onerror = null;
    socket.onopen = null;
  }

  private message(generation: number, data: unknown): void {
    if (generation !== this.generation) return;
    const bytes = bytesOf(data);
    if (!bytes || bytes.byteLength === 0) return;
    const payload = bytes.subarray(1);
    switch (bytes[0]) {
      case KIND.hello:
        this.failures = 0;
        this.move("open");
        // The room's answer to this is what the page lacks; its hello says it is ready.
        this.transmit(KIND.sync, this.options.stateVector());
        this.options.events.opened?.(hello(payload));
        break;
      case KIND.update:
        this.refusals = 0;
        this.options.events.update(payload);
        break;
      case KIND.sync:
        this.options.events.sync?.(payload);
        break;
      case KIND.error: {
        const code = errorCode(payload);
        this.said = code;
        this.options.events.error?.(code);
        break;
      }
      case KIND.awareness:
        this.options.events.awareness?.(payload);
        break;
      default:
        break;
    }
  }

  private closed(generation: number, closeCode: number, reason: string | undefined): void {
    if (generation !== this.generation) return;
    this.socket = undefined;
    const said = this.said;
    this.said = undefined;
    if (this.stopped) return;
    if (closeCode === CLOSE_CODES.gone || said === "project.not-found") {
      // The project was deleted: no later socket could be answered differently.
      this.stopped = true;
      this.options.timers.clear(this.timer);
      this.timer = undefined;
      this.move("idle");
      this.options.events.gone?.();
      return;
    }
    const inRoomRange = closeCode >= CLOSE_CODES.first && closeCode <= CLOSE_CODES.last;
    if (said === undefined && !inRoomRange) {
      this.wait(BACKOFF.initial * 2 ** this.failures, BACKOFF.max);
      this.failures++;
      this.options.events.dropped?.(this.failures);
      return;
    }
    const code = said !== undefined && said !== "" ? said : codeOfClose(closeCode, reason);
    this.move("waiting");
    this.options.events.refused?.({ code, closeCode });
    if (this.stopped) return;
    this.schedule(Math.min(REFUSED_BACKOFF.max, REFUSED_BACKOFF.initial * 2 ** this.refusals));
    this.refusals++;
  }

  /** Waits (`initial * 2 ** failures`, capped) and tries again. */
  private wait(delay: number, max: number): void {
    this.move("waiting");
    this.schedule(Math.min(max, delay));
  }

  private schedule(delay: number): void {
    this.options.timers.clear(this.timer);
    this.timer = this.options.timers.set(() => {
      this.timer = undefined;
      if (!this.stopped) this.attempt();
    }, delay);
  }
}
