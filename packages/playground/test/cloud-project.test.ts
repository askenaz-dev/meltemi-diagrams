import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { SEND_INTERVAL } from "../src/cloud/binding.js";
import type { CloudApi, Outcome } from "../src/cloud/client.js";
import { addBinaryFile, addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  openDatabase,
  DATABASE_NAME,
  DOCS,
  UPDATES,
  type CloudDatabase,
} from "../src/cloud/persistence.js";
import {
  CONFIRM_AFTER_MS,
  CloudProject,
  DELETE_HOLD_MS,
  FIRST_ANSWER_MS,
  RESEND_LIMIT,
  SAVED_AFTER_MS,
  SNAPSHOT_AFTER_MS,
  type ProjectDeps,
} from "../src/cloud/project.js";
import { KIND } from "../src/cloud/room.js";
import type { ConnectionStatus } from "../src/cloud/status.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { newStudio, FakePane, counter } from "./support/cloud.js";
import { FakeIdb } from "./support/fake-idb.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const ADDRESS = `wss://diagrams.example/rooms/${ID}`;
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';

/** A room that already holds these files, as another device or the API left them. */
function seeded(files: Record<string, string>): FakeRoom {
  const room = new FakeRoom();
  const cloud = cloudDoc(room.doc);
  for (const [path, text] of Object.entries(files))
    addTextFile(cloud, path, text, { origin: "seed" });
  return room;
}

const failed = (status: number, code: string): Outcome<never> => ({
  ok: false,
  failure: { kind: "refused", status, code },
});

/** The calls a project makes (blobs and uploads), answered by the test. */
function fakeApi(
  answers: {
    blob?: (hash: string) => Outcome<Uint8Array>;
    upload?: (path: string, bytes: Uint8Array) => Outcome<{ hash: string }>;
    /** The answer to a removal of an image or font; a promise the test settles when it likes. */
    remove?: (path: string) => Outcome<null> | Promise<Outcome<null>>;
    get?: () => Outcome<never>;
  } = {},
): CloudApi & {
  uploads: string[];
  blobs: string[];
  /** The paths asked to be removed, in order. */
  removals: string[];
  /** Every upload and removal, in the order the service got them: `PUT path`, `DELETE path`. */
  order: string[];
  asked: number;
} {
  const uploads: string[] = [];
  const blobs: string[] = [];
  const removals: string[] = [];
  const order: string[] = [];
  const counted = { asked: 0 };
  const nothing = () => Promise.reject(new Error("The project made a call nobody expected."));
  return {
    uploads,
    blobs,
    removals,
    order,
    get asked() {
      return counted.asked;
    },
    list: nothing,
    create: nothing,
    get: () => {
      counted.asked++;
      return answers.get ? Promise.resolve(answers.get()) : nothing();
    },
    update: nothing,
    duplicate: nothing,
    remove: nothing,
    files: nothing,
    deleteBinary: (_id, path) => {
      removals.push(path);
      order.push(`DELETE ${path}`);
      return Promise.resolve(answers.remove?.(path) ?? { ok: true, value: null });
    },
    versions: nothing,
    createVersion: nothing,
    restoreVersion: nothing,
    putThumbnail: nothing,
    usage: nothing,
    uploadBinary: (_id, path, bytes) => {
      uploads.push(path);
      order.push(`PUT ${path}`);
      return Promise.resolve(
        answers.upload?.(path, bytes) ?? { ok: true, value: { hash: "0".repeat(64) } },
      );
    },
    blob: (_id, hash) => {
      blobs.push(hash);
      return Promise.resolve(answers.blob?.(hash) ?? failed(404, "project.not-found"));
    },
  };
}

interface Rig {
  readonly timers: ManualTimers;
  readonly network: FakeNetwork;
  readonly room: FakeRoom;
  readonly idb: FakeIdb;
  readonly database: CloudDatabase;
  readonly studio: ReturnType<typeof newStudio>;
  readonly pane: FakePane;
  readonly reports: string[];
  readonly statuses: ConnectionStatus[];
  readonly online: { value: boolean };
  readonly deps: ProjectDeps;
  readonly api: ReturnType<typeof fakeApi>;
}

async function rig(
  options: {
    room?: FakeRoom;
    idb?: FakeIdb;
    unavailable?: boolean;
    lastOpen?: string;
    api?: ReturnType<typeof fakeApi>;
  } = {},
): Promise<Rig> {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = options.room ?? new FakeRoom();
  room.serve(network);
  const idb = options.idb ?? new FakeIdb();
  const database = await openDatabase(options.unavailable ? undefined : idb);
  const studio = newStudio();
  const pane = new FakePane(studio);
  const reports: string[] = [];
  const statuses: ConnectionStatus[] = [];
  const online = { value: true };
  const api = options.api ?? fakeApi();
  const deps: ProjectDeps = {
    studio,
    api,
    database,
    socket: network.factory,
    address: ADDRESS,
    timers,
    online: () => online.value,
    selection: () => pane.selection,
    lastOpen: () => options.lastOpen,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: (status) => statuses.push(status),
    random: counter(),
  };
  return {
    timers,
    network,
    room,
    idb,
    database,
    studio,
    pane,
    reports,
    statuses,
    online,
    deps,
    api,
  };
}

