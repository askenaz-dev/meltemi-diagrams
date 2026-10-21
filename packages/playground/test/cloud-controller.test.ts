import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { planOpen } from "../src/cloud/address.js";
import { addTextFile, cloudDoc } from "../src/cloud/doc.js";
import {
  CloudController,
  manifestName,
  splitForCloud,
  type CloudEnvironment,
  type CloudHooks,
} from "../src/cloud/controller.js";
import { LAST_OPEN_KEY, DATABASE_NAME, DOCS } from "../src/cloud/persistence.js";
import { en } from "../src/messages/en.js";
import { ManualTimers, settle } from "./support/clock.js";
import { FakePane, newStudio } from "./support/cloud.js";
import { FakeIdb } from "./support/fake-idb.js";
import { fakeFetch, jsonResponse, type Call } from "./support/fake-fetch.js";
import { FakeNetwork, FakeRoom } from "./support/fake-room.js";

const ID = "abcdefghij0123456789";
const OTHER = "zyxwvutsrq9876543210";
const A = "diagrams/a.meltemi";
const B = "diagrams/b.meltemi";
const SOURCE_A = 'diagram a: flow {\n  title "a"\n}\n';
const SOURCE_B = 'diagram b: flow {\n  title "b"\n}\n';
const PAGE = "https://diagrams.example/?x=1#frag";

const row = (id: string, name = "Purchase") => ({
  id,
  name,
  description: "",
  updated_at: "2026-10-14T10:00:00.000Z",
  thumbnail: null,
  role: "owner",
});

function seeded(files: Record<string, string>): FakeRoom {
  const room = new FakeRoom();
  for (const [path, text] of Object.entries(files)) {
    addTextFile(cloudDoc(room.doc), path, text, { origin: "seed" });
  }
  return room;
}

type Handler = (call: Call) => Response | Promise<Response>;

interface Rig {
  readonly controller: CloudController;
  readonly timers: ManualTimers;
  readonly network: FakeNetwork;
  readonly room: FakeRoom;
  readonly idb: FakeIdb;
  readonly studio: ReturnType<typeof newStudio>;
  readonly pane: FakePane;
  readonly calls: Call[];
  readonly handlers: Map<string, Handler>;
  readonly addresses: string[];
  readonly reports: string[];
  readonly events: string[];
  readonly statuses: (string | undefined)[];
  readonly storage: Map<string, string>;
  readonly local: { files: Map<string, string | Uint8Array> };
  readonly env: { online: boolean; unreachable: boolean };
}

function rig(
  options: {
    room?: FakeRoom;
    idb?: FakeIdb;
    storage?: Map<string, string>;
    local?: Record<string, string | Uint8Array>;
    unavailable?: boolean;
  } = {},
): Rig {
  const timers = new ManualTimers();
  const network = new FakeNetwork();
  const room = options.room ?? seeded({ [A]: SOURCE_A, [B]: SOURCE_B });
  room.serve(network);
  const idb = options.idb ?? new FakeIdb();
  const studio = newStudio();
  const pane = new FakePane(studio);
  const handlers = new Map<string, Handler>();
  const state = { online: true, unreachable: false };
  const { fetch, calls } = fakeFetch((call) => {
    const url = new URL(call.url);
    const handler = handlers.get(`${call.init.method ?? "GET"} ${url.pathname}`);
    return handler
      ? handler(call)
      : jsonResponse({ code: "not-found", message: "No such route." }, 404);
  });
  const storage = options.storage ?? new Map<string, string>();
  const addresses: string[] = [];
  const reports: string[] = [];
  const events: string[] = [];
  const statuses: (string | undefined)[] = [];
  const local = { files: new Map(Object.entries(options.local ?? {})) };
  let href = PAGE;
  const env: CloudEnvironment = {
    fetch: (input, init) =>
      state.unreachable ? Promise.reject(new TypeError("offline")) : fetch(input, init),
    socket: network.factory,
    indexedDB: options.unavailable ? undefined : idb,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    },
    online: () => state.online,
    timers,
    location: {
      href: () => href,
      replace: (url) => {
        href = url;
        addresses.push(url);
      },
    },
  };
  const hooks: CloudHooks = {
    studio,
    templates: () => [],
    selection: () => pane.selection,
    words: () => en.cloud,
    report: (message) => reports.push(message),
    status: (status) => statuses.push(status?.state),
    changed: (project) => events.push(project ? `open ${project.id} ${project.name}` : "closed"),
    keepLocal: () => events.push("keep"),
    showLocal: () => events.push("show local"),
    localFiles: () => local.files,
  };
  const controller = new CloudController(env, hooks);
  return {
    controller,
    timers,
    network,
    room,
    idb,
    studio,
    pane,
    calls,
    handlers,
    addresses,
    reports,
    events,
    statuses,
    storage,
    local,
    env: state,
  };
}

