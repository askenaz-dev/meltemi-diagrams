import assert from "node:assert/strict";
import { join } from "node:path";
import type { CanvasSession, CanvasSettings, analyzeDocument } from "@meltemi/diagrams-editor";
import { compile } from "@meltemi/diagrams-model";
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
  reload(patch?: Record<string, unknown>): Promise<void>;
  undo(): Promise<void>;
  writes(): unknown[];
  intercept: ((message: unknown) => Promise<void>) | undefined;
}

const DIAGRAM = "// Keep the diagram and its comment.\ndiagram d: flow { a -> b }\n";
const TOUR = `story tour for d {
  scene first { hold 4s }
  scene middle {}
  scene last {}
}
`;
const SOURCE = DIAGRAM + TOUR + "story other for d { scene elsewhere { hold 1s } }\n";
const TIMED =
  DIAGRAM +
  `story tour for d {
  scene first { highlight a over 4s }
  scene next { highlight b over 4s }
  scene last { hold 1s }
}
`;

const OVERLAPPING_CLIPS =
  DIAGRAM +
  `story tour for d {
  scene first { hold 4s }
  scene next {
    overlap 2s
    transition fade over 2s
    reveal a over 1s
    highlight b over 1s
    hold 1s // Keep this clip's comment.
  }
  scene last { hold 1s }
}
`;

async function pick(h: Harness, spanish = false) {
  await h.page
    .getByRole("combobox", { name: spanish ? "Historia" : "Story", exact: true })
    .selectOption("tour");
  await h.settled();
  await h.page
    .locator(".timeline")
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => null))),
    );
}

const selected = (page: Page, spanish = false) =>
  page.getByRole("combobox", {
    name: spanish ? "Escena seleccionada" : "Selected scene",
    exact: true,
  });

async function namedSelection(h: Harness, id: string, spanish = false) {
  await selected(h.page, spanish).selectOption(id);
  await h.settled();
  assert.equal(await selected(h.page, spanish).inputValue(), id);
  assert.deepEqual(
    await h.page
      .locator(".timeline .selected-scene")
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.scene)),
    [id],
  );
}

function tour(text: string) {
  return compile(text).document.stories.find((story) => story.id === "tour")!;
}

function holdAction(h: Harness, kind: string) {
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent = new Promise<void>((resolve) => {
    entered = resolve;
  });
  h.intercept = async (message) => {
    if ((message as { action?: { kind?: string } }).action?.kind !== kind) return;
    entered();
    await held;
  };
  return {
    sent,
    async release() {
      release();
      h.intercept = undefined;
      await h.settled();
    },
  };
}

