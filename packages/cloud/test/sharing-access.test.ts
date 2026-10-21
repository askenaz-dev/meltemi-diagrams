// Who may do what with a project, through the handler (`project-sharing`, "Link access and members"
// and "The role each route needs"; `cloud-document`, "Roles in the room"): every route of a project
// states the role it needs, and every person (the owner, a member editor, a member viewer, a
// signed-in stranger, nobody) at every link level gets the answer the matrix and the order of
// refusals give. The pure matrix is access.test.ts; the sharing routes themselves are sharing.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { publishedKey, thumbnailKey } from "../src/keys.js";
import type { LinkAccess } from "../src/store/types.js";
import { jsonOf } from "./support/index.js";
import { pngBytes, svgOf } from "./support/projects.js";
import { A, textOf, typeInto, addText } from "./support/rooms.js";
import {
  EDITOR,
  NOBODY,
  OWNER,
  STRANGER,
  VIEWER,
  emailOf,
  tokenOf,
  world,
  type World,
} from "./support/sharing.js";
import { addToken, bearer } from "./support/who.js";

const ORIGIN = "https://diagrams.meltemi.dev";
const LINKS: LinkAccess[] = ["private", "view", "edit"];
const SUBJECTS = [OWNER, EDITOR, VIEWER, STRANGER, NOBODY];

afterEach(() => {
  vi.restoreAllMocks();
});

type Role = "owner" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/** What each person is to the project at each link level: the matrix, written out from the design. */
function roleOf(subject: string, link: LinkAccess): Role | undefined {
  if (subject === OWNER) return "owner";
  if (subject === EDITOR) return "editor";
  if (subject === VIEWER) return link === "edit" ? "editor" : "viewer";
  if (subject === STRANGER)
    return link === "edit" ? "editor" : link === "view" ? "viewer" : undefined;
  return link === "private" ? undefined : "viewer";
}

interface Refusal {
  status: number;
  code: string;
}

/** What a route that needs `need` answers `subject` when the role falls short, in the order of the specification. */
function refusalOf(
  need: "read" | "write" | "manage",
  subject: string,
  link: LinkAccess,
): Refusal | undefined {
  const role = roleOf(subject, link);
  if (role === undefined) return { status: 404, code: "project.not-found" };
  if (RANK[role] >= { read: 1, write: 2, manage: 3 }[need]) return undefined;
  // Nobody on a route that needs more than the link gives, when the link would give a signed-in person enough.
  if (subject === NOBODY && need === "write" && link === "edit") {
    return { status: 401, code: "auth.required" };
  }
  return { status: 403, code: "access.denied" };
}

const ACCESS_CODES = ["project.not-found", "auth.required", "access.denied"];

/** The `code` of an error answer; undefined for an answer with no JSON body (a success, a HEAD). */
async function codeOf(response: Response): Promise<string | undefined> {
  if (!response.headers.get("Content-Type")?.startsWith("application/json")) return undefined;
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}

interface Route {
  name: string;
  need: "read" | "write" | "manage";
  method: string;
  path: (w: World) => string;
  body?: (w: World) => unknown;
  headers?: Record<string, string>;
}

const PNG = pngBytes("another picture");
const SVG = { "Content-Type": "image/svg+xml" };

