/**
 * Live sessions and anonymous visitors (`live-sessions`), through the real Worker, D1, R2 and room:
 * an anonymous browser on a `view` link follows the owner live and is listed as a guest; the owner
 * starts a live session from the share dialog, an anonymous guest edits the owner's file and drags
 * on the canvas, the owner sees the guest's pointer, "Guests can edit" turned off re-roles the guest
 * and "End session" cuts them with the right words; the anonymous project's `#p=` dialog says a
 * session needs an account; and a visitor in the room keeps the room's traffic bounded.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { OVERVIEW } from "./collaboration.js";
import {
  THUMBNAIL_RATE_LOGGED,
  connected,
  dragElement,
  makeProject,
  openByLink,
  roomStats,
  statusLine,
  textHas,
  typeAtEnd,
} from "./cloud.js";
import type { Scenario } from "./scenario.js";
import { openShare, setLinkLevel, statusHas, viewingIs } from "./sharing.js";
import { analysed, until } from "./support.js";

/** Waits until the anonymous page is in its project's room, its files drawn and its connection up. */
async function joined(page: Page, label: string): Promise<void> {
  await page.waitForFunction(
    () => "meltemiPlayground" in window && document.querySelector("#app .content svg") !== null,
    undefined,
    { timeout: 30_000 },
  );
  await connected(page, label);
  await analysed(page);
}

/** The name the guest bar says the others see. */
const guestName = (page: Page): Promise<string> => page.locator(".guest-name-input").inputValue();

/** Waits until the header lists a guest of this name, badged, with no picture. */
async function listsGuest(page: Page, name: string, what: string): Promise<void> {
  await until(
    page,
    `the header to list the guest ${name} (${what})`,
    (wanted) =>
      [...document.querySelectorAll(".presence-person")].some(
        (button) =>
          button.querySelector(".presence-name")?.textContent === wanted &&
          button.querySelector(".presence-guest") !== null &&
          button.querySelector("img") === null,
      ),
    name,
  );
}

/**
 * A picture of the page, for a person to look at the guest bar, the chip, the dialog and the cursor:
 * only when `CLOUD_TEST_SHOTS` is set, in `meltemi-cloud-browser-shots` of the temporary folder.
 */
async function shot(page: Page, name: string): Promise<void> {
  if (!process.env["CLOUD_TEST_SHOTS"]) return;
  const folder = join(tmpdir(), "meltemi-cloud-browser-shots");
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `${name}.png`) });
}

/** The live session's section of an open share dialog. */
const liveSection = (dialog: Locator): Locator => dialog.locator(".share-live");

