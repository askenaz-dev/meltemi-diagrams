// A live session through the Worker (`live-sessions`; `project-sharing`, "Link access and members"
// and "The role each route needs"; `cloud-document`, "The room's protocol"): the owner's `/live`
// routes, the socket with `?live=`, `?guest=` and `?name=`, the headers only the Worker sets, and
// the two reads that take the token in `X-Meltemi-Live` while every other route ignores it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonOf } from "./support/index.js";
import { codeOf, pngBytes } from "./support/projects.js";
import { A, OTHER_PROJECT, addText, textOf } from "./support/rooms.js";
import { EDITOR, NOBODY, OWNER, STRANGER, VIEWER, world, type World } from "./support/sharing.js";

const ORIGIN = "https://diagrams.meltemi.dev";
const GUEST = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  vi.restoreAllMocks();
});

interface LiveBody {
  id: string;
  link: string;
  guestsEdit: boolean;
  startedAt: string;
  until: string;
  guests: number;
}

/** Starts the project's session as its owner and answers it. */
async function start(w: World, body: unknown = {}): Promise<LiveBody> {
  const response = await w.ask(OWNER, "PUT", w.url("/live"), body);
  expect(response.status).toBe(200);
  return jsonOf<LiveBody>(response);
}

const tokenOf = (live: LiveBody): string => new URL(live.link).searchParams.get("live") ?? "";

/** The upgrade an anonymous page sends, with its own `Origin` and the query it builds. */
function anonymousSocket(w: World, query: string, headers: Record<string, string> = {}) {
  return w.h.request(`/rooms/${w.id}${query}`, {
    headers: { Upgrade: "websocket", Connection: "Upgrade", Origin: ORIGIN, ...headers },
  });
}

/** A read as nobody, with only these headers (the token's, say). */
function read(w: World, method: string, path: string, headers: Record<string, string> = {}) {
  return w.h.request(path, { method, headers });
}

/** The upgrade a signed-in page sends. */
async function signedSocket(w: World, sub: string, query = "") {
  const { cookie } = await w.h.signedIn({ sub, name: sub });
  return w.h.request(`/rooms/${w.id}${query}`, {
    headers: { Upgrade: "websocket", Connection: "Upgrade", Origin: ORIGIN, Cookie: cookie },
  });
}

describe("the owner's routes", () => {
  it("starts a session with a link to pass on, answers the same one again, and ends it", async () => {
    const w = await world("private");
    const live = await start(w);

    expect(live).toMatchObject({ guestsEdit: true, guests: 0 });
    expect(live.link).toMatch(new RegExp(`^${ORIGIN}/p/${w.id}\\?live=[0-9a-f]{32}$`));
    expect(Date.parse(live.until) - Date.parse(live.startedAt)).toBe(24 * 60 * 60 * 1000);
    expect(await start(w)).toEqual(live);
    expect(await jsonOf(await w.ask(OWNER, "GET", w.url("/live")))).toEqual(live);

    expect((await w.ask(OWNER, "DELETE", w.url("/live"))).status).toBe(204);
    expect(await jsonOf(await w.ask(OWNER, "GET", w.url("/live")))).toBeNull();
    // Ending what is not on is the same answer.
    expect((await w.ask(OWNER, "DELETE", w.url("/live"))).status).toBe(204);
  });

  it("applies guestsEdit, and refuses one that is not true or false", async () => {
    const w = await world("private");
    expect((await start(w, { guestsEdit: false })).guestsEdit).toBe(false);
    expect((await start(w, { guestsEdit: true })).guestsEdit).toBe(true);
    const wrong = await w.ask(OWNER, "PUT", w.url("/live"), { guestsEdit: "yes" });
    expect([wrong.status, await codeOf(wrong)]).toEqual([400, "request.invalid"]);
  });

  it("is the owner's alone: an editor is refused with 403 and no session starts", async () => {
    const w = await world("edit");
    for (const method of ["PUT", "GET", "DELETE"]) {
      const response = await w.ask(
        EDITOR,
        method,
        w.url("/live"),
        method === "PUT" ? {} : undefined,
      );
      expect([response.status, await codeOf(response)], method).toEqual([403, "access.denied"]);
    }
    expect(await jsonOf(await w.ask(OWNER, "GET", w.url("/live")))).toBeNull();
    // Nobody else either: signing in would not make them the owner.
    const nobody = await w.ask(NOBODY, "PUT", w.url("/live"), {});
    expect([nobody.status, await codeOf(nobody)]).toEqual([403, "access.denied"]);
  });

  it("counts the guests the session admitted", async () => {
    const w = await world("private");
    const live = await start(w);
    await anonymousSocket(w, `?live=${tokenOf(live)}&guest=${GUEST}&name=Lu`);
    expect((await jsonOf<LiveBody>(await w.ask(OWNER, "GET", w.url("/live")))).guests).toBe(1);
  });
});

