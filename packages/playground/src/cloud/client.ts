// The page's calls to the cloud projects API (`cloud-projects`): typed answers, and every way a
// call can go wrong as a value. Nothing here throws, because the page works without a service: a
// network error, a timeout, a body that is not what the contract says and a refusal with a stable
// code all come back as `{ ok: false, failure }`. The `fetch` is handed in, so a test answers it.

import { inPage, isObject, parseObject, REQUEST_TIMEOUT_MS, type Fetch } from "./http.js";
import type { ApiFailure, Outcome } from "./tokens.js";

export type { ApiFailure, Outcome };

/** Longest wait for a call that moves bytes (an image or a font up to 10 MiB). */
export const TRANSFER_TIMEOUT_MS = 60_000;

/** The stable codes of the service's refusals the page words (the rest show the service's message). */
export const CLOUD_CODES = [
  "auth.required",
  "project.not-found",
  "version.not-found",
  "path.invalid",
  "blob.unknown",
  "doc.invalid",
  "binary.invalid",
  "quota.projects",
  "quota.storage",
  "quota.files",
  "quota.binary",
  "quota.versions",
  "doc.too-large",
  "versions.rate",
  "thumbnail.rate",
] as const;
export type CloudCode = (typeof CLOUD_CODES)[number];

/** Whether a failure is the service refusing with this code. */
export function hasCode(failure: ApiFailure, code: CloudCode): boolean {
  return failure.kind === "refused" && failure.code === code;
}

// What the service holds -----------------------------------------------------------------------

/** A project as the list and the metadata calls give it. */
export interface CloudProject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** When the project last changed, as the service wrote it (an ISO time). */
  readonly updatedAt: string;
  /** The address of the thumbnail, on the page's own origin; undefined when it has none. */
  readonly thumbnail: string | undefined;
  /** What the person is to the project: `owner` in this change. */
  readonly role: string;
  /**
   * What the service says of the live session whose token the page sent (`live-sessions`): on, until
   * when and whether guests edit; `null` when it is over; undefined when the page sent none.
   */
  readonly live?: LiveGrant | null;
}

/** A live session as the project's answer tells a page that sent its token. */
export interface LiveGrant {
  /** An ISO time. */
  readonly until: string;
  readonly guestsEdit: boolean;
}

/** What a person asks for when creating a project: a template by name, or files of their own. */
export interface NewProject {
  readonly name: string;
  readonly template?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly binaries?: Readonly<Record<string, string>>;
}

/** What `GET /api/projects/:id/files` answers: the latest files, from the room. */
export interface ProjectFiles {
  readonly revision: number;
  readonly files: Readonly<Record<string, string>>;
  /** Images and fonts: the path and the hash of the bytes. */
  readonly binaries: Readonly<Record<string, string>>;
  readonly collisions: readonly unknown[];
}

/** A version of a project. */
export interface ProjectVersion {
  readonly number: number;
  readonly label: string | null;
  /** Made by the service (the daily version, or the state before a restore). */
  readonly auto: boolean;
  readonly createdAt: string;
  readonly createdBy: string;
  /** The paths that differ from the previous version. */
  readonly changed: readonly string[];
}

/** What an account holds and may hold. */
export interface Usage {
  readonly projects: number;
  readonly storageBytes: number;
  readonly limits: Readonly<Record<string, number>>;
}

/** The calls. None throws: a failure is an `Outcome` like any other. */
export interface CloudApi {
  list(): Promise<Outcome<CloudProject[]>>;
  create(input: NewProject): Promise<Outcome<CloudProject>>;
  get(id: string): Promise<Outcome<CloudProject>>;
  update(
    id: string,
    patch: { readonly name?: string; readonly description?: string },
  ): Promise<Outcome<CloudProject>>;
  duplicate(id: string): Promise<Outcome<CloudProject>>;
  remove(id: string): Promise<Outcome<null>>;
  files(id: string): Promise<Outcome<ProjectFiles>>;
  uploadBinary(id: string, path: string, bytes: Uint8Array): Promise<Outcome<{ hash: string }>>;
  deleteBinary(id: string, path: string): Promise<Outcome<null>>;
  blob(id: string, hash: string): Promise<Outcome<Uint8Array>>;
  versions(id: string): Promise<Outcome<ProjectVersion[]>>;
  createVersion(id: string, label?: string): Promise<Outcome<ProjectVersion>>;
  restoreVersion(id: string, number: number): Promise<Outcome<null>>;
  putThumbnail(id: string, svg: string): Promise<Outcome<null>>;
  usage(): Promise<Outcome<Usage>>;
}

// Reading answers --------------------------------------------------------------------------------

/** What an answer holds: the status and the body, as text or as bytes. */
interface Raw {
  readonly status: number;
  readonly text: string;
  readonly bytes?: Uint8Array;
}

type Reader<T> = (answer: Raw) => { value: T } | undefined;

/**
 * Sends a call to the page's own origin with the person's cookie. The answer is read as text (the
 * type the server claims is never trusted), or as bytes for a blob that answered 2xx. Undefined
 * when the service cannot be reached, answers too slowly or its answer cannot be read.
 */
