// The publish host (`publishing`, "The publish host serves publications only"): the second, minimal
// Worker, as a plain function over a fake bucket and a store; its Cloudflare entry over the real SQL
// of node:sqlite; the development route of the main Worker that serves the same page and headers
// under `/_published/`; and what keeps the Worker minimal (what it imports, what its configuration
// binds). What the routes store is publish-routes.test.ts; here a publication is made directly.

import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishedKey } from "../src/keys.js";
import { addressOf, publishHost, PUBLISHED_HEADERS } from "../src/publish.js";
import publishWorker from "../src/publish-worker.js";
import { d1Store } from "../src/store/d1.js";
import { memoryStore } from "../src/store/memory.js";
import type { CloudStore } from "../src/store/types.js";
import { parseJsonc } from "./browser/worker.js";
import { jsonOf } from "./support/index.js";
import { fakeR2, type FakeR2 } from "./support/r2.js";
import { openDatabase, sqliteAvailable } from "./support/sqlite.js";
import { world, OWNER } from "./support/sharing.js";

const PACKAGE = fileURLToPath(new URL("../", import.meta.url));
const T = "2026-10-14T12:00:00.000Z";
const PROJECT = "proj0000000000000001";
const HTML = "<!doctype html><title>ñ 🌊</title><p>A published page.</p>\n";

afterEach(() => {
  vi.restoreAllMocks();
});

/** What the publish host holds: a store, a bucket and a way to ask it. */
interface Host {
  readonly store: CloudStore;
  readonly blobs: FakeR2;
  get(path: string, init?: RequestInit): Promise<Response>;
}

