import assert from "node:assert/strict";
import { join } from "node:path";
import type { Page } from "playwright-core";

interface Helpers {
  output: string;
  analysed(page: Page): Promise<void>;
}

const FLOW = `// Selecting must preserve the whole source.
diagram d: flow {
  layout manual
  client["Client"]
  api["API"]
  client -> api: "Invoke" as call
  style call { stroke "#16a34a" }
  animate call { effect dash }
  placement {
    place client at (160, 180)
    place api at (640, 180)
  }
}
`;

interface Studio {
  load(files: [string, string][], open: string): void;
  session: { selected: readonly string[] };
}

const selected = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { meltemiPlayground: { studio: Studio } }).meltemiPlayground.studio
        .session.selected,
  );

async function expectSelection(page: Page, ids: readonly string[]): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      JSON.stringify(
        (window as unknown as { meltemiPlayground: { studio: Studio } }).meltemiPlayground.studio
          .session.selected,
      ) === JSON.stringify(expected),
    ids,
  );
  assert.deepEqual(await selected(page), ids);
}

export function connectorSelectionTests(h: Helpers) {
  return [false, true].map((spanish) => ({
    name: `connector selection: ${spanish ? "Spanish" : "English"} playground inspects animated bodies and directional bands at 49%`,
    locale: spanish ? "es-CL" : "en-US",
    async run({ page }: { page: Page }) {
      for (const [profile, source] of [
        ["flow", FLOW],
        [
          "free",
          FLOW.replace("diagram d: flow", "diagram d: free")
            .replace('client["Client"]', 'box client "Client"')
            .replace('api["API"]', 'box api "API"'),
        ],
        [
          "sequence",
          'diagram d: sequence {\n actor client "Client"\n participant api "API"\n client -> api: "Invoke" as call\n animate call { effect dash }\n}\n',
        ],
        [
          "c4",
          'model m {\n person client "Client"\n system api "API"\n client -> api: "Invoke" as call\n}\ndiagram d: c4 using m {\n level context\n include client, api\n animate call { effect dash }\n}\n',
        ],
        [
          "gantt",
          'diagram d: gantt {\n today 2026-06-01\n task a "First" from 2026-06-01 for 3d\n task b "Second" after a for 3d\n}\n',
        ],
      ] as const) {
        await page.evaluate(
          ({ profile, source }) =>
            (
              window as unknown as { meltemiPlayground: { studio: Studio } }
            ).meltemiPlayground.studio.load(
              [[`diagrams/${profile}.meltemi`, source]],
              `diagrams/${profile}.meltemi`,
            ),
          { profile, source },
        );
        await h.analysed(page);
        await page.locator("#app .content svg").waitFor();
        const zoom = page.locator('#app .toolbar select[aria-label="Zoom"]');
        await zoom.selectOption("1");
        const stage = page.locator("#app .stage");
        const box = await stage.boundingBox();
        assert.ok(box);
        await stage.dispatchEvent("wheel", {
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
          deltaY: -Math.log(0.49) / 0.002,
          ctrlKey: true,
        });
        const body = await page
          .locator('#app .content [data-role="relation"][data-id]')
          .first()
          .evaluate((group) => {
            const line = [...group.children].find(
              (element) =>
                (element.tagName === "polyline" || element.tagName === "path") &&
                !element.classList.contains("mdg-hit") &&
                element.getAttribute("stroke") !== "none",
            ) as SVGGeometryElement;
            const point = line.getPointAtLength(line.getTotalLength() * 0.2);
            const screen = new DOMPoint(point.x, point.y).matrixTransform(line.getScreenCTM()!);
            return { x: screen.x, y: screen.y, id: group.getAttribute("data-id")! };
          });
        const target = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.outerHTML,
          body,
        );
        await page.mouse.click(body.x, body.y);
        assert.ok(
          target?.includes('data-role="relation"') || target?.includes("mdg-connector-hit"),
          `${profile} reaches a body target`,
        );
        await expectSelection(page, [body.id]);
        await stage.focus();
        await page.keyboard.press("Escape");
        await expectSelection(page, []);
        if (profile === "flow") {
          for (const crossing of [false, true]) {
            await page.mouse.move(body.x + (crossing ? 14 : -14), body.y - 18);
            await page.mouse.down();
            await page.mouse.move(body.x + (crossing ? -14 : 14), body.y + 18, { steps: 5 });
            assert.equal(
              await page.locator("#app .overlay .band.crossing").count(),
              crossing ? 1 : 0,
            );
            assert.match(
              (await page.locator("#app .status").textContent()) ?? "",
              crossing ? /Crossing|cruzada/ : /Enclosing|encierro/,
            );
            await page.mouse.up();
            await expectSelection(page, crossing ? [body.id] : []);
          }
          await page.screenshot({
            path: join(h.output, `connector-selection-${spanish ? "es" : "en"}-49.png`),
          });
        }
        assert.equal(
          await page.locator(".code-input").inputValue(),
          source,
          `${profile} selection writes nothing`,
        );
      }
    },
  }));
}
