/**
 * A client of a project's room as a program is one (the command line, a script): a socket from Node
 * that sends the cookie of a person and records what the room says. The scenarios that need what the
 * page never does (a viewer that writes, a client that claims a role it was not given) use it; so
 * does the room's door in `scenarios-worker.ts`.
 */
import assert from "node:assert/strict";
import * as Y from "yjs";
import type { Person } from "./scenario.js";

/** A frame of the room: its kind and what follows. */
export interface Frame {
  readonly kind: number;
  readonly payload: Uint8Array;
}

/** The kinds of frame: a client's `sync` and `update`, both ways `awareness`, the room's `hello` and `error`. */
export const KIND = { sync: 0, update: 1, awareness: 2, hello: 3, error: 4 } as const;

/** A client of a room: a socket that records what the room says. */
export class RoomClient {
  readonly frames: Frame[] = [];
  closed: { code: number; reason: string } | undefined;
  private readonly socket: WebSocket;

  constructor(origin: string, id: string, person: Person, headers: Record<string, string> = {}) {
    const url = `${origin.replace(/^http/, "ws")}/rooms/${id}`;
    // `headers` is the runtime's own extension of the constructor: a program names its cookie.
    this.socket = new (
      WebSocket as unknown as new (
        url: string,
        options: { headers: Record<string, string> },
      ) => WebSocket
    )(url, { headers: { ...person.cookie, Origin: origin, ...headers } });
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("message", (event) => {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      this.frames.push({ kind: bytes[0] ?? -1, payload: bytes.subarray(1) });
    });
    this.socket.addEventListener("close", (event) => {
      this.closed = { code: event.code, reason: event.reason };
    });
  }

  send(kind: number, payload: Uint8Array = new Uint8Array(0)): void {
    const message = new Uint8Array(1 + payload.length);
    message[0] = kind;
    message.set(payload, 1);
    this.socket.send(message);
  }

  /** Waits (a few seconds at most) for a condition on what the room said. */
  async until(label: string, test: () => boolean): Promise<void> {
    const limit = Date.now() + 15_000;
    while (!test()) {
      if (Date.now() > limit) {
        const heard = this.frames.map((frame) => frame.kind).join(", ");
        const ended = this.closed
          ? `closed ${this.closed.code} ${this.closed.reason}`
          : "still open";
        throw new Error(`Timed out waiting: ${label} (heard kinds ${heard || "none"}; ${ended})`);
      }
      await new Promise((done) => setTimeout(done, 25));
    }
  }

  /** The JSON of the first frame of a kind. */
  json(kind: number): Record<string, unknown> {
    const frame = this.frames.find((held) => held.kind === kind);
    assert.ok(frame, `the room sent a frame of kind ${kind}`);
    return JSON.parse(new TextDecoder().decode(frame.payload)) as Record<string, unknown>;
  }

  close(): void {
    this.socket.close(1000);
  }
}

/** A client that has been given its hello and has read the project into a document of its own. */
export interface Joined {
  readonly client: RoomClient;
  readonly doc: Y.Doc;
  /** What the room called the person: `owner`, `editor` or `viewer`. */
  readonly role: unknown;
}

/** Connects as a person, waits for the hello and reads the whole document with a sync. */
export async function join(
  origin: string,
  id: string,
  person: Person,
  headers: Record<string, string> = {},
): Promise<Joined> {
  const client = new RoomClient(origin, id, person, headers);
  await client.until("the hello", () => client.frames.some((frame) => frame.kind === KIND.hello));
  const doc = new Y.Doc();
  client.send(KIND.sync, Y.encodeStateVector(doc));
  await client.until("the project", () =>
    client.frames.some((frame) => frame.kind === KIND.update),
  );
  Y.applyUpdate(doc, client.frames.find((frame) => frame.kind === KIND.update)!.payload);
  return { client, doc, role: client.json(KIND.hello)["role"] };
}

/** The update a change to a document makes: what a client would send the room. */
export function changeOf(doc: Y.Doc, change: () => void): Uint8Array {
  const updates: Uint8Array[] = [];
  const listen = (update: Uint8Array) => updates.push(update);
  doc.on("update", listen);
  doc.transact(change);
  doc.off("update", listen);
  const update = updates.pop();
  assert.ok(update, "the change made an update");
  return update;
}
