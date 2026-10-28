/**
 * The playground served by the cloud Worker, in a headless Edge or Chrome. The suite builds the page
 * for the identity service on this laptop (http://localhost:8787, which it stands in for: see
 * `identity.ts`), starts `wrangler dev` once with a configuration of its own (`DEV=true`, an inline
 * key set, a local D1 with the migrations applied; see `worker.ts`) and goes through the Worker:
 *
 * - the page anonymous: the sign-in link, the Worker's answer for the session (not the static
 *   file's), a project link, the playground as it was;
 * - sessions minted with the test keys that count: the session check at the identity service, the
 *   account menu and the avatar, API tokens (made, shown once, used as a bearer, revoked), the
 *   `Origin` refusal, and the command line's approval at `/cli-auth` landing on a listener on
 *   127.0.0.1 whose code Node exchanges once; and sessions that do not (other keys, expired, ended);
 * - what Node alone asks of the real D1: a signed deletion event, the limit of failed exchanges;
 * - the cloud projects, through the real Worker, D1, R2 and Durable Object room, each scenario a
 *   person of its own and a browser that edits and a Worker that is asked what landed in its rooms:
 *   the switcher's panel, renaming from the explorer's header, saving the anonymous project,
 *   opening by address, the quota (`scenarios-projects`); a project archive exported from the panel
 *   and imported into the account, refused, or over the open project (`scenarios-import`); a canvas edit in the room, two devices
 *   converging, the caret, the undo rules, a file renamed from the explorer while another device
 *   types in it, a push through the API (`scenarios-editing`); the connection
 *   cut and kept out of reach, offline merge, IndexedDB, name collisions, a deleted project
 *   (`scenarios-offline`); versions and thumbnails (`scenarios-versions`); images, fonts and an SVG
 *   with a script (`scenarios-binaries`); the door of the socket route and the Worker's refusals as
 *   a program meets them, from Node (`scenarios-worker`); publishing as a program asks it (a
 *   handle, a page stored in R2 and read back at `/_published/` with its exact headers, the limits,
 *   the rate and the administrators' takedown: `scenarios-publishing`); a project looked at through
 *   its link by nobody signed in, by a signed-in viewer and by an editor, the copies, the `private`
 *   link that says only "not found", an access that changes while a page is open, and a viewer's
 *   explorer that offers nothing that changes the files (`scenarios-viewing`); the share dialog as the owner and as somebody who may only look,
 *   invitations made in the page and accepted in other browsers or at sign-in, the limit of members
 *   and what each kind of person is observed to be able to do at each link level
 *   (`scenarios-sharing`); publishing from the page, its address read back, unpublishing and a
 *   takedown (`scenarios-publish-dialog`); what the room refuses and a minute of typing measured
 *   through the room's own counters (`scenarios-limits`); live collaboration, two or three browsers
 *   in one room: who is here and where (the header, the carets and the canvas outlines), a name that
 *   looks like markup, typing in the same line with each person's undo, a drag and a keystroke, a
 *   refused change, a diagram another person adds appearing in the explorer while its focus and
 *   open folders stay, a socket the Worker cuts (and one the browser is closing while the caret moves),
 *   a page or a browser closed, a person silent for thirty seconds (a client of the room and a page
 *   that stops reaching it), a full room, viewers, what presence is never (saved, exported) and what it
 *   costs, and the room's rules for awareness from Node (`scenarios-collaboration`,
 *   `scenarios-collaboration-room`); the real command line (`mdg`, run from its sources as a child
 *   process on a computer of its own, `mdg.ts`) against this Worker: signing in at the approval page
 *   whose check the terminal printed, `push --create` of the purchase template, a page's edit seen by
 *   `review --base cloud`, `push` refused, checked and forced, `pull`, `publish` read back at
 *   `/_published/`, `projects --json`, `logout`, and no `mdg_` token in anything printed or logged
 *   (`scenarios-cli`);
 *   `cloud.ts`, `sharing.ts`, `collaboration.ts`, `room-socket.ts` and `mdg.ts` hold what they share;
 * - last, with the identity service gone, that a minted session still counts in development.
 *
 * Every request the browser makes, and every socket it opens, must go to the Worker's own origin (the
 * command line's listener excepted), no console error may be logged (but those a scenario provokes
 * on purpose, named in the scenario) and the Worker may print nothing but its requests. A scenario
 * that needs a second browser asks for one (`Run.device`): a context of its own, by default with the
 * same session, or with another person's (`as`), or with none (`as: null`: nobody signed in). The
 * browser speaks English unless a scenario says otherwise. The Worker serves a copy of the page's
 * build, so a build another program makes meanwhile does not reach a run.
 *
 * Usage: pnpm cloud:test-browser, about eight minutes: a minute of it typing, two of live collaboration,
 * three quarters of one the command line (more on a busy machine).
 * CLOUD_TEST_FILTER=text runs only the scenarios whose name holds the text (`a|b`: either of two).
 * Screenshots of failures go to a folder of the system's temporary folder, named then. The build
 * leaves packages/playground/dist made for the local identity service: every command that serves it
 * builds first.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { testKeys } from "@meltemi/identity/testing";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { browserPath } from "../../../vscode/scripts/browser.mjs";
import {
  ask,
  assertBase32IsTheRfcs,
  assertError,
  bearer,
  describeLogged,
  downloaded,
  expectOpen,
  expectedCheck,
  listen,
  makePerson,
  mintSession,
  openTemplate,
  outside,
  pageHolds,
  ready,
  SESSION_COOKIE,
  sessionCookie,
  signedEvent,
  socketsOutside,
  SuiteError,
  TOKEN_SHAPE,
  until,
  watch,
  withoutDownloads,
} from "./support.js";
import type { Device, Person, Run, Scenario } from "./scenario.js";
import { binaryScenarios } from "./scenarios-binaries.js";
import { cliScenarios } from "./scenarios-cli.js";
import { collaborationRoomScenarios } from "./scenarios-collaboration-room.js";
import { collaborationScenarios } from "./scenarios-collaboration.js";
import { editingScenarios } from "./scenarios-editing.js";
import { importScenarios } from "./scenarios-import.js";
import { limitScenarios } from "./scenarios-limits.js";
import { liveScenarios } from "./scenarios-live.js";
import { offlineScenarios } from "./scenarios-offline.js";
import { projectScenarios } from "./scenarios-projects.js";
import { publishDialogScenarios } from "./scenarios-publish-dialog.js";
import { publishingScenarios } from "./scenarios-publishing.js";
import { sharingScenarios } from "./scenarios-sharing.js";
import { versionScenarios } from "./scenarios-versions.js";
import { viewingScenarios } from "./scenarios-viewing.js";
import { workerScenarios } from "./scenarios-worker.js";
import { startFakeIdentity, type FakeIdentity } from "./identity.js";
import { CLOUD, IDENTITY, SITE, runToEnd, startWorker, type RunningWorker } from "./worker.js";

const failures = join(tmpdir(), "meltemi-cloud-browser-failures");

/** The link that signs a person in at the identity service and brings them back to `returnTo`. */
const signInAt = (returnTo: string): string =>
  `${IDENTITY}/login?return_to=${encodeURIComponent(returnTo)}`;

