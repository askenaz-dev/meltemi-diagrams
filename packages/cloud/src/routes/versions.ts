// Versions of a project (`cloud-projects`, "Versions"): `POST` and `GET /api/projects/:id/versions`,
// `GET /api/projects/:id/versions/:n` and `POST /api/projects/:id/versions/:n/restore`. The policy
// (the cap, the rate, thinning, the daily version) is `versions.ts`; this file is the requests.
//
// A version is a copy of the project's `project_files` rows, so the room materialises before one is
// made (`rooms.materialise`): what a version holds is what the room held a moment ago. Its texts are
// in R2 under `blobs/<hash>`; its images and fonts are hashes.

import { requireAccess } from "../access.js";
import type { Route } from "../context.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import { createVersion, getVersion, listVersions, restoreVersion } from "../operations/versions.js";
import { readObject } from "./projects.js";

/**
 * `POST /api/projects/:id/versions { label? }`: the room materialises, and the project's files are
 * recorded as the next version, `201` with `{ number, label, auto, created_at, created_by, changed }`.
 * A label is at most 80 characters (counted as characters); none, or an empty one, makes an
 * unlabelled version. `413 quota.versions` when the project is full after thinning, `429
 * versions.rate` beyond six in a minute; nothing is recorded then.
 */
export const createVersionRoute: Route = async (ctx) => {
  await requireAccess(ctx, "write");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true);
  return json(await createVersion(ctx, ctx.params["id"] ?? "", body), 201);
};

/** `GET /api/projects/:id/versions`: `{ versions }`, the newest first, each with the paths it changed. */
export const listVersionsRoute: Route = async (ctx) =>
  json(await listVersions(ctx, ctx.params["id"] ?? ""));

/**
 * `GET /api/projects/:id/versions/:n`: `{ number, label, auto, created_at, created_by, files, binaries
 * }`, the texts by path (from R2) and the hashes of the images and fonts by path. `404
 * version.not-found` for a number the project does not hold.
 */
export const getVersionRoute: Route = async (ctx) =>
  json(await getVersion(ctx, ctx.params["id"] ?? "", ctx.params["n"] ?? ""));

/**
 * `POST /api/projects/:id/versions/:n/restore`: the room holds the version's files afterwards, as ONE
 * transaction that the clients receive as a change from elsewhere, and a new automatic version holds
 * the state it replaced. `200 { revision, restored, saved, skipped? }` (`operations/versions.ts` has
 * the order of the steps).
 */
export const restoreVersionRoute: Route = async (ctx) =>
  json(await restoreVersion(ctx, ctx.params["id"] ?? "", ctx.params["n"] ?? ""));
