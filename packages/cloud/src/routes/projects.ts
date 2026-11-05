// The projects of a person (`cloud-projects`, "Projects"): list, create from a template or from
// files, read, rename and describe, duplicate and delete. The files themselves are the room's
// (`routes/rooms.ts`) and the images and fonts are `routes/binaries.ts`; this file keeps the rows
// that name a project and sees that the room and the rows agree.
//
// Every answer is `{ id, name, description, updated_at, thumbnail, role }`, where `thumbnail` is the
// address of the thumbnail on this origin or null, and `role` is what the asker is to the project
// (`owner`, `editor` or `viewer`: `access.ts` resolves it, and the list shows the projects the
// person is a member of beside their own).

import { isCleanPath } from "@meltemi/diagrams-project";
import { requireAccess, requirePrincipal, requireReadWithLive } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { fail, type ErrorCode } from "../errors.js";
import { MAX_JSON_BYTES, MAX_PUSH_BYTES, json, readCappedBytes } from "../http.js";
import { answerOnce } from "../idempotency.js";
import { publishedKey, thumbnailKey } from "../keys.js";
import {
  MAX_NAME_LENGTH,
  createProject,
  listProjects,
  projectJson,
  readName,
  renameProject,
  startProject,
} from "../operations/projects.js";

export { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, projectJson } from "../operations/projects.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The JSON object a request carries. A body over `maxBytes` is `tooLarge` (a create names files, so
 * its cap is a document's; the others are a few bytes); a body that is not an object is
 * `request.invalid`; no body at all is `{}` when `optional`.
 */
export async function readObject(
  ctx: Ctx,
  maxBytes: number,
  tooLarge: ErrorCode,
  optional = false,
): Promise<Record<string, unknown>> {
  return (await readObjectBytes(ctx, maxBytes, tooLarge, optional)).value;
}

