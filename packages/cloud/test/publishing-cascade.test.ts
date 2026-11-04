// The cascade of a deleted account, for what sharing and publishing keep (`project-sharing`, "The
// cascade"; `publishing`: a publication goes with the account that made it): a signed `user.deleted`
// event removes the person's memberships, the invitations they made or that address their verified
// email, their publications (the objects in the bucket and the rows, so that the publish host
// answers 404) and their projects, and leaves everything of other people. Task 1.3 tested the rows
// (sharing.test.ts, the store's conformance suite); this file goes through the routes that make a
// publication and through the publish host that serves it, the way a person meets them, and adds
// what only the objects and the order of the steps can show.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishedKey } from "../src/keys.js";
import { publishHost } from "../src/publish.js";
import { jsonOf } from "./support/index.js";
import { HOUR } from "./support/projects.js";
import {
  EDITOR,
  NOBODY,
  OWNER,
  STRANGER,
  VIEWER,
  emailOf,
  world,
  type World,
} from "./support/sharing.js";

const JSON_TYPE = { "Content-Type": "application/json" };
const HOST = "meltemi.page";
const ADMIN = "u-admin";

afterEach(() => {
  vi.restoreAllMocks();
});

const sign = (body: string, secret: string): string =>
  `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Delivers `user.deleted` for `sub` as the identity service does: signed, with no cookie and no `Origin`. */
function deleteAccount(w: World, sub: string, id = "evt_1", at = "2999-01-01T00:00:00.000Z") {
  const body = JSON.stringify({ id, type: "user.deleted", sub, at });
  return w.h.request("/_identity/events", {
    method: "POST",
    headers: { ...JSON_TYPE, "Meltemi-Signature": sign(body, w.h.env.IDENTITY_EVENTS_SECRET) },
    body,
  });
}

/** What the publish host answers for an address, with the world's bucket and store. */
const visit = (w: World, path: string) =>
  publishHost(new Request(`https://${HOST}${path}`), { BLOBS: w.h.blobs }, { store: w.h.store });

async function choose(w: World, handle: string, who: string): Promise<void> {
  expect((await w.ask(who, "PATCH", "/api/account", { handle })).status).toBe(200);
}

async function publish(w: World, who: string, project: string, slug: string, html: string) {
  const response = await w.ask(who, "PUT", w.url("/publish", project), { slug, html });
  expect(response.status, `${who} publishes ${slug}`).toBe(200);
}

/** The projects the person's list shows. */
const listed = async (w: World, who: string): Promise<string[]> =>
  (
    await jsonOf<{ projects: { id: string }[] }>(await w.ask(who, "GET", "/api/projects"))
  ).projects.map((project) => project.id);

/**
 * `OWNER` with two projects: the shared one of the world (a member editor and viewer, a pending
 * invitation, a link that views, two publications) and a second with one; and `STRANGER`, who
 * publishes the same slug under a handle of their own, in a project of their own.
 */
async function published() {
  const w = await world("view", { env: { PUBLISH_HOST: HOST, ADMIN_SUBS: ADMIN } });
  const second = await w.create(OWNER, { name: "Second", files: { "b.md": "second\n" } });
  const strangers = await w.create(STRANGER, { name: "Stranger's", files: { "c.md": "c\n" } });
  await w.invite("pending@example.com", "viewer");
  await choose(w, "ana", OWNER);
  await choose(w, "sam", STRANGER);
  await publish(w, OWNER, w.id, "purchase", "<p>Ana's purchase</p>");
  await publish(w, OWNER, w.id, "plan", "<p>Ana's plan</p>");
  await publish(w, OWNER, second, "notes", "<p>Ana's notes</p>");
  await publish(w, STRANGER, strangers, "purchase", "<p>Sam's purchase</p>");
  return { w, second, strangers };
}

