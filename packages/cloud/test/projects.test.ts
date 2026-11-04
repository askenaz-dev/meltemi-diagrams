// The projects of a person (`cloud-projects`, "Projects"; task 2.3): list, create from a template or
// from files, read, rename and describe, duplicate and delete, through the handler with the
// in-memory store, the in-memory rooms (the room's real logic) and the real materialiser over a
// bucket in memory.

import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PUSH_BYTES } from "../src/http.js";
import { PROJECT_ID } from "../src/ids.js";
import { thumbnailKey } from "../src/keys.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { A, B, addText, typeInto } from "./support/rooms.js";
import { builtTemplate, builtTemplates, serveTemplates } from "./support/templates.js";
import { addToken, bearer } from "./support/who.js";

const JSON_TYPE = { "Content-Type": "application/json" };
const T = "2026-10-14T12:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
});

interface ProjectBody {
  id: string;
  name: string;
  description: string;
  updated_at: string;
  thumbnail: string | null;
  role: string;
  skipped?: string[];
}

interface Who {
  readonly cookie: string;
  readonly sub: string;
}

async function setup(options: Parameters<typeof harness>[0] = {}) {
  const h = await harness(options);
  serveTemplates(h);
  const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
  const beto = await h.signedIn({ sub: "u-beto", name: "Beto" });
  return { h, ana, beto };
}

/** A request from the page, as the person. */
function send(
  h: Harness,
  who: Who,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return h.request(
    path,
    h.fromPage(who.cookie, {
      method,
      ...(body === undefined ? {} : { headers: JSON_TYPE, body: JSON.stringify(body) }),
    }),
  );
}

const get = (h: Harness, who: Who, path: string): Promise<Response> =>
  h.request(path, { headers: { Cookie: who.cookie } });

async function code(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}

/** Creates a project and answers it; the test fails if it was not made. */
async function make(h: Harness, who: Who, body: Record<string, unknown>): Promise<ProjectBody> {
  const response = await send(h, who, "POST", "/api/projects", body);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return jsonOf<ProjectBody>(response);
}

/** Waits, in real time, for something the fake clock cannot advance (the platform's digest thread). */
async function eventually(done: () => Promise<boolean> | boolean): Promise<void> {
  for (let tries = 0; tries < 500 && !(await done()); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  expect(await done()).toBe(true);
}

/** A project id as the store accepts it: 20 characters of [0-9a-z]. */
const pid = (n: number): string => `p${String(n).padStart(19, "0")}`;

/** Fills an account with projects, straight into the store. */
async function fill(h: Harness, sub: string, count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const made = await h.store.createProject(
      { id: pid(i), ownerSub: sub, name: `Project ${i}`, description: "", createdAt: T },
      100,
    );
    expect(made).toBe("created");
  }
}

/** The PNG signature and a few bytes: all the type check needs. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** What a person's upload did, straight into the store: the bytes held by a project. */
async function holdBlob(h: Harness, projectId: string, hash: string, size = 10): Promise<void> {
  await h.store.addBlobs([{ hash, size, mediaType: "image/png" }], T);
  expect(await h.store.addProjectBlob(projectId, hash)).toBe(true);
}

// ---------------------------------------------------------------------------------------------