/** `readObject`, with the bytes the object was read from (what an idempotency key's hash is of). */
export async function readObjectBytes(
  ctx: Ctx,
  maxBytes: number,
  tooLarge: ErrorCode,
  optional = false,
): Promise<{ value: Record<string, unknown>; bytes: Uint8Array }> {
  const bytes = await readCappedBytes(ctx.request, maxBytes);
  if (bytes === undefined) throw fail(tooLarge);
  if (bytes.length === 0) {
    if (optional) return { value: {}, bytes };
    throw fail("request.invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw fail("request.invalid");
  }
  if (!isRecord(value)) throw fail("request.invalid");
  return { value, bytes };
}

/**
 * `GET /api/projects`: the person's projects and the ones they are a member of, the most recently
 * updated first, each with the role the person has in it (a member's role is what they were given,
 * raised by the project's link where it gives more).
 */
export const listProjectsRoute: Route = async (ctx) => json(await listProjects(ctx));

/**
 * `POST /api/projects { name, template? | files?, binaries? }`: a new project, `201` with its row.
 * A template is named (`flow`, `c4`, `sequence`, `free`, `purchase`) and gives the files the
 * playground's build gives, `project.json` included; files are text by path; binaries are hashes of
 * images and fonts the person's projects already hold. Nothing is created for a request that breaks
 * a rule, and the 101st project is `413 quota.projects`.
 */
export const createProjectRoute: Route = async (ctx) => {
  requirePrincipal(ctx);
  const { value, bytes } = await readObjectBytes(ctx, MAX_PUSH_BYTES, "doc.too-large");
  return answerOnce(ctx, "POST /api/projects", bytes, async () => ({
    status: 201,
    body: await createProject(ctx, value),
  }));
};

/**
 * `GET /api/projects/:id`: the project's row, for anyone the project's link admits, anonymous
 * callers included (`read`), and for whoever carries a live session's current token in
 * `X-Meltemi-Live`; `role` says what the asker is to it, which the page opens in view mode for when
 * it is `viewer`. With the header, `live` says whether the session is on (`{ until, guestsEdit }`)
 * or not (`null`), so that a page holding an old link drops the token.
 */
export const getProjectRoute: Route = async (ctx) => {
  const { access, live } = await requireReadWithLive(ctx, { report: true });
  const answer = projectJson(access.project, access.role);
  if (live === undefined) return json(answer);
  // The page that sent a token is told whether its session is still on, and until when.
  return json({
    ...answer,
    live: live ? { until: new Date(live.until).toISOString(), guestsEdit: live.guestsEdit } : null,
  });
};

/**
 * `PATCH /api/projects/:id { name?, description? }`: renames and describes; a field left out stays.
 * The owner's (`manage`): an editor changes the files, not what the project is called.
 */
export const patchProjectRoute: Route = async (ctx) => {
  // The access first, as before: a body is read only for someone who may rename the project.
  await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  return json(await renameProject(ctx, ctx.params["id"] ?? "", body));
};

/** The name a copy gets when the caller names none: `<name> (copy)`, cut to fit. */
function copyName(name: string): string {
  const suffix = " (copy)";
  const room = MAX_NAME_LENGTH - suffix.length;
  const characters = Array.from(name);
  return `${characters.length > room ? characters.slice(0, room).join("").trimEnd() : name}${suffix}`;
}

/**
 * `POST /api/projects/:id/duplicate { name? }`: a new project (`201`) with the room's latest files
 * and a copy of the `project_blobs` rows, under a new id and name, in the CALLER's account: whoever
 * may read a project (a viewer by link included) may keep a copy, which costs their own quota. A file
 * the path rule refuses (a collision loser, shown as `<path>~<id>`) cannot be put in a document and
 * is left out; the answer then lists them as `skipped`. The caller must be signed in: a project the
 * link admits anonymous callers to is `401 auth.required` for them, and one it does not admit is `404`.
 */
export const duplicateProjectRoute: Route = async (ctx) => {
  const { principal, projectId, access } = await requireAccess(ctx, "read");
  if (!principal) throw fail("auth.required");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid", true);
  const name = body["name"] === undefined ? copyName(access.project.name) : readName(body["name"]);

  const { store, rooms } = ctx.deps;
  const latest = await rooms.read(projectId);
  const skipped: string[] = [];
  const files = new Map<string, string>();
  const binaries = new Map<string, string>();
  for (const [path, text] of Object.entries(latest.files)) {
    if (isCleanPath(path)) files.set(path, text);
    else skipped.push(path);
  }
  for (const [path, hash] of Object.entries(latest.binaries)) {
    // A hash the source holds only through a version still copies: `projectHoldsBlob` says so.
    if (isCleanPath(path) && (await store.projectHoldsBlob(projectId, hash))) {
      binaries.set(path, hash);
    } else skipped.push(path);
  }
  const project = await startProject(
    ctx,
    principal.sub,
    { name, description: access.project.description },
    { files, binaries },
    projectId,
  );
  return json(
    skipped.length > 0 ? { ...projectJson(project), skipped } : projectJson(project),
    201,
  );
};

/**
 * `DELETE /api/projects/:id` (the owner's: `manage`): the room's storage is destroyed (its sockets
 * closed), the thumbnail and the published pages are deleted, then the rows go in one atomic step
 * (the files, `project_blobs`, the versions, the members, invitations and publications); the blobs
 * stay for the weekly collection. Each step is safe to repeat, so a failure partway is answered as
 * an error and the person deletes again.
 */
export const deleteProjectRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "manage");
  const owner = access.project.ownerSub;
  // The rows say which pages there are: read before they go, deleted before them.
  const published = await ctx.deps.store.publicationsOf(projectId);
  await ctx.deps.rooms.destroy(projectId);
  await ctx.env.BLOBS.delete(thumbnailKey(projectId));
  for (const { handle, slug } of published) await ctx.env.BLOBS.delete(publishedKey(handle, slug));
  if (!(await ctx.deps.store.deleteProject(owner, projectId))) throw fail("project.not-found");
  // What the project referenced is no longer the person's.
  await ctx.deps.store.refreshStorageBytes(owner);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
