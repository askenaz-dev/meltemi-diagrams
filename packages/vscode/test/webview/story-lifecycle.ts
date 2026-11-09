import assert from "node:assert/strict";
import { CanvasSession, type CanvasSettings, type analyzeDocument } from "@meltemi/diagrams-editor";
import type { Page } from "playwright-core";

interface Harness {
  page: Page;
  text: string;
  revision: number;
  session: CanvasSession;
  analyze(text: string, revision: number): ReturnType<typeof analyzeDocument>;
  settled(): Promise<void>;
  type(text: string): Promise<void>;
  postRaw(message: unknown): Promise<void>;
  settings(next: Partial<CanvasSettings>): Promise<void>;
  writes(): unknown[];
}

const SOURCE = `// Keep the diagram.
diagram d: flow { a -> b }
story tour for d {
  scene first {
    reveal a over 2s // Keep this action's time.
    hold 1s // Final pause.
  }
  scene next { hold 1s }
}
`;

const pick = async (h: Harness) => {
  await h.page.getByRole("combobox", { name: "Story", exact: true }).selectOption("tour");
  await h.settled();
};

export const storyLifecycleTests: { name: string; text: string; run(h: Harness): Promise<void> }[] =
  [
    {
      name: "story lifecycle: numerical timing preserves actions, validates minima, cancels and commits once",
      text: SOURCE,
      async run(h) {
        const { page } = h;
        await pick(h);
        const total = page.getByRole("textbox", { name: "Scene duration (s)", exact: true });
        assert.equal(await total.inputValue(), "3");
        await total.fill("4");
        await total.press("Enter");
        await h.settled();
        await total.blur();
        await h.settled();
        assert.equal(h.writes().length, 1);
        assert.match(h.text, /reveal a over 2s \/\/ Keep this action's time\./);
        assert.match(h.text, /hold 2000ms \/\/ Final pause\./);
        const timed = h.text;
        await total.fill("1");
        await total.press("Enter");
        await total.blur();
        await h.settled();
        assert.equal(h.text, timed);
        assert.equal(await total.inputValue(), "1", "a rejected draft stays editable");
        assert.equal(await total.getAttribute("aria-invalid"), "true");
        assert.match((await page.locator(".timing-error").textContent()) ?? "", /2 s/);
        await total.focus();
        await total.press("Escape");
        assert.equal(await total.inputValue(), "4");
        await total.fill("5");
        await total.blur();
        await h.settled();
        assert.equal(h.writes().length, 2);
        assert.match(h.text, /hold 3000ms/);
        // A clean focused field follows its acknowledged revision and accepts another Enter.
        await total.fill("6");
        await total.press("Enter");
        await h.settled();
        await total.fill("7");
        await total.press("Enter");
        await h.settled();
        assert.match(h.text, /hold 5000ms/);
        await page.locator('.timeline .bar[data-path="0.0"]').click();
        const action = page.getByRole("textbox", {
          name: "Selected action duration (s)",
          exact: true,
        });
        await action.fill("1.5");
        await action.press("Enter");
        await h.settled();
        assert.match(h.text, /reveal a over 1500ms/);
        const beforeCancel = h.text;
        const grip = page.locator('.timeline .bar[data-path="0.0"] .grip');
        const box = (await grip.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y + box.height / 2);
        await grip.dispatchEvent("pointercancel", { pointerId: 1 });
        await page.mouse.up();
        await h.settled();
        assert.equal(h.text, beforeCancel);
      },
    },
    {
      name: "story lifecycle: deletion confirms, clears playback, and preserves the diagram",
      text: SOURCE,
      async run(h) {
        const { page } = h;
        await pick(h);
        await page.getByRole("button", { name: "Delete story", exact: true }).click();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(h.text, SOURCE);
        await page.getByRole("button", { name: "Delete story", exact: true }).click();
        await page.getByRole("button", { name: "Delete all", exact: true }).click();
        await h.settled();
        assert.doesNotMatch(h.text, /story tour/);
        assert.match(h.text, /\/\/ Keep the diagram\.\ndiagram d: flow/);
        assert.equal(await page.locator(".timeline").isVisible(), false);
        // A remote/undo source update restores the story's exact code, without reviving playback.
        await h.type(SOURCE);
        assert.equal(h.text, SOURCE);
        assert.equal(await page.locator(".timeline").isVisible(), false);
        await pick(h);
        await h.settings({ readOnly: true });
        assert.equal(
          await page.getByRole("button", { name: "Delete story", exact: true }).isVisible(),
          false,
        );
        assert.equal(await page.locator(".story-timing").isVisible(), false);
      },
    },
    {
      name: "story lifecycle: parallel timing stays derived and transitions have numerical durations",
      text: `diagram d: flow { a -> b }
story tour for d {
  scene first {
    transition fade over 500ms
    parallel { reveal a over 2s; highlight b over 1s }
    hold 1s
  }
  scene next { transition cut; hold 1s }
}
`,
      async run(h) {
        const { page } = h;
        await pick(h);
        const total = page.getByRole("textbox", { name: "Scene duration (s)", exact: true });
        assert.equal(await total.inputValue(), "3.5");
        await page.locator('.timeline .bar[data-path="0"]').click();
        const time = page.getByRole("textbox", {
          name: "Selected action duration (s)",
          exact: true,
        });
        assert.equal(await time.inputValue(), "0.5");
        await time.fill("0.75");
        await time.press("Enter");
        await h.settled();
        assert.match(h.text, /transition fade over 750ms/);
        assert.equal(await total.inputValue(), "3.75");
        await page.locator('.timeline .bar[data-path="0.0.1"]').click();
        await time.fill("3");
        await time.press("Enter");
        await h.settled();
        assert.equal(await total.inputValue(), "4.75");
        assert.match(h.text, /parallel \{ reveal a over 2s; highlight b over 3000ms \}/);
        assert.equal(
          await page.locator('.timeline .bar[data-path="1"]').count(),
          0,
          "cut remains instantaneous",
        );
        // A source update that cannot produce a new frame still invalidates a dirty draft.
        await total.fill("6");
        await h.type(h.text.replace("for d", "for absent"));
        const invalid = h.text;
        await total.press("Enter");
        await h.settled();
        assert.equal(h.text, invalid);
        assert.match((await page.locator(".timing-error").textContent()) ?? "", /changed/);
      },
    },
    {
      name: "story lifecycle: dependent exports need explicit confirmation and stale deletion writes nothing",
      text: SOURCE + "export player for tour { format html }\n",
      async run(h) {
        const { page } = h;
        await pick(h);
        const remove = page.getByRole("button", { name: "Delete story", exact: true });
        const confirm = page.getByRole("button", { name: "Delete all", exact: true });
        await remove.click();
        await h.type(h.text + "// Concurrent change.\n");
        const changed = h.text;
        await confirm.click();
        await h.settled();
        assert.equal(h.text, changed);
        await remove.click();
        await confirm.click();
        await h.settled();
        assert.match((await page.getByRole("dialog").textContent()) ?? "", /player/);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        assert.equal(h.text, changed);
        await remove.click();
        await confirm.click();
        await h.settled();
        await h.type(h.text + "export anotherPlayer for tour { format html }\n");
        const changedDependencies = h.text;
        await confirm.click();
        await h.settled();
        assert.equal(
          h.text,
          changedDependencies,
          "the second confirmation cannot delete new dependencies",
        );
        await remove.click();
        await confirm.click();
        await h.settled();
        await confirm.click();
        await h.settled();
        assert.doesNotMatch(h.text, /story tour|export player/);
        assert.match(h.text, /Concurrent change/);
      },
    },
    {
      name: "story lifecycle: another document with the same ids and revision rejects late playback",
      text: SOURCE,
      async run(h) {
        const first = new CanvasSession({ path: "one.meltemi" });
        const second = new CanvasSession({ path: "two.meltemi" });
        first.update(h.analyze(SOURCE, 1));
        const late = first
          .receive({ type: "pickStory", story: "tour" })
          .messages.find((m) => m.type === "story")!;
        const fresh = second.update(h.analyze(SOURCE.replace("a -> b", "a -> c"), 1));
        for (const message of fresh) await h.postRaw(message);
        await h.postRaw(late);
        assert.equal(await h.page.locator(".timeline").isVisible(), false);
        assert.equal(
          await h.page.locator('.content g[data-role="element"][data-id="c"]').count(),
          1,
        );
        // A note/empty file has no render to hold the current identity. Old playback must still
        // be refused, even at an equal or larger local revision.
        await h.postRaw({
          type: "empty",
          document: "notes.md",
          revision: 1,
          message: "Open a source file.",
        });
        await h.postRaw({
          type: "story",
          document: "notes.md",
          revision: 1,
          stories: [],
          playback: null,
        });
        await h.postRaw(late);
        await h.postRaw({ ...late, revision: 2 });
        assert.equal(await h.page.locator(".timeline").isVisible(), false);
        assert.equal(await h.page.locator(".content svg").count(), 0);
        for (const message of first.state()) await h.postRaw(message);
        assert.equal(await h.page.locator(".timeline").isVisible(), true);
        const broken = new CanvasSession({ path: "broken.meltemi" });
        const diagnostic = broken.update(h.analyze("diagram d: flow { a -> }", 1));
        assert.ok(diagnostic.some((message) => message.type === "stale"));
        for (const message of diagnostic) await h.postRaw(message);
        await h.postRaw(late);
        assert.equal(await h.page.locator(".timeline").isVisible(), false);
        assert.equal(await h.page.locator(".content svg").count(), 0);
      },
    },
  ];
