// The room's awareness for the tests of presence: it does what `live-collaboration` asks of the
// real room over the same fake sockets as `FakeRoom`. It says who a connection is in the hello
// (`you`), keeps each client's last state, replaces `user` on everything it relays with the identity
// of the sender whatever the message carried, tells a client that connects about the others before
// anything else, and tells everyone when a client goes. Nothing here touches a network.

import { presenceColour } from "@meltemi/diagrams-project";
import { KIND } from "../../src/cloud/room.js";
import type { FakeNetwork, FakeRoom, FakeSocket } from "./fake-room.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Who a connection is: what the Worker passed the room on the upgrade. */
export interface Identity {
  readonly sub: string;
  readonly name: string;
  readonly picture?: string;
}

/** One connection of the room. */
export interface Client {
  readonly id: string;
  readonly identity: Identity;
  readonly role: string;
  /** What the client last sent, as it sent it. */
  state: Record<string, unknown> | undefined;
}

const json = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

export class AwarenessRoom {
  /** The connected clients, by socket. */
  readonly clients = new Map<FakeSocket, Client>();
  /** Every kind 2 message the room received, in order: who sent it and what. */
  readonly received: { client: string; message: unknown }[] = [];
  /** Connections beyond this many are told the room is full. */
  limit = Infinity;
  private counter = 0;

  constructor(readonly room: FakeRoom) {
    // This room says hello itself, with `you`.
    room.greeting = false;
  }

  /** Answers the sockets a network makes, as `identity` with `role`. */
  serve(network: FakeNetwork, identity: Identity, role = "owner"): void {
    this.room.serve(network);
    const document = network.onSocket;
    network.onSocket = (socket) => {
      document?.(socket);
      this.attach(socket, identity, role);
    };
  }

  private attach(socket: FakeSocket, identity: Identity, role: string): void {
    if (this.clients.size >= this.limit) {
      queueMicrotask(() => socket.refuse("room.full", 4409));
      return;
    }
    const client: Client = { id: `c${++this.counter}`, identity, role, state: undefined };
    const documents = socket.peer;
    socket.peer = (data) => {
      if (data[0] === KIND.awareness) this.fromClient(client, data.slice(1));
      else documents?.(data);
    };
    // Whoever ends the socket, the others hear that the client is gone.
    const closeFromRoom = socket.serverClose.bind(socket);
    socket.serverClose = (code, reason) => {
      this.left(socket);
      closeFromRoom(code, reason);
    };
    const closeFromPage = socket.close.bind(socket);
    socket.close = (code, reason) => {
      this.left(socket);
      closeFromPage(code, reason);
    };
    queueMicrotask(() => this.greet(socket, client));
  }

  private greet(socket: FakeSocket, client: Client): void {
    if (socket.closed) return;
    this.room.clients.add(socket);
    socket.hello({
      role: client.role,
      revision: this.room.received.length,
      limits: {},
      collisions: [],
      you: { id: client.id, ...client.identity },
    });
    // The others' states come first, before any update.
    const others: Record<string, unknown> = {};
    for (const other of this.clients.values()) {
      if (other.state) others[other.id] = this.relayed(other);
    }
    this.clients.set(socket, client);
    if (Object.keys(others).length > 0) socket.deliver(KIND.awareness, json(others));
  }

  /** The state of a client as the room relays it: `user` is the room's, whatever was sent. */
  private relayed(client: Client): Record<string, unknown> {
    const { sub, name, picture } = client.identity;
    return {
      ...client.state,
      user: { sub, name, picture: picture ?? "", colour: presenceColour(sub) },
    };
  }

  private fromClient(client: Client, payload: Uint8Array): void {
    let message: unknown;
    try {
      message = JSON.parse(decoder.decode(payload));
    } catch {
      return;
    }
    this.received.push({ client: client.id, message });
    if (message === null || typeof message !== "object") return;
    // The message is a map keyed by client id; what is relayed is this client's, under its own id.
    const value = Object.values(message as Record<string, unknown>)[0];
    if (value === null || typeof value !== "object") return;
    client.state = value as Record<string, unknown>;
    this.tell(client, this.relayed(client));
  }

  /** Says something about a client to every other one. */
  private tell(about: Client, state: unknown): void {
    for (const [socket, other] of this.clients) {
      if (other === about || socket.closed) continue;
      socket.deliver(KIND.awareness, json({ [about.id]: state }));
    }
  }

  private left(socket: FakeSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;
    this.clients.delete(socket);
    this.room.clients.delete(socket);
    this.tell(client, null);
  }

  /** The room drops a client's state after thirty seconds of silence and tells the others. */
  expire(clientId: string): void {
    for (const client of this.clients.values()) {
      if (client.id !== clientId) continue;
      client.state = undefined;
      this.tell(client, null);
    }
  }

  /** The client of a socket. */
  clientOf(socket: FakeSocket): Client {
    const client = this.clients.get(socket);
    if (!client) throw new Error("The socket is not a client of the room.");
    return client;
  }
}
