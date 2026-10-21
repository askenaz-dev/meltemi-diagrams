// The Cloudflare entry's handler: it reads the secrets from their Secrets Store bindings
// (`secrets.ts`), builds the dependencies from the bindings and hands every request to the plain
// function of `handler.ts`. Nothing of the logic lives here. It is apart from
// `worker.ts`, which also exports the Durable Object class and so imports `cloudflare:workers`,
// so that the Node tests can import this one.

import type { SessionVerifier } from "@meltemi/identity";
import { collectBlobs } from "./collect.js";
import { ConfigError } from "./config.js";
import { errorResponse, fail } from "./errors.js";
import { cloud } from "./handler.js";
import { durableRooms } from "./room-client.js";
import { resolveSecrets } from "./secrets.js";
import { d1Store } from "./store/d1.js";
import type { Env } from "./env.js";
import type { Deps } from "./types.js";
import { createVerifier } from "./verifier.js";

/** The verifier, kept for the life of the isolate (its caches belong to it) and renewed when its settings change. */
let cached: { key: string; verifier: SessionVerifier } | undefined;

function verifierFor(env: Env): SessionVerifier {
  const key = [env.IDENTITY_ISSUER, env.IDENTITY_JWKS_URL, env.DEV, env.IDENTITY_JWKS].join("\n");
  if (cached?.key !== key)
    cached = { key, verifier: createVerifier(env, (i, init) => fetch(i, init)) };
  return cached.verifier;
}

export default {
  async fetch(request: Request, given: Env): Promise<Response> {
    const env = await resolveSecrets(given);
    let verifier: SessionVerifier;
    try {
      verifier = verifierFor(env);
    } catch (error) {
      // The verifier is built from the identity settings before `cloud()` runs, so a setting the
      // service cannot use is answered here the way `cloud()` answers one: an internal error.
      if (!(error instanceof ConfigError)) throw error;
      console.error(`cloud: ${error.message}`);
      return errorResponse(fail("internal"));
    }
    const deps: Deps = {
      store: d1Store(env.DB),
      rooms: durableRooms(env.ROOMS),
      verifier,
      assets: env.ASSETS,
      now: () => new Date(),
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      fetch: (input, init) => fetch(input, init),
    };
    return cloud(request, env, deps);
  },

  /**
   * The weekly cron of `wrangler.jsonc` (`0 3 * * 0`, Sundays at 03:00 UTC): sweeps what has
   * expired (the records of handled deletion events after 31 days, approval codes and failed
   * exchanges, publish requests), which the routes sweep too but only when somebody uses them, and
   * collects the blobs no project, upload or version references and that are older than seven
   * days, and the objects no row names. A failure of the store ends the run with an error the
   * platform logs; the next run, a week on, finishes the job. The sweep does not keep the collection
   * from running, nor the collection the sweep.
   */
  async scheduled(_controller: unknown, given: Env): Promise<void> {
    const env = await resolveSecrets(given);
    const store = d1Store(env.DB);
    let swept: unknown;
    try {
      await store.sweep(new Date().toISOString());
    } catch (error) {
      swept = error;
    }
    const result = await collectBlobs({ store, blobs: env.BLOBS, now: () => new Date() });
    if (swept !== undefined) throw swept;
    console.log(
      `cloud: collection: ${result.rows} blobs removed, ${result.objects} objects deleted, ${result.orphans} orphans${result.failures > 0 ? `, ${result.failures} deletes failed` : ""}${result.truncated ? ", more to collect next time" : ""}`,
    );
  },
};
