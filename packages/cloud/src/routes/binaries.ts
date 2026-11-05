// Images and fonts by hash (`cloud-projects`, "Images and fonts by hash"): `PUT` and `DELETE
// /api/projects/:id/binaries/<path>` and `GET`/`HEAD /api/projects/:id/blobs/<hash>`.
//
// An upload is read through a cap of 10 MiB, typed from its bytes (never from the `Content-Type` the
// client claims), named by its SHA-256, stored (R2 first, then the `blobs` row, then the project's
// `project_blobs` row) and set in the room under its path. Bytes are served only to a project that
// holds the hash in `project_blobs` or in one of its versions, and always so that nothing in them
// can run on the page's origin: sandboxed, never sniffed, an attachment.

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { requireAccess, requireReadWithLive } from "../access.js";
import { BINARY_TYPES } from "../binary.js";
import type { Ctx, Route } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { fail } from "../errors.js";
import { json, readCappedBytes } from "../http.js";
import { blobKey } from "../keys.js";
import { TEXT_MEDIA_TYPE } from "../materialise.js";
import { putBinary, releaseBlob } from "../operations/files.js";

/**
 * `PUT /api/projects/:id/binaries/<path>` with the bytes of an image or a font: answers `{ hash }`.
 * The path passes the path rule (`400 path.invalid`), the body is at most 10 MiB (`413
 * quota.binary`, not read past the cap), the type comes from the bytes (`400 binary.invalid` for
 * anything else) and the account may not go over its storage (`413 quota.storage`); in each case
 * nothing is stored. The room has the last word on the document (`quota.files`, `doc.too-large`): an
 * upload it refuses leaves the `project_blobs` row only when the project held the hash before. An
 * upload that replaces the entry at the path lets go of the hash it replaced, unless another entry
 * names it: a changed image saved again and again does not keep every earlier version in the
 * account's usage.
 */
export const putBinaryRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "write");
  const path = ctx.params["path"] ?? "";
  if (!isCleanPath(path)) throw fail("path.invalid");
  const bytes = await readCappedBytes(ctx.request, CLOUD_LIMITS.binaryBytes);
  if (bytes === undefined) throw fail("quota.binary");
  return json(await putBinary(ctx, projectId, path, bytes));
};

/**
 * `DELETE /api/projects/:id/binaries/<path>`: removes the file from the room and the hash from
 * `project_blobs`, unless another file of the project still uses the same bytes. `204`; `404
 * not-found` when no image or font is at that path.
 */
export const deleteBinaryRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "write");
  const path = ctx.params["path"] ?? "";
  if (!isCleanPath(path)) throw fail("path.invalid");

  const { rooms } = ctx.deps;
  const latest = await rooms.read(projectId);
  // Own keys only: a file may be called `__proto__`, and a path that is not there is not `Object.prototype`.
  const hash = Object.hasOwn(latest.binaries, path) ? latest.binaries[path] : undefined;
  if (hash === undefined) throw fail("not-found", "There is no image or font at that path.");
  await rooms.push(projectId, { binaries: { [path]: null } });
  await releaseBlob(ctx, projectId, hash);
  await ctx.deps.store.refreshStorageBytes(access.project.ownerSub);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};

/** The media types an answer may carry: what an upload can be, and the text of a version's file. */
const SERVED_TYPES: ReadonlySet<string> = new Set([...BINARY_TYPES, TEXT_MEDIA_TYPE]);

/** The headers of a blob's answer: immutable and private, and nothing in the bytes can run here. */
function blobHeaders(mediaType: string, hash: string, size: number): Headers {
  // The type the row holds, when it is one an upload or a text file can have; anything else is
  // plain bytes. The first registration of a hash stands (the same bytes first seen as text and later
  // uploaded as an SVG stay `text/plain`), so the answer is sensible and never trusted either way:
  // `sandbox`, `nosniff` and `attachment` hold whatever the type.
  const type = SERVED_TYPES.has(mediaType) ? mediaType : "application/octet-stream";
  return new Headers({
    "Content-Type": type === TEXT_MEDIA_TYPE ? `${type}; charset=utf-8` : type,
    "Content-Length": String(size),
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="${hash}"`,
  });
}

/**
 * The blob a `GET` or `HEAD` asks for, or `404 not-found`: the project must hold the hash. Needs
 * `read`, which an anonymous caller has when the project's link admits them.
 */
async function heldBlob(ctx: Ctx) {
  // A live session's guest reads the images and fonts of the diagrams with the token in a header.
  const { projectId } = await requireReadWithLive(ctx);
  const hash = ctx.params["hash"] ?? "";
  const gone = () => fail("not-found", "This project holds no image or font with that hash.");
  if (!BLOB_HASH.test(hash)) throw gone();
  // `project_blobs` or a version of THIS project, never the live map and never another project's.
  if (!(await ctx.deps.store.projectHoldsBlob(projectId, hash))) throw gone();
  const row = await ctx.deps.store.blob(hash);
  if (!row) throw gone();
  return { hash, row };
}

/**
 * `GET /api/projects/:id/blobs/<hash>`: the bytes, streamed. Every answer carries `Cache-Control:
 * private, max-age=31536000, immutable`, `Content-Security-Policy: sandbox`, `X-Content-Type-Options:
 * nosniff` and `Content-Disposition: attachment; filename="<hash>"`, so an SVG with a script opened
 * at its address executes nothing on the page's origin, while `<img>` and `fetch` still get the bytes.
 */
export const getBlobRoute: Route = async (ctx) => {
  const { hash, row } = await heldBlob(ctx);
  const object = await ctx.env.BLOBS.get(blobKey(hash));
  if (!object) {
    // A row without bytes: the store and the bucket disagree. Say nothing of it to the person.
    console.error("cloud: a blob row has no object in R2");
    throw fail("not-found", "This project holds no image or font with that hash.");
  }
  return new Response(object.body, {
    status: 200,
    headers: blobHeaders(row.mediaType, hash, row.size),
  });
};

/** `HEAD /api/projects/:id/blobs/<hash>`: `200` with the headers of the `GET` when the project holds the hash. */
export const headBlobRoute: Route = async (ctx) => {
  const { hash, row } = await heldBlob(ctx);
  return new Response(null, { status: 200, headers: blobHeaders(row.mediaType, hash, row.size) });
};
