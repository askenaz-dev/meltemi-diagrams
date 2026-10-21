// Materialisation to content-addressed files (`cloud-document`, "Materialisation to content-addressed
// files"; task 2.2): the diff against `project_files`, the R2 puts before the rows, one atomic batch,
// failure isolation, and the room's triggers (thirty seconds after the last change, the last client
// leaving) calling it. The logic runs over the in-memory store and over `d1Store` on the real
// migration (`node:sqlite`), with a bucket in memory that can be told to refuse a write.

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { utf8 } from "../src/crypto.js";
import { blobKey, materialise, sha256OfBytes, TEXT_MEDIA_TYPE } from "../src/materialise.js";
import type { MaterialiseInput } from "../src/materialise.js";
import { d1Store } from "../src/store/d1.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore } from "../src/store/types.js";
import { fakeClock, fakeR2, harness, type FakeR2 } from "./support/index.js";
import { A, PROJECT, addText, typeInto } from "./support/rooms.js";
import { dump, openDatabase, sqliteAvailable, type SqliteDb } from "./support/sqlite.js";

const T = "2026-10-14T12:00:00.000Z";
const OWNER = "u-ana";
const HASH_A = "a".repeat(64);

const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const FIVE: Record<string, string> = {
  "project.json": '{"name":"x"}\n',
  "diagrams/a.meltemi": "diagram a\n",
  "diagrams/b.meltemi": "diagram b\n",
  "models/m.meltemi": "model m\n",
  "notes.md": "# notes\n",
};

interface World {
  readonly store: CloudStore;
  readonly blobs: FakeR2;
  readonly clock: ReturnType<typeof fakeClock>;
  /** The context `materialise()` runs with. */
  context(): Parameters<typeof materialise>[0];
  run(
    files: Record<string, string>,
    revision: number,
    binaries?: Record<string, string>,
  ): ReturnType<typeof materialise>;
}

