// The second migration over node:sqlite: what the cloud-projects specification and design say the
// service keeps of projects, checked against the database itself. Both migrations are applied
// (`0002_projects.sql` extends the tables of `0001_accounts.sql`); migration.test.ts pins the first
// one alone.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  migrationFiles,
  openDatabase as openAll,
  sqliteAvailable,
  type SqliteDb,
} from "./support/sqlite.js";

/** `name`, `type`, whether it is NOT NULL, and its position in the primary key (0: not in it). */
type Column = readonly [name: string, type: "TEXT" | "INTEGER", notNull: boolean, pk: number];

const SECOND_FILE = "0002_projects.sql";

/**
 * The database as the first two migrations leave it: `0003_sharing.sql` changes `projects` and
 * `users` and adds tables, and has its own file of tests (migration-sharing.test.ts).
 */
const openDatabase = (): SqliteDb =>
  openAll({ migrations: migrationFiles().filter((file) => file.name <= SECOND_FILE) });

/** The tables 0002 makes, with their columns in order. */
const NEW_TABLES: Record<string, readonly Column[]> = {
  projects: [
    ["id", "TEXT", true, 1],
    ["owner_sub", "TEXT", true, 0],
    ["name", "TEXT", true, 0],
    ["description", "TEXT", true, 0],
    ["created_at", "TEXT", true, 0],
    ["updated_at", "TEXT", true, 0],
    ["revision", "INTEGER", true, 0],
    ["thumbnail_at", "TEXT", false, 0],
    ["deleted_at", "TEXT", false, 0],
  ],
  project_files: [
    ["project_id", "TEXT", true, 1],
    ["path", "TEXT", true, 2],
    ["hash", "TEXT", true, 0],
  ],
  project_blobs: [
    ["project_id", "TEXT", true, 1],
    ["hash", "TEXT", true, 2],
  ],
  blobs: [
    ["hash", "TEXT", true, 1],
    ["size", "INTEGER", true, 0],
    ["media_type", "TEXT", true, 0],
    ["created_at", "TEXT", true, 0],
  ],
  versions: [
    ["id", "INTEGER", true, 1],
    ["project_id", "TEXT", true, 0],
    ["number", "INTEGER", true, 0],
    ["label", "TEXT", false, 0],
    ["auto", "INTEGER", true, 0],
    ["created_by", "TEXT", true, 0],
    ["created_at", "TEXT", true, 0],
  ],
  version_files: [
    ["version_id", "INTEGER", true, 1],
    ["path", "TEXT", true, 2],
    ["hash", "TEXT", true, 0],
  ],
};

/** `users` after 0002: the six columns of 0001, then the running total of bytes. */
const USERS_AFTER: readonly Column[] = [
  ["sub", "TEXT", true, 1],
  ["name", "TEXT", true, 0],
  ["picture", "TEXT", true, 0],
  ["email", "TEXT", true, 0],
  ["email_verified", "INTEGER", true, 0],
  ["created_at", "TEXT", true, 0],
  ["storage_bytes", "INTEGER", true, 0],
];

const T = "2026-10-14T12:00:00.000Z";
const P1 = "proj0000000000000001";
const sha = (label: string): string => createHash("sha256").update(label).digest("hex");
const squash = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

