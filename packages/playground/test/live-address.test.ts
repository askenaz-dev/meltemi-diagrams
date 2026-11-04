// A live session's token in the page (`live-sessions`; `playground-cloud`, "Opening a project by
// address"): read from the address and kept there, dropped once the session ended; a guest's id, name
// and room address; the token on the two reads that take it and on nothing else; the owner's calls
// and how long a session has left; the canvas's pointer as presence takes it.

import { describe, expect, it } from "vitest";
import { pointerOf } from "../src/canvas-host.js";
import { addressFor, planOpen, readAddress, withoutLive } from "../src/cloud/address.js";
import { LIVE_HEADER, cloudApi } from "../src/cloud/client.js";
import {
  GUEST_ID_KEY,
  GUEST_NAME_KEY,
  cleanGuestName,
  defaultGuestName,
  guestId,
  keepGuestName,
  keptGuestName,
  roomAddress,
} from "../src/cloud/guest.js";
import { LiveSessions, leftText, liveApi, liveSessionOf, timeLeft } from "../src/cloud/live.js";
import type { KeyValueStore } from "../src/cloud/persistence.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { fakeFetch, jsonResponse } from "./support/fake-fetch.js";

const ID = "abcdefghij0123456789";
const TOKEN = "0123456789abcdef0123456789abcdef";
const PAGE = "https://diagrams.example/";

function store(seed: Record<string, string> = {}): KeyValueStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

/** Random bytes that count up, so that an id is known in advance. */
const counting = (length: number) => Uint8Array.from({ length }, (_, i) => i);

describe("the address", () => {
  it("reads the live session's token and keeps it in the plan", () => {
    expect(readAddress(`?project=${ID}&live=${TOKEN}`)).toEqual({
      project: ID,
      invite: undefined,
      live: TOKEN,
    });
    expect(planOpen(`?project=${ID}&live=${TOKEN}`)).toEqual({
      kind: "open",
      id: ID,
      invite: undefined,
      live: TOKEN,
    });
    expect(planOpen(`?project=${ID}`)).toEqual({
      kind: "open",
      id: ID,
      invite: undefined,
      live: undefined,
    });
  });

  it("drops the token once the session ended, keeping the rest", () => {
    expect(withoutLive(`${PAGE}?project=${ID}&live=${TOKEN}&x=1#f`)).toBe(
      `${PAGE}?project=${ID}&x=1#f`,
    );
    expect(withoutLive("not an address")).toBe("not an address");
  });

  it("leaves a project's token behind when another project opens", () => {
    expect(addressFor(`${PAGE}?project=${ID}&live=${TOKEN}`, "zyxwvutsrq9876543210")).toBe(
      `${PAGE}?project=zyxwvutsrq9876543210`,
    );
    expect(addressFor(`${PAGE}?project=${ID}&live=${TOKEN}`, undefined)).toBe(PAGE);
  });
});

describe("a guest's identity", () => {
  it("is made once and kept: a reload is the same person", () => {
    const kept = store();
    const first = guestId(kept, counting);
    expect(first).toBe("000102030405060708090a0b0c0d0e0f");
    expect(kept.map.get(GUEST_ID_KEY)).toBe(first);
    expect(guestId(kept, () => new Uint8Array(16).fill(255))).toBe(first);
  });

  it("is made again when what the browser kept is not one, and is this page's when it keeps nothing", () => {
    expect(guestId(store({ [GUEST_ID_KEY]: "nope" }), counting)).toBe(
      "000102030405060708090a0b0c0d0e0f",
    );
    const refusing: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(guestId(refusing, counting)).toMatch(/^[0-9a-f]{32}$/);
    expect(guestId(undefined, counting)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("has a default name of two digits from the id, in the page's language", () => {
    const name = defaultGuestName(TOKEN, en.cloud.live);
    expect(name).toMatch(/^Guest \d{2}$/);
    expect(defaultGuestName(TOKEN, es.cloud.live)).toBe(name.replace("Guest", "Invitado"));
    expect(defaultGuestName(TOKEN, en.cloud.live)).toBe(name);
  });

  it("takes a name as the Worker does: trimmed, 1 to 40 characters, no control characters", () => {
    expect(cleanGuestName("  <b>Ana</b> ")).toBe("<b>Ana</b>");
    expect(cleanGuestName("x".repeat(300))).toBeUndefined();
    expect(cleanGuestName("ñ".repeat(40))).toBe("ñ".repeat(40));
    expect(cleanGuestName("   ")).toBeUndefined();
    expect(cleanGuestName("a\u0007b")).toBeUndefined();
    const kept = store();
    expect(keepGuestName(kept, "Lu")).toBe(true);
    expect(kept.map.get(GUEST_NAME_KEY)).toBe("Lu");
    expect(keptGuestName(kept)).toBe("Lu");
    expect(keptGuestName(store({ [GUEST_NAME_KEY]: "x".repeat(41) }))).toBeUndefined();
    expect(keepGuestName(undefined, "Lu")).toBe(false);
  });

  it("goes in the room's address with the token, encoded, and nothing of it for a person signed in", () => {
    const base = `wss://diagrams.example/rooms/${ID}`;
    const address = roomAddress(base, {
      live: TOKEN,
      guest: { id: TOKEN, name: "Ana & <Ben>" },
    });
    const url = new URL(address);
    expect(url.searchParams.get("live")).toBe(TOKEN);
    expect(url.searchParams.get("guest")).toBe(TOKEN);
    expect(url.searchParams.get("name")).toBe("Ana & <Ben>");
    expect(roomAddress(base, { live: TOKEN })).toBe(`${base}?live=${TOKEN}`);
    expect(roomAddress(base, {})).toBe(base);
  });
});

describe("the token on the reads", () => {
  it("goes in X-Meltemi-Live on the project's read and the blobs, and nowhere else", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ id: ID, name: "Shared", role: "editor" }),
    );
    const api = cloudApi(fetch, { href: PAGE }, { live: () => TOKEN });
    await api.get(ID);
    await api.blob(ID, "a".repeat(64));
    await api.files(ID);
    await api.versions(ID);
    await api.uploadBinary(ID, "logo.png", new Uint8Array([1]));
    await api.putThumbnail(ID, "<svg/>");
    const header = (i: number) =>
      new Headers(calls[i]?.init.headers as HeadersInit | undefined).get(LIVE_HEADER);
    expect(header(0)).toBe(TOKEN);
    expect(header(1)).toBe(TOKEN);
    for (const i of [2, 3, 4, 5]) expect(header(i)).toBeNull();
  });

  it("is not sent while the page holds none", async () => {
    const { fetch, calls } = fakeFetch(() => jsonResponse({ id: ID, name: "Shared" }));
    await cloudApi(fetch, { href: PAGE }, { live: () => undefined }).get(ID);
    expect(new Headers(calls[0]?.init.headers as HeadersInit).get(LIVE_HEADER)).toBeNull();
  });

  it("reads what the project's answer says of the session", async () => {
    let live: unknown = { until: "2026-10-22T10:00:00.000Z", guestsEdit: false };
    const { fetch } = fakeFetch(() =>
      jsonResponse({ id: ID, name: "Shared", role: "viewer", live }),
    );
    const api = cloudApi(fetch, { href: PAGE });
    expect((await api.get(ID)).ok && (await api.get(ID))).toMatchObject({
      value: { live: { until: "2026-10-22T10:00:00.000Z", guestsEdit: false } },
    });
    live = null;
    expect(await api.get(ID)).toMatchObject({ value: { live: null } });
    live = { until: 3 };
    const read = await api.get(ID);
    expect(read.ok && "live" in read.value).toBe(false);
  });
});

