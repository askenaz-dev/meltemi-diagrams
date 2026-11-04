import { presenceColour } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { CloudApi } from "../src/cloud/client.js";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import { DATABASE_NAME, DOCS, UPDATES, openDatabase } from "../src/cloud/persistence.js";
import { THROTTLE_MS, studioSource } from "../src/cloud/presence.js";
import { CloudProject, type ProjectDeps } from "../src/cloud/project.js";
import { BACKOFF, KIND, REFUSED_BACKOFF } from "../src/cloud/room.js";
import { announcement, statusText, type ConnectionStatus } from "../src/cloud/status.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, counter, newStudio } from "./support/cloud.js";
import { AwarenessRoom, type Identity } from "./support/fake-awareness.js";
import { FakeIdb } from "./support/fake-idb.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const ADDRESS = `wss://diagrams.example/rooms/${ID}`;
const A = "diagrams/a.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const ANA: Identity = { sub: "u_ana", name: "Ana" };
const BEN: Identity = { sub: "u_ben", name: "Ben", picture: "https://avatars.example/ben.png" };
const EVA: Identity = { sub: "u_eva", name: "Eva" };

const nothing = () => Promise.reject(new Error("The project made a call nobody expected."));
const api: CloudApi = {
  list: nothing,
  create: nothing,
  get: nothing,
  update: nothing,
  duplicate: nothing,
  remove: nothing,
  files: nothing,
  uploadBinary: nothing,
  deleteBinary: nothing,
  blob: nothing,
  versions: nothing,
  createVersion: nothing,
  restoreVersion: nothing,
  putThumbnail: nothing,
  usage: nothing,
};

/** One room and the one clock every page of the test shares. */
interface World {
  readonly timers: ManualTimers;
  readonly room: FakeRoom;
  readonly awareness: AwarenessRoom;
}

function world(): World {
  const timers = new ManualTimers();
  const room = new FakeRoom();
  addTextFile(cloudDoc(room.doc), A, SOURCE_A, { origin: "seed" });
  return { timers, room, awareness: new AwarenessRoom(room) };
}

/** A person's page: the Studio, its code pane, and the project open in the room. */
interface Page {
  readonly name: string;
  readonly network: FakeNetwork;
  readonly studio: ReturnType<typeof newStudio>;
  readonly pane: FakePane;
  readonly project: CloudProject;
  readonly reports: string[];
  readonly statuses: ConnectionStatus[];
  readonly online: { value: boolean };
  readonly idb: FakeIdb;
}

interface Joined {
  readonly page: Page | undefined;
  readonly full: boolean;
}

/** Opens the project on a new page, as the controller does, and tells presence what the page does. */
async function attempt(
  w: World,
  who: Identity,
  options: { role?: string; idb?: FakeIdb } = {},
): Promise<Joined> {
  const network = new FakeNetwork();
  w.awareness.serve(network, who, options.role ?? "owner");
  const idb = options.idb ?? new FakeIdb();
  const studio = newStudio();
  const pane = new FakePane(studio);
  const reports: string[] = [];
  const statuses: ConnectionStatus[] = [];
  const online = { value: true };
  const deps: ProjectDeps = {
    studio,
    api,
    database: await openDatabase(idb),
    socket: network.factory,
    address: ADDRESS,
    timers: w.timers,
    online: () => online.value,
    selection: () => pane.selection,
    lastOpen: () => undefined,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: (status) => statuses.push(status),
    random: counter(),
    now: () => w.timers.now,
    ...(options.role === "viewer" ? { readOnly: true } : {}),
  };
  const pending = CloudProject.prepare(ID, deps);
  await settle();
  const result = await pending;
  if (!result.ok) return { page: undefined, full: result.full === true };
  result.project.attach();
  // What the page's mount does: presence learns what the person does.
  result.project.presence.attach(studioSource(studio, () => pane.selection));
  await settle();
  return {
    page: {
      name: who.name,
      network,
      studio,
      pane,
      project: result.project,
      reports,
      statuses,
      online,
      idb,
    },
    full: false,
  };
}

async function join(w: World, who: Identity, options: { role?: string; idb?: FakeIdb } = {}) {
  const { page } = await attempt(w, who, options);
  if (!page) throw new Error(`${who.name} could not join.`);
  return page;
}

/** The person moves the caret or selects, and what the page says about it has time to arrive. */
async function select(w: World, page: Page, start: number, end = start): Promise<void> {
  page.pane.select(start, end);
  page.project.presence.moved();
  w.timers.advance(THROTTLE_MS);
  await settle();
}

