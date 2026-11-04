// Images and fonts by hash (`cloud-projects`, "Images and fonts by hash" and "Usage and storage
// quota"; task 2.4): upload, delete and the sandboxed blob answers, through the handler with the
// in-memory store, the in-memory rooms and a bucket in memory.

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import type { Bytes } from "../src/crypto.js";
import { blobKey } from "../src/keys.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { addToken, bearer } from "./support/who.js";

const JSON_TYPE = { "Content-Type": "application/json" };
const T = "2026-10-14T12:00:00.000Z";
const MIB = 1024 * 1024;

afterEach(() => {
  vi.restoreAllMocks();
});

const sha = (content: Uint8Array | string): string =>
  createHash("sha256").update(content).digest("hex");

const bytes = (...values: (number | string)[]): Bytes =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "number" ? [value] : [...value].map((c) => c.charCodeAt(0)),
    ),
  );

/** A PNG's signature and then `tail`: all the type check reads. */
const png = (tail = "a picture"): Bytes => bytes(0x89, "PNG\r\n", 0x1a, "\n", `IHDR ${tail}`);
const woff2 = (): Bytes => bytes("wOF2", 0, 1, 0, 0, "a font");
const svg = (inner = "<circle r='1'/>"): Bytes =>
  new Uint8Array(
    new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`),
  );

interface Who {
  readonly cookie: string;
  readonly sub: string;
}

async function setup(options: Parameters<typeof harness>[0] = {}) {
  const h = await harness(options);
  const ana = await h.signedIn({ sub: "u-ana", name: "Ana" });
  const beto = await h.signedIn({ sub: "u-beto", name: "Beto" });
  // The people exist once they have asked for anything (that is when their row is made).
  await h.request("/api/session", { headers: { Cookie: ana.cookie } });
  await h.request("/api/session", { headers: { Cookie: beto.cookie } });
  const mine = await project(h, "u-ana", "ana00000000000000001");
  const other = await project(h, "u-ana", "ana00000000000000002");
  const betos = await project(h, "u-beto", "beto0000000000000001");
  return { h, ana, beto, mine, other, betos };
}

async function project(h: Harness, owner: string, id: string): Promise<string> {
  const made = await h.store.createProject(
    { id, ownerSub: owner, name: id, description: "", createdAt: T },
    100,
  );
  expect(made).toBe("created");
  return id;
}

/** The address of a project's binary: each segment encoded, the slashes kept. */
const at = (id: string, path: string): string =>
  `/api/projects/${id}/binaries/${path.split("/").map(encodeURIComponent).join("/")}`;

function put(
  h: Harness,
  who: Who,
  id: string,
  path: string,
  body: Bytes,
  type = "application/octet-stream",
): Promise<Response> {
  return h.request(
    at(id, path),
    h.fromPage(who.cookie, { method: "PUT", headers: { "Content-Type": type }, body }),
  );
}

const blobOf = (
  h: Harness,
  who: Who,
  id: string,
  hash: string,
  method = "GET",
): Promise<Response> =>
  h.request(`/api/projects/${id}/blobs/${hash}`, { method, headers: { Cookie: who.cookie } });

async function code(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}

/** What is held for an account: the bytes the store counts, and what is in R2. */
async function nothingStored(h: Harness, id: string): Promise<void> {
  expect(h.blobs.keys().filter((key) => key.startsWith("blobs/"))).toEqual([]);
  expect(await h.store.projectBlobs(id)).toEqual([]);
  expect(await h.rooms.read(id)).toMatchObject({ revision: 0, binaries: {} });
}

// ---------------------------------------------------------------------------------------------

describe("PUT /api/projects/:id/binaries/<path>", () => {
  it("stores the bytes by their SHA-256 and answers the hash; the bytes come back sandboxed and immutable", async () => {
    const { h, ana, mine } = await setup();
    const content = png();

    const response = await put(h, ana, mine, "assets/logo.png", content, "image/png");

    expect(response.status).toBe(200);
    const hash = sha(content);
    expect(await jsonOf(response)).toEqual({ hash });
    // R2 first, then the rows: the bytes, the blob row, the project's row, the room's entry.
    expect(h.blobs.objects.get(`blobs/${hash}`)).toEqual(content);
    expect(await h.store.blob(hash)).toMatchObject({
      hash,
      size: content.length,
      mediaType: "image/png",
    });
    expect(await h.store.projectBlobs(mine)).toEqual([hash]);
    expect((await h.rooms.read(mine)).binaries).toEqual({ "assets/logo.png": hash });
    expect((await h.store.usage("u-ana")).storageBytes).toBe(content.length);

    const get = await blobOf(h, ana, mine, hash);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(content);
    const expected: Record<string, string> = {
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${hash}"`,
      "Content-Type": "image/png",
      "Content-Length": String(content.length),
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(get.headers.get(name), name).toBe(value);
    }
    const head = await blobOf(h, ana, mine, hash, "HEAD");
    expect(head.status).toBe(200);
    for (const [name, value] of Object.entries(expected)) {
      expect(head.headers.get(name), `HEAD ${name}`).toBe(value);
    }
    expect(await head.text()).toBe("");
  });

  it("does not hold up the file in the room: the path and the hash are one entry the room keeps", async () => {
    const { h, ana, mine } = await setup();
    const client = await h.rooms.room(mine).open({ sub: "u-ana" });

    await put(h, ana, mine, "assets/logo.png", png());

    // The room's own clients see it as any other change, and it is a single transaction.
    expect((await h.rooms.read(mine)).revision).toBe(1);
    expect(client.of(1).length).toBeGreaterThan(0);
    // And it is materialised, with the files, like every path.
    await h.rooms.advance(30_000);
    for (let tries = 0; tries < 500 && (await h.store.projectFiles(mine)).size === 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect([...(await h.store.projectFiles(mine))]).toEqual([["assets/logo.png", sha(png())]]);
  });

  it.each([
    ["a PNG", "a.png", png(), "image/png"],
    ["a JPEG", "a.jpg", bytes(0xff, 0xd8, 0xff, 0xe0, "JFIF"), "image/jpeg"],
    ["a GIF", "a.gif", bytes("GIF89a", 1, 0, 1, 0), "image/gif"],
    ["a WebP", "a.webp", bytes("RIFF", 4, 0, 0, 0, "WEBPVP8 "), "image/webp"],
    ["a woff2 font", "fonts/title.woff2", woff2(), "font/woff2"],
    ["a TrueType font", "fonts/title.ttf", bytes(0, 1, 0, 0, "glyphs"), "font/ttf"],
    ["an OpenType font", "fonts/title.otf", bytes("OTTO", "glyphs"), "font/otf"],
    ["an SVG", "a.svg", svg(), "image/svg+xml"],
  ])(
    "types %s from its bytes: the blob's media type is %s",
    async (_label, path, content, type) => {
      const { h, ana, mine } = await setup();

      const response = await put(h, ana, mine, path, content);

      expect(response.status).toBe(200);
      const hash = sha(content);
      expect((await h.store.blob(hash))?.mediaType).toBe(type);
      expect((await h.rooms.read(mine)).binaries).toEqual({ [path]: hash });
      expect((await blobOf(h, ana, mine, hash)).headers.get("Content-Type")).toBe(type);
    },
  );

  it("puts the font at its path in the room: fonts/title.woff2 is a file of the project", async () => {
    const { h, ana, mine } = await setup();

    await put(h, ana, mine, "fonts/title.woff2", woff2(), "font/woff2");

    const room = await h.rooms.read(mine);
    expect(Object.keys(room.binaries)).toEqual(["fonts/title.woff2"]);
    expect((await h.store.blob(sha(woff2())))?.mediaType).toBe("font/woff2");
  });

  it("takes the type from the bytes and never from Content-Type", async () => {
    const { h, ana, mine } = await setup();

    // A PNG that says it is a page, and an SVG that says it is a PNG: both are what their bytes are.
    expect((await put(h, ana, mine, "a.png", png(), "text/html")).status).toBe(200);
    expect((await put(h, ana, mine, "b.svg", svg(), "image/png")).status).toBe(200);

    expect((await h.store.blob(sha(png())))?.mediaType).toBe("image/png");
    expect((await h.store.blob(sha(svg())))?.mediaType).toBe("image/svg+xml");
  });

  it("refuses a text/html body that claims image/png with 400 binary.invalid and stores nothing", async () => {
    const { h, ana, mine } = await setup();
    const page = new TextEncoder().encode("<!doctype html><title>not an image</title>");

    const response = await put(h, ana, mine, "assets/logo.png", page, "image/png");

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("binary.invalid");
    await nothingStored(h, mine);
  });

  it.each([
    ["nothing", new Uint8Array(0)],
    ["random bytes", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])],
    ["a PDF", bytes("%PDF-1.7 ...")],
    ["a woff (version 1) font", bytes("wOFF", 0, 1, 0, 0)],
    ["a script claiming to be an image", new TextEncoder().encode("alert(document.cookie)")],
    ["an HTML page with an svg in it", new TextEncoder().encode("<html><svg/></html>")],
    ["a broken SVG", new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><g></svg>")],
    [
      "an SVG that declares an entity",
      new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY a "b">]><svg/>'),
    ],
  ])(
    "refuses %s with 400 binary.invalid, whatever Content-Type claims",
    async (_label, content) => {
      const { h, ana, mine } = await setup();
      for (const type of ["image/png", "image/svg+xml", "font/woff2", "application/octet-stream"]) {
        const response = await put(h, ana, mine, "assets/logo.png", content, type);
        expect(response.status, type).toBe(400);
        expect(await code(response), type).toBe("binary.invalid");
      }
      await nothingStored(h, mine);
    },
  );

  it("accepts an SVG that holds a script: it is only ever served sandboxed", async () => {
    const { h, ana, mine } = await setup();
    const evil = svg("<script>fetch('/api/session').then(r => r.text()).then(alert)</script>");

    const response = await put(h, ana, mine, "evil.svg", evil, "image/svg+xml");

    expect(response.status).toBe(200);
    const hash = (await jsonOf<{ hash: string }>(response)).hash;
    const served = await blobOf(h, ana, mine, hash);
    expect(served.headers.get("Content-Type")).toBe("image/svg+xml");
    // Nothing in the answer lets it run top-level: no execution, no reading of the page's origin.
    expect(served.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(served.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(served.headers.get("Content-Disposition")).toBe(`attachment; filename="${hash}"`);
    expect(new TextDecoder().decode(await served.arrayBuffer())).toContain("<script>");
  });

  it("refuses a body of 11 MiB with 413 quota.binary and stores nothing; 10 MiB exactly is accepted", async () => {
    const { h, ana, mine } = await setup();
    const big = new Uint8Array(11 * MIB);
    big.set(png());

    const refused = await put(h, ana, mine, "big.png", big, "image/png");

    expect(refused.status).toBe(413);
    expect(await code(refused)).toBe("quota.binary");
    await nothingStored(h, mine);

    const exact = new Uint8Array(CLOUD_LIMITS.binaryBytes);
    exact.set(png());
    expect(CLOUD_LIMITS.binaryBytes).toBe(10 * MIB);
    expect((await put(h, ana, mine, "exact.png", exact, "image/png")).status).toBe(200);
    const over = new Uint8Array(CLOUD_LIMITS.binaryBytes + 1);
    over.set(png());
    expect((await put(h, ana, mine, "over.png", over, "image/png")).status).toBe(413);
    expect(await h.store.projectBlobs(mine)).toEqual([sha(exact)]);
  });

  it("does not read a body past the cap, however long it is or says it is", async () => {
    const { h, ana, mine } = await setup();
    // A body that never ends, 64 KiB at a time.
    const state = { pulled: 0, released: false };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulled += 1;
        controller.enqueue(new Uint8Array(64 * 1024).fill(97));
      },
      cancel() {
        state.released = true;
      },
    });

    const endless = await h.request(
      at(mine, "a.png"),
      h.fromPage(ana.cookie, { method: "PUT", body: stream, duplex: "half" } as RequestInit),
    );

    expect(endless.status).toBe(413);
    expect(state.pulled * 64 * 1024).toBeLessThanOrEqual(CLOUD_LIMITS.binaryBytes + 3 * 64 * 1024);
    expect(state.released).toBe(true);
    // One that says so, which is refused unread.
    const declared = await h.request(
      at(mine, "a.png"),
      h.fromPage(ana.cookie, {
        method: "PUT",
        headers: { "Content-Length": String(CLOUD_LIMITS.binaryBytes + 1) },
        body: png(),
      }),
    );
    expect(declared.status).toBe(413);
    await nothingStored(h, mine);
  });

  it.each([
    ["a parent segment", "a/../b.png"],
    ["a leading parent segment", "../b.png"],
    ["a hidden file", ".hidden.png"],
    ["a hidden folder", ".git/hooks/post-checkout"],
    ["a backslash", "a\\b.png"],
    ["a colon", "c:b.png"],
    ["a control character", "a\u0001b.png"],
    ["an empty segment", "a//b.png"],
    ["a dot segment", "a/./b.png"],
    ["a trailing slash", "a/b.png/"],
    ["a leading slash", "/b.png"],
    ["a segment of 101 characters", `${"x".repeat(101)}.png`],
    ["thirteen segments", `${"d/".repeat(12)}b.png`],
  ])(
    "refuses a path with %s with 400 path.invalid, before reading the body",
    async (_label, path) => {
      const { h, ana, mine } = await setup();
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(png());
          controller.close();
        },
      });
      // The address as a client builds it, every character encoded, so that a `..` or a `//` that
      // the URL parser would resolve stays a name.
      const encoded = `/api/projects/${mine}/binaries/${encodeURIComponent(path)}`;

      const response = await h.request(
        encoded,
        h.fromPage(ana.cookie, { method: "PUT", body: stream, duplex: "half" } as RequestInit),
      );

      expect(response.status, path).toBe(400);
      expect(await code(response), path).toBe("path.invalid");
      // The route never took a reader on the body: it was not read at all.
      expect(stream.locked).toBe(false);
      await nothingStored(h, mine);
    },
  );

  it("refuses a path with a literal '//' in the address, which the router passes on whole", async () => {
    const { h, ana, mine } = await setup();

    const response = await h.request(
      `/api/projects/${mine}/binaries/a//b.png`,
      h.fromPage(ana.cookie, { method: "PUT", body: png() }),
    );

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("path.invalid");
  });

  it("replaces what is at the path: another file under the same path keeps one entry", async () => {
    const { h, ana, mine } = await setup();
    await put(h, ana, mine, "a.png", png("first"));

    await put(h, ana, mine, "a.png", png("second"));

    expect((await h.rooms.read(mine)).binaries).toEqual({ "a.png": sha(png("second")) });
    // The first is no longer the project's: its row went, and it no longer counts in the usage.
    expect(await h.store.projectBlobs(mine)).toEqual([sha(png("second"))]);
    expect(await h.store.storageBytesOf("u-ana")).toBe(png("second").length);
    expect((await h.store.usage("u-ana")).storageBytes).toBe(png("second").length);
  });

  it("keeps the hash it replaces while another file of the project still has it, and serves it to a version that holds it", async () => {
    const { h, ana, mine } = await setup();
    const first = sha(png("first"));
    await put(h, ana, mine, "a.png", png("first"));
    await put(h, ana, mine, "copy.png", png("first"));
    await h.rooms.materialise(mine);
    await h.store.createVersion(
      { projectId: mine, label: "v1", auto: false, createdBy: "u-ana", createdAt: T },
      { maxVersions: 200 },
    );

    await put(h, ana, mine, "a.png", png("second"));
    // Another entry names the first bytes: the project keeps them.
    expect(await h.store.projectBlobs(mine)).toEqual([first, sha(png("second"))].sort());

    await put(h, ana, mine, "copy.png", png("third"));
    // Nothing names them now, and a version does: they are served from the version.
    expect(await h.store.projectBlobs(mine)).toEqual(
      [sha(png("second")), sha(png("third"))].sort(),
    );
    expect((await blobOf(h, ana, mine, first)).status).toBe(200);
  });

  it("does not fill the quota with the versions of one image that is saved again and again", async () => {
    const { h, ana, mine } = await setup();
    const size = 9 * MIB;
    for (let n = 0; n < 30; n++) {
      const content = new Uint8Array(size);
      content.set(png(`edit ${n}`));
      const response = await put(h, ana, mine, "hero.png", content);
      expect(response.status, `save ${n}`).toBe(200);
    }

    expect(await h.store.storageBytesOf("u-ana")).toBe(size);
    expect(await h.store.projectBlobs(mine)).toHaveLength(1);
  });

  it("is repeatable: the same bytes at the same path change nothing and make no second blob", async () => {
    const { h, ana, mine } = await setup();
    await put(h, ana, mine, "a.png", png());
    const revision = (await h.rooms.read(mine)).revision;
    h.blobs.calls.length = 0;

    const again = await put(h, ana, mine, "a.png", png());

    expect(again.status).toBe(200);
    expect((await h.rooms.read(mine)).revision).toBe(revision);
    expect(await h.store.projectBlobs(mine)).toEqual([sha(png())]);
  });

  it("turns a text file's path into a binary: the room keeps one file at the path", async () => {
    const { h, ana, mine } = await setup();
    await h.rooms.push(mine, { files: { "logo.svg": "<svg/>" } });

    await put(h, ana, mine, "logo.svg", svg());

    const room = await h.rooms.read(mine);
    expect(room.files).toEqual({});
    expect(room.binaries).toEqual({ "logo.svg": sha(svg()) });
  });

  it("takes the room's refusal as its own and leaves no row for bytes the project did not hold", async () => {
    const { h, ana, mine } = await setup({ roomLimits: { files: 1 } });
    await h.rooms.push(mine, { files: { "a.md": "x" } });

    const response = await put(h, ana, mine, "b.png", png());

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("quota.files");
    expect(await h.store.projectBlobs(mine)).toEqual([]);
    expect((await h.rooms.read(mine)).binaries).toEqual({});
    // The bytes are in R2 and the blob row exists: they wait for the collection like any blob.
    expect(await h.store.blob(sha(png()))).toBeDefined();
  });

  it("keeps the row of bytes the project held before when the room refuses a second path", async () => {
    const { h, ana, mine } = await setup({ roomLimits: { files: 1 } });
    expect((await put(h, ana, mine, "a.png", png())).status).toBe(200);

    const response = await put(h, ana, mine, "b.png", png());

    expect(response.status).toBe(413);
    expect(await h.store.projectBlobs(mine)).toEqual([sha(png())]);
    expect((await h.rooms.read(mine)).binaries).toEqual({ "a.png": sha(png()) });
  });

  it("writes R2 before any row, and writes no row when R2 refuses", async () => {
    const { h, ana, mine } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.blobs.refuse = (op) => op === "put";

    const response = await put(h, ana, mine, "a.png", png());

    expect(response.status).toBe(500);
    expect(await code(response)).toBe("internal");
    expect(await h.store.blob(sha(png()))).toBeUndefined();
    await nothingStored(h, mine);
  });
});

