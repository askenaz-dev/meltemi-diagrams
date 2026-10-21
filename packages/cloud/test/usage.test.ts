// What an account holds (`cloud-projects`, "Usage and storage quota"; task 2.6): `GET
// /api/account/usage` through the handler, over both stores. Bytes are the distinct blobs the
// account's projects, uploads and versions reference, so a blob two projects share counts once, and a
// write that would take the account over 200 MiB is `413 quota.storage`.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { describe, expect, it } from "vitest";
import { d1Store } from "../src/store/d1.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore } from "../src/store/types.js";
import { jsonOf } from "./support/index.js";
import { MIB, T, codeOf, pngBytes, projects, sha } from "./support/projects.js";
import { openDatabase, sqliteAvailable } from "./support/sqlite.js";
import { addToken, bearer } from "./support/who.js";

const ANA = "u-ana";
const BETO = "u-beto";

interface UsageBody {
  projects: number;
  storageBytes: number;
  limits: Record<string, number>;
}

const stores: [string, () => CloudStore][] = [["the in-memory store", () => memoryStore()]];
if (sqliteAvailable) stores.push(["d1Store", () => d1Store(openDatabase())]);

describe.each(stores)("GET /api/account/usage over %s", (_name, makeStore) => {
  async function setup() {
    const p = await projects({ store: makeStore() });
    const usage = async (sub = ANA): Promise<UsageBody> => {
      const response = await p.send(sub, "GET", "/api/account/usage");
      expect(response.status).toBe(200);
      return jsonOf<UsageBody>(response);
    };
    const upload = (id: string, path: string, body: Uint8Array<ArrayBuffer>, sub = ANA) =>
      p.send(sub, "PUT", `/api/projects/${id}/binaries/${path}`, body);
    return { ...p, usage, upload };
  }

  it("answers nothing to nobody", async () => {
    const { h } = await setup();

    const response = await h.request("/api/account/usage");

    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe("auth.required");
  });

  it("answers zero projects and bytes to a new account, with the limits as an object of numbers", async () => {
    const { send } = await setup();

    const response = await send(ANA, "GET", "/api/account/usage");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    const body = await jsonOf<UsageBody>(response);
    expect(body).toEqual({
      projects: 0,
      storageBytes: 0,
      limits: {
        projects: 100,
        storageBytes: 200 * MIB,
        files: 2000,
        documentBytes: 16 * MIB,
        binaryBytes: 10 * MIB,
        versions: 200,
      },
    });
    // The limits are the ones the Worker enforces, whatever they become.
    expect(body.limits).toMatchObject({
      projects: CLOUD_LIMITS.projects,
      storageBytes: CLOUD_LIMITS.storageBytes,
      files: CLOUD_LIMITS.files,
      versions: CLOUD_LIMITS.versions,
    });
    for (const value of Object.values(body.limits)) expect(Number.isSafeInteger(value)).toBe(true);
  });

  it("counts the person's projects and the bytes of what they reference, and nobody else's", async () => {
    const { create, usage } = await setup();
    await create(ANA, { name: "One", files: { "a.md": "12345\n" } });
    await create(ANA, { name: "Two", files: { "b.md": "abc\n" } });
    await create(BETO, { name: "Beto's", files: { "c.md": "a text of Beto's, of some length\n" } });

    expect(await usage(ANA)).toMatchObject({ projects: 2, storageBytes: 6 + 4 });
    expect(await usage(BETO)).toMatchObject({
      projects: 1,
      storageBytes: Buffer.byteLength("a text of Beto's, of some length\n"),
    });
  });

  it("counts bytes that two projects of one account share once", async () => {
    const { create, usage, upload } = await setup();
    const one = await create(ANA, { name: "One", files: { "a.md": "same text\n" } });
    const two = await create(ANA, { name: "Two", files: { "b.md": "same text\n" } });
    const png = pngBytes("the same picture in both");
    expect((await upload(one, "img/a.png", png)).status).toBe(200);
    expect((await upload(two, "img/b.png", png)).status).toBe(200);

    const body = await usage();

    // The text once, the picture once.
    expect(body.storageBytes).toBe(Buffer.byteLength("same text\n") + png.length);
    expect(body.projects).toBe(2);
  });

  it("counts the same bytes in two accounts for each of them", async () => {
    const { create, usage } = await setup();
    await create(ANA, { name: "Ana's", files: { "a.md": "shared by two accounts\n" } });
    await create(BETO, { name: "Beto's", files: { "a.md": "shared by two accounts\n" } });

    const bytes = Buffer.byteLength("shared by two accounts\n");
    expect((await usage(ANA)).storageBytes).toBe(bytes);
    expect((await usage(BETO)).storageBytes).toBe(bytes);
  });

  it("follows an upload, a deletion of the image, and the deletion of the project", async () => {
    const { create, usage, upload, send } = await setup();
    const id = await create(ANA, { name: "P", files: { "a.md": "text\n" } });
    const png = pngBytes("a picture of some size");

    await upload(id, "img/p.png", png);
    expect((await usage()).storageBytes).toBe(Buffer.byteLength("text\n") + png.length);
    await send(ANA, "DELETE", `/api/projects/${id}/binaries/img/p.png`);
    expect((await usage()).storageBytes).toBe(Buffer.byteLength("text\n"));
    await send(ANA, "DELETE", `/api/projects/${id}`);
    expect(await usage()).toMatchObject({ projects: 0, storageBytes: 0 });
  });

  it("keeps counting what a version holds after the project dropped it", async () => {
    const { create, usage, send, sendJson, h } = await setup();
    const id = await create(ANA, {
      name: "P",
      files: { "keep.md": "kept\n", "drop.md": "dropped\n" },
    });
    expect(
      (await sendJson(ANA, "POST", `/api/projects/${id}/versions`, { label: "both" })).status,
    ).toBe(201);

    await h.rooms.push(id, { files: { "drop.md": null } });
    await h.rooms.materialise(id);

    expect((await usage()).storageBytes).toBe(Buffer.byteLength("kept\ndropped\n"));
    expect((await send(ANA, "GET", `/api/projects/${id}/versions/1`)).status).toBe(200);
  });

  it("answers 413 quota.storage for a 2 MiB image at 199 MiB, stores nothing, and takes one that fits", async () => {
    const { h, create, usage, upload } = await setup();
    const id = await create(ANA, { name: "Big" });
    await h.store.addBlobs([{ hash: "e".repeat(64), size: 199 * MIB, mediaType: "image/png" }], T);
    await h.store.addProjectBlob(id, "e".repeat(64));
    await h.store.refreshStorageBytes(ANA);
    expect((await usage()).storageBytes).toBe(199 * MIB);
    const big = new Uint8Array(2 * MIB);
    big.set(pngBytes());

    const refused = await upload(id, "big.png", big);

    expect(refused.status).toBe(413);
    expect(await codeOf(refused)).toBe("quota.storage");
    expect(h.blobs.keys().filter((key) => key.startsWith("blobs/"))).toEqual([]);
    expect(await h.store.projectBlobs(id)).toEqual(["e".repeat(64)]);
    expect((await usage()).storageBytes).toBe(199 * MIB);
    // A picture of 1 MiB brings the account to exactly 200 MiB, which is allowed.
    const fits = new Uint8Array(MIB);
    fits.set(pngBytes());
    expect((await upload(id, "fits.png", fits)).status).toBe(200);
    expect((await usage()).storageBytes).toBe(200 * MIB);
    expect(sha(fits)).toHaveLength(64);
  });

  it("takes a bearer token, which the command line holds", async () => {
    const { h, create } = await setup();
    await create(ANA, { name: "One", files: { "a.md": "x\n" } });
    const { token } = await addToken(h.store, { sub: ANA });

    const response = await h.request("/api/account/usage", bearer(token));

    expect(response.status).toBe(200);
    expect(await jsonOf<UsageBody>(response)).toMatchObject({ projects: 1, storageBytes: 2 });
  });

  it("is a GET and nothing else", async () => {
    const { h, send } = await setup();
    const { cookie } = await h.signedIn({ sub: ANA });

    expect((await send(ANA, "POST", "/api/account/usage")).status).toBe(404);
    expect((await send(ANA, "DELETE", "/api/account/usage")).status).toBe(404);
    const forged = await h.request("/api/account/usage", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    });
    expect(forged.status).toBe(404);
  });
});
