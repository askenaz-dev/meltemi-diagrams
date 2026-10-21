// Deleting the account deletes its projects (`cloud-projects`, "Deleting the account deletes its
// projects"; the Worker's half of task 2.6's cascade): a signed `user.deleted` event destroys the
// rooms and the thumbnails the rows cannot name, then removes the rows, through the events route with
// the in-memory store, rooms and bucket.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bytes } from "../src/crypto.js";
import { thumbnailKey } from "../src/keys.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { serveTemplates } from "./support/templates.js";

const T = "2026-10-14T12:00:00.000Z";
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";
const JSON_TYPE = { "Content-Type": "application/json" };

afterEach(() => {
  vi.restoreAllMocks();
});

interface Person {
  readonly sub: string;
  readonly cookie: string;
}

const sign = (body: string, secret: string): string =>
  `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Posts an event as the identity service does: no cookie, no `Origin`, signed. */
function deliver(
  h: Harness,
  fields: Record<string, unknown> = {},
  signature?: string,
): Promise<Response> {
  const body = JSON.stringify({
    id: "evt_1",
    type: "user.deleted",
    sub: "u-ana",
    at: T,
    ...fields,
  });
  return h.request("/_identity/events", {
    method: "POST",
    headers: {
      ...JSON_TYPE,
      "Meltemi-Signature": signature ?? sign(body, h.env.IDENTITY_EVENTS_SECRET),
    },
    body,
  });
}

/** A person who has been here (so their row exists). */
async function somebody(h: Harness, sub: string): Promise<Person> {
  const { cookie } = await h.signedIn({ sub, name: `Name of ${sub}` });
  await h.request("/api/session", { headers: { Cookie: cookie } });
  return { sub, cookie };
}

async function createProject(
  h: Harness,
  who: Person,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await h.request(
    "/api/projects",
    h.fromPage(who.cookie, { method: "POST", headers: JSON_TYPE, body: JSON.stringify(body) }),
  );
  expect(response.status).toBe(201);
  return (await jsonOf<{ id: string }>(response)).id;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function upload(h: Harness, who: Person, id: string, path: string, body: Bytes) {
  const response = await h.request(
    `/api/projects/${id}/binaries/${path}`,
    h.fromPage(who.cookie, { method: "PUT", body }),
  );
  expect(response.status).toBe(200);
  return (await jsonOf<{ hash: string }>(response)).hash;
}

/** Ana with three projects (one with an image, a version, a thumbnail and a client in its room) and Beto with one. */
async function world() {
  const h = await harness();
  serveTemplates(h);
  const ana = await somebody(h, "u-ana");
  const beto = await somebody(h, "u-beto");
  const flow = await createProject(h, ana, { name: "Flow", template: "flow" });
  const notes = await createProject(h, ana, {
    name: "Notes",
    files: { "a.meltemi": "ana only\n", "shared.md": "the same text\n" },
  });
  const empty = await createProject(h, ana, { name: "Empty" });
  const logo = await upload(h, ana, notes, "img/logo.png", PNG);
  const betos = await createProject(h, beto, {
    name: "Beto's",
    files: { "shared.md": "the same text\n", "own.md": "beto only\n" },
  });
  // The same image: Beto's own upload of the same bytes.
  await upload(h, beto, betos, "img/same.png", PNG);

  const ids = [flow, notes, empty];
  for (const id of ids) {
    await h.rooms.materialise(id);
    h.blobs.objects.set(thumbnailKey(id), new TextEncoder().encode("<svg/>"));
    await h.store.setThumbnailAt(id, T);
  }
  await h.store.createVersion(
    { projectId: notes, label: "v1", auto: false, createdBy: "u-ana", createdAt: T },
    { maxVersions: 200 },
  );
  const client = await h.rooms.room(notes).open({ sub: "u-ana" });
  return { h, ana, beto, ids, flow, notes, empty, betos, logo, client };
}

describe("a user.deleted event", () => {
  it("deletes the person's three projects with their rows, versions, thumbnails and rooms", async () => {
    const { h, ids, client } = await world();
    expect(await h.store.projectIdsOf("u-ana")).toHaveLength(3);

    const response = await deliver(h);

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(await h.store.projectIdsOf("u-ana")).toEqual([]);
    expect(await h.store.user("u-ana")).toBeUndefined();
    for (const id of ids) {
      expect(await h.store.project("u-ana", id), id).toBeUndefined();
      expect((await h.store.projectFiles(id)).size, id).toBe(0);
      expect(await h.store.projectBlobs(id), id).toEqual([]);
      expect(await h.store.listVersions(id), id).toEqual([]);
      expect(h.blobs.objects.has(thumbnailKey(id)), id).toBe(false);
      // The room's storage was destroyed: asked again it is empty.
      expect(h.rooms.room(id).storage.destroyed, id).toBe(1);
      expect(await h.rooms.read(id), id).toMatchObject({ revision: 0, files: {}, binaries: {} });
    }
    // The client that was connected was told and closed.
    expect(client.errors).toEqual(["project.not-found"]);
    expect(client.closed?.code).toBe(4404);
  });

  it("leaves another person's projects, rooms and thumbnails alone", async () => {
    const { h, betos } = await world();
    h.blobs.objects.set(thumbnailKey(betos), new TextEncoder().encode("<svg/>"));
    const before = await h.rooms.read(betos);
    const usage = await h.store.usage("u-beto");

    await deliver(h);

    expect(await h.rooms.read(betos)).toEqual(before);
    expect(h.rooms.room(betos).storage.destroyed).toBe(0);
    expect(h.blobs.objects.has(thumbnailKey(betos))).toBe(true);
    expect(await h.store.project("u-beto", betos)).toBeDefined();
    expect((await h.store.projectFiles(betos)).size).toBeGreaterThan(0);
    expect(await h.store.usage("u-beto")).toEqual(usage);
  });

  it("keeps the blobs for the collection, and a blob another account references survives it", async () => {
    const { h, logo, notes, betos } = await world();
    // The text both hold, the text only Ana holds; the image both uploaded.
    const sharedHash = (await h.store.projectFiles(betos)).get("shared.md") ?? "";
    const anaOnlyHash = (await h.store.projectFiles(notes)).get("a.meltemi") ?? "";
    expect(sharedHash).not.toBe("");
    expect(anaOnlyHash).not.toBe("");
    expect((await h.store.projectFiles(notes)).get("shared.md")).toBe(sharedHash);

    await deliver(h);

    // No blob row was removed by the event: only the collection removes them.
    for (const hash of [logo, sharedHash, anaOnlyHash])
      expect(await h.store.blob(hash), hash).toBeDefined();
    // What nothing references now is for the collection: Ana's own text, not the text Beto holds,
    // and not the image he uploaded too.
    const unreferenced = await h.store.unreferencedBlobs(FAR_FUTURE, 1000);
    expect(unreferenced).toContain(anaOnlyHash);
    expect(unreferenced).not.toContain(sharedHash);
    expect(unreferenced).not.toContain(logo);
    // The collection's primitive takes the unreferenced ones and leaves the shared ones.
    const removed = await h.store.deleteBlobs([...unreferenced, sharedHash, logo], FAR_FUTURE);
    expect(removed).toContain(anaOnlyHash);
    expect(removed).not.toContain(sharedHash);
    expect(removed).not.toContain(logo);
    expect(await h.store.blob(sharedHash)).toBeDefined();
    expect(await h.store.blob(logo)).toBeDefined();
    expect(await h.store.blob(anaOnlyHash)).toBeUndefined();
  });

  it("is answered 200 only after the data is gone: a bucket that refuses leaves the event unhandled, and the delivery that follows finishes it", async () => {
    const { h, ids } = await world();
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.blobs.refuse = (op) => op === "delete";

    const failed = await deliver(h);

    expect(failed.status).toBe(500);
    // Not applied: the person is still here, so the identity service tries again.
    expect(await h.store.user("u-ana")).toBeDefined();
    expect(await h.store.projectIdsOf("u-ana")).toHaveLength(3);

    h.blobs.refuse = undefined;
    const retried = await deliver(h);

    expect(await jsonOf(retried)).toEqual({ status: "applied" });
    expect(await h.store.projectIdsOf("u-ana")).toEqual([]);
    for (const id of ids) expect(h.blobs.objects.has(thumbnailKey(id)), id).toBe(false);
  });

  it("is answered 500 when a room cannot be destroyed, and nothing is removed", async () => {
    const { h } = await world();
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.rooms.destroy = async () => {
      throw new Error("the Durable Object is unreachable");
    };

    const response = await deliver(h);

    expect(response.status).toBe(500);
    expect(await h.store.user("u-ana")).toBeDefined();
    expect(await h.store.projectIdsOf("u-ana")).toHaveLength(3);
  });

  it("changes nothing for a repeat of the same event", async () => {
    const { h, betos } = await world();
    await deliver(h);
    const destroys = vi.spyOn(h.rooms, "destroy");

    const again = await deliver(h);

    expect(await jsonOf(again)).toEqual({ status: "duplicate" });
    expect(destroys).not.toHaveBeenCalled();
    expect(await h.store.project("u-beto", betos)).toBeDefined();
  });

  it("does not let a late repeat touch what the person made after signing in again", async () => {
    const { h } = await world();
    await deliver(h);
    h.clock.advance(60 * 60 * 1000);
    // The same person (same `sub`) signs in again, later, and makes a project.
    const again = await somebody(h, "u-ana");
    const fresh = await createProject(h, again, {
      name: "Back again",
      files: { "a.md": "new life\n" },
    });

    const repeat = await deliver(h);

    expect(await jsonOf(repeat)).toEqual({ status: "duplicate" });
    expect(await h.store.project("u-ana", fresh)).toBeDefined();
    expect((await h.rooms.read(fresh)).files).toEqual({ "a.md": "new life\n" });
    expect(h.rooms.room(fresh).storage.destroyed).toBe(0);
  });

  it("destroys nothing for an event that is not signed, or that is not a deletion", async () => {
    const { h } = await world();
    const destroys = vi.spyOn(h.rooms, "destroy");
    const deletes = vi.spyOn(h.blobs, "delete");

    const unsigned = await deliver(h, {}, "v1=" + "0".repeat(64));
    const other = await deliver(h, { type: "user.updated" });

    expect(unsigned.status).toBe(401);
    expect(await jsonOf(other)).toEqual({ status: "ignored" });
    expect(destroys).not.toHaveBeenCalled();
    expect(deletes).not.toHaveBeenCalled();
    expect(await h.store.projectIdsOf("u-ana")).toHaveLength(3);
  });

  it("handles a person with no project, and a sub nobody knows", async () => {
    const { h } = await world();
    const destroys = vi.spyOn(h.rooms, "destroy");

    const response = await deliver(h, { id: "evt_2", sub: "u-nobody" });

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(destroys).not.toHaveBeenCalled();
  });
});

describe("a caller let in before a deletion is complete", () => {
  /** Makes the first delete in the bucket also try to write the project, as a stale token would. */
  function writeWhileDeleting(h: Harness, projectId: string): { outcome: () => string } {
    const real = h.blobs.delete.bind(h.blobs);
    let outcome = "no write was tried";
    let tried = false;
    vi.spyOn(h.blobs, "delete").mockImplementation(async (key) => {
      if (!tried) {
        tried = true;
        outcome = await h.rooms.push(projectId, { files: { "late.md": "late" } }).then(
          () => "written",
          (error: { code?: string }) => error.code ?? "failed",
        );
      }
      return real(key);
    });
    return { outcome: () => outcome };
  }

  it("cannot write the project again after the account's rooms were destroyed", async () => {
    const { h, ids } = await world();
    const late = writeWhileDeleting(h, ids[0] as string);

    expect((await deliver(h)).status).toBe(200);

    expect(late.outcome()).toBe("project.not-found");
    // The storage the event emptied is empty: nothing names a room that was written after it.
    expect(await h.rooms.read(ids[0] as string)).toMatchObject({ revision: 0, files: {} });
  });

  it("cannot write the project again after DELETE /api/projects/:id destroyed its room", async () => {
    const { h, ana, notes } = await world();
    const late = writeWhileDeleting(h, notes);

    const response = await h.request(
      `/api/projects/${notes}`,
      h.fromPage(ana.cookie, { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect(late.outcome()).toBe("project.not-found");
    expect(await h.rooms.read(notes)).toMatchObject({ revision: 0, files: {} });
  });
});
