// The first migration over node:sqlite: what the cloud-accounts specification says the service
// holds, checked against the database itself. Only `0001_accounts.sql` is applied here, so the
// migrations of later changes extend the schema without touching this test; the second one,
// `0002_projects.sql`, has its own in migration-projects.test.ts.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrationFiles, openDatabase, sqliteAvailable, type SqliteDb } from "./support/sqlite.js";

/** `name`, `type`, whether it is NOT NULL, and its position in the primary key (0: not in it). */
type Column = readonly [name: string, type: "TEXT" | "INTEGER", notNull: boolean, pk: number];

const EXPECTED: Record<string, readonly Column[]> = {
  users: [
    ["sub", "TEXT", true, 1],
    ["name", "TEXT", true, 0],
    ["picture", "TEXT", true, 0],
    ["email", "TEXT", true, 0],
    ["email_verified", "INTEGER", true, 0],
    ["created_at", "TEXT", true, 0],
  ],
  tokens: [
    ["id", "TEXT", true, 1],
    ["sub", "TEXT", true, 0],
    ["name", "TEXT", true, 0],
    ["hash", "TEXT", true, 0],
    ["created_at", "TEXT", true, 0],
    ["last_used_at", "TEXT", false, 0],
  ],
  processed_events: [
    ["id", "TEXT", true, 1],
    ["sub", "TEXT", true, 0],
    ["at", "TEXT", true, 0],
  ],
  cli_codes: [
    ["hash", "TEXT", true, 1],
    ["sub", "TEXT", true, 0],
    ["state", "TEXT", true, 0],
    ["expires_at", "TEXT", true, 0],
  ],
  cli_failures: [
    ["key", "TEXT", true, 0],
    ["at", "TEXT", true, 0],
  ],
};

const T = "2026-10-14T12:00:00.000Z";
const FIRST = "0001_accounts.sql";
const sha = (label: string): string => createHash("sha256").update(label).digest("hex");

/** A database with only the first migration applied. */
const open = (): SqliteDb =>
  openDatabase({ migrations: migrationFiles().filter((file) => file.name === FIRST) });

/** The tables the service made, without SQLite's own and wrangler's bookkeeping table. */
function tablesOf(db: SqliteDb): string[] {
  return db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name))
    .filter((name) => !name.startsWith("sqlite_") && name !== "d1_migrations")
    .sort();
}

const squash = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

