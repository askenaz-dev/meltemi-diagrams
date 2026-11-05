// The seventh migration over node:sqlite: the sponsorships GitHub Sponsors tells the Worker of
// (`sponsorship-entitlement`).

import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  migrationFiles,
  openDatabase,
  sqliteAvailable,
} from "./support/sqlite.js";

const SEVENTH_FILE = "0007_sponsorships.sql";
const T = "2026-11-04T12:00:00.000Z";
const ID = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";

const source = (): string => migrationFiles().find((file) => file.name === SEVENTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

const INSERT =
  "INSERT INTO sponsorships (id, delivery_id, sponsor_login, sponsor_id, sponsor_type, one_time, amount_cents, privacy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

describe("the sponsorships migration file", () => {
  it("is the seventh numbered file", () => {
    expect(migrationFiles().map((file) => file.name)[6]).toBe(SEVENTH_FILE);
  });

  it("only creates one table and two indexes: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements).toHaveLength(3);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^CREATE INDEX /.test(s))).toHaveLength(2);
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

describe.skipIf(!sqliteAvailable)("the sponsorships migration", () => {
  it("makes the table with its columns, and an active, unclaimed row by default", () => {
    const db = openDatabase();
    expect(
      db.raw
        .prepare("PRAGMA table_info(sponsorships)")
        .all()
        .map((row) => String(row.name)),
    ).toEqual([
      "id",
      "delivery_id",
      "sponsor_login",
      "sponsor_id",
      "sponsor_type",
      "one_time",
      "amount_cents",
      "privacy",
      "status",
      "created_at",
      "claimed_by_sub",
      "claimed_at",
    ]);
    db.raw.prepare(INSERT).run(ID, "d1", "ana", 1, "User", 0, 500, "public", T);
    expect(
      db.raw.prepare("SELECT status, claimed_by_sub, claimed_at FROM sponsorships").all(),
    ).toEqual([{ status: "active", claimed_by_sub: null, claimed_at: null }]);
    db.close();
  });

  it("refuses a repeated delivery, an unknown status or privacy, a half claim and a login of 40 characters", () => {
    const db = openDatabase();
    const insert = db.raw.prepare(INSERT);
    insert.run(ID, "d1", "ana", 1, "User", 0, 500, "public", T);
    expect(() => insert.run(OTHER, "d1", "ben", 2, "User", 0, 500, "public", T)).toThrow();
    expect(() => insert.run(OTHER, "d2", "ben", 2, "User", 0, 500, "secret", T)).toThrow();
    expect(() => insert.run(OTHER, "d2", "ben", 2, "User", 2, 500, "public", T)).toThrow();
    expect(() => insert.run(OTHER, "d2", "b".repeat(40), 2, "User", 0, 500, "public", T)).toThrow();
    expect(() => db.raw.prepare("UPDATE sponsorships SET status = 'ended'").run()).toThrow();
    expect(() => db.raw.prepare("UPDATE sponsorships SET claimed_by_sub = 'u1'").run()).toThrow();
    db.close();
  });

  it("compares logins ignoring the case of their letters", () => {
    const db = openDatabase();
    db.raw.prepare(INSERT).run(ID, "d1", "Ana-Dev", 1, "User", 0, 500, "public", T);
    expect(
      db.raw.prepare("SELECT id FROM sponsorships WHERE sponsor_login = ?").all("ana-dev"),
    ).toEqual([{ id: ID }]);
    db.close();
  });

  it("applies over the six before it, and leaves their rows as they were", () => {
    const before = migrationFiles().filter((file) => file.name < SEVENTH_FILE);
    const seventh = migrationFiles().filter((file) => file.name === SEVENTH_FILE);
    const db = openDatabase({ migrations: before });
    db.raw
      .prepare(
        "INSERT INTO users (sub, name, picture, email, email_verified, created_at) VALUES ('u1', 'Ana', '', 'ana@example.com', 1, ?)",
      )
      .run(T);
    applyMigrations(db.raw, seventh);
    expect(db.raw.prepare("SELECT sub, unbranded_exports FROM users").all()).toEqual([
      { sub: "u1", unbranded_exports: 0 },
    ]);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM sponsorships").get()).toEqual({ n: 0 });
    db.close();
  });
});
