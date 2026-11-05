// The tools of the account, its projects, their files and versions (`mcp-server`, "Projects through
// the tools" and "Files through the tools"). Each calls the operation its HTTP route calls, with the
// caller's principal; the roles each project gives the account decide, as they do for the routes.

import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import * as z from "zod";
import { requirePrincipal, requireProjectAccess } from "../access.js";
import { fail } from "../errors.js";
import { idempotent } from "../idempotency.js";
import { putBinary, readPush } from "../operations/files.js";
import { createProject, listProjects, projectJson, renameProject } from "../operations/projects.js";
import { createVersion, listVersions, restoreVersion } from "../operations/versions.js";
import {
  appUrl,
  diagnosticSchema,
  fromBase64,
  idempotencyKeyArg,
  pathArg,
  projectArg,
  projectSchema,
} from "./shapes.js";
import { KeptRefusal, tool, type AnyTool, type McpSession } from "./tool.js";

const TEXT = new TextEncoder();

/** A project's row with its address. */
function withUrl<T extends { id: string }>(session: McpSession, project: T): T & { url: string } {
  return { ...project, url: appUrl(session.op, project.id) };
}

/**
 * The JSON of the HTTP request a tool stands for, from its arguments: what an idempotency key's hash
 * is of, so that the same key and the same arguments are the same request through either door.
 */
function requestBytes(fields: Record<string, unknown>): Uint8Array {
  const present = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  return TEXT.encode(JSON.stringify(present));
}

/** Runs `run` once for the key when there is one; a refusal kept by the key is answered again. */
async function once<T>(
  session: McpSession,
  key: string | undefined,
  route: string,
  body: Uint8Array,
  status: number,
  run: () => Promise<T>,
): Promise<T> {
  if (key === undefined) return run();
  const answer = await idempotent(session.op, key, route, body, async () => ({
    status,
    body: await run(),
  }));
  if (answer.status >= 400) {
    const code = (answer.body as { code?: unknown } | null)?.code;
    throw new KeptRefusal(typeof code === "string" ? code : "internal", answer.body);
  }
  return answer.body as T;
}

const usageSchema = z.object({ projects: z.number(), storageBytes: z.number() });
const limitsSchema = z.object({
  projects: z.number(),
  storageBytes: z.number(),
  files: z.number(),
  documentBytes: z.number(),
  binaryBytes: z.number(),
  versions: z.number(),
});

const whoami = tool({
  name: "whoami",
  title: "Who am I",
  description:
    "The Meltemi account these tools act as: its name, email and publishing handle, the scopes this connection was granted, and its usage and limits.",
  scope: "projects:read",
  input: z.object({}),
  output: z.object({
    sub: z.string(),
    name: z.string(),
    email: z.string(),
    handle: z.string().nullable(),
    scopes: z.array(z.string()),
    usage: usageSchema,
    limits: limitsSchema,
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session) {
    const { sub } = requirePrincipal(session.op);
    const { store } = session.op.deps;
    const [user, usage] = await Promise.all([store.user(sub), store.usage(sub)]);
    return {
      structured: {
        sub,
        name: user?.name ?? "",
        email: user?.email ?? "",
        handle: user?.handle ?? null,
        scopes: [...session.caller.scopes],
        usage: { projects: usage.projects, storageBytes: usage.storageBytes },
        limits: {
          projects: CLOUD_LIMITS.projects,
          storageBytes: CLOUD_LIMITS.storageBytes,
          files: CLOUD_LIMITS.files,
          documentBytes: CLOUD_LIMITS.documentBytes,
          binaryBytes: CLOUD_LIMITS.binaryBytes,
          versions: CLOUD_LIMITS.versions,
        },
      },
    };
  },
});

const listProjectsTool = tool({
  name: "list_projects",
  title: "List projects",
  description:
    "The account's projects and the ones it is a member of, the most recently updated first, each with the role the account has in it and its address in the app.",
  scope: "projects:read",
  input: z.object({}),
  output: z.object({ projects: z.array(projectSchema) }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session) {
    const { projects } = await listProjects(session.op);
    return { structured: { projects: projects.map((project) => withUrl(session, project)) } };
  },
});

const createProjectTool = tool({
  name: "create_project",
  title: "Create a project",
  description:
    "Creates a project in the account, empty, from a template (flow, c4, sequence, free or purchase) or from files, and answers it with its address. Give an idempotencyKey so that a retry never creates a second project.",
  scope: "projects:write",
  input: z.object({
    name: z.string().describe("1 to 100 characters."),
    description: z.string().optional().describe("At most 500 characters."),
    template: z.enum(["flow", "c4", "sequence", "free", "purchase"]).optional(),
    files: z
      .record(z.string(), z.string())
      .optional()
      .describe('Text by path, such as { "checkout.meltemi": "diagram checkout: flow { … }" }.'),
    binaries: z
      .record(z.string(), z.string())
      .optional()
      .describe("The SHA-256 of an image or font the account's projects already hold, by path."),
    idempotencyKey: idempotencyKeyArg,
  }),
  output: projectSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { idempotencyKey, ...fields }) {
    const project = await once(
      session,
      idempotencyKey,
      "POST /api/projects",
      requestBytes(fields),
      201,
      () => createProject(session.op, fields),
    );
    return { structured: withUrl(session, project) };
  },
});

