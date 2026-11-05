/** This entry point is never imported by the hosted Worker. */
import { localFetch } from "./local.js";
import { maintainState } from "./maintenance.js";
import type { Env } from "./env.js";
import { ProjectRoom as HostedProjectRoom } from "./room.js";

/** Only this local binding opts browser updates into durable acknowledgement. */
export class ProjectRoom extends HostedProjectRoom {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, { durableUpdates: true });
  }
}
export { ProjectRenderer } from "./renderer.js";

export default {
  fetch: localFetch,
  // Invoked only by the launcher-owned scheduling API, never a scheduling HTTP route.
  scheduled: (_controller: unknown, env: Env) => maintainState(env),
};
