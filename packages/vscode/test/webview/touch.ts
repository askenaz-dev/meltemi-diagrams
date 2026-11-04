import assert from "node:assert/strict";
import type { CanvasSession } from "@meltemi/diagrams-editor";
import type { CDPSession, Page } from "playwright-core";

/** The existing host harness, with only the surface these touch scenarios need. */
interface Harness {
  page: Page;
  text: string;
  session: CanvasSession;
  readonly received: unknown[];
  centre(id: string): Promise<{ x: number; y: number }>;
  settled(): Promise<void>;
  writes(): unknown[];
  place(id: string): { x: number; y: number };
}

const SOURCE = `diagram d: flow {
  layout manual
  api["API"]
  db[("DB")]
  api -> db: "save" as save
  placement {
    place api at (126, 112)
    place db at (420, 112)
  }
}
`;

const FREE = `diagram s: free {
  layout manual
  box a "A"
  placement {
    place a at (126, 112)
  }
}
`;

/** A finger down on the screen: its touch id and where it is. */
interface Finger {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The browser's input of each page and the fingers down on it: the browser keeps the fingers of a
 * session, so a finger left down by one `touch` is lifted by the next.
 */
const screens = new WeakMap<Page, { input: Promise<CDPSession>; down: readonly Finger[] }>();

/**
 * Touches the page as a touch screen does, through the browser's own input, so that the canvas
 * gets pointer events of type `touch`: each step lists the fingers down and where they are, a
 * finger missing from a step is lifted (a `touchEnd` that names it: a move without it keeps it
 * down), and an empty step lifts the last ones.
 */
async function touch(page: Page, steps: readonly (readonly Finger[])[]): Promise<void> {
  const screen = screens.get(page) ?? { input: page.context().newCDPSession(page), down: [] };
  screens.set(page, screen);
  const input = await screen.input;
  const points = (fingers: readonly Finger[]) => fingers.map(({ id, x, y }) => ({ id, x, y }));
  for (const fingers of steps) {
    const lifted = screen.down.filter((f) => !fingers.some((g) => g.id === f.id));
    if (lifted.length > 0) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: points(lifted),
      });
    }
    if (fingers.length > 0) {
      const pressed = fingers.some((f) => !screen.down.some((g) => g.id === f.id));
      await input.send("Input.dispatchTouchEvent", {
        type: pressed ? "touchStart" : "touchMove",
        touchPoints: points(fingers),
      });
    }
    screen.down = fingers;
  }
  // The browser hands moves to the page at its frames: the last ones are in after two.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** One finger from a point to another in `count` moves, then lifted. */
function slide(from: { x: number; y: number }, dx: number, dy: number, count = 8): Finger[][] {
  const steps: Finger[][] = [];
  for (let i = 0; i <= count; i++) {
    steps.push([{ id: 1, x: from.x + (dx * i) / count, y: from.y + (dy * i) / count }]);
  }
  return [...steps, []];
}

/** The view's zoom, and where its origin is on the page, as the content layer is drawn. */
async function viewOf(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.locator(".content").evaluate((content: HTMLElement) => {
    const m = new DOMMatrix(getComputedStyle(content).transform);
    const stage = content.closest(".stage")!.getBoundingClientRect();
    return { x: stage.left + m.e, y: stage.top + m.f, zoom: m.a };
  });
}

/**
 * A point of the stage where nothing is drawn and no control lies, the empty canvas, at least
 * `margin` pixels inside the stage, for the fingers around it.
 */
async function emptyPoint(page: Page, margin = 30): Promise<{ x: number; y: number }> {
  const found = await page.evaluate((margin) => {
    const stage = document.querySelector(".stage")!.getBoundingClientRect();
    for (let y = stage.bottom - margin; y > stage.top + margin; y -= 20) {
      for (let x = stage.left + margin; x < stage.right - margin; x += 20) {
        const el = document.elementFromPoint(x, y);
        if (
          el?.closest(".stage") &&
          !el.closest("[data-role], [data-handle], .minimap, .banner, .status, .list-adds")
        )
          return { x, y };
      }
    }
    return null;
  }, margin);
  assert.ok(found, "an empty point on the stage");
  return found;
}

const near = (actual: number, expected: number, label: string, within = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= within, `${label}: ${actual}, expected ${expected}`);

