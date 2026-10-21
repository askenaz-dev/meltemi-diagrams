// The Worker's side of the room over the Durable Object binding: every call is a request the
// Worker constructs, and nothing of the client's request is forwarded.

import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.js";
import { ROOM_HEADERS, durableRooms, type RoomNamespaceLike } from "../src/room-client.js";
import { PROJECT } from "./support/rooms.js";

interface Seen {
  readonly id: unknown;
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** A namespace that records the requests its stubs get and answers with `answer`. */
function namespace(answer: (seen: Seen) => Response | Promise<Response>): {
  binding: RoomNamespaceLike;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const binding: RoomNamespaceLike = {
    idFromName: (name) => ({ name }),
    get: (id) => ({
      async fetch(request) {
        const entry: Seen = {
          id,
          method: request.method,
          url: request.url,
          headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])),
          body: await request.text(),
        };
        seen.push(entry);
        return answer(entry);
      },
    }),
  };
  return { binding, seen };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("durableRooms", () => {
  it("calls the room of the project by name, at a fixed internal address, with only the headers it sets", async () => {
    const { binding, seen } = namespace(() =>
      json({ revision: 1, files: {}, binaries: {}, collisions: [] }),
    );
    const rooms = durableRooms(binding);

    await rooms.read(PROJECT);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      id: { name: PROJECT },
      method: "GET",
      url: "https://room/files",
      headers: { "x-meltemi-project": PROJECT },
      body: "",
    });
  });

  it("passes the upgrade with the identity in headers it sets, and nothing of the client's request", async () => {
    const { binding, seen } = namespace(() => new Response(null, { status: 200 }));
    // A 101 cannot be built in Node: the binding answers 200 here, which `connect` refuses as not an upgrade.
    const rooms = durableRooms(binding);
    const clientRequest = new Request(`https://diagrams.meltemi.dev/rooms/${PROJECT}?x=1`, {
      headers: {
        Upgrade: "websocket",
        Cookie: "meltemi_session=secret-cookie",
        Authorization: "Bearer mdg_secret-token",
        Origin: "https://diagrams.meltemi.dev",
        "X-Meltemi-Role": "owner",
        "X-Meltemi-Sub": "someone-else",
        "Sec-WebSocket-Protocol": "evil",
        "X-Forwarded-For": "203.0.113.9",
      },
    });

    await rooms
      .connect(PROJECT, clientRequest, {
        sub: "u-ana",
        role: "viewer",
        name: "Ana María 李",
        picture: "https://img.example/a b.png",
      })
      .catch(() => undefined);

    expect(seen).toHaveLength(1);
    const [call] = seen as [Seen];
    expect(call.method).toBe("GET");
    expect(call.url).toBe("https://room/connect");
    // Exactly these headers: the identity is the one the Worker resolved, as the Worker wrote it.
    expect(Object.keys(call.headers).sort()).toEqual(
      [
        "upgrade",
        "x-meltemi-name",
        "x-meltemi-picture",
        "x-meltemi-project",
        "x-meltemi-role",
        "x-meltemi-sub",
      ].sort(),
    );
    expect(call.headers["upgrade"]).toBe("websocket");
    expect(call.headers["x-meltemi-role"]).toBe("viewer");
    expect(call.headers["x-meltemi-project"]).toBe(PROJECT);
    expect(decodeURIComponent(call.headers["x-meltemi-sub"] as string)).toBe("u-ana");
    expect(decodeURIComponent(call.headers["x-meltemi-name"] as string)).toBe("Ana María 李");
    expect(decodeURIComponent(call.headers["x-meltemi-picture"] as string)).toBe(
      "https://img.example/a b.png",
    );
    expect(JSON.stringify(call)).not.toMatch(/secret|evil|someone-else|203\.0\.113/);
    expect(ROOM_HEADERS).toEqual({
      project: "X-Meltemi-Project",
      sub: "X-Meltemi-Sub",
      role: "X-Meltemi-Role",
      name: "X-Meltemi-Name",
      picture: "X-Meltemi-Picture",
    });
  });

  it("makes each operation a request of its own: method, address and JSON body", async () => {
    const { binding, seen } = namespace((call) =>
      json(
        call.url.endsWith("/stats")
          ? { revision: 0 }
          : call.url.endsWith("/disconnect")
            ? { closed: 2 }
            : { revision: 3 },
      ),
    );
    const rooms = durableRooms(binding);

    expect(
      await rooms.push(PROJECT, { files: { "a.md": "x", "b.md": null }, ifRevision: 2 }),
    ).toEqual({ revision: 3 });
    expect(await rooms.restore(PROJECT, { "a.md": "x" }, { "i.png": "h" })).toEqual({
      revision: 3,
    });
    expect(await rooms.materialise(PROJECT)).toEqual({ revision: 3 });
    await rooms.destroy(PROJECT);
    await rooms.stats(PROJECT);
    expect(await rooms.disconnect(PROJECT, { sub: "u-ana" })).toEqual({ closed: 2 });

    expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
      "PUT https://room/files",
      "POST https://room/restore",
      "POST https://room/materialise",
      "POST https://room/destroy",
      "GET https://room/stats",
      "POST https://room/disconnect",
    ]);
    expect(JSON.parse(seen[0]?.body as string)).toEqual({
      files: { "a.md": "x", "b.md": null },
      ifRevision: 2,
    });
    expect(JSON.parse(seen[1]?.body as string)).toEqual({
      files: { "a.md": "x" },
      binaries: { "i.png": "h" },
    });
    expect(JSON.parse(seen[5]?.body as string)).toEqual({ sub: "u-ana" });
    // The revision a restore expects goes with it, and only when there is one.
    await rooms.restore(PROJECT, { "a.md": "x" }, {}, 3);
    expect(JSON.parse(seen[6]?.body as string)).toEqual({
      files: { "a.md": "x" },
      binaries: {},
      ifRevision: 3,
    });
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    for (const call of seen)
      expect(Object.keys(call.headers)).toEqual(expect.arrayContaining(["x-meltemi-project"]));
  });

  it("turns what the room refuses into the ApiError of the same code, with what it carries", async () => {
    const { binding } = namespace(() =>
      json({ code: "revision.mismatch", message: "revision.mismatch", revision: 7 }, 409),
    );

    const error = await durableRooms(binding)
      .push(PROJECT, { ifRevision: 5 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "revision.mismatch",
      status: 409,
      details: { revision: 7 },
    });
    // The standard message of the code, not the room's own.
    expect((error as ApiError).message).toBe("The project changed since that revision.");
  });

  it.each([
    ["path.invalid", 400],
    ["blob.unknown", 400],
    ["doc.invalid", 400],
    ["doc.too-large", 413],
    ["quota.files", 413],
    ["internal", 500],
  ])("keeps the code %s and its status %i", async (code, status) => {
    const { binding } = namespace(() => json({ code, message: code }, status));
    const error = await durableRooms(binding)
      .read(PROJECT)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code, status });
    expect((error as ApiError).details).toBeUndefined();
  });

  it("answers an internal error for what it cannot read: an unknown code, not JSON, or a failure of the binding itself", async () => {
    for (const answer of [
      () => json({ code: "made.up", message: "x" }, 400),
      () => new Response("<html>oops</html>", { status: 502 }),
      () => new Response(null, { status: 500 }),
    ]) {
      const error = await durableRooms(namespace(answer).binding)
        .read(PROJECT)
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ code: "internal", status: 500 });
    }
  });

  it("refuses an answer to the upgrade that is not an upgrade", async () => {
    const { binding } = namespace(() => json({ code: "access.denied", message: "x" }, 403));
    const error = await durableRooms(binding)
      .connect(PROJECT, new Request("https://diagrams.meltemi.dev/rooms/x"), {
        sub: "u",
        role: "owner",
        name: "n",
        picture: "",
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "access.denied", status: 403 });
  });
});
