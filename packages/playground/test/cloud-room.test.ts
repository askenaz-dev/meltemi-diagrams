import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  BACKOFF,
  KIND,
  REFUSED_BACKOFF,
  RoomConnection,
  frame,
  roomUrl,
  type Refusal,
  type RoomEvents,
  type RoomHello,
  type RoomPhase,
} from "../src/cloud/room.js";
import { ManualTimers } from "./support/clock.js";
import { FakeNetwork } from "./support/fake-room.js";

const URL_OF_ROOM = "wss://diagrams.example/rooms/abcdefghij0123456789";

interface Rig {
  readonly network: FakeNetwork;
  readonly timers: ManualTimers;
  readonly connection: RoomConnection;
  readonly updates: Uint8Array[];
  readonly hellos: RoomHello[];
  readonly phases: RoomPhase[];
  readonly errors: string[];
  readonly refusals: Refusal[];
  readonly asked: Uint8Array[];
  /** The state vector the page has: changes as the test says. */
  vector: Uint8Array;
}

function rig(events: Partial<RoomEvents> = {}): Rig {
  const network = new FakeNetwork();
  const timers = new ManualTimers();
  const updates: Uint8Array[] = [];
  const hellos: RoomHello[] = [];
  const phases: RoomPhase[] = [];
  const errors: string[] = [];
  const refusals: Refusal[] = [];
  const asked: Uint8Array[] = [];
  const state = { vector: new Uint8Array([0]) };
  const connection = new RoomConnection({
    url: URL_OF_ROOM,
    socket: network.factory,
    timers,
    stateVector: () => state.vector,
    events: {
      update: (update) => updates.push(update),
      opened: (hello) => hellos.push(hello),
      sync: (vector) => asked.push(vector),
      error: (code) => errors.push(code),
      refused: (refusal) => refusals.push(refusal),
      phase: (phase) => phases.push(phase),
      ...events,
    },
  });
  return {
    network,
    timers,
    connection,
    updates,
    hellos,
    phases,
    errors,
    refusals,
    asked,
    get vector() {
      return state.vector;
    },
    set vector(value) {
      state.vector = value;
    },
  };
}

describe("a room's address", () => {
  it("is the page's origin over wss, or ws when the page is http", () => {
    expect(roomUrl("https://diagrams.example/?project=x#p=y", "abc")).toBe(
      "wss://diagrams.example/rooms/abc",
    );
    expect(roomUrl("http://127.0.0.1:8787/", "abc")).toBe("ws://127.0.0.1:8787/rooms/abc");
    expect(roomUrl("https://diagrams.example/some/where/", "a b")).toBe(
      "wss://diagrams.example/rooms/a%20b",
    );
  });
});

describe("a message", () => {
  it("has its kind in the first byte", () => {
    expect(frame(KIND.update, new Uint8Array([9, 8]))).toEqual(new Uint8Array([1, 9, 8]));
    expect(frame(KIND.sync)).toEqual(new Uint8Array([0]));
  });
});