/** Answers `GET /api/projects/<id>` with a project. */
function knows(r: Rig, id = ID, name = "Purchase"): void {
  r.handlers.set(`GET /api/projects/${id}`, () => jsonResponse(row(id, name)));
}

const requests = (r: Rig) =>
  r.calls.map((call) => `${call.init.method ?? "GET"} ${new URL(call.url).pathname}`);

describe("opening the project the address names", () => {
  it("opens it, binds the Studio, keeps the address, and says what it opened", async () => {
    const r = rig();
    knows(r);
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBeUndefined();
    expect(r.controller.openProject).toEqual({ id: ID, name: "Purchase" });
    expect(r.studio.isBound()).toBe(true);
    expect(r.studio.host.paths()).toEqual([A, B]);
    // The address is left exactly as it is.
    expect(r.addresses).toEqual([]);
    expect(r.network.urls).toEqual([`wss://diagrams.example/rooms/${ID}`]);
    expect(r.reports).toEqual([en.cloud.open.opened("Purchase")]);
    expect(r.events).toEqual(["keep", `open ${ID} Purchase`]);
    expect(r.statuses.at(-1)).toBe("connected");
  });

  it("says the project was not found, opens nothing, and leaves the Studio alone", async () => {
    const r = rig();
    r.handlers.set(`GET /api/projects/${ID}`, () =>
      jsonResponse({ code: "project.not-found", message: "No." }, 404),
    );
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBe(en.cloud.open.notFound);
    expect(r.reports).toEqual([en.cloud.open.notFound]);
    expect(r.controller.openProject).toBeUndefined();
    expect(r.studio.isBound()).toBe(false);
    expect(r.network.sockets).toHaveLength(0);
    expect(r.events).toEqual([]);
    expect(r.addresses).toEqual([]);
  });

  it("says so, without asking the service, when the address names what cannot be a project", async () => {
    const r = rig();
    const notice = await r.controller.openAddress(planOpen("?project=nope"));
    expect(notice).toBe(en.cloud.open.notFound);
    expect(r.calls).toEqual([]);
  });

  it("opens nothing for an address that names no project", async () => {
    const r = rig();
    expect(await r.controller.openAddress({ kind: "none" })).toBeUndefined();
    expect(await r.controller.openAddress(planOpen(""))).toBeUndefined();
    expect(r.calls).toEqual([]);
    expect(r.events).toEqual([]);
  });

  it("says why when the service refuses for another reason, and opens nothing", async () => {
    const r = rig();
    r.handlers.set(`GET /api/projects/${ID}`, () =>
      jsonResponse({ code: "auth.required", message: "No." }, 401),
    );
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBe(en.cloud.errors.signedOut);
    expect(r.network.sockets).toHaveLength(0);
  });

  it("says it could not be loaded when the room does not answer", async () => {
    const r = rig();
    knows(r);
    r.room.greeting = false;
    const pending = r.controller.openAddress(planOpen(`?project=${ID}`));
    // The service answers, the database opens, and the project waits for the room.
    await settle(100);
    r.timers.advance(10_000);
    const notice = await pending;
    expect(notice).toBe(en.cloud.open.unavailable);
    expect(r.controller.openProject).toBeUndefined();
    expect(r.studio.isBound()).toBe(false);
  });
});

describe("opening with no connection to the service", () => {
  it("opens a project the browser has a copy of, and says it is offline", async () => {
    const first = rig();
    knows(first);
    await first.controller.openAddress(planOpen(`?project=${ID}`));
    first.controller.flush();
    await settle(30);
    first.controller.leaveToLocal();
    await settle(30);
    const r = rig({ room: first.room, idb: first.idb });
    r.env.unreachable = true;
    r.env.online = false;
    r.network.throwing = true;
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBeUndefined();
    expect(r.studio.host.paths()).toEqual([A, B]);
    expect(r.reports[0]).toBe(en.cloud.open.openedOffline);
    expect(r.statuses.at(-1)).toBe("offline");
  });

  it("opens nothing when there is no copy, and says the project could not be opened", async () => {
    const r = rig();
    r.env.unreachable = true;
    const notice = await r.controller.openAddress(planOpen(`?project=${ID}`));
    expect(notice).toBe(en.cloud.open.failed);
    expect(r.network.sockets).toHaveLength(0);
    expect(r.studio.isBound()).toBe(false);
  });
});