describe("the socket with a token", () => {
  it("admits an anonymous guest to a private project with the session's role and a guest identity", async () => {
    const w = await world("private");
    const live = await start(w);

    const response = await anonymousSocket(
      w,
      `?live=${tokenOf(live)}&guest=${GUEST}&name=${encodeURIComponent("  <b>Ana</b> ")}`,
    );

    expect(response.status).toBe(200);
    const client = w.h.rooms.clientOf(response);
    expect(client.hello).toMatchObject({
      role: "editor",
      you: { sub: `guest:${GUEST}`, name: "<b>Ana</b>", picture: "", guest: true },
      live: { until: live.until, guestsEdit: true },
    });
    // The guest's change reaches the owner.
    const owner = w.h.rooms.clientOf(await signedSocket(w, OWNER));
    await addText(client, A, "together.meltemi", "hi");
    await owner.sync();
    expect(textOf(owner, A)).toBe("hi");
  });

  it("gives a signed-in stranger the session's role with their account's identity", async () => {
    const w = await world("private");
    const live = await start(w, { guestsEdit: false });
    const response = await signedSocket(w, STRANGER, `?live=${tokenOf(live)}`);
    expect(response.status).toBe(200);
    expect(w.h.rooms.clientOf(response).hello).toMatchObject({
      role: "viewer",
      you: { sub: STRANGER, guest: false },
    });
    expect(w.h.rooms.connects.at(-1)?.identity).toMatchObject({ sub: STRANGER, role: "viewer" });
  });

  it("is 404 for a token that is not the session's, on a private project, and the room keeps no socket", async () => {
    const w = await world("private");
    await start(w);
    for (const token of ["0".repeat(32), "nope", ""]) {
      const response = await anonymousSocket(w, `?live=${token}&guest=${GUEST}`);
      expect([response.status, await codeOf(response)], token).toEqual([404, "project.not-found"]);
    }
    expect(w.h.rooms.room(w.id).connections).toHaveLength(0);
  });

  it("is 404 for a private project without a token, and makes no room for an id the store does not hold", async () => {
    const w = await world("private");
    const without = await anonymousSocket(w, `?guest=${GUEST}`);
    expect([without.status, await codeOf(without)]).toEqual([404, "project.not-found"]);

    const unknown = await w.h.request(
      `/rooms/${OTHER_PROJECT}?live=${"a".repeat(32)}&guest=${GUEST}`,
      {
        headers: { Upgrade: "websocket", Connection: "Upgrade", Origin: ORIGIN },
      },
    );
    expect([unknown.status, await codeOf(unknown)]).toEqual([404, "project.not-found"]);
    expect(w.h.rooms.has(OTHER_PROJECT)).toBe(false);
  });

  it("asks an anonymous connection for its browser's id, and names it by default when its name will not do", async () => {
    const w = await world("view");
    for (const guest of ["", "short", "G".repeat(32), `${GUEST}0`]) {
      const response = await anonymousSocket(w, `?guest=${guest}&name=Lu`);
      expect([response.status, await codeOf(response)], guest).toEqual([400, "request.invalid"]);
    }
    for (const name of ["x".repeat(300), "", "   ", "a\u0007b", "a\nb"]) {
      const response = await anonymousSocket(w, `?guest=${GUEST}&name=${encodeURIComponent(name)}`);
      expect(response.status).toBe(200);
      expect(w.h.rooms.connects.at(-1)?.identity.name, JSON.stringify(name)).toMatch(
        /^Guest \d{2}$/,
      );
    }
    const forty = "ñ".repeat(40);
    await anonymousSocket(w, `?guest=${GUEST}&name=${encodeURIComponent(forty)}`);
    expect(w.h.rooms.connects.at(-1)?.identity.name).toBe(forty);
  });

  it("replaces whatever the browser sent with the headers only the Worker sets", async () => {
    const w = await world("view");
    const live = await start(w, { guestsEdit: false });
    await anonymousSocket(w, `?guest=${GUEST}`, {
      "X-Meltemi-Role": "owner",
      "X-Meltemi-Live": tokenOf(live),
      "X-Meltemi-Guest": "0",
      "X-Meltemi-Sub": "u-owner",
      "X-Meltemi-Address": "10.0.0.1",
      "CF-Connecting-IP": "198.51.100.4",
    });
    const call = w.h.rooms.connects.at(-1);
    expect(call?.identity).toEqual({
      sub: `guest:${GUEST}`,
      role: "viewer",
      name: expect.stringMatching(/^Guest \d{2}$/) as unknown as string,
      picture: "",
      guest: true,
      address: "198.51.100.4",
    });
    // The token is the query's only: the header the browser sent is not one.
    expect(w.h.rooms.clientOf(await anonymousSocket(w, `?guest=${GUEST}`)).hello).toMatchObject({
      role: "viewer",
      live: null,
    });
  });

  it("is still 403 from a foreign Origin, with a token", async () => {
    const w = await world("private");
    const live = await start(w);
    const response = await anonymousSocket(w, `?live=${tokenOf(live)}&guest=${GUEST}`, {
      Origin: "https://evil.example",
    });
    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
  });

  it("does not answer the room's own live route from outside", async () => {
    const w = await world("private");
    const live = await start(w);
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    for (const path of [`/rooms/${w.id}/live`, `/rooms/${w.id}/live/check`]) {
      const response = await w.h.request(path, w.h.fromPage(cookie, { method: "POST" }));
      expect(response.status, path).toBe(404);
    }
    expect(await jsonOf(await w.ask(OWNER, "GET", w.url("/live")))).toEqual(live);
  });
});

