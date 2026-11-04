// The routes of versions (`cloud-projects`, "Versions"; task 2.5), through the handler with the
// in-memory store, rooms and bucket: create with a label, the cap and the rate, list, read, restore
// through the room, and the daily version made by the materialisation. The policy itself (thinning,
// the walk of the weeks) is `versions-policy.test.ts`.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshot } from "../src/document.js";
import { blobKey } from "../src/keys.js";
import { materialise } from "../src/materialise.js";
import { KIND } from "../src/room-protocol.js";
import type { CloudStore } from "../src/store/types.js";
import { jsonOf } from "./support/index.js";
import {
  DAY,
  HOUR,
  JSON_TYPE,
  MINUTE,
  codeOf,
  pngBytes,
  projects,
  sha,
  svgOf,
} from "./support/projects.js";
import { A, B, addText } from "./support/rooms.js";
import { addToken, bearer } from "./support/who.js";

const ANA = "u-ana";
const BETO = "u-beto";
const START = Date.parse("2026-10-14T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

const FILES = { "a.meltemi": "one\n", "notes.md": "# notes\n" };

/** Ana's project with two files, materialised (it was just created). */
async function setup(options: Parameters<typeof projects>[0] = {}) {
  const p = await projects(options);
  const id = await p.create(ANA, { name: "P", files: FILES });
  return { ...p, id };
}
type World = Awaited<ReturnType<typeof setup>>;

const at = (days: number, hours = 0): string =>
  new Date(START + days * DAY + hours * HOUR).toISOString();
const url = (id: string, rest = ""): string => `/api/projects/${id}/versions${rest}`;

interface VersionBody {
  number: number;
  label: string | null;
  auto: boolean;
  created_at: string;
  created_by: string;
  changed: string[];
}

/** `POST …/versions` as Ana. */
const make = (w: World, body: unknown = {}, id = w.id) => w.sendJson(ANA, "POST", url(id), body);

/** The versions Ana's project lists, newest first. */
async function listed(w: World, id = w.id): Promise<VersionBody[]> {
  const response = await w.send(ANA, "GET", url(id));
  expect(response.status).toBe(200);
  return (await jsonOf<{ versions: VersionBody[] }>(response)).versions;
}

/** Puts versions straight into the store (a cap that does not stop it), as many as a test needs. */
async function seed(
  store: CloudStore,
  id: string,
  count: number,
  make: (i: number) => { label: string | null; createdAt: string },
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const { label, createdAt } = make(i);
    const made = await store.createVersion(
      { projectId: id, label, auto: false, createdBy: ANA, createdAt },
      { maxVersions: 10_000 },
    );
    expect(typeof made).toBe("object");
  }
}

