/**
 * The cloud service's API over Node's `fetch` (`cli-cloud`). One `CloudClient` talks to one host
 * and holds at most one bearer token; the rules a token travels by are kept here so that no command
 * has to remember them:
 *
 * - every URL is built from the host the client was made for, and the bearer token is sent to that
 *   origin and to no other; redirects are never followed (a `3xx` is `cloud.redirect`);
 * - the host is `https:`, or `http:` only on `127.0.0.1`, `localhost` or `[::1]`; anything else is
 *   refused when the client is made (`cloud.insecure-host`), before a request exists;
 * - every request has a timeout (`cloud.timeout`), and every body is read through a limit
 *   (`cloud.response-too-large`);
 * - a JSON error answer becomes a `CloudError` with the service's `code` and `status`; its message
 *   never holds a token. `token.invalid` and `auth.required` carry exit code 3 (run `mdg login`).
 *
 * `fetch` is injectable, so tests run against a stub server or a function.
 */

import { createHash } from "node:crypto";
import {
  CLOUD_LIMITS,
  CLOUD_PROJECT_ID,
  isCleanPath,
  parseCloudHost,
} from "@meltemi/diagrams-project";
import { CloudError } from "./cloud-errors.js";
import { REDACTED_TOKEN, redactSecrets } from "./redact.js";

export type Fetch = typeof fetch;

/** The most an error answer is read for: a code and a sentence. */
const ERROR_BYTES = 64 * 1024;
/** The most a small JSON answer (the session, a project, a list) may weigh. */
const SMALL_BYTES = 1024 * 1024;
/** The most the files of a project or a version may weigh as JSON: four times a document's limit. */
const FILES_BYTES = CLOUD_LIMITS.documentBytes * 4;
/** The most a push request may weigh: the service's own cap on a document and a megabyte. */
export const MAX_PUSH_BYTES = CLOUD_LIMITS.documentBytes + 1024 * 1024;

export const DEFAULT_TIMEOUT_MS = 30_000;
export const LARGE_TIMEOUT_MS = 120_000;

export interface CloudClientOptions {
  /** The service's origin, as `resolveHost` gives it. */
  readonly host: string;
  /** The bearer token; absent for the calls that need none (the code exchange). */
  readonly token?: string | undefined;
  /** `fetch`, `globalThis.fetch` by default. */
  readonly fetch?: Fetch | undefined;
  /** Milliseconds a small request may take; large ones take `LARGE_TIMEOUT_MS`. */
  readonly timeoutMs?: number | undefined;
  /** The `User-Agent` of every request. */
  readonly userAgent?: string | undefined;
}

// ----------------------------------------------------------------------------- answer shapes

export interface SessionUser {
  readonly sub: string;
  readonly name: string;
  readonly picture: string;
  /** The account's handle, or null until it chose one. */
  readonly handle: string | null;
}

/** `GET /api/session` with a bearer token: who it is for, and which token it is. */
export interface BearerSession {
  readonly user: SessionUser;
  readonly token: { readonly id: string; readonly name: string };
}

/** `POST /cli-auth/token`: the token, shown once. */
export interface IssuedToken {
  readonly id: string;
  readonly name: string;
  readonly token: string;
}

export type CloudRole = "owner" | "editor" | "viewer";

/** A cloud project as every answer shows it. */
export interface CloudProject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly updated_at: string;
  readonly thumbnail: string | null;
  readonly role: CloudRole;
}

/** What `POST /api/projects` takes: a template, or files and the hashes of images and fonts. */
export interface CreateProject {
  readonly name: string;
  readonly description?: string;
  readonly template?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly binaries?: Readonly<Record<string, string>>;
}

/** `GET /api/projects/:id/files`: the latest files, by path. */
export interface CloudFiles {
  readonly revision: number;
  /** Path to text. */
  readonly files: Readonly<Record<string, string>>;
  /** Path to the SHA-256 (64 lowercase hexadecimal characters) of an image or a font. */
  readonly binaries: Readonly<Record<string, string>>;
  /** A path two clients made at once: the loser appears as `<path>~<id>` in `files`. */
  readonly collisions: readonly unknown[];
}

