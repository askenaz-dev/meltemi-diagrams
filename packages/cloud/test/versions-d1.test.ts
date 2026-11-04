// The version routes over `d1Store` on the real migration (`node:sqlite`), with the in-memory rooms
// and bucket: what only SQL can get wrong. The cap and the rate are conditions of the one statement
// that inserts a version, so requests made at the same moment cannot both pass them; thinning removes
// a version's file rows with it; a restore and the daily version write real rows.

import { describe, expect, it } from "vitest";
import { d1Store } from "../src/store/d1.js";
import { jsonOf } from "./support/index.js";
import { DAY, HOUR, MINUTE, codeOf, projects, sha } from "./support/projects.js";
import { openDatabase, sqliteAvailable, withLatency, type SqliteDb } from "./support/sqlite.js";

const ANA = "u-ana";
const START = Date.parse("2026-10-14T12:00:00.000Z");
const FILES = { "a.meltemi": "one\n", "notes.md": "# notes\n", "diagrams/b.meltemi": "bee\n" };

const url = (id: string, rest = ""): string => `/api/projects/${id}/versions${rest}`;
const at = (days: number, hours = 0): string =>
  new Date(START + days * DAY + hours * HOUR).toISOString();

const count = (db: SqliteDb, table: string, where = "1 = 1", ...values: string[]): number =>
  Number(
    (
      db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...values) as {
        n: number;
      }
    ).n,
  );

async function setup(slow = false) {
  const db = openDatabase();
  const p = await projects({ store: d1Store(slow ? withLatency(db) : db) });
  const id = await p.create(ANA, { name: "P", files: FILES });
  const make = (body: unknown = {}) => p.sendJson(ANA, "POST", url(id), body);
  const seed = async (
    count: number,
    pick: (i: number) => { label: string | null; createdAt: string },
  ) => {
    for (let i = 0; i < count; i++) {
      const { label, createdAt } = pick(i);
      const made = await p.h.store.createVersion(
        { projectId: id, label, auto: false, createdBy: ANA, createdAt },
        { maxVersions: 10_000 },
      );
      expect(typeof made).toBe("object");
    }
  };
  return { db, ...p, id, make, seed };
}

/** Rows of `version_files` that belong to no version: thinning and deleting must leave none. */
const orphanFiles = (db: SqliteDb): number =>
  count(db, "version_files", "version_id NOT IN (SELECT id FROM versions)");

