// The MCP endpoint (`mcp-server`): its transport, the catalogue, the project and file tools, their
// errors, idempotency and limits, through the Worker in this process (`cloud()`), with the official
// SDK's client and with raw requests where the transport itself is the subject.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import type { Caller } from "../src/mcp/caller.js";
import { CATALOGUE, createServer } from "../src/mcp/server.js";
import { CALLS_PER_MINUTE } from "../src/mcp/tool.js";
import { readConfig } from "../src/config.js";
import type { RoomClient } from "./support/rooms.js";
import { jsonOf } from "./support/index.js";
import { call, mcp, messageOf, ok, refused, type Mcp } from "./support/mcp.js";
import { pngBytes } from "./support/projects.js";

const ANA = "u-ana";
const FLOW = readFileSync(
  join(REPO_ROOT, "corpus", "acceptance", "flow", "cycles.meltemi"),
  "utf8",
);
const SEQUENCE = readFileSync(
  join(REPO_ROOT, "corpus", "acceptance", "sequence", "parallel.meltemi"),
  "utf8",
);

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "tests", version: "1.0.0" },
  },
};

let log: { mock: { calls: unknown[][] }; mockClear(): void };
beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function signedIn(sub = ANA): Promise<{ m: Mcp; token: string; client: Client }> {
  const m = await mcp();
  const token = await m.token(sub);
  return { m, token, client: await m.connect(token) };
}

describe("the endpoint", () => {
  it("answers initialize with its name, the tools capability and three sentences of instructions, and no session", async () => {
    const m = await mcp();
    const token = await m.token(ANA);
    const response = await m.post(INITIALIZE, { Authorization: `Bearer ${token}` });

    expect(response.status).toBe(200);
    expect(response.headers.get("Mcp-Session-Id")).toBeNull();
    const result = (await messageOf(response))["result"] as Record<string, unknown>;
    expect(result["protocolVersion"]).toBe("2025-06-18");
    expect(result["capabilities"]).toMatchObject({ tools: {} });
    expect(result["serverInfo"]).toMatchObject({ name: "meltemi-diagrams" });
    const instructions = String(result["instructions"]);
    expect(instructions.split(/(?<=[.!?)])\s+(?=[A-Z])/)).toHaveLength(3);
    expect(instructions).toContain("https://diagrams.meltemi.dev/agent-setup");
  });

  it("refuses a page of another site with 403 before anything runs, the token untouched", async () => {
    const m = await mcp();
    const token = await m.token(ANA);
    const [row] = await m.h.store.tokensOf(ANA);
    m.h.clock.advance(2 * 60 * 60 * 1000);
    for (const origin of ["https://evil.example", "null", "https://id.meltemi.dev"]) {
      const response = await m.post(INITIALIZE, {
        Authorization: `Bearer ${token}`,
        Origin: origin,
      });
      expect(response.status, origin).toBe(403);
      expect((await jsonOf<{ code: string }>(response)).code).toBe("request.forbidden");
    }
    expect((await m.h.store.tokensOf(ANA))[0]?.lastUsedAt).toBe(row?.lastUsedAt);
    // The page's own Origin is let through.
    const own = await m.post(INITIALIZE, {
      Authorization: `Bearer ${token}`,
      Origin: m.h.env.ORIGIN,
    });
    expect(own.status).toBe(200);
  });

  it("refuses a protocol version it does not serve with 400, initialize included", async () => {
    const { m, token } = await signedIn();
    for (const body of [INITIALIZE, { jsonrpc: "2.0", id: 2, method: "tools/list" }]) {
      const response = await m.post(body, {
        Authorization: `Bearer ${token}`,
        "MCP-Protocol-Version": "1999-01-01",
      });
      expect(response.status).toBe(400);
    }
  });

  it("answers GET and DELETE with 405: it is stateless", async () => {
    const { m, token } = await signedIn();
    for (const method of ["GET", "DELETE"]) {
      const response = await m.h.request("/mcp", {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      });
      expect(response.status, method).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    }
  });

  it("answers 401 with a challenge to a request without a token, with a token it does not hold, with a JWT, and with the cookie alone", async () => {
    const m = await mcp();
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const jwt = cookie.slice("meltemi_session=".length);
    const cases: Record<string, string>[] = [
      {},
      { Authorization: "Bearer not-a-token" },
      { Authorization: "Bearer mdg_0000000000000000000000000000000000000000000" },
      { Authorization: `Bearer ${jwt}` },
      { Cookie: cookie },
    ];
    for (const headers of cases) {
      const response = await m.post(INITIALIZE, headers);
      expect(response.status, JSON.stringify(Object.keys(headers))).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toMatch(/^Bearer /);
    }
  });

  it("refuses a body over 24 MiB with 413, unread", async () => {
    const { m, token } = await signedIn();
    const response = await m.h.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Content-Length": String(25 * 1024 * 1024),
      },
      body: "{}",
    });
    expect(response.status).toBe(413);
  });

  it("serves a client of the 2026-07-28 revision too", async () => {
    const m = await mcp();
    const client = await m.connect(await m.token(ANA), { modern: true });
    expect((await client.listTools()).tools).toHaveLength(CATALOGUE.length);
    expect(ok(await call(client, "whoami"))).toMatchObject({ sub: ANA });
  });
});

