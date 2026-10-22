// Awareness in the room (`cloud-document`, "Awareness relayed by the room"; `live-collaboration`,
// "Joining and limits"): the relay with the sender's identity, the states kept in the attachments, the
// removal on close and after thirty seconds by the alarm, the 16 KiB cap and the rate, over the fake
// socket pair, the fake clock and the fake alarm: the room's real logic with no platform.

import { presenceColour } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { attachmentBytes } from "../src/room-awareness.js";
import { KIND, frame } from "../src/room-protocol.js";
import { fakeClock, memoryStore } from "./support/index.js";
import {
  A,
  B,
  C,
  PLATFORM_ATTACHMENT_BYTES,
  awarenessFrame,
  settle,
  typeInto,
  addText,
  world,
  type RoomClient,
  type World,
} from "./support/rooms.js";

const SECOND = 1000;

async function setup(options: Partial<Parameters<typeof world>[0]> = {}): Promise<World> {
  return world({ clock: fakeClock(), store: memoryStore(), ...options });
}

const ANA = { sub: "u-ana", name: "Ana", picture: "https://img.example/ana.png" };
const BEN = { sub: "u-ben", name: "Ben", picture: "https://img.example/ben.png" };
const CY = { sub: "u-cy", name: "Cy", picture: "" };

/** The connection id of a client: the key the room relays its state under. */
const idOf = (client: RoomClient): string => client.connection.info.id;

/** The identity the room attaches to what a person publishes: these people have an account. */
const userOf = (who: { sub: string; name: string; picture: string }) => ({
  sub: who.sub,
  name: who.name,
  picture: who.picture,
  colour: presenceColour(who.sub),
  guest: false,
});

const CARET = { anchor: "AQID", head: "AQIE" };

/** The clients that stay: the three people of most scenarios, each connected to the room. */
async function three(w: World): Promise<{ ana: RoomClient; ben: RoomClient; cy: RoomClient }> {
  return {
    ana: await w.open(ANA),
    ben: await w.open({ ...BEN, role: "editor" }),
    cy: await w.open(CY),
  };
}

describe("the relay", () => {
  it("sends a state to every other client, with the sender's identity, and never back to the sender", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);

    await ben.awareness({ file: A, caret: CARET, canvas: { selection: ["n1", "n2"] } });

    const told = {
      [idOf(ben)]: {
        user: userOf(BEN),
        file: A,
        caret: CARET,
        canvas: { selection: ["n1", "n2"] },
      },
    };
    expect(ana.peers).toEqual([told]);
    expect(cy.peers).toEqual([told]);
    expect(ben.peers).toEqual([]);
    expect(ben.closed).toBeUndefined();
  });

  it("sends each client's state as it is, one message per state", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);

    await ana.awareness({ file: A });
    await ben.awareness({ file: B });
    await ana.awareness({ file: C, caret: CARET });

    expect(cy.peers).toEqual([
      { [idOf(ana)]: { user: userOf(ANA), file: A } },
      { [idOf(ben)]: { user: userOf(BEN), file: B } },
      { [idOf(ana)]: { user: userOf(ANA), file: C, caret: CARET } },
    ]);
    expect(ana.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN), file: B } }]);
  });

  it("colours a person from their sub, the way every page does", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ana.awareness({});

    const told = ben.peers[0]?.[idOf(ana)] as { user: { colour: string } };
    expect(told.user.colour).toBe(presenceColour("u-ana"));
    expect(told.user.colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("replaces the state: the next one is the whole of it, and a part left out is gone", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.awareness({ file: A, caret: CARET });
    await ben.awareness({ file: B });

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: { user: userOf(BEN), file: B } });
    expect(ben.connection.awareness).toMatchObject({ file: B });
    expect(ben.connection.awareness?.caret).toBeUndefined();
  });

  it("relays a state with nothing in it: a person with no file open is still here", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.awareness({});

    expect(ana.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN) } }]);
  });

  it("relays a viewer's state and a viewer sees everyone's, while the viewer's updates stay refused", async () => {
    const w = await setup();
    const owner = await w.open(ANA);
    const viewer = await w.open({ ...BEN, role: "viewer" });
    await addText(owner, A, "a.meltemi", "text");

    await viewer.awareness({ file: A, caret: CARET });
    await owner.awareness({ file: A });

    expect(owner.peers).toEqual([{ [idOf(viewer)]: { user: userOf(BEN), file: A, caret: CARET } }]);
    expect(viewer.peers).toEqual([{ [idOf(owner)]: { user: userOf(ANA), file: A } }]);
    expect(viewer.closed).toBeUndefined();

    await typeInto(viewer, A, " vandalism");

    expect(viewer.errors).toEqual(["access.denied"]);
    expect(viewer.closed).toEqual({ code: 4403, reason: "access.denied" });
    // The viewer's presence goes with its socket, and the document is as it was.
    await settle();
    expect(owner.peers.at(-1)).toEqual({ [idOf(viewer)]: null });
    expect((await w.room.core.readFiles()).files).toEqual({ "a.meltemi": "text" });
  });

  it("does not take a state from a client the room is closing", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.send("text");
    expect(ben.errors).toEqual(["doc.invalid"]);
    const heard = ana.peers.length;

    await ben.awareness({ file: A });

    expect(ana.peers).toHaveLength(heard);
  });
});

