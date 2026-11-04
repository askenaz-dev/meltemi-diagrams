// The sixth migration over node:sqlite: the administrators an owner invited, the invitations to
// become one and the administration log (`service-administration`).

import { describe, expect, it } from "vitest";
import { migrationFiles, openDatabase, sqliteAvailable } from "./support/sqlite.js";

const SIXTH_FILE = "0006_administrators.sql";
const T = "2026-10-29T12:00:00.000Z";
const ID = "0123456789abcdef0123456789abcdef";

const source = (): string => migrationFiles().find((file) => file.name === SIXTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

describe("the administrators migration file", () => {
  it("is the sixth numbered file", () => {
    expect(migrationFiles().map((file) => file.name)[5]).toBe(SIXTH_FILE);
  });

  it("only creates three tables and three indexes: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements).toHaveLength(6);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(3);
    expect(statements.filter((s) => /^CREATE INDEX /.test(s))).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).not.toMatch(
        /\b(BEGIN|COMMIT|ROLLBACK|PRAGMA|INSERT|UPDATE|DELETE|DROP)\b/i,
      );
    }
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    // eslint-disable-next-line no-control-regex
    expect(source()).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the administrators migration", () => {
  it("makes the three tables with their columns", () => {
    const db = openDatabase();
    const columns = (table: string) =>
      db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row.name));
    expect(columns("administrators")).toEqual(["sub", "invited_by", "since"]);
    expect(columns("admin_invitations")).toEqual([
      "id",
      "email",
      "invited_by",
      "created_at",
      "expires_at",
      "accepted_at",
      "declined_at",
      "revoked_at",
    ]);
    expect(columns("admin_log")).toEqual([
      "id",
      "at",
      "by_sub",
      "action",
      "target_sub",
      "target_email",
      "detail",
    ]);
    db.close();
  });

  it("refuses an upper-case email, an invitation ended twice and an unknown action", () => {
    const db = openDatabase();
    const invite = db.raw.prepare(
      "INSERT INTO admin_invitations (id, email, invited_by, created_at, expires_at, accepted_at, declined_at) VALUES (?, ?, 'u0', ?, ?, ?, ?)",
    );
    expect(() => invite.run(ID, "Ana@example.com", T, T, null, null)).toThrow();
    expect(() => invite.run(ID, "ana@example.com", T, T, T, T)).toThrow();
    invite.run(ID, "ana@example.com", T, T, T, null);
    const log = db.raw.prepare(
      "INSERT INTO admin_log (id, at, by_sub, action) VALUES (?, ?, 'u0', ?)",
    );
    expect(() => log.run(ID, T, "promote")).toThrow();
    log.run(ID, T, "grant");
    expect(db.raw.prepare("SELECT detail FROM admin_log").all()).toEqual([{ detail: "" }]);
    db.close();
  });
});
