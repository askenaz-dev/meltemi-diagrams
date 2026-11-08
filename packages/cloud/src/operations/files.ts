// The operations on a project's files (`cloud-projects`, "Images and fonts by hash";
// `cloud-document`, "Reads and pushes"): the latest files from the room, a push, and an image or a
// font uploaded by its bytes. The routes (`routes/rooms.ts`, `routes/binaries.ts`) read the request
// and call these; the MCP tools call them with their arguments.

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { requireProjectAccess } from "../access.js";
import { binaryType } from "../binary.js";
import type { OpCtx } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { fail } from "../errors.js";
import { blobKey } from "../keys.js";
import { sha256OfBytes } from "../materialise.js";
import { parsePush, type PushRequest, type RoomFiles } from "../rooms.js";
import type { CloudStore } from "../store/types.js";

/**
 * The latest files, from the room (never from D1). Needs `read`: it is the snapshot an anonymous
 * viewer of a `view` or `edit` link reads when the room does not answer its socket.
 */
export async function readFiles(ctx: OpCtx, projectId: string): Promise<RoomFiles> {
  await requireProjectAccess(ctx, projectId, "read");
  return ctx.deps.rooms.read(projectId);
}

/**
 * A push from untrusted JSON, checked: `400 request.invalid` for anything that is not one or a binary
 * named by something other than a SHA-256. Whether the paths and hashes are the project's is the
 * room's to say.
 */
export function readPush(value: unknown): PushRequest {
  const push = parsePush(value);
  if (!push) throw fail("request.invalid");
  for (const hash of Object.values(push.binaries ?? {})) {
    if (hash !== null && !BLOB_HASH.test(hash)) {
      throw fail(
        "request.invalid",
        "A binary is named by the SHA-256 of its bytes, in lowercase hexadecimal.",
      );
    }
  }
  return push;
}

/**
 * Applies a push, `{ files: { path: text | null }, binaries: { path: hash | null }, ifRevision? }`,
 * as one transaction of the room, which answers the rest (`400 path.invalid`, `400 blob.unknown`,
 * `409 revision.mismatch` with the revision it is at). Needs `write`.
 */
export async function pushFiles(
  ctx: OpCtx,
  projectId: string,
  push: unknown,
): Promise<{ revision: number }> {
  await requireProjectAccess(ctx, projectId, "write");
  return ctx.deps.rooms.push(projectId, readPush(push));
}

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
 * bytes in R2 are the scheduled collection's.
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
export async function releaseBlob(ctx: OpCtx, projectId: string, hash: string): Promise<void> {
  const { store, rooms } = ctx.deps;
  const named = async () => Object.values((await rooms.read(projectId)).binaries).includes(hash);
  if (await named()) return;
  await store.removeProjectBlob(projectId, hash);
  if (await named()) await store.addProjectBlob(projectId, hash);
}

/**
 * Uploads the bytes of an image or a font to a path of the project: answers `{ hash }`. The path
 * passes the path rule (`400 path.invalid`), the bytes are at most 10 MiB (`413 quota.binary`), the
 * type comes from the bytes (`400 binary.invalid` for anything else) and the account may not go over
 * its storage (`413 quota.storage`); in each case nothing is stored. The room has the last word on
 * the document (`quota.files`, `doc.too-large`): an upload it refuses leaves the `project_blobs` row
 * only when the project held the hash before. An upload that replaces the entry at the path lets go
 * of the hash it replaced, unless another entry names it. Needs `write`.
 */
export async function putBinary(
  ctx: OpCtx,
  projectId: string,
  path: string,
  bytes: Uint8Array,
): Promise<{ hash: string }> {
  const { access } = await requireProjectAccess(ctx, projectId, "write");
  if (!isCleanPath(path)) throw fail("path.invalid");
  if (bytes.length > CLOUD_LIMITS.binaryBytes) throw fail("quota.binary");
  const mediaType = binaryType(bytes);
  if (!mediaType) throw fail("binary.invalid");
  const owned = new Uint8Array(bytes);
  const hash = await sha256OfBytes(owned);

  const { store, rooms, now } = ctx.deps;
  const owner = access.project.ownerSub;
  const referenced = await checkStorage(store, owner, hash, owned.length);
  // What is at the path now: the hash the upload replaces, if there is one.
  const before = await rooms.read(projectId);
  const replaced = Object.hasOwn(before.binaries, path) ? before.binaries[path] : undefined;

  // R2 first, then the rows: a row never names bytes that are not there.
  await ctx.env.BLOBS.put(blobKey(hash), owned);
  await store.addBlobs([{ hash, size: owned.length, mediaType }], now().toISOString());
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
  return { hash };
}
