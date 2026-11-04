/**
 * Live sessions and anonymous visitors (`live-sessions`), through the real Worker, D1, R2 and room:
 * an anonymous browser on a `view` link follows the owner live and is listed as a guest; the owner
 * starts a live session from the share dialog, an anonymous guest edits the owner's file and drags
 * on the canvas, the owner sees the guest's pointer, "Guests can edit" turned off re-roles the guest
 * and "End session" cuts them with the right words; a guest's stroke of the pen grows on the
 * owner's canvas as it is drawn and gives way to the pen its release writes (`whiteboard-tools`);
 * the anonymous project's `#p=` dialog says a session needs an account; and a visitor in the room
 * keeps the room's traffic bounded.
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
  studioState,
  textHas,
  textOf,
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

/** The diagram of the whiteboard template. */
const WHITEBOARD = "diagrams/whiteboard.meltemi";

/**
 * Starts the owner's live session from the share dialog, closes it again and gives its link.
 */
async function startLive(page: Page): Promise<string> {
  const section = liveSection(await openShare(page));
  await section.getByRole("button", { name: "Start a live session" }).click();
  await until(
    page,
    "the session's link",
    () => (document.querySelector(".share-live-link") as HTMLInputElement | null)?.value !== "",
  );
  const link = await section.locator(".share-live-link").inputValue();
  await page.keyboard.press("Escape");
  return link;
}

/** An awareness message a page sent to its project's room: when Node heard of it, and its size. */
interface Sent {
  readonly at: number;
  readonly bytes: number;
}

/**
 * Records the awareness messages (kind 2) the page sends to the room of `project` from now on, as
 * its socket carries them: listen before the page opens the project.
 */
function awarenessSent(page: Page, project: string): Sent[] {
  const sent: Sent[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes(`/rooms/${project}`)) return;
    socket.on("framesent", (frame) => {
      const payload = frame.payload;
      if (typeof payload !== "string" && payload[0] === 2) {
        sent.push({ at: Date.now(), bytes: payload.length });
      }
    });
  });
  return sent;
}

/**
 * What the presence layer's canvas holds: how many pixels show anything, and how many of them are
 * of the colour `[r, g, b]` (opaque enough to tell it, within a rounding of the edges).
 */