/** Every route of a project that states a role, once. (Delete is the destructive one: see its own test.) */
const ROUTES: Route[] = [
  { name: "GET project", need: "read", method: "GET", path: (w) => w.url() },
  { name: "GET files", need: "read", method: "GET", path: (w) => w.url("/files") },
  { name: "GET blob", need: "read", method: "GET", path: (w) => w.url(`/blobs/${w.hash}`) },
  { name: "HEAD blob", need: "read", method: "HEAD", path: (w) => w.url(`/blobs/${w.hash}`) },
  { name: "GET versions", need: "read", method: "GET", path: (w) => w.url("/versions") },
  { name: "GET version", need: "read", method: "GET", path: (w) => w.url("/versions/1") },
  { name: "GET thumbnail", need: "read", method: "GET", path: (w) => w.url("/thumbnail") },
  { name: "GET sharing", need: "read", method: "GET", path: (w) => w.url("/sharing") },
  {
    name: "PUT files",
    need: "write",
    method: "PUT",
    path: (w) => w.url("/files"),
    body: () => ({ files: { "pushed.md": "pushed" } }),
  },
  {
    name: "PUT binary",
    need: "write",
    method: "PUT",
    path: (w) => w.url("/binaries/extra.png"),
    body: () => PNG,
    headers: { "Content-Type": "image/png" },
  },
  {
    name: "DELETE binary",
    need: "write",
    method: "DELETE",
    path: (w) => w.url("/binaries/extra.png"),
  },
  {
    name: "PUT thumbnail",
    need: "write",
    method: "PUT",
    path: (w) => w.url("/thumbnail"),
    body: () => svgOf(),
    headers: SVG,
  },
  {
    name: "POST version",
    need: "write",
    method: "POST",
    path: (w) => w.url("/versions"),
    body: () => ({ label: "again" }),
  },
  {
    name: "POST restore",
    need: "write",
    method: "POST",
    path: (w) => w.url("/versions/1/restore"),
  },
  {
    name: "PATCH project",
    need: "manage",
    method: "PATCH",
    path: (w) => w.url(),
    body: () => ({ description: "described" }),
  },
  {
    name: "PATCH sharing",
    need: "manage",
    method: "PATCH",
    path: (w) => w.url("/sharing"),
    // The level the project has: the owner's request changes nothing for the people after them.
    body: (w) => ({ linkAccess: w.link }),
  },
  {
    name: "POST members",
    need: "manage",
    method: "POST",
    path: (w) => w.url("/members"),
    body: () => ({ email: "new@example.com", role: "viewer" }),
  },
  {
    name: "PATCH member",
    need: "manage",
    method: "PATCH",
    path: (w) => w.url(`/members/${VIEWER}`),
    body: () => ({ role: "viewer" }),
  },
  {
    name: "DELETE member",
    need: "manage",
    method: "DELETE",
    path: (w) => w.url("/members/u-nobody"),
  },
  { name: "GET invitations", need: "manage", method: "GET", path: (w) => w.url("/invitations") },
  {
    name: "DELETE invitation",
    need: "manage",
    method: "DELETE",
    path: (w) => w.url(`/invitations/${"0".repeat(32)}`),
  },
  // Publishing is the owner's (the design's table: `PUT`/`DELETE …/publish`; the dialog's own read
  // is the owner's too). The owner here has no handle, so what the route answers itself is
  // `handle.required` and `not-found`: not a refusal of access, and not an error of the service.
  { name: "GET publish", need: "manage", method: "GET", path: (w) => w.url("/publish") },
  {
    name: "PUT publish",
    need: "manage",
    method: "PUT",
    path: (w) => w.url("/publish"),
    body: () => ({ slug: "page", html: "<p>page</p>" }),
  },
  {
    name: "DELETE publish",
    need: "manage",
    method: "DELETE",
    path: (w) => w.url("/publish/page"),
  },
];

describe.each(LINKS)("with the link %s", (link) => {
  it.each(ROUTES)("answers $name to each person as the matrix says", async (route) => {
    const w = await world(link);
    for (const subject of SUBJECTS) {
      const response = await w.ask(
        subject,
        route.method,
        route.path(w),
        route.body?.(w),
        route.headers,
      );
      const refusal = refusalOf(route.need, subject, link);
      const label = `${route.name} as ${subject} on a ${link} link`;
      if (refusal) {
        expect(response.status, label).toBe(refusal.status);
        if (route.method !== "HEAD") expect(await codeOf(response), label).toBe(refusal.code);
      } else {
        // Whatever the route answers itself (a 404 for a member who is not there, a 429 for a
        // second thumbnail), it is not a refusal of access.
        expect(ACCESS_CODES, label).not.toContain(await codeOf(response));
        expect(response.status, label).toBeLessThan(500);
        expect([401, 403], label).not.toContain(response.status);
      }
    }
  });

  it("answers DELETE project to each person as the matrix says: the owner's alone, and the project remains for the rest", async () => {
    const w = await world(link);
    for (const subject of [EDITOR, VIEWER, STRANGER, NOBODY]) {
      const response = await w.ask(subject, "DELETE", w.url());
      const refusal = refusalOf("manage", subject, link);
      expect(response.status, subject).toBe(refusal?.status);
      expect(await codeOf(response), subject).toBe(refusal?.code);
      expect(await w.h.store.projectById(w.id), subject).toBeDefined();
    }
    expect((await w.ask(OWNER, "DELETE", w.url())).status).toBe(204);
    expect(await w.h.store.projectById(w.id)).toBeUndefined();
  });

  it("tells each person the role they have in GET project, which the page opens in view mode for when it is viewer", async () => {
    const w = await world(link);
    for (const subject of SUBJECTS) {
      const response = await w.ask(subject, "GET", w.url());
      const role = roleOf(subject, link);
      if (role === undefined) {
        expect(response.status, subject).toBe(404);
        continue;
      }
      expect(response.status, subject).toBe(200);
      expect(await jsonOf(response), subject).toMatchObject({ id: w.id, name: "Shared", role });
    }
  });

  it("lets a bearer token do everywhere what its person's cookie does", async () => {
    const w = await world(link);
    for (const subject of [OWNER, EDITOR, VIEWER, STRANGER]) {
      const { token } = await addToken(w.h.store, { sub: subject });
      for (const route of ROUTES.filter((r) =>
        ["GET project", "PUT files", "GET invitations"].includes(r.name),
      )) {
        const init: RequestInit = {
          method: route.method,
          ...(route.body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(route.body(w)),
              }
            : {}),
        };
        const response = await w.h.request(route.path(w), bearer(token, init));
        const refusal = refusalOf(route.need, subject, link);
        const label = `${route.name} with ${subject}'s token`;
        if (refusal)
          expect([response.status, await codeOf(response)], label).toEqual([
            refusal.status,
            refusal.code,
          ]);
        else expect(ACCESS_CODES, label).not.toContain(await codeOf(response));
      }
    }
  });
});

