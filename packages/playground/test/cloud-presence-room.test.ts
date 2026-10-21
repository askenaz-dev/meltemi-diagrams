import { describe, expect, it } from "vitest";
import { KIND, RoomConnection, type RoomEvents } from "../src/cloud/room.js";
import { ManualTimers } from "./support/clock.js";
import { FakeNetwork } from "./support/fake-room.js";

function rig(options: { readOnly?: boolean; events?: Partial<RoomEvents> } = {}) {
  const network = new FakeNetwork();
  const timers = new ManualTimers();
  const awareness: Uint8Array[] = [];
  const connection = new RoomConnection({
    url: "wss://diagrams.example/rooms/abcdefghij0123456789",
    socket: network.factory,
    timers,
    stateVector: () => new Uint8Array([0]),
    ...(options.readOnly ? { readOnly: true } : {}),
    events: {
      update: () => undefined,
      awareness: (payload) => awareness.push(payload),
      ...options.events,
    },
  });
  return { network, timers, connection, awareness };
}

describe("presence messages on the room's socket", () => {
  it("hands the room's kind 2 payload over, without the kind byte", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.deliver(KIND.awareness, new TextEncoder().encode('{"c1":null}'));
    expect(r.awareness.map((payload) => new TextDecoder().decode(payload))).toEqual([
      '{"c1":null}',
    ]);
  });

  it("hands them over before the hello too: the room tells who is here as the socket opens", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.deliver(KIND.awareness, new Uint8Array([123, 125]));
    expect(r.awareness).toHaveLength(1);
    expect(r.connection.phase).toBe("connecting");
  });

  it("sends the page's own as kind 2 once the room has said hello, and not before", () => {
    const r = rig();
    r.connection.connect();
    expect(r.connection.sendAwareness(new Uint8Array([1]))).toBe(false);
    r.network.last.hello();
    expect(r.connection.sendAwareness(new Uint8Array([7, 8]))).toBe(true);
    expect(r.network.last.sentOf(KIND.awareness)).toEqual([new Uint8Array([7, 8])]);
  });

  it("sends them for a viewer as well, who sends no update", () => {
    const r = rig({ readOnly: true });
    r.connection.connect();
    r.network.last.hello({ role: "viewer", revision: 1 });
    expect(r.connection.send(new Uint8Array([1]))).toBe(false);
    expect(r.connection.sendAwareness(new Uint8Array([2]))).toBe(true);
    expect(r.network.last.sentOf(KIND.update)).toEqual([]);
    expect(r.network.last.sentOf(KIND.awareness)).toEqual([new Uint8Array([2])]);
  });

  it("sends nothing once the socket is gone", () => {
    const r = rig();
    r.connection.connect();
    r.network.last.hello();
    r.network.last.serverClose(1006);
    expect(r.connection.sendAwareness(new Uint8Array([1]))).toBe(false);
  });

  it("ignores them when nothing listens", () => {
    const r = rig({ events: { awareness: undefined } });
    r.connection.connect();
    r.network.last.hello();
    expect(() => r.network.last.deliver(KIND.awareness, new Uint8Array([1]))).not.toThrow();
    expect(r.connection.phase).toBe("open");
  });
});
