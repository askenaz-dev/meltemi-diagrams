// The project routes over `d1Store` on the real migration (`node:sqlite`), with the in-memory rooms
// and bucket: the same requests as the in-memory tests, so that what only SQL can get wrong (the
// atomic quota, the batches of a materialisation, the usage sums, the copies and the cascade) is
// exercised from the handler down to the tables.

import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { d1Store } from "../src/store/d1.js";
import { harness, jsonOf } from "./support/index.js";
import { serveTemplates, builtTemplate } from "./support/templates.js";
import { openDatabase, sqliteAvailable, type SqliteDb } from "./support/sqlite.js";

const JSON_TYPE = { "Content-Type": "application/json" };
const T = "2026-10-14T12:00:00.000Z";
const MIB = 1024 * 1024;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sha = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

const count = (db: SqliteDb, table: string, where = "1 = 1", ...values: string[]): number =>
  Number(
    (
      db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...values) as {
        n: number;
      }
    ).n,
  );

async function setup() {
  const db = openDatabase();
  const h = await harness({ store: d1Store(db) });
  serveTemplates(h);
  const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
  const beto = await h.signedIn({ sub: "u-beto", name: "Beto" });
  const send = (
    who: { cookie: string },
    method: string,
    path: string,
    body?: BodyInit,
    headers = {},
  ) =>
    h.request(
      path,
      h.fromPage(who.cookie, { method, ...(body === undefined ? {} : { body, headers }) }),
    );
  const create = async (
    who: { cookie: string },
    body: Record<string, unknown>,
  ): Promise<string> => {
    const response = await send(who, "POST", "/api/projects", JSON.stringify(body), JSON_TYPE);
    expect(response.status, await response.clone().text()).toBe(201);
    return (await jsonOf<{ id: string }>(response)).id;
  };
  return { db, h, ana, beto, send, create };
}

