import assert from "node:assert/strict";
import { join } from "node:path";
import { compile } from "@meltemi/diagrams-model";
import { storyTimeline } from "@meltemi/diagrams-motion";
import type { Page } from "playwright-core";

const PATH = "diagrams/workspace.meltemi";
const DIAGRAM = `// The original drawing must stay byte-identical.
diagram d: flow {
  layout manual
  a["Caller"]
  b["Service"]
  a -> b as request
  placement { place a at (80, 100); place b at (360, 100) }
}
`;
const OTHER = `story other for d { scene separate { hold 1s } }
export otherFilm for other { format html }
`;
const SOURCE = `${DIAGRAM}
story tour for d {
  title "Walkthrough"
  scene first { reveal a over 10s }
  scene second { highlight b over 6s }
  scene blank {}
  scene ending {}
}
${OTHER}
export film for tour { format html }
`;

interface Studio {
  load(files: [string, string][], open: string): void;
  setText(path: string, text: string): void;
  host: { text(path: string): string | undefined };
  readonly analysis?: { readonly path: string; readonly text: string };
}

const row = (page: Page) => page.locator(`.tree li[data-key="s:${PATH}#tour"]`);
const timeline = (page: Page) => page.locator("#app .timeline");

async function source(page: Page): Promise<string> {
  return page.evaluate(
    (path) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.host.text(path)!,
    PATH,
  );
}

async function load(page: Page) {
  await page.waitForFunction(() =>
    Boolean(
      (window as unknown as { meltemiPlayground?: { studio?: unknown } }).meltemiPlayground?.studio,
    ),
  );
  await page.evaluate(
    ({ path, text }) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.load([[path, text]], path),
    { path: PATH, text: SOURCE },
  );
  await page.waitForFunction(
    ({ path, text }) => {
      const studio = (window as unknown as { meltemiPlayground: { studio: Studio } })
        .meltemiPlayground.studio;
      return studio.analysis?.path === path && studio.analysis.text === text;
    },
    { path: PATH, text: SOURCE },
  );
  await row(page).locator(".tree-name").click();
  await timeline(page).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll("#app .timeline .scene-row").length === 4,
  );
  await timeline(page).evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => null)),
    );
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

async function waitSource(page: Page, expected: string) {
  await page.waitForFunction(
    ({ path, text }) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.host.text(path) === text,
    { path: PATH, text: expected },
  );
}

async function changed(page: Page, before: string) {
  await page.waitForFunction(
    ({ path, text }) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.host.text(path) !== text,
    { path: PATH, text: before },
  );
  await page.waitForFunction(() => {
    const input = document.querySelector<HTMLInputElement>("#app .timeline .story-title");
    return input !== null && !input.disabled;
  });
}

async function concurrent(page: Page, text: string) {
  await page.evaluate(
    ({ path, text }) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.setText(path, text),
    { path: PATH, text },
  );
  await waitSource(page, text);
}

async function undo(page: Page, spanish = false) {
  await page
    .locator(".topbar")
    .getByRole("button", { name: spanish ? /^Deshacer/ : /^Undo/ })
    .click();
}

function unchangedDrawing(text: string) {
  assert.ok(text.startsWith(DIAGRAM), "The original diagram remains byte-identical.");
  assert.ok(text.includes(OTHER), "The other story and its export remain unchanged.");
}