async function exchange(
  fetchFn: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  bytes: boolean,
): Promise<Raw | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      ...init,
      credentials: "same-origin",
      // A blob is named by its hash and never changes: the browser may keep it.
      cache: bytes ? "default" : "no-store",
      signal: controller.signal,
    });
    if (bytes && response.status >= 200 && response.status <= 299) {
      return {
        status: response.status,
        text: "",
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }
    return { status: response.status, text: await response.text() };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The service's `{ code, message }` as a failure (a body that is not one gives the status only). */
function refusal(answer: Raw): ApiFailure {
  const body = parseObject(answer.text);
  const code = body?.["code"];
  const message = body?.["message"];
  return {
    kind: "refused",
    status: answer.status,
    ...(typeof code === "string" && code !== "" ? { code: code.slice(0, 80) } : {}),
    ...(typeof message === "string" && message !== "" ? { message: message.slice(0, 300) } : {}),
  };
}

async function call<T>(
  fetchFn: Fetch,
  url: string,
  init: RequestInit,
  reader: Reader<T>,
  options: { timeout?: number; bytes?: boolean } = {},
): Promise<Outcome<T>> {
  const answer = await exchange(
    fetchFn,
    url,
    init,
    options.timeout ?? REQUEST_TIMEOUT_MS,
    options.bytes ?? false,
  );
  if (!answer) return { ok: false, failure: { kind: "unreachable", status: 0 } };
  if (answer.status < 200 || answer.status > 299) return { ok: false, failure: refusal(answer) };
  const read = reader(answer);
  return read
    ? { ok: true, value: read.value }
    : { ok: false, failure: { kind: "unexpected", status: answer.status } };
}

const text = (value: unknown): value is string => typeof value === "string";
const whole = (value: unknown): value is number => Number.isSafeInteger(value);

/** A time as an ISO string: the service writes one; a number is read as epoch milliseconds. */
function timeOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  return "";
}

/** A thumbnail's address, resolved against the page and only when it is on the page's origin. */
function thumbnailOf(value: unknown, page: string): string | undefined {
  if (!text(value) || value === "") return undefined;
  try {
    const url = new URL(value, page);
    return url.origin === new URL(page).origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** What a project's answer says of a live session: a grant, `null`, or undefined when it says nothing. */
function liveGrantOf(value: unknown): LiveGrant | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  const { until, guestsEdit } = value;
  return text(until) && typeof guestsEdit === "boolean" ? { until, guestsEdit } : undefined;
}

/** A project of the service's shape, or undefined for anything that lacks an id or a name. */
export function projectOf(value: unknown, page: string): CloudProject | undefined {
  if (!isObject(value) || !text(value["id"]) || value["id"] === "" || !text(value["name"])) {
    return undefined;
  }
  const live = liveGrantOf(value["live"]);
  return {
    id: value["id"],
    name: value["name"],
    description: text(value["description"]) ? value["description"] : "",
    updatedAt: timeOf(value["updated_at"]),
    thumbnail: thumbnailOf(value["thumbnail"], page),
    role: text(value["role"]) ? value["role"] : "owner",
    ...(live !== undefined ? { live } : {}),
  };
}

function versionOf(value: unknown): ProjectVersion | undefined {
  if (!isObject(value) || !whole(value["number"])) return undefined;
  const changed = value["changed"];
  const label = value["label"];
  return {
    number: value["number"],
    label: text(label) && label !== "" ? label : null,
    auto: value["auto"] === true || value["auto"] === 1,
    createdAt: timeOf(value["created_at"]),
    createdBy: text(value["created_by"]) ? value["created_by"] : "",
    changed: Array.isArray(changed) ? changed.filter(text) : [],
  };
}

/** A map of text to text, leaving out any entry that is not one. */
function stringMap(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) if (text(entry)) out[key] = entry;
  return out;
}

const json = (answer: Raw): unknown => parseObject(answer.text);

const readProject =
  (page: string): Reader<CloudProject> =>
  (answer) => {
    const project = projectOf(json(answer), page);
    return project ? { value: project } : undefined;
  };

const readProjects =
  (page: string): Reader<CloudProject[]> =>
  (answer) => {
    const rows = parseObject(answer.text)?.["projects"];
    if (!Array.isArray(rows)) return undefined;
    return { value: rows.flatMap((row) => projectOf(row, page) ?? []) };
  };

const readFiles: Reader<ProjectFiles> = (answer) => {
  const body = parseObject(answer.text);
  if (!body || !whole(body["revision"])) return undefined;
  const files = stringMap(body["files"]);
  const binaries = stringMap(body["binaries"]);
  if (!files || !binaries) return undefined;
  const collisions = body["collisions"];
  return {
    value: {
      revision: body["revision"],
      files,
      binaries,
      collisions: Array.isArray(collisions) ? collisions : [],
    },
  };
};

const readHash: Reader<{ hash: string }> = (answer) => {
  const hash = parseObject(answer.text)?.["hash"];
  return text(hash) && hash !== "" ? { value: { hash } } : undefined;
};