describe("POST /api/projects from a template", () => {
  it("makes the project with the purchase template's five .meltemi files and project.json in the room", async () => {
    const { h, ana } = await setup();

    const created = await make(h, ana, { name: "Purchase", template: "purchase" });

    expect(created).toEqual({
      id: expect.stringMatching(PROJECT_ID),
      name: "Purchase",
      description: "",
      updated_at: expect.any(String),
      thumbnail: null,
      role: "owner",
    });
    const template = builtTemplate("purchase");
    const room = await h.rooms.read(created.id);
    expect(room.files).toEqual(template.files);
    expect(Object.keys(room.files).filter((path) => path.endsWith(".meltemi"))).toHaveLength(5);
    expect(room.files["project.json"]).toBe(template.files["project.json"]);
    expect(room.binaries).toEqual({});
    expect(room.collisions).toEqual([]);
    // One push: one revision.
    expect(room.revision).toBe(1);

    // The list shows it, and it was materialised: its files are rows and blobs.
    const list = await jsonOf<{ projects: ProjectBody[] }>(await get(h, ana, "/api/projects"));
    expect(list.projects.map((project) => project.id)).toEqual([created.id]);
    expect([...(await h.store.projectFiles(created.id)).keys()].sort()).toEqual(
      Object.keys(template.files).sort(),
    );
    expect(h.blobs.keys()).toHaveLength(new Set(Object.values(template.files)).size);
    expect((await h.store.project("u-ana", created.id))?.revision).toBe(1);
    expect((await h.store.usage("u-ana")).storageBytes).toBeGreaterThan(0);
  });

  it.each(builtTemplates().map((template) => template.name))(
    "starts from the %s template exactly as the playground's build writes it",
    async (name) => {
      const { h, ana } = await setup();

      const created = await make(h, ana, { name: `A ${name}`, template: name });

      expect((await h.rooms.read(created.id)).files).toEqual(builtTemplate(name).files);
    },
  );

  it("refuses a template that is not one, and creates nothing", async () => {
    const { h, ana } = await setup();
    for (const template of ["nothing", "", "__proto__", "constructor", 7, null]) {
      const response = await send(h, ana, "POST", "/api/projects", { name: "X", template });
      expect(response.status, String(template)).toBe(400);
      expect(await code(response), String(template)).toBe("request.invalid");
    }
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("refuses a template together with files, and creates nothing", async () => {
    const { h, ana } = await setup();

    const response = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      template: "flow",
      files: { "a.meltemi": "x" },
    });

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("request.invalid");
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("answers internal, logs it without detail and creates nothing when the build holds no templates", async () => {
    const { h, ana } = await setup();
    h.assets.files.delete("/templates.json");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await send(h, ana, "POST", "/api/projects", { name: "X", template: "flow" });

    expect(response.status).toBe(500);
    expect(await code(response)).toBe("internal");
    expect(logged).toHaveBeenCalledTimes(1);
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("answers internal for a templates.json that is not what the build writes", async () => {
    const { h, ana } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const body of [
      "not json",
      "{}",
      JSON.stringify({ templates: [{ name: "flow", files: { "../x.meltemi": "x" } }] }),
      JSON.stringify({ templates: [{ name: "flow", files: { "a.meltemi": 1 } }] }),
      JSON.stringify({ templates: [{ name: "c4", files: {} }] }),
    ]) {
      h.assets.files.set("/templates.json", { body, type: "application/json" });
      const response = await send(h, ana, "POST", "/api/projects", { name: "X", template: "flow" });
      expect(response.status, body).toBe(500);
    }
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });
});

describe("POST /api/projects from files", () => {
  it("puts the files in the room as one push and lists the project", async () => {
    const { h, ana } = await setup();

    const created = await make(h, ana, {
      name: "  Mine  ",
      description: "About it",
      // `fromEntries` defines an own key `__proto__`; an object literal would set a prototype instead.
      files: Object.fromEntries([
        ["diagrams/a.meltemi", "a\n"],
        ["notes.md", "# n\n"],
        ["__proto__", "own key"],
      ]),
    });

    expect(created).toMatchObject({ name: "Mine", description: "About it" });
    const room = await h.rooms.read(created.id);
    expect(room.revision).toBe(1);
    expect(Object.keys(room.files).sort()).toEqual(["__proto__", "diagrams/a.meltemi", "notes.md"]);
    expect(room.files["diagrams/a.meltemi"]).toBe("a\n");
  });

  it("makes an empty project of a name alone: no files, nothing pushed", async () => {
    const { h, ana } = await setup();

    const created = await make(h, ana, { name: "Empty" });

    expect(await h.rooms.read(created.id)).toMatchObject({ revision: 0, files: {}, binaries: {} });
    expect(h.blobs.keys()).toEqual([]);
  });

  it("refuses a path that breaks the path rule with path.invalid, creating no project and storing nothing", async () => {
    const { h, ana } = await setup();
    for (const path of [
      "../x.meltemi",
      "..\\x.meltemi",
      "a/../b.meltemi",
      ".git/hooks/post-checkout",
      "a//b.meltemi",
      "./a.meltemi",
      "/abs.meltemi",
      "a\\b.meltemi",
      "c:x.meltemi",
      "a/.hidden",
      "a\u0000b",
      "",
      "x/".repeat(13) + "y",
      `${"x".repeat(101)}.meltemi`,
    ]) {
      const response = await send(h, ana, "POST", "/api/projects", {
        name: "X",
        files: { "ok.meltemi": "ok", [path]: "bad" },
      });
      expect(response.status, JSON.stringify(path)).toBe(400);
      expect(await code(response), JSON.stringify(path)).toBe("path.invalid");
    }
    expect(await h.store.countProjects("u-ana")).toBe(0);
    expect(h.blobs.keys()).toEqual([]);
    // A path of the binaries is checked like one of the files.
    const bad = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      binaries: { "../logo.png": "a".repeat(64) },
    });
    expect(await code(bad)).toBe("path.invalid");
  });

  it("refuses shapes that are not files with request.invalid", async () => {
    const { h, ana } = await setup();
    for (const files of [[], "text", 7, null, { "a.meltemi": 1 }, { "a.meltemi": null }]) {
      const response = await send(h, ana, "POST", "/api/projects", { name: "X", files });
      expect(response.status, JSON.stringify(files)).toBe(400);
      expect(await code(response), JSON.stringify(files)).toBe("request.invalid");
    }
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("refuses a path that is both a file and a binary with doc.invalid", async () => {
    const { h, ana } = await setup();

    const response = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      files: { "a.svg": "<svg/>" },
      binaries: { "a.svg": "a".repeat(64) },
    });

    expect(await code(response)).toBe("doc.invalid");
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("refuses a text over 2 Mi characters with doc.too-large, and more than 2000 files with quota.files", async () => {
    const { h, ana } = await setup();

    const big = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      files: { "a.meltemi": "a".repeat(2 * 1024 * 1024 + 1) },
    });
    expect(big.status).toBe(413);
    expect(await code(big)).toBe("doc.too-large");

    const many = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      files: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`f${i}.md`, ""])),
    });
    expect(many.status).toBe(413);
    expect(await code(many)).toBe("quota.files");

    // 2 Mi characters exactly, and 2000 files exactly, are fine.
    const exact = await send(h, ana, "POST", "/api/projects", {
      name: "Exact",
      files: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`f${i}.md`, ""])),
    });
    expect(exact.status).toBe(201);
    expect(await h.store.countProjects("u-ana")).toBe(1);
  });

  it("answers doc.too-large for a body over a document's size, unread, and creates nothing", async () => {
    const { h, ana } = await setup();

    const response = await h.request(
      "/api/projects",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: { ...JSON_TYPE, "Content-Length": String(MAX_PUSH_BYTES + 1) },
        body: JSON.stringify({ name: "X" }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("doc.too-large");
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("takes the project back, leaving no row and no room, when the room refuses what pre-checks cannot see", async () => {
    // The room's document limit is narrower than the cap the route knows.
    const { h, ana } = await setup({ roomLimits: { documentBytes: 200 } });
    const made = vi.spyOn(h.store, "createProject");

    const response = await send(h, ana, "POST", "/api/projects", {
      name: "X",
      template: "purchase",
    });

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("doc.too-large");
    // The row was made (the quota is checked in its statement) and taken back, with the room.
    expect(made).toHaveBeenCalledTimes(1);
    const id = made.mock.calls[0]?.[0].id ?? "";
    expect(await h.store.project("u-ana", id)).toBeUndefined();
    expect(await h.store.countProjects("u-ana")).toBe(0);
    expect(h.rooms.room(id).storage.destroyed).toBe(1);
    expect(h.blobs.keys()).toEqual([]);
  });

  describe("binaries", () => {
    it("takes hashes the person's own projects hold, and gives the new project their rows", async () => {
      const { h, ana } = await setup();
      const first = await make(h, ana, { name: "First" });
      const hash = "a".repeat(64);
      await holdBlob(h, first.id, hash);

      const second = await make(h, ana, { name: "Second", binaries: { "img/logo.png": hash } });

      expect((await h.rooms.read(second.id)).binaries).toEqual({ "img/logo.png": hash });
      expect(await h.store.projectBlobs(second.id)).toEqual([hash]);
      expect(await h.store.hasProjectBlob(second.id, hash)).toBe(true);
      expect([...(await h.store.projectFiles(second.id))]).toEqual([["img/logo.png", hash]]);
    });

    it("answers blob.unknown for a hash nobody of theirs holds, whoever else does, and creates nothing", async () => {
      const { h, ana, beto } = await setup();
      const theirs = await make(h, beto, { name: "Beto's" });
      const hash = "b".repeat(64);
      await holdBlob(h, theirs.id, hash);

      for (const known of [hash, "c".repeat(64)]) {
        const response = await send(h, ana, "POST", "/api/projects", {
          name: "X",
          binaries: { "img/logo.png": known },
        });
        expect(response.status).toBe(400);
        expect(await code(response)).toBe("blob.unknown");
      }
      expect(await h.store.countProjects("u-ana")).toBe(0);
    });

    it("answers request.invalid for a hash that is not a SHA-256", async () => {
      const { h, ana } = await setup();
      for (const hash of ["abc", "A".repeat(64), "g".repeat(64), "a".repeat(63)]) {
        const response = await send(h, ana, "POST", "/api/projects", {
          name: "X",
          binaries: { "img/logo.png": hash },
        });
        expect(await code(response), hash).toBe("request.invalid");
      }
    });
  });
});

describe("the name and the description", () => {
  it.each([
    ["no name", {}],
    ["a name that is not text", { name: 7 }],
    ["an empty name", { name: "" }],
    ["a name of spaces", { name: "   \t " }],
    ["a name of 101 characters", { name: "x".repeat(101) }],
    ["a name with a control character", { name: "a\u0007b" }],
    ["a name with a line break", { name: "a\nb" }],
    ["a name with a line separator", { name: "a b" }],
    ["a name with a lone surrogate", { name: "a\ud800b" }],
    ["a description that is not text", { name: "X", description: 7 }],
    ["a description of 501 characters", { name: "X", description: "d".repeat(501) }],
    ["a description with a control character", { name: "X", description: "a\u0007b" }],
  ])("refuses %s with request.invalid, creating nothing", async (_label, body) => {
    const { h, ana } = await setup();

    const response = await send(h, ana, "POST", "/api/projects", body);

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("request.invalid");
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("accepts 100 characters, counted as characters and not as bytes or code units", async () => {
    const { h, ana } = await setup();

    expect((await make(h, ana, { name: "x".repeat(100) })).name).toHaveLength(100);
    const emoji = "\u{1f600}".repeat(100);
    expect((await make(h, ana, { name: emoji })).name).toBe(emoji);
    const response = await send(h, ana, "POST", "/api/projects", { name: "\u{1f600}".repeat(101) });
    expect(response.status).toBe(400);
  });

  it("accepts a description of 500 characters with line breaks", async () => {
    const { h, ana } = await setup();

    const created = await make(h, ana, { name: "X", description: `${"d".repeat(498)}\n\n` });

    expect(created.description).toHaveLength(500);
  });

  it.each([
    ["nothing", undefined],
    ["text that is not JSON", "nope"],
    ["a JSON array", "[]"],
    ["JSON null", "null"],
    ["a JSON string", '"x"'],
  ])("refuses a body of %s with request.invalid", async (_label, body) => {
    const { h, ana } = await setup();

    const response = await h.request(
      "/api/projects",
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        ...(body === undefined ? {} : { body }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("request.invalid");
  });
});

describe("the project quota", () => {
  it("answers 413 quota.projects for the 101st project and creates nothing", async () => {
    const { h, ana } = await setup();
    await fill(h, "u-ana", 100);

    const response = await send(h, ana, "POST", "/api/projects", {
      name: "One too many",
      template: "flow",
    });

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("quota.projects");
    expect(await h.store.countProjects("u-ana")).toBe(100);
    expect(h.blobs.keys()).toEqual([]);
  });

  it("lets the 100th be made, and counts only the person's own", async () => {
    const { h, ana, beto } = await setup();
    await fill(h, "u-ana", 99);
    await h.store.createProject(
      { id: "betosproject0000000a", ownerSub: "u-beto", name: "B", description: "", createdAt: T },
      100,
    );

    expect((await send(h, ana, "POST", "/api/projects", { name: "The 100th" })).status).toBe(201);
    expect((await send(h, ana, "POST", "/api/projects", { name: "The 101st" })).status).toBe(413);
    expect((await send(h, beto, "POST", "/api/projects", { name: "Beto's second" })).status).toBe(
      201,
    );
  });

  it("cannot be passed by creates that race: of three at 99, one is made", async () => {
    const { h, ana } = await setup();
    await fill(h, "u-ana", 99);

    const answers = await Promise.all(
      [1, 2, 3].map((n) =>
        send(h, ana, "POST", "/api/projects", { name: `Racing ${n}`, files: { "a.md": "x" } }),
      ),
    );

    expect(answers.map((response) => response.status).sort()).toEqual([201, 413, 413]);
    expect(await h.store.countProjects("u-ana")).toBe(100);
  });

  it("frees a place when a project is deleted", async () => {
    const { h, ana } = await setup();
    await fill(h, "u-ana", 100);

    expect((await send(h, ana, "DELETE", `/api/projects/${pid(7)}`)).status).toBe(204);

    expect((await send(h, ana, "POST", "/api/projects", { name: "Again" })).status).toBe(201);
  });
});

describe("a materialisation that fails at creation", () => {
  it("does not fail the creation: the room holds the files and materialises at its next trigger", async () => {
    const { h, ana } = await setup();
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.blobs.refuse = (op) => op === "put";

    const created = await make(h, ana, { name: "Offline R2", files: { "a.meltemi": "kept\n" } });

    expect(warned).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warned.mock.calls)).not.toContain("kept");
    expect((await h.rooms.read(created.id)).files).toEqual({ "a.meltemi": "kept\n" });
    expect((await h.store.projectFiles(created.id)).size).toBe(0);
    expect((await get(h, ana, `/api/projects/${created.id}`)).status).toBe(200);

    // R2 is back; the thirty-second timer the push armed writes the rows.
    h.blobs.refuse = undefined;
    await h.rooms.advance(30_000);
    await eventually(async () => (await h.store.projectFiles(created.id)).size === 1);
  });
});

describe("GET /api/projects", () => {
  it("lists the person's projects, the most recently updated first, in the answer's shape", async () => {
    const { h, ana, beto } = await setup();
    const first = await make(h, ana, { name: "First", files: { "a.md": "a" } });
    h.clock.advance(60_000);
    const second = await make(h, ana, { name: "Second", files: { "a.md": "b" } });
    await make(h, beto, { name: "Not Ana's" });

    const list = await jsonOf<{ projects: ProjectBody[] }>(await get(h, ana, "/api/projects"));

    expect(list.projects.map((project) => project.name)).toEqual(["Second", "First"]);
    for (const project of list.projects) {
      expect(Object.keys(project).sort()).toEqual([
        "description",
        "id",
        "name",
        "role",
        "thumbnail",
        "updated_at",
      ]);
      expect(project.role).toBe("owner");
    }
    expect(list.projects[1]?.id).toBe(first.id);
    expect(list.projects[0]?.id).toBe(second.id);

    // A rename makes a project the most recently updated.
    h.clock.advance(60_000);
    await send(h, ana, "PATCH", `/api/projects/${first.id}`, { name: "First, renamed" });
    const again = await jsonOf<{ projects: ProjectBody[] }>(await get(h, ana, "/api/projects"));
    expect(again.projects.map((project) => project.name)).toEqual(["First, renamed", "Second"]);
  });

  it("is an empty list for a person with no project, with no cache", async () => {
    const { h, ana } = await setup();

    const response = await get(h, ana, "/api/projects");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ projects: [] });
  });

  it("gives the address of the thumbnail once there is one, and null until then", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "X" });
    expect(created.thumbnail).toBeNull();

    await h.store.setThumbnailAt(created.id, T);

    const [project] = (
      await jsonOf<{ projects: ProjectBody[] }>(await get(h, ana, "/api/projects"))
    ).projects;
    expect(project?.thumbnail).toBe(`/api/projects/${created.id}/thumbnail`);
  });
});