/** A project id as the Worker accepts it in an address: 20 lowercase letters and digits. */
const PROJECT = "01h2x5z8kq3m7n9p2r4t";

const DAY = 24 * 60 * 60 * 1000;

/** The header's account button, the menu it opens and the entries by their words. */
function accountParts(page: Page) {
  return {
    button: page.locator(".topbar .account-button"),
    menu: page.locator("#menu-account"),
  };
}

const scenarios: Scenario[] = [
  {
    name: "the account panel reads sign-ins and devices through the Worker, signed and with Ana's session, and signs a device out",
    signedIn: "u-ana-panel",
    async run(t) {
      const { page, worker, identity, context } = t;
      // Ana has a second device, a phone, besides this browser.
      identity.account("u-ana-panel", {
        sessions: [{ sid: "sid-panel-phone", label: "Firefox on Android" }],
      });
      await t.open("/");
      const { button, menu } = accountParts(page);
      await button.click();
      await menu.getByRole("menuitem", { name: "Account", exact: true }).click();
      const panel = page.locator("dialog.settings[open]");
      await panel.waitFor();
      assert.equal(await page.locator("iframe").count(), 0, "nothing is framed");
      assert.equal(context.pages().length, 1, "no tab was opened");

      // Sign-ins: the stand-in's GitHub identity, the only one, which cannot be unlinked.
      await panel.getByRole("tab", { name: "Sign-ins" }).click();
      const signins = panel.locator("#account-section-signins .signin-list .account-row");
      await signins.first().waitFor();
      assert.equal(await signins.count(), 1);
      assert.equal(
        await signins.first().getByRole("button", { name: "Unlink GitHub" }).isDisabled(),
        true,
      );

      // The Worker made the call, signed as this product and with Ana's session.
      const read = identity.accountCalls.find(
        (call) => call.path === "/api/account" && call.sub === "u-ana-panel",
      );
      assert.ok(read, "the identity service was asked for Ana's account");
      assert.equal(read.product, "diagrams");
      assert.equal(read.status, 200);

      // Devices: the phone is signed out after a question, and its session ends at the identity
      // service: the Worker asks about it once its cache lets go, and finds nobody.
      await panel.getByRole("tab", { name: "Devices" }).click();
      const devices = panel.locator("#account-section-devices .device-list .account-row");
      await until(
        page,
        "two devices",
        () =>
          document.querySelectorAll("#account-section-devices .device-list .account-row").length ===
          2,
      );
      await panel.getByRole("button", { name: "Sign out Firefox on Android" }).click();
      await page
        .locator("dialog[open]")
        .last()
        .getByRole("button", { name: "Sign out the device", exact: true })
        .click();
      await until(
        page,
        "the phone to go",
        () =>
          document.querySelectorAll(
            "#account-section-devices .device-list .account-row:not(.row-gone)",
          ).length === 1,
      );
      assert.equal(await devices.filter({ hasText: "This device" }).count(), 1);
      assert.ok(
        identity.accountCalls.some(
          (call) =>
            call.path === "/api/account/sessions/sid-panel-phone/revoke" && call.status === 200,
        ),
        "the identity service signed the phone out",
      );
      assert.equal(
        (await fetch(`${IDENTITY}/sessions/sid-panel-phone`)).status,
        404,
        "the phone's session ended",
      );

      // An API token cannot read the account, and another page cannot change it.
      const made = await t.ask("/api/tokens", {
        method: "POST",
        headers: { ...t.cookie, Origin: worker.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "panel" }),
      });
      const token = made.json()["token"] as string;
      assertError(
        await t.ask("/api/account/identity", { headers: bearer(token) }),
        403,
        "request.forbidden",
      );
      assertError(
        await t.ask("/api/account/identity/sessions/revoke-others", {
          method: "POST",
          headers: { ...t.cookie, Origin: IDENTITY },
        }),
        403,
        "request.forbidden",
      );
    },
  },
  {
    name: "anonymous: Sign in links to the identity service, the Worker answers the session, the playground works as before",
    async run(t) {
      const { page, origin } = t;
      const session = await t.open("/");

      // The Worker answers `api/session`: the static file of the same path is `{"user":null}`.
      assert.equal(readFileSync(join(t.worker.site, "api", "session"), "utf8"), '{"user":null}');
      assert.equal(session.status, 200);
      assert.deepEqual(session.json, { user: null, signIn: signInAt(`${origin}/`) });
      assert.match(session.headers["content-type"] ?? "", /^application\/json/);
      assert.equal(session.headers["cache-control"], "no-store");

      // The page's own files, served by the assets platform without running the Worker (it runs
      // first for its own paths only), carry the build's `_headers`: no other site may frame the
      // page (its policy is a meta tag, which cannot) and each file is what its type says.
      // The agent setup page, its twin, its stylesheet and the prompt are files of the page too.
      for (const path of [
        "/",
        "/playground.js",
        "/playground.css",
        "/favicon.svg",
        "/agent-setup/",
        "/es/agent-setup/",
        "/agent-setup/prompt.md",
        "/agent-setup/agent-setup.css",
      ]) {
        const file = await t.ask(path);
        assert.equal(file.status, 200, path);
        assert.equal(file.headers.get("content-security-policy"), "frame-ancestors 'self'", path);
        assert.equal(file.headers.get("x-content-type-options"), "nosniff", path);
      }
      // The prompt an agent is told to read is the command line's file, as the build copied it.
      const prompt = await t.ask("/agent-setup/prompt.md");
      assert.match(prompt.headers.get("content-type") ?? "", /^text\/(markdown|plain)/);
      assert.equal(
        prompt.text,
        readFileSync(new URL("../../../cli/agent-setup/prompt.md", import.meta.url), "utf8"),
      );
      // A file that is not there is the platform's 404: there is nothing in it to frame.
      const missing = await t.ask("/nothing-here.js");
      assert.equal(missing.status, 404);

      // The header offers sign-in as a link to the identity service, back to this page.
      const topbar = page.locator(".topbar");
      const signIn = topbar.getByRole("link", { name: "Sign in" });
      assert.equal(await signIn.count(), 1);
      const href = await signIn.getAttribute("href");
      assert.ok(href?.startsWith(`${IDENTITY}/login?return_to=`), `Sign in goes to ${href}`);
      assert.equal(href, signInAt(`${origin}/`));
      assert.equal(await topbar.locator(".account-button").count(), 0, "no account menu");

      // The playground as it was: the flow template, its code, no problem, every button named.
      await expectOpen(page, "diagrams/overview.meltemi");
      assert.match(await page.locator(".code-input").inputValue(), /diagram overview: flow/);
      assert.equal(await page.locator("#problems-title").textContent(), "No problems");
      assert.ok((await page.locator('#app .content g[data-role="element"]').count()) >= 3);
      assert.ok((await page.locator(".code-highlight .hl-keyword").count()) > 3);
      for (const button of await topbar.locator("button").all()) {
        const name = (await button.getAttribute("aria-label")) ?? (await button.textContent());
        assert.ok(name?.trim(), "every button of the header has a name");
      }
      await openTemplate(page, "c4");
      await until(
        page,
        "the c4 template drawn",
        () => document.querySelectorAll('#app .content g[data-role="element"]').length >= 3,
      );
      assert.equal(await page.locator("#problems-title").textContent(), "No problems");

      // Asked from Node, the Worker says where to come back to: the page's own address, never another site's.
      const root = await t.ask("/api/session");
      assert.deepEqual(root.json(), { user: null, signIn: signInAt(`${origin}/`) });
      const there = `${origin}/?project=${PROJECT}&invite=t`;
      const own = await t.ask("/api/session", { headers: { Referer: there } });
      assert.deepEqual(own.json(), { user: null, signIn: signInAt(there) });
      const foreign = await t.ask("/api/session", {
        headers: { Referer: "https://example.com/elsewhere?x=1" },
      });
      assert.deepEqual(foreign.json(), { user: null, signIn: signInAt(`${origin}/`) });

      // A path under /api that is not a route is the Worker's JSON 404, never a file.
      assertError(await t.ask("/api/nothing"), 404, "not-found");
    },
  },
  {
    name: "a project link redirects to the page with its query, and the page loads there",
    // Nobody is signed in: the page asks whether the link admits them, and the Worker's 404 is
    // what the browser logs for the project that does not exist.
    allowedErrors: [/status of 404/],
    async run(t) {
      const { page, origin } = t;
      // The redirect as the Worker sends it, then a link that cannot be a project's.
      const redirect = await t.ask(`/p/${PROJECT}?invite=t`);
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.get("location"), `/?project=${PROJECT}&invite=t`);
      const malformed = await t.ask("/p/not-an-id");
      assertError(malformed, 404, "project.not-found");
      assert.equal(malformed.headers.get("location"), null, "no redirect");

      // The browser follows it, the page loads at the new address and keeps it.
      const session = await t.open(`/p/${PROJECT}?invite=t`);
      const landed = `${origin}/?project=${PROJECT}&invite=t`;
      assert.equal(page.url(), landed);
      await expectOpen(page, "diagrams/overview.meltemi");
      assert.ok((await page.locator('#app .content g[data-role="element"]').count()) >= 3);
      // The link carries an invitation and nobody is signed in: the page says to sign in to accept
      // it, keeps the address, and opens the anonymous project as it was.
      await until(
        page,
        "the status line to say to sign in",
        () =>
          document.querySelector(".status-text")?.textContent?.includes("Sign in to accept") ??
          false,
      );
      assert.match(
        await page.locator(".status-text").innerText(),
        /Sign in to accept the invitation/,
      );
      assert.equal(await page.locator(".view-badge").count(), 0, "nothing is shown to view");
      // Sign in brings the person back to the project they were opening.
      assert.deepEqual(session.json, { user: null, signIn: signInAt(landed) });
      const signIn = page.locator(".topbar").getByRole("link", { name: "Sign in" });
      assert.equal(await signIn.getAttribute("href"), signInAt(landed));
    },
  },
  {
    name: "a session that does not count is nobody: signed with other keys, or expired",
    async run(t) {
      const { page, context, origin, worker } = t;
      const sessions: [string, string][] = [
        [
          "signed with other keys",
          await mintSession(worker, "u-mallory", { keys: await testKeys() }),
        ],
        [
          "expired yesterday",
          await mintSession(worker, "u-mallory", { at: new Date(Date.now() - 31 * DAY) }),
        ],
      ];
      for (const [label, token] of sessions) {
        await context.clearCookies();
        await context.addCookies([sessionCookie(token)]);
        const session = await t.open("/");
        assert.deepEqual(session.json, { user: null, signIn: signInAt(`${origin}/`) }, label);
        const topbar = page.locator(".topbar");
        assert.equal(await topbar.getByRole("link", { name: "Sign in" }).count(), 1, label);
        assert.equal(await topbar.locator(".account-button").count(), 0, label);
        // It is no cookie at all: even from the page's own origin it makes no token.
        const refused = await t.ask("/api/tokens", {
          method: "POST",
          headers: {
            Cookie: `${SESSION_COOKIE}=${token}`,
            "Content-Type": "application/json",
            Origin: origin,
          },
          body: JSON.stringify({ name: "mine" }),
        });
        assertError(refused, 401, "auth.required");
      }
    },
  },
  {
    name: "the session check: the identity service is asked once for a session, and one it has ended is nobody",
    async run(t) {
      const { page, context, origin, worker, identity } = t;
      const cookieOf = (token: string) => ({ Cookie: `${SESSION_COOKIE}=${token}` });

      // A live session is asked about once, however many requests follow.
      const live = await mintSession(worker, "u-ana-live", { sid: "sid-live" });
      for (let request = 1; request <= 4; request++) {
        const answer = await t.ask("/api/session", { headers: cookieOf(live) });
        assert.equal((answer.json()["user"] as { sub: string } | null)?.sub, "u-ana-live");
      }
      assert.deepEqual(
        identity.asked.filter((sid) => sid === "sid-live"),
        ["sid-live"],
      );

      // One the identity service has ended counts as nobody, in the page as well.
      const gone = await mintSession(worker, "u-ana-gone", { sid: "sid-gone" });
      identity.end("sid-gone");
      await context.addCookies([sessionCookie(gone)]);
      const session = await t.open("/");
      assert.deepEqual(session.json, { user: null, signIn: signInAt(`${origin}/`) });
      const topbar = page.locator(".topbar");
      assert.equal(await topbar.getByRole("link", { name: "Sign in" }).count(), 1);
      assert.equal(await topbar.locator(".account-button").count(), 0);
      assert.ok(identity.asked.includes("sid-gone"), "the Worker asked about the ended session");
    },
  },
  {
    name: "signed in: Ana in the header with her avatar from the Worker's origin, a menu of three entries",
    signedIn: "u-ana-menu",
    async run(t) {
      const { page, origin } = t;
      const session = await t.open("/");
      assert.equal(session.status, 200);
      assert.equal(session.headers["cache-control"], "no-store");
      assert.deepEqual(session.json, {
        user: { sub: "u-ana-menu", name: "Ana", picture: `${origin}/favicon.svg`, handle: null },
        account: `${IDENTITY}/account`,
        signOut: `${IDENTITY}/logout`,
      });

      // The person, not the sign-in link.
      const topbar = page.locator(".topbar");
      assert.equal(await topbar.getByRole("link", { name: "Sign in" }).count(), 0);
      const { button, menu } = accountParts(page);
      assert.equal(await button.count(), 1);
      assert.equal(await button.getAttribute("aria-label"), "Account: Ana");
      assert.equal(await button.locator(".account-name").textContent(), "Ana");
      const avatar = button.locator("img.account-avatar");
      assert.equal(await avatar.getAttribute("src"), `${origin}/favicon.svg`);
      const drawn = await avatar.evaluate((image) =>
        (image as HTMLImageElement).decode().then(
          () => true,
          () => false,
        ),
      );
      assert.equal(drawn, true, "her picture loads from the Worker's origin");

      // The menu: Account (the account panel), API tokens (the panel at that section), Sign out (a form).
      assert.equal(await menu.isVisible(), false);
      await button.click();
      assert.equal(await menu.isVisible(), true);
      assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), [
        "Account",
        "API tokens",
        "Sign out",
      ]);
      const account = menu.getByRole("menuitem", { name: "Account", exact: true });
      assert.equal(await account.getAttribute("href"), null, "Account opens the panel, not a tab");
      const form = menu.locator("form");
      assert.equal(await form.getAttribute("method"), "post");
      assert.equal(await form.getAttribute("action"), `${IDENTITY}/logout`);
      assert.equal(await form.locator('input[type="hidden"][name="return_to"]').count(), 1);

      // The form is watched, not sent: the identity service is not running, and what the page
      // would post is its own address as the way back.
      await page.evaluate(() => {
        document.addEventListener("submit", (event) => {
          event.preventDefault();
          const sent = event.target as HTMLFormElement;
          (window as unknown as { signedOut: unknown }).signedOut = {
            action: sent.action,
            method: sent.method,
            fields: [...new FormData(sent).entries()],
          };
        });
      });
      await form.getByRole("menuitem", { name: "Sign out" }).click();
      assert.deepEqual(
        await page.evaluate(() => (window as unknown as { signedOut: unknown }).signedOut),
        { action: `${IDENTITY}/logout`, method: "post", fields: [["return_to", `${origin}/`]] },
      );
    },
  },
  {
    name: "API tokens: made in the account panel and shown once, listed, used as a bearer, revoked",
    signedIn: "u-ana-tokens",
    async run(t) {
      const { page, origin, seen } = t;
      await t.open("/");
      const { button, menu } = accountParts(page);
      const openDialog = async () => {
        await button.click();
        await menu.getByRole("menuitem", { name: "API tokens", exact: true }).click();
      };
      await openDialog();
      const dialog = page.locator("dialog[open]");
      assert.equal(await dialog.locator("h2").first().textContent(), "Account");
      assert.equal(
        await dialog.getByRole("tab", { name: "API tokens" }).getAttribute("aria-selected"),
        "true",
      );
      await until(
        page,
        "the list to load",
        () => document.querySelector("dialog[open] .token-count")?.textContent === "0 of 20 tokens",
      );
      assert.equal(await dialog.getByText("You have no API tokens yet.").isVisible(), true);

      // A token is made with its name and shown, once, with the prefix of every token.
      await dialog.getByLabel("Name", { exact: true }).fill("ci build");
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
      const field = dialog.locator(".token-value");
      await field.waitFor();
      const token = await field.inputValue();
      assert.match(token, TOKEN_SHAPE);
      assert.equal(
        await dialog.locator(".token-status").textContent(),
        "Created the token ci build.",
      );

      // It is listed, never used so far.
      const rows = dialog.locator(".token-row");
      await until(
        page,
        "the new token in the list",
        () => document.querySelectorAll("dialog[open] .token-row").length === 1,
      );
      assert.deepEqual(await rows.locator(".token-name").allTextContents(), ["ci build"]);
      assert.ok(((await rows.locator(".token-meta").textContent()) ?? "").endsWith("Never used"));
      assert.equal(await dialog.locator(".token-count").textContent(), "1 of 20 tokens");
      const id = await rows.first().getAttribute("data-token-id");
      assert.ok(id, "the row names its token");

      // Used as a bearer from Node: Ana's request, with the token's id and name, and no account.
      const asToken = await t.ask("/api/session", { headers: bearer(token) });
      assert.equal(asToken.status, 200);
      assert.deepEqual(asToken.json(), {
        user: { sub: "u-ana-tokens", name: "Ana", picture: `${origin}/favicon.svg`, handle: null },
        token: { id, name: "ci build" },
      });
      const listed = await t.ask("/api/tokens", { headers: bearer(token) });
      const held = (listed.json()["tokens"] ?? []) as { id: string; last_used_at: string | null }[];
      assert.deepEqual(
        held.map((row) => row.id),
        [id],
      );
      assert.equal(typeof held[0]?.last_used_at, "string", "the use is recorded");
      // A token cannot make another one; only the page, with the cookie, does.
      assertError(
        await t.ask("/api/tokens", {
          method: "POST",
          headers: { ...bearer(token), "Content-Type": "application/json" },
          body: JSON.stringify({ name: "copy" }),
        }),
        403,
        "request.forbidden",
      );

      // Closing the panel drops the token from the page, and it is nowhere in the browser.
      await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
      await until(page, "the dialog to close", () => document.querySelector("dialog") === null);
      assert.equal(await pageHolds(page, token), false, "the token is gone from the page");
      const stored = await page.evaluate(() =>
        JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
      );
      assert.equal(stored.includes(token), false, "the token is not kept in the browser");
      await openDialog();
      await rows.first().waitFor();
      assert.equal(await dialog.locator(".token-reveal").isVisible(), false);
      assert.equal(await pageHolds(page, token), false, "reopened, the dialog does not show it");

      // A revocation asks first, then the token is gone and answers 401 token.invalid.
      await dialog.getByRole("button", { name: "Revoke the token ci build" }).click();
      const sure = page.locator("dialog[open]").last();
      assert.equal(await sure.locator("h2").textContent(), "Revoke the token?");
      await sure.getByRole("button", { name: "Revoke the token", exact: true }).click();
      await until(
        page,
        "the token to go",
        () => document.querySelectorAll("dialog[open] .token-row").length === 0,
      );
      assert.equal(
        await dialog.locator(".token-status").textContent(),
        "Revoked the token ci build.",
      );
      assertError(await t.ask("/api/session", { headers: bearer(token) }), 401, "token.invalid");
      assert.deepEqual((await t.ask("/api/tokens", { headers: t.cookie })).json(), { tokens: [] });

      assert.deepEqual(
        seen.requests.filter((address) => address.includes(token)),
        [],
        "the token was never in an address",
      );
    },
  },
  {
    name: "the Origin rule: a request with the person's cookie from another host of the family is refused",
    signedIn: "u-ana-origin",
    async run(t) {
      const { origin } = t;
      const json = { "Content-Type": "application/json" };
      const body = JSON.stringify({ name: "from elsewhere" });
      const tokens = async () => (await t.ask("/api/tokens", { headers: t.cookie })).json();

      // The identity service is a host of the family: it holds the same cookie, and is refused.
      assertError(
        await t.ask("/api/tokens", {
          method: "POST",
          headers: { ...t.cookie, ...json, Origin: IDENTITY },
          body,
        }),
        403,
        "request.forbidden",
      );
      // So is a request that says nothing about where it comes from.
      assertError(
        await t.ask("/api/tokens", { method: "POST", headers: { ...t.cookie, ...json }, body }),
        403,
        "request.forbidden",
      );
      assert.deepEqual(await tokens(), { tokens: [] }, "no token was created");

      // The page's own origin: the route runs.
      const made = await t.ask("/api/tokens", {
        method: "POST",
        headers: { ...t.cookie, ...json, Origin: origin },
        body,
      });
      assert.equal(made.status, 201);
      const created = made.json() as { id: string; name: string; token: string };
      assert.match(created.token, TOKEN_SHAPE);
      assert.equal(((await tokens())["tokens"] as unknown[]).length, 1);

      // A bearer token needs no Origin, and revokes itself.
      const revoked = await t.ask(`/api/tokens/${encodeURIComponent(created.id)}`, {
        method: "DELETE",
        headers: bearer(created.token),
      });
      assert.equal(revoked.status, 204);
      assert.deepEqual(await tokens(), { tokens: [] });
    },
  },
  {
    name: "deletion events: a signed user.deleted removes the person's tokens and ends the session they held, a forged one changes nothing",
    signedIn: "u-ana-events",
    async run(t) {
      const { origin, worker } = t;
      const made = await t.ask("/api/tokens", {
        method: "POST",
        headers: { ...t.cookie, "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ name: "doomed" }),
      });
      assert.equal(made.status, 201);
      const token = String(made.json()["token"]);
      const works = async () => (await t.ask("/api/session", { headers: bearer(token) })).status;
      assert.equal(await works(), 200);

      const eventId = () => `evt_${randomBytes(8).toString("hex")}`;
      const deleted = {
        id: eventId(),
        type: "user.deleted",
        sub: "u-ana-events",
        at: new Date().toISOString(),
      };
      const post = (signed: { body: string; headers: Record<string, string> }) =>
        t.ask("/_identity/events", { method: "POST", headers: signed.headers, body: signed.body });

      // Signed with another secret, or changed after it was signed: refused, nothing changes.
      assertError(await post(signedEvent("not the secret", deleted)), 401, "signature.invalid");
      const genuine = signedEvent(worker.eventsSecret, deleted);
      const altered = { ...genuine, body: genuine.body.replace("u-ana-events", "u-someone-else") };
      assertError(await post(altered), 401, "signature.invalid");
      assert.equal(await works(), 200, "the token still works");

      // An event of another type is signed, acknowledged and ignored.
      const renamed = { ...deleted, id: eventId(), type: "user.renamed" };
      assert.equal((await post(signedEvent(worker.eventsSecret, renamed))).status, 200);
      assert.equal(await works(), 200, "the token still works");

      // The deletion removes the token; a delivery repeated is acknowledged all the same.
      assert.equal((await post(genuine)).status, 200);
      assertError(await t.ask("/api/session", { headers: bearer(token) }), 401, "token.invalid");
      assert.equal((await post(genuine)).status, 200);

      // The session the person still holds was issued before the deletion: it counts as nobody,
      // although the Worker trusted it a moment ago, and it makes nothing of theirs again.
      assertError(await t.ask("/api/tokens", { headers: t.cookie }), 401, "auth.required");
      assert.equal((await t.ask("/api/session", { headers: t.cookie })).json()["user"], null);

      // A person who signs in again, in a later second, is a person again.
      const again = await mintSession(worker, "u-ana-events", { at: new Date(Date.now() + 2_000) });
      const back = await t.ask("/api/session", {
        headers: { Cookie: `${SESSION_COOKIE}=${again}` },
      });
      assert.equal((back.json()["user"] as { sub: string }).sub, "u-ana-events");
    },
  },
  {
    name: "/cli-auth refuses what it cannot use: signed out it goes to sign-in, a bad port or state and a form without its csrf are refused",
    signedIn: "u-ana-refused",
    async run(t) {
      const { origin } = t;
      const state = randomBytes(24).toString("base64url");

      // Without a session it sends the person to sign in, and back to this very address.
      const address = `/cli-auth?port=43123&state=${state}`;
      const signedOut = await t.ask(address);
      assert.equal(signedOut.status, 302);
      assert.equal(signedOut.headers.get("location"), signInAt(`${origin}${address}`));

      // A port or a state the page cannot use is a 400 page that shows its code, signed in or not.
      const unusable = [
        `port=80&state=${state}`,
        `port=localhost:4000&state=${state}`,
        `port=43123&state=${"s".repeat(8)}`,
        `port=43123&state=${"s".repeat(129)}`,
      ];
      for (const query of unusable) {
        for (const headers of [{}, t.cookie]) {
          const refused = await t.ask(`/cli-auth?${query}`, { headers });
          assert.equal(refused.status, 400, query);
          assert.match(refused.text, /<code>cli\.invalid<\/code>/, query);
        }
      }

      // The form of a session that was not given the page's csrf is refused, and stores nothing.
      const post = (fields: Record<string, string>) =>
        t.ask("/cli-auth", {
          method: "POST",
          headers: {
            ...t.cookie,
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: origin,
          },
          body: new URLSearchParams(fields).toString(),
        });
      // (A token of the wrong length is checked by the runtime's own HMAC: it must say no, not fail.)
      const forms: Record<string, string>[] = [
        { port: "43123", state },
        { port: "43123", state, csrf: "0".repeat(64) },
        { port: "43123", state, csrf: "ab" },
        { port: "43123", state, csrf: "0".repeat(66) },
        { port: "43123", state, csrf: "" },
        { port: "43123", state, csrf: "not hexadecimal" },
      ];
      for (const fields of forms) {
        const refused = await post(fields);
        assert.equal(refused.status, 403);
        assert.match(refused.text, /<code>request\.forbidden<\/code>/);
        assert.equal(refused.headers.get("location"), null, "no redirect to the listener");
      }
    },
  },
  {
    name: "/cli-auth: approved in the browser, the listener gets a code that is exchanged once for a token",
    signedIn: "u-ana-cli",
    async run(t) {
      assertBase32IsTheRfcs();
      const { page, context, origin, seen } = t;
      const listener = await listen();
      t.allow(listener.origin);
      try {
        const state = randomBytes(24).toString("base64url");
        const response = await page.goto(`${origin}/cli-auth?port=${listener.port}&state=${state}`);
        assert.equal(response?.status(), 200);
        const headers = response?.headers() ?? {};
        assert.equal(headers["referrer-policy"], "same-origin");
        assert.ok(
          headers["content-security-policy"]?.includes("form-action 'self' http://127.0.0.1:*"),
          headers["content-security-policy"],
        );
        assert.equal(headers["cache-control"], "no-store");

        // The page asks, names the port and shows the check the terminal shows too.
        assert.equal(
          await page.locator("h1").textContent(),
          "Allow the command line on this computer?",
        );
        const text = await page.locator("main").innerText();
        assert.match(text, /You are signed in as Ana\./);
        assert.match(text, new RegExp(`port ${listener.port} of this computer`));
        assert.equal(await page.locator("code.check").textContent(), expectedCheck(state));
        assert.equal(expectedCheck(state).length, 6);

        // Approve: the browser is sent to the listener, with the one-time code and the state.
        await Promise.all([
          page.waitForURL((address) => address.origin === listener.origin),
          page.getByRole("button", { name: "Approve", exact: true }).click(),
        ]);
        const landed = new URL(page.url());
        assert.equal(landed.origin, listener.origin);
        assert.equal(landed.pathname, "/");
        assert.deepEqual([...landed.searchParams.keys()].sort(), ["code", "state"]);
        const code = landed.searchParams.get("code") ?? "";
        assert.match(code, /^[A-Za-z0-9_-]{43}$/);
        assert.equal(landed.searchParams.get("state"), state);
        assert.match((await page.locator("body").textContent()) ?? "", /has your answer/);
        const arrivals = listener.arrivals.filter((arrival) => arrival.path === "/");
        assert.equal(arrivals.length, 1, "the listener was asked once");
        assert.equal(arrivals[0]?.query.get("code"), code);
        assert.equal(arrivals[0]?.query.get("state"), state);
        assert.equal(arrivals[0]?.headers["referer"], undefined, "the page hands no Referer on");

        // No token exists yet: the person holds none.
        assert.deepEqual((await t.ask("/api/tokens", { headers: t.cookie })).json(), {
          tokens: [],
        });

        // The command line exchanges the code, from a terminal (no cookie, no Origin), once.
        const exchange = { code, state };
        const sent = () =>
          t.ask("/cli-auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(exchange),
          });
        const first = await sent();
        assert.equal(first.status, 200, first.text);
        const made = first.json() as { id: string; name: string; token: string };
        assert.deepEqual(Object.keys(made).sort(), ["id", "name", "token"]);
        assert.match(made.name, /^CLI \(\d{4}-\d{2}-\d{2}\)$/);
        assert.match(made.token, TOKEN_SHAPE);
        assertError(await sent(), 400, "cli.invalid");

        // The token is the person's, and it is the only one.
        const me = await t.ask("/api/session", { headers: bearer(made.token) });
        assert.deepEqual(me.json()["token"], { id: made.id, name: made.name });
        const mine = await t.ask("/api/tokens", { headers: t.cookie });
        const names = ((mine.json()["tokens"] ?? []) as { id: string; name: string }[]).map(
          (row) => [row.id, row.name],
        );
        assert.deepEqual(names, [[made.id, made.name]]);

        // Nothing the browser showed, requested or was sent to holds the token.
        for (const open of context.pages()) {
          assert.equal((await open.content()).includes(made.token), false, "no page holds it");
        }
        assert.deepEqual(
          seen.requests.filter((address) => address.includes(made.token)),
          [],
        );
        assert.equal(JSON.stringify(listener.arrivals).includes(made.token), false);

        // The token is revoked with itself, as a program does.
        const revoked = await t.ask(`/api/tokens/${encodeURIComponent(made.id)}`, {
          method: "DELETE",
          headers: bearer(made.token),
        });
        assert.equal(revoked.status, 204);
      } finally {
        await listener.close();
      }
    },
  },
  {
    name: "/cli-auth/token: ten failed exchanges from one address, then 429 cli.rate; another address is not limited",
    async run(t) {
      // The address the Worker counts is the one Cloudflare puts in this header.
      const exchange = (address: string, code: string) =>
        t.ask("/cli-auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": address },
          body: JSON.stringify({ code, state: "s".repeat(24) }),
        });
      for (let attempt = 1; attempt <= 10; attempt++) {
        assertError(await exchange("203.0.113.9", `no-such-code-${attempt}`), 400, "cli.invalid");
      }
      assertError(await exchange("203.0.113.9", "no-such-code-11"), 429, "cli.rate");
      assertError(await exchange("203.0.113.10", "no-such-code"), 400, "cli.invalid");
    },
  },
  {
    name: "a body over the cap is read no further, and a reserved path is the Worker's in any spelling",
    signedIn: "u-ana-caps",
    async run(t) {
      const { origin } = t;
      const state = "s".repeat(24);
      const padding = "a".repeat(64 * 1024);
      const form = { "Content-Type": "application/x-www-form-urlencoded" };
      const json = { "Content-Type": "application/json" };

      // Somebody not signed in posts an approval form far over the cap: it is not a form, so they
      // are sent to sign in. Nothing was kept to answer them.
      const signedOut = await t.ask("/cli-auth", {
        method: "POST",
        headers: form,
        body: `port=43123&state=${state}&pad=${padding}`,
      });
      assert.equal(signedOut.status, 302);
      assert.ok(signedOut.headers.get("location")?.startsWith(`${IDENTITY}/login?return_to=`));

      // A person signed in posts the same from the page, csrf token and all: the refused page, and
      // no redirect to the listener (without the cap this form would be approved).
      const asked = await t.ask(`/cli-auth?port=43123&state=${state}`, { headers: t.cookie });
      const csrf = /name="csrf" value="([0-9a-f]+)"/.exec(asked.text)?.[1];
      assert.ok(csrf, "the approval page holds a csrf token");
      const fields = (extra: string) => `port=43123&state=${state}&csrf=${csrf}${extra}`;
      const refused = await t.ask("/cli-auth", {
        method: "POST",
        headers: { ...t.cookie, ...form, Origin: origin },
        body: fields(`&pad=${padding}`),
      });
      assert.equal(refused.status, 403);
      assert.match(refused.text, /<code>request\.forbidden<\/code>/);
      assert.equal(refused.headers.get("location"), null);
      // The same form without the padding is approved: it was the length that was refused.
      const approved = await t.ask("/cli-auth", {
        method: "POST",
        headers: { ...t.cookie, ...form, Origin: origin },
        body: fields(""),
      });
      assert.equal(approved.status, 303);
      assert.ok(approved.headers.get("location")?.startsWith("http://127.0.0.1:43123/?code="));

      // A token's name with a body over the cap is a 400 and makes nothing.
      assertError(
        await t.ask("/api/tokens", {
          method: "POST",
          headers: { ...t.cookie, ...json, Origin: origin },
          body: JSON.stringify({ name: "big", padding }),
        }),
        400,
        "request.invalid",
      );
      assert.deepEqual((await t.ask("/api/tokens", { headers: t.cookie })).json(), { tokens: [] });

      // A reserved path spelled with escapes never reaches another file. The Worker answers it
      // with its 404; or the assets platform, which matches `run_worker_first` on the path as
      // written, redirects it to its plain spelling, which the Worker answers; or it serves the one
      // static file under a reserved name, the anonymous session (the answer the Worker gives
      // nobody). Which one depends on the platform.
      for (const path of ["/%61pi/session", "/api%2Fsession"]) {
        const answer = await t.ask(path);
        if (answer.status === 404) {
          assertError(answer, 404, "not-found");
        } else if ([301, 302, 307, 308].includes(answer.status)) {
          const target = new URL(answer.headers.get("location") ?? "", t.origin);
          assert.equal(target.origin, t.origin, path);
          assert.equal(target.pathname, "/api/session", path);
          const followed = await t.ask(target.pathname);
          assert.equal(followed.status, 200, path);
          assert.match(followed.headers.get("content-type") ?? "", /^application\/json/, path);
          assert.ok("signIn" in followed.json(), `${path}: the Worker answers, not the file`);
        } else {
          assert.equal(answer.status, 200, path);
          assert.equal(answer.text, '{"user":null}', path);
        }
      }
    },
  },
  {
    // Last: the identity service stays stopped.
    name: "without an identity service (development only) a minted session still counts",
    async run(t) {
      const { worker, identity } = t;
      await identity.close();
      const token = await mintSession(worker, "u-ana-alone", { sid: "sid-alone" });
      const answer = await t.ask("/api/session", {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      });
      assert.equal((answer.json()["user"] as { sub: string } | null)?.sub, "u-ana-alone");
      assert.equal(identity.asked.includes("sid-alone"), false, "nobody was there to ask");
    },
  },
];

