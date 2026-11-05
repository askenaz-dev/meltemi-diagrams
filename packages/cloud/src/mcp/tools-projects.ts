// The Worker's answers to the tools of the account, its projects, their files and versions
// (`mcp-server`, "Projects through the tools" and "Files through the tools"; the definitions are
// `@meltemi/diagrams-mcp`'s). Each calls the operation its HTTP route calls, with the caller's
// principal; the roles each project gives the account decide, as they do for the routes.

import { TOOLS, fromBase64, type ToolDiagnostic } from "@meltemi/diagrams-mcp";
import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { requirePrincipal, requireProjectAccess } from "../access.js";
import { fail } from "../errors.js";
import { idempotent } from "../idempotency.js";
import { putBinary, readPush } from "../operations/files.js";
import { createProject, listProjects, projectJson, renameProject } from "../operations/projects.js";
import { createVersion, listVersions, restoreVersion } from "../operations/versions.js";
import { appUrl, renderersOf } from "./shapes.js";
import { KeptRefusal, implement, type AnyImplementation, type McpSession } from "./tool.js";

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

const whoami = implement(TOOLS.whoami, async (session) => {
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
});

const listProjectsTool = implement(TOOLS.list_projects, async (session) => {
  const { projects } = await listProjects(session.op);
  return { structured: { projects: projects.map((project) => withUrl(session, project)) } };
});

const createProjectTool = implement(
  TOOLS.create_project,
  async (session, { idempotencyKey, ...fields }) => {
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
);

const getProject = implement(TOOLS.get_project, async (session, { project }) => {
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
});

const renameProjectTool = implement(
  TOOLS.rename_project,
  async (session, { project, ...patch }) => {
    return { structured: withUrl(session, await renameProject(session.op, project, patch)) };
  },
);

const readFilesTool = implement(TOOLS.read_files, async (session, { project, paths }) => {
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
});

/** A refusal of a push whose files have errors: the errors and warnings of the files it pushed. */
function invalidPush(errors: number, diagnostics: readonly ToolDiagnostic[]) {
  return fail(
    "diagram.invalid",
    `The push has ${errors === 1 ? "an error" : `${errors} errors`}: nothing was written. Fix them and write again.`,
    { diagnostics },
  );
}

const writeFilesTool = implement(
  TOOLS.write_files,
  async (session, { project, files, binaries, ifRevision, idempotencyKey }) => {
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
        let diagnostics: ToolDiagnostic[] = [];
        if (written.length > 0) {
          const renderers = renderersOf(op);
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
);

const validateTool = implement(TOOLS.validate, async (session, { project, path }) => {
  const { op } = session;
  await requireProjectAccess(op, project, "read");
  const latest = await op.deps.rooms.read(project);
  if (path !== undefined && !Object.hasOwn(latest.files, path)) {
    throw fail("request.invalid", `The project has no text file ${path}.`);
  }
  const renderers = renderersOf(op);
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
});

const uploadImage = implement(TOOLS.upload_image, async (session, { project, path, data }) => {
  const bytes = fromBase64(data);
  if (!bytes) throw fail("request.invalid", "data is not base64.");
  const { hash } = await putBinary(session.op, project, path, bytes);
  return { structured: { hash, path } };
});

/** A version as the operations answer it, its lists copied for the schema's types. */
const versionOf = <T extends { changed: readonly string[] }>(version: T) => ({
  ...version,
  changed: [...version.changed],
});

const listVersionsTool = implement(TOOLS.list_versions, async (session, { project }) => {
  const { versions } = await listVersions(session.op, project);
  return { structured: { versions: versions.map(versionOf) } };
});

const createVersionTool = implement(TOOLS.create_version, async (session, { project, label }) => {
  return { structured: versionOf(await createVersion(session.op, project, { label })) };
});

const restoreVersionTool = implement(
  TOOLS.restore_version,
  async (session, { project, number }) => {
    const restored = await restoreVersion(session.op, project, number);
    return { structured: { ...restored, saved: versionOf(restored.saved) } };
  },
);

const openUrl = implement(TOOLS.open_url, async (session, { project }) => {
  await requireProjectAccess(session.op, project, "read");
  return { structured: { url: appUrl(session.op, project) } };
});

/** The tools of this file, in the catalogue's order. */
export const PROJECT_TOOLS: readonly AnyImplementation[] = [
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
