/**
 * The scenarios of editing a cloud project: a canvas edit reaching the room, two devices of one
 * person converging, a remote change keeping the caret and staying out of the person's undo, the
 * undo rules, a file renamed on one device while the other types in it.
 */
import assert from "node:assert/strict";
import type { Scenario } from "./scenario.js";
import {
  THUMBNAIL_RATE_LOGGED,
  caret,
  caretAt,
  code,
  codeIs,
  dragElement,
  makeProject,
  openByLink,
  readRoom,
  roomHolds,
  statusLine,
  studioState,
  textOf,
  typeAtEnd,
  undo,
  undoIs,
} from "./cloud.js";
import { until } from "./support.js";

const OVERVIEW = "diagrams/overview.meltemi";
const SLIDE = "diagrams/slide.meltemi";
const PLACE_BROWSER = /place browser at \(\d+, \d+\)/;

export const editingScenarios: Scenario[] = [
  {
    name: "a canvas edit: dragging an element of a layout manual diagram writes the new place line into the room's text",
    signedIn: "u-ana-canvas",
    async run(t) {
      const { page } = t;
      const free = await makeProject(t.me, "Free slide", { template: "free" });
      await openByLink(page, t.origin, free.id);
      assert.equal((await studioState(page)).open, SLIDE);
      assert.match(await code(page), /layout manual/);
      const before = PLACE_BROWSER.exec(await code(page))?.[0];
      assert.ok(before, "the browser box is placed by hand");

      await dragElement(page, "browser", 60, 20);
      await until(
        page,
        "the drag written into the code",
        (old) =>
          !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(old),
        before,
      );
      const after = PLACE_BROWSER.exec(await code(page))?.[0];
      assert.ok(after && after !== before, `moved from ${before} to ${after}`);

      // The room's Y.Text of that file holds the new place line, and the file is the page's text.
      const room = await roomHolds(t.me, free.id, "the new place line in the room", (read) =>
        (read.files[SLIDE] ?? "").includes(after),
      );
      assert.equal(room.files[SLIDE], await code(page));
      assert.equal((room.files[SLIDE] ?? "").includes(before), false);
    },
  },

  {
    name: "a second device of the same person: edits of different lines converge on both pages and in the room",
    signedIn: "u-ana-converge",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const second = await t.device();
      await openByLink(t.page, t.origin, flow.id);
      await openByLink(second.page, t.origin, flow.id);
      const revision = (await readRoom(t.me, flow.id)).revision;

      // The first device writes at the end, the second at the beginning.
      await typeAtEnd(t.page, "\n// from the first device");
      await second.page.locator(".code-input").click();
      await second.page.keyboard.press("Control+Home");
      await second.page.keyboard.type("// from the second device\n", { delay: 12 });

      const both = (text: string) =>
        text.startsWith("// from the second device\n") && text.endsWith("// from the first device");
      const room = await roomHolds(t.me, flow.id, "both edits in the room", (read) =>
        both(read.files[OVERVIEW] ?? ""),
      );
      for (const [name, page] of [
        ["the first", t.page],
        ["the second", second.page],
      ] as const) {
        await codeIs(page, room.files[OVERVIEW] ?? "", `${name} device to show the room's text`);
      }
      // Each device's keystrokes were transactions of the room, and the page says it is saved.
      assert.ok(room.revision >= revision + 2, `revision ${revision} then ${room.revision}`);
      for (const page of [t.page, second.page]) {
        await until(
          page,
          "saved",
          () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "connected",
        );
      }
      assert.deepEqual(room.collisions, []);
    },
  },

  {
    name: "a remote change keeps the caret on the same text and the canvas redraws; it does not enter the person's undo, and with only remote changes the undo button is disabled",
    signedIn: "u-ana-caret",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const second = await t.device();
      await openByLink(t.page, t.origin, flow.id);
      await openByLink(second.page, t.origin, flow.id);
      const drawn = () => t.page.locator('#app .content g[data-role="element"]').count();
      assert.equal(await drawn(), 3);
      await undoIs(t.page, false, "nothing of one's own yet");

      // The caret of the first device on line 10 (the api line).
      await caretAt(t.page, 'api["API"]', false);
      const placed = await caret(t.page);
      assert.equal(placed.line, 10);

      // The second device inserts two lines above it: two new elements at the start of line 9.
      await second.page.locator(".code-input").evaluate((area: HTMLTextAreaElement) => {
        const at = area.value.indexOf("  client[");
        area.focus();
        area.setSelectionRange(at, at);
      });
      await second.page.keyboard.type('extra["Extra"]\nmore["More"]\n', { delay: 12 });
      await until(
        t.page,
        "the two remote lines, line breaks and all, in the first device's code",
        () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            'extra["Extra"]\nmore["More"]\n',
          ),
      );
      // The caret is on the same text, now two lines lower; the page did not move it.
      const moved = await caret(t.page);
      assert.equal(moved.line, 12, "line 10 became line 12");
      assert.equal(moved.after, placed.after, "the caret stayed on the same text");
      assert.equal(moved.start - placed.start, 'extra["Extra"]\nmore["More"]\n'.length);
      // The canvas redraws after the analysis pause.
      await until(
        t.page,
        "the canvas to draw the two new elements",
        () => document.querySelectorAll('#app .content g[data-role="element"]').length === 5,
      );

      // Remote changes only: nothing to undo, the button says so, and Ctrl+Z changes nothing.
      await undoIs(t.page, false, "only remote changes arrived");
      const text = await code(t.page);
      await undo(t.page);
      assert.equal(await statusLine(t.page), "Nothing to undo in this file.");
      assert.equal(await code(t.page), text);

      // A step of one's own, then another remote change: Ctrl+Z undoes the step and only it.
      await typeAtEnd(t.page, "x");
      await undoIs(t.page, true, "a step of one's own");
      await t.page.waitForTimeout(900);
      await second.page.locator(".code-input").click();
      await second.page.keyboard.press("Control+Home");
      await second.page.keyboard.type("// three\n", { delay: 12 });
      await until(t.page, "the remote line after the person's step", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.startsWith(
          "// three\n",
        ),
      );
      await undo(t.page);
      await until(
        t.page,
        "the step undone",
        () => !(document.querySelector(".code-input") as HTMLTextAreaElement).value.endsWith("x"),
      );
      const after = await code(t.page);
      assert.ok(after.startsWith("// three\n"), "the remote change stays");
      assert.equal(after.endsWith(text.slice(-20)), true, "only the typed x went");
      await undoIs(t.page, false, "nothing of one's own is left");
      // And the room agrees with both devices.
      const room = await roomHolds(
        t.me,
        flow.id,
        "the room to hold the undo and the remote line",
        (read) => read.files[OVERVIEW] === after,
      );
      assert.equal(room.files[OVERVIEW], after);
    },
  },

  {
    name: "undo in a cloud project: typing coalesces, a drag then typing within 700 ms undo separately, Enter ends the step, a file rename undoes alone",
    signedIn: "u-ana-undo",
    async run(t) {
      const { page } = t;
      const free = await makeProject(t.me, "Free slide", { template: "free" });
      await openByLink(page, t.origin, free.id);
      const original = await code(page);

      // Typing coalesces: three characters typed within 700 ms are one step.
      await typeAtEnd(page, "abc");
      await codeIs(page, `${original}abc`, "abc typed");
      await undo(page);
      await codeIs(page, original, "abc removed as one step");
      await undoIs(page, false, "the typing undone");

      // Enter ends the step: ab, Enter, c within 700 ms; Ctrl+Z removes c alone.
      await page.waitForTimeout(800);
      await typeAtEnd(page, "// ab");
      await page.keyboard.press("Enter");
      await page.keyboard.type("// c", { delay: 12 });
      await codeIs(page, `${original}// ab\n// c`, "the two lines typed");
      await undo(page);
      await codeIs(page, `${original}// ab\n`, "only c removed, the line break stays");
      await undo(page);
      await codeIs(page, original, "the first line removed");

      // A drag, then x within 700 ms: Ctrl+Z removes x and the element keeps its new place.
      await page.waitForTimeout(800);
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await dragElement(page, "browser", 60, 20);
      await until(
        page,
        "the drag written into the code",
        (old) =>
          !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(old),
        PLACE_BROWSER.exec(original)?.[0] ?? "",
      );
      const dragged = await code(page);
      await page.locator(".code-input").focus();
      await page.keyboard.type("x");
      assert.equal((await code(page)).length, dragged.length + 1);
      await undo(page);
      await codeIs(page, dragged, "x removed, the element stays where it was dragged");
      await undo(page);
      await codeIs(page, original, "the drag undone by a second Ctrl+Z");
      // The room saw each step: it holds the original again.
      await roomHolds(
        t.me,
        free.id,
        "the original text back in the room",
        (read) => read.files[SLIDE] === original,
      );

      // A file rename is one step of its own: undone, the file is back with its text.
      await page.getByRole("button", { name: "Rename the file" }).click();
      await page.locator("dialog[open] input").fill("diagrams/renamed.meltemi");
      await page.locator("dialog[open]").getByRole("button", { name: "OK", exact: true }).click();
      await until(
        page,
        "the file renamed",
        () =>
          (document.querySelector("#file-select") as HTMLSelectElement).value ===
          "diagrams/renamed.meltemi",
      );
      await roomHolds(
        t.me,
        free.id,
        "the renamed file in the room",
        (read) => "diagrams/renamed.meltemi" in read.files && !(SLIDE in read.files),
      );
      await undo(page);
      await until(
        page,
        "the file named as before",
        (path) => (document.querySelector("#file-select") as HTMLSelectElement).value === path,
        SLIDE,
      );
      assert.equal(await code(page), original);
      const room = await roomHolds(
        t.me,
        free.id,
        "the file back under its name",
        (read) => SLIDE in read.files && !("diagrams/renamed.meltemi" in read.files),
      );
      assert.equal(room.files[SLIDE], original);
    },
  },

  {
    name: "renaming an element across files undoes together in a cloud project: one Ctrl+Z puts every file back",
    signedIn: "u-ana-across",
    async run(t) {
      const { page } = t;
      const purchase = await makeProject(t.me, "Purchase", { template: "purchase" });
      await openByLink(page, t.origin, purchase.id);
      const before = (await readRoom(t.me, purchase.id)).files;
      const sources = Object.keys(before).filter((path) => path.endsWith(".meltemi"));
      assert.equal(sources.length, 5);

      // Rename the customer in the model; the diagrams, the sequence and the story refer to it.
      await page.locator("#file-select").selectOption("models/commerce.meltemi");
      await until(page, "the model open", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
          "person customer",
        ),
      );
      await caretAt(page, "person customer", true);
      await page.keyboard.press("F2");
      await page.locator(".code-rename").waitFor();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("buyer");
      await page.keyboard.press("Enter");

      const renamed = await roomHolds(
        t.me,
        purchase.id,
        "the rename in every file of the room",
        (read) => sources.every((path) => (read.files[path] ?? "").includes("buyer")),
      );
      for (const path of sources) assert.notEqual(renamed.files[path], before[path], path);

      // One Ctrl+Z, from the model: every file returns to its previous text, in the page and the room.
      await undo(page);
      const back = await roomHolds(t.me, purchase.id, "every file back in the room", (read) =>
        sources.every((path) => read.files[path] === before[path]),
      );
      for (const path of sources) assert.equal(back.files[path], before[path], path);
      const held = await page.evaluate((paths) => {
        const studio = (
          window as unknown as { meltemiPlayground: { studio: { text(p: string): string } } }
        ).meltemiPlayground.studio;
        return paths.map((path) => studio.text(path));
      }, sources);
      assert.deepEqual(
        held,
        sources.map((path) => before[path]),
      );
    },
  },

  {
    name: "two devices typing at the same place at once converge: every key of both is in the room and on both pages",
    signedIn: "u-ana-together",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const second = await t.device();
      await openByLink(t.page, t.origin, flow.id);
      await openByLink(second.page, t.origin, flow.id);
      for (const page of [t.page, second.page]) {
        await page.locator(".code-input").click();
        await page.keyboard.press("Control+End");
      }
      const original = await code(t.page);
      const keys = 30;
      await Promise.all([
        t.page.keyboard.type("A".repeat(keys), { delay: 40 }),
        second.page.keyboard.type("B".repeat(keys), { delay: 40 }),
      ]);
      const room = await roomHolds(
        t.me,
        flow.id,
        "every key of both devices in the room",
        (read) => {
          const text = read.files[OVERVIEW] ?? "";
          const added = text.slice(original.length);
          return (
            text.startsWith(original) &&
            added.split("A").length - 1 === keys &&
            added.split("B").length - 1 === keys
          );
        },
      );
      const text = room.files[OVERVIEW] ?? "";
      assert.equal(text.length, original.length + 2 * keys);
      for (const page of [t.page, second.page]) {
        await codeIs(page, text, "the page to show the merged text");
      }
    },
  },

  {
    name: "closing the page right after typing loses nothing: the room has the last words at once",
    signedIn: "u-ana-closing",
    async run(t) {
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      // A second window of the same person does the closing; this page stays and checks.
      const leaving = await t.device();
      await openByLink(leaving.page, t.origin, flow.id);
      await typeAtEnd(leaving.page, "\n// last words before closing", 5);
      await leaving.page.close();
      const room = await roomHolds(
        t.me,
        flow.id,
        "the last words in the room",
        (read) => (read.files[OVERVIEW] ?? "").endsWith("// last words before closing"),
        5000,
      );
      assert.ok(room.revision > 1);
    },
  },

  {
    name: "a push through the API, as the command line makes it, reaches the connected page: a changed text keeps the caret, a new file appears, a deleted one goes",
    signedIn: "u-ana-push",
    async run(t) {
      const { page } = t;
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      await openByLink(page, t.origin, flow.id);
      await caretAt(page, 'api["API"]', false);
      const placed = await caret(page);
      assert.equal(placed.line, 10);
      const held = await readRoom(t.me, flow.id);
      const lines = "// pushed first line\n// pushed second line\n";

      const push = await t.me.api("PUT", `/api/projects/${flow.id}/files`, {
        files: { [OVERVIEW]: `${lines}${held.files[OVERVIEW]}`, "notes.md": "# pushed notes\n" },
        ifRevision: held.revision,
      });
      assert.equal(push.status, 200, push.text);
      assert.ok(Number(push.json()["revision"]) > held.revision);
      // A push that expected an older revision is refused, with the revision the room is at.
      const stale = await t.me.api("PUT", `/api/projects/${flow.id}/files`, {
        files: { "notes.md": "# stale\n" },
        ifRevision: held.revision,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.json()["code"], "revision.mismatch");
      assert.equal(stale.json()["revision"], push.json()["revision"]);

      // The page has the pushed text and the new file; the caret stayed on the same text.
      await until(
        page,
        "the pushed lines in the code",
        (pushed) =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.startsWith(pushed),
        lines,
      );
      const moved = await caret(page);
      assert.equal(moved.line, 12);
      assert.equal(moved.after, placed.after);
      assert.deepEqual((await studioState(page)).paths, [OVERVIEW, "notes.md", "project.json"]);
      assert.equal(await textOf(page, "notes.md"), "# pushed notes\n");
      await undoIs(page, false, "a push is not the person's edit");

      // Deleted by a push: the file leaves the page.
      const gone = await t.me.api("PUT", `/api/projects/${flow.id}/files`, {
        files: { "notes.md": null },
      });
      assert.equal(gone.status, 200, gone.text);
      await until(
        page,
        "the file to leave the page",
        () =>
          ![...document.querySelectorAll("#file-select option")].some(
            (option) => (option as HTMLOptionElement).value === "notes.md",
          ),
      );
      assert.deepEqual((await studioState(page)).paths, [OVERVIEW, "project.json"]);
      assert.equal(
        await page.locator(".code-input").inputValue(),
        `${lines}${held.files[OVERVIEW]}`,
      );
    },
  },

  {
    name: "a file renamed on one device while the other types in it: both end with the renamed file and everything that was typed",
    signedIn: "u-ana-rename",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const flow = await makeProject(t.me, "Flow", { template: "flow" });
      const second = await t.device();
      await openByLink(t.page, t.origin, flow.id);
      await openByLink(second.page, t.origin, flow.id);
      const renamed = "diagrams/renamed.meltemi";
      const typed = "// typed on the second device while the first renames the file";

      // The second device types for three seconds; one second in, the first renames the file.
      await second.page.locator(".code-input").click();
      await second.page.keyboard.press("Control+End");
      const typing = second.page.keyboard.type(typed, { delay: 80 });
      await second.page.waitForTimeout(1000);
      await t.page.getByRole("button", { name: "Rename the file" }).click();
      await t.page.locator("dialog[open] input").fill(renamed);
      await t.page.locator("dialog[open]").getByRole("button", { name: "OK", exact: true }).click();
      await until(
        t.page,
        "the file renamed on the first device",
        (path) => (document.querySelector("#file-select") as HTMLSelectElement).value === path,
        renamed,
      );
      await typing;

      const room = await roomHolds(
        t.me,
        flow.id,
        "the renamed file with everything typed",
        (read) => (read.files[renamed] ?? "").endsWith(typed) && !(OVERVIEW in read.files),
      );
      assert.deepEqual(Object.keys(room.files).sort(), [renamed, "project.json"]);
      assert.deepEqual(room.collisions, []);
      for (const [name, page] of [
        ["the first", t.page],
        ["the second", second.page],
      ] as const) {
        await codeIs(page, room.files[renamed] ?? "", `${name} device to show the typed text`);
        const state = await studioState(page);
        assert.equal(state.open, renamed, `${name} device has the renamed file open`);
        assert.deepEqual(state.paths, [renamed, "project.json"]);
      }
    },
  },
];
