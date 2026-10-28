// The fifth migration over node:sqlite: the entitlement to export without the Meltemi branding,
// three columns of `users` (`unbranded_exports`, `unbranded_exports_by`, `unbranded_exports_at`).

import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  migrationFiles,
  openDatabase,
  sqliteAvailable,
} from "./support/sqlite.js";

const FIFTH_FILE = "0005_unbranded_exports.sql";
const T = "2026-10-28T12:00:00.000Z";

const source = (): string => migrationFiles().find((file) => file.name === FIFTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

describe("the unbranded exports migration file", () => {
  it("is the fifth numbered file", () => {
    expect(migrationFiles().map((file) => file.name)[4]).toBe(FIFTH_FILE);
  });

  it("only adds three columns to users: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements.map((s) => s.replace(/\s+/g, " "))).toEqual([
      "ALTER TABLE users ADD COLUMN unbranded_exports INTEGER NOT NULL DEFAULT 0 CHECK (unbranded_exports IN (0, 1))",
      "ALTER TABLE users ADD COLUMN unbranded_exports_by TEXT",
      "ALTER TABLE users ADD COLUMN unbranded_exports_at TEXT",
    ]);
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    // eslint-disable-next-line no-control-regex
    expect(source()).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the unbranded exports migration", () => {
  it("adds the three columns to users, last, the flag 0 and the other two NULL by default", () => {
    const db = openDatabase();
    const info = db.raw.prepare("PRAGMA table_info(users)").all();
    expect(
      info.slice(-3).map((row) => [String(row.name), String(row.type), row.notnull === 1]),
    ).toEqual([
      ["unbranded_exports", "INTEGER", true],
      ["unbranded_exports_by", "TEXT", false],
      ["unbranded_exports_at", "TEXT", false],
    ]);
    expect(info.at(-3)?.dflt_value).toBe("0");
    db.close();
  });

  it("refuses a flag that is not 0 or 1", () => {
    const db = openDatabase();
    db.raw
      .prepare(
        "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', 'ana@example.com', 1, ?)",
      )
      .run(T);
    expect(() =>
      db.raw.prepare("UPDATE users SET unbranded_exports = 2 WHERE sub = 'u1'").run(),
    ).toThrow();
    db.close();
  });

  it("gives a person who was there before the columns no entitlement, and keeps their row", () => {
    const before = migrationFiles().filter((file) => file.name < FIFTH_FILE);
    const fifth = migrationFiles().filter((file) => file.name === FIFTH_FILE);
    const db = openDatabase({ migrations: before });
    db.raw
      .prepare(
        "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', 'ana@example.com', 1, ?)",
      )
      .run(T);
    applyMigrations(db.raw, fifth);
    expect(
      db.raw
        .prepare(
          "SELECT sub, name, unbranded_exports, unbranded_exports_by, unbranded_exports_at FROM users",
        )
        .all(),
    ).toEqual([
      {
        sub: "u1",
        name: "Ana",
        unbranded_exports: 0,
        unbranded_exports_by: null,
        unbranded_exports_at: null,
      },
    ]);
    db.close();
  });
});