/** A store holding Ana and her project, an empty bucket and a clock. */
async function world(store: CloudStore): Promise<World> {
  const clock = fakeClock(T);
  const blobs = fakeR2();
  await store.upsertUser(
    { sub: OWNER, name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
    T,
  );
  await store.createProject(
    { id: PROJECT, ownerSub: OWNER, name: "P", description: "", createdAt: T },
    100,
  );
  const context = () => ({ store, blobs, now: () => clock.now() });
  return {
    store,
    blobs,
    clock,
    context,
    run: (files, revision, binaries = {}) =>
      materialise(context(), { projectId: PROJECT, revision, files, binaries }),
  };
}

/**
 * Waits, in real time, until something the fake clock cannot advance has happened: the digest of a
 * text is computed by the platform on its own thread, so a timer that fired may not have finished.
 */
async function waitFor(done: () => boolean): Promise<void> {
  for (let tries = 0; tries < 500 && !done(); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  expect(done()).toBe(true);
}

const rows = async (store: CloudStore): Promise<Record<string, string>> =>
  Object.fromEntries([...(await store.projectFiles(PROJECT))].sort());

describe("materialise (in-memory store)", () => {
  it("hashes the UTF-8 bytes of each text file with SHA-256 and puts them in R2 under blobs/<hash>", async () => {
    const w = await world(memoryStore());
    const text = "héllo — 日本\n";

    const result = await w.run({ "a.meltemi": text }, 1);

    expect(result).not.toBe("gone");
    const hash = sha(text);
    expect(await rows(w.store)).toEqual({ "a.meltemi": hash });
    expect(w.blobs.keys()).toEqual([`blobs/${hash}`]);
    expect(w.blobs.text(`blobs/${hash}`)).toBe(text);
    // The size is the bytes of the UTF-8 text, not its characters.
    expect(await w.store.blob(hash)).toMatchObject({
      hash,
      size: Buffer.byteLength(text, "utf8"),
      mediaType: TEXT_MEDIA_TYPE,
    });
    expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(text.length);
    expect(await sha256OfBytes(utf8(text))).toBe(hash);
    expect(blobKey(hash)).toBe(`blobs/${hash}`);
  });

  it("writes only the changed rows: five files, one edited, exactly one new blob and one project_files row", async () => {
    const w = await world(memoryStore());
    await w.run(FIVE, 1);
    expect(w.blobs.keys()).toHaveLength(5);
    const before = await rows(w.store);
    const apply = vi.spyOn(w.store, "applyMaterialisation");
    w.blobs.calls.length = 0;
    w.clock.advance(60_000);

    const result = await w.run({ ...FIVE, "diagrams/a.meltemi": "diagram a, edited\n" }, 2);

    expect(apply).toHaveBeenCalledTimes(1);
    const written = apply.mock.calls[0]?.[0];
    expect([...(written?.upserts ?? [])]).toEqual([
      ["diagrams/a.meltemi", sha("diagram a, edited\n")],
    ]);
    expect(written?.deletes).toEqual([]);
    expect(written?.blobs.map((blob) => blob.hash)).toEqual([sha("diagram a, edited\n")]);
    expect(written?.revision).toBe(2);
    expect(w.blobs.keys()).toHaveLength(6);
    expect(w.blobs.puts()).toEqual([`blobs/${sha("diagram a, edited\n")}`]);
    const after = await rows(w.store);
    for (const path of Object.keys(FIVE)) {
      if (path === "diagrams/a.meltemi") expect(after[path]).not.toBe(before[path]);
      else expect(after[path], path).toBe(before[path]);
    }
    // One blob row, one file row, the project's row and the person's usage.
    expect(result).toEqual({ rowsWritten: 4 });
  });

  it("counts every row of a first materialisation: the blobs, the paths, the project and the usage", async () => {
    const w = await world(memoryStore());

    expect(await w.run(FIVE, 1)).toEqual({ rowsWritten: 5 + 5 + 0 + 1 + 1 });
  });

  it("gives the same content the same hash and no second blob", async () => {
    const w = await world(memoryStore());

    await w.run({ "a.meltemi": "same\n", "b.meltemi": "same\n", "c.meltemi": "other\n" }, 1);

    const files = await rows(w.store);
    expect(files["a.meltemi"]).toBe(files["b.meltemi"]);
    expect(files["a.meltemi"]).not.toBe(files["c.meltemi"]);
    expect(w.blobs.keys()).toHaveLength(2);
    expect(w.blobs.puts()).toHaveLength(2);

    // Edited to what another file already says: the row changes, no blob is added.
    await w.run({ "a.meltemi": "same\n", "b.meltemi": "other\n", "c.meltemi": "other\n" }, 2);
    expect((await rows(w.store))["b.meltemi"]).toBe(files["c.meltemi"]);
    expect(w.blobs.keys()).toHaveLength(2);
  });

  it("puts to R2 a hash that another project already has a row for, and renews its row instead of writing a second", async () => {
    const store = memoryStore();
    const w = await world(store);
    await w.run({ "a.meltemi": "shared\n" }, 1);
    await store.createProject(
      { id: "otherproject0000000x", ownerSub: OWNER, name: "Q", description: "", createdAt: T },
      100,
    );
    const apply = vi.spyOn(store, "applyMaterialisation");

    await materialise(w.context(), {
      projectId: "otherproject0000000x",
      revision: 1,
      files: { "z.meltemi": "shared\n" },
      binaries: {},
    });

    // The put is idempotent and heals a missing object. The row is sent with the batch that gives
    // the path its hash: the store renews the row that is there, and there is still one.
    expect(w.blobs.puts().filter((key) => key === blobKey(sha("shared\n")))).toHaveLength(2);
    expect(apply.mock.calls[0]?.[0].blobs.map((blob) => blob.hash)).toEqual([sha("shared\n")]);
    expect(await store.projectFiles("otherproject0000000x")).toEqual(
      new Map([["z.meltemi", sha("shared\n")]]),
    );
    expect(await store.blob(sha("shared\n"))).toMatchObject({ hash: sha("shared\n") });
  });

  it("makes the blob a path now names as new as the batch that names it, and never lets the collection leave the path without a row", async () => {
    const store = memoryStore();
    const w = await world(store);
    // The text was a project's long ago and nothing references it now: the collection may take it.
    const old = new Date(Date.parse(T) - 30 * 24 * 60 * 60 * 1000).toISOString();
    await store.addBlobs(
      [{ hash: sha("back again\n"), size: 11, mediaType: TEXT_MEDIA_TYPE }],
      old,
    );
    const apply = store.applyMaterialisation.bind(store);
    vi.spyOn(store, "applyMaterialisation").mockImplementation(async (input) => {
      // The weekly collection takes the row between the moment the text is found to exist and the
      // moment the batch that references it is applied.
      const taken = await store.deleteBlobs([sha("back again\n")], T);
      expect(taken).toEqual([sha("back again\n")]);
      return apply(input);
    });

    await w.run({ "a.meltemi": "back again\n" }, 1);

    expect(await store.projectFiles(PROJECT)).toEqual(
      new Map([["a.meltemi", sha("back again\n")]]),
    );
    const row = await store.blob(sha("back again\n"));
    expect(row).toBeDefined();
    expect(row?.createdAt).toBe(T);
  });

  it("renews the time of a blob row it finds, so that the weekly collection does not take a text that was just wanted again", async () => {
    const store = memoryStore();
    const w = await world(store);
    const old = new Date(Date.parse(T) - 30 * 24 * 60 * 60 * 1000).toISOString();
    await store.addBlobs(
      [{ hash: sha("wanted again\n"), size: 13, mediaType: TEXT_MEDIA_TYPE }],
      old,
    );

    await w.run({ "a.meltemi": "wanted again\n" }, 1);

    expect((await store.blob(sha("wanted again\n")))?.createdAt).toBe(T);
  });

  it("writes no row and keeps the project's time when it is asked for the revision the project has: a person who only looked", async () => {
    const w = await world(memoryStore());
    await w.run(FIVE, 1);
    const first = await w.store.projectById(PROJECT);
    w.clock.advance(60_000);
    w.blobs.calls.length = 0;

    // A room built again over the document it had materialised, opened and closed.
    const again = await w.run(FIVE, 1);

    expect(again).toEqual({ rowsWritten: 0 });
    expect(await w.store.projectById(PROJECT)).toEqual(first);

    // The next change is a change.
    const changed = await w.run({ ...FIVE, "notes.md": "# edited\n" }, 2);
    expect(changed).toEqual({ rowsWritten: 4 });
    expect((await w.store.projectById(PROJECT))?.revision).toBe(2);
  });

  it("deletes only the paths that are gone", async () => {
    const w = await world(memoryStore());
    await w.run(FIVE, 1);
    const apply = vi.spyOn(w.store, "applyMaterialisation");
    w.blobs.calls.length = 0;
    const { "notes.md": _gone, ...rest } = FIVE;

    const result = await w.run(rest, 2);

    const written = apply.mock.calls[0]?.[0];
    expect(written?.deletes).toEqual(["notes.md"]);
    expect([...(written?.upserts ?? [])]).toEqual([]);
    expect(written?.blobs).toEqual([]);
    expect(w.blobs.puts()).toEqual([]);
    expect(Object.keys(await rows(w.store)).sort()).toEqual(Object.keys(rest).sort());
    // The blob stays: a version may hold it, and only the collection removes blobs.
    expect(w.blobs.keys()).toHaveLength(5);
    expect(result).toEqual({ rowsWritten: 0 + 0 + 1 + 1 + 1 });
  });

  it("records the images and fonts by the hash they were uploaded with, and puts nothing for them", async () => {
    const w = await world(memoryStore());

    await w.run({ "a.meltemi": "a\n" }, 1, { "assets/logo.png": HASH_A });

    expect(await rows(w.store)).toEqual({ "a.meltemi": sha("a\n"), "assets/logo.png": HASH_A });
    expect(w.blobs.keys()).toEqual([blobKey(sha("a\n"))]);
    // The binary's own row exists already (the upload made it): nothing here invents one.
    expect(await w.store.blob(HASH_A)).toBeUndefined();
  });

  it("follows a binary replaced by another and a path that becomes a binary", async () => {
    const w = await world(memoryStore());
    await w.run({ "x.svg": "<svg/>" }, 1, { "logo.png": HASH_A });

    await w.run({}, 2, { "logo.png": "b".repeat(64), "x.svg": HASH_A });

    expect(await rows(w.store)).toEqual({ "logo.png": "b".repeat(64), "x.svg": HASH_A });
  });

  it("records the revision and the time of an unchanged state, writing no file row and no usage", async () => {
    const w = await world(memoryStore());
    await w.run(FIVE, 1);
    const apply = vi.spyOn(w.store, "applyMaterialisation");
    const refresh = vi.spyOn(w.store, "refreshStorageBytes");
    w.clock.advance(5_000);

    const result = await w.run(FIVE, 2);

    expect(result).toEqual({ rowsWritten: 1 });
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ revision: 2, deletes: [], blobs: [] });
    expect([...(apply.mock.calls[0]?.[0].upserts ?? [])]).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
    const project = await w.store.project(OWNER, PROJECT);
    expect(project).toMatchObject({ revision: 2, updatedAt: "2026-10-14T12:00:05.000Z" });
  });

  it("brings the person's usage up to date: the distinct blobs their projects reference", async () => {
    const w = await world(memoryStore());

    await w.run({ "a.meltemi": "12345\n", "b.meltemi": "12345\n", "c.meltemi": "abc\n" }, 1);

    // "12345\n" (6 bytes) counts once, "abc\n" (4 bytes) once.
    expect((await w.store.usage(OWNER)).storageBytes).toBe(10);
  });

  it("answers gone for a project that does not exist, and writes nothing for it", async () => {
    const store = memoryStore();
    const w = await world(store);
    const input: MaterialiseInput = {
      projectId: "missingproject00000x",
      revision: 3,
      files: { "a.meltemi": "a\n" },
      binaries: {},
    };

    expect(await materialise(w.context(), input)).toBe("gone");

    expect((await store.projectFiles("missingproject00000x")).size).toBe(0);
    expect(await store.project(OWNER, "missingproject00000x")).toBeUndefined();
    // Nothing of the person's usage was touched either.
    expect((await store.usage(OWNER)).storageBytes).toBe(0);
  });

  it("answers gone for a project deleted while its bytes were being put, and leaves no file row", async () => {
    const store = memoryStore();
    const w = await world(store);
    const put = w.blobs.put.bind(w.blobs);
    w.blobs.put = async (key, value) => {
      await put(key, value);
      await store.deleteProject(OWNER, PROJECT);
    };

    expect(await w.run(FIVE, 1)).toBe("gone");

    expect((await store.projectFiles(PROJECT)).size).toBe(0);
    expect(await store.project(OWNER, PROJECT)).toBeUndefined();
    expect((await store.usage(OWNER)).storageBytes).toBe(0);
  });

  it("answers gone for a project that vanishes between its rows and the usage", async () => {
    const store = memoryStore();
    const w = await world(store);
    const owner = store.ownerOf.bind(store);
    store.ownerOf = async () => {
      await store.deleteProject(OWNER, PROJECT);
      return owner(PROJECT);
    };

    expect(await w.run({ "a.meltemi": "a\n" }, 1)).toBe("gone");
  });

  describe("when R2 refuses a write", () => {
    it("throws before D1 is touched: no row, no revision, the room's document is not involved", async () => {
      const store = memoryStore();
      const w = await world(store);
      await w.run({ "a.meltemi": "first\n" }, 1);
      const apply = vi.spyOn(store, "applyMaterialisation");
      const refresh = vi.spyOn(store, "refreshStorageBytes");
      w.blobs.refuse = (op) => op === "put";

      await expect(w.run({ "a.meltemi": "second\n", "b.meltemi": "new\n" }, 2)).rejects.toThrow(
        "R2 refused the write",
      );

      expect(apply).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(await rows(store)).toEqual({ "a.meltemi": sha("first\n") });
      expect(await store.blob(sha("second\n"))).toBeUndefined();
      expect((await store.project(OWNER, PROJECT))?.revision).toBe(1);
    });

    it("succeeds on the next try, with the same diff", async () => {
      const store = memoryStore();
      const w = await world(store);
      w.blobs.refuse = () => true;
      await expect(w.run(FIVE, 1)).rejects.toThrow();
      w.blobs.refuse = undefined;

      expect(await w.run(FIVE, 1)).toEqual({ rowsWritten: 12 });

      expect(Object.keys(await rows(store))).toHaveLength(5);
      expect(w.blobs.keys()).toHaveLength(5);
    });

    it("never writes a blob row for bytes that did not reach R2: a put that fails partway leaves rows for none", async () => {
      const store = memoryStore();
      const w = await world(store);
      let puts = 0;
      w.blobs.refuse = () => ++puts === 3;

      await expect(w.run(FIVE, 1)).rejects.toThrow();

      // The objects that made it have no blob row, so the collection can take them.
      for (const key of w.blobs.keys()) {
        expect(await store.blob(key.slice("blobs/".length)), key).toBeUndefined();
      }
      expect((await rows(store))["project.json"]).toBeUndefined();
    });
  });

  it("does not put the bytes of a hash the project already holds under another path", async () => {
    const w = await world(memoryStore());
    await w.run({ "a.meltemi": "same\n" }, 1);
    w.blobs.calls.length = 0;

    await w.run({ "a.meltemi": "same\n", "copy.meltemi": "same\n" }, 2);

    expect(w.blobs.puts()).toEqual([]);
    expect(Object.keys(await rows(w.store))).toEqual(["a.meltemi", "copy.meltemi"]);
  });

  it("keeps a collision loser's shown path as the path it is stored under", async () => {
    const w = await world(memoryStore());

    await w.run({ "a.meltemi": "one\n", "a.meltemi~bbbbbbbbbbbbbbbb": "two\n" }, 1);

    expect(Object.keys(await rows(w.store)).sort()).toEqual([
      "a.meltemi",
      "a.meltemi~bbbbbbbbbbbbbbbb",
    ]);
  });
});

