import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";

interface Studio {
  load(files: [string, string][], open: string): void;
  host: { text(path: string): string | undefined };
  analysis?: {
    text: string;
    document?: { compilation: { document: { stories: { durationMs: number }[] } } };
  };
}

const PATH = "diagrams/reorder.meltemi";
const SOURCE = `// The diagram and all action comments must survive.
diagram d: flow { a -> b }
story tour for d {
  scene first {
    // Frame the caller.
    camera a over 250ms
    hold 750ms
    // Emphasize the receiver.
    highlight b over 1s
    parallel {
      focus a over 400ms
      camera all over 600ms
    }
  }
}
`;

async function source(page: Page): Promise<string> {
  return page.evaluate(
    (path) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.host.text(path)!,
    PATH,
  );
}

async function analysedSource(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    (text) =>
      (window as unknown as { meltemiPlayground: { studio: Studio } }).meltemiPlayground.studio
        .analysis?.text === text,
    expected,
  );
}

async function load(page: Page) {
  await page.evaluate(
    ({ path, text }) =>
      (
        window as unknown as { meltemiPlayground: { studio: Studio } }
      ).meltemiPlayground.studio.load([[path, text]], path),
    { path: PATH, text: SOURCE },
  );
  await page.locator(`.tree li[data-key="s:${PATH}#tour"] .tree-name`).click();
  await page.locator("#app .timeline").waitFor();
}

async function duration(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { meltemiPlayground: { studio: Studio } }).meltemiPlayground.studio
        .analysis!.document!.compilation.document.stories[0]!.durationMs,
  );
}

export function storyReorderTests({ output }: { output: string }) {
  return [false, true].flatMap((spanish) => [
    {
      name: `story clip reorder: ${spanish ? "Spanish" : "English"} body drag, selected duration and exact host undo`,
      locale: spanish ? "es-CL" : "en-US",
      async run({ page }: { page: Page }) {
        await load(page);
        assert.equal(await duration(page), 2600);
        const moving = await page.locator('.timeline .bar[data-path="0.2"]').boundingBox();
        const first = await page.locator('.timeline .bar[data-path="0.0"]').boundingBox();
        assert.ok(moving && first);
        await page.mouse.move(moving.x + moving.width / 2, moving.y + moving.height / 2);
        await page.mouse.down();
        await page.mouse.move(first.x + 2, moving.y + moving.height / 2, { steps: 12 });
        assert.equal(await source(page), SOURCE, "A drag preview must not write source.");
        await page.screenshot({
          path: join(output, `story-reorder-${spanish ? "es" : "en"}-drag.png`),
        });
        await page.mouse.up();
        await page.waitForFunction((path) => {
          const text = (
            window as unknown as { meltemiPlayground: { studio: Studio } }
          ).meltemiPlayground.studio.host.text(path)!;
          return text.indexOf("highlight b") < text.indexOf("camera a");
        }, PATH);
        const reordered = await source(page);
        await analysedSource(page, reordered);
        assert.equal(await duration(page), 2600);
        assert.ok(reordered.includes("// Emphasize the receiver.\n    highlight b over 1s"));
        const selected = page.locator('.timeline .bar.selected[data-path="0.0"]');
        await selected.waitFor();
        assert.match((await selected.getAttribute("aria-label"))!, /^highlight b,/);
        const timing = page.getByLabel(
          spanish ? "Duración de la acción seleccionada (s)" : "Selected action duration (s)",
          { exact: true },
        );
        assert.equal(await timing.inputValue(), "1");
        await page.screenshot({
          path: join(output, `story-reorder-${spanish ? "es" : "en"}-moved.png`),
        });
        await timing.fill(spanish ? "1,25" : "1.25");
        await timing.press("Enter");
        await page.waitForFunction(
          (path) =>
            (
              window as unknown as { meltemiPlayground: { studio: Studio } }
            ).meltemiPlayground.studio.host
              .text(path)!
              .includes("highlight b over 1250ms"),
          PATH,
        );
        const undo = () =>
          page.getByRole("button", { name: spanish ? /^Deshacer/ : /^Undo/ }).click();
        await undo();
        await analysedSource(page, reordered);
        assert.equal(await source(page), reordered);
        await undo();
        await analysedSource(page, SOURCE);
        assert.equal(await source(page), SOURCE);
        await page.screenshot({ path: join(output, `story-reorder-${spanish ? "es" : "en"}.png`) });
      },
    },
    {
      name: `story clip reorder: ${spanish ? "Spanish" : "English"} parallel unit and keyboard buttons`,
      locale: spanish ? "es-CL" : "en-US",
      async run({ page }: { page: Page }) {
        await load(page);
        const group = page.locator('.timeline .bar[data-path="0.3"]');
        assert.match(
          (await group.getAttribute("aria-label"))!,
          spanish ? /En paralelo/ : /In parallel/,
        );
        await group.click();
        await page
          .getByRole("button", { name: spanish ? "Mover antes" : "Move earlier", exact: true })
          .click();
        await page.waitForFunction((path) => {
          const text = (
            window as unknown as { meltemiPlayground: { studio: Studio } }
          ).meltemiPlayground.studio.host.text(path)!;
          return text.indexOf("parallel {") < text.indexOf("highlight b");
        }, PATH);
        const moved = await source(page);
        await analysedSource(page, moved);
        assert.equal(await duration(page), 2600);
        assert.ok(
          moved.includes(
            "parallel {\n      focus a over 400ms\n      camera all over 600ms\n    }",
          ),
        );
        const selected = page.locator('.timeline .bar.selected[data-path="0.2"]');
        await selected.waitFor();
        await selected.focus();
        await page.keyboard.press("Alt+ArrowRight");
        await analysedSource(page, SOURCE);
        assert.equal(await source(page), SOURCE);
        assert.equal(await duration(page), 2600);
        // A simultaneous child's body never extracts it or moves its parent implicitly.
        const child = page.locator('.timeline .bar[data-path="0.3.0"]');
        await child.click();
        assert.equal(
          await page
            .getByRole("button", { name: spanish ? "Mover antes" : "Move earlier", exact: true })
            .isEnabled(),
          false,
        );
      },
    },
  ]);
}