function presencePixels(
  page: Page,
  colour: readonly [number, number, number],
): Promise<{ any: number; matching: number }> {
  return page.locator("#app .presence-trails").evaluate((canvas: HTMLCanvasElement, [r, g, b]) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let any = 0;
    let matching = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! === 0) continue;
      any++;
      if (
        data[i + 3]! >= 100 &&
        Math.abs(data[i]! - r) <= 16 &&
        Math.abs(data[i + 1]! - g) <= 16 &&
        Math.abs(data[i + 2]! - b) <= 16
      ) {
        matching++;
      }
    }
    return { any, matching };
  }, colour);
}

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
      // The guest presses K and draws on their canvas: the owner's presence canvas draws a trail
      // within half a second, in the same messages as the pointer's, so the room hears no more
      // than the states it already takes.
      const statsBefore = await roomStats(t.me, project.id);
      await guest.locator("#app .stage").focus();
      await guest.keyboard.press("k");
      await guest.mouse.move(stage.x + 120, stage.y + 120);
      await guest.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await guest.mouse.move(stage.x + 120 + i * 10, stage.y + 120 + i * 4);
        await guest.waitForTimeout(40);
      }
      await ana.waitForFunction(
        () => {
          const canvas = document.querySelector<HTMLCanvasElement>("#app .presence-trails");
          const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
          return data !== undefined && data.data.some((value, i) => i % 4 === 3 && value > 0);
        },
        undefined,
        { timeout: 2_000 },
      );
      await shot(ana, "live-owner-trail");
      await guest.mouse.up();
      await guest.keyboard.press("k");
      const statsAfter = await roomStats(t.me, project.id);
      assert.ok(
        statsAfter.messages - statsBefore.messages <= 10,
        `${statsAfter.messages - statsBefore.messages} messages for one stroke`,
      );
      assert.equal(statsAfter.awarenessDropped, statsBefore.awarenessDropped);
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
    name: "live: a guest's pen stroke grows on the owner's canvas as it is drawn, in the guest's pen colour, and gives way to the guest's pen statement within a second of the release, the room hearing no more than the throttle allows",
    signedIn: "u-ana-live-stroke",
    allowedErrors: [THUMBNAIL_RATE_LOGGED],
    async run(t) {
      const { origin } = t;
      const project = await makeProject(t.me, "Whiteboard", { template: "whiteboard" });
      const ana = t.page;
      const anaSent = awarenessSent(ana, project.id);
      await openByLink(ana, origin, project.id);
      const link = await startLive(ana);

      // An anonymous guest joins on the link; both have the whiteboard open.
      const anon = await t.device({ as: null });
      const guest = anon.page;
      const guestSent = awarenessSent(guest, project.id);
      await guest.goto(link);
      await joined(guest, "the guest joined");
      await listsGuest(ana, await guestName(guest), "Ana sees the guest");
      assert.equal((await studioState(ana)).open, WHITEBOARD);
      assert.equal((await studioState(guest)).open, WHITEBOARD);

      // The guest arms the pen: the colour its button shows is the one the owner will see.
      await guest.locator("#app .stage").focus();
      await guest.keyboard.press("p");
      assert.equal(
        await guest
          .locator('#app .toolbar [data-split="pen"] > button.pen-button')
          .getAttribute("aria-pressed"),
        "true",
      );
      const swatch = await guest
        .locator("#app .toolbar .pen-swatch")
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      const channels = /^rgba?\((\d+), (\d+), (\d+)/.exec(swatch);
      assert.ok(channels, swatch);
      const colour = [Number(channels[1]), Number(channels[2]), Number(channels[3])] as const;
      assert.deepEqual(await presencePixels(ana, colour), { any: 0, matching: 0 });

      // The pointer rests over the canvas until its state has gone out and the window is over.
      const stage = (await guest.locator("#app .stage").boundingBox())!;
      const from = { x: stage.x + stage.width * 0.3, y: stage.y + stage.height * 0.55 };
      await guest.mouse.move(from.x, from.y);
      await guest.waitForTimeout(400);
      const statsBefore = await roomStats(t.me, project.id);
      const measuredFrom = Date.now();
      // The owner's canvas is watched from the press for the first ink of the guest's colour.
      const firstInk = ana
        .waitForFunction(
          ([r, g, b]) => {
            const canvas = document.querySelector<HTMLCanvasElement>("#app .presence-trails");
            const data = canvas
              ?.getContext("2d")
              ?.getImageData(0, 0, canvas.width, canvas.height).data;
            if (!data) return false;
            for (let i = 0; i < data.length; i += 4) {
              if (
                data[i + 3]! >= 100 &&
                Math.abs(data[i]! - r) <= 16 &&
                Math.abs(data[i + 1]! - g) <= 16 &&
                Math.abs(data[i + 2]! - b) <= 16
              ) {
                return true;
              }
            }
            return false;
          },
          colour,
          { polling: 20, timeout: 10_000 },
        )
        .then(
          () => Date.now(),
          () => Number.POSITIVE_INFINITY,
        );
      const pressed = Date.now();
      await guest.mouse.down();
      // A wave drawn over about a second; the owner's pixels of it are counted twice on the way.
      const grown: number[] = [];
      for (let i = 1; i <= 24; i++) {
        await guest.mouse.move(from.x + i * 12, from.y + Math.sin(i / 3) * 24);
        await guest.waitForTimeout(40);
        if (i === 10 || i === 22) grown.push((await presencePixels(ana, colour)).matching);
        if (i === 22) await shot(ana, "live-owner-stroke");
      }
      const seen = await firstInk;
      assert.ok(
        seen - pressed <= 500,
        `the owner saw the guest's stroke ${seen - pressed} ms after the press`,
      );
      assert.ok(
        grown[0]! > 0 && grown[1]! > grown[0]!,
        `the stroke grows on the owner's canvas: ${grown.join(" then ")} pixels of its colour`,
      );

      // The release writes the guest's pen: within a second the owner's file holds it, and the
      // stroke drawn in presence has given way to it.
      const released = Date.now();
      await guest.mouse.up();
      const written = await ana
        .waitForFunction(
          (file) =>
            /\n {2}pen pen1 \[/.test(
              (
                window as unknown as {
                  meltemiPlayground: { studio: { text(path: string): string | undefined } };
                }
              ).meltemiPlayground.studio.text(file) ?? "",
            ),
          WHITEBOARD,
          { polling: 20, timeout: 10_000 },
        )
        .then(() => Date.now());
      const cleared = await ana
        .waitForFunction(
          () => {
            const canvas = document.querySelector<HTMLCanvasElement>("#app .presence-trails");
            const data = canvas
              ?.getContext("2d")
              ?.getImageData(0, 0, canvas.width, canvas.height).data;
            return data !== undefined && data.every((value, i) => i % 4 !== 3 || value === 0);
          },
          undefined,
          { polling: 20, timeout: 10_000 },
        )
        .then(() => Date.now());
      assert.ok(
        written - released <= 1000,
        `the pen reached the owner ${written - released} ms after the release`,
      );
      assert.ok(
        cleared - released <= 1000,
        `the presence stroke went ${cleared - released} ms after the release`,
      );
      const statement = (text: string | undefined): string | undefined =>
        /\n {2}pen pen1 \[[^\]]*\]/.exec(text ?? "")?.[0];
      const owners = statement(await textOf(ana, WHITEBOARD));
      assert.ok(owners, "the owner's file holds pen1");
      assert.equal(owners, statement(await textOf(guest, WHITEBOARD)), "the guest's own statement");
      await guest.keyboard.press("Escape");

      // Awareness: the guest's stroke went out at the pointer's pace, one message per 250 ms at
      // most (`THROTTLE_MS` of the page's presence), none of them large, none dropped by the room.
      await guest.waitForTimeout(300);
      const statsAfter = await roomStats(t.me, project.id);
      const measuredTo = Date.now();
      const between = (sent: readonly Sent[], start: number, end: number): Sent[] =>
        sent.filter((message) => message.at >= start && message.at <= end);
      const drag = between(guestSent, pressed, released + 300);
      assert.ok(
        drag.length >= 2 && drag.length <= Math.floor((released + 300 - pressed) / 250) + 1,
        `${drag.length} awareness messages from the guest in a drag of ${released - pressed} ms`,
      );
      assert.ok(
        guestSent.every((message) => message.bytes <= 16 * 1024),
        `the guest's largest awareness message: ${Math.max(...guestSent.map((m) => m.bytes))} bytes`,
      );
      const fromGuest =
        statsAfter.awareness -
        statsBefore.awareness -
        between(anaSent, measuredFrom, measuredTo).length;
      assert.ok(
        fromGuest <= Math.floor((measuredTo - measuredFrom) / 250) + 1,
        `the room counted ${fromGuest} awareness messages from the guest in ${measuredTo - measuredFrom} ms`,
      );
      assert.equal(statsAfter.awarenessDropped, statsBefore.awarenessDropped);
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
