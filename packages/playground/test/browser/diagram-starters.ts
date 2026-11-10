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

/** Let the real dialog transition finish before reading its screen-space geometry. */
async function settleDialog(page: Page) {
  await page.locator("dialog[open]").evaluate(async (dialog) => {
    await Promise.all(
      dialog
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => null)),
    );
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
}

/** Check what was actually painted, rather than snapshotting SVG strings or implementation data. */
async function expectPreviews(page: Page) {
  await settleDialog(page);
  const previews = page.locator("dialog[open] .starter-choice svg.starter-preview");
  assert.equal(await previews.count(), 7);
  const painted = await previews.evaluateAll((elements) =>
    elements.map((element) => {
      const svg = element as SVGSVGElement;
      const box = svg.getBoundingClientRect();
      const card = svg.closest(".starter-choice")!.getBoundingClientRect();
      const shapes = [
        ...svg.querySelectorAll("rect, path, circle, ellipse, line, polyline, polygon"),
      ]
        .filter((shape) => !shape.closest("defs"))
        .map((shape) => {
          const geometry = (shape as SVGGraphicsElement).getBBox();
          const style = getComputedStyle(shape);
          return {
            geometry: [shape.localName, geometry.x, geometry.y, geometry.width, geometry.height],
            fill: Number(style.opacity) > 0 && Number(style.fillOpacity) > 0 ? style.fill : "none",
          };
        });
      return {
        hidden: svg.getAttribute("aria-hidden"),
        focusable: svg.getAttribute("focusable"),
        width: box.width,
        height: box.height,
        inside: box.left >= card.left - 1 && box.right <= card.right + 1,
        geometry: shapes.map((shape) => shape.geometry),
        fills: shapes.map((shape) => shape.fill),
      };
    }),
  );
  for (const [index, preview] of painted.entries()) {
    assert.equal(preview.hidden, "true", names[index]);
    assert.equal(preview.focusable, "false", names[index]);
    assert.ok(preview.width >= 100 && preview.height >= 40, "preview remains legible");
    assert.equal(preview.inside, true, "preview stays within its card");
    assert.ok(preview.geometry.length >= 2, "preview paints an example, not only a background");
  }
  assert.equal(
    new Set(painted.map((preview) => JSON.stringify(preview.geometry))).size,
    7,
    "each diagram type has a different visible composition",
  );
  const fills = new Set(
    painted
      .flatMap((preview) => preview.fills)
      .filter((fill) => !["none", "transparent", "rgba(0, 0, 0, 0)"].includes(fill)),
  );
  assert.ok(
    fills.size >= 3,
    "examples use distinguishable colors rather than inherited text color",
  );
}

async function expectDialogFits(page: Page, width: number, height: number) {
  const dialog = page.locator("dialog[open]");
  const box = await dialog.boundingBox();
  assert.ok(
    box &&
      box.x >= -1 &&
      box.x + box.width <= width + 1 &&
      box.y >= -1 &&
      box.y + box.height <= height + 1,
    "dialog fits viewport",
  );
  for (const region of [dialog, dialog.locator(".dialog-body")])
    assert.equal(await region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
}

async function selectPreview(page: Page, index: number) {
  const card = page.locator("dialog[open] .starter-choice").nth(index);
  await card.locator(".starter-art").click();
  assert.equal(await card.getByRole("radio").isChecked(), true);
  assert.equal(await page.locator('dialog[open] input[type="radio"]:checked').count(), 1);
}

export function diagramStarterTests(h: Helpers) {
  return [
    ...["flow", "c4"].map((template) => ({
      name: `diagram catalogue: creates all seven from a ${template} project without changing existing files`,
      viewport: { width: 1440, height: 1000 },
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
            await expectPreviews(page);
            await expectDialogFits(page, 1440, 1000);
            await page.screenshot({ path: join(h.output, "diagram-catalogue-en-light-wide.png") });
          }
          await dialog.getByLabel("Name", { exact: true }).fill(`added-${starter}`);
          await selectPreview(page, index);
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
      viewport: { width: 320, height: 844 },
      locale: spanish ? "es-CL" : "en-US",
      dark: spanish,
      async run({ page }: { page: Page }) {
        const words = spanish ? namesEs : names;
        const before = await files(page);
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
        await expectPreviews(page);
        await dialog.getByRole("radio").first().focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await dialog.getByRole("radio", { name: words[1], exact: true }).isChecked(),
          true,
        );
        assert.equal(
          await dialog
            .getByRole("radio")
            .nth(1)
            .evaluate((el) => document.activeElement === el),
          true,
        );
        assert.equal(
          await dialog
            .getByRole("radio")
            .nth(1)
            .evaluate((el) => {
              const style = getComputedStyle(el.closest(".starter-choice")!);
              return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
            }),
          true,
          "keyboard selection has a visible focus outline",
        );
        await selectPreview(page, 6);
        await expectDialogFits(page, 320, 844);
        const create = dialog.getByRole("button", {
          name: spanish ? "Crear" : "Create",
          exact: true,
        });
        await create.scrollIntoViewIfNeeded();
        const footer = await create.boundingBox();
        assert.ok(
          footer && footer.y >= 0 && footer.y + footer.height <= 845,
          "Create stays reachable",
        );
        await settleDialog(page);
        await page.screenshot({
          path: join(h.output, `diagram-catalogue-${spanish ? "es-dark" : "en-light"}-narrow.png`),
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.activeElement?.closest(".tree") !== null);
        assert.deepEqual(await files(page), before);
      },
    })),
    ...[
      { spanish: false, dark: true },
      { spanish: true, dark: false },
      { spanish: true, dark: true },
    ].map(({ spanish, dark }) => ({
      name: `diagram catalogue: ${spanish ? "Spanish" : "English"} ${dark ? "dark" : "light"} colorful previews and selection on desktop`,
      viewport: { width: 1440, height: 1000 },
      locale: spanish ? "es-CL" : "en-US",
      dark,
      async run({ page }: { page: Page }) {
        const before = await files(page);
        await page
          .locator(".explorer-bar")
          .getByRole("button", { name: spanish ? "Nuevo diagrama…" : "New diagram…" })
          .click();
        const dialog = page.locator("dialog[open]");
        await expectPreviews(page);
        await expectDialogFits(page, 1440, 1000);
        for (let index = 0; index < DIAGRAM_STARTERS.length; index++) {
          await selectPreview(page, index);
          const box = await dialog.locator(".starter-preview").nth(index).boundingBox();
          assert.ok(
            box && box.y >= 0 && box.y + box.height <= 1001,
            "all seven previews fit on desktop",
          );
        }
        await settleDialog(page);
        await page.screenshot({
          path: join(
            h.output,
            `diagram-catalogue-${spanish ? "es" : "en"}-${dark ? "dark" : "light"}-wide.png`,
          ),
        });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.activeElement?.closest(".tree") !== null);
        assert.deepEqual(await files(page), before);
      },
    })),
  ];
}
