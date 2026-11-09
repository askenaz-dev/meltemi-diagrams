import assert from "node:assert/strict";
import { CanvasSession, type CanvasSettings, type analyzeDocument } from "@meltemi/diagrams-editor";
import { compile } from "@meltemi/diagrams-model";
import type { Locator, Page } from "playwright-core";

/** The real host loop shared with the extension's webview tests. */
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
  undo(): Promise<void>;
  writes(): unknown[];
  intercept: ((message: unknown) => Promise<void>) | undefined;
}

const SOURCE = `// The diagram is unrelated to ordering.
diagram d: flow { a -> b; b -> c }
story tour for d {
  scene first {
    transition fade over 250ms
    // Reveal belongs to this clip.
    reveal a over 1250ms // Keep the exact duration.
    highlight b over 775ms
    hold 333ms // A precise pause.
  }
  scene next { hold 1s }
}
story alternate for d { scene elsewhere { hold 2s } }
export player for tour { format html }
`;

const PARALLEL = `diagram d: flow { a -> b; b -> c }
story tour for d {
  scene first {
    transition fade over 250ms
    hold 333ms
    // Keep the group and every nested action together.
    parallel {
      reveal a over 800ms // A child comment.
      parallel { highlight b over 300ms; camera c over 500ms }
    }
    hold 700ms
  }
  scene next { hold 1s }
}
`;

const SHORT_CLIPS = `diagram d: flow { a -> b }
story tour for d {
  scene first {
    hold 1000ms
    hold 0ms // The instantaneous clip.
  }
  scene next {
    hold 1000ms
    hold 1ms // The short clip.
  }
}
`;

const ZERO_CLIPS = `diagram d: flow { a -> b }
story tour for d {
  scene first {
    hold 0ms // First clip.
    hold 0ms // Second clip.
    hold 0ms // Third clip.
  }
}
`;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const bar = (page: Page, path: string) => page.locator(`.timeline .bar[data-path="${path}"]`);

async function boxOf(element: Locator): Promise<Rect> {
  const box = await element.boundingBox();
  assert.ok(box, "the timeline clip is visible");
  return box;
}

async function pick(h: Harness): Promise<void> {
  await h.page.getByRole("combobox", { name: "Story", exact: true }).selectOption("tour");
  await h.settled();
  // The opening animation scales the ruler; wait before measuring actual pointer positions.
  await h.page
    .locator(".timeline")
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => null))),
    );
}

/** Starts a body drag towards the first slot, leaving the pointer down for the caller. */
async function dragEarlier(h: Harness, path = "0.2"): Promise<Rect> {
  const selected = bar(h.page, path);
  const from = await boxOf(selected);
  const first = await boxOf(bar(h.page, `${path.split(".")[0]}.0`));
  // The left part is the body, safely away from the existing right resize grip.
  const grab = Math.min(16, from.width / 3);
  await h.page.mouse.move(from.x + grab, from.y + from.height / 2);
  await h.page.mouse.down();
  await h.page.mouse.move(first.x + grab, from.y + from.height / 2, { steps: 8 });
  await h.settled();
  return from;
}

/** Finds an actual exposed body pixel, rather than clicking a resize grip or overlapping clip. */
async function bodyPoint(element: Locator): Promise<{ x: number; y: number }> {
  const point = await element.evaluate((clip) => {
    const box = clip.getBoundingClientRect();
    for (let y = box.top + 2; y < box.bottom - 1; y += 2) {
      for (let x = box.left + 2; x < box.right - 1; x += 2) {
        const target = document.elementFromPoint(x, y);
        if (target?.closest(".bar") === clip && !target.closest(".grip")) return { x, y };
      }
    }
    return null;
  });
  assert.ok(point, "each short or instantaneous clip exposes a body separate from its resize grip");
  return point;
}

function actionOf(message: unknown): { kind: string; path?: number[]; index?: number } | undefined {
  const value = message as {
    type?: string;
    action?: { kind: string; path?: number[]; index?: number };
  };
  return value.type === "action" ? value.action : undefined;
}

