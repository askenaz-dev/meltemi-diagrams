import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES, THEME_TOKENS, compile, toJson } from "../src/index.js";

const codes = (text: string) => compile(text).diagnostics.map((d) => d.code);

describe("theme blocks", () => {
  it("compiles tokens, extends and frame", () => {
    const compilation = compile(
      'theme konfio { extends "technical.light"; accent "#6a4fd0"; frame footer; brand "Konfío · Meltemi Diagrams" }\n',
    );
    expect(compilation.diagnostics).toEqual([]);
    expect(compilation.document.themes).toHaveLength(1);
    const theme = compilation.document.themes[0]!;
    expect(theme.id).toBe("konfio");
    expect(theme.extends).toBe("technical.light");
    expect(theme.tokens).toEqual({
      accent: "#6a4fd0",
      frame: "footer",
      brand: "Konfío · Meltemi Diagrams",
    });
    expect(theme.extendsRange?.start.column).toBe(24);
  });

  it("reports unknown and invalid tokens", () => {
    const compilation = compile('theme t {\n  colour "#fff"\n  frame sideways\n}\n');
    expect(compilation.diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([
      ["prop.unknown", 2],
      ["prop.invalid-value", 3],
    ]);
    expect(compilation.diagnostics[1]!.message).toContain("none, footer, header");
    expect(compilation.diagnostics[0]!.hints?.[0]).toContain("accent");
  });

  it("no longer reports theme blocks as unsupported", () => {
    const compilation = compile('theme t { ink "#000" }\n');
    expect(compilation.ok).toBe(true);
    expect(compilation.document.unsupported).toEqual([]);
  });

  it("reports duplicate tokens, blocks and extra values", () => {
    expect(codes('theme t { ink "#000"; ink "#111" }')).toEqual(["prop.duplicate"]);
    expect(codes("theme t { frame footer { } }")).toEqual(["prop.invalid-value"]);
    expect(codes('theme t { brand "a" "b" }')).toEqual(["prop.invalid-value"]);
    expect(codes("theme t { brand }")).toEqual(["prop.invalid-value"]);
    expect(codes('theme t { ink "" }')).toEqual(["prop.invalid-value"]);
  });

  it("shares the file namespace with diagrams", () => {
    expect(codes("theme d { }\ndiagram d: flow { a -> b }")).toEqual(["ref.duplicate-id"]);
  });

  it("reports an unknown base with the built-in names", () => {
    const compilation = compile('theme t {\n  extends "corporate"\n}\n');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("theme.unknown-base");
    expect(d!.range.start).toMatchObject({ line: 2, column: 11 });
    expect(d!.hints?.[0]).toContain(BUILT_IN_THEMES.join(", "));
  });

  it("accepts bases defined later in the file", () => {
    expect(codes('theme child { extends "base" }\ntheme base { ink "#000" }')).toEqual([]);
  });

  it("reports cycles once per theme without looping", () => {
    const compilation = compile(
      'theme a { extends "b" }\ntheme b { extends "a" }\ntheme c { extends "c" }\n',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.range.start.line])).toEqual([
      ["theme.cycle", 1],
      ["theme.cycle", 2],
      ["theme.cycle", 3],
    ]);
  });

  it("emits themes in the JSON", () => {
    const json = toJson(
      compile('theme konfio { frame none; extends "technical.light"; accent "#6a4fd0" }\n'),
    );
    expect(Object.keys(json)).toEqual([
      "format",
      "version",
      "language",
      "ok",
      "imports",
      "diagrams",
      "themes",
      "models",
      "stories",
      "exports",
      "diagnostics",
    ]);
    expect(json.themes).toEqual([
      {
        id: "konfio",
        extends: "technical.light",
        tokens: { accent: "#6a4fd0", frame: "none" },
        classes: [],
        rules: [],
        range: expect.objectContaining({ start: expect.objectContaining({ line: 1 }) }),
      },
    ]);
  });

  it("documents every token as a colour, string, number, enum or time", () => {
    for (const [name, spec] of Object.entries(THEME_TOKENS)) {
      expect(["color", "string", "number", "enum", "time"], name).toContain(spec.kind);
    }
    // Times are the effects' default durations, one per effect.
    expect(
      Object.entries(THEME_TOKENS)
        .filter(([, spec]) => spec.kind === "time")
        .map(([name]) => name),
    ).toEqual(["flowDuration", "dashDuration", "pulseDuration", "traceDuration"]);
  });

  it("takes the sketch level, which styles cannot name", () => {
    const theme = compile("theme t { sketch rough }\n");
    expect(theme.diagnostics).toEqual([]);
    expect(theme.document.themes[0]!.tokens).toEqual({ sketch: "rough" });
    const wobbly = compile("theme t { sketch wobbly }\n").diagnostics;
    expect(wobbly.map((d) => d.code)).toEqual(["prop.invalid-value"]);
    expect(wobbly[0]!.message).toContain("none, light, rough");
    // A theme token, not a style property.
    const styled = compile(
      'diagram d: free {\n  box a "A"\n  style a { sketch rough }\n}\n',
    ).diagnostics;
    expect(styled.map((d) => d.code)).toEqual(["prop.unknown"]);
    expect(BUILT_IN_THEMES).toContain("sketch.light");
    expect(BUILT_IN_THEMES).toContain("sketch.dark");
    expect(BUILT_IN_THEMES).toHaveLength(8);
  });

  it("takes the canvas colours, which styles cannot name", () => {
    const theme = compile('theme t { selection "#0B6BCB"; guide "#16A34A" }\n');
    expect(theme.diagnostics).toEqual([]);
    expect(theme.document.themes[0]!.tokens).toEqual({ selection: "#0B6BCB", guide: "#16A34A" });
    expect(codes("theme t { guide 4 }\n")).toEqual(["prop.invalid-value"]);
    expect(codes('diagram d: flow {\n  a["A"]\n  style a { fill selection }\n}\n')).toEqual([
      "prop.invalid-value",
    ]);
  });
});
