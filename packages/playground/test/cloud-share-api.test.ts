import { describe, expect, it } from "vitest";
import { sharingApi } from "../src/cloud/share-api.js";
import { fakeFetch, jsonResponse, textResponse } from "./support/fake-fetch.js";

const PAGE = "https://diagrams.example/?project=abcdefghij0123456789#p=zzz";
const ID = "abcdefghij0123456789";
const BASE = `https://diagrams.example/api/projects/${ID}`;

const member = (patch: Record<string, unknown> = {}) => ({
  sub: "u-ana",
  name: "Ana",
  picture: "https://avatars.githubusercontent.com/u/1",
  email: "ana@example.com",
  role: "editor",
  added_at: "2026-10-14T10:00:00.000Z",
  ...patch,
});

const invitation = (patch: Record<string, unknown> = {}) => ({
  id: "inv1",
  email: "bo@example.com",
  role: "viewer",
  created_at: "2026-10-14T11:00:00.000Z",
  expires_at: "2026-11-13T11:00:00.000Z",
  link: `https://diagrams.example/p/${ID}?invite=0123456789abcdef0123456789abcdef`,
  ...patch,
});

describe("the sharing the service answers", () => {
  it("reads the owner's whole state: people with emails and the invitations with their links", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({
        linkAccess: "view",
        role: "owner",
        members: [member()],
        invitations: [invitation()],
      }),
    );
    const answer = await sharingApi(fetch, { href: PAGE }).get(ID);
    expect(answer).toEqual({
      ok: true,
      value: {
        linkAccess: "view",
        role: "owner",
        members: [
          {
            sub: "u-ana",
            name: "Ana",
            picture: "https://avatars.githubusercontent.com/u/1",
            email: "ana@example.com",
            role: "editor",
            addedAt: "2026-10-14T10:00:00.000Z",
          },
        ],
        invitations: [
          {
            id: "inv1",
            email: "bo@example.com",
            role: "viewer",
            createdAt: "2026-10-14T11:00:00.000Z",
            expiresAt: "2026-11-13T11:00:00.000Z",
            link: `https://diagrams.example/p/${ID}?invite=0123456789abcdef0123456789abcdef`,
          },
        ],
      },
    });
    expect(calls[0]!.url).toBe(`${BASE}/sharing`);
    expect(calls[0]!.init.credentials).toBe("same-origin");
  });

  it("keeps what a member is not given undefined: no emails, and no invitations at all", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        linkAccess: "private",
        role: "viewer",
        members: [{ sub: "u-ana", name: "Ana", picture: null, role: "editor" }],
      }),
    );
    const answer = await sharingApi(fetch, { href: PAGE }).get(ID);
    expect(answer.ok && answer.value.invitations).toBeUndefined();
    expect(answer.ok && answer.value.members).toEqual([
      {
        sub: "u-ana",
        name: "Ana",
        picture: undefined,
        email: undefined,
        role: "editor",
        addedAt: "",
      },
    ]);
  });

  it("keeps a link-only viewer's state to the level and the role", async () => {
    const { fetch } = fakeFetch(() => jsonResponse({ linkAccess: "view", role: "viewer" }));
    expect(await sharingApi(fetch, { href: PAGE }).get(ID)).toEqual({
      ok: true,
      value: { linkAccess: "view", role: "viewer", members: undefined, invitations: undefined },
    });
  });

  it("draws a picture only from an https address or the page's own origin", async () => {
    const pictures = [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "http://elsewhere.example/a.png",
      "https://user:pass@cdn.example/a.png",
      "/relative.png",
      "https://cdn.example/a.png",
      "https://diagrams.example/avatar.png",
    ];
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        linkAccess: "private",
        role: "owner",
        members: pictures.map((picture, i) => member({ sub: `u${i}`, picture })),
        invitations: [],
      }),
    );
    const answer = await sharingApi(fetch, { href: PAGE }).get(ID);
    expect(answer.ok && answer.value.members?.map((m) => m.picture)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "https://cdn.example/a.png",
      "https://diagrams.example/avatar.png",
    ]);
  });

  it("drops a member or an invitation that is not one, and is unexpected for a state that is not", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse({
        linkAccess: "edit",
        role: "owner",
        members: [member(), { name: "no sub" }, member({ sub: "u2", role: "owner" }), null, 4],
        invitations: [invitation(), invitation({ id: "" }), invitation({ link: "" }), { id: "x" }],
      }),
    );
    const answer = await sharingApi(fetch, { href: PAGE }).get(ID);
    expect(answer.ok && answer.value.members?.map((m) => m.sub)).toEqual(["u-ana"]);
    expect(answer.ok && answer.value.invitations?.map((i) => i.id)).toEqual(["inv1"]);

    for (const body of [
      { linkAccess: "world", role: "owner" },
      { linkAccess: "view", role: "admin" },
      { linkAccess: "view" },
      [],
    ]) {
      const bad = fakeFetch(() => jsonResponse(body));
      expect(await sharingApi(bad.fetch, { href: PAGE }).get(ID)).toEqual({
        ok: false,
        failure: { kind: "unexpected", status: 200 },
      });
    }
  });

  it("is a failure, never a throw, for a refusal, an unreadable answer and no answer", async () => {
    const refused = fakeFetch(() =>
      jsonResponse({ code: "project.not-found", message: "There is no such project." }, 404),
    );
    expect(await sharingApi(refused.fetch, { href: PAGE }).get(ID)).toEqual({
      ok: false,
      failure: {
        kind: "refused",
        status: 404,
        code: "project.not-found",
        message: "There is no such project.",
      },
    });
    const html = fakeFetch(() => textResponse("<html>", 200, "text/html"));
    expect((await sharingApi(html.fetch, { href: PAGE }).get(ID)).ok).toBe(false);
    const down = sharingApi(() => Promise.reject(new TypeError("offline")), { href: PAGE });
    expect(await down.get(ID)).toEqual({ ok: false, failure: { kind: "unreachable", status: 0 } });
  });
});