describe.skipIf(!sqliteAvailable)("materialise (d1Store on the real migration)", () => {
  async function d1World(): Promise<World & { readonly db: SqliteDb }> {
    const db = openDatabase();
    const w = await world(d1Store(db));
    return { ...w, db };
  }

  /** The SQL of the statements run in the batch that wrote the last materialisation. */
  const lastBatch = (db: SqliteDb) => {
    const number = Math.max(...db.queries.map((query) => query.batch ?? 0));
    return db.queries.filter((query) => query.batch === number);
  };

  it("writes one new blob row and one project_files row for one edited file out of five", async () => {
    const w = await d1World();
    await w.run(FIVE, 1);
    const before = await rows(w.store);

    await w.run({ ...FIVE, "notes.md": "# notes, edited\n" }, 2);

    const batch = lastBatch(w.db);
    // One blob row (4 values), one file row (path, hash, project), the project's revision.
    const blobRows = batch.filter((query) => query.sql.startsWith("INSERT INTO blobs"));
    const fileRows = batch.filter((query) => query.sql.startsWith("INSERT INTO project_files"));
    expect(blobRows.map((query) => query.values)).toEqual([
      [sha("# notes, edited\n"), 16, TEXT_MEDIA_TYPE, T],
    ]);
    expect(fileRows.map((query) => query.values)).toEqual([
      ["notes.md", sha("# notes, edited\n"), PROJECT],
    ]);
    expect(batch.some((query) => query.sql.startsWith("DELETE FROM project_files"))).toBe(false);
    expect(batch.some((query) => query.sql.startsWith("UPDATE projects"))).toBe(true);

    const after = await rows(w.store);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const path of Object.keys(FIVE)) {
      if (path === "notes.md") expect(after[path]).toBe(sha("# notes, edited\n"));
      else expect(after[path], path).toBe(before[path]);
    }
    expect(
      w.db.raw.prepare("SELECT COUNT(*) AS n FROM blobs").get() as unknown as { n: number },
    ).toEqual({ n: 6 });
  });

  it("writes the whole diff in ONE batch, in statements of at most 100 parameters", async () => {
    const w = await d1World();
    const many = Object.fromEntries(
      Array.from({ length: 130 }, (_, i) => [`files/f${i}.meltemi`, `text ${i}\n`]),
    );

    const mark = w.db.queries.length;
    const result = await w.run(many, 1);

    // The adapter refuses a statement of more than 100 parameters, so success proves the chunking.
    expect(result).toEqual({ rowsWritten: 130 + 130 + 0 + 1 + 1 });
    const writes = w.db.queries
      .slice(mark)
      .filter((query) => /^(INSERT|DELETE|UPDATE)/.test(query.sql));
    const inBatch = writes.filter((query) => query.batch !== null);
    expect(
      inBatch.filter((query) => query.sql.startsWith("INSERT INTO project_files")),
    ).toHaveLength(3);
    expect(new Set(inBatch.map((query) => query.batch)).size).toBe(1);
    expect(Math.max(...inBatch.map((query) => query.values.length))).toBeLessThanOrEqual(100);
    expect((await w.store.projectFiles(PROJECT)).size).toBe(130);
  });

  it("deletes the removed paths in a batch with the rest, and nothing else", async () => {
    const w = await d1World();
    await w.run(FIVE, 1);
    const { "notes.md": _a, "models/m.meltemi": _b, ...rest } = FIVE;

    await w.run(rest, 2);

    const batch = lastBatch(w.db);
    const deletes = batch.filter((query) => query.sql.startsWith("DELETE FROM project_files"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.values).toEqual([PROJECT, "models/m.meltemi", "notes.md"]);
    expect(batch.some((query) => query.sql.startsWith("INSERT INTO project_files"))).toBe(false);
    expect(Object.keys(await rows(w.store)).sort()).toEqual(Object.keys(rest).sort());
  });

  it("leaves the database as it was when the batch fails, and writes everything when it is tried again", async () => {
    const w = await d1World();
    await w.run({ "a.meltemi": "kept\n" }, 5);
    const before = dump(w.db);

    // A revision the table refuses: its UPDATE is the batch's last statement, after the rows.
    await expect(w.run({ "a.meltemi": "kept\n", "b.meltemi": "lost?\n" }, -1)).rejects.toThrow();

    expect(dump(w.db)).toBe(before);
    expect(await rows(w.store)).toEqual({ "a.meltemi": sha("kept\n") });
    expect(await w.store.blob(sha("lost?\n"))).toBeUndefined();
    // The bytes are in R2 (put first), and nothing refers to them until a materialisation succeeds.
    expect(w.blobs.keys()).toContain(blobKey(sha("lost?\n")));

    await w.run({ "a.meltemi": "kept\n", "b.meltemi": "lost?\n" }, 6);
    expect(await rows(w.store)).toEqual({
      "a.meltemi": sha("kept\n"),
      "b.meltemi": sha("lost?\n"),
    });
    expect((await w.store.project(OWNER, PROJECT))?.revision).toBe(6);
  });

  it("throws, and leaves the database as it was, when the database refuses the batch", async () => {
    const db = openDatabase();
    const w = await world(d1Store(db));
    const before = dump(db);
    const refused: typeof db.batch = async () => {
      throw new Error("D1 is unavailable");
    };
    const failing = { ...db, prepare: db.prepare, batch: refused };
    const context = { store: d1Store(failing), blobs: w.blobs, now: () => w.clock.now() };

    await expect(
      materialise(context, { projectId: PROJECT, revision: 1, files: FIVE, binaries: {} }),
    ).rejects.toThrow("D1 is unavailable");

    expect(dump(db)).toBe(before);
    // R2 was written first; D1 never was.
    expect(w.blobs.keys()).toHaveLength(5);
  });

  it("answers gone, writing no file row, for a project deleted before the batch", async () => {
    const w = await d1World();
    expect(await w.store.deleteProject(OWNER, PROJECT)).toBe(true);

    expect(await w.run(FIVE, 1)).toBe("gone");

    expect(
      w.db.raw.prepare("SELECT COUNT(*) AS n FROM project_files").get() as unknown as { n: number },
    ).toEqual({ n: 0 });
    // The blob rows were written in the same batch, which the existence check does not stop: they
    // wait for the weekly collection, as the store's documentation says.
    expect(w.blobs.keys()).toHaveLength(5);
  });

  it("keeps a usage figure equal to the distinct bytes of what the project references", async () => {
    const w = await d1World();

    await w.run({ "a.meltemi": "12345\n", "b.meltemi": "12345\n", "c.meltemi": "abc\n" }, 1);
    expect((await w.store.usage(OWNER)).storageBytes).toBe(10);

    await w.run({ "c.meltemi": "abc\n" }, 2);
    expect((await w.store.usage(OWNER)).storageBytes).toBe(4);
  });
});

