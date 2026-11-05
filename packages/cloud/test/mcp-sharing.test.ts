// The sharing, live-session and publishing tools of the MCP endpoint (`mcp-server`, "Sharing through
// the tools" and "Live sessions and publishing through the tools"): the roles each project gives an
// account decide as they do for the routes, the answers carry the links people pass on, nothing
// secret reaches the log, and `publish` answers an address only once it served it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { jsonOf } from "./support/index.js";
import { call, mcp, ok, refused, type Mcp } from "./support/mcp.js";
import type { Client } from "@modelcontextprotocol/client";

const ANA = "u-ana";
const BOB = "u-bob";
const FLOW = readFileSync(
  join(REPO_ROOT, "corpus", "acceptance", "flow", "cycles.meltemi"),
  "utf8",
);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function owned(): Promise<{ m: Mcp; ana: Client; id: string }> {
  const m = await mcp();
  const ana = await m.connect(await m.token(ANA));
  const { id } = ok<{ id: string }>(
    await call(ana, "create_project", { name: "Shared", files: { "checkout.meltemi": FLOW } }),
  );
  return { m, ana, id };
}

describe("sharing through the tools", () => {
  it("opens the project to anybody with its link at view, and an anonymous client cannot write", async () => {
    const { m, ana, id } = await owned();
    const state = ok<{ linkAccess: string; link: string }>(
      await call(ana, "set_link_access", { project: id, level: "view" }),
    );
    expect(state.linkAccess).toBe("view");
    expect(state.link).toBe(`https://diagrams.meltemi.dev/p/${id}`);

    const opened = await m.h.request(new URL(state.link).pathname);
    expect(opened.status).toBe(302);
    expect(opened.headers.get("Location")).toBe(`/?project=${id}`);
    const files = await m.h.request(`/api/projects/${id}/files`);
    expect((await jsonOf<{ files: Record<string, string> }>(files)).files).toEqual({
      "checkout.meltemi": FLOW,
    });
    // Nobody signed in has no door to the tools.
    const anonymous = await m.post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(anonymous.status).toBe(401);
  });

  it("invites by email, answering the link and that no email was sent, and lists the invitation", async () => {
    const { ana, id } = await owned();
    const invited = ok<{
      invitation: { id: string; email: string; role: string };
      link: string;
      emailSent: boolean;
    }>(await call(ana, "invite", { project: id, email: "ana@example.org", role: "editor" }));
    expect(invited.emailSent).toBe(false);
    expect(invited.invitation).toMatchObject({ email: "ana@example.org", role: "editor" });
    expect(invited.link).toMatch(
      new RegExp(`^https://diagrams\\.meltemi\\.dev/p/${id}\\?invite=[0-9a-f]{32}$`),
    );
    const listed = ok<{ invitations: { id: string; link: string }[] }>(
      await call(ana, "list_invitations", { project: id }),
    );
    expect(listed.invitations).toEqual([
      expect.objectContaining({ id: invited.invitation.id, link: invited.link }),
    ]);
    ok(await call(ana, "revoke_invitation", { project: id, invitation: invited.invitation.id }));
    expect(
      ok<{ invitations: unknown[] }>(await call(ana, "list_invitations", { project: id }))
        .invitations,
    ).toEqual([]);
  });

  it("lets a member join, changes their role and removes them", async () => {
    const { m, ana, id } = await owned();
    const { link } = ok<{ link: string }>(
      await call(ana, "invite", { project: id, email: "bob@example.com", role: "viewer" }),
    );
    const token = new URL(link).searchParams.get("invite");
    expect((await m.sendJson(BOB, "POST", `/api/invitations/${token}/accept`, {})).status).toBe(
      200,
    );
    expect(
      ok(await call(ana, "set_member_role", { project: id, member: BOB, role: "editor" })),
    ).toMatchObject({
      sub: BOB,
      role: "editor",
    });
    ok(await call(ana, "remove_member", { project: id, member: BOB }));
    expect(
      ok<{ members: unknown[] }>(await call(ana, "get_sharing", { project: id })).members,
    ).toEqual([]);
  });

  it("refuses a viewer's set_link_access and invite with the role's refusal, and nothing changes", async () => {
    const { m, ana, id } = await owned();
    const { link } = ok<{ link: string }>(
      await call(ana, "invite", { project: id, email: "bob@example.com", role: "viewer" }),
    );
    await m.sendJson(
      BOB,
      "POST",
      `/api/invitations/${new URL(link).searchParams.get("invite")}/accept`,
      {},
    );
    const bob = await m.connect(await m.token(BOB));
    for (const [name, args] of [
      ["set_link_access", { level: "edit" }],
      ["invite", { email: "eve@example.com", role: "editor" }],
    ] as const) {
      expect(refused(await call(bob, name, { project: id, ...args })), name).toMatchObject({
        code: "access.denied",
      });
    }
    expect(ok(await call(ana, "get_sharing", { project: id }))).toMatchObject({
      linkAccess: "private",
    });
    expect(
      ok<{ invitations: unknown[] }>(await call(ana, "list_invitations", { project: id }))
        .invitations,
    ).toEqual([]);
  });

  it("refuses an editor with every scope set_link_access, since sharing is the owner's", async () => {
    const { m, ana, id } = await owned();
    const { link } = ok<{ link: string }>(
      await call(ana, "invite", { project: id, email: "bob@example.com", role: "editor" }),
    );
    await m.sendJson(
      BOB,
      "POST",
      `/api/invitations/${new URL(link).searchParams.get("invite")}/accept`,
      {},
    );
    const bob = await m.connect(await m.token(BOB));
    expect(ok(await call(bob, "whoami"))).toMatchObject({
      scopes: ["projects:read", "projects:write", "sharing", "live", "publish"],
    });
    expect(
      ok(
        await call(bob, "write_files", {
          project: id,
          files: { "notes.md": "by bob" },
          ifRevision: 1,
        }),
      ),
    ).toBeDefined();
    expect(
      refused(await call(bob, "set_link_access", { project: id, level: "view" })),
    ).toMatchObject({ code: "access.denied" });
  });
});

