import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";

interface Helpers {
  download(page: Page, action: () => Promise<unknown>): Promise<string>;
}

const SOURCE = `diagram d: flow {
  title "Visible diagram"
  description "Optional diagram description"
  a["Caller"] { description "Visible node caption"; url "https://example.test/inspection" }
  a -> b
}
story first for d { title "First flow"; scene start { reveal a over 1s } }
story second for d { title "Selected flow"; description "Optional story description"; scene start { highlight b over 1s } }
`;

export function storyPlayerExportTests({ download }: Helpers) {
  return [false, true].map((spanish) => ({
    name: `story player export: ${spanish ? "Spanish" : "English"} timeline chooser and selected HTML presentation`,
    locale: spanish ? "es-CL" : "en-US",
    async run({ page }: { page: Page }) {
      await page.evaluate(
        (source) =>
          (
            window as unknown as {
              meltemiPlayground: {
                studio: { load(files: [string, string][], open: string): void };
              };
            }
          ).meltemiPlayground.studio.load(
            [["diagrams/player.meltemi", source]],
            "diagrams/player.meltemi",
          ),
        SOURCE,
      );
      await page
        .locator('.tree li[data-key="s:diagrams/player.meltemi#second"] .tree-name')
        .click();
      const open = async () => {
        await page
          .locator(".timeline")
          .getByRole("button", {
            name: spanish
              ? "Exportar la historia como reproductor HTML"
              : "Export the story as an HTML player",
            exact: true,
          })
          .click();
        return page.locator("dialog[open]");
      };
      let dialog = await open();
      assert.equal(
        await dialog.getByLabel(spanish ? "Qué" : "What", { exact: true }).inputValue(),
        "story:second",
      );
      assert.equal(
        await dialog.getByLabel(spanish ? "Formato" : "Format", { exact: true }).inputValue(),
        "html",
      );
      const labels = spanish
        ? [
            "Incluir encabezado y descripción",
            "Incluir resumen textual",
            "Incluir detalles y enlaces de elementos",
            "Incluir controles de reproducción",
          ]
        : [
            "Include heading and description",
            "Include text summary",
            "Include element details and links",
            "Include playback controls",
          ];
      for (const label of labels.slice(0, 3))
        assert.equal(await dialog.getByLabel(label, { exact: true }).isChecked(), false);
      assert.equal(await dialog.getByLabel(labels[3]!, { exact: true }).isChecked(), true);
      const clean = readFileSync(
        await download(page, () =>
          dialog
            .getByRole("button", { name: spanish ? "Exportar" : "Export", exact: true })
            .click(),
        ),
        "utf8",
      );
      assert.ok(!clean.includes("<h1>"));
      assert.ok(
        clean.includes("Visible node caption"),
        "Text drawn inside the diagram is preserved.",
      );
      assert.ok(!clean.includes("https://example.test/inspection"));
      assert.ok(!clean.includes("Optional story description"));
      assert.ok(!clean.includes("Optional diagram description"));
      assert.match(clean, /summary="false" details="false"/);
      const data = JSON.parse(/<script type="application\/json">(.*?)<\/script>/.exec(clean)![1]!);
      assert.deepEqual(
        data.stories.map((story: { id: string }) => story.id),
        ["second"],
      );
      assert.deepEqual(data.details, {});
      dialog = await open();
      for (const label of labels.slice(0, 3))
        await dialog.getByLabel(label, { exact: true }).check();
      await dialog.getByLabel(labels[3]!, { exact: true }).uncheck();
      const rich = readFileSync(
        await download(page, () =>
          dialog
            .getByRole("button", { name: spanish ? "Exportar" : "Export", exact: true })
            .click(),
        ),
        "utf8",
      );
      assert.ok(rich.includes("<h1>Selected flow</h1>"));
      assert.ok(rich.includes("Visible node caption"));
      assert.ok(rich.includes("https://example.test/inspection"));
      assert.ok(rich.includes("Optional story description"));
      assert.match(rich, /controls="false"/);
      assert.ok(!rich.includes('summary="false"'));
      assert.ok(!rich.includes('details="false"'));
    },
  }));
}