/** Opens the project and binds the Studio, the way the page does once the room has answered. */
async function opened(r: Rig): Promise<CloudProject> {
  const pending = CloudProject.prepare(ID, r.deps);
  await settle();
  const result = await pending;
  if (!result.ok) throw new Error("The project did not open.");
  result.project.attach();
  await settle();
  return result.project;
}

const roomText = (room: FakeRoom, path: string) => room.text(path);

describe("opening a project the browser has no copy of", () => {
  it("waits for the room's first answer, and binds the Studio only when it is told to", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A, [B]: SOURCE_B }) });
    const pending = CloudProject.prepare(ID, r.deps);
    await settle();
    const result = await pending;
    expect(result.ok).toBe(true);
    // Nothing of the Studio has changed yet: the page swaps projects in one go.
    expect(r.studio.host.paths()).toEqual([]);
    expect(r.studio.isBound()).toBe(false);
    if (!result.ok) return;
    result.project.attach();
    expect(r.studio.isBound()).toBe(true);
    expect(r.studio.host.paths()).toEqual([A, B]);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(r.studio.open).toBe(A);
    expect(r.network.urls).toEqual([ADDRESS]);
  });

  it("opens the file the person had open in it, when the room still has it", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A, [B]: SOURCE_B }), lastOpen: B });
    await opened(r);
    expect(r.studio.open).toBe(B);
    const again = await rig({ room: seeded({ [A]: SOURCE_A }), lastOpen: B });
    await opened(again);
    expect(again.studio.open).toBe(A);
  });

  it("keeps the project in this browser as soon as it opens", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    await r.database
      .project(ID, { snapshot: () => new Uint8Array(), unsynced: () => false })
      .flush();
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toHaveLength(1);
  });

  it("gives up when the room never answers, after ten seconds, and leaves nothing open", async () => {
    const r = await rig();
    r.room.greeting = false;
    const pending = CloudProject.prepare(ID, r.deps);
    await settle();
    r.timers.advance(FIRST_ANSWER_MS - 1);
    await settle();
    let result: { ok: boolean } | undefined;
    void pending.then((value) => (result = value));
    await settle();
    expect(result).toBeUndefined();
    r.timers.advance(1);
    await settle();
    expect(result).toEqual({ ok: false });
    expect(r.network.last.closed).toBeDefined();
    expect(r.studio.isBound()).toBe(false);
    // Nothing was kept of a project that never opened: a copy of nothing would open with no files.
    await settle(30);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toEqual([]);
    const again = await rig({ room: seeded({ [A]: SOURCE_A }), idb: r.idb });
    expect(await CloudProject.prepare(ID, again.deps, { needsCopy: true })).toEqual({ ok: false });
  });

  it("does not even connect when the service is out of reach and no copy is kept", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const result = await CloudProject.prepare(ID, r.deps, { needsCopy: true });
    expect(result).toEqual({ ok: false });
    expect(r.network.sockets).toHaveLength(0);
  });

  it("takes the room's copy when the one in this browser cannot be read", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const first = await opened(r);
    first.close();
    await r.database
      .project(ID, { snapshot: () => new Uint8Array(), unsynced: () => false })
      .flush();
    // The state kept is garbage now.
    const docs = r.idb.databases.get(DATABASE_NAME)!.stores.get(DOCS)!.rows;
    docs[0]!.value = { state: new Uint8Array([255, 255, 255, 255, 9, 9]), unsynced: false };
    const again = await rig({ room: r.room, idb: r.idb });
    await opened(again);
    expect(again.studio.text(A)).toBe(SOURCE_A);
  });
});

