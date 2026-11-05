// The idempotency keys, the call windows and the last uses of OAuth grants in memory (`CallsStore`),
// as `d1-calls.ts` keeps them in D1: the same answers for the same calls, which the conformance suite holds both to. `memoryStore`
// spreads it into the store and calls `forget` when a person is deleted.

import type { CallsStore, KeptAnswer, KeyOutcome } from "./types.js";

interface KeyRow {
  readonly route: string;
  readonly hash: string;
  readonly createdAt: string;
  answer: KeptAnswer | null;
}

export function memoryCalls(): CallsStore & { forget(sub: string): void } {
  // By account, then by key, as the table's primary key orders them.
  const keys = new Map<string, Map<string, KeyRow>>();
  // By account and kind, the count of each minute.
  const windows = new Map<string, Map<string, number>>();
  // By account, the last use of each grant.
  const uses = new Map<string, Map<string, string>>();

  return {
    async claimKey(claim, expiredBefore, staleBefore): Promise<KeyOutcome> {
      const held = keys.get(claim.sub) ?? new Map<string, KeyRow>();
      keys.set(claim.sub, held);
      for (const [key, row] of held) if (row.createdAt < expiredBefore) held.delete(key);
      const found = held.get(claim.key);
      if (found && found.answer === null && found.createdAt < staleBefore) held.delete(claim.key);
      const row = held.get(claim.key);
      if (!row) {
        held.set(claim.key, {
          route: claim.route,
          hash: claim.hash,
          createdAt: claim.at,
          answer: null,
        });
        return { status: "claimed" };
      }
      return {
        status: "kept",
        route: row.route,
        hash: row.hash,
        answer: row.answer ? { ...row.answer } : null,
      };
    },
    async keepAnswer(sub, key, answer) {
      const row = keys.get(sub)?.get(key);
      if (row && row.answer === null) row.answer = { ...answer };
    },
    async releaseKey(sub, key) {
      const held = keys.get(sub);
      if (held?.get(key)?.answer === null) held.delete(key);
    },
    async sweepKeys(expiredBefore) {
      for (const held of keys.values()) {
        for (const [key, row] of held) if (row.createdAt < expiredBefore) held.delete(key);
      }
    },
    async countCall(sub, kind, window) {
      const id = JSON.stringify([sub, kind]);
      const counts = windows.get(id) ?? new Map<string, number>();
      windows.set(id, counts);
      // The earlier windows go, as `d1-calls.ts` deletes them in the same step.
      for (const minute of counts.keys()) if (minute < window) counts.delete(minute);
      const count = (counts.get(window) ?? 0) + 1;
      counts.set(window, count);
      return count;
    },
    async touchApp(sub, grantId, at, since) {
      const held = uses.get(sub) ?? new Map<string, string>();
      uses.set(sub, held);
      const last = held.get(grantId);
      if (last === undefined || last < since) held.set(grantId, at);
    },
    async appUses(sub) {
      return new Map(uses.get(sub) ?? []);
    },
    async forgetApps(sub, grantIds) {
      for (const grantId of grantIds) uses.get(sub)?.delete(grantId);
    },
    forget(sub) {
      keys.delete(sub);
      uses.delete(sub);
      for (const id of windows.keys()) {
        if ((JSON.parse(id) as [string, string])[0] === sub) windows.delete(id);
      }
    },
  };
}