describe("POST /api/projects/:id/versions", () => {
  it("records the room's files, materialising first, and answers the version with its label", async () => {
    const w = await setup();
    // A change the room holds and the store does not yet: a version must hold it.
    await w.h.rooms.push(w.id, { files: { "notes.md": "# notes, edited\n" } });
    expect(await w.h.store.projectFiles(w.id)).toEqual(
      new Map([
        ["a.meltemi", sha("one\n")],
        ["notes.md", sha("# notes\n")],
      ]),
    );

    const response = await make(w, { label: "Before the review" });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({
      number: 1,
      label: "Before the review",
      auto: false,
      created_at: at(0),
      created_by: ANA,
      changed: ["a.meltemi", "notes.md"],
    });
    expect(await w.h.store.versionFiles(w.id, 1)).toEqual(
      new Map([
        ["a.meltemi", sha("one\n")],
        ["notes.md", sha("# notes, edited\n")],
      ]),
    );
  });

  it("numbers the versions from 1 and lists, for each, what changed since the one before", async () => {
    const w = await setup();
    await make(w);
    await w.h.rooms.push(w.id, {
      files: { "a.meltemi": "one, edited\n", "new.md": "new\n", "notes.md": null },
    });

    const response = await make(w, { label: "Second" });

    expect(await jsonOf<VersionBody>(response)).toMatchObject({
      number: 2,
      label: "Second",
      // Changed, added and removed, in binary order.
      changed: ["a.meltemi", "new.md", "notes.md"],
    });
    // Nothing changed since: no path.
    expect((await jsonOf<VersionBody>(await make(w))).changed).toEqual([]);
  });

  it("trims a label and reads none, an empty one and null as a version with no label", async () => {
    const w = await setup();
    expect((await jsonOf<VersionBody>(await make(w, { label: "  spaced  " }))).label).toBe(
      "spaced",
    );
    for (const body of [{}, { label: "" }, { label: "   " }, { label: null }]) {
      const made = await jsonOf<VersionBody>(await make(w, body));
      expect(made.label, JSON.stringify(body)).toBeNull();
      expect(made.auto).toBe(false);
    }
    // No body at all is no label either.
    const bare = await w.send(ANA, "POST", url(w.id));
    expect(bare.status).toBe(201);
    expect((await jsonOf<VersionBody>(bare)).label).toBeNull();
  });

  it("takes a label of 80 characters and refuses 81, counting characters and not UTF-16 units", async () => {
    const w = await setup();
    expect((await make(w, { label: "a".repeat(80) })).status).toBe(201);
    w.h.clock.advance(2 * MINUTE);
    const emoji = "\u{1F600}".repeat(80);
    expect((await jsonOf<VersionBody>(await make(w, { label: emoji }))).label).toBe(emoji);

    for (const label of ["a".repeat(81), "\u{1F600}".repeat(81)]) {
      const refused = await make(w, { label });
      expect(refused.status).toBe(400);
      expect(await codeOf(refused)).toBe("request.invalid");
    }
    expect(await w.h.store.countVersions(w.id)).toBe(2);
  });

  it("refuses a label that is not text or cannot be shown, and a body that is not a JSON object", async () => {
    const w = await setup();
    const bodies: [string, BodyInit][] = [
      ["a number", JSON.stringify({ label: 1 })],
      ["a list", JSON.stringify({ label: ["a"] })],
      ["a control character", JSON.stringify({ label: "a\u0000b" })],
      ["a line break", JSON.stringify({ label: "a\nb" })],
      ["text", "not json"],
      ["a list of labels", JSON.stringify(["a"])],
      ["a body over 8 KiB", JSON.stringify({ label: "a", pad: "x".repeat(9 * 1024) })],
    ];
    for (const [name, body] of bodies) {
      const refused = await w.send(ANA, "POST", url(w.id), body, JSON_TYPE);
      expect(refused.status, name).toBe(400);
      expect(await codeOf(refused), name).toBe("request.invalid");
    }
    expect(await w.h.store.countVersions(w.id)).toBe(0);
  });

  it("is the owner's alone on a private project: another person's request, an anonymous one and one from another page are refused", async () => {
    const w = await setup();
    await make(w, { label: "Ana's" });

    const beto = await w.sendJson(BETO, "POST", url(w.id), { label: "mine now" });
    expect(beto.status).toBe(404);
    expect(await codeOf(beto)).toBe("project.not-found");

    const anonymous = await w.h.request(url(w.id), {
      method: "POST",
      headers: JSON_TYPE,
      body: "{}",
    });
    // Not 401: nobody learns that a private project exists.
    expect(anonymous.status).toBe(404);
    expect(await codeOf(anonymous)).toBe("project.not-found");

    // A cookie from a page that is not the service's: the Origin rule, before the route runs.
    const { cookie } = await w.h.signedIn({ sub: ANA });
    const forged = await w.h.request(url(w.id), {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example", ...JSON_TYPE },
      body: "{}",
    });
    expect(forged.status).toBe(403);
    expect(await codeOf(forged)).toBe("request.forbidden");
    // Only Ana's own request made a version.
    expect(await w.h.store.countVersions(w.id)).toBe(1);
  });

  it("takes a bearer token, which needs no Origin", async () => {
    const w = await setup();
    const { token } = await addToken(w.h.store, { sub: ANA });

    const response = await w.h.request(
      url(w.id),
      bearer(token, { method: "POST", headers: JSON_TYPE, body: JSON.stringify({ label: "cli" }) }),
    );

    expect(response.status).toBe(201);
    expect(await jsonOf<VersionBody>(response)).toMatchObject({ label: "cli", created_by: ANA });
  });

  it("answers project.not-found for a project that does not exist or cannot be one", async () => {
    const w = await setup();
    for (const id of ["nosuchproject0000000x", "not-an-id"]) {
      const response = await w.sendJson(ANA, "POST", url(id), {});
      expect(response.status, id).toBe(404);
      expect(await codeOf(response), id).toBe("project.not-found");
    }
  });

  it("answers 413 quota.versions for the 201st, and records nothing", async () => {
    const w = await setup();
    await seed(w.h.store, w.id, CLOUD_LIMITS.versions - 1, (i) => ({
      label: `v${i}`,
      createdAt: at(-10, i),
    }));

    // The 200th is made...
    const last = await make(w, { label: "the 200th" });
    expect(last.status).toBe(201);
    expect((await jsonOf<VersionBody>(last)).number).toBe(200);
    // ...and the 201st, whether named or not, is not.
    for (const body of [{}, { label: "the 201st" }]) {
      const refused = await make(w, body);
      expect(refused.status).toBe(413);
      expect(await codeOf(refused)).toBe("quota.versions");
    }
    expect(await w.h.store.countVersions(w.id)).toBe(200);
  });

  it("answers 429 versions.rate for the seventh version of a minute, and records nothing", async () => {
    const w = await setup();
    for (let i = 1; i <= 6; i++) expect((await make(w)).status, `#${i}`).toBe(201);

    const seventh = await make(w);

    expect(seventh.status).toBe(429);
    expect(await codeOf(seventh)).toBe("versions.rate");
    expect(seventh.headers.get("Retry-After")).toBe("60");
    expect(await w.h.store.countVersions(w.id)).toBe(6);
    // Another project of the same person has its own minute.
    const other = await w.create(ANA, { name: "Other", files: { "x.md": "x" } });
    expect((await make(w, {}, other)).status).toBe(201);
    // A minute on, the first six are out of the window.
    w.h.clock.advance(61_000);
    expect((await make(w)).status).toBe(201);
  });

  it("lets the oldest unlabelled version go when a new one makes 101, and keeps the named one", async () => {
    const w = await setup();
    await seed(w.h.store, w.id, 1, () => ({ label: "v1", createdAt: at(-20) }));
    await seed(w.h.store, w.id, 100, (i) => ({ label: null, createdAt: at(-10, i) }));
    const before = (await listed(w)).map((v) => v.number);
    expect(before).toHaveLength(101);

    const made = await make(w);

    expect(made.status).toBe(201);
    const after = await listed(w);
    expect(after).toHaveLength(101);
    // v1 stays; the oldest of the hundred (number 2) is gone; the new one is the newest.
    expect(after.at(-1)).toMatchObject({ number: 1, label: "v1" });
    expect(after.map((v) => v.number)).not.toContain(2);
    // A version thinned away is a version nobody has: it is not read, and not restored.
    for (const rest of ["/2", "/2/restore"]) {
      const gone = await w.send(ANA, rest.endsWith("restore") ? "POST" : "GET", url(w.id, rest));
      expect(gone.status, rest).toBe(404);
      expect(await codeOf(gone), rest).toBe("version.not-found");
    }
    expect(after[0]?.number).toBe(102);
  });

  it("deletes no version for a request the rate refuses, though the project is full and thinning could make room", async () => {
    const w = await setup();
    await seed(w.h.store, w.id, 100, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));
    await seed(w.h.store, w.id, 94, (i) => ({ label: null, createdAt: at(-5, i) }));
    await seed(w.h.store, w.id, 6, () => ({ label: null, createdAt: at(0, -0.01) }));
    expect(await w.h.store.countVersions(w.id)).toBe(200);

    const refused = await make(w);

    expect(refused.status).toBe(429);
    expect(await w.h.store.countVersions(w.id)).toBe(200);
    expect((await listed(w)).map((v) => v.number)).toContain(101);
  });

  it("answers an internal error, and records nothing, when the room could not be materialised", async () => {
    const w = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await w.h.rooms.push(w.id, { files: { "fresh.md": "a text no bucket has yet\n" } });
    w.h.blobs.refuse = (op) => op === "put";

    const response = await make(w, { label: "lost" });

    expect(response.status).toBe(500);
    expect(await jsonOf(response)).toEqual({ code: "internal", message: "Something went wrong." });
    expect(await w.h.store.countVersions(w.id)).toBe(0);
    // The room is as it was, and the next version, once the bucket is back, holds the new file.
    w.h.blobs.refuse = undefined;
    expect((await make(w)).status).toBe(201);
    expect((await w.h.store.versionFiles(w.id, 1))?.has("fresh.md")).toBe(true);
  });

  it("keeps counting, in the person's usage, what a version holds and the project has dropped", async () => {
    const w = await setup();
    await make(w, { label: "with a.meltemi" });
    await w.h.rooms.push(w.id, { files: { "a.meltemi": null } });
    await w.h.rooms.materialise(w.id);

    // a.meltemi left the project and the version keeps it: its bytes are still the person's.
    expect((await w.h.store.projectFiles(w.id)).has("a.meltemi")).toBe(false);
    expect((await w.h.store.usage(ANA)).storageBytes).toBe(
      Buffer.byteLength("one\n") + Buffer.byteLength("# notes\n"),
    );
  });
});