export function storyWorkspaceTests(output: string) {
  return [
    {
      name: "story workspace: dragging overlapping scene clips uses concurrent transition timing and exact undo",
      text: OVERLAPPING_CLIPS,
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        await namedSelection(h, "next");
        const original = tour(h.text);
        const from = await page.locator('.timeline .bar[data-path="1.2"]').boundingBox();
        const target = await page.locator('.timeline .bar[data-path="1.1"]').boundingBox();
        assert.ok(from);
        assert.ok(target);
        const grab = Math.min(16, from.width / 3);
        await page.mouse.move(from.x + grab, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.x + grab, from.y + from.height / 2, { steps: 8 });
        await h.settled();
        const marker = page.locator(".story-insertion-marker");
        assert.equal(await marker.isVisible(), true);
        assert.equal(
          await marker.evaluate((element) => (element as HTMLElement).style.left),
          "50%",
          "the second insertion slot is at 3 s, while the fade runs concurrently from 2 s",
        );
        assert.equal(h.text, OVERLAPPING_CLIPS);
        await page.mouse.up();
        await h.settled();
        const moved = tour(h.text);
        assert.deepEqual(
          moved.scenes[1]!.actions.map((action) => [action.kind, action.startMs]),
          [
            ["reveal", 2000],
            ["hold", 3000],
            ["highlight", 4000],
          ],
        );
        assert.equal(moved.durationMs, original.durationMs);
        assert.equal(moved.scenes[1]!.transition?.durationMs, 2000);
        assert.equal(h.writes().length, 1);
        assert.ok(h.text.includes("hold 1s // Keep this clip's comment."));
        await h.undo();
        assert.equal(h.text, OVERLAPPING_CLIPS);
      },
    },
    ...[false, true].map((spanish) => ({
      name: `story workspace: ${spanish ? "Spanish" : "English"} empty scenes retain selection, editable names and exact undo`,
      lang: spanish ? "es" : "en",
      text: SOURCE,
      async run(h: Harness) {
        const { page } = h;
        await pick(h, spanish);
        await namedSelection(h, "middle", spanish);
        const duration = page.getByRole("textbox", {
          name: spanish ? "Duración de la escena (s)" : "Scene duration (s)",
          exact: true,
        });
        assert.equal(await duration.inputValue(), "0");
        await namedSelection(h, "last", spanish);
        assert.equal(
          Number(await page.locator(".timeline .ruler").getAttribute("aria-valuenow")),
          4000,
        );
        assert.equal(
          await page
            .locator(".timeline .tracks")
            .evaluate(
              (element) =>
                element.scrollWidth <= element.clientWidth + 1 && element.scrollLeft === 0,
            ),
          true,
        );
        const label = page.locator('.scene-row[data-scene="last"] .scene-label');
        await label.focus();
        await label.press("F2");
        const name = page.getByRole("textbox", {
          name: spanish ? "Nombre de la escena" : "Scene name",
          exact: true,
        });
        assert.equal(await name.evaluate((input) => input === document.activeElement), true);
        await name.fill(spanish ? "Producción" : "Production");
        const rename = holdAction(h, "setSceneTitle");
        try {
          await name.press("Enter");
          await rename.sent;
          const refresh = h.session.state().find((message) => message.type === "story");
          assert.ok(refresh);
          await page.evaluate(async (message) => {
            window.postMessage(message, "*");
            await new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            );
          }, refresh);
          assert.equal(
            await name.inputValue(),
            spanish ? "Producción" : "Production",
            "a submitted name stays visible until acknowledgement",
          );
          assert.equal(await name.isDisabled(), true);
          assert.equal(h.text, SOURCE);
        } finally {
          await rename.release();
        }
        assert.equal(tour(h.text).scenes[2]!.id, "last");
        assert.equal(tour(h.text).scenes[2]!.title, spanish ? "Producción" : "Production");
        assert.equal(await selected(page, spanish).inputValue(), "last");
        await h.undo();
        assert.equal(h.text, SOURCE);
        const storyName = page.getByRole("textbox", {
          name: spanish ? "Nombre de la historia" : "Story name",
          exact: true,
        });
        await storyName.fill(spanish ? "Entornos independientes" : "Independent environments");
        await storyName.press("Enter");
        await h.settled();
        assert.equal(
          tour(h.text).title,
          spanish ? "Entornos independientes" : "Independent environments",
        );
        assert.equal(tour(h.text).id, "tour");
        const writes = h.writes().length;
        await storyName.press("Enter");
        await storyName.blur();
        await h.settled();
        assert.equal(h.writes().length, writes, "an unchanged name is not written twice");
        await page.screenshot({
          path: join(output, `story-workspace-${spanish ? "es" : "en"}.png`),
        });
        await h.undo();
        assert.equal(h.text, SOURCE);
        assert.equal(
          await page
            .locator(".timeline")
            .getByRole("button", {
              name: spanish ? "Eliminar historia" : "Delete story",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(
          await page
            .locator(".toolbar")
            .getByRole("button", {
              name: spanish ? "Eliminar historia" : "Delete story",
              exact: true,
            })
            .isVisible(),
          true,
        );
      },
    })),
    {
      name: "story workspace: height drag, cancellation, keyboard and reload only persist local view state",
      text: SOURCE,
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        await namedSelection(h, "middle");
        const edge = page.getByRole("separator", { name: "Story panel height", exact: true });
        const height = () =>
          page.locator(".timeline").evaluate((element) => element.getBoundingClientRect().height);
        const initial = await height();
        await edge.press("ArrowUp");
        assert.equal(await height(), initial + 10);
        await page.setViewportSize({ width: 1100, height: 820 });
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        assert.equal(
          await page
            .locator('.scene-row[data-scene="middle"] .scene-label')
            .getAttribute("aria-pressed"),
          "true",
          "a width-triggered row rebuild retains selection",
        );
        const saved = await page.evaluate(
          () => (window as { __state?: { storyPanelHeight?: number } }).__state?.storyPanelHeight,
        );
        assert.equal(saved, initial + 10);
        const drag = async (dy: number) => {
          const bounds = (await edge.boundingBox())!;
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await page.mouse.down();
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - dy, {
            steps: 6,
          });
        };
        await drag(70);
        assert.ok((await height()) > saved! + 50);
        await page.keyboard.press("Escape");
        await page.mouse.up();
        assert.equal(await height(), saved);
        await drag(60);
        await page.mouse.up();
        const resized = await height();
        assert.ok(resized >= saved! + 50);
        assert.equal(h.text, SOURCE);
        assert.equal(h.writes().length, 0);
        await h.reload();
        await pick(h);
        await namedSelection(h, "middle");
        assert.equal(await height(), resized);
        await h.settings({ readOnly: true });
        assert.equal(
          await page
            .locator('.scene-row[data-scene="middle"]')
            .evaluate((element) => element.classList.contains("selected-scene")),
          true,
          "a read-only row rebuild retains the editing target",
        );
        await edge.press("ArrowDown");
        assert.equal(await height(), resized - 10);
        assert.equal(h.writes().length, 0);
      },
    },
    {
      name: "story workspace: deletion locks duplicate writes and rejects a confirmation after a source change",
      text: SOURCE,
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        await namedSelection(h, "middle");
        const remove = page
          .locator(".timeline")
          .getByRole("button", { name: "Delete scene", exact: true });
        await remove.click();
        let release!: () => void;
        let entered!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const sent = new Promise<void>((resolve) => {
          entered = resolve;
        });
        h.intercept = async (message) => {
          if ((message as { action?: { kind?: string } }).action?.kind === "removeScene") {
            entered();
            await held;
          }
        };
        await page.getByRole("button", { name: "Delete all", exact: true }).click();
        await sent;
        try {
          const refresh = h.session.state().find((message) => message.type === "story");
          assert.ok(refresh);
          // Do not wait for the held host job while posting this ordinary refresh.
          await page.evaluate((message) => window.postMessage(message, "*"), refresh);
          await page.waitForFunction(
            () =>
              document.querySelector<HTMLButtonElement>(".timeline .story-add-action")?.disabled ===
              true,
          );
          assert.equal(await remove.isDisabled(), true);
          assert.equal(await page.locator(".toolbar .story-delete").isDisabled(), true);
          await remove.evaluate((button) => (button as HTMLButtonElement).click());
          assert.equal(h.writes().length, 1);
        } finally {
          release();
          h.intercept = undefined;
        }
        await h.settled();
        assert.deepEqual(
          tour(h.text).scenes.map((scene) => scene.id),
          ["first", "last"],
        );
        assert.equal(await selected(page).inputValue(), "last");
        await remove.click();
        await h.type(SOURCE + "// Concurrent source change.\n");
        const changed = h.text;
        await page.getByRole("button", { name: "Delete all", exact: true }).click();
        await h.settled();
        assert.equal(h.text, changed);
        assert.equal(h.writes().length, 1);
      },
    },
    {
      name: "story workspace: a dependent story deletion stays locked through its second confirmation and rejects later navigation",
      text: SOURCE + "export player for tour { format html }\n",
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        const remove = page.locator(".toolbar .story-delete");
        const confirm = page.getByRole("button", { name: "Delete all", exact: true });
        await remove.click();
        await confirm.click();
        await h.settled();
        assert.match((await page.getByRole("dialog").textContent()) ?? "", /player/);
        let release!: () => void;
        let entered!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const sent = new Promise<void>((resolve) => {
          entered = resolve;
        });
        h.intercept = async (message) => {
          const action = (message as { action?: { kind: string; cascade?: boolean } }).action;
          if (action?.kind === "removeStory" && action.cascade) {
            entered();
            await held;
          }
        };
        let lowerDisabled: boolean | undefined;
        let upperDisabled: boolean | undefined;
        try {
          await confirm.click();
          await sent;
          lowerDisabled = await page
            .locator(".timeline")
            .getByRole("button", { name: "Delete scene", exact: true })
            .isDisabled();
          upperDisabled = await remove.isDisabled();
        } finally {
          release();
          h.intercept = undefined;
          await h.settled();
        }
        assert.equal(
          lowerDisabled,
          true,
          "dependent story deletion keeps scene writes locked until acknowledgement",
        );
        assert.equal(upperDisabled, true, "dependent story deletion cannot be submitted twice");
        assert.equal(
          compile(h.text).document.stories.some((story) => story.id === "tour"),
          false,
        );
        const restored = SOURCE + "export player for tour { format html }\n";
        await h.type(restored);
        await pick(h);
        await remove.click();
        await confirm.click();
        await h.settled();
        const before = h.writes().length;
        await page.getByRole("combobox", { name: "Story", exact: true }).selectOption("other");
        await h.settled();
        await confirm.click();
        await h.settled();
        assert.equal(h.text, restored);
        assert.equal(
          h.writes().length,
          before,
          "navigation invalidates the second destructive confirmation",
        );
      },
    },
    {
      name: "story workspace: a render newer than its playback disables stale names and destructive controls",
      text: SOURCE,
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        const changed = SOURCE.replace(TOUR, "");
        h.text = changed;
        h.revision++;
        const messages = h.session.update(h.analyze(changed, h.revision));
        const render = messages.find((message) => message.type === "render");
        assert.ok(render);
        await h.postRaw(render);
        assert.equal(await page.locator(".timeline").isVisible(), true);
        assert.equal(
          await page.getByRole("textbox", { name: "Story name", exact: true }).isDisabled(),
          true,
        );
        assert.equal(await page.locator(".toolbar .story-delete").isDisabled(), true);
        await page
          .locator(".toolbar .story-delete")
          .evaluate((button) => (button as HTMLButtonElement).click());
        assert.equal(h.writes().length, 0);
        assert.equal(h.text, changed);
        const story = messages.find((message) => message.type === "story");
        assert.ok(story);
        await h.postRaw(story);
        assert.equal(await page.locator(".timeline").isVisible(), false);
      },
    },
    {
      name: "story workspace: overlap and transition controls preserve an explicit editing scene and reject oversized shared time",
      text: TIMED,
      async run(h: Harness) {
        const { page } = h;
        await pick(h);
        await namedSelection(h, "next");
        const mode = page.getByRole("combobox", { name: "Scene timing", exact: true });
        await mode.selectOption("overlap");
        await h.settled();
        const amount = page.getByRole("textbox", { name: "Overlap duration (s)", exact: true });
        assert.equal(await amount.inputValue(), "1");
        await amount.fill("2");
        await amount.press("Enter");
        await h.settled();
        assert.equal(tour(h.text).scenes[1]!.startMs, 2000);
        assert.equal(
          await page
            .locator('.scene-row[data-scene="next"]')
            .evaluate((row) => row.classList.contains("selected-scene")),
          true,
          "overlap acknowledgement retains the selected row",
        );
        await namedSelection(h, "next");
        assert.deepEqual(
          await page
            .locator(".timeline .active-scene")
            .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.scene)),
          ["first", "next"],
        );
        const beforeInvalid = h.text;
        const writes = h.writes().length;
        await amount.fill("5");
        await amount.press("Enter");
        assert.equal(await amount.getAttribute("aria-invalid"), "true");
        assert.equal(h.text, beforeInvalid);
        assert.equal(h.writes().length, writes);
        await amount.press("Escape");
        assert.equal(await amount.inputValue(), "2");
        const transition = page.getByRole("combobox", { name: "Transition", exact: true });
        await transition.selectOption("fade");
        await h.settled();
        const time = page.getByRole("textbox", { name: "Transition duration (s)", exact: true });
        await time.fill("1");
        await time.press("Enter");
        await h.settled();
        assert.equal(tour(h.text).scenes[1]!.transition?.durationMs, 1000);
        assert.equal(tour(h.text).scenes[1]!.actions[0]!.startMs, 2000);
        assert.equal(
          await page
            .locator('.scene-row[data-scene="next"] .scene-label')
            .getAttribute("aria-pressed"),
          "true",
          "transition acknowledgement retains the selection indicator",
        );
        await mode.selectOption("sequential");
        await h.settled();
        assert.equal(tour(h.text).scenes[1]!.startMs, 4000);
        assert.equal(tour(h.text).scenes[1]!.actions[0]!.startMs, 5000);
        assert.equal(await selected(page).inputValue(), "next");
        assert.equal(
          await page
            .locator('.scene-row[data-scene="next"]')
            .evaluate((row) => row.classList.contains("selected-scene")),
          true,
        );
        assert.deepEqual(
          await page
            .locator(".timeline .active-scene")
            .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.scene)),
          ["first"],
          "playback state stays distinct from the editing target",
        );
      },
    },
  ];
}