describe("the protocol", () => {
  it("asks for binary messages and sends its state vector after the room's hello, not before", () => {
    const r = rig();
    r.vector = new Uint8Array([3, 1, 2, 3]);
    r.connection.connect();
    expect(r.network.urls).toEqual([URL_OF_ROOM]);
    expect(r.network.last.binaryType).toBe("arraybuffer");
    expect(r.connection.phase).toBe("connecting");
    expect(r.network.last.sent).toEqual([]);
    r.network.last.hello({
      role: "owner",
      revision: 5,
      limits: { a: 1 },
      collisions: [],
      you: { n: 1 },
    });
    expect(r.connection.phase).toBe("open");
    expect(r.network.last.sent).toEqual([new Uint8Array([KIND.sync, 3, 1, 2, 3])]);
    expect(r.hellos).toEqual([
      { role: "owner", revision: 5, limits: { a: 1 }, collisions: [], you: { n: 1 } },
    ]);
    expect(r.phases).toEqual(["connecting", "open"]);
  });

  it("goes on with a hello it cannot read", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.deliver(KIND.hello, new TextEncoder().encode("not json"));
    expect(r.connection.phase).toBe("open");
    expect(r.hellos).toEqual([
      {
        role: undefined,
        revision: undefined,
        limits: undefined,
        collisions: undefined,
        you: undefined,
      },
    ]);
  });

  it("hands the room's updates over as bytes", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.deliver(KIND.update, new Uint8Array([1, 2, 3]));
    r.network.last.deliver(KIND.update, new Uint8Array(0));
    expect(r.updates).toEqual([new Uint8Array([1, 2, 3]), new Uint8Array(0)]);
  });

  it("sends updates as kind 1 once open, and not before", () => {
    const r = rig();
    r.connection.connect();
    expect(r.connection.send(new Uint8Array([7]))).toBe(false);
    r.network.last.hello();
    expect(r.connection.send(new Uint8Array([7, 8]))).toBe(true);
    expect(r.network.last.sentOf(KIND.update)).toEqual([new Uint8Array([7, 8])]);
  });

  it("answers the room's own state vector with what the room lacks", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.deliver(KIND.sync, new Uint8Array([0]));
    expect(r.asked).toEqual([new Uint8Array([0])]);
  });

  it("ignores awareness, messages of a kind it does not know, empty messages and text", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.deliver(KIND.awareness, new Uint8Array([1]));
    r.network.last.deliver(99, new Uint8Array([1]));
    r.network.last.onmessage?.({ data: new ArrayBuffer(0) });
    r.network.last.onmessage?.({ data: "text" });
    r.network.last.onmessage?.({ data: undefined });
    expect(r.updates).toEqual([]);
    expect(r.connection.phase).toBe("open");
  });

  it("reads a message that arrives as a typed array", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    const view = new Uint8Array([KIND.update, 5, 6]);
    r.network.last.onmessage?.({ data: view });
    expect(r.updates).toEqual([new Uint8Array([5, 6])]);
  });

  it("round-trips a real document", () => {
    const doc = new Y.Doc();
    doc.getText("t").insert(0, "hello");
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.connection.send(Y.encodeStateAsUpdate(doc));
    const received = new Y.Doc();
    Y.applyUpdate(received, r.network.last.sentOf(KIND.update)[0]!);
    expect(received.getText("t").toString()).toBe("hello");
  });
});