describe("deleting the owner of shared and published projects", () => {
  it("removes every publication of theirs, the objects and the rows, so that the publish host answers 404, and leaves other people's with the same slug", async () => {
    const { w } = await published();
    for (const path of ["/ana/purchase/", "/ana/plan/", "/ana/notes/", "/sam/purchase/"]) {
      expect((await visit(w, path)).status, path).toBe(200);
    }

    const response = await deleteAccount(w, OWNER);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ status: "applied" });
    for (const slug of ["purchase", "plan", "notes"]) {
      expect(w.h.blobs.objects.has(publishedKey("ana", slug)), slug).toBe(false);
      expect(await w.h.store.publication("ana", slug), slug).toBeUndefined();
      expect((await visit(w, `/ana/${slug}/`)).status, slug).toBe(404);
    }
    // Another person's, under another handle, is as it was, with its page.
    expect((await visit(w, "/sam/purchase/")).status).toBe(200);
    expect(await (await visit(w, "/sam/purchase/")).text()).toBe("<p>Sam's purchase</p>");
    expect(w.h.blobs.objects.has(publishedKey("sam", "purchase"))).toBe(true);
  });

  it("removes their projects with the members, the invitations and the link, and the members' lists forget them", async () => {
    const { w, second, strangers } = await published();
    await w.join(STRANGER, "viewer", second);
    expect(await listed(w, EDITOR)).toEqual([w.id]);
    expect(await listed(w, STRANGER)).toContain(second);

    await deleteAccount(w, OWNER);

    for (const id of [w.id, second]) {
      expect(await w.h.store.projectById(id), id).toBeUndefined();
      expect(await w.h.store.members(id), id).toEqual([]);
      expect(await w.h.store.pendingInvitations(id, w.h.clock.now().toISOString()), id).toEqual([]);
      expect(await w.h.store.publicationsOf(id), id).toEqual([]);
    }
    expect(await listed(w, EDITOR)).toEqual([]);
    expect(await listed(w, VIEWER)).toEqual([]);
    // The stranger's own project and the membership they had in the owner's are different things.
    expect(await listed(w, STRANGER)).toEqual([strangers]);
    // The link that viewed is no link: the project was never there for anyone who holds it.
    expect((await w.ask(NOBODY, "GET", w.url("/files"))).status).toBe(404);
    expect((await w.ask(NOBODY, "GET", w.url("", second))).status).toBe(404);
  });

  it("frees the handle: another person takes it and publishes at the very address, and serves their own page", async () => {
    const { w } = await published();
    await deleteAccount(w, OWNER);
    const mine = await w.create(VIEWER, { name: "Viewer's", files: { "d.md": "d\n" } });

    await choose(w, "ana", VIEWER);
    await publish(w, VIEWER, mine, "purchase", "<p>The new Ana</p>");

    expect(await (await visit(w, "/ana/purchase/")).text()).toBe("<p>The new Ana</p>");
    expect((await visit(w, "/ana/plan/")).status).toBe(404);
  });

  it("keeps the service's record of a takedown, and does not show it to whoever takes the handle later", async () => {
    const { w } = await published();
    w.h.clock.advance(HOUR);
    expect(
      (await w.ask(ADMIN, "DELETE", "/api/admin/publications/ana/purchase", { reason: "spam" }))
        .status,
    ).toBe(204);
    await deleteAccount(w, OWNER);
    w.h.clock.advance(HOUR);
    expect(await w.h.store.takedownsOf("ana")).toHaveLength(1);

    const mine = await w.create(VIEWER, { name: "Viewer's", files: { "d.md": "d\n" } });
    await choose(w, "ana", VIEWER);
    await publish(w, VIEWER, mine, "purchase", "<p>The new Ana</p>");
    const dialog = await jsonOf<{ takedowns: unknown[]; publications: unknown[] }>(
      await w.ask(VIEWER, "GET", w.url("/publish", mine)),
    );

    // The record is the service's, kept; the new owner of the handle is not shown another's takedown.
    expect(await w.h.store.takedownsOf("ana")).toHaveLength(1);
    expect(dialog.takedowns).toEqual([]);
    expect(dialog.publications).toHaveLength(1);
  });

  it("removes what the rows name before the rows, so that a bucket that refuses leaves the person, and a second delivery finishes", async () => {
    const { w } = await published();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The published pages refuse to go; nothing else in the bucket does.
    w.h.blobs.refuse = (op, key) => op === "delete" && key.startsWith("published/");

    const failed = await deleteAccount(w, OWNER);

    expect(failed.status).toBe(500);
    // Not applied: the identity service will try again, and what was published is still served.
    expect(await w.h.store.user(OWNER)).toBeDefined();
    expect(await w.h.store.publicationsOwnedBy(OWNER)).toHaveLength(3);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);

    w.h.blobs.refuse = undefined;
    const retried = await deleteAccount(w, OWNER);

    expect(await jsonOf(retried)).toEqual({ status: "applied" });
    expect(await w.h.store.publicationsOwnedBy(OWNER)).toEqual([]);
    for (const slug of ["purchase", "plan", "notes"]) {
      expect(w.h.blobs.objects.has(publishedKey("ana", slug)), slug).toBe(false);
      expect((await visit(w, `/ana/${slug}/`)).status, slug).toBe(404);
    }
  });

  it("leaves nothing of the owner's in the bucket that a row names: no object under published/ but another person's", async () => {
    const { w } = await published();
    await deleteAccount(w, OWNER);
    const left = [...w.h.blobs.keys()].filter((key) => key.startsWith("published/"));
    expect(left).toEqual([publishedKey("sam", "purchase")]);
  });

  it("does not let a late repeat of the event touch what the person published after signing in again", async () => {
    const { w } = await published();
    const at = w.h.clock.now().toISOString();
    await deleteAccount(w, OWNER, "evt_1", at);
    w.h.clock.advance(HOUR);
    // The same person (the same sub) signs in again, later, makes a project and publishes it.
    const back = await w.create(OWNER, { name: "Back", files: { "e.md": "e\n" } });
    await choose(w, "ana-again", OWNER);
    await publish(w, OWNER, back, "page", "<p>Back again</p>");

    const repeat = await deleteAccount(w, OWNER, "evt_1", at);

    expect(await jsonOf(repeat)).toEqual({ status: "duplicate" });
    expect(await w.h.store.publication("ana-again", "page")).toBeDefined();
    expect(await (await visit(w, "/ana-again/page/")).text()).toBe("<p>Back again</p>");
    expect(await w.h.store.projectById(back)).toBeDefined();
  });
});