describe("GET /api/projects/:id/versions", () => {
  it("lists nothing for a project with no version", async () => {
    const w = await setup();

    const response = await w.send(ANA, "GET", url(w.id));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ versions: [] });
  });

  it("lists the versions newest first, each with its label, kind, author and changed paths", async () => {
    const w = await setup();
    await make(w, { label: "first" });
    w.h.clock.advance(MINUTE);
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "one, edited\n" } });
    await make(w);

    const versions = await listed(w);

    expect(versions).toEqual([
      {
        number: 2,
        label: null,
        auto: false,
        created_at: new Date(START + MINUTE).toISOString(),
        created_by: ANA,
        changed: ["a.meltemi"],
      },
      {
        number: 1,
        label: "first",
        auto: false,
        created_at: at(0),
        created_by: ANA,
        changed: ["a.meltemi", "notes.md"],
      },
    ]);
  });

  it("is the owner's alone", async () => {
    const w = await setup();
    await make(w);

    const beto = await w.send(BETO, "GET", url(w.id));
    expect(beto.status).toBe(404);
    expect(await codeOf(beto)).toBe("project.not-found");
    const anonymous = await w.h.request(url(w.id));
    expect(anonymous.status).toBe(404);
    expect(await codeOf(anonymous)).toBe("project.not-found");
  });
});

