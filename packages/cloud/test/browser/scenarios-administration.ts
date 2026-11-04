/**
 * The administration of the service against the real Worker (`service-administration`,
 * `account-panel`): the owner invites the email of the person signed in, who accepts it in the
 * account panel's Administration section, grants a permission by email from there, and is then
 * removed by the owner, after which the section's next action takes the tab away.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import { ADMIN_SUB } from "./worker.js";

const SECTION = '[data-section="administration"].account-section';

export const administrationScenarios: readonly Scenario[] = [
  {
    name: "administration: an invited person accepts in the panel, grants by email, and loses the tab once removed",
    signedIn: "u-suite-invitee",
    // The browser notes in its console the 404 that tells the page the role is gone.
    allowedErrors: [/status of 404/],
    async run(t) {
      const { page } = t;
      const owner = await t.person(ADMIN_SUB, { name: "Owner" });
      const ben = await t.person("u-suite-ben", { name: "Ben" });
      // Every person has a row once they have asked for anything.
      for (const someone of [owner, ben]) {
        assert.equal((await someone.api("GET", "/api/session")).status, 200);
      }

      const invited = await owner.api("POST", "/api/admin/invitations", {
        email: `${t.me.sub}@example.com`,
      });
      assert.equal(invited.status, 201, invited.text);

      // The invitee sees the invitation alone, and accepts it.
      const session = await t.open("/?account=administration");
      assert.ok(session.json["user"], "signed in");
      const section = page.locator(`dialog.settings[open] ${SECTION}`);
      await section.getByText("Owner invited you to administer Meltemi Diagrams.").waitFor();
      await section.getByRole("button", { name: "Accept", exact: true }).click();
      await page
        .locator(`dialog.settings[open] ${SECTION} [data-part="administrators"]`)
        .waitFor({ timeout: 30_000 });
      assert.equal(
        await page.locator(`dialog.settings[open] ${SECTION} [data-part="invitations"]`).count(),
        0,
        "an administrator has no Invitations part",
      );

      // A grant by the email Ben signs in with.
      const permission = page.locator(
        `dialog.settings[open] ${SECTION} [data-permission="unbranded-exports"]`,
      );
      await permission.getByLabel("Grant to").fill(`${ben.sub}@example.com`);
      await permission.getByRole("button", { name: "Grant", exact: true }).click();
      await permission.locator(`[data-sub="${ben.sub}"]`).waitFor();
      const benSession = (await ben.api("GET", "/api/session")).json() as {
        user: { entitlements: { unbranded: boolean } };
      };
      assert.equal(benSession.user.entitlements.unbranded, true);

      // The owner sees it in the log, and removes the administrator.
      const log = (await owner.api("GET", "/api/admin")).json()["log"] as {
        action: string;
        by: { sub: string };
      }[];
      assert.deepEqual(
        log.slice(0, 3).map((entry) => [entry.action, entry.by.sub]),
        [
          ["grant", t.me.sub],
          ["accept", t.me.sub],
          ["invite", ADMIN_SUB],
        ],
      );
      const removed = await owner.api("DELETE", `/api/admin/administrators/${t.me.sub}`);
      assert.equal(removed.status, 204, removed.text);

      // The next action of the open section meets the 404 and takes the tab away.
      await permission
        .locator(`[data-sub="${ben.sub}"]`)
        .getByRole("button", { name: "Revoke" })
        .click();
      await page
        .locator('dialog.settings[open] [role="tab"][aria-selected="true"][data-section="profile"]')
        .waitFor({ timeout: 30_000 });
      assert.equal(
        await page
          .locator('dialog.settings[open] [role="tab"][data-section="administration"]')
          .count(),
        0,
      );
    },
  },
];
