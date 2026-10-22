/**
 * Viewing a project by its link, through the real Worker, D1, R2 and room: what a person nobody is
 * signed in as is shown by a `view` link and what a `private` one does not tell them, what a viewer
 * cannot change (the code, the canvas, the room), making a copy, an `edit` link, and a signed-in
 * viewer who follows the room live. Every check of what the room holds is made through the owner's
 * calls from Node, so that what the page did not do is seen where it would have landed.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as Y from "yjs";
import type { Scenario } from "./scenario.js";
import {
  THUMBNAIL_RATE_LOGGED,
  code,
  connected,
  dragElement,
  elementBox,
  listProjects,
  makeProject,
  PNG,
  noDialog,
  readRoom,
  roomHolds,
  statusLine,
  studioState,
  textHas,
  typeAtEnd,
} from "./cloud.js";
import { KIND, changeOf, join } from "./room-socket.js";
import {
  EDITOR,
  NOTHING,
  SHOWCASE_IMAGE,
  VIEWER,
  addMember,
  observe,
  readOnly,
  setLinkLevel,
  showFile,
  showcase,
  statusHas,
  viewing,
  viewingIs,
} from "./sharing.js";
import { analysed, assertError, expectOpen, ready, until } from "./support.js";

/** The browser's note that a request answered 404: what an anonymous page logs for a project it may not see. */
const NOT_FOUND_LOGGED = /status of 404/;

/** The anonymous project this browser keeps, and where. */
const KEPT = "meltemi-playground:project:v1";
const PREVIOUS = "meltemi-playground:previous:v1";

/** A project the browser could have kept before the link was opened: work that is not a template. */
const KEPT_WORK = JSON.stringify({
  v: 1,
  open: "notes.md",
  files: { "notes.md": "my own work, never touched" },
  skipped: [],
});

const SLIDE = "diagrams/slide.meltemi";
const STORY = "stories/purchase.meltemi";
const PLACE_BROWSER = /place browser at \(\d+, \d+\)/;

/**
 * Seeds the browser's own project before the page starts, once (a reload does not put it back). The
 * script runs in every document the page opens, those with no storage of their own included.
 */
const seedKept = (value: string) =>
  [
    ([key, work]: readonly [string, string]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, work);
      } catch {
        // A document that has no storage (a sandboxed frame) has no project to keep.
      }
    },
    [KEPT, value] as const,
  ] as const;

