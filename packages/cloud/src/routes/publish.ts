// Publishing a project (`publishing`, "Publish and unpublish"): `GET`, `PUT` and `DELETE
// /api/projects/:id/publish`. The page builds the HTML (the catalog build over the project's files)
// and sends it; the Worker stores it and says where it is served, and never renders. It is served by
// the publish host (`publish.ts`), a second Worker on a domain of its own, from the object this
// route puts under `published/<handle>/<slug>/index.html` and the row it records. All three routes
// are the owner's (`manage`), with the cookie or an API token (the command line publishes too).

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requireAccess } from "../access.js";
import { publishHostOf } from "../config.js";
import type { Ctx, Route } from "../context.js";
import { errorResponse, fail } from "../errors.js";
import { json } from "../http.js";
import { SLUG } from "../ids.js";
import { publishedKey } from "../keys.js";
import type { Publication } from "../store/types.js";
import { readObject } from "./projects.js";

/**
 * The most a publish request may weigh: the HTML at its limit, and eight MiB for the JSON around it.
 * JSON writes a quote or a line break in two bytes (a control character in six), so a page that fits
 * the limit can be longer in a body; a page that escapes to no more than this is judged by its own
 * size, and a body over it is `publish.too-large` without being read any further.
 */
export const MAX_PUBLISH_BODY = CLOUD_LIMITS.publishBytes + 8 * 1024 * 1024;

/**
 * The public address of a publication: `https://<PUBLISH_HOST>/<handle>/<slug>/`, and in development
 * (where there is no publish host) the Worker's own `/_published/<handle>/<slug>/`. A deployment
 * with no usable `PUBLISH_HOST` has no address to give (`ConfigError`, an internal error that names
 * the variable in the log).
 */
function publicationUrl(ctx: Ctx, handle: string, slug: string): string {
  if (ctx.config.dev) return `${ctx.config.origin}/_published/${handle}/${slug}/`;
  return `https://${publishHostOf(ctx.config)}/${handle}/${slug}/`;
}

/** A publication as the owner sees it. */
function publicationJson(ctx: Ctx, publication: Publication) {
  return {
    slug: publication.slug,
    url: publicationUrl(ctx, publication.handle, publication.slug),
    published_at: publication.publishedAt,
    bytes: publication.bytes,
  };
}

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
export const getPublishRoute: Route = async (ctx) => {
  const { principal, projectId } = await requireAccess(ctx, "manage");
  const { store } = ctx.deps;
  const [user, publications] = await Promise.all([
    store.user(principal.sub),
    store.publicationsOf(projectId),
  ]);
  const handle = user?.handle ?? null;
  const takedowns =
    user && handle !== null
      ? (await store.takedownsOf(handle)).filter(
          (taken) =>
            taken.projectId === projectId &&
            !publications.some((p) => p.slug === taken.slug && p.publishedAt > taken.at),
        )
      : [];
  return json({
    handle,
    publications: publications.map((publication) => publicationJson(ctx, publication)),
    takedowns: takedowns.map((taken) => ({ slug: taken.slug, at: taken.at, reason: taken.reason })),
  });
};

/** What the owner is told when the handle changed in the last moment of a publish request. */
const HANDLE_MOVED = "Your handle changed while the page was being published; publish again.";

/** The slug of a request: `[a-z0-9-]{1,60}`, or `400 publish.invalid`. */
function readSlug(value: unknown): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw fail("publish.invalid");
  return value;
}

/** The HTML of a request: text, and something. A page nobody can read is not a page. */
function readHtml(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw fail("publish.invalid", "A publication needs the HTML of the page, as text.");
  }
  return value;
}

/** `429 publish.rate`, with the seconds until the earliest request of the hour stops counting. */
function tooOften(freeAt: string, nowMs: number): Response {
  const limited = errorResponse(fail("publish.rate"));
  const wait = Math.max(1, Math.ceil((Date.parse(freeAt) - nowMs) / 1000));
  limited.headers.set("Retry-After", String(wait));
  return limited;
}

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
  const { principal, projectId } = await requireAccess(ctx, "manage");
  const { store, now } = ctx.deps;
  if (((await store.user(principal.sub))?.handle ?? null) === null) throw fail("handle.required");

  const body = await readObject(ctx, MAX_PUBLISH_BODY, "publish.too-large");
  // The handle as it is now, not as it was before a body that took its time.
  const handle = (await store.user(principal.sub))?.handle ?? null;
  if (handle === null) throw fail("handle.required");
  const slug = readSlug(body["slug"]);
  const page = new TextEncoder().encode(readHtml(body["html"]));
  if (page.byteLength > CLOUD_LIMITS.publishBytes) throw fail("publish.too-large");
  // Built before anything is written: a deployment with no publish host fails here and not after
  // the page is stored.
  const url = publicationUrl(ctx, handle, slug);

  const existing = await store.publication(handle, slug);
  if (existing && existing.projectId !== projectId) throw fail("publish.taken");

  const at = now().toISOString();
  // This route adds to the log, so it first removes what nobody comes back for.
  await store.sweep(at);
  const claim = await store.claimPublish(projectId, at, CLOUD_LIMITS.publishesPerHour);
  if (claim.status === "missing") throw fail("project.not-found");
  if (claim.status === "rate") return tooOften(claim.freeAt, now().getTime());

  const key = publishedKey(handle, slug);
  const row: Publication = { projectId, handle, slug, publishedAt: at, bytes: page.byteLength };
  if (existing === undefined) {
    const outcome = await store.putPublication(row, { ownersHandle: true });
    if (outcome === "taken") throw fail("publish.taken");
    if (outcome === "missing") throw fail("project.not-found");
    if (outcome === "handle") throw fail("handle.required", HANDLE_MOVED);
    try {
      await ctx.env.BLOBS.put(key, page);
    } catch (error) {
      // Nothing is served from a row without its page, and the address is free again.
      await store.deletePublication(projectId, slug).catch(() => undefined);
      throw error;
    }
  } else {
    await ctx.env.BLOBS.put(key, page);
    const outcome = await store.putPublication(row, { ownersHandle: true });
    if (outcome === "missing") {
      // The project was deleted while the page was being written: the page has no project.
      await ctx.env.BLOBS.delete(key).catch(() => undefined);
      throw fail("project.not-found");
    }
    if (outcome === "taken") throw fail("publish.taken");
    if (outcome === "handle") throw fail("handle.required", HANDLE_MOVED);
  }
  return json({ url, handle, slug, bytes: page.byteLength, published_at: at });
};

/**
 * `DELETE /api/projects/:id/publish/:slug` (`manage`): removes the page and then the row, and
 * answers `204`. The object goes first, so that a failure of the bucket leaves the publication as it
 * was and the owner tries again, and a failure after it leaves a row with no page, which the publish
 * host does not serve. `404 not-found` when the project publishes nothing under the slug.
 */
export const deletePublishRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "manage");
  const slug = ctx.params["slug"] ?? "";
  const { store } = ctx.deps;
  const none = () => fail("not-found", "There is no such publication.");
  const found = SLUG.test(slug)
    ? (await store.publicationsOf(projectId)).find((publication) => publication.slug === slug)
    : undefined;
  if (!found) throw none();
  await ctx.env.BLOBS.delete(publishedKey(found.handle, found.slug));
  if (!(await store.deletePublication(projectId, slug))) throw none();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