// The scenarios of the cloud projects go before the last one, which stops the identity service.
const stopsIdentity = scenarios.pop();
scenarios.push(
  ...projectScenarios,
  ...importScenarios,
  ...editingScenarios,
  ...offlineScenarios,
  ...versionScenarios,
  ...binaryScenarios,
  ...workerScenarios,
  ...publishingScenarios,
  ...viewingScenarios,
  ...sharingScenarios,
  ...publishDialogScenarios,
  ...limitScenarios,
  ...collaborationScenarios,
  ...collaborationRoomScenarios,
  ...liveScenarios,
  ...cliScenarios,
);
if (stopsIdentity) scenarios.push(stopsIdentity);

// ---------------------------------------------------------------------------------------------
// The run

/** The page, built for the identity service on this laptop; the Worker serves this folder. */
async function buildPage(): Promise<void> {
  const root = resolve(CLOUD, "..", "..");
  const env = { ...process.env, PLAYGROUND_IDENTITY: IDENTITY };
  const pnpm = process.env["npm_execpath"];
  const options = { cwd: root, env };
  // The program that started this one (pnpm), else the `pnpm` of the PATH.
  if (pnpm && /pnpm/i.test(basename(pnpm)) && /\.[cm]?js$/.test(pnpm)) {
    await runToEnd(process.execPath, [pnpm, "playground:build"], options);
  } else if (pnpm && /pnpm/i.test(basename(pnpm))) {
    await runToEnd(pnpm, ["playground:build"], options);
  } else {
    await runToEnd("pnpm", ["playground:build"], {
      ...options,
      shell: process.platform === "win32",
    });
  }
  const policy = readFileSync(join(SITE, "index.html"), "utf8");
  if (!policy.includes(`form-action 'self' ${IDENTITY}`)) {
    throw new SuiteError(`The page was not built for the identity service at ${IDENTITY}.`);
  }
}