describe("reconnecting", () => {
  it("waits one second, then two, doubling up to thirty, and keeps to thirty", () => {
    const r = rig();
    r.connection.connect();
    const waits: number[] = [];
    for (let i = 0; i < 9; i++) {
      r.network.last.serverClose(1006);
      expect(r.connection.phase).toBe("waiting");
      waits.push(...r.timers.delays());
      r.timers.runNext();
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000]);
    expect(BACKOFF).toEqual({ initial: 1000, max: 30000 });
    expect(r.network.sockets).toHaveLength(10);
  });

  it("opens a new socket to the same address when the wait is over, and not before", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.serverClose(1006);
    r.timers.advance(999);
    expect(r.network.sockets).toHaveLength(1);
    r.timers.advance(1);
    expect(r.network.sockets).toHaveLength(2);
    expect(r.network.urls).toEqual([URL_OF_ROOM, URL_OF_ROOM]);
    expect(r.connection.phase).toBe("connecting");
  });

  it("starts again from one second once the room has said hello", () => {
    const r = rig();
    r.connection.connect();
    for (let i = 0; i < 3; i++) {
      r.network.last.serverClose(1006);
      r.timers.runNext();
    }
    r.network.last.hello();
    r.network.last.serverClose(1006);
    expect(r.timers.delays()).toEqual([1000]);
  });

  it("sends its state vector again at every hello, as the page holds it then", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.vector = new Uint8Array([1, 9]);
    r.network.last.serverClose(1006);
    r.timers.runNext();
    r.network.last.hello();
    expect(r.network.last.sent).toEqual([new Uint8Array([KIND.sync, 1, 9])]);
  });

  it("does not send while the socket is down, or while a new one waits for its hello", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(1006);
    expect(r.connection.send(new Uint8Array([1]))).toBe(false);
    r.timers.runNext();
    expect(r.connection.send(new Uint8Array([1]))).toBe(false);
    r.network.last.hello();
    expect(r.connection.send(new Uint8Array([1]))).toBe(true);
  });

  it("does not try a socket the browser is closing and has not reported closed, which logs an error each time", () => {
    const r = rig();
    r.connection.connect();
    const socket = r.network.last;
    socket.hello();
    // A real socket says it is open (1); the room closes it, the close reaches the page late and the
    // browser holds it closing (2), then closed (3), until it does.
    Object.assign(socket, { readyState: 1 });
    expect(r.connection.send(new Uint8Array([1]))).toBe(true);
    expect(r.connection.sendAwareness(new Uint8Array([2]))).toBe(true);
    const sent = socket.sent.length;
    for (const state of [2, 3]) {
      Object.assign(socket, { readyState: state });
      expect(r.connection.send(new Uint8Array([3]))).toBe(false);
      expect(r.connection.sendAwareness(new Uint8Array([4]))).toBe(false);
    }
    expect(socket.sent).toHaveLength(sent);
    // The page still thinks the connection is open until the close arrives, and reconnects then.
    expect(r.connection.phase).toBe("open");
    socket.serverClose(1006);
    expect(r.connection.phase).not.toBe("open");
    r.timers.runNext();
    r.network.last.hello();
    expect(r.network.last).not.toBe(socket);
    expect(r.connection.send(new Uint8Array([5]))).toBe(true);
  });

  it("treats a socket that cannot be made as a failed attempt", () => {
    const r = rig();
    r.network.throwing = true;
    r.connection.connect();
    expect(r.connection.phase).toBe("waiting");
    expect(r.timers.delays()).toEqual([1000]);
    r.network.throwing = false;
    r.timers.runNext();
    expect(r.connection.phase).toBe("connecting");
  });

  it("opens a socket at once when the browser comes back, and starts the waits over", () => {
    const r = rig();
    r.connection.connect();
    for (let i = 0; i < 4; i++) {
      r.network.last.serverClose(1006);
      r.timers.runNext();
    }
    r.network.last.serverClose(1006);
    expect(r.timers.delays()).toEqual([16000]);
    r.connection.retryNow();
    expect(r.timers.waiting).toBe(0);
    expect(r.connection.phase).toBe("connecting");
    r.network.last.serverClose(1006);
    expect(r.timers.delays()).toEqual([1000]);
  });

  it("retries now only while it waits", () => {
    const r = rig();
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(0);
    r.connection.connect();
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(1);
    r.network.last.hello();
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(1);
  });

  it("stops for good when the page closes it", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    const socket = r.network.last;
    r.connection.close();
    expect(socket.closed?.code).toBe(1000);
    expect(r.connection.phase).toBe("idle");
    r.timers.advance(100_000);
    expect(r.network.sockets).toHaveLength(1);
    expect(r.connection.send(new Uint8Array([1]))).toBe(false);
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(1);
  });

  it("stops waiting when the page closes it during a wait", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.serverClose(1006);
    r.connection.close();
    r.timers.advance(100_000);
    expect(r.network.sockets).toHaveLength(1);
  });

  it("ignores what an earlier socket says after a newer one was made", () => {
    const r = rig();
    r.connection.connect();
    const first = r.network.last;
    first.hello();
    first.serverClose(1006);
    r.timers.runNext();
    const second = r.network.last;
    first.onmessage?.({ data: frame(KIND.update, new Uint8Array([1])).buffer });
    first.onclose?.({ code: 1006 });
    expect(r.updates).toEqual([]);
    expect(r.connection.phase).toBe("connecting");
    second.hello();
    expect(r.connection.phase).toBe("open");
  });

  it("connects again after it was closed", () => {
    const r = rig();
    r.connection.connect();
    r.connection.close();
    r.connection.connect();
    expect(r.network.sockets).toHaveLength(2);
    expect(r.connection.phase).toBe("connecting");
  });

  it("does not open a second socket when asked to connect twice", () => {
    const r = rig();
    r.connection.connect();
    r.connection.connect();
    expect(r.network.sockets).toHaveLength(1);
    r.network.last.hello();
    r.connection.connect();
    expect(r.network.sockets).toHaveLength(1);
  });
});

