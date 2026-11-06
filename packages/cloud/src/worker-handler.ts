// The Cloudflare entry's handler: it reads the secrets from their Secrets Store bindings
// (`secrets.ts`), builds the dependencies from the bindings and hands every request to the plain
// function of `handler.ts`. Nothing of the logic lives here. It is apart from
// `worker.ts`, which also exports the Durable Object class and so imports `cloudflare:workers`,
// so that the Node tests can import this one.

import type { SessionVerifier } from "@meltemi/identity";
import { ConfigError } from "./config.js";
import { errorResponse, fail } from "./errors.js";
import { cloud } from "./handler.js";
import { d1OAuthStore } from "./oauth/store.js";
import { maintainState } from "./maintenance.js";
import { durableRenderers } from "./renderer-client.js";
import { durableRooms } from "./room-client.js";
import { resolveSecrets } from "./secrets.js";
import { d1Store } from "./store/d1.js";
import type { Env } from "./env.js";
import type { Deps } from "./types.js";
import { createAdministrationVerifier, createVerifier } from "./verifier.js";

/** The verifier, kept for the life of the isolate (its caches belong to it) and renewed when its settings change. */
let cached: { key: string; verifier: SessionVerifier } | undefined;

function verifierFor(env: Env): SessionVerifier {
  const key = [env.IDENTITY_ISSUER, env.IDENTITY_JWKS_URL, env.DEV, env.IDENTITY_JWKS].join("\n");
  if (cached?.key !== key)
    cached = { key, verifier: createVerifier(env, (i, init) => fetch(i, init)) };
  return cached.verifier;
}

/** Shared hosted resources; callers can supply the stricter private administration verifier. */
export function cloudDeps(env: Env, verifier: SessionVerifier = verifierFor(env)): Deps {
  return {
    store: d1Store(env.DB),
    oauthStore: d1OAuthStore(env.DB),
    rooms: durableRooms(env.ROOMS),
    verifier,
    assets: env.ASSETS,
    now: () => new Date(),
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    fetch: (input, init) => fetch(input, init),
    renderers: durableRenderers(env.RENDERERS),
    publicFetch: (input, init) => fetch(input, init),
  };
}

/** Keep platform fetch construction at the existing audited I/O boundary. */
export function administrationDeps(env: Env): Deps {
  return cloudDeps(
    env,
    createAdministrationVerifier(env, (input, init) => fetch(input, init)),
  );
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
    return cloud(request, env, cloudDeps(env, verifier));
  },

  /**
   * The twice-monthly cron of `wrangler.jsonc` (`0 3 1,15 * *`) runs on the first and fifteenth
   * at 03:00 UTC. It sweeps what has expired (handled deletion events after 31 days, approval codes and failed
   * exchanges, publish requests, idempotency keys after a day), which the routes sweep too but only
   * when somebody uses them, and the authorization server's entries past their expiry, which its
   * reads leave in place, unseen (`oauth/store.ts`); and collects the blobs no project, upload or
   * version references and that are older than seven days, and the objects no row names. A failure
   * of the store ends the run with an error the platform logs; the next scheduled run finishes the
   * job. The sweep does not keep the collection from running, nor the collection the sweep.
   */
  async scheduled(_controller: unknown, given: Env): Promise<void> {
    const env = await resolveSecrets(given);
    await maintainState(env);
  },
};
