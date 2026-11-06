// The Cloudflare entry (`main` of wrangler.jsonc): the Worker's handler and the Durable Object
// classes, which wrangler finds here by the names the bindings (`ROOMS`, `RENDERERS`) and the
// migrations give them. Nothing of the logic lives here: `worker-handler.ts` is the handler,
// `room.ts` the room, `renderer.ts` the renderer. This file imports `cloudflare:workers` and so is
// compiled by the Workers program only.

import type { R2Like } from "./env.js";

export { default } from "./worker-handler.js";
export { ProjectRoom } from "./room.js";
export { ProjectRenderer } from "./renderer.js";
export { Administration } from "./administration-entry.js";

// The service reads R2 through the minimal `R2Like`. Only the Workers program has `R2Bucket`, so
// the proof that the real binding satisfies it is here: a bucket that stopped fitting would stop this
// file compiling, not fail a request. A type, so nothing of it exists at runtime.
type MustHold<T extends true> = T;
export type BucketFitsR2Like = MustHold<R2Bucket extends R2Like ? true : false>;