describe("a refusal", () => {
  it("is a kind 4 message and a close in the room's range: the page hears the code and the close", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.refuse("doc.too-large", 4413);
    expect(r.errors).toEqual(["doc.too-large"]);
    expect(r.refusals).toEqual([{ code: "doc.too-large", closeCode: 4413 }]);
    expect(r.connection.phase).toBe("waiting");
  });

  it("reopens the socket after half a second, doubling while it keeps being refused", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      r.network.last.refuse("path.invalid", 4400);
      waits.push(...r.timers.delays());
      r.timers.runNext();
      r.network.last.hello();
    }
    expect(waits).toEqual([500, 1000, 2000, 4000]);
    expect(REFUSED_BACKOFF.initial).toBe(500);
  });

  it("starts the refused waits over once the room answers with an update", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.refuse("path.invalid", 4400);
    r.timers.runNext();
    r.network.last.hello();
    r.network.last.deliver(KIND.update, new Uint8Array([0, 0]));
    r.network.last.refuse("path.invalid", 4400);
    expect(r.timers.delays()).toEqual([500]);
  });

  it("is told by the close code alone when the room sent no kind 4", () => {
    const expected: [number, string][] = [
      [4400, "doc.invalid"],
      [4403, "access.denied"],
      [4409, "room.full"],
      [4413, "doc.too-large"],
      [4420, "close.4420"],
    ];
    for (const [closeCode, code] of expected) {
      const r = rig();
      r.connection.connect();
      r.network.last.serverClose(closeCode);
      expect(r.refusals).toEqual([{ code, closeCode }]);
    }
  });

  it("takes the reason of a close that names a code", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.serverClose(4400, "path.invalid");
    expect(r.refusals).toEqual([{ code: "path.invalid", closeCode: 4400 }]);
  });

  it("counts a kind 4 as a refusal whatever the close code is", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.refuse("blob.unknown", 1011);
    expect(r.refusals).toEqual([{ code: "blob.unknown", closeCode: 1011 }]);
  });

  it("is not a refusal when the close is another one", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    for (const code of [1000, 1001, 1006, 1011, 4399, 4430]) {
      r.network.last.serverClose(code);
      r.timers.runNext();
      r.network.last.hello();
    }
    expect(r.refusals).toEqual([]);
  });

  it("is not one when the room closes with 4404: the project is gone", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(4404, "project.not-found");
    expect(r.refusals).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("is retried at once when the page asks, without waiting for the close that reaches it late", () => {
    const r = rig();
    r.connection.connect();
    const refused = r.network.last;
    // The room said why with kind 4; over a real network its close arrives some seconds later.
    refused.deliver(KIND.error, new TextEncoder().encode(JSON.stringify({ code: "room.full" })));
    expect(r.errors).toEqual(["room.full"]);
    expect(r.connection.phase).toBe("connecting");
    expect(r.timers.waiting).toBe(0);

    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(2);
    expect(refused.closed?.code).toBe(1000);
    expect(r.connection.phase).toBe("connecting");
    // The close of the refused socket is not heard: no refusal, no wait behind the new socket's back.
    refused.serverClose(4409, "room.full");
    expect(r.refusals).toEqual([]);
    expect(r.timers.waiting).toBe(0);
    // The room lets the page in, and the waits start from one second again.
    r.network.last.hello();
    expect(r.connection.phase).toBe("open");
    r.network.last.serverClose(1006);
    expect(r.timers.delays()).toEqual([1000]);
  });

  it("is retried by the page's own request again after each refusal, whatever it has waited so far", () => {
    const r = rig();
    r.connection.connect();
    for (let attempt = 0; attempt < 4; attempt++) {
      r.network.last.refuse("room.full", 4409);
      r.timers.runNext();
    }
    // Four refusals in: the next wait would be eight seconds long.
    r.network.last.refuse("room.full", 4409);
    expect(r.timers.delays()).toEqual([8000]);
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(6);
    expect(r.timers.waiting).toBe(0);
    // A refusal that has been said but not closed yet is retried at once as well, and waits start over.
    r.network.last.deliver(
      KIND.error,
      new TextEncoder().encode(JSON.stringify({ code: "room.full" })),
    );
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(7);
    r.network.last.refuse("room.full", 4409);
    expect(r.timers.delays()).toEqual([500]);
  });

  it("stops reconnecting when the page closes the connection while it hears the refusal", () => {
    const closing: { connection?: RoomConnection } = {};
    const r = rig({ refused: () => closing.connection?.close() });
    closing.connection = r.connection;
    r.connection.connect();
    r.network.last.hello();
    r.network.last.refuse("doc.invalid", 4400);
    r.timers.advance(100_000);
    expect(r.network.sockets).toHaveLength(1);
    expect(r.connection.phase).toBe("idle");
  });
});

