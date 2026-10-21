// The projects of a person (`cloud-projects`, "Projects"): list, create from a template or from
// files, read, rename and describe, duplicate and delete. The files themselves are the room's
// (`routes/rooms.ts`) and the images and fonts are `routes/binaries.ts`; this file keeps the rows
// that name a project and sees that the room and the rows agree.
//
// Every answer is `{ id, name, description, updated_at, thumbnail, role }`, where `thumbnail` is the
// address of the thumbnail on this origin or null, and `role` is what the asker is to the project
// (`owner`, `editor` or `viewer`: `access.ts` resolves it, and the list shows the projects the
// person is a member of beside their own).

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { access as accessOf, requireAccess, requirePrincipal, type Role } from "../access.js";
import type { Ctx, Route } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { fail, type ErrorCode } from "../errors.js";
import { MAX_JSON_BYTES, MAX_PUSH_BYTES, json, readCappedBytes } from "../http.js";
import { newProjectId } from "../ids.js";
import { publishedKey, thumbnailKey } from "../keys.js";
import type { Project } from "../store/types.js";
import { templateFiles, templateName } from "../templates.js";

/** The longest project name, in characters (code points) after trimming. */
export const MAX_NAME_LENGTH = 100;
/** The longest description, in characters (code points). */
export const MAX_DESCRIPTION_LENGTH = 500;

/** What a name may not hold: control characters, line and paragraph separators, lone surrogates. */
const FORBIDDEN_IN_NAME = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A project as every answer shows it. */
export function projectJson(project: Project, role: Role = "owner") {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    updated_at: project.updatedAt,
    thumbnail: project.thumbnailAt === null ? null : `/api/projects/${project.id}/thumbnail`,
    role,
  };
}

/** The name a person gave a project: 1 to 100 characters once trimmed, with nothing unshowable in it. */
function readName(value: unknown): string {
  if (typeof value !== "string") throw fail("request.invalid", "The project needs a name.");
  const name = value.trim();
  const length = Array.from(name).length;
  if (length === 0 || length > MAX_NAME_LENGTH) {
    throw fail("request.invalid", `The name needs 1 to ${MAX_NAME_LENGTH} characters.`);
  }
  if (FORBIDDEN_IN_NAME.test(name)) {
    throw fail("request.invalid", "The name cannot hold control characters.");
  }
  return name;
}

