import assert from "node:assert/strict";
import { join } from "node:path";
import type { CanvasSettings } from "@meltemi/diagrams-editor";
import type { Page } from "playwright-core";

/** The host harness surface needed by the connection gestures. */
interface Harness {
  page: Page;
  text: string;
  centre(id: string): Promise<Point>;
  settled(): Promise<void>;
  settings(next: Partial<CanvasSettings>): Promise<void>;
  writes(): unknown[];
}

interface Point {
  x: number;
  y: number;
}
type Side = "north" | "south" | "west" | "east";

const SOURCE = `// Keep this source while choosing a connection.
diagram d: free {
  layout manual
  box api "Source"
  box db "Target"
  style api { shape rectangle; radius 0 }
  style db { shape rectangle; radius 0 }
  placement {
    place api at (240, 200)
    size api (160, 100)
    place db at (600, 200)
    size db (160, 100)
  }
}
`;

const TURNED = SOURCE.replace(
  "style api { shape rectangle; radius 0 }",
  "style api { shape parallelogram; radius 0; rotation 35 }",
);

const ICON = `diagram d: flow {
  layout manual
  api["Function with a label"]
  db["Target"]
  style api { shape icon; icon "aws:lambda" }
  placement {
    place api at (240, 200)
    place db at (600, 200)
    size db (160, 100)
  }
}
`;

