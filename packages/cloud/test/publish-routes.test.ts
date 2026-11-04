// Handles and publishing through the handler (`publishing`: "Handles", "Publish and unpublish",
// "Takedown"; `project-sharing`: "The role each route needs" for `PUT`/`DELETE …/publish` and the
// admin routes), with the in-memory store, rooms and bucket: the handle a person chooses, the page
// they publish and unpublish, the limits (16 MiB, ten requests an hour), who may do it, and the
// administrators' takedown. What the publish host answers is publish-host.test.ts; here the
// publication is also read back through it, so that what the routes store is what a visitor gets.
// Who may reach each route at every link level is also in sharing-access.test.ts (the nine cells).

import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PUBLISH_BODY } from "../src/routes/publish.js";
import { publishHost } from "../src/publish.js";
import { publishedKey } from "../src/keys.js";
import { jsonOf } from "./support/index.js";
import { HOUR, MINUTE, MIB } from "./support/projects.js";
import { EDITOR, NOBODY, OWNER, STRANGER, VIEWER, world, type World } from "./support/sharing.js";
import { addToken, bearer } from "./support/who.js";

const ORIGIN = "https://diagrams.meltemi.dev";
const HOST = "meltemi.page";
const ADMIN = "u-admin";
const JSON_TYPE = { "Content-Type": "application/json" };

afterEach(() => {
  vi.restoreAllMocks();
});

const page = (title = "Purchase"): string =>
  `<!doctype html><title>${title}</title><p>${title}</p>`;
const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength;

async function codeOf(response: Response): Promise<string | undefined> {
  return (await jsonOf<{ code?: string }>(response.clone())).code;
}

/** A world of the person `OWNER` with the publish host and one administrator configured. */
function publishing(link: "private" | "view" | "edit" = "private"): Promise<World> {
  return world(link, { env: { PUBLISH_HOST: HOST, ADMIN_SUBS: ADMIN } });
}

/** The person chooses a handle, as the page does. */
async function choose(w: World, handle = "ana", who = OWNER): Promise<void> {
  const response = await w.ask(who, "PATCH", "/api/account", { handle });
  expect(response.status, `${who} chooses ${handle}`).toBe(200);
}

const publish = (w: World, slug: string, html = page(), who = OWNER, id = w.id) =>
  w.ask(who, "PUT", w.url("/publish", id), { slug, html });

/** What the publish host answers for a path, with the bucket and the store of the world. */
const visit = (w: World, path: string, init: RequestInit = {}) =>
  publishHost(
    new Request(`https://${HOST}${path}`, init),
    { BLOBS: w.h.blobs },
    { store: w.h.store },
  );

interface PublishBody {
  url: string;
  handle: string;
  slug: string;
  bytes: number;
  published_at: string;
}

interface PublishState {
  handle: string | null;
  publications: { slug: string; url: string; published_at: string; bytes: number }[];
  takedowns: { slug: string; at: string; reason: string }[];
}

const stateOf = async (w: World, who = OWNER, id = w.id): Promise<PublishState> =>
  jsonOf<PublishState>(await w.ask(who, "GET", w.url("/publish", id)));

// ---------------------------------------------------------------------------------------------

