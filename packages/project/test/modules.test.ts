import { describe, expect, it } from "vitest";
import { Workspace, createMemoryHost, type Program } from "../src/index.js";

const MANIFEST = '{ "name": "test", "language": "0.2" }';

function project(files: Record<string, string>): Workspace {
  const host = createMemoryHost({ "/p/project.json": MANIFEST, ...prefixed(files) });
  return new Workspace(host, "/p", { toolVersion: "1.0.0" });
}

function prefixed(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, text]) => [`/p/${path}`, text]));
}

function diagnostics(program: Program, path: string) {
  return program.files.get(`/p/${path}`)!.diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    line: d.range.start.line,
    hints: d.hints ?? [],
  }));
}

const THEMES = 'theme corporate { accent "#123456" }\ntheme base { tag "#111111" }\n';
const DIAGRAM = (theme: string) => `diagram d: flow {\n  theme "${theme}"\n  a -> b\n}\n`;

describe("import paths", () => {
  it("rejects URLs without fetching", () => {
    const program = project({
      "a.meltemi": 'import x from "https://example.com/theme.meltemi"\n',
    }).compileFile("/p/a.meltemi");
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toEqual(["module.invalid-path"]);
  });

  it("rejects paths that escape the project", () => {
    const program = project({ "a.meltemi": 'import x from "../outside.meltemi"\n' }).compileFile(
      "/p/a.meltemi",
    );
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toEqual([
      "module.outside-project",
    ]);
  });

  it("names a file that differs in letter case", () => {
    const program = project({
      "a.meltemi": 'import "./Themes.meltemi" as t\n',
      "themes.meltemi": THEMES,
    }).compileFile("/p/a.meltemi");
    const [notFound] = diagnostics(program, "a.meltemi");
    expect(notFound!.code).toBe("module.not-found");
    expect(notFound!.hints[0]).toContain("themes.meltemi");
  });

  it("reports a missing file", () => {
    const program = project({ "a.meltemi": 'import "./nope.meltemi" as n\n' }).compileFile(
      "/p/a.meltemi",
    );
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toEqual(["module.not-found"]);
  });
});

describe("bindings", () => {
  it("reports a binding that clashes with a local theme", () => {
    const program = project({
      "a.meltemi": 'import corporate from "./themes.meltemi"\ntheme corporate { }\n',
      "themes.meltemi": THEMES,
    }).compileFile("/p/a.meltemi");
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toContain("ref.duplicate-id");
  });

  it("reserves the built-in theme prefixes", () => {
    const program = project({
      "a.meltemi": `import "./themes.meltemi" as stage\n${DIAGRAM("stage.corporate")}`,
      "themes.meltemi": THEMES,
    }).compileFile("/p/a.meltemi");
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toContain("module.reserved-name");
  });

  it("lists the offered ids for an unknown member", () => {
    const program = project({
      "a.meltemi": `import dark from "./themes.meltemi"\n${DIAGRAM("dark")}`,
      "themes.meltemi": THEMES,
    }).compileFile("/p/a.meltemi");
    const unknown = diagnostics(program, "a.meltemi").find(
      (d) => d.code === "module.unknown-member",
    );
    expect(unknown?.hints).toEqual(["It defines base, corporate."]);
  });

  it("warns about late and duplicate imports and notes unused ones", () => {
    const program = project({
      "a.meltemi": [
        'import corporate from "./themes.meltemi"',
        'import base from "./themes.meltemi"',
        DIAGRAM("corporate"),
        'import "./themes.meltemi" as late',
        "",
      ].join("\n"),
      "themes.meltemi": THEMES,
    }).compileFile("/p/a.meltemi");
    expect(diagnostics(program, "a.meltemi").map((d) => [d.code, d.severity, d.line])).toEqual([
      ["module.duplicate-import", "warning", 2],
      ["module.unused-import", "info", 2],
      ["module.import-position", "warning", 8],
      ["module.duplicate-import", "warning", 8],
      ["module.unused-import", "info", 8],
    ]);
  });
});

describe("cycles", () => {
  it("reports a two-file cycle with its chain and terminates", () => {
    const workspace = project({
      "a.meltemi": 'import "./b.meltemi" as b\ntheme x { extends "b.y" }\n',
      "b.meltemi": 'import "./a.meltemi" as a\ntheme y { extends "a.x" }\n',
    });
    const program = workspace.compileFile("/p/a.meltemi");
    const cycle = diagnostics(program, "b.meltemi").find((d) => d.code === "module.cycle");
    expect(cycle?.message).toBe("Import cycle: a.meltemi → b.meltemi → a.meltemi.");
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).not.toContain("module.cycle");
    expect(() => workspace.compileFile("/p/b.meltemi")).not.toThrow();
  });

  it("reports a three-file cycle once per compilation", () => {
    const program = project({
      "a.meltemi": 'import "./b.meltemi" as b\n',
      "b.meltemi": 'import "./c.meltemi" as c\n',
      "c.meltemi": 'import "./a.meltemi" as a\n',
    }).compileProject();
    const cycles = [...program.files.values()].flatMap((f) =>
      f.diagnostics.filter((d) => d.code === "module.cycle").map((d) => d.message),
    );
    expect(cycles).toEqual(["Import cycle: a.meltemi → b.meltemi → c.meltemi → a.meltemi."]);
  });
});

describe("language version", () => {
  it("reports a file in another language version", () => {
    const program = project({ "a.meltemi": 'language "0.1"\n' }).compileFile("/p/a.meltemi");
    expect(diagnostics(program, "a.meltemi").map((d) => d.code)).toContain(
      "project.language-mismatch",
    );
  });
});
