/**
 * Hosted central navigation against the real Worker, with real cookie/Origin administrative API
 * calls retaining the invitation, permission, audit and removal contract. No central forms are
 * fabricated by this product's suite; Identity owns that interface.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import { ADMIN_SUB, IDENTITY } from "./worker.js";

export const administrationScenarios: readonly Scenario[] = [
  {
    name: "administration: central same-tab links and deep links keep work, while real invitation and permission APIs enforce roles and Origin",
    signedIn: "u-suite-invitee",
    async run(t) {
      const { page, context, origin } = t;
      const owner = await t.person(ADMIN_SUB, { name: "Owner" });
      const ben = await t.person("u-suite-ben", { name: "Ben" });
      const stranger = await t.person("u-suite-admin-stranger");
      for (const person of [owner, ben, stranger]) {
        assert.equal((await person.api("GET", "/api/session")).status, 200);
      }
      const invited = await owner.api("POST", "/api/admin/invitations", {
        email: `${t.me.sub}@example.com`,
      });
      assert.equal(invited.status, 201, invited.text);
      const invitationId = invited.json()["id"];
      assert.equal(typeof invitationId, "string");
      const accept = `/api/admin/invitations/${invitationId}/accept`;
      const administrationRequests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/admin")) {
          administrationRequests.push(request.url());
        }
      });
      const session = await t.open("/");
      const user = session.json["user"] as { administrationInvitation: { id: string } };
      assert.equal(user.administrationInvitation.id, invitationId);
      const target = `${IDENTITY}/admin/diagrams/access?lang=en&environment=production`;
      t.allow(IDENTITY);
      await context.route(target, async (route) => {
        assert.equal(route.request().isNavigationRequest(), true);
        assert.equal(route.request().frame(), page.mainFrame());
        // A terminal navigation probe, not a stand-in for the central administration forms.
        await route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Central navigation destination</title>",
        });
      });
      const marker = "// kept before central administration";
      await page
        .locator(".code-input")
        .fill((await page.locator(".code-input").inputValue()) + `\n${marker}\n`);
      await page.locator(".topbar .account-button").click();
      const link = page.locator("#menu-account").getByRole("menuitem", {
        name: "Invitation to administer",
        exact: true,
      });
      assert.equal(await link.getAttribute("href"), target);
      assert.equal(await link.getAttribute("target"), null);
      const pageCount = context.pages().length;
      await Promise.all([page.waitForURL(target), link.click()]);
      assert.equal(context.pages().length, pageCount, "central access uses the same tab");
      const kept = (await context.storageState()).origins
        .find((entry) => entry.origin === origin)
        ?.localStorage.find((entry) => entry.name === "meltemi-playground:project:v1")?.value;
      assert.ok(kept?.includes(marker), "the latest browser source is kept before leaving");
      assert.deepEqual(administrationRequests, [], "the product UI makes no administration call");

      // Actual backend calls, never actions on fabricated central forms.
      assert.equal((await stranger.api("POST", accept)).status, 404);
      assert.equal((await t.api("POST", accept, undefined, { Origin: IDENTITY })).status, 403);
      assert.equal((await t.api("POST", accept)).status, 204);
      assert.equal((await t.api("POST", accept)).status, 404, "an invitation works once");
      assert.equal((await t.api("GET", "/api/admin")).json()["role"], "administrator");
      assert.equal(
        (await t.api("POST", "/api/admin/invitations", { email: "another@example.com" })).status,
        404,
        "administrators cannot invite",
      );
      const permission = `/api/admin/accounts/${encodeURIComponent(`${ben.sub}@example.com`)}/permissions/unbranded-exports`;
      assert.equal(
        (await t.api("PUT", permission, { granted: true }, { Origin: IDENTITY })).status,
        403,
      );
      assert.equal((await t.api("PUT", permission, { granted: true })).status, 200);
      const entitled = async () => {
        const answer = (await ben.api("GET", "/api/session")).json() as {
          user: { entitlements: { unbranded: boolean } };
        };
        return answer.user.entitlements.unbranded;
      };
      assert.equal(await entitled(), true);
      assert.equal((await t.api("PUT", permission, { granted: false })).status, 200);
      assert.equal(await entitled(), false);
      assert.equal((await t.api("PUT", permission, { granted: true })).status, 200);
      // The existing query is a same-tab central destination after the role is granted, too.
      await page.goto(`${origin}/?account=administration`);
      await page.waitForURL(target);
      assert.equal(context.pages().length, pageCount);
      const removed = await owner.api("DELETE", `/api/admin/administrators/${t.me.sub}`);
      assert.equal(removed.status, 204, removed.text);
      assert.equal((await t.api("GET", "/api/admin")).status, 404);
      assert.equal((await t.api("PUT", permission, { granted: false })).status, 404);
      assert.equal(await entitled(), true, "a removed administrator cannot revoke a permission");
      const log = (await owner.api("GET", "/api/admin")).json()["log"] as {
        action: string;
        by: { sub: string };
      }[];
      assert.deepEqual(
        log.slice(0, 6).map((entry) => [entry.action, entry.by.sub]),
        [
          ["remove", ADMIN_SUB],
          ["grant", t.me.sub],
          ["revoke", t.me.sub],
          ["grant", t.me.sub],
          ["accept", t.me.sub],
          ["invite", ADMIN_SUB],
        ],
      );
      // Removal in real storage makes the next load fall back to personal product Profile.
      await t.open("/?account=administration");
      const panel = page.locator("dialog.settings[open]");
      await panel.locator('[role="tab"][aria-selected="true"][data-section="profile"]').waitFor();
      assert.equal(await panel.getByRole("tab").count(), 7);
      assert.equal(await panel.locator('[data-section="administration"]').count(), 0);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      await page.locator(".topbar .account-button").click();
      assert.equal(
        await page
          .locator("#menu-account")
          .getByRole("menuitem", { name: "Administration", exact: true })
          .count(),
        0,
      );
      assert.equal(new URL(page.url()).searchParams.has("account"), false);
      assert.deepEqual(administrationRequests, []);
    },
  },
];
