// The eighth migration over node:sqlite (change agent-mcp): the idempotency keys of `POST
// /api/projects` and `PUT /api/projects/:id/files` and the windows of the MCP endpoint's rates.

import { describe, expect, it } from "vitest";
import { migrationFiles, openDatabase, sqliteAvailable } from "./support/sqlite.js";

const EIGHTH_FILE = "0008_idempotency.sql";
const T = "2026-11-04T12:00:00.000Z";
const HASH = "a".repeat(64);

const source = (): string => migrationFiles().find((file) => file.name === EIGHTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

describe("the idempotency migration file", () => {
  it("is numbered 0008, after the sponsorships' 0007 and before Connected apps' 0009", () => {
    const names = migrationFiles().map((file) => file.name);
    expect(names).toContain(EIGHTH_FILE);
    expect(names.slice(-2)).toEqual([EIGHTH_FILE, "0009_connected_apps.sql"]);
  });

  it("only creates two tables and an index: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements).toHaveLength(3);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(2);
    expect(statements.filter((s) => /^CREATE INDEX /.test(s))).toHaveLength(1);
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

describe.skipIf(!sqliteAvailable)("the idempotency migration", () => {
  const insertKey =
    "INSERT INTO idempotency (sub, key, route, request_hash, status, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

  it("makes the two tables with their columns", () => {
    const db = openDatabase();
    const columns = (table: string) =>
      db.raw
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row.name));
    expect(columns("idempotency")).toEqual([
      "sub",
      "key",
      "route",
      "request_hash",
      "status",
      "body",
      "created_at",
    ]);
    expect(columns("call_windows")).toEqual(["sub", "kind", "minute", "count"]);
    db.close();
  });

  it("keeps one row per account and key", () => {
    const db = openDatabase();
    db.raw.prepare(insertKey).run("u1", "k1", "POST /api/projects", HASH, null, null, T);
    db.raw.prepare(insertKey).run("u2", "k1", "POST /api/projects", HASH, null, null, T);
    expect(() =>
      db.raw.prepare(insertKey).run("u1", "k1", "POST /api/projects", HASH, 201, "{}", T),
    ).toThrow();
    db.close();
  });

  it.each([
    ["a key of 65 characters", ["u1", "k".repeat(65), "r", HASH, null, null, T]],
    ["a key with a space", ["u1", "k 1", "r", HASH, null, null, T]],
    ["an empty key", ["u1", "", "r", HASH, null, null, T]],
    ["a hash that is not SHA-256", ["u1", "k1", "r", "abc", null, null, T]],
    ["a status without a body", ["u1", "k1", "r", HASH, 201, null, T]],
    ["a status that is not one", ["u1", "k1", "r", HASH, 42, "{}", T]],
  ])("refuses %s", (_label, values) => {
    const db = openDatabase();
    expect(() =>
      db.raw.prepare(insertKey).run(...(values as (string | number | null)[])),
    ).toThrow();
    db.close();
  });

  it("refuses a call window of another kind, minute or count", () => {
    const db = openDatabase();
    const insert = db.raw.prepare(
      "INSERT INTO call_windows (sub, kind, minute, count) VALUES (?, ?, ?, ?)",
    );
    insert.run("u1", "call", "2026-11-04T12:00", 1);
    expect(() => insert.run("u1", "other", "2026-11-04T12:00", 1)).toThrow();
    expect(() => insert.run("u1", "preview", "2026-11-04", 1)).toThrow();
    expect(() => insert.run("u1", "preview", "2026-11-04T12:00", 0)).toThrow();
    db.close();
  });
});