describe("GET /api/projects/:id", () => {
  it("answers the project to its owner", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Mine", description: "About" });

    const response = await get(h, ana, `/api/projects/${created.id}`);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual(created);
  });

  it("answers 404 project.not-found for someone else's project, exactly as for one that does not exist", async () => {
    const { h, ana, beto } = await setup();
    const theirs = await make(h, beto, { name: "Beto's" });

    const other = await get(h, ana, `/api/projects/${theirs.id}`);
    const missing = await get(h, ana, `/api/projects/${"z".repeat(20)}`);
    const malformed = await get(h, ana, "/api/projects/not-an-id");

    for (const response of [other, missing, malformed]) {
      expect(response.status).toBe(404);
      expect(await code(response)).toBe("project.not-found");
    }
    expect(await other.json()).toEqual(await missing.json());
  });

  it("answers someone else's project 404 for every route that names it, and changes nothing", async () => {
    const { h, ana, beto } = await setup();
    const theirs = await make(h, beto, { name: "Beto's", files: { "a.meltemi": "kept\n" } });
    const before = JSON.stringify(await h.store.project("u-beto", theirs.id));

    for (const [method, path, body] of [
      ["GET", `/api/projects/${theirs.id}`, undefined],
      ["PATCH", `/api/projects/${theirs.id}`, { name: "Mine now" }],
      ["POST", `/api/projects/${theirs.id}/duplicate`, undefined],
      ["DELETE", `/api/projects/${theirs.id}`, undefined],
    ] as const) {
      const response = await send(h, ana, method, path, body);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await code(response), `${method} ${path}`).toBe("project.not-found");
    }
    expect(JSON.stringify(await h.store.project("u-beto", theirs.id))).toBe(before);
    expect(await h.store.countProjects("u-ana")).toBe(0);
    expect((await h.rooms.read(theirs.id)).files).toEqual({ "a.meltemi": "kept\n" });
  });
});