describe("opening a project the browser has a copy of", () => {
  /**
   * A project that was open and edited in this browser, then closed. `room` is the room as it
   * was before the edit reached it; `edited` is the room as it is after.
   */
  async function kept(): Promise<{ room: FakeRoom; edited: FakeRoom; idb: FakeIdb }> {
    const first = await rig({ room: seeded({ [A]: SOURCE_A, [B]: SOURCE_B }) });
    const before = Y.encodeStateAsUpdate(first.room.doc);
    const project = await opened(first);
    first.pane.select(first.studio.text(A).length);
    first.pane.type("!");
    first.timers.advance(SEND_INTERVAL);
    await settle();
    project.close();
    await project.settled();
    const room = new FakeRoom();
    Y.applyUpdate(room.doc, before, "seed");
    return { room, edited: first.room, idb: first.idb };
  }

  it("opens at once from this browser, before the room has said a word", async () => {
    const { edited: room, idb } = await kept();
    const r = await rig({ room, idb });
    r.room.greeting = false;
    const pending = CloudProject.prepare(ID, r.deps);
    await settle();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.project.attach();
    expect(r.studio.text(A)).toBe(`${SOURCE_A}!`);
    expect(r.studio.text(B)).toBe(SOURCE_B);
    // The socket was asked for, and has not answered: connecting, nothing lost.
    expect(r.network.sockets).toHaveLength(1);
    expect(result.project.status).toEqual({ state: "connecting", kept: true });
    // The room greets: the project is connected, and saving what it offers the room.
    r.room.greet(r.network.last);
    await settle();
    expect(result.project.status).toEqual({ state: "saving", kept: true });
    r.timers.advance(SAVED_AFTER_MS);
    expect(result.project.status).toEqual({ state: "connected", kept: true });
  });

  it("opens with no connection at all, and says it is offline", async () => {
    const { edited: room, idb } = await kept();
    const r = await rig({ room, idb });
    r.online.value = false;
    r.network.throwing = true;
    const result = await CloudProject.prepare(ID, r.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.project.attach();
    expect(r.studio.text(A)).toBe(`${SOURCE_A}!`);
    expect(result.project.status).toEqual({ state: "offline", kept: true });
  });

  it("offers the room what it made while away, and the room keeps it", async () => {
    // The room is as it was before the edit: the edit never arrived, and the browser kept it.
    const { room, idb } = await kept();
    expect(room.text(A)).toBe(SOURCE_A);
    const r = await rig({ room, idb });
    await opened(r);
    // The browser's copy was marked as not known to the room: the whole document went at hello.
    expect(room.text(A)).toBe(`${SOURCE_A}!`);
    expect(r.studio.text(A)).toBe(`${SOURCE_A}!`);
  });

  it("does not offer the room anything when it has all of it already", async () => {
    const { edited: room, idb } = await kept();
    const first = await rig({ room, idb });
    const project = await opened(first);
    // The browser's copy was written at close, before a quiet while confirmed the room had it.
    first.timers.advance(CONFIRM_AFTER_MS);
    await project.settled();
    await settle(30);
    project.close();
    await project.settled();
    const again = await rig({ room, idb });
    again.room.received.length = 0;
    await opened(again);
    expect(again.room.received.map((message) => message.kind)).toEqual([KIND.sync]);
  });
});

describe("working with the room", () => {
  it("sends the person's edits, merged, and the room has them", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.pane.select(r.studio.text(A).length);
    const before = r.room.received.length;
    r.pane.type("a");
    r.pane.type("b");
    r.pane.type("c");
    // Nothing leaves before the pause that merges them.
    expect(r.room.received.length).toBe(before);
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}abc`);
    expect(r.room.received.slice(before)).toEqual([
      { kind: KIND.update, bytes: expect.any(Number) },
    ]);
  });

  it("shows the room's changes in the Studio, and keeps the caret", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    const caret = SOURCE_A.indexOf("flow");
    r.pane.select(caret);
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === A)![0];
      cloud.files.get(id)!.insert(0, "// a note\n");
    });
    expect(r.studio.text(A)).toBe(`// a note\n${SOURCE_A}`);
    expect(r.pane.selection).toEqual({
      start: caret + "// a note\n".length,
      end: caret + "// a note\n".length,
    });
  });

  it("says saving while changes are on their way, and saved a moment after", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    expect(r.statuses.at(-1)).toEqual({ state: "connected", kept: true });
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    expect(r.statuses.at(-1)).toEqual({ state: "saving", kept: true });
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(r.statuses.at(-1)?.state).toBe("saving");
    r.timers.advance(SAVED_AFTER_MS);
    expect(r.statuses.at(-1)).toEqual({ state: "connected", kept: true });
  });

  it("keeps each of the person's edits in this browser as it is made", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("a");
    r.pane.type("b");
    await r.database
      .project(ID, { snapshot: () => new Uint8Array(), unsynced: () => false })
      .flush();
    await settle(30);
    expect(r.idb.rows(DATABASE_NAME, UPDATES).length).toBeGreaterThanOrEqual(2);
  });

  it("writes what the room changed to this browser a moment after", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    await project.settled();
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === A)![0];
      cloud.files.get(id)!.insert(0, "x");
    });
    r.timers.advance(SNAPSHOT_AFTER_MS);
    await project.settled();
    await settle(30);
    const again = await rig({ room: r.room, idb: r.idb });
    r.room.greeting = false;
    again.room.greeting = false;
    const result = await CloudProject.prepare(ID, again.deps, { needsCopy: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      result.project.attach();
      expect(again.studio.text(A)).toBe(`x${SOURCE_A}`);
    }
  });

  it("shows two files with one path as the path and the path with the id, and says so", async () => {
    const room = seeded({ [A]: SOURCE_A });
    addTextFile(cloudDoc(room.doc), A, "other", { id: "zzzzzzzzzzzzzzzz", origin: "seed" });
    const r = await rig({ room });
    await opened(r);
    expect(r.studio.host.paths()).toEqual([A, `${A}~zzzzzzzzzzzzzzzz`]);
    expect(r.reports.at(-1)).toBe(en.cloud.project.collisions([`${A}~zzzzzzzzzzzzzzzz`]));
  });
});