/** What `PUT /api/projects/:id/files` takes; `null` deletes the path. */
export interface PushBody {
  readonly files?: Readonly<Record<string, string | null>>;
  readonly binaries?: Readonly<Record<string, string | null>>;
  /** Applies only when the room is at exactly this revision (else `409 revision.mismatch`). */
  readonly ifRevision?: number;
}

export interface CloudVersion {
  readonly number: number;
  readonly label: string;
  readonly auto: boolean;
  readonly created_at: string;
  readonly created_by: string;
  /** The paths whose hash differs from the previous version still held. */
  readonly changed: readonly string[];
}

/** `GET /api/projects/:id/versions/:n`: a version with its files. */
export interface CloudVersionFiles extends CloudVersion {
  readonly files: Readonly<Record<string, string>>;
  readonly binaries: Readonly<Record<string, string>>;
}

export interface CloudPublication {
  readonly slug: string;
  readonly url: string;
  readonly published_at: string;
  readonly bytes: number;
}

/** `GET /api/projects/:id/publish`. */
export interface PublishState {
  /** The owner's handle, or null until they choose one. */
  readonly handle: string | null;
  readonly publications: readonly CloudPublication[];
  readonly takedowns: readonly {
    readonly slug: string;
    readonly at: string;
    readonly reason: string;
  }[];
}

/** `PUT /api/projects/:id/publish`. */
export interface Published {
  readonly url: string;
  readonly handle: string;
  readonly slug: string;
  readonly bytes: number;
  readonly published_at: string;
}

export interface CloudUsage {
  readonly projects: number;
  readonly storageBytes: number;
  readonly limits: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------------- helpers

/** The SHA-256 of bytes or text (as UTF-8) in lowercase hexadecimal: the name of a blob. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const HASH = /^[0-9a-f]{64}$/;

/** A record of strings from an untrusted answer, with own properties only (`__proto__` is a key). */
function stringRecord(
  value: unknown,
  accept: (text: string) => boolean = () => true,
): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, v]) => isString(v) && accept(v))) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * A value as one segment of an address: encoded, and never `.` or `..`, which an address resolves
 * to another path (even as `%2e`).
 */
function segment(value: string): string {
  if (value === "." || value === "..") {
    throw new CloudError("cloud.bad-request", `${value} cannot be part of an address.`);
  }
  return encodeURIComponent(value);
}

/** The address of a project: its id has the service's shape, or it cannot be a project's (`project.not-found`). */
function projectUrl(id: string): string {
  if (!CLOUD_PROJECT_ID.test(id)) {
    throw new CloudError("project.not-found", `${id} is not the id of a cloud project.`, {
      details: { project: id },
    });
  }
  return `/api/projects/${id}`;
}

/** The segments of a file path, each URL-encoded. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly bytes: Uint8Array;
}

interface RequestOptions {
  readonly json?: unknown;
  readonly body?: Uint8Array;
  readonly contentType?: string;
  /** Whether the bearer token goes with it (it does unless false). */
  readonly auth?: boolean;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  /** Statuses that are answers, not errors. */
  readonly accept?: readonly number[];
  /** Values that are never to appear in an error (the one-time code of the exchange). */
  readonly secrets?: readonly string[];
}

// -------------------------------------------------------------------------------- the client

export class CloudClient {
  /** The origin every request goes to. */
  readonly host: string;
  private readonly token: string | undefined;
  private readonly fetcher: Fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string | undefined;

  /**
   * Throws `cloud.insecure-host` for an `http:` host that is not the loopback and `cloud.host-invalid`
   * for one that is not an origin, whether or not there is a token: the one-time code and the token
   * the exchange answers would travel in the clear too.
   */
  constructor(options: CloudClientOptions) {
    const parsed = parseCloudHost(options.host);
    if (!parsed.ok) {
      throw new CloudError(
        parsed.reason === "insecure" ? "cloud.insecure-host" : "cloud.host-invalid",
        parsed.reason === "insecure"
          ? `${options.host} is an http: address; a token only travels over https:, or http: to 127.0.0.1, localhost or [::1].`
          : `${options.host} is not the address of a service.`,
        { details: { host: options.host } },
      );
    }
    this.host = parsed.origin;
    this.token = options.token === undefined || options.token === "" ? undefined : options.token;
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent;
  }