describe("sockets that end without a refusal", () => {
  it("are counted in a row, and counted again from one once the room says hello", () => {
    const closes: number[] = [];
    const r = rig({ dropped: (count) => closes.push(count) });
    r.connection.connect();
    r.network.last.hello();
    for (let attempt = 0; attempt < 4; attempt++) {
      r.network.last.serverClose(1006);
      r.timers.runNext();
    }
    expect(closes).toEqual([1, 2, 3, 4]);
    r.network.last.hello();
    r.network.last.serverClose(1006);
    expect(closes.at(-1)).toBe(1);
  });

  it("are not counted when the room refused something or the project is gone", () => {
    const closes: number[] = [];
    const r = rig({ dropped: (count) => closes.push(count) });
    r.connection.connect();
    r.network.last.hello();
    r.network.last.refuse("path.invalid", 4400);
    r.timers.runNext();
    r.network.last.serverClose(4404, "project.not-found");
    expect(closes).toEqual([]);
  });

  it("make the page ask no matter how the socket was closed by the page", () => {
    const closes: number[] = [];
    const r = rig({ dropped: (count) => closes.push(count) });
    r.connection.connect();
    r.connection.close();
    expect(closes).toEqual([]);
  });
});

describe("a project that was deleted", () => {
  it("stops for good when the room closes with 4404: the page hears it once and no socket is opened again", () => {
    const gone: string[] = [];
    const r = rig({ gone: () => gone.push("gone") });
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(4404, "project.not-found");
    expect(gone).toEqual(["gone"]);
    expect(r.refusals).toEqual([]);
    expect(r.connection.phase).toBe("idle");
    expect(r.phases.at(-1)).toBe("idle");
    r.timers.advance(10 * 60_000);
    expect(r.network.sockets).toHaveLength(1);
    expect(r.timers.delays()).toEqual([]);
    // It is not a failure to wait out, and not a refusal to reopen after.
    r.connection.retryNow();
    expect(r.network.sockets).toHaveLength(1);
  });

  it("is the same with no reason, while it was reconnecting, and when the room says project.not-found", () => {
    const gone: string[] = [];
    const r = rig({ gone: () => gone.push("gone") });
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(1006);
    expect(r.connection.phase).toBe("waiting");
    r.timers.runNext();
    r.network.last.serverClose(4404);
    expect(gone).toEqual(["gone"]);
    expect(r.connection.phase).toBe("idle");

    const said: string[] = [];
    const s = rig({ gone: () => said.push("gone") });
    s.connection.connect();
    s.network.last.hello();
    s.network.last.refuse("project.not-found", 4413);
    expect(said).toEqual(["gone"]);
    expect(s.refusals).toEqual([]);
    s.timers.advance(100_000);
    expect(s.network.sockets).toHaveLength(1);
  });

  it("connects again only when the page asks for it", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(4404, "project.not-found");
    r.connection.connect();
    expect(r.network.sockets).toHaveLength(2);
  });
});