describe("the refusals, in order", () => {
  it("says 404 project.not-found when there is no access at all, 401 when signing in would give enough, and 403 for any other role that falls short", async () => {
    const priv = await world("private");
    const edit = await world("edit");
    const view = await world("view");

    // No access at all: a private project does not reveal that it exists, to a person or to nobody.
    for (const who of [STRANGER, NOBODY]) {
      const response = await priv.ask(who, "PUT", priv.url("/files"), { files: { "a.md": "x" } });
      expect([response.status, await codeOf(response)]).toEqual([404, "project.not-found"]);
    }
    // Nobody on an edit link: signing in would give an editor, so the page can offer it.
    const needsAccount = await edit.ask(NOBODY, "PUT", edit.url("/files"), {
      files: { "a.md": "x" },
    });
    expect([needsAccount.status, await codeOf(needsAccount)]).toEqual([401, "auth.required"]);
    // Nobody on a view link: no account would give them more than viewer, so 403 and not a prompt to sign in.
    const readOnly = await view.ask(NOBODY, "PUT", view.url("/files"), { files: { "a.md": "x" } });
    expect([readOnly.status, await codeOf(readOnly)]).toEqual([403, "access.denied"]);
    // A viewer who is signed in is refused the same way.
    const viewer = await view.ask(VIEWER, "PUT", view.url("/files"), { files: { "a.md": "x" } });
    expect([viewer.status, await codeOf(viewer)]).toEqual([403, "access.denied"]);
    // And nobody on a route that needs the owner is 403 on any open link: no sign-in makes them one.
    const manage = await edit.ask(NOBODY, "PATCH", edit.url("/sharing"), { linkAccess: "private" });
    expect([manage.status, await codeOf(manage)]).toEqual([403, "access.denied"]);
    expect((await edit.h.store.projectById(edit.id))?.linkAccess).toBe("edit");
  });

  it("checks the project before the credentials of a route that needs a person: nobody asking for a project they cannot see is a 404, never a 401", async () => {
    const w = await world("private");
    for (const [method, rest] of [
      ["POST", "/duplicate"],
      ["DELETE", "/members/me"],
      ["GET", "/invitations"],
    ] as const) {
      const response = await w.ask(NOBODY, method, w.url(rest));
      expect([response.status, await codeOf(response)], `${method} ${rest}`).toEqual([
        404,
        "project.not-found",
      ]);
    }
  });
});

