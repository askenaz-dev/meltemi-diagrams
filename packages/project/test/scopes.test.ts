import { describe, expect, it } from "vitest";
import { layoutDiagram, resolveTheme } from "@meltemi/diagrams-layout";
import {
  Workspace,
  createMemoryHost,
  resolveReference,
  themeDefinitionsFor,
  type FileCompilation,
} from "../src/index.js";

const MANIFEST = '{ "name": "test", "language": "0.2" }';

function workspace(files: Record<string, string>): Workspace {
  const entries = Object.entries(files).map(([path, text]) => [`/p/${path}`, text]);
  const host = createMemoryHost({ "/p/project.json": MANIFEST, ...Object.fromEntries(entries) });
  return new Workspace(host, "/p", { toolVersion: "1.0.0" });
}

function file(ws: Workspace, path: string): FileCompilation {
  return ws.compileFile(`/p/${path}`).files.get(`/p/${path}`)!;
}

const COMPANY = [
  'theme base { tag "#111111"; extends "technical.dark" }',
  'theme corporate { extends "base"; accent "#6a4fd0" }',
  "",
].join("\n");

const placed = (theme: string) =>
  `diagram d: flow {\n  theme "${theme}"\n  layout manual\n  a -> b\n  placement { place a at (100, 60); place b at (100, 200) }\n}\n`;

function layout(f: FileCompilation) {
  const diagram = f.compilation.document.diagrams[0]!;
  return layoutDiagram(f.compilation, diagram, { themes: themeDefinitionsFor(f) });
}

describe("themes across files", () => {
  it("lays out a diagram with an imported member theme", () => {
    const ws = workspace({
      "diagrams/checkout.meltemi": `import corporate from "../themes/company.meltemi"\n${placed("corporate")}`,
      "themes/company.meltemi": COMPANY,
    });
    const checkout = file(ws, "diagrams/checkout.meltemi");
    expect(checkout.diagnostics).toEqual([]);
    const result = layout(checkout);
    expect(result.diagnostics).toEqual([]);
    expect(result.scene!.background).toBe("#07111F");
  });

  it("resolves a namespace-qualified theme with the base of its own file", () => {
    const ws = workspace({
      "a.meltemi": `import "./company.meltemi" as company\n${placed("company.corporate")}`,
      "company.meltemi": COMPANY,
    });
    const definitions = themeDefinitionsFor(file(ws, "a.meltemi"));
    const { theme, known } = resolveTheme("company.corporate", definitions);
    expect(known).toBe(true);
    expect(theme.tag).toBe("#111111");
    expect(theme.accent).toBe("#6a4fd0");
    expect(theme.background).toBe("#07111F");
  });

  it("lets a local theme extend an imported one", () => {
    const ws = workspace({
      "a.meltemi": `import corporate as corp from "./company.meltemi"\ntheme local { extends "corp"; accent "#ff0000" }\n${placed("local")}`,
      "company.meltemi": COMPANY,
    });
    const a = file(ws, "a.meltemi");
    expect(a.diagnostics).toEqual([]);
    const { theme } = resolveTheme("local", themeDefinitionsFor(a));
    expect(theme.accent).toBe("#ff0000");
    expect(theme.tag).toBe("#111111");
  });

  it("reports names with an import prefix that resolve to nothing", () => {
    const ws = workspace({
      "a.meltemi": `import "./company.meltemi" as company\ntheme t { extends "company.nope" }\n${placed("company.missing")}`,
      "company.meltemi": COMPANY,
    });
    const codes = file(ws, "a.meltemi").diagnostics.map((d) => [d.code, d.severity]);
    expect(codes).toEqual([
      ["theme.unknown-base", "error"],
      ["layout.unknown-theme", "warning"],
    ]);
  });

  it("terminates on a cross-file inheritance cycle", () => {
    const ws = workspace({
      "a.meltemi": `import "./b.meltemi" as b\ntheme x { extends "b.y" }\n${placed("x")}`,
      "b.meltemi": 'import "./a.meltemi" as a\ntheme y { extends "a.x" }\n',
    });
    const a = file(ws, "a.meltemi");
    const program = a.program;
    const all = [...program.files.values()].flatMap((f) => f.diagnostics.map((d) => d.code));
    expect(all).toContain("module.cycle");
    expect(all.filter((c) => c.startsWith("theme."))).toEqual([]);
    const result = layout(a);
    expect(result.scene).not.toBeNull();
  });

  it("reports an inheritance loop across files only as an import cycle", () => {
    const ws = workspace({
      "a.meltemi": 'import y from "./b.meltemi"\ntheme x { extends "y" }\n',
      "b.meltemi": 'import x from "./c.meltemi"\ntheme y { extends "x" }\n',
      "c.meltemi": 'import y from "./b.meltemi"\ntheme x { extends "y" }\n',
    });
    const codes = [...ws.compileProject().files.values()].flatMap((f) =>
      f.diagnostics.map((d) => d.code),
    );
    expect(codes).toContain("module.cycle");
    expect(codes.filter((c) => c.startsWith("theme."))).toEqual([]);
  });
});

