/**
 * Publishing in the real runtime, asked as a program asks it (the command line will): from Node, with
 * the session cookie or an API token, against the Worker `wrangler dev` runs with a real D1 and a real
 * R2. The page that publishes (`src/cloud/publish.ts`) is driven by `scenarios-publish-dialog.ts`;
 * what only workerd can prove is here: the handle and its lock in D1, the conditional insert that rates a project, a page stored in R2
 * and read back with its exact headers (and none that sets a cookie), the size limit, the takedown's
 * batch, and the route that exists in development only. The publish host itself, the second Worker, is
 * not started by this suite: its `wrangler.publish.jsonc` is a separate file, and the development route
 * serves the same page and headers through the same function.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import { makeProject } from "./cloud.js";
import { ask, assertError, bearer } from "./support.js";
import { ADMIN_SUB } from "./worker.js";

/** What a visitor of a published page is given, as the specification lists it. */
export const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

/** A page with characters of every width, a carriage return and the text that closes a script. */
const page = (title: string): string =>
  `<!doctype html>\r\n<title>${title} ñ \u{1f30a}</title><script>"</script>"</script>\n<p>${title}</p>\n`;

const MIB = 1024 * 1024;

/** The path of an address the Worker gave in an answer. */
const pathOf = (url: unknown): string => new URL(String(url)).pathname;