describe("losing the connection", () => {
  it("says reconnecting, goes on editing, and the room has everything after the next hello", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.drop();
    expect(project.status).toEqual({ state: "reconnecting", kept: true });
    r.pane.select(r.studio.text(A).length);
    r.pane.type("offline");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    // The edit is in the Studio and in this browser, not in the room.
    expect(r.studio.text(A)).toBe(`${SOURCE_A}offline`);
    expect(roomText(r.room, A)).toBe(SOURCE_A);
    r.timers.advance(1000);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}offline`);
    expect(project.status?.state).toMatch(/connected|saving/);
  });

  it("says offline when the browser says so, and connected again when it is back", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.online.value = false;
    r.room.drop();
    expect(project.status).toEqual({ state: "offline", kept: true });
    r.online.value = true;
    project.network();
    // The page opens a socket at once, without waiting for the backoff.
    expect(r.network.sockets).toHaveLength(2);
    await settle();
    expect(project.status).toEqual({ state: "connected", kept: true });
  });

  it("merges what two devices did while one was away, without a dialog", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A, [B]: SOURCE_B }) });
    const project = await opened(r);
    r.room.drop();
    // This device edits a.meltemi offline.
    r.studio.select(A);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("// mine\n");
    r.timers.advance(SEND_INTERVAL);
    // Another device edits b.meltemi at the room.
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === B)![0];
      cloud.files.get(id)!.insert(0, "// theirs\n");
    });
    r.timers.advance(1000);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}// mine\n`);
    expect(roomText(r.room, B)).toBe(`// theirs\n${SOURCE_B}`);
    expect(r.studio.text(A)).toBe(`${SOURCE_A}// mine\n`);
    expect(r.studio.text(B)).toBe(`// theirs\n${SOURCE_B}`);
    expect(project.status?.kept).toBe(true);
  });

  it("marks the browser's copy as not known to the room until a quiet while on an open socket", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    project.flush();
    await project.settled();
    expect((r.idb.rows(DATABASE_NAME, DOCS)[0] as { unsynced: boolean }).unsynced).toBe(true);
    r.timers.advance(CONFIRM_AFTER_MS);
    await project.settled();
    await settle(30);
    expect((r.idb.rows(DATABASE_NAME, DOCS)[0] as { unsynced: boolean }).unsynced).toBe(false);
    expect(r.idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
  });

  it("does not take a change for delivered when the socket was down", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.drop();
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    r.timers.advance(SEND_INTERVAL + CONFIRM_AFTER_MS - 1000);
    await project.settled();
    project.flush();
    await project.settled();
    expect((r.idb.rows(DATABASE_NAME, DOCS)[0] as { unsynced: boolean }).unsynced).toBe(true);
  });

  it("sends a browser's unsent changes after a reload, from the copy it kept", async () => {
    const first = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(first);
    first.room.drop();
    first.network.throwing = true;
    first.pane.select(first.studio.text(A).length);
    first.pane.type("while offline");
    first.timers.advance(SEND_INTERVAL);
    await settle();
    project.close();
    await project.settled();
    expect(roomText(first.room, A)).toBe(SOURCE_A);
    // The page is reloaded, the network is back.
    const second = await rig({ room: first.room, idb: first.idb });
    await opened(second);
    expect(second.studio.text(A)).toBe(`${SOURCE_A}while offline`);
    expect(roomText(second.room, A)).toBe(`${SOURCE_A}while offline`);
  });

  it("offers only the changes of this session when the document is too big for one message", async () => {
    const big = "x".repeat(RESEND_LIMIT + 1000);
    const r = await rig({ room: seeded({ [A]: big }) });
    const project = await opened(r);
    r.room.drop();
    r.pane.select(r.studio.text(A).length);
    r.pane.type("tail");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    r.room.received.length = 0;
    r.timers.advance(1000);
    await settle();
    const updates = r.room.received.filter((message) => message.kind === KIND.update);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.bytes).toBeLessThan(RESEND_LIMIT);
    expect(roomText(r.room, A)).toBe(`${big}tail`);
    expect(project.status?.state).not.toBe("offline");
  });

  it("refuses an offline change that no message can carry, instead of calling it saved", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.drop();
    r.pane.select(r.studio.text(A).length);
    r.pane.type("y".repeat(RESEND_LIMIT + 1000));
    r.timers.advance(SEND_INTERVAL);
    await settle();
    // The connection returns; the room says hello and asks, as the real room does at every hello.
    r.timers.advance(1000);
    await settle();
    r.network.last.deliver(KIND.sync, Y.encodeStateVector(r.room.doc));
    await settle();
    // Said as any refusal is said, and the text is the room's again; nothing was sent.
    expect(r.reports.at(-1)).toBe(en.cloud.refusal.undone(en.cloud.errors.messageTooLarge(512)));
    expect(r.room.received.filter((message) => message.kind === KIND.update)).toEqual([]);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(roomText(r.room, A)).toBe(SOURCE_A);
    // The project goes on: the next edit reaches the room, and nothing is left unsynced.
    r.pane.select(r.studio.text(A).length);
    r.pane.type("next");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}next`);
    r.timers.advance(CONFIRM_AFTER_MS);
    await project.settled();
    await settle(30);
    expect((r.idb.rows(DATABASE_NAME, DOCS)[0] as { unsynced: boolean }).unsynced).toBe(false);
  });

  it("refuses it after a reload too, from the copy the browser kept", async () => {
    const first = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(first);
    first.room.drop();
    first.network.throwing = true;
    first.pane.select(first.studio.text(A).length);
    first.pane.type("y".repeat(RESEND_LIMIT + 1000));
    first.timers.advance(SEND_INTERVAL);
    await settle();
    project.close();
    await project.settled();
    // The page is reloaded, the network is back: the copy is unsynced and the room lacks too much.
    const second = await rig({ room: first.room, idb: first.idb });
    await opened(second);
    second.network.last.deliver(KIND.sync, Y.encodeStateVector(second.room.doc));
    await settle();
    expect(second.reports.at(-1)).toBe(
      en.cloud.refusal.undone(en.cloud.errors.messageTooLarge(512)),
    );
    expect(second.studio.text(A)).toBe(SOURCE_A);
    await settle(30);
    // The copy is the room's now: a further reload does not offer the change again.
    expect((second.idb.rows(DATABASE_NAME, DOCS)[0] as { unsynced: boolean }).unsynced).toBe(false);
    expect(second.idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
  });
});

describe("a change the room refuses", () => {
  it("is named in the status line, the text goes back to the room's, and the socket reopens", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.refuses = (_update, _doc) => "doc.too-large";
    r.pane.select(r.studio.text(A).length);
    r.pane.type("too much");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(r.reports.at(-1)).toBe(en.cloud.refusal.undone(en.cloud.errors.docTooLarge(16, "2 Mi")));
    expect(r.reports.at(-1)).toContain("16 MiB");
    // The socket is closed and will reopen after half a second; the text is still the person's.
    expect(r.network.sockets).toHaveLength(1);
    expect(r.studio.text(A)).toBe(`${SOURCE_A}too much`);
    r.room.refuses = undefined;
    r.timers.advance(500);
    await settle();
    expect(r.network.sockets).toHaveLength(2);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(roomText(r.room, A)).toBe(SOURCE_A);
    r.timers.advance(SAVED_AFTER_MS);
    expect(project.status?.state).toBe("connected");
  });

  it("goes on working with the room's state afterwards", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.refuses = () => "path.invalid";
    r.room.closeCode = 4400;
    r.pane.select(r.studio.text(A).length);
    r.pane.type("bad");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    r.room.refuses = undefined;
    r.timers.advance(500);
    await settle();
    expect(r.studio.isBound()).toBe(true);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("good");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}good`);
    // A remote change still arrives.
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === A)![0];
      cloud.files.get(id)!.insert(0, "!");
    });
    expect(r.studio.text(A)).toBe(`!${SOURCE_A}good`);
    // And undo covers only what the person did since.
    expect(project.status?.kept).toBe(true);
  });

  it("does not send what the refused document makes after the refusal", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.room.refuses = () => "doc.invalid";
    r.room.closeCode = 4400;
    r.pane.select(r.studio.text(A).length);
    r.pane.type("one");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    r.room.received.length = 0;
    // Typing before the room's state is back goes nowhere.
    r.pane.type("two");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(r.room.received).toEqual([]);
  });

  it("does not write the refused document as the browser's copy while the room's state is on its way", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    await project.settled();
    r.room.refuses = () => "doc.too-large";
    r.pane.select(r.studio.text(A).length);
    r.pane.type("refused");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    // The page is hidden before the socket reopens.
    project.flush();
    await project.settled();
    await settle(30);
    const row = r.idb.rows(DATABASE_NAME, DOCS)[0] as { state: Uint8Array };
    const kept = new Y.Doc();
    Y.applyUpdate(kept, row.state);
    const cloud = cloudDoc(kept);
    const id = [...cloud.paths].find(([, path]) => path === A)![0];
    expect(cloud.files.get(id)!.toString()).toBe(SOURCE_A);
  });

  it("is not kept in this browser: opening it again gives the room's text", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.room.refuses = () => "doc.too-large";
    r.pane.select(r.studio.text(A).length);
    r.pane.type("refused");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    r.room.refuses = undefined;
    r.timers.advance(500);
    await settle();
    project.close();
    await project.settled();
    const again = await rig({ room: r.room, idb: r.idb });
    again.room.greeting = false;
    const result = await CloudProject.prepare(ID, again.deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      result.project.attach();
      expect(again.studio.text(A)).toBe(SOURCE_A);
    }
  });

  it("is said again at every refusal, and the waits grow while it repeats", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.room.refuses = () => "doc.too-large";
    for (let i = 0; i < 2; i++) {
      r.pane.select(r.studio.text(A).length);
      r.pane.type(`x${i}`);
      r.timers.advance(SEND_INTERVAL);
      await settle();
      r.timers.advance(10_000);
      await settle();
    }
    expect(r.reports.filter((m) => m.includes("not kept"))).toHaveLength(2);
  });

  it("keeps the document when the room is full, says so, and tries again", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("mine");
    const socket = r.network.last;
    r.room.clients.delete(socket);
    socket.refuse("room.full", 4409);
    expect(r.reports.at(-1)).toBe(en.cloud.errors.roomFull(20));
    // No swap: the person's text stays, and the socket reopens.
    expect(r.studio.text(A)).toBe(`${SOURCE_A}mine`);
    r.timers.advance(500);
    await settle();
    expect(r.network.sockets).toHaveLength(2);
    expect(r.studio.text(A)).toBe(`${SOURCE_A}mine`);
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}mine`);
    expect(project.status?.state).toMatch(/connected|saving/);
  });

  it("keeps the document when the room closed the socket for too much presence", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("mine");
    const socket = r.network.last;
    r.room.clients.delete(socket);
    socket.refuse("awareness.rate", 4429);
    // Not a refused change: the text stays, nothing replaces it with the room's state, and the
    // socket reopens.
    expect(r.studio.text(A)).toBe(`${SOURCE_A}mine`);
    r.timers.advance(500);
    await settle();
    expect(r.network.sockets).toHaveLength(2);
    expect(r.studio.text(A)).toBe(`${SOURCE_A}mine`);
  });
});

describe("where nothing can be kept", () => {
  it("opens from the room all the same, and says it will not be kept offline", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), unavailable: true });
    const project = await opened(r);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(r.reports).toContain(en.cloud.status.notKept);
    expect(project.status).toEqual({ state: "connected", kept: false });
  });

  it("says so when the browser stops keeping it while the project is open", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.idb.failure.write = UPDATES;
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    await project.settled();
    await settle(30);
    expect(r.reports).toContain(en.cloud.status.notKept);
    expect(project.status?.kept).toBe(false);
    // The project goes on working.
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}x`);
  });
});

