// A project's live session in its room (`live-sessions`; `cloud-document`, "The room's protocol",
// "Roles in the room" and "Awareness relayed by the room"): the record in the room's storage, the
// token checked when a socket arrives, guests and their places, the cut when the session ends, and
// the one alarm that serves awareness, the session's end and the idle hour. Over the fake socket
// pair, the fake storage and the fake clock: the room's real logic with no platform.

import { presenceColour } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { GUEST_CONNECTIONS_PER_ADDRESS, LIVE_IDLE_MS, LIVE_SESSION_MS } from "../src/room-core.js";
import { AWARENESS_TIMEOUT_MS } from "../src/room-awareness.js";
import { RoomError, type LiveState, type RoomIdentity } from "../src/rooms.js";
import { fakeClock, memoryStore } from "./support/index.js";
import {
  A,
  FakeConnection,
  addText,
  awarenessFrame,
  textOf,
  typeInto,
  world,
  type RoomClient,
  type World,
} from "./support/rooms.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

async function setup(options: Partial<Parameters<typeof world>[0]> = {}): Promise<World> {
  return world({ clock: fakeClock(), store: memoryStore(), ...options });
}

const OWNER: Partial<RoomIdentity> = { sub: "u1", role: "owner", name: "Ana" };

/** A person without an account, as the Worker names them: `guest:<id>`, no picture. */
function guest(n: number, address = "203.0.113.7"): Partial<RoomIdentity> {
  const id = n.toString(16).padStart(32, "0");
  return { sub: `guest:${id}`, role: "viewer", name: `Guest ${n}`, guest: true, address };
}

/** What the room refused before any socket existed. */
async function refusal(run: () => Promise<unknown>): Promise<RoomError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RoomError) return error;
    throw error;
  }
  throw new Error("the room admitted it");
}

const idOf = (client: RoomClient): string => client.connection.info.id;

describe("starting and ending a session", () => {
  it("keeps one record however often it is started, with a token of 128 random bits", async () => {
    const w = await setup();
    const start = w.clock.now().getTime();

    const first = await w.room.core.startLive({});
    const again = await w.room.core.startLive({});

    expect(again).toEqual(first);
    expect(first.token).toMatch(/^[0-9a-f]{32}$/);
    expect(first.id).toMatch(/^[0-9a-f]{16}$/);
    expect(first).toMatchObject({
      guestsEdit: true,
      startedAt: start,
      until: start + LIVE_SESSION_MS,
      guests: 0,
    });
    expect(w.room.storage.liveWrites).toHaveLength(1);
    expect(w.room.storage.session).toMatchObject({ id: first.id, token: first.token });
  });

  it("starts with guests only looking when asked, and applies a change to the session that is on", async () => {
    const w = await setup();
    const looking = await w.room.core.startLive({ guestsEdit: false });
    expect(looking.guestsEdit).toBe(false);
    const editing = await w.room.core.startLive({ guestsEdit: true });
    expect(editing).toMatchObject({ id: looking.id, token: looking.token, guestsEdit: true });
    expect(w.room.storage.session?.guestsEdit).toBe(true);
  });

  it("keeps the record through a rebuild from storage: the room built again knows the session", async () => {
    const w = await setup();
    const started = await w.room.core.startLive({});

    const core = w.room.evict();

    expect(await core.readLive()).toEqual(started);
    expect(await core.checkLive(started.token)).toEqual({
      until: started.until,
      guestsEdit: true,
    });
  });

  it("goes with the room when the project is deleted: the token admits nobody afterwards", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const visitor = await w.open(guest(1), undefined, token);

    await w.rooms.destroy(w.room.projectId);

    expect(visitor.closed).toEqual({ code: 4404, reason: "project.not-found" });
    expect(w.room.storage.session).toBeUndefined();
    expect(await w.room.core.readLive()).toBeNull();
    expect(await w.room.core.checkLive(token)).toBeNull();
    expect((await refusal(() => w.open(guest(2), undefined, token))).code).toBe(
      "project.not-found",
    );
  });

  it("is read as nothing once it is over, before the alarm that ends it has run", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    w.clock.advance(LIVE_SESSION_MS);
    expect(await w.room.core.readLive()).toBeNull();
    expect(await w.room.core.checkLive(token)).toBeNull();
  });
});

