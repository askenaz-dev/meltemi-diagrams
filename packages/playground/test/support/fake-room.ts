// Stand-ins for the room's socket, for the tests of the page's room and of an open project. A
// `FakeNetwork` hands out sockets like `new WebSocket` does, and records them; a `FakeRoom` is the
// other end of those sockets: it speaks the protocol (hello, sync, update, error) over a real Yjs
// document, so that two clients and a room converge as they would for real. Nothing here touches
// a network.

import * as Y from "yjs";
import { KIND, frame, type RoomSocket } from "../../src/cloud/room.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A socket as the page sees it, with the room's side of it in `deliver` and `serverClose`. */
export class FakeSocket implements RoomSocket {
  binaryType = "blob";
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  /** What the page sent, in order. */
  readonly sent: Uint8Array[] = [];
  /** Where the page's messages go: the room's side. */
  peer: ((data: Uint8Array) => void) | undefined;
  /** Set when either side closed it. */
  closed: { code: number; reason?: string } | undefined;

  constructor(readonly url: string) {}

  send(data: Uint8Array): void {
    if (this.closed) throw new Error("The socket is closed.");
    this.sent.push(data);
    this.peer?.(data);
  }

  /** The page closes the socket. */
  close(code = 1005, reason?: string): void {
    if (this.closed) return;
    this.closed = { code, ...(reason === undefined ? {} : { reason }) };
    this.onclose?.(this.closed);
  }

  /** The room sends a message: the first byte is the kind. */
  deliver(kind: number, payload: Uint8Array = new Uint8Array(0)): void {
    if (this.closed) return;
    const message = frame(kind, payload);
    this.onmessage?.({
      data: message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength),
    });
  }

  /** The room says hello. */
  hello(body: Record<string, unknown> = { role: "owner", revision: 1 }): void {
    this.deliver(KIND.hello, encoder.encode(JSON.stringify(body)));
  }

  /** The room refuses something: kind 4, then it closes the socket. */
  refuse(code: string, closeCode: number): void {
    this.deliver(KIND.error, encoder.encode(JSON.stringify({ code })));
    this.serverClose(closeCode);
  }

  /** The room (or the network) ends the connection. */
  serverClose(code: number, reason?: string): void {
    if (this.closed) return;
    this.closed = { code, ...(reason === undefined ? {} : { reason }) };
    this.onclose?.(this.closed);
  }

  /** The messages the page sent of a kind. */
  sentOf(kind: number): Uint8Array[] {
    return this.sent.filter((message) => message[0] === kind).map((message) => message.slice(1));
  }
}

/** Hands out sockets and remembers them; a test or a `FakeRoom` listens for each new one. */
export class FakeNetwork {
  readonly sockets: FakeSocket[] = [];
  readonly urls: string[] = [];
  /** Called for every socket made, before the page gets it. */
  onSocket: ((socket: FakeSocket) => void) | undefined;
  /** Makes the factory throw, as a page does when the address is refused. */
  throwing = false;

  readonly factory = (url: string): RoomSocket => {
    if (this.throwing) throw new Error("The socket could not be made.");
    const socket = new FakeSocket(url);
    this.sockets.push(socket);
    this.urls.push(url);
    this.onSocket?.(socket);
    return socket;
  };

  get last(): FakeSocket {
    const socket = this.sockets.at(-1);
    if (!socket) throw new Error("No socket was made.");
    return socket;
  }
}

/** The room: a Yjs document and the clients connected to it. */
export class FakeRoom {
  readonly doc = new Y.Doc();
  readonly clients = new Set<FakeSocket>();
  /** What the room received, in order: the kind and the size of the payload. */
  readonly received: { kind: number; bytes: number }[] = [];
  /** Decides whether a client's update is refused: the code to say, or undefined to accept it. */
  refuses: ((update: Uint8Array, doc: Y.Doc) => string | undefined) | undefined;
  /** The close code that goes with a refusal. */
  closeCode = 4413;
  /** Whether new sockets are greeted at once; a test that wants to hold the hello sets it off. */
  greeting = true;
  /** The role the room's hello says the client has: `owner` unless a test is about another. */
  role = "owner";
  /** What else the room's hello says (a live session's `live`, the connection's `you`). */
  helloExtra: Record<string, unknown> = {};

  constructor(network?: FakeNetwork) {
    if (network) this.serve(network);
  }

  /** Answers the sockets a network makes from now on (a room outlives the pages that connect to it). */
  serve(network: FakeNetwork): void {
    network.onSocket = (socket) => this.attach(socket);
  }

  private attach(socket: FakeSocket): void {
    socket.peer = (data) => this.fromClient(socket, data);
    if (this.greeting) queueMicrotask(() => this.greet(socket));
  }

  /** Says hello to a socket and counts it among the clients. */
  greet(socket: FakeSocket): void {
    if (socket.closed) return;
    this.clients.add(socket);
    socket.hello({
      role: this.role,
      revision: this.received.length,
      limits: {},
      collisions: [],
      ...this.helloExtra,
    });
  }

  /** Drops every connection, as a network failure does: the page hears a close with no code. */
  drop(code = 1006): void {
    for (const socket of [...this.clients]) {
      this.clients.delete(socket);
      socket.serverClose(code);
    }
  }

  private fromClient(socket: FakeSocket, data: Uint8Array): void {
    const kind = data[0]!;
    const payload = data.slice(1);
    this.received.push({ kind, bytes: payload.byteLength });
    if (kind === KIND.sync) {
      // The room answers with what the client lacks.
      socket.deliver(KIND.update, Y.encodeStateAsUpdate(this.doc, payload));
    } else if (kind === KIND.update) {
      const refusal = this.refuses?.(payload, this.doc);
      if (refusal !== undefined) {
        this.clients.delete(socket);
        socket.refuse(refusal, this.closeCode);
        return;
      }
      Y.applyUpdate(this.doc, payload, socket);
      for (const other of this.clients) if (other !== socket) other.deliver(KIND.update, payload);
    }
  }

  /** A change made at the room (a push from the API, another client): every client hears it. */
  change(work: (doc: Y.Doc) => void): void {
    const updates: Uint8Array[] = [];
    const listen = (update: Uint8Array) => updates.push(update);
    this.doc.on("update", listen);
    this.doc.transact(() => work(this.doc), "api");
    this.doc.off("update", listen);
    for (const update of updates)
      for (const client of this.clients) client.deliver(KIND.update, update);
  }

  /** The text of a file, by its path. */
  text(path: string): string | undefined {
    const paths = this.doc.getMap<string>("paths");
    for (const [id, at] of paths) {
      if (at === path) return this.doc.getMap<Y.Text>("files").get(id)?.toString();
    }
    return undefined;
  }
}

/** Reads a hello or error payload as JSON. */
export function jsonOf(payload: Uint8Array): unknown {
  return JSON.parse(decoder.decode(payload));
}