  /** The text with this client's token and any `mdg_…` token replaced: the only way a message leaves. */
  private clean(text: string, secrets: readonly string[] = []): string {
    let result = redactSecrets(text, {});
    for (const secret of [this.token, ...secrets]) {
      if (secret !== undefined && secret.length >= 4)
        result = result.split(secret).join(REDACTED_TOKEN);
    }
    return result;
  }

  private notSignedIn(): CloudError {
    return new CloudError("cloud.not-signed-in", `There is no token for ${this.host}.`, {
      details: { host: this.host },
    });
  }

  /** What went wrong with a request that got no answer: a timeout, or the host cannot be reached. */
  private unreachable(error: unknown, secrets: readonly string[] = []): CloudError {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return new CloudError("cloud.timeout", `${this.host} did not answer in time.`, {
        details: { host: this.host },
      });
    }
    const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
    const reason =
      cause?.code ?? cause?.message ?? (error as Error | null)?.message ?? String(error);
    return new CloudError(
      "cloud.unreachable",
      this.clean(`Cannot reach ${this.host}: ${reason}`, secrets),
      { details: { host: this.host, reason: this.clean(String(reason), secrets) } },
    );
  }

  private tooLarge(): CloudError {
    return new CloudError(
      "cloud.response-too-large",
      `${this.host} sent more than the command line accepts.`,
      { details: { host: this.host } },
    );
  }

  private badResponse(status: number, why: string): CloudError {
    return new CloudError("cloud.bad-response", this.clean(`${this.host} answered ${why}.`), {
      status,
      details: { host: this.host },
    });
  }

  /** Reads a body up to `limit` bytes; `overflow` decides what a longer one is. */
  private async read(
    response: Response,
    limit: number,
    overflow: "fail" | "truncate",
  ): Promise<Uint8Array> {
    const declared = Number(response.headers.get("content-length"));
    if (overflow === "fail" && Number.isFinite(declared) && declared > limit) {
      void response.body?.cancel().catch(() => undefined);
      throw this.tooLarge();
    }
    if (response.body === null) return new Uint8Array(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          if (overflow === "fail") throw this.tooLarge();
          chunks.push(value.subarray(0, value.byteLength - (total - limit)));
          break;
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof CloudError) throw error;
      throw this.unreachable(error);
    }
    const bytes = new Uint8Array(Math.min(total, limit));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  /**
   * One request. Builds the address from the host (a path that would leave it is a bug and is
   * refused), sends the token only when `auth` allows, never follows a redirect, and turns an error
   * answer into a `CloudError`.
   */
  private async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Answer> {
    const url = new URL(path, this.host);
    if (url.origin !== this.host) {
      throw new CloudError(
        "cloud.bad-request",
        `Refusing to send ${path} anywhere but ${this.host}.`,
      );
    }
    const headers = new Headers({ accept: "application/json" });
    if (this.userAgent !== undefined) headers.set("user-agent", this.userAgent);
    if (options.auth !== false && this.token !== undefined) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    let body: Uint8Array<ArrayBuffer> | string | undefined;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers.set("content-type", "application/json");
    } else if (options.body !== undefined) {
      // A copy backed by a plain ArrayBuffer, which `fetch` accepts as a body.
      body = new Uint8Array(options.body);
      headers.set("content-type", options.contentType ?? "application/octet-stream");
    }
    let response: Response;
    try {
      response = await this.fetcher(url.href, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
      });
    } catch (error) {
      throw this.unreachable(error, options.secrets);
    }
    const { status } = response;
    if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      throw new CloudError(
        "cloud.redirect",
        `${this.host} answered with a redirect (${status}); the command line does not follow redirects with a token.`,
        { status, details: { host: this.host } },
      );
    }
    if (status >= 400 && !(options.accept ?? []).includes(status)) {
      throw await this.failure(method, response, options.secrets ?? []);
    }
    const bytes = await this.read(response, options.maxBytes ?? SMALL_BYTES, "fail");
    return { status, headers: response.headers, bytes };
  }

  /** The `CloudError` of an error answer: the service's `{ code, message }`, or a stand-in. */
  private async failure(
    method: string,
    response: Response,
    secrets: readonly string[],
  ): Promise<CloudError> {
    const { status } = response;
    const retry = Number(response.headers.get("retry-after"));
    const retryAfter = Number.isFinite(retry) && retry >= 0 ? retry : undefined;
    const bytes =
      method === "HEAD" ? new Uint8Array(0) : await this.read(response, ERROR_BYTES, "truncate");
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      parsed = undefined;
    }
    if (
      isRecord(parsed) &&
      isString(parsed["code"]) &&
      /^[a-z][a-z0-9.-]{0,63}$/.test(parsed["code"])
    ) {
      const { code, message, ...rest } = parsed;
      return new CloudError(
        code as string,
        this.clean(isString(message) ? message : `${this.host} answered ${status}.`, secrets),
        { status, details: rest, ...(retryAfter === undefined ? {} : { retryAfter }) },
      );
    }
    // A HEAD has no body to carry a code; what it can say is that the token was refused.
    if (status === 401 && this.token !== undefined) {
      return new CloudError("token.invalid", `${this.host} refused the token.`, { status });
    }
    return this.badResponse(status, `${status}, which is not an answer of the service`);
  }

  /** The JSON of an answer, or `cloud.bad-response`. */
  private json(answer: Answer): unknown {
    try {
      return JSON.parse(new TextDecoder().decode(answer.bytes));
    } catch {
      throw this.badResponse(answer.status, "with something that is not JSON");
    }
  }

  private needToken(): void {
    if (this.token === undefined) throw this.notSignedIn();
  }

  // -------------------------------------------------------------------------- the account

  /**
   * `GET /api/session` with the token: who it is for and which token it is (so that `--token`
   * learns its id). `token.invalid` when the service refuses the token.
   */
  async session(): Promise<BearerSession> {
    this.needToken();
    const value = this.json(await this.request("GET", "/api/session"));
    const user = isRecord(value) ? value["user"] : undefined;
    const token = isRecord(value) ? value["token"] : undefined;
    if (!isRecord(user) || !isString(user["sub"]) || !isString(user["name"])) {
      // The service answers anybody with `user: null`: it did not take the token.
      if (isRecord(value) && value["user"] === null) {
        throw new CloudError("token.invalid", `${this.host} did not take the token.`, {
          status: 200,
        });
      }
      throw this.badResponse(200, "with a session that has no user");
    }
    if (!isRecord(token) || !isString(token["id"]) || !isString(token["name"])) {
      throw this.badResponse(200, "with a session that is not a token's");
    }
    const handle = user["handle"];
    return {
      user: {
        sub: user["sub"],
        name: user["name"],
        picture: isString(user["picture"]) ? user["picture"] : "",
        handle: isString(handle) ? handle : null,
      },
      token: { id: token["id"], name: token["name"] },
    };
  }

  /**
   * `POST /cli-auth/token`: exchanges the one-time code of the approval for a token, which the
   * service answers once. Sends no bearer token. `cli.invalid` for a code that is unknown, used or
   * expired or a `state` that does not match, `cli.rate` after too many failures, `quota.tokens` at
   * 20 tokens.
   */
  async exchangeCode(code: string, state: string): Promise<IssuedToken> {
    const value = this.json(
      await this.request("POST", "/cli-auth/token", {
        json: { code, state },
        auth: false,
        secrets: [code],
      }),
    );
    if (
      !isRecord(value) ||
      !isString(value["id"]) ||
      !isString(value["name"]) ||
      !isString(value["token"])
    ) {
      throw this.badResponse(200, "with an exchange that holds no token");
    }
    return { id: value["id"], name: value["name"], token: value["token"] };
  }

  /** `DELETE /api/tokens/:id`: revokes one of the person's tokens, the one in use included. */
  async deleteToken(id: string): Promise<void> {
    this.needToken();
    await this.request("DELETE", `/api/tokens/${segment(id)}`);
  }

  /** `GET /api/account/usage`. */
  async usage(): Promise<CloudUsage> {
    this.needToken();
    const value = this.json(await this.request("GET", "/api/account/usage"));
    if (!isRecord(value) || typeof value["projects"] !== "number") {
      throw this.badResponse(200, "with a usage that is not one");
    }
    const limits = isRecord(value["limits"]) ? value["limits"] : {};
    return {
      projects: value["projects"],
      storageBytes: typeof value["storageBytes"] === "number" ? value["storageBytes"] : 0,
      limits: Object.fromEntries(
        Object.entries(limits).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      ),
    };
  }

  /**
   * `PATCH /api/account`: chooses the handle of the publications' addresses. The service accepts it
   * from a person signed in on the page and from a token alike; a service that refuses a token
   * answers `403 request.forbidden`.
   * `handle.taken`, `handle.locked` and `handle.invalid` are the other refusals.
   */
  async setHandle(handle: string): Promise<string> {
    this.needToken();
    const value = this.json(await this.request("PATCH", "/api/account", { json: { handle } }));
    if (!isRecord(value) || !isString(value["handle"])) {
      throw this.badResponse(200, "with an account that has no handle");
    }
    return value["handle"];
  }

  // -------------------------------------------------------------------------- projects

  private project(value: unknown): CloudProject {
    if (
      !isRecord(value) ||
      !isString(value["id"]) ||
      !isString(value["name"]) ||
      !isString(value["updated_at"])
    ) {
      throw this.badResponse(200, "with a project that is not one");
    }
    const role = value["role"];
    return {
      id: value["id"],
      name: value["name"],
      description: isString(value["description"]) ? value["description"] : "",
      updated_at: value["updated_at"],
      thumbnail: isString(value["thumbnail"]) ? value["thumbnail"] : null,
      role: role === "editor" || role === "viewer" ? role : "owner",
    };
  }

  /** `GET /api/projects`: the person's projects, the most recently updated first. */
  async projects(): Promise<CloudProject[]> {
    this.needToken();
    const value = this.json(await this.request("GET", "/api/projects"));
    const list = isRecord(value) ? value["projects"] : undefined;
    if (!Array.isArray(list)) throw this.badResponse(200, "with projects that are not a list");
    return list.map((item) => this.project(item));
  }

  /** `GET /api/projects/:id`; `project.not-found` for an id that is not the person's. */
  async getProject(id: string): Promise<CloudProject> {
    this.needToken();
    return this.project(this.json(await this.request("GET", `${projectUrl(id)}`)));
  }

  /** `POST /api/projects`: makes a project from a template, or from files. */
  async createProject(project: CreateProject): Promise<CloudProject> {
    this.needToken();
    const body = JSON.stringify(project);
    if (Buffer.byteLength(body) > MAX_PUSH_BYTES) {
      throw new CloudError("doc.too-large", "The project is larger than the service accepts.");
    }
    return this.project(
      this.json(
        await this.request("POST", "/api/projects", {
          json: project,
          timeoutMs: LARGE_TIMEOUT_MS,
          maxBytes: SMALL_BYTES,
        }),
      ),
    );
  }

  /** `GET /api/projects/:id/files`: the latest files and binaries, and the room's `revision`. */
  async files(id: string): Promise<CloudFiles> {
    this.needToken();
    const value = this.json(
      await this.request("GET", `${projectUrl(id)}/files`, {
        maxBytes: FILES_BYTES,
        timeoutMs: LARGE_TIMEOUT_MS,
      }),
    );
    const revision = isRecord(value) ? value["revision"] : undefined;
    if (!isRecord(value) || typeof revision !== "number") {
      throw this.badResponse(200, "with files that are not a project's");
    }
    return {
      revision,
      ...this.fileMaps(value),
      collisions: Array.isArray(value["collisions"]) ? value["collisions"] : [],
    };
  }

  /** The texts by path and the hashes of the binaries by path of an answer. */
  private fileMaps(value: Record<string, unknown>): {
    files: Record<string, string>;
    binaries: Record<string, string>;
  } {
    const files = stringRecord(value["files"]);
    const binaries = stringRecord(value["binaries"], (hash) => HASH.test(hash));
    if (!files || !binaries) throw this.badResponse(200, "with files that are not a project's");
    return { files, binaries };
  }

  /**
   * `PUT /api/projects/:id/files`: one transaction of texts, binaries by hash and deletions
   * (`null`). With `ifRevision` it applies only at that revision; otherwise `409 revision.mismatch`
   * whose `revision` (on the error) is the room's current one. Answers the revision after the push.
   */
  async pushFiles(id: string, push: PushBody): Promise<number> {
    this.needToken();
    const body = JSON.stringify(push);
    if (Buffer.byteLength(body) > MAX_PUSH_BYTES) {
      throw new CloudError("doc.too-large", "The push is larger than the service accepts.");
    }
    const value = this.json(
      await this.request("PUT", `${projectUrl(id)}/files`, {
        json: push,
        timeoutMs: LARGE_TIMEOUT_MS,
      }),
    );
    const revision = isRecord(value) ? value["revision"] : undefined;
    if (typeof revision !== "number")
      throw this.badResponse(200, "with a push that has no revision");
    return revision;
  }

  /**
   * `HEAD /api/projects/:id/blobs/:hash`: whether the project holds the bytes of that hash (true), so
   * that an upload can be skipped; a `404` is false.
   */
  async blobExists(id: string, hash: string): Promise<boolean> {
    this.needToken();
    const answer = await this.request("HEAD", `${projectUrl(id)}/blobs/${segment(hash)}`, {
      accept: [404],
    });
    return answer.status !== 404;
  }

  /**
   * `PUT /api/projects/:id/binaries/:path`: uploads an image or a font (at most 10 MiB, checked
   * here first: `quota.binary`) and answers its SHA-256 as the service computed it.
   */
  async putBinary(id: string, path: string, bytes: Uint8Array): Promise<string> {
    this.needToken();
    if (!isCleanPath(path)) {
      throw new CloudError("path.invalid", `${path} is not a path the cloud keeps.`, {
        details: { path },
      });
    }
    if (bytes.byteLength > CLOUD_LIMITS.binaryBytes) {
      throw new CloudError(
        "quota.binary",
        `${path} is larger than the 10 MiB an image or font may be.`,
        {
          details: { path },
        },
      );
    }
    const value = this.json(
      await this.request("PUT", `${projectUrl(id)}/binaries/${encodePath(path)}`, {
        body: bytes,
        timeoutMs: LARGE_TIMEOUT_MS,
      }),
    );
    const hash = isRecord(value) ? value["hash"] : undefined;
    if (!isString(hash) || !HASH.test(hash))
      throw this.badResponse(200, "with an upload that has no hash");
    return hash;
  }

  /**
   * `GET /api/projects/:id/blobs/:hash`: the bytes of an image, a font or a text, at most 10 MiB.
   * They are checked against their name: bytes that do not hash to `hash` are
   * `cloud.bad-response`, unless `verify` is false.
   */
  async blob(
    id: string,
    hash: string,
    options: { readonly verify?: boolean } = {},
  ): Promise<Uint8Array> {
    this.needToken();
    const answer = await this.request("GET", `${projectUrl(id)}/blobs/${segment(hash)}`, {
      maxBytes: CLOUD_LIMITS.binaryBytes,
      timeoutMs: LARGE_TIMEOUT_MS,
    });
    if (options.verify !== false && sha256Hex(answer.bytes) !== hash) {
      throw this.badResponse(
        answer.status,
        `with bytes that are not the blob ${hash.slice(0, 12)}…`,
      );
    }
    return answer.bytes;
  }

  // -------------------------------------------------------------------------- versions

  private version(value: unknown): CloudVersion {
    if (!isRecord(value) || typeof value["number"] !== "number" || !isString(value["created_at"])) {
      throw this.badResponse(200, "with a version that is not one");
    }
    return {
      number: value["number"],
      label: isString(value["label"]) ? value["label"] : "",
      auto: value["auto"] === true,
      created_at: value["created_at"],
      created_by: isString(value["created_by"]) ? value["created_by"] : "",
      changed: Array.isArray(value["changed"]) ? value["changed"].filter(isString) : [],
    };
  }

  /** `GET /api/projects/:id/versions`: the newest first. */
  async versions(id: string): Promise<CloudVersion[]> {
    this.needToken();
    const value = this.json(await this.request("GET", `${projectUrl(id)}/versions`));
    const list = isRecord(value) ? value["versions"] : undefined;
    if (!Array.isArray(list)) throw this.badResponse(200, "with versions that are not a list");
    return list.map((item) => this.version(item));
  }

  /** `GET /api/projects/:id/versions/:n`: a version with its files; `version.not-found` for an unknown number. */
  async readVersion(id: string, n: number): Promise<CloudVersionFiles> {
    this.needToken();
    if (!Number.isInteger(n) || n < 1) {
      throw new CloudError("version.not-found", `There is no version ${n}.`, {
        details: { version: n },
      });
    }
    const value = this.json(
      await this.request("GET", `${projectUrl(id)}/versions/${n}`, {
        maxBytes: FILES_BYTES,
        timeoutMs: LARGE_TIMEOUT_MS,
      }),
    );
    return { ...this.version(value), ...this.fileMaps(value as Record<string, unknown>) };
  }

  // -------------------------------------------------------------------------- publishing

  /** `GET /api/projects/:id/publish`: the owner's handle and what the project publishes. */
  async publication(id: string): Promise<PublishState> {
    this.needToken();
    const value = this.json(await this.request("GET", `${projectUrl(id)}/publish`));
    if (!isRecord(value) || !Array.isArray(value["publications"])) {
      throw this.badResponse(200, "with a publication state that is not one");
    }
    const publications = value["publications"].flatMap((item): CloudPublication[] =>
      isRecord(item) && isString(item["slug"]) && isString(item["url"])
        ? [
            {
              slug: item["slug"],
              url: item["url"],
              published_at: isString(item["published_at"]) ? item["published_at"] : "",
              bytes: typeof item["bytes"] === "number" ? item["bytes"] : 0,
            },
          ]
        : [],
    );
    const takedowns = Array.isArray(value["takedowns"])
      ? value["takedowns"].flatMap((item) =>
          isRecord(item) && isString(item["slug"])
            ? [
                {
                  slug: item["slug"],
                  at: isString(item["at"]) ? item["at"] : "",
                  reason: isString(item["reason"]) ? item["reason"] : "",
                },
              ]
            : [],
        )
      : [];
    return { handle: isString(value["handle"]) ? value["handle"] : null, publications, takedowns };
  }

  /**
   * `PUT /api/projects/:id/publish`: publishes the HTML of a catalog under `slug` and answers its
   * address. `handle.required` (409) while the owner has none, `publish.taken`, `publish.too-large`,
   * `publish.invalid`, `publish.rate` (with `retryAfter`).
   */
  async publish(
    id: string,
    page: { readonly slug: string; readonly html: string },
  ): Promise<Published> {
    this.needToken();
    if (Buffer.byteLength(page.html) > CLOUD_LIMITS.publishBytes) {
      throw new CloudError(
        "publish.too-large",
        "The catalog is larger than the service publishes.",
      );
    }
    const value = this.json(
      await this.request("PUT", `${projectUrl(id)}/publish`, {
        json: page,
        timeoutMs: LARGE_TIMEOUT_MS,
      }),
    );
    if (
      !isRecord(value) ||
      !isString(value["url"]) ||
      !isString(value["handle"]) ||
      !isString(value["slug"])
    ) {
      throw this.badResponse(200, "with a publication that is not one");
    }
    return {
      url: value["url"],
      handle: value["handle"],
      slug: value["slug"],
      bytes: typeof value["bytes"] === "number" ? value["bytes"] : 0,
      published_at: isString(value["published_at"]) ? value["published_at"] : "",
    };
  }

  /** `DELETE /api/projects/:id/publish/:slug`; `not-found` when the project publishes nothing there. */
  async unpublish(id: string, slug: string): Promise<void> {
    this.needToken();
    await this.request("DELETE", `${projectUrl(id)}/publish/${segment(slug)}`);
  }
}