describe("images and fonts", () => {
  it("are uploaded through the service when the person adds one", async () => {
    const api = fakeApi();
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    await opened(r);
    r.studio.addFiles([["assets/logo.png", new Uint8Array([137, 80, 78, 71])]]);
    await settle();
    expect(api.uploads).toEqual(["assets/logo.png"]);
  });

  it("says why an upload failed, with the service's words", async () => {
    const api = fakeApi({ upload: () => failed(413, "quota.storage") });
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    await opened(r);
    r.studio.addFiles([["assets/logo.png", new Uint8Array([1])]]);
    await settle();
    expect(r.reports.at(-1)).toBe(
      en.cloud.project.binaryUpload("assets/logo.png", en.cloud.errors.quotaStorage(200)),
    );
  });

  it("is refused before it is sent when it is over the limit for one file", async () => {
    const api = fakeApi();
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    await opened(r);
    r.studio.addFiles([["assets/huge.png", new Uint8Array(10 * 1024 * 1024 + 1)]]);
    await settle();
    expect(api.uploads).toEqual([]);
    expect(r.reports.at(-1)).toBe(
      en.cloud.project.binaryUpload("assets/huge.png", en.cloud.errors.quotaBinary(10)),
    );
  });

  it("are fetched from the project's blobs when the room has them", async () => {
    const api = fakeApi({ blob: () => ({ ok: true, value: new Uint8Array([1, 2, 3]) }) });
    const room = seeded({ [A]: SOURCE_A });
    const hash = "ab".repeat(32);
    const cloud = cloudDoc(room.doc);
    cloud.binaries.set("bbbbbbbbbbbbbbbb", hash);
    cloud.paths.set("bbbbbbbbbbbbbbbb", "assets/logo.png");
    const r = await rig({ room, api });
    await opened(r);
    await settle(30);
    expect(api.blobs).toEqual([hash]);
    expect(r.studio.host.get("assets/logo.png")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("says when a blob cannot be downloaded", async () => {
    const api = fakeApi();
    const room = seeded({ [A]: SOURCE_A });
    const cloud = cloudDoc(room.doc);
    cloud.binaries.set("bbbbbbbbbbbbbbbb", "cd".repeat(32));
    cloud.paths.set("bbbbbbbbbbbbbbbb", "assets/logo.png");
    const r = await rig({ room, api });
    await opened(r);
    await settle(30);
    expect(r.reports.at(-1)).toBe(en.cloud.project.binaryFetch("assets/logo.png"));
  });
});

describe("removing images and fonts", () => {
  const PATH = "assets/logo.png";
  const BYTES = new Uint8Array([1, 2, 3]);

  /** A promise the test settles when it likes: the service's answer. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => (resolve = done));
    return { promise, resolve };
  }

  /** A room that holds `a.meltemi` and these images, as another device left them. */
  function withImages(paths: string[]): FakeRoom {
    const room = seeded({ [A]: SOURCE_A });
    paths.forEach((path, i) => {
      const id = `${"b".repeat(15)}${i + 2}`;
      addBinaryFile(cloudDoc(room.doc), path, "ab".repeat(32), { id, origin: "seed" });
    });
    return room;
  }

  /** A project that holds the images, with the service answering as the test says. */
  async function holding(
    paths: string[],
    remove?: (path: string) => Outcome<null> | Promise<Outcome<null>>,
  ) {
    const api = fakeApi({
      blob: () => ({ ok: true, value: BYTES }),
      ...(remove ? { remove } : {}),
    });
    const r = await rig({ room: withImages(paths), api });
    const project = await opened(r);
    await settle(30);
    for (const path of paths) expect(r.studio.host.get(path)).toEqual(BYTES);
    return { r, api, project };
  }

  const imagesInRoom = (r: Rig) => cloudDoc(r.room.doc).binaries.size;

  it("asks the service to drop it, and the change that removes it from the document waits for the answer", async () => {
    const answer = deferred<Outcome<null>>();
    const { r, api } = await holding([PATH], () => answer.promise);

    r.studio.deleteFile(PATH);
    await settle();
    expect(api.removals).toEqual([PATH]);
    r.timers.advance(SEND_INTERVAL);
    await settle();
    // The room still has the image: the service looks the file up there.
    expect(imagesInRoom(r)).toBe(1);

    answer.resolve({ ok: true, value: null });
    await settle();
    expect(imagesInRoom(r)).toBe(0);
    expect(r.reports).toEqual([]);
    expect(r.studio.host.has(PATH)).toBe(false);
  });

  it("does not hold the person's changes longer than a short while, nor send them twice", async () => {
    const answer = deferred<Outcome<null>>();
    const { r } = await holding([PATH], () => answer.promise);
    r.studio.deleteFile(PATH);
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(imagesInRoom(r)).toBe(1);

    r.timers.advance(DELETE_HOLD_MS);
    await settle();
    expect(imagesInRoom(r)).toBe(0);

    // What the person does after that does not wait for an answer that is still not there.
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}x`);

    // The answer that comes after that changes nothing.
    const received = r.room.received.length;
    answer.resolve({ ok: true, value: null });
    await settle();
    expect(r.room.received).toHaveLength(received);
  });

  it("keeps what the person does after the removal behind it", async () => {
    const answer = deferred<Outcome<null>>();
    const { r } = await holding([PATH], () => answer.promise);
    r.studio.deleteFile(PATH);
    r.timers.advance(SEND_INTERVAL);
    // Deleting a file reopens the code pane, which puts the caret at the start: the person moves it.
    r.pane.select(r.studio.text(A).length);
    r.pane.type("x");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(imagesInRoom(r)).toBe(1);
    expect(roomText(r.room, A)).toBe(SOURCE_A);

    answer.resolve({ ok: true, value: null });
    await settle();
    expect(imagesInRoom(r)).toBe(0);
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}x`);
  });

  it("sends what waits at once when the page is left, or the project closed", async () => {
    for (const leave of ["flush", "close"] as const) {
      const answer = deferred<Outcome<null>>();
      const { r, project } = await holding([PATH], () => answer.promise);
      r.studio.deleteFile(PATH);
      r.timers.advance(SEND_INTERVAL);
      await settle();
      expect(imagesInRoom(r), leave).toBe(1);
      project[leave]();
      expect(imagesInRoom(r), leave).toBe(0);
    }
  });

  it("says nothing when the removal fails, tries again when no answer came, and goes on", async () => {
    const cases: [string, Outcome<null>, number][] = [
      ["no answer", { ok: false, failure: { kind: "unreachable", status: 0 } }, 2],
      ["the service in trouble", failed(500, "internal"), 2],
      ["no such image", failed(404, "not-found"), 1],
      ["signed out", failed(401, "auth.required"), 1],
    ];
    for (const [name, answer, calls] of cases) {
      const { r, api } = await holding([PATH], () => answer);
      r.studio.deleteFile(PATH);
      await settle();
      r.timers.advance(SEND_INTERVAL);
      await settle();
      expect(api.removals, name).toHaveLength(calls);
      expect(r.reports, name).toEqual([]);
      expect(imagesInRoom(r), name).toBe(0);
    }
  });

  it("does not tell the service of a rename", async () => {
    const { r, api } = await holding([PATH]);
    r.studio.renameFile(PATH, "assets/brand.png");
    await settle();
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(api.removals).toEqual([]);
    expect(imagesInRoom(r)).toBe(1);
  });

  it("does not tell the service of a removal made elsewhere", async () => {
    const { r, api } = await holding([PATH]);
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      for (const id of [...cloud.binaries.keys()]) {
        cloud.binaries.delete(id);
        cloud.paths.delete(id);
      }
    });
    await settle();
    expect(r.studio.host.has(PATH)).toBe(false);
    r.timers.advance(SEND_INTERVAL);
    await settle();
    expect(api.removals).toEqual([]);
    expect(r.reports).toEqual([]);
  });

  it("tells the service of every path that is removed, even when they share bytes", async () => {
    const { r, api } = await holding(["assets/a.png", "assets/b.png"]);
    r.studio.deleteFile("assets/a.png");
    r.studio.deleteFile("assets/b.png");
    await settle();
    r.timers.advance(SEND_INTERVAL);
    await settle();
    // Whether the bytes go is the service's to decide: it keeps them while another path uses them.
    expect(api.removals).toEqual(["assets/a.png", "assets/b.png"]);
    expect(imagesInRoom(r)).toBe(0);
  });

  it("lets an image added at the same path wait for the removal of the one that was there", async () => {
    const answer = deferred<Outcome<null>>();
    const { r, api } = await holding([PATH], () => answer.promise);
    r.studio.deleteFile(PATH);
    r.studio.addFiles([[PATH, new Uint8Array([9])]]);
    await settle();
    // The removal must not find the new image and take it away: the upload follows it.
    expect(api.order).toEqual([`DELETE ${PATH}`]);

    answer.resolve({ ok: true, value: null });
    await settle();
    expect(api.order).toEqual([`DELETE ${PATH}`, `PUT ${PATH}`]);
  });
});