/** The host with one publication, `ana/purchase`, stored as the publish route stores it. */
async function host(options: { published?: boolean } = {}): Promise<Host> {
  const store = memoryStore();
  const blobs = fakeR2();
  await store.upsertUser(
    { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
    T,
  );
  await store.createProject(
    { id: PROJECT, ownerSub: "u1", name: "Purchase", description: "", createdAt: T },
    100,
  );
  if (options.published ?? true) {
    await store.putPublication({
      projectId: PROJECT,
      handle: "ana",
      slug: "purchase",
      publishedAt: T,
      bytes: new TextEncoder().encode(HTML).byteLength,
    });
    await blobs.put(publishedKey("ana", "purchase"), HTML);
  }
  // What the host asks of the bucket is what a test looks at: the setup is not part of it.
  blobs.calls.length = 0;
  return {
    store,
    blobs,
    get: (path, init) =>
      publishHost(new Request(`https://meltemi.page${path}`, init), { BLOBS: blobs }, { store }),
  };
}

/** The headers of a response as a plain object, names in lower case. */
const headersOf = (response: Response): Record<string, string> =>
  Object.fromEntries([...response.headers].map(([name, value]) => [name.toLowerCase(), value]));

// ---------------------------------------------------------------------------------------------

describe("the publish host", () => {
  describe("serves a publication", () => {
    it.each(["/ana/purchase/", "/ana/purchase/index.html"])(
      "at %s: the stored HTML, with the four headers of the specification and no cookie",
      async (path) => {
        const h = await host();

        const response = await h.get(path);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(HTML);
        expect(headersOf(response)).toEqual({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-length": String(new TextEncoder().encode(HTML).byteLength),
        });
      },
    );

    it("names no cookie, no other origin that may read it and no policy of its own: the page's own governs", async () => {
      const h = await host();
      const response = await h.get("/ana/purchase/");
      const names = [...response.headers.keys()];
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(names.filter((name) => name.startsWith("access-control-"))).toEqual([]);
      expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });

    it.each(["/ana/purchase/", "/ana/purchase/index.html"])(
      "answers HEAD of %s with the same headers and no body",
      async (path) => {
        const h = await host();
        const got = await h.get(path);

        const head = await h.get(path, { method: "HEAD" });

        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(headersOf(head)).toEqual(headersOf(got));
        // A GET asks the bucket for the bytes; a HEAD for the object's size and not for its bytes.
        expect(h.blobs.calls.map((call) => call.op)).toEqual(["get", "head"]);
      },
    );

    it("takes no notice of the query: the address is the path", async () => {
      const h = await host();
      const response = await h.get("/ana/purchase/?utm_source=x&a=%00");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(HTML);
    });

    it("never reads a header of the request: a cookie, a token or an origin cannot change the answer", async () => {
      const h = await host();
      // A request whose headers cannot be read at all: the answer is still the page.
      const request = new Request("https://meltemi.page/ana/purchase/", {
        headers: {
          Cookie: "meltemi_session=abc",
          Authorization: "Bearer mdg_abc",
          Origin: "https://diagrams.meltemi.dev",
        },
      });
      Object.defineProperty(request, "headers", {
        get() {
          throw new Error("the publish host read a header");
        },
      });

      const response = await publishHost(request, { BLOBS: h.blobs }, { store: h.store });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(HTML);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("answers the same to a request with a cookie as to one without, and sets none", async () => {
      const h = await host();
      const plain = await h.get("/ana/purchase/");
      const cookie = await h.get("/ana/purchase/", {
        headers: { Cookie: "meltemi_session=abc; other=1", Authorization: "Bearer mdg_abc" },
      });
      expect(headersOf(cookie)).toEqual(headersOf(plain));
      expect(await cookie.text()).toBe(await plain.text());
    });

    it("gives the same headers the development route does, from one definition", () => {
      expect(PUBLISHED_HEADERS).toEqual({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
    });
  });

  describe("answers 404 to everything else, and says nothing of why", () => {
    const PATHS: [string, string][] = [
      ["the root", "/"],
      ["the page's script (it is not the app's host)", "/playground.js"],
      ["the page", "/index.html"],
      ["an asset", "/assets/logo.png"],
      ["the session", "/api/session"],
      ["the projects API", "/api/projects"],
      ["the account API", "/api/account"],
      ["the approval page", "/cli-auth"],
      ["a project link", "/p/abcdefghijklmnopqrst"],
      ["a room", "/rooms/abcdefghijklmnopqrst"],
      ["the identity events", "/_identity/events"],
      ["the development route", "/_published/ana/purchase/"],
      ["a handle alone", "/ana"],
      ["a handle alone with a slash", "/ana/"],
      ["an address without its slash", "/ana/purchase"],
      ["another file under the address", "/ana/purchase/other.html"],
      ["a file under the page", "/ana/purchase/index.html/"],
      ["a folder under the address", "/ana/purchase/x/"],
      ["an empty slug", "/ana//"],
      ["an empty handle", "//purchase/"],
      ["a handle of two characters", "/an/purchase/"],
      ["a handle of thirty-one characters", `/${"a".repeat(31)}/purchase/`],
      ["a handle with a capital", "/Ana/purchase/"],
      ["a handle with an underscore", "/an_a/purchase/"],
      ["a slug of sixty-one characters", `/ana/${"a".repeat(61)}/`],
      ["a slug with a capital", "/ana/Purchase/"],
      ["a slug with an underscore", "/ana/pur_chase/"],
      ["a slug with a dot", "/ana/purchase.html/"],
      ["an escaped handle (an address has one spelling)", "/%61na/purchase/"],
      ["an escaped slug", "/ana/pur%63hase/"],
      ["an escaped slash", "/ana%2Fpurchase/"],
      ["a null byte", "/ana/pur%00chase/"],
      ["a publication nobody made", "/ana/nothing/"],
      ["another person's address", "/beto/purchase/"],
    ];

    it.each(PATHS)("%s: %s", async (_name, path) => {
      const h = await host();

      const response = await h.get(path);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
      expect(headersOf(response)).toEqual({
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      });
    });

    it("is the same answer in every case: nothing tells a stranger a publication was ever there", async () => {
      const h = await host();
      const answers = new Set<string>();
      for (const [, path] of PATHS) {
        const response = await h.get(path);
        answers.add(JSON.stringify([response.status, headersOf(response), await response.text()]));
      }
      expect(answers.size).toBe(1);
    });

    it("answers GET /playground.js with 404, and no script", async () => {
      const h = await host();
      const response = await h.get("/playground.js");
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).not.toContain("javascript");
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });

    it("answers GET /api/session with 404 and no cookie, whatever the request carries", async () => {
      const h = await host();
      const response = await h.get("/api/session", {
        headers: { Cookie: "meltemi_session=abc", Authorization: "Bearer mdg_abc" },
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(await response.text()).not.toContain("user");
    });

    it("asks neither the store nor the bucket for an address that cannot be one", async () => {
      const h = await host();
      const lookup = vi.spyOn(h.store, "publication");
      for (const [, path] of PATHS.filter(
        ([, p]) => !/^\/(ana|beto)\/(purchase|nothing)\/$/.test(p),
      )) {
        await h.get(path);
      }
      expect(lookup).not.toHaveBeenCalled();
      expect(h.blobs.calls).toEqual([]);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
      "answers %s of a real address with 404, and touches nothing",
      async (method) => {
        const h = await host();
        const lookup = vi.spyOn(h.store, "publication");

        const response = await h.get("/ana/purchase/", {
          method,
          ...(method === "OPTIONS" ? {} : { body: "x" }),
        });

        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Not found");
        expect(lookup).not.toHaveBeenCalled();
        expect(h.blobs.calls).toEqual([]);
        expect(h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);
      },
    );

    it("answers HEAD of an unknown address with 404 and no body", async () => {
      const h = await host();
      const response = await h.get("/ana/nothing/", { method: "HEAD" });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    });
  });

  describe("serves only what exists", () => {
    it("is 404 for a page nobody published: an object with no row is not served", async () => {
      const h = await host({ published: false });
      await h.blobs.put(publishedKey("ana", "purchase"), HTML);

      const response = await h.get("/ana/purchase/");

      expect(response.status).toBe(404);
      expect(h.blobs.calls.filter((call) => call.op === "get")).toEqual([]);
    });

    it("is 404 for a publication that was removed, though its object lingers in the bucket", async () => {
      const h = await host();
      expect((await h.get("/ana/purchase/")).status).toBe(200);

      await h.store.deletePublication(PROJECT, "purchase");

      expect(h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);
      expect((await h.get("/ana/purchase/")).status).toBe(404);
      expect((await h.get("/ana/purchase/index.html")).status).toBe(404);
      expect((await h.get("/ana/purchase/", { method: "HEAD" })).status).toBe(404);
    });

    it("is 404 for a publication an administrator took down, though its object lingers", async () => {
      const h = await host();
      await h.store.takeDown({
        handle: "ana",
        slug: "purchase",
        bySub: "admin",
        reason: "spam",
        at: T,
      });

      expect(h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);
      expect((await h.get("/ana/purchase/")).status).toBe(404);
    });

    it("is 404 for a row whose page is gone from the bucket, and says so in its log, with the address and nothing else", async () => {
      const h = await host();
      await h.blobs.delete(publishedKey("ana", "purchase"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      expect((await h.get("/ana/purchase/")).status).toBe(404);
      expect((await h.get("/ana/purchase/", { method: "HEAD" })).status).toBe(404);

      expect(logged).toHaveBeenCalledTimes(2);
      expect(String(logged.mock.calls[0]?.[0])).toBe(
        "publish: the page of ana/purchase is missing from the bucket",
      );
    });

    it("serves the page again once the publication is made again, and a replaced page at once", async () => {
      const h = await host();
      await h.store.deletePublication(PROJECT, "purchase");
      expect((await h.get("/ana/purchase/")).status).toBe(404);

      await h.blobs.put(publishedKey("ana", "purchase"), "<p>new</p>");
      await h.store.putPublication({
        projectId: PROJECT,
        handle: "ana",
        slug: "purchase",
        publishedAt: T,
        bytes: 10,
      });

      expect(await (await h.get("/ana/purchase/")).text()).toBe("<p>new</p>");
    });

    it("keeps the addresses of two people apart, though the slug is the same", async () => {
      const h = await host();
      await h.store.upsertUser(
        { sub: "u2", name: "Beto", picture: "", email: "beto@example.com", emailVerified: true },
        T,
      );
      await h.store.createProject(
        { id: "proj0000000000000002", ownerSub: "u2", name: "Beto", description: "", createdAt: T },
        100,
      );
      await h.store.putPublication({
        projectId: "proj0000000000000002",
        handle: "beto",
        slug: "purchase",
        publishedAt: T,
        bytes: 5,
      });
      await h.blobs.put(publishedKey("beto", "purchase"), "Beto's");

      expect(await (await h.get("/ana/purchase/")).text()).toBe(HTML);
      expect(await (await h.get("/beto/purchase/")).text()).toBe("Beto's");
    });
  });

  describe("when the database or the bucket fails", () => {
    it("answers 500 with no detail, never cached, and logs the message only", async () => {
      const h = await host();
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(h.store, "publication").mockRejectedValue(new Error("D1 is down"));

      const response = await h.get("/ana/purchase/");

      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Something went wrong");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(logged).toHaveBeenCalledWith("publish: a page could not be read:", "D1 is down");
    });

    it("answers 500 when the bucket throws, and a HEAD of it has no body", async () => {
      const h = await host();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(h.blobs, "get").mockRejectedValue(new Error("R2 is down"));
      vi.spyOn(h.blobs, "head").mockRejectedValue(new Error("R2 is down"));

      expect((await h.get("/ana/purchase/")).status).toBe(500);
      const head = await h.get("/ana/purchase/", { method: "HEAD" });
      expect(head.status).toBe(500);
      expect(await head.text()).toBe("");
    });
  });
});

describe("addressOf", () => {
  it.each([
    ["/ana/purchase/", { handle: "ana", slug: "purchase" }],
    ["/ana/purchase/index.html", { handle: "ana", slug: "purchase" }],
    ["/abc/a/", { handle: "abc", slug: "a" }],
    ["/---/-/", { handle: "---", slug: "-" }],
    [`/${"a".repeat(30)}/${"b".repeat(60)}/`, { handle: "a".repeat(30), slug: "b".repeat(60) }],
  ])("reads %s", (path, expected) => {
    expect(addressOf(path)).toEqual(expected);
  });

  it.each([
    "",
    "/",
    "ana/purchase/",
    "/ana/purchase",
    "/ana/purchase/index.htm",
    "/ana/purchase/index.html/",
    "/ana/purchase//",
    "/ana/a/b/",
    "/ab/a/",
    `/${"a".repeat(31)}/a/`,
    `/ana/${"a".repeat(61)}/`,
    "/ANA/a/",
    "/ana/A/",
    "/%61na/a/",
    "/ana/a b/",
    "/ana/a\n/",
  ])("refuses %j", (path) => {
    expect(addressOf(path)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------

describe.skipIf(!sqliteAvailable)("the Cloudflare entry, over the real SQL", () => {
  it("serves a publication from the database and the bucket it is bound to, and nothing once its row is gone", async () => {
    const db = openDatabase();
    const store = d1Store(db);
    const blobs = fakeR2();
    await store.upsertUser(
      { sub: "u1", name: "Ana", picture: "", email: "ana@example.com", emailVerified: true },
      T,
    );
    await store.createProject(
      { id: PROJECT, ownerSub: "u1", name: "Purchase", description: "", createdAt: T },
      100,
    );
    await store.putPublication({
      projectId: PROJECT,
      handle: "ana",
      slug: "purchase",
      publishedAt: T,
      bytes: 5,
    });
    await blobs.put(publishedKey("ana", "purchase"), HTML);
    const ask = (path: string, method = "GET") =>
      publishWorker.fetch(new Request(`https://meltemi.page${path}`, { method }), {
        BLOBS: blobs,
        DB: db,
      });

    const served = await ask("/ana/purchase/");
    expect(served.status).toBe(200);
    expect(await served.text()).toBe(HTML);
    expect((await ask("/ana/purchase/index.html", "HEAD")).status).toBe(200);
    expect((await ask("/ana/other/")).status).toBe(404);
    expect((await ask("/api/session")).status).toBe(404);

    await store.deletePublication(PROJECT, "purchase");
    expect(blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);
    expect((await ask("/ana/purchase/")).status).toBe(404);
    db.close();
  });

  it("reads one row and runs no other statement: the lookup of an address, by its key", async () => {
    const db = openDatabase();
    const blobs = fakeR2();
    const before = db.queries.length;

    await publishWorker.fetch(new Request("https://meltemi.page/ana/purchase/"), {
      BLOBS: blobs,
      DB: db,
    });

    expect(db.queries.slice(before).map((q) => [q.sql, q.values])).toEqual([
      [
        "SELECT project_id, handle, slug, published_at, bytes FROM publications WHERE handle = ? AND slug = ?",
        ["ana", "purchase"],
      ],
    ]);
    db.close();
  });

  it("is a Worker with a fetch handler and nothing else: no cron, no Durable Object", () => {
    expect(Object.keys(publishWorker)).toEqual(["fetch"]);
  });
});

// ---------------------------------------------------------------------------------------------

describe("the development route /_published/", () => {
  async function devWorld() {
    const w = await world("private", { env: { DEV: "true" } });
    expect((await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" })).status).toBe(200);
    const made = await w.ask(OWNER, "PUT", w.url("/publish"), { slug: "purchase", html: HTML });
    expect(made.status).toBe(200);
    return w;
  }

  it("serves the page and the headers the publish host serves, at the address the dialog is given", async () => {
    const w = await devWorld();
    const hosted = await publishHost(
      new Request("https://meltemi.page/ana/purchase/"),
      { BLOBS: w.h.blobs },
      { store: w.h.store },
    );

    for (const path of ["/_published/ana/purchase/", "/_published/ana/purchase/index.html"]) {
      const response = await w.h.request(path);
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toBe(HTML);
      expect(headersOf(response), path).toEqual(headersOf(hosted));
    }
  });

  it("answers HEAD with the same headers and no body", async () => {
    const w = await devWorld();
    const got = await w.h.request("/_published/ana/purchase/");

    const head = await w.h.request("/_published/ana/purchase/", { method: "HEAD" });

    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(headersOf(head)).toEqual(headersOf(got));
  });

  it("sets no cookie and needs none: the cookie of a person changes nothing", async () => {
    const w = await devWorld();
    const { cookie } = await w.h.signedIn({ sub: OWNER });
    const anonymous = await w.h.request("/_published/ana/purchase/");
    const signedIn = await w.h.request("/_published/ana/purchase/", {
      headers: { Cookie: cookie },
    });
    expect(signedIn.headers.get("Set-Cookie")).toBeNull();
    expect(headersOf(signedIn)).toEqual(headersOf(anonymous));
  });

  it("answers the Worker's JSON 404 for what is not there or cannot be an address, in any spelling", async () => {
    const w = await devWorld();
    for (const path of [
      "/_published/ana/nothing/",
      "/_published/beto/purchase/",
      "/_published/ana/purchase",
      "/_published/ana/purchase/other.html",
      "/_published/Ana/purchase/",
      "/_published/%61na/purchase/",
      "/_published/ana/",
      "/_published/",
      "/_published",
      "/%5Fpublished/ana/purchase/",
    ]) {
      const response = await w.h.request(path);
      expect(response.status, path).toBe(404);
      expect((await jsonOf<{ code: string }>(response)).code, path).toBe("not-found");
    }
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect((await w.h.request("/_published/ana/purchase/", { method })).status, method).toBe(404);
    }
    expect(w.h.assets.calls).toEqual([]);
  });

  it("is a 404 for a publication whose row is gone, though its object lingers", async () => {
    const w = await devWorld();
    await w.h.store.deletePublication(w.id, "purchase");
    expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);
    expect((await w.h.request("/_published/ana/purchase/")).status).toBe(404);
  });

  describe("is absent when DEV is not set: the Worker never serves a person's HTML from its own origin", () => {
    it.each([
      ["no DEV at all", undefined],
      ["DEV false", "false"],
      ["DEV 1", "1"],
      ["DEV True", "True"],
      ["DEV yes", "yes"],
      ["an empty DEV", ""],
    ])("with %s", async (_name, DEV) => {
      const w = await world("private", {
        env: { PUBLISH_HOST: "meltemi.page", ...(DEV === undefined ? {} : { DEV }) },
      });
      await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" });
      const made = await w.ask(OWNER, "PUT", w.url("/publish"), { slug: "purchase", html: HTML });
      expect(made.status).toBe(200);
      // The publication exists, with its object: the route still refuses.
      expect((await w.h.store.publication("ana", "purchase"))?.slug).toBe("purchase");
      expect(w.h.blobs.objects.has(publishedKey("ana", "purchase"))).toBe(true);

      for (const path of [
        "/_published/ana/purchase/",
        "/_published/ana/purchase/index.html",
        "/_published/a/b/",
        "/_published/",
      ]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await w.h.request(path, { method });
          expect(response.status, `${method} ${path}`).toBe(404);
          if (method === "GET") {
            const body = await jsonOf<{ code: string }>(response);
            expect(body.code, path).toBe("not-found");
            expect(JSON.stringify(body)).not.toContain("A published page");
          }
        }
      }
      expect(w.h.assets.calls).toEqual([]);
    });
  });

  it("is not a way to serve the publish host from the main Worker: another host is a JSON 404 whatever the path", async () => {
    const w = await world("private", { env: { PUBLISH_HOST: "meltemi.page" } });
    await w.ask(OWNER, "PATCH", "/api/account", { handle: "ana" });
    await w.ask(OWNER, "PUT", w.url("/publish"), { slug: "purchase", html: HTML });

    for (const path of [
      "/ana/purchase/",
      "/ana/purchase/index.html",
      "/_published/ana/purchase/",
      "/playground.js",
      "/api/session",
      "/",
    ]) {
      const response = await w.h.request(`https://meltemi.page${path}`);
      expect(response.status, path).toBe(404);
      expect((await jsonOf<{ code: string }>(response)).code, path).toBe("not-found");
    }
    expect(w.h.assets.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// What keeps the publish Worker minimal

/** A source file without its comments. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** The modules a source file imports for value (an `import type` is erased and is not an import at runtime). */
function valueImports(file: string): string[] {
  return [...code(file).matchAll(/import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/g)].map((match) =>
    resolve(dirname(file), (match[1] ?? "").replace(/\.js$/, ".ts")),
  );
}

/** Every source file a module needs at runtime, itself included, by the paths relative to the package. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const next of valueImports(file)) visit(next);
  };
  visit(entry);
  return [...seen].map((file) => relative(PACKAGE, file).split("\\").join("/")).sort();
}

describe("the publish Worker is minimal", () => {
  it("needs, at runtime, the handler of the host, the one read of the store, the patterns of an address and the key of a page: no API, no cookie, no session, no assets", () => {
    expect(closure(join(PACKAGE, "src", "publish-worker.ts"))).toEqual([
      "src/ids.ts",
      "src/keys.ts",
      "src/publish-worker.ts",
      "src/publish.ts",
      "src/store/d1-publications.ts",
    ]);
  });

  it("reads no cookie and no header of a request, and says no cookie of a response", () => {
    for (const file of ["publish.ts", "publish-worker.ts"]) {
      const text = code(join(PACKAGE, "src", file));
      expect(text, file).not.toMatch(/cookie/i);
      expect(text, file).not.toMatch(/\brequest\.headers\b|\.headers\.get\(|\.headers\.has\(/);
      expect(text, file).not.toMatch(/\bAuthorization\b|\bOrigin\b/);
    }
  });

  describe("wrangler.publish.jsonc", () => {
    const text = readFileSync(join(PACKAGE, "wrangler.publish.jsonc"), "utf8");
    const publish = parseJsonc(text);
    const main = parseJsonc(readFileSync(join(PACKAGE, "wrangler.jsonc"), "utf8"));

    it("is a Worker of its own that holds the bucket and the database and nothing else", () => {
      expect(Object.keys(publish).sort()).toEqual(
        [
          "$schema",
          "compatibility_date",
          "d1_databases",
          "dev",
          "main",
          "name",
          "preview_urls",
          "r2_buckets",
          "workers_dev",
        ].sort(),
      );
      expect(publish["name"]).toBe("meltemi-diagrams-publish");
      expect(publish["name"]).not.toBe(main["name"]);
      expect(publish["main"]).toBe("src/publish-worker.ts");
      expect(publish["compatibility_date"]).toBe(main["compatibility_date"]);
      expect(publish["dev"]).toEqual({ port: 8789 });
      expect(publish["dev"]).not.toEqual(main["dev"]);
    });

    it("binds the same bucket as BLOBS and the same database as DB as the main Worker, and applies no migration", () => {
      expect(publish["r2_buckets"]).toEqual(main["r2_buckets"]);
      const [mainDatabase] = main["d1_databases"] as Record<string, unknown>[];
      expect(publish["d1_databases"]).toEqual([
        {
          binding: "DB",
          database_name: mainDatabase?.["database_name"],
          database_id: mainDatabase?.["database_id"],
        },
      ]);
    });

    it("has no assets, no variable, no secret, no Durable Object, no cron and no route", () => {
      for (const key of [
        "assets",
        "vars",
        "durable_objects",
        "migrations",
        "triggers",
        "routes",
        "route",
        "services",
        "kv_namespaces",
        "queues",
        "ai",
        "alias",
        "account_id",
        "secrets_store_secrets",
      ]) {
        expect(publish, key).not.toHaveProperty(key);
      }
      // Nothing that names a secret or the development flag, in any comment either.
      expect(text).not.toMatch(/IDENTITY_|FORMS_SECRET|DEV\b|\.dev\.vars|ADMIN_SUBS/);
    });

    it("has no address of its own: meltemi.page is a Custom Domain the family's Terraform attaches", () => {
      expect(publish["workers_dev"]).toBe(false);
      expect(publish["preview_urls"]).toBe(false);
      expect(text).toContain("Custom Domain meltemi.page");
      expect(text).toContain("never one under");
      expect(text).toContain("packages/infra");
    });

    it("is not the configuration the browser suite starts: that one is wrangler.jsonc", () => {
      const run = readFileSync(join(PACKAGE, "test", "browser", "worker.ts"), "utf8");
      expect(run).toContain('"wrangler.jsonc"');
      expect(run).not.toContain("wrangler.publish");
    });
  });
});