describe("live sessions through the tools", () => {
  it("starts a session with its link and term, and ending it makes get_live answer null", async () => {
    const { ana, id } = await owned();
    const live = ok<{ link: string; until: string; guestsEdit: boolean }>(
      await call(ana, "start_live", { project: id, guestsEdit: true }),
    );
    expect(live.guestsEdit).toBe(true);
    expect(live.link).toMatch(
      new RegExp(`^https://diagrams\\.meltemi\\.dev/p/${id}\\?live=[0-9a-f]{32}$`),
    );
    expect(Date.parse(live.until)).toBeGreaterThan(Date.parse("2026-10-14T12:00:00.000Z"));
    expect(
      ok<{ live: { link: string } }>(await call(ana, "get_live", { project: id })).live.link,
    ).toBe(live.link);
    ok(await call(ana, "end_live", { project: id }));
    expect(ok(await call(ana, "get_live", { project: id }))).toEqual({ live: null });
  });

  it("never writes an invitation's or a session's link to the console", async () => {
    const { ana, id } = await owned();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const { link: invitation } = ok<{ link: string }>(
      await call(ana, "invite", { project: id, email: "eve@example.com", role: "viewer" }),
    );
    const { link: session } = ok<{ link: string }>(await call(ana, "start_live", { project: id }));
    const logged = JSON.stringify(spies.map((spy) => spy.mock.calls));
    expect(spies[0]!.mock.calls.length).toBeGreaterThan(0);
    for (const secret of [
      invitation,
      session,
      new URL(invitation).search,
      new URL(session).search,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("publishing through the tools", () => {
  async function publisher(): Promise<{ m: Mcp; ana: Client; id: string }> {
    const world = await owned();
    const response = await world.m.sendJson(ANA, "PATCH", "/api/account", { handle: "ana" });
    expect(response.status).toBe(200);
    return world;
  }

  it("refuses a publication before the account has a handle, and builds nothing", async () => {
    const { m, ana, id } = await owned();
    expect(refused(await call(ana, "publish", { project: id, slug: "precios" }))).toMatchObject({
      code: "handle.required",
    });
    expect(m.readBacks).toEqual([]);
  });

  it("publishes the catalog, reads the address back, and unpublishing one leaves the other", async () => {
    const { m, ana, id } = await publisher();
    const published = ok<{ url: string; entries: number; handle: string }>(
      await call(ana, "publish", { project: id, slug: "precios" }),
    );
    expect(published.url).toBe("https://meltemi.page/ana/precios/");
    expect(published.entries).toBeGreaterThan(0);
    expect(m.readBacks).toEqual(["HEAD https://meltemi.page/ana/precios/"]);
    const { publishHost } = await import("../src/publish.js");
    const visit = (url: string) =>
      publishHost(new Request(url), { BLOBS: m.h.blobs }, { store: m.h.store });
    const page = await visit(published.url);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("/* catalog runtime */");

    ok(await call(ana, "publish", { project: id, slug: "otra" }));
    expect(
      ok<{ publications: { slug: string }[] }>(await call(ana, "list_publications"))
        .publications.map((p) => p.slug)
        .sort(),
    ).toEqual(["otra", "precios"]);
    ok(await call(ana, "unpublish", { project: id, slug: "precios" }));
    expect((await visit(published.url)).status).toBe(404);
    expect((await visit("https://meltemi.page/ana/otra/")).status).toBe(200);
    expect(
      ok<{ publications: { slug: string }[] }>(
        await call(ana, "list_publications", { project: id }),
      ).publications.map((p) => p.slug),
    ).toEqual(["otra"]);
  });

  it("answers publish.unverified naming the address when the publish host does not answer, and the publication exists", async () => {
    const { m, ana, id } = await publisher();
    m.publishHostUp = false;
    const result = refused(await call(ana, "publish", { project: id, slug: "precios" }));
    expect(result).toMatchObject({
      code: "publish.unverified",
      url: "https://meltemi.page/ana/precios/",
    });
    expect(await m.h.store.publication("ana", "precios")).toMatchObject({ projectId: id });
  });

  it("refuses a project with nothing to draw, and publishes nothing", async () => {
    const m = await mcp();
    const ana = await m.connect(await m.token(ANA));
    await m.sendJson(ANA, "PATCH", "/api/account", { handle: "ana" });
    const { id } = ok<{ id: string }>(
      await call(ana, "create_project", { name: "Empty", files: { "notes.md": "#" } }),
    );
    expect(refused(await call(ana, "publish", { project: id, slug: "nada" }))).toMatchObject({
      code: "diagram.invalid",
    });
    expect(await m.h.store.publication("ana", "nada")).toBeUndefined();
  });
});