describe("the migration files", () => {
  it("are numbered files wrangler applies in order, starting at 0001_accounts.sql", () => {
    const names = migrationFiles().map((file) => file.name);
    expect(names[0]).toBe(FIRST);
    names.forEach((name, index) => {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
      expect(Number(name.slice(0, 4))).toBe(index + 1);
    });
  });

  it("only create: no transaction control, no pragma, no data, no drop in the first migration", () => {
    const sql = migrationFiles().find((file) => file.name === FIRST)?.sql ?? "";
    const statements = sql
      .replace(/--.*$/gm, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement !== "");
    // Five tables and six indexes.
    expect(statements).toHaveLength(11);
    for (const statement of statements) expect(statement).toMatch(/^CREATE (TABLE|INDEX) /);
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    const sql = migrationFiles().find((file) => file.name === FIRST)?.sql ?? "";
    // eslint-disable-next-line no-control-regex
    expect(sql).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the first migration", () => {
  it("creates exactly the tables users, tokens, processed_events, cli_codes and cli_failures", () => {
    const db = open();
    expect(tablesOf(db)).toEqual([
      "cli_codes",
      "cli_failures",
      "processed_events",
      "tokens",
      "users",
    ]);
    db.close();
  });

  it("creates no view and no trigger", () => {
    const db = open();
    const kinds = db.raw
      .prepare("SELECT DISTINCT type FROM sqlite_master ORDER BY type")
      .all()
      .map((row) => String(row.type));
    expect(kinds).toEqual(["index", "table"]);
    db.close();
  });

  it("leaves every table empty", () => {
    const db = open();
    for (const table of Object.keys(EXPECTED)) {
      expect(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get(), table).toEqual({ n: 0 });
    }
    db.close();
  });

  for (const [table, columns] of Object.entries(EXPECTED)) {
    it(`gives ${table} exactly the columns the specification lists`, () => {
      const db = open();
      const actual = db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => [String(row.name), String(row.type), row.notnull === 1, Number(row.pk)]);
      expect(actual).toEqual(columns.map((column) => [...column]));
      db.close();
    });
  }

  it("has no handle and no deleted_at: a deleted person's row is removed, not marked", () => {
    const db = open();
    const names = db.raw
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((row) => String(row.name));
    expect(names).not.toContain("handle");
    expect(names).not.toContain("deleted_at");
    db.close();
  });

  it("makes every table STRICT, so a boolean or a time cannot be stored as the wrong type", () => {
    const db = open();
    const strict = db.raw
      .prepare("PRAGMA table_list")
      .all()
      .filter((row) => String(row.name) in EXPECTED)
      .map((row) => [String(row.name), Number(row.strict)]);
    expect(strict.sort()).toEqual([
      ["cli_codes", 1],
      ["cli_failures", 1],
      ["processed_events", 1],
      ["tokens", 1],
      ["users", 1],
    ]);
    // Text that is not a number cannot go into an INTEGER column (a boolean must be 0 or 1).
    expect(() =>
      db.raw
        .prepare(
          "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', '', 'yes', ?)",
        )
        .run(T),
    ).toThrow(/cannot store TEXT value in INTEGER column/);
    db.close();
  });

  it("makes exactly the indexes on a person's tokens, a caller's failures and a deleted person, and the three the sweep reads", () => {
    const db = open();
    const indexes = db.raw
      .prepare(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
      )
      .all()
      .map((row) => [String(row.name), String(row.tbl_name), squash(row.sql)]);
    expect(indexes).toEqual([
      [
        "cli_codes_expires_at",
        "cli_codes",
        "CREATE INDEX cli_codes_expires_at ON cli_codes (expires_at)",
      ],
      ["cli_failures_at", "cli_failures", "CREATE INDEX cli_failures_at ON cli_failures (at)"],
      [
        "cli_failures_key_at",
        "cli_failures",
        "CREATE INDEX cli_failures_key_at ON cli_failures (key, at)",
      ],
      [
        "processed_events_at",
        "processed_events",
        "CREATE INDEX processed_events_at ON processed_events (at)",
      ],
      [
        "processed_events_sub_at",
        "processed_events",
        "CREATE INDEX processed_events_sub_at ON processed_events (sub, at)",
      ],
      ["tokens_sub", "tokens", "CREATE INDEX tokens_sub ON tokens (sub)"],
    ]);
    db.close();
  });

  it("keys each table by what the store looks it up by, and a token's hash is unique", () => {
    const db = open();
    const keys = (table: string) =>
      db.raw
        .prepare(`PRAGMA index_list(${table})`)
        .all()
        .filter((row) => row.unique === 1)
        .map((row) => {
          const columns = db.raw
            .prepare(`PRAGMA index_info(${String(row.name)})`)
            .all()
            .map((info) => String(info.name));
          return `${String(row.origin)}:${columns.join(",")}`;
        })
        .sort();
    expect(keys("users")).toEqual(["pk:sub"]);
    expect(keys("tokens")).toEqual(["pk:id", "u:hash"]);
    expect(keys("processed_events")).toEqual(["pk:id"]);
    expect(keys("cli_codes")).toEqual(["pk:hash"]);
    // Failures are counted, not looked up one by one: nothing is unique, so a caller can fail
    // twice at the same instant.
    expect(keys("cli_failures")).toEqual([]);
    db.close();
  });

  it("has no foreign key anywhere: deleting a person names every table", () => {
    const db = open();
    for (const table of Object.keys(EXPECTED)) {
      expect(db.raw.prepare(`PRAGMA foreign_key_list(${table})`).all(), table).toEqual([]);
    }
    db.close();
  });

  it("has no column that could hold a token, a code, a secret, an address or a request log", () => {
    const db = open();
    const names = Object.keys(EXPECTED).flatMap((table) =>
      db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => `${table}.${String(row.name)}`),
    );
    expect(names).toHaveLength(Object.values(EXPECTED).flat().length);
    const forbidden =
      /\.(token|code|secret|credential|password|jwt|cookie|header|bearer|authorization|plain|clear|raw|ip|address|agent|ua|request|referer|referrer|log|analytics|refresh|access)\b|_(token|secret|password|ip|agent|address)\b/i;
    for (const name of names) {
      expect(name, `${name} should not be able to hold such data`).not.toMatch(forbidden);
    }
    // The only columns a credential could rest in are the two hashes, named as what they are.
    expect(names.filter((name) => name.endsWith(".hash")).sort()).toEqual([
      "cli_codes.hash",
      "tokens.hash",
    ]);
    // No column takes binary data, so nothing opaque (a token, a blob) is stored either.
    const types = new Set(
      Object.values(EXPECTED)
        .flat()
        .map((column) => column[1]),
    );
    expect([...types].sort()).toEqual(["INTEGER", "TEXT"]);
    db.close();
  });

  describe("the constraints", () => {
    const user = (db: SqliteDb, sub = "u1", verified: number | string = 1) =>
      db.raw
        .prepare(
          "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (?, 'Ana', '', 'a@example.com', ?, ?)",
        )
        .run(sub, verified, T);
    const token = (db: SqliteDb, id = "t1", hash = sha(id), lastUsedAt: string | null = null) =>
      db.raw
        .prepare(
          "INSERT INTO tokens (id, sub, name, hash, created_at, last_used_at) VALUES (?, 'u1', 'laptop', ?, ?, ?)",
        )
        .run(id, hash, T, lastUsedAt);
    const code = (db: SqliteDb, hash = sha("code")) =>
      db.raw
        .prepare(
          "INSERT INTO cli_codes (hash, sub, state, expires_at) VALUES (?, 'u1', 'state-0123456789ab', ?)",
        )
        .run(hash, T);
    const count = (db: SqliteDb, table: string) =>
      Number(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

    it("keep a person, a token's id and hash, a code's hash and an event's id unique", () => {
      const db = open();
      user(db);
      expect(() => user(db)).toThrow(/UNIQUE|PRIMARY KEY/);
      token(db, "t1", sha("one"));
      expect(() => token(db, "t1", sha("two"))).toThrow(/UNIQUE constraint failed: tokens\.id/);
      expect(() => token(db, "t2", sha("one"))).toThrow(/UNIQUE constraint failed: tokens\.hash/);
      code(db);
      expect(() => code(db)).toThrow(/UNIQUE constraint failed: cli_codes\.hash/);
      const event = db.raw.prepare(
        "INSERT INTO processed_events (id, sub, at) VALUES ('evt_1', 'u1', ?)",
      );
      event.run(T);
      expect(() => event.run(T)).toThrow(/UNIQUE constraint failed: processed_events\.id/);
      // The same person may be deleted again (a later event, another id).
      db.raw.prepare("INSERT INTO processed_events (id, sub, at) VALUES ('evt_2', 'u1', ?)").run(T);
      db.close();
    });

    it("accept a hash that is a SHA-256 in lowercase hexadecimal, in tokens and in codes", () => {
      const db = open();
      token(db, "t1", "0".repeat(64));
      token(db, "t2", "f".repeat(64));
      token(db, "t3", sha("any"));
      code(db, "0123456789abcdef".repeat(4));
      expect(count(db, "tokens")).toBe(3);
      expect(count(db, "cli_codes")).toBe(1);
      db.close();
    });

    it.each([
      ["a token in clear", `mdg_${"AbC123_-".repeat(5)}XyZ`],
      ["a base64url digest", "n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg"],
      ["63 characters", "a".repeat(63)],
      ["65 characters", "a".repeat(65)],
      ["64 hexadecimal characters and a newline", `${"a".repeat(64)}\n`],
      ["upper case hexadecimal", "A".repeat(64)],
      ["a character that is not hexadecimal", `${"a".repeat(63)}g`],
      ["spaces", ` ${"a".repeat(62)} `],
      ["nothing", ""],
    ])("refuse a hash that is %s: the database holds no token in clear", (_what, hash) => {
      const db = open();
      expect(() => token(db, "t1", hash)).toThrow(/CHECK constraint failed/);
      expect(() => code(db, hash)).toThrow(/CHECK constraint failed/);
      expect(count(db, "tokens") + count(db, "cli_codes")).toBe(0);
      db.close();
    });

    it("accept only 0 or 1 for a verified email", () => {
      const db = open();
      user(db, "u0", 0);
      user(db, "u1", 1);
      expect(() => user(db, "u2", 2)).toThrow(/CHECK/);
      expect(() => user(db, "u3", -1)).toThrow(/CHECK/);
      expect(count(db, "users")).toBe(2);
      db.close();
    });

    it("refuse a NULL where a value is needed, and allow one only for a token never used", () => {
      const db = open();
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u', NULL, '', '', 0, ?)",
          )
          .run(T),
      ).toThrow(/NOT NULL/);
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES (NULL, 'n', '', '', 0, ?)",
          )
          .run(T),
      ).toThrow(/NOT NULL/);
      expect(() =>
        db.raw.prepare("INSERT INTO cli_failures (key, at) VALUES (NULL, ?)").run(T),
      ).toThrow(/NOT NULL/);
      expect(() =>
        db.raw
          .prepare("INSERT INTO cli_codes (hash, sub, state, expires_at) VALUES (?, 'u', NULL, ?)")
          .run(sha("c"), T),
      ).toThrow(/NOT NULL/);
      token(db, "t1", sha("never used"), null);
      token(db, "t2", sha("used"), T);
      expect(db.raw.prepare("SELECT id, last_used_at FROM tokens ORDER BY id").all()).toEqual([
        { id: "t1", last_used_at: null },
        { id: "t2", last_used_at: T },
      ]);
      db.close();
    });

    it("let a caller fail twice at the same instant", () => {
      const db = open();
      const insert = db.raw.prepare("INSERT INTO cli_failures (key, at) VALUES ('caller', ?)");
      insert.run(T);
      insert.run(T);
      expect(count(db, "cli_failures")).toBe(2);
      db.close();
    });

    it("keep an empty email, name and picture: a provider may give none", () => {
      const db = open();
      db.raw
        .prepare(
          "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', '', '', '', 0, ?)",
        )
        .run(T);
      expect(db.raw.prepare("SELECT name, picture, email FROM users").get()).toEqual({
        name: "",
        picture: "",
        email: "",
      });
      db.close();
    });
  });
});
