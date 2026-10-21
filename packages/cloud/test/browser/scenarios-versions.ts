/**
 * The scenarios of a project's history and picture: naming a version, restoring it, and the
 * thumbnail the page sends and the drawer shows.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import {
  code,
  codeIs,
  connected,
  drawerRow,
  makeProject,
  openByLink,
  openDrawer,
  readRoom,
  roomHolds,
  statusLine,
  typeAtEnd,
  undo,
  undoIs,
  waitFor,
} from "./cloud.js";
import { until } from "./support.js";

const OVERVIEW = "diagrams/overview.meltemi";

/** The versions the Worker lists for a project, oldest first. */
interface Listed {
  readonly number: number;
  readonly label: string | null;
  readonly auto: boolean;
  readonly changed: readonly string[];
}

export const versionScenarios: Scenario[] = [
  {
    name: "versions: a name of 81 characters is refused, a named version is kept, and restoring it makes the files equal it, keeps the state before as an automatic version and leaves nothing of the earlier steps to undo",
    signedIn: "u-ana-versions",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      await openByLink(page, t.origin, flow.id);
      /** The versions the Worker lists (newest first), oldest first. */
      const listed = async (): Promise<Listed[]> =>
        (
          (await t.me.api("GET", `/api/projects/${flow.id}/versions`)).json() as {
            versions: Listed[];
          }
        ).versions.sort((a, b) => a.number - b.number);

      // Typed without a pause, then named: the version must hold what is on the screen.
      await typeAtEnd(page, "\n// named state");
      const named = await code(page);
      await page.locator(".versions-button").click();
      const panel = page.getByRole("dialog", { name: "Versions" });
      await panel.waitFor();
      await until(
        page,
        "the list of versions",
        () =>
          document.querySelector(".versions-status")?.textContent === "" &&
          document.querySelector(".version-list") !== null,
      );
      assert.match(await panel.innerText(), /No versions yet/);

      // An 81-character name is refused in the panel, and nothing is created.
      await panel.locator("input").fill("x".repeat(81));
      await panel.getByRole("button", { name: "Name this version" }).click();
      await until(
        page,
        "the refusal",
        () =>
          document
            .querySelector("dialog .field-problem")
            ?.textContent?.includes("at most 80 characters") ?? false,
      );
      assert.match(await panel.locator(".field-problem").innerText(), /at most 80 characters/);
      assert.equal(await panel.locator(".version-row").count(), 0);
      assert.deepEqual(await listed(), []);

      // The state is named: one row with its name, and the Worker holds the typed text.
      await panel.locator("input").fill("before review");
      await panel.getByRole("button", { name: "Name this version" }).click();
      await panel.locator(".version-row").first().waitFor();
      assert.equal(await panel.locator(".version-label").first().innerText(), "before review");
      assert.equal(await panel.locator(".version-number").first().innerText(), "Version 1");
      const made = await listed();
      assert.deepEqual(
        made.map((v) => [v.number, v.label, v.auto]),
        [[1, "before review", false]],
      );
      const version = await t.me.api("GET", `/api/projects/${flow.id}/versions/1`);
      assert.equal(version.status, 200);
      assert.equal((version.json()["files"] as Record<string, string>)[OVERVIEW], named);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });

      // Edit after it: typing, a pause, and a deletion as a step of its own.
      await typeAtEnd(page, "\n// after the version");
      await page.waitForTimeout(800);
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      const edited = await code(page);
      assert.notEqual(edited, named);
      await roomHolds(
        t.me,
        flow.id,
        "the edits after the version",
        (read) => read.files[OVERVIEW] === edited,
      );

      // Restore it, after a confirmation that can be cancelled.
      await page.locator(".versions-button").click();
      await panel.waitFor();
      await panel.locator(".version-row").first().waitFor();
      await panel.getByRole("button", { name: "Restore version 1" }).click();
      const sure = page.getByRole("dialog", { name: "Restore this version?" });
      assert.match(await sure.innerText(), /becomes? those of version 1/);
      await sure.getByRole("button", { name: "Cancel", exact: true }).click();
      await sure.waitFor({ state: "detached" });
      assert.equal(await code(page), edited, "cancelled: nothing changed");
      await panel.getByRole("button", { name: "Restore version 1" }).click();
      await page
        .getByRole("dialog", { name: "Restore this version?" })
        .getByRole("button", { name: "Restore the version" })
        .click();

      // The files equal the named version, as a change that came from the room.
      await codeIs(page, named, "the files to equal the named version");
      const room = await roomHolds(
        t.me,
        flow.id,
        "the room to hold the named version",
        (read) => read.files[OVERVIEW] === named,
      );
      assert.equal(room.files[OVERVIEW], named);
      // The list shows an automatic version of the state before the restore, with the later edits.
      await panel.locator(".version-row").nth(1).waitFor();
      assert.equal(await panel.locator(".version-row").count(), 2);
      assert.equal(
        await panel.locator(".version-row").first().locator(".version-badge").innerText(),
        "Automatic",
      );
      const after = await listed();
      assert.deepEqual(
        after.map((v) => [v.number, v.label, v.auto]),
        [
          [1, "before review", false],
          [2, null, true],
        ],
      );
      const before = await t.me.api("GET", `/api/projects/${flow.id}/versions/2`);
      assert.equal(
        (before.json()["files"] as Record<string, string>)[OVERVIEW],
        edited,
        "the state before the restore is kept",
      );
      assert.match(await panel.locator(".versions-status").innerText(), /Restored version 1/);
      assert.match(await statusLine(page), /Restored version 1/);

      // The restore is not the person's edit, and what they did before it is forgotten: nothing is
      // left to undo, and Ctrl+Z cannot turn the restored text into something no version held.
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      await undoIs(page, false, "the restore left nothing to undo");
      await undo(page);
      await page.waitForTimeout(300);
      assert.equal(await code(page), named);
      assert.equal((await readRoom(t.me, flow.id)).files[OVERVIEW], named);

      // New steps are undone as usual afterwards.
      await typeAtEnd(page, "!");
      await undoIs(page, true, "a new step after the restore");
      await undo(page);
      await codeIs(page, named, "the new step undone");
    },
  },

  {
    name: "thumbnail: a changed label is sent about five seconds after the analysis settles, the drawer draws it, and a file with only a model sends none",
    signedIn: "u-ana-thumbnail",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const model = await makeProject(t.me, "Model only", {
        files: {
          "models/shop.meltemi":
            'language "0.2"\n\nmodel commerce {\n  person customer "Customer"\n  system shop "Shop"\n  customer -> shop: "Buys"\n}\n',
        },
      });
      const second = await t.device();
      assert.equal((await t.me.api("GET", `/api/projects/${flow.id}/thumbnail`)).status, 404);
      await openByLink(page, t.origin, flow.id);
      await second.page.goto(`${t.origin}/?project=${model.id}`);
      await connected(second.page);
      const modelOpened = Date.now();

      // A change of a label in the open file.
      await page.locator(".code-input").evaluate((area: HTMLTextAreaElement) => {
        const at = area.value.indexOf('"Overview"') + 1;
        area.focus();
        area.setSelectionRange(at, at + "Overview".length);
      });
      await page.keyboard.type("Brand new label", { delay: 8 });
      const edited = Date.now();
      assert.match(await code(page), /title "Brand new label"/);

      // The picture arrives about five seconds after the analysis settled, and shows the new label.
      let picture = await t.me.api("GET", `/api/projects/${flow.id}/thumbnail`);
      await waitFor(
        "the thumbnail",
        async () => {
          picture = await t.me.api("GET", `/api/projects/${flow.id}/thumbnail`);
          return picture.status === 200;
        },
        20_000,
      );
      const seconds = (Date.now() - edited) / 1000;
      console.log(`    the thumbnail arrived ${seconds.toFixed(1)} s after the edit`);
      assert.ok(seconds >= 4.5 && seconds <= 15, `after ${seconds} s`);
      assert.equal(picture.headers.get("content-type"), "image/svg+xml");
      assert.equal(picture.headers.get("content-security-policy"), "sandbox");
      assert.match(picture.text, /^<svg /);
      assert.ok(picture.text.includes("Brand new label"), "the picture shows the new label");
      assert.equal(picture.text.includes("Overview"), false);

      // The drawer draws it from an <img>.
      await openDrawer(page);
      const thumb = drawerRow(page, "Flow").locator("img.project-thumb");
      await thumb.waitFor();
      const drawn = await thumb.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      });
      assert.ok(drawn[0]! > 0 && drawn[1]! > 0, "the thumbnail draws");
      assert.match(
        (await thumb.getAttribute("src")) ?? "",
        /\/api\/projects\/[0-9a-z]{20}\/thumbnail/,
      );
      // A file that holds only a model draws nothing: well after the five seconds, none was sent.
      await waitFor(
        "six and a half seconds since the model opened",
        () => Date.now() - modelOpened > 6500,
      );
      assert.equal((await t.me.api("GET", `/api/projects/${model.id}/thumbnail`)).status, 404);
      assert.equal(
        await drawerRow(page, "Model only").locator("img.project-thumb").count(),
        0,
        "the outline of a folder, no picture",
      );
    },
  },
];
