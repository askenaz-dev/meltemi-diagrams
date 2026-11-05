// The operations of a project's live session (`live-sessions`, "Starting and ending a session"): the
// owner starts one, reads it and ends it; the session itself is a record in the project's room
// (`room-core.ts`), which checks the token where the socket arrives. They are the owner's (`manage`),
// and their answers are the only ones that carry the token, in the link: it is never logged. The
// routes (`routes/live.ts`) and the MCP tools call these.

import { requireProjectAccess } from "../access.js";
import type { OpCtx, Unchecked } from "../context.js";
import { fail } from "../errors.js";
import type { LiveState } from "../rooms.js";

/** A live session as the owner's page reads it: the link to pass on, and the times as ISO. */
function liveJson(ctx: OpCtx, projectId: string, live: LiveState) {
  return {
    id: live.id,
    link: `${ctx.config.origin}/p/${projectId}?live=${live.token}`,
    guestsEdit: live.guestsEdit,
    startedAt: new Date(live.startedAt).toISOString(),
    until: new Date(live.until).toISOString(),
    guests: live.guests,
  };
}

export type LiveJson = ReturnType<typeof liveJson>;

/**
 * Starts the project's live session (guests may edit unless `guestsEdit` is false), or answers the one
 * that is on, applying `guestsEdit` when given: a change cuts the guests, who reconnect with the role
 * it gives now. Answers `{ id, link, guestsEdit, startedAt, until, guests }`, `link` being
 * `<origin>/p/<id>?live=<token>`.
 */
export async function startLive(
  ctx: OpCtx,
  projectId: string,
  input: Unchecked<{ guestsEdit: boolean }>,
): Promise<LiveJson> {
  await requireProjectAccess(ctx, projectId, "manage");
  const guestsEdit = input.guestsEdit;
  if (guestsEdit !== undefined && typeof guestsEdit !== "boolean") {
    throw fail("request.invalid", "guestsEdit is true or false.");
  }
  const live = await ctx.deps.rooms.startLive(
    projectId,
    guestsEdit === undefined ? {} : { guestsEdit },
  );
  return liveJson(ctx, projectId, live);
}

/** The session that is on, as `startLive` answers it, or `null`. */
export async function getLive(ctx: OpCtx, projectId: string): Promise<LiveJson | null> {
  await requireProjectAccess(ctx, projectId, "manage");
  const live = await ctx.deps.rooms.readLive(projectId);
  return live ? liveJson(ctx, projectId, live) : null;
}

/** Ends the session; every connection it admitted closes with `4410 session.ended`. Whether or not one was on. */
export async function endLive(ctx: OpCtx, projectId: string): Promise<void> {
  await requireProjectAccess(ctx, projectId, "manage");
  await ctx.deps.rooms.endLive(projectId);
}
