import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";

interface Helpers {
  readonly output: string;
  until<A>(page: Page, label: string, test: (arg: A) => boolean, arg?: A): Promise<void>;
}

const SOURCE = `// Keep this diagram and its comments.
diagram d: flow { a -> b }
story tour for d { scene first { reveal a over 2s; hold 1s } }
`;

async function load(page: Page) {
  await page.evaluate((source) => {
    const p = (
      window as unknown as {
        meltemiPlayground: { studio: { load(files: [string, string][], open: string): void } };
      }
    ).meltemiPlayground;
    p.studio.load(
      [
        ["diagrams/one.meltemi", source],
        ["diagrams/two.meltemi", source.replace("a -> b", "a -> c")],
        ["diagrams/plain.meltemi", "diagram d: flow { a -> plain }\n"],
        ["diagrams/broken.meltemi", "diagram d: flow { a -> }\n"],
        ["notes.md", "# Notes\n"],
      ],
      "diagrams/one.meltemi",
    );
  }, SOURCE);
  await page.locator('.tree li[data-key="s:diagrams/one.meltemi#tour"] .tree-name').waitFor();
}

export function storyLifecycleTests({ output, until }: Helpers) {
  const file = (page: Page, name: string) =>
    page.locator(`.tree li[data-key="f:diagrams/${name}.meltemi"] > .tree-row .tree-name`);
  const story = (page: Page) =>
    page.locator('.tree li[data-key="s:diagrams/one.meltemi#tour"] > .tree-row .tree-name');
  const timeline = (page: Page) => page.locator("#app .timeline");
  return [
    {
      name: "story lifecycle: selecting another file exits playback directly, including cached equal-id sessions",
      async run({ page }: { page: Page }) {
        await load(page);
        await story(page).click();
        await timeline(page).waitFor();
        await file(page, "plain").click();
        await timeline(page).waitFor({ state: "hidden" });
        assert.equal(
          await page.locator('#app .content g[data-role="element"][data-id="plain"]').count(),
          1,
        );
        assert.equal(
          await page
            .locator('.tree li[data-key="f:diagrams/plain.meltemi"]')
            .getAttribute("aria-selected"),
          "true",
        );
        // Cache a story in the second file, then leave it. Both files use d/tour at revision 0.
        await file(page, "two").click();
        await page.getByRole("combobox", { name: "Story", exact: true }).selectOption("tour");
        await timeline(page).waitFor();
        await story(page).click();
        await file(page, "two").click();
        await timeline(page).waitFor({ state: "hidden" });
        assert.equal(
          await page.getByRole("combobox", { name: "Story", exact: true }).inputValue(),
          "",
        );
        assert.equal(
          await page.locator('#app .content g[data-role="element"][data-id="c"]').count(),
          1,
        );
        await page.screenshot({ path: join(output, "story-navigation.png") });
        await story(page).click();
        await page.getByRole("button", { name: "Play the story" }).click();
        await page.locator(".explorer-foot .switch").click();
        await page.locator('.tree li[data-key="f:notes.md"] > .tree-row .tree-name').click();
        await timeline(page).waitFor({ state: "hidden" });
        assert.equal(await page.locator("#app .content svg").count(), 0);
        await story(page).click();
        await file(page, "broken").click();
        await timeline(page).waitFor({ state: "hidden" });
        assert.equal(await page.locator("#app .content svg").count(), 0);
      },
    },
    {
      name: "story lifecycle: explorer deletion cancels, rejects stale confirmation, and undoes as one edit",
      async run({ page }: { page: Page }) {
        await load(page);
        await story(page).click();
        await timeline(page).waitFor();
        await story(page).click({ button: "right" });
        await page.getByRole("menuitem", { name: /^Delete story/ }).click();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(await page.locator(".code-input").inputValue(), SOURCE);
        await story(page).click();
        await page.keyboard.press("Delete");
        const dialog = page.getByRole("dialog", { name: /Delete.*story/ });
        await dialog.waitFor();
        await page.evaluate(() => {
          const p = (
            window as unknown as {
              meltemiPlayground: {
                studio: { setText(path: string, text: string): void; text(): string };
              };
            }
          ).meltemiPlayground;
          p.studio.setText(
            "diagrams/one.meltemi",
            p.studio.text() + "// Concurrent source update.\n",
          );
        });
        await dialog.getByRole("button", { name: "Delete", exact: true }).click();
        assert.match(await page.locator(".code-input").inputValue(), /story tour/);
        const before = await page.locator(".code-input").inputValue();
        await story(page).click();
        await page.keyboard.press("Delete");
        await dialog.getByRole("button", { name: "Delete", exact: true }).click();
        await timeline(page).waitFor({ state: "hidden" });
        assert.doesNotMatch(await page.locator(".code-input").inputValue(), /story tour/);
        assert.match(await page.locator(".code-input").inputValue(), /Keep this diagram/);
        await page.locator("#app .stage").focus();
        await page.keyboard.press("Control+z");
        await until(
          page,
          "the exact story restored",
          (expected) =>
            (document.querySelector(".code-input") as HTMLTextAreaElement).value === expected,
          before,
        );
        assert.equal(await timeline(page).isVisible(), false);
        await page.keyboard.press("Control+Shift+z");
        await until(
          page,
          "the story deletion redone",
          () =>
            !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
              "story tour",
            ),
        );
      },
    },
  ];
}