describe("PATCH /api/account (the handle)", () => {
  it("gives the person the handle, and the session says so", async () => {
    const w = await publishing();

    const response = await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana-1" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ handle: "ana-1" });
    expect((await w.h.store.user(OWNER))?.handle).toBe("ana-1");
    const session = await jsonOf<{ user: { handle: string | null } }>(
      await w.ask(OWNER, "GET", "/api/session"),
    );
    expect(session.user.handle).toBe("ana-1");
  });

  it.each(["abc", "a-b", "123", "---", "a".repeat(30), "ana-1"])(
    "takes %s, a handle of the shape [a-z0-9-]{3,30}",
    async (handle) => {
      const w = await publishing();
      expect((await w.ask(OWNER, "PATCH", "/api/account", { handle })).status).toBe(200);
      expect((await w.h.store.user(OWNER))?.handle).toBe(handle);
    },
  );

  it.each([
    ["two characters", "ab"],
    ["thirty-one characters", "a".repeat(31)],
    ["an empty text", ""],
    ["a capital letter", "Ana"],
    ["an underscore", "ana_1"],
    ["a space", "ana 1"],
    ["a leading space", " ana"],
    ["a trailing line break", "ana\n"],
    ["a slash", "a/b"],
    ["a dot", "a.b"],
    ["an accented letter", "añb"],
    ["an emoji", "ana🌊"],
    ["a number", 123],
    ["null", null],
    ["an object", { handle: "ana" }],
  ])("refuses %s with 400 handle.invalid, and changes nothing", async (_name, handle) => {
    const w = await publishing();
    await choose(w, "before");

    const response = await w.ask(OWNER, "PATCH", "/api/account", { handle });

    expect([response.status, await codeOf(response)]).toEqual([400, "handle.invalid"]);
    expect((await w.h.store.user(OWNER))?.handle).toBe("before");
  });

  it("refuses a body without a handle with 400 handle.invalid", async () => {
    const w = await publishing();
    const response = await w.ask(OWNER, "PATCH", "/api/account", { name: "ana" });
    expect([response.status, await codeOf(response)]).toEqual([400, "handle.invalid"]);
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a JSON list", "[]"],
    ["no body at all", ""],
    ["a body over the 8 KiB a JSON request may have", `{"handle":"ana","x":"${"x".repeat(9000)}"}`],
  ])("refuses %s with 400 request.invalid", async (_name, body) => {
    const w = await publishing();
    const response = await w.ask(OWNER, "PATCH", "/api/account", body, JSON_TYPE);
    expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    expect((await w.h.store.user(OWNER))?.handle).toBeNull();
  });

  it("answers 409 handle.taken when another account holds the handle, and the holder keeps it", async () => {
    const w = await publishing();
    await choose(w, "ana", EDITOR);

    const response = await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" });

    expect([response.status, await codeOf(response)]).toEqual([409, "handle.taken"]);
    expect((await w.h.store.user(OWNER))?.handle).toBeNull();
    expect((await w.h.store.user(EDITOR))?.handle).toBe("ana");
  });

  it("changes freely until a publication exists, and answers 409 handle.locked once one does", async () => {
    const w = await publishing();
    await choose(w, "first");
    await choose(w, "second");
    expect((await publish(w, "purchase")).status).toBe(200);

    const response = await w.ask(OWNER, "PATCH", "/api/account", { handle: "third" });

    expect([response.status, await codeOf(response)]).toEqual([409, "handle.locked"]);
    expect((await w.h.store.user(OWNER))?.handle).toBe("second");
    // The address did not move.
    expect((await visit(w, "/second/purchase/")).status).toBe(200);
  });

  it("takes the handle the person has again while a publication exists, and lets it change when the last is gone", async () => {
    const w = await publishing();
    await choose(w, "ana");
    await publish(w, "purchase");

    expect((await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" })).status).toBe(200);

    expect((await w.ask(OWNER, "DELETE", w.url("/publish/purchase"))).status).toBe(204);
    await choose(w, "ana-2");
    expect((await w.h.store.user(OWNER))?.handle).toBe("ana-2");
  });

  it("frees the handle for another person when its holder changes it", async () => {
    const w = await publishing();
    await choose(w, "ana");
    await choose(w, "ana-2");
    await choose(w, "ana", EDITOR);
    expect((await w.h.store.user(EDITOR))?.handle).toBe("ana");
  });

  it("is a person's own to choose, with the page or with their token (the command line publishes with it), and nobody is 401", async () => {
    const w = await publishing();
    const { token } = await addToken(w.h.store, { sub: OWNER });

    const asNobody = await w.ask(NOBODY, "PATCH", "/api/account", { handle: "ana" });
    expect([asNobody.status, await codeOf(asNobody)]).toEqual([401, "auth.required"]);
    expect((await w.h.store.user(OWNER))?.handle).toBeNull();

    const asToken = await w.h.request(
      "/api/account",
      bearer(token, {
        method: "PATCH",
        headers: JSON_TYPE,
        body: JSON.stringify({ handle: "ana" }),
      }),
    );
    expect(asToken.status).toBe(200);
    expect(await asToken.json()).toEqual({ handle: "ana" });
    expect((await w.h.store.user(OWNER))?.handle).toBe("ana");
  });

  it("holds a token to the same rules as the page: another shape, a taken handle and a locked one", async () => {
    const w = await publishing();
    await choose(w, "taken-one", EDITOR);
    const { token } = await addToken(w.h.store, { sub: OWNER });
    const patch = (handle: unknown) =>
      w.h.request(
        "/api/account",
        bearer(token, {
          method: "PATCH",
          headers: JSON_TYPE,
          body: JSON.stringify({ handle }),
        }),
      );

    expect([(await patch("Ana!")).status]).toEqual([400]);
    const taken = await patch("taken-one");
    expect([taken.status, await codeOf(taken)]).toEqual([409, "handle.taken"]);
  });

  it("is refused for a cookie from another page, before the route runs", async () => {
    const w = await publishing();
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    const spy = vi.spyOn(w.h.store, "setHandle");

    for (const origin of [undefined, "null", "https://evil.example", `${ORIGIN}.evil.example`]) {
      const headers: Record<string, string> = { Cookie: cookie, ...JSON_TYPE };
      if (origin !== undefined) headers["Origin"] = origin;
      const response = await w.h.request("/api/account", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ handle: "ana" }),
      });
      expect([response.status, await codeOf(response)], String(origin)).toEqual([
        403,
        "request.forbidden",
      ]);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("answers 401 to a session whose account is gone, and 404 to every other method of the path", async () => {
    const w = await publishing();
    vi.spyOn(w.h.store, "setHandle").mockResolvedValue("missing");
    expect((await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" })).status).toBe(401);
    for (const method of ["GET", "PUT", "POST", "DELETE"]) {
      expect((await w.ask(OWNER, method, "/api/account")).status, method).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe("PUT /api/projects/:id/publish", () => {
  it("stores the page under the handle and the slug and answers its public address", async () => {
    const w = await publishing();
    await choose(w);

    const response = await publish(w, "purchase", page("Purchase"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf<PublishBody>(response)).toEqual({
      url: `https://${HOST}/ana/purchase/`,
      handle: "ana",
      slug: "purchase",
      bytes: bytesOf(page("Purchase")),
      published_at: w.h.clock.now().toISOString(),
    });
    expect(w.h.blobs.text(publishedKey("ana", "purchase"))).toBe(page("Purchase"));
    expect(await w.h.store.publication("ana", "purchase")).toEqual({
      projectId: w.id,
      handle: "ana",
      slug: "purchase",
      publishedAt: w.h.clock.now().toISOString(),
      bytes: bytesOf(page("Purchase")),
    });
  });

  it("is served at /<handle>/purchase/ on the publish host, byte for byte, as the dialog says", async () => {
    const w = await publishing();
    await choose(w);
    // Bytes that are not ASCII, line endings and the text that closes a script: stored as written.
    const html = `<!doctype html>\r\n<title>ñ 🌊</title><script>"</script>"</script>\n`;
    const { url } = await jsonOf<PublishBody>(await publish(w, "purchase", html));

    const served = await visit(w, new URL(url).pathname);

    expect(url).toBe(`https://${HOST}/ana/purchase/`);
    expect(served.status).toBe(200);
    expect(await served.text()).toBe(html);
    expect(w.h.blobs.objects.get(publishedKey("ana", "purchase"))).toEqual(
      new TextEncoder().encode(html),
    );
  });

  it("measures the page in UTF-8 bytes, which is what bytes says", async () => {
    const w = await publishing();
    await choose(w);

    const body = await jsonOf<PublishBody>(await publish(w, "bytes", "ñ🌊"));

    expect(body.bytes).toBe(2 + 4);
    expect((await w.h.store.publication("ana", "bytes"))?.bytes).toBe(6);
  });

  it("replaces a page published under the same slug, and keeps one row for it", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase", page("First"));
    w.h.clock.advance(5 * MINUTE);

    const response = await publish(w, "purchase", page("Second"));

    expect(response.status).toBe(200);
    expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("Second"));
    expect((await stateOf(w)).publications).toEqual([
      {
        slug: "purchase",
        url: `https://${HOST}/ana/purchase/`,
        published_at: w.h.clock.now().toISOString(),
        bytes: bytesOf(page("Second")),
      },
    ]);
  });

  it("publishes several slugs of one project, each at its own address", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "one", page("One"));
    await publish(w, "two", page("Two"));

    expect(await (await visit(w, "/ana/one/")).text()).toBe(page("One"));
    expect(await (await visit(w, "/ana/two/")).text()).toBe(page("Two"));
    expect((await stateOf(w)).publications.map((p) => p.slug)).toEqual(["one", "two"]);
  });

  it("takes a slug of one character and one of sixty", async () => {
    const w = await publishing();
    await choose(w);
    expect((await publish(w, "a")).status).toBe(200);
    expect((await publish(w, "x".repeat(60))).status).toBe(200);
    expect((await publish(w, "-")).status).toBe(200);
    expect((await publish(w, "x".repeat(61))).status).toBe(400);
  });

  it("lets two people publish the same slug under their own handles", async () => {
    const w = await publishing();
    await choose(w, "ana");
    await choose(w, "beto", EDITOR);
    const other = await w.h.store.createProject(
      {
        id: "proj0000000000000099",
        ownerSub: EDITOR,
        name: "Beto's",
        description: "",
        createdAt: w.h.clock.now().toISOString(),
      },
      100,
    );
    expect(other).toBe("created");

    expect((await publish(w, "purchase", page("Ana's"))).status).toBe(200);
    expect(
      (await publish(w, "purchase", page("Beto's"), EDITOR, "proj0000000000000099")).status,
    ).toBe(200);

    expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("Ana's"));
    expect(await (await visit(w, "/beto/purchase/")).text()).toBe(page("Beto's"));
  });

  it("does not read the project's files: the page is the caller's, built by the page from them", async () => {
    const w = await publishing();
    await choose(w);
    const reads = vi.spyOn(w.h.rooms, "read");

    await publish(w, "purchase");

    expect(reads).not.toHaveBeenCalled();
  });

  it("answers 409 handle.required when the person has no handle, and writes nothing", async () => {
    const w = await publishing();
    const puts = vi.spyOn(w.h.blobs, "put");

    const response = await publish(w, "purchase");

    expect([response.status, await codeOf(response)]).toEqual([409, "handle.required"]);
    expect(puts).not.toHaveBeenCalled();
    expect(await w.h.store.publicationsOf(w.id)).toEqual([]);
  });

  describe("the size of the page", () => {
    it("is 413 publish.too-large for 17 MiB, and nothing changes", async () => {
      const w = await publishing();
      await choose(w);
      await publish(w, "purchase", page("Kept"));
      const before = [...w.h.blobs.keys()];

      const response = await publish(w, "purchase", "a".repeat(17 * MIB));

      expect([response.status, await codeOf(response)]).toEqual([413, "publish.too-large"]);
      expect(w.h.blobs.text(publishedKey("ana", "purchase"))).toBe(page("Kept"));
      expect([...w.h.blobs.keys()]).toEqual(before);
      expect((await w.h.store.publication("ana", "purchase"))?.bytes).toBe(bytesOf(page("Kept")));
    });

    it("takes exactly 16 MiB and refuses one byte more", async () => {
      const w = await publishing();
      await choose(w);

      const exactly = await publish(w, "exactly", "a".repeat(16 * MIB));
      const over = await publish(w, "over", "a".repeat(16 * MIB + 1));

      expect(exactly.status).toBe(200);
      expect((await jsonOf<PublishBody>(exactly)).bytes).toBe(16 * MIB);
      expect([over.status, await codeOf(over)]).toEqual([413, "publish.too-large"]);
      expect(await w.h.store.publication("ana", "over")).toBeUndefined();
      expect(w.h.blobs.objects.has(publishedKey("ana", "over"))).toBe(false);
    });

    it("counts bytes and not characters: 8 Mi two-byte letters fit, one more does not", async () => {
      const w = await publishing();
      await choose(w);

      const fits = await publish(w, "fits", "ñ".repeat(8 * MIB));
      const over = await publish(w, "over", "ñ".repeat(8 * MIB + 1));

      expect(fits.status).toBe(200);
      expect((await jsonOf<PublishBody>(fits)).bytes).toBe(16 * MIB);
      expect([over.status, await codeOf(over)]).toEqual([413, "publish.too-large"]);
    });

    it("reads no more than the cap of a body that does not end, and is 413 publish.too-large", async () => {
      const w = await publishing();
      await choose(w);
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
      const { cookie } = await w.h.signedIn({ sub: OWNER });

      const response = await w.h.request(
        w.url("/publish"),
        w.h.fromPage(cookie, {
          method: "PUT",
          headers: JSON_TYPE,
          body: stream,
          duplex: "half",
        } as RequestInit),
      );

      expect([response.status, await codeOf(response)]).toEqual([413, "publish.too-large"]);
      expect(state.pulled * 64 * 1024).toBeLessThanOrEqual(MAX_PUBLISH_BODY + 3 * 64 * 1024);
      expect(state.released).toBe(true);
    });

    it("says at once, unread, that a body that declares more than the cap is too large", async () => {
      const w = await publishing();
      await choose(w);

      const response = await w.ask(OWNER, "PUT", w.url("/publish"), '{"slug":"a","html":"x"}', {
        ...JSON_TYPE,
        "Content-Length": String(MAX_PUBLISH_BODY + 1),
      });

      expect([response.status, await codeOf(response)]).toEqual([413, "publish.too-large"]);
    });

    it("judges a page that JSON writes longer than it is by the page: quotes and line breaks cost two bytes in the body", async () => {
      const w = await publishing();
      await choose(w);
      // 8 MiB of line breaks are 16 MiB of JSON: more than the limit of the page, within the cap of
      // a body (the limit and eight MiB for what JSON adds), so the page is judged by its own size.
      const fits = await publish(w, "lines", "\n".repeat(8 * MIB));
      expect(fits.status).toBe(200);
      expect((await jsonOf<PublishBody>(fits)).bytes).toBe(8 * MIB);
    });
  });

  describe("a request that is not valid", () => {
    it.each([
      ["no slug", { html: page() }],
      ["an empty slug", { slug: "", html: page() }],
      ["a slug that is a number", { slug: 1, html: page() }],
      ["a slug with a capital", { slug: "Purchase", html: page() }],
      ["a slug with a space", { slug: "my page", html: page() }],
      ["a slug with a slash", { slug: "a/b", html: page() }],
      ["a slug with a dot", { slug: "index.html", html: page() }],
      ["a slug with an underscore", { slug: "a_b", html: page() }],
      ["a slug with an accent", { slug: "página", html: page() }],
      ["a slug with a line break", { slug: "abc\n", html: page() }],
      ["a slug of sixty-one characters", { slug: "a".repeat(61), html: page() }],
      ["no html", { slug: "purchase" }],
      ["html that is a number", { slug: "purchase", html: 5 }],
      ["html that is null", { slug: "purchase", html: null }],
      ["html that is a list", { slug: "purchase", html: ["<p>"] }],
      ["html that is empty", { slug: "purchase", html: "" }],
    ])("is 400 publish.invalid for %s, and writes nothing", async (_name, body) => {
      const w = await publishing();
      await choose(w);
      const puts = vi.spyOn(w.h.blobs, "put");

      const response = await w.ask(OWNER, "PUT", w.url("/publish"), body);

      expect([response.status, await codeOf(response)]).toEqual([400, "publish.invalid"]);
      expect(puts).not.toHaveBeenCalled();
      expect(await w.h.store.publicationsOf(w.id)).toEqual([]);
    });

    it.each([
      ["a body that is not JSON", "nope"],
      ["a JSON list", "[]"],
      ["a JSON text", '"text"'],
      ["no body", ""],
    ])("is 400 request.invalid for %s", async (_name, body) => {
      const w = await publishing();
      await choose(w);
      const response = await w.ask(OWNER, "PUT", w.url("/publish"), body, JSON_TYPE);
      expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    });

    it("does not count against the hour: ten requests that were refused leave the ten that are valid", async () => {
      const w = await publishing();
      await choose(w);
      for (let n = 0; n < 12; n++) {
        expect((await publish(w, "Bad Slug")).status).toBe(400);
      }
      for (let n = 0; n < 10; n++)
        expect((await publish(w, "page", page(`v${n}`))).status).toBe(200);
      expect((await publish(w, "page")).status).toBe(429);
    });
  });

  describe("the rate of ten requests an hour per project", () => {
    it("answers 429 publish.rate to the eleventh, with Retry-After, and writes nothing", async () => {
      const w = await publishing();
      await choose(w);
      for (let n = 0; n < 10; n++) {
        w.h.clock.advance(MINUTE);
        expect((await publish(w, `slug-${n}`, page(`v${n}`))).status, `request ${n + 1}`).toBe(200);
      }
      const before = [...w.h.blobs.keys()];

      const response = await publish(w, "slug-10", page("Eleventh"));

      expect([response.status, await codeOf(response)]).toEqual([429, "publish.rate"]);
      // The first was made 9 minutes ago: it stops counting 51 minutes from now.
      expect(response.headers.get("Retry-After")).toBe(String(51 * 60));
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect([...w.h.blobs.keys()]).toEqual(before);
      expect(await w.h.store.publication("ana", "slug-10")).toBeUndefined();
    });

    it("counts requests, not publications: ten times the same slug is ten, and the eleventh is refused", async () => {
      const w = await publishing();
      await choose(w);
      for (let n = 0; n < 10; n++) {
        expect((await publish(w, "page", page(`v${n}`))).status, `request ${n + 1}`).toBe(200);
      }
      // One row, which publishing it again each time replaced and renewed: it could not count them.
      expect(await w.h.store.publicationsOf(w.id)).toHaveLength(1);

      const response = await publish(w, "page", page("Eleventh"));

      expect([response.status, await codeOf(response)]).toEqual([429, "publish.rate"]);
      expect(await (await visit(w, "/ana/page/")).text()).toBe(page("v9"));
    });

    it("lets one through when the earliest request of the hour is more than an hour old", async () => {
      const w = await publishing();
      await choose(w);
      for (let n = 0; n < 10; n++) await publish(w, "page", page(`v${n}`));
      expect((await publish(w, "page")).status).toBe(429);

      // Exactly an hour after the earliest it still counts; a millisecond later it does not.
      w.h.clock.advance(HOUR);
      expect((await publish(w, "page")).status).toBe(429);
      w.h.clock.advance(1);
      expect((await publish(w, "page", page("Again"))).status).toBe(200);
      expect(await (await visit(w, "/ana/page/")).text()).toBe(page("Again"));
    });

    it("counts each project apart, and a person with two projects publishes ten of each", async () => {
      const w = await publishing();
      await choose(w);
      const second = "proj0000000000000099";
      await w.h.store.createProject(
        {
          id: second,
          ownerSub: OWNER,
          name: "Second",
          description: "",
          createdAt: w.h.clock.now().toISOString(),
        },
        100,
      );
      for (let n = 0; n < 10; n++) await publish(w, "first", page(`v${n}`));
      expect((await publish(w, "first")).status).toBe(429);

      expect((await publish(w, "second", page("Two"), OWNER, second)).status).toBe(200);
    });

    it("sweeps what nobody comes back for before it adds to the log", async () => {
      const w = await publishing();
      await choose(w);
      const sweep = vi.spyOn(w.h.store, "sweep");

      await publish(w, "page");

      expect(sweep).toHaveBeenCalledTimes(1);
      expect(sweep).toHaveBeenCalledWith(w.h.clock.now().toISOString());
    });
  });

  describe("an address another of the person's projects holds", () => {
    const second = "proj0000000000000099";
    const second_ = async (w: World) =>
      w.h.store.createProject(
        {
          id: second,
          ownerSub: OWNER,
          name: "Second",
          description: "",
          createdAt: w.h.clock.now().toISOString(),
        },
        100,
      );

    it("is 409 publish.taken, and the page that is there is not touched", async () => {
      const w = await publishing();
      await choose(w);
      await second_(w);
      await publish(w, "purchase", page("The first"));

      const response = await publish(w, "purchase", page("The second"), OWNER, second);

      expect([response.status, await codeOf(response)]).toEqual([409, "publish.taken"]);
      expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("The first"));
      expect(await w.h.store.publicationsOf(second)).toEqual([]);
    });

    it("keeps the first page when two projects race for a new address: only the one that gets the row writes", async () => {
      const w = await publishing();
      await choose(w);
      await second_(w);
      await publish(w, "purchase", page("The first"));
      const puts = vi.spyOn(w.h.blobs, "put");
      // The first took the address between the second's look at it (which found nothing) and its claim.
      const look = vi.spyOn(w.h.store, "publication").mockResolvedValueOnce(undefined);

      const response = await publish(w, "purchase", page("The second"), OWNER, second);

      expect(look).toHaveBeenCalled();
      expect([response.status, await codeOf(response)]).toEqual([409, "publish.taken"]);
      expect(puts).not.toHaveBeenCalled();
      expect(w.h.blobs.text(publishedKey("ana", "purchase"))).toBe(page("The first"));
    });
  });

  describe("when the bucket or the project fails", () => {
    it("takes a new address back when the page cannot be stored, and the owner publishes again", async () => {
      const w = await publishing();
      await choose(w);
      vi.spyOn(console, "error").mockImplementation(() => {});
      w.h.blobs.refuse = (op) => op === "put";

      const failed = await publish(w, "purchase");

      expect(failed.status).toBe(500);
      expect(await w.h.store.publication("ana", "purchase")).toBeUndefined();
      expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(false);
      w.h.blobs.refuse = undefined;
      expect((await publish(w, "purchase", page("Back"))).status).toBe(200);
      expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("Back"));
    });

    it("leaves a page that is replaced as it was when the new one cannot be stored", async () => {
      const w = await publishing();
      await choose(w);
      await publish(w, "purchase", page("Kept"));
      const row = await w.h.store.publication("ana", "purchase");
      vi.spyOn(console, "error").mockImplementation(() => {});
      w.h.blobs.refuse = (op) => op === "put";
      w.h.clock.advance(MINUTE);

      const failed = await publish(w, "purchase", page("Lost"));

      expect(failed.status).toBe(500);
      expect(await w.h.store.publication("ana", "purchase")).toEqual(row);
      expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("Kept"));
    });

    it("answers 404 project.not-found, and writes nothing, when the project is gone before the request is counted", async () => {
      const w = await publishing();
      await choose(w);
      vi.spyOn(w.h.store, "claimPublish").mockResolvedValue({ status: "missing" });
      const puts = vi.spyOn(w.h.blobs, "put");

      const response = await publish(w, "purchase");

      expect([response.status, await codeOf(response)]).toEqual([404, "project.not-found"]);
      expect(puts).not.toHaveBeenCalled();
    });

    it("takes the page back when the project is deleted while a new page replaces the old one", async () => {
      const w = await publishing();
      await choose(w);
      await publish(w, "purchase", page("Kept"));
      w.h.clock.advance(MINUTE);
      vi.spyOn(w.h.store, "putPublication").mockResolvedValue("missing");

      const response = await publish(w, "purchase", page("Late"));

      expect([response.status, await codeOf(response)]).toEqual([404, "project.not-found"]);
      expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(false);
    });
  });

  describe("who may publish", () => {
    it("is the owner's: an editor is 403 access.denied, as is a viewer, and nothing is written", async () => {
      const w = await publishing();
      await choose(w);
      const puts = vi.spyOn(w.h.blobs, "put");

      for (const who of [EDITOR, VIEWER]) {
        const response = await publish(w, "purchase", page(), who);
        expect([response.status, await codeOf(response)], who).toEqual([403, "access.denied"]);
      }
      expect(puts).not.toHaveBeenCalled();
      expect(await w.h.store.publicationsOf(w.id)).toEqual([]);
    });

    it("is 404 project.not-found for a signed-in stranger of a private project, and 403 for anyone on a link", async () => {
      const priv = await publishing("private");
      expect((await publish(priv, "a", page(), STRANGER)).status).toBe(404);
      expect((await publish(priv, "a", page(), NOBODY)).status).toBe(404);
      for (const link of ["view", "edit"] as const) {
        const w = await publishing(link);
        for (const who of [STRANGER, NOBODY]) {
          const response = await publish(w, "a", page(), who);
          expect([response.status, await codeOf(response)], `${who} on ${link}`).toEqual([
            403,
            "access.denied",
          ]);
        }
      }
    });

    it("is open to a bearer token of the owner, which needs no Origin", async () => {
      const w = await publishing();
      await choose(w);
      const { token } = await addToken(w.h.store, { sub: OWNER });

      const response = await w.h.request(
        w.url("/publish"),
        bearer(token, {
          method: "PUT",
          headers: JSON_TYPE,
          body: JSON.stringify({ slug: "purchase", html: page() }),
        }),
      );

      expect(response.status).toBe(200);
      expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    });

    it("is refused for a cookie from another page, before the route runs", async () => {
      const w = await publishing();
      await choose(w);
      const { cookie } = await w.h.signedIn({ sub: OWNER });
      const claim = vi.spyOn(w.h.store, "claimPublish");

      const response = await w.h.request(w.url("/publish"), {
        method: "PUT",
        headers: { Cookie: cookie, Origin: "https://evil.example", ...JSON_TYPE },
        body: JSON.stringify({ slug: "purchase", html: page() }),
      });

      expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
      expect(claim).not.toHaveBeenCalled();
    });
  });

  describe("the address of the page", () => {
    it("is under /_published/ on the Worker's own origin in development, which has no publish host", async () => {
      const w = await world("private", { env: { DEV: "true" } });
      await choose(w);

      const body = await jsonOf<PublishBody>(await publish(w, "purchase"));

      expect(body.url).toBe(`${ORIGIN}/_published/ana/purchase/`);
    });

    it("cannot be given where no publish host is set, and nothing is written", async () => {
      const w = await world("private");
      await choose(w);
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const puts = vi.spyOn(w.h.blobs, "put");
      const claim = vi.spyOn(w.h.store, "claimPublish");

      const response = await publish(w, "purchase");

      expect([response.status, await codeOf(response)]).toEqual([500, "internal"]);
      expect(puts).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
      expect(await w.h.store.publicationsOf(w.id)).toEqual([]);
      expect(String(logged.mock.calls[0]?.[1])).toContain("PUBLISH_HOST is not set");
    });

    it.each([
      ["an upper-case name", "Meltemi.Page"],
      ["a name with a scheme", "https://meltemi.page"],
      ["a name with a path", "meltemi.page/x"],
      ["a name with a port", "meltemi.page:8787"],
      ["a name with no dot", "localhost"],
      ["the service's own host", "diagrams.meltemi.dev"],
      ["the family's domain", "meltemi.dev"],
      ["a host under the family's domain", "publish.meltemi.dev"],
    ])(
      "is refused, with the variable's name in the log and not its value, for %s",
      async (_name, value) => {
        const w = await world("private", { env: { PUBLISH_HOST: value } });
        await choose(w);
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        const puts = vi.spyOn(w.h.blobs, "put");

        const response = await publish(w, "purchase");

        expect([response.status, await codeOf(response)]).toEqual([500, "internal"]);
        expect(puts).not.toHaveBeenCalled();
        const text = JSON.stringify(logged.mock.calls);
        expect(text).toContain("PUBLISH_HOST");
        expect(text).not.toContain(value);
      },
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe("GET /api/projects/:id/publish", () => {
  it("says there is no handle and nothing published for a project that has neither", async () => {
    const w = await publishing();

    const response = await w.ask(OWNER, "GET", w.url("/publish"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await jsonOf(response)).toEqual({ handle: null, publications: [], takedowns: [] });
  });

  it("lists the project's publications, the earliest first, each with its address, and the handle", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "one", page("One"));
    w.h.clock.advance(MINUTE);
    await publish(w, "two", page("Two"));

    expect(await stateOf(w)).toEqual({
      handle: "ana",
      publications: [
        {
          slug: "one",
          url: `https://${HOST}/ana/one/`,
          published_at: "2026-10-14T12:00:00.000Z",
          bytes: bytesOf(page("One")),
        },
        {
          slug: "two",
          url: `https://${HOST}/ana/two/`,
          published_at: "2026-10-14T12:01:00.000Z",
          bytes: bytesOf(page("Two")),
        },
      ],
      takedowns: [],
    });
  });

  it("lists only this project's publications", async () => {
    const w = await publishing();
    await choose(w);
    const second = "proj0000000000000099";
    await w.h.store.createProject(
      {
        id: second,
        ownerSub: OWNER,
        name: "Second",
        description: "",
        createdAt: w.h.clock.now().toISOString(),
      },
      100,
    );
    await publish(w, "mine", page());
    await publish(w, "theirs", page(), OWNER, second);

    expect((await stateOf(w)).publications.map((p) => p.slug)).toEqual(["mine"]);
    expect((await stateOf(w, OWNER, second)).publications.map((p) => p.slug)).toEqual(["theirs"]);
  });

  it("works with a bearer token, and in development names the Worker's own /_published/", async () => {
    const w = await world("private", { env: { DEV: "true" } });
    await choose(w);
    await publish(w, "purchase");
    const { token } = await addToken(w.h.store, { sub: OWNER });

    const response = await w.h.request(w.url("/publish"), bearer(token));

    expect((await jsonOf<PublishState>(response)).publications[0]?.url).toBe(
      `${ORIGIN}/_published/ana/purchase/`,
    );
  });

  it("is the owner's: an editor, a viewer and a stranger are refused, and a private project is not there for strangers", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");

    const refused = async (who: string) => {
      const response = await w.ask(who, "GET", w.url("/publish"));
      return [response.status, await codeOf(response)];
    };
    expect(await refused(EDITOR)).toEqual([403, "access.denied"]);
    expect(await refused(VIEWER)).toEqual([403, "access.denied"]);
    expect(await refused(STRANGER)).toEqual([404, "project.not-found"]);
    expect(await refused(NOBODY)).toEqual([404, "project.not-found"]);
  });

  it("needs no publish host while the project publishes nothing, and an internal error names the variable when it does", async () => {
    const w = await world("private");
    expect((await w.ask(OWNER, "GET", w.url("/publish"))).status).toBe(200);
    await choose(w);
    await w.h.store.putPublication({
      projectId: w.id,
      handle: "ana",
      slug: "purchase",
      publishedAt: w.h.clock.now().toISOString(),
      bytes: 1,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await w.ask(OWNER, "GET", w.url("/publish"));

    expect([response.status, await codeOf(response)]).toEqual([500, "internal"]);
    expect(String(logged.mock.calls[0]?.[1])).toContain("PUBLISH_HOST");
  });
});

// ---------------------------------------------------------------------------------------------

describe("DELETE /api/projects/:id/publish/:slug", () => {
  it("removes the page and the row, and the address answers 404", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    await publish(w, "keep");
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);

    const response = await w.ask(OWNER, "DELETE", w.url("/publish/purchase"));

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect((await visit(w, "/ana/purchase/")).status).toBe(404);
    expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(false);
    expect(await w.h.store.publication("ana", "purchase")).toBeUndefined();
    // The other slug is as it was.
    expect((await visit(w, "/ana/keep/")).status).toBe(200);
    expect((await stateOf(w)).publications.map((p) => p.slug)).toEqual(["keep"]);
  });

  it("does not take a request off the rate: unpublishing is not a publish request, and a slug can be published again", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    await w.ask(OWNER, "DELETE", w.url("/publish/purchase"));

    expect((await publish(w, "purchase", page("Back"))).status).toBe(200);
    expect(await (await visit(w, "/ana/purchase/")).text()).toBe(page("Back"));
  });

  it.each([
    ["a slug nothing is published under", "nothing"],
    ["a slug that is not one", "Not A Slug"],
    ["a slug with a dot", "index.html"],
    ["a slug of sixty-one characters", "a".repeat(61)],
  ])("is 404 not-found for %s", async (_name, slug) => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    const deletes = vi.spyOn(w.h.blobs, "delete");

    const response = await w.ask(OWNER, "DELETE", w.url(`/publish/${encodeURIComponent(slug)}`));

    expect([response.status, await codeOf(response)]).toEqual([404, "not-found"]);
    expect(deletes).not.toHaveBeenCalled();
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
  });

  it("is 404 not-found for a slug another project of the person publishes, and leaves it", async () => {
    const w = await publishing();
    await choose(w);
    const second = "proj0000000000000099";
    await w.h.store.createProject(
      {
        id: second,
        ownerSub: OWNER,
        name: "Second",
        description: "",
        createdAt: w.h.clock.now().toISOString(),
      },
      100,
    );
    await publish(w, "theirs", page(), OWNER, second);

    const response = await w.ask(OWNER, "DELETE", w.url("/publish/theirs"));

    expect(response.status).toBe(404);
    expect((await visit(w, "/ana/theirs/")).status).toBe(200);
  });

  it("deletes the page first: a bucket that refuses leaves the publication as it was, and a second try works", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    vi.spyOn(console, "error").mockImplementation(() => {});
    w.h.blobs.refuse = (op) => op === "delete";

    const failed = await w.ask(OWNER, "DELETE", w.url("/publish/purchase"));

    expect(failed.status).toBe(500);
    expect(await w.h.store.publication("ana", "purchase")).toBeDefined();
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    w.h.blobs.refuse = undefined;
    expect((await w.ask(OWNER, "DELETE", w.url("/publish/purchase"))).status).toBe(204);
  });

  it("leaves a row with no page, which nobody is served, when the row cannot be removed, and a second try finishes", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remove = vi.spyOn(w.h.store, "deletePublication").mockRejectedValueOnce(new Error("D1"));

    const failed = await w.ask(OWNER, "DELETE", w.url("/publish/purchase"));

    expect(failed.status).toBe(500);
    expect(remove).toHaveBeenCalledTimes(1);
    expect((await visit(w, "/ana/purchase/")).status).toBe(404);
    expect((await w.ask(OWNER, "DELETE", w.url("/publish/purchase"))).status).toBe(204);
    expect(await w.h.store.publication("ana", "purchase")).toBeUndefined();
  });

  it("is the owner's: an editor is 403, a stranger of a private project is 404, and the page stays", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");

    for (const [who, status] of [
      [EDITOR, 403],
      [VIEWER, 403],
      [STRANGER, 404],
      [NOBODY, 404],
    ] as const) {
      expect((await w.ask(who, "DELETE", w.url("/publish/purchase"))).status, who).toBe(status);
    }
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
  });

  it("is open to a bearer token, and refused for a cookie from another page", async () => {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase");
    await publish(w, "other");
    const { token } = await addToken(w.h.store, { sub: OWNER });
    const { cookie } = await w.h.signedIn({ sub: OWNER });

    const foreign = await w.h.request(w.url("/publish/purchase"), {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);

    const asToken = await w.h.request(
      w.url("/publish/purchase"),
      bearer(token, { method: "DELETE" }),
    );
    expect(asToken.status).toBe(204);
    expect((await visit(w, "/ana/purchase/")).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------

describe("DELETE /api/admin/publications/:handle/:slug (the takedown)", () => {
  const url = (handle = "ana", slug = "purchase") => `/api/admin/publications/${handle}/${slug}`;

  /** The administrator and a published page of the owner. */
  async function published() {
    const w = await publishing();
    await choose(w);
    await publish(w, "purchase", page("Spam"));
    await publish(w, "keep", page("Fine"));
    return w;
  }

  it("removes the page and the row, records who, why and when, and the address answers 404", async () => {
    const w = await published();
    w.h.clock.advance(HOUR);

    const response = await w.ask(ADMIN, "DELETE", url(), { reason: "  spam  " });

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await visit(w, "/ana/purchase/")).status).toBe(404);
    expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(false);
    expect(await w.h.store.publication("ana", "purchase")).toBeUndefined();
    expect(await w.h.store.takedownsOf("ana")).toEqual([
      {
        handle: "ana",
        slug: "purchase",
        bySub: ADMIN,
        reason: "spam",
        at: w.h.clock.now().toISOString(),
        projectId: w.id,
      },
    ]);
    // Only that page: the other is as it was.
    expect((await visit(w, "/ana/keep/")).status).toBe(200);
  });

  it("logs the takedown with the address and the reason", async () => {
    const w = await published();
    w.h.clock.advance(HOUR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "spam" });
    expect(await w.h.store.adminLog(10)).toMatchObject([
      { bySub: ADMIN, action: "takedown", targetSub: null, detail: "ana/purchase: spam" },
    ]);
  });

  it("is open to an administrator an owner invited, not listed in ADMIN_SUBS", async () => {
    const w = await published();
    const at = w.h.clock.now().toISOString();
    const id = "0123456789abcdef0123456789abcdef";
    const log = (n: number, action: "invite" | "accept") => ({
      id: String(n).padStart(32, "0"),
      at,
      bySub: ADMIN,
      action,
      targetSub: null,
      targetEmail: null,
      detail: "",
    });
    await w.h.store.createAdminInvitation(
      {
        id,
        email: "carla@example.com",
        invitedBy: ADMIN,
        createdAt: at,
        expiresAt: new Date(Date.parse(at) + HOUR).toISOString(),
        acceptedAt: null,
        declinedAt: null,
        revokedAt: null,
      },
      10,
      log(1, "invite"),
    );
    await w.h.store.acceptAdminInvitation(
      id,
      "u-carla",
      "carla@example.com",
      at,
      20,
      log(2, "accept"),
    );

    const response = await w.ask("u-carla", "DELETE", url(), { reason: "spam" });

    expect(response.status).toBe(204);
    expect((await w.h.store.takedownsOf("ana"))[0]?.bySub).toBe("u-carla");
  });

  it("shows the owner the publication as removed by the service, with the reason", async () => {
    const w = await published();
    w.h.clock.advance(HOUR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "spam" });

    const state = await stateOf(w);

    expect(state.publications.map((p) => p.slug)).toEqual(["keep"]);
    expect(state.takedowns).toEqual([
      { slug: "purchase", at: w.h.clock.now().toISOString(), reason: "spam" },
    ]);
  });

  it("takes no body: the reason is optional and then empty", async () => {
    const w = await published();
    const response = await w.ask(ADMIN, "DELETE", url());
    expect(response.status).toBe(204);
    expect((await w.h.store.takedownsOf("ana"))[0]?.reason).toBe("");
  });

  it.each([
    ["a reason that is not text", { reason: 5 }],
    ["a reason of 501 characters", { reason: "x".repeat(501) }],
    ["a reason with a control character", { reason: "bad\u0007bell" }],
    ["a body that is not JSON", "nope"],
    ["a body that is a list", "[]"],
  ])("is 400 request.invalid for %s, and removes nothing", async (_name, body) => {
    const w = await published();
    const response = await w.ask(ADMIN, "DELETE", url(), body, JSON_TYPE);
    expect([response.status, await codeOf(response)]).toEqual([400, "request.invalid"]);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    expect(await w.h.store.takedownsOf("ana")).toEqual([]);
  });

  it("keeps a reason of 500 characters, with line breaks, as it was written", async () => {
    const w = await published();
    const reason = `${"x".repeat(498)}\nñ`;
    await w.ask(ADMIN, "DELETE", url(), { reason });
    expect((await w.h.store.takedownsOf("ana"))[0]?.reason).toBe(reason);
  });

  it("is 404 not-found, the answer of a route that is not there, for everyone who is not an administrator", async () => {
    const w = await published();
    const unknown = await w.ask(ADMIN, "DELETE", "/api/admin/nothing");
    const answers = [];
    for (const who of [OWNER, EDITOR, STRANGER, NOBODY]) {
      const response = await w.ask(who, "DELETE", url(), { reason: "x" });
      answers.push([who, response.status, await response.clone().json()]);
    }
    const expected = await jsonOf(unknown);

    for (const [who, status, body] of answers) {
      expect(status, String(who)).toBe(404);
      expect(body, String(who)).toEqual(expected);
    }
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    expect(await w.h.store.takedownsOf("ana")).toEqual([]);
  });

  it("answers an administrator's API token 404 too: an administrator acts on the page", async () => {
    const w = await published();
    const { token } = await addToken(w.h.store, { sub: ADMIN });

    const response = await w.h.request(
      url(),
      bearer(token, { method: "DELETE", headers: JSON_TYPE, body: "{}" }),
    );

    expect([response.status, await codeOf(response)]).toEqual([404, "not-found"]);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
  });

  it("applies the Origin rule to an administrator's cookie, as to any change made with it", async () => {
    const w = await published();
    const { cookie } = await w.h.signedIn({ sub: ADMIN });

    const response = await w.h.request(url(), {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    });

    expect([response.status, await codeOf(response)]).toEqual([403, "request.forbidden"]);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
  });

  it("lists nobody when ADMIN_SUBS is not set, and lists people by their exact sub, trimmed, among empty entries", async () => {
    const none = await world("private", { env: { PUBLISH_HOST: HOST } });
    await choose(none);
    await publish(none, "purchase");
    expect((await none.ask(ADMIN, "DELETE", url())).status).toBe(404);
    expect((await none.ask(OWNER, "DELETE", url())).status).toBe(404);

    const w = await world("private", {
      env: { PUBLISH_HOST: HOST, ADMIN_SUBS: " u-one ,, u-admin ,  " },
    });
    await choose(w);
    await publish(w, "purchase");
    expect((await w.ask("u-adm", "DELETE", url())).status).toBe(404);
    expect((await w.ask("u-admin-2", "DELETE", url())).status).toBe(404);
    expect((await w.ask(ADMIN, "DELETE", url())).status).toBe(204);
  });

  it.each([
    ["a publication that is not there", "ana", "nothing"],
    ["a handle that is not one", "A", "purchase"],
    ["a slug that is not one", "ana", "Not-A-Slug"],
    ["another person's handle", "beto", "purchase"],
  ])("is 404 not-found for %s, with a message that says so", async (_name, handle, slug) => {
    const w = await published();
    const deletes = vi.spyOn(w.h.blobs, "delete");

    const response = await w.ask(ADMIN, "DELETE", url(handle, slug));

    expect([response.status, await codeOf(response)]).toEqual([404, "not-found"]);
    expect((await jsonOf<{ message: string }>(response)).message).toBe(
      "There is no such publication.",
    );
    expect(deletes).not.toHaveBeenCalled();
  });

  it("is a second 404 for the same address, and records one takedown", async () => {
    const w = await published();
    expect((await w.ask(ADMIN, "DELETE", url())).status).toBe(204);
    expect((await w.ask(ADMIN, "DELETE", url())).status).toBe(404);
    expect(await w.h.store.takedownsOf("ana")).toHaveLength(1);
  });

  it("deletes the page first: a bucket that refuses leaves everything as it was, and a second try works", async () => {
    const w = await published();
    vi.spyOn(console, "error").mockImplementation(() => {});
    w.h.blobs.refuse = (op) => op === "delete";

    const failed = await w.ask(ADMIN, "DELETE", url(), { reason: "spam" });

    expect(failed.status).toBe(500);
    expect(await w.h.store.publication("ana", "purchase")).toBeDefined();
    expect(await w.h.store.takedownsOf("ana")).toEqual([]);
    w.h.blobs.refuse = undefined;
    expect((await w.ask(ADMIN, "DELETE", url(), { reason: "spam" })).status).toBe(204);
  });

  it("leaves a row with no page, which nobody is served, when the record fails, and a second try finishes", async () => {
    const w = await published();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(w.h.store, "takeDown").mockRejectedValueOnce(new Error("D1"));

    const failed = await w.ask(ADMIN, "DELETE", url());

    expect(failed.status).toBe(500);
    expect((await visit(w, "/ana/purchase/")).status).toBe(404);
    expect((await w.ask(ADMIN, "DELETE", url())).status).toBe(204);
    expect(await w.h.store.takedownsOf("ana")).toHaveLength(1);
  });

  it("does not show a project the takedowns made of other people's pages under the same handle: another person held the handle then", async () => {
    const w = await published();
    // A takedown of an address under the same handle, of a project that is somebody else's.
    const theirs = await w.create(STRANGER, { name: "Theirs", files: { "t.md": "t\n" } });
    await w.h.store.putPublication({
      projectId: theirs,
      handle: "ana",
      slug: "old",
      publishedAt: "2020-01-01T00:00:00.000Z",
      bytes: 1,
    });
    await w.h.store.takeDown({
      handle: "ana",
      slug: "old",
      bySub: ADMIN,
      reason: "long ago",
      at: "2020-01-02T00:00:00.000Z",
    });
    w.h.clock.advance(HOUR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "now" });

    expect((await stateOf(w)).takedowns.map((t) => t.reason)).toEqual(["now"]);
  });

  it("does not show the removal of a page to an older account that takes the handle after the person it was taken down from let it go", async () => {
    const w = await published();
    // The bystander is an account older than the takedown, with a project and no handle yet.
    const theirs = await w.create(VIEWER, { name: "Viewer's", files: { "v.md": "v\n" } });
    w.h.clock.advance(HOUR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "phishing: impersonates a bank" });
    await w.ask(ADMIN, "DELETE", url("ana", "keep"), { reason: "spam" });
    // The owner has no publication left, so the handle is theirs to let go.
    await choose(w, "ana-two");

    await choose(w, "ana", VIEWER);
    const seen = await stateOf(w, VIEWER, theirs);

    expect(seen.handle).toBe("ana");
    expect(seen.takedowns).toEqual([]);
  });

  it("stops listing a takedown once the owner publishes the slug again, and does not stop them", async () => {
    const w = await published();
    w.h.clock.advance(HOUR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "spam" });
    expect((await stateOf(w)).takedowns).toHaveLength(1);
    w.h.clock.advance(MINUTE);

    const again = await publish(w, "purchase", page("Fixed"));

    expect(again.status).toBe(200);
    expect((await stateOf(w)).takedowns).toEqual([]);
    expect((await visit(w, "/ana/purchase/")).status).toBe(200);
    // The service's record stays.
    expect(await w.h.store.takedownsOf("ana")).toHaveLength(1);
  });

  it("shows a takedown to the owner of the handle and to nobody else", async () => {
    const w = await published();
    await choose(w, "beto", EDITOR);
    await w.ask(ADMIN, "DELETE", url(), { reason: "spam" });

    expect((await stateOf(w)).takedowns).toHaveLength(1);
    // Another person, with a handle and a project of their own, sees none.
    const second = "proj0000000000000099";
    await w.h.store.createProject(
      {
        id: second,
        ownerSub: EDITOR,
        name: "Beto's",
        description: "",
        createdAt: w.h.clock.now().toISOString(),
      },
      100,
    );
    expect((await stateOf(w, EDITOR, second)).takedowns).toEqual([]);
  });
});

