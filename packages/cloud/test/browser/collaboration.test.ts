// The helpers of the collaboration scenarios that decide whether one passes, tested on their own: how
// the listener reads what the room relays (a state replaces the last of its connection, a null removes
// it) and how a colour is compared. Nothing here starts a process or a socket.

import { describe, expect, it } from "vitest";
import { Listener, rgb, type RelayedPeer } from "./collaboration.js";
import { KIND, type Frame, type Joined } from "./room-socket.js";

const person = (sub: string, name = sub): RelayedPeer => ({
  user: { sub, name, picture: "", colour: "#1c7ed6", guest: false },
  file: "f-1",
});

const frame = (kind: number, body: unknown): Frame => ({
  kind,
  payload: new TextEncoder().encode(JSON.stringify(body)),
});

/** A listener over frames that were heard, without a socket. */
function listening(...frames: Frame[]): Listener {
  const client = {
    frames,
    // The real one polls for a few seconds; here a test that does not hold fails at once.
    async until(label: string, test: () => boolean): Promise<void> {
      if (!test()) throw new Error(`Timed out waiting: ${label}`);
    },
    close() {},
  };
  return Reflect.construct(Listener, [{ client } as unknown as Joined]) as Listener;
}

describe("rgb", () => {
  it("spells a hex colour as the browser reports it in a computed style", () => {
    expect(rgb("#e03131")).toBe("rgb(224, 49, 49)");
    expect(rgb("#000000")).toBe("rgb(0, 0, 0)");
    expect(rgb("#FFFFFF")).toBe("rgb(255, 255, 255)");
  });

  it("refuses what is not a six-digit hex colour", () => {
    expect(() => rgb("red")).toThrow("not a colour");
    expect(() => rgb("#fff")).toThrow("not a colour");
  });
});

describe("a listener of the room", () => {
  it("knows who is here from the states the room sent and the removals that followed", () => {
    const listener = listening(
      frame(KIND.hello, { role: "viewer" }),
      frame(KIND.awareness, { c1: person("u-ana"), c2: person("u-ben") }),
      frame(KIND.update, {}),
      frame(KIND.awareness, { c3: person("u-cy") }),
      frame(KIND.awareness, { c2: null }),
    );
    expect([...listener.here().keys()].sort()).toEqual(["c1", "c3"]);
    expect(listener.messages()).toHaveLength(3);
  });

  it("keeps the last state of a connection and gives the last state of a person", () => {
    const moved = { ...person("u-ben"), file: "f-2" };
    const listener = listening(
      frame(KIND.awareness, { c2: person("u-ben") }),
      frame(KIND.awareness, { c2: moved }),
      frame(KIND.awareness, { c5: person("u-ben") }),
    );
    expect(listener.here().get("c2")?.file).toBe("f-2");
    // Two connections of one person: the state the room relayed last is the person's.
    expect(listener.of("u-ben")?.file).toBe("f-1");
    expect(listener.of("u-nobody")).toBeUndefined();
  });

  it("is told that a connection came back after it left as a connection that is here", () => {
    const listener = listening(
      frame(KIND.awareness, { c2: person("u-ben") }),
      frame(KIND.awareness, { c2: null }),
      frame(KIND.awareness, { c2: person("u-ben") }),
    );
    expect([...listener.here().keys()]).toEqual(["c2"]);
  });

  it("waits for exactly these people, in any order, and not for more or fewer", async () => {
    const listener = listening(frame(KIND.awareness, { c1: person("u-ana"), c2: person("u-ben") }));
    await listener.hereAre(["u-ben", "u-ana"], "both are here");
    await expect(listener.hereAre(["u-ana"], "only one")).rejects.toThrow("only one");
    await expect(listener.hereAre(["u-ana", "u-ben", "u-cy"], "three")).rejects.toThrow("three");
    await expect(listener.hereAre([], "nobody")).rejects.toThrow("nobody");
  });

  it("hears nobody before any state", async () => {
    const listener = listening(frame(KIND.hello, {}), frame(KIND.update, {}));
    expect(listener.here().size).toBe(0);
    await listener.hereAre([], "nobody");
  });
});