describe("a spoofed identity", () => {
  it("reaches the peers as the sender: Ben claiming to be Ana, with her sub, name, picture and a colour of his own choice", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);

    await ben.awareness({
      user: { sub: ANA.sub, name: ANA.name, picture: ANA.picture, colour: "#000000" },
      file: A,
      colour: "#000000",
      sub: ANA.sub,
      name: ANA.name,
    });

    for (const peer of [ana, cy]) {
      expect(peer.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN), file: A } }]);
      const text = JSON.stringify(peer.peers);
      expect(text).not.toContain(ANA.sub);
      expect(text).not.toContain(ANA.picture);
      expect(text).not.toContain("#000000");
      expect(text).not.toContain('"Ana"');
    }
  });

  it("is the sender's too in the states a newcomer is sent, which are made from the attachments", async () => {
    const w = await setup();
    const { ben } = await three(w);
    await ben.awareness({ user: { sub: ANA.sub, name: "Ana" }, file: A });

    const late = await w.open({ sub: "u-dee", name: "Dee", picture: "" });

    expect(late.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN), file: A } }]);
  });

  it("is also the sender's when the message is keyed with another client's id", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    await ana.awareness({ file: A });

    // Ben speaks for Ana's entry: the state, and then its removal.
    await ben.send(awarenessFrame({ [idOf(ana)]: { file: B } }));
    await ben.send(awarenessFrame({ [idOf(ana)]: null }));

    // Ana's entry, as everyone has it, is untouched: what Ben sent was Ben's.
    expect(cy.peers).toEqual([
      { [idOf(ana)]: { user: userOf(ANA), file: A } },
      { [idOf(ben)]: { user: userOf(BEN), file: B } },
      { [idOf(ben)]: null },
    ]);
    expect(ana.connection.awareness).toMatchObject({ file: A });
    const late = await w.open({ sub: "u-dee", name: "Dee", picture: "" });
    expect(late.peers).toEqual([{ [idOf(ana)]: { user: userOf(ANA), file: A } }]);
  });

  it("is never taken from a message that carries the user beside the state: that message is dropped", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.send(
      awarenessFrame({
        [idOf(ben)]: { file: A },
        user: { sub: ANA.sub, name: ANA.name, picture: ANA.picture },
      }),
    );

    expect(ana.peers).toEqual([]);
    expect(w.room.core.stats().awarenessDropped).toBe(1);
  });
});

