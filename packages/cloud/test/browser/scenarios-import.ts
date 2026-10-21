/**
 * The scenarios of a project archive and the account: the browser's project exported from the
 * Projects panel and imported as a new cloud project with its image, an upload the service refuses,
 * an image over the limit refused before anything is sent, and an archive that replaces the files of
 * the open cloud project or becomes the project of this browser while the cloud project stays.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Scenario } from "./scenario.js";
import {
  PNG,
  code,
  connected,
  listProjects,
  makeProject,
  openByLink,
  openSwitcher,
  readRoom,
  roomHolds,
  sha256,
  statusLine,
  studioState,
} from "./cloud.js";
import { until } from "./support.js";

/** Where the archives a scenario downloads are saved. */
const folder = mkdtempSync(join(tmpdir(), "mdg-import-"));

/** Adds an image to the project in the page, as an image chosen with Open is added. */
async function addImage(page: Page, path: string, bytes: Uint8Array): Promise<void> {
  await page.evaluate(
    ([where, base64]) => {
      const data = Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0));
      (
        window as unknown as {
          meltemiPlayground: { studio: { addFiles(files: [string, Uint8Array][]): void } };
        }
      ).meltemiPlayground.studio.addFiles([[where!, data]]);
    },
    [path, Buffer.from(bytes).toString("base64")],
  );
}

/** Exports the open project from the Projects panel and saves the archive; its path. */
async function exportProject(page: Page, name: string): Promise<string> {
  await openSwitcher(page);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(".switcher-panel").getByRole("button", { name: "Export project (.zip)" }).click(),
  ]);
  const path = join(folder, name);
  await file.saveAs(path);
  return path;
}

/** Opens an archive with Open and waits for the dialog that asks where its project goes. */
async function importDialog(page: Page, archive: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles(archive);
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("heading", { name: "Import a project" }).waitFor();
  return dialog;
}

export const importScenarios: Scenario[] = [
  {
    name: "the browser's project, exported from the panel, is imported as a new cloud project with its image, and the page is bound to it",
    signedIn: "u-ana-import",
    async run(t) {
      const { page } = t;
      await t.open("/");
      await addImage(page, "assets/logo.png", PNG);
      const archive = await exportProject(page, "flow.zip");
      const dialog = await importDialog(page, archive);
      assert.match(await dialog.innerText(), /flow\.zip: the project flow, 3 files\./);
      // Signed in, the account is the first choice; nothing replaces this browser's project.
      assert.equal(
        await dialog.getByRole("radio", { name: /A new project in your account/ }).isChecked(),
        true,
      );
      assert.equal(await dialog.getByRole("radio", { name: /Replace the files of/ }).count(), 0);
      await dialog.getByLabel("Name of the new project").fill("Imported flow");
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await connected(page);
      const made = (await listProjects(t.me)).find((row) => row.name === "Imported flow");
      assert.ok(made, "the Worker lists the imported project");
      assert.equal(new URL(page.url()).searchParams.get("project"), made.id);
      const room = await readRoom(t.me, made.id);
      assert.ok("project.json" in room.files);
      assert.ok("diagrams/overview.meltemi" in room.files);
      assert.deepEqual(room.binaries, { "assets/logo.png": sha256(PNG) });
      assert.equal((await studioState(page)).bound, true);
      assert.match(await statusLine(page), /Imported flow\.zip: 3 files\./);
    },
  },

  {
    name: "an import whose upload the service refuses deletes the project again and says why; an image over 10 MiB is refused before anything is sent",
    signedIn: "u-ana-import-refused",
    // The browser logs the refusal it was given.
    allowedErrors: [/status of 413/],
    async run(t) {
      const { page, context } = t;
      await t.open("/");
      await addImage(page, "assets/logo.png", PNG);
      const archive = await exportProject(page, "refused.zip");
      // The service refuses the image for the account's storage.
      await context.route(/\/api\/projects\/[^/]+\/binaries\//, (route) =>
        route.fulfill({
          status: 413,
          contentType: "application/json",
          body: JSON.stringify({ code: "quota.storage", message: "Storage is full." }),
        }),
      );
      const before = (await listProjects(t.me)).length;
      let dialog = await importDialog(page, archive);
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await until(page, "the refusal in the dialog", () =>
        /200 MiB of storage/.test(document.querySelector("dialog[open]")?.textContent ?? ""),
      );
      assert.equal((await listProjects(t.me)).length, before, "the project was deleted again");
      assert.equal((await studioState(page)).bound, false);
      await page.keyboard.press("Escape");
      await context.unroute(/\/api\/projects\/[^/]+\/binaries\//);

      // An image over the limit of a cloud project: nothing is created.
      await addImage(page, "assets/huge.png", new Uint8Array(10 * 1024 * 1024 + 1));
      const huge = await exportProject(page, "huge.zip");
      dialog = await importDialog(page, huge);
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await until(page, "the limit in the dialog", () =>
        /takes at most 10 MiB/.test(document.querySelector("dialog[open]")?.textContent ?? ""),
      );
      assert.equal((await listProjects(t.me)).length, before);
    },
  },

  {
    name: "an archive replaces the files of the open cloud project, or becomes this browser's project while the cloud project stays",
    signedIn: "u-ana-import-replace",
    async run(t) {
      const { page } = t;
      // An archive of the browser's project, with a line of its own.
      await t.open("/");
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n// from the archive");
      await page.waitForTimeout(700);
      const archive = await exportProject(page, "replacing.zip");

      const notes = await makeProject(t.me, "Notes", {
        files: {
          "diagrams/notes.meltemi": 'language "0.2"\n\ndiagram notes: flow {\n  a["A"]\n}\n',
        },
      });
      await openByLink(page, t.origin, notes.id);
      let dialog = await importDialog(page, archive);
      const replace = dialog.getByRole("radio", { name: /Replace the files of Notes/ });
      assert.equal(await replace.count(), 1);
      await replace.check();
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      const room = await roomHolds(t.me, notes.id, "the archive's files in the room", (read) =>
        (read.files["diagrams/overview.meltemi"] ?? "").endsWith("// from the archive"),
      );
      assert.equal("diagrams/notes.meltemi" in room.files, false, "the old files went");

      // Into this browser instead: the cloud project stays in the account, the page leaves it.
      dialog = await importDialog(page, archive);
      await dialog.getByRole("radio", { name: /This browser/ }).check();
      await dialog.getByRole("button", { name: "Import", exact: true }).click();
      await until(page, "the project of this browser", () => {
        const p = (window as unknown as { meltemiPlayground: { studio: { isBound(): boolean } } })
          .meltemiPlayground;
        return !p.studio.isBound();
      });
      assert.equal(new URL(page.url()).searchParams.get("project"), null);
      assert.match(await code(page), /\/\/ from the archive$/);
      assert.ok(
        (await listProjects(t.me)).some((row) => row.id === notes.id),
        "the cloud project stays",
      );
    },
  },
];
