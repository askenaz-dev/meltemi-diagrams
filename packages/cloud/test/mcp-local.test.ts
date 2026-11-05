// What the endpoint and the command line's local server share, and what the endpoint gains with the
// local server (change `local-mcp-server`): both list the same catalogue, word for word; the
// patterns both read are the same; a renderer object that cannot answer is `renderer.unavailable`,
// with nothing pushed; and the HTTP API answers what the local server's tools need of it (a token's
// email, the account's publications).

import { run } from "@meltemi/diagrams-cli";
import { IDEMPOTENCY_KEY as SHARED_KEY, SCOPES as SHARED_SCOPES } from "@meltemi/diagrams-mcp";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDEMPOTENCY_KEY } from "../src/idempotency.js";
import { SCOPES } from "../src/mcp/caller.js";
import type { RenderersApi } from "../src/renderer-client.js";
import type { Deps } from "../src/types.js";
import { jsonOf } from "./support/index.js";
import { call, mcp, ok, refused, type Mcp } from "./support/mcp.js";

const ANA = "u-ana";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** A tool as `tools/list` shows it. */
type Listed = { readonly name: string } & Record<string, unknown>;

/** The first tool whose listing differs between two catalogues, by name, or undefined. */
export function firstDifference(a: readonly Listed[], b: readonly Listed[]): string | undefined {
  const names = new Set([...a.map((tool) => tool.name), ...b.map((tool) => tool.name)]);
  for (const name of names) {
    const left = a.find((tool) => tool.name === name);
    const right = b.find((tool) => tool.name === name);
    if (JSON.stringify(left) !== JSON.stringify(right)) return name;
  }
  return a.map((tool) => tool.name).join() === b.map((tool) => tool.name).join()
    ? undefined
    : "(the order)";
}

/** The local server's `tools/list`, from `mdg mcp` run in this process on a free port. */
async function localTools(): Promise<Listed[]> {
  let started: (server: { url: string; close(): Promise<void> }) => void = () => {};
  const listening = new Promise<{ url: string; close(): Promise<void> }>(
    (resolve) => (started = resolve),
  );
  const exited = Promise.resolve(
    run(["mcp", "--port", "0", "--host", "https://diagrams.meltemi.dev"], {
      stdout: () => {},
      stderr: () => {},
      cwd: process.cwd(),
      env: {
        MELTEMI_LANG: "en",
        APPDATA: "/nonexistent",
        HOME: "/nonexistent",
        USERPROFILE: "/nonexistent",
      },
      cloud: { mcpStarted: (server) => started(server) },
    }),
  );
  const server = await listening;
  const client = new Client({ name: "catalogue-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  try {
    return (await client.listTools()).tools as unknown as Listed[];
  } finally {
    await client.close();
    await server.close();
    expect(await exited).toBe(0);
  }
}

describe("one catalogue for both servers", () => {
  it("lists the same twenty-seven tools on the endpoint and on mdg mcp", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token(ANA));
    const hosted = (await client.listTools()).tools as unknown as Listed[];
    const local = await localTools();
    expect(hosted).toHaveLength(27);
    expect(firstDifference(hosted, local)).toBeUndefined();
    expect(local).toEqual(hosted);
  }, 60_000);

  it("names the tool whose words differ on one side only", () => {
    const tools: Listed[] = [
      { name: "whoami", description: "The account." },
      { name: "preview", description: "A picture." },
    ];
    const changed = tools.map((tool) =>
      tool.name === "preview" ? { ...tool, description: "Another picture." } : tool,
    );
    expect(firstDifference(tools, changed)).toBe("preview");
    expect(firstDifference(tools, tools)).toBeUndefined();
  });

  it("reads the same idempotency key and the same scopes as the Worker", () => {
    expect(SHARED_KEY.source).toBe(IDEMPOTENCY_KEY.source);
    expect(SHARED_KEY.flags).toBe(IDEMPOTENCY_KEY.flags);
    expect([...SHARED_SCOPES]).toEqual([...SCOPES]);
  });
});

