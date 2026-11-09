import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CATALOGUE } from "@meltemi/diagrams-mcp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloud } from "../src/handler.js";
import { localConfig } from "../src/local-policy.js";
import { initializeLocalInstance, localFetch } from "../src/local.js";
import { d1Store } from "../src/store/d1.js";
import type { Env } from "../src/env.js";
import type { PushRequest } from "../src/rooms.js";
import type { Deps, LocalInstance } from "../src/types.js";
import { harness, jsonOf } from "./support/index.js";
import { call, memoryRenderers, ok, refused } from "./support/mcp.js";
import { openDatabase, sqliteAvailable, withLatency } from "./support/sqlite.js";
import { serveTemplates } from "./support/templates.js";

const ORIGIN = "http://127.0.0.1:8788";
const PROJECT = "localproject234567ab";

async function localHarness() {
  const h = await harness({ env: { ORIGIN } });
  serveTemplates(h);
  const profile = {
    sub: "local-owner",
    name: "Local workspace",
    picture: "",
    email: "",
    emailVerified: false,
  };
  await h.store.upsertUser(profile, h.clock.now().toISOString());
  const local: LocalInstance = {
    origin: ORIGIN,
    principal: { via: "local", sub: profile.sub, profile },
    defaultProject: { id: PROJECT, url: `${ORIGIN}/?project=${PROJECT}` },
  };
  const deps: Deps = {
    ...h.deps,
    local,
    renderers: memoryRenderers(),
    verifier: {
      verifySession: vi.fn(async () => {
        throw new Error("A local request consulted identity");
      }),
    },
  };
  const request = (path: string, init?: RequestInit) =>
    cloud(new Request(path.startsWith("http") ? path : `${ORIGIN}${path}`, init), h.env, deps);
  const client = new Client({ name: "local-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      fetch: (url, init) => request(String(url), init),
    }),
  );
  return { h, deps, request, client };
}

afterEach(() => vi.restoreAllMocks());

