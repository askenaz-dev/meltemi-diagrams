// An open cloud project for a viewer (`project-sharing`, "Viewing by link"): it connects to the room as
// one, follows it live, sends nothing, keeps nothing in this browser, and notices when the room says
// the person's role is not the one it was opened with.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import { DATABASE_NAME, DOCS, UPDATES, openDatabase } from "../src/cloud/persistence.js";
import { CloudProject, SAVED_AFTER_MS, type ProjectDeps } from "../src/cloud/project.js";
import { KIND } from "../src/cloud/room.js";
import type { ConnectionStatus } from "../src/cloud/status.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio, counter } from "./support/cloud.js";
import { FakeIdb } from "./support/fake-idb.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const ADDRESS = `wss://diagrams.example/rooms/${ID}`;
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';

function seeded(files: Record<string, string>): FakeRoom {
  const room = new FakeRoom();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(room.doc), path, text, { origin: "seed" });
  }
  return room;
}

async function rig(
  options: {
    room?: FakeRoom;
    idb?: FakeIdb;
    unavailable?: boolean;
    readOnly?: boolean;
  } = {},
) {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = options.room ?? seeded({ [A]: SOURCE_A, [B]: SOURCE_B });
  room.serve(network);
  const idb = options.idb ?? new FakeIdb();
  const database = await openDatabase(options.unavailable ? undefined : idb);
  const studio = newStudio();
  const pane = new FakePane(studio);
  const reports: string[] = [];
  const statuses: ConnectionStatus[] = [];
  const roles: string[] = [];
  let denied = 0;
  const deps: ProjectDeps = {
    studio,
    api: new Proxy({} as ProjectDeps["api"], {
      get: () => () => Promise.reject(new Error("The project made a call nobody expected.")),
    }),
    database,
    socket: network.factory,
    address: ADDRESS,
    timers,
    online: () => true,
    selection: () => pane.selection,
    lastOpen: () => undefined,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: (status) => statuses.push(status),
    random: counter(),
    ...(options.readOnly ? { readOnly: true } : {}),
    roleChanged: (role) => roles.push(role),
    accessDenied: () => void denied++,
  };
  return {
    timers,
    network,
    room,
    idb,
    studio,
    pane,
    reports,
    statuses,
    roles,
    deps,
    get denied() {
      return denied;
    },
  };
}

type Rig = Awaited<ReturnType<typeof rig>>;

async function opened(r: Rig): Promise<CloudProject> {
  const pending = CloudProject.prepare(ID, r.deps);
  await settle();
  const result = await pending;
  if (!result.ok) throw new Error("The project did not open.");
  result.project.attach();
  await settle();
  return result.project;
}

/** What the room received of the page, by kind. */
const kinds = (room: FakeRoom) => room.received.map((message) => message.kind);

