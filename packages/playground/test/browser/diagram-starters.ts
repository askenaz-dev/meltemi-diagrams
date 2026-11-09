import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { DIAGRAM_STARTERS } from "../../../edit/src/starter-catalog.js";

interface Helpers {
  output: string;
  templates: readonly { name: string }[];
  analysed(page: Page): Promise<void>;
  openTemplate(page: Page, name: string): Promise<void>;
  expectOpen(page: Page, path: string): Promise<void>;
}

const names = [
  "Flow diagram",
  "Sequence diagram",
  "C4 architecture",
  "Gantt chart",
  "Whiteboard",
  "Kanban board",
  "Free composition",
];
const namesEs = [
  "Diagrama de flujo",
  "Diagrama de secuencia",
  "Arquitectura C4",
  "Diagrama de Gantt",
  "Pizarra",
  "Tablero Kanban",
  "Composición libre",
];

/** Snapshot actual workspace bytes, including its manifest, through the browser's own host. */
const files = (page: Page) =>
  page.evaluate(() => {
    const host = (
      window as unknown as {
        meltemiPlayground: {
          studio: { host: { paths(): string[]; get(path: string): string | Uint8Array } };
        };
      }
    ).meltemiPlayground.studio.host;
    return Object.fromEntries(
      host.paths().map((path) => {
        const value = host.get(path);
        return [path, typeof value === "string" ? value : Array.from(value)];
      }),
    );
  });

export function diagramStarterTests(h: Helpers) {
  return [
    ...["flow", "c4"].map((template) => ({
      name: `diagram catalogue: creates all seven from a ${template} project without changing existing files`,
      async run({ page }: { page: Page }) {
        await h.openTemplate(page, template);
        const before = await files(page);
        for (const [index, starter] of DIAGRAM_STARTERS.entries()) {
          await page.locator(".explorer-bar").getByRole("button", { name: "New diagram…" }).click();
          const dialog = page.locator("dialog[open]");
          assert.deepEqual(
            await dialog
              .getByRole("radio")
              .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label"))),
            names,
          );
          if (template === "flow" && starter === "flow") {
            await page.waitForTimeout(250);
            await page.screenshot({ path: join(h.output, "diagram-catalogue-en-light-wide.png") });
          }
          await dialog.getByLabel("Name", { exact: true }).fill(`added-${starter}`);
          await dialog.getByRole("radio", { name: names[index], exact: true }).check();
          await dialog.getByRole("button", { name: "Create", exact: true }).click();
          await h.expectOpen(page, `diagrams/added-${starter}.meltemi`);
          await h.analysed(page);
          assert.equal(await page.locator("#problems-title").textContent(), "No problems");
          await page.locator("#app .content svg").waitFor();
        }
        const after = await files(page);
        for (const [path, bytes] of Object.entries(before))
          assert.deepEqual(after[path], bytes, path);
        assert.equal(Object.keys(after).length, Object.keys(before).length + 7);
      },
    })),
    {
      name: "diagram catalogue: every initial template offers the same seven choices and cancellation writes nothing",
      async run({ page }: { page: Page }) {
        for (const template of h.templates) {
          await h.openTemplate(page, template.name);
          const before = await files(page);
          const button = page
            .locator(".explorer-bar")
            .getByRole("button", { name: "New diagram…" });
          await button.click();
          const dialog = page.locator("dialog[open]");
          assert.deepEqual(
            await dialog
              .getByRole("radio")
              .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label"))),
            names,
            template.name,
          );
          await page.keyboard.press("Escape");
          assert.equal(await dialog.count(), 0);
          assert.deepEqual(await files(page), before);
          await page.waitForFunction(() => document.activeElement?.closest(".tree") !== null);
        }
      },
    },
    {
      name: "diagram catalogue: invalid names, concurrent collisions and lost write permission preserve workspace files",
      async run({ page }: { page: Page }) {
        const before = await files(page);
        await page.locator(".explorer-bar").getByRole("button", { name: "New diagram…" }).click();
        const dialog = page.locator("dialog[open]");
        const name = dialog.getByLabel("Name", { exact: true });
        const create = dialog.getByRole("button", { name: "Create", exact: true });
        await name.fill("../escape");
        await create.click();
        assert.ok((await dialog.locator(".field-problem").textContent())!.length > 0);
        assert.deepEqual(await files(page), before);
        await name.fill("reserved");
        await page.evaluate(() => {
          const studio = (
            window as unknown as {
              meltemiPlayground: { studio: { addFiles(files: [string, string][]): void } };
            }
          ).meltemiPlayground.studio;
          studio.addFiles([["diagrams/reserved.meltemi", "diagram reserved: flow {}\n"]]);
        });
        const collided = await files(page);
        await create.click();
        assert.match((await dialog.locator(".field-problem").textContent())!, /exists/);
        assert.deepEqual(await files(page), collided);
        await name.fill("permission-lost");
        await page.evaluate(() =>
          (
            window as unknown as {
              meltemiPlayground: { studio: { setReadOnly(value: boolean): void } };
            }
          ).meltemiPlayground.studio.setReadOnly(true),
        );
        await create.click();
        assert.deepEqual(await files(page), collided);
      },
    },
    ...[false, true].map((spanish) => ({
      name: `diagram catalogue: ${spanish ? "Spanish dark" : "English light"} responsive choices and keyboard on a narrow screen`,
      viewport: { width: 390, height: 844 },
      locale: spanish ? "es-CL" : "en-US",
      dark: spanish,
      async run({ page }: { page: Page }) {
        const words = spanish ? namesEs : names;
        await page.getByRole("tab", { name: spanish ? "Archivos" : "Files", exact: true }).click();
        const button = page
          .locator(".explorer-bar")
          .getByRole("button", { name: spanish ? "Nuevo diagrama…" : "New diagram…" });
        await button.click();
        const dialog = page.locator("dialog[open]");
        assert.deepEqual(
          await dialog
            .getByRole("radio")
            .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label"))),
          words,
        );
        await dialog.getByRole("radio").first().focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await dialog.getByRole("radio", { name: words[1], exact: true }).isChecked(),
          true,
        );
        const box = await dialog.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= 391, "dialog fits viewport");
        assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
        await page.waitForTimeout(250);
        await page.screenshot({
          path: join(h.output, `diagram-catalogue-${spanish ? "es-dark" : "en-light"}-narrow.png`),
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.activeElement?.closest(".tree") !== null);
      },
    })),
  ];
}
