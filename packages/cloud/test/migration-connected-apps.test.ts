// The ninth migration over node:sqlite (change agent-mcp): when each OAuth grant of an account was
// last used, which Connected apps shows beside the grants the authorization server keeps in KV.

import { describe, expect, it } from "vitest";
import { migrationFiles, openDatabase, sqliteAvailable } from "./support/sqlite.js";

const NINTH_FILE = "0009_connected_apps.sql";
const T = "2026-11-05T12:00:00.000Z";

const source = (): string => migrationFiles().find((file) => file.name === NINTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

describe("the connected apps migration file", () => {
  it("is numbered 0009, the last", () => {
    expect(
      migrationFiles()
        .map((file) => file.name)
        .at(-1),
    ).toBe(NINTH_FILE);
  });

  it("only creates one table: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^CREATE TABLE app_uses /);
    expect(statements[0]).not.toMatch(
      /\b(BEGIN|COMMIT|ROLLBACK|PRAGMA|INSERT|UPDATE|DELETE|DROP)\b/i,
    );
    expect(statements[0]).toMatch(/\) STRICT, WITHOUT ROWID$/);
  });

  it("is plain ASCII, so no tool reads it differently", () => {
    // eslint-disable-next-line no-control-regex
    expect(source()).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });
});

describe.skipIf(!sqliteAvailable)("the connected apps migration", () => {
  const insert = "INSERT INTO app_uses (sub, grant_id, last_used_at) VALUES (?, ?, ?)";

  it("makes the table with its columns, one row per account and grant", () => {
    const db = openDatabase();
    expect(
      db.raw
        .prepare("PRAGMA table_info(app_uses)")
        .all()
        .map((row) => [String(row.name), Number(row.pk)]),
    ).toEqual([
      ["sub", 1],
      ["grant_id", 2],
      ["last_used_at", 0],
    ]);
    db.raw.prepare(insert).run("u1", "g1", T);
    db.raw.prepare(insert).run("u2", "g1", T);
    expect(() => db.raw.prepare(insert).run("u1", "g1", T)).toThrow();
    db.close();
  });

  it.each([
    ["an empty grant id", ["u1", "", T]],
    ["a grant id of 65 characters", ["u1", "g".repeat(65), T]],
    ["no time", ["u1", "g1", null]],
    ["no account", [null, "g1", T]],
  ])("refuses %s", (_label, values) => {
    const db = openDatabase();
    expect(() => db.raw.prepare(insert).run(...(values as (string | number | null)[]))).toThrow();
    db.close();
  });
});