describe("the reads that take the token", () => {
  it("serves a private project's row and its blobs to the token in X-Meltemi-Live, and nothing without it", async () => {
    const w = await world("private");
    const live = await start(w);
    const header = { "X-Meltemi-Live": tokenOf(live) };

    const row = await read(w, "GET", w.url(), header);
    expect(row.status).toBe(200);
    expect(await jsonOf(row)).toMatchObject({
      id: w.id,
      name: "Shared",
      role: "editor",
      live: { until: live.until, guestsEdit: true },
    });
    const blob = await read(w, "GET", w.url(`/blobs/${w.hash}`), header);
    expect(blob.status).toBe(200);
    expect((await read(w, "HEAD", w.url(`/blobs/${w.hash}`), header)).status).toBe(200);

    expect((await w.ask(NOBODY, "GET", w.url(`/blobs/${w.hash}`))).status).toBe(404);
    const wrong = { "X-Meltemi-Live": "0".repeat(32) };
    expect((await read(w, "GET", w.url(), wrong)).status).toBe(404);
    expect((await read(w, "GET", w.url(`/blobs/${w.hash}`), wrong)).status).toBe(404);
  });

  it("tells a page that can read anyway that its token is no longer current", async () => {
    const w = await world("view");
    const live = await start(w);
    await w.ask(OWNER, "DELETE", w.url("/live"));
    const row = await read(w, "GET", w.url(), { "X-Meltemi-Live": tokenOf(live) });
    expect(row.status).toBe(200);
    expect(await jsonOf(row)).toMatchObject({ role: "viewer", live: null });
    // Without the header the row says nothing of a session.
    expect(await jsonOf(await w.ask(NOBODY, "GET", w.url()))).not.toHaveProperty("live");
  });

  it("is ignored everywhere else: the thumbnail, the files, the versions, sharing and uploads", async () => {
    const w = await world("private");
    const live = await start(w);
    const header = { "X-Meltemi-Live": tokenOf(live) };
    for (const [method, path] of [
      ["GET", w.url("/thumbnail")],
      ["GET", w.url("/files")],
      ["GET", w.url("/versions")],
      ["GET", w.url("/sharing")],
    ] as const) {
      const response = await read(w, method, path, header);
      expect([response.status, await codeOf(response)], path).toEqual([404, "project.not-found"]);
    }
    const upload = await w.ask(NOBODY, "PUT", w.url("/binaries/extra.png"), pngBytes("x"), {
      ...header,
      "Content-Type": "image/png",
    });
    expect(upload.status).toBe(404);
    const push = await w.ask(NOBODY, "PUT", w.url("/files"), { files: { "x.md": "x" } }, header);
    expect(push.status).toBe(404);
    expect((await w.h.rooms.read(w.id)).files["x.md"]).toBeUndefined();
  });

  it("does not let a guest upload on an edit link either: sign-in is what it needs", async () => {
    const w = await world("edit");
    const live = await start(w);
    const upload = await w.ask(NOBODY, "PUT", w.url("/binaries/extra.png"), pngBytes("x"), {
      "X-Meltemi-Live": tokenOf(live),
      "Content-Type": "image/png",
    });
    expect([upload.status, await codeOf(upload)]).toEqual([401, "auth.required"]);
  });

  it("gives a member the higher of their role and the session's in the row", async () => {
    const w = await world("private");
    const live = await start(w);
    const { cookie } = await w.h.signedIn({ sub: VIEWER });
    const row = await w.h.request(w.url(), {
      headers: { Cookie: cookie, "X-Meltemi-Live": tokenOf(live) },
    });
    expect(await jsonOf(row)).toMatchObject({ role: "editor", live: { guestsEdit: true } });
  });
});