describe("what the room keeps", () => {
  it("keeps the file, the caret and the time in the attachment, and the canvas selection nowhere", async () => {
    const w = await setup();
    const { ben } = await three(w);
    const at = w.clock.now().getTime();

    await ben.awareness({ file: A, caret: CARET, canvas: { selection: ["n1"] } });

    expect(ben.connection.awareness).toEqual({
      colour: presenceColour("u-ben"),
      file: A,
      caret: CARET,
      seen: at,
    });
    expect(JSON.stringify(ben.connection.awareness)).not.toContain("n1");
  });

  it("keeps a record that fits what the platform allows, whatever the identity and the caret", async () => {
    const w = await setup();
    const widest = await w.open({
      sub: "s".repeat(200),
      name: "田".repeat(100),
      picture: `https://img.example/${"p".repeat(480)}`,
      role: "editor",
    });
    const plain = await w.open({ sub: "u-plain", name: "Plain" });
    const big = { file: A, caret: { anchor: "a".repeat(256), head: "b".repeat(256) } };

    await widest.awareness(big);
    await plain.awareness(big);

    expect(w.room.warnings).toEqual([]);
    for (const client of [widest, plain]) {
      expect(client.connection.attachmentBytes).toBeLessThanOrEqual(PLATFORM_ATTACHMENT_BYTES);
      expect(client.connection.awareness).toBeDefined();
    }
    // The ordinary person keeps everything; the widest identity leaves no room for the caret.
    expect(plain.connection.awareness).toMatchObject({ file: A, caret: big.caret });
    expect(widest.connection.awareness?.caret).toBeUndefined();
    // Peers were told the whole of it all the same: only what is kept is trimmed.
    expect(plain.peers.at(-1)?.[idOf(widest)]).toMatchObject({ file: A, caret: big.caret });
  });

  it("drops the caret and then the file from the record when the attachment is short of room", async () => {
    const identity = {
      id: "c1",
      sub: ANA.sub,
      role: "owner",
      name: ANA.name,
      picture: ANA.picture,
    };
    const seenAt = (record: object) => attachmentBytes({ ...identity, aw: record });
    const colour = presenceColour(ANA.sub);
    const base = { colour, seen: 0 };
    // Limits that leave room for exactly the file and the caret, the file, and neither.
    const limits = {
      whole: seenAt({ ...base, file: A, caret: CARET, seen: 1e12 }),
      file: seenAt({ ...base, file: A, seen: 1e12 }),
      bare: seenAt({ ...base, seen: 1e12 }),
    };

    for (const [limit, expected] of [
      [limits.whole, { file: A, caret: CARET }],
      [limits.file, { file: A }],
      [limits.bare, {}],
    ] as const) {
      const w = await setup({ limits: { attachment: limit } });
      const ana = await w.open(ANA);
      const peer = await w.open(BEN);

      await ana.awareness({ file: A, caret: CARET });

      expect(ana.connection.awareness, String(limit)).toMatchObject(expected);
      expect(Object.keys(ana.connection.awareness ?? {}).sort()).toEqual(
        ["colour", "seen", ...Object.keys(expected)].sort(),
      );
      // The peers were told everything; a newcomer is told what was kept.
      expect(peer.peers[0]?.[idOf(ana)]).toMatchObject({ file: A, caret: CARET });
      const late = await w.open(CY);
      expect(late.peers[0]?.[idOf(ana)], String(limit)).toEqual({
        user: userOf(ANA),
        ...expected,
      });
    }
  });

  it("goes on when the platform refuses the attachment: the state is relayed and the failure logged", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    ben.connection.keepAwareness = () => {
      throw new Error("the attachment is over 2 KiB");
    };

    await ben.awareness({ file: A });

    expect(ana.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN), file: A } }]);
    expect(w.room.warnings).toEqual(["room: an awareness state could not be kept"]);
    expect(ben.closed).toBeUndefined();
  });
});

describe("states on connect", () => {
  it("sends a third client both states before any update, read from the room's clients", async () => {
    const w = await setup();
    const ana = await w.open(ANA);
    const ben = await w.open(BEN);
    await ana.awareness({ file: A, caret: CARET, canvas: { selection: ["n9"] } });
    await ben.awareness({ file: B });

    const cy = await w.open(CY);

    expect(cy.messages.map((message) => message.kind)).toEqual([
      KIND.hello,
      KIND.sync,
      KIND.awareness,
    ]);
    // One message with both, each under its sender's connection id; the canvas is not kept.
    expect(cy.peers).toEqual([
      {
        [idOf(ana)]: { user: userOf(ANA), file: A, caret: CARET },
        [idOf(ben)]: { user: userOf(BEN), file: B },
      },
    ]);
    expect(cy.of(KIND.update)).toHaveLength(0);
  });

  it("sends nothing when nobody has a state, and does not announce the newcomer until it sends one", async () => {
    const w = await setup();
    const ana = await w.open(ANA);

    const ben = await w.open(BEN);

    expect(ben.of(KIND.awareness)).toHaveLength(0);
    expect(ana.of(KIND.awareness)).toHaveLength(0);
    await ben.awareness({ file: A });
    expect(ana.peers).toHaveLength(1);
  });

  it("tells a person's second tab about the first like about any peer: each connection is a client of its own", async () => {
    const w = await setup();
    const tab = await w.open(ANA);
    await tab.awareness({ file: A });

    const other = await w.open(ANA);

    expect(other.peers).toEqual([{ [idOf(tab)]: { user: userOf(ANA), file: A } }]);
    expect(tab.peers).toEqual([]);
  });

  it("is told nothing by a refused client: the 21st gets no hello and no states", async () => {
    const w = await setup({ limits: { clients: 1 } });
    const ana = await w.open(ANA);
    await ana.awareness({ file: A });

    const refused = await w.open(BEN);

    expect(refused.errors).toEqual(["room.full"]);
    expect(refused.of(KIND.awareness)).toHaveLength(0);
    expect(refused.hello).toBeUndefined();
  });

  it("does not send a state that has been silent for thirty seconds, though the alarm has not run", async () => {
    const w = await setup();
    const ana = await w.open(ANA);
    await ana.awareness({ file: A });
    w.clock.advance(30 * SECOND);

    const ben = await w.open(BEN);

    expect(ben.of(KIND.awareness)).toHaveLength(0);
  });
});

