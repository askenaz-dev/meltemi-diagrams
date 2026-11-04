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
}

const text = `// Preserve this comment while editing in separate tabs.
diagram d: free {
  layout manual
  box a "Alpha"
  box b "Beta"
  placement {
    place a at (160, 140)
    place b at (420, 140)
  }
}
`;

export function propertyTabTests(output: string) {
  return [
    {
      name: "property tabs: keyboard, text edits, render retention and read-only navigation",
      text,
      async run(h: Harness) {
        const { page } = h;
        const a = await h.centre("a");
        await page.mouse.click(a.x, a.y);
        await h.settled();
        const inspector = page.locator("#mdg-inspector");
        const tabs = inspector.getByRole("tablist");
        assert.equal(await tabs.getByRole("tab").count(), 5);
        const style = tabs.getByRole("tab", { name: "Style", exact: true });
        const typography = tabs.getByRole("tab", { name: "Text", exact: true });
        await style.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await typography.getAttribute("aria-selected"), "true");
        assert.equal(await page.locator("#mdg-field-style-fontSize").isVisible(), true);
        assert.equal(await page.locator('[data-field="style.fill"]').isVisible(), false);
        assert.equal(await page.locator('[data-field="style.color"]').isVisible(), true);
        const size = page.locator("#mdg-field-style-fontSize");
        await size.fill("24");
        await size.press("Enter");
        await h.settled();
        assert.match(h.text, /fontSize 24/);
        assert.match(h.text, /^\/\/ Preserve this comment/);
        assert.equal(await typography.getAttribute("aria-selected"), "true");
        await size.fill("26");
        await style.click();
        await h.settled();
        assert.match(h.text, /fontSize 26/);
        await typography.click();
        assert.equal(await size.inputValue(), "26", "switching tabs commits the draft once");
        const b = await h.centre("b");
        await page.mouse.click(b.x, b.y);
        await h.settled();
        assert.equal(await typography.getAttribute("aria-selected"), "true");
        await typography.focus();
        await page.keyboard.press("End");
        assert.equal(
          await tabs.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"),
          "true",
        );
        await page.keyboard.press("Home");
        assert.equal(await style.getAttribute("aria-selected"), "true");
        await tabs.getByRole("tab", { name: "Layout", exact: true }).click();
        for (const name of ["x", "y", "w", "h", "style-rotation"]) {
          assert.equal(await page.locator(`#mdg-field-${name}`).isVisible(), true, name);
        }
        await typography.click();
        await page.screenshot({ path: join(output, "properties-text-light.png") });
        await h.settings({ readOnly: true });
        await style.click();
        assert.equal(await style.isEnabled(), true);
        assert.equal(await page.locator("#mdg-field-style-shape").isDisabled(), true);
        assert.equal(await inspector.getByRole("tabpanel").count(), 1);
      },
    },
    {
      name: "property tabs: Spanish labels, visible focus and compact dark panel",
      text,
      lang: "es",
      theme:
        ":root { --vscode-editor-background:#0b1220; --vscode-sideBar-background:#111b2c; --vscode-foreground:#e2e8f0; --vscode-descriptionForeground:#a2aec0; --vscode-input-background:#172236; --vscode-input-foreground:#e2e8f0; --vscode-focusBorder:#60a5fa; --vscode-panel-border:#29384e; }",
      async run(h: Harness) {
        const { page } = h;
        const a = await h.centre("a");
        await page.mouse.click(a.x, a.y);
        await h.settled();
        const tabs = page
          .locator("#mdg-inspector")
          .getByRole("tablist", { name: "Categorías de propiedades" });
        await tabs.getByRole("tab", { name: "Texto", exact: true }).click();
        const panel = page.locator("#mdg-inspector");
        assert.equal(await panel.getByRole("tabpanel", { name: "Texto" }).isVisible(), true);
        const dimensions = await tabs.evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        assert.ok(dimensions.scroll <= dimensions.width + 1, "category labels fit the panel");
        const content = await panel.evaluate((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        assert.ok(
          content.scroll <= content.width + 1,
          "translated field labels stay inside the panel",
        );
        const rotationContrast = await page.locator(".rotate-arrow").evaluate((arrow) => {
          const disc = arrow.parentElement!.querySelector(".rotate-disc")!;
          const luminances = [getComputedStyle(arrow).stroke, getComputedStyle(disc).fill].map(
            (colour) => {
              const channels = colour
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map((value) => {
                  const channel = Number(value) / 255;
                  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
                });
              return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
            },
          );
          return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
        });
        assert.ok(rotationContrast >= 3, `rotation arrow contrast: ${rotationContrast}`);
        await page.screenshot({ path: join(output, "properties-text-dark-es.png") });
      },
    },
  ];
}