describe("deleting a member, or someone who only held a link", () => {
  it("removes the membership and leaves the project with its publications, which the publish host still serves", async () => {
    const { w } = await published();
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");

    expect((await deleteAccount(w, EDITOR)).status).toBe(200);

    expect(await w.h.store.memberRole(w.id, EDITOR)).toBeUndefined();
    expect(await w.h.store.projectById(w.id)).toBeDefined();
    expect(await w.h.store.publicationsOf(w.id)).toHaveLength(2);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    expect(await w.h.store.listProjects(EDITOR)).toEqual([]);
    expect((await w.ask(OWNER, "GET", w.url("/files"))).status).toBe(200);
  });

  it("removes a member's own publications and projects, and no one else's", async () => {
    const { w } = await published();
    const mine = await w.create(VIEWER, { name: "Viewer's", files: { "d.md": "d\n" } });
    await choose(w, "vee", VIEWER);
    await publish(w, VIEWER, mine, "page", "<p>Vee's page</p>");
    expect((await visit(w, "/vee/page/")).status).toBe(200);

    await deleteAccount(w, VIEWER);

    expect((await visit(w, "/vee/page/")).status).toBe(404);
    expect(w.h.blobs.objects.has(publishedKey("vee", "page"))).toBe(false);
    expect(await w.h.store.projectById(mine)).toBeUndefined();
    // The shared project, of which they were a member, and its publications are as they were.
    expect(await w.h.store.projectById(w.id)).toBeDefined();
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
  });

  it("removes the invitations that address the deleted person's verified email, and the others stay", async () => {
    const { w } = await published();
    await w.invite(emailOf(STRANGER), "editor");
    const pending = async () =>
      (await w.h.store.pendingInvitations(w.id, w.h.clock.now().toISOString())).map((i) => i.email);
    expect(await pending()).toEqual(["pending@example.com", emailOf(STRANGER)]);

    await deleteAccount(w, STRANGER);

    expect(await pending()).toEqual(["pending@example.com"]);
  });

  it("cuts the open sockets of a deleted member in the project of another person, and nobody else's", async () => {
    const { w } = await published();
    const room = w.h.rooms.room(w.id);
    const editor = await room.open({ sub: EDITOR, role: "editor" });
    const viewer = await room.open({ sub: VIEWER, role: "viewer" });
    const owner = await room.open({ sub: OWNER, role: "owner" });

    expect((await deleteAccount(w, EDITOR)).status).toBe(200);

    // The page reconnects on this close, and is refused at the upgrade: the membership is gone.
    expect(editor.closed).toEqual({ code: 4000, reason: "disconnected" });
    expect(viewer.closed).toBeUndefined();
    expect(owner.closed).toBeUndefined();
  });

  it("cuts a page that reconnected between the first cut and the event", async () => {
    const { w } = await published();
    const room = w.h.rooms.room(w.id);
    let late: Awaited<ReturnType<typeof room.open>> | undefined;
    const apply = w.h.store.applyUserDeleted.bind(w.h.store);
    vi.spyOn(w.h.store, "applyUserDeleted").mockImplementation(async (...args) => {
      // The page of the member reconnects while the event is applied: the member and the session
      // are still valid until the rows go.
      late = await room.open({ sub: EDITOR, role: "editor" });
      return apply(...args);
    });

    expect((await deleteAccount(w, EDITOR)).status).toBe(200);

    expect(late?.closed).toEqual({ code: 4000, reason: "disconnected" });
  });

  it("is answered 500 when a shared room cannot be reached, and the delivery that follows cuts the socket", async () => {
    const { w } = await published();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const editor = await w.h.rooms.room(w.id).open({ sub: EDITOR, role: "editor" });
    const disconnect = vi.spyOn(w.h.rooms, "disconnect");
    disconnect.mockRejectedValueOnce(new Error("the Durable Object is unreachable"));

    const failed = await deleteAccount(w, EDITOR);

    expect(failed.status).toBe(500);
    // Not applied: the membership is here, so the identity service delivers the event again.
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBe("editor");
    expect(editor.closed).toBeUndefined();

    expect((await deleteAccount(w, EDITOR)).status).toBe(200);
    expect(editor.closed).toEqual({ code: 4000, reason: "disconnected" });
    expect(await w.h.store.memberRole(w.id, EDITOR)).toBeUndefined();
  });
});

