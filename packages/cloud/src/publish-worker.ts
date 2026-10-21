// The Cloudflare entry of the publish host (`main` of `wrangler.publish.jsonc`): it builds the
// dependencies from the two bindings the Worker holds and hands every request to the plain function
// of `publish.ts`. Nothing of the logic lives here. It imports no Workers module, so a Node test
// can import it; it is a separate Worker from `worker.ts` on purpose (decision 0042): it has no
// assets, no secret, no Durable Object and no variable, so one missed branch cannot serve the page,
// the API or a cookie on the domain that serves what people published.

import type { D1Like } from "./env.js";
import { publishHost, type PublishedBlobs } from "./publish.js";
import { d1PublicationReader } from "./store/d1-publications.js";

/** What `wrangler.publish.jsonc` binds, and the whole of what this Worker is given. */
export interface PublishWorkerEnv {
  /** The same bucket as the main Worker's `BLOBS`: the pages are under `published/`. */
  readonly BLOBS: PublishedBlobs;
  /** The same database as the main Worker's `DB`: the `publications` rows say what exists. */
  readonly DB: D1Like;
}

export default {
  async fetch(request: Request, env: PublishWorkerEnv): Promise<Response> {
    return publishHost(request, env, { store: d1PublicationReader(env.DB) });
  },
};
