// A person without an account in a project's room, and a live session's token (`live-sessions`;
// `playground-cloud`, "Opening a project by address"; `project-sharing`, "Viewing by link"): the
// cloud controller as a guest opens a project the link admits as a visitor that follows live, joins
// a session with its token as the role it gives, keeps nothing in IndexedDB, and goes on when the
// session ends (as a visitor when the link admits viewing, else read-only on what it holds); a
// network that holds as many guests as a room takes is said and not retried.

import { describe, expect, it } from "vitest";
import { planOpen } from "../src/cloud/address.js";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  CloudController,
  type CloudEnvironment,
  type CloudHooks,
} from "../src/cloud/controller.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";
import { FakeIdb } from "./support/fake-idb.js";
import { fakeFetch, jsonResponse, type Call } from "./support/fake-fetch.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const TOKEN = "0123456789abcdef0123456789abcdef";
const GUEST = "fedcba9876543210fedcba9876543210";
const A = "diagrams/a.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const PAGE = "https://diagrams.example/";
const UNTIL = "2026-10-22T10:00:00.000Z";

type Handler = (call: Call) => Response;

interface Rig {
  readonly controller: CloudController;
  readonly timers: ManualTimers;
  readonly network: FakeNetwork;
  readonly room: FakeRoom;
  readonly idb: FakeIdb;
  readonly studio: ReturnType<typeof newStudio>;
  readonly calls: Call[];
  readonly handlers: Map<string, Handler>;
  readonly reports: string[];
  readonly accesses: string[];
  readonly frozen: string[];
  readonly statuses: (string | undefined)[];
  readonly address: { href: string };
  readonly name: { value: string };
}

function rig(options: { href?: string; signedIn?: boolean } = {}): Rig {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = new FakeRoom();
  addTextFile(cloudDoc(room.doc), A, SOURCE_A, { origin: "seed" });
  room.serve(network);
  const idb = new FakeIdb();
  const studio = newStudio();
  const pane = new FakePane(studio);
  const handlers = new Map<string, Handler>();
  const { fetch, calls } = fakeFetch((call) => {
    const handler = handlers.get(`${call.init.method ?? "GET"} ${new URL(call.url).pathname}`);
    return handler ? handler(call) : jsonResponse({ code: "not-found" }, 404);
  });
  const reports: string[] = [];
  const accesses: string[] = [];
  const frozen: string[] = [];
  const statuses: (string | undefined)[] = [];
  const address = { href: options.href ?? `${PAGE}?project=${ID}` };
  const name = { value: "Guest 37" };
  const env: CloudEnvironment = {
    fetch,
    socket: network.factory,
    indexedDB: idb,
    storage: undefined,
    online: () => true,
    timers,
    location: { href: () => address.href, replace: (url) => void (address.href = url) },
  };
  const hooks: CloudHooks = {
    studio,
    templates: () => [],
    selection: () => pane.selection,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: (status) => statuses.push(status?.state),
    changed: () => undefined,
    keepLocal: () => undefined,
    showLocal: () => undefined,
    localFiles: () => new Map(),
    access: (access) =>
      accesses.push(access ? `${access.role} ${access.reason} ${String(access.guest)}` : "left"),
    frozen: (project) => frozen.push(project.name),
  };
  const controller = new CloudController(
    env,
    hooks,
    options.signedIn === true ? {} : { guest: { id: GUEST, name: () => name.value } },
  );
  return {
    controller,
    timers,
    network,
    room,
    idb,
    studio,
    calls,
    handlers,
    reports,
    accesses,
    frozen,
    statuses,
    address,
    name,
  };
}

/** The project's read answers this role, and what it says of the session when a token came. */
function knows(r: Rig, role: string, live?: unknown): void {
  r.handlers.set(`GET /api/projects/${ID}`, (call) => {
    const token = new Headers(call.init.headers as HeadersInit).get("X-Meltemi-Live");
    return jsonResponse({
      id: ID,
      name: "Together",
      role,
      ...(token !== null && live !== undefined ? { live } : {}),
    });
  });
}

/** Nobody without the token may read it. */
function privateUnlessToken(r: Rig, role: string): void {
  r.handlers.set(`GET /api/projects/${ID}`, (call) => {
    const token = new Headers(call.init.headers as HeadersInit).get("X-Meltemi-Live");
    return token === TOKEN
      ? jsonResponse({ id: ID, name: "Together", role, live: { until: UNTIL, guestsEdit: true } })
      : jsonResponse({ code: "project.not-found" }, 404);
  });
}

