import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  THEMES,
  layoutDiagram,
  resolveTheme,
  StyleResolver,
  type GroupItem,
  type LayoutOptions,
  type PathItem,
  type RectItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

const measurer = createNodeFontLibrary();
const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';
const LIGHT = THEMES["technical.light"]!;

const FRAGMENT = [
  "exports.onExecutePostLogin = async (event, api) => {",
  '  if (event.client.client_id !== "CLIENT_ID_WEB") {',
  "    return;",
  "  }",
  "",
  "  // Aplicar lógica específica de la app web.",
  "};",
];
/** The fragment as a `.meltemi` string literal. */
const LITERAL = FRAGMENT.map((l) => l.replace(/\\/g, "\\\\").replace(/"/g, '\\"')).join("\\n");

function run(kind: string, body: string, options: LayoutOptions = {}, theme = "plain") {
  const source = `${PLAIN}diagram d: ${kind} {\n  layout manual\n  theme "${theme}"\n${body}\n}\n`;
  const compilation = compile(source);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
    measurer,
    ...options,
  });
  return { ...result, codes: result.diagnostics.map((d) => d.code) };
}

function group(scene: Scene, id: string, role = "element"): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const snippet = (style = "", size = "") =>
  `  note snippet "${LITERAL}"\n  style snippet { textFormat code${style ? `; ${style}` : ""} }\n  placement {\n    place snippet at (300, 200)\n${size}  }`;

describe("the code tokens of the built-in themes", () => {
  it("are a light panel under near-black text on light themes", () => {
    for (const name of ["technical.light", "editorial.light", "stage.light", "sketch.light"]) {
      expect(THEMES[name]).toMatchObject({ code: "#f3f5f8", codeText: "#1f2328" });
    }
  });

  it("are a navy panel under near-white text on dark themes", () => {
    for (const name of ["technical.dark", "editorial.dark", "stage.dark", "sketch.dark"]) {
      expect(THEMES[name]).toMatchObject({ code: "#131c2b", codeText: "#e6edf3" });
    }
  });

  it("are inherited by a theme that extends another", () => {
    const compilation = compile('theme docs { extends "technical.dark"; code "#fff7ed" }\n');
    const { theme } = resolveTheme("docs", compilation.document.themes);
    expect(theme).toMatchObject({ code: "#fff7ed", codeText: "#e6edf3" });
  });
});

describe("the resolved text format", () => {
  const resolver = (body: string) => {
    const compilation = compile(`diagram d: free {\n${body}\n}\n`);
    const diagram = compilation.document.diagrams[0]!;
    return { resolver: new StyleResolver(LIGHT, diagram), diagram };
  };

  it("comes from a rule, a class and a style, in that order", () => {
    const { resolver: styles, diagram } = resolver(
      '  note a "a"\n  note b "b" { class plainly }\n  note c "c"\n  rule note { textFormat code }\n  class plainly { textFormat plain }\n  style c { textFormat plain }',
    );
    const of = (id: string) => styles.element(diagram.elementsById.get(id)!).textFormat;
    expect([of("a"), of("b"), of("c")]).toEqual(["code", "plain", "plain"]);
  });

  it("is left out of what a class gives a box", () => {
    const { resolver: styles, diagram } = resolver(
      '  box a "A" { class snippet }\n  class snippet { textFormat code; fill "#eef" }',
    );
    const style = styles.element(diagram.elementsById.get("a")!);
    expect(style.fill).toBe("#eef");
    expect(style.textFormat).toBeUndefined();
  });
});

