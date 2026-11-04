import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { CanvasSettings, CanvasSession, analyzeDocument } from "@meltemi/diagrams-editor";
import type { Page } from "playwright-core";

/** The existing host harness, with only the surface these gesture scenarios need. */
interface Harness {
  page: Page;
  text: string;
  revision: number;
  session: CanvasSession;
  analyze(text: string, revision: number): ReturnType<typeof analyzeDocument>;
  intercept: ((message: unknown) => Promise<void>) | undefined;
  centre(id: string): Promise<{ x: number; y: number }>;
  settled(): Promise<void>;
  settings(next: Partial<CanvasSettings>): Promise<void>;
  writes(): unknown[];
}

const SOURCE = `// Keep this diagram comment.
diagram d: flow {
  layout manual
  api["API"] // Keep the component comment.
  db[("Database")]
  api -> db: "save" as save
  placement {
    place api at (210, 140) // Keep the placement comment.
    place db at (490, 140)
  }
}
`;

const actionOf = (message: unknown) =>
  (message as { action?: { kind: string; token?: number } }).action;

/** A controlled host delay, released explicitly rather than depending on machine speed. */
function heldReply() {
  let release!: () => void;
  let arrived!: () => void;
  const seen = new Promise<void>((resolve) => (arrived = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { release, arrived, wait, seen };
}

async function agreement(page: Page) {
  return page.evaluate(() => {
    const drawn = document
      .querySelector('.content g[data-role="element"][data-id="api"]')!
      .getBoundingClientRect();
    const outline = document.querySelector(".overlay .outline")!.getBoundingClientRect();
    return {
      x: drawn.x + drawn.width / 2,
      y: drawn.y + drawn.height / 2,
      apart: Math.hypot(
        drawn.x + drawn.width / 2 - outline.x - outline.width / 2,
        drawn.y + drawn.height / 2 - outline.y - outline.height / 2,
      ),
    };
  });
}

export const manipulationTests: {
  name: string;
  text: string;
  run(h: Harness): Promise<void>;
}[] = [
  {
    name: "manipulation: a move snapped to zero or returned to its origin never waits for a render",
    text: SOURCE,
    async run(h) {
      const { page } = h;
      const start = await h.centre("api");
      await page.mouse.click(start.x, start.y);
      await h.settled();
      for (const returnToOrigin of [false, true]) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + (returnToOrigin ? 98 : 5), start.y);
        await h.settled();
        if (returnToOrigin) {
          await page.mouse.move(start.x, start.y);
          await h.settled();
        }
        await page.mouse.up();
        await h.settled();
        assert.equal(h.writes().length, 0, "a zero displacement sends no edit");
        assert.equal(h.text, SOURCE);
        assert.ok(Math.abs((await agreement(page)).x - start.x) < 1);
        assert.equal(await page.locator('.overlay [data-handle="rotate:"]').count(), 1);
      }
      // The next edit works immediately: no phantom pending move swallowed the press.
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 98, start.y);
      await page.mouse.up();
      await h.settled();
      assert.equal(h.writes().length, 1);
    },
  },
  {
    name: "manipulation: a card dropped at its current list index creates no pending edit",
    text: `diagram s: free {
  layout manual
  group todo "Todo" {
    layout column
    sticky first "First"
    sticky second "Second"
  }
  placement { place todo at (300, 220) }
}
`,
    async run(h) {
      const { page } = h;
      const before = h.text;
      const start = await h.centre("first");
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y + 8);
      await h.settled();
      await page.mouse.up();
      await h.settled();
      assert.equal(h.writes().length, 0);
      assert.equal(h.text, before);
      const next = await h.centre("second");
      await page.mouse.click(next.x, next.y);
      await h.settled();
      assert.equal(h.session.selected[0], "second", "the next selection is not blocked");
    },
  },
  {
    name: "manipulation: delayed previews and drop keep the component and outline together",
    text: SOURCE,
    async run(h) {
      const { page } = h;
      await h.settings({ snap: false, guides: false });
      const start = await h.centre("api");
      await page.mouse.click(start.x, start.y);
      await h.settled();
      const preview = heldReply();
      const drop = heldReply();
      let first = true;
      h.intercept = async (message) => {
        const action = actionOf(message);
        if (action?.kind === "preview" && first) {
          first = false;
          preview.arrived();
          await preview.wait;
        } else if (action?.kind === "move") {
          drop.arrived();
          await drop.wait;
        }
      };
      try {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 40, start.y + 20);
        await preview.seen;
        await page.mouse.move(start.x + 120, start.y + 70, { steps: 5 });
        const waiting = await agreement(page);
        assert.ok(waiting.apart < 1, `outline follows during preview delay: ${waiting.apart}`);
        assert.ok(Math.abs(waiting.x - start.x - 120) < 1, "drawing follows latest pointer");
        preview.release();
        await h.settled();
        const previewed = await agreement(page);
        assert.ok(previewed.apart < 1, "old preview cannot move the component back");
        assert.ok(Math.abs(previewed.x - waiting.x) < 1, "preview keeps the latest position");
        assert.equal(await page.locator('.content g[data-id="api"].mdg-depth').count(), 1);
        await page.mouse.up();
        await drop.seen;
        const released = await agreement(page);
        assert.ok(released.apart < 1, `outline follows while drop is compiling: ${released.apart}`);
        assert.ok(Math.abs(released.x - waiting.x) < 1, "drop keeps the latest position");
        drop.release();
        await h.settled();
        const confirmed = await agreement(page);
        assert.ok(confirmed.apart < 1, "confirmed render and outline agree");
        assert.ok(Math.abs(confirmed.x - released.x) < 1, "confirmation does not jump");
        assert.equal(h.writes().length, 1, "one source edit and undo step");
        assert.match(h.text, /api\["API"\] \/\/ Keep the component comment\./);
        assert.match(h.text, /place api at \([^\n]+\/\/ Keep the placement comment\./);
        assert.match(h.text, /place db at \(490, 140\)/);
        assert.ok(h.text.startsWith("// Keep this diagram comment."));
      } finally {
        preview.release();
        drop.release();
        h.intercept = undefined;
      }
    },
  },
  {
    name: "manipulation: cancelling ignores a delayed preview without changing source",
    text: SOURCE,
    async run(h) {
      const { page } = h;
      const start = await h.centre("api");
      await page.mouse.click(start.x, start.y);
      await h.settled();
      const reply = heldReply();
      h.intercept = async (message) => {
        if (actionOf(message)?.kind === "preview") {
          reply.arrived();
          await reply.wait;
        }
      };
      try {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 100, start.y + 60);
        await reply.seen;
        await page.keyboard.press("Escape");
        reply.release();
        await h.settled();
        await page.mouse.up();
        const cancelled = await agreement(page);
        assert.ok(Math.abs(cancelled.x - start.x) < 1, "cancel restores the source position");
        assert.ok(cancelled.apart < 1, "selection is restored too");
        assert.equal(h.writes().length, 0);
        assert.equal(h.text, SOURCE);
      } finally {
        reply.release();
        h.intercept = undefined;
      }
    },
  },
  {
    name: "manipulation: an old render does not confirm a drop and refusal restores source geometry",
    text: SOURCE,
    async run(h) {
      const { page } = h;
      await h.settings({ snap: false, guides: false });
      const start = await h.centre("api");
      await page.mouse.click(start.x, start.y);
      await h.settled();
      const replies = h.session.update(h.analyze(h.text, h.revision));
      const original = replies.find((m) => m.type === "render");
      assert.ok(original);
      const drop = heldReply();
      h.intercept = async (message) => {
        if (actionOf(message)?.kind === "move") {
          drop.arrived();
          await drop.wait;
          // The real session rejects an edit whose revision no longer matches the source.
          (message as { revision: number }).revision = -1;
        }
      };
      try {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 110, start.y + 60);
        await h.settled();
        await page.mouse.up();
        await drop.seen;
        // The source update also carries a story-list message. Neither reply may flush a nudge
        // queued while the drop is awaiting its source revision.
        await page.keyboard.press("ArrowRight");
        await page.evaluate((messages) => {
          for (const message of messages) window.postMessage(message, "*");
        }, replies);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
        const oldReply = await agreement(page);
        assert.ok(
          oldReply.apart < 1,
          "a same-revision render keeps drawing and selection together",
        );
        assert.ok(
          Math.abs(oldReply.x - start.x - 110) < 1,
          "old render cannot undo the pending move",
        );
        await page.keyboard.press("ArrowRight");
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
        assert.equal(h.writes().length, 1, "queued nudges wait for a new source revision");
        await page.evaluate(() =>
          window.postMessage(
            {
              type: "settings",
              settings: {
                grid: 14,
                showGrid: true,
                snap: false,
                guides: false,
                minimap: true,
                inspector: true,
                readOnly: true,
              },
            },
            "*",
          ),
        );
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
        const viewing = await agreement(page);
        assert.ok(Math.abs(viewing.x - start.x) < 1, "view-only discards pending edit geometry");
        assert.ok(viewing.apart < 1, "view-only keeps the selection at the source position");
        drop.release();
        await h.settled();
        const refused = await agreement(page);
        assert.ok(Math.abs(refused.x - start.x) < 1, "refusal restores the source drawing");
        assert.ok(refused.apart < 1, "refusal restores the outline");
        assert.equal(h.text, SOURCE);
      } finally {
        drop.release();
        h.intercept = undefined;
      }
    },
  },
  {
    name: "manipulation: rotation is an arc arrow and canvas depth leaves exports alone",
    text: SOURCE,
    async run(h) {
      const { page } = h;
      const start = await h.centre("api");
      await page.mouse.click(start.x, start.y);
      await h.settled();
      const handle = page.locator('.overlay [data-handle="rotate:"]');
      const bounds = await handle.boundingBox();
      assert.ok(bounds && bounds.width >= 24 && bounds.height >= 24, "24px rotation target");
      assert.match((await handle.getAttribute("aria-label")) ?? "", /Rotate/);
      assert.match((await handle.locator("path.rotate-arrow").getAttribute("d")) ?? "", /a/);
      const shadow = await page
        .locator('.content g[data-id="api"][data-role="element"]')
        .evaluate((g) => getComputedStyle(g).filter);
      assert.match(shadow, /drop-shadow/);
      const rendered = h.session
        .update(h.analyze(h.text, h.revision))
        .find((m) => m.type === "render");
      assert.ok(rendered);
      assert.doesNotMatch(rendered.svg, /mdg-depth|rotate-arrow/);
      assert.equal(h.text, SOURCE);
      assert.equal(h.writes().length, 0);
      await page.screenshot({
        path: fileURLToPath(new URL("../../.test-output/canvas-manipulation.png", import.meta.url)),
      });
      // An authored SVG filter takes precedence over the canvas decoration.
      const filtered = {
        ...rendered,
        svg: rendered.svg.replace(
          'data-id="api" data-role="element"',
          'data-id="api" data-role="element" filter="url(#authored)"',
        ),
      };
      await page.evaluate((message) => window.postMessage(message, "*"), filtered);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
      assert.equal(await page.locator('.content g[data-id="api"].mdg-depth').count(), 0);
      assert.equal(
        await page.locator('.content g[data-id="api"]').getAttribute("filter"),
        "url(#authored)",
      );
    },
  },
  {
    name: "manipulation: loose text, frames, stickies and strokes keep their own depth",
    text: `diagram s: free {
  layout manual
  group frame "Backend" { box api "API" }
  text caption "Plain text"
  sticky note "Already has a shadow"
  pen stroke [(100, 400), (200, 412), (300, 400)]
  placement {
    place frame at (250, 160)
    size frame (400, 200)
    place api at (120, 60)
    place caption at (200, 300)
    place note at (550, 300)
  }
}
`,
    async run(h) {
      assert.equal(await h.page.locator('.content g[data-id="api"].mdg-depth').count(), 1);
      for (const id of ["frame", "caption", "note", "stroke"]) {
        const g = h.page.locator(`.content g[data-role="element"][data-id="${id}"]`);
        assert.equal(await g.count(), 1, `${id} is drawn`);
        assert.equal(await g.evaluate((g) => g.classList.contains("mdg-depth")), false, id);
      }
    },
  },
];