function sceneOf(text: string) {
  const compilation = compile(text);
  assert.deepEqual(
    compilation.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  return compilation.document.stories.find((story) => story.id === "tour")!.scenes[0]!;
}

async function noPreview(page: Page): Promise<void> {
  assert.equal(await page.locator(".story-drag-preview, .story-insertion-marker").count(), 0);
}

export const storyReorderTests: {
  name: string;
  text: string;
  touch?: boolean;
  run(h: Harness): Promise<void>;
}[] = [
  {
    name: "story reorder: body insertion preserves precise times and total, commits once and undoes exactly",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      const original = sceneOf(h.text);
      const from = await dragEarlier(h);
      assert.equal(h.text, SOURCE, "a drag preview does not write source");
      assert.equal(h.writes().length, 0);
      assert.equal(await page.locator(".story-insertion-marker").isVisible(), true);
      assert.ok((await page.locator(".story-drop-label").textContent())?.trim());
      const preview = await boxOf(page.locator(".story-drag-preview"));
      assert.ok(Math.abs(preview.width - from.width) < 1, "dragging never resizes the clip");
      await page.mouse.up();
      await h.settled();
      assert.equal(h.writes().length, 1);
      assert.deepEqual(actionOf(h.writes()[0]), {
        kind: "reorderStoryAction",
        story: "tour",
        path: [0, 2],
        index: 0,
      });
      const moved = sceneOf(h.text);
      assert.deepEqual(
        moved.actions.map((action) => [action.kind, action.durationMs]),
        [
          ["hold", 333],
          ["reveal", 1250],
          ["highlight", 775],
        ],
      );
      assert.equal(moved.actions[0]!.startMs, 250, "the transition remains the fixed prefix");
      assert.equal(moved.durationMs, original.durationMs);
      assert.equal(compile(h.text).document.stories[0]!.durationMs, 3608);
      assert.match(h.text, /hold 333ms \/\/ A precise pause\./);
      assert.match(
        h.text,
        /\/\/ Reveal belongs to this clip\.\n {4}reveal a over 1250ms \/\/ Keep the exact duration\./,
      );
      assert.ok(
        h.text.endsWith(
          "story alternate for d { scene elsewhere { hold 2s } }\nexport player for tour { format html }\n",
        ),
      );
      await noPreview(page);
      await h.undo();
      assert.equal(h.text, SOURCE, "the actual edit plan's inverse restores every source byte");
    },
  },
  {
    name: "story reorder: the right grip keeps resizing rather than reordering",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const grip = bar(h.page, "0.0").locator(".grip");
      const box = await boxOf(grip);
      await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await h.page.mouse.down();
      await h.page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
      await h.page.mouse.up();
      await h.settled();
      assert.equal(h.writes().length, 1);
      assert.equal(actionOf(h.writes()[0])?.kind, "setStoryTiming");
      assert.deepEqual(actionOf(h.writes()[0])?.path, [0, 0]);
      const scene = sceneOf(h.text);
      assert.deepEqual(
        scene.actions.map((action) => action.kind),
        ["reveal", "highlight", "hold"],
      );
      assert.ok(scene.actions[0]!.durationMs > 1250);
      assert.equal(scene.actions[1]!.durationMs, 775);
      assert.equal(scene.actions[2]!.durationMs, 333);
      await noPreview(h.page);
    },
  },
  {
    name: "story reorder: a parallel header moves the intact nested group and child bodies do not reorder",
    text: PARALLEL,
    async run(h) {
      await pick(h);
      const { page } = h;
      const child = bar(page, "0.1.0");
      assert.equal(await child.locator(".grip").count(), 1);
      assert.equal(await child.evaluate((element) => element.classList.contains("movable")), false);
      const from = await boxOf(child);
      const before = await boxOf(bar(page, "0.0"));
      await page.mouse.move(from.x + 16, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + 8, from.y + from.height / 2, { steps: 6 });
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, PARALLEL);
      assert.equal(h.writes().length, 0, "children remain simultaneous members of their group");
      assert.equal(
        await bar(page, "0.1").evaluate((element) => element.classList.contains("movable")),
        true,
      );
      const group = sceneOf(h.text).actions[1]!;
      const groupSource = h.text.slice(group.node.start, group.node.end);
      await dragEarlier(h, "0.1");
      await page.mouse.up();
      await h.settled();
      assert.equal(h.writes().length, 1);
      const scene = sceneOf(h.text);
      const moved = scene.actions[0]!;
      assert.equal(moved.kind, "parallel");
      assert.equal(h.text.slice(moved.node.start, moved.node.end), groupSource);
      assert.equal(moved.children.length, 2);
      assert.equal(moved.children[1]!.children.length, 2);
      assert.ok(moved.children.every((action) => action.startMs === moved.startMs));
      assert.ok(moved.children[1]!.children.every((action) => action.startMs === moved.startMs));
      assert.equal(scene.transition!.durationMs, 250);
      assert.equal(scene.durationMs, 2083);
      await h.undo();
      assert.equal(h.text, PARALLEL);
    },
  },
  {
    name: "story reorder: Escape, pointer cancellation, lost capture and outside drops abandon the preview",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      for (const cancel of ["Escape", "pointercancel", "lostpointercapture", "outside"] as const) {
        await dragEarlier(h);
        assert.equal(await page.locator(".story-drag-preview").isVisible(), true);
        if (cancel === "Escape") await page.keyboard.press("Escape");
        else if (cancel === "outside") {
          const otherScene = await boxOf(page.locator(".scene-row").nth(1));
          await page.mouse.move(
            otherScene.x + otherScene.width / 2,
            otherScene.y + otherScene.height / 2,
          );
        } else await bar(page, "0.2").dispatchEvent(cancel, { pointerId: 1 });
        await page.mouse.up();
        await h.settled();
        assert.equal(h.text, SOURCE, `${cancel} writes nothing`);
        assert.equal(h.writes().length, 0);
        await noPreview(page);
      }
    },
  },
  {
    name: "story reorder: source updates, read-only and story or document navigation cancel captured paths",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      await dragEarlier(h);
      const updated = `${SOURCE}// A concurrent source update.\n`;
      await h.type(updated);
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, updated, "a source update cancels the pending path");
      assert.equal(h.writes().length, 0);
      await noPreview(page);
      await dragEarlier(h);
      await h.settings({ readOnly: true });
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, updated, "read-only cancels the pending path");
      assert.equal(h.writes().length, 0);
      await noPreview(page);
      assert.equal(
        await page.getByRole("button", { name: "Move earlier", exact: true }).isVisible(),
        false,
      );
      await h.settings({ readOnly: false });
      await dragEarlier(h);
      await page.getByRole("combobox", { name: "Story", exact: true }).selectOption("alternate");
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, updated, "switching stories cancels the pending path");
      assert.equal(h.writes().length, 0);
      await noPreview(page);
      await pick(h);
      await dragEarlier(h);
      // A different document may have the same story ids and revision: identity must still cancel.
      const other = new CanvasSession({ path: "another.meltemi" });
      for (const message of other.update(h.analyze(SOURCE, h.revision))) await h.postRaw(message);
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, updated, "switching documents cancels the pending path");
      assert.equal(h.writes().length, 0);
      await noPreview(page);
    },
  },
  {
    name: "story reorder: keyboard and buttons keep selection and duration edits on the acknowledged action",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      await bar(page, "0.0").click();
      const earlier = page.getByRole("button", { name: "Move earlier", exact: true });
      const later = page.getByRole("button", { name: "Move later", exact: true });
      for (const control of [earlier, later])
        assert.ok((await boxOf(control)).height <= 32, "move controls fit the compact timing row");
      assert.equal(await earlier.isDisabled(), true);
      assert.equal(await later.isDisabled(), false);
      await bar(page, "0.0").press("Alt+ArrowRight");
      await h.settled();
      assert.deepEqual(
        sceneOf(h.text).actions.map((action) => action.kind),
        ["highlight", "reveal", "hold"],
      );
      assert.equal(
        await bar(page, "0.1").evaluate((element) => element.classList.contains("selected")),
        true,
      );
      const duration = page.getByRole("textbox", {
        name: "Selected action duration (s)",
        exact: true,
      });
      assert.equal(await duration.inputValue(), "1.25");
      const ruler = page.locator(".timeline .ruler");
      const time = Number(await ruler.getAttribute("aria-valuenow"));
      const writes = h.writes().length;
      await bar(page, "0.1").press("ArrowRight");
      await h.settled();
      assert.equal(Number(await ruler.getAttribute("aria-valuenow")), time + 100);
      assert.equal(h.writes().length, writes, "plain arrows continue scrubbing");
      await duration.fill("1.3");
      await duration.press("Enter");
      await h.settled();
      assert.match(h.text, /reveal a over 1300ms/);
      assert.match(h.text, /highlight b over 775ms/);
      assert.deepEqual(actionOf(h.writes().at(-1))?.path, [0, 1]);
      await earlier.click();
      await h.settled();
      assert.equal(sceneOf(h.text).actions[0]!.kind, "reveal");
      assert.equal(
        await bar(page, "0.0").evaluate((element) => element.classList.contains("selected")),
        true,
      );
      assert.equal(await duration.inputValue(), "1.3");
      await bar(page, "0.2").click();
      assert.equal(await later.isDisabled(), true);
      await bar(page, "0.2").press("Alt+ArrowRight");
      await h.settled();
      assert.equal(h.writes().length, 3, "moving beyond the final slot is a no-op");
    },
  },
  {
    name: "story reorder: a rejected source revision restores the original clip selection and announces why",
    text: SOURCE,
    async run(h) {
      await pick(h);
      h.intercept = async (message) => {
        if (actionOf(message)?.kind === "reorderStoryAction") {
          // The real session refuses this request, exactly as when the host already has newer text.
          (message as { revision: number }).revision = -1;
        }
      };
      try {
        await dragEarlier(h);
        await h.page.mouse.up();
        await h.settled();
        assert.equal(h.text, SOURCE);
        assert.equal(h.writes().length, 1);
        assert.equal(
          await bar(h.page, "0.2").evaluate((element) => element.classList.contains("selected")),
          true,
        );
        assert.match(
          (await h.page.locator(".status").textContent()) ?? "",
          /changed|revision|again/i,
        );
        await noPreview(h.page);
      } finally {
        h.intercept = undefined;
      }
    },
  },
  {
    name: "story reorder: clicks and sub-threshold body movement select without changing source",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const clip = bar(h.page, "0.1");
      await clip.click();
      assert.equal(await clip.evaluate((element) => element.classList.contains("selected")), true);
      const box = await boxOf(clip);
      await h.page.mouse.move(box.x + 16, box.y + box.height / 2);
      await h.page.mouse.down();
      await h.page.mouse.move(box.x + 19, box.y + box.height / 2);
      await h.page.mouse.up();
      await h.settled();
      assert.equal(h.text, SOURCE);
      assert.equal(h.writes().length, 0);
      await noPreview(h.page);
    },
  },
  {
    name: "story reorder: a same-revision refresh preserves the pending acknowledgement and blocks another write",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      let release = () => {};
      let refreshed = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const refresh = new Promise<void>((resolve) => {
        refreshed = resolve;
      });
      h.intercept = async (message) => {
        if (actionOf(message)?.kind !== "reorderStoryAction") return;
        // The host has not accepted the move yet. A ready/refresh can legitimately redraw this
        // same base revision while the single source request remains in flight.
        await page.evaluate((messages) => {
          for (const message of messages) window.postMessage(message, "*");
        }, h.session.state());
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
        refreshed();
        await held;
      };
      try {
        await dragEarlier(h);
        await page.mouse.up();
        await refresh;
        assert.equal(h.text, SOURCE, "the source edit is still held at the host");
        assert.equal(h.writes().length, 1);
        const duration = page.getByRole("textbox", {
          name: "Selected action duration (s)",
          exact: true,
        });
        assert.equal(await duration.isDisabled(), true);
        assert.equal(
          await page.getByRole("button", { name: "Move earlier", exact: true }).isDisabled(),
          true,
        );
        await bar(page, "0.2").press("Alt+ArrowLeft");
        await bar(page, "0.2").press("Delete");
        const grip = await boxOf(bar(page, "0.2").locator(".grip"));
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip.x + 40, grip.y + grip.height / 2);
        await page.mouse.up();
        assert.equal(
          h.writes().length,
          1,
          "another reorder, deletion and resize wait for acknowledgement",
        );
        release();
        await h.settled();
        assert.equal(
          await bar(page, "0.0").evaluate((element) => element.classList.contains("selected")),
          true,
        );
        assert.equal(await duration.isDisabled(), false);
        assert.equal(await duration.inputValue(), "0.333");
        await duration.fill("0.444");
        await duration.press("Enter");
        await h.settled();
        assert.match(h.text, /hold 444ms \/\/ A precise pause\./);
        assert.match(h.text, /reveal a over 1250ms/);
        assert.match(h.text, /highlight b over 775ms/);
        assert.deepEqual(actionOf(h.writes().at(-1))?.path, [0, 0]);
        assert.equal(h.writes().length, 2);
      } finally {
        release();
        h.intercept = undefined;
      }
    },
  },
  {
    name: "story reorder: a keyboard move cancels an active resize before release and acknowledgement",
    text: SOURCE,
    async run(h) {
      await pick(h);
      const { page } = h;
      let release = () => {};
      let arrived = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const submitted = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      h.intercept = async (message) => {
        if (actionOf(message)?.kind !== "reorderStoryAction") return;
        arrived();
        await held;
      };
      try {
        await bar(page, "0.0").click();
        const grip = await boxOf(bar(page, "0.0").locator(".grip"));
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2, { steps: 6 });
        await bar(page, "0.0").press("Alt+ArrowRight");
        await submitted;
        assert.equal(h.text, SOURCE, "the move has not been accepted at the host yet");
        await page.mouse.up();
        assert.equal(
          h.writes().length,
          1,
          "the abandoned resize cannot emit its old indexed action",
        );
        assert.deepEqual(actionOf(h.writes()[0]), {
          kind: "reorderStoryAction",
          story: "tour",
          path: [0, 0],
          index: 1,
        });
        release();
        await h.settled();
        const actions = sceneOf(h.text).actions;
        assert.deepEqual(
          actions.map((action) => [action.kind, action.durationMs]),
          [
            ["highlight", 775],
            ["reveal", 1250],
            ["hold", 333],
          ],
        );
        assert.equal(
          await bar(page, "0.1").evaluate((element) => element.classList.contains("selected")),
          true,
        );
        assert.equal(h.writes().length, 1);
      } finally {
        release();
        h.intercept = undefined;
      }
    },
  },
  {
    name: "story reorder: zero-duration and one-millisecond clips expose movable bodies without resizing",
    text: SHORT_CLIPS,
    async run(h) {
      await pick(h);
      const { page } = h;
      for (const scene of [0, 1]) {
        const path = `${scene}.1`;
        const clip = bar(page, path);
        const from = await boxOf(clip);
        const point = await bodyPoint(clip);
        const first = await boxOf(bar(page, `${scene}.0`));
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(first.x + point.x - from.x, point.y, { steps: 8 });
        assert.equal(await page.locator(".story-drag-preview").isVisible(), true);
        await page.mouse.up();
        await h.settled();
        assert.equal(actionOf(h.writes().at(-1))?.kind, "reorderStoryAction");
        assert.deepEqual(actionOf(h.writes().at(-1))?.path, [scene, 1]);
        assert.equal(actionOf(h.writes().at(-1))?.index, 0);
      }
      const scenes = compile(h.text).document.stories[0]!.scenes;
      assert.deepEqual(
        scenes.map((scene) => scene.actions.map((action) => action.durationMs)),
        [
          [0, 1000],
          [1, 1000],
        ],
      );
      assert.deepEqual(
        scenes.map((scene) => scene.durationMs),
        [1000, 1001],
      );
      assert.equal(h.writes().length, 2);
      assert.match(h.text, /hold 0ms \/\/ The instantaneous clip\./);
      assert.match(h.text, /hold 1ms \/\/ The short clip\./);
      await noPreview(page);
    },
  },
  {
    name: "story reorder: all-zero scenes keep reachable clips and button alternatives without a fake time drag",
    text: ZERO_CLIPS,
    async run(h) {
      await pick(h);
      const { page } = h;
      for (const path of ["0.0", "0.1", "0.2"]) await bodyPoint(bar(page, path));
      const point = await bodyPoint(bar(page, "0.2"));
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 40, point.y, { steps: 6 });
      await page.mouse.up();
      await h.settled();
      assert.equal(h.text, ZERO_CLIPS);
      assert.equal(h.writes().length, 0, "zero-length time has no pointer insertion destination");
      await noPreview(page);
      const selected = await bodyPoint(bar(page, "0.2"));
      await page.mouse.click(selected.x, selected.y);
      await page.getByRole("button", { name: "Move earlier", exact: true }).click();
      await h.settled();
      assert.equal(
        await bar(page, "0.1").evaluate((element) => element.classList.contains("selected")),
        true,
      );
      assert.ok(h.text.indexOf("Third clip.") < h.text.indexOf("Second clip."));
      assert.equal(compile(h.text).document.stories[0]!.durationMs, 0);
      await page.getByRole("button", { name: "Move later", exact: true }).click();
      await h.settled();
      assert.equal(h.text, ZERO_CLIPS);
      assert.equal(h.writes().length, 2);
    },
  },
  {
    name: "story reorder: real touch supports horizontal insertion and leaves vertical movement unwritten",
    text: SOURCE,
    touch: true,
    async run(h) {
      await pick(h);
      const { page } = h;
      const input = await page.context().newCDPSession(page);
      const from = await boxOf(bar(page, "0.2"));
      const first = await boxOf(bar(page, "0.0"));
      const start = { x: from.x + 16, y: from.y + from.height / 2 };
      const finger = (x: number, y: number) => [{ id: 1, x, y }];
      await input.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: finger(start.x, start.y),
      });
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: finger(start.x + 1, start.y - 35),
      });
      await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await h.settled();
      assert.equal(h.text, SOURCE);
      assert.equal(h.writes().length, 0);
      await noPreview(page);
      await input.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: finger(start.x, start.y),
      });
      for (let step = 1; step <= 8; step++) {
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: finger(start.x + ((first.x + 16 - start.x) * step) / 8, start.y),
        });
      }
      await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await h.settled();
      assert.equal(h.writes().length, 1);
      assert.equal(sceneOf(h.text).actions[0]!.kind, "hold");
      assert.equal(sceneOf(h.text).durationMs, 2608);
      await input.detach();
    },
  },
];