describe("the calls that change the sharing", () => {
  it("patches the link level as JSON and reads the owner's state back", async () => {
    const { fetch, calls } = fakeFetch(() =>
      jsonResponse({ linkAccess: "edit", role: "owner", members: [], invitations: [] }),
    );
    const answer = await sharingApi(fetch, { href: PAGE }).setLink(ID, "edit");
    expect(answer.ok && answer.value.linkAccess).toBe("edit");
    expect(calls[0]!.url).toBe(`${BASE}/sharing`);
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(calls[0]!.init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ linkAccess: "edit" });
  });

  it("invites with a POST and tells a new invitation (201) from one that was pending (200)", async () => {
    let status = 201;
    const { fetch, calls } = fakeFetch(() => jsonResponse(invitation(), status));
    const api = sharingApi(fetch, { href: PAGE });
    const first = await api.invite(ID, "bo@example.com", "viewer");
    expect(first.ok && first.value.created).toBe(true);
    expect(first.ok && first.value.invitation.link).toContain(`/p/${ID}?invite=`);
    status = 200;
    const again = await api.invite(ID, "bo@example.com", "editor");
    expect(again.ok && again.value.created).toBe(false);
    expect(calls[0]!.url).toBe(`${BASE}/members`);
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: "bo@example.com",
      role: "viewer",
    });
  });

  it("changes a role, removes a member and leaves, each at its own address", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.init.method === "PATCH"
        ? jsonResponse(member({ role: "viewer" }))
        : new Response(null, { status: 204 }),
    );
    const api = sharingApi(fetch, { href: PAGE });
    const changed = await api.setRole(ID, "u|ana/1", "viewer");
    expect(changed.ok && changed.value.role).toBe("viewer");
    expect(await api.removeMember(ID, "u-ana")).toEqual({ ok: true, value: null });
    expect(await api.leave(ID)).toEqual({ ok: true, value: null });
    expect(calls.map((c) => `${c.init.method} ${c.url.slice(BASE.length)}`)).toEqual([
      "PATCH /members/u%7Cana%2F1",
      "DELETE /members/u-ana",
      "DELETE /members/me",
    ]);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ role: "viewer" });
  });

  it("lists the invitations and revokes one", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.init.method === "DELETE"
        ? new Response(null, { status: 204 })
        : jsonResponse({ invitations: [invitation(), invitation({ id: "inv2" })] }),
    );
    const api = sharingApi(fetch, { href: PAGE });
    const listed = await api.invitations(ID);
    expect(listed.ok && listed.value.map((i) => i.id)).toEqual(["inv1", "inv2"]);
    expect(await api.revoke(ID, "inv1")).toEqual({ ok: true, value: null });
    expect(calls.map((c) => `${c.init.method ?? "GET"} ${c.url.slice(BASE.length)}`)).toEqual([
      "GET /invitations",
      "DELETE /invitations/inv1",
    ]);
  });

  it("is refused in the service's words: a full project, a bad email, a viewer's attempt", async () => {
    for (const [status, code] of [
      [413, "quota.members"],
      [400, "request.invalid"],
      [403, "access.denied"],
    ] as const) {
      const { fetch } = fakeFetch(() => jsonResponse({ code, message: "No." }, status));
      const answer = await sharingApi(fetch, { href: PAGE }).invite(ID, "bo@example.com", "viewer");
      expect(answer).toEqual({
        ok: false,
        failure: { kind: "refused", status, code, message: "No." },
      });
    }
  });
});
