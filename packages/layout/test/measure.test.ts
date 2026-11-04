import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { layoutDiagram, type GroupItem, type SceneItem, type TextItem } from "../src/index.js";

const measurer = createNodeFontLibrary();

function lay(body: string, extra = "") {
  const compilation = compile(`${extra}diagram d: flow {\n  layout manual\n${body}\n}\n`);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
}

function group(items: readonly SceneItem[], id: string): GroupItem {
  return items.find((i): i is GroupItem => i.kind === "group" && i.id === id)!;
}

function rect(g: GroupItem) {
  return g.items.find((i) => i.kind === "rect" || i.kind === "path") as
    { kind: "rect"; width: number; height: number } | undefined;
}

describe("measured layout", () => {
  it("places baselines from the font's cap height", () => {
    const result = lay('  api["API Gateway"]\n  placement { place api at (100, 100) }');
    const text = group(result.scene!.items, "api").items.find(
      (i): i is TextItem => i.kind === "text",
    )!;
    const cap = measurer.capHeight('"Inter"', 600);
    expect(text.baseline).toBe(Math.round((text.y + (13 * cap) / 2) * 100) / 100);
  });

  it("grows a default box to fit a long label", () => {
    const result = lay(
      '  svc["Payments reconciliation service"]\n  placement { place svc at (300, 100) }',
    );
    const width = measurer.width("Payments reconciliation service", '"Inter"', 600, 13);
    expect(width).toBeGreaterThan(128);
    expect(rect(group(result.scene!.items, "svc"))).toMatchObject({
      width: Math.ceil(width + 32),
      height: 56,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("keeps the default size for short labels", () => {
    const result = lay('  api["API"]\n  placement { place api at (100, 100) }');
    expect(rect(group(result.scene!.items, "api"))).toMatchObject({ width: 160, height: 56 });
  });

  it("warns when an explicit size is too small and hints a size that fits", () => {
    const result = lay(
      '  api["API Gateway"]\n  placement {\n    place api at (100, 100)\n    size api (80, 56)\n  }',
    );
    const overflow = result.diagnostics.find((d) => d.code === "layout.text-overflow");
    expect(overflow?.severity).toBe("warning");
    expect(overflow?.range.start.line).toBe(6);
    expect(overflow?.hints).toEqual(["Use `size api (112, 56)`, or shorten the text."]);
    expect(rect(group(result.scene!.items, "api"))).toMatchObject({ width: 80 });
  });

  it("accepts tight sizes that leave a small margin", () => {
    const result = lay(
      '  api["API Gateway"]\n  placement {\n    place api at (100, 100)\n    size api (94, 56)\n  }',
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("reports a theme font without bundled metrics", () => {
    const result = lay(
      '  theme "comic"\n  api["API"]\n  placement { place api at (100, 100) }',
      'theme comic { font "Comic Sans MS" }\n',
    );
    const info = result.diagnostics.find((d) => d.code === "layout.unmeasured-font");
    expect(info?.severity).toBe("info");
    expect(info?.message).toContain("Comic Sans MS");
    expect(result.scene).not.toBeNull();
  });

  it("reports characters no bundled font covers", () => {
    const result = lay('  deploy["Deploy 🚀"]\n  placement { place deploy at (100, 100) }');
    const info = result.diagnostics.find((d) => d.code === "layout.unmeasured-font");
    expect(info?.message).toContain("🚀");
  });

  it("measures arrows in labels without diagnostics", () => {
    const result = lay('  a["Client → API"]\n  placement { place a at (100, 100) }');
    expect(result.diagnostics).toEqual([]);
  });

  it("widens a derived group to fit its title", () => {
    const result = lay(
      '  group g "A very long group title that is wider than its child" {\n    a["A"]\n  }\n  placement { place a at (100, 100) }',
    );
    const width = measurer.width(
      "A very long group title that is wider than its child",
      '"Inter"',
      600,
      13,
    );
    expect(rect(group(result.scene!.items, "g"))!.width).toBe(Math.ceil(width + 40));
  });
});