describe("joining with the token", () => {
  it("admits a guest with the session's role and tells them so in hello", async () => {
    const w = await setup();
    const live = await w.room.core.startLive({});

    const visitor = await w.open(guest(37), undefined, live.token);

    expect(visitor.hello).toMatchObject({
      role: "editor",
      you: { sub: guest(37).sub, name: "Guest 37", picture: "", guest: true },
      live: { until: new Date(live.until).toISOString(), guestsEdit: true },
    });
    // The guest edits as an editor does, and the owner sees it.
    const owner = await w.open(OWNER);
    await addText(visitor, A, "together.meltemi", "hello");
    await owner.sync();
    expect(textOf(owner, A)).toBe("hello");
    expect(visitor.closed).toBeUndefined();
    expect((await w.room.core.readLive())?.guests).toBe(1);
  });

  it("raises a signed-in stranger of a private project to the session's role, with their account's identity", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({ guestsEdit: false });

    const stranger = await w.open(
      { sub: "u-lu", role: "viewer", name: "Lu", picture: "https://img.example/lu.png" },
      undefined,
      token,
    );

    expect(stranger.hello).toMatchObject({
      role: "viewer",
      you: { sub: "u-lu", name: "Lu", picture: "https://img.example/lu.png", guest: false },
    });
  });

  it("keeps the higher role: an owner with the token of a session whose guests only look is the owner", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({ guestsEdit: false });
    const owner = await w.open(OWNER, undefined, token);
    expect(owner.hello).toMatchObject({ role: "owner", live: { guestsEdit: false } });
  });

  it("answers a token that is not the session's with project.not-found, and keeps no socket", async () => {
    const w = await setup();
    await w.room.core.startLive({});

    for (const token of ["0".repeat(32), "", "nope"]) {
      expect((await refusal(() => w.open(guest(1), undefined, token))).code).toBe(
        "project.not-found",
      );
    }
    expect(w.room.connections).toHaveLength(0);
  });

  it("answers any token with project.not-found while no session is on", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    await w.room.core.endLive();
    expect((await refusal(() => w.open(guest(1), undefined, token))).code).toBe(
      "project.not-found",
    );
  });

  it("lets a guest without a token only look, whatever role the Worker passed", async () => {
    const w = await setup();
    const visitor = await w.open({ ...guest(5), role: "editor" });
    expect(visitor.hello).toMatchObject({ role: "viewer", you: { guest: true }, live: null });
    await addText(visitor, A, "nope.meltemi", "x");
    expect(visitor.closed).toEqual({ code: 4403, reason: "access.denied" });
  });

  it("refuses as an internal error an account whose sub looks like a guest's, and a guest whose does not", async () => {
    const w = await setup();
    expect((await refusal(() => w.open({ sub: "guest:abc", role: "editor" }))).code).toBe(
      "internal",
    );
    expect((await refusal(() => w.open({ sub: "u-x", guest: true }))).code).toBe("internal");
  });

  it("says nothing of a session to a connection that came without its token", async () => {
    const w = await setup();
    await w.room.core.startLive({});
    const owner = await w.open(OWNER);
    expect(owner.hello).toMatchObject({ role: "owner", live: null, you: { guest: false } });
  });
});

describe("places and connections per address", () => {
  it("refuses the eleventh connection without an account from one address with 4428, and the ten stay", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const ten: RoomClient[] = [];
    for (let n = 1; n <= GUEST_CONNECTIONS_PER_ADDRESS; n++) {
      ten.push(await w.open(guest(n), undefined, token));
    }

    const eleventh = await w.open(guest(11), undefined, token);

    expect(eleventh.errors).toEqual(["connections.limit"]);
    expect(eleventh.closed).toEqual({ code: 4428, reason: "connections.limit" });
    expect(ten.every((client) => client.closed === undefined)).toBe(true);
    // Another address, a visitor without the token, and an account are other matters.
    expect((await w.open(guest(12, "198.51.100.1"), undefined, token)).closed).toBeUndefined();
    expect((await w.open({ ...OWNER, address: "203.0.113.7" })).closed).toBeUndefined();
    expect((await w.open(guest(13))).closed).toEqual({
      code: 4428,
      reason: "connections.limit",
    });
  });

  it("turns away the guest whose person holds the most connections when an editor with an account comes to a full room", async () => {
    const w = await setup({ limits: { clients: 3 } });
    const { token } = await w.room.core.startLive({});
    const ana = await w.open(guest(1), undefined, token);
    const tabs = [
      await w.open(guest(2), undefined, token),
      await w.open(guest(2), undefined, token),
    ];

    const editor = await w.open({ sub: "u-ed", role: "editor", name: "Ed" });

    expect(editor.closed).toBeUndefined();
    expect(editor.hello).toMatchObject({ role: "editor" });
    expect(tabs[1]?.closed).toEqual({ code: 4409, reason: "room.full" });
    expect(tabs[0]?.closed).toBeUndefined();
    expect(ana.closed).toBeUndefined();
  });

  it("does not let a guest editor take a place: it is refused in a full room as a viewer is", async () => {
    const w = await setup({ limits: { clients: 2 } });
    const { token } = await w.room.core.startLive({});
    await w.open(OWNER);
    await w.open({ sub: "u-v", role: "viewer", name: "V" });

    const late = await w.open(guest(1), undefined, token);

    expect(late.hello).toBeUndefined();
    expect(late.closed).toEqual({ code: 4409, reason: "room.full" });
  });
});