describe.skipIf(!sqliteAvailable)("the version routes over d1Store", () => {
  it("creates, lists, reads and restores, with the rows a version is made of", async () => {
    const { db, h, send, make, id } = await setup();

    const first = await make({ label: "start" });
    expect(first.status).toBe(201);
    // One row for the version, one for each of its three files.
    expect(count(db, "versions", "project_id = ?", id)).toBe(1);
    expect(count(db, "version_files")).toBe(3);
    await h.rooms.push(id, { files: { "a.meltemi": "one, edited\n", "new.md": "new\n" } });
    h.clock.advance(2 * MINUTE);
    const second = await jsonOf<{ number: number; changed: string[] }>(await make());
    expect(second).toMatchObject({ number: 2, changed: ["a.meltemi", "new.md"] });

    // The list's `changed`, computed by the database, is what the creation answered from the files.
    const listed = await jsonOf<{ versions: { number: number; changed: string[] }[] }>(
      await send(ANA, "GET", url(id)),
    );
    expect(listed.versions.map((v) => [v.number, v.changed])).toEqual([
      [2, ["a.meltemi", "new.md"]],
      [1, ["a.meltemi", "diagrams/b.meltemi", "notes.md"]],
    ]);
    const read = await jsonOf<{ files: Record<string, string> }>(
      await send(ANA, "GET", url(id, "/1")),
    );
    expect(read.files).toEqual(FILES);

    h.clock.advance(2 * MINUTE);
    const restored = await send(ANA, "POST", url(id, "/1/restore"));
    expect(restored.status).toBe(200);
    expect((await h.rooms.read(id)).files).toEqual(FILES);
    // The state before, as version 3, with its own file rows.
    expect(count(db, "versions", "project_id = ?", id)).toBe(3);
    expect(
      count(db, "version_files", "version_id = (SELECT id FROM versions WHERE number = 3)"),
    ).toBe(4);
    expect(orphanFiles(db)).toBe(0);
  });

  it("lets six of ten requests made at the same moment through, and refuses the rest with the rate", async () => {
    const { db, make, id } = await setup(true);

    const answers = await Promise.all(Array.from({ length: 10 }, () => make()));

    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 201, 429, 429, 429, 429]);
    for (const answer of answers) {
      if (answer.status === 429) expect(await codeOf(answer)).toBe("versions.rate");
    }
    expect(count(db, "versions", "project_id = ?", id)).toBe(6);
    const numbers = (
      db.raw.prepare("SELECT number FROM versions ORDER BY number").all() as { number: number }[]
    ).map((row) => row.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("lets as many requests through as there is room for, however many arrive together", async () => {
    const { db, make, id, seed } = await setup(true);
    await seed(198, (i) => ({ label: `v${i}`, createdAt: at(-10, i) }));

    const answers = await Promise.all(Array.from({ length: 5 }, () => make({ label: "late" })));

    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([201, 201, 413, 413, 413]);
    expect(count(db, "versions", "project_id = ?", id)).toBe(200);
  });

  it("removes a thinned version's file rows with it", async () => {
    const { db, h, make, id, seed } = await setup();
    await seed(1, () => ({ label: "named", createdAt: at(-20) }));
    await seed(100, (i) => ({ label: null, createdAt: at(-10, i) }));
    expect(count(db, "version_files")).toBe(101 * 3);

    const made = await make();

    expect(made.status).toBe(201);
    // The oldest unlabelled one (number 2) is gone, with its three files; the new one has three.
    expect(count(db, "versions", "project_id = ?", id)).toBe(101);
    expect(count(db, "versions", "number = 2")).toBe(0);
    expect(count(db, "version_files")).toBe(101 * 3);
    expect(orphanFiles(db)).toBe(0);
    expect(count(db, "versions", "label = 'named'")).toBe(1);
    expect((await h.store.listVersions(id)).at(-1)?.number).toBe(102);
  });

  it("records the daily version with a row for each file", async () => {
    const { db, h, id } = await setup();
    h.clock.advance(13 * HOUR);

    await h.rooms.push(id, { files: { "a.meltemi": "two\n" } });
    await h.rooms.materialise(id);

    expect(count(db, "versions", "project_id = ? AND auto = 1 AND label IS NULL", id)).toBe(1);
    expect(count(db, "version_files")).toBe(3);
    expect((await h.store.versionFiles(id, 1))?.get("a.meltemi")).toBe(sha("two\n"));
    // What the project and its one version reference: the old text of a.meltemi is nobody's now.
    expect((await h.store.usage(ANA)).storageBytes).toBe(
      Buffer.byteLength("two\n") + Buffer.byteLength("# notes\n") + Buffer.byteLength("bee\n"),
    );
  });

  it("walks the weeks: thirty-five days of a version a day leave the last thirty-one and one old week's newest", async () => {
    const { db, h, send, id } = await setup();
    for (let day = 0; day <= 35; day++) {
      if (day > 0) h.clock.advance(DAY);
      const response = await send(ANA, "POST", url(id), "{}", {
        "Content-Type": "application/json",
      });
      expect(response.status, `day ${day}`).toBe(201);
    }

    const days = (
      db.raw.prepare("SELECT created_at FROM versions ORDER BY number").all() as {
        created_at: string;
      }[]
    ).map((row) => row.created_at.slice(0, 10));
    expect(days).toHaveLength(32);
    expect(days[0]).toBe("2026-10-18");
    expect(days[1]).toBe("2026-10-19");
    expect(days.at(-1)).toBe("2026-11-18");
    expect(count(db, "version_files")).toBe(32 * 3);
    expect(orphanFiles(db)).toBe(0);
  });
});
