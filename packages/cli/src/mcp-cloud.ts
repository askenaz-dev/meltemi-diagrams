/**
 * The cloud tools of the local server (`mcp-local-server`, "The cloud tools through the HTTP API"):
 * every tool of the hosted endpoint's catalogue, answered through the service's HTTP API with the
 * command line's sign-in, and never through `/mcp` or the renderer object. What the endpoint
 * computes in its renderer object is computed here, in this process, by the same engine: the
 * pictures of `preview`, the checks of `validate` and `write_files`, and the catalog of `publish`.
 *
 * The token is looked up again at each call (`mdg login` in another terminal is used without a
 * restart), and none means `auth.required`, naming `mdg login`. Each route's answer is shaped into
 * the tool's result, and the wrapper checks it against the tool's output schema: an answer of another
 * shape is `internal`, never a wrong result.
 */

import { BRAND_NAME } from "@meltemi/diagrams-layout";
import {
  MAX_DRAWING_BINARY_BYTES,
  Refusal,
  SCOPES,
  TOOLS,
  appUrl,
  drawingBinaryPaths,
  fromBase64,
  projectLink,
  type HandlersOf,
  type ToolAnswer,
} from "@meltemi/diagrams-mcp";
import { CLOUD_LIMITS, isCleanPath } from "@meltemi/diagrams-project";
import { CloudClient, projectUrl, segment, type CloudFiles } from "./cloud-client.js";
import { CloudError } from "./cloud-errors.js";
import { checkAnswer, checkWidth, PATH_INVALID, previewAnswer } from "./mcp-drawing.js";
import type { DrawingEngine } from "./mcp-engine.js";

/** The most bytes of images and fonts kept in memory by one process. */
export const BLOB_CACHE_BYTES = 64 * 1024 * 1024;

/** A slug as the service takes it: 1 to 60 lowercase letters, digits or hyphens. */
const SLUG = /^[a-z0-9-]{1,60}$/;

/** What the cloud tools are given. */
export interface CloudToolsOptions {
  /** The service's origin, as `--host`, `MELTEMI_HOST` or the default name it. */
  readonly host: string;
  /** The token now: `MELTEMI_TOKEN`, else the credentials file's entry for the host; asked at each call. */
  readonly token: () => string | undefined;
  readonly engine: DrawingEngine;
  /** The command line's version: the catalog's generator. */
  readonly toolVersion: string;
  /** The catalog's runtime script, as `build catalog` and `publish` use it; read when first needed. */
  readonly catalogScript: () => string;
  /** Replaces `fetch`: the tests' stub service. */
  readonly fetch?: typeof fetch | undefined;
  readonly userAgent?: string | undefined;
}

/** The images and fonts drawings use, by hash, the least recently used dropped first. */
export class BlobCache {
  private readonly entries = new Map<string, Uint8Array>();
  private bytes = 0;

  constructor(private readonly limit = BLOB_CACHE_BYTES) {}

  get(hash: string): Uint8Array | undefined {
    const found = this.entries.get(hash);
    if (found) {
      this.entries.delete(hash);
      this.entries.set(hash, found);
    }
    return found;
  }