describe("states survive hibernation", () => {
  it("sends a third client the states of two that published before the room was evicted, read from the attachments", async () => {
    const w = await setup();
    const ana = await w.open(ANA);
    const ben = await w.open(BEN);
    await ana.awareness({ file: A, caret: CARET });
    await ben.awareness({ file: B });
    const before = w.room.core;

    const after = w.room.evict();
    expect(after).not.toBe(before);
    const cy = await w.open(CY);

    expect(cy.peers).toEqual([
      {
        [idOf(ana)]: { user: userOf(ANA), file: A, caret: CARET },
        [idOf(ben)]: { user: userOf(BEN), file: B },
      },
    ]);
  });

  it("relays and removes through the room that was built again", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    await ana.awareness({ file: A });
    w.room.evict();

    await ben.awareness({ file: B });
    await ana.leave();

    expect(cy.peers).toEqual([
      { [idOf(ana)]: { user: userOf(ANA), file: A } },
      { [idOf(ben)]: { user: userOf(BEN), file: B } },
      { [idOf(ana)]: null },
    ]);
  });

  it("keeps the rate in memory only: a room built again counts from nothing", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    for (let i = 0; i < 20; i++) await ana.awareness({ file: A });
    await ana.awareness({ file: B });
    expect(ben.peers).toHaveLength(20);

    w.room.evict();
    await ana.awareness({ file: B });

    expect(ben.peers).toHaveLength(21);
  });
});

describe("a message that is not a state", () => {
  const MALFORMED: [string, () => Uint8Array][] = [
    ["bytes that are not JSON", () => frame(KIND.awareness, new Uint8Array([1, 2, 3]))],
    ["an empty payload", () => frame(KIND.awareness)],
    ["a JSON array", () => frame(KIND.awareness, new TextEncoder().encode("[1,2]"))],
    ["a map with no entry", () => awarenessFrame({})],
    ["a map of two states", () => awarenessFrame({ a: { file: A }, b: { file: B } })],
    ["a state that is a string", () => awarenessFrame({ k: "file" })],
    ["a file that is not an id", () => awarenessFrame({ k: { file: "a.meltemi" } })],
    ["a caret with no head", () => awarenessFrame({ k: { caret: { anchor: "AQID" } } })],
    ["a selection of numbers", () => awarenessFrame({ k: { canvas: { selection: [1] } } })],
  ];

  it.each(MALFORMED)(
    "is dropped and counted, never taking the connection down: %s",
    async (_name, message) => {
      const w = await setup();
      const { ana, ben } = await three(w);
      await ben.awareness({ file: A });
      const told = ana.peers.length;

      await ben.send(message());

      expect(ben.closed).toBeUndefined();
      expect(ben.errors).toEqual([]);
      expect(ana.peers).toHaveLength(told);
      expect(w.room.core.stats()).toMatchObject({ awareness: 2, awarenessDropped: 1 });
      // What it had published stays as it was.
      expect(ben.connection.awareness).toMatchObject({ file: A });
      // And the next good message is relayed.
      await ben.awareness({ file: B });
      expect(ana.peers).toHaveLength(told + 1);
    },
  );

  it("does not refresh the state's time", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    await w.rooms.advance(20 * SECOND);

    await ben.send(frame(KIND.awareness, new Uint8Array([1, 2, 3])));
    await w.rooms.advance(10 * SECOND);

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("counts every awareness message, and only awareness messages, in the stats", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ana.sync();

    await ben.awareness({ file: A });
    await ben.awareness({ file: B });
    await ben.send(awarenessFrame({}));

    expect(w.room.core.stats()).toMatchObject({ messages: 4, awareness: 3, awarenessDropped: 1 });
  });
});

