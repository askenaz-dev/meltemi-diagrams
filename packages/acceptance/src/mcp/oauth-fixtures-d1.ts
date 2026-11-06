// A parameterized D1 HTTP adapter. It is used only by privileged setup/cleanup, never the suite.
import type { D1Like, D1PreparedLike } from "../../../cloud/src/env.js";
import { fixtureFailure } from "./oauth-fixture-format.js";

export interface D1Connection {
  readonly accountId: string;
  readonly databaseId: string;
  readonly token: string;
  readonly databaseName: string;
}
interface Query {
  readonly sql: string;
  readonly params: readonly unknown[];
}
interface Result {
  results: Record<string, unknown>[];
  meta?: { changes?: number };
}

export function remoteD1(connection: D1Connection, fetcher: typeof fetch = fetch) {
  if (
    !/^[a-f0-9]{32}$/.test(connection.accountId) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(connection.databaseId) ||
    !connection.token
  )
    fixtureFailure();
  const base = `https://api.cloudflare.com/client/v4/accounts/${connection.accountId}/d1/database/${connection.databaseId}`;
  async function request(path: string, body?: unknown): Promise<unknown> {
    try {
      const answer = await fetcher(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${connection.token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      if (!answer.ok) return fixtureFailure();
      const data = (await answer.json()) as { success?: boolean; result?: unknown };
      if (data.success !== true) return fixtureFailure();
      return data.result;
    } catch {
      return fixtureFailure();
    }
  }
  async function query(queries: readonly Query[]): Promise<Result[]> {
    const result = await request("/query", queries.length === 1 ? queries[0] : { batch: queries });
    if (!Array.isArray(result) || result.length !== queries.length) return fixtureFailure();
    for (const row of result)
      if (row?.success !== true || !Array.isArray(row.results)) fixtureFailure();
    return result as Result[];
  }
  class Statement implements D1PreparedLike {
    constructor(
      readonly sql: string,
      readonly params: readonly unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params);
    }
    async all<T = Record<string, unknown>>() {
      const [result] = await query([this]);
      return { results: result!.results as T[] };
    }
    async first<T = Record<string, unknown>>() {
      return (await this.all<T>()).results[0] ?? null;
    }
    async run() {
      const [result] = await query([this]);
      return { meta: result!.meta };
    }
  }
  const db: D1Like = {
    prepare(sql) {
      // Only the canonical adapter's oauth_store SQL, exact cleanup checks and test-account reads.
      if (
        !/^(?:SELECT .+ FROM (?:oauth_store|users|app_uses) WHERE |INSERT INTO oauth_store \(|DELETE FROM (?:oauth_store WHERE key = \?|app_uses WHERE sub = \? AND grant_id = \?))/.test(
          sql,
        ) ||
        /;|--|\/\*/.test(sql)
      )
        fixtureFailure();
      if (
        /^(?:INSERT|DELETE)/.test(sql) &&
        !/^(?:INSERT INTO oauth_store \(key, value, expires_at, metadata\) VALUES \(\?, \?, \?, \?\) ON CONFLICT \(key\) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, metadata = excluded.metadata|DELETE FROM oauth_store WHERE key = \?|DELETE FROM app_uses WHERE sub = \? AND grant_id = \?)$/.test(
          sql,
        )
      )
        fixtureFailure();
      return new Statement(sql);
    },
    async batch(statements) {
      if (!statements.every((statement) => statement instanceof Statement)) return fixtureFailure();
      return query(statements as Statement[]);
    },
  };
  return {
    db,
    async verify() {
      const metadata = (await request("")) as { uuid?: string; name?: string };
      if (metadata?.uuid !== connection.databaseId || metadata.name !== connection.databaseName)
        fixtureFailure();
    },
  };
}