const readVersion: Reader<ProjectVersion> = (answer) => {
  const version = versionOf(json(answer));
  return version ? { value: version } : undefined;
};

const readVersions: Reader<ProjectVersion[]> = (answer) => {
  const rows = parseObject(answer.text)?.["versions"];
  if (!Array.isArray(rows)) return undefined;
  return { value: rows.flatMap((row) => versionOf(row) ?? []) };
};

const readUsage: Reader<Usage> = (answer) => {
  const body = parseObject(answer.text);
  if (!body || !whole(body["projects"]) || !whole(body["storageBytes"])) return undefined;
  const limits: Record<string, number> = {};
  const given = body["limits"];
  if (isObject(given)) {
    for (const [key, entry] of Object.entries(given)) {
      if (typeof entry === "number" && Number.isFinite(entry)) limits[key] = entry;
    }
  }
  return { value: { projects: body["projects"], storageBytes: body["storageBytes"], limits } };
};

const nothing: Reader<null> = () => ({ value: null });

/** A path of a project as it goes in an address: each segment encoded, the slashes kept. */
function inPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** The header a live session's guest sends its token in, on the two reads that take it. */
export const LIVE_HEADER = "X-Meltemi-Live";

/** What the calls need beyond the page: the live session's token the page holds, if any. */
export interface CloudApiOptions {
  /**
   * The token of the live session the page joined (`live-sessions`), read at each call: it goes in
   * `X-Meltemi-Live` on the project's read and on the blobs, and on nothing else.
   */
  readonly live?: () => string | undefined;
}

/** The calls of the page to `/api/projects` and `/api/account/usage`, relative to the page. */
export function cloudApi(
  fetchFn: Fetch,
  location: Pick<Location, "href">,
  options: CloudApiOptions = {},
): CloudApi {
  const page = location.href.replace(/#.*$/, "");
  const accept = { Accept: "application/json" };
  /** The token's header, for the two reads a guest makes outside the room. */
  const token = (): Record<string, string> => {
    const live = options.live?.();
    return live === undefined ? {} : { [LIVE_HEADER]: live };
  };
  const asJson = { ...accept, "Content-Type": "application/json" };
  const at = (path: string) => inPage(page, `api/${path}`);
  const project = (id: string, rest = "") => at(`projects/${encodeURIComponent(id)}${rest}`);
  const withBody = (method: string, body: unknown): RequestInit => ({
    method,
    headers: asJson,
    body: JSON.stringify(body),
  });
  return {
    list: () => call(fetchFn, at("projects"), { headers: accept }, readProjects(page)),
    create: (input) => call(fetchFn, at("projects"), withBody("POST", input), readProject(page)),
    get: (id) =>
      call(fetchFn, project(id), { headers: { ...accept, ...token() } }, readProject(page)),
    update: (id, patch) => call(fetchFn, project(id), withBody("PATCH", patch), readProject(page)),
    duplicate: (id) =>
      call(
        fetchFn,
        project(id, "/duplicate"),
        { method: "POST", headers: accept },
        readProject(page),
      ),
    remove: (id) => call(fetchFn, project(id), { method: "DELETE", headers: accept }, nothing),
    files: (id) => call(fetchFn, project(id, "/files"), { headers: accept }, readFiles),
    uploadBinary: (id, path, bytes) =>
      call(
        fetchFn,
        project(id, `/binaries/${inPath(path)}`),
        {
          method: "PUT",
          headers: { ...accept, "Content-Type": "application/octet-stream" },
          body: bytes as Uint8Array<ArrayBuffer>,
        },
        readHash,
        { timeout: TRANSFER_TIMEOUT_MS },
      ),
    deleteBinary: (id, path) =>
      call(
        fetchFn,
        project(id, `/binaries/${inPath(path)}`),
        { method: "DELETE", headers: accept },
        nothing,
      ),
    blob: (id, hash) =>
      call(
        fetchFn,
        project(id, `/blobs/${encodeURIComponent(hash)}`),
        { headers: token() },
        (answer) => (answer.bytes ? { value: answer.bytes } : undefined),
        { timeout: TRANSFER_TIMEOUT_MS, bytes: true },
      ),
    versions: (id) => call(fetchFn, project(id, "/versions"), { headers: accept }, readVersions),
    createVersion: (id, label) =>
      call(
        fetchFn,
        project(id, "/versions"),
        withBody("POST", label === undefined ? {} : { label }),
        readVersion,
      ),
    restoreVersion: (id, number) =>
      call(
        fetchFn,
        project(id, `/versions/${number}/restore`),
        { method: "POST", headers: accept },
        nothing,
      ),
    putThumbnail: (id, svg) =>
      call(
        fetchFn,
        project(id, "/thumbnail"),
        { method: "PUT", headers: { ...accept, "Content-Type": "image/svg+xml" }, body: svg },
        nothing,
      ),
    usage: () => call(fetchFn, at("account/usage"), { headers: accept }, readUsage),
  };
}
