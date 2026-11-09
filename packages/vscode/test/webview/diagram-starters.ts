import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { DIAGRAM_STARTERS } from "../../../edit/src/starter-catalog.js";
import { compile } from "@meltemi/diagrams-model";

interface Harness {
  page: Page;
  text: string;
  settled(): Promise<void>;
}

const SOURCE = '// Keep my explanation.\ndiagram original: flow { api["API"] }\n';

export const diagramStarterTests = [
  ...DIAGRAM_STARTERS.map((starter) => ({
    name: `diagram catalogue: shared canvas adds and selects ${starter} without rewriting source`,
    text: SOURCE,
    async run(h: Harness) {
      await h.page.locator(".toolbar button.new-diagram").click();
      assert.deepEqual(
        await h.page
          .locator(".menu [data-create]")
          .evaluateAll((items) => items.map((item) => item.getAttribute("data-create"))),
        [...DIAGRAM_STARTERS],
      );
      await h.page.locator(`.menu [data-create="${starter}"]`).click();
      await h.settled();
      assert.ok(h.text.includes(SOURCE));
      assert.deepEqual(compile(h.text).diagnostics, []);
      assert.equal(
        await h.page.locator('.toolbar select[aria-label="Diagram"]').inputValue(),
        "diagram1",
      );
      assert.equal(await h.page.locator(".content svg").count(), 1);
      if (starter === "c4") {
        assert.match(h.text, /model model1 \{/);
        assert.match(h.text, /diagram diagram1: c4 using model1/);
      }
    },
  })),
  {
    name: "diagram catalogue: creates a C4 view from active story playback and returns to authoring",
    text: `${SOURCE}story tour for original { scene first { hold 1s } }\n`,
    async run(h: Harness) {
      await h.page.locator('.toolbar select[aria-label="Story"]').selectOption("tour");
      await h.settled();
      assert.equal(await h.page.locator(".timeline").isVisible(), true);
      await h.page.locator(".toolbar button.new-diagram").click();
      await h.page.locator('.menu [data-create="c4"]').click();
      await h.settled();
      assert.equal(await h.page.locator(".timeline").isVisible(), false);
      assert.equal(
        await h.page.locator('.toolbar select[aria-label="Diagram"]').inputValue(),
        "diagram1",
      );
      assert.match(h.text, /story tour for original/);
      assert.deepEqual(compile(h.text).diagnostics, []);
    },
  },
];
