// The routes that reach a project's room (`cloud-document`: "The room's protocol", "Reads and
// pushes through the room"; tasks 1.5): the socket, the files and the development tools, through the
// handler with the in-memory store and the in-memory rooms.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "../src/handler.js";
import { MAX_PUSH_BYTES } from "../src/http.js";
import { KIND } from "../src/room-protocol.js";
import { harness, jsonOf, type Harness } from "./support/index.js";
import { A, HASH, OTHER_PROJECT, PROJECT, UNKNOWN_HASH, addText, textOf } from "./support/rooms.js";
import { addToken, bearer, devVariant } from "./support/who.js";

const ORIGIN = "https://diagrams.meltemi.dev";
const JSON_TYPE = { "Content-Type": "application/json" };

afterEach(() => {
  vi.restoreAllMocks();
});

/** A harness with Ana signed in and her project, and Beto signed in with a project of his own. */
async function setup() {
  const h = await harness();
  const ana = await h.signedIn({
    sub: "u-ana",
    name: "Ana",
    picture: "https://img.example/ana.png",
  });
  const beto = await h.signedIn({ sub: "u-beto", name: "Beto" });
  const created = h.clock.now().toISOString();
  await h.store.createProject(
    { id: PROJECT, ownerSub: "u-ana", name: "Ana's", description: "", createdAt: created },
    100,
  );
  await h.store.createProject(
    { id: OTHER_PROJECT, ownerSub: "u-beto", name: "Beto's", description: "", createdAt: created },
    100,
  );
  await h.store.addProjectBlob(PROJECT, HASH);
  return { h, ana, beto };
}

/** The upgrade a page sends: the cookie and its own Origin. */
const upgrade = (cookie: string | undefined, extra: Record<string, string> = {}): RequestInit => ({
  headers: {
    Upgrade: "websocket",
    Connection: "Upgrade",
    Origin: ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
    ...extra,
  },
});

async function code(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response)).code;
}

