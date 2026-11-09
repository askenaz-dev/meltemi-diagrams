// `mdg mcp` over the cloud projects of the sign-in (`mcp-local-server`, "The cloud tools through the
// HTTP API", "Without a sign-in", "Writing from the machine", "Publishing from the machine"): the
// command run on a free port against the stub service and driven by the SDK's client, as an agent
// drives it. Every tool acts through `/api/*` only; the pictures, the checks and the catalogs are
// made in this process.

import { catalogScript } from "@meltemi/diagrams-catalog/node";
import { nodeRenderer } from "@meltemi/diagrams-mcp/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalEngine } from "../src/mcp-engine.js";
import { Scratch, sheet, signIn } from "./cloud-fixtures.js";
import { CloudStub, type StubProject } from "./cloud-stub.js";
import { ok, refusal, startMcp, type Running, type ToolResult } from "./mcp-support.js";

const stub = new CloudStub();
const scratch = new Scratch();
let home: ReturnType<Scratch["home"]>;
let mcp: Running;

/** A one-pixel PNG, a real one, for the image a drawing shows. */
const PIXEL = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d4944415478da63f8cfc0f01f0005000201ffa65f3c" +
    "2f0000000049454e44ae426082",
  "hex",
);

const BROKEN = 'language "0.2"\n\ndiagram x: flow {\n  a ->\n}\n';

/** A free diagram that shows the project's image. */
const BOARD = [
  'language "0.2"',
  "",
  "diagram board: free {",
  '  image logo "assets/logo.png"',
  "",
  "  placement {",
  "    place logo at (100, 100)",
  "  }",
  "}",
  "",
].join("\n");

const texts = (result: ToolResult) =>
  result.content.map((item) => item.text ?? "").join("\n") +
  JSON.stringify(result.structuredContent);

beforeAll(async () => {
  await stub.start();
  home = scratch.home(stub, { MELTEMI_LANG: "en" });
  mcp = await startMcp([], { cwd: scratch.root, env: home.env });
}, 60_000);

afterAll(async () => {
  expect(await mcp.stop()).toBe(0);
  await stub.stop();
});

beforeEach(() => {
  stub.requests.length = 0;
});

describe("the sign-in", () => {
  it("starts without one, says to run login, and uses one made meanwhile", async () => {
    const before = await mcp.call("list_projects");
    expect(refusal(before)).toBe("auth.required");
    expect(String(before.structuredContent?.["message"])).toContain("mdg login");
    const { token } = signIn(stub, home.store);
    const project = stub.addProject({ name: "Shop" });
    const after = ok(await mcp.call("list_projects"));
    expect(after["projects"]).toEqual([
      expect.objectContaining({
        id: project.id,
        name: "Shop",
        role: "owner",
        url: `${stub.url}/?project=${project.id}`,
      }),
    ]);
    expect(mcp.stderr()).not.toContain(token);
  });

  it("answers token.invalid for a token the service refuses, and never shows it", async () => {
    const other = scratch.home(stub, { MELTEMI_LANG: "en" });
    const revoked = "mdg_" + "x".repeat(43);
    other.store.save(stub.url, {
      token: revoked,
      id: "gone",
      user: { sub: "u_7d3f", name: "Ana" },
    });
    const server = await startMcp([], { cwd: scratch.root, env: other.env });
    try {
      const result = await server.call("whoami");
      expect(refusal(result)).toBe("token.invalid");
      expect(texts(result)).not.toContain(revoked);
      expect(server.stdout() + server.stderr()).not.toContain(revoked);
    } finally {
      await server.stop();
    }
  });

  it("refuses a redirect, and sends the token nowhere else", async () => {
    stub.fail("GET /api/projects", {
      status: 302,
      headers: { Location: "https://elsewhere.example/" },
    });
    expect(refusal(await mcp.call("list_projects"))).toBe("cloud.redirect");
  });
});