describe("qualified references", () => {
  const ws = workspace({
    "stories/purchase.meltemi":
      'import "../diagrams/checkout.meltemi" as flows\nimport checkout as co from "../diagrams/checkout.meltemi"\n',
    "diagrams/checkout.meltemi": "diagram checkout: flow { a -> b }\ntheme corporate { }\n",
  });
  const purchase = file(ws, "stories/purchase.meltemi");

  it("resolves a diagram through a namespace and a member binding", () => {
    for (const name of ["flows.checkout", "co"]) {
      const result = resolveReference(purchase, name, ["diagram"]);
      expect(result).toMatchObject({
        ok: true,
        file: "/p/diagrams/checkout.meltemi",
        id: "checkout",
        kind: "diagram",
      });
    }
  });

  it("names the kind found for a wrong kind", () => {
    const result = resolveReference(purchase, "flows.corporate", ["diagram"]);
    expect(result).toEqual({
      ok: false,
      message: "`flows.corporate` is a theme, not a diagram.",
    });
  });

  it("lists candidates when nothing matches", () => {
    const result = resolveReference(purchase, "flows.payment", ["diagram"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Available: co, flows.checkout.");
  });
});

describe("workspace", () => {
  const files = {
    "themes/company.meltemi": COMPANY,
    "checkout.meltemi": `import corporate from "./themes/company.meltemi"\n${placed("corporate")}`,
    "payment.meltemi": `import base from "./themes/company.meltemi"\n${placed("base")}`,
    "notes.meltemi": placed("technical.light"),
  };

  it("reuses single-file compilations of unaffected files", () => {
    const ws = workspace(files);
    ws.compileProject();
    expect(ws.stats.compilations).toBe(4);
    ws.setOverlay("/p/themes/company.meltemi", COMPANY.replace("#6a4fd0", "#000000"));
    const program = ws.compileProject();
    expect(ws.stats.compilations).toBe(5);
    const checkout = program.files.get("/p/checkout.meltemi")!;
    expect(resolveTheme("corporate", themeDefinitionsFor(checkout)).theme.accent).toBe("#000000");
  });

  it("reads the host again when an overlay is cleared", () => {
    const ws = workspace(files);
    ws.setOverlay("/p/notes.meltemi", "diagram changed: flow { a -> b }\n");
    expect(ws.file("/p/notes.meltemi")!.compilation.document.diagrams[0]!.id).toBe("changed");
    ws.setOverlay("/p/notes.meltemi", null);
    expect(ws.file("/p/notes.meltemi")!.compilation.document.diagrams[0]!.id).toBe("d");
  });

  it("reports problems of several files and of the manifest", () => {
    const host = createMemoryHost({
      "/p/project.json": '{ "name": "t", "language": "0.2", "colour": 1 }',
      "/p/a.meltemi": 'import "./b.meltemi" as b\n',
      "/p/b.meltemi": 'import "./a.meltemi" as a\n',
    });
    const ws = new Workspace(host, "/p", { toolVersion: "1.0.0" });
    const program = ws.compileProject();
    expect(program.manifest.diagnostics.map((d) => d.code)).toEqual(["project.unknown-field"]);
    expect(program.files.get("/p/b.meltemi")!.diagnostics.map((d) => d.code)).toContain(
      "module.cycle",
    );
  });

  it("includes unsaved new files in the project", () => {
    const ws = workspace(files);
    ws.setOverlay("/p/new.meltemi", "diagram fresh: flow { a -> b }\n");
    expect(ws.sources()).toContain("/p/new.meltemi");
    ws.setOverlay("/p/uses.meltemi", 'import fresh from "./new.meltemi"\n');
    expect(ws.file("/p/uses.meltemi")!.diagnostics.map((d) => d.code)).toEqual([
      "module.unused-import",
    ]);
  });
});