const names = (page: Page) => page.project.presence.peers.map((peer) => peer.name).sort();
const carets = (page: Page) =>
  page.project.presence
    .carets(A, page.studio.text(A), "Someone")
    .map((c) => [c.name, c.start, c.end]);

describe("two people in one file", () => {
  it("shows Ana where Ben selected a word, in his colour and with his name, and Ben in her header", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    // "flow" in `diagram a: flow {`.
    const word = SOURCE_A.indexOf("flow");
    await select(w, ben, word, word + 4);
    expect(carets(ana)).toEqual([["Ben", word, word + 4]]);
    const [drawn] = ana.project.presence.carets(A, ana.studio.text(A), "Someone");
    expect(drawn?.colour).toBe(presenceColour("u_ben"));
    expect(ana.project.presence.people()).toEqual([
      {
        sub: "u_ben",
        name: "Ben",
        picture: "https://avatars.example/ben.png",
        colour: presenceColour("u_ben"),
        guest: false,
        file: { id: expect.any(String), path: A },
        connections: 1,
      },
    ]);
    // Ben sees Ana too: both pages publish.
    expect(names(ben)).toEqual(["Ana"]);
  });

  it("takes the identity from the room: the page sends where it is, never who", async () => {
    const w = world();
    await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 3);
    const sent = ben.network.last.sentOf(KIND.awareness).map((m) => new TextDecoder().decode(m));
    expect(sent.length).toBeGreaterThan(0);
    for (const text of sent) expect(text).not.toMatch(/user|u_ben|Ben|picture|colour/);
  });

  it("moves their selection with the text Ana types before it", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    const word = SOURCE_A.indexOf("flow");
    await select(w, ben, word, word + 4);
    ana.pane.select(0);
    ana.pane.type("// by Ana\n");
    w.timers.advance(THROTTLE_MS);
    await settle();
    const [[, start, end]] = carets(ana) as [[string, number, number]];
    expect(ana.studio.text(A).slice(start, end)).toBe("flow");
    expect(ben.studio.text(A).startsWith("// by Ana\n")).toBe(true);
  });

  it("shows the others who are in the room when a page joins, before anything else", async () => {
    const w = world();
    await join(w, ANA);
    await join(w, BEN, { role: "editor" });
    const eva = await join(w, EVA, { role: "editor" });
    expect(names(eva)).toEqual(["Ana", "Ben"]);
  });

  it("stops showing a person when the room says they are gone", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 4);
    expect(names(ana)).toEqual(["Ben"]);
    // A closed page: the socket ends, the room tells the others.
    ben.project.close();
    expect(names(ana)).toEqual([]);
    expect(ana.project.presence.people()).toEqual([]);
  });

  it("stops showing a person who fell silent, when the room drops their state and says so", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 4);
    const id = [...w.awareness.clients.values()].find((c) => c.identity.sub === "u_ben")!.id;
    w.awareness.expire(id);
    expect(names(ana)).toEqual([]);
  });

  it("is seen by a viewer, and a viewer is seen, though a viewer writes nothing", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "viewer" });
    await select(w, ben, 9, 12);
    await select(w, ana, 2);
    expect(carets(ana)).toEqual([["Ben", 9, 12]]);
    expect(names(ben)).toEqual(["Ana"]);
    expect(ben.network.last.sentOf(KIND.awareness).length).toBeGreaterThan(0);
    expect(ben.network.last.sentOf(KIND.update)).toEqual([]);
  });

  it("keeps nothing of presence in the room's document or in what this browser keeps", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 4, 8);
    await ana.project.settled();
    // The room's document holds the project's files and nothing of who is where.
    expect(JSON.stringify(w.room.doc.toJSON())).not.toMatch(/Ben|u_ben|caret|anchor/);
    const kept = ana.idb.rows(DATABASE_NAME, DOCS) as { state: Uint8Array }[];
    expect(kept).toHaveLength(1);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, kept[0]!.state);
    expect(JSON.stringify(doc.toJSON())).not.toMatch(/Ben|u_ben|caret|anchor/);
    expect(
      ana.idb
        .rows(DATABASE_NAME, UPDATES)
        .map((row) => JSON.stringify(row))
        .join(),
    ).not.toMatch(/Ben|u_ben/);
  });
});