/** The browser, found before anything is built or started so that its absence costs nothing. */
function findBrowser(): string {
  try {
    return browserPath();
  } catch (error) {
    throw new SuiteError(`Cannot run the browser suite: ${(error as Error).message}`);
  }
}

async function runScenario(
  browser: Browser,
  worker: RunningWorker,
  identity: FakeIdentity,
  scenario: Scenario,
  index: number,
): Promise<void> {
  const newContext = async (locale?: string): Promise<BrowserContext> => {
    const made = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
      locale: locale ?? scenario.locale ?? "en-US",
    });
    made.setDefaultTimeout(30_000);
    return made;
  };
  const context = await newContext();
  const seen = watch(context);
  const allowed = [worker.origin];
  const devices: Device[] = [];
  const pages: Page[] = [];
  /** What each browser of the scenario saw. */
  const browsers = () => [seen, ...devices.map((device) => device.seen)];
  /** The downloads of every browser of the scenario, once they have ended. */
  const files = () => downloaded(browsers().flatMap((watched) => watched.downloads));
  /** What every browser of the scenario logged, minus its downloads and what it provokes on purpose. */
  const logged = async (): Promise<string[]> => {
    const saved = await files();
    return browsers()
      .flatMap((watched) => withoutDownloads(watched.errors, saved))
      .filter(
        (error) => !(scenario.allowedErrors ?? []).some((pattern) => pattern.test(error.text)),
      )
      .map(describeLogged);
  };
  try {
    let cookie: Record<string, string> = {};
    let token: string | undefined;
    let me: Person | undefined;
    if (scenario.signedIn !== undefined) {
      me = await makePerson(worker, scenario.signedIn);
      token = me.token;
      await context.addCookies([sessionCookie(token)]);
      cookie = me.cookie;
    }
    const opened = await context.newPage();
    pages.push(opened);
    const signedInPerson = (): Person => {
      if (!me) throw new SuiteError(`"${scenario.name}" has nobody signed in.`);
      return me;
    };
    const run: Run = {
      page: opened,
      context,
      worker,
      identity,
      origin: worker.origin,
      seen,
      cookie,
      get me() {
        return signedInPerson();
      },
      allow: (origin) => void allowed.push(origin),
      ask: (path, init) => ask(`${worker.origin}${path}`, init),
      api: (method, path, body, headers) => signedInPerson().api(method, path, body, headers),
      person: (sub, options) => makePerson(worker, sub, options),
      async device(options = {}) {
        const second = await newContext(options.locale);
        const watched = watch(second);
        // Nobody (`as: null`), another person, or by default the person the scenario signed in.
        const session = options.as === undefined ? token : options.as?.token;
        if (session !== undefined) await second.addCookies([sessionCookie(session)]);
        const secondPage = await second.newPage();
        const device: Device = { page: secondPage, context: second, seen: watched };
        devices.push(device);
        pages.push(secondPage);
        return device;
      },
      async open(path = "/") {
        const [answer] = await Promise.all([
          opened.waitForResponse((response) => new URL(response.url()).pathname === "/api/session"),
          opened.goto(`${worker.origin}${path}`),
        ]);
        const text = await answer.text();
        await ready(opened);
        return {
          status: answer.status(),
          headers: answer.headers(),
          json: JSON.parse(text) as Record<string, unknown>,
        };
      },
    };
    await scenario.run(run);
    assert.deepEqual(await logged(), [], "no console error");
    for (const watched of [seen, ...devices.map((device) => device.seen)]) {
      assert.deepEqual(
        outside(watched.requests, allowed),
        [],
        "every request went to the Worker's own origin",
      );
      assert.deepEqual(
        socketsOutside(watched.sockets, worker.origin),
        [],
        "every socket opened to the Worker's own origin",
      );
    }
  } catch (error) {
    mkdirSync(failures, { recursive: true });
    for (const [position, shown] of pages.entries()) {
      await shown
        .screenshot({ path: join(failures, `failed-${index}-${position}.png`) })
        .catch(() => undefined);
    }
    // What the pages logged is often the reason, and a timeout would not say so.
    const reasons = await logged();
    if (error instanceof Error && reasons.length > 0) {
      error.message += `\n\nThe pages logged:\n${reasons.join("\n")}`;
      const saved = (await files()).map((one) => `${one.url}, saved as ${one.file ?? "nothing"}`);
      if (saved.length > 0) error.message += `\n\nThe downloads:\n${saved.join("\n")}`;
    }
    throw error;
  } finally {
    await Promise.all(devices.map((device) => device.context.close().catch(() => undefined)));
    await context.close();
  }
}

