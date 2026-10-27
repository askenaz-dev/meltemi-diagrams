/**
 * A stand-in for the cloud service, for the tests of the cloud commands: a Node HTTP server on
 * `127.0.0.1` that keeps accounts, tokens, one-time codes and projects in memory and answers the
 * routes of `docs/cloud.md` the command line uses, with the service's own error codes. It is not a
 * second implementation of the service: it holds just enough to show what the client sends and what
 * the commands do with the answers. Tests extend it as the commands grow.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { isCleanPath } from "@meltemi/diagrams-project";

export interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

export interface StubVersion {
  readonly number: number;
  readonly label: string;
  readonly auto: boolean;
  readonly createdAt: string;
  readonly files: Readonly<Record<string, string>>;
  readonly binaries: Readonly<Record<string, string>>;
}

export interface StubProject {
  readonly id: string;
  name: string;
  description: string;
  /** Path to text. */
  files: Map<string, string>;
  /** Path to hash. */
  binaries: Map<string, string>;
  /** The bytes the project holds, by hash. */
  blobs: Map<string, Buffer>;
  revision: number;
  versions: StubVersion[];
  publications: Map<string, { html: string; publishedAt: string }>;
  updatedAt: string;
  /** What the person asking is to the project; publishing is the owner's. */
  role: "owner" | "editor" | "viewer";
  /** The name collisions `GET …/files` lists, each `{ path, keeper, id, shown }`. */
  collisions: unknown[];
}

/** A failure the next request to a route is to answer with, instead of its own answer. */
export interface Forced {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Close the connection without answering. */
  readonly drop?: boolean;
}

export type Approval = "approve" | "other-state" | "none";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** A project id of the service's shape: 20 lower-case letters and digits. */
export function projectId(): string {
  return Array.from(randomBytes(20), (byte) => ALPHABET[byte % 32]).join("");
}

export const sha256 = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

export class CloudStub {
  readonly requests: Recorded[] = [];
  /** The person every token of this service is for. */
  account = { sub: "u_7d3f", name: "Ana", picture: "", handle: null as string | null };
  /** Token to its id and name. */
  readonly tokens = new Map<string, { id: string; name: string }>();
  readonly projects = new Map<string, StubProject>();
  /** What `GET /cli-auth` does: send the browser back with a code, with another state, or nothing. */
  approval: Approval = "approve";
  /** One-time codes: the state each is bound to. */
  readonly codes = new Map<string, string>();
  /** Whether a bearer token may choose the handle (the service refuses it today; it is to change). */
  tokensMayChooseHandle = false;
  /** Handles other accounts hold. */
  readonly takenHandles = new Set<string>();
  /** Exchanges that made a token, and exchanges refused. */
  exchanges = 0;
  refusedExchanges = 0;
  private readonly forced = new Map<string, Forced>();
  private server: Server | undefined;
  url = "";
  port = 0;

