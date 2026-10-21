// The Cloudflare entry (`main` of wrangler.jsonc): the Worker's handler and the Durable Object class,
// which wrangler finds here by the name the binding (`ROOMS`) and the migration give it. Nothing of
// the logic lives here: `worker-handler.ts` is the handler, `room.ts` the room. This file imports
// `cloudflare:workers` and so is compiled by the Workers program only.

import type { R2Like } from "./env.js";

export { default } from "./worker-handler.js";
export { ProjectRoom } from "./room.js";

// The service reads R2 through the minimal `R2Like`. Only the Workers program has `R2Bucket`, so
// the proof that the real binding satisfies it is here: a bucket that stopped fitting would stop this
// file compiling, not fail a request. A type, so nothing of it exists at runtime.
type MustHold<T extends true> = T;
export type BucketFitsR2Like = MustHold<R2Bucket extends R2Like ? true : false>;
