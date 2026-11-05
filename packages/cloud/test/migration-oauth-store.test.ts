// The tenth migration over node:sqlite (change agent-mcp): the authorization server's store, the
// table its library reads and writes as a KV namespace (`src/oauth/store.ts`), in place of the KV
// namespace `OAUTH_KV`.

import { describe, expect, it } from "vitest";
import { migrationFiles, openDatabase, sqliteAvailable } from "./support/sqlite.js";

const TENTH_FILE = "0010_oauth_store.sql";

const source = (): string => migrationFiles().find((file) => file.name === TENTH_FILE)?.sql ?? "";

/** The statements of a migration: comments removed, split at the semicolons. */
const statementsOf = (sql: string): string[] =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

describe("the authorization server's store migration file", () => {
  it("is numbered 0010, the last", () => {
    expect(
      migrationFiles()
        .map((file) => file.name)
        .at(-1),
    ).toBe(TENTH_FILE);
  });

  it("only creates one table and its index: no transaction control, no pragma, no data, no drop", () => {
    const statements = statementsOf(source());
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE TABLE oauth_store \(/);
    expect(statements[0]).toMatch(/\) STRICT, WITHOUT ROWID$/);
    expect(statements[1]).toBe(
      "CREATE INDEX oauth_store_expires_at ON oauth_store (expires_at) WHERE expires_at IS NOT NULL",
    );
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

describe.skipIf(!sqliteAvailable)("the authorization server's store migration", () => {
  it("makes the table with its columns, one row per key", () => {
    const db = openDatabase();
    expect(
      db.raw
        .prepare("PRAGMA table_info(oauth_store)")
        .all()
        .map((row) => [String(row.name), String(row.type), Number(row.notnull), Number(row.pk)]),
    ).toEqual([
      ["key", "TEXT", 1, 1],
      ["value", "TEXT", 1, 0],
      ["expires_at", "INTEGER", 0, 0],
      ["metadata", "TEXT", 0, 0],
    ]);
    expect(db.raw.prepare("SELECT count(*) AS n FROM oauth_store").get()).toEqual({ n: 0 });
    db.close();
  });

  it.each([
    ["an empty key", ["", "v", null, null]],
    ["a key of 513 characters", ["k".repeat(513), "v", null, null]],
    ["no value", ["k", null, null, null]],
    ["an expiry that is not whole seconds", ["k", "v", 1.5, null]],
    ["an expiry that is text", ["k", "v", "2026-11-05", null]],
  ])("refuses %s", (_label, values) => {
    const db = openDatabase();
    const insert = db.raw.prepare(
      "INSERT INTO oauth_store (key, value, expires_at, metadata) VALUES (?, ?, ?, ?)",
    );
    expect(() => insert.run(...(values as (string | number | null)[]))).toThrow();
    db.close();
  });
});
