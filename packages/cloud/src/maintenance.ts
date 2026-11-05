/** Storage maintenance callable by a platform scheduler or local launcher, without an HTTP trigger. */
import { collectBlobs } from "./collect.js";
import { KEPT_MS } from "./idempotency.js";
import { sweepOAuthStore } from "./oauth/store.js";
import { d1Store } from "./store/d1.js";
import type { Env } from "./env.js";

export async function maintainState(env: Env, now: () => Date = () => new Date()): Promise<void> {
  const store = d1Store(env.DB);
  let swept: unknown;
  try {
    const at = now();
    await store.sweep(at.toISOString());
    await store.sweepKeys(new Date(at.getTime() - KEPT_MS).toISOString());
    await sweepOAuthStore(env.DB, at.getTime());
  } catch (error) {
    swept = error;
  }
  const result = await collectBlobs({ store, blobs: env.BLOBS, now });
  if (swept !== undefined) throw swept;
  console.log(
    `cloud: collection: ${result.rows} blobs removed, ${result.objects} objects deleted, ${result.orphans} orphans${result.failures > 0 ? `, ${result.failures} deletes failed` : ""}${result.truncated ? ", more to collect next time" : ""}`,
  );
}
