// The third migration over node:sqlite: what the sharing-and-permissions design says the service
// keeps (`projects.link_access`, `members`, `invitations`, `publications`, `takedowns` and
// `users.handle`), checked against the database itself. The first two migrations are pinned by
// migration.test.ts and migration-projects.test.ts, which apply only their own files.

import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  migrationFiles,
  openDatabase,
  sqliteAvailable,
  type SqliteDb,
} from "./support/sqlite.js";

/** `name`, `type`, whether it is NOT NULL, and its position in the primary key (0: not in it). */
type Column = readonly [name: string, type: "TEXT" | "INTEGER", notNull: boolean, pk: number];

const THIRD_FILE = "0003_sharing.sql";
/** The next one adds the project to a takedown (`0004_takedown_project.sql`): one column. */
const FOURTH_FILE = "0004_takedown_project.sql";

/** The tables 0003 makes, with their columns in order. */
const NEW_TABLES: Record<string, readonly Column[]> = {
  members: [
    ["project_id", "TEXT", true, 1],
    ["sub", "TEXT", true, 2],
    ["role", "TEXT", true, 0],
    ["added_at", "TEXT", true, 0],
  ],
  invitations: [
    ["id", "TEXT", true, 1],
    ["project_id", "TEXT", true, 0],
    ["email", "TEXT", true, 0],
    ["role", "TEXT", true, 0],
    ["token", "TEXT", true, 0],
    ["created_by", "TEXT", true, 0],
    ["created_at", "TEXT", true, 0],
    ["accepted_at", "TEXT", false, 0],
  ],
  publications: [
    ["project_id", "TEXT", true, 1],
    ["handle", "TEXT", true, 0],
    ["slug", "TEXT", true, 2],
    ["published_at", "TEXT", true, 0],
    ["bytes", "INTEGER", true, 0],
  ],
  takedowns: [
    ["handle", "TEXT", true, 1],
    ["slug", "TEXT", true, 2],
    ["by_sub", "TEXT", true, 0],
    ["reason", "TEXT", true, 0],
    ["at", "TEXT", true, 3],
    // Added by 0004: the project the publication belonged to; NULL for a record that predates it.
    ["project_id", "TEXT", false, 0],
  ],
  publish_log: [
    ["project_id", "TEXT", true, 0],
    ["at", "TEXT", true, 0],
  ],
};

/** `projects` after 0003: the nine columns of 0002, then the link level. */
const PROJECTS_AFTER: readonly Column[] = [
  ["id", "TEXT", true, 1],
  ["owner_sub", "TEXT", true, 0],
  ["name", "TEXT", true, 0],
  ["description", "TEXT", true, 0],
  ["created_at", "TEXT", true, 0],
  ["updated_at", "TEXT", true, 0],
  ["revision", "INTEGER", true, 0],
  ["thumbnail_at", "TEXT", false, 0],
  ["deleted_at", "TEXT", false, 0],
  ["link_access", "TEXT", true, 0],
];

/** `users` after 0003: the seven columns of 0001 and 0002, then the handle. */
const USERS_AFTER: readonly Column[] = [
  ["sub", "TEXT", true, 1],
  ["name", "TEXT", true, 0],
  ["picture", "TEXT", true, 0],
  ["email", "TEXT", true, 0],
  ["email_verified", "INTEGER", true, 0],
  ["created_at", "TEXT", true, 0],
  ["storage_bytes", "INTEGER", true, 0],
  ["handle", "TEXT", false, 0],
];

const T = "2026-10-14T12:00:00.000Z";
const P1 = "proj0000000000000001";
const squash = (sql: unknown) => String(sql).replace(/\s+/g, " ").trim();

const source = (): string => migrationFiles().find((file) => file.name === THIRD_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

const count = (db: SqliteDb, table: string) =>
  Number(db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n);

const columnsOf = (db: SqliteDb, table: string) =>
  db.raw
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => [String(row.name), String(row.type), row.notnull === 1, Number(row.pk)]);

