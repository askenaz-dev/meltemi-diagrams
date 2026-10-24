import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import type { ImageResolver } from "@meltemi/diagrams-assets";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  TextMetrics,
  estimateMeasurer,
  THEMES,
  layoutDiagram,
  stacked,
  type GroupItem,
  type ImageItem,
  type LayoutEngine,
  type LayoutOptions,
  type PathItem,
  type RectItem,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(body: string, options: LayoutOptions = {}, extra = "") {
  const compilation = compile(`${PLAIN}${extra}diagram d: free {\n  theme "plain"\n${body}\n}\n`);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams.find((d) => d.id === "d")!;
  const result = layoutDiagram(compilation, diagram, options);
  return { ...result, codes: result.diagnostics.map((d) => d.code) };
}

function scene(body: string, options: LayoutOptions = {}): Scene {
  const result = run(body, options);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function element(scene: Scene, id: string): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
  );
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

const of = <K extends SceneItem["kind"]>(g: GroupItem, kind: K) =>
  g.items.filter((i): i is Extract<SceneItem, { kind: K }> => i.kind === kind);

describe("free lines", () => {
  /** The scene point of a diagram point: the scene is moved by the layout's offset. */
  const at = (result: ReturnType<typeof run>, x: number, y: number) => ({
    x: x + result.offset!.x,
    y: y + result.offset!.y,
  });

  it("draws a straight line as a connector of its own, with no head", () => {
    const result = run("  line l from (40, 200) to (520, 200)");
    const group = element(result.scene!, "l");
    const [line] = of(group, "polyline");
    expect(line!.points).toEqual([at(result, 40, 200), at(result, 520, 200)]);
    expect(line).toMatchObject({ stroke: "#526579", strokeWidth: 1.3 });
    expect(of(group, "path")).toEqual([]);
    expect(group.track).toEqual(line!.points);
    expect(result.boxes!.get("l")).toEqual({ x: 40, y: 200, width: 480, height: 1 });
    expect(result.connectors!.get("l")).toMatchObject({
      points: [
        { x: 40, y: 200 },
        { x: 520, y: 200 },
      ],
      via: [],
    });
  });

  it("rounds a bend, cuts a head and stops the line at its base", () => {
    const result = run(
      "  line l from (0, 0) to (200, 100) via [(200, 0)]\n  style l { routing orthogonal; corners rounded; arrowhead triangle }",
    );
    const drawn = result.connectors!.get("l")!.line;
    expect(drawn).toContainEqual({ x: 190, y: 0 });
    expect(drawn).toContainEqual({ x: 200, y: 10 });
    expect(drawn).not.toContainEqual({ x: 200, y: 0 });
    // The head points down at (200, 100); the line stops above it.
    expect(drawn.at(-1)!.x).toBe(200);
    expect(drawn.at(-1)!.y).toBeLessThan(100);
    const [head] = of(element(result.scene!, "l"), "path");
    expect(head!.fill).toBe("#526579");
  });

  it("routes a line as written: straight by default, elbows when orthogonal, a curve with bezier", () => {
    const plain = run(
      "  routing orthogonal\n  line l from (100, 100) to (300, 100) via [(200, 150)]",
    );
    expect(plain.connectors!.get("l")!.points).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 300, y: 100 },
    ]);
    const elbow = run("  line l from (0, 0) to (200, 100)\n  style l { routing orthogonal }");
    expect(elbow.connectors!.get("l")!.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ]);
    const curved = run(
      "  line l from (0, 0) to (200, 0) via [(100, 60)]\n  style l { routing bezier }",
    );
    const group = element(curved.scene!, "l");
    const [path] = of(group, "path");
    expect(path!.d).toMatch(/C/);
    expect(path!.fill).toBe("none");
    expect(group.track!.length).toBeGreaterThan(3);
  });

  it("moves a line with its group, which keeps its statement", () => {
    const body = (x: number) =>
      `  group g "G" {\n    line l from (20, 40) to (120, 40)\n  }\n  placement {\n    place g at (${x}, 200)\n    size g (400, 240)\n  }`;
    const left = run(body(300));
    const right = run(body(500));
    expect(right.boxes!.get("l")!.x - left.boxes!.get("l")!.x).toBe(200);
    expect(left.origins!.get("l")).toEqual({ x: 116, y: 120 });
    expect(left.boxes!.get("l")).toMatchObject({ x: 136, y: 160 });
  });

  it("draws a label pill at the middle, or where its label statement puts it", () => {
    const middle = run('  line l "Step" from (0, 0) to (300, 0)');
    const pill = middle.labels!.get("l")!;
    expect(pill.x + pill.width / 2).toBeCloseTo(150, 5);
    const label = element(middle.scene!, "l").items.find(
      (i) => i.kind === "group" && i.role === "label",
    );
    expect(label).toBeDefined();
    const moved = run('  line l "Step" from (0, 0) to (300, 0)\n  placement { label l at 20% }');
    const box = moved.labels!.get("l")!;
    expect(box.x + box.width / 2).toBeCloseTo(60, 5);
  });

  it("paints a line in source order and leaves it out of the composition checks", () => {
    const result = run(
      '  box a "A"\n  line l from (0, 20) to (200, 20)\n  box b "B"\n  placement {\n    place a at (60, 20)\n    place b at (300, 20)\n  }',
    );
    const order = result
      .scene!.items.filter((i): i is GroupItem => i.kind === "group" && i.role === "element")
      .map((i) => i.id);
    expect(order).toEqual(["a", "l", "b"]);
    expect(result.codes).not.toContain("layout.overlap");
  });

  it("draws a line with no length as a point, and says so", () => {
    const result = run("  line l from (10, 10) to (10, 10)");
    const warning = result.diagnostics.find((d) => d.code === "layout.degenerate-line");
    expect(warning).toMatchObject({ severity: "warning" });
    const [dot] = of(element(result.scene!, "l"), "path");
    expect(dot!.fill).toBe("#526579");
  });

  it("draws the heads written on a line, shorter by their lengths", () => {
    const result = run(
      "  line l from (0, 0) to (200, 0)\n  style l { arrowtail circle; arrowhead triangle }",
    );
    const drawn = result.connectors!.get("l")!.line;
    expect(drawn[0]!.x).toBeGreaterThan(0);
    expect(drawn.at(-1)!.x).toBeLessThan(200);
    expect(of(element(result.scene!, "l"), "path")).toHaveLength(2);
  });

  it("derives a group's size from the line it holds", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n    line l from (0, 120) to (400, 120)\n  }\n  placement {\n    place g at (300, 200)\n    place a at (80, 28)\n  }',
    );
    const group = result.boxes!.get("g")!;
    const line = result.boxes!.get("l")!;
    expect(group.x).toBeLessThanOrEqual(line.x);
    expect(group.x + group.width).toBeGreaterThanOrEqual(line.x + line.width);
  });
});

