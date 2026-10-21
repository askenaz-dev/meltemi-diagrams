// Images and fonts by hash (`cloud-projects`, "Images and fonts by hash"): `PUT` and `DELETE
// /api/projects/:id/binaries/<path>` and `GET`/`HEAD /api/projects/:id/blobs/<hash>`.
//
// An upload is read through a cap of 10 MiB, typed from its bytes (never from the `Content-Type` the
// client claims), named by its SHA-256, stored (R2 first, then the `blobs` row, then the project's
// `project_blobs` row) and set in the room under its path. Bytes are served only to a project that
// holds the hash in `project_blobs` or in one of its versions, and always so that nothing in them
// can run on the page's origin: sandboxed, never sniffed, an attachment.

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { requireAccess } from "../access.js";
import { BINARY_TYPES, binaryType } from "../binary.js";
import type { Ctx, Route } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { fail } from "../errors.js";
import { json, readCappedBytes } from "../http.js";
import { blobKey } from "../keys.js";
import { sha256OfBytes, TEXT_MEDIA_TYPE } from "../materialise.js";
import type { CloudStore } from "../store/types.js";

/** Whether the account already references the hash (a live file, an upload): it would cost nothing again. */
async function referencedBy(store: CloudStore, sub: string, hash: string): Promise<boolean> {
  const ids = await store.projectIdsOf(sub);
  const found = await Promise.all(
    ids.map(async (id) => {
      if (await store.hasProjectBlob(id, hash)) return true;
      for (const held of (await store.projectFiles(id)).values()) if (held === hash) return true;
      return false;
    }),
  );
  return found.includes(true);
}

/**
 * Refuses (`413 quota.storage`) an upload that would take the account over its bytes. Usage is read
 * fresh, not from `users.storage_bytes`. Bytes the account already references do not grow it, which
 * is only looked up when the upload would otherwise go over: the account's projects are read then,
 * live files and uploads (a hash held only by an old version counts as new, a refusal at the very
 * edge of the quota and never a wrong accounting). Answers whether it found the bytes referenced.
 *
 * This is the early refusal, before the bytes are stored: it reads and the upload writes later, so
 * requests that run together all pass it. `confirmStorage` is the check that holds.
 */
async function checkStorage(
  store: CloudStore,
  owner: string,
  hash: string,
  size: number,
): Promise<boolean> {
  const used = await store.storageBytesOf(owner);
  if (used + size <= CLOUD_LIMITS.storageBytes) return false;
  if (await referencedBy(store, owner, hash)) return true;
  throw fail("quota.storage");
}

/**
 * The check that holds, made once the upload is registered and so counts in the account's usage:
 * of requests that ran together, each sees the others' rows that came first, so the account never
 * ends over its bytes (two that race may both be refused, never both let through). An upload that
 * is over takes its `project_blobs` row back when the project did not hold the hash before; the
 * bytes in R2 are the weekly collection's.
 */
async function confirmStorage(
  store: CloudStore,
  owner: string,
  projectId: string,
  hash: string,
  settled: boolean,
): Promise<void> {
  // Bytes the project held or the account referenced before this upload do not grow the account.
  if (settled) return;
  if ((await store.storageBytesOf(owner)) <= CLOUD_LIMITS.storageBytes) return;
  await store.removeProjectBlob(projectId, hash).catch(() => false);
  throw fail("quota.storage");
}

/**
 * Lets go of a hash the project no longer has an entry for: removes its `project_blobs` row unless
 * a binary of the room still names it, as the room is NOW (after the push, not before: a request
 * that ran beside this one may have set the same bytes at another path). A version that holds the
 * bytes is served from its own rows and does not need this one. The room is read again after the
 * removal and the row put back if a caller named the hash in between, so that no entry of the
 * document is left without the row its pushes and its bytes need.
 */
async function releaseBlob(ctx: Ctx, projectId: string, hash: string) {
  const { store, rooms } = ctx.deps;
  const named = async () => Object.values((await rooms.read(projectId)).binaries).includes(hash);
  if (await named()) return;
  await store.removeProjectBlob(projectId, hash);
  if (await named()) await store.addProjectBlob(projectId, hash);
}

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
  const { projectId, access } = await requireAccess(ctx, "write");
  const path = ctx.params["path"] ?? "";
  if (!isCleanPath(path)) throw fail("path.invalid");

  const bytes = await readCappedBytes(ctx.request, CLOUD_LIMITS.binaryBytes);
  if (bytes === undefined) throw fail("quota.binary");
  const mediaType = binaryType(bytes);
  if (!mediaType) throw fail("binary.invalid");
  const hash = await sha256OfBytes(bytes);

  const { store, rooms, now } = ctx.deps;
  const owner = access.project.ownerSub;
  const referenced = await checkStorage(store, owner, hash, bytes.length);
  // What is at the path now: the hash the upload replaces, if there is one.
  const before = await rooms.read(projectId);
  const replaced = Object.hasOwn(before.binaries, path) ? before.binaries[path] : undefined;

  // R2 first, then the rows: a row never names bytes that are not there.
  await ctx.env.BLOBS.put(blobKey(hash), bytes);
  await store.addBlobs([{ hash, size: bytes.length, mediaType }], now().toISOString());
  const held = await store.hasProjectBlob(projectId, hash);
  if (!(await store.addProjectBlob(projectId, hash))) throw fail("project.not-found");
  await confirmStorage(store, owner, projectId, hash, referenced || held);
  try {
    await rooms.push(projectId, { binaries: { [path]: hash } });
  } catch (error) {
    if (!held) await store.removeProjectBlob(projectId, hash).catch(() => false);
    throw error;
  }
  // The bytes the upload replaced are no longer the project's to keep, unless another entry has them.
  if (replaced !== undefined && replaced !== hash) await releaseBlob(ctx, projectId, replaced);
  await store.refreshStorageBytes(owner);
  return json({ hash });
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
  const { projectId } = await requireAccess(ctx, "read");
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