describe("the catalogue", () => {
  const NAMES = [
    "whoami",
    "list_projects",
    "create_project",
    "get_project",
    "rename_project",
    "read_files",
    "write_files",
    "validate",
    "upload_image",
    "list_versions",
    "create_version",
    "restore_version",
    "open_url",
    "preview",
    "inspect_story",
    "get_sharing",
    "set_link_access",
    "invite",
    "list_invitations",
    "revoke_invitation",
    "set_member_role",
    "remove_member",
    "get_live",
    "start_live",
    "end_live",
    "list_publications",
    "publish",
    "unpublish",
  ];

  it("lists the twenty-eight tools, each with a title, a description, both schemas and annotations", async () => {
    const { client } = await signedIn();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(NAMES);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.description, t.name).toBeTruthy();
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(t.outputSchema?.type, t.name).toBe("object");
      expect(t.annotations, t.name).toBeDefined();
    }
  });

  it("marks the reads read-only, the removals destructive and creation idempotent", async () => {
    const { client } = await signedIn();
    const byName = new Map((await client.listTools()).tools.map((t) => [t.name, t.annotations]));
    for (const name of [
      "whoami",
      "list_projects",
      "get_project",
      "read_files",
      "validate",
      "list_versions",
      "open_url",
      "preview",
      "inspect_story",
      "get_sharing",
      "list_invitations",
      "get_live",
      "list_publications",
    ]) {
      expect(byName.get(name)?.readOnlyHint, name).toBe(true);
    }
    for (const name of [
      "unpublish",
      "restore_version",
      "remove_member",
      "revoke_invitation",
      "end_live",
    ]) {
      expect(byName.get(name)?.destructiveHint, name).toBe(true);
    }
    expect(byName.get("create_project")?.idempotentHint).toBe(true);
    expect(byName.get("create_project")?.destructiveHint).toBe(false);
  });

  it("answers an unknown tool with the JSON-RPC error -32602 naming it", async () => {
    const { m, token } = await signedIn();
    const response = await m.post(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "delete_project", arguments: {} },
      },
      { Authorization: `Bearer ${token}`, "MCP-Protocol-Version": "2025-06-18" },
    );
    const error = (await messageOf(response))["error"] as { code: number; message: string };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain("delete_project");
  });

  it("answers arguments of another shape as request.invalid, with the field and without the value", async () => {
    const { client } = await signedIn();
    const result = refused(await call(client, "create_project", { name: 42 }));
    expect(result["code"]).toBe("request.invalid");
    expect(String(result["message"])).toContain("name");
    expect(String(result["message"])).not.toContain("42");
  });
});

/** The text a page holding the room's document shows for a path. */
function pageText(client: RoomClient, path: string): string | undefined {
  for (const [id, held] of client.cloud.paths.entries()) {
    if (held === path) return String(client.cloud.files.get(id));
  }
  return undefined;
}

