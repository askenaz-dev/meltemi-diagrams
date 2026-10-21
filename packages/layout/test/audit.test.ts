import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import {
  auditLabels,
  estimateMeasurer,
  layoutDiagram,
  type Scene,
  type SceneItem,
} from "../src/index.js";
import { splitAround } from "../src/layout.js";
import { avoidingRoute, crossedBoxes, detourRoute } from "../src/routing.js";

const text = (
  x: number,
  y: number,
  value: string,
  anchor: "start" | "middle" = "middle",
): SceneItem => ({
  kind: "text",
  x,
  y,
  baseline: y + 4,
  text: value,
  size: 12,
  weight: 400,
  font: "body",
  anchor,
  fill: "#000",
});

const rect = (x: number, y: number, width: number, height: number): SceneItem => ({
  kind: "rect",
  x,
  y,
  width,
  height,
  radius: 0,
  fill: "#fff",
  stroke: "#000",
  strokeWidth: 1,
  dashed: false,
});

const element = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  ...items: SceneItem[]
): SceneItem => ({
  kind: "group",
  id,
  role: "element",
  bounds: { x, y, width, height, radius: 0 },
  items: [rect(x, y, width, height), ...items],
});

const scene = (...items: SceneItem[]): Scene => ({
  width: 600,
  height: 400,
  background: "#fff",
  title: null,
  description: null,
  fonts: { body: "Inter", mono: "Cascadia Mono" },
  gradients: [],
  patterns: [],
  items,
});

const kinds = (s: Scene, options = {}) =>
  auditLabels(s, estimateMeasurer, options).map((p) =>
    p.kind === "cut"
      ? `cut:${p.by}:${p.text.owner}`
      : `overlap:${p.other.kind}:${p.text.owner}:${p.other.owner}`,
  );

describe("label audit", () => {
  it("accepts texts inside their shapes, apart from each other", () => {
    expect(
      kinds(
        scene(
          element("a", 10, 10, 160, 56, text(90, 38, "API")),
          element("b", 300, 10, 160, 56, text(380, 38, "DB")),
        ),
      ),
    ).toEqual([]);
  });

  it("reports texts beyond their shape, their background and the picture", () => {
    expect(
      kinds(scene(element("a", 200, 10, 60, 56, text(230, 38, "A long label for a small box")))),
    ).toEqual(["cut:shape:a"]);
    const label: SceneItem = {
      kind: "group",
      id: "r",
      role: "label",
      items: [rect(100, 100, 20, 18), text(110, 109, "a wide label")],
    };
    expect(kinds(scene({ kind: "group", id: "r", role: "relation", items: [label] }))).toEqual([
      "cut:background:r",
    ]);
    expect(kinds(scene(element("a", 560, 10, 160, 56, text(640, 38, "Off the edge"))))).toEqual([
      "cut:picture:a",
    ]);
  });

  it("reports texts over other texts, boxes and connectors, not over their own", () => {
    const over = scene(
      element("a", 10, 10, 160, 56, text(90, 38, "Order API")),
      element("b", 100, 20, 160, 56, text(110, 40, "Orders")),
    );
    expect(kinds(over)).toContain("overlap:text:b:a");
    expect(kinds(over)).toContain("overlap:box:a:b");
    const line: SceneItem = {
      kind: "group",
      id: "r",
      role: "relation",
      items: [
        {
          kind: "polyline",
          points: [
            { x: 90, y: 0 },
            { x: 90, y: 300 },
          ],
          stroke: "#000",
          strokeWidth: 1,
          dashed: false,
        },
        {
          kind: "group",
          id: "r",
          role: "label",
          items: [rect(70, 200, 40, 18), text(90, 209, "own")],
        },
      ],
    };
    expect(kinds(scene(element("a", 10, 10, 160, 56, text(90, 38, "API")), line))).toEqual([
      "overlap:connector:a:r",
    ]);
  });

  it("lets containers hold labels and annotations sit on boxes, and keeps layers apart", () => {
    const container = element("g", 0, 0, 400, 300, text(20, 14, "Backend", "start"));
    const inner = element("a", 40, 60, 160, 56, text(120, 88, "API"));
    expect(kinds(scene(container, inner))).toEqual([]);
    const badge = element("t", 150, 50, 30, 18, text(165, 59, "JWT"));
    expect(kinds(scene(inner, badge), { annotations: new Set(["t"]) })).toEqual([]);
    expect(
      kinds(scene(inner, element("b", 150, 70, 100, 40, text(200, 90, "x"))), {
        layers: new Map([["b", "front"]]),
      }),
    ).toEqual([]);
  });

  it("lets a container's own text lie over the boxes it holds, but not over another's text", () => {
    const outer = element("outer", 100, 100, 260, 240, text(230, 220, "Outer"));
    const inner = element("inner", 155, 155, 150, 130);
    expect(kinds(scene(outer, inner))).toEqual([]);
    // A box it does not hold whole is still in the way.
    const beside = element("beside", 220, 210, 200, 40);
    expect(kinds(scene(outer, inner, beside))).toEqual(["overlap:box:outer:beside"]);
    // Two texts drawn at one point are reported, whatever holds what.
    const labelled = element("inner", 155, 155, 150, 130, text(230, 220, "Inner"));
    expect(kinds(scene(outer, labelled))).toEqual(["overlap:text:inner:outer"]);
  });
});