describe("opening from the drawer", () => {
  it("opens the project and makes the address name it, keeping the rest and dropping an invitation", async () => {
    const r = rig();
    knows(r);
    expect(await r.controller.open(ID)).toBe("opened");
    expect(r.addresses).toEqual([`https://diagrams.example/?x=1&project=${ID}#frag`]);
    expect(r.controller.current()).toBe(ID);
  });

  it("is already open when the same project is asked for again", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    const calls = r.calls.length;
    expect(await r.controller.open(ID)).toBe("already");
    expect(r.calls).toHaveLength(calls);
  });

  it("swaps projects in one go: the first is closed, the second bound, nothing is kept again", async () => {
    const r = rig();
    knows(r);
    knows(r, OTHER, "Second");
    await r.controller.open(ID);
    const first = r.network.last;
    const secondRoom = seeded({ "diagrams/c.meltemi": 'diagram c: flow {\n  title "c"\n}\n' });
    secondRoom.serve(r.network);
    expect(await r.controller.open(OTHER)).toBe("opened");
    expect(first.closed?.code).toBe(1000);
    expect(r.studio.host.paths()).toEqual(["diagrams/c.meltemi"]);
    expect(r.studio.isBound()).toBe(true);
    expect(r.controller.openProject).toEqual({ id: OTHER, name: "Second" });
    expect(r.events).toEqual(["keep", `open ${ID} Purchase`, `open ${OTHER} Second`]);
    expect(r.addresses.at(-1)).toBe(`https://diagrams.example/?x=1&project=${OTHER}#frag`);
  });

  it("says it did not find a project and opens nothing", async () => {
    const r = rig();
    r.handlers.set(`GET /api/projects/${ID}`, () =>
      jsonResponse({ code: "project.not-found", message: "No." }, 404),
    );
    expect(await r.controller.open(ID)).toBe("not-found");
    expect(r.addresses).toEqual([]);
  });

  it("opens one project at a time", async () => {
    const r = rig();
    knows(r);
    knows(r, OTHER, "Second");
    const first = r.controller.open(ID);
    expect(await r.controller.open(OTHER)).toBe("failed");
    expect(await first).toBe("opened");
  });

  it("remembers the file the person has open, and opens it the next time", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    r.studio.select(B);
    r.controller.rememberOpen(B);
    expect(JSON.parse(r.storage.get(LAST_OPEN_KEY)!)).toEqual({ [ID]: B });
    r.controller.leaveToLocal();
    expect(await r.controller.open(ID)).toBe("opened");
    expect(r.studio.open).toBe(B);
  });

  it("remembers nothing when no project is open", () => {
    const r = rig();
    r.controller.rememberOpen(A);
    expect(r.storage.size).toBe(0);
  });
});

describe("going back to the local project", () => {
  it("closes the cloud project, clears the status, drops the project from the address and shows the local one", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    const socket = r.network.last;
    r.controller.leaveToLocal();
    expect(socket.closed?.code).toBe(1000);
    expect(r.studio.isBound()).toBe(false);
    expect(r.controller.openProject).toBeUndefined();
    expect(r.statuses.at(-1)).toBeUndefined();
    expect(r.events.slice(-2)).toEqual(["closed", "show local"]);
    expect(r.addresses.at(-1)).toBe("https://diagrams.example/?x=1#frag");
  });

  it("does nothing when no cloud project is open", () => {
    const r = rig();
    r.controller.leaveToLocal();
    expect(r.events).toEqual([]);
    expect(r.addresses).toEqual([]);
  });

  it("leaves a project that is deleted, and forgets its copy in this browser", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    await settle(30);
    r.controller.flush();
    await settle(30);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toHaveLength(1);
    r.controller.deleted(ID);
    await settle(30);
    expect(r.controller.openProject).toBeUndefined();
    expect(r.events.slice(-2)).toEqual(["closed", "show local"]);
    expect(r.idb.rows(DATABASE_NAME, DOCS)).toEqual([]);
  });

  it("only forgets the copy of a project that was not open", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    r.controller.deleted(OTHER);
    await settle(30);
    expect(r.controller.openProject?.id).toBe(ID);
    expect(r.events).not.toContain("closed");
  });
});