describe("closing the project", () => {
  it("unbinds the Studio, closes the socket and keeps the document", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("z");
    const socket = r.network.last;
    project.close();
    await project.settled();
    expect(r.studio.isBound()).toBe(false);
    expect(socket.closed?.code).toBe(1000);
    r.timers.advance(100_000);
    expect(r.network.sockets).toHaveLength(1);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toHaveLength(1);
    // Closing again, and flushing a closed project, do nothing.
    project.close();
    project.flush();
    project.network();
  });

  it("sends what waits before it goes", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("last words");
    project.close();
    // The binding's last flush went to a socket that was open: the room has it.
    expect(roomText(r.room, A)).toBe(`${SOURCE_A}last words`);
  });

  it("stops reporting its status", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    project.close();
    const count = r.statuses.length;
    r.timers.advance(100_000);
    expect(r.statuses).toHaveLength(count);
  });
});

describe("a project deleted from another device", () => {
  it("stops reconnecting, says so in the status line and the indicator, and keeps the person's text", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    r.network.last.serverClose(4404, "project.not-found");
    await settle();
    expect(r.reports.at(-1)).toBe(en.cloud.project.gone);
    expect(project.status).toEqual({ state: "gone", kept: true });
    expect(r.statuses.at(-1)?.state).toBe("gone");
    // No attempt to connect again, however long the page stays open.
    r.timers.advance(10 * 60_000);
    expect(r.network.sockets).toHaveLength(1);
    // The person goes on editing what they have; it is neither sent nor kept in this browser.
    const kept = r.idb.rows(DATABASE_NAME, UPDATES).length;
    r.pane.select(r.studio.text(A).length);
    r.pane.type("z");
    r.timers.advance(SEND_INTERVAL + SAVED_AFTER_MS + CONFIRM_AFTER_MS + SNAPSHOT_AFTER_MS);
    await settle();
    expect(r.studio.text(A)).toBe(`${SOURCE_A}z`);
    expect(r.network.sockets).toHaveLength(1);
    expect(roomText(r.room, A)).toBe(SOURCE_A);
    expect(r.idb.rows(DATABASE_NAME, UPDATES)).toHaveLength(kept);
    expect(project.status?.state).toBe("gone");
  });

  it("forgets this browser's copy when the page lets the project go", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    const project = await opened(r);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toHaveLength(1);
    r.network.last.serverClose(4404, "project.not-found");
    await settle();
    project.close();
    await project.settled();
    await settle();
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toHaveLength(0);
    expect(r.idb.rows(DATABASE_NAME, UPDATES)).toHaveLength(0);
  });

  it("says it once, even if the room closes again", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.network.last.serverClose(4404, "project.not-found");
    await settle();
    const said = r.reports.filter((message) => message === en.cloud.project.gone);
    expect(said).toHaveLength(1);
    r.network.last.serverClose(4404, "project.not-found");
    await settle();
    expect(r.reports.filter((message) => message === en.cloud.project.gone)).toHaveLength(1);
  });
});

