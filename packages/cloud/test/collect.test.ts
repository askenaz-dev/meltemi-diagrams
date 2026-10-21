// The weekly collection of blobs (`cloud-projects`, "Usage and storage quota" and "Deleting the
// account deletes its projects"; task 2.6): what nothing references and is older than seven days goes,
// the row first and the bytes second, and an object no row names goes too. Over both stores with a
// bucket in memory and a clock the test turns; then the cascade followed by a collection, the
// `scheduled` handler of the Worker, the development route, and `wrangler.jsonc`.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COLLECT_AFTER_MS, collectBlobs } from "../src/collect.js";
import type { Env } from "../src/env.js";
import { blobKey, thumbnailKey } from "../src/keys.js";
import { d1Store } from "../src/store/d1.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore } from "../src/store/types.js";
import worker from "../src/worker-handler.js";
import { fakeClock, fakeR2, jsonOf, testEnv } from "./support/index.js";
import { DAY, JSON_TYPE, T, codeOf, pngBytes, projects, sha } from "./support/projects.js";
import { openDatabase, sqliteAvailable } from "./support/sqlite.js";
import { devVariant } from "./support/who.js";

const ANA = "u-ana";
const BETO = "u-beto";
const OWNER = ANA;
const ID = "ana00000000000000001";
const START = Date.parse(T);

afterEach(() => {
  vi.restoreAllMocks();
});

const stores: [string, () => CloudStore][] = [["the in-memory store", () => memoryStore()]];
if (sqliteAvailable) {
  stores.push(["d1Store on the real migration", () => d1Store(openDatabase())]);
}

