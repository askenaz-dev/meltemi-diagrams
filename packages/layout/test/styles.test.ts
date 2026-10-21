import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import {
  THEMES,
  layoutDiagram,
  type GroupItem,
  type LayoutOptions,
  type PathItem,
  type PolylineItem,
  type RectItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

function layout(text: string, options: LayoutOptions = {}) {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
}

function scene(text: string, options: LayoutOptions = {}): Scene {
  const result = layout(text, options);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function group(s: Scene, id: string, role = "element"): GroupItem {
  const found = s.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");
const paths = (g: GroupItem) => g.items.filter((i): i is PathItem => i.kind === "path");
const polylines = (g: GroupItem) => g.items.filter((i): i is PolylineItem => i.kind === "polyline");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const frameOf = (s: Scene) =>
  s.items.find((i): i is GroupItem => i.kind === "group" && i.role === "frame");

/** A diagram with two placed nodes and a relation, under `theme` and with extra statements. */
const sheet = (extra: string, theme = "plain", before = "") =>
  `theme plain { extends "technical.light"; frame none }\n${before}diagram d: flow {\n  layout manual\n  theme "${theme}"\n  api["API"]\n  b["B"]\n  api -> b as call\n${extra}\n  placement { place api at (100, 100); place b at (400, 100) }\n}\n`;

describe("style precedence", () => {
  it("applies theme rules, diagram rules, classes and explicit styles in order", () => {
    const text = sheet(
      [
        '  rule node { fill "#222222"; stroke "#222222" }',
        '  class edge { stroke "#333333" }',
        "  style api { class edge }",
        '  style api { fill "#444444" }',
      ].join("\n"),
      "custom",
      'theme custom { extends "plain"; rule node { fill "#111111" } }\n',
    );
    const s = scene(text);
    expect(rects(group(s, "api"))[0]).toMatchObject({ fill: "#444444", stroke: "#333333" });
    expect(rects(group(s, "b"))[0]).toMatchObject({ fill: "#222222", stroke: "#222222" });
  });

  it("lets the later class win", () => {
    const text = sheet(
      '  class a { fill "#aaaaaa" }\n  class b { fill "#bbbbbb" }\n  style api { class a, b }',
    );
    expect(rects(group(scene(text), "api"))[0]!.fill).toBe("#bbbbbb");
  });

  it("applies declaration classes before style classes", () => {
    const text = `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  class a { fill "#aaaaaa" }\n  class b { fill "#bbbbbb" }\n  api["API"] { class b }\n  style api { class a }\n  placement { place api at (100, 100) }\n}\n`;
    expect(rects(group(scene(text), "api"))[0]!.fill).toBe("#aaaaaa");
  });

  it("draws built-in classes with the theme's signal colours", () => {
    const s = scene(sheet("  style api { class proposed }"));
    const rect = rects(group(s, "api"))[0]!;
    expect(rect.dashed).toBe(true);
    expect(rect.stroke).toBe(THEMES["technical.light"]!.warning);
  });

  it("lets a diagram class shadow a built-in class", () => {
    const s = scene(sheet('  class proposed { stroke "#000000" }\n  style api { class proposed }'));
    const rect = rects(group(s, "api"))[0]!;
    expect(rect.stroke).toBe("#000000");
    expect(rect.dashed).toBe(false);
  });

  it("ignores unknown classes", () => {
    const s = scene(sheet("  style api { class missing }"));
    expect(rects(group(s, "api"))[0]!.stroke).toBe(THEMES["technical.light"]!.line);
  });
});

describe("token colours", () => {
  it("follow the theme", () => {
    for (const name of ["technical.light", "technical.dark"]) {
      const s = scene(sheet("  style api { stroke danger }", name));
      expect(rects(group(s, "api"))[0]!.stroke).toBe(THEMES[name]!.danger);
    }
  });
});

describe("width, pattern and arrowhead", () => {
  it("overlays a hatch pattern in the stroke colour", () => {
    const s = scene(sheet('  style api { pattern hatch; stroke "#c4552c" }'));
    expect(s.patterns).toEqual([{ id: "pattern-1", kind: "hatch", color: "#c4552c", size: 8 }]);
    const [outline, overlay] = rects(group(s, "api"));
    expect(overlay).toMatchObject({
      x: outline!.x,
      y: outline!.y,
      fill: "url(#pattern-1)",
      stroke: "none",
    });
  });

  it("uses the muted colour for a pattern without a stroke and shares definitions", () => {
    const s = scene(sheet("  rule node { pattern dots }"));
    expect(s.patterns).toEqual([
      { id: "pattern-1", kind: "dots", color: THEMES["technical.light"]!.muted, size: 8 },
    ]);
    expect(rects(group(s, "b"))[1]!.fill).toBe("url(#pattern-1)");
  });

  it("patterns data stores and decisions along their outline", () => {
    const text = `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  data db "DB"\n  decision ok "OK?"\n  rule data { pattern cross }\n  rule decision { pattern cross }\n  placement { place db at (100, 100); place ok at (400, 100) }\n}\n`;
    const s = scene(text);
    const [body, overlay] = paths(group(s, "db"));
    expect(overlay).toMatchObject({ d: body!.d, fill: "url(#pattern-1)" });
    expect(paths(group(s, "ok"))[1]!.fill).toBe("url(#pattern-1)");
  });

  it("sets outline and connector widths", () => {
    const s = scene(sheet("  style api { width 3 }\n  style call { width 2.5 }"));
    expect(rects(group(s, "api"))[0]!.strokeWidth).toBe(3);
    expect(polylines(group(s, "call", "relation"))[0]!.strokeWidth).toBe(2.5);
  });

  it("draws open and absent arrowheads", () => {
    const open = scene(sheet("  style call { arrowhead open }"));
    const relation = group(open, "call", "relation");
    const [line, head] = polylines(relation);
    expect(paths(relation)).toEqual([]);
    expect(head!.points).toHaveLength(3);
    expect(head!.points[1]).toEqual(line!.points[line!.points.length - 1]);
    expect(head!.stroke).toBe(line!.stroke);

    const none = scene(sheet("  style call { arrowhead none }"));
    const bare = group(none, "call", "relation");
    expect(polylines(bare)).toHaveLength(1);
    expect(paths(bare)).toEqual([]);
    const b = rects(group(none, "b"))[0]!;
    expect(polylines(bare)[0]!.points.at(-1)!.x).toBe(b.x);
  });

  it("applies a relation rule from the theme", () => {
    const s = scene(
      sheet("", "quiet", 'theme quiet { extends "plain"; rule relation { arrowhead open } }\n'),
    );
    expect(polylines(group(s, "call", "relation"))).toHaveLength(2);
  });
});

describe("token-driven geometry", () => {
  it("takes radii, widths and margins from the theme", () => {
    const s = scene(
      sheet(
        "",
        "square",
        'theme square { extends "plain"; radius 0; strokeWidth 2; connectorWidth 3; margin 40 }\n',
      ),
    );
    const rect = rects(group(s, "api"))[0]!;
    expect([rect.radius, rect.strokeWidth]).toEqual([0, 2]);
    expect(polylines(group(s, "call", "relation"))[0]!.strokeWidth).toBe(3);
    expect(rect.x).toBe(40);
  });

  it("grows boxes for the stage type scale", () => {
    const technical = scene(sheet("", "plain"));
    const stage = scene(sheet("", "stage.light"));
    const small = rects(group(technical, "api"))[0]!;
    const large = rects(group(stage, "api"))[0]!;
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
    expect(texts(group(stage, "api"))[0]!.size).toBe(16);
    const frame = frameOf(stage)!;
    expect(polylines(frame)[0]!.points[0]!.y).toBeLessThan(60);
    expect(large.x).toBe(48);
  });

  it("keeps the 160 × 56 box for one description line under technical", () => {
    const text = `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  api["API"] { description "REST" }\n  placement { place api at (100, 100) }\n}\n`;
    const rect = rects(group(scene(text), "api"))[0]!;
    expect([rect.width, rect.height]).toEqual([160, 56]);
  });

  it("grows a box for several description lines", () => {
    const text = `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "plain"\n  api["API"] { description "one\\ntwo\\nthree" }\n  placement { place api at (100, 100) }\n}\n`;
    const g = group(scene(text), "api");
    const rect = rects(g)[0]!;
    expect(rect.height).toBeGreaterThan(56);
    for (const t of texts(g)) {
      expect(t.y - t.size / 2).toBeGreaterThanOrEqual(rect.y);
      expect(t.y + t.size / 2).toBeLessThanOrEqual(rect.y + rect.height);
    }
  });

  it("gives the comfortable width with the padding token in overflow hints", () => {
    const text = (padding: string) =>
      `theme t { extends "technical.light"${padding} }\ndiagram d: flow {\n  layout manual\n  theme "t"\n  api["API Gateway"]\n  placement { place api at (100, 100); size api (40, 56) }\n}\n`;
    const hint = (padding: string) => layout(text(padding)).diagnostics[0]!.hints![0]!;
    const base = Number(/\((\d+),/.exec(hint(""))![1]);
    expect(Number(/\((\d+),/.exec(hint("; padding 24"))![1])).toBe(base + 16);
  });
});

describe("default theme option", () => {
  it("applies to diagrams without a theme only", () => {
    const without = `diagram d: flow {\n  layout manual\n  a["A"]\n  placement { place a at (1, 1) }\n}\n`;
    expect(scene(without, { defaultTheme: "editorial.dark" }).background).toBe(
      THEMES["editorial.dark"]!.background,
    );
    const withTheme = without.replace("layout manual", 'layout manual\n  theme "technical.light"');
    expect(scene(withTheme, { defaultTheme: "editorial.dark" }).background).toBe(
      THEMES["technical.light"]!.background,
    );
  });

  it("falls back silently when the default theme does not resolve", () => {
    const text = `diagram d: flow {\n  layout manual\n  a["A"]\n  placement { place a at (1, 1) }\n}\n`;
    const result = layout(text, { defaultTheme: "missing#theme" });
    expect(result.diagnostics).toEqual([]);
    expect(result.scene!.background).toBe(THEMES["technical.light"]!.background);
  });
});

describe("presets and canvas", () => {
  /** A frameless diagram whose content canvas is (w + 40) × (h + 40). */
  const sized = (w: number, h: number, extra: string, theme = "plain") =>
    `theme plain { extends "technical.light"; frame none }\ndiagram d: flow {\n  layout manual\n  theme "${theme}"\n${extra}\n  a["A"]\n  placement { place a at (500, 500); size a (${w}, ${h}) }\n}\n`;

  it("extends a slide to 16:9 and centres the content", () => {
    const result = layout(sized(760, 260, "  preset slide"));
    expect([result.scene!.width, result.scene!.height]).toEqual([800, 450]);
    expect(rects(group(result.scene!, "a"))[0]!.y).toBe(20 + 75);
    expect(result.diagnostics).toEqual([]);
  });

  it("widens a tall slide", () => {
    const s = scene(sized(160, 860, "  preset slide"));
    expect([s.width, s.height]).toEqual([1600, 900]);
  });

  it("warns when a slide holds more than 1920 × 1080", () => {
    const result = layout(sized(1000, 1100, "  preset slide"));
    expect(result.diagnostics.map((d) => [d.code, d.severity, d.range.start.line])).toEqual([
      ["layout.too-large", "warning", 5],
    ]);
    expect(result.diagnostics[0]!.message).toContain("1040 × 1140 px");
    expect(result.diagnostics[0]!.hints![0]).toContain("Split the diagram");
  });

  it("warns on a wide document and keeps its width", () => {
    const result = layout(sized(1360, 100, "  preset document"));
    expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.too-large"]);
    expect(result.scene!.width).toBe(1400);
    expect(layout(sized(1000, 100, "  preset document")).diagnostics).toEqual([]);
  });

  it("centres the content in a fixed canvas above the footer", () => {
    const text = `diagram d: flow {\n  layout manual\n  canvas (1280, 720)\n  a["A"]\n  placement { place a at (500, 500); size a (560, 260) }\n}\n`;
    const s = scene(text);
    expect([s.width, s.height]).toEqual([1280, 720]);
    const rect = rects(group(s, "a"))[0]!;
    expect(rect.x).toBe((1280 - 600) / 2 + 20);
    expect(rect.y).toBe(Math.floor((720 - 44 - 300) / 2) + 20);
    const hairline = polylines(frameOf(s)!)[0]!;
    expect(hairline.points[0]!.y).toBe(720 - 44 + 0.5);
    expect(hairline.points[1]!.x).toBe(1280 - 20);
  });

  it("grows a fixed canvas that the content exceeds", () => {
    const result = layout(sized(560, 160, "  canvas (400, 300)"));
    expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.too-large"]);
    expect([result.scene!.width, result.scene!.height]).toEqual([600, 300]);
  });
});