describe("the owner's calls", () => {
  const session = {
    id: "s1",
    link: `${PAGE}p/${ID}?live=${TOKEN}`,
    guestsEdit: true,
    startedAt: "2026-10-21T10:00:00.000Z",
    until: "2026-10-22T10:00:00.000Z",
    guests: 2,
  };

  it("start, read and end the session at the project's /live", async () => {
    const answers: unknown[] = [session, null, session];
    const { fetch, calls } = fakeFetch((call) =>
      call.init.method === "DELETE"
        ? new Response(null, { status: 204 })
        : jsonResponse(answers.shift() ?? null),
    );
    const api = liveApi(fetch, { href: `${PAGE}?project=${ID}` });
    expect(await api.start(ID, false)).toEqual({ ok: true, value: session });
    expect(await api.read(ID)).toEqual({ ok: true, value: null });
    expect(await api.read(ID)).toEqual({ ok: true, value: session });
    expect(await api.end(ID)).toEqual({ ok: true, value: null });
    expect(calls.map((call) => `${call.init.method ?? "GET"} ${call.url}`)).toEqual([
      `PUT ${PAGE}api/projects/${ID}/live`,
      `GET ${PAGE}api/projects/${ID}/live`,
      `GET ${PAGE}api/projects/${ID}/live`,
      `DELETE ${PAGE}api/projects/${ID}/live`,
    ]);
    expect(calls[0]?.init.body).toBe(JSON.stringify({ guestsEdit: false }));
  });

  it("read a session of the service's shape only", () => {
    expect(liveSessionOf(session)).toEqual(session);
    expect(liveSessionOf({ ...session, guests: -1 })).toEqual({ ...session, guests: 0 });
    expect(liveSessionOf({ ...session, link: "" })).toBeUndefined();
    expect(liveSessionOf({ ...session, guestsEdit: "yes" })).toBeUndefined();
    expect(liveSessionOf(null)).toBeUndefined();
  });

  it("say how long is left in hours and minutes, and nothing once it is past", () => {
    const now = Date.parse("2026-10-21T10:00:00.000Z");
    expect(timeLeft(session.until, now)).toEqual({ hours: 24, minutes: 0 });
    expect(leftText("2026-10-21T12:35:30.000Z", now, en.cloud.live)).toBe("2 h 35 min");
    expect(leftText("2026-10-21T10:45:00.000Z", now, es.cloud.live)).toBe("45 min");
    expect(leftText("2026-10-21T10:00:20.000Z", now, en.cloud.live)).toBe("less than a minute");
    expect(leftText("2026-10-21T09:00:00.000Z", now, en.cloud.live)).toBe("");
  });

  it("keep what the page knows of the open project's session, and tell who listens", () => {
    const known = new LiveSessions();
    let told = 0;
    known.listen(() => told++);
    expect(known.of(ID)).toBeUndefined();
    known.set(ID, liveSessionOf(session)!);
    known.set(ID, liveSessionOf(session)!);
    expect(known.of(ID)).toEqual(session);
    expect(known.of("zyxwvutsrq9876543210")).toBeUndefined();
    known.set(ID, null);
    expect(known.of(ID)).toBeNull();
    known.forget();
    expect(known.of(ID)).toBeUndefined();
    expect(told).toBe(3);
  });
});

describe("the canvas's pointer", () => {
  it("is the point and the diagram, or nothing once it left", () => {
    expect(
      pointerOf({ type: "presencePointer", point: { x: 120, y: 80 }, diagram: "flow" }),
    ).toEqual({ x: 120, y: 80, diagram: "flow" });
    expect(pointerOf({ type: "presencePointer", point: { x: 1, y: 2 } })).toEqual({ x: 1, y: 2 });
    expect(pointerOf({ type: "presencePointer", point: null })).toBeUndefined();
  });
});
