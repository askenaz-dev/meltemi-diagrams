/**
 * The canvas's context actions in the playground (change `context-actions-and-layout-menu`):
 * effects and Reverse direction from the context menu, Number messages, the layout badge's menu and
 * the confirmation before automatic layout, in English and Spanish, wide and on a phone's width.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";

interface Helpers {
  readonly output: string;
  analysed(page: Page): Promise<void>;
  until<A>(page: Page, label: string, test: (arg: A) => boolean, arg?: A): Promise<void>;
}

const FLOW = `diagram d: flow {
  layout assisted
  api["API"]
  db[("DB")]
  cache["Cache"]
  api -> db: "save" as save
  api -> cache
  placement {
    place api at (160, 160)
    place db at (520, 160)
    place cache at (160, 380)
    route save from api to db via [(340, 100)]
  }
}
`;

const SEQUENCE = `diagram pay: sequence {
  participant customer "Customer"
  participant api "API"
  customer -> api: "Pay" as pay
  activate api
  api --> customer: "Receipt" as receipt
  deactivate api
}
`;

/** The text of the code pane. */
const code = (page: Page) =>
  page.evaluate(() => (document.querySelector(".code-input") as HTMLTextAreaElement).value);

/**
 * A whole page pixel the connector of a relation covers, where a press selects it. Asked again
 * until the drawing has it: a render after an edit replaces the connector while it is measured.
 */
async function onRelation(page: Page, key: string, at = 0.4): Promise<{ x: number; y: number }> {
  const handle = await page.waitForFunction(
    ([fraction, id]: [number, string]) => {
      const lines = document.querySelectorAll<SVGGeometryElement>(
        `#app .content g[data-role="relation"][data-id="${id}"] :is(polyline, path)`,
      );
      for (const line of lines) {
        try {
          const along = line.getPointAtLength(line.getTotalLength() * fraction);
          const m = line.getScreenCTM();
          if (!m) continue;
          const x = along.x * m.a + along.y * m.c + m.e;
          const y = along.x * m.b + along.y * m.d + m.f;
          for (let r = 0; r <= 3; r++) {
            for (let dx = -r; dx <= r; dx++) {
              for (let dy = -r; dy <= r; dy++) {
                const px = Math.round(x) + dx;
                const py = Math.round(y) + dy;
                const under = document.elementFromPoint(px, py);
                if (under?.closest('[data-role="relation"]')?.getAttribute("data-id") === id) {
                  return { x: px, y: py };
                }
              }
            }
          }
        } catch {
          // Being replaced by the next render: the next try measures that one.
        }
      }
      return null;
    },
    [at, key] as [number, string],
    { timeout: 10_000 },
  );
  const point = (await handle.jsonValue()) as { x: number; y: number } | null;
  assert.ok(point, `no pixel of ${key} to press`);
  return point;
}

/** Whether a box lies inside the viewport. */
async function fits(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  const size = page.viewportSize()!;
  assert.ok(box, `${selector} is drawn`);
  assert.ok(box.x >= 0 && box.y >= 0, `${selector} starts inside the page`);
  assert.ok(box.x + box.width <= size.width + 0.5, `${selector} ends inside the page's width`);
  assert.ok(box.y + box.height <= size.height + 0.5, `${selector} ends inside the page's height`);
}

