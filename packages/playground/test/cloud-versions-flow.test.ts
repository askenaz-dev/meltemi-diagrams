// The versions panel's model with the page around it: a real cloud controller, a project bound to the
// Studio over a fake socket and a fake room, and a service that keeps versions the way the API says
// (a snapshot of the room's files, an automatic version of the state before a restore, the restore
// applied through the room). It shows what the panel promises: a version holds what is on the screen,
// a restore reaches the page as a change from outside, and nothing of it is the person's edit.

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  CloudController,
  type CloudEnvironment,
  type CloudHooks,
} from "../src/cloud/controller.js";
import { KIND } from "../src/cloud/room.js";
import {
  VersionsModel,
  type VersionsHost,
  type VersionsState,
} from "../src/cloud/versions-model.js";
import type { StudioChange } from "../src/studio.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";
import { FakeIdb } from "./support/fake-idb.js";
import { fakeFetch, jsonResponse } from "./support/fake-fetch.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';
const PAGE = "https://diagrams.example/";

interface Stored {
  readonly number: number;
  readonly label: string | null;
  readonly auto: boolean;
  /** The room's files when the version was made. */
  readonly files: Record<string, string>;
}

function rig() {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = new FakeRoom();
  for (const [path, text] of Object.entries({ [A]: SOURCE_A, [B]: SOURCE_B })) {
    addTextFile(cloudDoc(room.doc), path, text, { origin: "seed" });
  }
  room.serve(network);
  const studio = newStudio();
  const pane = new FakePane(studio);
  const changes: StudioChange[] = [];
  studio.listen({ change: (change) => changes.push(change) });

  // The service's versions: what the API would keep.
  const stored: Stored[] = [];
  const filesOf = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const path of room.doc.getMap<string>("paths").values()) out[path] = room.text(path)!;
    return out;
  };
  const changedSince = (files: Record<string, string>, before: Stored | undefined): string[] =>
    Object.keys(files).filter((path) => before?.files[path] !== files[path]);
  const wire = (version: Stored) => ({
    number: version.number,
    label: version.label,
    auto: version.auto,
    created_at: "2026-10-14T10:00:00.000Z",
    created_by: "u-ana",
    changed: changedSince(version.files, stored[version.number - 2]),
  });
  const { fetch } = fakeFetch(async (call) => {
    const url = new URL(call.url);
    const method = call.init.method ?? "GET";
    if (method === "GET" && url.pathname === `/api/projects/${ID}`) {
      return jsonResponse({
        id: ID,
        name: "Purchase",
        description: "",
        updated_at: "2026-10-14T10:00:00.000Z",
        thumbnail: null,
        role: "owner",
      });
    }
    if (url.pathname === `/api/projects/${ID}/versions`) {
      if (method === "GET") return jsonResponse({ versions: stored.map(wire) });
      const label = (JSON.parse(call.init.body as string) as { label?: string }).label ?? null;
      const made: Stored = { number: stored.length + 1, label, auto: false, files: filesOf() };
      stored.push(made);
      return jsonResponse(wire(made), 201);
    }
    const restore = /^\/api\/projects\/[^/]+\/versions\/(\d+)\/restore$/.exec(url.pathname);
    if (restore && method === "POST") {
      const target = stored.find((v) => v.number === Number(restore[1]));
      if (!target) return jsonResponse({ code: "version.not-found", message: "No." }, 404);
      // The state before the restore is kept first, then the room takes the version's files.
      stored.push({ number: stored.length + 1, label: null, auto: true, files: filesOf() });
      room.change((doc) => {
        const files = doc.getMap<Y.Text>("files");
        for (const [id, path] of doc.getMap<string>("paths")) {
          const text = files.get(id)!;
          text.delete(0, text.length);
          text.insert(0, target.files[path] ?? "");
        }
      });
      return new Response(null, { status: 204 });
    }
    return jsonResponse({ code: "not-found", message: "No such route." }, 404);
  });
  const env: CloudEnvironment = {
    fetch,
    socket: network.factory,
    indexedDB: new FakeIdb(),
    storage: { getItem: () => null, setItem: () => undefined },
    online: () => true,
    timers,
    location: { href: () => PAGE, replace: () => undefined },
  };
  const reports: string[] = [];
  const hooks: CloudHooks = {
    studio,
    templates: () => [],
    selection: () => pane.selection,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: () => undefined,
    changed: () => undefined,
    keepLocal: () => undefined,
    showLocal: () => undefined,
    localFiles: () => new Map(),
  };
  const controller = new CloudController(env, hooks);
  const states: VersionsState[] = [];
  const host: VersionsHost = {
    api: controller.api,
    current: () => controller.current(),
    flush: () => controller.flush(),
    report: (message) => controller.report(message),
  };
  const model = new VersionsModel(
    host,
    ID,
    () => en.cloud,
    (state) => states.push(state),
  );
  return { controller, model, studio, pane, room, network, stored, changes, reports, timers };
}