  async start(): Promise<this> {
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    // Idle connections stay open until `stop`. The command line runs in this process and its fetch
    // reuses them; a server that closes one after five idle seconds races the next request, and a
    // test that spends that long without one (2001 files written on Windows) got ECONNRESET.
    this.server.keepAliveTimeout = 0;
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    this.url = `http://127.0.0.1:${this.port}`;
    return this;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ------------------------------------------------------------------------------ the data

  /** Makes a token for the account, as the service does at an exchange or on the account page. */
  mint(name = "laptop"): { token: string; id: string; name: string } {
    const token = `mdg_${randomBytes(32).toString("base64url")}`;
    const id = randomBytes(4).toString("hex");
    this.tokens.set(token, { id, name });
    return { token, id, name };
  }

  addProject(
    init: Partial<Pick<StubProject, "id" | "name" | "description" | "revision" | "role">> & {
      files?: Readonly<Record<string, string>>;
      binaries?: Readonly<Record<string, Buffer | string>>;
    } = {},
  ): StubProject {
    const project: StubProject = {
      id: init.id ?? projectId(),
      name: init.name ?? "Shop",
      description: init.description ?? "",
      files: new Map(Object.entries(init.files ?? {})),
      binaries: new Map(),
      blobs: new Map(),
      revision: init.revision ?? 1,
      versions: [],
      publications: new Map(),
      updatedAt: "2026-10-15T09:41:02.118Z",
      role: init.role ?? "owner",
      collisions: [],
    };
    for (const [path, bytes] of Object.entries(init.binaries ?? {})) {
      const data = Buffer.from(bytes);
      const hash = sha256(data);
      project.blobs.set(hash, data);
      project.binaries.set(path, hash);
    }
    this.projects.set(project.id, project);
    return project;
  }

  /** Records a version of the project's current files. */
  addVersion(project: StubProject, label = "", auto = false): StubVersion {
    const version: StubVersion = {
      number: (project.versions.at(-1)?.number ?? 0) + 1,
      label,
      auto,
      createdAt: "2026-10-15T09:41:02.118Z",
      files: Object.fromEntries(project.files),
      binaries: Object.fromEntries(project.binaries),
    };
    project.versions.push(version);
    return version;
  }

  /** The next request to `METHOD /path` (the path as sent, without the query) fails as given, once. */
  fail(route: string, answer: Forced): void {
    this.forced.set(route, answer);
  }

  /** The requests to a path, by method when given. */
  to(path: string | RegExp, method?: string): Recorded[] {
    return this.requests.filter(
      (r) =>
        (typeof path === "string" ? r.path === path : path.test(r.path)) &&
        (method === undefined || r.method === method),
    );
  }

  // ---------------------------------------------------------------------------- the routes

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const url = new URL(request.url ?? "/", this.url);
    const method = request.method ?? "GET";
    const recorded: Recorded = {
      method,
      path: url.pathname,
      query: url.search,
      headers: request.headers,
      body: Buffer.concat(chunks),
    };
    this.requests.push(recorded);

    const forced = this.forced.get(`${method} ${url.pathname}`);
    if (forced) {
      this.forced.delete(`${method} ${url.pathname}`);
      if (forced.drop) return void request.socket.destroy();
      return send(response, forced.status, forced.body, forced.headers);
    }

    const path = url.pathname;
    const body = (): Record<string, unknown> => {
      try {
        const value = JSON.parse(recorded.body.toString("utf8")) as unknown;
        return typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    };

    if (method === "GET" && path === "/cli-auth") return this.cliAuth(url, response);
    if (method === "POST" && path === "/cli-auth/token") return this.exchange(body(), response);

    // Everything else is the API: who is asking, from a bearer token alone.
    const header = request.headers.authorization;
    let principal: { token: string; id: string; name: string } | null = null;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      const found = this.tokens.get(token);
      if (!found) return error(response, 401, "token.invalid", "That token is not valid.");
      principal = { token, ...found };
    }

    if (method === "GET" && path === "/api/session") {
      if (!principal) {
        return send(response, 200, { user: null, signIn: `${this.url}/login` });
      }
      return send(response, 200, {
        user: { ...this.account },
        token: { id: principal.id, name: principal.name },
      });
    }
    if (!principal) return error(response, 401, "auth.required", "Sign in first.");

    const token = /^\/api\/tokens\/([^/]+)$/.exec(path);
    if (method === "DELETE" && token) {
      const id = decodeURIComponent(token[1]!);
      const entry = [...this.tokens].find(([, info]) => info.id === id);
      if (!entry) return error(response, 404, "not-found", "Not found.");
      this.tokens.delete(entry[0]);
      return send(response, 204);
    }
    if (method === "PATCH" && path === "/api/account") {
      // Today the service lets only a person in the page choose a handle; a token is refused.
      if (!this.tokensMayChooseHandle) {
        return error(
          response,
          403,
          "request.forbidden",
          "A handle is chosen on the page; an API token cannot choose one.",
        );
      }
      return this.chooseHandle(body()["handle"], response);
    }
    if (method === "GET" && path === "/api/account/usage") {
      return send(response, 200, {
        projects: this.projects.size,
        storageBytes: 0,
        limits: { projects: 100, files: 2000 },
      });
    }
    if (path === "/api/projects") {
      if (method === "GET") {
        return send(response, 200, { projects: [...this.projects.values()].map(projectJson) });
      }
      if (method === "POST") return this.create(body(), response);
    }

    const route = /^\/api\/projects\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!route) return error(response, 404, "not-found", "Not found.");
    const project = this.projects.get(decodeURIComponent(route[1]!));
    if (!project) return error(response, 404, "project.not-found", "No such project.");
    return this.projectRoute(project, method, route[2] ?? "", recorded, body, response);
  }

  private cliAuth(url: URL, response: ServerResponse): void {
    const ports = url.searchParams.getAll("port");
    const states = url.searchParams.getAll("state");
    const port = ports.length === 1 && /^[1-9][0-9]{3,4}$/.test(ports[0]!) ? Number(ports[0]) : 0;
    const state =
      states.length === 1 && /^[A-Za-z0-9_-]{16,128}$/.test(states[0]!) ? states[0]! : "";
    if (port < 1024 || port > 65535 || state === "") {
      return error(response, 400, "cli.invalid", "The request cannot be used.");
    }
    if (this.approval === "none") return send(response, 200, { waiting: true });
    const code = randomBytes(32).toString("base64url");
    this.codes.set(code, state);
    const returned =
      this.approval === "other-state"
        ? `${state.slice(0, -1)}${state.endsWith("A") ? "B" : "A"}`
        : state;
    response.writeHead(303, {
      Location: `http://127.0.0.1:${port}/?code=${code}&state=${returned}`,
      "Cache-Control": "no-store",
    });
    response.end();
  }

  private exchange(body: Record<string, unknown>, response: ServerResponse): void {
    const { code, state } = body;
    const bound = typeof code === "string" ? this.codes.get(code) : undefined;
    // The code is gone whatever follows.
    if (typeof code === "string") this.codes.delete(code);
    if (bound === undefined || bound !== state) {
      this.refusedExchanges++;
      return error(response, 400, "cli.invalid", "The request cannot be used.");
    }
    this.exchanges++;
    const made = this.mint(`CLI (${new Date().toISOString().slice(0, 10)})`);
    send(response, 200, { id: made.id, name: made.name, token: made.token });
  }

  private create(body: Record<string, unknown>, response: ServerResponse): void {
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (name === "" || name.length > 100) {
      return error(response, 400, "request.invalid", "The name is not valid.");
    }
    const files = (body["files"] ?? {}) as Record<string, string>;
    const binaries = (body["binaries"] ?? {}) as Record<string, string>;
    for (const path of [...Object.keys(files), ...Object.keys(binaries)]) {
      if (!isCleanPath(path)) return error(response, 400, "path.invalid", `${path} is not a path.`);
    }
    const known = new Map<string, Buffer>();
    for (const project of this.projects.values()) {
      for (const [hash, bytes] of project.blobs) known.set(hash, bytes);
    }
    const project = this.addProject({
      name,
      description: typeof body["description"] === "string" ? body["description"] : "",
      files,
      revision: 0,
    });
    for (const [path, hash] of Object.entries(binaries)) {
      const bytes = known.get(hash);
      if (!bytes) {
        this.projects.delete(project.id);
        return error(response, 400, "blob.unknown", "That image or font is not known.");
      }
      project.blobs.set(hash, bytes);
      project.binaries.set(path, hash);
    }
    project.revision = 1;
    send(response, 201, projectJson(project));
  }

  private projectRoute(
    project: StubProject,
    method: string,
    rest: string,
    recorded: Recorded,
    body: () => Record<string, unknown>,
    response: ServerResponse,
  ): void {
    if (rest === "" && method === "GET") return send(response, 200, projectJson(project));
    if (rest === "files" && method === "GET") {
      return send(response, 200, {
        revision: project.revision,
        files: Object.fromEntries(project.files),
        binaries: Object.fromEntries(project.binaries),
        collisions: project.collisions,
      });
    }
    if (rest === "files" && method === "PUT") return this.push(project, body(), response);

    const binary = /^binaries\/(.+)$/.exec(rest);
    if (binary && method === "PUT") {
      const path = binary[1]!.split("/").map(decodeURIComponent).join("/");
      if (!isCleanPath(path)) return error(response, 400, "path.invalid", `${path} is not a path.`);
      const hash = sha256(recorded.body);
      project.blobs.set(hash, recorded.body);
      // As the room does: the revision rises once, and only for a change that kept something.
      if (project.binaries.get(path) !== hash) {
        project.binaries.set(path, hash);
        project.revision++;
      }
      return send(response, 200, { hash });
    }
    const blob = /^blobs\/([0-9a-f]{64})$/.exec(rest);
    if (blob && (method === "GET" || method === "HEAD")) {
      const bytes = project.blobs.get(blob[1]!);
      if (!bytes) {
        return method === "HEAD"
          ? send(response, 404)
          : error(response, 404, "not-found", "Not found.");
      }
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": bytes.length,
        "Content-Security-Policy": "sandbox",
      });
      return void response.end(method === "HEAD" ? undefined : bytes);
    }

    if (rest === "versions" && method === "GET") {
      return send(response, 200, {
        versions: [...project.versions].reverse().map(versionJson),
      });
    }
    const version = /^versions\/([^/]+)$/.exec(rest);
    if (version && method === "GET") {
      const found = project.versions.find((v) => String(v.number) === version[1]);
      if (!found) return error(response, 404, "version.not-found", "No such version.");
      return send(response, 200, {
        ...versionJson(found),
        files: found.files,
        binaries: found.binaries,
      });
    }

    // Publishing is the owner's.
    if ((rest === "publish" || rest.startsWith("publish/")) && project.role !== "owner") {
      return error(response, 403, "access.denied", "Only the owner may publish.");
    }
    if (rest === "publish" && method === "GET") {
      return send(response, 200, {
        handle: this.account.handle,
        publications: [...project.publications].map(([slug, p]) => ({
          slug,
          url: this.publicUrl(slug),
          published_at: p.publishedAt,
          bytes: Buffer.byteLength(p.html),
        })),
        takedowns: [],
      });
    }
    if (rest === "publish" && method === "PUT") {
      if (this.account.handle === null) {
        return error(response, 409, "handle.required", "Choose a handle first.");
      }
      const { slug, html } = body();
      if (typeof slug !== "string" || !/^[a-z0-9-]{1,60}$/.test(slug)) {
        return error(response, 400, "publish.invalid", "The slug is not valid.");
      }
      if (typeof html !== "string" || html === "") {
        return error(response, 400, "publish.invalid", "A publication needs the HTML of the page.");
      }
      // One address, one project: another project of the person may not hold the same slug.
      const holder = [...this.projects.values()].find(
        (other) => other !== project && other.publications.has(slug),
      );
      if (holder) {
        return error(response, 409, "publish.taken", "Another project publishes that name.");
      }
      const publishedAt = "2026-10-15T10:00:00.000Z";
      project.publications.set(slug, { html, publishedAt });
      return send(response, 200, {
        url: this.publicUrl(slug),
        handle: this.account.handle,
        slug,
        bytes: Buffer.byteLength(html),
        published_at: publishedAt,
      });
    }
    const unpublish = /^publish\/([^/]+)$/.exec(rest);
    if (unpublish && method === "DELETE") {
      if (!project.publications.delete(unpublish[1]!)) {
        return error(response, 404, "not-found", "There is no such publication.");
      }
      return send(response, 204);
    }
    return error(response, 404, "not-found", "Not found.");
  }

  private publicUrl(slug: string): string {
    return `${this.url}/_published/${this.account.handle}/${slug}/`;
  }

  /** `PATCH /api/account { handle }` as the service answers it, for the cases a test builds. */
  private chooseHandle(handle: unknown, response: ServerResponse): void {
    if (typeof handle !== "string" || !/^[a-z0-9-]{3,30}$/.test(handle)) {
      return error(response, 400, "handle.invalid", "A handle is 3 to 30 lowercase letters.");
    }
    if (handle === this.account.handle) return send(response, 200, { handle });
    if (this.takenHandles.has(handle)) {
      return error(response, 409, "handle.taken", "That handle is taken.");
    }
    const published = [...this.projects.values()].some((p) => p.publications.size > 0);
    if (this.account.handle !== null && published) {
      return error(response, 409, "handle.locked", "Unpublish first: addresses use the handle.");
    }
    this.account.handle = handle;
    send(response, 200, { handle });
  }

  private push(
    project: StubProject,
    body: Record<string, unknown>,
    response: ServerResponse,
  ): void {
    const files = (body["files"] ?? {}) as Record<string, string | null>;
    const binaries = (body["binaries"] ?? {}) as Record<string, string | null>;
    for (const path of [...Object.keys(files), ...Object.keys(binaries)]) {
      if (!isCleanPath(path)) return error(response, 400, "path.invalid", `${path} is not a path.`);
    }
    const ifRevision = body["ifRevision"];
    if (typeof ifRevision === "number" && ifRevision !== project.revision) {
      return send(response, 409, {
        code: "revision.mismatch",
        message: "The project changed since it was read.",
        revision: project.revision,
      });
    }
    for (const hash of Object.values(binaries)) {
      if (hash !== null && !project.blobs.has(hash)) {
        return error(response, 400, "blob.unknown", "That image or font was never uploaded.");
      }
    }
    let changed = false;
    for (const [path, text] of Object.entries(files)) {
      if (text === null) changed = project.files.delete(path) || changed;
      else if (project.files.get(path) !== text) {
        project.files.set(path, text);
        changed = true;
      }
    }
    for (const [path, hash] of Object.entries(binaries)) {
      if (hash === null) changed = project.binaries.delete(path) || changed;
      else if (project.binaries.get(path) !== hash) {
        project.binaries.set(path, hash);
        changed = true;
      }
    }
    if (changed) project.revision++;
    send(response, 200, { revision: project.revision });
  }
}

function projectJson(project: StubProject) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    updated_at: project.updatedAt,
    thumbnail: null,
    role: project.role,
  };
}

function versionJson(version: StubVersion) {
  return {
    number: version.number,
    label: version.label,
    auto: version.auto,
    created_at: version.createdAt,
    created_by: "u_7d3f",
    changed: Object.keys(version.files),
  };
}

function send(
  response: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): void {
  if (body === undefined) {
    response.writeHead(status, { "Cache-Control": "no-store", ...headers });
    return void response.end();
  }
  const text = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(text);
}

function error(response: ServerResponse, status: number, code: string, message: string): void {
  send(response, status, { code, message });
}