describe("projects and files", () => {
  it("creates a project with its address, which list_projects lists", async () => {
    const { client } = await signedIn();
    const project = ok<{ id: string; url: string; role: string }>(
      await call(client, "create_project", { name: "Checkout" }),
    );
    expect(project.url).toBe(`https://diagrams.meltemi.dev/?project=${project.id}`);
    expect(project.role).toBe("owner");
    const listed = ok<{ projects: { id: string }[] }>(await call(client, "list_projects"));
    expect(listed.projects.map((p) => p.id)).toEqual([project.id]);
    expect(ok(await call(client, "open_url", { project: project.id }))).toEqual({
      url: project.url,
    });
  });

  it("writes two diagrams in one project, which get_project lists, read_files returns and an open page shows", async () => {
    const { m, client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Two" }));
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const page = m.h.rooms.clientOf(
      await m.h.request(`/rooms/${id}`, {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          Origin: m.h.env.ORIGIN,
          Cookie: cookie,
        },
      }),
    );
    await page.sync();
    const { revision } = ok<{ revision: number }>(
      await call(client, "get_project", { project: id }),
    );

    const written = ok<{ revision: number; diagnostics: unknown[] }>(
      await call(client, "write_files", {
        project: id,
        files: { "flow.meltemi": FLOW, "sequence.meltemi": SEQUENCE },
        ifRevision: revision,
      }),
    );

    expect(written.revision).toBeGreaterThan(revision);
    const project = ok<{ files: string[]; revision: number }>(
      await call(client, "get_project", { project: id }),
    );
    expect(project.files).toEqual(["flow.meltemi", "sequence.meltemi"]);
    expect(project.revision).toBe(written.revision);
    const read = ok<{ files: Record<string, string> }>(
      await call(client, "read_files", { project: id, paths: ["flow.meltemi", "nothing.meltemi"] }),
    );
    expect(read.files).toEqual({ "flow.meltemi": FLOW });
    expect(read).toMatchObject({ missing: ["nothing.meltemi"] });
    expect(pageText(page, "flow.meltemi")).toBe(FLOW);
    expect(pageText(page, "sequence.meltemi")).toBe(SEQUENCE);
  });

  it("leaves a first project's files and sharing as they were when a second one is made and written", async () => {
    const { client } = await signedIn();
    const first = ok<{ id: string }>(
      await call(client, "create_project", { name: "One", files: { "a.meltemi": FLOW } }),
    );
    ok(await call(client, "set_link_access", { project: first.id, level: "view" }));
    const before = ok(await call(client, "read_files", { project: first.id }));
    const second = ok<{ id: string }>(await call(client, "create_project", { name: "Two" }));
    ok(
      await call(client, "write_files", {
        project: second.id,
        files: { "b.meltemi": SEQUENCE },
        ifRevision: 0,
      }),
    );
    expect(ok(await call(client, "read_files", { project: first.id }))).toEqual(before);
    expect(ok(await call(client, "get_sharing", { project: first.id }))).toMatchObject({
      linkAccess: "view",
    });
  });

  it("refuses a push with an error whole, diagram.invalid with the line, and the revision stays", async () => {
    const { m, client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Broken" }));
    const result = refused(
      await call(client, "write_files", {
        project: id,
        files: { "good.meltemi": FLOW, "bad.meltemi": "diagram x: flow {\n  element a ->\n}\n" },
        ifRevision: 0,
      }),
    );
    expect(result["code"]).toBe("diagram.invalid");
    const errors = (
      result["diagnostics"] as { path: string; severity: string; line: number }[]
    ).filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((d) => d.path === "bad.meltemi" && d.line >= 1)).toBe(true);
    const room = await m.h.rooms.read(id);
    expect(room.revision).toBe(0);
    expect(room.files).toEqual({});
  });

  it("refuses a stale push with revision.mismatch and the current revision, and changes nothing", async () => {
    const { m, client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Busy" }));
    for (const n of [1, 2]) {
      ok(
        await call(client, "write_files", {
          project: id,
          files: { "a.md": `v${n}` },
          ifRevision: n - 1,
        }),
      );
    }
    const result = refused(
      await call(client, "write_files", { project: id, files: { "a.md": "stale" }, ifRevision: 1 }),
    );
    expect(result).toMatchObject({ code: "revision.mismatch", revision: 2 });
    expect((await m.h.rooms.read(id)).files["a.md"]).toBe("v2");
  });

  it("reads what a person changed in the app, with the new revision", async () => {
    const { m, client } = await signedIn();
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", { name: "Shared", files: { "a.md": "one" } }),
    );
    const { cookie } = await m.h.signedIn({ sub: ANA });
    await m.h.request(
      `/api/projects/${id}/files`,
      m.h.fromPage(cookie, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: { "a.md": "changed by a person" } }),
      }),
    );
    const read = ok<{ revision: number; files: Record<string, string> }>(
      await call(client, "read_files", { project: id }),
    );
    expect(read.files["a.md"]).toBe("changed by a person");
    expect(read.revision).toBe((await m.h.rooms.read(id)).revision);
  });

  it("answers someone else's project, an unknown one and a malformed id as project.not-found and nothing more", async () => {
    const m = await mcp();
    const bob = await m.connect(await m.token("u-bob"));
    const ana = await m.connect(await m.token(ANA));
    const { id } = ok<{ id: string }>(await call(ana, "create_project", { name: "Ana's" }));
    for (const project of [id, "zzzzzzzzzzzzzzzzzzzz", "../x"]) {
      for (const [name, args] of [
        ["get_project", {}],
        ["read_files", {}],
        ["write_files", { files: { "a.md": "x" }, ifRevision: 0 }],
        ["get_sharing", {}],
      ] as const) {
        const result = refused(await call(bob, name, { project, ...args }));
        expect(result, `${name} ${project}`).toEqual({
          code: "project.not-found",
          message: "There is no such project.",
        });
      }
    }
  });

  it("answers the 101st project with quota.projects and its limit", async () => {
    const { m, client } = await signedIn();
    for (let n = 0; n < 100; n++) {
      await m.h.store.createProject(
        {
          id: `p${String(n).padStart(19, "0")}`,
          ownerSub: ANA,
          name: `P${n}`,
          description: "",
          createdAt: "2026-10-14T12:00:00.000Z",
        },
        100,
      );
    }
    const result = refused(await call(client, "create_project", { name: "One too many" }));
    expect(result).toMatchObject({ code: "quota.projects", limit: 100 });
  });

  it("uploads an image whose hash is its SHA-256, listed under binaries", async () => {
    const { client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Logo" }));
    const png = pngBytes("the logo");
    const { hash } = ok<{ hash: string }>(
      await call(client, "upload_image", {
        project: id,
        path: "assets/logo.png",
        data: Buffer.from(png).toString("base64"),
      }),
    );
    expect(hash).toBe(createHash("sha256").update(png).digest("hex"));
    const read = ok<{ binaries: Record<string, string> }>(
      await call(client, "read_files", { project: id }),
    );
    expect(read.binaries).toEqual({ "assets/logo.png": hash });
    expect(
      refused(
        await call(client, "upload_image", { project: id, path: "x.png", data: "not base64!" }),
      )["code"],
    ).toBe("request.invalid");
  });

  it("validates a file and the project, warnings and errors counted", async () => {
    const { client } = await signedIn();
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", {
        name: "Checked",
        files: { "good.meltemi": FLOW, "bad.meltemi": "diagram x: flow {\n  element a ->\n}\n" },
      }),
    );
    const good = ok<{ errors: number }>(
      await call(client, "validate", { project: id, path: "good.meltemi" }),
    );
    expect(good.errors).toBe(0);
    const all = ok<{ errors: number; diagnostics: { path: string }[] }>(
      await call(client, "validate", { project: id }),
    );
    expect(all.errors).toBeGreaterThan(0);
    expect(all.diagnostics.some((d) => d.path === "bad.meltemi")).toBe(true);
    expect(
      refused(await call(client, "validate", { project: id, path: "nothing.meltemi" }))["code"],
    ).toBe("request.invalid");
  });

  it("makes, lists and restores versions", async () => {
    const { client } = await signedIn();
    const { id } = ok<{ id: string }>(
      await call(client, "create_project", { name: "Kept", files: { "a.md": "one" } }),
    );
    const version = ok<{ number: number }>(
      await call(client, "create_version", { project: id, label: "first" }),
    );
    ok(await call(client, "write_files", { project: id, files: { "a.md": "two" }, ifRevision: 1 }));
    expect(
      ok<{ versions: { number: number }[] }>(
        await call(client, "list_versions", { project: id }),
      ).versions.map((v) => v.number),
    ).toEqual([version.number]);
    const restored = ok<{ restored: number }>(
      await call(client, "restore_version", { project: id, number: version.number }),
    );
    expect(restored.restored).toBe(version.number);
    expect(
      ok<{ files: Record<string, string> }>(await call(client, "read_files", { project: id }))
        .files,
    ).toEqual({ "a.md": "one" });
  });

  it("renames a project, the owner's", async () => {
    const { client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Old" }));
    expect(ok(await call(client, "rename_project", { project: id, name: "New" }))).toMatchObject({
      id,
      name: "New",
    });
  });

  it("answers whoami with the account, its scopes, usage and limits", async () => {
    const { client } = await signedIn();
    const me = ok<Record<string, unknown>>(await call(client, "whoami"));
    expect(me).toMatchObject({ sub: ANA, name: ANA, email: "ana@example.com", handle: null });
    expect(me["scopes"]).toEqual(["projects:read", "projects:write", "sharing", "live", "publish"]);
    expect(me["limits"]).toMatchObject({ projects: 100 });
  });
});