describe("a code note", () => {
  it("draws the fragment's lines in the mono role, inset from a panel", () => {
    const result = run("free", snippet());
    expect(result.codes).toEqual([]);
    const g = group(result.scene!, "snippet");
    const [panel] = rects(g);
    expect(panel).toMatchObject({ fill: "#f3f5f8", stroke: LIGHT.line, radius: LIGHT.radius });
    const lines = texts(g);
    expect(lines.map((t) => t.text)).toEqual(FRAGMENT);
    for (const line of lines) {
      expect(line).toMatchObject({ font: "mono", size: 11, weight: 400, anchor: "start" });
      expect(line.fill).toBe("#1f2328");
      expect(line.x).toBe(panel!.x + 12);
    }
    expect(lines[1]!.y - lines[0]!.y).toBe(18);
    // The first line's box starts half the padding below the panel's top.
    expect(lines[0]!.y - 18 / 2).toBe(panel!.y + 8);
  });

  it("is as wide as its widest line plus its insets, and as tall as its lines plus its insets", () => {
    const result = run("free", snippet());
    const panel = rects(group(result.scene!, "snippet"))[0]!;
    const widest = Math.max(...FRAGMENT.map((l) => measurer.width(l, LIGHT.mono, 400, 11)));
    expect(panel.width).toBe(Math.ceil(widest + 24));
    expect(panel.height).toBe(7 * 18 + 16);
    expect(result.boxes!.get("snippet")).toMatchObject({
      width: panel.width,
      height: panel.height,
    });
  });

  it("measures with a written font and size, and keeps its insets", () => {
    const result = run(
      "free",
      snippet('font "Roboto Mono"; fontSize 13; fontWeight 500; color "#ffffff"'),
    );
    const g = group(result.scene!, "snippet");
    const lines = texts(g);
    expect(lines[0]).toMatchObject({
      size: 13,
      weight: 500,
      fill: "#ffffff",
      stack: "Roboto Mono",
    });
    const widest = Math.max(...FRAGMENT.map((l) => measurer.width(l, "Roboto Mono", 500, 13)));
    expect(rects(g)[0]!.width).toBe(Math.ceil(widest + 24));
    expect(lines[0]!.x).toBe(rects(g)[0]!.x + 12);
  });

  it("takes the panel's fill, stroke, line and radius from its style", () => {
    const result = run(
      "free",
      snippet('fill "#0b1830"; stroke "#22d3ee"; radius 4; line dashed; width 2'),
    );
    expect(rects(group(result.scene!, "snippet"))[0]).toMatchObject({
      fill: "#0b1830",
      stroke: "#22d3ee",
      radius: 4,
      strokeWidth: 2,
      dashed: true,
    });
  });

  it("is drawn on the dark panel of a dark theme", () => {
    const result = run("free", snippet(), {}, "technical.dark");
    const g = group(result.scene!, "snippet");
    expect(rects(g)[0]!.fill).toBe("#131c2b");
    expect(texts(g)[0]!.fill).toBe("#e6edf3");
  });

  it("keeps a larger written size, its text at the top left inside the insets", () => {
    const result = run("free", snippet("", "    size snippet (640, 240)\n"));
    expect(result.codes).toEqual([]);
    const g = group(result.scene!, "snippet");
    const panel = rects(g)[0]!;
    expect([panel.width, panel.height]).toEqual([640, 240]);
    expect(texts(g)[0]!.x).toBe(panel.x + 12);
    expect(g.textClip).toBeUndefined();
  });

  it("clips its text to a smaller written size and reports the size it needs", () => {
    const result = run("free", snippet("", "    size snippet (120, 40)\n"));
    const overflow = result.diagnostics.find((d) => d.code === "layout.text-overflow");
    expect(overflow).toBeDefined();
    const needed = (overflow!.data as { size: { width: number; height: number } }).size;
    expect(needed.height).toBe(7 * 18 + 16);
    expect(needed.width).toBeGreaterThan(120);
    const g = group(result.scene!, "snippet");
    const panel = rects(g)[0]!;
    expect([panel.width, panel.height]).toEqual([120, 40]);
    expect(g.textClip).toMatchObject({
      x: panel.x + 12,
      y: panel.y + 8,
      width: 120 - 24,
      height: 40 - 16,
    });
  });

  it("is too short when it is as wide as its text but not as tall", () => {
    const wide = run("free", snippet("", "    size snippet (900, 60)\n"));
    const overflow = wide.diagnostics.find((d) => d.code === "layout.text-overflow");
    expect((overflow?.data as { size: { width: number; height: number } }).size).toEqual({
      element: "snippet",
      width: 900,
      height: 7 * 18 + 16,
    });
  });

  it("is drawn the same in a flow diagram and in a C4 view", () => {
    const flow = run("flow", snippet());
    expect(flow.codes).toEqual([]);
    expect(texts(group(flow.scene!, "snippet")).map((t) => t.text)).toEqual(FRAGMENT);
    const compilation = compile(
      `model m {\n  system shop "Shop" {\n    container api "API"\n  }\n}\ndiagram v: c4 using m {\n  level container\n  scope shop\n  note cache "ttl:\\n  300" on shop.api\n  style cache { textFormat code }\n}\n`,
    );
    const view = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
      measurer,
      engine: gridEngine,
    });
    const g = group(view.scene!, "cache");
    expect(rects(g)[0]!.fill).toBe(LIGHT.code);
    expect(texts(g).map((t) => [t.text, t.font])).toEqual([
      ["ttl:", "mono"],
      ["  300", "mono"],
    ]);
  });

  it("turns with its panel and keeps its leader", () => {
    const result = run(
      "free",
      `  box api "API"\n  note snippet "a\\n  b" on api\n  style snippet { textFormat code; rotation 10 }\n  placement {\n    place api at (100, 100)\n    place snippet at (400, 100)\n  }`,
    );
    const g = group(result.scene!, "snippet");
    expect(g.transform).toContain("rotate(10");
    expect(g.items.some((i) => i.kind === "polyline" && i.className === "leader")).toBe(true);
    expect(rects(g)[0]!.fill).toBe(LIGHT.code);
  });

  it("over a box reports no label overlap", () => {
    const result = run(
      "free",
      `  box a "A"\n  note snippet "a\\n  b"\n  style snippet { textFormat code }\n  placement {\n    place a at (100, 100)\n    place snippet at (100, 140)\n  }`,
    );
    expect(result.codes).not.toContain("layout.label-overlap");
  });

  it("is a plain note again when the format goes", () => {
    const result = run(
      "free",
      `  note snippet "${LITERAL}"\n  placement {\n    place snippet at (300, 200)\n  }`,
    );
    const g = group(result.scene!, "snippet");
    expect(rects(g)).toEqual([]);
    expect(texts(g)[0]).toMatchObject({ font: "body", fill: LIGHT.muted });
  });
});