describe("interior coordinates", () => {
  const sheet = (x: number) =>
    `  group g "G" {\n    box a "A"\n  }\n  placement {\n    place g at (${x}, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }`;

  it("places children relative to the interior of their group", () => {
    const result = run(sheet(300));
    // The group spans 100..500 × 80..320; its interior starts at (116, 120).
    expect(result.boxes!.get("g")).toEqual({ x: 100, y: 80, width: 400, height: 240 });
    expect(result.boxes!.get("a")).toEqual({ x: 96, y: 132, width: 160, height: 56 });
    expect(result.origins!.get("a")).toEqual({ x: 116, y: 120 });
  });

  it("moves the children with their group", () => {
    const before = run(sheet(300)).boxes!.get("a")!;
    const after = run(sheet(500)).boxes!.get("a")!;
    expect(after.x - before.x).toBe(200);
    expect(after.y).toBe(before.y);
  });

  it("derives the size of a group from its children", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    place a at (100, 50)\n  }',
    );
    expect(result.boxes!.get("g")).toMatchObject({ width: 16 + 180 + 16, height: 40 + 78 + 16 });
  });

  it("derives an untitled group with the padding above its interior", () => {
    const result = run(
      '  group g "" {\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    place a at (100, 50)\n  }',
    );
    const g = result.boxes!.get("g")!;
    expect(g).toEqual({ x: 194, y: 145, width: 16 + 180 + 16, height: 16 + 78 + 16 });
    expect(result.origins!.get("a")).toEqual({ x: g.x + 16, y: g.y + 16 });
    expect(of(element(result.scene!, "g"), "text")).toEqual([]);
  });

  it("gives an untitled group no minimum width", () => {
    const result = run(
      '  group g "" {\n    box a ""\n  }\n  placement {\n    place g at (300, 200)\n    place a at (2, 2)\n    size a (4, 4)\n  }',
    );
    expect(result.boxes!.get("g")).toMatchObject({ width: 16 + 4 + 16, height: 16 + 4 + 16 });
  });

  it("keeps the band of a group with an empty label and a description or an icon", () => {
    const body = (inside: string, extra = "") =>
      `  group g "" {\n${inside}    box a "A"\n  }\n${extra}  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }`;
    const described = run(body('    description "Backend"\n'));
    expect(described.origins!.get("a")).toEqual({ x: 116, y: 120 });
    const band = element(described.scene!, "g");
    const outline = of(band, "rect")[0]!;
    const text = of(band, "text").find((t) => t.text === "Backend")!;
    expect(text.y).toBeGreaterThan(outline.y);
    expect(text.y).toBeLessThan(outline.y + 40);
    const icon = run(body("", '  style g { icon "tabler:server" }\n'));
    expect(icon.origins!.get("a")).toEqual({ x: 116, y: 120 });
  });

  it("draws an untitled group as a plain rectangle with its fill", () => {
    const s = scene(
      '  group g "" {\n    box a "A"\n  }\n  style g { fill "#dae8fc" }\n  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 40)\n  }',
    );
    const g = element(s, "g");
    expect(of(g, "rect")).toHaveLength(1);
    expect(of(g, "rect")[0]).toMatchObject({ fill: "#dae8fc", width: 400, height: 240 });
    expect(of(g, "text")).toEqual([]);
  });

  it("cuts no hole for the title of an untitled group in the connectors that pass over it", () => {
    // `p -> q` runs along y = 98, where the title of a titled `g` is drawn.
    const pieces = (label: string) => {
      const s = scene(
        `  group g ${label} {\n    box a "A"\n  }\n  box p "P"\n  box q "Q"\n  p -> q as link\n  placement {\n    place g at (300, 200)\n    size g (400, 240)\n    place a at (60, 80)\n    place p at (-40, 98)\n    place q at (640, 98)\n  }`,
      );
      const link = s.items.find(
        (i): i is GroupItem => i.kind === "group" && i.id === "link" && i.role === "relation",
      )!;
      return of(link, "polyline").length;
    };
    expect(pieces('"Backend"')).toBe(2);
    expect(pieces('""')).toBe(1);
  });

  it("keeps labels off the title band of a titled group only", () => {
    // `p -> q` runs along y = 140 over the top of `g`, which spans 270..330 × 120..220.
    const label = (title: string) =>
      run(
        `  group g ${title}\n  box p "P"\n  box q "Q"\n  p -> q: "x" as link\n  placement {\n    place g at (300, 170)\n    size g (60, 100)\n    place p at (120, 140)\n    place q at (430, 140)\n  }`,
      ).labels!.get("link")!;
    const center = (box: { x: number; width: number }) => box.x + box.width / 2;
    // The connector spans 200..350: the label stays in the middle over an untitled group, and
    // slides to the first clear stop, a third of the way, beside a title.
    expect(center(label('""'))).toBe(275);
    expect(center(label('"G"'))).toBeCloseTo(251);
  });

  it("nests interiors", () => {
    const result = run(
      '  group outer "Outer" {\n    group inner "Inner" {\n      box a "A"\n    }\n  }\n  placement {\n    place outer at (400, 300)\n    size outer (600, 400)\n    place inner at (200, 120)\n    size inner (300, 200)\n    place a at (100, 60)\n  }',
    );
    // outer: 100..700 × 100..500, interior (116, 140); inner centre (316, 260), box 166..466 ×
    // 160..360, interior (182, 200); a centre (282, 260).
    expect(result.boxes!.get("inner")).toEqual({ x: 166, y: 160, width: 300, height: 200 });
    expect(result.boxes!.get("a")).toEqual({ x: 202, y: 232, width: 160, height: 56 });
    expect(result.origins!.get("inner")).toEqual({ x: 116, y: 140 });
    expect(result.origins!.get("a")).toEqual({ x: 182, y: 200 });
  });

  it("needs a place for every group in manual layouts", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  placement {\n    place a at (60, 40)\n  }',
    );
    expect(result.scene).toBeNull();
    expect(result.codes).toEqual(["layout.missing-placement"]);
    expect(result.diagnostics[0]!.message).toContain("Group `g`");
  });

  it("keeps route waypoints in diagram coordinates", () => {
    const result = run(
      '  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  a -> b as r\n  placement {\n    place g at (200, 200)\n    place a at (90, 40)\n    place b at (600, 400)\n    route r from a.east to b.west via [(400, 400)]\n  }',
    );
    expect(result.connectors!.get("r")!.via).toEqual([{ x: 400, y: 400 }]);
    expect(result.connectors!.get("r")!.points).toContainEqual({ x: 400, y: 400 });
  });
});

