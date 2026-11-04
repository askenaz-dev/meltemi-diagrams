/**
 * The scenarios of the projects themselves: the explorer's switcher and its panel (the cloud
 * projects, New project, renaming the open project from the header), saving the anonymous project,
 * opening by address, and the quota. The page is the real playground served by the real Worker; what
 * the person did is checked where it lands: in the Worker's rooms, read through its API.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import {
  NOTES,
  PICTURE,
  PNG,
  closeSwitcher,
  code,
  connected,
  listProjects,
  makeProject,
  noDialog,
  openByLink,
  openSwitcher,
  readRoom,
  sha256,
  statusLine,
  studioState,
  switcherLocal,
  switcherNames,
  switcherPanel,
  switcherRow,
  typeAtEnd,
  roomHolds,
  connection,
} from "./cloud.js";
import { analysed, expectOpen, openFile, ready, until } from "./support.js";

/** The 404 the browser itself logs for a request the page made to a project that is not there. */
const NOT_FOUND_LOGGED = /status of 404/;

export const projectScenarios: Scenario[] = [
  {
    name: "anonymous: no cloud machinery appears, and at a link to a project the one question asked is whether the link admits them: not found, with an offer to sign in; the browser's own project is kept as before",
    allowedErrors: [NOT_FOUND_LOGGED],
    async run(t) {
      const { page, seen } = t;
      const id = "01h2x5z8kq3m7n9p2r4t";
      await t.open(`/?project=${id}`);
      assert.equal(await page.locator(".versions-button").count(), 0);
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.equal(await page.locator(".privacy").isVisible(), true);
      // The page asked the Worker, which answered 404 for a project that is not there, and the status
      // line says so without saying why, and offers to sign in.
      const notFound =
        /The project was not found\. If it was shared with you, sign in and open the link again\./;
      await until(
        page,
        "the status line to say the project was not found",
        () =>
          document.querySelector(".status-text")?.textContent?.includes("was not found") ?? false,
      );
      assert.match(await statusLine(page), notFound);
      assert.equal(page.url(), `${t.origin}/?project=${id}`);
      assert.equal(await page.locator(".view-badge").count(), 0);

      // The switcher names this browser's project, and its panel has no list of cloud projects: it
      // says to sign in instead.
      assert.equal(await page.locator(".switcher-where").innerText(), "This browser");
      await page.locator(".switcher-button").click();
      const panel = switcherPanel(page);
      await panel.waitFor();
      assert.match(
        await panel.locator(".panel-note").innerText(),
        /^Sign in to keep projects in your account/,
      );
      assert.equal(await panel.getByRole("link", { name: "Sign in" }).count(), 1);
      assert.equal(await panel.locator(".project-row").count(), 0);
      assert.equal(await panel.locator(".panel-count").count(), 0);
      assert.equal(
        await panel.getByRole("button", { name: "Save this project to the cloud" }).count(),
        0,
      );
      await closeSwitcher(page);

      // The page works as before: an edit is kept in this browser and comes back after a reload.
      await typeAtEnd(page, "\n// anonymous edit");
      await page.waitForTimeout(800);
      await page.reload();
      await ready(page);
      assert.match(await code(page), /\/\/ anonymous edit$/);
      assert.equal(page.url(), `${t.origin}/?project=${id}`);
      await until(
        page,
        "the status line to say it again after the reload",
        () =>
          document.querySelector(".status-text")?.textContent?.includes("was not found") ?? false,
      );

      // Of the cloud only that question was asked, once for each load: no list of projects, no
      // files, no room, no usage.
      const asked = seen.requests.map((address) => new URL(address).pathname);
      assert.deepEqual(
        asked.filter((path) => /^\/(api\/(projects|account|dev)|rooms|p)(\/|$)/.test(path)),
        [`/api/projects/${id}`, `/api/projects/${id}`],
      );
      assert.deepEqual(seen.sockets, []);
    },
  },

  {
    name: "projects switcher: the panel lists with a thumbnail, New project makes one in the account from a template, rename, duplicate and delete after a confirmation",
    signedIn: "u-ana-switcher",
    async run(t) {
      const { page } = t;
      // A project made before the page opens, with a picture an <img> can show.
      const notes = await makeProject(t.me, "Notes", {
        files: { "diagrams/notes.meltemi": NOTES },
      });
      const put = await t.me.api("PUT", `/api/projects/${notes.id}/thumbnail`, PICTURE, {
        "Content-Type": "image/svg+xml",
      });
      assert.equal(put.status, 204, put.text);

      await t.open("/");
      // Nothing of a cloud project is open: no status of the cloud, the anonymous project as before.
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.equal(await page.locator(".privacy").isVisible(), true);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal(await page.locator(".switcher-where").innerText(), "This browser");

      let panel = await openSwitcher(page);
      assert.equal(await panel.locator("h2").innerText(), "Projects");
      assert.deepEqual(await switcherNames(page), ["Notes"]);
      assert.equal(await panel.locator(".panel-count").innerText(), "1 of 100 projects");
      // The list's thumbnail is an <img> on the Worker's own origin, and it draws.
      const thumb = switcherRow(page, "Notes").locator("img.panel-thumb");
      assert.equal(
        await thumb.getAttribute("src"),
        `${t.origin}/api/projects/${notes.id}/thumbnail`,
      );
      const drawn = await thumb.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return image.naturalWidth > 0;
      });
      assert.equal(drawn, true, "the thumbnail draws");
      // The anonymous project can be saved; it is the open one, and no cloud project is.
      assert.equal(
        await panel.getByRole("button", { name: "Save this project to the cloud" }).isVisible(),
        true,
      );
      assert.equal(await switcherLocal(page).getAttribute("aria-current"), "true");
      assert.equal(await panel.locator('.project-row [aria-current="true"]').count(), 0);

      // New project in the account from a template: it opens, bound, with the template's files in
      // the room.
      await panel.getByRole("button", { name: "New project…" }).click();
      const dialog = page.locator("dialog.new-project");
      await dialog.locator('[data-template="purchase"]').click();
      const name = dialog.getByLabel("Name", { exact: true });
      assert.equal(await name.inputValue(), "Purchase example", "the card's title");
      assert.equal(await dialog.getByRole("radio", { name: /^In your account/ }).isChecked(), true);
      await name.fill("Purchase flow");
      await dialog.getByRole("button", { name: "Create the project" }).click();
      await noDialog(page, "New project to close after creating the project");
      assert.equal(await switcherPanel(page).count(), 0, "the panel closed");
      const created = (await listProjects(t.me)).find((row) => row.name === "Purchase flow");
      assert.ok(created, "the Worker lists the new project");
      assert.equal(new URL(page.url()).searchParams.get("project"), created.id);
      await connected(page);
      const room = await readRoom(t.me, created.id);
      assert.deepEqual(
        Object.keys(room.files).filter((path) => path.endsWith(".meltemi")).length,
        5,
      );
      assert.ok("project.json" in room.files);
      const state = await studioState(page);
      assert.equal(state.bound, true);
      assert.deepEqual(state.paths, Object.keys(room.files).sort());
      assert.equal(await page.locator(".privacy").isHidden(), true, "the work is in the cloud");
      assert.match(await statusLine(page), /Opened Purchase flow\./);
      // The explorer's header names it, saved to the cloud.
      await until(
        page,
        "the header to name the cloud project",
        () =>
          document.querySelector(".switcher-name")?.textContent === "Purchase flow" &&
          document.querySelector(".switcher-where")?.textContent === "Saved to the cloud",
      );

      // The panel again: the open project is marked, and the way back to the local one is offered.
      panel = await openSwitcher(page);
      assert.deepEqual((await switcherNames(page)).sort(), ["Notes", "Purchase flow"]);
      assert.equal(
        await switcherRow(page, "Purchase flow").locator(".project-badge").innerText(),
        "Open now",
      );
      assert.equal(
        await switcherRow(page, "Purchase flow")
          .locator("button.panel-project")
          .getAttribute("aria-current"),
        "true",
      );
      assert.equal(await switcherLocal(page).getAttribute("aria-current"), null);
      assert.equal(
        await panel.getByRole("button", { name: "Save this project to the cloud" }).count(),
        0,
      );

      // Rename.
      await switcherRow(page, "Purchase flow").locator('button[data-action="rename"]').click();
      const rename = page.locator("dialog[open]").last();
      assert.equal(await rename.locator("h2").innerText(), "Rename the project");
      await rename.locator("input").fill("Purchase renamed");
      await rename.getByRole("button", { name: "OK", exact: true }).click();
      await until(page, "the new name in the list", () =>
        [...document.querySelectorAll(".switcher-panel .panel-project-name")].some(
          (name) => name.textContent === "Purchase renamed",
        ),
      );
      assert.equal(
        (await listProjects(t.me)).some((row) => row.name === "Purchase renamed"),
        true,
        "the Worker has the new name",
      );

      // Duplicate: a copy with the same files appears, and the Worker has it.
      await switcherRow(page, "Purchase renamed")
        .locator('button[data-action="duplicate"]')
        .click();
      await until(page, "the copy in the list", () =>
        [...document.querySelectorAll(".switcher-panel .panel-project-name")].some(
          (name) => name.textContent === "Purchase renamed (copy)",
        ),
      );
      const copy = (await listProjects(t.me)).find((row) => row.name === "Purchase renamed (copy)");
      assert.ok(copy, "the Worker lists the copy");
      assert.deepEqual(
        (await readRoom(t.me, copy.id)).files,
        (await readRoom(t.me, created.id)).files,
      );

      // Delete asks first: cancelled, nothing goes; confirmed, the project and its room are gone.
      await switcherRow(page, "Purchase renamed (copy)")
        .locator('button[data-action="delete"]')
        .click();
      const sure = page.locator("dialog[open]").last();
      assert.equal(await sure.locator("h2").innerText(), "Delete the project?");
      assert.match(
        await sure.innerText(),
        /Purchase renamed \(copy\) is removed from your account/,
      );
      await sure.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal((await switcherNames(page)).length, 3);
      assert.equal((await t.me.api("GET", `/api/projects/${copy.id}`)).status, 200);
      await switcherRow(page, "Purchase renamed (copy)")
        .locator('button[data-action="delete"]')
        .click();
      await page
        .locator("dialog[open]")
        .last()
        .getByRole("button", { name: "Delete the project", exact: true })
        .click();
      await until(
        page,
        "the copy to leave the list",
        () =>
          ![...document.querySelectorAll(".switcher-panel .panel-project-name")].some(
            (name) => name.textContent === "Purchase renamed (copy)",
          ),
      );
      assert.equal((await t.me.api("GET", `/api/projects/${copy.id}`)).status, 404);
      assert.equal((await t.me.api("GET", `/api/projects/${copy.id}/files`)).status, 404);
      assert.deepEqual((await switcherNames(page)).sort(), ["Notes", "Purchase renamed"]);
      assert.deepEqual((await listProjects(t.me)).map((row) => row.name).sort(), [
        "Notes",
        "Purchase renamed",
      ]);

      // Escape closes the panel; the open project is still bound, and the header has its new name.
      await closeSwitcher(page);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal((await studioState(page)).bound, true);
      await until(
        page,
        "the header to follow the rename",
        () => document.querySelector(".switcher-name")?.textContent === "Purchase renamed",
      );

      // The file open in a project is remembered in this browser: a reload opens it at that file.
      assert.equal((await studioState(page)).open, "diagrams/architecture.meltemi");
      await openFile(page, "models/commerce.meltemi");
      await page.reload();
      // A file that holds only a model draws nothing, so the page is ready without a drawing.
      await page.waitForFunction(() => "meltemiPlayground" in window);
      await connected(page);
      assert.equal(new URL(page.url()).searchParams.get("project"), created.id);
      assert.equal((await studioState(page)).open, "models/commerce.meltemi");
      assert.match(await code(page), /^language "0\.2"\n\n\/\/ The reference purchase/);
    },
  },

  {
    name: "projects switcher in Spanish: the words, a project from a template, the confirmation to delete",
    signedIn: "u-ana-switcher-es",
    locale: "es-ES",
    async run(t) {
      const { page } = t;
      const old = await makeProject(t.me, "Notas", { files: { "diagrams/notas.meltemi": NOTES } });
      await t.open("/");
      assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
      assert.match(
        (await page.locator(".switcher-button").getAttribute("aria-label")) ?? "",
        /^Proyectos: .+ está abierto$/,
      );
      assert.equal(await page.locator(".switcher-where").innerText(), "Este navegador");
      const panel = await openSwitcher(page);
      assert.equal(await panel.locator("h2").innerText(), "Proyectos");
      assert.equal(await panel.locator(".panel-count").innerText(), "1 de 100 proyectos");

      await panel.getByRole("button", { name: "Nuevo proyecto…" }).click();
      const dialog = page.locator("dialog.new-project");
      assert.equal(await dialog.locator("h2").innerText(), "Nuevo proyecto");
      const name = dialog.getByLabel("Nombre", { exact: true });
      assert.equal(await name.inputValue(), "Diagrama de flujo", "the chosen card's title");
      assert.equal(
        await dialog.locator('[data-template="flow"]').getAttribute("aria-checked"),
        "true",
      );
      assert.equal(await dialog.getByRole("radio", { name: /^En tu cuenta/ }).isChecked(), true);
      assert.equal(
        await dialog.getByRole("radio", { name: /^En este navegador/ }).isChecked(),
        false,
      );
      await name.fill("Mi flujo");
      await dialog.getByRole("button", { name: "Crear el proyecto" }).click();
      await noDialog(page);
      await connected(page);
      assert.equal(await page.locator(".cloud-status").innerText(), "Guardado en la nube");
      assert.equal(await page.locator(".switcher-where").innerText(), "Guardado en la nube");
      assert.match(await statusLine(page), /Se abrió Mi flujo\./);
      const made = (await listProjects(t.me)).find((row) => row.name === "Mi flujo");
      assert.ok(made);
      assert.match(await code(page), /diagram overview: flow/);

      await openSwitcher(page);
      await switcherRow(page, "Notas").locator('button[data-action="delete"]').click();
      const sure = page.locator("dialog[open]").last();
      assert.equal(await sure.locator("h2").innerText(), "¿Eliminar el proyecto?");
      await sure.getByRole("button", { name: "Eliminar el proyecto", exact: true }).click();
      await until(
        page,
        "the old project to leave the list",
        () =>
          ![...document.querySelectorAll(".switcher-panel .panel-project-name")].some(
            (name) => name.textContent === "Notas",
          ),
      );
      assert.equal((await t.me.api("GET", `/api/projects/${old.id}`)).status, 404);
      assert.match(await statusLine(page), /Se eliminó Notas\./);
    },
  },

  {
    name: 'the anonymous flow project, edited first, is saved with "Save this project to the cloud": the cloud project holds those files and the page is bound',
    signedIn: "u-ana-save",
    async run(t) {
      const { page } = t;
      await t.open("/");
      await expectOpen(page, "diagrams/overview.meltemi");
      // Edited first: a line of text, and an image added from a file.
      await typeAtEnd(page, "\n// edited before saving");
      await analysed(page);
      const edited = await code(page);
      assert.match(edited, /\/\/ edited before saving$/);
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Open", exact: true }).click();
      await (await chooser).setFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
      await page.locator('.tree li[data-key="f:diagrams/dot.png"]').waitFor();
      await openFile(page, "diagrams/overview.meltemi");
      assert.equal(await code(page), edited);
      // The work waits in this browser, as the anonymous project always does.
      await page.waitForTimeout(700);

      const panel = await openSwitcher(page);
      assert.deepEqual(await switcherNames(page), [], "nothing in the cloud yet");
      await panel.getByRole("button", { name: "Save this project to the cloud" }).click();
      const naming = page.locator("dialog[open]").last();
      assert.equal(await naming.locator("h2").innerText(), "Save to the cloud");
      assert.equal(await naming.locator("input").inputValue(), "flow", "project.json's name");
      await naming.locator("input").fill("Edited flow");
      await naming.getByRole("button", { name: "OK", exact: true }).click();
      await noDialog(page, "the naming dialog to close");
      await until(
        page,
        "the panel to close after saving",
        () => document.querySelector(".switcher-panel") === null,
      );
      await connected(page);

      const saved = (await listProjects(t.me)).find((row) => row.name === "Edited flow");
      assert.ok(saved, "the Worker lists the cloud project");
      assert.equal(new URL(page.url()).searchParams.get("project"), saved.id);
      // The cloud project holds those files, the image among them as a blob.
      const room = await readRoom(t.me, saved.id);
      assert.equal(room.files["diagrams/overview.meltemi"], edited);
      assert.ok("project.json" in room.files);
      assert.deepEqual(room.binaries, { "diagrams/dot.png": sha256(PNG) });
      const blob = await t.me.api("GET", `/api/projects/${saved.id}/blobs/${sha256(PNG)}`);
      assert.equal(blob.status, 200);
      assert.equal(blob.headers.get("content-type"), "image/png");
      // The page is bound to it: the status says so, and nothing but the cloud holds the work now.
      assert.match(await statusLine(page), /Opened Edited flow\./);
      const state = await studioState(page);
      assert.equal(state.bound, true);
      assert.deepEqual(state.paths, [
        "diagrams/dot.png",
        "diagrams/overview.meltemi",
        "project.json",
      ]);
      assert.equal(await page.locator(".privacy").isHidden(), true);

      // A change reaches the room now, and the local project is as it was left.
      await typeAtEnd(page, "\n// after saving");
      await roomHolds(t.me, saved.id, "the edit after saving", (read) =>
        (read.files["diagrams/overview.meltemi"] ?? "").endsWith("// after saving"),
      );
      // The project of this browser, in the panel's "This browser", is the way back to it.
      await openSwitcher(page);
      assert.equal(await switcherLocal(page).getAttribute("aria-current"), null);
      await switcherLocal(page).click();
      await until(
        page,
        "the panel to close and the anonymous project to open",
        () =>
          document.querySelector(".switcher-panel") === null &&
          document.querySelector(".switcher-where")?.textContent === "This browser",
      );
      assert.equal(await page.locator("dialog[open]").count(), 0);
      assert.equal(
        new URL(page.url()).searchParams.get("project"),
        null,
        "the address names no project",
      );
      assert.equal(await page.locator(".cloud-status").isHidden(), true);
      assert.equal((await studioState(page)).bound, false);
      assert.equal(
        await code(page),
        edited,
        "the anonymous project is as it was, without the cloud's edit",
      );
    },
  },

  {
    name: "a project opens by its link /p/<id>: it lands on /?project=<id>, bound, and the address stays after a reload; the switcher's panel copies that link",
    signedIn: "u-ana-address",
    async run(t) {
      const { page, origin, context } = t;
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      const flow = await makeProject(t.me, "Flow by link", { template: "flow" });

      const session = await t.open(`/p/${flow.id}`);
      assert.equal((session.json["user"] as { sub: string }).sub, "u-ana-address");
      assert.equal(page.url(), `${origin}/?project=${flow.id}`);
      await connected(page);
      const state = await studioState(page);
      assert.equal(state.bound, true);
      assert.deepEqual(state.paths, ["diagrams/overview.meltemi", "project.json"]);
      assert.match(await code(page), /diagram overview: flow/);
      assert.equal(await page.locator(".versions-button").isVisible(), true);

      // A reload reopens it, from the address alone.
      await page.reload();
      await until(
        page,
        "the project reopened",
        () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "connected",
      );
      assert.equal(page.url(), `${origin}/?project=${flow.id}`);
      assert.equal((await studioState(page)).bound, true);
      assert.match(await code(page), /diagram overview: flow/);

      // The link the panel copies is that one.
      await openSwitcher(page);
      await switcherRow(page, "Flow by link").locator('button[data-action="link"]').click();
      await until(
        page,
        "the link copied",
        () =>
          document.querySelector(".switcher-panel .projects-status")?.textContent ===
          "The link to the project was copied.",
      );
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        `${origin}/p/${flow.id}`,
      );
    },
  },

  {
    name: "an address that names a project the person cannot open says so, opens the anonymous project and keeps the address: gone, malformed, or another person's",
    signedIn: "u-ana-lost",
    allowedErrors: [NOT_FOUND_LOGGED],
    async run(t) {
      const { page, origin } = t;
      const bob = await t.person("u-bob-lost");
      const secret = await makeProject(bob, "Bob's", { template: "flow" });
      const notFound = /The project was not found, or it is not yours to open/;

      for (const [label, address] of [
        ["a project that does not exist", "z".repeat(20)],
        ["another person's project", secret.id],
        ["something that cannot be a project", "nonsense"],
      ] as const) {
        await t.open(`/?project=${address}`);
        await until(
          page,
          `${label}: the status line says it was not found`,
          () =>
            document.querySelector(".status-text")?.textContent?.includes("was not found") ?? false,
        );
        assert.match(await statusLine(page), notFound, label);
        // The anonymous project opened as usual, and the address stays as it was.
        assert.equal(page.url(), `${origin}/?project=${address}`, label);
        assert.equal(await page.locator(".cloud-status").isHidden(), true, label);
        assert.equal((await studioState(page)).bound, false, label);
        assert.match(await code(page), /diagram overview: flow/, label);
        assert.equal(await page.locator(".privacy").isVisible(), true, label);
      }
      // Bob's project is untouched, and a link to it opens for Bob alone.
      assert.equal((await bob.api("GET", `/api/projects/${secret.id}`)).status, 200);
      assert.equal((await t.me.api("GET", `/api/projects/${secret.id}/files`)).status, 404);
    },
  },

  {
    name: "the open cloud project is renamed from the explorer's header: the header, the Worker and the switcher's panel have the new name",
    signedIn: "u-ana-header-rename",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Header name", { template: "flow" });
      await openByLink(page, t.origin, flow.id);
      assert.equal(await page.locator(".switcher-name").innerText(), "Header name");
      await until(
        page,
        "the header to say where the project lives",
        () => document.querySelector(".switcher-where")?.textContent === "Saved to the cloud",
      );

      // The pencil beside the name asks for the new one, the open project's name filled in.
      await page.locator(".switcher-rename").click();
      const naming = page.locator("dialog[open]").last();
      assert.equal(await naming.locator("h2").innerText(), "Rename the project");
      assert.equal(await naming.locator("input").inputValue(), "Header name");
      await naming.locator("input").fill("Renamed in the header");
      await naming.getByRole("button", { name: "OK", exact: true }).click();
      await noDialog(page, "the naming dialog to close");
      await until(
        page,
        "the new name in the header",
        () => document.querySelector(".switcher-name")?.textContent === "Renamed in the header",
      );
      assert.match(await statusLine(page), /Renamed the project to Renamed in the header\./);

      // The Worker has it, under the same id, and the page is still bound to that project.
      assert.deepEqual(
        (await listProjects(t.me)).map((row) => [row.id, row.name]),
        [[flow.id, "Renamed in the header"]],
      );
      assert.equal((await studioState(page)).bound, true);
      assert.equal(new URL(page.url()).searchParams.get("project"), flow.id);

      // The panel's row has it too, marked as the open project.
      await openSwitcher(page);
      assert.deepEqual(await switcherNames(page), ["Renamed in the header"]);
      assert.equal(
        await switcherRow(page, "Renamed in the header").locator(".project-badge").innerText(),
        "Open now",
      );
      await closeSwitcher(page);
    },
  },

  {
    name: "the 101st project, made from New project, shows the quota in the status line and in the dialog, which stays open, and leaves the switcher's list as it was",
    signedIn: "u-ana-quota",
    allowedErrors: [/status of 413/],
    async run(t) {
      const { page } = t;
      // A hundred empty projects through the API, twenty-five at a time.
      for (let batch = 0; batch < 4; batch++) {
        await Promise.all(
          Array.from({ length: 25 }, (_, position) =>
            makeProject(t.me, `Project ${batch * 25 + position + 1}`, { files: {} }),
          ),
        );
      }
      assert.equal((await listProjects(t.me)).length, 100);
      const refused = await t.me.api("POST", "/api/projects", { name: "One too many", files: {} });
      assert.equal(refused.status, 413);
      assert.equal(refused.json()["code"], "quota.projects");

      await t.open("/");
      const panel = await openSwitcher(page);
      assert.equal(await panel.locator(".panel-count").innerText(), "100 of 100 projects");
      const before = await switcherNames(page);
      assert.equal(before.length, 100);
      await panel.getByRole("button", { name: "New project…" }).click();
      const dialog = page.locator("dialog.new-project");
      await dialog.getByLabel("Name", { exact: true }).fill("One too many");
      await dialog.getByRole("button", { name: "Create the project" }).click();
      const quota = /Your account holds at most 100 projects/;
      await until(
        page,
        "the quota in the status line",
        () =>
          document.querySelector(".status-text")?.textContent?.includes("at most 100 projects") ??
          false,
      );
      assert.match(await statusLine(page), quota);
      assert.match(await dialog.locator(".field-problem").first().innerText(), quota);
      // The dialog stays open, nothing was created, and no project was opened.
      assert.equal(await page.locator("dialog.new-project[open]").count(), 1);
      assert.equal((await listProjects(t.me)).length, 100);
      assert.equal((await studioState(page)).bound, false);
      assert.equal(await connection(page), null);
      // Given up, the panel lists the same projects as before.
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await noDialog(page);
      await openSwitcher(page);
      assert.deepEqual(await switcherNames(page), before);
    },
  },
];
