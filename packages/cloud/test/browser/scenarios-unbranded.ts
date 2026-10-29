/**
 * Exports without the Meltemi branding (`cloud-accounts`, "Entitlements"; `playground-exports`):
 * an administrator entitles an account through the Worker, the page offers the entitled person a
 * box in the export dialog, and the pictures come out without the strip at the foot of the sheet.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright-core";
import type { Person, Run, Scenario } from "./scenario.js";
import { makeProject, noDialog, openByLink } from "./cloud.js";
import { setLinkLevel } from "./sharing.js";
import { until } from "./support.js";
import { ADMIN_SUB } from "./worker.js";

const BOX = "Export without the Meltemi branding";
const NOTICE = "Without the Meltemi branding.";
const HEADING = "Exports without the Meltemi branding";

/** The account's entitlement, set by the administrator through the Worker. */
async function entitle(admin: Person, account: string, unbranded = true): Promise<void> {
  const answer = await admin.api(
    "PUT",
    `/api/admin/accounts/${encodeURIComponent(account)}/entitlements`,
    { unbranded },
  );
  assert.equal(answer.status, 200, answer.text);
}

/** The person signed in has a row before anyone grants them anything. */
async function known(t: Run): Promise<void> {
  assert.equal((await t.api("GET", "/api/session")).status, 200);
}

/** Opens the export dialog of the page. */
async function openExport(page: Page) {
  await page.locator(".topbar").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel("Format").waitFor();
  return dialog;
}

/** Exports the open diagram as SVG, with the box checked or not, and answers the file's text. */
async function exportSvg(page: Page, unbranded: boolean | null): Promise<string> {
  const dialog = await openExport(page);
  await dialog.getByLabel("Format").selectOption("svg");
  if (unbranded !== null) await dialog.getByLabel(BOX).setChecked(unbranded);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const svg = await readFile((await download.path()) ?? "", "utf8");
  await page.keyboard.press("Escape");
  await noDialog(page);
  return svg;
}

const heightOf = (svg: string) => Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1]);
const framed = (svg: string) => /data-role="frame"/.test(svg) || svg.includes("meltemi-wind");

/** Opens the account panel at Profile. */
async function openProfile(page: Page) {
  await page.locator(".topbar .account-button").click();
  await page
    .locator("#menu-account")
    .getByRole("menuitem", { name: "Account", exact: true })
    .click();
  const panel = page.locator("dialog.settings[open]");
  await panel.waitFor();
  await panel.getByRole("tab", { name: "Profile" }).click();
  return panel;
}