describe("a code note of a sequence diagram", () => {
  it("keeps its folded corner, on the code colours in the mono role", () => {
    const compilation = compile(
      'diagram d: sequence {\n  api -> db: "Query"\n  note r over api "retry:\\n  3 times"\n  style r { textFormat code }\n}\n',
    );
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
    expect(result.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    const g = result.scene!.items.find(
      (i): i is GroupItem => i.kind === "group" && i.role === "event" && i.id === "r",
    )!;
    const outline = g.items.find((i): i is PathItem => i.kind === "path")!;
    expect(outline.fill).toBe(LIGHT.code);
    expect(outline.d.split("L")).toHaveLength(5);
    expect(texts(g).map((t) => [t.text, t.font, t.fill])).toEqual([
      ["retry:", "mono", LIGHT.codeText],
      ["  3 times", "mono", LIGHT.codeText],
    ]);
  });

  it("follows a rule for every note, a style keeping its own fill", () => {
    const compilation = compile(
      'diagram d: sequence {\n  api -> db: "Query"\n  note n1 over api "a"\n  note n2 over db "b"\n  rule note { textFormat code }\n  style n1 { fill "#ffffff" }\n}\n',
    );
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
    const fill = (id: string) =>
      result
        .scene!.items.filter((i): i is GroupItem => i.kind === "group" && i.role === "event")
        .find((g) => g.id === id)!
        .items.find((i): i is PathItem => i.kind === "path")!.fill;
    expect([fill("n1"), fill("n2")]).toEqual(["#ffffff", LIGHT.code]);
  });
});