describe("projects and files", () => {
  it("inspects the current account story through local compilation and the files API only", async () => {
    const source =
      'language "0.2"\ndiagram x: flow { a -> b: "Request" as request }\nstory tour for x {\n  scene first { trace request }\n  scene last { hold 500ms }\n}\n';
    const project = stub.addProject({ name: "Local timeline", files: { "story.meltemi": source } });
    const first = ok(
      await mcp.call("inspect_story", {
        project: project.id,
        path: "story.meltemi",
        story: "tour",
      }),
    );
    expect(first).toMatchObject({
      id: "tour",
      path: "story.meltemi",
      durationMs: 1700,
      revision: project.revision,
    });
    expect(stub.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      `GET /api/projects/${project.id}/files`,
    ]);
    expect(
      refusal(
        await mcp.call("inspect_story", {
          project: project.id,
          path: "story.meltemi",
          story: "missing",
        }),
      ),
    ).toBe("request.invalid");
  });

  let project: StubProject;
  beforeAll(() => {
    project = stub.addProject({
      name: "Payments",
      files: { "flow.meltemi": sheet(), "board.meltemi": BOARD },
      binaries: { "assets/logo.png": PIXEL },
    });
  });

  it("answers who the account is, with its email and every scope", async () => {
    const who = ok(await mcp.call("whoami"));
    expect(who).toMatchObject({ sub: "u_7d3f", name: "Ana", email: "ana@example.com" });
    expect(who["scopes"]).toEqual([
      "projects:read",
      "projects:write",
      "sharing",
      "live",
      "publish",
    ]);
  });

  it("creates a project once for a key, however often it is asked", async () => {
    const args = { name: "Twice", template: "flow", idempotencyKey: "create-twice-1" };
    const first = ok(await mcp.call("create_project", args));
    const second = ok(await mcp.call("create_project", args));
    expect(second["id"]).toBe(first["id"]);
    expect([...stub.projects.values()].filter((p) => p.name === "Twice")).toHaveLength(1);
    const sent = stub.to("/api/projects", "POST");
    expect(sent.map((r) => r.headers["idempotency-key"])).toEqual([
      "create-twice-1",
      "create-twice-1",
    ]);
  });

  it("reads a project, its files and its address, and renames it", async () => {
    const got = ok(await mcp.call("get_project", { project: project.id }));
    expect(got).toMatchObject({
      id: project.id,
      revision: project.revision,
      files: ["board.meltemi", "flow.meltemi"],
      binaries: ["assets/logo.png"],
    });
    const read = ok(
      await mcp.call("read_files", {
        project: project.id,
        paths: ["flow.meltemi", "nope.meltemi"],
      }),
    );
    expect(read["missing"]).toEqual(["nope.meltemi"]);
    expect(ok(await mcp.call("open_url", { project: project.id }))["url"]).toBe(
      `${stub.url}/?project=${project.id}`,
    );
    expect(
      ok(await mcp.call("rename_project", { project: project.id, name: "Payments v2" }))["name"],
    ).toBe("Payments v2");
  });

  it("refuses a write with an error whole, before anything is pushed", async () => {
    const result = await mcp.call("write_files", {
      project: project.id,
      files: { "good.meltemi": sheet("Fine"), "bad.meltemi": BROKEN },
      ifRevision: project.revision,
    });
    expect(refusal(result)).toBe("diagram.invalid");
    expect((result.structuredContent?.["diagnostics"] as unknown[]).length).toBeGreaterThan(0);
    expect(stub.to(`/api/projects/${project.id}/files`, "PUT")).toEqual([]);
  });

  it("answers a retry after success with the same revision, and a conflict with the current one", async () => {
    const at = project.revision;
    const args = {
      project: project.id,
      files: { "flow.meltemi": sheet("Begin") },
      ifRevision: at,
      idempotencyKey: "write-once-1",
    };
    const first = ok(await mcp.call("write_files", args));
    expect(first["revision"]).toBe(at + 1);
    const again = ok(await mcp.call("write_files", args));
    expect(again["revision"]).toBe(at + 1);
    expect(project.revision).toBe(at + 1);
    const conflict = await mcp.call("write_files", { ...args, idempotencyKey: "write-once-2" });
    expect(refusal(conflict)).toBe("revision.mismatch");
    expect(conflict.structuredContent?.["revision"]).toBe(at + 1);
  });

  it("validates and previews on this machine, fetching an image once", async () => {
    project.revision++;
    const checked = ok(await mcp.call("validate", { project: project.id }));
    expect(checked).toMatchObject({ revision: project.revision, errors: 0 });
    const png = await mcp.call("preview", { project: project.id, path: "board.meltemi" });
    expect(ok(png)).toMatchObject({ format: "png", revision: project.revision, cached: false });
    expect(png.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    const svg = await mcp.call("preview", {
      project: project.id,
      path: "board.meltemi",
      format: "svg",
    });
    expect(svg.content[0]!.text).toContain("<image");
    expect(ok(svg)["diagnostics"]).toEqual([]);
    expect(stub.to(/\/blobs\//, "GET")).toHaveLength(1);
    expect(
      refusal(
        await mcp.call("preview", { project: project.id, path: "flow.meltemi", width: 4096 }),
      ),
    ).toBe("request.invalid");
    project.files.set("bad.meltemi", BROKEN);
    project.revision++;
    const broken = await mcp.call("preview", { project: project.id, path: "bad.meltemi" });
    expect(refusal(broken)).toBe("diagram.invalid");
    expect(broken.content.some((item) => item.type === "image")).toBe(false);
    project.files.delete("bad.meltemi");
    project.revision++;
  }, 60_000);

  it("uploads an image and records, lists and restores versions", async () => {
    const uploaded = ok(
      await mcp.call("upload_image", {
        project: project.id,
        path: "assets/pixel.png",
        data: PIXEL.toString("base64"),
      }),
    );
    expect(uploaded["path"]).toBe("assets/pixel.png");
    const made = ok(await mcp.call("create_version", { project: project.id, label: "before" }));
    expect(made).toMatchObject({ label: "before", auto: false });
    const listed = ok(await mcp.call("list_versions", { project: project.id }));
    expect((listed["versions"] as unknown[]).length).toBeGreaterThan(0);
    const restored = ok(
      await mcp.call("restore_version", { project: project.id, number: made["number"] }),
    );
    expect(restored["restored"]).toBe(made["number"]);
  });
});

describe("sharing, live sessions and publishing", () => {
  let project: StubProject;
  beforeAll(() => {
    project = stub.addProject({ name: "Shared", files: { "flow.meltemi": sheet() } });
    project.members.push({
      sub: "u_bob",
      name: "Bob",
      picture: "",
      email: "bob@example.com",
      role: "viewer",
    });
  });

  it("sets the link, invites without sending mail, and manages members", async () => {
    expect(ok(await mcp.call("get_sharing", { project: project.id }))["linkAccess"]).toBe(
      "private",
    );
    const link = ok(await mcp.call("set_link_access", { project: project.id, level: "view" }));
    expect(link).toMatchObject({ linkAccess: "view", link: `${stub.url}/p/${project.id}` });
    const invited = ok(
      await mcp.call("invite", { project: project.id, email: "eve@example.com", role: "editor" }),
    );
    expect(invited).toMatchObject({ emailSent: false, created: true });
    expect(invited["invitation"]).not.toHaveProperty("link");
    const again = ok(
      await mcp.call("invite", { project: project.id, email: "eve@example.com", role: "viewer" }),
    );
    expect(again["created"]).toBe(false);
    const pending = ok(await mcp.call("list_invitations", { project: project.id }));
    const [first] = pending["invitations"] as { id: string }[];
    expect(
      ok(await mcp.call("revoke_invitation", { project: project.id, invitation: first!.id })),
    ).toEqual({ revoked: true });
    expect(
      ok(
        await mcp.call("set_member_role", { project: project.id, member: "u_bob", role: "editor" }),
      )["role"],
    ).toBe("editor");
    expect(ok(await mcp.call("remove_member", { project: project.id, member: "u_bob" }))).toEqual({
      removed: true,
    });
  });

  it("starts, reads and ends a live session", async () => {
    expect(ok(await mcp.call("get_live", { project: project.id }))).toEqual({ live: null });
    const started = ok(await mcp.call("start_live", { project: project.id, guestsEdit: false }));
    expect(started).toMatchObject({ guestsEdit: false, guests: 0 });
    expect(
      (ok(await mcp.call("get_live", { project: project.id }))["live"] as { id: string }).id,
    ).toBe(started["id"]);
    expect(ok(await mcp.call("end_live", { project: project.id }))).toEqual({ ended: true });
  });

  it("asks for a handle, then publishes the endpoint's page and checks it serves", async () => {
    stub.account.handle = null;
    expect(refusal(await mcp.call("publish", { project: project.id, slug: "shared" }))).toBe(
      "handle.required",
    );
    expect(stub.to(`/api/projects/${project.id}/publish`, "PUT")).toEqual([]);
    stub.account.handle = "ana";
    const published = ok(await mcp.call("publish", { project: project.id, slug: "shared" }));
    expect(published).toMatchObject({ handle: "ana", slug: "shared", entries: 1, skipped: [] });

    // The page the endpoint's renderer would build for the same files, script and generator.
    const built = await nodeRenderer({ toolVersion: "1.11.0" }).catalog({
      files: { "flow.meltemi": sheet() },
      binaries: {},
      script: catalogScript(),
      generator: "Meltemi Diagrams 1.11.0",
    });
    expect(built.ok).toBe(true);
    expect(project.publications.get("shared")!.html).toBe(built.ok ? built.html : "");

    const all = ok(await mcp.call("list_publications", {}));
    expect(all["publications"]).toEqual([
      expect.objectContaining({ project: project.id, slug: "shared" }),
    ]);
    expect(ok(await mcp.call("list_publications", { project: project.id }))["handle"]).toBe("ana");
    expect(ok(await mcp.call("unpublish", { project: project.id, slug: "shared" }))).toEqual({
      unpublished: true,
      slug: "shared",
    });
  }, 60_000);

  it("refuses an empty catalog before it publishes", async () => {
    const empty = stub.addProject({ name: "Empty", files: {} });
    const result = await mcp.call("publish", { project: empty.id, slug: "empty" });
    expect(result.isError).toBe(true);
    expect(stub.to(`/api/projects/${empty.id}/publish`, "PUT")).toEqual([]);
  });
});

describe("what the local server sends and leaves", () => {
  it("calls the API only, and logs one clean line a call", async () => {
    const project = stub.addProject({ name: "Audit", files: { "flow.meltemi": sheet() } });
    ok(await mcp.call("get_project", { project: project.id }));
    ok(await mcp.call("preview", { project: project.id, path: "flow.meltemi", format: "svg" }));
    ok(await mcp.call("start_live", { project: project.id }));
    ok(await mcp.call("invite", { project: project.id, email: "zed@example.com", role: "viewer" }));
    for (const request of stub.requests) {
      expect(request.path.startsWith("/api/") || request.path.startsWith("/_published/")).toBe(
        true,
      );
      expect(request.path).not.toBe("/mcp");
    }
    const lines = mcp
      .stderr()
      .split("\n")
      .filter((line) => line.startsWith("mcp: "));
    for (const line of lines) expect(line).toMatch(/^mcp: [a-z_]+ \d+ ms [a-z.-]+$/);
    const log = mcp.stderr();
    for (const token of stub.tokens.keys()) expect(log).not.toContain(token);
    for (const p of stub.projects.values()) {
      for (const invitation of p.invitations) expect(log).not.toContain(invitation.link);
      if (p.live) expect(log).not.toContain(p.live.link);
    }
  }, 60_000);

  it("draws one picture at a time", async () => {
    const order: string[] = [];
    const engine = new LocalEngine("1.11.0", () => ({
      render: async (request: { file: string }) => {
        order.push(`start ${request.file}`);
        await new Promise((resolve) => setTimeout(resolve, 30));
        order.push(`end ${request.file}`);
        return { ok: false, code: "request.invalid", message: "stand-in" } as const;
      },
      validate: async () => ({ ok: false, code: "request.invalid", message: "stand-in" }) as const,
      inspectStory: async () =>
        ({ ok: false, code: "request.invalid", message: "stand-in" }) as const,
      catalog: async () => ({ ok: false, code: "request.invalid", message: "stand-in" }) as const,
    }));
    const request = (file: string) => ({ revision: 1, files: {}, file, format: "svg" as const });
    await Promise.all([engine.render(request("a")), engine.render(request("b"))]);
    expect(order).toEqual(["start a", "end a", "start b", "end b"]);
  });
});