describe("the end of a session", () => {
  it("closes every connection the session admitted with 4410 and keeps the others", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const owner = await w.open(OWNER);
    const one = await w.open(guest(1), undefined, token);
    const two = await w.open(guest(2), undefined, token);
    const visitor = await w.open(guest(3));

    await w.room.core.endLive();

    for (const client of [one, two]) {
      expect(client.errors).toEqual(["session.ended"]);
      expect(client.closed).toEqual({ code: 4410, reason: "session.ended" });
    }
    expect(owner.closed).toBeUndefined();
    expect(visitor.closed).toBeUndefined();
    expect(w.room.storage.session).toBeUndefined();
    expect((await refusal(() => w.open(guest(1), undefined, token))).code).toBe(
      "project.not-found",
    );
    // Ending what is not on is nothing.
    await w.room.core.endLive();
  });

  it("cuts the guests when guestsEdit changes, and they come back with the role it gives", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const owner = await w.open(OWNER);
    await addText(owner, A, "a.meltemi", "text");
    const visitor = await w.open(guest(1), undefined, token);
    expect(visitor.hello).toMatchObject({ role: "editor" });

    await w.room.core.startLive({ guestsEdit: false });

    expect(visitor.closed).toEqual({ code: 4000, reason: "disconnected" });
    expect(owner.closed).toBeUndefined();
    const back = await w.open(guest(1), undefined, token);
    expect(back.hello).toMatchObject({ role: "viewer", live: { guestsEdit: false } });
    await back.sync();
    await typeInto(back, A, " vandalism");
    expect(back.closed).toEqual({ code: 4403, reason: "access.denied" });
    expect(textOf(owner, A)).toBe("text");
  });

  it("refuses a connection the session admitted that reaches the room after the session ended", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const admitted = w.room.core.admit(
      { sub: guest(1).sub!, role: "viewer", name: "G", picture: "", guest: true },
      token,
    );
    await w.room.core.endLive();
    const socket = new FakeConnection({ id: "late", ...admitted });
    await w.room.core.connect(socket);
    expect(socket.closed).toEqual({ code: 4410, reason: "session.ended" });
  });
});

describe("the one alarm", () => {
  it("ends the session at its time, after a wake, closing the guests with 4410", async () => {
    const w = await setup();
    const start = w.clock.now().getTime();
    const owner = await w.open(OWNER);
    const { token } = await w.room.core.startLive({});
    const visitor = await w.open(guest(1), undefined, token);
    expect(w.room.alarmAt).toBe(start + LIVE_SESSION_MS);

    // The object is gone with its memory; the platform keeps the sockets and the alarm.
    w.room.evict();
    await w.rooms.advance(LIVE_SESSION_MS);

    expect(visitor.closed).toEqual({ code: 4410, reason: "session.ended" });
    expect(owner.closed).toBeUndefined();
    expect(await w.room.core.readLive()).toBeNull();
    expect(w.room.storage.session).toBeUndefined();
  });

  it("ends a session after an hour with nobody in the room, and not while someone is in", async () => {
    const w = await setup();
    const start = w.clock.now().getTime();
    const owner = await w.open(OWNER);
    await w.room.core.startLive({});

    // Fifty minutes with the owner in: nothing ends.
    await w.rooms.advance(50 * MINUTE);
    expect(await w.room.core.readLive()).not.toBeNull();

    await owner.leave();
    await w.rooms.advance(59 * MINUTE);
    expect(await w.room.core.readLive()).not.toBeNull();
    expect(w.room.storage.session?.emptySince).toBe(start + 50 * MINUTE);
    await w.rooms.advance(1 * MINUTE);
    expect(await w.room.core.readLive()).toBeNull();
  });

  it("counts the idle hour from the session's start when nobody was in, after a wake too", async () => {
    const w = await setup();
    const start = w.clock.now().getTime();
    await w.room.core.startLive({});
    expect(w.room.alarmAt).toBe(start + LIVE_IDLE_MS);
    w.room.evict();
    await w.rooms.advance(LIVE_IDLE_MS);
    expect(await w.room.core.readLive()).toBeNull();
  });

  it("does not end a session whose room had someone come in during the idle hour", async () => {
    const w = await setup();
    await w.room.core.startLive({});
    await w.rooms.advance(40 * MINUTE);
    const owner = await w.open(OWNER);
    // The alarm comes at the idle hour, finds someone in, and waits for the session's end.
    await w.rooms.advance(30 * MINUTE);
    expect(await w.room.core.readLive()).not.toBeNull();
    expect(owner.closed).toBeUndefined();
  });

  it("serves three reasons in order: a state now, the idle hour, and not the session's end, which came first", async () => {
    const w = await setup();
    const start = w.clock.now().getTime();
    // A session that ends in ninety minutes.
    const live = await w.room.core.startLive({});
    w.room.storage.setLive({ ...w.room.storage.session!, until: start + 90 * MINUTE });
    const room = w.room.evict();
    const owner = await w.open(OWNER);
    await owner.awareness({});
    const ben = await w.open({ sub: "u-ben", role: "editor", name: "Ben" });
    // The state goes silent: the alarm comes thirty seconds after it.
    expect(w.room.alarmAt).toBe(start + AWARENESS_TIMEOUT_MS);
    await w.rooms.advance(AWARENESS_TIMEOUT_MS);
    expect(ben.peers.at(-1)).toEqual({ [idOf(owner)]: null });
    expect(w.room.alarmAt).toBe(start + 90 * MINUTE);

    // Everybody leaves ten minutes later: the idle hour comes before the session's end.
    await w.rooms.advance(10 * MINUTE - AWARENESS_TIMEOUT_MS);
    await owner.leave();
    await ben.leave();
    expect(w.room.alarmAt).toBe(start + 70 * MINUTE);
    await w.rooms.advance(60 * MINUTE);
    expect(await room.readLive()).toBeNull();
    expect(w.room.alarmAt).toBeUndefined();

    // Nothing is left for the clock: no alarm at ninety minutes.
    const set = w.room.alarmsSet.length;
    await w.rooms.advance(30 * MINUTE);
    expect(w.room.alarmsSet).toHaveLength(set);
    expect(live.id).toBeDefined();
  });
});