describe("GET /api/projects/:id/versions/:n", () => {
  it("returns the version's texts by path, read from R2, and its images and fonts by hash", async () => {
    const w = await setup();
    const png = pngBytes();
    await w.send(ANA, "PUT", "/api/projects/" + w.id + "/binaries/assets/logo.png", png);
    await make(w, { label: "with a picture" });

    const response = await w.send(ANA, "GET", url(w.id, "/1"));

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      number: 1,
      label: "with a picture",
      auto: false,
      created_at: at(0),
      created_by: ANA,
      files: FILES,
      binaries: { "assets/logo.png": sha(png) },
    });
  });

  it("answers 404 version.not-found for a version the project does not hold, and for what cannot be one", async () => {
    const w = await setup();
    await make(w);
    for (const n of ["2", "99", "0", "-1", "abc", "1e0", "01", "1.5", "9999999999", "1%20"]) {
      const response = await w.send(ANA, "GET", url(w.id, `/${n}`));
      expect(response.status, n).toBe(404);
      expect(await codeOf(response), n).toBe("version.not-found");
    }
    // Another project's version 1 is not this project's.
    const other = await w.create(ANA, { name: "Other", files: { "x.md": "x" } });
    const answer = await w.send(ANA, "GET", url(other, "/1"));
    expect(answer.status).toBe(404);
    expect(await codeOf(answer)).toBe("version.not-found");
  });

  it("reads each distinct text once, and returns text exactly as it was written, a byte-order mark and non-ASCII characters included", async () => {
    const w = await setup();
    const odd = "﻿café — 日本語 \u{1F600}\r\nline two\n";
    await w.h.rooms.push(w.id, {
      files: { "bom.md": odd, "twin-a.md": "same\n", "twin-b.md": "same\n" },
    });
    await make(w);
    w.h.blobs.calls.length = 0;

    const body = await jsonOf<{ files: Record<string, string> }>(
      await w.send(ANA, "GET", url(w.id, "/1")),
    );

    expect(body.files["bom.md"]).toBe(odd);
    expect(body.files["twin-a.md"]).toBe("same\n");
    const reads = w.h.blobs.calls.filter((call) => call.op === "get").map((call) => call.key);
    expect(reads.filter((key) => key === blobKey(sha("same\n")))).toHaveLength(1);
    expect(new Set(reads).size).toBe(reads.length);
  });

  it("tells an uploaded SVG, which is a file the project holds by hash, from an SVG somebody typed", async () => {
    const w = await setup();
    const uploaded = svgOf(0, "<circle r='3'/>");
    const typed = svgOf(0, "<rect width='3' height='3'/>");
    await w.send(ANA, "PUT", `/api/projects/${w.id}/binaries/art/logo.svg`, uploaded);
    await w.h.rooms.push(w.id, { files: { "art/typed.svg": typed } });
    await make(w);

    const body = await jsonOf<{ files: Record<string, string>; binaries: Record<string, string> }>(
      await w.send(ANA, "GET", url(w.id, "/1")),
    );

    expect(body.binaries).toEqual({ "art/logo.svg": sha(uploaded) });
    expect(body.files["art/typed.svg"]).toBe(typed);
    expect(body.files).not.toHaveProperty("art/logo.svg");
  });

  it("still reads an image the project no longer holds as an image", async () => {
    const w = await setup();
    const png = pngBytes();
    await w.send(ANA, "PUT", `/api/projects/${w.id}/binaries/logo.png`, png);
    await make(w);
    await w.send(ANA, "DELETE", `/api/projects/${w.id}/binaries/logo.png`);
    expect(await w.h.store.projectBlobs(w.id)).toEqual([]);

    const body = await jsonOf<{ files: Record<string, string>; binaries: Record<string, string> }>(
      await w.send(ANA, "GET", url(w.id, "/1")),
    );

    expect(body.binaries).toEqual({ "logo.png": sha(png) });
    expect(Object.keys(body.files).sort()).toEqual(Object.keys(FILES).sort());
  });

  it("keeps a file called __proto__ a file", async () => {
    const w = await setup();
    // Parsed, so that `__proto__` is a key of the object and not its prototype.
    const files = JSON.parse('{"__proto__":"not a prototype\\n"}') as Record<string, string>;
    await w.h.rooms.push(w.id, { files });
    await make(w);

    const response = await w.send(ANA, "GET", url(w.id, "/1"));

    const text = await response.text();
    expect(text).toContain('"__proto__":"not a prototype\\n"');
  });

  it("answers an internal error, saying nothing, when a text's bytes are not in R2", async () => {
    const w = await setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await make(w);
    w.h.blobs.objects.delete(blobKey(sha("one\n")));

    const response = await w.send(ANA, "GET", url(w.id, "/1"));

    expect(response.status).toBe(500);
    expect(await jsonOf(response)).toEqual({ code: "internal", message: "Something went wrong." });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(sha("one\n"));
  });

  it("is the owner's alone", async () => {
    const w = await setup();
    await make(w);

    expect((await w.send(BETO, "GET", url(w.id, "/1"))).status).toBe(404);
    expect((await w.h.request(url(w.id, "/1"))).status).toBe(404);
  });
});