describe.skipIf(!sqliteAvailable)("the project routes over d1Store", () => {
  it("creates from the purchase template, writing its files and blobs and the person's usage as rows", async () => {
    const { db, h, ana, create } = await setup();

    const id = await create(ana, { name: "Purchase", template: "purchase" });

    const template = builtTemplate("purchase");
    expect(count(db, "project_files", "project_id = ?", id)).toBe(
      Object.keys(template.files).length,
    );
    const distinct = new Set(Object.values(template.files).map((text) => sha(text)));
    expect(count(db, "blobs")).toBe(distinct.size);
    expect(h.blobs.keys()).toHaveLength(distinct.size);
    const bytes = Object.values(template.files).reduce(
      (sum, text) => sum + Buffer.byteLength(text),
      0,
    );
    expect((await h.store.usage("u-ana")).storageBytes).toBe(bytes);
    expect((await h.store.project("u-ana", id))?.revision).toBe(1);
  });

  it("answers 413 quota.projects for the 101st, the limit being one statement of the database", async () => {
    const { db, h, ana, send } = await setup();
    for (let i = 1; i <= 100; i++) {
      const made = await h.store.createProject(
        {
          id: `p${String(i).padStart(19, "0")}`,
          ownerSub: "u-ana",
          name: `P${i}`,
          description: "",
          createdAt: T,
        },
        100,
      );
      expect(made).toBe("created");
    }

    const response = await send(
      ana,
      "POST",
      "/api/projects",
      JSON.stringify({ name: "x" }),
      JSON_TYPE,
    );

    expect(response.status).toBe(413);
    expect((await jsonOf<{ code: string }>(response)).code).toBe("quota.projects");
    expect(count(db, "projects", "owner_sub = ?", "u-ana")).toBe(100);
  });

  it("uploads, serves, duplicates and deletes images, counting shared bytes once", async () => {
    const { db, h, ana, send, create } = await setup();
    const one = await create(ana, { name: "One", files: { "a.md": "a\n" } });
    const two = await create(ana, { name: "Two", files: { "b.md": "b\n" } });
    const hash = sha(PNG);

    for (const [id, path] of [
      [one, "img/a.png"],
      [two, "img/b.png"],
    ] as const) {
      const response = await send(ana, "PUT", `/api/projects/${id}/binaries/${path}`, PNG);
      expect(response.status).toBe(200);
      expect(await jsonOf(response)).toEqual({ hash });
    }
    // The same bytes in two projects: one blob, counted once, and the row of the usage says so.
    expect(count(db, "blobs", "hash = ?", hash)).toBe(1);
    expect(count(db, "project_blobs", "hash = ?", hash)).toBe(2);
    expect((await h.store.usage("u-ana")).storageBytes).toBe(2 + 2 + PNG.length);
    const served = await h.request(`/api/projects/${one}/blobs/${hash}`, {
      headers: { Cookie: ana.cookie },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

    const copy = (
      await jsonOf<{ id: string }>(await send(ana, "POST", `/api/projects/${one}/duplicate`))
    ).id;
    expect(count(db, "project_blobs", "project_id = ?", copy)).toBe(1);
    expect(count(db, "project_files", "project_id = ?", copy)).toBe(2);
    expect((await h.rooms.read(copy)).binaries).toEqual({ "img/a.png": hash });
    // Still the same bytes: the copy shares every blob.
    expect(await h.store.storageBytesOf("u-ana")).toBe(2 + 2 + PNG.length);

    expect((await send(ana, "DELETE", `/api/projects/${copy}/binaries/img/a.png`)).status).toBe(
      204,
    );
    expect(count(db, "project_blobs", "project_id = ?", copy)).toBe(0);
    expect((await send(ana, "DELETE", `/api/projects/${copy}`)).status).toBe(204);
    for (const table of ["projects", "project_files", "project_blobs", "versions"]) {
      expect(
        count(db, table, table === "projects" ? "id = ?" : "project_id = ?", copy),
        table,
      ).toBe(0);
    }
    expect(count(db, "project_blobs", "project_id = ?", one)).toBe(1);
  });

  it("refuses an upload over the storage quota from the database's own sums", async () => {
    const { db, h, ana, send, create } = await setup();
    const id = await create(ana, { name: "Big" });
    await h.store.addBlobs([{ hash: "e".repeat(64), size: 199 * MIB, mediaType: "image/png" }], T);
    await h.store.addProjectBlob(id, "e".repeat(64));
    const big = new Uint8Array(2 * MIB);
    big.set(PNG);

    const response = await send(ana, "PUT", `/api/projects/${id}/binaries/big.png`, big);

    expect(response.status).toBe(413);
    expect((await jsonOf<{ code: string }>(response)).code).toBe("quota.storage");
    expect(count(db, "blobs")).toBe(1);
    expect(CLOUD_LIMITS.storageBytes).toBe(200 * MIB);
    // 200 MiB exactly is fine.
    const fits = new Uint8Array(MIB);
    fits.set(PNG);
    expect((await send(ana, "PUT", `/api/projects/${id}/binaries/fits.png`, fits)).status).toBe(
      200,
    );
    expect((await h.store.usage("u-ana")).storageBytes).toBe(200 * MIB);
  });

  it("deletes an account's projects through the signed event and leaves another account's alone", async () => {
    const { db, h, ana, beto, send, create } = await setup();
    const mine = [
      await create(ana, { name: "A1", template: "flow" }),
      await create(ana, { name: "A2", files: { "shared.md": "same\n", "a.meltemi": "mine\n" } }),
      await create(ana, { name: "A3" }),
    ];
    await send(ana, "PUT", `/api/projects/${mine[1]}/binaries/p.png`, PNG);
    const theirs = await create(beto, { name: "B1", files: { "shared.md": "same\n" } });
    await send(beto, "PUT", `/api/projects/${theirs}/binaries/p.png`, PNG);
    const body = JSON.stringify({ id: "evt_1", type: "user.deleted", sub: "u-ana", at: T });

    const response = await h.request("/_identity/events", {
      method: "POST",
      headers: {
        ...JSON_TYPE,
        "Meltemi-Signature": `v1=${createHmac("sha256", h.env.IDENTITY_EVENTS_SECRET).update(body).digest("hex")}`,
      },
      body,
    });

    expect(await jsonOf(response)).toEqual({ status: "applied" });
    expect(count(db, "projects", "owner_sub = ?", "u-ana")).toBe(0);
    for (const id of mine) {
      expect(count(db, "project_files", "project_id = ?", id), id).toBe(0);
      expect(count(db, "project_blobs", "project_id = ?", id), id).toBe(0);
      expect(h.rooms.room(id).storage.destroyed, id).toBe(1);
    }
    expect(count(db, "users", "sub = ?", "u-ana")).toBe(0);
    // Beto's project, its room and the blobs he shares survive; the collection takes only Ana's own.
    expect(count(db, "projects", "owner_sub = ?", "u-beto")).toBe(1);
    expect((await h.rooms.read(theirs)).binaries).toEqual({ "p.png": sha(PNG) });
    const orphans = await h.store.unreferencedBlobs("2999-01-01T00:00:00.000Z", 100);
    expect(orphans).toContain(sha("mine\n"));
    expect(orphans).not.toContain(sha("same\n"));
    expect(orphans).not.toContain(sha(PNG));
  });
});