export const touchTests: {
  name: string;
  text: string;
  touch: true;
  readOnly?: boolean;
  run(h: Harness): Promise<void>;
}[] = [
  {
    name: "touch: a finger pans the empty canvas and taps to select, and a mouse drag still draws a band",
    text: SOURCE,
    touch: true,
    async run(h) {
      const { page } = h;
      const empty = await emptyPoint(page);
      const before = await viewOf(page);
      // A drag on the empty canvas pans, from where the finger was pressed; it draws no band.
      await touch(page, slide(empty, 60, -40).slice(0, -1));
      assert.equal(await page.locator(".overlay .band").count(), 0, "no band under a finger");
      await touch(page, [[]]);
      await h.settled();
      const panned = await viewOf(page);
      near(panned.x, before.x + 60, "pan x");
      near(panned.y, before.y - 40, "pan y");
      assert.equal(panned.zoom, before.zoom);
      assert.deepEqual(h.session.selected, []);
      // A finger that moves less than a tap's reach taps: it pans nothing.
      await touch(page, slide({ x: empty.x + 60, y: empty.y - 40 }, 5, 3, 2));
      await h.settled();
      assert.deepEqual(await viewOf(page), panned);
      // A tap on an element selects it.
      const api = await h.centre("api");
      await touch(page, [[{ id: 1, ...api }], []]);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      assert.deepEqual(h.received.at(-1), { type: "select", ids: ["api"] });
      // A drag that starts on an element not selected pans too, and leaves the selection alone.
      await touch(page, slide(await h.centre("db"), -30, 20));
      await h.settled();
      const again = await viewOf(page);
      near(again.x, panned.x - 30, "pan from db x");
      near(again.y, panned.y + 20, "pan from db y");
      assert.deepEqual(h.session.selected, ["api"]);
      assert.deepEqual(h.writes(), [], "panning writes nothing");
      // A drag of the selected element moves it, as a mouse's does, and pans nothing: db stays
      // where it is on the screen (the view makes up for the drawing's new origin).
      const placed = h.place("api");
      const db = await h.centre("db");
      await touch(page, slide(await h.centre("api"), 56 * again.zoom, 28 * again.zoom));
      await h.settled();
      assert.equal(h.writes().length, 1, "the move is one edit");
      assert.deepEqual(h.place("api"), { x: placed.x + 56, y: placed.y + 28 });
      const still = await h.centre("db");
      near(still.x, db.x, "db x");
      near(still.y, db.y, "db y");
      const view = await viewOf(page);
      // A tap on the empty canvas selects nothing.
      const blank = await emptyPoint(page);
      await touch(page, [[{ id: 1, ...blank }], []]);
      await h.settled();
      assert.deepEqual(h.session.selected, []);
      // The mouse is as it was: its drag on the empty canvas draws a band and pans nothing.
      await page.mouse.move(blank.x, blank.y);
      await page.mouse.down();
      await page.mouse.move(blank.x + 40, blank.y - 30, { steps: 4 });
      assert.equal(await page.locator(".overlay .band").count(), 1, "a mouse's band");
      await page.mouse.up();
      await h.settled();
      assert.deepEqual(await viewOf(page), view);
    },
  },
  {
    name: "touch: two fingers pinch around their midpoint, and the finger left pans on without a tap",
    text: SOURCE,
    touch: true,
    async run(h) {
      const { page } = h;
      const middle = await emptyPoint(page, 100);
      const before = await viewOf(page);
      const under = {
        x: (middle.x - before.x) / before.zoom,
        y: (middle.y - before.y) / before.zoom,
      };
      const apart = (half: number): Finger[] => [
        { id: 1, x: middle.x - half, y: middle.y },
        { id: 2, x: middle.x + half, y: middle.y },
      ];
      // From 80 pixels apart to 160: twice the zoom, with the diagram's point under the midpoint
      // kept under it.
      await touch(page, [apart(40), apart(50), apart(60), apart(70), apart(80)]);
      const pinched = await viewOf(page);
      near(pinched.zoom, before.zoom * 2, "zoom", 1e-4);
      near((middle.x - pinched.x) / pinched.zoom, under.x, "point under the midpoint x");
      near((middle.y - pinched.y) / pinched.zoom, under.y, "point under the midpoint y");
      // The second finger lifted, the first pans on from where it is; lifted over an element, it
      // selects nothing, since it pinched.
      const first = apart(80)[0]!;
      const api = await h.centre("api");
      const steps: Finger[][] = [[first]];
      for (let i = 1; i <= 6; i++) {
        steps.push([{ id: 1, x: first.x + (30 * i) / 6, y: first.y + (20 * i) / 6 }]);
      }
      await touch(page, [...steps, []]);
      await h.settled();
      const panned = await viewOf(page);
      near(panned.x, pinched.x + 30, "pan after the pinch x");
      near(panned.y, pinched.y + 20, "pan after the pinch y");
      assert.equal(panned.zoom, pinched.zoom);
      assert.deepEqual(h.session.selected, []);
      // Both fingers lifted together over an element tap nothing either.
      await touch(page, [
        [
          { id: 1, x: api.x - 20, y: api.y },
          { id: 2, x: api.x + 20, y: api.y },
        ],
        [],
      ]);
      await h.settled();
      assert.deepEqual(h.session.selected, []);
      assert.deepEqual(h.writes(), [], "pinching writes nothing");
    },
  },
  {
    name: "touch: a second finger lets go of the move the first began, and pinches instead",
    text: SOURCE,
    touch: true,
    async run(h) {
      const { page } = h;
      const api = await h.centre("api");
      await touch(page, [[{ id: 1, ...api }], []]);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      const before = await viewOf(page);
      const steps: Finger[][] = [];
      for (let i = 0; i <= 6; i++) steps.push([{ id: 1, x: api.x + 10 * i, y: api.y }]);
      await touch(page, steps);
      await h.settled();
      const moved = await h.centre("api");
      near(moved.x, api.x + 60, "the drawing follows the finger", 8);
      // A second finger: the move goes back, and the two pinch.
      const held = { id: 1, x: api.x + 60, y: api.y };
      await touch(page, [
        [held, { id: 2, x: api.x + 160, y: api.y }],
        [held, { id: 2, x: api.x + 260, y: api.y }],
      ]);
      await h.settled();
      const back = await viewOf(page);
      near(back.zoom, before.zoom * 2, "zoom", 1e-4);
      await touch(page, [[]]);
      await h.settled();
      assert.deepEqual(h.writes(), [], "the move let go of writes nothing");
      assert.deepEqual(h.place("api"), { x: 126, y: 112 });
      assert.deepEqual(h.session.selected, ["api"]);
    },
  },
  {
    name: "touch: on a read-only canvas a finger pans, even from the selected element, and a tap selects",
    text: SOURCE,
    touch: true,
    readOnly: true,
    async run(h) {
      const { page } = h;
      const api = await h.centre("api");
      await touch(page, [[{ id: 1, ...api }], []]);
      await h.settled();
      assert.deepEqual(h.session.selected, ["api"]);
      const before = await viewOf(page);
      await touch(page, slide(api, 40, 30));
      await h.settled();
      const after = await viewOf(page);
      near(after.x, before.x + 40, "pan x");
      near(after.y, before.y + 30, "pan y");
      assert.deepEqual(h.writes(), []);
    },
  },
  {
    name: "touch: a stroke keeps its finger: a second one neither pinches nor draws",
    text: FREE,
    touch: true,
    async run(h) {
      const { page } = h;
      await page.locator(".stage").focus();
      await page.keyboard.press("p");
      assert.equal(
        await page
          .locator('.toolbar [data-split="pen"] > button.pen-button')
          .getAttribute("aria-pressed"),
        "true",
      );
      const start = await emptyPoint(page, 140);
      const zoom = (await viewOf(page)).zoom;
      const a = await h.centre("a");
      const steps: Finger[][] = [];
      for (let i = 0; i <= 4; i++) steps.push([{ id: 1, x: start.x + 10 * i, y: start.y - 5 * i }]);
      // A second finger lands and moves away while the first draws on.
      for (let i = 1; i <= 4; i++) {
        steps.push([
          { id: 1, x: start.x + 40 + 10 * i, y: start.y - 20 },
          { id: 2, x: start.x - 40 - 20 * i, y: start.y - 60 },
        ]);
      }
      await touch(page, [...steps, []]);
      await h.settled();
      // No pinch: the zoom is the same and `a` stays where it is on the screen (the view makes up
      // for the drawing's new origin).
      assert.equal((await viewOf(page)).zoom, zoom, "no pinch");
      const still = await h.centre("a");
      near(still.x, a.x, "a x");
      near(still.y, a.y, "a y");
      const writes = h.writes() as { action: { kind: string; points?: unknown[] } }[];
      assert.equal(writes.length, 1, "one stroke");
      assert.equal(writes[0]!.action.kind, "createPen");
      assert.match(h.text, /pen pen1 \[/);
    },
  },
];