describe("the scenarios of the specification", () => {
  it("Edit by link needs an account: an anonymous push is 401 auth.required, and the same signed in succeeds", async () => {
    const w = await world("edit");
    const anonymous = await w.ask(NOBODY, "PUT", w.url("/files"), { files: { "link.md": "anon" } });
    expect([anonymous.status, await codeOf(anonymous)]).toEqual([401, "auth.required"]);
    expect((await w.h.rooms.read(w.id)).files["link.md"]).toBeUndefined();

    const signedIn = await w.ask(STRANGER, "PUT", w.url("/files"), { files: { "link.md": "ana" } });
    expect(signedIn.status).toBe(200);
    expect((await w.h.rooms.read(w.id)).files["link.md"]).toBe("ana");
  });

  it("Anonymous push on a private project: 404 project.not-found, not 401", async () => {
    const w = await world("private");
    const response = await w.ask(NOBODY, "PUT", w.url("/files"), { files: { "link.md": "x" } });
    expect([response.status, await codeOf(response)]).toEqual([404, "project.not-found"]);
    expect((await w.h.rooms.read(w.id)).files["link.md"]).toBeUndefined();
  });

  it("A private project does not exist for others: a signed-in person who is not a member reads it as 404", async () => {
    const w = await world("private");
    for (const rest of ["", "/files", "/versions", "/sharing", "/thumbnail", `/blobs/${w.hash}`]) {
      const response = await w.ask(STRANGER, "GET", w.url(rest));
      expect([response.status, await codeOf(response)], rest).toEqual([404, "project.not-found"]);
    }
    // And it is the answer for a project that does not exist: nothing tells the two apart.
    const missing = await w.ask(STRANGER, "GET", w.url("", "a".repeat(20)));
    expect(await jsonOf(missing)).toEqual(await jsonOf(await w.ask(STRANGER, "GET", w.url())));
  });

  it("A viewer cannot change sharing: patching the link level is 403 access.denied", async () => {
    const w = await world("view");
    const response = await w.ask(VIEWER, "PATCH", w.url("/sharing"), { linkAccess: "edit" });
    expect([response.status, await codeOf(response)]).toEqual([403, "access.denied"]);
    expect((await w.h.store.projectById(w.id))?.linkAccess).toBe("view");
  });

  it("An editor cannot delete: 403 access.denied, and the project remains with everything it holds", async () => {
    const w = await world("private");
    const response = await w.ask(EDITOR, "DELETE", w.url());
    expect([response.status, await codeOf(response)]).toEqual([403, "access.denied"]);
    expect(await w.h.store.projectById(w.id)).toBeDefined();
    expect((await w.h.rooms.read(w.id)).files["a.meltemi"]).toBe("one\n");
    expect(w.h.blobs.objects.has(thumbnailKey(w.id))).toBe(true);
  });

  it("An editor restores a version as the owner would (the design's table says write, and the specification's scenario agrees)", async () => {
    const w = await world("private");
    await w.ask(EDITOR, "PUT", w.url("/files"), {
      files: { "a.meltemi": "changed by the editor\n" },
    });
    await w.h.rooms.materialise(w.id);

    const restored = await w.ask(EDITOR, "POST", w.url("/versions/1/restore"));

    expect(restored.status).toBe(200);
    expect(await jsonOf(restored)).toMatchObject({ restored: 1 });
    expect((await w.h.rooms.read(w.id)).files["a.meltemi"]).toBe("one\n");
    // The version that keeps what was replaced is the editor's.
    const versions = await jsonOf<{ versions: { created_by: string; auto: boolean }[] }>(
      await w.ask(OWNER, "GET", w.url("/versions")),
    );
    expect(versions.versions[0]).toMatchObject({ auto: true, created_by: EDITOR });
  });

  it("Make a copy: a viewer by link keeps a copy in their own account, with the files and the images", async () => {
    const w = await world("view");
    const response = await w.ask(STRANGER, "POST", w.url("/duplicate"));
    expect(response.status).toBe(201);
    const copy = await jsonOf<{ id: string; name: string; role: string }>(response);
    expect(copy).toMatchObject({ name: "Shared (copy)", role: "owner" });
    expect(copy.id).not.toBe(w.id);
    // The copy is the stranger's own: they own it, the owner of the original has no part in it.
    expect(await w.h.store.project(STRANGER, copy.id)).toBeDefined();
    expect(await w.h.store.project(OWNER, copy.id)).toBeUndefined();
    expect((await w.h.rooms.read(copy.id)).files["a.meltemi"]).toBe("one\n");
    expect((await w.h.rooms.read(copy.id)).binaries["logo.png"]).toBe(w.hash);
    expect((await w.ask(STRANGER, "GET", w.url(`/blobs/${w.hash}`, copy.id))).status).toBe(200);
    expect((await w.ask(OWNER, "GET", w.url("", copy.id))).status).toBe(404);
  });

  it("Make a copy needs an account: nobody on a view link is 401, and on a private one 404", async () => {
    const view = await world("view");
    const anonymous = await view.ask(NOBODY, "POST", view.url("/duplicate"));
    expect([anonymous.status, await codeOf(anonymous)]).toEqual([401, "auth.required"]);
    const priv = await world("private");
    const hidden = await priv.ask(STRANGER, "POST", priv.url("/duplicate"));
    expect([hidden.status, await codeOf(hidden)]).toEqual([404, "project.not-found"]);
  });
});

