// A project's thumbnail (`cloud-projects`, "Thumbnails"): `PUT` and `GET /api/projects/:id/thumbnail`.
// The page renders the open diagram as a static SVG and sends it; the Worker never renders. One
// thumbnail per project, one write per thirty seconds, at most 200 KiB, and always served so that
// nothing in it can run on the page's origin.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { requireAccess } from "../access.js";
import { isSvg } from "../binary.js";
import type { Route } from "../context.js";
import { errorResponse, fail } from "../errors.js";
import { readCappedBytes } from "../http.js";
import { thumbnailKey } from "../keys.js";

const WINDOW_MS = CLOUD_LIMITS.thumbnailSeconds * 1000;

/** Whether a `Content-Type` names SVG, whatever its parameters (`; charset=utf-8`) and its case. */
function isSvgType(header: string | null): boolean {
  return header?.split(";")[0]?.trim().toLowerCase() === "image/svg+xml";
}

/** `429 thumbnail.rate`, with the seconds until another thumbnail is taken. */
function tooOften(lastMs: number, nowMs: number): Response {
  const limited = errorResponse(fail("thumbnail.rate"));
  const wait = Math.max(1, Math.ceil((lastMs + WINDOW_MS - nowMs) / 1000));
  limited.headers.set("Retry-After", String(wait));
  return limited;
}

/**
 * `PUT /api/projects/:id/thumbnail` with an `image/svg+xml` body of at most 200 KiB that is a
 * well-formed SVG: stored under `thumbs/<project id>.svg`, and `thumbnail_at` is set. `204`. The type
 * is checked first (`400 thumbnail.invalid`), then the rate (`429 thumbnail.rate`, one per thirty
 * seconds per project: the claim is one statement, so two devices cannot both pass), then the body
 * (`413 thumbnail.too-large`, `400 thumbnail.invalid`). A refused thumbnail leaves the one there is,
 * and a write that fails gives the claim back.
 */
export const putThumbnailRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "write");
  if (!isSvgType(ctx.request.headers.get("Content-Type"))) {
    throw fail("thumbnail.invalid", "A thumbnail is an image/svg+xml body.");
  }
  const { store, now } = ctx.deps;
  const at = now().getTime();
  const previous = access.project.thumbnailAt;
  // Said before the body is read: a device that is too early costs nothing but this check.
  if (previous !== null && Date.parse(previous) > at - WINDOW_MS) {
    return tooOften(Date.parse(previous), at);
  }

  const bytes = await readCappedBytes(ctx.request, CLOUD_LIMITS.thumbnailBytes);
  if (bytes === undefined) throw fail("thumbnail.too-large");
  if (!isSvg(bytes)) throw fail("thumbnail.invalid", "The thumbnail is not a well-formed SVG.");

  const owner = access.project.ownerSub;
  const claimed = await store.claimThumbnail(
    projectId,
    new Date(at).toISOString(),
    new Date(at - WINDOW_MS).toISOString(),
  );
  if (!claimed) {
    // Too recent (another device was first, between the check and here), or the project is gone.
    const project = await store.project(owner, projectId);
    if (!project) throw fail("project.not-found");
    return tooOften(project.thumbnailAt === null ? at : Date.parse(project.thumbnailAt), at);
  }

  const key = thumbnailKey(projectId);
  try {
    await ctx.env.BLOBS.put(key, bytes);
  } catch (error) {
    // Nothing was written: the thirty seconds are not spent.
    await store.setThumbnailAt(projectId, previous).catch(() => undefined);
    throw error;
  }
  if (!(await store.project(owner, projectId))) {
    // Deleted while the bytes were being written: the object has no project to be deleted with.
    await ctx.env.BLOBS.delete(key).catch(() => undefined);
    throw fail("project.not-found");
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};

/**
 * `GET /api/projects/:id/thumbnail`: the SVG, as `image/svg+xml`, `Content-Security-Policy: sandbox`
 * (an SVG opened at its address runs nothing, and the document is cut off from the page's origin),
 * `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`; an `<img>` shows it all the
 * same. `Cache-Control: private, max-age=60`: the drawer opening again within a minute costs no
 * request, and a thumbnail another device saved shows within a minute; the page that saved one shows it
 * at once under a new address (`?t=`). `404 not-found` while the project has none.
 */
export const getThumbnailRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "read");
  const none = () => fail("not-found", "This project has no thumbnail.");
  if (access.project.thumbnailAt === null) throw none();
  const object = await ctx.env.BLOBS.get(thumbnailKey(projectId));
  if (!object) throw none();
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=60",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="thumbnail.svg"',
    },
  });
};