export const unbrandedScenarios: Scenario[] = [
  {
    name: "unbranded exports: an entitled person sees the box under Theme, exports the SVG without the strip, 44 px shorter, is told so, and Profile says it with the account id",
    signedIn: "u-ana-unbranded",
    async run(t) {
      const { page } = t;
      const admin = await t.person(ADMIN_SUB, { name: "Admin" });
      await known(t);
      await entitle(admin, t.me.sub);
      await t.open("/");

      // The box, its hint, after the Theme field.
      const dialog = await openExport(page);
      const box = dialog.getByLabel(BOX);
      assert.equal(await box.isVisible(), true);
      assert.equal(await box.isChecked(), false);
      assert.match(await dialog.innerText(), /Leaves out the strip at the foot of the sheet/);
      await page.keyboard.press("Escape");
      await noDialog(page);

      const branded = await exportSvg(page, false);
      const plain = await exportSvg(page, true);
      assert.equal(framed(branded), true, "the default keeps the strip");
      assert.equal(framed(plain), false, "the box leaves the strip out");
      assert.equal(heightOf(branded) - heightOf(plain), 44);
      await until(
        page,
        "the notice",
        (notice) => (document.querySelector(".status-text")?.textContent ?? "").endsWith(notice),
        NOTICE,
      );

      // The box starts unchecked when the dialog opens again.
      const again = await openExport(page);
      assert.equal(await again.getByLabel(BOX).isChecked(), false);
      await page.keyboard.press("Escape");
      await noDialog(page);

      // Profile shows the account id and what the account may do.
      const panel = await openProfile(page);
      assert.equal(await panel.locator(".account-id").textContent(), t.me.sub);
      assert.equal(await panel.getByRole("heading", { name: HEADING }).count(), 1);
    },
  },

  {
    name: "unbranded exports: a plain person has no box and no heading, but sees the account id; the administrator has the box with no grant",
    signedIn: "u-ana-plain",
    async run(t) {
      const { page } = t;
      await t.open("/");
      const dialog = await openExport(page);
      assert.equal(await dialog.getByLabel(/branding/i).count(), 0);
      await page.keyboard.press("Escape");
      await noDialog(page);
      const panel = await openProfile(page);
      assert.equal(await panel.locator(".account-id").textContent(), t.me.sub);
      assert.equal(await panel.getByRole("heading", { name: HEADING }).count(), 0);
      await page.keyboard.press("Escape");

      // The administrator's own page, through a second browser of theirs.
      const admin = await t.device({ as: await t.person(ADMIN_SUB, { name: "Admin" }) });
      await admin.page.goto(`${t.origin}/`);
      await admin.page.waitForFunction(
        () => document.querySelector("#app .content svg") !== null,
        undefined,
        { timeout: 30_000 },
      );
      const theirs = await openExport(admin.page);
      assert.equal(await theirs.getByLabel(BOX).count(), 1);
    },
  },

  {
    name: "unbranded exports: the administrator grants by handle, lists, and revokes, and a reload takes the box and the heading away",
    signedIn: "u-ana-handle",
    async run(t) {
      const { page } = t;
      const admin = await t.person(ADMIN_SUB, { name: "Admin" });
      await known(t);
      const chosen = await t.api("PATCH", "/api/account", { handle: "suite-unbranded" });
      assert.equal(chosen.status, 200, chosen.text);
      await entitle(admin, "@suite-unbranded");

      const listed = await admin.api("GET", "/api/admin/entitlements");
      const accounts = (listed.json()["accounts"] ?? []) as {
        sub: string;
        entitlements: { by: string };
      }[];
      const mine = accounts.find((account) => account.sub === t.me.sub);
      assert.ok(mine, "the list holds the person");
      assert.equal(mine.entitlements.by, ADMIN_SUB);

      await t.open("/");
      assert.equal(await (await openExport(page)).getByLabel(BOX).count(), 1);
      await page.keyboard.press("Escape");
      await noDialog(page);

      await entitle(admin, "@suite-unbranded", false);
      const after = await admin.api("GET", "/api/admin/entitlements");
      const still = ((after.json()["accounts"] ?? []) as { sub: string }[]).map((a) => a.sub);
      assert.equal(still.includes(t.me.sub), false);
      await t.open("/");
      assert.equal(await (await openExport(page)).getByLabel(/branding/i).count(), 0);
      await page.keyboard.press("Escape");
      await noDialog(page);
      const panel = await openProfile(page);
      assert.equal(await panel.getByRole("heading", { name: HEADING }).count(), 0);
    },
  },

  {
    name: "unbranded exports: in Spanish, the box, its hint, the account id and the heading; Copy puts the id on the clipboard",
    signedIn: "u-ana-unbranded-es",
    locale: "es-CL",
    async run(t) {
      const { page, context, origin } = t;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const admin = await t.person(ADMIN_SUB, { name: "Admin" });
      await known(t);
      await entitle(admin, t.me.sub);
      await t.open("/");

      await page.locator(".topbar").getByRole("button", { name: "Exportar", exact: true }).click();
      const dialog = page.locator("dialog[open]");
      assert.equal(await dialog.getByLabel("Exportar sin la marca de Meltemi").count(), 1);
      assert.match(await dialog.innerText(), /Omite la franja al pie de la hoja/);
      await page.keyboard.press("Escape");
      await noDialog(page);

      await page.locator(".topbar .account-button").click();
      await page.locator("#menu-account").getByRole("menuitem").first().click();
      const panel = page.locator("dialog.settings[open]");
      await panel.waitFor();
      await panel.getByRole("tab", { name: "Perfil" }).click();
      assert.equal(
        await panel.getByRole("heading", { name: "Identificador de la cuenta" }).count(),
        1,
      );
      assert.equal(
        await panel.getByRole("heading", { name: "Exportaciones sin la marca de Meltemi" }).count(),
        1,
      );
      await panel.getByRole("button", { name: "Copiar", exact: true }).click();
      await until(page, "the copy said", () =>
        [...document.querySelectorAll("dialog.settings[open] .field-hint")].some(
          (hint) => hint.textContent === "Copiado.",
        ),
      );
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), t.me.sub);
    },
  },

  {
    name: "unbranded exports: an entitled viewer of a shared project exports it without the strip, and the catalog downloaded with the box checked has no strip in its pictures",
    signedIn: "u-ana-unbranded-viewer",
    async run(t) {
      const { page, origin } = t;
      const admin = await t.person(ADMIN_SUB, { name: "Admin" });
      const owner = await t.person("u-beto-unbranded-owner", { name: "Beto" });
      await known(t);
      await entitle(admin, t.me.sub);
      const project = await makeProject(owner, "Shared to view", { template: "flow" });
      await setLinkLevel(owner, project.id, "view");

      await openByLink(page, origin, project.id);
      const plain = await exportSvg(page, true);
      assert.equal(framed(plain), false);

      // The catalog follows the box.
      const dialog = await openExport(page);
      await dialog.getByLabel(BOX).check();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        dialog.getByRole("button", { name: "Export the catalog of the project" }).click(),
      ]);
      const html = await readFile((await download.path()) ?? "", "utf8");
      assert.doesNotMatch(html, /"role":"frame"/);
      assert.match(html, /Meltemi Diagrams/);
    },
  },
];
