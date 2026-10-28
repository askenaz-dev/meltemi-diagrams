import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES, DEFAULT_THEME, compile } from "@meltemi/diagrams-model";
import {
  MARK_GRADIENT_ID,
  THEMES,
  layoutDiagram,
  resolveTheme,
  type GroupItem,
  type PathItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

function scene(text: string, theme?: string | null, frame?: "none"): Scene {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { theme, frame });
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

const frameOf = (s: Scene) =>
  s.items.find((i): i is GroupItem => i.kind === "group" && i.role === "frame");
const textsOf = (g: GroupItem): TextItem[] =>
  g.items.filter((i): i is TextItem => i.kind === "text");

/** Height of the frame strip at the 12 px frame size of the technical themes. */
const FRAME_HEIGHT = 44;
const FRAMELESS = 'theme plain { extends "technical.light"; frame none }\n';

const sheet = (extra = "") =>
  `diagram d: flow {\n  title "Checkout"\n  layout manual\n${extra}  a["A"]\n  b["B"]\n  a -> b\n  placement { place a at (100, 100); place b at (300, 100) }\n}\n`;

describe("built-in themes", () => {
  it("match the names declared by the model", () => {
    expect(Object.keys(THEMES).sort()).toEqual([...BUILT_IN_THEMES].sort());
    expect(THEMES[DEFAULT_THEME]).toBeDefined();
  });

  it("frame the sheet by default with the mark, brand and title", () => {
    const s = scene(sheet());
    const frame = frameOf(s)!;
    expect(frame).toBeDefined();
    expect(s.items[s.items.length - 1]).toBe(frame);
    expect(s.gradients.map((g) => g.id)).toEqual([MARK_GRADIENT_ID]);
    expect(s.gradients[0]!.stops.map((st) => st.color)).toEqual(["#1D4ED8", "#0891B2"]);
    const mark = frame.items.find((i): i is GroupItem => i.kind === "group" && i.id === "mark")!;
    expect(mark.transform).toMatch(/^translate\(20 /);
    expect(mark.items.filter((i): i is PathItem => i.kind === "path")).toHaveLength(2);
    expect(textsOf(frame).map((t) => t.text)).toEqual(["Meltemi Diagrams", "Checkout"]);
    const plain = scene(`${FRAMELESS}${sheet('  theme "plain"\n')}`);
    expect(s.height - plain.height).toBe(FRAME_HEIGHT);
    expect(s.background).toBe("#F7FBFF");
  });

  it("leave the frame out when asked, keeping every other token", () => {
    const branded = scene(sheet());
    const plain = scene(sheet(), undefined, "none");
    expect(frameOf(plain)).toBeUndefined();
    expect(plain.gradients).toEqual([]);
    expect(branded.height - plain.height).toBe(FRAME_HEIGHT);
    expect(plain.width).toBe(branded.width);
    expect(plain.background).toBe(branded.background);
    // The boxes, their labels and the arrow are drawn the same, only higher up by nothing.
    const drawn = (s: Scene) =>
      s.items
        .filter((i) => !(i.kind === "group" && i.role === "frame"))
        .map((i) => JSON.stringify(i));
    expect(drawn(plain)).toEqual(drawn(branded));
  });

  it("leave a sequence diagram's frame out too", () => {
    const text =
      'diagram p: sequence {\n  title "Pay"\n  theme "stage.light"\n  participant a\n  participant b\n  a -> b: "go"\n}\n';
    const branded = scene(text);
    const plain = scene(text, undefined, "none");
    expect(frameOf(branded)).toBeDefined();
    expect(frameOf(plain)).toBeUndefined();
    expect(plain.gradients).toEqual([]);
    expect(plain.height).toBeLessThan(branded.height);
  });

  it("still report an unknown theme once without the frame", () => {
    const compilation = compile(sheet('  theme "corporate"\n'));
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { frame: "none" });
    expect(result.diagnostics.filter((d) => d.code === "layout.unknown-theme")).toHaveLength(1);
    expect(frameOf(result.scene!)).toBeUndefined();
  });

  it("keep the neutral themes frameless", () => {
    const s = scene(sheet('  theme "editorial.light"\n'));
    expect(frameOf(s)).toBeUndefined();
    expect(s.gradients).toEqual([]);
  });

  it("switch to the dark palette with the brighter gradient", () => {
    const s = scene(sheet('  theme "technical.dark"\n'));
    expect(s.background).toBe("#07111F");
    expect(s.gradients[0]!.stops.map((st) => st.color)).toEqual(["#3B82F6", "#22D3EE"]);
  });

  it("honour the override from the exporter", () => {
    const s = scene(sheet('  theme "editorial.light"\n'), "technical.dark");
    expect(s.background).toBe("#07111F");
    expect(frameOf(s)).toBeDefined();
  });

  it("treat an unknown variant of a built-in family as unknown", () => {
    const compilation = compile(sheet('  theme "technical.sepia"\n'));
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.unknown-theme"]);
    expect(result.diagnostics[0]!.hints![0]).toBe(
      `Built-in themes: ${BUILT_IN_THEMES.join(", ")}.`,
    );
  });

  it("sketch with the technical palettes, rounded corners and a light hand", () => {
    const light = scene(sheet('  theme "sketch.light"\n'));
    expect(light.background).toBe(THEMES["technical.light"]!.background);
    expect(light.sketch).toBe("light");
    // The text is in the hand font, with Inter after it for what it lacks.
    expect(light.fonts.body).toBe(THEMES["sketch.light"]!.font);
    expect(light.fonts.body.startsWith('"Patrick Hand", "Inter"')).toBe(true);
    expect(light.fonts.body).not.toBe(THEMES["technical.light"]!.font);
    expect(THEMES["sketch.light"]!.corners).toBe("rounded");
    expect(scene(sheet('  theme "sketch.dark"\n')).background).toBe(
      THEMES["technical.dark"]!.background,
    );
    // The other themes paint clean strokes and say nothing about it.
    for (const name of BUILT_IN_THEMES.filter((n) => !n.startsWith("sketch."))) {
      expect(THEMES[name]!.sketch, name).toBe("none");
      expect(scene(sheet(`  theme "${name}"\n`)).sketch, name).toBeUndefined();
    }
    // A file theme sets the level.
    const rough = scene(
      `theme hand { extends "technical.light"; sketch rough }\n${sheet('  theme "hand"\n')}`,
    );
    expect(rough.sketch).toBe("rough");
  });

  it("warn on an unknown override and use the default", () => {
    const compilation = compile(sheet());
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
      theme: "corporate",
    });
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["layout.unknown-theme", "warning"],
    ]);
    expect(result.scene!.background).toBe(THEMES[DEFAULT_THEME]!.background);
  });
});