describe("removing a state", () => {
  it("is what a null is: the client says it has none any more, and the others are told", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });

    await ben.awareness(null);

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
    expect(ben.connection.awareness).toBeUndefined();
    expect(ben.closed).toBeUndefined();
    const late = await w.open({ sub: "u-dee", name: "Dee", picture: "" });
    expect(late.of(KIND.awareness)).toHaveLength(0);
  });

  it("tells nobody when the client had no state to remove", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.awareness(null);

    expect(ana.peers).toEqual([]);
    expect(w.room.core.stats().awarenessDropped).toBe(0);
  });

  it("happens when a socket closes: the others are told, and a client that never published is not announced", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    await ben.awareness({ file: A });

    await ben.leave();
    await cy.leave();

    expect(ana.peers).toEqual([
      { [idOf(ben)]: { user: userOf(BEN), file: A } },
      { [idOf(ben)]: null },
    ]);
  });

  it("happens when the room closes the socket: a client refused for a message that breaks a rule is gone for the others", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });

    await ben.send(frame(KIND.sync, new Uint8Array([255, 255, 255, 255])));
    await settle();

    expect(ben.closed?.code).toBe(4400);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("happens when the development tool cuts a connection", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });

    w.room.core.disconnect({ id: idOf(ben) });
    await settle();

    expect(ben.closed?.code).toBe(4000);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("is told to the clients that remain only, with their connections listed once", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    await ana.awareness({ file: A });
    await ben.awareness({ file: B });
    await cy.awareness({ file: C });
    const heard = ana.peers.length;

    await ben.leave();
    await ana.leave();

    expect(cy.peers.slice(-2)).toEqual([{ [idOf(ben)]: null }, { [idOf(ana)]: null }]);
    expect(ana.peers).toHaveLength(heard + 1);
  });
});

describe("silence", () => {
  const ALARM = 30 * SECOND;

  it("removes a state thirty seconds after its last message, and not a moment before", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });

    await w.rooms.advance(ALARM - 1);
    expect(ana.peers).toHaveLength(1);
    expect(ben.connection.awareness).toBeDefined();
    const early = await w.open({ sub: "u-dee", name: "Dee", picture: "" });
    expect(early.peers).toHaveLength(1);

    await w.rooms.advance(1);

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
    expect(ben.connection.awareness).toBeUndefined();
    // The socket stays: only the state is gone.
    expect(ben.closed).toBeUndefined();
    const late = await w.open({ sub: "u-eve", name: "Eve", picture: "" });
    expect(late.of(KIND.awareness)).toHaveLength(0);
  });

  it("does not tell the silent client about itself", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    await ana.awareness({ file: B });

    await w.rooms.advance(ALARM);

    expect(ben.peers.at(-1)).toEqual({ [idOf(ana)]: null });
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
    for (const peers of [...ben.peers, ...ana.peers]) {
      expect(Object.keys(peers)).toHaveLength(1);
    }
  });

  it("brings a silent client back with its next state", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    await w.rooms.advance(ALARM);

    await ben.awareness({ file: B });

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: { user: userOf(BEN), file: B } });
    await w.rooms.advance(ALARM);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("is put off by a message: the heartbeat of a client keeps its state, and the alarm is set again for the next one", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    const start = w.clock.now().getTime();
    await ben.awareness({ file: A });
    expect(w.room.alarmAt).toBe(start + ALARM);

    await w.rooms.advance(20 * SECOND);
    await ben.awareness({ file: A });
    await w.rooms.advance(10 * SECOND);

    // The alarm came at thirty seconds, found a state ten seconds younger and set the next.
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: { user: userOf(BEN), file: A } });
    expect(w.room.alarmsSet).toEqual([start + ALARM, start + 50 * SECOND]);

    await w.rooms.advance(20 * SECOND);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("sets the alarm once however many messages arrive before it fires, not once per message", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    const start = w.clock.now().getTime();

    for (let second = 0; second < 20; second++) {
      for (const client of [ana, ben, cy]) await client.awareness({ file: A });
      await w.rooms.advance(SECOND);
    }

    expect(w.room.alarmsSet).toEqual([start + ALARM]);
  });

  it("comes by about once a heartbeat for clients that send a state every fifteen seconds, and keeps their states", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    for (let beat = 0; beat < 8; beat++) {
      await ben.awareness({ file: A });
      await w.rooms.advance(15 * SECOND);
    }

    // Two minutes of heartbeats: the state is never dropped, and the alarm was set about once each.
    expect(ana.peers.every((peers) => peers[idOf(ben)] !== null)).toBe(true);
    expect(ben.connection.awareness).toBeDefined();
    expect(w.room.alarmsSet.length).toBeLessThanOrEqual(9);
  });

  it("drops every state that is old enough at once, and sets the next alarm at the earliest of those left", async () => {
    const w = await setup();
    const ana = await w.open(ANA);
    const ben = await w.open(BEN);
    const cy = await w.open(CY);
    const dee = await w.open({ sub: "u-dee", name: "Dee", picture: "" });
    const start = w.clock.now().getTime();
    await ana.awareness({ file: A });
    await ben.awareness({ file: B });
    await w.rooms.advance(12 * SECOND);
    await cy.awareness({ file: C });

    await w.rooms.advance(18 * SECOND);

    // Ana and Ben were silent for thirty seconds: Dee is told of both in one message, Cy of both.
    expect(dee.peers.at(-1)).toEqual({ [idOf(ana)]: null, [idOf(ben)]: null });
    expect(cy.peers.at(-1)).toEqual({ [idOf(ana)]: null, [idOf(ben)]: null });
    // Each of them is told of the other, and of no one else.
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
    expect(ben.peers.at(-1)).toEqual({ [idOf(ana)]: null });
    expect(w.room.alarmAt).toBe(start + 12 * SECOND + ALARM);

    await w.rooms.advance(12 * SECOND);
    expect(dee.peers.at(-1)).toEqual({ [idOf(cy)]: null });
    expect(cy.connection.awareness).toBeUndefined();
  });

  it("sets nothing more when no state is left", async () => {
    const w = await setup();
    const { ben } = await three(w);
    await ben.awareness({ file: A });

    await w.rooms.advance(ALARM);

    expect(w.room.alarmsSet).toHaveLength(1);
    expect(w.room.alarmAt).toBeUndefined();
    await w.rooms.advance(5 * 60 * SECOND);
    expect(w.room.alarmsSet).toHaveLength(1);
  });

  it("is a no-op for an alarm that finds nothing: a room whose clients all left", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    await ben.leave();
    const heard = ana.peers.length;

    await w.rooms.advance(ALARM);

    expect(ana.peers).toHaveLength(heard);
    expect(w.room.alarmsSet).toHaveLength(1);
  });

  it("moves on to the newer state when the older one left before the alarm", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    const start = w.clock.now().getTime();
    await ana.awareness({ file: A });
    await w.rooms.advance(5 * SECOND);
    await ben.awareness({ file: B });
    await ana.leave();

    await w.rooms.advance(25 * SECOND);

    // The alarm for Ana's state (at 30 s) came and found Ben's (35 s) to wait for.
    expect(w.room.alarmsSet).toEqual([start + ALARM, start + 5 * SECOND + ALARM]);
    await w.rooms.advance(5 * SECOND);
    expect(ben.connection.awareness).toBeUndefined();
  });

  it("logs the alarm the platform refused and sets it with the next state", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    w.room.alarmFailures = 1;

    await ben.awareness({ file: A });

    expect(ana.peers).toHaveLength(1);
    expect(w.room.warnings).toEqual(["room: the alarm could not be set"]);
    expect(w.room.alarmsSet).toEqual([]);

    await ben.awareness({ file: B });
    expect(w.room.alarmsSet).toHaveLength(1);
    await w.rooms.advance(ALARM);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });
});