describe("free objects", () => {
  it("sizes a text object from its measured text", () => {
    const result = run(
      '  text heading "Arquitectura"\n  style heading { fontSize 32 }\n  placement {\n    place heading at (300, 100)\n  }',
    );
    const theme = THEMES["technical.light"]!;
    const width = new TextMetrics(estimateMeasurer, theme).width("Arquitectura", "body", 600, 32);
    expect(result.boxes!.get("heading")).toMatchObject({ width: Math.ceil(width), height: 40 });
    const text = of(element(result.scene!, "heading"), "text")[0]!;
    expect(text).toMatchObject({ size: 32, anchor: "start", text: "Arquitectura" });
    expect(of(element(result.scene!, "heading"), "rect")).toEqual([]);
  });

  it("breaks text at line breaks and aligns it", () => {
    const s = scene(
      '  text t "One\\nTwo"\n  style t { textAlign right; fontSize 20; fontWeight 400 }\n  placement {\n    place t at (300, 100)\n    size t (300, 60)\n  }',
    );
    const lines = of(element(s, "t"), "text");
    expect(lines.map((l) => [l.text, l.anchor, l.weight])).toEqual([
      ["One", "end", 400],
      ["Two", "end", 400],
    ]);
    expect(lines[1]!.y - lines[0]!.y).toBe(25);
  });

  it("draws a frame for text with a fill", () => {
    const s = scene(
      '  text t "Note"\n  style t { fill "#fffbe6"; stroke warning }\n  placement {\n    place t at (300, 100)\n  }',
    );
    expect(of(element(s, "t"), "rect")[0]).toMatchObject({ fill: "#fffbe6" });
  });

  it.each([
    ["rectangle", "rect", 0],
    ["pill", "rect", 28],
    ["rounded", "rect", 8],
  ] as const)("draws %s boxes as rects", (shape, kind, radius) => {
    const s = scene(
      `  box a "A"\n  style a { shape ${shape} }\n  placement {\n    place a at (200, 100)\n  }`,
    );
    const outline = of(element(s, "a"), kind)[0] as RectItem;
    expect(outline.radius).toBe(radius);
  });

  it.each([
    ["ellipse", " A"],
    ["diamond", " L"],
    ["cylinder", " A"],
  ])("draws %s boxes as paths", (shape, command) => {
    const s = scene(
      `  box a "A"\n  style a { shape ${shape} }\n  placement {\n    place a at (200, 100)\n  }`,
    );
    const outline = of(element(s, "a"), "path")[0] as PathItem;
    expect(outline.d).toContain(command);
  });

  it("draws the shorthand data form as a cylinder", () => {
    const s = scene('  db[("Orders")]\n  placement {\n    place db at (200, 100)\n  }');
    expect(of(element(s, "db"), "path")).toHaveLength(2);
  });

  it("aligns box labels", () => {
    const s = scene(
      '  box a "A"\n  style a { textAlign left; fontSize 18 }\n  placement {\n    place a at (200, 100)\n    size a (200, 60)\n  }',
    );
    const label = of(element(s, "a"), "text")[0] as TextItem;
    const outline = of(element(s, "a"), "rect")[0] as RectItem;
    expect(label).toMatchObject({ anchor: "start", size: 18, x: outline.x + 16 });
  });

  it("draws an icon placeholder without an icon resolver", () => {
    const s = scene('  icon s "tabler:server"\n  placement {\n    place s at (100, 100)\n  }');
    const g = element(s, "s");
    expect(of(g, "rect")[0]).toMatchObject({ width: 48, height: 48, dashed: true });
  });
});