export const publishingScenarios: Scenario[] = [
  {
    name: "publishing: a handle is chosen, unique and locked; a page is published, served at /_published/ with the exact headers and no cookie, replaced and unpublished, refused over 16 MiB, and the eleventh request of a project in an hour is refused",
    signedIn: "u-ana-publishing",
    async run(t) {
      const { origin } = t;
      const bob = await t.person("u-bob-publishing");
      const project = await makeProject(t.me, "Published", { template: "flow" });
      const publish = `/api/projects/${project.id}/publish`;
      const put = (slug: string, html: string) => t.me.api("PUT", publish, { slug, html });

      // No handle yet: nothing is published, and the dialog says there is none.
      assertError(await put("purchase", page("one")), 409, "handle.required");
      assert.deepEqual((await t.me.api("GET", publish)).json(), {
        handle: null,
        publications: [],
        takedowns: [],
      });

      // A handle is [a-z0-9-]{3,30}, the page's to choose (a token is refused) and unique.
      for (const handle of ["ab", "Ana", "a_b", "x".repeat(31), ""]) {
        assertError(await t.me.api("PATCH", "/api/account", { handle }), 400, "handle.invalid");
      }
      const made = await t.me.api("POST", "/api/tokens", { name: "publisher" });
      assert.equal(made.status, 201, made.text);
      const token = String(made.json()["token"]);
      // A token chooses the handle as the page does: the command line publishes with one.
      const byToken = await ask(`${origin}/api/account`, {
        method: "PATCH",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ handle: "suite-ana" }),
      });
      assert.equal(byToken.status, 200, byToken.text);
      assert.deepEqual(byToken.json(), { handle: "suite-ana" });
      // The same handle again, from the page, is always fine.
      const chosen = await t.me.api("PATCH", "/api/account", { handle: "suite-ana" });
      assert.equal(chosen.status, 200, chosen.text);
      assert.deepEqual(chosen.json(), { handle: "suite-ana" });
      assertError(
        await bob.api("PATCH", "/api/account", { handle: "suite-ana" }),
        409,
        "handle.taken",
      );
      assert.equal((await bob.api("PATCH", "/api/account", { handle: "suite-bob" })).status, 200);
      const session = (await t.me.api("GET", "/api/session")).json() as {
        user: { handle: string };
      };
      assert.equal(session.user.handle, "suite-ana");

      // Another person does not see the project, so they cannot publish it.
      assertError(
        await bob.api("PUT", publish, { slug: "purchase", html: page("bob's") }),
        404,
        "project.not-found",
      );

      // Published: the answer holds the address, and the page is served at it, byte for byte.
      const first = page("one");
      const published = await put("purchase", first);
      assert.equal(published.status, 200, published.text);
      const body = published.json();
      assert.equal(body["handle"], "suite-ana");
      assert.equal(body["slug"], "purchase");
      assert.equal(body["bytes"], Buffer.byteLength(first));
      assert.equal(body["url"], `${origin}/_published/suite-ana/purchase/`);
      assert.match(String(body["published_at"]), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      const address = pathOf(body["url"]);

      for (const path of [address, `${address}index.html`]) {
        // As anybody asks, and as the owner does with the cookie in hand: no cookie comes back.
        for (const credentials of [{}, t.me.cookie]) {
          const served = await t.ask(path, { headers: credentials });
          assert.equal(served.status, 200, path);
          assert.equal(served.text, first, path);
          for (const [name, value] of Object.entries(PAGE_HEADERS)) {
            assert.equal(served.headers.get(name), value, `${name} of ${path}`);
          }
          // (The runtime may compress and chunk a GET, which has then no Content-Length; a HEAD says the size.)
          assert.equal(served.headers.get("set-cookie"), null, `no cookie from ${path}`);
          assert.equal(served.headers.get("access-control-allow-origin"), null);
        }
        const head = await t.ask(path, { method: "HEAD" });
        assert.equal(head.status, 200, `HEAD ${path}`);
        assert.equal(head.text, "");
        assert.equal(head.headers.get("content-type"), PAGE_HEADERS["content-type"]);
        assert.equal(head.headers.get("content-length"), String(Buffer.byteLength(first)));
      }
      // Nothing else is an address: a missing slash, another slug, another person's handle.
      for (const path of [
        address.slice(0, -1),
        "/_published/suite-ana/nothing/",
        "/_published/suite-bob/purchase/",
        "/_published/Suite-Ana/purchase/",
        "/_published/",
      ]) {
        assertError(await t.ask(path), 404, "not-found");
      }

      // The handle is locked while a page is published under it, and the same one is always fine.
      assertError(
        await t.me.api("PATCH", "/api/account", { handle: "suite-ana-2" }),
        409,
        "handle.locked",
      );
      assert.equal((await t.me.api("PATCH", "/api/account", { handle: "suite-ana" })).status, 200);

      // A bearer token publishes too: it needs no Origin, as the command line has none.
      const viaToken = await ask(`${origin}${publish}`, {
        method: "PUT",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "from-cli", html: page("cli") }),
      });
      assert.equal(viaToken.status, 200, viaToken.text);
      assert.equal((await t.ask("/_published/suite-ana/from-cli/")).text, page("cli"));

      // Replaced: the new page is served, and the dialog lists one row for the slug.
      const second = page("two");
      const replaced = await put("purchase", second);
      assert.equal(replaced.status, 200, replaced.text);
      assert.equal((await t.ask(address)).text, second);
      const listed = (await t.me.api("GET", publish)).json() as {
        handle: string;
        publications: { slug: string; url: string; bytes: number }[];
        takedowns: unknown[];
      };
      assert.equal(listed.handle, "suite-ana");
      // The earliest published first: the one from the command line, then the page that was replaced
      // (replacing it renewed its time).
      assert.deepEqual(
        listed.publications.map((p) => [p.slug, p.url, p.bytes]),
        [
          ["from-cli", `${origin}/_published/suite-ana/from-cli/`, Buffer.byteLength(page("cli"))],
          ["purchase", `${origin}${address}`, Buffer.byteLength(second)],
        ],
      );
      assert.deepEqual(listed.takedowns, []);

      // What is not valid is refused and changes nothing.
      assertError(await put("Bad Slug", second), 400, "publish.invalid");
      assertError(await put("purchase", ""), 400, "publish.invalid");
      assertError(await t.me.api("PUT", publish, { slug: "purchase" }), 400, "publish.invalid");
      assert.equal((await t.ask(address)).text, second);

      // Over 16 MiB of HTML is refused, and the page that is there stays.
      assertError(await put("purchase", "a".repeat(17 * MIB)), 413, "publish.too-large");
      assertError(await put("purchase", "ñ".repeat(8 * MIB + 1)), 413, "publish.too-large");
      assert.equal((await t.ask(address)).text, second);

      // Ten requests in an hour, replaced ones counted: three have been made (a refused request is not
      // one), seven more fill the hour, and the eleventh is refused with the seconds to wait.
      for (let n = 0; n < 7; n++) {
        const again = await put("rate", page(`rate ${n}`));
        assert.equal(again.status, 200, `request ${n + 4}: ${again.text}`);
      }
      const eleventh = await put("rate", page("one too many"));
      assertError(eleventh, 429, "publish.rate");
      const wait = Number(eleventh.headers.get("retry-after"));
      assert.ok(wait > 0 && wait <= 3600, `Retry-After is ${wait}`);
      assert.equal((await t.ask("/_published/suite-ana/rate/")).text, page("rate 6"));

      // Another project of the same person has its own hour.
      const other = await makeProject(t.me, "Other", { template: "flow" });
      const elsewhere = await t.me.api("PUT", `/api/projects/${other.id}/publish`, {
        slug: "elsewhere",
        html: page("other"),
      });
      assert.equal(elsewhere.status, 200, elsewhere.text);
      // ...but not the same address: a slug another of the person's projects publishes is theirs.
      assertError(
        await t.me.api("PUT", `/api/projects/${other.id}/publish`, {
          slug: "purchase",
          html: page("clash"),
        }),
        409,
        "publish.taken",
      );
      assert.equal((await t.ask(address)).text, second);

      // Unpublished: the page and the row go, and the address answers 404; an unknown slug is 404.
      const removed = await t.me.api("DELETE", `${publish}/rate`);
      assert.equal(removed.status, 204, removed.text);
      assertError(await t.ask("/_published/suite-ana/rate/"), 404, "not-found");
      assertError(await t.me.api("DELETE", `${publish}/rate`), 404, "not-found");
      assertError(await t.me.api("DELETE", `${publish}/Not-A-Slug`), 404, "not-found");
      assert.equal((await t.ask(address)).text, second);
    },
  },

  {
    name: "publishing: an administrator takes a page down (the route is the administrators' and 404 for everyone else), the address answers 404, the owner is told, and the page can be published again",
    signedIn: "u-ana-takedown",
    async run(t) {
      const { origin } = t;
      const admin = await t.person(ADMIN_SUB);
      const stranger = await t.person("u-bob-takedown");
      const project = await makeProject(t.me, "Taken down", { template: "flow" });
      const publish = `/api/projects/${project.id}/publish`;
      assert.equal((await t.me.api("PATCH", "/api/account", { handle: "suite-take" })).status, 200);
      for (const slug of ["spam", "fine"]) {
        const made = await t.me.api("PUT", publish, { slug, html: page(slug) });
        assert.equal(made.status, 200, made.text);
      }
      const takedown = "/api/admin/publications/suite-take/spam";
      const served = async (slug: string) =>
        (await t.ask(`/_published/suite-take/${slug}/`)).status;
      assert.equal(await served("spam"), 200);

      // Everybody who is not an administrator gets what a route that does not exist gets.
      const unknown = await admin.api("DELETE", "/api/admin/nothing");
      assertError(unknown, 404, "not-found");
      for (const answer of [
        await t.me.api("DELETE", takedown, { reason: "mine" }),
        await ask(`${origin}${takedown}`, { method: "DELETE" }),
        await stranger.api("DELETE", takedown),
      ]) {
        assert.equal(answer.status, 404);
        assert.deepEqual(answer.json(), unknown.json());
      }
      // An administrator's API token is no administrator: they act on the page.
      const made = await admin.api("POST", "/api/tokens", { name: "admin" });
      assert.equal(made.status, 201, made.text);
      assertError(
        await ask(`${origin}${takedown}`, {
          method: "DELETE",
          headers: bearer(String(made.json()["token"])),
        }),
        404,
        "not-found",
      );
      // The cookie of an administrator from a page that is not the service's: the Origin rule first.
      assertError(
        await ask(`${origin}${takedown}`, { method: "DELETE", headers: admin.cookie }),
        403,
        "request.forbidden",
      );
      assert.equal(await served("spam"), 200, "nothing of that removed the page");

      // An address that is not one, or has nothing, is 404 with a message that says so.
      for (const path of [
        "/api/admin/publications/suite-take/nothing",
        "/api/admin/publications/Suite-Take/spam",
        "/api/admin/publications/suite-nobody/spam",
      ]) {
        const answer = await admin.api("DELETE", path);
        assertError(answer, 404, "not-found");
        assert.equal(answer.json()["message"], "There is no such publication.");
      }
      assertError(
        await admin.api("DELETE", takedown, { reason: "x".repeat(501) }),
        400,
        "request.invalid",
      );
      assert.equal(await served("spam"), 200);

      // Taken down: the page, the row and the address go, and the record is the owner's to read.
      const gone = await admin.api("DELETE", takedown, { reason: "  spam  " });
      assert.equal(gone.status, 204, gone.text);
      assertError(await t.ask("/_published/suite-take/spam/"), 404, "not-found");
      assert.equal(await served("fine"), 200, "only that page");
      assertError(await admin.api("DELETE", takedown), 404, "not-found");
      const dialog = (await t.me.api("GET", publish)).json() as {
        publications: { slug: string }[];
        takedowns: { slug: string; at: string; reason: string }[];
      };
      assert.deepEqual(
        dialog.publications.map((p) => p.slug),
        ["fine"],
      );
      assert.equal(dialog.takedowns.length, 1);
      assert.equal(dialog.takedowns[0]?.slug, "spam");
      assert.equal(dialog.takedowns[0]?.reason, "spam");
      assert.match(String(dialog.takedowns[0]?.at), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

      // The service does not forbid the owner to publish again; the takedown is then no news.
      const again = await t.me.api("PUT", publish, { slug: "spam", html: page("clean") });
      assert.equal(again.status, 200, again.text);
      assert.equal((await t.ask("/_published/suite-take/spam/")).text, page("clean"));
      const after = (await t.me.api("GET", publish)).json() as { takedowns: unknown[] };
      assert.deepEqual(after.takedowns, []);
    },
  },
];