const query = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("a visitor of a link", () => {
  it("follows the room live as a viewer with a guest identity, keeping nothing in IndexedDB", async () => {
    const r = rig();
    knows(r, "viewer");
    r.room.role = "viewer";

    const opened = await r.controller.openLink(ID);

    expect(opened.outcome).toBe("opened");
    expect(r.controller.role).toBe("viewer");
    expect(r.accesses).toEqual(["viewer open true"]);
    expect(query(r.network.last.url)).toEqual({ guest: GUEST, name: "Guest 37" });
    expect(r.studio.host.paths()).toEqual([A]);
    expect(r.idb.connections).toHaveLength(0);
    expect(r.controller.session).toBeUndefined();
    // A change at the room shows at once.
    r.room.change((doc) => addTextFile(cloudDoc(doc), "diagrams/b.meltemi", "b", { origin: "x" }));
    expect(r.studio.host.paths()).toContain("diagrams/b.meltemi");
  });

  it("only looks, whatever role the service says a link gives without a token", async () => {
    const r = rig();
    knows(r, "editor");
    await r.controller.openLink(ID);
    expect(r.controller.role).toBe("viewer");
  });

  it("says when the room did not answer in time, so that the page reads the snapshot", async () => {
    const r = rig();
    knows(r, "viewer");
    r.room.greeting = false;
    const opening = r.controller.openLink(ID);
    await settle();
    r.timers.advance(10_000);
    const opened = await opening;
    expect(opened).toMatchObject({ outcome: "failed", unanswered: true });
    expect(r.controller.openProject).toBeUndefined();
  });

  it("gives up at once on a room it cannot reach, so that the page reads the snapshot without the whole wait", async () => {
    const r = rig();
    knows(r, "viewer");
    r.network.throwing = true;
    const opening = r.controller.openLink(ID);
    await settle();
    r.timers.advance(1000);
    await settle();
    const opened = await opening;
    expect(opened).toMatchObject({ outcome: "failed", unanswered: true });
    expect(r.timers.now).toBeLessThan(10_000);
  });

  it("reconnects with a new name when the guest renames themselves", async () => {
    const r = rig();
    knows(r, "viewer");
    r.room.role = "viewer";
    await r.controller.openLink(ID);
    r.name.value = "Ana";
    r.controller.guestRenamed();
    await settle();
    expect(query(r.network.last.url)).toEqual({ guest: GUEST, name: "Ana" });
    expect(r.network.sockets).toHaveLength(2);
  });
});

