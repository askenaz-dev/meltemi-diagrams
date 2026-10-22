// The room's storage over SQL: what the Durable Object's SQLite holds (`meta`, `doc_chunks`), run
// over `node:sqlite` so that the same statements are tested with no platform.

import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { RoomCore, type RoomPorts } from "../src/room-core.js";
import { sqlRoomStorage, type SqlRoomDb } from "../src/room-storage.js";

const sqlite = await import("node:sqlite").catch(() => undefined);

/** `SqlRoomDb` over a `node:sqlite` database, with a hook to make a statement fail. */
function dbOf(
  raw: DatabaseSync,
  fail: (query: string, count: number) => boolean = () => false,
): SqlRoomDb {
  let count = 0;
  return {
    exec(query, ...bindings) {
      count++;
      if (fail(query, count)) throw new Error("the statement failed");
      const bound = bindings.map((value) =>
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ) as (string | number | Uint8Array | null)[];
      const statement = raw.prepare(query);
      if (/^\s*(select|pragma)/i.test(query)) {
        const rows = statement.all(...bound).map((row) => ({ ...row }));
        return { toArray: () => rows };
      }
      statement.run(...bound);
      return { toArray: () => [] };
    },
    transactionSync(run) {
      raw.exec("BEGIN");
      try {
        const result = run();
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const open = (): DatabaseSync =>
  new (sqlite as typeof import("node:sqlite")).DatabaseSync(":memory:");

const rows = (raw: DatabaseSync, table: string): Record<string, unknown>[] =>
  raw
    .prepare(`SELECT * FROM ${table} ORDER BY 1`)
    .all()
    .map((row) => ({ ...row }));

const changesOf = (raw: DatabaseSync): number =>
  Number((raw.prepare("SELECT total_changes() AS n").get() as { n: number }).n);

const chunk = (fill: number, length: number): Uint8Array => new Uint8Array(length).fill(fill);

describe.skipIf(!sqlite)("the room's storage over SQL", () => {
  it("is empty for a room never written, and makes its tables once", () => {
    const raw = open();
    const db = dbOf(raw);

    expect(sqlRoomStorage(db).load()).toBeUndefined();
    expect(sqlRoomStorage(db).load()).toBeUndefined();

    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row["name"]);
    expect(tables).toEqual(["doc_chunks", "live", "meta"]);
  });

  it("stores the revision and the chunks and gives them back in order, as bytes", () => {
    const storage = sqlRoomStorage(dbOf(open()));

    storage.save(7, [chunk(1, 1024 * 1024), chunk(2, 1024 * 1024), chunk(3, 100)]);
    const loaded = storage.load();

    expect(loaded?.revision).toBe(7);
    expect(loaded?.chunks.map((bytes) => [bytes[0], bytes.length])).toEqual([
      [1, 1024 * 1024],
      [2, 1024 * 1024],
      [3, 100],
    ]);
    expect(loaded?.chunks.every((bytes) => bytes instanceof Uint8Array)).toBe(true);
  });

  it("writes a one-chunk document as two rows, and drops the chunks a smaller document no longer needs", () => {
    const raw = open();
    const storage = sqlRoomStorage(dbOf(raw));
    storage.save(1, [chunk(1, 10), chunk(2, 10), chunk(3, 10)]);

    const before = changesOf(raw);
    storage.save(2, [chunk(9, 20)]);

    // The two extra chunks were deleted (2 rows), then the chunk and the meta row were written.
    expect(changesOf(raw) - before).toBe(4);
    expect(rows(raw, "doc_chunks")).toHaveLength(1);
    expect(storage.load()).toMatchObject({ revision: 2 });
    expect(storage.load()?.chunks).toHaveLength(1);

    const again = changesOf(raw);
    storage.save(3, [chunk(8, 20)]);
    expect(changesOf(raw) - again).toBe(2);
  });

  it("writes the chunks and the revision in one transaction: a failure part way leaves the last state", () => {
    const raw = open();
    let failing = false;
    const storage = sqlRoomStorage(
      dbOf(raw, (query, count) => failing && /INSERT INTO doc_chunks/.test(query) && count > 0),
    );
    storage.save(1, [chunk(1, 10), chunk(2, 10)]);
    const before = { chunks: rows(raw, "doc_chunks"), meta: rows(raw, "meta") };

    failing = true;
    expect(() => storage.save(2, [chunk(7, 10), chunk(8, 10), chunk(9, 10)])).toThrow(
      "the statement failed",
    );

    expect({ chunks: rows(raw, "doc_chunks"), meta: rows(raw, "meta") }).toEqual(before);
    failing = false;
    expect(storage.load()?.revision).toBe(1);
  });

  it("refuses to load a document that is missing a chunk, rather than carry on with a short one", () => {
    const raw = open();
    const storage = sqlRoomStorage(dbOf(raw));
    storage.save(1, [chunk(1, 10), chunk(2, 10), chunk(3, 10)]);
    raw.exec("DELETE FROM doc_chunks WHERE n = 1");

    expect(() => storage.load()).toThrow("incomplete");
  });

  it("remembers the project once, keeps it across writes, and holds no document until one is written", () => {
    const raw = open();
    const storage = sqlRoomStorage(dbOf(raw));
    expect(storage.project()).toBeUndefined();

    storage.setProject("01h2x5z8kq3m7n9p2r4t");
    const written = changesOf(raw);
    storage.setProject("01h2x5z8kq3m7n9p2r4t");

    expect(changesOf(raw)).toBe(written);
    expect(storage.project()).toBe("01h2x5z8kq3m7n9p2r4t");
    expect(storage.load()).toBeUndefined();
    storage.save(4, [chunk(1, 5)]);
    expect(storage.project()).toBe("01h2x5z8kq3m7n9p2r4t");
    expect(storage.load()?.revision).toBe(4);
  });

  it("deletes everything on destroy, the project included", () => {
    const raw = open();
    const storage = sqlRoomStorage(dbOf(raw));
    storage.setProject("01h2x5z8kq3m7n9p2r4t");
    storage.save(4, [chunk(1, 5)]);

    storage.destroy();

    expect(rows(raw, "doc_chunks")).toEqual([]);
    expect(rows(raw, "meta")).toEqual([]);
    expect(storage.load()).toBeUndefined();
    expect(storage.project()).toBeUndefined();
  });

  it("carries a room's document through a restart: a room over the same database holds what the first wrote", async () => {
    const raw = open();
    const ports = (): RoomPorts => ({
      storage: sqlRoomStorage(dbOf(raw)),
      now: () => 0,
      setTimer: () => 0,
      clearTimer: () => undefined,
      setAlarm: () => undefined,
      sockets: () => [],
      projectId: () => "01h2x5z8kq3m7n9p2r4t",
      hasBlob: async () => true,
      materialise: async () => ({ rowsWritten: 0 }),
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      warn: () => undefined,
    });
    const first = new RoomCore(ports());
    await first.restore({ "a.meltemi": "a".repeat(2_000_000), "b.md": "b".repeat(700_000) }, {});
    await first.push({ files: { "c.txt": "pushed" } });
    await first.flush();
    expect(rows(raw, "doc_chunks").length).toBeGreaterThanOrEqual(3);

    const second = new RoomCore(ports());
    const read = await second.readFiles();

    expect(read).toEqual(await first.readFiles());
    expect(read.revision).toBe(2);
    expect(Object.keys(read.files)).toEqual(["a.meltemi", "b.md", "c.txt"]);
  });
});