describe("PATCH /api/projects/:id", () => {
  it("renames, describes, or both, and leaves a field that is not given as it is", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Old", description: "Old about" });
    h.clock.advance(5_000);

    const renamed = await jsonOf<ProjectBody>(
      await send(h, ana, "PATCH", `/api/projects/${created.id}`, { name: "  New  " }),
    );
    expect(renamed).toMatchObject({ name: "New", description: "Old about" });
    expect(renamed.updated_at > created.updated_at).toBe(true);

    const described = await jsonOf<ProjectBody>(
      await send(h, ana, "PATCH", `/api/projects/${created.id}`, { description: "" }),
    );
    expect(described).toMatchObject({ name: "New", description: "" });

    const both = await jsonOf<ProjectBody>(
      await send(h, ana, "PATCH", `/api/projects/${created.id}`, {
        name: "Both",
        description: "d",
      }),
    );
    expect(both).toMatchObject({ name: "Both", description: "d" });
    expect(await h.store.project("u-ana", created.id)).toMatchObject({
      name: "Both",
      description: "d",
    });
  });

  it("changes nothing for a body with neither field, not even the time", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Same" });
    h.clock.advance(5_000);

    const response = await send(h, ana, "PATCH", `/api/projects/${created.id}`, { other: 1 });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual(created);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of 101 characters", { name: "x".repeat(101) }],
    ["a name that is not text", { name: null }],
    ["a description of 501 characters", { description: "d".repeat(501) }],
    ["a description that is not text", { description: 1 }],
  ])("refuses %s and changes nothing", async (_label, body) => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Kept", description: "Kept about" });

    const response = await send(h, ana, "PATCH", `/api/projects/${created.id}`, body);

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("request.invalid");
    expect(await h.store.project("u-ana", created.id)).toMatchObject({
      name: "Kept",
      description: "Kept about",
    });
  });

  it("refuses a body that is not a JSON object, or longer than the cap", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Kept" });

    for (const body of ["nope", "[]", "", "x".repeat(9 * 1024)]) {
      const response = await h.request(
        `/api/projects/${created.id}`,
        h.fromPage(ana.cookie, { method: "PATCH", headers: JSON_TYPE, body }),
      );
      expect(response.status, body.slice(0, 10)).toBe(400);
    }
    expect((await h.store.project("u-ana", created.id))?.name).toBe("Kept");
  });
});