const getProject = tool({
  name: "get_project",
  title: "Get a project",
  description:
    "A project's name, description, the account's role in it, its current revision, the paths of its files and its address. Use the revision as ifRevision when writing.",
  scope: "projects:read",
  input: z.object({ project: projectArg }),
  output: projectSchema.extend({
    revision: z.number(),
    files: z.array(z.string()).describe("The paths of its text files."),
    binaries: z.array(z.string()).describe("The paths of its images and fonts."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project }) {
    const { access } = await requireProjectAccess(session.op, project, "read");
    const latest = await session.op.deps.rooms.read(project);
    return {
      structured: {
        ...withUrl(session, projectJson(access.project, access.role)),
        revision: latest.revision,
        files: Object.keys(latest.files).sort(),
        binaries: Object.keys(latest.binaries).sort(),
      },
    };
  },
});

const renameProjectTool = tool({
  name: "rename_project",
  title: "Rename a project",
  description:
    "Renames a project or changes its description (the owner's). A field left out stays.",
  scope: "projects:write",
  input: z.object({
    project: projectArg,
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  output: projectSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, ...patch }) {
    return { structured: withUrl(session, await renameProject(session.op, project, patch)) };
  },
});

const readFilesTool = tool({
  name: "read_files",
  title: "Read files",
  description:
    "The project's files as they are now, with the revision they are at: the texts by path, and the SHA-256 of each image or font by path. Give paths to read only those; what a person changed in the app is here.",
  scope: "projects:read",
  input: z.object({
    project: projectArg,
    paths: z.array(pathArg).max(2000).optional(),
  }),
  output: z.object({
    revision: z.number(),
    files: z.record(z.string(), z.string()),
    binaries: z.record(z.string(), z.string()),
    missing: z
      .array(z.string())
      .optional()
      .describe("The paths asked for that the project does not hold."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project, paths }) {
    await requireProjectAccess(session.op, project, "read");
    const latest = await session.op.deps.rooms.read(project);
    if (!paths) {
      return {
        structured: { revision: latest.revision, files: latest.files, binaries: latest.binaries },
      };
    }
    const files: Record<string, string> = {};
    const binaries: Record<string, string> = {};
    const missing: string[] = [];
    for (const path of paths) {
      if (Object.hasOwn(latest.files, path)) files[path] = latest.files[path]!;
      else if (Object.hasOwn(latest.binaries, path)) binaries[path] = latest.binaries[path]!;
      else missing.push(path);
    }
    return {
      structured: {
        revision: latest.revision,
        files,
        binaries,
        ...(missing.length > 0 ? { missing } : {}),
      },
    };
  },
});

/** A refusal of a push whose files have errors: the errors and warnings of the files it pushed. */
function invalidPush(errors: number, diagnostics: readonly z.infer<typeof diagnosticSchema>[]) {
  return fail(
    "diagram.invalid",
    `The push has ${errors === 1 ? "an error" : `${errors} errors`}: nothing was written. Fix them and write again.`,
    { diagnostics },
  );
}

const writeFilesTool = tool({
  name: "write_files",
  title: "Write files",
  description:
    "Writes files of a project in one change that every open page receives at once: text by path (null deletes), and images or fonts by the hash upload_image answered. ifRevision is the revision read_files or get_project gave: a project that changed since is refused (revision.mismatch, with the current revision), so read again and merge. Every .meltemi file written is compiled with the project first: a push with an error is refused whole (diagram.invalid, with the diagnostics). Warnings are answered.",
  scope: "projects:write",
  input: z.object({
    project: projectArg,
    files: z
      .record(z.string(), z.string().nullable())
      .describe("Text by path; null deletes the file."),
    binaries: z
      .record(z.string(), z.string().nullable())
      .optional()
      .describe("An uploaded image or font's SHA-256 by path; null removes it."),
    ifRevision: z.number().int().min(0).describe("The revision the change is made on."),
    idempotencyKey: idempotencyKeyArg,
  }),
  output: z.object({
    revision: z.number(),
    diagnostics: z.array(diagnosticSchema).describe("The warnings of the files written."),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, files, binaries, ifRevision, idempotencyKey }) {
    const { op } = session;
    await requireProjectAccess(op, project, "write");
    const push = readPush({ files, binaries, ifRevision });
    // The room refuses a path the path rule refuses; nothing is compiled for a push it would refuse.
    for (const path of [...Object.keys(files), ...Object.keys(binaries ?? {})]) {
      if (!isCleanPath(path)) throw fail("path.invalid");
    }
    const route = `PUT /api/projects/${project}/files`;
    const answer = await once(
      session,
      idempotencyKey,
      route,
      requestBytes({ files, binaries, ifRevision }),
      200,
      async () => {
        const latest = await op.deps.rooms.read(project);
        if (latest.revision !== ifRevision) {
          throw fail("revision.mismatch", undefined, { revision: latest.revision });
        }
        const merged: Record<string, string> = { ...latest.files };
        for (const [path, text] of Object.entries(push.files ?? {})) {
          if (text === null) delete merged[path];
          else merged[path] = text;
        }
        const written = Object.entries(push.files ?? {})
          .filter(([path, text]) => text !== null && path.endsWith(".meltemi"))
          .map(([path]) => path);
        let diagnostics: z.infer<typeof diagnosticSchema>[] = [];
        if (written.length > 0) {
          const renderers = op.deps.renderers;
          if (!renderers) throw fail("internal");
          const checked = await renderers.validate(project, {
            files: merged,
            paths: written,
            layout: false,
          });
          if (!checked.ok) throw fail("internal");
          diagnostics = [...checked.diagnostics];
          if (checked.errors > 0) throw invalidPush(checked.errors, diagnostics);
        }
        const { revision } = await op.deps.rooms.push(project, push);
        return { revision, diagnostics };
      },
    );
    return { structured: answer };
  },
});

const validateTool = tool({
  name: "validate",
  title: "Validate",
  description:
    "The diagnostics of a file of the project, or of the whole project, as `meltemi-diagrams validate` prints them (the layout's warnings included), at the revision it is at now. Images and fonts are checked by preview.",
  scope: "projects:read",
  input: z.object({ project: projectArg, path: pathArg.optional() }),
  output: z.object({
    revision: z.number(),
    errors: z.number(),
    warnings: z.number(),
    diagnostics: z.array(diagnosticSchema).describe("The first fifty."),
    truncated: z.boolean(),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project, path }) {
    const { op } = session;
    await requireProjectAccess(op, project, "read");
    const latest = await op.deps.rooms.read(project);
    if (path !== undefined && !Object.hasOwn(latest.files, path)) {
      throw fail("request.invalid", `The project has no text file ${path}.`);
    }
    const renderers = op.deps.renderers;
    if (!renderers) throw fail("internal");
    const checked = await renderers.validate(project, {
      files: latest.files,
      ...(path !== undefined ? { paths: [path] } : {}),
    });
    if (!checked.ok) throw fail(checked.code, checked.message);
    return {
      structured: {
        revision: latest.revision,
        errors: checked.errors,
        warnings: checked.warnings,
        diagnostics: [...checked.diagnostics],
        truncated: checked.truncated,
      },
    };
  },
});

const uploadImage = tool({
  name: "upload_image",
  title: "Upload an image",
  description:
    'Uploads the bytes of an image (PNG, JPEG, GIF, WebP, SVG) or a font (woff2, ttf, otf), as base64, to a path of the project, and answers its SHA-256. The file is in the project at once; a .meltemi file shows it by its path (`image "assets/logo.png"`).',
  scope: "projects:write",
  input: z.object({
    project: projectArg,
    path: pathArg,
    data: z.string().describe("The file's bytes, base64. At most 10 MiB of bytes."),
  }),
  output: z.object({ hash: z.string(), path: z.string() }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(session, { project, path, data }) {
    const bytes = fromBase64(data);
    if (!bytes) throw fail("request.invalid", "data is not base64.");
    const { hash } = await putBinary(session.op, project, path, bytes);
    return { structured: { hash, path } };
  },
});

const versionSchema = z.object({
  number: z.number(),
  label: z.string().nullable(),
  auto: z.boolean(),
  created_at: z.string(),
  created_by: z.string(),
  changed: z.array(z.string()),
});

/** A version as the operations answer it, its lists copied for the schema's types. */
const versionOf = <T extends { changed: readonly string[] }>(version: T) => ({
  ...version,
  changed: [...version.changed],
});

const listVersionsTool = tool({
  name: "list_versions",
  title: "List versions",
  description: "The project's versions, the newest first, each with the paths it changed.",
  scope: "projects:read",
  input: z.object({ project: projectArg }),
  output: z.object({ versions: z.array(versionSchema) }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project }) {
    const { versions } = await listVersions(session.op, project);
    return { structured: { versions: versions.map(versionOf) } };
  },
});

const createVersionTool = tool({
  name: "create_version",
  title: "Create a version",
  description:
    "Records the project's files as they are now as a version, with an optional label of at most 80 characters, so that they can be restored later.",
  scope: "projects:write",
  input: z.object({ project: projectArg, label: z.string().optional() }),
  output: versionSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  async run(session, { project, label }) {
    return { structured: versionOf(await createVersion(session.op, project, { label })) };
  },
});

const restoreVersionTool = tool({
  name: "restore_version",
  title: "Restore a version",
  description:
    "Puts the files of a version back in the project, for everybody at once; the state it replaces is kept as a new version first.",
  scope: "projects:write",
  input: z.object({ project: projectArg, number: z.number().int().min(1) }),
  output: z.object({
    revision: z.number(),
    restored: z.number(),
    saved: versionSchema,
    skipped: z.array(z.string()).optional(),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  async run(session, { project, number }) {
    const restored = await restoreVersion(session.op, project, number);
    return { structured: { ...restored, saved: versionOf(restored.saved) } };
  },
});

const openUrl = tool({
  name: "open_url",
  title: "Open in the app",
  description:
    "The address that opens the project in Meltemi Diagrams in the browser, to give the person. It opens for whoever the project's sharing lets in.",
  scope: "projects:read",
  input: z.object({ project: projectArg }),
  output: z.object({ url: z.string() }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(session, { project }) {
    await requireProjectAccess(session.op, project, "read");
    return { structured: { url: appUrl(session.op, project) } };
  },
});

/** The tools of this file, in the catalogue's order. */
export const PROJECT_TOOLS: readonly AnyTool[] = [
  whoami,
  listProjectsTool,
  createProjectTool,
  getProject,
  renameProjectTool,
  readFilesTool,
  writeFilesTool,
  validateTool,
  uploadImage,
  listVersionsTool,
  createVersionTool,
  restoreVersionTool,
  openUrl,
];