describe("silence after a wake", () => {
  const ALARM = 30 * SECOND;

  it("removes the state of a client whose last message is thirty seconds old although the room was built again in between", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    await w.rooms.advance(5 * SECOND);
    w.room.evict();
    // The object is gone with everything in its memory; the platform keeps the alarm.
    expect(w.room.alarmAt).toBeDefined();

    await w.rooms.advance(25 * SECOND);

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
    expect(ben.connection.awareness).toBeUndefined();
  });

  it("removes it when the room is built again by the alarm itself and nothing else had run", async () => {
    const w = await setup();
    const ana = await w.open(ANA);
    const ben = await w.open(BEN);
    await ana.awareness({ file: A });
    const rebuilt = w.room.evict();

    await w.rooms.advance(ALARM);

    expect(w.room.core).toBe(rebuilt);
    expect(ben.peers.at(-1)).toEqual({ [idOf(ana)]: null });
  });

  it("sets the alarm again from the attachments when a state arrives in the room that was built again", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    const start = w.clock.now().getTime();
    await ana.awareness({ file: A });
    await w.rooms.advance(10 * SECOND);
    w.room.evict();

    await ben.awareness({ file: B });

    // The earliest state is Ana's, not the one that just arrived.
    expect(w.room.alarmsSet).toEqual([start + ALARM, start + ALARM]);
    await w.rooms.advance(20 * SECOND);
    expect(ben.peers.at(-1)).toEqual({ [idOf(ana)]: null });
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: { user: userOf(BEN), file: B } });
    expect(w.room.alarmAt).toBe(start + 10 * SECOND + ALARM);
    await w.rooms.advance(10 * SECOND);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("works through several wakes in a row", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });
    for (let i = 0; i < 5; i++) {
      await w.rooms.advance(5 * SECOND);
      w.room.evict();
    }

    await w.rooms.advance(5 * SECOND);

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });
});