describe("idempotency keys of the tools", () => {
  it("answers a retried create_project with the same project, and one project exists", async () => {
    const { m, client } = await signedIn();
    const first = ok<{ id: string }>(
      await call(client, "create_project", { name: "Checkout", idempotencyKey: "k1" }),
    );
    const again = ok<{ id: string }>(
      await call(client, "create_project", { name: "Checkout", idempotencyKey: "k1" }),
    );
    expect(again.id).toBe(first.id);
    expect(await m.h.store.listProjects(ANA)).toHaveLength(1);
    const other = refused(
      await call(client, "create_project", { name: "Billing", idempotencyKey: "k1" }),
    );
    expect(other["code"]).toBe("idempotency.mismatch");
  });

  it("is the key of the HTTP API: the same key and body through either door is one request", async () => {
    const { m, client } = await signedIn();
    const project = ok<{ id: string }>(
      await call(client, "create_project", { name: "Checkout", idempotencyKey: "door" }),
    );
    const { cookie } = await m.h.signedIn({ sub: ANA });
    const response = await m.h.request(
      "/api/projects",
      m.h.fromPage(cookie, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "door" },
        body: JSON.stringify({ name: "Checkout" }),
      }),
    );
    expect(response.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await jsonOf<{ id: string }>(response)).id).toBe(project.id);
  });

  it("applies a retried write_files once, and answers a kept refusal again", async () => {
    const { m, client } = await signedIn();
    const { id } = ok<{ id: string }>(await call(client, "create_project", { name: "Once" }));
    const args = { project: id, files: { "a.md": "one" }, ifRevision: 0, idempotencyKey: "w1" };
    const first = ok<{ revision: number }>(await call(client, "write_files", args));
    const again = ok<{ revision: number }>(await call(client, "write_files", args));
    expect(again.revision).toBe(first.revision);
    expect((await m.h.rooms.read(id)).revision).toBe(first.revision);
    const stale = { project: id, files: { "a.md": "two" }, ifRevision: 0, idempotencyKey: "w2" };
    expect(refused(await call(client, "write_files", stale))).toMatchObject({
      code: "revision.mismatch",
    });
    expect(refused(await call(client, "write_files", stale))).toMatchObject({
      code: "revision.mismatch",
    });
  });
});