describe("POST /api/projects/:id/versions/:n/restore", () => {
  /** Version 1 holds FILES; the project then moves on to other files. */
  async function moved() {
    const w = await setup();
    await make(w, { label: "start" });
    w.h.clock.advance(2 * MINUTE);
    await w.h.rooms.push(w.id, {
      files: { "a.meltemi": "one, edited\n", "notes.md": null, "later.md": "later\n" },
    });
    return w;
  }

  it("makes the room hold the version's files, keeps the state before as an automatic version, and tells a connected client as a change from elsewhere", async () => {
    const w = await moved();
    const client = await w.h.rooms.room(w.id).open({ sub: ANA });
    await client.sync();
    const origins: unknown[] = [];
    client.doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const sentBefore = client.messages.length;
    const before = await w.h.rooms.read(w.id);

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await jsonOf<{ revision: number; restored: number; saved: VersionBody }>(response);
    // The room: the files of version 1, in one transaction.
    expect(body.revision).toBe(before.revision + 1);
    expect(body.restored).toBe(1);
    expect((await w.h.rooms.read(w.id)).files).toEqual(FILES);
    // The state before: the room's files of a moment ago, unlabelled and automatic, made by the person.
    expect(body.saved).toMatchObject({
      number: 2,
      label: null,
      auto: true,
      created_by: ANA,
      changed: ["a.meltemi", "later.md", "notes.md"],
    });
    expect(await w.h.store.versionFiles(w.id, 2)).toEqual(
      new Map([
        ["a.meltemi", sha("one, edited\n")],
        ["later.md", sha("later\n")],
      ]),
    );
    // The client heard one update, from the room, and sent nothing: a change from elsewhere.
    const arrived = client.messages.slice(sentBefore);
    expect(arrived.map((message) => message.kind)).toEqual([KIND.update]);
    expect(origins).toEqual(["room"]);
    expect(snapshot(client.doc).files).toEqual(FILES);
  });

  it("does not delete what people type while it runs: the state is recorded again with it, and the room applies the files on top of that", async () => {
    const w = await moved();
    const real = w.h.store.createVersion.bind(w.h.store);
    let typed = 0;
    vi.spyOn(w.h.store, "createVersion").mockImplementation(async (...args) => {
      // Somebody types in the room after it was materialised and before the restore is applied.
      if (typed++ === 0) await w.h.rooms.push(w.id, { files: { "typed.md": "typed meanwhile\n" } });
      return real(...args);
    });

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(200);
    const body = await jsonOf<{ saved: VersionBody }>(response);
    expect((await w.h.rooms.read(w.id)).files).toEqual(FILES);
    // The version of the state before holds what was typed; the one made first is as the room was.
    expect(body.saved.number).toBe(3);
    expect((await w.h.store.versionFiles(w.id, 3))?.get("typed.md")).toBe(sha("typed meanwhile\n"));
    expect((await w.h.store.versionFiles(w.id, 2))?.has("typed.md")).toBe(false);
    expect((await listed(w)).map((v) => [v.number, v.auto])).toEqual([
      [3, true],
      [2, true],
      [1, false],
    ]);
  });

  it("answers 409 revision.mismatch, and changes nothing, when the room keeps moving", async () => {
    const w = await moved();
    const real = w.h.store.createVersion.bind(w.h.store);
    let typed = 0;
    vi.spyOn(w.h.store, "createVersion").mockImplementation(async (...args) => {
      await w.h.rooms.push(w.id, { files: { [`typed-${++typed}.md`]: "typing\n" } });
      return real(...args);
    });

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect([response.status, await codeOf(response)]).toEqual([409, "revision.mismatch"]);
    // Three tries, each with the state it saw; the room still holds what people typed.
    expect(typed).toBe(3);
    const room = await w.h.rooms.read(w.id);
    expect(Object.keys(room.files).sort()).toEqual([
      "a.meltemi",
      "later.md",
      "typed-1.md",
      "typed-2.md",
      "typed-3.md",
    ]);
    expect(await jsonOf<{ revision: number }>(response.clone())).toMatchObject({
      revision: room.revision,
    });
  });

  it("lists the version of the state before, newest, beside the others", async () => {
    const w = await moved();
    await w.send(ANA, "POST", url(w.id, "/1/restore"));

    const versions = await listed(w);

    expect(versions.map((v) => [v.number, v.auto, v.label])).toEqual([
      [2, true, null],
      [1, false, "start"],
    ]);
  });

  it("holds, in that version, what the room had and the store had not yet", async () => {
    const w = await moved();
    // Nothing has materialised this change: only the room knows it.
    expect((await w.h.store.projectFiles(w.id)).has("later.md")).toBe(false);

    await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect((await w.h.store.versionFiles(w.id, 2))?.get("later.md")).toBe(sha("later\n"));
  });

  it("gives back an image the project has since deleted, as the project's own again", async () => {
    const w = await setup();
    const png = pngBytes();
    await w.send(ANA, "PUT", `/api/projects/${w.id}/binaries/assets/logo.png`, png);
    await make(w, { label: "with the logo" });
    await w.send(ANA, "DELETE", `/api/projects/${w.id}/binaries/assets/logo.png`);
    expect((await w.h.rooms.read(w.id)).binaries).toEqual({});
    expect(await w.h.store.projectBlobs(w.id)).toEqual([]);
    w.h.clock.advance(2 * MINUTE);

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(200);
    expect((await w.h.rooms.read(w.id)).binaries).toEqual({ "assets/logo.png": sha(png) });
    expect(await w.h.store.projectBlobs(w.id)).toEqual([sha(png)]);
    const blob = await w.send(ANA, "GET", `/api/projects/${w.id}/blobs/${sha(png)}`);
    expect(blob.status).toBe(200);
  });

  it("restores a text exactly, a byte-order mark included", async () => {
    const w = await setup();
    const odd = "﻿café — 日本語 \u{1F600}\r\n";
    await w.h.rooms.push(w.id, { files: { "bom.md": odd } });
    await make(w);
    w.h.clock.advance(2 * MINUTE);
    await w.h.rooms.push(w.id, { files: { "bom.md": "something else\n" } });

    await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect((await w.h.rooms.read(w.id)).files["bom.md"]).toBe(odd);
  });

  it("restores a version with no files: the room is empty afterwards", async () => {
    const w = await projects();
    const id = await w.create(ANA, { name: "Empty" });
    const empty = await w.sendJson(ANA, "POST", url(id), { label: "nothing yet" });
    expect(empty.status).toBe(201);
    await w.h.rooms.push(id, { files: { "a.md": "a" } });
    w.h.clock.advance(2 * MINUTE);

    const response = await w.send(ANA, "POST", url(id, "/1/restore"));

    expect(response.status).toBe(200);
    expect((await w.h.rooms.read(id)).files).toEqual({});
    expect(await w.h.store.versionFiles(id, 2)).toEqual(new Map([["a.md", sha("a")]]));
  });

  it("leaves out the loser of a path collision, which cannot be a file, and says so", async () => {
    const w = await setup();
    const room = w.h.rooms.room(w.id);
    const first = await room.open({ sub: ANA });
    const second = await room.open({ sub: ANA });
    await addText(first, A, "dup.md", "first\n");
    await addText(second, B, "dup.md", "second\n");
    const loser = `dup.md~${B}`;
    expect(Object.keys((await w.h.rooms.read(w.id)).files)).toContain(loser);
    await make(w, { label: "with a collision" });
    // The version shows both, as they were.
    const shown = await jsonOf<{ files: Record<string, string> }>(
      await w.send(ANA, "GET", url(w.id, "/1")),
    );
    expect(Object.keys(shown.files)).toContain(loser);
    w.h.clock.advance(2 * MINUTE);

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(200);
    expect((await jsonOf<{ skipped: string[] }>(response)).skipped).toEqual([loser]);
    const files = (await w.h.rooms.read(w.id)).files;
    expect(Object.keys(files)).not.toContain(loser);
    expect(files["dup.md"]).toBe("first\n");
  });

  it("answers 404 version.not-found for a version the project does not hold, and changes nothing", async () => {
    const w = await moved();
    const before = await w.h.rooms.read(w.id);

    for (const n of ["99", "0", "abc", "-1"]) {
      const response = await w.send(ANA, "POST", url(w.id, `/${n}/restore`));
      expect(response.status, n).toBe(404);
      expect(await codeOf(response), n).toBe("version.not-found");
    }

    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(1);
  });

  it("answers 413 quota.versions when the state before would be the 201st, and changes nothing", async () => {
    const w = await setup();
    await seed(w.h.store, w.id, CLOUD_LIMITS.versions, (i) => ({
      label: `v${i}`,
      createdAt: at(-10, i),
    }));
    await w.h.rooms.push(w.id, { files: { "later.md": "later\n" } });
    const before = await w.h.rooms.read(w.id);

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(413);
    expect(await codeOf(response)).toBe("quota.versions");
    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(200);
  });

  it("answers 429 versions.rate for a restore beyond six versions in a minute, and the state before counts as one", async () => {
    const w = await setup();
    for (let i = 0; i < 5; i++) await make(w);
    await w.h.rooms.push(w.id, { files: { "later.md": "later\n" } });
    const first = await w.send(ANA, "POST", url(w.id, "/1/restore"));
    expect(first.status).toBe(200);
    // Five versions and the state before the restore: six in the minute.
    expect(await w.h.store.countVersions(w.id)).toBe(6);
    await w.h.rooms.push(w.id, { files: { "again.md": "again\n" } });
    const before = await w.h.rooms.read(w.id);

    const second = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(second.status).toBe(429);
    expect(await codeOf(second)).toBe("versions.rate");
    expect(second.headers.get("Retry-After")).toBe("60");
    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(6);
  });

  it("restores the oldest unlabelled version of a project that is full, though recording the state before thins it away", async () => {
    const w = await setup();
    await seed(w.h.store, w.id, 100, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "the oldest\n" } });
    await w.h.rooms.materialise(w.id);
    await seed(w.h.store, w.id, 100, (i) => ({ label: null, createdAt: at(-5, i) }));
    const oldest = 101;
    expect((await w.h.store.versionFiles(w.id, oldest))?.get("a.meltemi")).toBe(
      sha("the oldest\n"),
    );
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "newer\n" } });

    const response = await w.send(ANA, "POST", url(w.id, `/${oldest}/restore`));

    expect(response.status).toBe(200);
    expect((await w.h.rooms.read(w.id)).files["a.meltemi"]).toBe("the oldest\n");
    // The version restored was the oldest of the hundred, and made way for the state before.
    expect(await w.h.store.version(w.id, oldest)).toBeUndefined();
    expect(await w.h.store.countVersions(w.id)).toBe(200);
  });

  it("changes nothing when the room cannot be materialised", async () => {
    const w = await moved();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = await w.h.rooms.read(w.id);
    w.h.blobs.refuse = (op) => op === "put";

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(500);
    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(1);
  });

  it("changes nothing when a text of the version is not in R2", async () => {
    const w = await moved();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = await w.h.rooms.read(w.id);
    w.h.blobs.objects.delete(blobKey(sha("# notes\n")));

    const response = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(response.status).toBe(500);
    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(1);
  });

  it("is the owner's alone, and needs the page's own Origin with a cookie", async () => {
    const w = await moved();
    const before = await w.h.rooms.read(w.id);

    const beto = await w.send(BETO, "POST", url(w.id, "/1/restore"));
    expect(beto.status).toBe(404);
    const anonymous = await w.h.request(url(w.id, "/1/restore"), { method: "POST" });
    expect(anonymous.status).toBe(404);
    const { cookie } = await w.h.signedIn({ sub: ANA });
    const noOrigin = await w.h.request(url(w.id, "/1/restore"), {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(noOrigin.status).toBe(403);

    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(await w.h.store.countVersions(w.id)).toBe(1);
  });

  it("restores twice: each restore keeps the state it replaced", async () => {
    const w = await moved();
    await w.send(ANA, "POST", url(w.id, "/1/restore"));
    w.h.clock.advance(2 * MINUTE);

    const again = await w.send(ANA, "POST", url(w.id, "/1/restore"));

    expect(again.status).toBe(200);
    // The second restore changed nothing: its state before is version 1's files.
    expect(await w.h.store.versionFiles(w.id, 3)).toEqual(await w.h.store.versionFiles(w.id, 1));
  });
});