describe("awareness of guests", () => {
  it("marks a guest in the user the room relays, whatever the guest claimed", async () => {
    const w = await setup();
    const { token } = await w.room.core.startLive({});
    const owner = await w.open(OWNER);
    const visitor = await w.open(guest(37), undefined, token);

    await visitor.send(
      awarenessFrame({
        [idOf(visitor)]: {
          file: A,
          user: { sub: "guest:forged", guest: false, name: "Owner", picture: "https://x/a.png" },
        },
      }),
    );

    // The user the guest wrote is never read: the room's is relayed, `guest` included.
    expect(owner.peers).toEqual([
      {
        [idOf(visitor)]: {
          user: {
            sub: guest(37).sub,
            name: "Guest 37",
            picture: "",
            colour: presenceColour(guest(37).sub!),
            guest: true,
          },
          file: A,
        },
      },
    ]);
  });

  it("relays a pointer on the canvas and never keeps it in the attachment", async () => {
    const w = await setup();
    const owner = await w.open(OWNER);
    const ben = await w.open({ sub: "u-ben", role: "editor", name: "Ben" });

    await ben.awareness({ file: A, canvas: { pointer: { x: 120.4, y: -80.6, diagram: "flow" } } });

    expect(owner.peers.at(-1)?.[idOf(ben)]).toMatchObject({
      canvas: { selection: [], pointer: { x: 120, y: -81, diagram: "flow" } },
    });
    expect(ben.connection.awareness).toEqual({
      colour: presenceColour("u-ben"),
      file: A,
      seen: w.clock.now().getTime(),
    });
  });

  it("drops a state whose pointer is not two finite numbers within the bound", async () => {
    const w = await setup();
    const owner = await w.open(OWNER);
    const ben = await w.open({ sub: "u-ben", role: "editor", name: "Ben" });

    for (const pointer of [
      { x: "1", y: 2 },
      { x: 1 },
      { x: 2_000_000, y: 0 },
      { x: 1, y: 2, diagram: 3 },
      [1, 2],
    ]) {
      await ben.awareness({ file: A, canvas: { selection: [], pointer } });
    }
    // `NaN` is not JSON: a payload that holds one is not a message at all.
    await ben.send(new TextEncoder().encode('\u0002{"x":{"canvas":{"pointer":{"x":NaN,"y":1}}}}'));

    expect(owner.peers).toEqual([]);
    expect(ben.closed).toBeUndefined();
    expect(w.room.core.stats().awarenessDropped).toBe(6);
  });
});

/** Keeps the type of what `readLive` answers in one place for the routes' tests. */
export type { LiveState };