describe("a guest with a live session's token", () => {
  it("opens a private project with the session's role, the token in the room's address and on the read", async () => {
    const r = rig({ href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    privateUnlessToken(r, "editor");
    r.room.role = "editor";
    r.room.helloExtra = { live: { until: UNTIL, guestsEdit: true } };

    const opened = await r.controller.openLink(ID, TOKEN);

    expect(opened.outcome).toBe("opened");
    expect(r.controller.role).toBe("editor");
    expect(r.accesses).toEqual(["editor open true"]);
    expect(query(r.network.last.url)).toEqual({ live: TOKEN, guest: GUEST, name: "Guest 37" });
    expect(r.controller.session).toEqual({ until: UNTIL, guestsEdit: true });
    expect(r.reports).toContain(en.cloud.live.joined("Together", true));
    // The address keeps the token, so that a reload rejoins.
    expect(r.address.href).toBe(`${PAGE}?project=${ID}&live=${TOKEN}`);
    // The guest edits through the room, and nothing is kept in this browser.
    r.studio.setText(A, `${SOURCE_A}// hi\n`);
    r.timers.advance(1000);
    await settle();
    expect(r.room.text(A)).toBe(`${SOURCE_A}// hi\n`);
    expect(r.idb.connections).toHaveLength(0);
    expect(r.statuses.at(-1)).not.toBe(undefined);
  });

  it("refuses an image for a guest: it needs an account, and nothing is uploaded", async () => {
    const r = rig();
    privateUnlessToken(r, "editor");
    r.room.role = "editor";
    r.room.helloExtra = { live: { until: UNTIL, guestsEdit: true } };
    await r.controller.openLink(ID, TOKEN);

    r.studio.addFiles([["logo.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47])]]);
    await settle(30);

    expect(r.reports).toContain(en.cloud.live.needsAccount.images);
    expect(r.calls.some((call) => call.url.includes("/binaries/"))).toBe(false);
  });

  it("drops a token whose session is over when the page opens, and opens with what the link gives", async () => {
    const r = rig({ href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    knows(r, "viewer", null);
    r.room.role = "viewer";
    const opened = await r.controller.openLink(ID, TOKEN);
    expect(opened.outcome).toBe("opened");
    expect(r.address.href).toBe(`${PAGE}?project=${ID}`);
    expect(query(r.network.last.url)).toEqual({ guest: GUEST, name: "Guest 37" });
    expect(r.reports).toContain(en.cloud.live.ended);
  });
});

describe("when the session ends under a guest", () => {
  it("goes on as a visitor that follows live when the link admits viewing", async () => {
    const r = rig({ href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    knows(r, "editor", { until: UNTIL, guestsEdit: true });
    r.room.role = "editor";
    r.room.helloExtra = { live: { until: UNTIL, guestsEdit: true } };
    await r.controller.openLink(ID, TOKEN);
    // Without the token the link gives a viewer.
    knows(r, "viewer");
    r.room.role = "viewer";
    r.room.helloExtra = {};

    r.network.last.refuse("session.ended", 4410);
    await settle(30);

    expect(r.reports).toContain(en.cloud.live.ended);
    expect(r.address.href).toBe(`${PAGE}?project=${ID}`);
    expect(r.controller.session).toBeUndefined();
    expect(r.controller.role).toBe("viewer");
    expect(r.accesses.at(-1)).toBe("viewer role true");
    // The next socket carries no token.
    expect(query(r.network.last.url)).toEqual({ guest: GUEST, name: "Guest 37" });
    expect(r.frozen).toEqual([]);
  });

  it("stays read-only on what it holds when the link does not admit the person", async () => {
    const r = rig({ href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    privateUnlessToken(r, "editor");
    r.room.role = "editor";
    r.room.helloExtra = { live: { until: UNTIL, guestsEdit: true } };
    await r.controller.openLink(ID, TOKEN);
    const sockets = r.network.sockets.length;

    r.network.last.refuse("session.ended", 4410);
    await settle(30);
    r.timers.advance(60_000);
    await settle();

    expect(r.frozen).toEqual(["Together"]);
    expect(r.reports.at(-1)).toBe(en.cloud.live.endedFrozen);
    expect(r.controller.openProject).toBeUndefined();
    // The files stay in the page; nothing reconnects.
    expect(r.studio.host.paths()).toEqual([A]);
    expect(r.network.sockets).toHaveLength(sockets);
  });

  it("is said in the status line, and the page does not reconnect with the token by itself", async () => {
    const r = rig({ href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    privateUnlessToken(r, "editor");
    r.room.role = "editor";
    await r.controller.openLink(ID, TOKEN);
    r.network.last.refuse("session.ended", 4410);
    // Before the page has asked what the person is now, the status says the session ended.
    expect(r.statuses).toContain("ended");
    await settle(30);
    r.timers.advance(60_000);
    expect(r.network.sockets.filter((socket) => query(socket.url)["live"] === TOKEN)).toHaveLength(
      1,
    );
  });
});

describe("too many from one network", () => {
  it("is said, shown in the status line, and not retried", async () => {
    const r = rig();
    knows(r, "viewer");
    r.room.role = "viewer";
    await r.controller.openLink(ID);
    const sockets = r.network.sockets.length;

    r.network.last.refuse("connections.limit", 4428);
    await settle();
    r.timers.advance(120_000);

    expect(r.reports.at(-1)).toBe(en.cloud.live.limited);
    expect(r.statuses.at(-1)).toBe("limited");
    expect(r.network.sockets).toHaveLength(sockets);
  });

  it("turns the page away at the first answer, with the same words", async () => {
    const r = rig();
    knows(r, "viewer");
    r.room.greeting = false;
    r.network.onSocket = (socket) => queueMicrotask(() => socket.refuse("connections.limit", 4428));
    const opened = await r.controller.openLink(ID);
    expect(opened.outcome).toBe("failed");
    expect(opened.unanswered).toBeUndefined();
    expect(r.reports.at(-1)).toBe(en.cloud.live.limited);
  });
});

describe("a person signed in with the token", () => {
  it("sends the token and no guest, and keeps the copy a person who edits keeps", async () => {
    const r = rig({ signedIn: true, href: `${PAGE}?project=${ID}&live=${TOKEN}` });
    privateUnlessToken(r, "editor");
    r.room.role = "editor";
    await r.controller.openAddress(planOpen(`?project=${ID}&live=${TOKEN}`));
    expect(query(r.network.last.url)).toEqual({ live: TOKEN });
    expect(r.controller.signedIn).toBe(true);
    await settle(30);
    expect(r.idb.connections.length).toBeGreaterThan(0);
  });
});
