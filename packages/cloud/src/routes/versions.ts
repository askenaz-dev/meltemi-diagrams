// Versions of a project (`cloud-projects`, "Versions"): `POST` and `GET /api/projects/:id/versions`,
// `GET /api/projects/:id/versions/:n` and `POST /api/projects/:id/versions/:n/restore`. The policy
// (the cap, the rate, thinning, the daily version) is `versions.ts`; this file is the requests.
//
// A version is a copy of the project's `project_files` rows, so the room materialises before one is
// made (`rooms.materialise`): what a version holds is what the room held a moment ago. Its texts are
// in R2 under `blobs/<hash>`; its images and fonts are hashes.

import { isCleanPath, isTextPath } from "@meltemi/diagrams-project";
import { requireAccess } from "../access.js";
import type { Ctx, Route } from "../context.js";
import type { R2Like } from "../env.js";
import { ApiError, errorResponse, fail } from "../errors.js";
import { MAX_JSON_BYTES, json } from "../http.js";
import { blobKey } from "../keys.js";
import { TEXT_MEDIA_TYPE } from "../materialise.js";
import type { CloudStore, Version } from "../store/types.js";
import { compareBinary } from "../store/shared.js";
import {
  RATE_WINDOW_MS,
  changedPaths,
  readLabel,
  recordVersion,
  type Recorded,
} from "../versions.js";
import { readObject } from "./projects.js";

/** How many texts are read from R2 at the same time. */
const READS_AT_ONCE = 8;

/** How many times a restore records the state again when people type while it does: the room is busy. */
const RESTORE_ATTEMPTS = 3;

/** A version as every answer shows it. `changed` is what differs from the version before it. */
function versionJson(version: Version, changed: readonly string[]) {
  return {
    number: version.number,
    label: version.label,
    auto: version.auto,
    created_at: version.createdAt,
    created_by: version.createdBy,
    changed,
  };
}

/** The version number the path names; anything that cannot be a number is a version nobody has. */
function versionNumber(ctx: Ctx): number {
  const text = ctx.params["n"] ?? "";
  if (!/^[1-9][0-9]{0,8}$/.test(text)) throw fail("version.not-found");
  return Number(text);
}

/** The answer for a version that was not recorded: the cap, the rate, or a project that is gone. */
function refusal(why: "quota" | "rate" | "missing"): Response {
  if (why === "missing") return errorResponse(fail("project.not-found"));
  if (why === "quota") return errorResponse(fail("quota.versions"));
  const limited = errorResponse(fail("versions.rate"));
  limited.headers.set("Retry-After", String(RATE_WINDOW_MS / 1000));
  return limited;
}

/** A version just recorded, with the paths it changed against the one before it that still exists. */
async function describeRecorded(store: CloudStore, projectId: string, recorded: Recorded) {
  const { version, remaining } = recorded;
  const before = [...remaining].reverse().find((held) => held.number < version.number);
  const [files, previous] = await Promise.all([
    store.versionFiles(projectId, version.number),
    before ? store.versionFiles(projectId, before.number) : Promise.resolve(undefined),
  ]);
  return versionJson(version, changedPaths(previous, files ?? new Map()));
}

/** The text of a blob: its bytes in R2 as UTF-8, a byte-order mark kept (it is part of the text that was hashed). */
async function readText(blobs: R2Like, hash: string): Promise<string> {
  const object = await blobs.get(blobKey(hash));
  if (!object) {
    // A row names bytes that are not there: the store and the bucket disagree. Say nothing of it.
    console.error("cloud: a version's blob has no object in R2");
    throw fail("internal");
  }
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
}

/** The files of a version: texts by path, and the hashes of its images and fonts by path. */
interface Contents {
  readonly files: [string, string][];
  readonly binaries: [string, string][];
}

/**
 * What a version holds, or undefined for a version the project does not have. The hashes of its files
 * say nothing of their kind, so the kind is decided from what the project knows: a hash that was
 * uploaded to it (`project_blobs`) is an image or a font; so is a hash of a path that is not a text
 * path and whose blob was first registered as something other than text. Anything else is a text,
 * read from R2 (each distinct text once).
 */
async function readContents(
  ctx: Ctx,
  projectId: string,
  number: number,
): Promise<Contents | undefined> {
  const { store } = ctx.deps;
  const held = await store.versionFiles(projectId, number);
  if (held === undefined) return undefined;
  const uploads = new Set(await store.projectBlobs(projectId));
  const texts: [string, string][] = [];
  const binaries: [string, string][] = [];
  for (const [path, hash] of [...held].sort((a, b) => compareBinary(a[0], b[0]))) {
    let binary = uploads.has(hash);
    if (!binary && !isTextPath(path)) {
      const row = await store.blob(hash);
      binary = row !== undefined && row.mediaType !== TEXT_MEDIA_TYPE;
    }
    (binary ? binaries : texts).push([path, hash]);
  }

  const reads = new Map<string, Promise<string>>();
  const textOf = (hash: string): Promise<string> => {
    let read = reads.get(hash);
    if (!read) {
      read = readText(ctx.env.BLOBS, hash);
      reads.set(hash, read);
    }
    return read;
  };
  const files: [string, string][] = [];
  for (let at = 0; at < texts.length; at += READS_AT_ONCE) {
    files.push(
      ...(await Promise.all(
        texts
          .slice(at, at + READS_AT_ONCE)
          .map(async ([path, hash]): Promise<[string, string]> => [path, await textOf(hash)]),
      )),
    );
  }
  return { files, binaries };
}