describe("file themes", () => {
  it("override one token of a built-in theme", () => {
    const compilation = compile('theme konfio { extends "technical.dark"; accent "#6a4fd0" }\n');
    const { theme, known } = resolveTheme("konfio", compilation.document.themes);
    expect(known).toBe(true);
    expect(theme).toEqual({ ...THEMES["technical.dark"]!, name: "konfio", accent: "#6a4fd0" });
  });

  it("chain file themes down to the default", () => {
    const compilation = compile(
      'theme base { tag "#111111" }\ntheme child { extends "base"; frame none }\n',
    );
    const { theme } = resolveTheme("child", compilation.document.themes);
    expect(theme).toEqual({
      ...THEMES[DEFAULT_THEME]!,
      name: "child",
      tag: "#111111",
      frame: "none",
    });
  });

  it("map every token to a theme field", () => {
    const compilation = compile(
      [
        "theme t {",
        '  background "#1"; surface "#2"; ink "#3"; muted "#4"; line "#5"; connector "#6"',
        '  band "#7"; bandLine "#8"; tag "#9"; tagText "#a"; accent "#b"; accentEnd "#c"',
        '  success "#d"; warning "#e"; danger "#f"; info "#0"; font "F"; mono "M"',
        "  labelSize 14; descriptionSize 12; groupTitleSize 15; noteSize 10; tagSize 9",
        "  relationLabelSize 12; frameSize 13; labelWeight 700; padding 18px; groupPadding 12",
        "  groupHeader 36; margin 30; radius 0; groupRadius 4; strokeWidth 2; connectorWidth 3",
        "  arrowhead open; corners rounded; sketch rough; arrowSize 12; iconSize 20",
        "  iconPosition top",
        '  frame header; brand "B"; mark none',
        "}",
        "",
      ].join("\n"),
    );
    expect(compilation.diagnostics).toEqual([]);
    const { theme } = resolveTheme("t", compilation.document.themes);
    expect(theme).toEqual({
      name: "t",
      background: "#1",
      surface: "#2",
      ink: "#3",
      muted: "#4",
      line: "#5",
      connector: "#6",
      band: "#7",
      bandLine: "#8",
      tag: "#9",
      tagText: "#a",
      accent: "#b",
      accentEnd: "#c",
      success: "#d",
      warning: "#e",
      danger: "#f",
      info: "#0",
      font: "F",
      mono: "M",
      labelSize: 14,
      descriptionSize: 12,
      groupTitleSize: 15,
      noteSize: 10,
      tagSize: 9,
      relationLabelSize: 12,
      frameSize: 13,
      labelWeight: 700,
      padding: 18,
      groupPadding: 12,
      groupHeader: 36,
      margin: 30,
      radius: 0,
      groupRadius: 4,
      strokeWidth: 2,
      connectorWidth: 3,
      arrowhead: "open",
      corners: "rounded",
      sketch: "rough",
      arrowSize: 12,
      iconSize: 20,
      iconPosition: "top",
      frame: "header",
      brand: "B",
      mark: "none",
      classes: THEMES[DEFAULT_THEME]!.classes,
      rules: [],
    });
  });

  it("inherit classes and rules along the chain", () => {
    const compilation = compile(
      [
        'theme base { class hot { fill "#ff0000" }; rule data { pattern dots } }',
        'theme child { extends "base"; class hot { fill "#00ff00" }; rule relation { arrowhead open } }',
        "",
      ].join("\n"),
    );
    expect(compilation.diagnostics).toEqual([]);
    const { theme } = resolveTheme("child", compilation.document.themes);
    expect(theme.classes.hot).toEqual({ fill: "#00ff00" });
    expect(Object.keys(theme.classes)).toEqual(
      expect.arrayContaining(["highlight", "critical", "proposed", "deprecated", "external"]),
    );
    expect(theme.rules.map((r) => r.kind)).toEqual(["data", "relation"]);
  });

  it("render a header frame without the mark and shift the content down", () => {
    const text = `theme plain { frame header; mark none; brand "Acme" }\n${sheet('  theme "plain"\n')}`;
    const s = scene(text);
    const frame = frameOf(s)!;
    expect(frame.items.some((i) => i.kind === "group")).toBe(false);
    expect(s.gradients).toEqual([]);
    expect(textsOf(frame).map((t) => t.text)).toEqual(["Acme", "Checkout"]);
    const a = s.items.find((i): i is GroupItem => i.kind === "group" && i.id === "a")!;
    const rect = a.items.find((i) => i.kind === "rect")!;
    expect(rect.kind === "rect" && rect.y).toBe(FRAME_HEIGHT + 20);
  });

  it("do not loop on cycles and fall back", () => {
    const compilation = compile('theme a { extends "b" }\ntheme b { extends "a" }\n');
    const { theme, known } = resolveTheme("a", compilation.document.themes);
    expect(known).toBe(false);
    expect(theme.name).toBe(DEFAULT_THEME);
  });

  it("warn when a diagram names a theme missing from the file", () => {
    const compilation = compile(`theme other { }\n${sheet('  theme "konfio"\n')}`);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    expect(result.diagnostics[0]!.code).toBe("layout.unknown-theme");
    expect(result.diagnostics[0]!.hints?.[0]).toContain("other");
  });
});