describe("images", () => {
  const sheet =
    '  image logo "logo.png" { description "Company logo" }\n  placement {\n    place logo at (200, 100)\n  }';

  it("draws a placeholder and warns without a resolver", () => {
    const result = run(sheet);
    expect(result.codes).toEqual(["layout.image-unavailable"]);
    expect(result.boxes!.get("logo")).toMatchObject({ width: 160, height: 120 });
    const g = element(result.scene!, "logo");
    expect(of(g, "rect")[0]).toMatchObject({ dashed: true });
    expect(of(g, "text")[0]!.text).toBe("logo.png");
  });

  it("embeds a resolved image at its pixel size", () => {
    const images: ImageResolver = {
      resolve: (path) =>
        path === "logo.png"
          ? { format: "png", width: 320, height: 80, href: "data:image/png;base64,AAAA" }
          : undefined,
    };
    const result = run(sheet, { images });
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("logo")).toMatchObject({ width: 320, height: 80 });
    const image = of(element(result.scene!, "logo"), "image")[0] as ImageItem;
    expect(image).toMatchObject({
      width: 320,
      height: 80,
      href: "data:image/png;base64,AAAA",
      title: "Company logo",
    });
  });

  it("scales wide images down to 640", () => {
    const images: ImageResolver = {
      resolve: () => ({ format: "png", width: 1280, height: 720, href: "data:image/png;base64," }),
    };
    expect(run(sheet, { images }).boxes!.get("logo")).toMatchObject({ width: 640, height: 360 });
  });
});