  put(hash: string, bytes: Uint8Array): void {
    if (this.entries.has(hash) || bytes.byteLength > this.limit) return;
    this.entries.set(hash, bytes);
    this.bytes += bytes.byteLength;
    for (const [oldest, kept] of this.entries) {
      if (this.bytes <= this.limit) break;
      this.entries.delete(oldest);
      this.bytes -= kept.byteLength;
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A route's answer as a tool's result; the wrapper checks it against the tool's output schema. */
const answer = <T>(value: unknown): ToolAnswer<T> => ({ structured: value as T });

/** A route's answer with the project's address in the app. */
const withUrl = (host: string, value: unknown): unknown =>
  isRecord(value) && typeof value["id"] === "string"
    ? { ...value, url: appUrl(host, value["id"]) }
    : value;

/** A version as the tools answer it: the operations' fields, a missing label as null. */
const versionOf = (value: unknown): unknown =>
  isRecord(value) ? { ...value, label: value["label"] ?? null } : value;

/** Turns the client's failures into refusals with the service's codes. */
export function cloudRefusal(error: unknown): Refusal | undefined {
  if (error instanceof Refusal) return error;
  if (!(error instanceof CloudError)) return undefined;
  if (error.code === "cloud.not-signed-in") return signInRefusal();
  const { host: _host, reason: _reason, ...details } = error.details;
  return new Refusal(error.code, error.message, details);
}

/** The refusal of a call made with no token. */
function signInRefusal(): Refusal {
  return new Refusal(
    "auth.required",
    "Sign in first: run `mdg login` in a terminal (or set MELTEMI_TOKEN); the next call uses it.",
  );
}

/** The handlers of `mdg mcp` without `--folder`. */
export function cloudHandlers(options: CloudToolsOptions): HandlersOf<typeof TOOLS> {
  const { host, engine } = options;
  const blobs = new BlobCache();

  /** A client with the token as it is now; `auth.required` with none. */
  const client = (): CloudClient => {
    const token = options.token();
    if (token === undefined) throw signInRefusal();
    return new CloudClient({
      host,
      token,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    });
  };

  /** The JSON of a route's answer. */
  const call = async (
    method: string,
    path: string,
    body?: { json?: unknown; idempotencyKey?: string | undefined },
  ): Promise<unknown> => {
    return (
      await client().call(method, path, {
        ...(body?.json !== undefined ? { json: body.json } : {}),
        ...(body?.idempotencyKey !== undefined ? { idempotencyKey: body.idempotencyKey } : {}),
      })
    ).body;
  };

  /** The images and fonts a drawing of `snapshot` uses, from the cache or the service. */
  const drawingBinaries = async (
    api: CloudClient,
    project: string,
    snapshot: CloudFiles,
  ): Promise<Record<string, Uint8Array>> => {
    const out: Record<string, Uint8Array> = {};
    let total = 0;
    for (const [path, hash] of drawingBinaryPaths(snapshot.files, snapshot.binaries)) {
      let bytes = blobs.get(hash);
      if (!bytes) {
        try {
          bytes = await api.blob(project, hash);
        } catch (error) {
          // A blob the service does not hold is left out, as the endpoint leaves out an object
          // missing from R2, and the drawing reports the image it could not find.
          if (error instanceof CloudError && error.status === 404) continue;
          throw error;
        }
        blobs.put(hash, bytes);
      }
      total += bytes.byteLength;
      if (total > MAX_DRAWING_BINARY_BYTES) {
        throw new Refusal(
          "request.invalid",
          "The images and fonts this project uses weigh more than 24 MiB: they cannot be drawn on the server.",
        );
      }
      out[path] = bytes;
    }
    return out;
  };

  return {
    whoami: async () => {
      const api = client();
      const [session, usage] = await Promise.all([api.call("GET", "/api/session"), api.usage()]);
      const user =
        isRecord(session.body) && isRecord(session.body["user"]) ? session.body["user"] : {};
      return answer({
        sub: user["sub"],
        name: user["name"] ?? "",
        email: typeof user["email"] === "string" ? user["email"] : "",
        handle: user["handle"] ?? null,
        scopes: [...SCOPES],
        usage: { projects: usage.projects, storageBytes: usage.storageBytes },
        limits: {
          projects: CLOUD_LIMITS.projects,
          storageBytes: CLOUD_LIMITS.storageBytes,
          files: CLOUD_LIMITS.files,
          documentBytes: CLOUD_LIMITS.documentBytes,
          binaryBytes: CLOUD_LIMITS.binaryBytes,
          versions: CLOUD_LIMITS.versions,
        },
      });
    },

    list_projects: async () => {
      const projects = await client().projects();
      return answer({ projects: projects.map((project) => withUrl(host, project)) });
    },

    create_project: async ({ idempotencyKey, ...fields }) => {
      const created = await call("POST", "/api/projects", { json: fields, idempotencyKey });
      return answer(withUrl(host, created));
    },

    get_project: async ({ project }) => {
      const api = client();
      const row = (await api.call("GET", projectUrl(project))).body;
      const latest = await api.files(project);
      const { live: _live, ...fields } = isRecord(row) ? row : {};
      return answer({
        ...(withUrl(host, fields) as object),
        revision: latest.revision,
        files: Object.keys(latest.files).sort(),
        binaries: Object.keys(latest.binaries).sort(),
      });
    },

    rename_project: async ({ project, ...patch }) => {
      return answer(withUrl(host, await call("PATCH", projectUrl(project), { json: patch })));
    },

    read_files: async ({ project, paths }) => {
      const latest = await client().files(project);
      if (!paths) {
        return answer({
          revision: latest.revision,
          files: latest.files,
          binaries: latest.binaries,
        });
      }
      const files: Record<string, string> = {};
      const binaries: Record<string, string> = {};
      const missing: string[] = [];
      for (const path of paths) {
        if (Object.hasOwn(latest.files, path)) files[path] = latest.files[path]!;
        else if (Object.hasOwn(latest.binaries, path)) binaries[path] = latest.binaries[path]!;
        else missing.push(path);
      }
      return answer({
        revision: latest.revision,
        files,
        binaries,
        ...(missing.length > 0 ? { missing } : {}),
      });
    },

    write_files: async ({ project, files, binaries, ifRevision, idempotencyKey }) => {
      // The room refuses a path the path rule refuses; nothing is compiled for a push it would refuse.
      for (const path of [...Object.keys(files), ...Object.keys(binaries ?? {})]) {
        if (!isCleanPath(path)) throw new Refusal("path.invalid", PATH_INVALID);
      }
      const api = client();
      const latest = await api.files(project);
      const merged: Record<string, string> = { ...latest.files };
      for (const [path, text] of Object.entries(files)) {
        if (text === null) delete merged[path];
        else merged[path] = text;
      }
      const written = Object.entries(files)
        .filter(([path, text]) => text !== null && path.endsWith(".meltemi"))
        .map(([path]) => path);
      let diagnostics: ReturnType<typeof checkAnswer>["diagnostics"] = [];
      if (written.length > 0) {
        const checked = checkAnswer(
          await engine.validate({ files: merged, paths: written, layout: false }),
        );
        diagnostics = checked.diagnostics;
        // At the revision the change is made on, an error refuses it whole. At another, the service
        // decides: it answers a retry of a change it made as it did, and refuses any other.
        if (latest.revision === ifRevision && checked.errors > 0) {
          throw new Refusal(
            "diagram.invalid",
            `The push has ${checked.errors === 1 ? "an error" : `${checked.errors} errors`}: nothing was written. Fix them and write again.`,
            { diagnostics },
          );
        }
      }
      // The body in the order the endpoint hashes it, so a key means the same push through either door.
      const body = Object.fromEntries(
        Object.entries({ files, binaries, ifRevision }).filter(([, value]) => value !== undefined),
      );
      const pushed = await api.call("PUT", `${projectUrl(project)}/files`, {
        json: body,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      });
      const revision = isRecord(pushed.body) ? pushed.body["revision"] : undefined;
      return answer({ revision, diagnostics });
    },

    validate: async ({ project, path }) => {
      const latest = await client().files(project);
      if (path !== undefined && !Object.hasOwn(latest.files, path)) {
        throw new Refusal("request.invalid", `The project has no text file ${path}.`);
      }
      const checked = checkAnswer(
        await engine.validate({
          files: latest.files,
          ...(path !== undefined ? { paths: [path] } : {}),
        }),
      );
      return answer({ revision: latest.revision, ...checked });
    },

    upload_image: async ({ project, path, data }) => {
      const bytes = fromBase64(data);
      if (!bytes) throw new Refusal("request.invalid", "data is not base64.");
      const hash = await client().putBinary(project, path, bytes);
      return answer({ hash, path });
    },

    list_versions: async ({ project }) => {
      const listed = await call("GET", `${projectUrl(project)}/versions`);
      const versions =
        isRecord(listed) && Array.isArray(listed["versions"]) ? listed["versions"] : [];
      return answer({ versions: versions.map(versionOf) });
    },

    create_version: async ({ project, label }) => {
      const made = await call("POST", `${projectUrl(project)}/versions`, {
        json: label === undefined ? {} : { label },
      });
      return answer(versionOf(made));
    },

    restore_version: async ({ project, number }) => {
      const restored = await call("POST", `${projectUrl(project)}/versions/${number}/restore`, {
        json: {},
      });
      return answer(
        isRecord(restored) ? { ...restored, saved: versionOf(restored["saved"]) } : restored,
      );
    },

    open_url: async ({ project }) => {
      // Asked so that the address is only given for a project the account can open.
      await call("GET", projectUrl(project));
      return answer({ url: appUrl(host, project) });
    },

    preview: async (args) => {
      const format = args.format ?? "png";
      // The width first, before anything is read: a request the renderer would refuse costs nothing.
      checkWidth(format, args.width);
      const api = client();
      const latest = await api.files(args.project);
      if (!Object.hasOwn(latest.files, args.path) || !args.path.endsWith(".meltemi")) {
        throw new Refusal("request.invalid", `The project has no .meltemi file ${args.path}.`);
      }
      const binaries = await drawingBinaries(api, args.project, latest);
      const outcome = await engine.render({
        revision: latest.revision,
        files: latest.files,
        binaries,
        file: args.path,
        format,
        ...(args.diagram !== undefined ? { diagram: args.diagram } : {}),
        ...(args.story !== undefined ? { story: args.story } : {}),
        ...(args.at !== undefined ? { at: args.at } : {}),
        ...(args.width !== undefined ? { width: args.width } : {}),
        ...(args.theme !== undefined ? { theme: args.theme } : {}),
      });
      return previewAnswer(outcome);
    },

    get_sharing: async ({ project }) => answer(await call("GET", `${projectUrl(project)}/sharing`)),

    set_link_access: async ({ project, level }) => {
      const state = await call("PATCH", `${projectUrl(project)}/sharing`, {
        json: { linkAccess: level },
      });
      return answer({ ...(isRecord(state) ? state : {}), link: projectLink(host, project) });
    },

    invite: async ({ project, email, role }) => {
      const invited = await client().call("POST", `${projectUrl(project)}/members`, {
        json: { email, role },
      });
      const { link, ...invitation } = isRecord(invited.body) ? invited.body : {};
      return answer({ invitation, link, emailSent: false, created: invited.status === 201 });
    },

    list_invitations: async ({ project }) =>
      answer(await call("GET", `${projectUrl(project)}/invitations`)),

    revoke_invitation: async ({ project, invitation }) => {
      await call("DELETE", `${projectUrl(project)}/invitations/${segment(invitation)}`);
      return answer({ revoked: true });
    },

    set_member_role: async ({ project, member, role }) =>
      answer(
        await call("PATCH", `${projectUrl(project)}/members/${segment(member)}`, {
          json: { role },
        }),
      ),

    remove_member: async ({ project, member }) => {
      await call("DELETE", `${projectUrl(project)}/members/${segment(member)}`);
      return answer({ removed: true });
    },

    get_live: async ({ project }) =>
      answer({ live: await call("GET", `${projectUrl(project)}/live`) }),

    start_live: async ({ project, guestsEdit }) =>
      answer(
        await call("PUT", `${projectUrl(project)}/live`, {
          json: guestsEdit === undefined ? {} : { guestsEdit },
        }),
      ),

    end_live: async ({ project }) => {
      await call("DELETE", `${projectUrl(project)}/live`);
      return answer({ ended: true });
    },

    list_publications: async ({ project }) =>
      answer(
        await call(
          "GET",
          project === undefined ? "/api/account/publications" : `${projectUrl(project)}/publish`,
        ),
      ),

    publish: async ({ project, slug }) => {
      const api = client();
      // What would refuse the publication is asked before the catalog is built: the project's
      // publication state is the owner's, and says whether the account has a handle.
      const state = (await api.call("GET", `${projectUrl(project)}/publish`)).body;
      if (!isRecord(state) || typeof state["handle"] !== "string") {
        throw new Refusal("handle.required", "Choose a handle before publishing.");
      }
      if (!SLUG.test(slug)) {
        throw new Refusal(
          "publish.invalid",
          "A publication needs a slug of 1 to 60 lowercase letters, digits or hyphens, and HTML.",
        );
      }
      const latest = await api.files(project);
      const binaries = await drawingBinaries(api, project, latest);
      const built = await engine.catalog({
        files: latest.files,
        binaries,
        script: options.catalogScript(),
        generator: `${BRAND_NAME} ${options.toolVersion}`,
      });
      if (!built.ok) {
        throw new Refusal(
          built.code,
          built.message,
          built.diagnostics ? { diagnostics: built.diagnostics } : {},
        );
      }
      const published = await api.publish(project, { slug, html: built.html });
      if (!(await servedAt(published.url, options.fetch))) {
        throw new Refusal(
          "publish.unverified",
          `The page was published, but ${published.url} did not answer yet; try the address again in a moment.`,
          { url: published.url },
        );
      }
      return answer({
        ...published,
        entries: built.entries,
        skipped: [...built.skipped],
        diagnostics: [...built.diagnostics],
      });
    },

    unpublish: async ({ project, slug }) => {
      await client().unpublish(project, slug);
      return answer({ unpublished: true, slug });
    },
  };
}

/** Whether the publish host serves the address now: one `HEAD`, a `200` and nothing else. */
async function servedAt(url: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
