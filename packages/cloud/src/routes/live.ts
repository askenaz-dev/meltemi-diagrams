// A project's live session (`live-sessions`, "Starting and ending a session"): the owner starts one,
// reads it and ends it; the session itself is a record in the project's room (`room-core.ts`), which
// checks the token where the socket arrives. These routes are the owner's (`manage`), and they are
// the only answers that carry the token, in the link: it is never logged.

import { requireAccess } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { fail } from "../errors.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import type { LiveState } from "../rooms.js";
import { readObject } from "./projects.js";

/** A live session as the owner's page reads it: the link to pass on, and the times as ISO. */
function liveJson(ctx: Ctx, projectId: string, live: LiveState) {
  return {
    id: live.id,
    link: `${ctx.config.origin}/p/${projectId}?live=${live.token}`,
    guestsEdit: live.guestsEdit,
    startedAt: new Date(live.startedAt).toISOString(),
    until: new Date(live.until).toISOString(),
    guests: live.guests,
  };
}

/**
 * `PUT /api/projects/:id/live { guestsEdit? }`: starts the project's live session (guests may edit
 * unless `guestsEdit` is false), or answers the one that is on, applying `guestsEdit` when given: a
 * change cuts the guests, who reconnect with the role it gives now. Answers `{ id, link, guestsEdit,
 * startedAt, until, guests }`, `link` being `<origin>/p/<id>?live=<token>`.
 */
export const putLiveRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true);
  const guestsEdit = body["guestsEdit"];
  if (guestsEdit !== undefined && typeof guestsEdit !== "boolean") {
    throw fail("request.invalid", "guestsEdit is true or false.");
  }
  const live = await ctx.deps.rooms.startLive(
    projectId,
    guestsEdit === undefined ? {} : { guestsEdit },
  );
  return json(liveJson(ctx, projectId, live));
};

/** `GET /api/projects/:id/live`: the session that is on, as `PUT` answers it, or `null`. */
export const getLiveRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const live = await ctx.deps.rooms.readLive(projectId);
  return json(live ? liveJson(ctx, projectId, live) : null);
};

/**
 * `DELETE /api/projects/:id/live`: ends the session; every connection it admitted closes with `4410
 * session.ended`. `204` whether or not one was on.
 */
export const deleteLiveRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  await ctx.deps.rooms.endLive(projectId);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