describe("making projects", () => {
  it("creates one from a template by name", async () => {
    const r = rig();
    r.handlers.set("POST /api/projects", () => jsonResponse(row(ID, "Mine"), 201));
    const made = await r.controller.createFrom("Mine", "purchase");
    expect(made.ok && made.value.id).toBe(ID);
    expect(JSON.parse(r.calls[0]!.init.body as string)).toEqual({
      name: "Mine",
      template: "purchase",
    });
  });

  describe("from the local project", () => {
    const PNG = new Uint8Array([137, 80, 78, 71]);

    it("creates the project from its text files, then uploads each image and font", async () => {
      const r = rig({
        local: {
          [A]: SOURCE_A,
          "project.json": "{}",
          "assets/logo.png": PNG,
          "fonts/a.woff2": new Uint8Array([1]),
        },
      });
      r.handlers.set("POST /api/projects", () => jsonResponse(row(ID, "Local"), 201));
      r.handlers.set(`PUT /api/projects/${ID}/binaries/assets/logo.png`, () =>
        jsonResponse({ hash: "a".repeat(64) }),
      );
      r.handlers.set(`PUT /api/projects/${ID}/binaries/fonts/a.woff2`, () =>
        jsonResponse({ hash: "b".repeat(64) }),
      );
      const progress: [string, number, number][] = [];
      const saved = await r.controller.saveLocal("Local", (path, done, total) =>
        progress.push([path, done, total]),
      );
      expect(saved.ok && saved.value.id).toBe(ID);
      expect(JSON.parse(r.calls[0]!.init.body as string)).toEqual({
        name: "Local",
        files: { [A]: SOURCE_A, "project.json": "{}" },
      });
      expect(requests(r)).toEqual([
        "POST /api/projects",
        `PUT /api/projects/${ID}/binaries/assets/logo.png`,
        `PUT /api/projects/${ID}/binaries/fonts/a.woff2`,
      ]);
      expect(progress).toEqual([
        ["assets/logo.png", 1, 2],
        ["fonts/a.woff2", 2, 2],
      ]);
      expect(r.calls[1]!.init.body).toBe(PNG);
    });

    it("deletes the project again when an image cannot be uploaded, and says why", async () => {
      const r = rig({ local: { [A]: SOURCE_A, "assets/logo.png": PNG } });
      r.handlers.set("POST /api/projects", () => jsonResponse(row(ID, "Local"), 201));
      r.handlers.set(`PUT /api/projects/${ID}/binaries/assets/logo.png`, () =>
        jsonResponse({ code: "quota.storage", message: "Full." }, 413),
      );
      r.handlers.set(`DELETE /api/projects/${ID}`, () => new Response(null, { status: 204 }));
      const saved = await r.controller.saveLocal("Local", () => undefined);
      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.failure).toMatchObject({ status: 413, code: "quota.storage" });
      expect(requests(r)).toEqual([
        "POST /api/projects",
        `PUT /api/projects/${ID}/binaries/assets/logo.png`,
        `DELETE /api/projects/${ID}`,
      ]);
    });

    it("says the account's limit of projects and sends nothing else", async () => {
      const r = rig({ local: { [A]: SOURCE_A, "assets/logo.png": PNG } });
      r.handlers.set("POST /api/projects", () =>
        jsonResponse({ code: "quota.projects", message: "100." }, 413),
      );
      const saved = await r.controller.saveLocal("Local", () => undefined);
      expect(saved.ok).toBe(false);
      expect(requests(r)).toEqual(["POST /api/projects"]);
    });

    it("refuses, before sending anything, a project over the limits", async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i <= CLOUD_LIMITS.files; i++) files[`f${i}.md`] = "";
      const r = rig({ local: files });
      const saved = await r.controller.saveLocal("Local", () => undefined);
      expect(saved).toEqual({
        ok: false,
        failure: { kind: "refused", status: 413, code: "quota.files" },
      });
      expect(r.calls).toEqual([]);
    });

    it("can be saved only while it is the one open, and when it holds files", async () => {
      const r = rig({ local: { [A]: SOURCE_A } });
      expect(r.controller.canSaveLocal()).toBe(true);
      knows(r);
      await r.controller.open(ID);
      expect(r.controller.canSaveLocal()).toBe(false);
      expect(rig().controller.canSaveLocal()).toBe(false);
    });

    it("offers the name project.json gives, or a general one", () => {
      expect(rig({ local: { "project.json": '{"name":"Orders"}' } }).controller.localName()).toBe(
        "Orders",
      );
      expect(rig({ local: { [A]: SOURCE_A } }).controller.localName()).toBe(
        en.cloud.projects.saveName,
      );
    });
  });
});