export function storyWorkspaceTests({ output }: { output: string }) {
  return [
    {
      name: "story workspace: explorer names retain identity and stale story deletion never targets another story",
      async run({ page }: { page: Page }) {
        await load(page);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("F2");
        await page.locator(".tree-rename").fill("Identity and environments");
        await page.locator(".tree-rename").press("Enter");
        await changed(page, SOURCE);
        await row(page).getByText("Identity and environments", { exact: true }).waitFor();
        assert.match(await source(page), /story tour for d/);
        assert.match(await source(page), /title "Identity and environments"/);
        assert.match(await source(page), /export film for tour/);
        unchangedDrawing(await source(page));
        await undo(page);
        await waitSource(page, SOURCE);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("F2");
        await page.locator(".tree-rename").fill("Cancelled name");
        await page.locator(".tree-rename").press("Escape");
        assert.equal(await source(page), SOURCE);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("F2");
        await page.locator(".tree-rename").fill("Stale name");
        const concurrentText = `${SOURCE}// Concurrent update.\n`;
        await concurrent(page, concurrentText);
        if (await page.locator(".tree-rename").count()) {
          await page.locator(".tree-rename").press("Enter");
          assert.equal(await page.locator(".tree-rename").getAttribute("aria-invalid"), "true");
          await page.locator(".tree-rename").press("Escape");
        }
        assert.equal(await source(page), concurrentText);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("Delete");
        let dialog = page.locator("dialog[open]");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await source(page), concurrentText);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("Delete");
        const updated = `${concurrentText}// Confirmation became stale.\n`;
        await concurrent(page, updated);
        dialog = page.locator("dialog[open]");
        if (await dialog.count())
          await dialog.getByRole("button", { name: "Delete", exact: true }).click();
        assert.equal(await source(page), updated);
        await row(page).locator(".tree-name").click();
        await page.keyboard.press("Delete");
        await page
          .locator("dialog[open]")
          .getByRole("button", { name: "Delete", exact: true })
          .click();
        await page.waitForFunction(
          (path) =>
            !(
              window as unknown as { meltemiPlayground: { studio: Studio } }
            ).meltemiPlayground.studio.host
              .text(path)!
              .includes("story tour for d"),
          PATH,
        );
        const deleted = await source(page);
        unchangedDrawing(deleted);
        assert.ok(!deleted.includes("export film for tour"));
        assert.ok(
          !((await page.locator("#app").textContent()) ?? "").includes("There is no story"),
        );
        await undo(page);
        await waitSource(page, updated);
      },
    },
    ...[false, true].map((spanish) => ({
      name: `story workspace: ${spanish ? "Spanish dark" : "English light"} selected scenes, names, overlap and transitions`,
      locale: spanish ? "es-CL" : "en-US",
      dark: spanish,
      async run({ page }: { page: Page }) {
        await load(page);
        const panel = timeline(page);
        const selector = panel.getByLabel(spanish ? "Escena seleccionada" : "Selected scene", {
          exact: true,
        });
        await selector.selectOption("blank");
        assert.equal(await selector.inputValue(), "blank");
        assert.equal(
          await panel
            .locator('.scene-row[data-scene="blank"]')
            .evaluate((element) => element.classList.contains("selected-scene")),
          true,
        );
        assert.equal(
          await panel
            .locator('.scene-row[data-scene="blank"] .scene-label')
            .getAttribute("aria-pressed"),
          "true",
        );
        await selector.selectOption("ending");
        await selector.selectOption("blank");
        assert.equal(
          await selector.inputValue(),
          "blank",
          "Empty scenes sharing one timestamp retain their selected identity.",
        );
        const beforeName = await source(page);
        const sceneName = panel.getByLabel(spanish ? "Nombre de la escena" : "Scene name", {
          exact: true,
        });
        await sceneName.fill(spanish ? "Cierre" : "Closing overview");
        await sceneName.press("Enter");
        await changed(page, beforeName);
        assert.equal(await selector.inputValue(), "blank");
        assert.match(await source(page), /scene blank/);
        assert.ok(
          (await panel
            .locator('.scene-row[data-scene="blank"] .scene-label')
            .textContent())!.includes(spanish ? "Cierre" : "Closing overview"),
        );
        const storyName = panel.getByLabel(spanish ? "Nombre de la historia" : "Story name", {
          exact: true,
        });
        const beforeStoryName = await source(page);
        await storyName.fill(spanish ? "Aislamiento" : "Environment isolation");
        await storyName.press("Enter");
        await changed(page, beforeStoryName);
        await row(page)
          .getByText(spanish ? "Aislamiento" : "Environment isolation", { exact: true })
          .waitFor();
        assert.match(await source(page), /story tour for d/);
        assert.match(await source(page), /export film for tour/);
        await selector.selectOption("second");
        await panel
          .getByLabel(spanish ? "Inicio de la escena" : "Scene timing", { exact: true })
          .selectOption("overlap");
        const overlap = panel.getByLabel(
          spanish ? "Duración del solapamiento (s)" : "Overlap duration (s)",
          { exact: true },
        );
        await overlap.waitFor();
        const beforeOverlap = await source(page);
        await overlap.fill("2");
        await overlap.press("Enter");
        await changed(page, beforeOverlap);
        const definition = compile(await source(page)).document.stories.find(
          (story) => story.id === "tour",
        )!;
        const timed = storyTimeline(definition);
        assert.equal(timed.scenes[1]!.startMs, 8000);
        assert.equal(timed.durationMs, 14000);
        const ruler = await panel.locator(".ruler").boundingBox();
        assert.ok(ruler);
        await page.mouse.click(ruler.x + (ruler.width * 9) / 14, ruler.y + ruler.height / 2);
        await page.waitForFunction(
          () => document.querySelectorAll("#app .timeline .scene-row.active-scene").length === 2,
        );
        assert.equal(
          await panel
            .locator('.scene-row[data-scene="first"]')
            .evaluate((el) => el.classList.contains("active-scene")),
          true,
        );
        assert.equal(
          await panel
            .locator('.scene-row[data-scene="second"]')
            .evaluate((el) => el.classList.contains("active-scene")),
          true,
        );
        await panel
          .getByLabel(spanish ? "Transición" : "Transition", { exact: true })
          .selectOption("fade");
        const transition = panel.getByLabel(
          spanish ? "Duración de la transición (s)" : "Transition duration (s)",
          { exact: true },
        );
        const beforeTransition = await source(page);
        await transition.fill(spanish ? "1,5" : "1.5");
        await transition.press("Enter");
        await changed(page, beforeTransition);
        const changedStory = compile(await source(page)).document.stories.find(
          (story) => story.id === "tour",
        )!;
        assert.equal(changedStory.scenes[1]!.transition?.durationMs, 1500);
        unchangedDrawing(await source(page));
        const resize = panel.getByRole("separator", {
          name: spanish ? "Altura del panel de historias" : "Story panel height",
          exact: true,
        });
        await resize.focus();
        await page.keyboard.press("Home");
        for (let step = 0; step < 5; step++) await page.keyboard.press("Shift+ArrowUp");
        await page.keyboard.press("Control+j");
        await page.waitForFunction(
          () => document.querySelector("#code-pane")?.getAttribute("data-collapsed") === "true",
        );
        await page.locator(".panes").evaluate(async (element) => {
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished.catch(() => null)),
          );
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        for (const name of [
          spanish ? "Agregar a la escena" : "Add to scene",
          spanish ? "Nueva escena después de esta" : "New scene after this one",
        ])
          assert.ok(
            (await panel
              .getByRole("button", { name, exact: true })
              .locator(".label")
              .textContent())!.trim().length > 0,
          );
        assert.equal(
          await panel
            .getByRole("button", {
              name: spanish ? "Eliminar historia" : "Delete story",
              exact: true,
            })
            .count(),
          0,
        );
        await page.screenshot({
          path: join(output, `story-workspace-${spanish ? "es-dark" : "en-light"}.png`),
        });
      },
    })),
    {
      name: "story workspace: lower deletion removes only scenes, rejects stale confirmation and can recreate the last scene",
      async run({ page }: { page: Page }) {
        await load(page);
        const panel = timeline(page);
        const selector = panel.getByLabel("Selected scene", { exact: true });
        await selector.selectOption("blank");
        const before = await source(page);
        const remove = panel.getByRole("button", { name: "Delete scene", exact: true });
        await remove.click();
        let dialog = page.locator("#app .dialog:not([hidden])");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await source(page), before);
        await remove.click();
        const newer = `${before}// Scene confirmation is stale.\n`;
        await concurrent(page, newer);
        dialog = page.locator("#app .dialog:not([hidden])");
        if (await dialog.count())
          await dialog.getByRole("button", { name: "Delete all", exact: true }).click();
        assert.equal(await source(page), newer);
        for (const id of ["blank", "ending", "second", "first"]) {
          await selector.selectOption(id);
          const previous = await source(page);
          await remove.click();
          await page
            .locator("#app .dialog:not([hidden])")
            .getByRole("button", { name: "Delete all", exact: true })
            .click();
          await changed(page, previous);
          assert.ok(!(await source(page)).includes(`scene ${id}`));
          assert.match(await source(page), /story tour for d/);
          unchangedDrawing(await source(page));
        }
        assert.equal(await panel.locator(".scene-row").count(), 0);
        assert.equal(await remove.isDisabled(), true);
        const add = panel.getByRole("button", { name: "New scene after this one", exact: true });
        assert.equal(await add.isEnabled(), true);
        const empty = await source(page);
        await add.click();
        await changed(page, empty);
        assert.equal(await panel.locator(".scene-row").count(), 1);
        assert.equal(await selector.locator("option").count(), 1);
        assert.ok(
          !((await page.locator("#app").textContent()) ?? "").includes("There is no story"),
        );
        await undo(page);
        await waitSource(page, empty);
      },
    },
    {
      name: "story workspace: panel height supports pointer, cancellation, keyboard and persisted narrow layout without source writes",
      async run({ page }: { page: Page }) {
        await load(page);
        const panel = timeline(page);
        const separator = panel.getByRole("separator", { name: "Story panel height", exact: true });
        const initial = (await panel.boundingBox())!.height;
        let edge = (await separator.boundingBox())!;
        const drag = async (pixels: number, cancel = false) => {
          edge = (await separator.boundingBox())!;
          await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
          await page.mouse.down();
          await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2 - pixels, {
            steps: 8,
          });
          if (cancel) await page.keyboard.press("Escape");
          await page.mouse.up();
        };
        await drag(50, true);
        assert.ok(Math.abs((await panel.boundingBox())!.height - initial) <= 1);
        await drag(80);
        const enlarged = (await panel.boundingBox())!.height;
        assert.ok(enlarged >= initial + 70);
        await separator.focus();
        await page.keyboard.press("Shift+ArrowUp");
        await page.keyboard.press("ArrowDown");
        const preferred = (await panel.boundingBox())!.height;
        assert.ok(Math.abs(preferred - enlarged - 30) <= 1);
        assert.equal(await source(page), SOURCE);
        await page.reload();
        await load(page);
        assert.ok(
          Math.abs((await panel.boundingBox())!.height - preferred) <= 1,
          "The panel height survives reload.",
        );
        const selector = panel.getByLabel("Selected scene", { exact: true });
        await selector.selectOption("ending");
        assert.equal(
          await panel
            .locator(".tracks")
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
          true,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("tab", { name: "Canvas", exact: true }).click();
        await panel.evaluate(async (element) => {
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished.catch(() => null)),
          );
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        await separator.focus();
        await page.keyboard.press("End");
        const overflow = await panel.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            outside: [...element.querySelectorAll<HTMLElement>("*")]
              .map((child) => ({
                tag: child.tagName,
                className: child.className,
                left: child.getBoundingClientRect().left - bounds.left,
                right: child.getBoundingClientRect().right - bounds.left,
                width: child.getBoundingClientRect().width,
              }))
              .filter((child) => child.right > bounds.width + 1)
              .slice(0, 12),
          };
        });
        assert.equal(
          overflow.scrollWidth <= overflow.clientWidth + 1,
          true,
          JSON.stringify(overflow),
        );
        const trackOverflow = await panel.locator(".tracks").evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            outside: [...element.querySelectorAll<HTMLElement>("*")]
              .map((child) => ({
                tag: child.tagName,
                className: child.className,
                right: child.getBoundingClientRect().right - bounds.left,
                width: child.getBoundingClientRect().width,
              }))
              .filter((child) => child.right > bounds.width + 1)
              .slice(0, 12),
          };
        });
        assert.equal(
          trackOverflow.scrollWidth <= trackOverflow.clientWidth + 1,
          true,
          JSON.stringify(trackOverflow),
        );
        assert.equal(await selector.inputValue(), "ending");
        assert.equal(await source(page), SOURCE);
        await page.screenshot({ path: join(output, "story-workspace-narrow.png") });
      },
    },
  ];
}