describe("a project deleted while this page was away", () => {
  /**
   * Closes the socket and every attempt that follows before the room can say hello to it, as the
   * browser reports an upgrade the Worker refused: a failed socket with no code to tell why.
   */
  async function failAttempts(r: Rig, attempts: number): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      r.network.last.serverClose(1006);
      r.timers.runNext();
    }
    await settle();
  }

  it("asks the service after the second failed socket and says the project is gone when it answers 404", async () => {
    const api = fakeApi({ get: () => failed(404, "project.not-found") });
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    const project = await opened(r);
    r.network.last.serverClose(1006);
    await settle();
    expect(api.asked, "one close is a drop, not yet a doubt").toBe(0);
    r.timers.runNext();
    r.network.last.serverClose(1006);
    await settle();
    expect(api.asked).toBe(1);
    expect(project.status).toEqual({ state: "gone", kept: true });
    expect(r.reports.at(-1)).toBe(en.cloud.project.gone);
    const sockets = r.network.sockets.length;
    r.timers.advance(10 * 60_000);
    expect(r.network.sockets).toHaveLength(sockets);
  });

  it("goes on reconnecting when the project is still there, or the service cannot be reached, and asks again at every doubling", async () => {
    const api = fakeApi({
      get: () => ({ ok: false, failure: { kind: "unreachable", status: 0 } }),
    });
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    const project = await opened(r);
    await failAttempts(r, 8);
    // Closes number 2, 4 and 8 asked.
    expect(api.asked).toBe(3);
    expect(project.status?.state).not.toBe("gone");
    expect(r.reports.filter((message) => message === en.cloud.project.gone)).toEqual([]);
    expect(r.network.sockets.length).toBeGreaterThan(8);
  });

  it("does not ask when the room answers: a hello starts the count again", async () => {
    const api = fakeApi({ get: () => failed(404, "project.not-found") });
    const r = await rig({ room: seeded({ [A]: SOURCE_A }), api });
    await opened(r);
    for (let round = 0; round < 3; round++) {
      r.network.last.serverClose(1006);
      await settle();
      r.timers.runNext();
      await settle();
    }
    expect(api.asked).toBe(0);
  });
});

describe("the room asking what it lacks", () => {
  it("is answered with the document minus the room's vector", async () => {
    const r = await rig({ room: seeded({ [A]: SOURCE_A }) });
    await opened(r);
    r.pane.select(r.studio.text(A).length);
    r.pane.type("new");
    r.timers.advance(SEND_INTERVAL);
    await settle();
    const before = r.network.last.sentOf(KIND.update).length;
    // A room that asks with an empty vector gets everything.
    r.network.last.deliver(KIND.sync, Y.encodeStateVector(new Y.Doc()));
    expect(r.network.last.sentOf(KIND.update)).toHaveLength(before + 1);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, r.network.last.sentOf(KIND.update).at(-1)!);
    expect(cloudDoc(copy).paths.size).toBe(1);
  });
});