/** A store with Ana and one project of hers, a bucket and a clock, as the collection sees them. */
async function bed(make: () => CloudStore) {
  const clock = fakeClock(T);
  const store = make();
  const blobs = fakeR2(() => clock.now());
  await store.upsertUser(
    { sub: OWNER, name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
    T,
  );
  expect(
    await store.createProject(
      { id: ID, ownerSub: OWNER, name: "P", description: "", createdAt: T },
      100,
    ),
  ).toBe("created");
  const context = () => ({ store, blobs, now: () => clock.now() });
  const ago = (ms: number): string => new Date(clock.now().getTime() - ms).toISOString();

  /** A blob row and its object, made `ageMs` ago. */
  const blob = async (name: string, ageMs: number, size = 10): Promise<string> => {
    const hash = sha(name);
    await store.addBlobs([{ hash, size, mediaType: "text/plain" }], ago(ageMs));
    await blobs.put(blobKey(hash), name);
    blobs.uploaded.set(blobKey(hash), new Date(clock.now().getTime() - ageMs));
    return hash;
  };
  /** An object nobody has a row for, written `ageMs` ago. */
  const orphan = async (key: string, ageMs: number): Promise<void> => {
    await blobs.put(key, "no row names me");
    blobs.uploaded.set(key, new Date(clock.now().getTime() - ageMs));
  };
  const rowExists = async (hash: string): Promise<boolean> =>
    (await store.blob(hash)) !== undefined;
  return { clock, store, blobs, context, blob, orphan, rowExists, ago };
}

describe.each(stores)("collectBlobs over %s", (_name, make) => {
  it("removes only what nothing references and is older than seven days, rows and objects", async () => {
    const b = await bed(make);
    const old = 30 * DAY;
    const filed = await b.blob("a text in a project's files", old);
    const uploaded = await b.blob("an image a project uploaded", old);
    const versioned = await b.blob("a text only a version holds", old);
    const dead = await b.blob("nothing references this", 8 * DAY);
    const justOver = await b.blob("a hair over seven days", COLLECT_AFTER_MS + 1);
    const exactly = await b.blob("exactly seven days", COLLECT_AFTER_MS);
    const young = await b.blob("six days old", 6 * DAY);
    await b.store.addProjectBlob(ID, uploaded);
    await b.store.applyMaterialisation({
      projectId: ID,
      upserts: new Map([
        ["a.md", filed],
        ["v.md", versioned],
      ]),
      deletes: [],
      blobs: [],
      revision: 1,
      now: T,
    });
    expect(
      typeof (await b.store.createVersion(
        { projectId: ID, label: "v", auto: false, createdBy: OWNER, createdAt: T },
        { maxVersions: 200 },
      )),
    ).toBe("object");
    await b.store.applyMaterialisation({
      projectId: ID,
      upserts: new Map(),
      deletes: ["v.md"],
      blobs: [],
      revision: 2,
      now: T,
    });

    const result = await collectBlobs(b.context());

    expect(result).toEqual({ rows: 2, objects: 2, orphans: 0, failures: 0, truncated: false });
    for (const hash of [dead, justOver]) {
      expect(await b.rowExists(hash), hash).toBe(false);
      expect(b.blobs.objects.has(blobKey(hash)), hash).toBe(false);
    }
    // Referenced by a file, an upload or a version, or not old enough: kept, bytes and all.
    for (const hash of [filed, uploaded, versioned, exactly, young]) {
      expect(await b.rowExists(hash), hash).toBe(true);
      expect(b.blobs.objects.has(blobKey(hash)), hash).toBe(true);
    }
  });

  it("collects what has become old since: the same blob is kept one week and taken the next", async () => {
    const b = await bed(make);
    const hash = await b.blob("unreferenced for a while", 5 * DAY);
    expect((await collectBlobs(b.context())).rows).toBe(0);

    b.clock.advance(3 * DAY);
    const result = await collectBlobs(b.context());

    expect(result.rows).toBe(1);
    expect(await b.rowExists(hash)).toBe(false);
    expect(b.blobs.objects.has(blobKey(hash))).toBe(false);
  });

  it("removes the row first: an object it cannot delete is counted, and the next run takes it as an orphan", async () => {
    const b = await bed(make);
    const hash = await b.blob("stuck in R2", 9 * DAY);
    b.blobs.refuse = (op, key) => op === "delete" && key === blobKey(hash);

    const first = await collectBlobs(b.context());

    expect(first).toEqual({ rows: 1, objects: 0, orphans: 0, failures: 1, truncated: false });
    // A row never outlives its bytes' need: the row is gone, the object waits.
    expect(await b.rowExists(hash)).toBe(false);
    expect(b.blobs.objects.has(blobKey(hash))).toBe(true);

    b.blobs.refuse = undefined;
    const second = await collectBlobs(b.context());

    expect(second).toEqual({ rows: 0, objects: 0, orphans: 1, failures: 0, truncated: false });
    expect(b.blobs.objects.has(blobKey(hash))).toBe(false);
  });

  it("takes an object that no row names once it is old, and leaves everything else in the bucket alone", async () => {
    const b = await bed(make);
    const named = await b.blob("a blob with a row", 30 * DAY);
    await b.store.addProjectBlob(ID, named);
    const lost = sha("put to R2 and never registered");
    const fresh = sha("put a moment ago, its batch is on its way");
    await b.orphan(blobKey(lost), 8 * DAY);
    await b.orphan(blobKey(fresh), 60_000);
    await b.orphan("blobs/not-a-hash", 30 * DAY);
    await b.orphan(`blobs/${"G".repeat(64)}`, 30 * DAY);
    await b.orphan(thumbnailKey(ID), 30 * DAY);
    await b.orphan("elsewhere/object", 30 * DAY);
    // A key of the same length as a blob's, with a hash after it: not a blob.
    const lookalike = `other/${sha("a hash under another prefix")}`;
    await b.orphan(lookalike, 30 * DAY);

    const result = await collectBlobs(b.context());

    expect(result).toEqual({ rows: 0, objects: 0, orphans: 1, failures: 0, truncated: false });
    expect(b.blobs.keys()).toEqual(
      [
        blobKey(named),
        blobKey(fresh),
        "blobs/not-a-hash",
        `blobs/${"G".repeat(64)}`,
        thumbnailKey(ID),
        "elsewhere/object",
        lookalike,
      ].sort(),
    );
  });

  it("is a no-op for a bucket and a store that hold nothing old and unreferenced", async () => {
    const b = await bed(make);
    const kept = await b.blob("referenced", 30 * DAY);
    await b.store.addProjectBlob(ID, kept);

    expect(await collectBlobs(b.context())).toEqual({
      rows: 0,
      objects: 0,
      orphans: 0,
      failures: 0,
      truncated: false,
    });
    expect(b.blobs.calls.filter((call) => call.op === "delete")).toEqual([]);
  });

  it("takes a younger blob when told to: the development route narrows the age", async () => {
    const b = await bed(make);
    const hash = await b.blob("a minute old", 60_000);

    const result = await collectBlobs(b.context(), { olderThanMs: 0 });

    expect(result.rows).toBe(1);
    expect(await b.rowExists(hash)).toBe(false);
  });

  it("keeps a blob that is referenced again between the list and the delete", async () => {
    const b = await bed(make);
    const hash = await b.blob("referenced just in time", 30 * DAY);
    const stale = { ...b.store, unreferencedBlobs: async () => [hash] };
    await b.store.addProjectBlob(ID, hash);

    const result = await collectBlobs({ ...b.context(), store: stale });

    expect(result).toMatchObject({ rows: 0, objects: 0, orphans: 0 });
    expect(await b.rowExists(hash)).toBe(true);
    expect(b.blobs.objects.has(blobKey(hash))).toBe(true);
  });

  it("keeps a blob that is registered again between the list and the delete", async () => {
    const b = await bed(make);
    const hash = await b.blob("uploaded again", 30 * DAY);
    const racing: CloudStore = {
      ...b.store,
      unreferencedBlobs: async (olderThan, limit) => {
        const listed = await b.store.unreferencedBlobs(olderThan, limit);
        // An upload of the same bytes lands now: the row is as new as the clock says.
        await b.store.addBlobs(
          [{ hash, size: 10, mediaType: "text/plain" }],
          b.clock.now().toISOString(),
        );
        return listed;
      },
    };

    const result = await collectBlobs({ ...b.context(), store: racing });

    expect(result.rows).toBe(0);
    expect(await b.rowExists(hash)).toBe(true);
    expect(b.blobs.objects.has(blobKey(hash))).toBe(true);
  });

  it("keeps the object of a blob whose bytes are put and registered again after its row was removed: a row never ends up without bytes", async () => {
    const b = await bed(make);
    const hash = await b.blob("written again", 30 * DAY);
    const racing: CloudStore = {
      ...b.store,
      deleteBlobs: async (hashes, olderThan) => {
        const removed = await b.store.deleteBlobs(hashes, olderThan);
        // An upload of the same bytes lands now: R2 first, which makes the object as new as the
        // clock says, and then the row, which the removal has left room for.
        await b.blobs.put(blobKey(hash), "written again");
        await b.store.addBlobs(
          [{ hash, size: 10, mediaType: "text/plain" }],
          b.clock.now().toISOString(),
        );
        return removed;
      },
    };

    const result = await collectBlobs({ ...b.context(), store: racing });

    expect(result).toMatchObject({ rows: 1, objects: 0, failures: 0 });
    expect(b.blobs.objects.has(blobKey(hash))).toBe(true);
    expect(await b.rowExists(hash)).toBe(true);
  });

  it("goes on in rounds until nothing is left: 1200 blobs are three rounds of 500", async () => {
    const b = await bed(make);
    const hashes = Array.from({ length: 1200 }, (_, i) => sha(`dead ${i}`));
    await b.store.addBlobs(
      hashes.map((hash) => ({ hash, size: 10, mediaType: "text/plain" })),
      b.ago(9 * DAY),
    );
    for (const hash of hashes) {
      await b.blobs.put(blobKey(hash), "x");
      b.blobs.uploaded.set(blobKey(hash), new Date(START - 9 * DAY));
    }
    const lists = vi.spyOn(b.store, "unreferencedBlobs");

    const result = await collectBlobs(b.context());

    expect(result).toEqual({
      rows: 1200,
      objects: 1200,
      orphans: 0,
      failures: 0,
      truncated: false,
    });
    expect(b.blobs.keys()).toEqual([]);
    // Three rounds that found work and a fourth that found none.
    expect(lists).toHaveBeenCalledTimes(4);
    expect(lists.mock.calls.every((call) => call[1] === 500)).toBe(true);
  });

  it("ends the run with the store's error, and the next run finishes", async () => {
    const b = await bed(make);
    const hash = await b.blob("collected next week", 9 * DAY);
    const broken: CloudStore = {
      ...b.store,
      unreferencedBlobs: async () => {
        throw new Error("D1 is unavailable");
      },
    };

    await expect(collectBlobs({ ...b.context(), store: broken })).rejects.toThrow(
      "D1 is unavailable",
    );

    expect(await b.rowExists(hash)).toBe(true);
    expect((await collectBlobs(b.context())).rows).toBe(1);
  });
});

describe("the bounds of one run", () => {
  it("takes 10000 blobs and says there is more, and the next run takes the rest", async () => {
    const b = await bed(() => memoryStore());
    const hashes = Array.from({ length: 10_001 }, (_, i) => sha(`dead ${i}`));
    await b.store.addBlobs(
      hashes.map((hash) => ({ hash, size: 1, mediaType: "text/plain" })),
      b.ago(9 * DAY),
    );

    const first = await collectBlobs(b.context());
    expect(first).toMatchObject({ rows: 10_000, truncated: true });
    const second = await collectBlobs(b.context());
    expect(second).toMatchObject({ rows: 1, truncated: false });
  });

  it("looks at 20000 objects for orphans and says there is more", async () => {
    const b = await bed(() => memoryStore());
    for (let i = 0; i < 20_001; i++) {
      const key = blobKey(sha(`orphan ${i}`));
      b.blobs.objects.set(key, new Uint8Array(1));
      b.blobs.uploaded.set(key, new Date(START - 9 * DAY));
    }

    const first = await collectBlobs(b.context());
    expect(first).toMatchObject({ rows: 0, orphans: 20_000, truncated: true });
    const second = await collectBlobs(b.context());
    expect(second).toMatchObject({ orphans: 1, truncated: false });
    expect(b.blobs.objects.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// A deleted account's projects, and then the collection

const sign = (body: string, secret: string): string =>
  `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("the cascade of a deleted account, and the collection that follows", () => {
  async function world(store?: CloudStore) {
    const p = await projects(store ? { store } : {});
    const { h } = p;
    const PNG = pngBytes("an image both accounts uploaded");
    const flow = await p.create(ANA, { name: "Flow", template: "flow" });
    const notes = await p.create(ANA, {
      name: "Notes",
      files: { "a.meltemi": "ana only\n", "shared.md": "the same text\n" },
    });
    const empty = await p.create(ANA, { name: "Empty" });
    const betos = await p.create(BETO, {
      name: "Beto's",
      files: { "shared.md": "the same text\n", "own.md": "beto only\n" },
    });
    for (const [who, id] of [
      [ANA, notes],
      [BETO, betos],
    ] as const) {
      expect((await p.send(who, "PUT", `/api/projects/${id}/binaries/img/p.png`, PNG)).status).toBe(
        200,
      );
    }
    // A version that holds a text nothing else does, and a thumbnail on each of Ana's projects.
    await p.sendJson(ANA, "POST", `/api/projects/${notes}/versions`, { label: "v1" });
    await h.rooms.push(notes, { files: { "a.meltemi": "ana only, edited\n" } });
    await h.rooms.materialise(notes);
    for (const id of [flow, notes, empty]) {
      h.blobs.objects.set(thumbnailKey(id), new TextEncoder().encode("<svg/>"));
      await h.store.setThumbnailAt(id, T);
    }
    const client = await h.rooms.room(notes).open({ sub: ANA });
    const event = (id: string) => {
      const body = JSON.stringify({ id, type: "user.deleted", sub: ANA, at: T });
      return h.request("/_identity/events", {
        method: "POST",
        headers: { ...JSON_TYPE, "Meltemi-Signature": sign(body, h.env.IDENTITY_EVENTS_SECRET) },
        body,
      });
    };
    return { p, h, flow, notes, empty, betos, client, PNG, event };
  }

  it("leaves no project, version, thumbnail or room of the person, and a later collection removes the blobs only they referenced", async () => {
    const { h, flow, notes, empty, betos, client, PNG, event } = await world();
    const anaOnly = sha("ana only\n");
    const edited = sha("ana only, edited\n");
    const shared = sha("the same text\n");
    const picture = sha(PNG);
    const flowTexts = [...(await h.store.projectFiles(flow)).values()];
    expect(flowTexts.length).toBeGreaterThan(0);
    // Version 1 of Ana's notes still holds the text she then edited.
    expect((await h.store.versionFiles(notes, 1))?.get("a.meltemi")).toBe(anaOnly);

    const response = await event("evt_1");

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    for (const id of [flow, notes, empty]) {
      expect(await h.store.project(ANA, id), id).toBeUndefined();
      expect((await h.store.projectFiles(id)).size, id).toBe(0);
      expect(await h.store.projectBlobs(id), id).toEqual([]);
      expect(await h.store.listVersions(id), id).toEqual([]);
      expect(h.blobs.objects.has(thumbnailKey(id)), id).toBe(false);
      expect(h.rooms.room(id).storage.destroyed, id).toBe(1);
    }
    expect(client.closed?.code).toBe(4404);
    // Nothing is collected by the event: the blobs wait, a week.
    for (const hash of [anaOnly, edited, shared, picture, ...flowTexts]) {
      expect(await h.store.blob(hash), hash).toBeDefined();
      expect(h.blobs.objects.has(blobKey(hash)), hash).toBe(true);
    }
    expect(
      await collectBlobs({ store: h.store, blobs: h.blobs, now: () => h.clock.now() }),
    ).toMatchObject({
      rows: 0,
    });

    h.clock.advance(8 * DAY);
    const result = await collectBlobs({ store: h.store, blobs: h.blobs, now: () => h.clock.now() });

    // The texts only Ana referenced (her own, the one a version held, the template's) are gone...
    for (const hash of [anaOnly, edited, ...flowTexts.filter((hash) => hash !== shared)]) {
      expect(await h.store.blob(hash), hash).toBeUndefined();
      expect(h.blobs.objects.has(blobKey(hash)), hash).toBe(false);
    }
    expect(result.rows).toBeGreaterThanOrEqual(2 + 1);
    // ...and what Beto's project references is not: a text and an image both of them had.
    for (const hash of [shared, picture, sha("beto only\n")]) {
      expect(await h.store.blob(hash), hash).toBeDefined();
      expect(h.blobs.objects.has(blobKey(hash)), hash).toBe(true);
    }
    expect((await h.rooms.read(betos)).files["shared.md"]).toBe("the same text\n");
    const kept = await h.request(`/api/projects/${betos}/blobs/${picture}`, {
      headers: { Cookie: (await h.signedIn({ sub: BETO })).cookie },
    });
    expect(kept.status).toBe(200);
    expect(new Uint8Array(await kept.arrayBuffer())).toEqual(PNG);
    // Beto's usage did not change by the collection.
    await h.store.refreshStorageBytes(BETO);
    expect((await h.store.usage(BETO)).storageBytes).toBe(
      Buffer.byteLength("the same text\n") + Buffer.byteLength("beto only\n") + PNG.length,
    );
  });

  it("keeps a blob another account references through the collection, whichever account is deleted", async () => {
    const { h, event, betos, PNG } = await world();
    await event("evt_1");
    h.clock.advance(30 * DAY);

    await collectBlobs({ store: h.store, blobs: h.blobs, now: () => h.clock.now() });
    // Collecting twice changes nothing more.
    const again = await collectBlobs({ store: h.store, blobs: h.blobs, now: () => h.clock.now() });

    expect(again).toEqual({ rows: 0, objects: 0, orphans: 0, failures: 0, truncated: false });
    expect(await h.store.blob(sha(PNG))).toBeDefined();
    expect((await h.store.projectFiles(betos)).size).toBeGreaterThan(0);
  });

  it.skipIf(!sqliteAvailable)(
    "does the same over d1Store, to the last row of the versions",
    async () => {
      const db = openDatabase();
      const { h, notes, event } = await world(d1Store(db));
      const count = (table: string): number =>
        Number((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
      expect(count("versions")).toBeGreaterThan(0);
      expect(count("version_files")).toBeGreaterThan(0);

      await event("evt_1");

      expect(count("projects")).toBe(1);
      // Ana's projects had every version of the database: none is left, with none of their files.
      expect(count("versions")).toBe(0);
      expect(count("version_files")).toBe(0);
      expect(count("project_blobs")).toBe(1);
      h.clock.advance(8 * DAY);
      const result = await collectBlobs({
        store: h.store,
        blobs: h.blobs,
        now: () => h.clock.now(),
      });

      expect(result.rows).toBeGreaterThan(0);
      expect((await h.store.listVersions(notes)).length).toBe(0);
      // What is left in the bucket is what Beto's one project and its image reference, and no more.
      const referenced = new Set([
        ...(db.raw.prepare("SELECT hash FROM project_files").all() as { hash: string }[]).map(
          (row) => row.hash,
        ),
        ...(db.raw.prepare("SELECT hash FROM project_blobs").all() as { hash: string }[]).map(
          (row) => row.hash,
        ),
      ]);
      expect(
        h.blobs
          .keys()
          .filter((key) => key.startsWith("blobs/"))
          .sort(),
      ).toEqual([...referenced].map(blobKey).sort());
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The cron and the development route

describe("the scheduled handler of the Worker", () => {
  it.skipIf(!sqliteAvailable)(
    "runs the collection with the Worker's own bindings: the database and the bucket",
    async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const blobs = fakeR2(() => new Date());
      await store.upsertUser(
        { sub: OWNER, name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
        T,
      );
      const old = sha("an old blob nobody references");
      // Created long ago in real time: the Worker's clock is the real one.
      await store.addBlobs(
        [{ hash: old, size: 5, mediaType: "text/plain" }],
        "2020-01-01T00:00:00.000Z",
      );
      await blobs.put(blobKey(old), "old");
      blobs.uploaded.set(blobKey(old), new Date("2020-01-01T00:00:00.000Z"));
      const young = sha("a blob made a moment ago");
      await store.addBlobs(
        [{ hash: young, size: 5, mediaType: "text/plain" }],
        new Date().toISOString(),
      );
      await blobs.put(blobKey(young), "young");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const env: Env = testEnv({ DB: db, BLOBS: blobs });

      await worker.scheduled({ scheduledTime: Date.now(), cron: "0 3 * * 0" }, env);

      expect(await store.blob(old)).toBeUndefined();
      expect(blobs.objects.has(blobKey(old))).toBe(false);
      expect(await store.blob(young)).toBeDefined();
      expect(blobs.objects.has(blobKey(young))).toBe(true);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toBe(
        "cloud: collection: 1 blobs removed, 1 objects deleted, 0 orphans",
      );
    },
  );

  it.skipIf(!sqliteAvailable)(
    "sweeps what expired, too, so that a deployment nobody approves, fails or publishes on keeps the records of a deletion for 31 days and not longer",
    async () => {
      const db = openDatabase();
      const store = d1Store(db);
      await store.applyUserDeleted("evt_old", "u-gone", "2020-01-01T00:00:00.000Z");
      await store.applyUserDeleted("evt_new", "u-recent", new Date().toISOString());
      expect(await store.deletedSince("u-gone", "2019-01-01T00:00:00.000Z")).toBe(true);
      vi.spyOn(console, "log").mockImplementation(() => {});

      await worker.scheduled(
        { scheduledTime: Date.now(), cron: "0 3 * * 0" },
        testEnv({ DB: db, BLOBS: fakeR2(() => new Date()) }),
      );

      expect(await store.deletedSince("u-gone", "2019-01-01T00:00:00.000Z")).toBe(false);
      // A record of the last 31 days stays: a session from before the deletion is still refused.
      expect(await store.deletedSince("u-recent", "2019-01-01T00:00:00.000Z")).toBe(true);
    },
  );

  it.skipIf(!sqliteAvailable)(
    "collects the blobs even when the sweep fails, and then ends with the error of the sweep",
    async () => {
      const db = openDatabase();
      const store = d1Store(db);
      const blobs = fakeR2(() => new Date());
      const old = sha("an old blob the sweep does not stop");
      await store.addBlobs(
        [{ hash: old, size: 5, mediaType: "text/plain" }],
        "2020-01-01T00:00:00.000Z",
      );
      await blobs.put(blobKey(old), "old");
      blobs.uploaded.set(blobKey(old), new Date("2020-01-01T00:00:00.000Z"));
      vi.spyOn(console, "log").mockImplementation(() => {});
      db.raw.exec("DROP TABLE cli_failures");

      await expect(
        worker.scheduled({ scheduledTime: Date.now() }, testEnv({ DB: db, BLOBS: blobs })),
      ).rejects.toThrow();

      expect(await store.blob(old)).toBeUndefined();
      expect(blobs.objects.has(blobKey(old))).toBe(false);
    },
  );

  it("lets a failure of the database end the run with its error", async () => {
    const env = testEnv();
    // `testEnv`'s database throws when it is touched: the run ends, and the platform logs the error.
    await expect(worker.scheduled({ scheduledTime: Date.now() }, env)).rejects.toThrow(
      "D1 is not available",
    );
  });

  it("is declared by wrangler.jsonc as a cron of Sundays at 03:00 UTC, without DEV or a key set", () => {
    const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    const config = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1")) as {
      triggers?: { crons?: string[] };
    };

    expect(config.triggers).toEqual({ crons: ["0 3 * * 0"] });
    expect(text).not.toMatch(/"(DEV|IDENTITY_JWKS)"\s*:/);
  });
});

describe("POST /api/dev/collect", () => {
  async function setup(dev: boolean) {
    const p = await projects();
    const { h } = p;
    const variant = dev ? devVariant(h) : { request: h.request, env: h.env };
    const hash = sha("a blob nothing references");
    await h.store.addBlobs([{ hash, size: 5, mediaType: "text/plain" }], T);
    await h.blobs.put(blobKey(hash), "x");
    const { cookie } = await h.signedIn({ sub: OWNER });
    /** `cookieValue` is the `Cookie` header sent, `null` for none; `origin` whether the page's own `Origin` goes with it. */
    const call = (init: RequestInit = {}, cookieValue: string | null = cookie, origin = true) =>
      variant.request("/api/dev/collect", {
        method: "POST",
        ...init,
        headers: {
          ...(cookieValue === null ? {} : { Cookie: cookieValue }),
          ...(origin ? { Origin: h.env.ORIGIN } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    return { h, hash, call };
  }

  it("is a 404, before anything else is looked at, anywhere but in development", async () => {
    const { h, hash, call } = await setup(false);

    for (const response of [await call(), await call({}, null)]) {
      expect(response.status).toBe(404);
      expect(await codeOf(response)).toBe("not-found");
    }
    h.clock.advance(30 * DAY);
    expect(
      (await call({ headers: JSON_TYPE, body: JSON.stringify({ olderThanDays: 0 }) })).status,
    ).toBe(404);
    expect(await h.store.blob(hash)).toBeDefined();
  });

  it("answers nobody a 401 in development, and takes any signed-in person", async () => {
    const { call } = await setup(true);

    expect((await call({}, null)).status).toBe(401);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      rows: 0,
      objects: 0,
      orphans: 0,
      failures: 0,
      truncated: false,
    });
  });

  it("needs the page's own Origin with a cookie, like every change", async () => {
    const { h, hash, call } = await setup(true);
    h.clock.advance(30 * DAY);

    const response = await call(
      { headers: JSON_TYPE, body: JSON.stringify({ olderThanDays: 0 }) },
      null,
      false,
    );
    expect(response.status).toBe(401);
    const { cookie } = await h.signedIn({ sub: OWNER });
    const noOrigin = await call({}, cookie, false);
    expect(noOrigin.status).toBe(403);
    expect(await codeOf(noOrigin)).toBe("request.forbidden");
    expect(await h.store.blob(hash)).toBeDefined();
  });

  it("collects after seven days by default, and at once with olderThanDays: 0", async () => {
    const { h, hash, call } = await setup(true);
    h.clock.advance(6 * DAY);
    expect((await jsonOf<{ rows: number }>(await call())).rows).toBe(0);
    expect(await h.store.blob(hash)).toBeDefined();

    const now = await call({ headers: JSON_TYPE, body: JSON.stringify({ olderThanDays: 0 }) });

    expect(await jsonOf(now)).toMatchObject({ rows: 1, objects: 1 });
    expect(await h.store.blob(hash)).toBeUndefined();
    expect(h.blobs.objects.has(blobKey(hash))).toBe(false);
  });

  it("refuses an age that is not a number of days from 0, and a body that is not an object", async () => {
    const { h, hash, call } = await setup(true);
    for (const body of [
      '{"olderThanDays":-1}',
      '{"olderThanDays":"0"}',
      '{"olderThanDays":null}',
      "[]",
      "nope",
    ]) {
      const response = await call({ headers: JSON_TYPE, body });
      expect(response.status, body).toBe(400);
      expect(await codeOf(response), body).toBe("request.invalid");
    }
    expect(await h.store.blob(hash)).toBeDefined();
  });
});