describe("the connection coming and going", () => {
  it("clears the others when the socket drops, merges what both typed meanwhile, and says who is here again", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 5);
    expect(names(ana)).toEqual(["Ben"]);
    // Ana's connection drops for a while.
    ana.network.last.serverClose(1006);
    expect(ana.project.status?.state).toBe("reconnecting");
    expect(names(ana)).toEqual([]);
    expect(names(ben)).toEqual([]);
    // She types at the end of the file; Ben types at its start.
    ana.pane.select(ana.studio.text(A).length);
    ana.pane.type("// Ana\n");
    ben.pane.select(0);
    ben.pane.type("// Ben\n");
    w.timers.advance(THROTTLE_MS);
    await settle();
    expect(ana.studio.text(A)).toBe(`${SOURCE_A}// Ana\n`);
    // The connection comes back after its first wait.
    const before = w.awareness.received.length;
    w.timers.advance(BACKOFF.initial);
    await settle();
    w.timers.advance(THROTTLE_MS);
    await settle();
    expect(ana.project.status?.state).toMatch(/connected|saving/);
    const merged = `// Ben\n${SOURCE_A}// Ana\n`;
    expect(ana.studio.text(A)).toBe(merged);
    expect(ben.studio.text(A)).toBe(merged);
    // The page said where it is again, and the room told it who is here.
    expect(w.awareness.received.length).toBeGreaterThan(before);
    expect(names(ana)).toEqual(["Ben"]);
    expect(names(ben)).toEqual(["Ana"]);
  });

  it("says nothing of presence while offline and again as soon as the browser is back", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 5);
    ana.online.value = false;
    ana.network.throwing = true;
    ana.network.last.serverClose(1006);
    ana.project.network();
    expect(ana.project.status?.state).toBe("offline");
    expect(names(ana)).toEqual([]);
    const sockets = ana.network.sockets.length;
    ana.pane.select(7);
    ana.project.presence.moved();
    w.timers.advance(BACKOFF.initial * 3);
    await settle();
    // The browser says it is offline: attempts fail, and nothing moves while it is down.
    expect(ana.project.status?.state).toBe("offline");
    ana.online.value = true;
    ana.network.throwing = false;
    ana.project.network();
    await settle();
    expect(ana.network.sockets.length).toBeGreaterThan(sockets);
    expect(ana.project.status?.state).toMatch(/connected|saving/);
    w.timers.advance(THROTTLE_MS);
    await settle();
    expect(names(ben)).toEqual(["Ana"]);
    expect(
      ben.project.presence.carets(A, ben.studio.text(A), "?").map((c) => [c.name, c.head]),
    ).toEqual([["Ana", 7]]);
  });

  it("does not leave a timer of presence behind when both pages are closed", async () => {
    const w = world();
    const ana = await join(w, ANA);
    const ben = await join(w, BEN, { role: "editor" });
    await select(w, ben, 5);
    ana.project.close();
    ben.project.close();
    await settle();
    expect(w.timers.waiting).toBe(0);
  });
});

describe("a room that is full", () => {
  it("turns away a person with nothing kept here at once, and says what to do", async () => {
    const w = world();
    await join(w, ANA);
    w.awareness.limit = 1;
    const started = w.timers.now;
    const eva = await attempt(w, EVA, { role: "editor" });
    expect(eva).toEqual({ page: undefined, full: true });
    // Not after ten seconds of waiting for an answer that will not come.
    expect(w.timers.now).toBe(started);
  });

  it("opens the project of a person who has it kept here, and says the room is full with an offer to try again", async () => {
    const w = world();
    const idb = new FakeIdb();
    const first = await join(w, EVA, { role: "editor", idb });
    await first.project.settled();
    first.project.close();
    await settle();
    const ana = await join(w, ANA);
    w.awareness.limit = 1;
    const eva = await join(w, EVA, { role: "editor", idb });
    await settle();
    expect(eva.project.status?.state).toBe("full");
    expect(statusText(eva.project.status!, en.cloud.status)).toBe(en.cloud.status.full(20));
    expect(eva.reports.at(-1)).toBe(en.cloud.errors.roomFull(20));
    // The page tries again by itself, with the waits of a refusal; the room is still full.
    w.timers.advance(REFUSED_BACKOFF.initial);
    await settle();
    expect(eva.project.status?.state).toBe("full");
    // Ana leaves; the person asks to try again at once, and is in.
    const seen = eva.statuses.length;
    ana.project.close();
    eva.project.network();
    await settle();
    expect(eva.project.status?.state).toMatch(/connected|saving/);
    const after = eva.statuses.slice(seen);
    expect(after.at(-1)?.state).toMatch(/connected|saving/);
    const [full, joined] = [
      { state: "full", kept: true } as const,
      { state: "connected", kept: true } as const,
    ];
    expect(announcement(full, joined, en.cloud.status)).toBe(en.cloud.status.synced);
    // Said once, in the refusal's own words: not again by the status line's change.
    expect(announcement(joined, full, en.cloud.status)).toBeUndefined();
  });
});