/** The drawn elements and relations of a scene, in paint order. */
const order = (s: Scene) =>
  s.items.flatMap((i) => (i.kind === "group" ? [`${i.role}:${i.id}`] : []));

describe("layers and paint order", () => {
  it("paints groups, then objects in source order, then relations, per layer", () => {
    const s = scene(
      '  layers main, front\n  box a "A" { layer front }\n  box b "B"\n  group g "G" {\n    box c "C"\n  }\n  b -> c as r\n  placement {\n    place a at (100, 100)\n    place b at (300, 100)\n    place g at (300, 400)\n    size g (300, 200)\n    place c at (100, 60)\n  }',
    );
    expect(order(s)).toEqual(["element:g", "element:b", "element:c", "relation:r", "element:a"]);
  });

  it("does not report overlaps between layers", () => {
    const body =
      '  layers back\n  box a "A" { layer back }\n  box b "B"\n  placement {\n    place a at (100, 100)\n    place b at (120, 110)\n  }';
    expect(run(body).codes).toEqual([]);
    expect(run(body.replace(" { layer back }", "")).codes).toEqual(["layout.overlap"]);
  });

  const stack = (first: string, second: string, third = "") =>
    `  ${first}\n  ${second}\n${third ? `  ${third}\n` : ""}  placement {\n    place outer at (300, 200)\n    size outer (260, 240)\n    place middle at (300, 200)\n    size middle (210, 180)\n    place inner at (300, 200)\n    size inner (150, 130)\n  }`;

  it("draws a stack outer first and does not report it", () => {
    const result = run(stack('box outer ""', 'box middle ""', 'box inner ""'));
    expect(result.codes).toEqual([]);
    expect(order(result.scene!)).toEqual(["element:outer", "element:middle", "element:inner"]);
  });

  it("reports a stack declared inner first on the outer box", () => {
    const result = run(stack('box inner ""', 'box outer ""').replace(/\n.*middle.*/g, ""));
    expect(result.codes).toEqual(["layout.overlap"]);
    expect(result.diagnostics[0]!.data).toEqual({ ids: ["inner", "outer"] });
    expect(result.diagnostics[0]!.range.start.line).toBe(9); // `box outer`, one-based
    expect(result.diagnostics[0]!.hints).toEqual([
      "Declare `outer` before `inner` to draw a stack.",
    ]);
  });

  it("gives hosts the stack rule the checks use", () => {
    const outer = { x: 0, y: 0, width: 260, height: 240 };
    expect(stacked(outer, { x: 55, y: 55, width: 150, height: 130 })).toBe(true);
    expect(stacked(outer, { x: 0, y: 0, width: 260, height: 240 })).toBe(false);
    expect(stacked(outer, { x: 200, y: 55, width: 150, height: 130 })).toBe(false);
    expect(stacked({ x: 55, y: 55, width: 150, height: 130 }, outer)).toBe(false);
  });

  it("reports boxes that coincide: one hides the other, which is no stack", () => {
    const body = (label: string) =>
      `  box a ${label}\n  box b ${label}\n  placement {\n    place a at (200, 200)\n    place b at (200, 200)\n  }`;
    for (const label of ['""', '"A"']) {
      const result = run(body(label));
      expect(result.codes, label).toEqual(["layout.overlap"]);
      expect(result.diagnostics[0]!.data).toEqual({ ids: ["a", "b"] });
      expect(result.diagnostics[0]!.hints).toBeUndefined();
    }
  });

  it("takes a box a pixel inside another on one side as a stack, half a pixel as no stack", () => {
    const body = (inner: string) =>
      `  box outer ""\n  box inner ""\n  placement {\n    place outer at (300, 200)\n    size outer (160, 56)\n    place inner at (300, 200)\n    size inner ${inner}\n  }`;
    expect(run(body("(158, 56)")).codes).toEqual([]);
    expect(run(body("(160, 54)")).codes).toEqual([]);
    expect(run(body("(159, 56)")).codes).toEqual(["layout.overlap"]);
  });

  it("does not hold a box to the margin of its group on another layer", () => {
    // `a` is 4 px inside the left edge of `g`, which is on `back` while `a` is on `main`.
    const body =
      '  layers back, main\n  group g "" {\n    layer back\n    box a "A"\n  }\n  placement {\n    place g at (300, 200)\n    size g (400, 200)\n    place a at (68, 16)\n  }';
    expect(run(body).codes).toEqual([]);
    expect(run(body.replace("    layer back\n", "")).codes).toEqual(["layout.container-margin"]);
    // A titled group's band is not checked across layers either.
    expect(run(body.replace('group g ""', 'group g "G"')).codes).toEqual([]);
  });

  it("does not check a band on a back layer against boxes, groups or connectors", () => {
    const body =
      '  layers back, main\n  box band "" { layer back }\n  box api "API"\n  box db "DB"\n  group g "G" {\n    box c "C"\n  }\n  api -> db as call\n  style call { routing polyline }\n  placement {\n    place band at (400, 200)\n    size band (300, 200)\n    place api at (250, 200)\n    place db at (700, 200)\n    place g at (450, 360)\n    size g (200, 160)\n    place c at (84, 70)\n  }';
    expect(run(body).codes).toEqual([]);
    // On one layer, the band overlaps `api` and the group, and the connector runs through it.
    const flat = run(body.replace(" { layer back }", ""));
    expect(flat.diagnostics.map((d) => [d.code, d.data?.ids])).toEqual([
      ["layout.overlap", ["band", "api"]],
      ["layout.overlap", ["band", "g"]],
      ["layout.connector-crossing", ["call", "band"]],
    ]);
  });

  it("does not report a connector between boxes stacked inside another box", () => {
    const body = (routing: string) =>
      `  box outer ""\n  box a "A"\n  box b "B"\n  a -> b as link\n${routing}  placement {\n    place outer at (300, 200)\n    size outer (400, 200)\n    place a at (200, 200)\n    place b at (400, 200)\n  }`;
    expect(run(body("  style link { routing polyline }\n")).codes).toEqual([]);
    // A default connector keeps its straight route instead of going around the container.
    const result = run(body(""));
    expect(result.codes).toEqual([]);
    expect(result.connectors!.get("link")!.points).toEqual([
      { x: 280, y: 200 },
      { x: 320, y: 200 },
    ]);
  });

  it("keeps a straight connector over a band on a back layer", () => {
    const result = run(
      '  layers back, main\n  box band "" { layer back }\n  box api "API"\n  box db "DB"\n  api -> db as call\n  placement {\n    place band at (400, 200)\n    size band (300, 200)\n    place api at (150, 200)\n    place db at (650, 200)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.connectors!.get("call")!.points).toEqual([
      { x: 230, y: 200 },
      { x: 570, y: 200 },
    ]);
  });
});

