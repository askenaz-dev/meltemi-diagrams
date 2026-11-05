// A project's live session (`live-sessions`, "Starting and ending a session"): the owner starts one,
// reads it and ends it; the session itself is a record in the project's room (`room-core.ts`), which
// checks the token where the socket arrives. These routes are the owner's (`manage`), and they are
// the only answers that carry the token, in the link: it is never logged.

import { requireAccess } from "../access.js";
import type { Route } from "../context.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import { endLive, getLive, startLive } from "../operations/live.js";
import { readObject } from "./projects.js";

/**
 * `PUT /api/projects/:id/live { guestsEdit? }`: starts the project's live session (guests may edit
 * unless `guestsEdit` is false), or answers the one that is on, applying `guestsEdit` when given: a
 * change cuts the guests, who reconnect with the role it gives now. Answers `{ id, link, guestsEdit,
 * startedAt, until, guests }`, `link` being `<origin>/p/<id>?live=<token>`.
 */
export const putLiveRoute: Route = async (ctx) => {
  await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true);
  return json(await startLive(ctx, ctx.params["id"] ?? "", body));
};

/** `GET /api/projects/:id/live`: the session that is on, as `PUT` answers it, or `null`. */
export const getLiveRoute: Route = async (ctx) => json(await getLive(ctx, ctx.params["id"] ?? ""));

/**
 * `DELETE /api/projects/:id/live`: ends the session; every connection it admitted closes with `4410
 * session.ended`. `204` whether or not one was on.
 */
export const deleteLiveRoute: Route = async (ctx) => {
  await endLive(ctx, ctx.params["id"] ?? "");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
