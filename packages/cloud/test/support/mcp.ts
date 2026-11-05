// Test support for the MCP endpoint: a harness whose people have API tokens, whose projects have
// renderer objects (the renderer's core in Node, one per project, as the Worker's binding gives one
// per id), whose publish host answers the read-back of `publish` from the same store and bucket, and
// an MCP client of the official SDK that reaches the Worker through `cloud()` in this process.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { RenderersApi } from "../../src/renderer-client.js";
import { memoryPreviewCache, type RendererCore } from "../../src/renderer-core.js";
import { publishHost } from "../../src/publish.js";
import type { Deps } from "../../src/types.js";
import { jsonOf } from "./index.js";
import { projects, type Projects } from "./projects.js";
import { nodeRenderer } from "./renderer.js";

/** What a call answered: the tool's result as the client read it. */
export interface CallResult {
  readonly isError?: boolean;
  readonly content: readonly { type: string; text?: string; data?: string; mimeType?: string }[];
  readonly structuredContent?: Record<string, unknown>;
}

/** The renderer objects of the tests: one core per project, each with its own cache. */
export interface MemoryRenderers extends RenderersApi {
  /** The core of a project's object, made on first use. */
  core(projectId: string): RendererCore;
}

export function memoryRenderers(): MemoryRenderers {
  const cores = new Map<string, RendererCore>();
  const core = (projectId: string): RendererCore => {
    let found = cores.get(projectId);
    if (!found) {
      found = nodeRenderer(memoryPreviewCache());
      cores.set(projectId, found);
    }
    return found;
  };
  return {
    core,
    render: (projectId, request) => core(projectId).render(request),
    validate: (projectId, request) => core(projectId).validate(request),
    catalog: (projectId, request) => core(projectId).catalog(request),
    stats: async (projectId) => core(projectId).stats(),
  };
}

export interface Mcp extends Projects {
  readonly renderers: MemoryRenderers;
  /** The addresses the read-back asked for, in order. */
  readonly readBacks: string[];
  /** When false, the publish host does not answer (the read-back fails). */
  publishHostUp: boolean;
  /** An API token of the person `sub`, made on the page as a person makes one. */
  token(sub: string, name?: string): Promise<string>;
  /** A connected client of the official SDK, with the token as its bearer. */
  connect(token: string, options?: { modern?: boolean }): Promise<Client>;
  /** A raw `POST /mcp` with a JSON-RPC body: what a client sends, header by header. */
  post(body: unknown, headers?: Record<string, string>): Promise<Response>;
}

/** The catalog runtime the page's build writes: the tests give a stand-in, inlined as it is. */
export const CATALOG_SCRIPT = "/* catalog runtime */";

export const PUBLISH_HOST = "meltemi.page";

export async function mcp(options: Parameters<typeof projects>[0] = {}): Promise<Mcp> {
  const p = await projects({
    ...options,
    env: { PUBLISH_HOST, ...options.env },
  });
  const { h } = p;
  h.assets.files.set("/assets/catalog.js", { body: CATALOG_SCRIPT, type: "text/javascript" });
  const renderers = memoryRenderers();
  const readBacks: string[] = [];
  const world = { publishHostUp: true };
  const publicFetch: typeof fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    readBacks.push(`${request.method} ${request.url}`);
    if (!world.publishHostUp) throw new TypeError("the publish host is unreachable");
    if (new URL(request.url).host !== PUBLISH_HOST) {
      throw new Error(`The read-back asked ${request.url}, which is not the publish host`);
    }
    return publishHost(request, { BLOBS: h.blobs }, { store: h.store });
  };
  // The Worker's dependencies with the renderers and the publish host of the tests.
  Object.assign(h.deps as { -readonly [K in keyof Deps]: Deps[K] }, { renderers, publicFetch });

  const token: Mcp["token"] = async (sub, name = "agent") => {
    const response = await p.sendJson(sub, "POST", "/api/tokens", { name });
    if (response.status !== 201) throw new Error(`no token for ${sub}: ${response.status}`);
    return (await jsonOf<{ token: string }>(response)).token;
  };

  const connect: Mcp["connect"] = async (bearer, connectOptions = {}) => {
    const client = new Client(
      { name: "meltemi-tests", version: "1.0.0" },
      connectOptions.modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    const transport = new StreamableHTTPClientTransport(new URL(`${h.env.ORIGIN}/mcp`), {
      fetch: (url, init) => h.request(String(url), init),
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    await client.connect(transport);
    return client;
  };

  const post: Mcp["post"] = (body, headers = {}) =>
    h.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const made: Mcp = {
    ...p,
    renderers,
    readBacks,
    get publishHostUp() {
      return world.publishHostUp;
    },
    set publishHostUp(up: boolean) {
      world.publishHostUp = up;
    },
    token,
    connect,
    post,
  };
  return made;
}

/** The JSON-RPC message of an answer, whether it came as JSON or as an event stream. */
export async function messageOf(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const type = response.headers.get("Content-Type") ?? "";
  if (type.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice("data: ".length));
    if (data.length !== 1) throw new Error(`expected one event, got ${data.length}: ${text}`);
    return JSON.parse(data[0]!) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** A tool's call, as the client makes it, with its result's shape for the tests. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as CallResult;
}

/** The structured content of a call that must have succeeded. */
export function ok<T = Record<string, unknown>>(result: CallResult): T {
  if (result.isError) {
    throw new Error(
      `the call failed: ${JSON.stringify(result.structuredContent ?? result.content)}`,
    );
  }
  return result.structuredContent as T;
}

/** The structured content of a refused call. */
export function refused(result: CallResult): Record<string, unknown> {
  if (!result.isError)
    throw new Error(`the call succeeded: ${JSON.stringify(result.structuredContent)}`);
  return result.structuredContent ?? {};
}