const source = (): string => migrationFiles().find((file) => file.name === SECOND_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

const count = (db: SqliteDb, table: string) =>
  Number(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

describe("the projects migration file", () => {
  it("is the second numbered file", () => {
    expect(
      migrationFiles()
        .map((file) => file.name)
        .slice(0, 2),
    ).toEqual(["0001_accounts.sql", SECOND_FILE]);
  });

  it("only creates, and adds the one column: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    // Six tables, one index and the column of users.
    expect(statements).toHaveLength(8);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(6);
    expect(statements.filter((s) => /^CREATE INDEX /.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^ALTER TABLE /.test(s))).toEqual([
      "ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0",
    ]);
    for (const statement of statements) {
      expect(statement).toMatch(/^(CREATE (TABLE|INDEX) |ALTER TABLE users ADD COLUMN )/);
    }
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    // eslint-disable-next-line no-control-regex
    expect(source()).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the projects migration", () => {
  it("creates the six tables beside the five of the first, and nothing else", () => {
    const db = openDatabase();
    const tables = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name))
      .filter((name) => !name.startsWith("sqlite_") && name !== "d1_migrations")
      .sort();
    expect(tables).toEqual([
      "blobs",
      "cli_codes",
      "cli_failures",
      "processed_events",
      "project_blobs",
      "project_files",
      "projects",
      "tokens",
      "users",
      "version_files",
      "versions",
    ]);
    const kinds = db.raw
      .prepare("SELECT DISTINCT type FROM sqlite_master ORDER BY type")
      .all()
      .map((row) => String(row.type));
    expect(kinds).toEqual(["index", "table"]);
    db.close();
  });

  it("leaves the new tables empty", () => {
    const db = openDatabase();
    for (const table of Object.keys(NEW_TABLES)) expect(count(db, table), table).toBe(0);
    db.close();
  });

  for (const [table, columns] of Object.entries(NEW_TABLES)) {
    it(`gives ${table} exactly the columns the design lists`, () => {
      const db = openDatabase();
      const actual = db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => [String(row.name), String(row.type), row.notnull === 1, Number(row.pk)]);
      expect(actual).toEqual(columns.map((column) => [...column]));
      db.close();
    });
  }

  it("adds storage_bytes to users, last, as an integer that defaults to 0", () => {
    const db = openDatabase();
    const info = db.raw.prepare("PRAGMA table_info(users)").all();
    expect(
      info.map((row) => [String(row.name), String(row.type), row.notnull === 1, Number(row.pk)]),
    ).toEqual(USERS_AFTER.map((column) => [...column]));
    expect(info.at(-1)?.dflt_value).toBe("0");
    db.close();
  });

  it("gives a person who was there before the column a total of 0, and keeps their row", () => {
    const first = migrationFiles().filter((file) => file.name < SECOND_FILE);
    const second = migrationFiles().filter((file) => file.name === SECOND_FILE);
    const db = openAll({ migrations: first });
    db.raw
      .prepare(
        "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', 'ana@example.com', 1, ?)",
      )
      .run(T);
    applyMigrations(db.raw, second);
    expect(db.raw.prepare("SELECT * FROM users").all()).toEqual([
      {
        sub: "u1",
        name: "Ana",
        picture: "",
        email: "ana@example.com",
        email_verified: 1,
        created_at: T,
        storage_bytes: 0,
      },
    ]);
    db.close();
  });

  it("makes every new table STRICT, and the tables with a row per file WITHOUT ROWID", () => {
    const db = openDatabase();
    const kinds = db.raw
      .prepare("PRAGMA table_list")
      .all()
      .filter((row) => String(row.name) in NEW_TABLES)
      .map((row) => [String(row.name), Number(row.strict), Number(row.wr)])
      .sort();
    expect(kinds).toEqual([
      ["blobs", 1, 1],
      ["project_blobs", 1, 1],
      ["project_files", 1, 1],
      ["projects", 1, 0],
      ["version_files", 1, 1],
      ["versions", 1, 0],
    ]);
    // Text that is not a number cannot go into an INTEGER column.
    expect(() =>
      db.raw
        .prepare(
          "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at, revision) VALUES (?, 'u1', 'n', '', ?, ?, 'many')",
        )
        .run(P1, T, T),
    ).toThrow(/cannot store TEXT value in INTEGER column/);
    db.close();
  });

  it("makes exactly one index beyond the keys: a person's projects", () => {
    const db = openDatabase();
    const indexes = db.raw
      .prepare(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
      )
      .all()
      .map((row) => [String(row.name), String(row.tbl_name), squash(row.sql)]);
    // The first migration's six, and the one of this: nothing on a hash, a path or a version, so
    // that a file row is written once and not once more for each index (D1 counts them).
    expect(indexes.map(([name]) => name)).toEqual([
      "cli_codes_expires_at",
      "cli_failures_at",
      "cli_failures_key_at",
      "processed_events_at",
      "processed_events_sub_at",
      "projects_owner",
      "tokens_sub",
    ]);
    expect(indexes.find(([name]) => name === "projects_owner")).toEqual([
      "projects_owner",
      "projects",
      "CREATE INDEX projects_owner ON projects (owner_sub)",
    ]);
    db.close();
  });

  it("keys each table by what the store looks it up by", () => {
    const db = openDatabase();
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
    expect(keys("projects")).toEqual(["pk:id"]);
    expect(keys("project_files")).toEqual(["pk:project_id,path"]);
    expect(keys("project_blobs")).toEqual(["pk:project_id,hash"]);
    expect(keys("blobs")).toEqual(["pk:hash"]);
    // The version's id is the rowid; its number is unique within its project.
    expect(keys("versions")).toEqual(["u:project_id,number"]);
    expect(keys("version_files")).toEqual(["pk:version_id,path"]);
    db.close();
  });

  it("has no foreign key anywhere: deleting a project or a person names every table", () => {
    const db = openDatabase();
    for (const table of [...Object.keys(NEW_TABLES), "users", "tokens"]) {
      expect(db.raw.prepare(`PRAGMA foreign_key_list(${table})`).all(), table).toEqual([]);
    }
    db.close();
  });

  it("has no column that could hold a secret, an address or a request log, and no binary column", () => {
    const db = openDatabase();
    const names = Object.keys(NEW_TABLES).flatMap((table) =>
      db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => `${table}.${String(row.name)}`),
    );
    expect(names).toHaveLength(Object.values(NEW_TABLES).flat().length);
    const forbidden =
      /\.(token|code|secret|credential|password|jwt|cookie|header|bearer|authorization|plain|clear|raw|ip|address|agent|ua|request|referer|referrer|log|analytics|refresh|access)\b|_(token|secret|password|ip|agent|address)\b/i;
    for (const name of names) expect(name, name).not.toMatch(forbidden);
    // What a column of hashes holds is a hash and a database that says so.
    expect(names.filter((name) => name.endsWith(".hash")).sort()).toEqual([
      "blobs.hash",
      "project_blobs.hash",
      "project_files.hash",
      "version_files.hash",
    ]);
    const types = new Set(
      Object.values(NEW_TABLES)
        .flat()
        .map((column) => column[1]),
    );
    expect([...types].sort()).toEqual(["INTEGER", "TEXT"]);
    db.close();
  });

  describe("the constraints", () => {
    const project = (db: SqliteDb, id = P1, revision: number | string = 0) =>
      db.raw
        .prepare(
          "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at, revision) VALUES (?, 'u1', 'n', '', ?, ?, ?)",
        )
        .run(id, T, T, revision);
    const file = (db: SqliteDb, path = "a.meltemi", hash = sha("a"), projectId = P1) =>
      db.raw
        .prepare("INSERT INTO project_files (project_id, path, hash) VALUES (?, ?, ?)")
        .run(projectId, path, hash);
    const upload = (db: SqliteDb, hash = sha("a"), projectId = P1) =>
      db.raw
        .prepare("INSERT INTO project_blobs (project_id, hash) VALUES (?, ?)")
        .run(projectId, hash);
    const blob = (db: SqliteDb, hash = sha("a"), size: number | null = 10) =>
      db.raw
        .prepare(
          "INSERT INTO blobs (hash, size, media_type, created_at) VALUES (?, ?, 'text/plain', ?)",
        )
        .run(hash, size, T);
    const version = (db: SqliteDb, number = 1, auto: number | string = 0, projectId = P1) =>
      db.raw
        .prepare(
          "INSERT INTO versions (project_id, number, label, auto, created_by, created_at) VALUES (?, ?, NULL, ?, 'u1', ?)",
        )
        .run(projectId, number, auto, T);
    const versionFile = (db: SqliteDb, versionId = 1, hash = sha("a"), path = "a.meltemi") =>
      db.raw
        .prepare("INSERT INTO version_files (version_id, path, hash) VALUES (?, ?, ?)")
        .run(versionId, path, hash);

    it("keeps a project's id, a file's path within its project, an upload's hash within its project, a blob's hash and a version's number unique", () => {
      const db = openDatabase();
      project(db);
      expect(() => project(db)).toThrow(/UNIQUE constraint failed: projects\.id/);
      file(db);
      expect(() => file(db, "a.meltemi", sha("other"))).toThrow(
        /UNIQUE constraint failed: project_files\.project_id, project_files\.path/,
      );
      // The same path in another project is another file.
      file(db, "a.meltemi", sha("a"), "proj0000000000000002");
      upload(db);
      expect(() => upload(db)).toThrow(
        /UNIQUE constraint failed: project_blobs\.project_id, project_blobs\.hash/,
      );
      blob(db);
      expect(() => blob(db)).toThrow(/UNIQUE constraint failed: blobs\.hash/);
      version(db);
      expect(() => version(db)).toThrow(
        /UNIQUE constraint failed: versions\.project_id, versions\.number/,
      );
      version(db, 1, 0, "proj0000000000000002");
      versionFile(db);
      expect(() => versionFile(db, 1, sha("b"))).toThrow(
        /UNIQUE constraint failed: version_files\.version_id, version_files\.path/,
      );
      versionFile(db, 2);
      db.close();
    });

    it("accepts a hash that is a SHA-256 in lowercase hexadecimal, in all four tables that hold one", () => {
      const db = openDatabase();
      for (const hash of [
        "0".repeat(64),
        "f".repeat(64),
        "0123456789abcdef".repeat(4),
        sha("any"),
      ]) {
        file(db, `p-${hash.slice(0, 4)}`, hash);
        upload(db, hash);
        blob(db, hash);
        versionFile(db, 1, hash, `p-${hash.slice(0, 4)}`);
      }
      expect(count(db, "project_files") + count(db, "project_blobs")).toBe(8);
      expect(count(db, "blobs") + count(db, "version_files")).toBe(8);
      db.close();
    });

    it.each([
      ["a path", "../x.meltemi"],
      ["a base64url digest", "n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg"],
      ["63 characters", "a".repeat(63)],
      ["65 characters", "a".repeat(65)],
      ["64 hexadecimal characters and a newline", `${"a".repeat(64)}\n`],
      ["upper case hexadecimal", "A".repeat(64)],
      ["a character that is not hexadecimal", `${"a".repeat(63)}g`],
      ["nothing", ""],
    ])("refuses a hash that is %s, in every table that holds one", (_what, hash) => {
      const db = openDatabase();
      expect(() => file(db, "a", hash)).toThrow(/CHECK constraint failed/);
      expect(() => upload(db, hash)).toThrow(/CHECK constraint failed/);
      expect(() => blob(db, hash)).toThrow(/CHECK constraint failed/);
      expect(() => versionFile(db, 1, hash)).toThrow(/CHECK constraint failed/);
      expect(
        ["project_files", "project_blobs", "blobs", "version_files"].reduce(
          (n, t) => n + count(db, t),
          0,
        ),
      ).toBe(0);
      db.close();
    });

    it("accepts a project id of 20 characters of [0-9a-z] and nothing else", () => {
      const db = openDatabase();
      project(db, "abcdefghij0123456789");
      project(db, "0".repeat(20));
      project(db, "z".repeat(20));
      for (const id of [
        "",
        "short",
        "a".repeat(19),
        "a".repeat(21),
        "A".repeat(20),
        `${"a".repeat(19)}-`,
        `${"a".repeat(19)}_`,
        `${"a".repeat(19)}\n`,
        "../../../../../../../",
        `${"a".repeat(19)} `,
      ]) {
        expect(() => project(db, id), JSON.stringify(id)).toThrow(/CHECK constraint failed/);
      }
      expect(count(db, "projects")).toBe(3);
      db.close();
    });

    it("accepts only a revision of 0 or more, a size of 0 or more, a version number from 1, and auto of 0 or 1", () => {
      const db = openDatabase();
      project(db, P1, 0);
      project(db, "proj0000000000000002", 7);
      expect(() => project(db, "proj0000000000000003", -1)).toThrow(/CHECK/);
      blob(db, sha("zero"), 0);
      expect(() => blob(db, sha("negative"), -1)).toThrow(/CHECK/);
      version(db, 1, 0);
      version(db, 2, 1);
      expect(() => version(db, 0)).toThrow(/CHECK/);
      expect(() => version(db, -3)).toThrow(/CHECK/);
      expect(() => version(db, 3, 2)).toThrow(/CHECK/);
      expect(() => version(db, 3, -1)).toThrow(/CHECK/);
      expect(count(db, "versions")).toBe(2);
      db.close();
    });

    it("refuses a NULL where a value is needed, and allows one only for a label, a thumbnail time and the reserved deleted_at", () => {
      const db = openDatabase();
      expect(() =>
        db.raw
          .prepare(
            "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at) VALUES (?, 'u1', NULL, '', ?, ?)",
          )
          .run(P1, T, T),
      ).toThrow(/NOT NULL/);
      expect(() =>
        db.raw
          .prepare("INSERT INTO project_files (project_id, path, hash) VALUES (?, NULL, ?)")
          .run(P1, sha("a")),
      ).toThrow(/NOT NULL/);
      expect(() => blob(db, sha("a"), null)).toThrow(/NOT NULL/);
      project(db);
      expect(
        db.raw.prepare("SELECT revision, thumbnail_at, deleted_at FROM projects").get(),
      ).toEqual({
        revision: 0,
        thumbnail_at: null,
        deleted_at: null,
      });
      version(db);
      expect(db.raw.prepare("SELECT label FROM versions").get()).toEqual({ label: null });
      db.close();
    });

    it("lets a path be as long as the rule allows, and keeps text as it is given", () => {
      const db = openDatabase();
      const long = Array.from({ length: 12 }, () => "d".repeat(100)).join("/");
      file(db, long);
      file(db, "x'); DROP TABLE project_files;--");
      file(db, "ñ/🌊 wave.meltemi");
      expect(
        db.raw
          .prepare("SELECT path FROM project_files ORDER BY path")
          .all()
          .map((row) => String(row.path)),
      ).toEqual([long, "x'); DROP TABLE project_files;--", "ñ/🌊 wave.meltemi"].sort());
      db.close();
    });
  });
});