function near(actual: Point, expected: Point, label: string): void {
  const apart = Math.hypot(actual.x - expected.x, actual.y - expected.y);
  assert.ok(apart < 0.8, `${label}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
}

async function select(h: Harness, id = "api"): Promise<void> {
  const at = await h.centre(id);
  await h.page.mouse.click(at.x, at.y);
  await h.settled();
  await h.page.locator(".overlay rect.outline.primary").waitFor({ state: "visible" });
}

async function prepare(h: Harness, zoom = "1"): Promise<void> {
  await h.settings({ inspector: false, minimap: false });
  await h.page.locator('.toolbar select[aria-label="Zoom"]').selectOption(zoom);
  await h.settled();
}

/** A point of the selected frame as actually drawn, including its SVG rotation and viewport. */
async function framePoint(page: Page, side: Side, fraction = 0.5): Promise<Point> {
  return page.evaluate(
    ({ side, fraction }) => {
      const element = document.querySelector<SVGRectElement>(".overlay rect.outline.primary");
      if (!element?.isConnected) throw new Error("The selection frame is not rendered");
      const b = element.getBBox();
      const matrix = element.getScreenCTM();
      if (b.width <= 0 || b.height <= 0 || !matrix)
        throw new Error("The selection frame has no visible geometry");
      const x = side === "west" ? b.x : side === "east" ? b.x + b.width : b.x + b.width * fraction;
      const y =
        side === "north" ? b.y : side === "south" ? b.y + b.height : b.y + b.height * fraction;
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    },
    { side, fraction },
  );
}

async function frameCentre(page: Page): Promise<Point> {
  return page.evaluate(() => {
    const element = document.querySelector<SVGRectElement>(".overlay rect.outline.primary");
    if (!element?.isConnected) throw new Error("The selection frame is not rendered");
    const b = element.getBBox();
    const matrix = element.getScreenCTM();
    if (b.width <= 0 || b.height <= 0 || !matrix)
      throw new Error("The selection frame has no visible geometry");
    const point = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  });
}

async function wireStart(page: Page): Promise<Point> {
  assert.equal(await page.locator(".overlay line.wire").count(), 1, "one connection preview");
  return page.evaluate(() => {
    const line = document.querySelector<SVGLineElement>(".overlay line.wire");
    const matrix = line?.getScreenCTM();
    if (!line?.isConnected || !matrix) throw new Error("The connection preview is not rendered");
    const point = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(
      matrix,
    );
    return { x: point.x, y: point.y };
  });
}

async function pressHandle(page: Page, side: Side): Promise<Point> {
  const b = await page
    .locator(`.overlay [data-id="api"][data-handle="connect:${side}"]`)
    .boundingBox();
  assert.ok(b, `no ${side} connection handle`);
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  return at;
}

async function cancel(h: Harness): Promise<void> {
  await h.page.keyboard.press("Escape");
  await h.page.mouse.up();
  await h.settled();
  assert.equal(await h.page.locator(".overlay line.wire").count(), 0);
}

/** Read the slanted body's own painted outline, independently of canvas routing helpers. */
async function parallelogramEast(page: Page): Promise<Point> {
  return page.locator('.content g[data-id="api"][data-role="element"]').evaluate((group) => {
    const shape = group.querySelector<SVGGeometryElement>("path, polygon");
    if (!shape) throw new Error("No painted parallelogram outline");
    const box = shape.getBBox();
    const middle = box.y + box.height / 2;
    const length = shape.getTotalLength();
    const hits: number[] = [];
    let before = shape.getPointAtLength(0);
    for (let index = 1; index <= 400; index++) {
      const after = shape.getPointAtLength((length * index) / 400);
      if (
        Math.abs(after.y - before.y) > 1e-6 &&
        middle >= Math.min(before.y, after.y) &&
        middle <= Math.max(before.y, after.y)
      ) {
        const fraction = (middle - before.y) / (after.y - before.y);
        hits.push(before.x + (after.x - before.x) * fraction);
      }
      before = after;
    }
    if (hits.length < 2) throw new Error("The body's middle must cross two painted sides");
    const x = Math.max(...hits);
    if (x >= box.x + box.width - 1) throw new Error("The slanted side must lie inside its box");
    const point = new DOMPoint(x, middle).matrixTransform(shape.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
}

export function connectionPreviewTests(output: string) {
  return [
    {
      name: "connection preview: four side handles start at their chosen outline and Escape writes nothing",
      text: SOURCE,
      async run(h: Harness) {
        await prepare(h);
        for (const side of ["north", "south", "west", "east"] as const) {
          await select(h);
          const expected = await framePoint(h.page, side);
          const centre = await frameCentre(h.page);
          assert.ok(Math.hypot(expected.x - centre.x, expected.y - centre.y) > 30);
          const handle = await pressHandle(h.page, side);
          await h.page.mouse.move(handle.x + 90, handle.y + 65, { steps: 5 });
          await h.settled();
          if (side === "north") {
            await h.page.screenshot({
              path: join(output, "canvas-connection-preview-handles.png"),
            });
          }
          near(await wireStart(h.page), expected, `${side} handle's preview origin`);
          await cancel(h);
          assert.equal(h.writes().length, 0);
          assert.equal(h.text, SOURCE);
        }
      },
    },
    {
      name: "connection preview: a rotated slanted outline stays anchored after zoom and pan",
      text: TURNED,
      async run(h: Harness) {
        const { page } = h;
        await prepare(h, "2");
        await select(h);
        const zoom = await page
          .locator(".content")
          .evaluate((element: HTMLElement) => new DOMMatrix(getComputedStyle(element).transform).a);
        assert.equal(zoom, 2, "the gesture is observed at 200 percent");
        const before = await frameCentre(page);
        const stage = await page.locator(".stage").boundingBox();
        assert.ok(stage);
        const pan = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
        await page.mouse.move(pan.x, pan.y);
        await page.mouse.down({ button: "middle" });
        await page.mouse.move(pan.x + 42, pan.y + 31, { steps: 5 });
        await page.mouse.up({ button: "middle" });
        await h.settled();
        near(
          await frameCentre(page),
          { x: before.x + 42, y: before.y + 31 },
          "the view really panned",
        );
        const expected = await parallelogramEast(page);
        const boxSide = await framePoint(page, "east");
        assert.ok(Math.hypot(expected.x - boxSide.x, expected.y - boxSide.y) > 4);
        const handle = await pressHandle(page, "east");
        await page.mouse.move(handle.x + 70, handle.y + 55, { steps: 5 });
        await h.settled();
        await page.screenshot({ path: join(output, "canvas-connection-preview-turned.png") });
        near(await wireStart(page), expected, "painted slanted side after rotation, zoom and pan");
        await cancel(h);
        assert.equal(h.text, TURNED);
        assert.equal(h.writes().length, 0);
      },
    },
    {
      name: "connection preview: an arbitrary border percentage keeps its exact origin",
      text: SOURCE,
      async run(h: Harness) {
        const { page } = h;
        await prepare(h);
        await select(h);
        const expected = await framePoint(page, "north", 0.37);
        const stage = await page.locator(".stage").boundingBox();
        assert.ok(stage);
        await page.mouse.click(stage.x + 8, stage.y + 8);
        await h.settled();
        await page.mouse.move(expected.x, expected.y - 24);
        await page.mouse.move(expected.x, expected.y - 3, { steps: 4 });
        await h.settled();
        assert.equal(await page.locator(".stage.connecting").count(), 1);
        await page.mouse.down();
        const target = await h.centre("db");
        await page.mouse.move(target.x, target.y, { steps: 6 });
        await h.settled();
        near(await wireStart(page), expected, "the chosen 37 percent border point");
        await cancel(h);
        assert.equal(h.writes().length, 0);
        assert.equal(h.text, SOURCE);
      },
    },
    {
      name: "connection preview: an icon label does not move the anchor or pin an automatic target",
      text: ICON,
      async run(h: Harness) {
        const { page } = h;
        await prepare(h);
        await select(h);
        const expected = await framePoint(page, "south");
        const label = await page.locator(".overlay rect.label-outline").boundingBox();
        assert.ok(label, "the icon's label is outside its square");
        const handle = await pressHandle(page, "south");
        assert.ok(handle.y > label.y + label.height, "the control clears the icon label");
        const target = await h.centre("db");
        await page.mouse.move(target.x, target.y, { steps: 6 });
        await h.settled();
        near(await wireStart(page), expected, "icon square's south anchor, above its label");
        assert.equal(h.writes().length, 0, "choosing the target has not edited source yet");
        await page.mouse.up();
        await h.settled();
        assert.equal(h.writes().length, 1);
        assert.match(h.text, /api -> db/);
        assert.doesNotMatch(h.text, /\broute\b/);
        const message = h.writes()[0] as { action: { kind: string; pinned?: unknown } };
        assert.equal(message.action.kind, "connect");
        assert.equal(
          message.action.pinned,
          undefined,
          "the preview does not introduce source pinning",
        );
      },
    },
  ];
}
