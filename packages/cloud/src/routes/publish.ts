// Publishing a project (`publishing`, "Publish and unpublish"): `GET`, `PUT` and `DELETE
// /api/projects/:id/publish`. The page builds the HTML (the catalog build over the project's files)
// and sends it; the Worker stores it and says where it is served, and never renders. It is served by
// the publish host (`publish.ts`), a second Worker on a domain of its own, from the object this
// route puts under `published/<handle>/<slug>/index.html` and the row it records. All three routes
// are the owner's (`manage`), with the cookie or an API token (the command line publishes too).

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requireAccess } from "../access.js";
import type { Route } from "../context.js";
import { json } from "../http.js";
import { getPublications, publish, requireHandle, unpublish } from "../operations/publish.js";
import { readObject } from "./projects.js";

/**
 * The most a publish request may weigh: the HTML at its limit, and eight MiB for the JSON around it.
 * JSON writes a quote or a line break in two bytes (a control character in six), so a page that fits
 * the limit can be longer in a body; a page that escapes to no more than this is judged by its own
 * size, and a body over it is `publish.too-large` without being read any further.
 */
export const MAX_PUBLISH_BODY = CLOUD_LIMITS.publishBytes + 8 * 1024 * 1024;

/**
 * `GET /api/projects/:id/publish` (`manage`): `{ handle, publications, takedowns }`. `handle` is the
 * owner's, or null until they choose one (`PATCH /api/account`). `publications` are this project's,
 * the earliest first, each with the address it is served at. `takedowns` are the ones the service
 * made of this project's publications, under the owner's handle, the latest first, so that the
 * dialog can say the service removed a publication: `{ slug, at, reason }`. A removal is the
 * project's own notice, not the handle's: a person who takes a handle that someone else held, and
 * had a page removed under, is shown nothing of it, whenever their account was made. One the
 * owner has since published again, with this project, is not listed.
 */
export const getPublishRoute: Route = async (ctx) =>
  json(await getPublications(ctx, ctx.params["id"] ?? ""));

/**
 * `PUT /api/projects/:id/publish { slug, html }` (`manage`): stores the page and answers `{ url,
 * handle, slug, bytes, published_at }`. Publishing a slug the project already publishes replaces it.
 * The checks run in this order and nothing is written by a request that fails one:
 *
 *   - `handle.required` (409): the owner has no handle yet, before the body is read;
 *   - `publish.too-large` (413): a body over `MAX_PUBLISH_BODY`, or HTML over 16 MiB in UTF-8 bytes;
 *   - `request.invalid` (400): a body that is not a JSON object; `publish.invalid` (400): a slug that
 *     is not `[a-z0-9-]{1,60}`, or an `html` that is not text, or empty;
 *   - `publish.taken` (409): the slug is held, under the same handle, by another of the owner's projects;
 *   - `publish.rate` (429, `Retry-After`): the project made ten publish requests in the last hour (the
 *     rate counts requests, in `publish_log`, because publishing a slug again moves the time of its
 *     row and counting rows could not see the repeats).
 *
 * The handle is read twice: before the body (the answer `handle.required` does not wait for a large
 * upload) and again after it, which is the one the page is published under, because the body may
 * take as long as a connection allows and a handle that changed meanwhile is the owner's now. The
 * store checks it once more in the statement that records the row (`409 handle.required` when it
 * was changed again in the last moment), so a page is never left under an address its owner
 * released.
 *
 * A NEW address is claimed by its row first and then filled (a failure of the bucket takes the row
 * back): of two projects that race for one address, the one that does not get the row never writes
 * the page, so nobody's page is overwritten. A replacement writes the page first and then renews the
 * row: the address is already the project's, so nothing can be taken from it, and a failure of the
 * bucket changes nothing. The publish host serves a page only while its row exists.
 */
export const putPublishRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  // The handle before the body: the answer `handle.required` does not wait for a large upload.
  await requireHandle(ctx);
  const body = await readObject(ctx, MAX_PUBLISH_BODY, "publish.too-large");
  return json(await publish(ctx, projectId, body));
};

/**
 * `DELETE /api/projects/:id/publish/:slug` (`manage`): removes the page and then the row, and
 * answers `204`. The object goes first, so that a failure of the bucket leaves the publication as it
 * was and the owner tries again, and a failure after it leaves a row with no page, which the publish
 * host does not serve. `404 not-found` when the project publishes nothing under the slug.
 */
export const deletePublishRoute: Route = async (ctx) => {
  await unpublish(ctx, ctx.params["id"] ?? "", ctx.params["slug"] ?? "");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