describe("label audit of stacks", () => {
  const stack = (outer: string, middle: string | null, inner: string) => {
    const declarations = [
      `  box outer ${outer}`,
      ...(middle === null ? [] : [`  box middle ${middle}`]),
      `  box inner ${inner}`,
    ].join("\n");
    const sizes =
      "    place outer at (300, 200)\n    size outer (260, 240)\n    place middle at (300, 200)\n    size middle (210, 180)\n    place inner at (300, 200)\n    size inner (150, 130)\n";
    const compilation = compile(
      `diagram d: free {\n${declarations}\n  placement {\n${middle === null ? sizes.replace(/.*middle.*\n/g, "") : sizes}  }\n}\n`,
    );
    return layoutDiagram(compilation, compilation.document.diagrams[0]!).diagnostics;
  };

  it("reports nothing for a stack with empty labels", () => {
    expect(stack('""', '""', '""')).toEqual([]);
  });

  it("reports nothing for a container's own label over the box it holds", () => {
    expect(stack('"Outer"', null, '""')).toEqual([]);
  });

  it("reports labels that coincide on the inner box", () => {
    const diagnostics = stack('"Outer"', null, '"Inner"');
    expect(diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([
      ["layout.label-overlap", 3],
    ]);
    expect(diagnostics[0]!.message).toBe(
      'The text "Inner" of `inner` overlaps the text "Outer" of `outer`.',
    );
  });
});

describe("connectors and labels kept clear", () => {
  it("draws a connector in pieces around a title", () => {
    const pieces = splitAround(
      [
        { x: 0, y: 50 },
        { x: 300, y: 50 },
      ],
      [{ x: 100, y: 40, width: 50, height: 20 }],
    );
    expect(pieces).toEqual([
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      [
        { x: 150, y: 50 },
        { x: 300, y: 50 },
      ],
    ]);
    expect(
      splitAround(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [{ x: 100, y: 100, width: 5, height: 5 }],
      ),
    ).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    ]);
  });

  it("finds a route around a box that stands in the way", () => {
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 0, y: 400, width: 100, height: 50 };
    const middle = { x: 0, y: 200, width: 100, height: 50 };
    const straight = [
      { x: 50, y: 50 },
      { x: 50, y: 400 },
    ];
    expect(crossedBoxes(straight, [middle])).toHaveLength(1);
    const around = avoidingRoute(from, to, [middle], straight)!;
    expect(crossedBoxes(around.points, [middle, from, to])).toEqual([]);
    expect(avoidingRoute(from, to, [], straight)).toBeUndefined();
  });

  it("goes around a box in the way, keeping pinned ends and their sides", () => {
    // `client` above `db`, `api` to their left; both ends pinned to south sides.
    const client = { x: 400, y: 0, width: 160, height: 56 };
    const db = { x: 400, y: 100, width: 160, height: 56 };
    const api = { x: 0, y: 100, width: 160, height: 56 };
    const route = detourRoute(
      { box: client, point: { x: 480, y: 56 }, side: "south" },
      { box: api, point: { x: 80, y: 156 }, side: "south" },
      [db],
    )!;
    expect(route[0]).toEqual({ x: 480, y: 56 });
    // Out of the south side, straight down at least the stub, before any turn.
    expect(route[1]!.x).toBe(480);
    expect(route[1]!.y).toBeGreaterThanOrEqual(76);
    expect(route.at(-1)).toEqual({ x: 80, y: 156 });
    expect(route.at(-2)!.x).toBe(80);
    expect(route.at(-2)!.y).toBeGreaterThan(156);
    expect(crossedBoxes(route, [client, db, api])).toEqual([]);
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1]!, route[i]!];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    // Walled in: no way out.
    const wall = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
    expect(
      detourRoute(
        { box: client, point: { x: 480, y: 56 }, side: "south" },
        { box: api, point: { x: 80, y: 156 }, side: "south" },
        [wall(300, 60, 400, 30)],
      ),
    ).toBeUndefined();
  });

  const run = (body: string) => {
    const compilation = compile(`diagram d: flow {\n  layout manual\n${body}\n}\n`);
    return layoutDiagram(compilation, compilation.document.diagrams[0]!);
  };

  it("slides a label off a box to the nearest clear stop", () => {
    const result = run(
      '  routing polyline\n  a["A"]\n  c["C"]\n  b["B"]\n  a -> c: "save" as save\n  placement {\n    place a at (100, 100)\n    place c at (700, 100)\n    place b at (400, 118)\n    size b (60, 20)\n  }',
    );
    const label = result.labels!.get("save")!;
    const b = result.boxes!.get("b")!;
    const overlapping =
      Math.min(label.x + label.width, b.x + b.width) > Math.max(label.x, b.x) &&
      Math.min(label.y + label.height, b.y + b.height) > Math.max(label.y, b.y);
    expect(overlapping).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual([]);
  });

  it("reports a connector that still runs through a box", () => {
    const result = run(
      '  routing polyline\n  a["A"]\n  b["B"]\n  c["C"]\n  a -> c as r\n  placement {\n    place a at (100, 100)\n    place b at (350, 100)\n    place c at (600, 100)\n  }',
    );
    expect(result.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["layout.connector-crossing", "The connector of `r` runs through `b`."],
    ]);
  });

  it("takes default connectors around boxes in manual layouts", () => {
    const result = run(
      '  a["A"]\n  b["B"]\n  c["C"]\n  a -> c as r\n  placement {\n    place a at (100, 100)\n    place b at (100, 300)\n    place c at (100, 500)\n  }',
    );
    expect(result.diagnostics).toEqual([]);
  });
});