describe("the room's triggers call the materialiser", () => {
  /** A harness with Ana's project, a room for it and the real materialiser over the bucket. */
  async function setup() {
    const h = await harness();
    await h.store.upsertUser(
      { sub: OWNER, name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
      T,
    );
    await h.store.createProject(
      { id: PROJECT, ownerSub: OWNER, name: "P", description: "", createdAt: T },
      100,
    );
    return h;
  }

  it("materialises thirty seconds after the last change", async () => {
    const h = await setup();
    const client = await h.rooms.room(PROJECT).open({ sub: OWNER });
    await addText(client, A, "diagrams/a.meltemi", "start\n");

    await h.rooms.advance(29_000);
    expect((await h.store.projectFiles(PROJECT)).size).toBe(0);
    await typeInto(client, A, "more\n");
    await h.rooms.advance(29_000);
    // Thirty seconds count from the LAST change.
    expect((await h.store.projectFiles(PROJECT)).size).toBe(0);
    await h.rooms.advance(2_000);
    await waitFor(() => h.rooms.room(PROJECT).core.stats().d1RowsWritten > 0);

    expect(await rows(h.store)).toEqual({ "diagrams/a.meltemi": sha("start\nmore\n") });
    expect(h.blobs.keys()).toEqual([blobKey(sha("start\nmore\n"))]);
    expect((await h.store.project(OWNER, PROJECT))?.revision).toBe(2);
    expect(h.rooms.room(PROJECT).core.stats()).toMatchObject({
      materialisations: 1,
      materialiseFailures: 0,
      d1RowsWritten: 1 + 1 + 0 + 1 + 1,
    });
  });

  it("materialises when the last client leaves, without waiting", async () => {
    const h = await setup();
    const first = await h.rooms.room(PROJECT).open({ sub: OWNER });
    const second = await h.rooms.room(PROJECT).open({ sub: OWNER });
    await addText(first, A, "a.meltemi", "typed\n");

    await first.leave();
    expect((await h.store.projectFiles(PROJECT)).size).toBe(0);
    await second.leave();

    expect(await rows(h.store)).toEqual({ "a.meltemi": sha("typed\n") });
  });

  it("leaves the room intact when R2 refuses, says so without the content, and retries at the next trigger", async () => {
    const h = await setup();
    h.blobs.refuse = () => true;
    const client = await h.rooms.room(PROJECT).open({ sub: OWNER });
    await addText(client, A, "secret.meltemi", "a secret diagram\n");

    await h.rooms.advance(30_000);
    const room = h.rooms.room(PROJECT);
    await waitFor(() => room.core.stats().materialiseFailures > 0);

    expect(room.core.stats()).toMatchObject({
      materialisations: 1,
      materialiseFailures: 1,
      d1RowsWritten: 0,
      revision: 1,
    });
    // The document and its revision are untouched, and what was written to D1 is nothing.
    expect(await h.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "secret.meltemi": "a secret diagram\n" },
    });
    expect((await h.store.projectFiles(PROJECT)).size).toBe(0);
    expect(room.warnings.join("\n")).toContain("could not be materialised");
    expect(room.warnings.join("\n")).not.toContain("secret");
    expect(room.warnings.join("\n")).not.toContain("a secret diagram");

    // R2 recovers; the next trigger (here the last client leaving) materialises what the room holds.
    h.blobs.refuse = undefined;
    await client.leave();
    expect(await rows(h.store)).toEqual({ "secret.meltemi": sha("a secret diagram\n") });
    expect(room.core.stats()).toMatchObject({ materialisations: 2, materialiseFailures: 1 });
  });

  it("does not write over the store when the project was deleted: the destroyed room has revision 0", async () => {
    const h = await setup();
    const client = await h.rooms.room(PROJECT).open({ sub: OWNER });
    await addText(client, A, "a.meltemi", "kept\n");
    await h.rooms.advance(30_000);
    await waitFor(() => h.rooms.room(PROJECT).core.stats().d1RowsWritten > 0);
    expect(await rows(h.store)).toEqual({ "a.meltemi": sha("kept\n") });

    await h.rooms.destroy(PROJECT);
    await h.store.deleteProject(OWNER, PROJECT);
    await h.rooms.advance(60_000);

    expect((await h.store.projectFiles(PROJECT)).size).toBe(0);
  });
});