describe("deleting a project through the API", () => {
  it("removes its publications, objects and rows, and only that project's", async () => {
    const { w, second } = await published();

    expect((await w.ask(OWNER, "DELETE", w.url("", w.id))).status).toBe(204);

    for (const slug of ["purchase", "plan"]) {
      expect((await visit(w, `/ana/${slug}/`)).status, slug).toBe(404);
      expect(w.h.blobs.objects.has(publishedKey("ana", slug)), slug).toBe(false);
    }
    // The owner's other project keeps its page, and their handle is still locked by it.
    expect((await visit(w, "/ana/notes/")).status).toBe(200);
    expect(await w.h.store.publicationsOf(second)).toHaveLength(1);
    const locked = await w.ask(OWNER, "PATCH", "/api/account", { handle: "other" });
    expect(locked.status).toBe(409);
  });

  it("unlocks the handle when the last published project goes", async () => {
    const { w, second } = await published();
    await w.ask(OWNER, "DELETE", w.url("", w.id));
    await w.ask(OWNER, "DELETE", w.url("", second));

    expect((await w.ask(OWNER, "PATCH", "/api/account", { handle: "other" })).status).toBe(200);
  });

  it("starts the rate of a project over with a new project: the old project's requests went with it", async () => {
    const { w } = await published();
    const fresh = await w.create(OWNER, { name: "Fresh", files: { "f.md": "f\n" } });
    for (let n = 0; n < 10; n++) await publish(w, OWNER, fresh, "page", `<p>${n}</p>`);
    expect(
      (await w.ask(OWNER, "PUT", w.url("/publish", fresh), { slug: "page", html: "<p>x</p>" }))
        .status,
    ).toBe(429);
    await w.ask(OWNER, "DELETE", w.url("", fresh));
    const again = await w.create(OWNER, { name: "Again", files: { "g.md": "g\n" } });

    await publish(w, OWNER, again, "page", "<p>again</p>");
  });
});