/**
 * `POST /api/projects/:id/versions { label? }`: the room materialises, and the project's files are
 * recorded as the next version, `201` with `{ number, label, auto, created_at, created_by, changed }`.
 * A label is at most 80 characters (counted as characters); none, or an empty one, makes an
 * unlabelled version. `413 quota.versions` when the project is full after thinning, `429
 * versions.rate` beyond six in a minute; nothing is recorded then.
 */
export const createVersionRoute: Route = async (ctx) => {
  const { principal, projectId, access } = await requireAccess(ctx, "write");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true);
  const label = readLabel(body["label"]);
  if (label === undefined) {
    throw fail(
      "request.invalid",
      "A label is text of at most 80 characters, without control characters.",
    );
  }
  const { store, rooms, now } = ctx.deps;
  await rooms.materialise(projectId);
  const recorded = await recordVersion(store, {
    projectId,
    owner: access.project.ownerSub,
    label,
    auto: false,
    createdBy: principal.sub,
    now: now(),
    rated: true,
  });
  if (typeof recorded === "string") return refusal(recorded);
  return json(await describeRecorded(store, projectId, recorded), 201);
};

/** `GET /api/projects/:id/versions`: `{ versions }`, the newest first, each with the paths it changed. */
export const listVersionsRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "read");
  const { store } = ctx.deps;
  const [versions, changes] = await Promise.all([
    store.listVersions(projectId),
    store.versionChanges(projectId),
  ]);
  return json({
    versions: [...versions]
      .reverse()
      .map((version) => versionJson(version, changes.get(version.number) ?? [])),
  });
};

/**
 * `GET /api/projects/:id/versions/:n`: `{ number, label, auto, created_at, created_by, files, binaries
 * }`, the texts by path (from R2) and the hashes of the images and fonts by path. `404
 * version.not-found` for a number the project does not hold.
 */
export const getVersionRoute: Route = async (ctx) => {
  const { projectId } = await requireAccess(ctx, "read");
  const number = versionNumber(ctx);
  const version = await ctx.deps.store.version(projectId, number);
  if (!version) throw fail("version.not-found");
  const contents = await readContents(ctx, projectId, number);
  if (!contents) throw fail("version.not-found");
  const { number: held, label, auto, createdAt, createdBy } = version;
  // `fromEntries` defines own properties: a file called `__proto__` stays a file.
  return json({
    number: held,
    label,
    auto,
    created_at: createdAt,
    created_by: createdBy,
    files: Object.fromEntries(contents.files),
    binaries: Object.fromEntries(contents.binaries),
  });
};

/**
 * `POST /api/projects/:id/versions/:n/restore`: the room holds the version's files afterwards, as ONE
 * transaction that the clients receive as a change from elsewhere, and a new automatic version holds
 * the state it replaced. `200 { revision, restored, saved, skipped? }`. In this order: the version's
 * files are read (a version that is gone, or bytes that are missing, change nothing), the room
 * materialises, the state before is recorded (`413 quota.versions`, `429 versions.rate`: a restore
 * that would make the 201st version, or a seventh in a minute, changes nothing), and the room
 * applies the files, if it is still at the revision it materialised (else the state is recorded
 * again, up to three times, and then `409 revision.mismatch`). A path the path rule refuses (a collision loser, listed `<path>~<id>`) cannot be
 * put in a document and is left out; `skipped` lists them.
 */
export const restoreVersionRoute: Route = async (ctx) => {
  const { principal, projectId, access } = await requireAccess(ctx, "write");
  const number = versionNumber(ctx);
  const { store, rooms, now } = ctx.deps;
  const contents = await readContents(ctx, projectId, number);
  if (!contents) throw fail("version.not-found");

  // `fromEntries` defines own properties: a file called `__proto__` stays a file.
  const skipped: string[] = [];
  const fits = ([path]: [string, string]): boolean => {
    if (isCleanPath(path)) return true;
    skipped.push(path);
    return false;
  };
  const files = Object.fromEntries(contents.files.filter(fits));
  const binaries = Object.fromEntries(contents.binaries.filter(fits));

  // The state before is recorded from what the room materialised, and the room applies the files only
  // if it is still at the revision that was materialised: what people typed in the meantime is in
  // the room and not in the version, and a restore would delete it for everybody. When the room has
  // moved on, the state is materialised and recorded again; a room that keeps moving for a few
  // rounds answers `409 revision.mismatch` and the person asks again.
  let recorded: Awaited<ReturnType<typeof recordVersion>>;
  let revision: number;
  for (let attempt = 1; ; attempt++) {
    const { revision: materialised } = await rooms.materialise(projectId);
    recorded = await recordVersion(store, {
      projectId,
      owner: access.project.ownerSub,
      label: null,
      auto: true,
      createdBy: principal.sub,
      now: now(),
      rated: true,
    });
    if (typeof recorded === "string") return refusal(recorded);

    // The room checks every hash against `project_blobs`: a hash a version holds may have been removed
    // from the project's uploads since (the image was deleted), and is the project's again.
    for (const hash of new Set(Object.values(binaries))) {
      if (!(await store.addProjectBlob(projectId, hash))) throw fail("project.not-found");
    }
    try {
      ({ revision } = await rooms.restore(projectId, files, binaries, materialised));
      break;
    } catch (error) {
      const moved = error instanceof ApiError && error.code === "revision.mismatch";
      if (!moved || attempt === RESTORE_ATTEMPTS) throw error;
    }
  }
  await store.refreshStorageBytes(access.project.ownerSub);
  return json({
    revision,
    restored: number,
    saved: await describeRecorded(store, projectId, recorded),
    ...(skipped.length > 0 ? { skipped: skipped.sort(compareBinary) } : {}),
  });
};