describe("scopes and limits", () => {
  /** A client of a caller with only some scopes: what an OAuth token will be (tasks 2.x). */
  async function narrowed(m: Mcp, sub: string, scopes: Caller["scopes"]): Promise<Client> {
    const principal = { via: "token" as const, sub, tokenId: "t", tokenName: "narrow" };
    const server = await createServer({
      op: {
        env: m.h.env,
        deps: m.h.deps,
        config: readConfig(m.h.env, new Request(m.h.env.ORIGIN)),
        principal,
      },
      caller: { principal, scopes, clientId: "test" },
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "narrow", version: "1.0.0" });
    await client.connect(clientSide);
    return client;
  }

  it("inspects a story with read scope and refuses a write-only token before reading the project", async () => {
    const m = await mcp();
    const ana = await m.connect(await m.token(ANA));
    const { id } = ok<{ id: string }>(
      await call(ana, "create_project", {
        name: "Story scopes",
        files: {
          "story.meltemi":
            "diagram x: flow { a -> b }\nstory tour for x { scene first { hold 1s } }\n",
        },
      }),
    );
    const reader = await narrowed(m, ANA, new Set(["projects:read"]));
    const args = { project: id, path: "story.meltemi", story: "tour" };
    expect(ok(await call(reader, "inspect_story", args))).toMatchObject({
      id: "tour",
      durationMs: 1000,
    });
    const writer = await narrowed(m, ANA, new Set(["projects:write"]));
    expect(refused(await call(writer, "inspect_story", args))).toMatchObject({
      code: "scope.insufficient",
      scope: "projects:read",
    });
    await Promise.all([ana.close(), reader.close(), writer.close()]);
  });

  it("refuses a tool a token's scopes do not include with scope.insufficient naming the scope, and changes nothing", async () => {
    const m = await mcp();
    const ana = await m.connect(await m.token(ANA));
    const { id } = ok<{ id: string }>(await call(ana, "create_project", { name: "Read only" }));
    const reader = await narrowed(m, ANA, new Set(["projects:read"]));
    expect(ok(await call(reader, "read_files", { project: id }))).toMatchObject({ revision: 0 });
    const result = refused(
      await call(reader, "write_files", { project: id, files: { "a.md": "x" }, ifRevision: 0 }),
    );
    expect(result).toMatchObject({ code: "scope.insufficient", scope: "projects:write" });
    expect(
      refused(await call(reader, "set_link_access", { project: id, level: "view" })),
    ).toMatchObject({ scope: "sharing" });
    expect(refused(await call(reader, "start_live", { project: id }))).toMatchObject({
      scope: "live",
    });
    expect(refused(await call(reader, "publish", { project: id, slug: "x" }))).toMatchObject({
      scope: "publish",
    });
    expect((await m.h.rooms.read(id)).revision).toBe(0);
  });

  it(`answers the ${CALLS_PER_MINUTE + 1}st call of a minute with rate.limited and retryAfter, and the next minute again`, async () => {
    const { m, client } = await signedIn();
    for (let n = 0; n < CALLS_PER_MINUTE; n++) ok(await call(client, "whoami"));
    const limited = refused(await call(client, "whoami"));
    expect(limited).toMatchObject({ code: "rate.limited" });
    expect(limited["retryAfter"]).toBeGreaterThan(0);
    m.h.clock.advance(60 * 1000);
    ok(await call(client, "whoami"));
  });

  it("logs a call's tool, duration and code, and nothing of its arguments", async () => {
    const { client } = await signedIn();
    log.mockClear();
    await call(client, "create_project", { name: "A secret name" });
    await call(client, "read_files", { project: "zzzzzzzzzzzzzzzzzzzz" });
    const lines = log.mock.calls.map((args: unknown[]) => args.join(" "));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^mcp: create_project \d+ ms ok$/);
    expect(lines[1]).toMatch(/^mcp: read_files \d+ ms project\.not-found$/);
  });
});