describe("GET /rooms/:id", () => {
  it("opens the socket of the owner, who is the identity the room gets", async () => {
    const { h, ana } = await setup();

    const response = await h.request(`/rooms/${PROJECT}`, upgrade(ana.cookie));

    expect(response.status).toBe(200);
    expect(h.rooms.connects).toHaveLength(1);
    expect(h.rooms.connects[0]?.projectId).toBe(PROJECT);
    expect(h.rooms.connects[0]?.identity).toEqual({
      sub: "u-ana",
      role: "owner",
      name: "Ana",
      picture: "https://img.example/ana.png",
    });
    const client = h.rooms.clientOf(response);
    expect(client.hello).toMatchObject({
      role: "owner",
      revision: 0,
      you: { sub: "u-ana", name: "Ana", picture: "https://img.example/ana.png" },
    });
  });

  it("is refused for a foreign Origin, however good the cookie, and nothing reaches the room", async () => {
    const { h, ana } = await setup();
    for (const origin of [
      "https://evil.example",
      "https://id.meltemi.dev",
      "http://diagrams.meltemi.dev",
      "https://diagrams.meltemi.dev:8443",
      "https://diagrams.meltemi.dev.evil.example",
      "https://diagrams.meltemi.dev@evil.example",
      "null",
      "",
    ]) {
      const response = await h.request(
        `/rooms/${PROJECT}`,
        upgrade(ana.cookie, { Origin: origin }),
      );
      expect(response.status, `Origin ${origin}`).toBe(403);
      expect(await code(response), `Origin ${origin}`).toBe("request.forbidden");
    }

    // No Origin at all is not the page's either.
    const bare = upgrade(ana.cookie);
    delete (bare.headers as Record<string, string>)["Origin"];
    expect((await h.request(`/rooms/${PROJECT}`, bare)).status).toBe(403);
    expect(h.rooms.connects).toEqual([]);
  });

  it("is 404 for nobody on a private project, and nothing reaches the room", async () => {
    const { h } = await setup();

    const response = await h.request(`/rooms/${PROJECT}`, upgrade(undefined));

    expect(response.status).toBe(404);
    expect(await code(response)).toBe("project.not-found");
    expect(h.rooms.connects).toEqual([]);
  });

  it("is refused for a cookie that does not count, as it is for nobody", async () => {
    const { h } = await setup();
    for (const cookie of ["meltemi_session=not-a-token", "meltemi_session=", "other=1"]) {
      const response = await h.request(`/rooms/${PROJECT}`, upgrade(cookie));
      expect(response.status, cookie).toBe(404);
      expect(await code(response), cookie).toBe("project.not-found");
    }
    expect(h.rooms.connects).toEqual([]);
  });

  it("does not take a bearer token: the token alone is nobody, and the cookie's person when both come", async () => {
    const { h, ana, beto } = await setup();
    const token = await addToken(h.store, { sub: "u-ana" });

    const alone = await h.request(`/rooms/${PROJECT}`, {
      headers: { ...upgrade(undefined).headers, Authorization: `Bearer ${token.token}` },
    });
    expect(alone.status).toBe(404);
    expect(await code(alone)).toBe("project.not-found");

    // With a cookie beside it, the cookie is who is asking: Beto's, whatever the token says.
    const both = await h.request(`/rooms/${OTHER_PROJECT}`, {
      headers: {
        ...upgrade(beto.cookie).headers,
        Authorization: `Bearer ${token.token}`,
      },
    });
    expect(both.status).toBe(200);
    expect(h.rooms.connects.map((call) => call.identity.sub)).toEqual(["u-beto"]);

    // A token nobody holds beside a good cookie does not make it an error either.
    const wrong = await h.request(`/rooms/${PROJECT}`, {
      headers: { ...upgrade(ana.cookie).headers, Authorization: "Bearer mdg_unknown" },
    });
    expect(wrong.status).toBe(200);
  });

  it("is the Worker's 404 for a request that is not an upgrade, signed in or not", async () => {
    const { h, ana } = await setup();
    const inits: RequestInit[] = [
      {},
      { headers: { Cookie: ana.cookie, Origin: ORIGIN } },
      { headers: { Cookie: ana.cookie, Origin: ORIGIN, Upgrade: "h2c" } },
    ];
    for (const init of inits) {
      const response = await h.request(`/rooms/${PROJECT}`, init);
      expect(response.status).toBe(404);
      expect(await code(response)).toBe("not-found");
    }
    expect(h.rooms.connects).toEqual([]);
  });

  it("answers any other method with 404, even with the upgrade headers", async () => {
    const { h, ana } = await setup();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const response = await h.request(`/rooms/${PROJECT}`, {
        ...upgrade(ana.cookie),
        method,
      });
      expect(response.status, method).toBe(404);
    }
    expect(h.rooms.connects).toEqual([]);
  });

  it("does not answer a path under it: the room's internal routes are not public", async () => {
    const { h, ana } = await setup();
    await h.rooms.push(PROJECT, { files: { "a.meltemi": "mine" } });

    for (const [method, path] of [
      ["POST", `/rooms/${PROJECT}/destroy`],
      ["GET", `/rooms/${PROJECT}/files`],
      ["PUT", `/rooms/${PROJECT}/files`],
      ["POST", `/rooms/${PROJECT}/restore`],
      ["GET", `/rooms/${PROJECT}/stats`],
      ["POST", `/rooms/${PROJECT}/disconnect`],
      ["GET", `/rooms/${PROJECT}/connect`],
      ["POST", `/rooms/${PROJECT}/materialise`],
      ["GET", "/rooms"],
      ["GET", "/rooms/"],
      ["GET", `/rooms/${PROJECT}/`],
    ] as const) {
      const init = method === "GET" ? upgrade(ana.cookie) : { ...upgrade(ana.cookie), method };
      const response = await h.request(path, init);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await code(response), `${method} ${path}`).toBe("not-found");
    }

    // The room kept its document and its revision.
    expect(await h.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "a.meltemi": "mine" },
    });
    expect(h.rooms.room(PROJECT).storage.destroyed).toBe(0);
    expect(h.rooms.connects).toEqual([]);
  });

  it("is 404 project.not-found for a project that is someone else's, one that does not exist and an id that cannot be", async () => {
    const { h, ana } = await setup();
    for (const id of [OTHER_PROJECT, "01h2x5z8kq3m7n9p2r4v", "not-an-id", "A".repeat(20)]) {
      const response = await h.request(`/rooms/${id}`, upgrade(ana.cookie));
      expect(response.status, id).toBe(404);
      expect(await code(response), id).toBe("project.not-found");
    }
    expect(h.rooms.connects).toEqual([]);
  });

  it("ignores a spoofed role: a non-owner's upgrade with X-Meltemi-Role owner is 404, and an owner's keeps the role the Worker resolved", async () => {
    const { h, ana, beto } = await setup();

    const stranger = await h.request(
      `/rooms/${PROJECT}`,
      upgrade(beto.cookie, { "X-Meltemi-Role": "owner", "X-Meltemi-Sub": "u-ana" }),
    );
    expect(stranger.status).toBe(404);
    expect(await code(stranger)).toBe("project.not-found");
    expect(h.rooms.connects).toEqual([]);

    const owner = await h.request(
      `/rooms/${PROJECT}`,
      upgrade(ana.cookie, {
        "X-Meltemi-Role": "viewer",
        "X-Meltemi-Sub": "u-beto",
        "X-Meltemi-Name": "Mallory",
        "X-Meltemi-Picture": "https://evil.example/x.png",
        "X-Meltemi-Project": OTHER_PROJECT,
      }),
    );
    expect(owner.status).toBe(200);
    expect(h.rooms.connects).toHaveLength(1);
    expect(h.rooms.connects[0]?.projectId).toBe(PROJECT);
    expect(h.rooms.connects[0]?.identity).toEqual({
      sub: "u-ana",
      role: "owner",
      name: "Ana",
      picture: "https://img.example/ana.png",
    });
    expect(h.rooms.clientOf(owner).hello).toMatchObject({
      role: "owner",
      you: { sub: "u-ana", name: "Ana" },
    });
  });

  it("is a GET route that looks at the credentials itself: the one GET route that is not given a principal", () => {
    const own = ROUTES.filter((route) => route.method === "GET" && !route.principal).map(
      (route) => route.path.source,
    );
    expect(own).toContain(String.raw`^\/rooms\/([^/]+)$`);
  });
});