export const viewingScenarios: Scenario[] = [
  {
    name: "viewing: an anonymous browser opens a view link: it follows the room live as a guest, the diagrams draw, a story plays, the SVG exports, the code and the canvas refuse every edit, nothing reaches the room and nothing is kept in the browser",
    signedIn: "u-ana-view",
    async run(t) {
      const { origin } = t;
      const project = await showcase(t.me, "Viewed");
      await setLinkLevel(t.me, project.id, "view");
      const before = await readRoom(t.me, project.id);

      const anon = await t.device({ as: null });
      const { page } = anon;
      const [seed, argument] = seedKept(KEPT_WORK);
      await anon.context.addInitScript(seed, argument);
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);

      // The link lands on the page, which keeps the address; view mode, following the room live.
      assert.equal(page.url(), `${origin}/?project=${project.id}`);
      await viewingIs(page, "live");
      assert.equal(await page.locator(".view-badge").innerText(), "View only");
      assert.equal(await page.locator(".view-copy").isVisible(), true, "Make a copy");
      assert.equal(await page.locator(".view-save").isVisible(), false, "nobody has an account");
      // The explorer's header names the viewed project, says it is view only and offers no rename.
      assert.equal(await page.locator(".switcher-name").innerText(), "Viewed");
      // The header says how it is seen: following the room live.
      await until(
        page,
        "the explorer's header to say it follows live",
        () => document.querySelector(".switcher-where")?.textContent === "Following live",
      );
      assert.equal(await page.locator(".switcher-rename").isHidden(), true);
      await until(
        page,
        "the visitor's connection to say it follows live",
        () => document.querySelector(".cloud-status")?.getAttribute("data-state") === "connected",
      );
      assert.match(await page.locator(".cloud-status").innerText(), /Following live/);
      assert.equal(
        await page.locator(".privacy").isHidden(),
        true,
        "nothing is kept in this browser",
      );
      assert.equal(await page.locator(".view-hint").isHidden(), true);
      await statusHas(page, "Opened Viewed to view");
      assert.equal(await readOnly(page), true);
      const state = await studioState(page);
      assert.deepEqual(
        state.paths,
        [...Object.keys(before.files), ...Object.keys(before.binaries)].sort(),
        "the whole project is here",
      );
      // The image came with it, read from the Worker by its hash as any viewer may read it.
      const hash = before.binaries[SHOWCASE_IMAGE];
      assert.ok(hash, "the project holds its image");
      assert.equal(
        await page.evaluate((path) => {
          const held = (
            window as unknown as {
              meltemiPlayground: { studio: { host: { get(p: string): unknown } } };
            }
          ).meltemiPlayground.studio.host.get(path);
          return held instanceof Uint8Array ? held.length : -1;
        }, SHOWCASE_IMAGE),
        PNG.length,
        "the image's bytes are in the page",
      );

      // It draws, and the canvas only shows.
      assert.ok((await page.locator('#app .content g[data-role="element"]').count()) >= 3);
      assert.equal(
        await page.evaluate(() => document.querySelector("#app")?.closest(".view-only") !== null),
        true,
        "the canvas is read-only",
      );
      assert.equal(await page.locator("#app .view-only-badge").isVisible(), true);

      // The code pane refuses typing, whatever the key.
      const text = await code(page);
      assert.equal(
        await page.locator(".code-input").evaluate((area: HTMLTextAreaElement) => area.readOnly),
        true,
      );
      await page.locator(".code-input").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("typed text", { delay: 2 });
      for (const key of ["Enter", "Backspace", "Control+z", "Control+y", "Shift+Alt+F", "F2"]) {
        await page.keyboard.press(key);
      }
      assert.equal(await code(page), text, "nothing was typed");

      // A drag of an element, a delete and an undo on the canvas leave the element and the text where they were.
      await showFile(page, SLIDE);
      await analysed(page);
      const slide = await code(page);
      assert.match(slide, PLACE_BROWSER);
      const placed = await elementBox(page, "browser");
      await dragElement(page, "browser", 60, 20);
      await page.keyboard.press("Delete");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(500);
      assert.equal(await code(page), slide, "the drag wrote nothing into the code");
      // The inspector shows its fields and does not commit: they are disabled, and a value put in one
      // whatever the control lets through is no edit.
      const fields = page
        .locator("#app [data-readonly]")
        .locator("input:not([type=checkbox]):not([type=radio]), textarea, select");
      assert.ok((await fields.count()) > 0, "the inspector shows the fields");
      // (A control that is hidden, as the editing ones are in view mode, is none the person can use.)
      const enabled = await fields.evaluateAll((all) =>
        all
          .filter(
            (field) => !(field as HTMLInputElement).disabled && field.getClientRects().length > 0,
          )
          .map((field) => field.getAttribute("aria-label") ?? field.outerHTML.slice(0, 120)),
      );
      assert.deepEqual(enabled, [], "every field of the inspector that shows is disabled");
      await fields.first().evaluate((input: HTMLInputElement) => {
        input.value = "Changed by a viewer";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
      });
      await page.waitForTimeout(300);
      assert.equal(await code(page), slide, "the inspector wrote nothing into the code");
      assert.deepEqual(
        await elementBox(page, "browser"),
        placed,
        "the element stayed where it was",
      );

      // A story plays on the canvas, as it does for the person who wrote it.
      await showFile(page, STORY);
      await analysed(page);
      await until(page, "the story offered", () => {
        const select = document.querySelector(
          '#app select[aria-label="Story"]',
        ) as HTMLSelectElement | null;
        return select !== null && !select.hidden && select.options.length > 1;
      });
      await page
        .locator("#app")
        .getByRole("combobox", { name: "Story" })
        .selectOption({ index: 1 });
      await until(
        page,
        "the story's timeline",
        () => (document.querySelector("#app .timeline") as HTMLElement | null)?.hidden === false,
      );

      // The SVG export works.
      await showFile(page, "diagrams/executive.meltemi");
      await analysed(page);
      await page.locator(".topbar").getByRole("button", { name: "Export" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.getByLabel("Format").selectOption("svg");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        dialog.getByRole("button", { name: "Export", exact: true }).click(),
      ]);
      assert.match(download.suggestedFilename(), /\.svg$/);
      const svg = await readFile((await download.path()) ?? "", "utf8");
      assert.match(svg, /<svg[\s>]/, "an SVG was exported");
      await page.keyboard.press("Escape");
      await noDialog(page);

      // The room is as it was: the projects' files and revision, read through the owner's call.
      assert.deepEqual(await readRoom(t.me, project.id), before);

      // Of the cloud the page asked what a viewer needs: the project's row, its image and the room;
      // the snapshot of the files is only for a room that does not answer.
      const paths = anon.seen.requests
        .map((address) => new URL(address).pathname)
        .filter((path) => /^\/(api|rooms|p)(\/|$)/.test(path));
      assert.deepEqual(
        [...new Set(paths)].sort(),
        [
          `/api/projects/${project.id}`,
          `/api/projects/${project.id}/blobs/${hash}`,
          "/api/session",
          `/p/${project.id}`,
        ].sort(),
      );
      assert.equal(anon.seen.sockets.length, 1, "one socket to the room");
      const socket = new URL(anon.seen.sockets[0]!);
      assert.match(socket.searchParams.get("guest") ?? "", /^[0-9a-f]{32}$/, "as a guest");
      assert.match(socket.searchParams.get("name") ?? "", /^Guest \d{2}$/);

      // Nothing is kept in the browser: no copy in IndexedDB, and the anonymous project is as it was.
      const databases = await page.evaluate(async () =>
        (await indexedDB.databases()).map((d) => d.name),
      );
      assert.ok(!databases.includes("meltemi-cloud"), JSON.stringify(databases));
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEPT), KEPT_WORK);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), PREVIOUS), null);
      // The sign-in link brings the person back to this very project.
      const signIn = await page.locator(".topbar a.sign-in").getAttribute("href");
      assert.ok(
        decodeURIComponent(signIn ?? "").includes(`?project=${project.id}`),
        `Sign in goes to ${signIn}`,
      );
    },
  },

  {
    name: "viewing: when the room does not answer an anonymous visitor, the page reads a snapshot, says at once that it may be old, and reading it again shows what the owner changed meanwhile",
    signedIn: "u-ana-hint",
    async run(t) {
      const { origin } = t;
      const project = await showcase(t.me, "Hinted");
      await setLinkLevel(t.me, project.id, "view");
      const anon = await t.device({ as: null });
      const { page } = anon;
      // The room never answers this browser: its sockets are held open, unanswered.
      await anon.context.routeWebSocket(/\/rooms\//, () => undefined);
      // The page's clock is the test's: the wait for the room passes in a moment.
      await page.clock.install();
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      for (let i = 0; i < 20 && (await viewing(page)) !== "snapshot"; i++) {
        await page.clock.fastForward(2000);
        await page.waitForTimeout(100);
      }
      await viewingIs(page, "snapshot");
      await statusHas(
        page,
        "Hinted opened from a copy, because the project did not answer in time",
      );
      await page.locator(".view-hint").waitFor({ state: "visible" });
      assert.match(await page.locator(".view-hint").innerText(), /may have changed/);
      await showFile(page, SLIDE);
      await analysed(page);
      assert.equal(
        await page.locator(".view-hint .view-reload").innerText(),
        "Reload to see changes",
      );

      // The owner changes the file; the viewer sees it after reading again, with the same file open.
      const slide = (await readRoom(t.me, project.id)).files[SLIDE] ?? "";
      const changed = `${slide}\n// the owner added this later\n`;
      const pushed = await t.me.api("PUT", `/api/projects/${project.id}/files`, {
        files: { [SLIDE]: changed },
      });
      assert.equal(pushed.status, 200, pushed.text);
      assert.ok(!(await code(page)).includes("the owner added this later"), "not live: a snapshot");
      await page.locator(".view-hint .view-reload").click();
      await until(page, "the snapshot to be read again", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
          "the owner added this later",
        ),
      );
      await expectOpen(page, SLIDE);
      assert.equal(await page.locator(".view-hint").isHidden(), true);
      await statusHas(page, "Reloaded the project.");
      assert.equal(await readOnly(page), true, "still view only");
    },
  },

  {
    name: "viewing: a private link says only that the project was not found, to nobody signed in and to a stranger alike, as it does for a project that does not exist, and the person's own project opens",
    signedIn: "u-ana-private",
    allowedErrors: [NOT_FOUND_LOGGED],
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Private", { template: "flow" });
      const stranger = await t.person("u-bob-private", { name: "Bob" });
      const nothing = "z".repeat(20);

      // The Worker: nothing of it is there for either, and it is the same nothing as for a project that does not exist.
      const gone = await t.ask(`/api/projects/${nothing}`);
      assertError(gone, 404, "project.not-found");
      const hidden = await t.ask(`/api/projects/${project.id}`);
      assert.deepEqual(hidden.json(), gone.json());
      assert.deepEqual(await observe(origin, project.id, undefined), NOTHING);
      assert.deepEqual(await observe(origin, project.id, stranger), NOTHING);

      // Nobody signed in is offered to sign in; a signed-in stranger is told it is not theirs to open
      // (which is what a project of somebody else's and one that is gone both are).
      const withSignIn =
        /^The project was not found\. If it was shared with you, sign in and open the link again\.$/;
      const notYours = /^The project was not found, or it is not yours to open\./;
      const said: Record<string, string> = {};
      for (const [label, who, link, wording] of [
        ["nobody signed in, a private project", null, project.id, withSignIn],
        ["nobody signed in, a project that does not exist", null, nothing, withSignIn],
        ["a stranger, a private project", stranger, project.id, notYours],
        ["a stranger, a project that does not exist", stranger, nothing, notYours],
      ] as const) {
        const device = await t.device({ as: who });
        const { page } = device;
        // The browser's own work is what opens, as it always does.
        await device.context.addInitScript(...seedKept(KEPT_WORK));
        await page.goto(`${origin}/p/${link}`);
        await page.waitForFunction(() => "meltemiPlayground" in window, undefined, {
          timeout: 30_000,
        });
        await statusHas(page, "was not found");
        said[label] = await statusLine(page);
        assert.match(said[label] ?? "", wording, label);
        assert.equal(page.url(), `${origin}/?project=${link}`, `${label}: the address stays`);
        assert.equal(await viewing(page), null, label);
        assert.equal(await page.locator(".view-badge").count(), 0, label);
        assert.equal(await readOnly(page), false, label);
        assert.equal(
          await code(page),
          "my own work, never touched",
          `${label}: the anonymous project`,
        );
        assert.equal(await page.locator(".cloud-status").isHidden(), true, label);
        // It is editable as ever.
        await page.locator(".code-input").click();
        await page.keyboard.press("Control+End");
        await page.keyboard.type("!");
        assert.equal(await code(page), "my own work, never touched!", label);
      }
      // Not a word more for a private project than for one that is not there.
      assert.equal(
        said["nobody signed in, a private project"],
        said["nobody signed in, a project that does not exist"],
      );
      assert.equal(
        said["a stranger, a private project"],
        said["a stranger, a project that does not exist"],
      );
      // What is not a project's address says the same.
      const odd = await t.device({ as: null });
      await odd.page.goto(`${origin}/?project=nonsense`);
      await odd.page.waitForFunction(() => "meltemiPlayground" in window, undefined, {
        timeout: 30_000,
      });
      await statusHas(odd.page, "was not found");
      assert.match(await statusLine(odd.page), withSignIn);
    },
  },
  {
    name: "viewing: Make a copy replaces the anonymous project only after a confirmation, keeps what it replaces as the previous project, and the copy is the browser's own to edit",
    signedIn: "u-ana-copy",
    async run(t) {
      const { origin } = t;
      const project = await showcase(t.me, "Copied");
      await setLinkLevel(t.me, project.id, "view");
      const before = await readRoom(t.me, project.id);

      const anon = await t.device({ as: null });
      const { page } = anon;
      await anon.context.addInitScript(...seedKept(KEPT_WORK));
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      await viewingIs(page, "live");

      // Asked first, since the browser holds work that is not a template; cancelled, nothing changes.
      await page.locator(".view-copy").click();
      const dialog = page.locator("dialog[open]");
      assert.match(await dialog.innerText(), /Replace the project in this browser\?/);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await noDialog(page);
      assert.equal(await viewing(page), "live");
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEPT), KEPT_WORK);

      // Confirmed: view mode ends, the address stops naming the project, and the browser keeps the copy.
      await page.locator(".view-copy").click();
      await dialog.getByRole("button", { name: "Make the copy" }).click();
      await viewingIs(page, null);
      assert.equal(await readOnly(page), false);
      assert.equal(new URL(page.url()).searchParams.get("project"), null);
      assert.equal(await page.locator(".view-actions").isHidden(), true);
      assert.equal(
        await page.locator(".privacy").isVisible(),
        true,
        "the work is in this browser again",
      );
      await statusHas(page, "Made a copy of Copied in this browser.");
      const state = await studioState(page);
      const everything = [...Object.keys(before.files), ...Object.keys(before.binaries)].sort();
      assert.deepEqual(state.paths, everything);
      const kept = JSON.parse(
        (await page.evaluate((key) => localStorage.getItem(key), KEPT)) ?? "null",
      ) as { files: Record<string, string | { base64: string }> };
      assert.deepEqual(
        Object.keys(kept.files).sort(),
        everything,
        "the copy is the browser's project",
      );
      assert.equal(kept.files[SLIDE], before.files[SLIDE]);
      assert.deepEqual(
        kept.files[SHOWCASE_IMAGE],
        { base64: PNG.toString("base64") },
        "the image came with it",
      );
      const previous = JSON.parse(
        (await page.evaluate((key) => localStorage.getItem(key), PREVIOUS)) ?? "null",
      ) as { files: Record<string, string> };
      assert.equal(previous.files["notes.md"], "my own work, never touched");

      // The copy is the person's to edit, and the owner's project does not feel it.
      await typeAtEnd(page, "\n// edited the copy");
      assert.match(await code(page), /\/\/ edited the copy$/);
      await page.waitForTimeout(800);
      assert.deepEqual(await readRoom(t.me, project.id), before);
      // The page followed the room before the copy, and left it with the copy.
      assert.equal(anon.seen.sockets.length, 1);
    },
  },

  {
    name: "viewing: a signed-in person saves a copy to their projects: the copy is theirs, holds the same files, opens for editing and the owner's project is untouched",
    signedIn: "u-ana-save-copy",
    async run(t) {
      const { origin } = t;
      const bob = await t.person("u-bob-save-copy", { name: "Bob" });
      const project = await showcase(t.me, "Original");
      await setLinkLevel(t.me, project.id, "view");
      const before = await readRoom(t.me, project.id);

      const device = await t.device({ as: bob });
      const { page } = device;
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      await connected(page);
      await viewingIs(page, "live");
      assert.equal(await page.locator(".view-save").isVisible(), true);
      assert.deepEqual(await listProjects(bob), [], "nothing in Bob's account yet");

      await page.locator(".view-save").click();
      await viewingIs(page, null);
      await connected(page);
      assert.equal(await readOnly(page), false);
      await statusHas(page, "Saved a copy of Original (copy) to your projects and opened it.");
      const copies = await listProjects(bob);
      assert.equal(copies.length, 1);
      const copy = copies[0]!;
      assert.equal(copy.name, "Original (copy)");
      assert.equal(copy.role, "owner");
      assert.equal(new URL(page.url()).searchParams.get("project"), copy.id);
      const copied = await readRoom(bob, copy.id);
      assert.deepEqual(copied.files, before.files);
      assert.deepEqual(copied.binaries, before.binaries);

      // Edits go to the copy; the original is as it was, and Bob is still only a viewer of it.
      await typeAtEnd(page, "\n// bob's own line");
      await roomHolds(bob, copy.id, "the edit in the copy", (read) =>
        Object.values(read.files).some((text) => text.endsWith("// bob's own line")),
      );
      assert.deepEqual(await readRoom(t.me, project.id), before);
      assert.equal((await bob.api("GET", `/api/projects/${project.id}`)).json()["role"], "viewer");
    },
  },

  {
    name: "viewing: an edit link opened signed in is the normal page whose edits the owner sees at once, opened by nobody signed in it only views, and a push without an account is refused with 401",
    signedIn: "u-ana-edit-link",
    // Two editors have the project open: both send its picture, and the Worker takes one in thirty seconds.
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin, page } = t;
      const bob = await t.person("u-bob-edit-link", { name: "Bob" });
      const project = await makeProject(t.me, "Open to edit", { template: "flow" });
      await setLinkLevel(t.me, project.id, "edit");
      // The owner has the project open: Bob's edit is seen here as it is made.
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      await connected(page);
      const file = (await studioState(page)).open;

      assert.deepEqual(await observe(origin, project.id, undefined), {
        ...VIEWER,
        write: 401,
        refusal: "auth.required",
      });
      assert.deepEqual(await observe(origin, project.id, bob), EDITOR);

      // Signed in: the normal page, bound, and what is typed reaches the room and the owner's page.
      const signed = await t.device({ as: bob });
      await signed.page.goto(`${origin}/p/${project.id}`);
      await ready(signed.page);
      await connected(signed.page);
      assert.equal(await viewing(signed.page), null);
      assert.equal(await readOnly(signed.page), false);
      assert.equal(await signed.page.locator(".view-actions").isHidden(), true);
      assert.equal((await studioState(signed.page)).bound, true);
      await typeAtEnd(signed.page, "\n// bob edited through the link");
      await roomHolds(t.me, project.id, "Bob's edit", (read) =>
        (read.files[file] ?? "").endsWith("// bob edited through the link"),
      );
      await textHas(page, file, "// bob edited through the link");

      // Nobody signed in: view mode, following the room as a guest, and no way to write through the page.
      const anon = await t.device({ as: null });
      await anon.page.goto(`${origin}/?project=${project.id}`);
      await ready(anon.page);
      await viewingIs(anon.page, "live");
      assert.equal(anon.page.url(), `${origin}/?project=${project.id}`, "the address stays");
      assert.equal(await readOnly(anon.page), true);
      assert.equal(anon.seen.sockets.length, 1);
      assert.match(new URL(anon.seen.sockets[0]!).search, /guest=[0-9a-f]{32}/);
      assertError(
        await t.ask(`/api/projects/${project.id}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: { [file]: "x" } }),
        }),
        401,
        "auth.required",
      );
      assert.ok(
        (await readRoom(t.me, project.id)).files[file]?.endsWith("// bob edited through the link"),
        "the refused push changed nothing",
      );
    },
  },
  {
    name: "viewing: a signed-in viewer, by membership or by the link, follows the room live and cannot write: the page changes nothing, and a socket that sends an update is closed with 4403, whatever role it claims",
    signedIn: "u-ana-live",
    async run(t) {
      const { origin, page } = t;
      const bea = await t.person("u-bea-live", { name: "Bea" });
      const cy = await t.person("u-cy-live", { name: "Cy" });
      const project = await showcase(t.me, "Live");
      await addMember(t.me, project.id, bea, "viewer");
      // The owner has the project open, and types.
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      await connected(page);
      const file = (await studioState(page)).open;

      // Bea, a viewer by name on a private project: live, read only, nothing of hers kept.
      const device = await t.device({ as: bea });
      const viewer = device.page;
      await viewer.goto(`${origin}/p/${project.id}`);
      await ready(viewer);
      await connected(viewer);
      await viewingIs(viewer, "live");
      assert.equal(await readOnly(viewer), true);
      assert.equal(await viewer.locator(".view-badge").innerText(), "View only");
      assert.equal(await viewer.locator(".view-save").isVisible(), true);
      assert.equal(
        await viewer.locator(".versions-button").isHidden(),
        true,
        "no versions for a viewer",
      );
      assert.match(await viewer.locator(".cloud-status").innerText(), /^Following live/);
      await statusHas(viewer, "Opened Live to view. Changes by other people appear here");
      const databases = await viewer.evaluate(async () => {
        const open = indexedDB.open("meltemi-cloud");
        return new Promise<[number, number]>((resolve) => {
          open.onerror = () => resolve([-1, -1]);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("docs")) return resolve([0, 0]);
            const tx = db.transaction(["docs", "updates"], "readonly");
            const docs = tx.objectStore("docs").count();
            const updates = tx.objectStore("updates").count();
            tx.oncomplete = () => resolve([docs.result, updates.result]);
          };
        });
      });
      assert.deepEqual(databases, [0, 0], "a viewer keeps no copy in this browser");

      // What the owner types is here as it is made.
      await typeAtEnd(page, "\n// live from the owner");
      await roomHolds(t.me, project.id, "the owner's line", (read) =>
        (read.files[file] ?? "").endsWith("// live from the owner"),
      );
      await textHas(viewer, file, "// live from the owner");
      await until(viewer, "the code pane to show it", () =>
        (document.querySelector(".code-input") as HTMLTextAreaElement).value.endsWith(
          "// live from the owner",
        ),
      );

      // Bea types, and the page refuses: her text is the room's.
      const shown = await code(viewer);
      await viewer.locator(".code-input").click();
      await viewer.keyboard.press("Control+End");
      await viewer.keyboard.type("bea typed this", { delay: 5 });
      assert.equal(await code(viewer), shown);
      // A drag of an element on her canvas changes nothing either: no plan is sent to the room.
      await showFile(viewer, SLIDE);
      await analysed(viewer);
      const slide = await code(viewer);
      const placed = await elementBox(viewer, "browser");
      await dragElement(viewer, "browser", 60, 20);
      await viewer.waitForTimeout(500);
      assert.equal(await code(viewer), slide, "the drag wrote nothing");
      assert.deepEqual(await elementBox(viewer, "browser"), placed);
      const held = await roomHolds(t.me, project.id, "the owner's line", (read) =>
        (read.files[file] ?? "").endsWith("// live from the owner"),
      );
      assert.deepEqual(await observe(origin, project.id, bea), VIEWER);
      // The page of a viewer asked for nothing a viewer may not do: no picture, version or image sent.
      assert.deepEqual(
        device.seen.requests.filter((address) =>
          /\/(thumbnail|versions|binaries)(\/|$)/.test(address),
        ),
        [],
      );

      // A socket that is not the page, with the cookie of Bea and a role it was not given: the hello
      // says what the Worker resolved, and the first update closes the socket with 4403.
      const claimed = await join(origin, project.id, bea, {
        "X-Meltemi-Role": "owner",
        "X-Meltemi-Sub": t.me.sub,
      });
      assert.equal(claimed.role, "viewer", "the hello says what the Worker resolved");
      const text = [...claimed.doc.getMap<Y.Text>("files").values()][0];
      assert.ok(text, "the project is a document");
      claimed.client.send(
        KIND.update,
        changeOf(claimed.doc, () => text.insert(0, "// written by a viewer\n")),
      );
      await claimed.client.until(
        "the socket to be closed",
        () => claimed.client.closed !== undefined,
      );
      assert.equal(claimed.client.closed?.code, 4403);
      assert.deepEqual(claimed.client.json(KIND.error), { code: "access.denied" });
      assert.deepEqual(
        await readRoom(t.me, project.id),
        held,
        "the document and its revision are as they were",
      );
      assert.ok(!(await code(page)).includes("written by a viewer"));
      assert.ok(!(await code(viewer)).includes("written by a viewer"));
      assert.equal(await viewing(viewer), "live", "the page of the viewer was not disturbed");

      // The link opens the project to Cy, who is no member: the same, live and read only.
      await setLinkLevel(t.me, project.id, "view");
      assert.deepEqual(await observe(origin, project.id, cy), VIEWER);
      const other = await t.device({ as: cy });
      await other.page.goto(`${origin}/p/${project.id}`);
      await ready(other.page);
      await connected(other.page);
      await viewingIs(other.page, "live");
      assert.equal(await readOnly(other.page), true);
      await textHas(other.page, file, "// live from the owner");
      const again = await join(origin, project.id, cy);
      assert.equal(again.role, "viewer");
      again.client.send(
        KIND.update,
        changeOf(again.doc, () =>
          [...again.doc.getMap<Y.Text>("files").values()][0]?.insert(0, "x"),
        ),
      );
      await again.client.until("the socket to be closed", () => again.client.closed !== undefined);
      assert.equal(again.client.closed?.code, 4403);
      assert.deepEqual(await readRoom(t.me, project.id), held);
    },
  },

  {
    name: "viewing: access that changes while a page is open reaches the page without anything being cut by hand: a viewer made an editor edits, an editor made a viewer can no longer write, and a person removed loses the project",
    signedIn: "u-ana-roles",
    // A person removed is refused the room when the page reconnects, and asks the Worker whether the project is still there.
    allowedErrors: [NOT_FOUND_LOGGED, /WebSocket connection .* 404/],
    async run(t) {
      const { origin, page } = t;
      const bea = await t.person("u-bea-roles", { name: "Bea" });
      const project = await makeProject(t.me, "Roles", { template: "flow" });
      await addMember(t.me, project.id, bea, "viewer");
      await page.goto(`${origin}/p/${project.id}`);
      await ready(page);
      await connected(page);
      const file = (await studioState(page)).open;

      const device = await t.device({ as: bea });
      const viewer = device.page;
      await viewer.goto(`${origin}/p/${project.id}`);
      await ready(viewer);
      await connected(viewer);
      await viewingIs(viewer, "live");
      assert.equal(await readOnly(viewer), true);

      // Made an editor by the owner: the page leaves view mode, says so, and what she types lands.
      const patch = (role: string) =>
        t.me.api("PATCH", `/api/projects/${project.id}/members/${bea.sub}`, { role });
      assert.equal((await patch("editor")).status, 200);
      await viewingIs(viewer, null);
      await statusHas(viewer, "Your access changed: you can edit this project now.");
      assert.equal(await readOnly(viewer), false);
      await connected(viewer);
      await typeAtEnd(viewer, "\n// bea as an editor");
      await roomHolds(t.me, project.id, "Bea's line", (read) =>
        (read.files[file] ?? "").endsWith("// bea as an editor"),
      );

      // Made a viewer again: the page goes read only, and what she types next does not land.
      assert.equal((await patch("viewer")).status, 200);
      await viewingIs(viewer, "live");
      await statusHas(viewer, "Your access changed: you can view this project but not change it.");
      assert.equal(await readOnly(viewer), true);
      const held = await readRoom(t.me, project.id);
      await viewer.locator(".code-input").click();
      await viewer.keyboard.press("Control+End");
      await viewer.keyboard.type("refused", { delay: 5 });
      await viewer.waitForTimeout(800);
      assert.deepEqual(await readRoom(t.me, project.id), held);

      // Removed: the project is no longer hers, and the room does not take her writes any more.
      assert.equal(
        (await t.me.api("DELETE", `/api/projects/${project.id}/members/${bea.sub}`)).status,
        204,
      );
      await until(
        viewer,
        "the page to say the project is gone",
        () =>
          document.querySelector(".cloud-status")?.getAttribute("data-state") === "gone" ||
          (document.querySelector(".status-text")?.textContent ?? "").includes(
            "no longer available",
          ),
      );
      assert.deepEqual(await observe(origin, project.id, bea), NOTHING);
    },
  },

  {
    name: "viewing: a viewer's explorer lists the project and opens its files, but offers nothing that changes them: no row menus, no buttons in its bar, no rename of the project, no context menu, and its header says view only or how the page follows the room",
    signedIn: "u-ana-explorer-view",
    async run(t) {
      const { origin } = t;
      const bea = await t.person("u-bea-explorer-view", { name: "Bea" });
      const project = await makeProject(t.me, "Looked at", { template: "purchase" });
      await setLinkLevel(t.me, project.id, "view");
      await addMember(t.me, project.id, bea, "viewer");
      const before = await readRoom(t.me, project.id);
      const diagrams = Object.keys(before.files).filter((path) => path.endsWith(".meltemi"));
      const model = "models/commerce.meltemi";
      assert.ok(diagrams.includes(model), "the purchase template has its model");

      // Nobody signed in follows the room through the link, as a guest; Bea, a viewer by name, follows
      // it too.
      const anon = await t.device({ as: null });
      await anon.page.goto(`${origin}/p/${project.id}`);
      await ready(anon.page);
      await connected(anon.page);
      await viewingIs(anon.page, "live");
      const member = await t.device({ as: bea });
      await member.page.goto(`${origin}/p/${project.id}`);
      await ready(member.page);
      await connected(member.page);
      await viewingIs(member.page, "live");

      for (const [who, page, where] of [
        ["nobody signed in", anon.page, "Following live"],
        ["Bea", member.page, "Following live"],
      ] as const) {
        assert.equal(await readOnly(page), true, who);
        // The tree lists every diagram of the project, and a file opens from it.
        for (const path of diagrams) {
          await page.locator(`.tree li[data-key="f:${path}"]`).waitFor({ state: "attached" });
        }
        await showFile(page, model);

        // The header names the project and says how it is seen; nothing renames it.
        assert.equal(await page.locator(".switcher-name").innerText(), "Looked at", who);
        await until(
          page,
          `${who}: the header to say how the project is seen`,
          (words) =>
            (document.querySelector(".switcher-where")?.textContent ?? "").startsWith(words),
          where,
        );
        assert.equal(await page.locator(".switcher-rename").isHidden(), true, who);

        // No control that changes the files shows: no row's menu button, no button in the bar.
        const shown = (selector: string) =>
          page
            .locator(selector)
            .evaluateAll(
              (all) => all.filter((element) => element.getClientRects().length > 0).length,
            );
        assert.equal(await shown(".tree .tree-more"), 0, `${who}: no row's menu button`);
        assert.equal(await shown(".explorer-bar button"), 0, `${who}: no button in the bar`);

        // A right click on a row opens no menu, and F2 on it puts no rename box in it.
        await page
          .locator(`.tree li[data-key="f:${model}"] > .tree-row`)
          .click({ button: "right" });
        await page.waitForTimeout(200);
        assert.equal(await page.locator(".pg-menu.context").count(), 0, `${who}: no context menu`);
        await page.keyboard.press("F2");
        assert.equal(await page.locator("input.tree-rename").count(), 0, `${who}: no rename box`);
        assert.deepEqual((await studioState(page)).paths.sort(), Object.keys(before.files).sort());
      }

      // Nothing of it reached the room.
      assert.deepEqual(await readRoom(t.me, project.id), before);
    },
  },
];
