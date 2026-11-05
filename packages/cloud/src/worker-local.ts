/** This entry point is never imported by the hosted Worker. */
import { localFetch } from "./local.js";
import { maintainState } from "./maintenance.js";
import type { Env } from "./env.js";

export { ProjectRoom } from "./room.js";
export { ProjectRenderer } from "./renderer.js";

export default {
  fetch: localFetch,
  // Invoked only by the launcher-owned scheduling API, never a scheduling HTTP route.
  scheduled: (_controller: unknown, env: Env) => maintainState(env),
};
