import { WorkerEntrypoint } from "cloudflare:workers";
import { administrationFetch } from "./administration-service.js";
import type { Env } from "./env.js";
import { errorResponse, fail } from "./errors.js";
import { resolveSecrets } from "./secrets.js";
import { administrationDeps } from "./worker-handler.js";

/** Only an explicit service binding selects this entrypoint; the public export never calls it. */
export class Administration extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    try {
      const env = await resolveSecrets(this.env);
      return await administrationFetch(request, env, administrationDeps(env));
    } catch {
      console.error("cloud: private administration is unavailable");
      return errorResponse(fail("internal"));
    }
  }
}