describe("POST /api/projects/:id/duplicate", () => {
  it("copies the room's latest files under a new id and a new name, and leaves the original alone", async () => {
    const { h, ana } = await setup();
    const source = await make(h, ana, {
      name: "Original",
      description: "About",
      template: "purchase",
    });
    // Typed since the last materialisation: only the room has it.
    await h.request(
      `/api/projects/${source.id}/files`,
      h.fromPage(ana.cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: JSON.stringify({
          files: { "notes.md": "typed just now\n", "diagrams/payment.meltemi": null },
        }),
      }),
    );
    const latest = await h.rooms.read(source.id);

    const response = await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`);

    expect(response.status).toBe(201);
    const copy = await jsonOf<ProjectBody>(response);
    expect(copy.id).not.toBe(source.id);
    expect(copy.id).toMatch(PROJECT_ID);
    expect(copy).toMatchObject({ name: "Original (copy)", description: "About", role: "owner" });
    expect(copy.skipped).toBeUndefined();
    const room = await h.rooms.read(copy.id);
    expect(room.files).toEqual(latest.files);
    expect(room.files["notes.md"]).toBe("typed just now\n");
    expect(room.files["diagrams/payment.meltemi"]).toBeUndefined();
    expect(latest.files["diagrams/payment.meltemi"]).toBeUndefined();
    // Materialised as its own: the rows exist, and they share the blobs of the original.
    expect([...(await h.store.projectFiles(copy.id)).keys()].sort()).toEqual(
      Object.keys(latest.files).sort(),
    );
    expect((await h.rooms.read(source.id)).files).toEqual(latest.files);
    const list = await jsonOf<{ projects: ProjectBody[] }>(await get(h, ana, "/api/projects"));
    expect(list.projects.map((project) => project.name).sort()).toEqual([
      "Original",
      "Original (copy)",
    ]);
  });

  it("takes the name the caller gives, and cuts a long one to fit", async () => {
    const { h, ana } = await setup();
    const source = await make(h, ana, { name: "x".repeat(100) });

    const named = await jsonOf<ProjectBody>(
      await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`, { name: "Chosen" }),
    );
    const cut = await jsonOf<ProjectBody>(
      await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`),
    );

    expect(named.name).toBe("Chosen");
    expect(Array.from(cut.name)).toHaveLength(100);
    expect(cut.name.endsWith(" (copy)")).toBe(true);
    const invalid = await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`, {
      name: "",
    });
    expect(invalid.status).toBe(400);
  });

  it("copies the project_blobs rows and the images and fonts of the room", async () => {
    const { h, ana } = await setup();
    const source = await make(h, ana, { name: "With images", files: { "a.meltemi": "a\n" } });
    const used = "a".repeat(64);
    const spare = "b".repeat(64);
    await holdBlob(h, source.id, used);
    await holdBlob(h, source.id, spare);
    await h.rooms.push(source.id, { binaries: { "img/used.png": used } });

    const copy = await jsonOf<ProjectBody>(
      await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`),
    );

    expect(await h.store.projectBlobs(copy.id)).toEqual([used, spare]);
    expect((await h.rooms.read(copy.id)).binaries).toEqual({ "img/used.png": used });
    // The copy serves the bytes it now holds.
    h.blobs.objects.set(`blobs/${used}`, PNG);
    expect((await get(h, ana, `/api/projects/${copy.id}/blobs/${used}`)).status).toBe(200);
  });

  it("leaves out a collision loser, whose path cannot be kept, and says so", async () => {
    const { h, ana } = await setup();
    const source = await make(h, ana, { name: "Collided" });
    const first = await h.rooms.room(source.id).open({ sub: "u-ana" });
    const second = await h.rooms.room(source.id).open({ sub: "u-ana" });
    await addText(first, A, "a.meltemi", "one\n");
    await addText(second, B, "a.meltemi", "two\n");
    expect(Object.keys((await h.rooms.read(source.id)).files).sort()).toEqual([
      "a.meltemi",
      `a.meltemi~${B}`,
    ]);

    const response = await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`);

    expect(response.status).toBe(201);
    const copy = await jsonOf<ProjectBody>(response);
    expect(copy.skipped).toEqual([`a.meltemi~${B}`]);
    expect((await h.rooms.read(copy.id)).files).toEqual({ "a.meltemi": "one\n" });
  });

  it("answers 413 quota.projects at 100 projects, creating nothing", async () => {
    const { h, ana } = await setup();
    await fill(h, "u-ana", 99);
    const source = await make(h, ana, { name: "The 100th", files: { "a.md": "x" } });

    const response = await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`);

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("quota.projects");
    expect(await h.store.countProjects("u-ana")).toBe(100);
  });

  it("copes with a project that has no room content", async () => {
    const { h, ana } = await setup();
    const source = await make(h, ana, { name: "Empty" });

    const copy = await jsonOf<ProjectBody>(
      await send(h, ana, "POST", `/api/projects/${source.id}/duplicate`),
    );

    expect(await h.rooms.read(copy.id)).toMatchObject({ revision: 0, files: {} });
  });
});

describe("DELETE /api/projects/:id", () => {
  it("destroys the room, the thumbnail and every row of the project, and keeps the blobs for the collection", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Doomed", template: "flow" });
    const hash = "a".repeat(64);
    await holdBlob(h, created.id, hash);
    h.blobs.objects.set(`blobs/${hash}`, PNG);
    h.blobs.objects.set(thumbnailKey(created.id), new TextEncoder().encode("<svg/>"));
    await h.store.setThumbnailAt(created.id, T);
    await h.store.createVersion(
      { projectId: created.id, label: "v1", auto: false, createdBy: "u-ana", createdAt: T },
      { maxVersions: 200 },
    );
    const client = await h.rooms.room(created.id).open({ sub: "u-ana" });
    const filesBefore = [...(await h.store.projectFiles(created.id)).values()];
    expect(filesBefore.length).toBeGreaterThan(0);

    const response = await send(h, ana, "DELETE", `/api/projects/${created.id}`);

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    // The room: its storage destroyed, its clients told and closed, and empty if asked again.
    expect(h.rooms.room(created.id).storage.destroyed).toBe(1);
    expect(client.errors).toEqual(["project.not-found"]);
    expect(client.closed?.code).toBe(4404);
    expect(await h.rooms.read(created.id)).toMatchObject({ revision: 0, files: {} });
    // The thumbnail object, and the rows.
    expect(h.blobs.objects.has(thumbnailKey(created.id))).toBe(false);
    expect(await h.store.project("u-ana", created.id)).toBeUndefined();
    expect((await h.store.projectFiles(created.id)).size).toBe(0);
    expect(await h.store.projectBlobs(created.id)).toEqual([]);
    expect(await h.store.listVersions(created.id)).toEqual([]);
    expect((await get(h, ana, `/api/projects/${created.id}`)).status).toBe(404);
    // The blobs wait for the collection, referenced by nothing now.
    for (const kept of [...filesBefore, hash]) expect(await h.store.blob(kept)).toBeDefined();
    expect(h.blobs.objects.has(`blobs/${hash}`)).toBe(true);
    expect(await h.store.unreferencedBlobs("2999-01-01T00:00:00.000Z", 100)).toEqual(
      expect.arrayContaining([hash, ...filesBefore]),
    );
    // And the person's usage no longer counts them.
    expect((await h.store.usage("u-ana")).storageBytes).toBe(0);
  });

  it("answers 404 for a second delete", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Once" });
    expect((await send(h, ana, "DELETE", `/api/projects/${created.id}`)).status).toBe(204);

    const again = await send(h, ana, "DELETE", `/api/projects/${created.id}`);

    expect(again.status).toBe(404);
    expect(await code(again)).toBe("project.not-found");
  });

  it("can be repeated after a failure partway: the room is already gone and the rows are still there", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Retry", files: { "a.md": "x" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.blobs.refuse = (op) => op === "delete";

    const failed = await send(h, ana, "DELETE", `/api/projects/${created.id}`);

    expect(failed.status).toBe(500);
    expect(await code(failed)).toBe("internal");
    expect(await h.store.project("u-ana", created.id)).toBeDefined();

    h.blobs.refuse = undefined;
    expect((await send(h, ana, "DELETE", `/api/projects/${created.id}`)).status).toBe(204);
    expect(await h.store.project("u-ana", created.id)).toBeUndefined();
  });

  it("does not delete the project when the room cannot be destroyed", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Stays" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.rooms.destroy = async () => {
      throw new Error("the Durable Object is unreachable");
    };

    const response = await send(h, ana, "DELETE", `/api/projects/${created.id}`);

    expect(response.status).toBe(500);
    expect(await h.store.project("u-ana", created.id)).toBeDefined();
  });

  it("does not let a materialisation in flight write the files of a deleted project back", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Raced" });
    const client = await h.rooms.room(created.id).open({ sub: "u-ana" });
    await addText(client, A, "a.meltemi", "typed\n");
    await typeInto(client, A, "more\n");

    await send(h, ana, "DELETE", `/api/projects/${created.id}`);
    await h.rooms.advance(120_000);

    expect((await h.store.projectFiles(created.id)).size).toBe(0);
    expect(await h.store.project("u-ana", created.id)).toBeUndefined();
  });
});

describe("who may ask", () => {
  /** Every route of this file, as a person on the page asks it. */
  const ROUTES: [string, string, unknown?][] = [
    ["GET", "/api/projects"],
    ["POST", "/api/projects", { name: "X" }],
    ["GET", `/api/projects/${"a".repeat(20)}`],
    ["PATCH", `/api/projects/${"a".repeat(20)}`, { name: "X" }],
    ["DELETE", `/api/projects/${"a".repeat(20)}`],
    ["POST", `/api/projects/${"a".repeat(20)}/duplicate`],
  ];

  it("answers 401 auth.required to nobody for the list and the creation, and 404 for a project nobody asking can open", async () => {
    const { h } = await setup();
    for (const [method, path, body] of ROUTES) {
      for (const cookie of [undefined, "meltemi_session=not-a-token"]) {
        const response = await h.request(path, {
          method,
          headers: {
            Origin: "https://diagrams.meltemi.dev",
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body === undefined ? {} : JSON_TYPE),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        // A project's own routes resolve what the asker may do with it first (`project-sharing`):
        // for a project that nobody asking can open, that is a 404 and not a request to sign in,
        // so that a private project does not reveal that it exists.
        const listing = path === "/api/projects";
        expect(response.status, `${method} ${path}`).toBe(listing ? 401 : 404);
        expect(await code(response), `${method} ${path}`).toBe(
          listing ? "auth.required" : "project.not-found",
        );
      }
    }
    expect(await h.store.countProjects("u-ana")).toBe(0);
  });

  it("refuses a change made with the cookie from anywhere but the page, before the route runs", async () => {
    const { h, ana } = await setup();
    const created = await make(h, ana, { name: "Safe" });
    const spies = [
      vi.spyOn(h.store, "createProject"),
      vi.spyOn(h.store, "updateProject"),
      vi.spyOn(h.store, "deleteProject"),
      vi.spyOn(h.rooms, "destroy"),
    ];

    for (const origin of [undefined, "null", "https://evil.example", "https://id.meltemi.dev"]) {
      for (const [method, path, body] of [
        ["POST", "/api/projects", { name: "X" }],
        ["PATCH", `/api/projects/${created.id}`, { name: "Hijacked" }],
        ["DELETE", `/api/projects/${created.id}`],
        ["POST", `/api/projects/${created.id}/duplicate`],
      ] as [string, string, unknown?][]) {
        const response = await h.request(path, {
          method,
          headers: {
            Cookie: ana.cookie,
            ...(origin === undefined ? {} : { Origin: origin }),
            ...JSON_TYPE,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        expect(response.status, `${method} ${path} from ${origin}`).toBe(403);
        expect(await code(response)).toBe("request.forbidden");
      }
    }

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect((await h.store.project("u-ana", created.id))?.name).toBe("Safe");
  });

  it("lets a bearer token do all of it, with no Origin: the command line uses these routes", async () => {
    const { h } = await setup();
    const { token } = await addToken(h.store, { sub: "u-cli" });
    const ask = (method: string, path: string, body?: unknown) =>
      h.request(
        path,
        bearer(token, {
          method,
          ...(body === undefined ? {} : { headers: JSON_TYPE, body: JSON.stringify(body) }),
        }),
      );

    const created = await jsonOf<ProjectBody>(
      await ask("POST", "/api/projects", { name: "From CLI", files: { "a.md": "x" } }),
    );
    expect((await ask("GET", "/api/projects")).status).toBe(200);
    expect((await ask("GET", `/api/projects/${created.id}`)).status).toBe(200);
    expect((await ask("PATCH", `/api/projects/${created.id}`, { name: "Renamed" })).status).toBe(
      200,
    );
    const copy = await jsonOf<ProjectBody>(
      await ask("POST", `/api/projects/${created.id}/duplicate`),
    );
    expect((await ask("DELETE", `/api/projects/${copy.id}`)).status).toBe(204);
    expect((await ask("DELETE", `/api/projects/${created.id}`)).status).toBe(204);
    expect(await h.store.countProjects("u-cli")).toBe(0);
  });

  it("answers 401 token.invalid for an unknown token, whatever cookie comes with it", async () => {
    const { h, ana } = await setup();

    const response = await h.request("/api/projects", {
      headers: { Authorization: "Bearer mdg_unknown", Cookie: ana.cookie },
    });

    expect(response.status).toBe(401);
    expect(await code(response)).toBe("token.invalid");
  });

  it("answers 404 not-found for a method no route has, as the rest of the API does", async () => {
    const { h, ana } = await setup();
    for (const [method, path] of [
      ["PUT", "/api/projects"],
      ["DELETE", "/api/projects"],
      ["PATCH", "/api/projects"],
      ["POST", `/api/projects/${"a".repeat(20)}`],
      ["PUT", `/api/projects/${"a".repeat(20)}`],
      ["GET", `/api/projects/${"a".repeat(20)}/duplicate`],
    ]) {
      const response = await h.request(path as string, h.fromPage(ana.cookie, { method }));
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await code(response), `${method} ${path}`).toBe("not-found");
    }
  });
});