describe("GET /api/projects/:id/files", () => {
  it("answers the room's files, revision and collisions to the owner, with the cookie or a token", async () => {
    const { h, ana } = await setup();
    const token = await addToken(h.store, { sub: "u-ana" });
    await h.rooms.push(PROJECT, {
      files: { "diagrams/a.meltemi": "text" },
      binaries: { "logo.png": HASH },
    });

    const asCookie = await h.request(`/api/projects/${PROJECT}/files`, {
      headers: { Cookie: ana.cookie },
    });
    const asToken = await h.request(`/api/projects/${PROJECT}/files`, bearer(token.token));

    for (const response of [asCookie, asToken]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await jsonOf(response)).toEqual({
        revision: 1,
        files: { "diagrams/a.meltemi": "text" },
        binaries: { "logo.png": HASH },
        collisions: [],
      });
    }
  });

  it("reads what a client just typed, before anything was written to storage", async () => {
    const { h, ana } = await setup();
    const socket = await h.request(`/rooms/${PROJECT}`, upgrade(ana.cookie));
    const client = h.rooms.clientOf(socket);
    await addText(client, A, "typed.meltemi", "a moment ago");

    const response = await h.request(`/api/projects/${PROJECT}/files`, {
      headers: { Cookie: ana.cookie },
    });

    expect(await jsonOf(response)).toMatchObject({ files: { "typed.meltemi": "a moment ago" } });
  });

  it("is 404 project.not-found for nobody on a private project, and for a project of someone else, one that does not exist and a bad id", async () => {
    const { h, ana } = await setup();

    // Not 401: a private project does not reveal that it exists. (A `view` link admits nobody
    // too: see sharing-access.test.ts.)
    const nobody = await h.request(`/api/projects/${PROJECT}/files`);
    expect(nobody.status).toBe(404);
    expect(await code(nobody)).toBe("project.not-found");

    for (const id of [OTHER_PROJECT, "01h2x5z8kq3m7n9p2r4v", "x"]) {
      const response = await h.request(`/api/projects/${id}/files`, {
        headers: { Cookie: ana.cookie },
      });
      expect(response.status, id).toBe(404);
      expect(await code(response), id).toBe("project.not-found");
    }
  });
});