describe("nothing of it is stored", () => {
  it("writes nothing to the room's storage: states, heartbeats, removals, the alarm and the flood", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);

    await ana.awareness({ file: A, caret: CARET, canvas: { selection: ["n1"] } });
    await ben.awareness({ file: B });
    await w.rooms.advance(15 * SECOND);
    await ana.awareness({ file: A });
    await ben.awareness(null);
    await cy.awareness({ file: C });
    w.room.evict();
    await w.rooms.advance(40 * SECOND);
    await ana.awareness({ file: A });
    for (let i = 0; i < 120; i++) await cy.awareness({ file: C });
    await w.rooms.advance(40 * SECOND);
    await ana.leave();
    await ben.leave();
    await w.room.core.flush();

    expect(w.room.storage.saves).toEqual([]);
    expect(w.room.storage.chunks).toBeUndefined();
    expect(w.room.storage.destroyed).toBe(0);
    expect(w.room.core.stats()).toMatchObject({ revision: 0, storageWrites: 0 });
    expect(w.room.materialised).toEqual([]);
  });

  it("changes neither the document nor its revision, and does not make the room think it changed", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await addText(ana, A, "a.meltemi", "text");
    await w.rooms.advance(SECOND);
    const saves = w.room.storage.saves.length;

    await ben.awareness({ file: A, caret: CARET });
    await w.rooms.advance(60 * SECOND);

    expect(w.room.core.stats().revision).toBe(1);
    expect(w.room.storage.saves).toHaveLength(saves);
    expect(w.room.materialised).toHaveLength(1);
  });
});

describe("the size of a message", () => {
  /** A state message of exactly `bytes` bytes, the kind byte included: padded with a field the room ignores. */
  function sized(bytes: number): Uint8Array {
    const bare = awarenessFrame({ k: { file: A, pad: "" } });
    const message = awarenessFrame({ k: { file: A, pad: "x".repeat(bytes - bare.length) } });
    expect(message.length).toBe(bytes);
    return message;
  }

  it("closes a client sending 20 KiB with message.too-large, and the others receive nothing from it", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.send(sized(20 * 1024));

    expect(ben.errors).toEqual(["message.too-large"]);
    expect(ben.closed).toEqual({ code: 4413, reason: "message.too-large" });
    expect(ana.peers).toEqual([]);
    expect(ben.connection.awareness).toBeUndefined();
  });

  it("takes 16 KiB exactly and refuses one byte more", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    await ben.send(sized(16 * 1024));
    expect(ben.closed).toBeUndefined();
    expect(ana.peers).toEqual([{ [idOf(ben)]: { user: userOf(BEN), file: A } }]);

    await ben.send(sized(16 * 1024 + 1));
    expect(ben.errors).toEqual(["message.too-large"]);
    expect(ben.closed).toEqual({ code: 4413, reason: "message.too-large" });
    expect(ana.peers).toHaveLength(1);
  });

  it("is the cap of kind 2 alone: an update of the same size is under the room's own", async () => {
    const w = await setup();
    const { ben } = await three(w);

    await ben.send(frame(KIND.update, new Uint8Array(17 * 1024)));
    expect(ben.closed).toBeUndefined();

    await ben.send(frame(KIND.awareness, new Uint8Array(17 * 1024)));
    expect(ben.closed).toEqual({ code: 4413, reason: "message.too-large" });
  });

  it("removes the state of the client it closed, for the others", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    await ben.awareness({ file: A });

    await ben.send(sized(20 * 1024));
    await settle();

    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });
});