describe("naming a version and restoring it", () => {
  it("holds what is on screen, brings the files back as a change from outside, and lists the state before", async () => {
    const r = rig();
    expect(await r.controller.open(ID)).toBe("opened");
    await r.model.load();
    expect(r.model.state.versions).toEqual([]);

    // The person types at the end of the file, and names the state `before review`.
    r.pane.select(r.studio.text(A).length);
    r.pane.type("// first");
    const named = r.studio.text(A);
    expect(named).toBe(`${SOURCE_A}// first`);
    // Typing is sent at most every 250 ms: the room has not heard it yet.
    expect(r.room.text(A)).toBe(SOURCE_A);
    expect(await r.model.name("before review")).toBe(true);
    expect(r.stored).toHaveLength(1);
    // The version holds the typing, because the page sent it before the service looked.
    expect(r.stored[0]!.files[A]).toBe(named);
    expect(r.model.state.versions.map((v) => [v.number, v.label, v.auto])).toEqual([
      [1, "before review", false],
    ]);
    expect(r.model.state.versions[0]?.changed).toEqual([A, B]);

    // The person edits again, and restores the named version.
    r.pane.type(" and more");
    const edited = r.studio.text(A);
    expect(edited).toBe(`${named} and more`);
    r.changes.length = 0;
    expect(await r.model.restore(r.model.state.versions[0]!)).toBe(true);
    await settle();

    // The files equal the named version, in the room and on the page.
    expect(r.room.text(A)).toBe(named);
    expect(r.studio.text(A)).toBe(named);
    expect(r.pane.text).toBe(named);
    expect(r.studio.text(B)).toBe(SOURCE_B);
    // The list shows an automatic version of the state before the restore, newest first.
    expect(r.model.state.versions.map((v) => [v.number, v.label, v.auto])).toEqual([
      [2, null, true],
      [1, "before review", false],
    ]);
    // That automatic version holds the typing the person had not paused on: it was sent first.
    expect(r.stored[1]!.files[A]).toBe(edited);
    expect(r.model.state.versions[0]?.changed).toEqual([A]);
    expect(r.reports.at(-1)).toBe(en.cloud.versions.restored(1));

    // It reached the page as a change the person did not make: flagged as remote, and never sent
    // back to the room as if it were an edit.
    const texts = r.changes.filter((c) => c.kind === "text" && c.path === A);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((c) => c.remote)).toBe(true);
    expect(r.changes.some((c) => !c.remote)).toBe(false);
    const sent = r.network.last.sentOf(KIND.update).length;
    r.timers.advance(1000);
    await settle();
    expect(r.network.last.sentOf(KIND.update)).toHaveLength(sent);
    expect(r.room.text(A)).toBe(named);

    // Undo does not bring the state before the restore back: the restore is not the person's step.
    r.studio.undo();
    await settle();
    expect(r.studio.text(A)).toBe(named);
    expect(r.room.text(A)).toBe(named);
  });

  it("is not undoable: a restore is not a step the person made", async () => {
    const r = rig();
    await r.controller.open(ID);
    await r.model.load();
    expect(await r.model.name("start")).toBe(true);
    r.room.change((doc) => {
      const id = [...doc.getMap<string>("paths")].find(([, path]) => path === A)![0];
      doc.getMap<Y.Text>("files").get(id)!.insert(0, "// remote\n");
    });
    await settle();
    expect(r.studio.text(A).startsWith("// remote\n")).toBe(true);
    expect(await r.model.restore(r.model.state.versions[0]!)).toBe(true);
    await settle();
    expect(r.studio.text(A)).toBe(SOURCE_A);
    // The person made no edit of their own, so there is nothing to undo, before or after the restore.
    expect(r.studio.canUndo()).toBe(false);
    expect(r.studio.undo()).toBe(false);
    expect(r.studio.text(A)).toBe(SOURCE_A);
  });

  it("says a version that is not there, and changes nothing", async () => {
    const r = rig();
    await r.controller.open(ID);
    await r.model.load();
    expect(await r.model.name("only")).toBe(true);
    const gone = { ...r.model.state.versions[0]!, number: 99 };
    expect(await r.model.restore(gone)).toBe(false);
    expect(r.model.state.problem).toBe(en.cloud.errors.versionNotFound);
    expect(r.reports.at(-1)).toBe(en.cloud.errors.versionNotFound);
    expect(r.studio.text(A)).toBe(SOURCE_A);
  });
});