describe("a project opened for a viewer", () => {
  it("connects, gets the room's files and says it only asked what it lacks", async () => {
    const r = await rig({ readOnly: true });
    await opened(r);
    expect(r.studio.host.paths()).toEqual([A, B]);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    // The state vector goes out (the room answers with what the page lacks), and never an update.
    expect(kinds(r.room)).toEqual([KIND.sync]);
    expect(r.network.last.sentOf(KIND.update)).toEqual([]);
    expect(r.statuses.at(-1)).toEqual({ state: "connected", kept: true });
  });

  it("follows the room live", async () => {
    const r = await rig({ readOnly: true });
    await opened(r);
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === A)![0];
      cloud.files.get(id)!.insert(0, "// live\n");
    });
    await settle();
    expect(r.studio.text(A)).toBe(`// live\n${SOURCE_A}`);
    r.room.change((doc) => addTextFile(cloudDoc(doc), "notes.md", "notes\n", { origin: "api" }));
    await settle();
    expect(r.studio.text("notes.md")).toBe("notes\n");
    expect(kinds(r.room)).toEqual([KIND.sync]);
  });

  it("sends nothing the page does, not even a change the Studio takes, and not at a reconnection", async () => {
    const r = await rig({ readOnly: true });
    const project = await opened(r);
    r.pane.select(0);
    r.pane.type("// typed\n");
    r.studio.addFiles([["more.md", "more\n"]]);
    r.timers.advance(SAVED_AFTER_MS * 4);
    project.flush();
    await settle();
    expect(kinds(r.room)).toEqual([KIND.sync]);
    // The connection drops and comes back: the state vector again, no update.
    r.room.drop();
    await settle();
    r.timers.advance(2000);
    await settle(30);
    expect(r.network.sockets.length).toBeGreaterThan(1);
    expect(kinds(r.room).every((kind) => kind === KIND.sync)).toBe(true);
    project.close();
    expect(kinds(r.room).every((kind) => kind === KIND.sync)).toBe(true);
  });

  it("keeps nothing in this browser, and does not use a copy it finds there", async () => {
    // A copy kept when the person could edit, with a change the room never got.
    const before = await rig();
    const first = await opened(before);
    before.pane.select(0);
    before.pane.type("// mine, never sent\n");
    first.flush();
    await settle(30);
    expect(
      before.idb.rows(DATABASE_NAME, DOCS).length + before.idb.rows(DATABASE_NAME, UPDATES).length,
    ).toBeGreaterThan(0);
    first.close();
    const rowsBefore = JSON.stringify([
      before.idb.rows(DATABASE_NAME, DOCS),
      before.idb.rows(DATABASE_NAME, UPDATES),
    ]);
    // Now a viewer, in the same browser: the room's state, nothing written, nothing offered to the room.
    const r = await rig({ readOnly: true, idb: before.idb, room: seeded({ [A]: SOURCE_A }) });
    const viewer = await opened(r);
    r.timers.advance(10_000);
    viewer.flush();
    viewer.close();
    await settle(30);
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(
      JSON.stringify([r.idb.rows(DATABASE_NAME, DOCS), r.idb.rows(DATABASE_NAME, UPDATES)]),
    ).toBe(rowsBefore);
    expect(kinds(r.room)).toEqual([KIND.sync]);
  });

  it("does not say the browser keeps no copy, where it could not keep one", async () => {
    const r = await rig({ readOnly: true, unavailable: true });
    await opened(r);
    expect(r.reports).not.toContain(en.cloud.status.notKept);
    expect(r.statuses.at(-1)).toEqual({ state: "connected", kept: true });
  });

  it("goes on after the room closes with a refusal, reconnecting", async () => {
    const r = await rig({ readOnly: true });
    await opened(r);
    r.network.last.serverClose(4403);
    await settle();
    expect(r.denied).toBe(1);
    r.timers.advance(5000);
    await settle(30);
    expect(r.network.sockets.length).toBeGreaterThan(1);
  });
});

describe("the role the room says", () => {
  it("is told to whoever opened the project when it is not the one it was opened with", async () => {
    const promoted = await rig({ readOnly: true });
    promoted.room.role = "editor";
    await opened(promoted);
    expect(promoted.roles).toEqual(["editor"]);

    const demoted = await rig();
    demoted.room.role = "viewer";
    await opened(demoted);
    expect(demoted.roles).toEqual(["viewer"]);
  });

  it("is told nothing when it is the same role: an owner or an editor opened as one, a viewer as one", async () => {
    for (const [role, readOnly] of [
      ["owner", false],
      ["editor", false],
      ["viewer", true],
    ] as const) {
      const r = await rig({ readOnly });
      r.room.role = role;
      await opened(r);
      expect(r.roles).toEqual([]);
    }
  });

  it("does not offer a demoted editor's unsent changes to the room that just said it is a viewer", async () => {
    const edited = await rig();
    const project = await opened(edited);
    edited.room.drop();
    await settle();
    edited.pane.select(0);
    edited.pane.type("// made while away\n");
    edited.timers.advance(1000);
    // The editor was demoted meanwhile: the room's next hello says viewer.
    edited.room.role = "viewer";
    const updatesBefore = edited.room.received.filter((m) => m.kind === KIND.update).length;
    edited.timers.advance(3000);
    await settle(30);
    expect(edited.roles).toContain("viewer");
    expect(edited.room.received.filter((m) => m.kind === KIND.update).length).toBe(updatesBefore);
    project.close();
  });

  it("is looked up again when the room refuses the person's change with access.denied", async () => {
    const r = await rig();
    r.room.refuses = () => "access.denied";
    r.room.closeCode = 4403;
    await opened(r);
    r.pane.select(0);
    r.pane.type("// not allowed\n");
    r.timers.advance(1000);
    await settle(30);
    expect(r.denied).toBeGreaterThanOrEqual(1);
    expect(r.reports.some((message) => message.includes(en.cloud.errors.accessDenied))).toBe(true);
  });
});

describe("a document nobody writes", () => {
  it("is the room's state, whole, after the room answers", async () => {
    const r = await rig({ readOnly: true });
    await opened(r);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(r.room.doc));
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect([...cloudDoc(doc).paths.values()].sort()).toEqual([A, B]);
  });
});
