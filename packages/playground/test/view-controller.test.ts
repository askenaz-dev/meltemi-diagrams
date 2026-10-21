// The cloud controller with a viewer on the page (`project-sharing`, "Viewing by link"): the mode
// follows the role the service gives before the Studio binds, a viewer's page connects as one and
// keeps nothing, and a role that changes while the project is open opens it again in the other
// mode. The page's pieces are fakes; the controller, the project, the Studio, the room's protocol
// (over a fake room) and view mode are the real ones.
import { describe, expect, it } from "vitest";
import { planOpen } from "../src/cloud/address.js";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  CloudController,
  type CloudEnvironment,
  type CloudHooks,
} from "../src/cloud/controller.js";
import { DATABASE_NAME, DOCS, LAST_OPEN_KEY, UPDATES } from "../src/cloud/persistence.js";
import { KIND } from "../src/cloud/room.js";
import { ViewPage } from "../src/cloud/view-page.js";
import type { Role } from "../src/cloud/view-model.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";
import { fakeFetch, jsonResponse, type Call } from "./support/fake-fetch.js";
import { FakeIdb } from "./support/fake-idb.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const OTHER = "zyxwvutsrq9876543210";
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';
const PAGE = `https://diagrams.example/?project=${ID}`;

const row = (id: string, role: Role, name = "Purchase") => ({
  id,
  name,
  description: "",
  updated_at: "2026-10-14T10:00:00.000Z",
  thumbnail: null,
  role,
});

function seeded(files: Record<string, string>): FakeRoom {
  const room = new FakeRoom();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(room.doc), path, text, { origin: "seed" });
  }
  return room;
}

function rig(options: { role?: Role; room?: FakeRoom } = {}) {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = options.room ?? seeded({ [A]: SOURCE_A, [B]: SOURCE_B });
  room.serve(network);
  const idb = new FakeIdb();
  const studio = newStudio();
  const pane = new FakePane(studio);
  const roles = new Map<string, Role>([[ID, options.role ?? "viewer"]]);
  const { fetch, calls } = fakeFetch((call) => {
    const url = new URL(call.url);
    const found = /^\/api\/projects\/([0-9a-z]{20})$/.exec(url.pathname);
    if (found && (call.init.method ?? "GET") === "GET") {
      const role = roles.get(found[1]!);
      return role
        ? jsonResponse(row(found[1]!, role))
        : jsonResponse({ code: "project.not-found" }, 404);
    }
    return jsonResponse({ code: "not-found", message: "No such route." }, 404);
  });
  const storage = new Map<string, string>();
  const events: string[] = [];
  const reports: string[] = [];
  let href = PAGE;
  const location = {
    href: () => href,
    replace: (url: string) => {
      href = url;
    },
  };
  const env: CloudEnvironment = {
    fetch,
    socket: network.factory,
    indexedDB: idb,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    },
    online: () => true,
    timers,
    location,
  };
  // What the page does when the controller tells it the role: the mode follows, before the Studio binds.
  const held: { page?: ViewPage } = {};
  const hooks: CloudHooks = {
    studio,
    templates: () => [],
    selection: () => pane.selection,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: () => undefined,
    changed: (project) => events.push(project ? `open ${project.id}` : "closed"),
    keepLocal: () => events.push("keep"),
    showLocal: () => {
      events.push(`show local (read-only ${studio.readOnly})`);
    },
    localFiles: () => new Map(),
    access: (access) => {
      events.push(
        access
          ? `access ${access.role} ${access.reason} (bound ${studio.isBound()}, files ${studio.host.paths().length})`
          : "access none",
      );
      held.page?.access(access);
    },
  };
  const controller = new CloudController(env, hooks);
  const page = new ViewPage({
    studio,
    cloud: controller,
    environment: { fetch, timers, location },
    words: () => ({ viewing: en.viewing, cloud: en.cloud }),
    report: (message) => reports.push(message),
    files: () => new Map(),
    keptWork: () => undefined,
    templates: () => [],
    isTemplate: () => false,
    confirm: () => Promise.resolve(true),
    showLocal: () => undefined,
    replaceProject: () => undefined,
  });
  held.page = page;
  return {
    controller,
    page,
    timers,
    network,
    room,
    idb,
    studio,
    pane,
    roles,
    calls,
    storage,
    events,
    reports,
  };
}

type Rig = ReturnType<typeof rig>;

/** What the room received of the page, by kind. */
const kinds = (r: Rig) => r.room.received.map((message) => message.kind);
const updates = (r: Rig) => r.room.received.filter((m) => m.kind === KIND.update).length;
const requests = (calls: Call[]) =>
  calls.map((call) => `${call.init.method ?? "GET"} ${new URL(call.url).pathname}`);