describe("the sharing migration file", () => {
  it("is the third numbered file", () => {
    expect(migrationFiles().map((file) => file.name)).toEqual([
      "0001_accounts.sql",
      "0002_projects.sql",
      THIRD_FILE,
      FOURTH_FILE,
    ]);
  });

  it("only creates and adds two columns: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    // Five tables (the four of sharing and the log that rates publishing), five indexes (three of
    // sharing and two of the log) and the unique one of the handle, and the two columns.
    expect(statements).toHaveLength(13);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(5);
    expect(statements.filter((s) => /^CREATE INDEX /.test(s))).toHaveLength(5);
    expect(statements.filter((s) => /^CREATE UNIQUE INDEX /.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^ALTER TABLE /.test(s)).map((s) => s.slice(0, 48))).toEqual([
      "ALTER TABLE projects ADD COLUMN link_access TEXT",
      "ALTER TABLE users ADD COLUMN handle TEXT CHECK (",
    ]);
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE (TABLE|INDEX|UNIQUE INDEX) |ALTER TABLE (projects|users) ADD COLUMN )/,
      );
    }
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    // eslint-disable-next-line no-control-regex
    expect(source()).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the sharing migration", () => {
  it("creates the five tables beside the eleven of the first two, and nothing else", () => {
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
      "invitations",
      "members",
      "processed_events",
      "project_blobs",
      "project_files",
      "projects",
      "publications",
      "publish_log",
      "takedowns",
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
      expect(columnsOf(db, table)).toEqual(columns.map((column) => [...column]));
      db.close();
    });
  }

  it("adds link_access to projects, last, as text that defaults to private", () => {
    const db = openDatabase();
    expect(columnsOf(db, "projects")).toEqual(PROJECTS_AFTER.map((column) => [...column]));
    const info = db.raw.prepare("PRAGMA table_info(projects)").all();
    expect(info.at(-1)?.dflt_value).toBe("'private'");
    db.close();
  });

  it("adds handle to users, last, as text that may be NULL", () => {
    const db = openDatabase();
    expect(columnsOf(db, "users")).toEqual(USERS_AFTER.map((column) => [...column]));
    const info = db.raw.prepare("PRAGMA table_info(users)").all();
    expect(info.at(-1)?.dflt_value).toBeNull();
    db.close();
  });

  it("makes every new table STRICT, and the tables with a row per person or per project WITHOUT ROWID", () => {
    const db = openDatabase();
    const kinds = db.raw
      .prepare("PRAGMA table_list")
      .all()
      .filter((row) => String(row.name) in NEW_TABLES)
      .map((row) => [String(row.name), Number(row.strict), Number(row.wr)])
      .sort();
    expect(kinds).toEqual([
      ["invitations", 1, 0],
      ["members", 1, 1],
      ["publications", 1, 1],
      // The log has a rowid: two requests in one millisecond are two rows.
      ["publish_log", 1, 0],
      ["takedowns", 1, 1],
    ]);
    db.close();
  });

  it("gives a project and a person who were there before the columns a private link and no handle, and keeps their rows", () => {
    const before = migrationFiles().filter((file) => file.name < THIRD_FILE);
    const third = migrationFiles().filter((file) => file.name === THIRD_FILE);
    const db = openDatabase({ migrations: before });
    db.raw
      .prepare(
        "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', 'ana@example.com', 1, ?)",
      )
      .run(T);
    db.raw
      .prepare(
        "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at) VALUES (?, 'u1', 'Plan', 'About', ?, ?)",
      )
      .run(P1, T, T);
    applyMigrations(db.raw, third);
    expect(db.raw.prepare("SELECT * FROM users").all()).toEqual([
      {
        sub: "u1",
        name: "Ana",
        picture: "",
        email: "ana@example.com",
        email_verified: 1,
        created_at: T,
        storage_bytes: 0,
        handle: null,
      },
    ]);
    expect(db.raw.prepare("SELECT id, name, link_access FROM projects").all()).toEqual([
      { id: P1, name: "Plan", link_access: "private" },
    ]);
    db.close();
  });

  it("makes exactly six indexes beyond the keys: members by person, invitations by project and by email, the handle, and the publish log by project and by time", () => {
    const db = openDatabase();
    const indexes = db.raw
      .prepare(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
      )
      .all()
      .map((row) => [String(row.name), String(row.tbl_name), squash(row.sql)]);
    // The first two migrations' seven, and the six of this: nothing on a token or a slug beyond
    // their unique keys, so that a row is written once and not once more for each index.
    expect(indexes.map(([name]) => name)).toEqual([
      "cli_codes_expires_at",
      "cli_failures_at",
      "cli_failures_key_at",
      "invitations_email",
      "invitations_project",
      "members_sub",
      "processed_events_at",
      "processed_events_sub_at",
      "projects_owner",
      "publish_log_at",
      "publish_log_project",
      "tokens_sub",
      "users_handle",
    ]);
    // The publish log: a project's requests of the hour (the count that rates it, and the cascade),
    // and, for the sweep, its rows by time whatever the project.
    expect(indexes.filter(([name]) => name.startsWith("publish_log_"))).toEqual([
      ["publish_log_at", "publish_log", "CREATE INDEX publish_log_at ON publish_log (at)"],
      [
        "publish_log_project",
        "publish_log",
        "CREATE INDEX publish_log_project ON publish_log (project_id, at)",
      ],
    ]);
    expect(
      indexes.filter(
        ([name]) => /^(members|invitations|users)_/.test(name) && name !== "users_handle",
      ),
    ).toEqual([
      ["invitations_email", "invitations", "CREATE INDEX invitations_email ON invitations (email)"],
      [
        "invitations_project",
        "invitations",
        "CREATE INDEX invitations_project ON invitations (project_id)",
      ],
      ["members_sub", "members", "CREATE INDEX members_sub ON members (sub)"],
    ]);
    // Unique, and partial: a person without a handle has no row in it.
    expect(indexes.find(([name]) => name === "users_handle")).toEqual([
      "users_handle",
      "users",
      "CREATE UNIQUE INDEX users_handle ON users (handle) WHERE handle IS NOT NULL",
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
    expect(keys("members")).toEqual(["pk:project_id,sub"]);
    expect(keys("invitations")).toEqual(["pk:id", "u:token"]);
    expect(keys("publications")).toEqual(["pk:project_id,slug", "u:handle,slug"]);
    expect(keys("takedowns")).toEqual(["pk:handle,slug,at"]);
    // The log has no key of its own: every request is a row.
    expect(keys("publish_log")).toEqual([]);
    expect(keys("users")).toEqual(["pk:sub", "c:handle"].sort());
    db.close();
  });

  it("has no foreign key anywhere: deleting a project or a person names every table", () => {
    const db = openDatabase();
    for (const table of [...Object.keys(NEW_TABLES), "users", "projects"]) {
      expect(db.raw.prepare(`PRAGMA foreign_key_list(${table})`).all(), table).toEqual([]);
    }
    db.close();
  });

  it("holds no column of an API token, a password or a request log (the publish log is a project and a time, no person and no address): the invitation's token is the one secret, kept on purpose", () => {
    const db = openDatabase();
    const names = Object.keys(NEW_TABLES).flatMap((table) =>
      columnsOf(db, table).map((column) => `${table}.${String(column[0])}`),
    );
    expect(names).toHaveLength(Object.values(NEW_TABLES).flat().length);
    const forbidden =
      /\.(code|secret|credential|password|jwt|cookie|header|bearer|authorization|plain|clear|raw|ip|address|agent|ua|request|referer|referrer|log|analytics|refresh|access|hash)\b|_(secret|password|ip|agent|address)\b/i;
    for (const name of names) expect(name, name).not.toMatch(forbidden);
    expect(names.filter((name) => /token/.test(name))).toEqual(["invitations.token"]);
    const types = new Set(
      Object.values(NEW_TABLES)
        .flat()
        .map((column) => column[1]),
    );
    expect([...types].sort()).toEqual(["INTEGER", "TEXT"]);
    db.close();
  });

  describe("the constraints", () => {
    const run = (db: SqliteDb, sql: string, ...values: (string | number | null)[]) =>
      db.raw.prepare(sql).run(...values);

    it("takes a link level of private, view or edit and nothing else, and never NULL", () => {
      const db = openDatabase();
      run(
        db,
        "INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at) VALUES (?, 'u1', 'n', '', ?, ?)",
        P1,
        T,
        T,
      );
      for (const level of ["view", "edit", "private"]) {
        run(db, "UPDATE projects SET link_access = ?", level);
      }
      for (const bad of ["public", "View", "", "view ", "owner"]) {
        expect(() => run(db, "UPDATE projects SET link_access = ?", bad), bad).toThrow(
          /CHECK constraint failed/,
        );
      }
      expect(() => run(db, "UPDATE projects SET link_access = NULL")).toThrow(/NOT NULL/);
      db.close();
    });

    it("takes a role of viewer or editor in members and invitations", () => {
      const db = openDatabase();
      for (const role of ["viewer", "editor"]) {
        run(
          db,
          "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, ?, ?, ?)",
          P1,
          `u-${role}`,
          role,
          T,
        );
      }
      for (const bad of ["owner", "Editor", "admin", "", "viewer "]) {
        expect(
          () =>
            run(
              db,
              "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, 'x', ?, ?)",
              P1,
              bad,
              T,
            ),
          bad,
        ).toThrow(/CHECK constraint failed/);
      }
      db.close();
    });

    it("refuses a NULL where a value is needed, and allows one only for the time an invitation was accepted and for a person's handle", () => {
      const db = openDatabase();
      expect(() =>
        run(
          db,
          "INSERT INTO members (project_id, sub, role, added_at) VALUES (?, NULL, 'viewer', ?)",
          P1,
          T,
        ),
      ).toThrow(/NOT NULL/);
      expect(() =>
        run(
          db,
          "INSERT INTO publications (project_id, handle, slug, published_at, bytes) VALUES (?, 'abc', 'a', ?, NULL)",
          P1,
          T,
        ),
      ).toThrow(/NOT NULL/);
      expect(() =>
        run(
          db,
          "INSERT INTO takedowns (handle, slug, by_sub, reason, at) VALUES ('abc', 'a', 'x', NULL, ?)",
          T,
        ),
      ).toThrow(/NOT NULL/);
      expect(() => run(db, "INSERT INTO publish_log (project_id, at) VALUES (NULL, ?)", T)).toThrow(
        /NOT NULL/,
      );
      expect(() =>
        run(db, "INSERT INTO publish_log (project_id, at) VALUES (?, NULL)", P1),
      ).toThrow(/NOT NULL/);
      run(
        db,
        "INSERT INTO invitations (id, project_id, email, role, token, created_by, created_at) VALUES (?, ?, 'a@b', 'viewer', ?, 'o', ?)",
        "0".repeat(32),
        P1,
        "1".repeat(32),
        T,
      );
      expect(db.raw.prepare("SELECT accepted_at FROM invitations").get()).toEqual({
        accepted_at: null,
      });
      db.close();
    });
  });
});