describe("modes", () => {
  it("arranges every object in auto, writing nothing", () => {
    const result = run('  layout auto\n  box a "A"\n  box b "B"\n  box c "C"\n  a -> b\n  b -> c', {
      engine: gridEngine,
    });
    expect(result.codes).toEqual([]);
    const [a, b, c] = ["a", "b", "c"].map((id) => result.boxes!.get(id)!);
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
  });

  it("fits groups to their children in auto and reports their origins", () => {
    const result = run('  layout auto\n  group g "G" {\n    box a "A"\n  }\n  a -> b', {
      engine: gridEngine,
    });
    const g = result.boxes!.get("g")!;
    expect(result.origins!.get("a")).toEqual({ x: g.x + 16, y: g.y + 40 });
  });

  it("refuses a placed child of an unplaced group in assisted", () => {
    const result = run(
      '  layout assisted\n  group g "G" {\n    box a "A"\n  }\n  box b "B"\n  a -> b\n  placement {\n    place a at (60, 40)\n  }',
      { engine: gridEngine },
    );
    expect(result.codes).toEqual(["layout.missing-placement"]);
  });

  it("arranges unplaced boxes over a band on a back layer in assisted", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    // A column of boxes over the band, which spans 50..550 × 50..350.
    const column: LayoutEngine = {
      name: "column",
      arrange: (r) => {
        request = r;
        return {
          centers: new Map(r.nodes.map((n, i) => [n.id, { x: 300, y: 100 + i * 100 }])),
          routes: new Map(),
        };
      },
    };
    const result = run(
      '  layout assisted\n  layers back, main\n  group band "" { layer back }\n  box a "A"\n  box b "B"\n  box c "C"\n  a -> b\n  b -> c\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n  }',
      { engine: column },
    );
    expect(result.codes).toEqual([]);
    expect(request!.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(result.boxes!.get("band")).toEqual({ x: 50, y: 50, width: 500, height: 300 });
    // Nothing is pushed out of the band.
    expect(["a", "b", "c"].map((id) => result.boxes!.get(id))).toEqual([
      { x: 220, y: 72, width: 160, height: 56 },
      { x: 220, y: 172, width: 160, height: 56 },
      { x: 220, y: 272, width: 160, height: 56 },
    ]);
    expect(order(result.scene!)[0]).toBe("element:band");
  });

  it("leaves a band out of the engine's request, so it takes no slot there", () => {
    let request: Parameters<LayoutEngine["arrange"]>[0] | undefined;
    const spy: LayoutEngine = {
      name: "spy",
      arrange: (r) => {
        request = r;
        return gridEngine.arrange(r);
      },
    };
    const result = run(
      '  layout assisted\n  layers back, main\n  group band "" { layer back }\n  group hold "" {\n    box c "C"\n  }\n  box a "A"\n  box b "B"\n  a -> b\n  b -> band\n  placement {\n    place band at (300, 200)\n    size band (500, 300)\n    place hold at (900, 200)\n    size hold (300, 200)\n  }',
      { engine: spy },
    );
    expect(result.codes).toEqual([]);
    // A placed and sized group that holds a box is still a container of the arrangement.
    expect(request!.groups.map((g) => g.id)).toEqual(["hold"]);
    expect(request!.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    // The relation to the band is drawn, but the engine does not see it.
    expect(request!.edges.map((e) => [e.source, e.target])).toEqual([["a", "b"]]);
    expect([...result.connectors!.keys()]).toHaveLength(2);
  });

  it("arranges unplaced objects around placed ones in assisted", () => {
    const result = run(
      '  layout assisted\n  box a "A"\n  box b "B"\n  a -> b\n  placement {\n    place a at (200, 100)\n  }',
      { engine: gridEngine },
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("a")).toMatchObject({ x: 120, y: 72 });
    expect(result.boxes!.has("b")).toBe(true);
  });
});