describe("opening a project as a viewer", () => {
  it("makes the page read-only before the Studio binds, and says what the person is", async () => {
    const r = rig({ role: "viewer" });
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBeUndefined();
    expect(r.events).toEqual([
      "keep",
      // The mode is set while nothing is bound and no file is in the Studio.
      "access viewer open (bound false, files 0)",
      `open ${ID}`,
    ]);
    expect(r.controller.role).toBe("viewer");
    expect(r.studio.readOnly).toBe(true);
    expect(r.studio.isBound()).toBe(true);
    expect(r.studio.host.paths()).toEqual([A, B]);
    expect(r.page.mode.state).toMatchObject({ id: ID, live: true, signedIn: true });
  });

  it("connects as a viewer: the room is asked what the page lacks, and is sent nothing", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    expect(kinds(r)).toEqual([KIND.sync]);
    // Typing is refused by the Studio, and nothing would leave if it were not.
    r.pane.select(0);
    r.pane.type("// typed\n");
    r.studio.addFiles([["more.md", "more\n"]]);
    r.timers.advance(10_000);
    r.controller.flush();
    await settle();
    expect(r.studio.text(A)).toBe(SOURCE_A);
    expect(updates(r)).toBe(0);
    // The room's change arrives live.
    r.room.change((doc) => {
      const cloud = cloudDoc(doc);
      const id = [...cloud.paths].find(([, path]) => path === A)![0];
      cloud.files.get(id)!.insert(0, "// live\n");
    });
    await settle();
    expect(r.studio.text(A)).toBe(`// live\n${SOURCE_A}`);
  });

  it("keeps nothing in this browser: no database rows, no remembered file", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    r.studio.select(B);
    r.controller.rememberOpen(B);
    r.timers.advance(20_000);
    r.controller.flush();
    r.controller.leaveToLocal();
    await settle(30);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toEqual([]);
    expect(r.idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
    expect(r.storage.has(LAST_OPEN_KEY)).toBe(false);
    expect(r.storage.size).toBe(0);
  });

  it("calls the service only to read: the project and the room, never a write", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    expect(requests(r.calls)).toEqual([`GET /api/projects/${ID}`]);
  });

  it("opens an editor's or an owner's project as it always did: edits go to the room, a copy is kept", async () => {
    for (const role of ["editor", "owner"] as const) {
      const r = rig({ role });
      r.room.role = role;
      await r.controller.openAddress(planOpen(`?project=${ID}`));
      await settle();
      expect(r.events).toEqual([
        "keep",
        `access ${role} open (bound false, files 0)`,
        `open ${ID}`,
      ]);
      expect(r.studio.readOnly).toBe(false);
      expect(r.page.mode.active).toBe(false);
      r.pane.select(0);
      r.pane.type("// typed\n");
      r.timers.advance(1000);
      await settle();
      expect(updates(r)).toBeGreaterThan(0);
      r.controller.flush();
      await settle(30);
      expect(r.idb.rows(DATABASE_NAME, DOCS).length).toBe(1);
    }
  });

  it("says the project was not found for what the service does not show, and opens nothing", async () => {
    const r = rig();
    r.roles.delete(ID);
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBe(en.cloud.open.notFound);
    expect(r.events).toEqual([]);
    expect(r.studio.readOnly).toBe(false);
  });
});

describe("leaving a viewed project", () => {
  it("ends view mode before the anonymous project shows, as that one is loaded as the person's own", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    r.controller.leaveToLocal();
    expect(r.events.slice(-3)).toEqual(["closed", "access none", "show local (read-only false)"]);
    expect(r.studio.readOnly).toBe(false);
    expect(r.page.mode.active).toBe(false);
    expect(r.controller.role).toBeUndefined();
  });

  it("goes from a viewed project to one the person edits, and back, in one swap each", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    r.roles.set(OTHER, "owner");
    await r.controller.open(ID);
    expect(r.studio.readOnly).toBe(true);
    const secondRoom = seeded({ "diagrams/c.meltemi": 'diagram c: flow {\n  title "c"\n}\n' });
    secondRoom.serve(r.network);
    expect(await r.controller.open(OTHER)).toBe("opened");
    expect(r.studio.readOnly).toBe(false);
    expect(r.page.mode.active).toBe(false);
    expect(r.studio.host.paths()).toEqual(["diagrams/c.meltemi"]);
    const firstRoom = seeded({ [A]: SOURCE_A });
    firstRoom.role = "viewer";
    firstRoom.serve(r.network);
    expect(await r.controller.open(ID)).toBe("opened");
    expect(r.studio.readOnly).toBe(true);
    expect(r.page.mode.state?.id).toBe(ID);
  });
});

