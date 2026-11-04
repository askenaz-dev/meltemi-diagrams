import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  layoutDiagram,
  onPolygon,
  pointInPolygon,
  turnPoint,
  turnedOutline,
  type GroupItem,
  type LayoutEngine,
  type LayoutOptions,
  type RectItem,
  type Scene,
} from "../src/index.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(body: string, kind = "flow", options: LayoutOptions = {}) {
  const compilation = compile(`${PLAIN}diagram d: ${kind} {\n  theme "plain"\n${body}\n}\n`);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return { ...result, scene: result.scene, codes: result.diagnostics.map((d) => d.code) };
}

function element(scene: Scene, id: string): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
  );
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

const close = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 1) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

describe("turning geometry", () => {
  it("turns points clockwise on screen, as SVG's rotate does", () => {
    close(turnPoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 });
    close(turnPoint({ x: 200, y: 72 }, { x: 200, y: 100 }, 90), { x: 228, y: 100 });
  });

  it("turns a shape's outline, or its box's corners, about the box's centre", () => {
    const box = { x: 0, y: 0, width: 120, height: 120 };
    const square = turnedOutline("square", box, 45);
    expect(square).toHaveLength(4);
    close(square[0]!, { x: 60, y: 60 - 60 * Math.SQRT2 });
    expect(pointInPolygon(square, { x: 2, y: 2 })).toBe(false);
    expect(pointInPolygon(square, { x: 60, y: 60 })).toBe(true);
    // From the left side of the drawn box, the end slides onto the left vertex.
    const drawn = { x: 60 - 60 * Math.SQRT2, y: 60 - 60 * Math.SQRT2 };
    close(onPolygon(square, { x: drawn.x, y: 60 }, "west"), { x: drawn.x, y: 60 });
    close(onPolygon(square, { x: drawn.x, y: 30 }, "west"), { x: drawn.x + 30, y: 30 });
  });
});

describe("turned elements", () => {
  it("draws a turned node's group about the centre of its box, the box unturned", () => {
    const result = run(
      '  layout manual\n  api["API"]\n  style api { rotation 30 }\n  placement {\n    place api at (200, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.rotations!.get("api")).toBe(30);
    expect(result.boxes!.get("api")).toEqual({ x: 120, y: 72, width: 160, height: 56 });
    const g = element(result.scene, "api");
    const rect = g.items.find((i): i is RectItem => i.kind === "rect")!;
    const { x: dx, y: dy } = result.offset!;
    const r = (v: number) => Math.round(v * 100) / 100;
    expect(g.transform).toBe(`rotate(30 ${r(200 + dx)} ${r(100 + dy)})`);
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([r(120 + dx), r(72 + dy), 160, 56]);
  });

  it("draws an angle of 360 upright", () => {
    const result = run(
      '  layout manual\n  api["API"]\n  style api { rotation 360 }\n  placement {\n    place api at (200, 100)\n  }',
    );
    expect(element(result.scene, "api").transform).toBeUndefined();
    expect(result.rotations!.size).toBe(0);
  });

  it("grows a group around a turned child's drawn box, the child's place unchanged", () => {
    const result = run(
      '  layout manual\n  group g "" {\n    box b "B"\n  }\n  style b { rotation 90 }\n  placement {\n    place g at (300, 200)\n    place b at (60, 100)\n  }',
      "free",
    );
    expect(result.codes).toEqual([]);
    const g = result.boxes!.get("g")!;
    // The 160 × 56 box drawn upright as 56 × 160 about its place in the interior, (60, 100): it
    // reaches 88 right and 180 down, and the untitled group's padding surrounds that.
    expect([g.width, g.height]).toEqual([16 + 88 + 16, 16 + 180 + 16]);
    const b = result.boxes!.get("b")!;
    expect([b.width, b.height]).toEqual([160, 56]);
  });

  it("gives the engine a turned node's drawn size and keeps its neighbours clear of it", () => {
    let seen: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (request) => {
        seen = request;
        return gridEngine.arrange(request);
      },
    };
    const result = run(
      '  layout auto\n  client["Client"]\n  api["API"]\n  db["DB"]\n  client -> api\n  api -> db\n  style api { rotation 90 }',
      "flow",
      { engine: spy },
    );
    const api = seen!.nodes.find((n) => n.id === "api")!;
    expect([api.width, api.height]).toEqual([56, 160]);
    // The drawn box is centred where the engine put the node.
    const box = result.boxes!.get("api")!;
    expect([box.x + box.width / 2, box.y + box.height / 2]).toEqual([340, 100]);
    expect(result.codes).not.toContain("layout.overlap");
  });

  it("keeps an unplaced box clear of a placed turned one in assisted mode", () => {
    const result = run(
      '  layout assisted\n  a["A"]\n  b["B"]\n  a -> b\n  style a { rotation 90 }\n  placement {\n    place a at (100, 100)\n  }',
      "flow",
      { engine: gridEngine },
    );
    const a = result.boxes!.get("a")!;
    const drawn = { x: a.x + 52, y: a.y - 52, width: 56, height: 160 };
    const b = result.boxes!.get("b")!;
    const overlaps =
      b.x < drawn.x + drawn.width &&
      drawn.x < b.x + b.width &&
      b.y < drawn.y + drawn.height &&
      drawn.y < b.y + b.height;
    expect(overlaps).toBe(false);
  });
});

describe("connectors on turned elements", () => {
  it("ends a free connector on the turned outline", () => {
    const result = run(
      '  layout manual\n  a["A"]\n  s[""]\n  style s { shape square; rotation 45 }\n  a -> s as go\n  placement {\n    place a at (100, 100)\n    place s at (400, 100)\n  }',
    );
    const points = result.connectors!.get("go")!.points;
    // The left vertex of the square turned by 45 degrees.
    close(points[points.length - 1]!, { x: 400 - 60 * Math.SQRT2, y: 100 });
  });

  it("turns a pinned end with its element", () => {
    const result = run(
      '  layout manual\n  api["API"]\n  db["DB"]\n  api -> db as save\n  style api { rotation 90 }\n  placement {\n    place api at (200, 100)\n    place db at (500, 100)\n    route save from api.north 50% to db\n  }',
    );
    const connector = result.connectors!.get("save")!;
    // The middle of the north side, turned a quarter, faces east.
    close(connector.points[0]!, { x: 228, y: 100 });
    expect(connector.fromSide).toBe("east");
  });
});

describe("checks of turned elements", () => {
  const sheet = (height: number, width = 300) =>
    `  layout manual\n  group g "" {\n    box b "B"\n  }\n  style b { rotation 90 }\n  placement {\n    place g at (300, 200)\n    size g (${width}, ${height})\n    place b at (${(width - 32) / 2}, ${(height - 32) / 2})\n  }`;

  it("reports a turned box that crosses the edge of its group", () => {
    const result = run(sheet(152), "free");
    expect(result.codes).toContain("layout.overlap");
  });

  it("reports nothing for a turned box inside its group", () => {
    const result = run(sheet(232, 152), "free");
    expect(result.codes).toEqual([]);
  });
});