/** Seconds since `since`, for the progress lines. */
const took = (since: number): string => `${((Date.now() - since) / 1000).toFixed(1)} s`;

/** What wrangler printed once the Worker was ready, a line at a time. */
function afterReady(output: string): string[] {
  const lines = output.split("\n").map((line) => line.trimEnd());
  const ready = lines.findIndex((line) => line.includes("Ready on"));
  return lines.slice(ready + 1).filter((line) => line !== "");
}

/** One of wrangler's lines for a request the Worker answered: `[wrangler:info] GET /path 200 OK (7ms)`. */
const REQUEST_LINE = /^\[wrangler:info\] (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) \S+ \d{3} /;

/**
 * What workerd prints when the browser hangs up while an answer is still being written, as Chrome
 * on Linux does when a response becomes a download: the transport's report, with its stack line,
 * not an error of the Worker.
 */
const PEER_HUNG_UP = /disconnected: write\(\): (Connection reset by peer|Broken pipe)/;

/** What the Worker printed besides its request lines: its errors and warnings, wrangler's notices. */
function reportedByTheWorker(output: string): string[] {
  const lines = afterReady(output);
  return lines.filter((line, i) => {
    if (REQUEST_LINE.test(line) || PEER_HUNG_UP.test(line)) return false;
    // The stack line that follows a hang-up's report.
    return !(/^\s*stack: /.test(line) && i > 0 && PEER_HUNG_UP.test(lines[i - 1]!));
  });
}