describe("what the account holds", () => {
  const usageBody = (projects: number) => ({
    projects,
    storageBytes: 1024,
    limits: { projects: 100, storageBytes: 209715200 },
  });

  it("is read from the service when it is asked for, and by no other call", async () => {
    const r = rig();
    r.handlers.set("GET /api/account/usage", () => jsonResponse(usageBody(7)));
    expect(r.controller.usage.view).toBeUndefined();
    await r.controller.usage.refresh();
    expect(r.controller.usage.view).toMatchObject({ projects: 7, maxProjects: 100 });
    expect(requests(r)).toEqual(["GET /api/account/usage"]);
  });

  it("is read again after a project is made, while someone is looking at it", async () => {
    const r = rig();
    let held = 7;
    r.handlers.set("GET /api/account/usage", () => jsonResponse(usageBody(held)));
    r.handlers.set("POST /api/projects", () => jsonResponse(row(ID, "Mine"), 201));
    r.handlers.set(`DELETE /api/projects/${ID}`, () => new Response(null, { status: 204 }));
    await r.controller.usage.refresh();
    const seen: (number | undefined)[] = [];
    r.controller.usage.listen(() => seen.push(r.controller.usage.view?.projects));

    held = 8;
    await r.controller.createFrom("Mine", "purchase");
    await settle();
    expect(seen).toEqual([8]);

    held = 7;
    await r.controller.api.remove(ID);
    await settle();
    expect(seen).toEqual([8, 7]);
    expect(requests(r)).toEqual([
      "GET /api/account/usage",
      "POST /api/projects",
      "GET /api/account/usage",
      `DELETE /api/projects/${ID}`,
      "GET /api/account/usage",
    ]);
  });

  it("is not read after a change when nobody is looking, but is not trusted either", async () => {
    const r = rig();
    r.handlers.set("GET /api/account/usage", () => jsonResponse(usageBody(7)));
    r.handlers.set("POST /api/projects", () => jsonResponse(row(ID, "Mine"), 201));
    await r.controller.usage.refresh();
    await r.controller.createFrom("Mine", "purchase");
    await settle();
    expect(requests(r)).toEqual(["GET /api/account/usage", "POST /api/projects"]);
    // What was held is wrong now, and nothing offers it until a read confirms it.
    expect(r.controller.usage.view).toBeUndefined();

    // The next look reads it, and if that fails there is still nothing to offer.
    r.handlers.set("GET /api/account/usage", () => jsonResponse({ code: "oops" }, 500));
    await r.controller.usage.refresh();
    expect(r.controller.usage.view).toBeUndefined();
  });

  it("gives a project it opens the same watched calls", async () => {
    const r = rig();
    knows(r);
    r.handlers.set("GET /api/account/usage", () => jsonResponse(usageBody(1)));
    await r.controller.open(ID);
    const seen: number[] = [];
    r.controller.usage.listen(() => seen.push(1));
    r.handlers.set(`PUT /api/projects/${ID}/binaries/assets/logo.png`, () =>
      jsonResponse({ hash: "a".repeat(64) }),
    );
    r.studio.addFiles([["assets/logo.png", new Uint8Array([137, 80, 78, 71])]]);
    await settle(30);
    expect(requests(r)).toContain(`PUT /api/projects/${ID}/binaries/assets/logo.png`);
    expect(requests(r).at(-1)).toBe("GET /api/account/usage");
    expect(seen).toEqual([1]);
  });
});

