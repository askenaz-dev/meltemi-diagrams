import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { playerFragment, playerPage, type StoryPlayerDocument } from "../../src/index.js";

const clean = { heading: false, description: false, summary: false, details: false };

export function playerPresentationTests({
  document: playerDocument,
  script,
  output,
}: {
  document: StoryPlayerDocument;
  script: string;
  output: string;
}) {
  return [
    {
      name: "player presentation: clean output omits extras while zoom and playback stay available",
      html: playerPage(playerDocument, script, clean),
      async run(page: Page) {
        assert.equal(await page.locator("h1, .summary, .details, .card, .trail").count(), 0);
        await page.getByRole("button", { name: "Zoom in", exact: true }).click();
        assert.equal(
          await page.getByRole("button", { name: "Full screen", exact: true }).isVisible(),
          true,
        );
        assert.equal(
          await page.evaluate(() =>
            (
              document.querySelector("meltemi-player") as HTMLElement & {
                player: { showDetails(id: string): boolean };
              }
            ).player.showDetails("api"),
          ),
          false,
        );
        assert.equal(await page.locator(".details").count(), 0);
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await page.evaluate(() =>
          (
            document.querySelector("meltemi-player") as HTMLElement & {
              player: { seek(ms: number): void };
            }
          ).player.seek(1200),
        );
        await page.getByRole("button", { name: "Fit the drawing", exact: true }).click();
        await page.screenshot({ path: join(output, "player-clean.png") });
      },
    },
    {
      name: "player presentation: omitted controls retain keyboard playback and fullscreen without extra panels",
      html: playerPage(playerDocument, script, { ...clean, controls: false }),
      async run(page: Page) {
        assert.equal(await page.locator(".controls").isVisible(), false);
        assert.equal(await page.locator(".fullscreen").isVisible(), true);
        assert.equal(await page.locator(".summary, .details, .card").count(), 0);
        await page.locator(".frame").focus();
        await page.keyboard.press("Space");
        await page.waitForFunction(
          () =>
            (
              document.querySelector("meltemi-player") as HTMLElement & {
                player: { controller: { playing: boolean } };
              }
            ).player.controller.playing,
        );
        await page.locator(".fullscreen").click();
        await page.waitForFunction(
          () => document.fullscreenElement === document.querySelector("meltemi-player"),
        );
        assert.equal(await page.locator(".controls").isVisible(), false);
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.fullscreenElement === null);
      },
    },
    {
      name: "player presentation: fullscreen hides optional reading surfaces and restores them on exit",
      html: playerPage(playerDocument, script),
      async run(page: Page) {
        await page.evaluate(() =>
          (
            document.querySelector("meltemi-player") as HTMLElement & {
              player: { seek(ms: number): void };
            }
          ).player.seek(1200),
        );
        await page.getByText("Text summary", { exact: true }).click();
        assert.equal(
          await page.evaluate(() =>
            (
              document.querySelector("meltemi-player") as HTMLElement & {
                player: { showDetails(id: string): boolean };
              }
            ).player.showDetails("api"),
          ),
          true,
        );
        assert.equal(await page.locator(".summary").isVisible(), true);
        assert.equal(await page.locator(".details").isVisible(), true);
        const button = page.locator(".fullscreen");
        await button.click();
        await page.waitForFunction(
          () => document.fullscreenElement === document.querySelector("meltemi-player"),
        );
        assert.equal(await page.locator(".summary").isVisible(), false);
        assert.equal(await page.locator(".details").isVisible(), false);
        assert.equal(await page.locator(".trail").isVisible(), false);
        assert.equal(await page.locator(".controls").isVisible(), true);
        await page.screenshot({ path: join(output, "player-fullscreen-rich.png") });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.fullscreenElement === null);
        assert.equal(await page.locator(".summary").isVisible(), true);
        assert.equal(await page.locator(".details").isVisible(), true);
      },
    },
    ...[false, true].map((spanish) => ({
      name: `player presentation: ${spanish ? "Spanish narrow reduced-motion" : "English"} fullscreen enters, exits and isolates players`,
      html:
        playerFragment(playerDocument, script, { ...clean, lang: spanish ? "es" : "en" }) +
        playerFragment(playerDocument, script, { ...clean, lang: spanish ? "es" : "en" }),
      touch: spanish,
      reducedMotion: spanish,
      async run(page: Page) {
        const players = page.locator("meltemi-player");
        await page.evaluate(() =>
          (
            document.querySelector("meltemi-player") as HTMLElement & {
              player: { seek(ms: number): void };
            }
          ).player.seek(1200),
        );
        const button = players.nth(0).locator(".fullscreen");
        assert.equal(
          await button.getAttribute("aria-label"),
          spanish ? "Pantalla completa" : "Full screen",
        );
        await button.click();
        await page.waitForFunction(
          () => document.fullscreenElement === document.querySelectorAll("meltemi-player")[0],
        );
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        assert.equal(
          await players.nth(1).locator(".fullscreen").getAttribute("aria-pressed"),
          "false",
        );
        const bounds = await players.nth(0).boundingBox();
        const viewport = page.viewportSize()!;
        assert.ok(
          bounds &&
            bounds.x === 0 &&
            bounds.y === 0 &&
            Math.abs(bounds.width - viewport.width) <= 1 &&
            Math.abs(bounds.height - viewport.height) <= 1,
        );
        assert.equal(await players.nth(0).locator(".controls").isVisible(), true);
        await page.screenshot({
          path: join(output, `player-fullscreen-${spanish ? "es" : "en"}.png`),
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.fullscreenElement === null);
        await page.waitForFunction(
          (element) => element?.getAttribute("aria-pressed") === "false",
          await button.elementHandle(),
        );
        assert.equal(await button.getAttribute("aria-pressed"), "false");
        assert.equal(
          await button.evaluate(
            (element) =>
              element.getRootNode() instanceof ShadowRoot &&
              (element.getRootNode() as ShadowRoot).activeElement === element,
          ),
          true,
        );
        const other = players.nth(1).locator(".fullscreen");
        await other.click();
        await page.waitForFunction(
          () => document.fullscreenElement === document.querySelectorAll("meltemi-player")[1],
        );
        assert.equal(await button.getAttribute("aria-pressed"), "false");
        await other.click();
        await page.waitForFunction(() => document.fullscreenElement === null);
        await page.waitForFunction(
          (element) => element?.getAttribute("aria-pressed") === "false",
          await other.elementHandle(),
        );
        assert.equal(await other.getAttribute("aria-pressed"), "false");
      },
    })),
    {
      name: "player presentation: fullscreen refusal leaves a working player and announces the reason",
      html:
        `<script>HTMLElement.prototype.requestFullscreen = function () { return Promise.reject(new Error("Denied")); };</script>` +
        playerFragment(playerDocument, script, clean),
      async run(page: Page) {
        await page.locator(".fullscreen").click();
        await page.waitForFunction(() =>
          document
            .querySelector("meltemi-player")!
            .shadowRoot!.querySelector('[role="status"]')!
            .textContent!.includes("not available"),
        );
        assert.equal(await page.evaluate(() => document.fullscreenElement), null);
        assert.equal(await page.locator(".fullscreen").isEnabled(), true);
        assert.equal(await page.locator(".fullscreen").getAttribute("aria-pressed"), "false");
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
      },
    },
    {
      name: "player presentation: unavailable fullscreen is disabled with an explanation",
      html:
        `<script>Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: undefined, configurable: true });</script>` +
        playerFragment(playerDocument, script, clean),
      async run(page: Page) {
        const button = page.locator(".fullscreen");
        assert.equal(await button.isDisabled(), true);
        assert.match((await button.getAttribute("title"))!, /not available/);
        assert.equal(
          await page.getByRole("button", { name: "Play", exact: true }).isEnabled(),
          true,
        );
      },
    },
  ];
}
