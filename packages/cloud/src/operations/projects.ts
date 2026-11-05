// The operations on a person's projects (`cloud-projects`, "Projects"): list, create, read, rename and
// describe, and the start of a project that duplicate shares. Each takes the operation's context (who
// asks, the store, the rooms) and its input, checks the input by the service's rules and answers the
// JSON every route and tool shows. The routes (`routes/projects.ts`) read the request and call these;
// the MCP tools (`mcp/tools-projects.ts`) call the same functions with the arguments their schemas
// admitted, so a rule holds the same whichever door a request came in by.
//
// Every answer is `{ id, name, description, updated_at, thumbnail, role }`, where `thumbnail` is the
// address of the thumbnail on this origin or null, and `role` is what the asker is to the project
// (`owner`, `editor` or `viewer`: `access.ts` resolves it, and the list shows the projects the
// person is a member of beside their own).

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import {
  access as accessOf,
  requirePrincipal,
  requireProjectAccess,
  type Role,
} from "../access.js";
import type { OpCtx, Unchecked } from "../context.js";
import { BLOB_HASH } from "../document.js";
import { fail } from "../errors.js";
import { newProjectId } from "../ids.js";
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

export type ProjectJson = ReturnType<typeof projectJson>;

/** The name a person gave a project: 1 to 100 characters once trimmed, with nothing unshowable in it. */
export function readName(value: unknown): string {
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
export function readDescription(value: unknown): string {
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

/** What a new project starts with: files by path and the hashes of its images and fonts. */
export interface Content {
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

/** What `create` is given: a name, a description, and a template or files and binaries. */
export interface CreateInput {
  readonly name: string;
  readonly description?: string;
  /** `flow`, `c4`, `sequence`, `free` or `purchase`: the files the playground's build gives. */
  readonly template?: string;
  /** Text by path. */
  readonly files?: Readonly<Record<string, string>>;
  /** The SHA-256 of an image or font the person's projects already hold, by path. */
  readonly binaries?: Readonly<Record<string, string>>;
}

/**
 * The files and binaries a create names, checked as the room would check them so that nothing is
 * created for a request the room would refuse: the shapes (`request.invalid`), every path by the
 * path rule (`path.invalid`), a path that is both (`doc.invalid`), more files than a project may
 * hold (`quota.files`), a text over its limit (`doc.too-large`) and a hash that is not the person's
 * (`blob.unknown`).
 */
async function readContent(
  ctx: OpCtx,
  owner: string,
  body: Unchecked<CreateInput>,
): Promise<Content> {
  const template = body.template;
  if (template !== undefined) {
    if (body.files !== undefined || body.binaries !== undefined) {
      throw fail("request.invalid", "Name a template, or give files and binaries, not both.");
    }
    const name = templateName(template);
    if (!name) throw fail("request.invalid", "There is no such template.");
    const files = await templateFiles(ctx.deps.assets, ctx.config.origin, name);
    return { files: new Map(Object.entries(files)), binaries: new Map() };
  }

  const files = new Map(body.files === undefined ? [] : textEntries(body.files, "files"));
  const binaries = new Map(
    body.binaries === undefined ? [] : textEntries(body.binaries, "binaries"),
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
async function abandon(ctx: OpCtx, owner: string, id: string): Promise<void> {
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
export async function startProject(
  ctx: OpCtx,
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
 * The person's projects and the ones they are a member of, the most recently updated first, each
 * with the role the person has in it (a member's role is what they were given, raised by the
 * project's link where it gives more).
 */
export async function listProjects(ctx: OpCtx): Promise<{ projects: ProjectJson[] }> {
  const principal = requirePrincipal(ctx);
  const projects = await ctx.deps.store.listProjects(principal.sub);
  return {
    projects: projects.map((listed) =>
      projectJson(
        listed,
        listed.role === "owner"
          ? "owner"
          : (accessOf(listed, principal, listed.role) ?? listed.role),
      ),
    ),
  };
}

/**
 * A new project in the asker's account, from a template or from files: its row. Nothing is created
 * for a request that breaks a rule, and the 101st project is `413 quota.projects`.
 */
export async function createProject(
  ctx: OpCtx,
  input: Unchecked<CreateInput>,
): Promise<ProjectJson> {
  const principal = requirePrincipal(ctx);
  const name = readName(input.name);
  const description = input.description === undefined ? "" : readDescription(input.description);
  const content = await readContent(ctx, principal.sub, input);
  const project = await startProject(ctx, principal.sub, { name, description }, content);
  return projectJson(project);
}

/** What `rename` is given: a field left out stays. */
export interface RenameInput {
  readonly name?: string;
  readonly description?: string;
}

/**
 * Renames and describes a project. The owner's (`manage`): an editor changes the files, not what the
 * project is called.
 */
export async function renameProject(
  ctx: OpCtx,
  projectId: string,
  input: Unchecked<RenameInput>,
): Promise<ProjectJson> {
  const { access } = await requireProjectAccess(ctx, projectId, "manage");
  const patch: { name?: string; description?: string } = {};
  if (input.name !== undefined) patch.name = readName(input.name);
  if (input.description !== undefined) patch.description = readDescription(input.description);
  const project = await ctx.deps.store.updateProject(
    access.project.ownerSub,
    projectId,
    patch,
    ctx.deps.now().toISOString(),
  );
  if (!project) throw fail("project.not-found");
  return projectJson(project, access.role);
}