describe("a role that changes while the project is open", () => {
  it("promotes a viewer: the room's next hello says editor, and the page opens the project as an editor's", async () => {
    const r = rig({ role: "viewer" });
    r.room.role = "viewer";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    expect(r.studio.readOnly).toBe(true);
    // The connection drops and comes back: the person was made an editor meanwhile.
    r.room.role = "editor";
    r.room.drop();
    await settle();
    r.timers.advance(2000);
    await settle(50);
    expect(r.controller.role).toBe("editor");
    expect(r.studio.readOnly).toBe(false);
    expect(r.page.mode.active).toBe(false);
    expect(r.reports).toContain(en.viewing.access.nowEditor);
    expect(r.events.some((event) => event.startsWith("access editor role"))).toBe(true);
    // And editing works: the edit reaches the room.
    r.pane.select(0);
    r.pane.type("// now I can\n");
    r.timers.advance(1000);
    await settle();
    expect(updates(r)).toBeGreaterThan(0);
    expect(r.studio.text(A)).toBe(`// now I can\n${SOURCE_A}`);
  });

  it("demotes an editor: the room's hello says viewer, and the page goes read-only without a reload", async () => {
    const r = rig({ role: "editor" });
    r.room.role = "editor";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    expect(r.studio.readOnly).toBe(false);
    r.room.role = "viewer";
    r.room.drop();
    await settle();
    r.timers.advance(2000);
    await settle(50);
    expect(r.controller.role).toBe("viewer");
    expect(r.studio.readOnly).toBe(true);
    expect(r.page.mode.state).toMatchObject({ id: ID, live: true });
    expect(r.reports).toContain(en.viewing.access.nowViewer);
    // The mode is the viewer's: nothing more is sent.
    const before = updates(r);
    r.pane.type("// refused\n");
    r.timers.advance(2000);
    await settle();
    expect(updates(r)).toBe(before);
  });

  it("keeps nothing of what a demoted editor typed after losing write access, whoever opens the project next", async () => {
    const r = rig({ role: "editor" });
    r.room.role = "editor";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    // The service cuts the socket; the page is still in editor mode while it reconnects, and the
    // person types in that second.
    r.room.drop();
    await settle();
    r.pane.select(0);
    r.pane.type("// typed after losing access\n");
    r.room.role = "viewer";
    r.timers.advance(2000);
    await settle(50);
    expect(r.controller.role).toBe("viewer");
    expect(r.studio.readOnly).toBe(true);
    await settle(30);
    // Nothing of the project is kept in this browser: not the document, not the updates.
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toEqual([]);
    expect(r.idb.rows(DATABASE_NAME, UPDATES)).toEqual([]);
    // Promoted again (or another account with the right to write opens it here): the room's text
    // is what opens, and the old typing is not offered to it.
    const before = updates(r);
    r.room.role = "editor";
    r.room.drop();
    await settle();
    r.timers.advance(2000);
    await settle(50);
    expect(r.controller.role).toBe("editor");
    expect(r.studio.text(A)).toBe(SOURCE_A);
    r.timers.advance(5000);
    await settle(30);
    expect(updates(r)).toBe(before);
    expect(r.room.text(A)).toBe(SOURCE_A);
  });

  it("looks the role up when the room refuses with access.denied, and switches mode when it changed", async () => {
    const r = rig({ role: "editor" });
    r.room.role = "editor";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    // The person is made a viewer, and the room refuses their next change.
    r.roles.set(ID, "viewer");
    r.room.refuses = () => "access.denied";
    r.room.closeCode = 4403;
    r.pane.select(0);
    r.pane.type("// too late\n");
    r.timers.advance(1000);
    await settle(50);
    expect(
      requests(r.calls).filter((call) => call === `GET /api/projects/${ID}`).length,
    ).toBeGreaterThan(1);
    expect(r.controller.role).toBe("viewer");
    expect(r.studio.readOnly).toBe(true);
    expect(r.reports).toContain(en.viewing.access.nowViewer);
  });

  it("does not open the project again when the role is the same, and not twice for one change", async () => {
    const r = rig({ role: "editor" });
    r.room.role = "editor";
    await r.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    r.room.drop();
    await settle();
    r.timers.advance(2000);
    await settle(50);
    expect(r.events.filter((event) => event.startsWith("access")).length).toBe(1);

    const changed = rig({ role: "editor" });
    changed.room.role = "editor";
    await changed.controller.openAddress(planOpen(`?project=${ID}`));
    await settle();
    changed.room.role = "viewer";
    changed.room.drop();
    await settle();
    changed.timers.advance(2000);
    await settle(50);
    changed.room.drop();
    await settle();
    changed.timers.advance(4000);
    await settle(50);
    expect(changed.events.filter((event) => event.startsWith("access viewer role")).length).toBe(1);
  });
});
