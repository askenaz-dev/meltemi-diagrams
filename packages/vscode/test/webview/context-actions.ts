import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { CanvasSettings } from "@meltemi/diagrams-editor";

interface Harness {
  page: Page;
  text: string;
  settled(): Promise<void>;
  settings(next: Partial<CanvasSettings>): Promise<void>;
  centre(id: string): Promise<{ x: number; y: number }>;
  focusStage(): Promise<void>;
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

/**
 * A whole page pixel on the drawn connector of a relation, where a press selects it: the point at
 * `at` of its length, or the nearest pixel around it that the connector covers, since the mouse
 * presses whole pixels and the stroke is thinner than two. Asked again until the drawing has it: a
 * render after an edit replaces the connector while it is measured.
 */
async function onRelation(page: Page, key: string, at = 0.35): Promise<{ x: number; y: number }> {
  const handle = await page.waitForFunction(
    ([fraction, id]: [number, string]) => {
      const lines = document.querySelectorAll<SVGGeometryElement>(
        `.content g[data-role="relation"][data-id="${id}"] :is(polyline, path)`,
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

/** The canvas's context menu. */
const menuOf = (page: Page, name = "Canvas actions") => page.getByRole("menu", { name });

export function contextActionTests(output: string) {
  return [
    {
      name: "context actions: effects and Reverse direction in the menu of a relation",
      text: FLOW,
      async run(h: Harness) {
        const { page } = h;
        const menu = menuOf(page);
        let point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        // The effect items come once the relation's properties have arrived.
        const flow = menu.getByRole("menuitemcheckbox", { name: "Flow particles" });
        await flow.waitFor();
        for (const name of ["Moving dash", "Pulse", "Trace"]) {
          assert.equal(await menu.getByRole("menuitemcheckbox", { name }).count(), 1, name);
        }
        assert.equal(await flow.getAttribute("aria-checked"), "false");
        assert.equal(await menu.getByRole("menuitem", { name: "Reverse direction" }).count(), 1);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-relation-menu.png") });
        await flow.click();
        await h.settled();
        assert.match(h.text, /animate save \{ effect flow \}/);
        point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        await flow.waitFor();
        assert.equal(await flow.getAttribute("aria-checked"), "true");
        await menu.getByRole("menuitem", { name: "Reverse direction" }).click();
        await h.settled();
        assert.match(h.text, /db -> api: "save" as save/);
        assert.match(h.text, /route save from db to api via \[\(340, 100\)\]/);
        assert.match(h.text, /animate save \{ effect flow \}/);
        assert.equal(
          await page.locator(".status").textContent(),
          "The relation now goes from `db` to `api`.",
        );
        // An anonymous relation is named when an effect is turned on.
        point = await onRelation(page, "api->cache#1", 0.5);
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        const pulse = menu.getByRole("menuitemcheckbox", { name: "Pulse" });
        await pulse.waitFor();
        await pulse.click();
        await h.settled();
        assert.match(h.text, /api -> cache as api_cache/);
        assert.match(h.text, /animate api_cache \{ effect pulse \}/);
        // A box takes a pulse and a moving dash, and is not reversed.
        const cache = await h.centre("cache");
        await page.mouse.click(cache.x, cache.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitemcheckbox", { name: "Pulse" }).waitFor();
        assert.equal(
          await menu.getByRole("menuitemcheckbox", { name: "Flow particles" }).count(),
          0,
        );
        assert.equal(await menu.getByRole("menuitem", { name: "Reverse direction" }).count(), 0);
        await page.keyboard.press("Escape");
        // A canvas that only shows offers none of them.
        await h.settings({ readOnly: true });
        await h.settled();
        point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        await page.waitForTimeout(200);
        assert.equal(await menu.getByRole("menuitemcheckbox").count(), 0);
        assert.equal(await menu.getByRole("menuitem", { name: "Reverse direction" }).count(), 0);
        await page.keyboard.press("Escape");
      },
    },
    {
      name: "context actions: the layout badge's menu and the confirmation before automatic layout",
      text: FLOW,
      async run(h: Harness) {
        const { page } = h;
        const badge = page.locator(".toolbar button.layout-badge");
        assert.equal(await badge.isVisible(), true);
        assert.equal(await badge.textContent(), "layout assisted");
        assert.equal(await page.locator(".toolbar span.badge").isVisible(), false);
        await badge.click();
        const menu = menuOf(page);
        await menu.waitFor();
        assert.equal(await badge.getAttribute("aria-expanded"), "true");
        const assisted = menu.getByRole("menuitemradio", { name: "Assisted" });
        assert.equal(await assisted.getAttribute("aria-checked"), "true");
        assert.equal(
          await page.evaluate(() => document.activeElement?.textContent?.trim()),
          "Assisted",
        );
        for (const name of ["Arrange unplaced elements", "Recompute layout"]) {
          assert.equal(await menu.getByRole("menuitem", { name }).count(), 1, name);
        }
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-layout-menu.png") });
        // Escape closes and gives the focus back to the badge.
        await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(() => document.activeElement?.className), "layout-badge");
        assert.equal(await badge.getAttribute("aria-expanded"), "false");
        // Enter opens it from the keyboard.
        await page.keyboard.press("Enter");
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Automatic" }).click();
        const dialog = page.locator(".dialog");
        await dialog.locator('[data-dialog="arrange"]').waitFor();
        assert.equal(await dialog.locator(".title").textContent(), "Back to automatic layout");
        assert.match(
          (await dialog.locator("p").textContent()) ?? "",
          /the 3 positions and route you moved by hand will be lost/,
        );
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-confirm.png") });
        // The safe choice has the focus: Cancel writes nothing.
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel");
        await page.keyboard.press("Enter");
        await h.settled();
        assert.equal(h.text, FLOW);
        // Arrange removes the positions and the waypoints in one edit.
        await badge.click();
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Automatic" }).click();
        await dialog.locator('[data-dialog="arrange"]').waitFor();
        await dialog.getByRole("button", { name: "Arrange" }).click();
        await h.settled();
        assert.match(h.text, /\n {2}layout auto\n/);
        assert.doesNotMatch(h.text, /place |route save|placement/);
        assert.equal(await badge.textContent(), "layout auto");
        // Manual from the menu writes the positions first.
        await badge.click();
        await menu.waitFor();
        await menu.getByRole("menuitemradio", { name: "Manual" }).click();
        await h.settled();
        assert.match(h.text, /\n {2}layout manual\n/);
        assert.match(h.text, /place api at \(-?\d+, -?\d+\)/);
        assert.match(h.text, /place cache at \(-?\d+, -?\d+\)/);
        // A canvas that only shows has the plain badge.
        await h.settings({ readOnly: true });
        await h.settled();
        assert.equal(await badge.isVisible(), false);
        assert.equal(await page.locator(".toolbar span.badge").textContent(), "layout manual");
      },
    },
    {
      name: "context actions: the inspector's Layout field asks too, and Cancel keeps the written mode",
      text: FLOW,
      async run(h: Harness) {
        const { page } = h;
        await h.focusStage();
        await page.keyboard.press("Escape");
        await h.settled();
        await page.getByRole("tab", { name: "Layout", exact: true }).click();
        const field = page.locator("#mdg-field-layout");
        await field.selectOption("auto");
        const dialog = page.locator(".dialog");
        await dialog.locator('[data-dialog="arrange"]').waitFor();
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await h.settled();
        assert.equal(h.text, FLOW);
        assert.equal(await field.inputValue(), "assisted");
        assert.equal(await page.locator(".field.refused").count(), 0);
      },
    },
    {
      name: "context actions: Number messages and Reverse direction on a sequence diagram",
      text: SEQUENCE,
      async run(h: Harness) {
        const { page } = h;
        // A sequence diagram keeps the plain badge.
        assert.equal(await page.locator(".toolbar button.layout-badge").isVisible(), false);
        assert.equal(await page.locator(".toolbar span.badge").textContent(), "sequence");
        const menu = menuOf(page);
        const box = await page.locator(".stage").boundingBox();
        assert.ok(box);
        await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, {
          button: "right",
        });
        await menu.waitFor();
        const number = menu.getByRole("menuitemcheckbox", { name: "Number messages" });
        assert.equal(await number.getAttribute("aria-checked"), "false");
        await number.click();
        await h.settled();
        assert.match(h.text, /\n {2}autonumber\n/);
        await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, {
          button: "right",
        });
        await menu.waitFor();
        assert.equal(await number.getAttribute("aria-checked"), "true");
        await page.keyboard.press("Escape");
        const arrow = await onRelation(page, "pay", 0.5);
        await page.mouse.click(arrow.x, arrow.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitemcheckbox", { name: "Trace" }).waitFor();
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-sequence-menu.png") });
        await menu.getByRole("menuitem", { name: "Reverse direction" }).click();
        await h.settled();
        assert.match(h.text, /api -> customer: "Pay" as pay\n {2}activate customer/);
        assert.match(h.text, /deactivate customer/);
        assert.match(
          (await page.locator(".status").textContent()) ?? "",
          /now activates `customer`/,
        );
        // A reply is reversed too; a `return` would not be offered.
        const reply = await onRelation(page, "receipt", 0.5);
        await page.mouse.click(reply.x, reply.y, { button: "right" });
        await menu.waitFor();
        assert.equal(await menu.getByRole("menuitem", { name: "Reverse direction" }).count(), 1);
        await page.keyboard.press("Escape");
      },
    },
    {
      name: "context actions: speak Spanish",
      text: FLOW,
      lang: "es",
      async run(h: Harness) {
        const { page } = h;
        const badge = page.locator(".toolbar button.layout-badge");
        await badge.click();
        const menu = menuOf(page, "Acciones del lienzo");
        await menu.waitFor();
        assert.equal(await menu.getByRole("menuitemradio", { name: "Asistido" }).count(), 1);
        await menu.getByRole("menuitemradio", { name: "Automático" }).click();
        const dialog = page.locator(".dialog");
        await dialog.locator('[data-dialog="arrange"]').waitFor();
        assert.equal(await dialog.locator(".title").textContent(), "Volver al orden automático");
        assert.match(
          (await dialog.locator("p").textContent()) ?? "",
          /se perderán las 3 posiciones y la ruta que moviste a mano/,
        );
        assert.equal(await dialog.getByRole("button", { name: "Reordenar" }).count(), 1);
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(output, "context-actions-confirm-es.png") });
        await dialog.getByRole("button", { name: "Cancelar" }).click();
        const point = await onRelation(page, "save");
        await page.mouse.click(point.x, point.y, { button: "right" });
        await menu.waitFor();
        await menu.getByRole("menuitemcheckbox", { name: "Partículas" }).waitFor();
        assert.equal(await menu.getByRole("menuitem", { name: "Invertir dirección" }).count(), 1);
        await page.keyboard.press("Escape");
      },
    },
  ];
}