describe("what anonymous viewers read", () => {
  it("is everything a viewer reads, from a view link and an edit link, and nothing is cached for others or run on the origin", async () => {
    for (const link of ["view", "edit"] as const) {
      const w = await world(link);
      const project = await w.ask(NOBODY, "GET", w.url());
      expect(await jsonOf(project)).toMatchObject({
        id: w.id,
        role: "viewer",
        thumbnail: `/api/projects/${w.id}/thumbnail`,
      });
      const files = await jsonOf<{
        files: Record<string, string>;
        binaries: Record<string, string>;
      }>(await w.ask(NOBODY, "GET", w.url("/files")));
      expect(files.files["a.meltemi"]).toBe("one\n");
      expect(files.binaries["logo.png"]).toBe(w.hash);

      const blob = await w.ask(NOBODY, "GET", w.url(`/blobs/${w.hash}`));
      expect(blob.status).toBe(200);
      expect(blob.headers.get("Content-Security-Policy")).toBe("sandbox");
      expect(blob.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect((await w.ask(NOBODY, "HEAD", w.url(`/blobs/${w.hash}`))).status).toBe(200);

      const versions = await jsonOf<{ versions: { number: number }[] }>(
        await w.ask(NOBODY, "GET", w.url("/versions")),
      );
      expect(versions.versions.map((v) => v.number)).toEqual([1]);
      expect((await w.ask(NOBODY, "GET", w.url("/versions/1"))).status).toBe(200);
      const thumbnail = await w.ask(NOBODY, "GET", w.url("/thumbnail"));
      expect(thumbnail.status).toBe(200);
      expect(thumbnail.headers.get("Content-Security-Policy")).toBe("sandbox");
    }
  });

  it("is nothing again the moment the owner makes the project private", async () => {
    const w = await world("view");
    expect((await w.ask(NOBODY, "GET", w.url("/files"))).status).toBe(200);
    await w.setLink("private");
    expect((await w.ask(NOBODY, "GET", w.url("/files"))).status).toBe(404);
    expect((await w.ask(STRANGER, "GET", w.url("/files"))).status).toBe(404);
    // Members keep what they were given.
    expect((await w.ask(VIEWER, "GET", w.url("/files"))).status).toBe(200);
  });

  it("does not need an Origin: it is a read, and the rule is for what changes", async () => {
    const w = await world("view");
    const response = await w.h.request(w.url("/files"), {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(200);
  });
});

describe("the list of projects", () => {
  it("shows the member's projects beside their own, each with the role they have", async () => {
    const w = await world("private");
    const mine = await w.create(EDITOR, { name: "Editor's own" });
    const list = async (sub: string) =>
      (
        await jsonOf<{ projects: { id: string; name: string; role: string }[] }>(
          await w.ask(sub, "GET", "/api/projects"),
        )
      ).projects;

    expect((await list(EDITOR)).map((p) => [p.name, p.role]).sort()).toEqual([
      ["Editor's own", "owner"],
      ["Shared", "editor"],
    ]);
    expect((await list(VIEWER)).map((p) => [p.name, p.role])).toEqual([["Shared", "viewer"]]);
    expect((await list(OWNER)).map((p) => [p.name, p.role])).toEqual([["Shared", "owner"]]);
    expect(await list(STRANGER)).toEqual([]);
    expect((await list(EDITOR)).find((p) => p.id === mine)).toBeDefined();
  });

  it("raises a member viewer to editor when the link is edit, as the person is allowed to do", async () => {
    const w = await world("edit");
    const list = await jsonOf<{ projects: { role: string }[] }>(
      await w.ask(VIEWER, "GET", "/api/projects"),
    );
    expect(list.projects.map((p) => p.role)).toEqual(["editor"]);
  });

  it("does not list a project the person only holds the link of", async () => {
    const w = await world("edit");
    const list = await jsonOf<{ projects: unknown[] }>(
      await w.ask(STRANGER, "GET", "/api/projects"),
    );
    expect(list.projects).toEqual([]);
  });

  it("is nobody's to read: 401 for nobody", async () => {
    const w = await world("view");
    expect((await w.ask(NOBODY, "GET", "/api/projects")).status).toBe(401);
  });
});

describe("what a member's work costs and who it is attributed to", () => {
  it("counts an editor's files against the owner's usage, and never the editor's", async () => {
    const w = await world("private");
    const before = await w.h.store.usage(OWNER);
    await w.ask(EDITOR, "PUT", w.url("/binaries/editor.png"), pngBytes("by the editor"), {
      "Content-Type": "image/png",
    });
    const after = await w.h.store.usage(OWNER);
    expect(after.storageBytes).toBeGreaterThan(before.storageBytes);
    expect((await w.h.store.usage(EDITOR)).storageBytes).toBe(0);
  });

  it("deletes the published pages of a project with it", async () => {
    const w = await world("private");
    await w.h.store.setHandle(OWNER, "handle-a");
    await w.h.store.putPublication({
      projectId: w.id,
      handle: "handle-a",
      slug: "page",
      publishedAt: "2026-10-14T12:00:00.000Z",
      bytes: 4,
    });
    await w.h.env.BLOBS.put(publishedKey("handle-a", "page"), "page");
    expect(w.h.blobs.objects.has(publishedKey("handle-a", "page"))).toBe(true);

    expect((await w.ask(OWNER, "DELETE", w.url())).status).toBe(204);

    expect(w.h.blobs.objects.has(publishedKey("handle-a", "page"))).toBe(false);
    expect(await w.h.store.publication("handle-a", "page")).toBeUndefined();
    expect(await w.h.store.members(w.id)).toEqual([]);
  });
});

describe("the room", () => {
  const upgrade = (cookie: string, extra: Record<string, string> = {}): RequestInit => ({
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Origin: ORIGIN,
      Cookie: cookie,
      ...extra,
    },
  });

  async function socket(w: World, sub: string, extra: Record<string, string> = {}, id = w.id) {
    const { cookie } = await w.h.signedIn({ sub });
    const response = await w.h.request(`/rooms/${id}`, upgrade(cookie, extra));
    return { response, client: response.status === 200 ? w.h.rooms.clientOf(response) : undefined };
  }

  it("gives each person the role the matrix gives, in the hello and to the room, and refuses the ones with no access with 404", async () => {
    for (const link of LINKS) {
      const w = await world(link);
      for (const sub of [OWNER, EDITOR, VIEWER, STRANGER]) {
        const { response, client } = await socket(w, sub);
        const role = roleOf(sub, link);
        if (role === undefined) {
          expect([response.status, await codeOf(response)], `${sub} on ${link}`).toEqual([
            404,
            "project.not-found",
          ]);
          continue;
        }
        expect(response.status, `${sub} on ${link}`).toBe(200);
        expect(client?.hello, `${sub} on ${link}`).toMatchObject({ role });
        expect(w.h.rooms.connects.at(-1)?.identity.role, `${sub} on ${link}`).toBe(role);
      }
    }
  });

  it("asks for a cookie even where the link admits anonymous viewers: they read a snapshot through GET files", async () => {
    const w = await world("view");
    const anonymous = await w.h.request(`/rooms/${w.id}`, {
      headers: { Upgrade: "websocket", Connection: "Upgrade", Origin: ORIGIN },
    });
    expect([anonymous.status, await codeOf(anonymous)]).toEqual([401, "auth.required"]);
    expect(w.h.rooms.connects).toEqual([]);
    expect((await w.ask(NOBODY, "GET", w.url("/files"))).status).toBe(200);
  });

  it("lets a viewer watch: what an editor changes reaches the viewer's document", async () => {
    const w = await world("private");
    const editor = (await socket(w, EDITOR)).client;
    const viewer = (await socket(w, VIEWER)).client;
    expect(editor && viewer).toBeTruthy();
    await addText(editor!, A, "live.meltemi", "text");

    await viewer!.sync();
    expect(textOf(viewer!, A)).toBe("text");
    await typeInto(editor!, A, "!");
    expect(textOf(viewer!, A)).toBe("text!");
    expect(viewer!.closed).toBeUndefined();
  });

  it("closes a viewer's socket with 4403 on its first update, leaving the document and the revision unchanged", async () => {
    const w = await world("private");
    const editor = (await socket(w, EDITOR)).client!;
    const viewer = (await socket(w, VIEWER)).client!;
    await addText(editor, A, "live.meltemi", "text");
    await viewer.sync();
    const before = await w.h.rooms.read(w.id);

    await typeInto(viewer, A, " vandalism");

    expect(viewer.errors).toEqual(["access.denied"]);
    expect(viewer.closed).toEqual({ code: 4403, reason: "access.denied" });
    expect(await w.h.rooms.read(w.id)).toEqual(before);
    expect(textOf(editor, A)).toBe("text");
    // The viewer did not take the editor's socket with it.
    expect(editor.closed).toBeUndefined();
  });

  it("answers a spoofed role header with the role the Worker resolved: a viewer's X-Meltemi-Role owner is still a viewer", async () => {
    const w = await world("private");
    const spoof = {
      "X-Meltemi-Role": "owner",
      "X-Meltemi-Sub": OWNER,
      "X-Meltemi-Name": "Mallory",
    };
    const { client } = await socket(w, VIEWER, spoof);
    expect(client?.hello).toMatchObject({ role: "viewer", you: { sub: VIEWER } });
    expect(w.h.rooms.connects.at(-1)?.identity).toMatchObject({ sub: VIEWER, role: "viewer" });

    await client!.edit((cloud) => cloud.paths.set("zzzzzzzzzzzzzzzz", "spoofed.meltemi"));
    expect(client?.closed).toEqual({ code: 4403, reason: "access.denied" });
    expect((await w.h.rooms.read(w.id)).files["spoofed.meltemi"]).toBeUndefined();
  });

  it("gives a stranger on an edit link the editor's socket, and takes it away with the link", async () => {
    const w = await world("edit");
    const { client } = await socket(w, STRANGER);
    expect(client?.hello).toMatchObject({ role: "editor" });
    await w.setLink("private");
    const refused = await socket(w, STRANGER);
    expect(refused.response.status).toBe(404);
  });

  // A room resolves what a connection may do once, when it opens: what changes a person's access
  // closes their sockets, so that their page reconnects and the role is resolved again.
  const CUT = { code: 4000, reason: "disconnected" };

  it("closes the sockets of a member whose role the owner changes, and no one else's", async () => {
    const w = await world("private");
    const owner = (await socket(w, OWNER)).client!;
    const editor = (await socket(w, EDITOR)).client!;
    const viewer = (await socket(w, VIEWER)).client!;

    expect(
      (await w.ask(OWNER, "PATCH", w.url(`/members/${EDITOR}`), { role: "viewer" })).status,
    ).toBe(200);
    expect(editor.closed).toEqual(CUT);
    expect([owner.closed, viewer.closed]).toEqual([undefined, undefined]);

    // Reconnected, the role is the one now given: a viewer, who cannot write.
    const again = (await socket(w, EDITOR)).client!;
    expect(again.hello).toMatchObject({ role: "viewer" });
    expect(
      (await w.ask(OWNER, "PATCH", w.url(`/members/${VIEWER}`), { role: "editor" })).status,
    ).toBe(200);
    expect(viewer.closed).toEqual(CUT);
    expect((await socket(w, VIEWER)).client?.hello).toMatchObject({ role: "editor" });
    expect([owner.closed, again.closed]).toEqual([undefined, undefined]);
  });

  it("closes the sockets of a member the owner removes, who is then refused the room, and of a member who leaves", async () => {
    const w = await world("private");
    const owner = (await socket(w, OWNER)).client!;
    const editor = (await socket(w, EDITOR)).client!;
    const viewer = (await socket(w, VIEWER)).client!;

    expect((await w.ask(OWNER, "DELETE", w.url(`/members/${EDITOR}`))).status).toBe(204);
    expect(editor.closed).toEqual(CUT);
    expect((await socket(w, EDITOR)).response.status).toBe(404);

    expect((await w.ask(VIEWER, "DELETE", w.url("/members/me"))).status).toBe(204);
    expect(viewer.closed).toEqual(CUT);
    expect((await socket(w, VIEWER)).response.status).toBe(404);
    expect(owner.closed).toBeUndefined();
  });

  it("closes everybody's sockets but the owner's when the link changes, and none when it is set to what it was", async () => {
    const w = await world("edit");
    const owner = (await socket(w, OWNER)).client!;
    const editor = (await socket(w, EDITOR)).client!;
    const viewer = (await socket(w, VIEWER)).client!;
    const stranger = (await socket(w, STRANGER)).client!;

    // The same level again changes nothing, so nobody is cut.
    await w.setLink("edit");
    expect([owner, editor, viewer, stranger].map((client) => client.closed)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    await w.setLink("view");
    expect(owner.closed).toBeUndefined();
    expect([editor, viewer, stranger].map((client) => client.closed)).toEqual([CUT, CUT, CUT]);
    // Reconnected, each is what the new level and their membership give: the stranger a viewer now.
    expect((await socket(w, STRANGER)).client?.hello).toMatchObject({ role: "viewer" });
    expect((await socket(w, EDITOR)).client?.hello).toMatchObject({ role: "editor" });
  });

  it("cuts a socket the room accepted after the cut: the upgrade was in flight while the owner removed the member", async () => {
    const w = await world("private");
    const real = w.h.rooms.connect.bind(w.h.rooms);
    vi.spyOn(w.h.rooms, "connect").mockImplementationOnce(async (...args) => {
      // The Worker resolved the editor's role already; the room has no socket of his to cut yet.
      expect((await w.ask(OWNER, "DELETE", w.url(`/members/${EDITOR}`))).status).toBe(204);
      return real(...args);
    });

    const { client } = await socket(w, EDITOR);

    expect(client?.closed).toEqual(CUT);
    // And the page that reconnects is refused.
    expect((await socket(w, EDITOR)).response.status).toBe(404);
  });

  it("cuts a socket accepted while the link narrowed, and one accepted while a role was lowered", async () => {
    const w = await world("edit");
    const real = w.h.rooms.connect.bind(w.h.rooms);
    const connect = vi.spyOn(w.h.rooms, "connect");
    connect.mockImplementationOnce(async (...args) => {
      await w.setLink("private");
      return real(...args);
    });
    expect((await socket(w, STRANGER)).client?.closed).toEqual(CUT);

    await w.setLink("view");
    connect.mockImplementationOnce(async (...args) => {
      const lowered = await w.ask(OWNER, "PATCH", w.url(`/members/${EDITOR}`), { role: "viewer" });
      expect(lowered.status).toBe(200);
      return real(...args);
    });
    expect((await socket(w, EDITOR)).client?.closed).toEqual(CUT);
    expect((await socket(w, EDITOR)).client?.hello).toMatchObject({ role: "viewer" });
  });

  it("leaves a socket alone when nothing changed while it opened", async () => {
    const w = await world("private");
    const disconnect = vi.spyOn(w.h.rooms, "disconnect");
    const { client } = await socket(w, EDITOR);
    expect(client?.closed).toBeUndefined();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("does not let a socket stay on a guess: an upgrade whose cut fails is an error, not a socket with the old role", async () => {
    const w = await world("private");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const real = w.h.rooms.connect.bind(w.h.rooms);
    vi.spyOn(w.h.rooms, "connect").mockImplementationOnce(async (...args) => {
      expect((await w.ask(OWNER, "DELETE", w.url(`/members/${EDITOR}`))).status).toBe(204);
      vi.spyOn(w.h.rooms, "disconnect").mockRejectedValue(new Error("the room is unreachable"));
      return real(...args);
    });

    const { response } = await socket(w, EDITOR);

    expect(response.status).toBe(500);
    expect(await codeOf(response)).toBe("internal");
  });

  it("tries the cut again when the room does not answer, and still answers the change when it never does", async () => {
    const w = await world("private");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const editor = (await socket(w, EDITOR)).client!;
    const disconnect = vi.spyOn(w.h.rooms, "disconnect");
    disconnect.mockRejectedValueOnce(new Error("the Durable Object was reset"));

    expect(
      (await w.ask(OWNER, "PATCH", w.url(`/members/${EDITOR}`), { role: "viewer" })).status,
    ).toBe(200);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(editor.closed).toEqual(CUT);

    // A room that never answers: the change stands, the answer is not an error, and the cut is logged.
    const viewer = (await socket(w, VIEWER)).client!;
    disconnect.mockClear();
    disconnect.mockRejectedValue(new Error("the room is unreachable"));
    expect((await w.ask(OWNER, "DELETE", w.url(`/members/${VIEWER}`))).status).toBe(204);
    expect(disconnect).toHaveBeenCalledTimes(3);
    expect(viewer.closed).toBeUndefined();
  });

  it("changes nothing for the sockets when a refused request would have changed a role", async () => {
    const w = await world("private");
    const editor = (await socket(w, EDITOR)).client!;
    // An editor cannot change roles, and a role that is not one is refused: neither touches the room.
    expect(
      (await w.ask(EDITOR, "PATCH", w.url(`/members/${VIEWER}`), { role: "editor" })).status,
    ).toBe(403);
    expect(
      (await w.ask(OWNER, "PATCH", w.url(`/members/${VIEWER}`), { role: "owner" })).status,
    ).toBe(400);
    expect((await w.ask(OWNER, "DELETE", w.url(`/members/${STRANGER}`))).status).toBe(404);
    expect(editor.closed).toBeUndefined();
  });
});

describe("the Origin rule on what a member changes", () => {
  it("refuses a change made with a member's cookie from another page, before the route runs", async () => {
    const w = await world("private");
    const { cookie } = await w.h.signedIn({ sub: EDITOR });
    for (const [method, rest, body] of [
      ["PUT", "/files", { files: { "x.md": "x" } }],
      ["POST", "/versions", {}],
      ["POST", "/duplicate", {}],
      ["DELETE", "/members/me", undefined],
    ] as const) {
      const response = await w.h.request(w.url(rest), {
        method,
        headers: {
          Cookie: cookie,
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect([response.status, await codeOf(response)], `${method} ${rest}`).toEqual([
        403,
        "request.forbidden",
      ]);
    }
    expect((await w.h.rooms.read(w.id)).files["x.md"]).toBeUndefined();
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
  });

  it("is not needed by a token, which a browser never adds by itself", async () => {
    const w = await world("private");
    const { token } = await addToken(w.h.store, { sub: EDITOR });
    const response = await w.h.request(w.url("/files"), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "cli.md": "x" } }),
    });
    expect(response.status).toBe(200);
  });
});

describe("a token and the invitation it was not made for", () => {
  it("is the same cookie-or-token principal for accepting an invitation: a token holder joins and then reads", async () => {
    const w = await world("private");
    const invitation = await w.invite("someone@example.com", "viewer");
    const { token } = await addToken(w.h.store, { sub: STRANGER });
    const response = await w.h.request(
      `/api/invitations/${tokenOf(invitation.link)}/accept`,
      bearer(token, { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(await w.h.store.memberRole(w.id, STRANGER)).toBe("viewer");
    expect(emailOf(STRANGER)).not.toBe("someone@example.com");
  });
});
