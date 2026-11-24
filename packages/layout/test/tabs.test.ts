import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import {
  expandTabs,
  layoutDiagram,
  splitLines,
  TAB_STOP,
  type GroupItem,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

const measurer = createNodeFontLibrary();

function lay(body: string) {
  const compilation = compile(`diagram d: free {\n  layout manual\n${body}\n}\n`);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer });
}

function texts(items: readonly SceneItem[], id: string): TextItem[] {
  const group = items.find((i): i is GroupItem => i.kind === "group" && i.id === id)!;
  return group.items.filter((i): i is TextItem => i.kind === "text");
}

describe("tab stops", () => {
  it("are four characters apart", () => {
    expect(TAB_STOP).toBe(4);
  });

  it("replace a tab by the spaces that reach the next stop", () => {
    expect(expandTabs("\treturn;")).toBe("    return;");
    expect(expandTabs("\t\treturn;")).toBe("        return;");
    expect(expandTabs("ab\tc")).toBe("ab  c");
    expect(expandTabs("abcd\te")).toBe("abcd    e");
    expect(expandTabs("a\tb\tc")).toBe("a   b   c");
  });

  it("count characters, not UTF-16 units", () => {
    expect(expandTabs("ñ\tx")).toBe("ñ   x");
    expect(expandTabs("🚀\tx")).toBe("🚀   x");
  });

  it("leave a line without a tab as it is", () => {
    const line = "no tabs here";
    expect(expandTabs(line)).toBe(line);
    expect(expandTabs("")).toBe("");
  });

  it("are applied to every line a text is split into", () => {
    expect(splitLines("if (a) {\n\treturn;\n}")).toEqual(["if (a) {", "    return;", "}"]);
  });

  it("are drawn as spaces, and the label keeps its tabs", () => {
    const result = lay(
      '  note n "if (a) {\\n\\treturn;\\nab\\tc"\n  placement { place n at (100, 100) }\n  style n { font "Cascadia Mono" }',
    );
    const lines = texts(result.scene!.items, "n").map((t) => t.text);
    expect(lines).toEqual(["if (a) {", "    return;", "ab  c"]);
    const compilation = compile(
      'diagram d: free {\n  note n "if (a) {\\n\\treturn;\\nab\\tc"\n}\n',
    );
    expect(compilation.document.diagrams[0]!.elements[0]!.label).toBe("if (a) {\n\treturn;\nab\tc");
  });

  it("make a note as wide as its expanded lines", () => {
    const tabbed = lay(
      '  note n "\\treturn;"\n  placement { place n at (100, 100) }\n  style n { font "Cascadia Mono" }',
    );
    const spaced = lay(
      '  note n "    return;"\n  placement { place n at (100, 100) }\n  style n { font "Cascadia Mono" }',
    );
    const widthOf = (r: ReturnType<typeof lay>) => r.boxes?.get("n")?.width;
    expect(widthOf(tabbed)).toBeDefined();
    expect(widthOf(tabbed)).toBe(widthOf(spaced));
  });

  it("are not reported as an unmeasured character", () => {
    const result = lay('  note n "\\treturn;"\n  placement { place n at (100, 100) }');
    expect(result.diagnostics.map((d) => d.code)).not.toContain("layout.unmeasured-font");
  });

  it("leave other unmeasured characters reported", () => {
    const result = lay('  note n "\\treturn; \u{1F680}"\n  placement { place n at (100, 100) }');
    const unmeasured = result.diagnostics.find((d) => d.code === "layout.unmeasured-font");
    expect(unmeasured?.message).toContain("\u{1F680}");
    expect(unmeasured?.message).not.toContain("\t");
  });
});