describe("PUT /api/projects/:id/files", () => {
  const put = (h: Harness, cookie: string, body: unknown, id = PROJECT) =>
    h.request(
      `/api/projects/${id}/files`,
      h.fromPage(cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  it("applies a push as one transaction and answers the new revision", async () => {
    const { h, ana } = await setup();

    const response = await put(h, ana.cookie, {
      files: { "diagrams/a.meltemi": "one", "project.json": "{}" },
      binaries: { "assets/logo.png": HASH },
    });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ revision: 1 });
    expect(await h.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "diagrams/a.meltemi": "one", "project.json": "{}" },
      binaries: { "assets/logo.png": HASH },
    });
  });

  it("takes either part alone, and a bearer token without an Origin", async () => {
    const { h } = await setup();
    const token = await addToken(h.store, { sub: "u-ana" });

    const response = await h.request(
      `/api/projects/${PROJECT}/files`,
      bearer(token.token, {
        method: "PUT",
        headers: JSON_TYPE,
        body: JSON.stringify({ files: { "a.md": "x" } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ revision: 1 });
    const empty = await h.request(
      `/api/projects/${PROJECT}/files`,
      bearer(token.token, { method: "PUT", body: "{}" }),
    );
    expect(await jsonOf(empty)).toEqual({ revision: 1 });
  });

  it("is seen by a connected client, whose text becomes the pushed one", async () => {
    const { h, ana } = await setup();
    const socket = await h.request(`/rooms/${PROJECT}`, upgrade(ana.cookie));
    const client = h.rooms.clientOf(socket);
    await addText(client, A, "diagrams/a.meltemi", "before");
    const other = h.rooms.clientOf(await h.request(`/rooms/${PROJECT}`, upgrade(ana.cookie)));
    await other.sync();

    await put(h, ana.cookie, { files: { "diagrams/a.meltemi": "after the push" } });

    expect(textOf(client, A)).toBe("after the push");
    expect(textOf(other, A)).toBe("after the push");
    expect(other.of(KIND.update).length).toBeGreaterThanOrEqual(2);
  });

  it("is 409 revision.mismatch, with the revision the room is at in the body, for a stale ifRevision", async () => {
    const { h, ana } = await setup();
    for (let n = 1; n <= 7; n++) await put(h, ana.cookie, { files: { "a.md": `v${n}` } });

    const response = await put(h, ana.cookie, { files: { "a.md": "stale" }, ifRevision: 5 });

    expect(response.status).toBe(409);
    expect(await jsonOf(response)).toMatchObject({ code: "revision.mismatch", revision: 7 });
    expect((await h.rooms.read(PROJECT)).files).toEqual({ "a.md": "v7" });
    const fresh = await put(h, ana.cookie, { files: { "a.md": "fresh" }, ifRevision: 7 });
    expect(await jsonOf(fresh)).toEqual({ revision: 8 });
  });

  it("is 400 path.invalid for ..\\x.meltemi and the like, and the revision is unchanged", async () => {
    const { h, ana } = await setup();
    await put(h, ana.cookie, { files: { "ok.meltemi": "kept" } });

    for (const path of [
      "..\\x.meltemi",
      "../x.meltemi",
      ".git/hooks/post-checkout",
      "a//b.meltemi",
      "C:/x",
    ]) {
      const response = await put(h, ana.cookie, { files: { "fine.meltemi": "y", [path]: "x" } });
      expect(response.status, path).toBe(400);
      expect(await code(response), path).toBe("path.invalid");
    }

    expect(await h.rooms.read(PROJECT)).toMatchObject({
      revision: 1,
      files: { "ok.meltemi": "kept" },
    });
  });

  it("is 400 blob.unknown for a hash the project never uploaded, and 400 request.invalid for one that is not a hash", async () => {
    const { h, ana } = await setup();

    const unknown = await put(h, ana.cookie, { binaries: { "a.png": UNKNOWN_HASH } });
    expect(unknown.status).toBe(400);
    expect(await code(unknown)).toBe("blob.unknown");

    for (const hash of ["nope", "A".repeat(64), "a".repeat(63), 5]) {
      const response = await put(h, ana.cookie, { binaries: { "a.png": hash } });
      expect(response.status, String(hash)).toBe(400);
      expect(await code(response), String(hash)).toBe("request.invalid");
    }
    expect((await h.rooms.read(PROJECT)).revision).toBe(0);
  });

  it.each([
    ["not JSON", "{nope"],
    ["an empty body", ""],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"files"'],
    ["files that are an array", '{"files":[]}'],
    ["a file that is a number", '{"files":{"a.md":1}}'],
    ["a binary that is a boolean", '{"binaries":{"a.png":true}}'],
    ["a negative ifRevision", '{"ifRevision":-1}'],
    ["a fractional ifRevision", '{"ifRevision":1.5}'],
    ["an ifRevision that is text", '{"ifRevision":"1"}'],
  ])("is 400 request.invalid for %s", async (_name, body) => {
    const { h, ana } = await setup();
    const response = await put(h, ana.cookie, body);
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("request.invalid");
    expect((await h.rooms.read(PROJECT)).revision).toBe(0);
  });

  it("is 413 doc.too-large for a text over 2 Mi characters, and for a body over the cap, which is not read to the end", async () => {
    const { h, ana } = await setup();

    const big = await put(h, ana.cookie, { files: { "a.md": "x".repeat(2 * 1024 * 1024 + 1) } });
    expect(big.status).toBe(413);
    expect(await code(big)).toBe("doc.too-large");
    expect((await h.rooms.read(PROJECT)).revision).toBe(0);

    // A body that never ends: the cap is a little over a document's size, and no more is read.
    expect(MAX_PUSH_BYTES).toBe(17 * 1024 * 1024);
    const state = { pulled: 0, released: false };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulled += 1;
        controller.enqueue(new Uint8Array(1024 * 1024).fill(97));
      },
      cancel() {
        state.released = true;
      },
    });
    const endless = await h.request(
      `/api/projects/${PROJECT}/files`,
      h.fromPage(ana.cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(endless.status).toBe(413);
    expect(await code(endless)).toBe("doc.too-large");
    expect(state.pulled).toBeLessThanOrEqual(20);
    expect(state.released).toBe(true);
  });

  it("takes a document of the size a project may hold (a 2 Mi-character text) as it is", async () => {
    const { h, ana } = await setup();
    const response = await put(h, ana.cookie, { files: { "a.md": "x".repeat(2 * 1024 * 1024) } });
    expect(response.status).toBe(200);
    expect((await h.rooms.read(PROJECT)).files["a.md"]).toHaveLength(2 * 1024 * 1024);
  });

  it("is 404 project.not-found for nobody on a private project and for someone else's project, and reads no body for either", async () => {
    const { h, ana, beto } = await setup();
    const nobody = await h.request(`/api/projects/${PROJECT}/files`, {
      method: "PUT",
      headers: { Origin: ORIGIN, ...JSON_TYPE },
      body: JSON.stringify({ files: { "a.md": "x" } }),
    });
    expect(nobody.status).toBe(404);
    expect(await code(nobody)).toBe("project.not-found");

    const stranger = await put(h, beto.cookie, { files: { "a.md": "x" } });
    expect(stranger.status).toBe(404);
    expect(await code(stranger)).toBe("project.not-found");
    const missing = await put(h, ana.cookie, { files: { "a.md": "x" } }, "01h2x5z8kq3m7n9p2r4v");
    expect(missing.status).toBe(404);
    expect((await h.rooms.read(PROJECT)).revision).toBe(0);
  });

  it("is refused for a cookie from anywhere but the page, before the route runs, and applies nothing", async () => {
    const { h, ana } = await setup();
    const push = vi.spyOn(h.rooms, "push");

    for (const origin of [
      undefined,
      "",
      "null",
      "https://id.meltemi.dev",
      "https://evil.example",
    ]) {
      const headers: Record<string, string> = { Cookie: ana.cookie, ...JSON_TYPE };
      if (origin !== undefined) headers["Origin"] = origin;
      const response = await h.request(`/api/projects/${PROJECT}/files`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ files: { "a.md": "x" } }),
      });
      expect(response.status, String(origin)).toBe(403);
      expect(await code(response), String(origin)).toBe("request.forbidden");
    }

    expect(push).not.toHaveBeenCalled();
    expect((await h.rooms.read(PROJECT)).revision).toBe(0);
  });
});