describe("the explicit local actor", () => {
  it("needs no credentials for session, MCP and an editable room, preserving the same project", async () => {
    const { h, deps, request, client } = await localHarness();
    const session = await jsonOf(await request("/api/session"));
    expect(session).toMatchObject({
      mode: "local-single-user",
      user: { sub: "local-owner", name: "Local workspace", administration: null },
      defaultProject: { id: PROJECT },
    });
    for (const key of ["signIn", "account", "signOut", "token", "support"])
      expect(session).not.toHaveProperty(key);
    const created = ok<{ id: string; url: string }>(
      await call(client, "create_project", { name: "Together", files: { "notes.txt": "before" } }),
    );
    expect(created.url).toBe(`${ORIGIN}/?project=${created.id}`);
    const socket = await request(`/rooms/${created.id}`, {
      headers: { Upgrade: "websocket", Origin: ORIGIN },
    });
    expect(socket.status).toBe(200);
    expect(h.rooms.connects[0]?.identity).toMatchObject({ sub: "local-owner", role: "owner" });
    const before = ok<{ revision: number }>(
      await call(client, "read_files", { project: created.id }),
    );
    const write = ok<{ revision: number }>(
      await call(client, "write_files", {
        project: created.id,
        files: { "notes.txt": "after" },
        ifRevision: before.revision,
        idempotencyKey: "local-shared-edit",
      }),
    );
    expect((await h.rooms.read(created.id)).files["notes.txt"]).toBe("after");
    const replay = ok<{ revision: number }>(
      await call(client, "write_files", {
        project: created.id,
        files: { "notes.txt": "after" },
        ifRevision: before.revision,
        idempotencyKey: "local-shared-edit",
      }),
    );
    expect(replay.revision).toBe(write.revision);
    expect(
      refused(
        await call(client, "write_files", {
          project: created.id,
          files: { "notes.txt": "stale" },
          ifRevision: before.revision,
        }),
      ).code,
    ).toBe("revision.mismatch");
    expect(deps.verifier.verifySession).not.toHaveBeenCalled();
    expect(h.identity.calls).toEqual([]);
    await client.close();
  });

  it("retains all 28 schemas and refuses all 13 unavailable tools before their inputs/effects", async () => {
    const { h, client } = await localHarness();
    expect((await client.listTools()).tools).toHaveLength(28);
    const disabled = CATALOGUE.filter(
      (tool) => !["projects:read", "projects:write"].includes(tool.scope),
    );
    expect(disabled).toHaveLength(13);
    for (const tool of disabled)
      expect(refused(await call(client, tool.name)).code, tool.name).toBe(
        "local.feature-unavailable",
      );
    expect(h.identity.calls).toEqual([]);
    expect(await h.store.projectIdsOf("local-owner")).toEqual([]);
    await client.close();
  });

  it("refuses unsafe Host/Origin and missing browser Origin before mutations", async () => {
    const { h, request, client } = await localHarness();
    for (const origin of [undefined, "null", "http://evil.example", "http://127.0.0.1:9999"]) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (origin) headers["Origin"] = origin;
      expect(
        (await request("/api/projects", { method: "POST", headers, body: '{"name":"bad"}' }))
          .status,
      ).toBe(403);
      expect(
        (await request(`/rooms/${PROJECT}`, { headers: { ...headers, Upgrade: "websocket" } }))
          .status,
      ).toBe(403);
    }
    expect((await request("/api/session", { headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await request("http://evil.example/api/session")).status).toBe(404);
    expect(await h.store.projectIdsOf("local-owner")).toEqual([]);
    await client.close();
  });

  it("disables identity/token/OAuth/discovery/dev/publish and sharing HTTP surfaces", async () => {
    const { h, request, client } = await localHarness();
    for (const path of [
      "/api/tokens",
      "/api/account/identity",
      "/api/account/apps",
      "/oauth/register",
      "/oauth/authorize",
      "/.well-known/oauth-authorization-server",
      "/cli-auth",
      "/_identity/events",
      "/_sponsors/github",
      "/_published/test/test/",
      "/api/dev/collect",
      `/api/projects/${PROJECT}/sharing`,
      `/api/projects/${PROJECT}/members`,
      `/api/projects/${PROJECT}/live`,
      `/api/projects/${PROJECT}/publish`,
      "/__scheduled",
      "/%61pi/tokens",
    ]) {
      const response = await request(path);
      expect(response.status, path).toBe(409);
      expect((await jsonOf(response)).code, path).toBe("local.feature-unavailable");
    }
    expect(h.identity.calls).toEqual([]);
    await client.close();
  });

  it("cannot activate local identity in the production handler with request flags", async () => {
    const h = await harness({ env: { ORIGIN } });
    // A real hosted origin is required outside DEV; the request cannot choose the local dependency.
    const response = await h.request("https://diagrams.meltemi.dev/api/session", {
      headers: { "X-Meltemi-Local": "true" },
    });
    expect(response.status).toBe(500);
    const hosted = await harness();
    hosted.assets.files.set("/agent-setup/local/plugin-files.json", {
      body: "internal build payload",
      type: "application/json",
    });
    for (const path of [
      "/agent-setup/local/plugin-files.json",
      "/%61gent-setup/local/plugin-files.json",
      "/agent-setup/%6cocal/plugin-files.json",
    ]) {
      expect((await hosted.request(path)).status).toBe(404);
    }
    expect(
      await jsonOf(
        await hosted.request("/api/session", {
          headers: { "X-Meltemi-Local": "true", Cookie: "meltemi_local_session=fake" },
        }),
      ),
    ).toMatchObject({ user: null });
  });
});

describe("local origin configuration", () => {
  it.each([
    "http://0.0.0.0:8788",
    "http://localhost:8788",
    "http://192.168.1.2:8788",
    "https://127.0.0.1:8788",
    `${ORIGIN}/path`,
    `${ORIGIN}?query=yes`,
    `http://user@127.0.0.1:8788`,
  ])("refuses %s", (origin) => expect(() => localConfig(origin)).toThrow());
});

describe.skipIf(!sqliteAvailable)("persistent local bootstrap", () => {
  it("creates one owner/default across concurrent requests and process-shaped wrappers, preserving edits", async () => {
    const db = openDatabase();
    try {
      const h = await harness({ store: d1Store(db) });
      serveTemplates(h);
      const env: Env = {
        ...h.env,
        ORIGIN,
        DB: db,
        ROOMS: {
          idFromName: (id) => id,
          get: (id) => ({
            fetch: async (request) => {
              const project = String(id);
              const path = new URL(request.url).pathname;
              if (path === "/files" && request.method === "GET")
                return Response.json(await h.rooms.read(project));
              if (path === "/files")
                return Response.json(
                  await h.rooms.push(project, (await request.json()) as PushRequest),
                );
              if (path === "/materialise") return Response.json(await h.rooms.materialise(project));
              throw new Error("Unexpected room operation");
            },
          }),
        },
      };
      const [first, same] = await Promise.all([
        initializeLocalInstance(env),
        initializeLocalInstance(env),
      ]);
      expect(same).toEqual(first);
      expect(await h.store.projectIdsOf(first.principal.sub)).toEqual([first.defaultProject.id]);
      await h.rooms.push(first.defaultProject.id, {
        files: { "notes.txt": "kept across startup" },
      });
      const restarted = await initializeLocalInstance({ ...env, DB: withLatency(db) });
      expect(restarted).toEqual(first);
      expect((await h.rooms.read(first.defaultProject.id)).files["notes.txt"]).toBe(
        "kept across startup",
      );
      const replacement = "existingproject2345a";
      await h.store.createProject(
        {
          id: replacement,
          ownerSub: first.principal.sub,
          name: "Kept project",
          description: "",
          createdAt: h.clock.now().toISOString(),
        },
        100,
      );
      await h.rooms.push(replacement, { files: { "notes.txt": "kept project content" } });
      await h.store.deleteProject(first.principal.sub, first.defaultProject.id);
      const selected = await initializeLocalInstance(env);
      expect(selected.defaultProject.id).toBe(replacement);
      expect((await h.rooms.read(replacement)).files["notes.txt"]).toBe("kept project content");
      await h.store.deleteProject(first.principal.sub, replacement);
      const empty = await initializeLocalInstance(env);
      expect(empty.principal.sub).toBe(first.principal.sub);
      expect(empty.defaultProject.id).not.toBe(first.defaultProject.id);
      expect(empty.defaultProject.id).not.toBe(replacement);
      expect((await h.rooms.read(empty.defaultProject.id)).files).toHaveProperty(
        "diagrams/overview.meltemi",
      );
      await expect(
        initializeLocalInstance({ ...env, ORIGIN: "http://127.0.0.1:9999", DB: withLatency(db) }),
      ).rejects.toThrow("ORIGIN");
    } finally {
      db.close();
    }
  });

  it("rejects an unsafe request before touching local storage", async () => {
    const h = await harness();
    const env = { ...h.env, ORIGIN };
    expect((await localFetch(new Request("http://evil.example/api/session"), env)).status).toBe(
      403,
    );
  });
});