describe("the rate", () => {
  it("drops what a client sends beyond 20 in a second and closes it at the 101st, as the flood of the specification", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    for (let i = 0; i < 50; i++) await ben.awareness({ file: A });
    expect(ben.closed).toBeUndefined();
    expect(ana.peers).toHaveLength(20);

    await w.rooms.advance(SECOND);
    for (let i = 0; i < 150; i++) await ben.awareness({ file: B });

    // At most 20 of each second's messages reached the peers, and the socket closed in the second.
    expect(ana.peers.slice(0, 20).every((peers) => peers[idOf(ben)]?.["file"] === A)).toBe(true);
    expect(ana.peers.slice(20)).toHaveLength(20);
    expect(ana.peers.slice(20).every((peers) => peers[idOf(ben)]?.["file"] === B)).toBe(true);
    expect(ben.errors).toEqual(["awareness.rate"]);
    expect(ben.closed).toEqual({ code: 4429, reason: "awareness.rate" });
    // The 101st of the second was the last one the room counted.
    expect(w.room.core.stats()).toMatchObject({ awareness: 151, awarenessDropped: 110 });
    await settle();
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: null });
  });

  it("relays exactly 20 in a second and drops the 21st", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    for (let i = 0; i < 20; i++) await ben.awareness({ file: A });
    expect(ana.peers).toHaveLength(20);
    await ben.awareness({ file: B });

    expect(ana.peers).toHaveLength(20);
    expect(ben.closed).toBeUndefined();
    expect(w.room.core.stats().awarenessDropped).toBe(1);
  });

  it("lets a message through again exactly one second after the first of the twenty", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    for (let i = 0; i < 20; i++) await ben.awareness({ file: A });

    await w.rooms.advance(999);
    await ben.awareness({ file: B });
    expect(ana.peers).toHaveLength(20);

    await w.rooms.advance(1);
    await ben.awareness({ file: C });
    expect(ana.peers).toHaveLength(21);
    expect(ana.peers.at(-1)).toEqual({ [idOf(ben)]: { user: userOf(BEN), file: C } });
  });

  it("holds exactly 100 in a second without closing, 80 of them dropped, and closes at the 101st", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);

    for (let i = 0; i < 100; i++) await ben.awareness({ file: A });
    expect(ben.closed).toBeUndefined();
    expect(ana.peers).toHaveLength(20);
    expect(w.room.core.stats().awarenessDropped).toBe(80);

    await ben.awareness({ file: A });

    expect(ben.errors).toEqual(["awareness.rate"]);
    expect(ben.closed).toEqual({ code: 4429, reason: "awareness.rate" });
    expect(ana.peers).toHaveLength(20);
  });

  it("counts the window by sliding: 100 at one moment and one 999 ms later close, and 1000 ms later do not", async () => {
    const early = await setup();
    const a = await early.open(ANA);
    for (let i = 0; i < 100; i++) await a.awareness({ file: A });
    await early.rooms.advance(999);
    await a.awareness({ file: A });
    expect(a.closed).toEqual({ code: 4429, reason: "awareness.rate" });

    const late = await setup();
    const b = await late.open(ANA);
    for (let i = 0; i < 100; i++) await b.awareness({ file: A });
    await late.rooms.advance(1000);
    await b.awareness({ file: A });
    expect(b.closed).toBeUndefined();
  });

  it("is a rate per client: one client's flood does not take another's messages", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);
    for (let i = 0; i < 60; i++) await ben.awareness({ file: A });

    await cy.awareness({ file: C });

    expect(ana.peers.at(-1)).toEqual({ [idOf(cy)]: { user: userOf(CY), file: C } });
    expect(cy.closed).toBeUndefined();
  });

  it("counts a person's two tabs apart", async () => {
    const w = await setup();
    const tab = await w.open(ANA);
    const other = await w.open(ANA);
    const ben = await w.open(BEN);
    for (let i = 0; i < 20; i++) await tab.awareness({ file: A });
    for (let i = 0; i < 20; i++) await other.awareness({ file: B });

    expect(ben.peers).toHaveLength(40);
  });

  it("leaves the document alone: the updates of a client that is flooding awareness are applied", async () => {
    const w = await setup();
    const { ana, ben } = await three(w);
    for (let i = 0; i < 60; i++) await ben.awareness({ file: A });

    await addText(ben, A, "a.meltemi", "typed");

    expect(ben.closed).toBeUndefined();
    expect((await w.room.core.readFiles()).files).toEqual({ "a.meltemi": "typed" });
    expect(ana.of(KIND.update)).toHaveLength(1);
  });
});

describe("the room's client limit, lowered by the development tool", () => {
  it("refuses the client past the lowered limit with room.full, tells the hello the limit, and restores it", async () => {
    const w = await setup();
    const ana = await w.open(ANA);

    expect(await w.rooms.limits(w.room.projectId, { clients: 2 })).toEqual({ clients: 2 });
    const ben = await w.open(BEN);
    const refused = await w.open(CY);

    expect(ben.hello).toMatchObject({ limits: { clients: 2 } });
    expect(refused.errors).toEqual(["room.full"]);
    expect(refused.closed).toEqual({ code: 4409, reason: "room.full" });
    expect(ana.closed).toBeUndefined();

    expect(await w.rooms.limits(w.room.projectId, {})).toEqual({ clients: 20 });
    const admitted = await w.open(CY);
    expect(admitted.hello).toBeDefined();
  });

  it("never raises the real limit, and never lowers it below one", async () => {
    const w = await setup({ limits: { clients: 5 } });

    expect(await w.rooms.limits(w.room.projectId, { clients: 50 })).toEqual({ clients: 5 });
    expect(await w.rooms.limits(w.room.projectId, { clients: 0 })).toEqual({ clients: 1 });
    expect(await w.rooms.limits(w.room.projectId, {})).toEqual({ clients: 5 });
  });

  it("does not cut anyone who is connected", async () => {
    const w = await setup();
    const { ana, ben, cy } = await three(w);

    await w.rooms.limits(w.room.projectId, { clients: 1 });

    expect([ana, ben, cy].map((client) => client.closed)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const refused = await w.open({ sub: "u-dee", name: "Dee", picture: "" });
    expect(refused.errors).toEqual(["room.full"]);
  });
});