/** A description: at most 500 characters, line breaks allowed, no other control character. */
function readDescription(value: unknown): string {
  if (typeof value !== "string") throw fail("request.invalid", "The description is text.");
  if (Array.from(value).length > MAX_DESCRIPTION_LENGTH) {
    throw fail(
      "request.invalid",
      `The description has at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }
  if (FORBIDDEN_IN_NAME.test(value.replace(/[\n\t]/g, ""))) {
    throw fail("request.invalid", "The description cannot hold control characters.");
  }
  return value;
}

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
  const bytes = await readCappedBytes(ctx.request, maxBytes);
  if (bytes === undefined) throw fail(tooLarge);
  if (bytes.length === 0) {
    if (optional) return {};
    throw fail("request.invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw fail("request.invalid");
  }
  if (!isRecord(value)) throw fail("request.invalid");
  return value;
}

/** What a new project starts with: files by path and the hashes of its images and fonts. */
interface Content {
  readonly files: ReadonlyMap<string, string>;
  readonly binaries: ReadonlyMap<string, string>;
}

/** The entries of an object of text: `request.invalid` for another shape. */
function textEntries(value: unknown, what: string): [string, string][] {
  if (!isRecord(value)) throw fail("request.invalid", `${what} is an object of text by path.`);
  const entries: [string, string][] = [];
  for (const [path, text] of Object.entries(value)) {
    if (typeof text !== "string") {
      throw fail("request.invalid", `${what} is an object of text by path.`);
    }
    entries.push([path, text]);
  }
  return entries;
}

/**
 * The files and binaries a create names, checked as the room would check them so that nothing is
 * created for a request the room would refuse: the shapes (`request.invalid`), every path by the
 * path rule (`path.invalid`), a path that is both (`doc.invalid`), more files than a project may
 * hold (`quota.files`), a text over its limit (`doc.too-large`) and a hash that is not the person's
 * (`blob.unknown`).
 */
async function readContent(
  ctx: Ctx,
  owner: string,
  body: Record<string, unknown>,
): Promise<Content> {
  const template = body["template"];
  if (template !== undefined) {
    if (body["files"] !== undefined || body["binaries"] !== undefined) {
      throw fail("request.invalid", "Name a template, or give files and binaries, not both.");
    }
    const name = templateName(template);
    if (!name) throw fail("request.invalid", "There is no such template.");
    const files = await templateFiles(ctx.deps.assets, ctx.config.origin, name);
    return { files: new Map(Object.entries(files)), binaries: new Map() };
  }

  const files = new Map(body["files"] === undefined ? [] : textEntries(body["files"], "files"));
  const binaries = new Map(
    body["binaries"] === undefined ? [] : textEntries(body["binaries"], "binaries"),
  );
  for (const path of [...files.keys(), ...binaries.keys()]) {
    if (!isCleanPath(path)) throw fail("path.invalid");
  }
  for (const path of files.keys()) if (binaries.has(path)) throw fail("doc.invalid");
  if (files.size + binaries.size > CLOUD_LIMITS.files) throw fail("quota.files");
  for (const text of files.values()) {
    if (text.length > CLOUD_LIMITS.textCharacters) throw fail("doc.too-large");
  }
  for (const hash of binaries.values()) {
    if (!BLOB_HASH.test(hash)) {
      throw fail(
        "request.invalid",
        "A binary is named by the SHA-256 of its bytes, in lowercase hexadecimal.",
      );
    }
  }
  if (binaries.size > 0) {
    // Only bytes the person's own projects hold: a hash is not a capability, and naming one that
    // exists elsewhere must not tell anyone it does.
    const store = ctx.deps.store;
    const held = new Set(
      (
        await Promise.all((await store.projectIdsOf(owner)).map((id) => store.projectBlobs(id)))
      ).flat(),
    );
    for (const hash of binaries.values()) if (!held.has(hash)) throw fail("blob.unknown");
  }
  return { files, binaries };
}

/** Undoes a project that could not be started: its row, then its room. Never throws. */
async function abandon(ctx: Ctx, owner: string, id: string): Promise<void> {
  try {
    await ctx.deps.store.deleteProject(owner, id);
  } catch {
    // The row stays and is the person's to delete.
  }
  try {
    await ctx.deps.rooms.destroy(id);
  } catch {
    // An empty room nobody can reach: nothing to tell.
  }
}

/**
 * Makes the project (the quota is checked in the statement that inserts it: `413 quota.projects`),
 * gives it its images and fonts, puts its files in the room as ONE push and materialises them. When
 * the room refuses the push (`doc.too-large` for a document over 16 MiB, say) the project is taken
 * back and nothing is left. A first materialisation that fails does not fail the creation: the room
 * holds the files and materialises at its next trigger.
 *
 * `binaries` must be hashes the owner already holds (the caller checked); `copyBlobsFrom` gives the
 * new project every `project_blobs` row of that project (duplicate).
 */
async function startProject(
  ctx: Ctx,
  owner: string,
  fields: { readonly name: string; readonly description: string },
  content: Content,
  copyBlobsFrom?: string,
): Promise<Project> {
  const { store, rooms, now, randomBytes } = ctx.deps;
  const id = newProjectId(randomBytes);
  const created = await store.createProject(
    { id, ownerSub: owner, ...fields, createdAt: now().toISOString() },
    CLOUD_LIMITS.projects,
  );
  if (created === "quota") throw fail("quota.projects");
  try {
    if (copyBlobsFrom !== undefined) await store.copyProjectBlobs(owner, copyBlobsFrom, id);
    for (const hash of new Set(content.binaries.values())) await store.addProjectBlob(id, hash);
    if (content.files.size > 0 || content.binaries.size > 0) {
      await rooms.push(id, {
        files: Object.fromEntries(content.files),
        binaries: Object.fromEntries(content.binaries),
      });
      try {
        await rooms.materialise(id);
      } catch {
        console.warn("cloud: the first materialisation of a new project failed; the room retries");
      }
    }
    const project = await store.project(owner, id);
    if (!project) throw fail("project.not-found");
    return project;
  } catch (error) {
    await abandon(ctx, owner, id);
    throw error;
  }
}

/**
 * `GET /api/projects`: the person's projects and the ones they are a member of, the most recently
 * updated first, each with the role the person has in it (a member's role is what they were given,
 * raised by the project's link where it gives more).
 */
export const listProjectsRoute: Route = async (ctx) => {
  const principal = requirePrincipal(ctx);
  const projects = await ctx.deps.store.listProjects(principal.sub);
  return json({
    projects: projects.map((listed) =>
      projectJson(
        listed,
        listed.role === "owner"
          ? "owner"
          : (accessOf(listed, principal, listed.role) ?? listed.role),
      ),
    ),
  });
};

/**
 * `POST /api/projects { name, template? | files?, binaries? }`: a new project, `201` with its row.
 * A template is named (`flow`, `c4`, `sequence`, `free`, `purchase`) and gives the files the
 * playground's build gives, `project.json` included; files are text by path; binaries are hashes of
 * images and fonts the person's projects already hold. Nothing is created for a request that breaks
 * a rule, and the 101st project is `413 quota.projects`.
 */
export const createProjectRoute: Route = async (ctx) => {
  const principal = requirePrincipal(ctx);
  const body = await readObject(ctx, MAX_PUSH_BYTES, "doc.too-large");
  const name = readName(body["name"]);
  const description = body["description"] === undefined ? "" : readDescription(body["description"]);
  const content = await readContent(ctx, principal.sub, body);
  const project = await startProject(ctx, principal.sub, { name, description }, content);
  return json(projectJson(project), 201);
};

/**
 * `GET /api/projects/:id`: the project's row, for anyone the project's link admits, anonymous
 * callers included (`read`); `role` says what the asker is to it, which the page opens in view mode
 * for when it is `viewer`.
 */
export const getProjectRoute: Route = async (ctx) => {
  const { access } = await requireAccess(ctx, "read");
  return json(projectJson(access.project, access.role));
};

/**
 * `PATCH /api/projects/:id { name?, description? }`: renames and describes; a field left out stays.
 * The owner's (`manage`): an editor changes the files, not what the project is called.
 */
export const patchProjectRoute: Route = async (ctx) => {
  const { projectId, access } = await requireAccess(ctx, "manage");
  const body = await readObject(ctx, MAX_JSON_BYTES, "request.invalid");
  const patch: { name?: string; description?: string } = {};
  if (body["name"] !== undefined) patch.name = readName(body["name"]);
  if (body["description"] !== undefined) patch.description = readDescription(body["description"]);
  const project = await ctx.deps.store.updateProject(
    access.project.ownerSub,
    projectId,
    patch,
    ctx.deps.now().toISOString(),
  );
  if (!project) throw fail("project.not-found");
  return json(projectJson(project, access.role));
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
