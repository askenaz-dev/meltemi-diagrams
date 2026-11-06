/**
 * Exports without the branding, by donation, against the real Worker (`sponsorship-entitlement`):
 * GitHub Sponsors' signed delivery is kept once, the page offers the donation line to the sponsor
 * who is not entitled yet, opening the account panel claims the donation through the sponsor's
 * GitHub sign-in, Profile says thank you without a reload and the export dialog then has the box,
 * and the real administration answer records the sponsorship as claimed for the central console.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Scenario } from "./scenario.js";
import { ADMIN_SUB, SPONSORED_ACCOUNT } from "./worker.js";

/** A `sponsorship` event as GitHub sends it, for the sponsored account of the run. */
function sponsorship(login: string, action = "created"): string {
  return JSON.stringify({
    action,
    sponsorship: {
      node_id: "S_suite",
      created_at: new Date().toISOString(),
      sponsorable: { login: SPONSORED_ACCOUNT, id: 1, type: "User" },
      sponsor: { login, id: 4242, type: "User" },
      privacy_level: "public",
      tier: { name: "$5 one time", monthly_price_in_cents: 500, is_one_time: true },
    },
  });
}

export const sponsorScenarios: readonly Scenario[] = [
  {
    name: "donation: a signed Sponsors delivery, then Diagrams settings claims it without a reload and the real administration answer records it",
    signedIn: "u-suite-sponsor",
    async run(t) {
      const { page } = t;
      const owner = await t.person(ADMIN_SUB, { name: "Owner" });
      assert.equal((await owner.api("GET", "/api/session")).status, 200);
      const deliver = (body: string, id: string, secret = t.worker.sponsorsSecret) =>
        t.ask("/_sponsors/github", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GitHub-Event": "sponsorship",
            "X-GitHub-Delivery": id,
            "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
          },
          body,
        });

      // The fake identity service's GitHub sign-in of a person is their `sub`.
      const body = sponsorship(t.me.sub);
      const id = randomUUID();
      assert.equal((await deliver(body, id, "not the secret")).status, 401);
      const kept = await deliver(body, id);
      assert.equal(kept.status, 200, kept.text);
      assert.deepEqual(kept.json(), { recorded: true });
      assert.deepEqual((await deliver(body, id)).json(), { repeated: true });

      // Not entitled yet: the export dialog offers the donation line.
      const session = await t.open("/");
      assert.deepEqual(session.json["support"], {
        url: `https://github.com/sponsors/${SPONSORED_ACCOUNT}`,
      });
      await page.locator(".topbar").getByRole("button", { name: "Export", exact: true }).click();
      const line = page.locator("dialog[open] [data-donation]");
      await line.waitFor();
      assert.equal(
        await line.getByRole("link").getAttribute("href"),
        `https://github.com/sponsors/${SPONSORED_ACCOUNT}`,
      );
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        (window as unknown as { notReloaded: boolean }).notReloaded = true;
      });

      // Opening the panel reads the sign-ins, which claims the donation.
      await page.locator(".topbar .account-button").click();
      await page
        .locator("#menu-account")
        .getByRole("menuitem", { name: "Diagrams settings", exact: true })
        .click();
      const panel = page.locator("dialog.settings[open]");
      await panel.getByText("Granted for your donation. Thank you.").waitFor({ timeout: 30_000 });
      assert.equal(
        await page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded),
        true,
      );
      await page.keyboard.press("Escape");
      await page.locator("dialog.settings").waitFor({ state: "hidden" });
      await page.locator(".topbar").getByRole("button", { name: "Export", exact: true }).click();
      await page
        .locator("dialog[open]")
        .getByLabel("Export without the Meltemi branding")
        .waitFor();
      assert.equal(await page.locator("dialog[open] [data-donation]").count(), 0);
      await page.keyboard.press("Escape");

      // The owner sees who claimed it, and that GitHub Sponsors granted it.
      const admin = (await owner.api("GET", "/api/admin")).json() as {
        sponsorships: { login: string; claimedBy: { sub: string } | null }[];
        log: { by: { name: string }; detail: string }[];
      };
      const row = admin.sponsorships.find((s) => s.login === t.me.sub);
      assert.equal(row?.claimedBy?.sub, t.me.sub);
      assert.ok(
        admin.log.some(
          (entry) =>
            entry.by.name === "GitHub Sponsors" &&
            entry.detail === `unbranded-exports (${t.me.sub})`,
        ),
      );
    },
  },
];
