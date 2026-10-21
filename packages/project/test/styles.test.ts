import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import {
  Workspace,
  createMemoryHost,
  projectTheme,
  readManifest,
  themeDefinitionsFor,
  type FileCompilation,
} from "../src/index.js";

const TOOL = { toolVersion: "1.0.0" };

function workspace(files: Record<string, string>, theme?: string): Workspace {
  const manifest = JSON.stringify({
    name: "test",
    language: "0.2",
    ...(theme === undefined ? {} : { theme }),
  });
  const entries = Object.entries(files).map(([path, text]) => [`/p/${path}`, text]);
  const host = createMemoryHost({ "/p/project.json": manifest, ...Object.fromEntries(entries) });
  return new Workspace(host, "/p", TOOL);
}

function file(ws: Workspace, path: string): FileCompilation {
  return ws.compileFile(`/p/${path}`).files.get(`/p/${path}`)!;
}

const COMPANY = [
  "theme corporate {",
  '  extends "technical.dark"',
  '  accent "#6a4fd0"',
  "  class partner { line dashed; stroke accent }",
  "}",
  "",
].join("\n");

const diagram = (body: string, theme?: string) =>
  `diagram d: flow {\n${theme ? `  theme "${theme}"\n` : ""}  layout manual\n${body}\n  placement { place a at (100, 60); place b at (100, 200) }\n}\n`;

describe("manifest theme", () => {
  const read = (theme: unknown) => {
    const host = createMemoryHost({
      "/p/project.json": JSON.stringify({ name: "t", language: "0.2", theme }),
    });
    return readManifest(host, "/p", TOOL);
  };

  it("accepts a built-in theme", () => {
    const result = read("editorial.light");
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest!.theme).toBe("editorial.light");
  });

  it("normalises a theme in a project file", () => {
    const result = read("./themes/company.meltemi#corporate");
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest!.theme).toBe("themes/company.meltemi#corporate");
  });

  it("refuses names that are neither built in nor a file theme", () => {
    for (const value of ["corporate", 7, "../out.meltemi#t", "themes/a.txt#t", "a.meltemi#9x"]) {
      const result = read(value);
      expect(
        result.diagnostics.map((d) => d.code),
        String(value),
      ).toEqual(["project.invalid-value"]);
      expect(result.manifest!.theme).toBeNull();
    }
    expect(read("corporate").diagnostics[0]!.hints![0]).toContain('"<path>#<theme id>"');
  });
});

describe("project default theme", () => {
  it("lays out diagrams without a theme with the project theme", () => {
    const ws = workspace(
      {
        "themes/company.meltemi": COMPANY,
        "diagrams/overview.meltemi": diagram("  a -> b"),
      },
      "themes/company.meltemi#corporate",
    );
    expect(ws.manifest().diagnostics).toEqual([]);
    const overview = file(ws, "diagrams/overview.meltemi");
    expect(overview.diagnostics).toEqual([]);
    const key = projectTheme(overview.program);
    expect(key).toBe("/p/themes/company.meltemi#corporate");
    const result = layoutDiagram(overview.compilation, overview.compilation.document.diagrams[0]!, {
      themes: themeDefinitionsFor(overview),
      defaultTheme: key,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.scene!.background).toBe("#07111F");
  });

  it("returns built-in names as they are", () => {
    const ws = workspace({ "a.meltemi": diagram("  a -> b") }, "stage.dark");
    expect(projectTheme(ws.compileFile("/p/a.meltemi"))).toBe("stage.dark");
  });

  it("reports a missing file or theme on the manifest and returns null", () => {
    const missing = workspace({ "a.meltemi": diagram("  a -> b") }, "themes/missing.meltemi#base");
    expect(missing.manifest().diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["project.invalid-value", "`themes/missing.meltemi` does not exist."],
    ]);
    expect(projectTheme(missing.compileFile("/p/a.meltemi"))).toBeNull();

    const wrong = workspace(
      { "themes/company.meltemi": COMPANY, "a.meltemi": diagram("  a -> b") },
      "themes/company.meltemi#nope",
    );
    const [d] = wrong.manifest().diagnostics;
    expect(d!.message).toBe("`themes/company.meltemi` does not declare a theme `nope`.");
    expect(d!.hints).toEqual(["It declares corporate."]);
    expect(d!.range.start.line).toBe(1);
  });

  it("checks the theme file again after it changes", () => {
    const files: Record<string, string> = { "themes/company.meltemi": "", "a.meltemi": "" };
    const ws = workspace(files, "themes/company.meltemi#corporate");
    expect(ws.manifest().diagnostics).toHaveLength(1);
    ws.setOverlay("/p/themes/company.meltemi", COMPANY);
    expect(ws.manifest().diagnostics).toEqual([]);
  });
});

describe("class checks", () => {
  it("accepts classes of the diagram, the project theme and the built-in classes", () => {
    const ws = workspace(
      {
        "themes/company.meltemi": COMPANY,
        "a.meltemi": diagram(
          '  class hot { fill "#f00" }\n  a["A"] { class partner, hot }\n  b["B"] { class proposed }\n  a -> b',
        ),
      },
      "themes/company.meltemi#corporate",
    );
    expect(file(ws, "a.meltemi").diagnostics).toEqual([]);
  });

  it("accepts classes of an imported theme", () => {
    const ws = workspace({
      "company.meltemi": COMPANY,
      "a.meltemi": `import "./company.meltemi" as company\n${diagram('  a["A"] { class partner }\n  a -> b', "company.corporate")}`,
    });
    expect(file(ws, "a.meltemi").diagnostics).toEqual([]);
  });

  it("reports unknown classes once with the classes in scope", () => {
    const ws = workspace({
      "a.meltemi": diagram("  a -> b as r { class hot }\n  style a, b { class cold }"),
    });
    const diagnostics = file(ws, "a.meltemi").diagnostics;
    expect(diagnostics.map((d) => [d.code, d.severity, d.range.start.line])).toEqual([
      ["theme.unknown-class", "warning", 3],
      ["theme.unknown-class", "warning", 4],
    ]);
    expect(diagnostics[0]!.hints![0]).toBe(
      "Classes in scope: critical, deprecated, external, highlight, proposed.",
    );
  });

  it("leaves diagrams with an unknown theme to the layout", () => {
    const ws = workspace({ "a.meltemi": diagram('  a["A"] { class hot }\n  a -> b', "nowhere") });
    expect(file(ws, "a.meltemi").diagnostics.map((d) => d.code)).toEqual([]);
  });
});