export const liveScenarios: Scenario[] = [
  {
    name: "live: an anonymous browser on a view link follows the owner's change live, is listed as Guest NN with a badge, keeps nothing in the browser, and a visitor in the room keeps its traffic bounded",
    signedIn: "u-ana-visitor",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Followed", { template: "flow" });
      await setLinkLevel(t.me, project.id, "view");
      const ana = t.page;
      await openByLink(ana, origin, project.id);

      const anon = await t.device({ as: null });
      const visitor = anon.page;
      await visitor.goto(`${origin}/p/${project.id}`);
      await joined(visitor, "the visitor followed the room");
      // View mode, following live; the guest bar names the project and the guest.
      await viewingIs(visitor, "live");
      assert.equal(visitor.url(), `${origin}/?project=${project.id}`);
      await until(
        visitor,
        "the guest bar",
        () => (document.querySelector(".guest-bar") as HTMLElement | null)?.hidden === false,
      );
      assert.match(
        await visitor.locator(".guest-bar-text").innerText(),
        /You are following Followed live as/,
      );
      const name = await guestName(visitor);
      assert.match(name, /^Guest \d{2}$/);
      assert.equal(
        await visitor.locator(".code-input").evaluate((a: HTMLTextAreaElement) => a.readOnly),
        true,
      );
      await statusHas(visitor, "Changes by other people appear here as they are made");
      // Its socket carries the guest's id and name, and no token.
      const socket = anon.seen.sockets.find((address) => address.includes(`/rooms/${project.id}`));
      assert.ok(socket, JSON.stringify(anon.seen.sockets));
      const query = new URL(socket).searchParams;
      assert.match(query.get("guest") ?? "", /^[0-9a-f]{32}$/);
      assert.equal(query.get("name"), name);
      assert.equal(query.get("live"), null);

      // The owner sees the visitor, badged as a guest; the visitor sees the owner's change at once.
      await listsGuest(ana, name, "Ana sees the visitor");
      await shot(visitor, "live-visitor");
      await typeAtEnd(ana, "\n// changed live\n");
      await textHas(visitor, OVERVIEW, "// changed live");

      // Nothing is kept in the visitor's browser.
      const databases = await visitor.evaluate(async () =>
        (await indexedDB.databases()).map((d) => d.name),
      );
      assert.ok(!databases.includes("meltemi-cloud"), JSON.stringify(databases));
      // The visitor reads the project's row and its room; no snapshot of the files.
      const paths = anon.seen.requests.map((address) => new URL(address).pathname);
      assert.ok(!paths.includes(`/api/projects/${project.id}/files`), JSON.stringify(paths));

      // A visitor in the room costs it what any quiet client does: heartbeats.
      await ana.waitForTimeout(1500);
      const before = await roomStats(t.me, project.id);
      await ana.waitForTimeout(10_000);
      const after = await roomStats(t.me, project.id);
      const messages = after.messages - before.messages;
      assert.ok(
        messages <= 6,
        `${messages} messages in ten quiet seconds with a visitor in the room`,
      );
      assert.equal(after.awarenessDropped, before.awarenessDropped);
      assert.equal(after.clients, 2, "the owner and the visitor");
    },
  },
  {
    name: "live: the owner starts a live session from the dialog; an anonymous guest types in the owner's file and drags on the canvas, the owner sees the guest's pointer, Guests can edit turned off re-roles the guest, and End session cuts them with the right words",
    signedIn: "u-ana-live-session",
    // Once the session ended, the guest's page asks what the link gives without the token: the
    // project is private, and the browser notes the 404 that says so.
    allowedErrors: [THUMBNAIL_RATE_LOGGED, /status of 404/],
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Together", { template: "flow" });
      const ana = t.page;
      await openByLink(ana, origin, project.id);

      // The owner starts the session: the section shows the link, the switch on, nobody yet, the end.
      let dialog = await openShare(ana);
      const section = liveSection(dialog);
      await section.getByRole("button", { name: "Start a live session" }).waitFor();
      assert.equal(
        await section.getByRole("switch", { name: "Guests can edit" }).isChecked(),
        true,
      );
      await section.getByRole("button", { name: "Start a live session" }).click();
      await until(
        ana,
        "the session's link",
        () => (document.querySelector(".share-live-link") as HTMLInputElement | null)?.value !== "",
      );
      const link = await section.locator(".share-live-link").inputValue();
      assert.match(link, new RegExp(`^${origin}/p/${project.id}\\?live=[0-9a-f]{32}$`));
      assert.equal(await section.locator(".share-live-guests").innerText(), "0 guests now");
      assert.match(
        await section.locator(".share-live-ends").innerText(),
        /^Ends in 2[34] h \d+ min$/,
      );
      await statusHas(ana, "The live session is on");
      await shot(ana, "live-dialog-on");
      await ana.keyboard.press("Escape");
      // The header says so while it is on.
      await until(
        ana,
        "the Live chip",
        () => (document.querySelector(".live-chip") as HTMLElement | null)?.hidden === false,
      );
      assert.equal(await ana.locator(".live-chip-label").innerText(), "Live · 0 guests");

      // A browser with no account opens the link and edits with the owner.
      const anon = await t.device({ as: null });
      const guest = anon.page;
      await guest.goto(link);
      await joined(guest, "the guest joined");
      assert.equal(
        guest.url(),
        `${origin}/?project=${project.id}&live=${new URL(link).searchParams.get("live")}`,
      );
      assert.match(
        await guest.locator(".guest-bar-text").innerText(),
        /You are in the live session of Together as/,
      );
      assert.match(await guest.locator(".guest-bar-ends").innerText(), /^Ends in/);
      await statusHas(guest, "You joined the live session of Together");
      const name = await guestName(guest);
      await listsGuest(ana, name, "Ana sees the guest");
      await until(
        ana,
        "the chip to count the guest",
        () => document.querySelector(".live-chip-label")?.textContent === "Live · 1 guest",
      );
      await shot(guest, "live-guest-bar");
      await typeAtEnd(guest, "\n// typed by a guest\n");
      await textHas(ana, OVERVIEW, "// typed by a guest");

      // A drag on the guest's canvas lands in the owner's text, as a place of the element.
      const element = await guest
        .locator('#app .content g[data-role="element"]')
        .first()
        .getAttribute("data-id");
      assert.ok(element, "the diagram has an element to drag");
      await dragElement(guest, element, 60, 30);
      await until(
        ana,
        "the drag to reach the owner",
        (id) =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            `place ${id} at (`,
          ),
        element,
      );

      // The guest's pointer over the canvas is a cursor on the owner's, with the guest's name.
      const stage = await guest.locator("#app .stage").boundingBox();
      assert.ok(stage);
      await guest.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
      await guest.mouse.move(stage.x + stage.width / 2 + 20, stage.y + stage.height / 2 + 10);
      await until(
        ana,
        "the guest's cursor on the owner's canvas",
        (wanted) =>
          document.querySelector("#app .presence-cursor .presence-cursor-tag")?.textContent ===
          wanted,
        name,
      );
      await shot(ana, "live-owner-cursor");
      // It goes once the guest's pointer leaves the canvas.
      await guest.mouse.move(2, 2);
      await until(
        ana,
        "the cursor to go when the pointer left",
        () => document.querySelector("#app .presence-cursor") === null,
      );

      // Guests can edit, turned off: the guest reconnects as a viewer, and can no longer type.
      dialog = await openShare(ana);
      // The switch is its label, as for a person: the box itself is only for the keyboard.
      await liveSection(dialog).locator("label.share-live-switch").click();
      assert.equal(
        await liveSection(dialog).getByRole("switch", { name: "Guests can edit" }).isChecked(),
        false,
      );
      await statusHas(ana, "Guests can only watch now");
      await viewingIs(guest, "live");
      await statusHas(guest, "Your access changed: you can view this project but not change it.");
      assert.equal(
        await guest.locator(".code-input").evaluate((a: HTMLTextAreaElement) => a.readOnly),
        true,
      );

      // End session asks first, then cuts the guest: a private project stays read-only on what it holds.
      await liveSection(dialog).getByRole("button", { name: "End session" }).click();
      const sure = ana.getByRole("dialog", { name: "End the live session?" });
      await sure.getByRole("button", { name: "End session", exact: true }).click();
      await statusHas(ana, "The live session ended.");
      await statusHas(guest, "The live session ended. What you see stays here, read-only");
      await viewingIs(guest, "snapshot");
      await shot(guest, "live-guest-ended");
      assert.equal(await guest.locator(".view-copy").isVisible(), true, "Make a copy");
      assert.equal(guest.url(), `${origin}/?project=${project.id}`, "the token left the address");
      assert.ok(
        (await guest.locator(".code-input").inputValue()).includes("// typed by a guest"),
        "the guest keeps what it shows",
      );
      await until(
        ana,
        "the chip to go",
        () => (document.querySelector(".live-chip") as HTMLElement | null)?.hidden !== false,
      );
      assert.ok((await statusLine(ana)).length > 0);
    },
  },
  {
    name: "live: the anonymous project's #p= dialog says a live session needs the project in an account, and offers to save it there",
    signedIn: "u-ana-local-live",
    async run(t) {
      const page = t.page;
      await t.open("/");
      await page.locator(".topbar").getByRole("button", { name: "Share" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.waitFor();
      assert.match(
        await dialog.locator(".share-live-note").innerText(),
        /A live session, where others edit with you as you type, needs the project in an account\./,
      );
      await dialog.getByRole("button", { name: "Save to my projects" }).click();
      await page.locator(".switcher-panel").waitFor();
      assert.equal(await page.locator("dialog[open]").count(), 0);
    },
  },
];
