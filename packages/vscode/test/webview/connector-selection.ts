import assert from "node:assert/strict";
import { join } from "node:path";
import { analyzeDocument, type CanvasSession, type CanvasSettings } from "@meltemi/diagrams-editor";
import type { Page } from "playwright-core";

interface Harness {
  page: Page;
  text: string;
  session: CanvasSession;
  settled(): Promise<void>;
  settings(next: Partial<CanvasSettings>): Promise<void>;
  writes(): unknown[];
}
interface Point {
  x: number;
  y: number;
}

const SOURCE = `// Selection must not rewrite this document.
diagram d: flow {
  layout manual
  client["Client"]
  api["API"]
  client -> api: "invoke" as call
  animate call { effect dash }
  animate call { effect trace }
  animate call { effect flow }
  placement {
    place client at (160, 180)
    size client (120, 60)
    place api at (640, 180)
    size api (120, 60)
  }
}
`;

const GROUPED = `diagram d: flow {
  layout manual
  client["Desktop / CLI"]
  idp["Identity provider"]
  group dev "Development account" {
    group devControl "Control plane" { devApi["Development API"] }
    devWorker["Development executor"]
  }
  group prod "Production account" {
    group prodControl "Control plane" { prodApi["Production API"] }
    prodWorker["Production executor"]
  }
  client -> devApi: "DEV" as development
  client -> prodApi: "PROD" as production
  client -> idp: "SSO" as identity
  style development { stroke "#dc2626"; routing orthogonal }
  style production { stroke "#16a34a"; routing orthogonal }
  style identity { stroke "#ca8a04"; routing orthogonal }
  animate development { effect dash }
  animate production { effect dash }
  animate identity { effect dash }
  placement {
    place client at (460, 80)
    place idp at (1000, 80)
    place dev at (260, 400)
    size dev (400, 400)
    place devControl at (260, 320)
    size devControl (350, 160)
    place devApi at (260, 340)
    place devWorker at (260, 500)
    place prod at (740, 400)
    size prod (400, 400)
    place prodControl at (740, 320)
    size prodControl (350, 160)
    place prodApi at (740, 340)
    place prodWorker at (740, 500)
  }
}
`;

async function prepare(h: Harness, zoom = 1): Promise<void> {
  const errors = analyzeDocument({ text: h.text, revision: 1 }).diagnostics.filter(
    (d) => d.severity === "error",
  );
  assert.deepEqual(errors, [], "the regression fixture must compile without errors");
  await h.settings({ inspector: false, minimap: false });
  await h.page.locator('.toolbar select[aria-label="Zoom"]').selectOption("1");
  if (zoom !== 1) {
    const stage = await h.page.locator(".stage").boundingBox();
    assert.ok(stage);
    // Dispatch the browser's wheel gesture with an exact delta to reproduce the owner's 49%.
    await h.page.locator(".stage").dispatchEvent("wheel", {
      clientX: stage.x + stage.width / 2,
      clientY: stage.y + stage.height / 2,
      deltaY: -Math.log(zoom) / 0.002,
      ctrlKey: true,
    });
  }
  await h.settled();
}

/** The real drawn body, away from its label and arrowheads, in screen coordinates. */
async function body(page: Page, id = "call", fraction = 0.18): Promise<Point> {
  return page
    .locator(`.content g:is([data-role="relation"], [data-role="element"])[data-id="${id}"]`)
    .evaluate((group, fraction) => {
      const line = [...group.children].find(
        (element) =>
          (element.tagName === "polyline" || element.tagName === "path") &&
          !element.classList.contains("mdg-hit") &&
          element.getAttribute("opacity") !== "0" &&
          element.getAttribute("stroke") !== "none",
      ) as SVGGeometryElement;
      const point = line.getPointAtLength(line.getTotalLength() * fraction);
      const screen = new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    }, fraction);
}

async function clear(h: Harness): Promise<void> {
  await h.page.locator(".stage").focus();
  await h.page.keyboard.press("Escape");
  await h.settled();
}

async function rectangle(h: Harness, start: Point, end: Point, crossing: boolean): Promise<void> {
  await h.page.mouse.move(start.x, start.y);
  await h.page.mouse.down();
  await h.page.mouse.move(end.x, end.y, { steps: 5 });
  const band = h.page.locator(".overlay .band");
  assert.equal(await band.count(), 1);
  assert.equal(await band.evaluate((element) => element.classList.contains("crossing")), crossing);
  assert.match(
    (await h.page.locator('.status[role="status"]').textContent()) ?? "",
    crossing ? /Crossing|cruzada/ : /Enclosing|encierro/,
  );
  await h.page.mouse.up();
  await h.settled();
}