describe("a handle that changes while a page is being published", () => {
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it("publishes under the handle the owner has when the body arrives, not the one before it", async () => {
    const w = await publishing();
    await choose(w, "ana");
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const bytes = new TextEncoder().encode(JSON.stringify({ slug: "slow", html: page() }));
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await gate;
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const slow = w.h.request(
      w.url("/publish"),
      w.h.fromPage(cookie, {
        method: "PUT",
        headers: JSON_TYPE,
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    // The request has read the handle and waits for its body.
    for (let n = 0; n < 20; n++) await settle();

    // No publication exists, so the handle may change.
    await choose(w, "ana-two");
    release();
    const response = await slow;

    expect(response.status).toBe(200);
    expect((await jsonOf<PublishBody>(response)).handle).toBe("ana-two");
    expect(await w.h.store.publication("ana", "slow")).toBeUndefined();
    expect(w.h.blobs.objects.has(publishedKey("ana", "slow"))).toBe(false);
    expect((await w.h.store.publication("ana-two", "slow"))?.projectId).toBe(w.id);
    expect((await visit(w, "/ana-two/slow/")).status).toBe(200);
    // And the handle is locked by it, as it should be.
    expect((await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana-three" })).status).toBe(409);
  });

  it("is refused when the handle changes after it was read the last time, and nothing is left under the old one", async () => {
    const w = await publishing();
    await choose(w, "ana");
    const claim = w.h.store.claimPublish.bind(w.h.store);
    vi.spyOn(w.h.store, "claimPublish").mockImplementationOnce(async (...args) => {
      // The very last moment before the row is recorded.
      await choose(w, "ana-two");
      return claim(...args);
    });

    const response = await publish(w, "late");

    expect([response.status, await codeOf(response)]).toEqual([409, "handle.required"]);
    expect(await w.h.store.publication("ana", "late")).toBeUndefined();
    expect(await w.h.store.publicationsOf(w.id)).toEqual([]);
    expect(w.h.blobs.objects.has(publishedKey("ana", "late"))).toBe(false);
    // The owner publishes again and it goes under the handle they have.
    expect((await publish(w, "late")).status).toBe(200);
    expect((await w.h.store.publication("ana-two", "late"))?.projectId).toBe(w.id);
  });
});