describe("an unavailable renderer", () => {
  /** The endpoint with renderer objects that throw, as one past its CPU limit does. */
  async function throwing(): Promise<{ m: Mcp; client: Client; id: string }> {
    const m = await mcp();
    const client = await m.connect(await m.token(ANA));
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", {
        name: "Heavy",
        files: { "flow.meltemi": 'language "0.2"\n\ndiagram one: flow {\n  a -> b\n}\n' },
      }),
    );
    const exceeded = async (): Promise<never> => {
      throw new Error("Worker exceeded CPU time limit.");
    };
    const renderers: RenderersApi = {
      render: exceeded,
      validate: exceeded,
      catalog: exceeded,
      stats: exceeded,
    };
    Object.assign(m.h.deps as { -readonly [K in keyof Deps]: Deps[K] }, { renderers });
    return { m, client, id };
  }

  it("answers preview and validate with renderer.unavailable, naming mdg mcp", async () => {
    const { client, id } = await throwing();
    const preview = refused(await call(client, "preview", { project: id, path: "flow.meltemi" }));
    expect(preview["code"]).toBe("renderer.unavailable");
    expect(String(preview["message"])).toContain("mdg mcp");
    expect(refused(await call(client, "validate", { project: id }))["code"]).toBe(
      "renderer.unavailable",
    );
  });

  it("pushes nothing and keeps no answer for the key of a write it could not check", async () => {
    const { m, client, id } = await throwing();
    const before = (await m.h.rooms.read(id)).revision;
    const args = {
      project: id,
      files: { "flow.meltemi": 'language "0.2"\n\ndiagram one: flow {\n  a -> c\n}\n' },
      ifRevision: before,
      idempotencyKey: "heavy-1",
    };
    expect(refused(await call(client, "write_files", args))["code"]).toBe("renderer.unavailable");
    expect((await m.h.rooms.read(id)).revision).toBe(before);
    // The object answers again: the same key is not held by the first failure.
    Object.assign(m.h.deps as { -readonly [K in keyof Deps]: Deps[K] }, {
      renderers: (await mcp()).renderers,
    });
    const written = ok<{ revision: number }>(await call(client, "write_files", args));
    expect(written.revision).toBe(before + 1);
  });

  it("leaves a failure that is not the renderer's internal", async () => {
    const { m, client, id } = await throwing();
    const rooms = m.h.deps.rooms;
    Object.assign(m.h.deps as { -readonly [K in keyof Deps]: Deps[K] }, {
      rooms: {
        ...rooms,
        read: async () => {
          throw new Error("the room is gone");
        },
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(refused(await call(client, "read_files", { project: id }))["code"]).toBe("internal");
  });
});

describe("what the HTTP API answers for the local server", () => {
  it("gives a token's session the account's email, and a cookie's what it gave", async () => {
    const m = await mcp();
    const token = await m.token(ANA);
    const byToken = await m.h.request("/api/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const session = await jsonOf<{ user: { email?: string; sub: string } }>(byToken);
    expect(session.user.sub).toBe(ANA);
    expect(typeof session.user.email).toBe("string");
    const stored = await m.h.store.user(ANA);
    expect(session.user.email).toBe(stored?.email ?? "");
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const byCookie = await jsonOf<{ user: Record<string, unknown> }>(
      await m.h.request("/api/session", m.h.fromPage(cookie, { method: "GET" })),
    );
    expect(byCookie.user).not.toHaveProperty("email");
  });

  it("lists the account's publications with their projects", async () => {
    const m = await mcp();
    const token = await m.token(ANA);
    expect((await m.sendJson(ANA, "PATCH", "/api/account", { handle: "ana" })).status).toBe(200);
    const client = await m.connect(token);
    const ids: string[] = [];
    for (const name of ["one", "two"]) {
      const { id } = ok<{ id: string }>(
        await call(client, "create_project", { name, template: "flow" }),
      );
      ok(await call(client, "publish", { project: id, slug: name }));
      ids.push(id);
    }
    const answer = await m.h.request("/api/account/publications", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(answer.status).toBe(200);
    const listed = await jsonOf<{
      handle: string | null;
      publications: { project: string; slug: string }[];
    }>(answer);
    expect(listed.handle).toBe("ana");
    expect(listed.publications.map((p) => [p.project, p.slug]).sort()).toEqual(
      [
        [ids[0], "one"],
        [ids[1], "two"],
      ].sort(),
    );
    const tool = ok<{ publications: unknown[] }>(await call(client, "list_publications", {}));
    expect(tool.publications).toEqual(listed.publications);
    const nobody = await m.h.request("/api/account/publications");
    expect(nobody.status).toBe(401);
    expect((await jsonOf<{ code: string }>(nobody)).code).toBe("auth.required");
  });
});