describe("the development tools of the rooms", () => {
  it("answer 404 anywhere but development, even for the owner with the page's Origin", async () => {
    const { h, ana } = await setup();

    const stats = await h.request(`/api/dev/rooms/${PROJECT}/stats`, {
      headers: { Cookie: ana.cookie },
    });
    const cut = await h.request(
      `/api/dev/rooms/${PROJECT}/disconnect`,
      h.fromPage(ana.cookie, { method: "POST" }),
    );
    const limits = await h.request(
      `/api/dev/rooms/${PROJECT}/limits`,
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ clients: 1 }),
      }),
    );

    for (const response of [stats, cut, limits]) {
      expect(response.status).toBe(404);
      expect(await code(response)).toBe("not-found");
    }
  });

  it("answer the counters and cut the sockets in development, for the owner of the project and no one else", async () => {
    const { h, ana, beto } = await setup();
    const dev = devVariant(h);
    const socket = await dev.request(`/rooms/${PROJECT}`, upgrade(ana.cookie));
    const client = h.rooms.clientOf(socket);
    await addText(client, A, "a.meltemi", "x");
    await h.rooms.advance(0);

    const stats = await dev.request(`/api/dev/rooms/${PROJECT}/stats`, {
      headers: { Cookie: ana.cookie },
    });
    expect(stats.status).toBe(200);
    expect(await jsonOf(stats)).toMatchObject({
      revision: 1,
      clients: 1,
      storageWrites: 1,
      materialisations: 0,
      d1RowsWritten: 0,
      messages: 1,
    });

    // Someone else's project is a 404 for them too, and nobody is a 401.
    const stranger = await dev.request(`/api/dev/rooms/${PROJECT}/stats`, {
      headers: { Cookie: beto.cookie },
    });
    expect(stranger.status).toBe(404);
    expect((await dev.request(`/api/dev/rooms/${PROJECT}/stats`)).status).toBe(401);

    const cut = await dev.request(
      `/api/dev/rooms/${PROJECT}/disconnect`,
      h.fromPage(ana.cookie, {
        method: "POST",
        headers: JSON_TYPE,
        body: JSON.stringify({ sub: "u-ana" }),
      }),
    );
    expect(cut.status).toBe(200);
    expect(await jsonOf(cut)).toEqual({ closed: 1 });
    expect(client.closed).toEqual({ code: 4000, reason: "disconnected" });
    const none = await dev.request(
      `/api/dev/rooms/${PROJECT}/disconnect`,
      h.fromPage(ana.cookie, { method: "POST" }),
    );
    expect(await jsonOf(none)).toEqual({ closed: 0 });
  });

  it("count the awareness messages a room received, and those it did not relay", async () => {
    const { h, ana } = await setup();
    const dev = devVariant(h);
    const socket = await dev.request(`/rooms/${PROJECT}`, upgrade(ana.cookie));
    const client = h.rooms.clientOf(socket);

    await client.awareness({ file: A });
    await client.awareness("not a state");

    const stats = await dev.request(`/api/dev/rooms/${PROJECT}/stats`, {
      headers: { Cookie: ana.cookie },
    });
    expect(await jsonOf(stats)).toMatchObject({ messages: 2, awareness: 2, awarenessDropped: 1 });
  });

  it("lower the clients a room admits, from the owner's cookie and the page's origin, and give it back", async () => {
    const { h, ana, beto } = await setup();
    const dev = devVariant(h);
    const lower = (cookie: string, body: string | undefined, init: RequestInit = {}) =>
      dev.request(
        `/api/dev/rooms/${PROJECT}/limits`,
        h.fromPage(cookie, {
          method: "POST",
          ...(body === undefined ? {} : { headers: JSON_TYPE, body }),
          ...init,
        }),
      );
    const first = h.rooms.clientOf(await dev.request(`/rooms/${PROJECT}`, upgrade(ana.cookie)));

    const lowered = await lower(ana.cookie, JSON.stringify({ clients: 1 }));
    expect(lowered.status).toBe(200);
    expect(await jsonOf(lowered)).toEqual({ clients: 1 });

    // The second socket of the room is refused as the 21st would be, and nobody is cut.
    const second = h.rooms.clientOf(await dev.request(`/rooms/${PROJECT}`, upgrade(ana.cookie)));
    expect(second.errors).toEqual(["room.full"]);
    expect(second.closed).toEqual({ code: 4409, reason: "room.full" });
    expect(first.closed).toBeUndefined();

    // Given back, with no body, with `null` or with `{}`: the room's own limit.
    for (const body of [undefined, "{}", '{"clients":null}']) {
      await lower(ana.cookie, JSON.stringify({ clients: 1 }));
      const back = await lower(ana.cookie, body);
      expect(await jsonOf(back), String(body)).toEqual({ clients: 20 });
    }
    const third = h.rooms.clientOf(await dev.request(`/rooms/${PROJECT}`, upgrade(ana.cookie)));
    expect(third.hello).toMatchObject({ limits: { clients: 20 } });

    // It is the owner's tool: someone else's project is a 404 for them, and nobody is a 401.
    expect((await lower(beto.cookie, JSON.stringify({ clients: 1 }))).status).toBe(404);
    const nobody = await dev.request(`/api/dev/rooms/${PROJECT}/limits`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(nobody.status).toBe(401);
  });

  it("refuse a limit that is not a whole number from 1 to 20, and change nothing", async () => {
    const { h, ana } = await setup();
    const dev = devVariant(h);
    const lower = (body: string) =>
      dev.request(
        `/api/dev/rooms/${PROJECT}/limits`,
        h.fromPage(ana.cookie, { method: "POST", headers: JSON_TYPE, body }),
      );

    for (const body of [
      '{"clients":0}',
      '{"clients":21}',
      '{"clients":-1}',
      '{"clients":1.5}',
      '{"clients":"2"}',
      '{"clients":true}',
      "[]",
      "5",
      "{nope",
    ]) {
      const response = await lower(body);
      expect(response.status, body).toBe(400);
      expect(await code(response), body).toBe("request.invalid");
    }
    expect(await jsonOf(await lower("{}"))).toEqual({ clients: 20 });
  });

  it("are refused for a cookie from another origin, like every change, and take only a JSON object", async () => {
    const { h, ana } = await setup();
    const dev = devVariant(h);
    const foreign = await dev.request(`/api/dev/rooms/${PROJECT}/disconnect`, {
      method: "POST",
      headers: { Cookie: ana.cookie, Origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);

    for (const body of ["[]", "5", "{nope"]) {
      const response = await dev.request(
        `/api/dev/rooms/${PROJECT}/disconnect`,
        h.fromPage(ana.cookie, { method: "POST", headers: JSON_TYPE, body }),
      );
      expect(response.status, body).toBe(400);
    }
  });
});