describe("the files of a project, sorted for the cloud", () => {
  const text = (value: string) => value;
  it("puts text in the document and the rest by hash, an svg given as bytes among the texts", () => {
    const split = splitForCloud(
      new Map<string, string | Uint8Array>([
        [A, text(SOURCE_A)],
        ["project.json", "{}"],
        ["assets/logo.svg", new TextEncoder().encode("<svg/>")],
        ["assets/logo.png", new Uint8Array([1])],
        ["fonts/a.ttf", new Uint8Array([2])],
      ]),
    );
    expect(split).toEqual({
      ok: true,
      value: {
        texts: { [A]: SOURCE_A, "project.json": "{}", "assets/logo.svg": "<svg/>" },
        binaries: [
          ["assets/logo.png", new Uint8Array([1])],
          ["fonts/a.ttf", new Uint8Array([2])],
        ],
      },
    });
  });

  it("refuses more than 2000 files, a path that fails the rule, an image over 10 MiB and a text over 2 Mi characters", () => {
    const many = new Map<string, string | Uint8Array>();
    for (let i = 0; i <= CLOUD_LIMITS.files; i++) many.set(`f${i}.md`, "");
    expect(splitForCloud(many)).toEqual({ ok: false, code: "quota.files" });
    expect(splitForCloud(new Map([["../x.meltemi", "a"]]))).toEqual({
      ok: false,
      code: "path.invalid",
      path: "../x.meltemi",
    });
    expect(splitForCloud(new Map([[".git/config", "a"]])).ok).toBe(false);
    expect(
      splitForCloud(new Map([["big.png", new Uint8Array(CLOUD_LIMITS.binaryBytes + 1)]])),
    ).toEqual({ ok: false, code: "quota.binary", path: "big.png" });
    expect(splitForCloud(new Map([["ok.png", new Uint8Array(CLOUD_LIMITS.binaryBytes)]])).ok).toBe(
      true,
    );
    expect(splitForCloud(new Map([["a.md", "x".repeat(CLOUD_LIMITS.textCharacters + 1)]]))).toEqual(
      { ok: false, code: "doc.too-large", path: "a.md" },
    );
  });

  it("refuses texts that together are over 16 MiB of document", () => {
    const files = new Map<string, string>();
    // Multi-byte characters: 1.5 Mi of them are 4.5 MiB of bytes; four files make 18 MiB.
    for (let i = 0; i < 4; i++) files.set(`t${i}.md`, "€".repeat(1.5 * 1024 * 1024));
    expect(splitForCloud(files)).toEqual({ ok: false, code: "doc.too-large" });
  });
});

describe("the name project.json gives", () => {
  it("is a name a project may have", () => {
    const named = (json: string) => manifestName(new Map([["project.json", json]]));
    expect(named('{"name":" Orders "}')).toBe("Orders");
    expect(named('{"name":""}')).toBeUndefined();
    expect(named('{"name":"   "}')).toBeUndefined();
    expect(named('{"name":5}')).toBeUndefined();
    expect(named(`{"name":"${"a".repeat(101)}"}`)).toBeUndefined();
    expect(named("not json")).toBeUndefined();
    expect(named("null")).toBeUndefined();
    expect(manifestName(new Map())).toBeUndefined();
    expect(manifestName(new Map([["project.json", new Uint8Array([1])]]))).toBeUndefined();
  });
});

describe("the controller's hold on the page", () => {
  it("gives the link of a project from the page's origin", () => {
    const r = rig();
    expect(r.controller.link(ID)).toBe(`https://diagrams.example/p/${ID}`);
  });

  it("passes on what is said in the status line, to the page and to who listens", () => {
    const r = rig();
    const heard: string[] = [];
    const stop = r.controller.watch((message) => heard.push(message));
    r.controller.report("one");
    stop();
    r.controller.report("two");
    expect(heard).toEqual(["one"]);
    expect(r.reports).toEqual(["one", "two"]);
  });

  it("has nothing to say about the connection or to flush without a project", () => {
    const r = rig();
    expect(r.controller.status).toBeUndefined();
    expect(r.controller.current()).toBeUndefined();
    r.controller.network();
    r.controller.flush();
  });

  it("tells the connection's status once a project is open", async () => {
    const r = rig();
    knows(r);
    await r.controller.open(ID);
    expect(r.controller.status).toEqual({ state: "connected", kept: true });
  });

  it("tells whoever follows which project is open: when one opens, and when it is left", async () => {
    const r = rig();
    knows(r);
    knows(r, OTHER, "Second");
    const heard: (string | undefined)[] = [];
    const stop = r.controller.subscribe((project) => heard.push(project?.name));
    await r.controller.open(ID);
    const secondRoom = seeded({ "diagrams/c.meltemi": 'diagram c: flow {\n  title "c"\n}\n' });
    secondRoom.serve(r.network);
    await r.controller.open(OTHER);
    r.controller.leaveToLocal();
    stop();
    await r.controller.open(ID);
    expect(heard).toEqual(["Purchase", "Second", undefined]);
  });

  it("opens a project when the browser keeps nothing, and says it will not be kept offline", async () => {
    const r = rig({ unavailable: true });
    knows(r);
    await r.controller.open(ID);
    expect(r.reports).toContain(en.cloud.status.notKept);
    expect(r.controller.status).toEqual({ state: "connected", kept: false });
  });
});
