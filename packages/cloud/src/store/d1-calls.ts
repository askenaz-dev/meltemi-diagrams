// The idempotency keys, the call windows and the last uses of OAuth grants over D1 (`CallsStore`, the
// tables of `migrations/0008_idempotency.sql` and `0009_connected_apps.sql`). A module of its own,
// which `d1Store` spreads into the store, so that the change that added it touches the rest of the
// store in two places only: that spread, and the tables the deletion of a person names
// (`DELETE_CALL_ROWS`).

import type { D1Like } from "../env.js";
import type { CallsStore, KeyOutcome } from "./types.js";

/** The statements that remove a person's rows of these tables, for `applyUserDeleted`'s batch. */
export const DELETE_CALL_ROWS = [
  "DELETE FROM idempotency WHERE sub = ?",
  "DELETE FROM call_windows WHERE sub = ?",
  "DELETE FROM app_uses WHERE sub = ?",
] as const;

const SWEEP_ACCOUNT_KEYS = "DELETE FROM idempotency WHERE sub = ? AND created_at < ?";
const DROP_STALE_CLAIM =
  "DELETE FROM idempotency WHERE sub = ? AND key = ? AND status IS NULL AND created_at < ?";
const CLAIM_KEY =
  "INSERT INTO idempotency (sub, key, route, request_hash, status, body, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?) ON CONFLICT (sub, key) DO NOTHING";
const SELECT_KEY =
  "SELECT route, request_hash, status, body FROM idempotency WHERE sub = ? AND key = ?";
const KEEP_ANSWER =
  "UPDATE idempotency SET status = ?, body = ? WHERE sub = ? AND key = ? AND status IS NULL";
const RELEASE_KEY = "DELETE FROM idempotency WHERE sub = ? AND key = ? AND status IS NULL";
const SWEEP_KEYS = "DELETE FROM idempotency WHERE created_at < ?";
const DROP_EARLIER_WINDOWS = "DELETE FROM call_windows WHERE sub = ? AND kind = ? AND minute < ?";
const COUNT_CALL =
  "INSERT INTO call_windows (sub, kind, minute, count) VALUES (?, ?, ?, 1) ON CONFLICT (sub, kind, minute) DO UPDATE SET count = count + 1";
const SELECT_COUNT = "SELECT count FROM call_windows WHERE sub = ? AND kind = ? AND minute = ?";
const TOUCH_APP =
  "INSERT INTO app_uses (sub, grant_id, last_used_at) VALUES (?, ?, ?) ON CONFLICT (sub, grant_id) DO UPDATE SET last_used_at = excluded.last_used_at WHERE app_uses.last_used_at < ?";
const SELECT_APP_USES = "SELECT grant_id, last_used_at FROM app_uses WHERE sub = ?";
const FORGET_APP = "DELETE FROM app_uses WHERE sub = ? AND grant_id = ?";

interface KeyRecord {
  route: string;
  request_hash: string;
  status: number | null;
  body: string | null;
}

/** What a batch answered for a statement: its rows, or an error when the driver gave none. */
function rowsOf<T>(answer: unknown): T[] {
  const results = (answer as { results?: unknown } | null | undefined)?.results;
  if (!Array.isArray(results)) throw new Error("the database did not answer the read of a batch");
  return results as T[];
}

function changesOf(answer: unknown): number {
  const changes = (answer as { meta?: { changes?: unknown } } | null | undefined)?.meta?.changes;
  if (typeof changes !== "number") throw new Error("the database did not report the rows changed");
  return changes;
}

export function d1Calls(db: D1Like): CallsStore {
  return {
    async claimKey(claim, expiredBefore, staleBefore): Promise<KeyOutcome> {
      const { sub, key } = claim;
      // One transaction: the account's old keys and an abandoned claim go, the key is claimed if it
      // is free, and the row is read as the claim left it.
      const answers = await db.batch([
        db.prepare(SWEEP_ACCOUNT_KEYS).bind(sub, expiredBefore),
        db.prepare(DROP_STALE_CLAIM).bind(sub, key, staleBefore),
        db.prepare(CLAIM_KEY).bind(sub, key, claim.route, claim.hash, claim.at),
        db.prepare(SELECT_KEY).bind(sub, key),
      ]);
      if (changesOf(answers[2]) > 0) return { status: "claimed" };
      const row = rowsOf<KeyRecord>(answers[3])[0];
      if (!row) throw new Error("the database lost a key it refused to claim");
      return {
        status: "kept",
        route: row.route,
        hash: row.request_hash,
        answer:
          row.status === null || row.body === null
            ? null
            : { status: Number(row.status), body: row.body },
      };
    },
    async keepAnswer(sub, key, answer) {
      await db.prepare(KEEP_ANSWER).bind(answer.status, answer.body, sub, key).run();
    },
    async releaseKey(sub, key) {
      await db.prepare(RELEASE_KEY).bind(sub, key).run();
    },
    async sweepKeys(expiredBefore) {
      await db.prepare(SWEEP_KEYS).bind(expiredBefore).run();
    },
    async countCall(sub, kind, window) {
      // One transaction: the count read is the one this call made.
      const answers = await db.batch([
        db.prepare(DROP_EARLIER_WINDOWS).bind(sub, kind, window),
        db.prepare(COUNT_CALL).bind(sub, kind, window),
        db.prepare(SELECT_COUNT).bind(sub, kind, window),
      ]);
      const row = rowsOf<{ count: number }>(answers[2])[0];
      if (!row) throw new Error("the database did not count the call");
      return Number(row.count);
    },
    async touchApp(sub, grantId, at, since) {
      await db.prepare(TOUCH_APP).bind(sub, grantId, at, since).run();
    },
    async appUses(sub) {
      const { results } = await db
        .prepare(SELECT_APP_USES)
        .bind(sub)
        .all<{ grant_id: string; last_used_at: string }>();
      return new Map(results.map((row) => [row.grant_id, row.last_used_at]));
    },
    async forgetApps(sub, grantIds) {
      if (grantIds.length === 0) return;
      await db.batch(grantIds.map((grantId) => db.prepare(FORGET_APP).bind(sub, grantId)));
    },
  };
}