function requestsAndReports(output: string): string {
  return afterReady(output).slice(-40).join("\n");
}

async function main(): Promise<void> {
  const filter = process.env["CLOUD_TEST_FILTER"];
  // `a|b` runs the scenarios whose name holds a or b.
  const chosen = filter
    ? scenarios.filter((s) => filter.split("|").some((text) => s.name.includes(text)))
    : scenarios;
  if (chosen.length === 0) throw new SuiteError(`No scenario has "${filter}" in its name.`);
  const executablePath = findBrowser();
  rmSync(failures, { recursive: true, force: true });
  const before = new Set(readdirSync(CLOUD));

  // First, so that a port that is taken costs nothing else.
  const identity = await startFakeIdentity();
  let worker: RunningWorker | undefined;
  let browser: Browser | undefined;
  let failed = 0;
  try {
    let started = Date.now();
    await buildPage();
    console.log(`  the page, built for the identity service at ${IDENTITY} (${took(started)})`);
    started = Date.now();
    const running = await startWorker();
    worker = running;
    identity.serveAccounts({ secret: running.eventsSecret, keys: running.keys });
    console.log(`  the Worker, running at ${running.origin} (${took(started)})`);
    browser = await chromium.launch({ executablePath, headless: true });
    console.log(`  the browser, ${basename(executablePath)} ${browser.version()}`);
    for (const scenario of chosen) {
      const began = Date.now();
      try {
        await runScenario(browser, running, identity, scenario, scenarios.indexOf(scenario));
        console.log(`  ✓ ${scenario.name} (${took(began)})`);
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ✗ ${scenario.name}\n    ${message.split("\n").join("\n    ")}`);
      }
    }

    // The Worker prints a line for each request it answers and nothing else unless it fails. Its
    // output reaches this program a moment after the answers do.
    await new Promise((done) => setTimeout(done, 300));
    const reported = reportedByTheWorker(running.output());
    if (reported.length === 0) {
      console.log("  ✓ the Worker logged nothing but its requests");
    } else {
      failed++;
      console.log(`  ✗ the Worker logged nothing but its requests\n    ${reported.join("\n    ")}`);
    }
    if (failed > 0) {
      console.log(`\nThe Worker's requests and reports:\n${requestsAndReports(running.output())}`);
      console.log(`Screenshots of the failures: ${failures}`);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await worker?.stop();
    await identity.close();
  }

  console.log(`\n${chosen.length + 1 - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;

  // Nothing of the suite stays in the package: wrangler's state lived in the temporary folder.
  const left = readdirSync(CLOUD).filter((entry) => !before.has(entry));
  if (left.length > 0) {
    console.log(`The suite left ${left.join(", ")} in ${CLOUD}.`);
    process.exitCode = 1;
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error instanceof SuiteError ? error.message : error);
    process.exit(1);
  },
);