export function contextActionTests({ output, analysed, until }: Helpers) {
  const status = (page: Page) => page.locator("#app .status").textContent();
  return [
    {
      name: "context actions: an effect and Reverse direction from the menu, the anonymous relation named",
      async run({ page }: { page: Page }) {
        await page.locator(".code-input").fill(FLOW);
        await analysed(page);
        const menu = page.getByRole("menu", { name: "Canvas actions" });
        let point = await onRelation(page, "api->cache#1", 0.5);
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        const flow = menu.getByRole("menuitemcheckbox", { name: "Flow particles" });
        await flow.waitFor();
        await flow.click();
        await until(page, "the relation named and animated", () => {
          const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
          return text.includes("api -> cache as api_cache") && text.includes("animate api_cache");
        });
        point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitem", { name: "Reverse direction" }).click();
        await until(page, "save reversed", () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            'db -> api: "save" as save',
          ),
        );
        assert.match(await code(page), /route save from db to api via \[\(340, 100\)\]/);
        assert.equal(await status(page), "The relation now goes from `db` to `api`.");
        // One undo step brings it back.
        await page.keyboard.press("Control+z");
        await until(page, "undone", () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            'api -> db: "save" as save',
          ),
        );
      },
    },
    {
      name: "context actions: Number messages and a message reversed with its activation",
      async run({ page }: { page: Page }) {
        await page.locator(".code-input").fill(SEQUENCE);
        await analysed(page);
        const stage = await page.locator("#app .stage").boundingBox();
        assert.ok(stage);
        const corner = { x: stage.x + stage.width - 40, y: stage.y + stage.height - 40 };
        const menu = page.getByRole("menu", { name: "Canvas actions" });
        await page.mouse.click(corner.x, corner.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitemcheckbox", { name: "Number messages" }).click();
        await until(page, "autonumber written", () =>
          /\n {2}autonumber\n/.test(
            (document.querySelector(".code-input") as HTMLTextAreaElement).value,
          ),
        );
        const arrow = await onRelation(page, "pay", 0.5);
        await page.mouse.click(arrow.x, arrow.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitem", { name: "Reverse direction" }).click();
        await until(page, "pay reversed", () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            'api -> customer: "Pay" as pay\n  activate customer',
          ),
        );
        await page.mouse.click(corner.x, corner.y, { button: "right" });
        await menu.waitFor();
        const number = menu.getByRole("menuitemcheckbox", { name: "Number messages" });
        assert.equal(await number.getAttribute("aria-checked"), "true");
        await number.click();
        await until(
          page,
          "autonumber removed",
          () =>
            !(document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
              "autonumber",
            ),
        );
      },
    },
    {
      name: "context actions: the layout badge switches to assisted and manual, and asks before automatic",
      async run({ page }: { page: Page }) {
        await page.locator(".code-input").fill(FLOW.replace("layout assisted", "layout manual"));
        await analysed(page);
        const badge = page.locator("#app .toolbar button.layout-badge");
        assert.equal(await badge.textContent(), "layout manual");
        const menu = page.getByRole("menu", { name: "Canvas actions" });
        await badge.click();
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Assisted" }).click();
        await until(page, "assisted written", () =>
          (document.querySelector(".code-input") as HTMLTextAreaElement).value.includes(
            "layout assisted",
          ),
        );
        await until(
          page,
          "the badge says assisted",
          () =>
            document.querySelector("#app .toolbar button.layout-badge")?.textContent ===
            "layout assisted",
        );
        await badge.click();
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Automatic" }).click();
        const dialog = page.locator('#app .dialog [data-dialog="arrange"]');
        await dialog.waitFor();
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-confirm-1440.png") });
        await dialog.getByRole("button", { name: "Arrange" }).click();
        await until(page, "automatic, without places", () => {
          const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
          return text.includes("layout auto") && !text.includes("place ");
        });
        // Undo restores every position at once.
        await page.keyboard.press("Control+z");
        await until(page, "places back", () => {
          const text = (document.querySelector(".code-input") as HTMLTextAreaElement).value;
          return text.includes("place api at (160, 160)") && text.includes("via [(340, 100)]");
        });
      },
    },
    {
      name: "context actions: the confirmation speaks Spanish",
      locale: "es-CL",
      async run({ page }: { page: Page }) {
        await page.locator(".code-input").fill(FLOW);
        await analysed(page);
        const badge = page.locator("#app .toolbar button.layout-badge");
        await badge.click();
        const menu = page.getByRole("menu", { name: "Acciones del lienzo" });
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Automático" }).click();
        const dialog = page.locator('#app .dialog [data-dialog="arrange"]');
        await dialog.waitFor();
        assert.equal(await dialog.locator(".title").textContent(), "Volver al orden automático");
        assert.match(
          (await dialog.locator("p").textContent()) ?? "",
          /se perderán las 3 posiciones y la ruta que moviste a mano\. Puedes deshacerlo después\./,
        );
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-confirm-es.png") });
        await dialog.getByRole("button", { name: "Cancelar" }).click();
        assert.equal(await code(page), FLOW);
      },
    },
    ...[1280, 320].map((width) => ({
      name: `context actions: menus and the confirmation fit at ${width} px`,
      viewport: { width, height: width === 320 ? 640 : 800 },
      async run({ page }: { page: Page }) {
        // On a phone's width the code and the canvas are tabs: the text is typed in the first.
        if (width === 320) await page.locator("#tab-code").click();
        await page.locator(".code-input").fill(FLOW);
        await analysed(page);
        if (width === 320) await page.locator("#tab-canvas").click();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
          false,
          "no sideways scrolling",
        );
        const badge = page.locator("#app .toolbar button.layout-badge");
        await badge.scrollIntoViewIfNeeded();
        await badge.click();
        const menu = page.getByRole("menu", { name: "Canvas actions" });
        await menu.waitFor();
        await page.waitForTimeout(250);
        await fits(page, "#app .menu");
        await page.screenshot({ path: join(output, `context-actions-badge-${width}.png`) });
        await menu.getByRole("menuitemradio", { name: "Automatic" }).click();
        const dialog = page.locator('#app .dialog [data-dialog="arrange"]');
        await dialog.waitFor();
        await page.waitForTimeout(250);
        await fits(page, '#app .dialog [data-dialog="arrange"]');
        await page.screenshot({ path: join(output, `context-actions-confirm-${width}.png`) });
        await dialog.getByRole("button", { name: "Cancel" }).click();
        // The whole diagram in view, its connectors with it.
        await page.locator("#app .stage").focus();
        await page.keyboard.press("Shift+Digit1");
        await page.waitForTimeout(300);
        const point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitemcheckbox", { name: "Trace" }).waitFor();
        await page.waitForTimeout(250);
        await fits(page, "#app .menu");
        await page.screenshot({ path: join(output, `context-actions-menu-${width}.png`) });
        await page.keyboard.press("Escape");
      },
    })),
  ];
}
