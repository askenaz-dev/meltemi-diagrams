/**
 * Publishing as the owner does it, from the page: the share dialog's entry, the publish dialog that asks
 * for a handle the first time, the address it shows (in development the Worker's own `/_published/`),
 * what a visitor is then served (the catalog the page built, with the headers the specification lists
 * and no cookie), unpublishing, a page name another of the person's projects already publishes, and a
 * publication the administrators took down. `scenarios-publishing.ts` asks the same routes as a
 * program does; this is the page's side of them.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "playwright-core";
import type { Scenario } from "./scenario.js";
import { makeProject, noDialog, openByLink } from "./cloud.js";
import { PAGE_HEADERS } from "./scenarios-publishing.js";
import { openShare, settled } from "./sharing.js";
import { until } from "./support.js";
import { ADMIN_SUB } from "./worker.js";

/** What the browser logs for the answers the dialog turns into words: a taken handle, a taken page name. */
const CONFLICT_LOGGED = /status of 409/;

/** Opens the publish dialog from the share dialog of the open project, and waits for what is published. */
async function openPublish(page: Page): Promise<{ share: Locator; dialog: Locator }> {
  const share = await openShare(page);
  await settled(share);
  await share.getByRole("button", { name: "Publish…" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish", exact: true });
  await dialog.waitFor();
  await until(
    page,
    "the publish dialog to read what is published",
    () => document.querySelector(".publish-form:not([hidden])") !== null,
  );
  return { share, dialog };
}

/** Waits until the publish dialog is at rest. */
async function publishSettled(dialog: Locator): Promise<void> {
  await until(dialog.page(), "the publish dialog to be at rest", () => {
    const dialogs = [...document.querySelectorAll("dialog[open]")].filter((d) =>
      d.querySelector(".publish-form"),
    );
    return (
      dialogs.length > 0 &&
      dialogs.every((d) => d.querySelector(".dialog-body")?.getAttribute("aria-busy") !== "true")
    );
  });
}

/** Closes the dialogs, the publish dialog and the share dialog behind it. */
async function closeBoth(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await noDialog(page);
}

export const publishDialogScenarios: Scenario[] = [
  {
    name: "publishing from the page: the first time asks for a handle (checked as it is typed, a taken one refused in words), publishes the catalog the export builds, shows the /_published/ address, which serves it with the exact headers and no cookie and opens in the browser, unpublishes after a confirmation, and says when a page name is another project's",
    signedIn: "u-ana-publish-page",
    allowedErrors: [CONFLICT_LOGGED],
    async run(t) {
      const { origin, page, context } = t;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const bob = await t.person("u-bob-publish-page", { name: "Bob" });
      assert.equal(
        (await bob.api("PATCH", "/api/account", { handle: "suite-pp-bob" })).status,
        200,
      );
      const project = await makeProject(t.me, "Publish page", { template: "purchase" });
      const second = await makeProject(t.me, "Second page", { template: "flow" });
      await openByLink(page, origin, project.id);

      let { dialog } = await openPublish(page);
      // No handle yet: the form asks for it, and offers the project's name as the page's.
      const handle = dialog.getByLabel("Handle");
      const slug = dialog.getByLabel("Page name");
      await handle.waitFor();
      assert.equal(await slug.inputValue(), "publish-page");
      assert.deepEqual((await t.me.api("GET", `/api/projects/${project.id}/publish`)).json(), {
        handle: null,
        publications: [],
        takedowns: [],
      });

      // What is typed is checked as it is typed, and nothing is sent for what the service would refuse.
      const handleProblem = dialog.locator(".publish-handle .field-problem");
      await handle.fill("Ana!");
      assert.equal(
        await handleProblem.innerText(),
        "Use only lowercase letters, digits and hyphens.",
      );
      await handle.fill("ab");
      assert.equal(await handleProblem.innerText(), "The handle takes at least 3 characters.");
      await slug.fill("My Page");
      assert.equal(
        await dialog.locator(".publish-form .field-problem").nth(1).innerText(),
        "Use only lowercase letters, digits and hyphens.",
      );
      await slug.fill("purchase");
      await handle.fill("suite-pp-ana");
      assert.equal(
        await dialog.locator(".publish-address-end").innerText(),
        "The address ends in /suite-pp-ana/purchase/",
      );

      // A handle somebody else has: said under the handle, and nothing is published or chosen.
      await handle.fill("suite-pp-bob");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await until(
        page,
        "the taken handle to be said",
        () =>
          document.querySelector(".publish-handle .field-problem")?.textContent ===
          "That handle is already taken. Try another.",
      );
      await publishSettled(dialog);
      assert.deepEqual((await t.me.api("GET", `/api/projects/${project.id}/publish`)).json(), {
        handle: null,
        publications: [],
        takedowns: [],
      });

      // A free one: the catalog is built, sent, and its address shown with copy and open.
      await handle.fill("suite-pp-ana");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      const reveal = dialog.locator(".share-reveal");
      await reveal.waitFor({ state: "visible", timeout: 90_000 });
      await publishSettled(dialog);
      const address = `${origin}/_published/suite-pp-ana/purchase/`;
      assert.equal(await reveal.locator("input").inputValue(), address);
      assert.match(await reveal.innerText(), /Published purchase\./);
      const open = reveal.getByRole("link", { name: /Open purchase in a new tab/ });
      assert.equal(await open.getAttribute("href"), address);
      assert.equal(await open.getAttribute("target"), "_blank");
      assert.equal(await open.getAttribute("rel"), "noopener noreferrer");
      await reveal.getByRole("button", { name: /Copy the address of purchase/ }).click();
      await until(page, "the address to be copied", () =>
        [...document.querySelectorAll(".share-status")].some(
          (line) => line.textContent === "The address was copied.",
        ),
      );
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), address);
      assert.equal(await handle.isVisible(), false, "the handle is chosen for good");
      assert.equal(await dialog.locator(".publish-row").count(), 1);
      assert.match(await dialog.locator(".publish-row").innerText(), /purchase[\s\S]*KiB|MiB/);

      // The Worker holds the handle and the row; a visitor is served the page with the exact headers.
      const info = (await t.me.api("GET", `/api/projects/${project.id}/publish`)).json() as {
        handle: string;
        publications: { slug: string; url: string; bytes: number }[];
      };
      assert.equal(info.handle, "suite-pp-ana");
      assert.deepEqual(
        info.publications.map((row) => [row.slug, row.url]),
        [["purchase", address]],
      );
      const served = await t.ask(new URL(address).pathname);
      assert.equal(served.status, 200);
      for (const [name, value] of Object.entries(PAGE_HEADERS)) {
        assert.equal(served.headers.get(name), value, name);
      }
      assert.equal(served.headers.get("set-cookie"), null, "a published page sets no cookie");
      assert.equal(Buffer.byteLength(served.text), info.publications[0]?.bytes);
      assert.match(served.text, /^<!doctype html>/i);

      // It is the page the catalog export builds, byte for byte: the same build.
      await closeBoth(page);
      await page.locator(".topbar").getByRole("button", { name: "Download" }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90_000 }),
        page.getByRole("menuitem", { name: /^Catalog \(HTML\)/ }).click(),
      ]);
      const exported = await readFile((await download.path()) ?? "", "utf8");
      assert.equal(served.text, exported, "the published page is the catalog export");

      // And the browser opens the address as a visitor would: the catalog of the project runs under the
      // headers the Worker gives it, lists the diagrams and opens one, with nothing but the page itself
      // (the suite fails on a request to anywhere else and on any error the page logs).
      const visitor = await context.newPage();
      await visitor.goto(address);
      assert.equal(await visitor.title(), "Purchase", "project.json names the catalog");
      assert.equal(await visitor.locator("main h1").innerText(), "Purchase");
      assert.ok((await visitor.locator("main .card").count()) >= 3, "the diagrams are listed");
      await visitor.locator("main .card a").first().click();
      await visitor.waitForFunction(() => location.hash.startsWith("#/diagram/"), undefined, {
        timeout: 30_000,
      });
      assert.equal(await visitor.locator("main h1").innerText(), "The shop in context");
      await visitor.close();

      // Unpublish asks first; cancelled, the page stays; confirmed, the address answers 404.
      ({ dialog } = await openPublish(page));
      await dialog.getByRole("button", { name: "Unpublish purchase" }).click();
      const sure = page.getByRole("dialog", { name: "Unpublish this page?" });
      await sure.waitFor();
      await sure.getByRole("button", { name: "Cancel" }).click();
      await sure.waitFor({ state: "detached" });
      assert.equal((await t.ask(new URL(address).pathname)).status, 200);
      await dialog.getByRole("button", { name: "Unpublish purchase" }).click();
      await sure.waitFor();
      await sure.getByRole("button", { name: "Unpublish", exact: true }).click();
      await sure.waitFor({ state: "detached" });
      // (The sentence that says nothing is published is in the dialog all along, hidden: the rows are
      // what goes.)
      await until(
        page,
        "the list to be empty",
        () => document.querySelector(".publish-row") === null,
      );
      await publishSettled(dialog);
      assert.equal(
        await dialog.locator(".share-none:visible").innerText(),
        "Nothing is published from this project yet.",
      );
      assert.equal((await t.ask(new URL(address).pathname)).status, 404);
      assert.deepEqual(
        (
          (await t.me.api("GET", `/api/projects/${project.id}/publish`)).json() as {
            publications: unknown[];
          }
        ).publications,
        [],
      );

      // Published again with the form (no handle to ask for now), then another of the person's
      // projects asks for the same page name: said under the name, and the page that is there stays.
      await dialog.getByLabel("Page name").fill("purchase");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await dialog.locator(".share-reveal").waitFor({ state: "visible", timeout: 90_000 });
      await publishSettled(dialog);
      assert.equal((await t.ask(new URL(address).pathname)).status, 200);
      const first = (await t.ask(new URL(address).pathname)).text;
      await closeBoth(page);

      await openByLink(page, origin, second.id);
      ({ dialog } = await openPublish(page));
      assert.equal(
        await dialog.getByLabel("Handle").isVisible(),
        false,
        "the handle is the person's",
      );
      assert.equal(await dialog.getByLabel("Page name").inputValue(), "second-page");
      await dialog.getByLabel("Page name").fill("purchase");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      const taken =
        "Another of your projects already publishes a page with that name. Choose another name.";
      await until(
        page,
        "the taken page name to be said",
        (text) =>
          [...document.querySelectorAll(".publish-form .field-problem")].some(
            (problem) => problem.textContent === text,
          ),
        taken,
      );
      await publishSettled(dialog);
      assert.equal(await dialog.locator(".share-reveal").isVisible(), false);
      assert.equal(
        (await t.ask(new URL(address).pathname)).text,
        first,
        "the other page is as it was",
      );
      // Another name goes through.
      await dialog.getByLabel("Page name").fill("second");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await dialog.locator(".share-reveal").waitFor({ state: "visible", timeout: 90_000 });
      assert.equal((await t.ask("/_published/suite-pp-ana/second/")).status, 200);
    },
  },

  {
    name: "publishing from the page: a page the administrators took down is shown to the owner as removed by the service, with the reason, its address answers 404, and publishing it again takes the notice away",
    signedIn: "u-ana-takedown-page",
    async run(t) {
      const { origin, page } = t;
      const admin = await t.person(ADMIN_SUB, { name: "Admin" });
      const project = await makeProject(t.me, "Taken down page", { template: "flow" });
      await openByLink(page, origin, project.id);

      let { dialog } = await openPublish(page);
      await dialog.getByLabel("Handle").fill("suite-td-ana");
      await dialog.getByLabel("Page name").fill("spam");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await dialog.locator(".share-reveal").waitFor({ state: "visible", timeout: 90_000 });
      await publishSettled(dialog);
      const address = "/_published/suite-td-ana/spam/";
      assert.equal((await t.ask(address)).status, 200);
      assert.equal(await dialog.locator(".publish-removed").count(), 0);
      await closeBoth(page);

      // An administrator takes it down.
      const gone = await admin.api("DELETE", "/api/admin/publications/suite-td-ana/spam", {
        reason: "Not what this site is for",
      });
      assert.equal(gone.status, 204, gone.text);
      assert.equal((await t.ask(address)).status, 404);

      // The owner's dialog, opened again, says so, with the reason; the list holds nothing.
      ({ dialog } = await openPublish(page));
      const removed = dialog.locator(".publish-removed");
      assert.equal(await removed.count(), 1);
      assert.match(await removed.innerText(), /^spam: removed by the service on /);
      assert.match(await removed.innerText(), /Reason: Not what this site is for/);
      assert.equal(await dialog.locator(".publish-row").count(), 0);
      assert.match(await dialog.innerText(), /Removed by the service/);
      assert.match(await dialog.innerText(), /Nothing is published from this project yet\./);
      assert.equal(await dialog.getByLabel("Handle").isVisible(), false);

      // A page published under another name does not take the notice of this one away.
      await dialog.getByLabel("Page name").fill("clean");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await dialog.locator(".share-reveal").waitFor({ state: "visible", timeout: 90_000 });
      await publishSettled(dialog);
      assert.equal((await t.ask("/_published/suite-td-ana/clean/")).status, 200);
      assert.equal(await dialog.locator(".publish-removed").count(), 1);
      // The service does not forbid the owner to publish the same name again, and the notice is then no news.
      await dialog.getByLabel("Page name").fill("spam");
      await dialog.getByRole("button", { name: "Publish", exact: true }).click();
      await until(
        page,
        "the notice to go",
        () => document.querySelector(".publish-removed") === null,
      );
      await publishSettled(dialog);
      assert.equal((await t.ask(address)).status, 200);
      assert.deepEqual(
        (
          (await t.me.api("GET", `/api/projects/${project.id}/publish`)).json() as {
            takedowns: unknown[];
          }
        ).takedowns,
        [],
      );
    },
  },
];