export function connectorSelectionTests(output: string) {
  return [
    ...[0.49, 1, 2].map((zoom) => ({
      name: `connector selection: animated bodies and gaps at ${zoom * 100}% keep six screen pixels of reach`,
      text: SOURCE,
      async run(h: Harness) {
        await prepare(h, zoom);
        for (const fraction of [0.12, 0.18, 0.25, 0.32]) {
          const at = await body(h.page, "call", fraction);
          await h.page.mouse.click(at.x, at.y + 5);
          await h.settled();
          assert.deepEqual(h.session.selected, ["call"]);
          await clear(h);
        }
        const at = await body(h.page);
        await h.page.mouse.click(at.x, at.y + 9);
        await h.settled();
        assert.deepEqual(h.session.selected, [], "a distant press is not attracted to the arrow");
        const decoration = await h.page
          .locator('.content [data-role="motion"], .content .mdg-m')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).pointerEvents),
          );
        assert.ok(decoration.length > 0);
        assert.ok(decoration.every((value) => value === "none"));
        assert.equal(h.text, SOURCE);
        assert.deepEqual(h.writes(), []);
      },
    })),
    {
      name: "connector selection: read-only and reduced motion preserve body inspection after pan and host scroll",
      text: SOURCE,
      readOnly: true,
      async run(h: Harness) {
        await h.page.emulateMedia({ reducedMotion: "reduce" });
        await prepare(h, 0.49);
        const stage = await h.page.locator(".stage").boundingBox();
        assert.ok(stage);
        await h.page.mouse.move(stage.x + 50, stage.y + 50);
        await h.page.mouse.down({ button: "middle" });
        await h.page.mouse.move(stage.x + 97, stage.y + 81, { steps: 5 });
        await h.page.mouse.up({ button: "middle" });
        await h.page.evaluate(() => {
          document.body.style.overflow = "auto";
          document.body.style.height = "1800px";
          document.querySelector<HTMLElement>("#app")!.style.marginTop = "100px";
          window.scrollTo(0, 60);
        });
        await h.settled();
        const at = await body(h.page);
        await h.page.mouse.click(at.x, at.y + 5);
        await h.settled();
        assert.deepEqual(h.session.selected, ["call"]);
        await clear(h);
        await rectangle(h, { x: at.x + 15, y: at.y + 15 }, { x: at.x - 15, y: at.y - 15 }, true);
        assert.deepEqual(h.session.selected, ["call"]);
        assert.equal(h.text, SOURCE);
        assert.deepEqual(h.writes(), []);
      },
    },
    {
      name: "connector selection: rectangle direction chooses containment or crossing without changing source",
      text: SOURCE,
      async run(h: Harness) {
        await prepare(h);
        const at = await body(h.page);
        await rectangle(h, { x: at.x - 16, y: at.y - 20 }, { x: at.x + 16, y: at.y + 20 }, false);
        assert.deepEqual(h.session.selected, []);
        await rectangle(h, { x: at.x + 16, y: at.y + 20 }, { x: at.x - 16, y: at.y - 20 }, true);
        assert.deepEqual(h.session.selected, ["call"]);
        await clear(h);
        const label = await h.page
          .locator('.content [data-id="call"] [data-role="label"]')
          .boundingBox();
        assert.ok(label);
        await h.page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
        await h.settled();
        assert.deepEqual(
          h.session.selected,
          ["call"],
          "the label still wins over the body's hit surface",
        );
        assert.ok(await h.page.locator('.overlay [data-handle="end:to"]').isVisible());
        assert.equal(h.text, SOURCE);
        assert.deepEqual(h.writes(), []);
      },
    },
    {
      name: "connector selection: grouped red green yellow routes select at 49% without selecting enclosing accounts",
      text: GROUPED,
      async run(h: Harness) {
        await prepare(h, 0.49);
        for (const id of ["development", "production", "identity"]) {
          const at = await body(h.page, id, 0.3);
          await h.page.mouse.click(at.x, at.y);
          await h.settled();
          assert.deepEqual(h.session.selected, [id]);
          await clear(h);
        }
        const sheet = await h.page.locator(".content > svg").boundingBox();
        assert.ok(sheet);
        await rectangle(
          h,
          { x: sheet.x - 5, y: sheet.y - 5 },
          { x: sheet.x + sheet.width + 5, y: sheet.y + sheet.height + 5 },
          false,
        );
        for (const id of ["development", "production", "identity", "dev", "prod"])
          assert.ok(h.session.selected.includes(id), `${id} remains selectable by full enclosure`);
        await clear(h);
        const middle = await body(h.page, "production", 0.1);
        await rectangle(
          h,
          { x: middle.x + 12, y: middle.y + 12 },
          { x: middle.x - 12, y: middle.y - 12 },
          true,
        );
        assert.ok(h.session.selected.includes("production"));
        assert.ok(!h.session.selected.includes("dev") && !h.session.selected.includes("prod"));
        await clear(h);
        // A crossing band around the API also crosses its account: the account stays unselected.
        const api = await h.page
          .locator('.content [data-role="element"][data-id="devApi"]')
          .boundingBox();
        assert.ok(api);
        const account = await h.page
          .locator('.content [data-role="element"][data-id="dev"]')
          .boundingBox();
        assert.ok(account);
        await rectangle(
          h,
          { x: account.x + account.width + 12, y: api.y + 4 },
          { x: api.x - 12, y: api.y + api.height - 4 },
          true,
        );
        assert.ok(h.session.selected.includes("devApi"));
        assert.ok(
          !h.session.selected.includes("dev") && !h.session.selected.includes("devControl"),
        );
        await h.page.screenshot({
          path: join(output, "canvas-connector-selection-grouped-49.png"),
        });
        assert.equal(h.text, GROUPED);
        assert.deepEqual(h.writes(), []);
      },
    },
    {
      name: "connector selection: protected titles split hit surfaces and hidden layers do not select",
      text: GROUPED.replace(
        "    place client",
        "    route development from client.south to devApi.north via [(100, 190), (100, 340)]\n    place client",
      )
        .replace("  layout manual", "  layout manual\n  layers main, signal")
        .replace(
          'client -> devApi: "DEV" as development',
          'client -> devApi: "DEV" as development { layer signal }',
        ),
      async run(h: Harness) {
        await prepare(h);
        // Closing the inspector animates its width. Finish that transition and the following
        // ResizeObserver frames before recording screen-space points for these narrow pieces.
        await h.page.locator(".inspector").evaluate(async (panel) => {
          await Promise.all(
            panel.getAnimations().map((animation) => animation.finished.catch(() => null)),
          );
          await new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          );
        });
        await h.settled();
        // At 100% the manually routed left-hand leg can lie beyond the viewport. Fit after the
        // panel settles so both protected fragments are genuine reachable pointer targets.
        await h.page.getByRole("button", { name: "Fit the diagram", exact: true }).click();
        await h.settled();
        await h.page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        const source = h.text;
        const pieces = await h.page
          .locator('.content [data-role="relation"][data-id="development"]')
          .evaluate((group) =>
            [...group.children]
              .filter(
                (element) =>
                  element.tagName === "polyline" && !element.classList.contains("mdg-hit"),
              )
              .map((element) => {
                const line = element as SVGPolylineElement;
                const length = line.getTotalLength();
                const points = [0, length, length * 0.6].map((at) => {
                  const p = line.getPointAtLength(at);
                  const s = new DOMPoint(p.x, p.y).matrixTransform(line.getScreenCTM()!);
                  return { x: s.x, y: s.y };
                });
                return { start: points[0]!, end: points[1]!, press: points[2]! };
              }),
          );
        assert.equal(pieces.length, 2, "the route has a genuine protected-title gap");
        const stage = await h.page.locator(".stage").boundingBox();
        assert.ok(stage);
        for (const piece of pieces) {
          assert.ok(
            piece.press.x > stage.x &&
              piece.press.x < stage.x + stage.width &&
              piece.press.y > stage.y &&
              piece.press.y < stage.y + stage.height,
            "the protected-route fragment is inside the visible stage before clicking",
          );
          await h.page.mouse.click(piece.press.x, piece.press.y);
          await h.settled();
          assert.deepEqual(h.session.selected, ["development"]);
          await clear(h);
        }
        const gap = {
          x: (pieces[0]!.end.x + pieces[1]!.start.x) / 2,
          y: (pieces[0]!.end.y + pieces[1]!.start.y) / 2,
        };
        await h.page.mouse.click(gap.x, gap.y);
        await h.settled();
        assert.ok(!h.session.selected.includes("development"));
        await clear(h);
        await h.page.getByRole("button", { name: "Show the layers", exact: true }).click();
        await h.page.locator('.panel.layers .layer[data-layer="signal"] .eye').click();
        await h.page.getByRole("button", { name: "Show the layers", exact: true }).click();
        const at = pieces[0]!.press;
        await h.page.mouse.click(at.x, at.y);
        await h.settled();
        assert.ok(!h.session.selected.includes("development"));
        await clear(h);
        await rectangle(h, { x: at.x + 15, y: at.y - 25 }, { x: at.x - 15, y: at.y + 2 }, true);
        assert.ok(!h.session.selected.includes("development"));
        assert.equal(h.text, source);
        assert.deepEqual(h.writes(), []);
      },
    },
    ...["Shift", "Control"].map((modifier) => ({
      name: `connector selection: ${modifier} crossing retains the starting selection and Escape cancels`,
      text: SOURCE,
      async run(h: Harness) {
        await prepare(h);
        const client = await h.page
          .locator('.content [data-role="element"][data-id="client"]')
          .boundingBox();
        assert.ok(client);
        await h.page.mouse.click(client.x + client.width / 2, client.y + client.height / 2);
        await h.settled();
        const at = await body(h.page);
        await h.page.keyboard.down(modifier);
        await rectangle(h, { x: at.x + 16, y: at.y + 20 }, { x: at.x - 16, y: at.y - 20 }, true);
        await h.page.keyboard.up(modifier);
        assert.deepEqual(h.session.selected, ["client", "call"]);
        await h.page.mouse.move(at.x + 16, at.y + 20);
        await h.page.mouse.down();
        await h.page.mouse.move(at.x - 16, at.y - 20, { steps: 4 });
        await h.page.keyboard.press("Escape");
        await h.page.mouse.up();
        await h.settled();
        assert.equal(await h.page.locator(".overlay .band").count(), 0);
        assert.equal(h.text, SOURCE);
        assert.deepEqual(h.writes(), []);
      },
    })),
    {
      name: "connector selection: curved bodies use the curve rather than its empty bounding box",
      text: SOURCE.replace("  layout manual", "  layout manual\n  routing bezier").replace(
        "    place client",
        "    route call from client.east to api.west via [(400, 340)]\n    place client",
      ),
      async run(h: Harness) {
        await prepare(h, 0.49);
        const at = await body(h.page, "call", 0.2);
        await rectangle(h, { x: at.x + 20, y: at.y - 20 }, { x: at.x - 20, y: at.y + 20 }, true);
        assert.deepEqual(h.session.selected, ["call"]);
        await clear(h);
        const empty = await h.page
          .locator('.content [data-role="relation"][data-id="call"] path:not(.mdg-hit)')
          .first()
          .evaluate((path: SVGPathElement) => {
            const b = path.getBBox();
            const p = new DOMPoint(b.x + b.width / 2, b.y + 8).matrixTransform(
              path.getScreenCTM()!,
            );
            return { x: p.x, y: p.y };
          });
        await h.page.mouse.click(empty.x, empty.y);
        await h.settled();
        assert.deepEqual(h.session.selected, []);
        await rectangle(
          h,
          { x: empty.x + 8, y: empty.y + 6 },
          { x: empty.x - 8, y: empty.y - 6 },
          true,
        );
        assert.deepEqual(h.session.selected, []);
        assert.deepEqual(h.writes(), []);
      },
    },
    ...[
      {
        profile: "static dashed",
        text: SOURCE.replace(/ {2}animate[^\n]*\n/g, "").replace(
          "  placement",
          "  style call { line dashed }\n  placement",
        ),
      },
      {
        profile: "static dotted",
        text: SOURCE.replace(/ {2}animate[^\n]*\n/g, "").replace(
          "  placement",
          "  style call { line dotted }\n  placement",
        ),
      },
      {
        profile: "free",
        text: SOURCE.replace("diagram d: flow", "diagram d: free")
          .replace('client["Client"]', 'box client "Client"')
          .replace('api["API"]', 'box api "API"'),
      },
      {
        profile: "sequence",
        text: 'diagram d: sequence {\n actor client "Client"\n participant api "API"\n client -> api: "Invoke" as call\n animate call { effect dash }\n}\n',
      },
      {
        profile: "C4",
        text: 'model m {\n person client "Client"\n system api "API"\n client -> api: "Invoke" as call\n}\ndiagram d: c4 using m {\n level context\n include client, api\n animate call { effect dash }\n}\n',
      },
      {
        profile: "Gantt",
        text: 'diagram d: gantt {\n today 2026-06-01\n task a "First" from 2026-06-01 for 3d\n task b "Second" after a for 3d\n}\n',
      },
    ].map(({ profile, text }) => ({
      name: `connector selection: ${profile} relation bodies use the shared host interaction`,
      text,
      async run(h: Harness) {
        await prepare(h);
        const id = await h.page
          .locator('.content [data-role="relation"][data-id]')
          .first()
          .getAttribute("data-id");
        assert.ok(id);
        const at = await body(h.page, id, 0.3);
        await h.page.mouse.click(at.x, at.y);
        await h.settled();
        assert.deepEqual(h.session.selected, [id]);
        assert.equal(h.text, text);
        assert.deepEqual(h.writes(), []);
      },
    })),
    {
      name: "connector selection: a curved free line crosses in its visible coordinates",
      text: "diagram d: free {\n layout manual\n line wire from (160, 180) to (640, 180) via [(400, 340)]\n style wire { routing bezier; line dashed }\n}\n",
      async run(h: Harness) {
        await prepare(h, 0.49);
        const at = await body(h.page, "wire", 0.3);
        await rectangle(h, { x: at.x + 20, y: at.y - 20 }, { x: at.x - 20, y: at.y + 20 }, true);
        assert.deepEqual(h.session.selected, ["wire"]);
        assert.deepEqual(h.writes(), []);
      },
    },
  ];
}