describe("the daily version", () => {
  /** Ana's project, made at noon on the 14th; each test moves the clock on by days. */
  async function day() {
    return setup();
  }

  const versionsOf = (w: World) => w.h.store.listVersions(w.id);

  it("is not made on the day the project was created, however much it changes", async () => {
    const w = await day();
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "two\n" } });
    await w.h.rooms.materialise(w.id);
    w.h.clock.advance(11 * HOUR);
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "three\n" } });
    await w.h.rooms.materialise(w.id);

    expect(await versionsOf(w)).toEqual([]);
  });

  it("records one unlabelled automatic version at the first materialisation of a UTC day that changed the files", async () => {
    const w = await day();
    w.h.clock.advance(13 * HOUR);
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "two\n" } });
    await w.h.rooms.materialise(w.id);

    const [first] = await versionsOf(w);

    expect(first).toEqual({
      projectId: w.id,
      number: 1,
      label: null,
      auto: true,
      createdBy: ANA,
      createdAt: "2026-10-15T01:00:00.000Z",
    });
    expect(await w.h.store.versionFiles(w.id, 1)).toEqual(await w.h.store.projectFiles(w.id));
    expect((await w.h.store.versionFiles(w.id, 1))?.get("a.meltemi")).toBe(sha("two\n"));
  });

  it("is made once a day, however many times the project materialises", async () => {
    const w = await day();
    w.h.clock.advance(13 * HOUR);
    for (const text of ["two\n", "three\n", "four\n"]) {
      await w.h.rooms.push(w.id, { files: { "a.meltemi": text } });
      await w.h.rooms.materialise(w.id);
      w.h.clock.advance(HOUR);
    }
    expect(await versionsOf(w)).toHaveLength(1);

    // The next day, with a change, is the next version; with no change it is none.
    w.h.clock.advance(DAY);
    await w.h.rooms.materialise(w.id);
    expect(await versionsOf(w)).toHaveLength(1);
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "five\n" } });
    await w.h.rooms.materialise(w.id);
    const versions = await versionsOf(w);
    expect(versions.map((v) => [v.number, v.auto])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect((await w.h.store.versionFiles(w.id, 2))?.get("a.meltemi")).toBe(sha("five\n"));
  });

  it("is not made when the files are the latest version's, however the day turned", async () => {
    const w = await day();
    await make(w, { label: "the state now" });
    w.h.clock.advance(DAY);
    // A change and its undoing before the room materialises: the files are what they were.
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "two\n" } });
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "one\n" } });
    await w.h.rooms.materialise(w.id);

    expect(await versionsOf(w)).toHaveLength(1);
  });

  it("is not made on a day a version was already made, whoever made it", async () => {
    const w = await day();
    w.h.clock.advance(DAY);
    await make(w, { label: "named today" });
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "after the name\n" } });
    await w.h.rooms.materialise(w.id);

    expect((await versionsOf(w)).map((v) => v.label)).toEqual(["named today"]);
    // The next day it is: what was changed after the name is kept.
    w.h.clock.advance(DAY);
    await w.h.rooms.push(w.id, { files: { "a.meltemi": "the next day\n" } });
    await w.h.rooms.materialise(w.id);
    expect((await versionsOf(w)).map((v) => v.auto)).toEqual([false, true]);
  });

  it("counts its rows, the version's and one for each file, in what materialise reports", async () => {
    const w = await day();
    const context = { store: w.h.store, blobs: w.h.blobs, now: () => w.h.clock.now() };
    w.h.clock.advance(DAY);

    const result = await materialise(context, {
      projectId: w.id,
      revision: 5,
      files: { "a.meltemi": "next day\n", "notes.md": "# notes\n" },
      binaries: {},
    });

    // The blob and the file row that changed, the project's row, the usage; then the version and its two files.
    expect(result).toEqual({ rowsWritten: 1 + 1 + 0 + 1 + 1 + (1 + 2) });
  });

  it("is skipped, silently, when the project holds as many versions as it may", async () => {
    const w = await day();
    await seed(w.h.store, w.id, CLOUD_LIMITS.versions, (i) => ({
      label: `v${i}`,
      createdAt: at(-10, i),
    }));
    w.h.clock.advance(DAY);

    await w.h.rooms.push(w.id, { files: { "a.meltemi": "two\n" } });
    await w.h.rooms.materialise(w.id);

    expect(await w.h.store.countVersions(w.id)).toBe(200);
    expect(w.h.rooms.room(w.id).core.stats().materialiseFailures).toBe(0);
    // The files were materialised all the same.
    expect((await w.h.store.projectFiles(w.id)).get("a.meltemi")).toBe(sha("two\n"));
  });

  it("never reaches the room: a failure to record it leaves the materialisation done and the room undisturbed", async () => {
    const w = await day();
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(w.h.store, "createVersion").mockRejectedValue(new Error("D1 is unavailable"));
    w.h.clock.advance(DAY);

    await w.h.rooms.push(w.id, { files: { "a.meltemi": "two\n" } });
    await w.h.rooms.materialise(w.id);

    expect(w.h.rooms.room(w.id).core.stats()).toMatchObject({ materialiseFailures: 0 });
    expect((await w.h.store.projectFiles(w.id)).get("a.meltemi")).toBe(sha("two\n"));
    expect((await w.h.store.project(ANA, w.id))?.revision).toBe(2);
    expect(await w.h.store.countVersions(w.id)).toBe(0);
    expect(warned).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warned.mock.calls)).not.toContain("D1 is unavailable");
  });

  it("is made by the room's own trigger, thirty seconds after the last change, over a night", async () => {
    const w = await day();
    const client = await w.h.rooms.room(w.id).open({ sub: ANA });
    await w.h.rooms.advance(13 * HOUR);
    await addText(client, A, "overnight.md", "typed after midnight\n");

    await w.h.rooms.advance(31_000);
    for (let tries = 0; tries < 500 && (await versionsOf(w)).length === 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const [version] = await versionsOf(w);
    expect(version).toMatchObject({ number: 1, auto: true, label: null, createdBy: ANA });
    expect((await w.h.store.versionFiles(w.id, 1))?.has("overnight.md")).toBe(true);
  });

  it("makes a version of an empty project the first day it has a file, and none while it has none", async () => {
    const w = await projects();
    const id = await w.create(ANA, { name: "Empty" });
    w.h.clock.advance(DAY);
    await w.h.rooms.materialise(id);
    expect(await w.h.store.countVersions(id)).toBe(0);

    await w.h.rooms.push(id, { files: { "first.md": "first\n" } });
    await w.h.rooms.materialise(id);

    expect(await w.h.store.countVersions(id)).toBe(1);
    expect(snapshotFiles(await w.h.store.versionFiles(id, 1))).toEqual({
      "first.md": sha("first\n"),
    });
  });

  it("thins like any version: after a hundred and one days only a week's one of the old days is left", async () => {
    const w = await day();
    for (let n = 1; n <= 101; n++) {
      w.h.clock.advance(DAY);
      await w.h.rooms.push(w.id, { files: { "a.meltemi": `day ${n}\n` } });
      await w.h.rooms.materialise(w.id);
    }

    const versions = await versionsOf(w);

    // The days older than thirty keep one a week, and the last thirty all of them: far fewer than a hundred.
    expect(versions.length).toBeLessThan(CLOUD_LIMITS.unlabelledVersions);
    expect(versions.at(-1)?.number).toBe(101);
    expect(versions.every((v) => v.auto)).toBe(true);
  });
});

function snapshotFiles(files: ReadonlyMap<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(files ?? []);
}