describe("the storage quota", () => {
  /** Makes the account hold `bytes` more, as one blob of its first project. */
  async function holdBytes(h: Harness, id: string, hash: string, size: number): Promise<void> {
    await h.store.addBlobs([{ hash, size, mediaType: "image/png" }], T);
    await h.store.addProjectBlob(id, hash);
  }

  it("refuses an upload that would take the account over 200 MiB with 413 quota.storage, and stores nothing", async () => {
    const { h, ana, mine, other } = await setup();
    await holdBytes(h, mine, "e".repeat(64), 199 * MIB);
    const content = new Uint8Array(2 * MIB);
    content.set(png());

    const response = await put(h, ana, other, "big.png", content, "image/png");

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("quota.storage");
    expect(h.blobs.keys()).toEqual([]);
    expect(await h.store.blob(sha(content))).toBeUndefined();
    expect(await h.store.projectBlobs(other)).toEqual([]);
    expect(await h.store.storageBytesOf("u-ana")).toBe(199 * MIB);
  });

  it("lets an upload reach 200 MiB exactly, and refuses one byte more", async () => {
    const { h, ana, mine, other } = await setup();
    await holdBytes(h, mine, "e".repeat(64), 198 * MIB);
    const fits = new Uint8Array(2 * MIB);
    fits.set(png());

    expect((await put(h, ana, other, "fits.png", fits)).status).toBe(200);
    expect(await h.store.storageBytesOf("u-ana")).toBe(200 * MIB);
    expect((await h.store.usage("u-ana")).storageBytes).toBe(200 * MIB);

    const one = png("one more byte");
    const refused = await put(h, ana, other, "more.png", one);
    expect(refused.status).toBe(413);
    expect(await code(refused)).toBe("quota.storage");
  });

  it("does not count bytes the account already references again: an image in two projects is one cost", async () => {
    const { h, ana, mine, other } = await setup();
    const content = png();
    await put(h, ana, mine, "a.png", content);
    await put(h, ana, other, "b.png", content);

    expect(await h.store.storageBytesOf("u-ana")).toBe(content.length);
    expect((await h.store.usage("u-ana")).storageBytes).toBe(content.length);
    expect(await h.store.projectBlobs(mine)).toEqual([sha(content)]);
    expect(await h.store.projectBlobs(other)).toEqual([sha(content)]);
  });

  it("lets an account at its limit upload bytes it already holds, and refuses new ones", async () => {
    const { h, ana, mine, other } = await setup();
    const content = new Uint8Array(MIB);
    content.set(png());
    await holdBytes(h, mine, "e".repeat(64), 199 * MIB);
    expect((await put(h, ana, mine, "a.png", content)).status).toBe(200);
    expect(await h.store.storageBytesOf("u-ana")).toBe(200 * MIB);

    // The same bytes again, into the other project: no growth, so it is let through.
    expect((await put(h, ana, other, "b.png", content)).status).toBe(200);
    expect(await h.store.storageBytesOf("u-ana")).toBe(200 * MIB);
    // Bytes that are new would grow it.
    const fresh = new Uint8Array(MIB);
    fresh.set(png("fresh"));
    expect((await put(h, ana, other, "c.png", fresh)).status).toBe(413);
  });

  it("counts a blob that another account holds as new to this one", async () => {
    const { h, ana, beto, mine, betos } = await setup();
    const content = new Uint8Array(MIB);
    content.set(png());
    expect((await put(h, beto, betos, "a.png", content)).status).toBe(200);
    await holdBytes(h, mine, "e".repeat(64), 199 * MIB + 1);

    // The bytes exist, but not for Ana: her account would grow by a mebibyte.
    const response = await put(h, ana, mine, "a.png", content);

    expect(response.status).toBe(413);
    expect(await code(response)).toBe("quota.storage");
    // Beto's own account is far from the limit.
    expect((await h.store.usage("u-beto")).storageBytes).toBe(MIB);
  });

  it("holds under uploads that run together: the account never ends over 200 MiB", async () => {
    const { h, ana, mine, other } = await setup();
    await holdBytes(h, mine, "e".repeat(64), 190 * MIB);
    // Every upload passes the early check, which reads before anything is written: hold them all in R2.
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const store = h.blobs.put.bind(h.blobs);
    let arrived = 0;
    vi.spyOn(h.blobs, "put").mockImplementation(async (key, value) => {
      arrived++;
      await gate;
      return store(key, value);
    });
    const uploads = [0, 1, 2, 3, 4].map((n) => {
      const content = new Uint8Array(4 * MIB);
      content.set(png(`parallel ${n}`));
      return put(h, ana, n % 2 === 0 ? mine : other, `p${n}.png`, content);
    });
    // Signing and hashing are real asynchronous work: wait until every upload is at the bucket.
    for (let n = 0; n < 400 && arrived < uploads.length; n++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(arrived).toBe(uploads.length);
    release();

    const statuses = (await Promise.all(uploads)).map((response) => response.status);

    expect(await h.store.storageBytesOf("u-ana")).toBeLessThanOrEqual(CLOUD_LIMITS.storageBytes);
    expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(2);
    expect(statuses.every((status) => status === 200 || status === 413)).toBe(true);
    // What was refused left no row behind: the usage is exactly what the accepted ones hold.
    expect(await h.store.storageBytesOf("u-ana")).toBe(
      190 * MIB + 4 * MIB * statuses.filter((status) => status === 200).length,
    );
  });

  it("is not about the size of one file: the account's total decides", async () => {
    const { h, ana, mine, other } = await setup();
    await holdBytes(h, mine, "e".repeat(64), CLOUD_LIMITS.storageBytes - 30);

    const small = await put(h, ana, other, "small.png", png("1"));
    expect(small.status).toBe(200);
    // The account is within a few bytes of the limit now.
    const second = await put(h, ana, other, "second.png", png("a second one, a little longer"));
    expect(second.status).toBe(413);
  });
});

describe("DELETE /api/projects/:id/binaries/<path>", () => {
  it("removes the entry from the room and the hash from project_blobs, and the bytes are no longer served", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;

    const response = await h.request(
      at(mine, "a.png"),
      h.fromPage(ana.cookie, { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await h.rooms.read(mine)).binaries).toEqual({});
    expect(await h.store.projectBlobs(mine)).toEqual([]);
    expect((await blobOf(h, ana, mine, hash)).status).toBe(404);
    expect((await blobOf(h, ana, mine, hash, "HEAD")).status).toBe(404);
    // The person's usage follows; the bytes wait for the collection.
    expect((await h.store.usage("u-ana")).storageBytes).toBe(0);
    expect(h.blobs.objects.has(`blobs/${hash}`)).toBe(true);
  });

  it("keeps the hash while another file of the project uses the same bytes", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    await put(h, ana, mine, "copy/a.png", png());

    await h.request(at(mine, "a.png"), h.fromPage(ana.cookie, { method: "DELETE" }));

    expect((await h.rooms.read(mine)).binaries).toEqual({ "copy/a.png": hash });
    expect(await h.store.projectBlobs(mine)).toEqual([hash]);
    expect((await blobOf(h, ana, mine, hash)).status).toBe(200);
    // The last one takes it.
    await h.request(at(mine, "copy/a.png"), h.fromPage(ana.cookie, { method: "DELETE" }));
    expect(await h.store.projectBlobs(mine)).toEqual([]);
  });

  it("still serves the bytes to a project whose version holds them", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    await h.rooms.materialise(mine);
    await h.store.createVersion(
      { projectId: mine, label: "v1", auto: false, createdBy: "u-ana", createdAt: T },
      { maxVersions: 200 },
    );

    await h.request(at(mine, "a.png"), h.fromPage(ana.cookie, { method: "DELETE" }));

    expect(await h.store.projectBlobs(mine)).toEqual([]);
    expect((await blobOf(h, ana, mine, hash)).status).toBe(200);
  });

  it("keeps the hash a collaborator's upload of the same bytes set at another path while the delete was running", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    const real = h.rooms.push.bind(h.rooms);
    let first = true;
    vi.spyOn(h.rooms, "push").mockImplementation(async (id, body) => {
      if (first) {
        // The upload of the same bytes to another path, from another editor, lands between the
        // delete's read of the room and its push: the project still held the hash, so it is let in.
        first = false;
        await real(id, { binaries: { "b.png": hash } });
      }
      return real(id, body);
    });

    const response = await h.request(
      at(mine, "a.png"),
      h.fromPage(ana.cookie, { method: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect((await h.rooms.read(mine)).binaries).toEqual({ "b.png": hash });
    // The live entry has the row its bytes and its next push need.
    expect(await h.store.projectBlobs(mine)).toEqual([hash]);
    expect((await blobOf(h, ana, mine, hash)).status).toBe(200);
  });

  it("answers 404 not-found for a path with no image or font, a text file's included", async () => {
    const { h, ana, mine } = await setup();
    await h.rooms.push(mine, { files: { "notes.md": "x" } });

    for (const path of ["nothing.png", "notes.md"]) {
      const response = await h.request(
        at(mine, path),
        h.fromPage(ana.cookie, { method: "DELETE" }),
      );
      expect(response.status, path).toBe(404);
      expect(await code(response), path).toBe("not-found");
    }
    expect((await h.rooms.read(mine)).files).toEqual({ "notes.md": "x" });
  });

  it("treats a file called __proto__ as a file: uploaded and deleted by its own key, and not there is not Object.prototype", async () => {
    const { h, ana, mine } = await setup();
    const remove = () =>
      h.request(at(mine, "__proto__"), h.fromPage(ana.cookie, { method: "DELETE" }));

    expect((await remove()).status).toBe(404);
    expect((await put(h, ana, mine, "__proto__", png())).status).toBe(200);
    expect(Object.keys((await h.rooms.read(mine)).binaries)).toEqual(["__proto__"]);
    expect((await remove()).status).toBe(204);
    expect((await h.rooms.read(mine)).binaries).toEqual({});
    expect(await h.store.projectBlobs(mine)).toEqual([]);
  });

  it("refuses a path that breaks the path rule", async () => {
    const { h, ana, mine } = await setup();

    const response = await h.request(
      `/api/projects/${mine}/binaries/${encodeURIComponent("../a.png")}`,
      h.fromPage(ana.cookie, { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
    expect(await code(response)).toBe("path.invalid");
  });
});

describe("GET and HEAD /api/projects/:id/blobs/<hash>", () => {
  it("answers 404 for a hash another project uploaded and this one never did, whoever owns both", async () => {
    const { h, ana, mine, other } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;

    for (const method of ["GET", "HEAD"]) {
      const response = await blobOf(h, ana, other, hash, method);
      expect(response.status, method).toBe(404);
    }
    const body = await blobOf(h, ana, other, hash);
    expect(await code(body)).toBe("not-found");
    expect(body.headers.get("Cache-Control")).toBe("no-store");
    expect((await blobOf(h, ana, mine, hash)).status).toBe(200);
  });

  it("answers 404 for the bytes of a live file that no upload and no version holds: the live map is never consulted", async () => {
    const { h, ana, mine } = await setup();
    await h.rooms.push(mine, { files: { "a.md": "live text" } });
    await h.rooms.materialise(mine);
    const hash = sha("live text");
    expect([...(await h.store.projectFiles(mine)).values()]).toEqual([hash]);

    expect((await blobOf(h, ana, mine, hash)).status).toBe(404);
  });

  it("serves a text file's bytes once a version holds them, as plain text", async () => {
    const { h, ana, mine } = await setup();
    await h.rooms.push(mine, { files: { "a.md": "live text" } });
    await h.rooms.materialise(mine);
    await h.store.createVersion(
      { projectId: mine, label: null, auto: false, createdBy: "u-ana", createdAt: T },
      { maxVersions: 200 },
    );

    const response = await blobOf(h, ana, mine, sha("live text"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("live text");
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
  });

  it("answers 404 to Beto for Ana's project, with project.not-found, and not even the hash is confirmed", async () => {
    const { h, ana, beto, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;

    for (const method of ["GET", "HEAD"]) {
      const response = await blobOf(h, beto, mine, hash, method);
      expect(response.status, method).toBe(404);
    }
    expect(await code(await blobOf(h, beto, mine, hash))).toBe("project.not-found");
    // Ana's other project, and a project that does not exist, are no different.
    expect(await code(await blobOf(h, beto, mine, "f".repeat(64)))).toBe("project.not-found");
  });

  it.each([
    ["a short hash", "abc"],
    ["an upper-case hash", "A".repeat(64)],
    ["a hash with a non-hex character", `${"a".repeat(63)}g`],
    ["a hash that is too long", "a".repeat(65)],
    ["a path segment", "..%2Fx"],
  ])("answers 404 for %s", async (_label, hash) => {
    const { h, ana, mine } = await setup();

    for (const method of ["GET", "HEAD"]) {
      const response = await h.request(`/api/projects/${mine}/blobs/${hash}`, {
        method,
        headers: { Cookie: ana.cookie },
      });
      expect(response.status, method).toBe(404);
    }
  });

  it("serves the type the blob's row holds when it is one it knows, and plain bytes for any other", async () => {
    const { h, ana, mine } = await setup();
    const known = "1".repeat(64);
    const odd = "2".repeat(64);
    for (const [hash, type] of [
      [known, "image/gif"],
      [odd, "application/x-evil; charset=utf-7"],
    ] as const) {
      await h.store.addBlobs([{ hash, size: 3, mediaType: type }], T);
      await h.store.addProjectBlob(mine, hash);
      h.blobs.objects.set(`blobs/${hash}`, new Uint8Array([1, 2, 3]));
    }

    expect((await blobOf(h, ana, mine, known)).headers.get("Content-Type")).toBe("image/gif");
    const plain = await blobOf(h, ana, mine, odd);
    expect(plain.headers.get("Content-Type")).toBe("application/octet-stream");
    // The same headers, whatever the type.
    expect(plain.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(plain.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(plain.headers.get("Content-Disposition")).toBe(`attachment; filename="${odd}"`);
  });

  it("keeps the first registration's type when the same bytes were first seen as text, and serves them safely", async () => {
    const { h, ana, mine } = await setup();
    const same = svg();
    // As text, materialised from a file of the project.
    await h.rooms.push(mine, { files: { "icon.svg": new TextDecoder().decode(same) } });
    await h.rooms.materialise(mine);
    expect((await h.store.blob(sha(same)))?.mediaType).toBe("text/plain");

    // And then uploaded as an SVG: the first registration of the hash stands.
    const hash = (
      await jsonOf<{ hash: string }>(await put(h, ana, mine, "pictures/icon.svg", same))
    ).hash;

    expect(hash).toBe(sha(same));
    expect((await h.store.blob(hash))?.mediaType).toBe("text/plain");
    const served = await blobOf(h, ana, mine, hash);
    expect(served.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(served.headers.get("Content-Security-Policy")).toBe("sandbox");
  });

  it("answers HEAD from the store alone, without a request to R2", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    h.blobs.calls.length = 0;

    expect((await blobOf(h, ana, mine, hash, "HEAD")).status).toBe(200);

    expect(h.blobs.calls).toEqual([]);
  });

  it("answers 404, and logs the fault without the hash, when the row has no bytes", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    h.blobs.objects.delete(`blobs/${hash}`);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await blobOf(h, ana, mine, hash);

    expect(response.status).toBe(404);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(hash);
  });

  it("is not a way to read what the project does not hold, by any spelling of the hash", async () => {
    const { h, ana, mine } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;
    const other = "ana00000000000000002";

    for (const path of [
      `/api/projects/${other}/blobs/${hash}`,
      `/api/projects/${other}/blobs/${hash.toUpperCase()}`,
      `/api/projects/${mine}/blobs/${hash.toUpperCase()}`,
      `/api/projects/${mine}/blobs/${hash}%00`,
      `/api/projects/${mine}/blobs/${hash}/x`,
    ]) {
      const response = await h.request(path, { headers: { Cookie: ana.cookie } });
      expect(response.status, path).toBe(404);
    }
  });
});

describe("who may ask", () => {
  it("answers 404 project.not-found to nobody for all four routes of a private project, and stores nothing", async () => {
    const { h, mine } = await setup();
    const hash = "a".repeat(64);
    for (const [method, path] of [
      ["PUT", at(mine, "a.png")],
      ["DELETE", at(mine, "a.png")],
      ["GET", `/api/projects/${mine}/blobs/${hash}`],
      ["HEAD", `/api/projects/${mine}/blobs/${hash}`],
    ]) {
      const response = await h.request(path as string, {
        method,
        headers: { Origin: "https://diagrams.meltemi.dev" },
        ...(method === "PUT" ? { body: png() } : {}),
      });
      // Not 401: a private project does not reveal that it exists (`project-sharing`).
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await code(response), `${method} ${path}`).toBe("project.not-found");
    }
    await nothingStored(h, mine);
  });

  it("answers 404 project.not-found for someone else's project, and for one that cannot be", async () => {
    const { h, ana, beto, betos } = await setup();

    for (const id of [betos, "a".repeat(20), "not-an-id"]) {
      const asAna = await put(h, ana, id, "a.png", png());
      expect(asAna.status, id).toBe(404);
      expect(await code(asAna), id).toBe("project.not-found");
      const gone = await h.request(at(id, "a.png"), h.fromPage(ana.cookie, { method: "DELETE" }));
      expect(gone.status, id).toBe(404);
    }
    expect(h.blobs.keys()).toEqual([]);
    expect(await h.store.projectBlobs(betos)).toEqual([]);
    // Beto, the owner, can.
    expect((await put(h, beto, betos, "a.png", png())).status).toBe(200);
  });

  it("refuses an upload or a delete made with the cookie from anywhere but the page, before anything is read", async () => {
    const { h, ana, mine } = await setup();
    const spies = [
      vi.spyOn(h.store, "addBlobs"),
      vi.spyOn(h.store, "addProjectBlob"),
      vi.spyOn(h.rooms, "push"),
    ];

    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "http://diagrams.meltemi.dev",
    ]) {
      for (const method of ["PUT", "DELETE"]) {
        const response = await h.request(at(mine, "a.png"), {
          method,
          headers: { Cookie: ana.cookie, ...(origin === undefined ? {} : { Origin: origin }) },
          ...(method === "PUT" ? { body: png() } : {}),
        });
        expect(response.status, `${method} from ${origin}`).toBe(403);
        expect(await code(response)).toBe("request.forbidden");
      }
    }

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(h.blobs.keys()).toEqual([]);
  });

  it("lets a bearer token upload, read, ask with HEAD and delete, with no Origin: the command line does", async () => {
    const { h, mine } = await setup();
    const { token } = await addToken(h.store, { sub: "u-ana" });

    const uploaded = await h.request(
      at(mine, "a.png"),
      bearer(token, { method: "PUT", body: png() }),
    );
    expect(uploaded.status).toBe(200);
    const hash = (await jsonOf<{ hash: string }>(uploaded)).hash;
    for (const method of ["GET", "HEAD"]) {
      const response = await h.request(
        `/api/projects/${mine}/blobs/${hash}`,
        bearer(token, { method }),
      );
      expect(response.status, method).toBe(200);
    }
    const removed = await h.request(at(mine, "a.png"), bearer(token, { method: "DELETE" }));
    expect(removed.status).toBe(204);
  });

  it("answers 404 not-found for the methods no route has on these paths", async () => {
    const { h, ana, mine } = await setup();
    for (const [method, path] of [
      ["POST", at(mine, "a.png")],
      ["GET", at(mine, "a.png")],
      ["PATCH", at(mine, "a.png")],
      ["PUT", `/api/projects/${mine}/blobs/${"a".repeat(64)}`],
      ["DELETE", `/api/projects/${mine}/blobs/${"a".repeat(64)}`],
      ["POST", `/api/projects/${mine}/blobs/${"a".repeat(64)}`],
    ]) {
      const response = await h.request(path as string, h.fromPage(ana.cookie, { method }));
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await code(response), `${method} ${path}`).toBe("not-found");
    }
  });
});

describe("a project with its own images through the other routes", () => {
  it("lets a push name the hash an upload made, and a push that names another is blob.unknown", async () => {
    const { h, ana, mine, other } = await setup();
    const hash = (await jsonOf<{ hash: string }>(await put(h, ana, mine, "a.png", png()))).hash;

    const ok = await h.request(
      `/api/projects/${mine}/files`,
      h.fromPage(ana.cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: JSON.stringify({ binaries: { "b.png": hash } }),
      }),
    );
    expect(ok.status).toBe(200);
    const elsewhere = await h.request(
      `/api/projects/${other}/files`,
      h.fromPage(ana.cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: JSON.stringify({ binaries: { "b.png": hash } }),
      }),
    );
    // Uploaded to `mine`, not to `other`: the room checks the project's own rows.
    expect(elsewhere.status).toBe(400);
    expect(await code(elsewhere)).toBe("blob.unknown");
  });

  it("cannot name a key of R2 other than a blob: the key is made of a hash that passed the shape", () => {
    expect(blobKey("a".repeat(64))).toBe(`blobs/${"a".repeat(64)}`);
  });
});
