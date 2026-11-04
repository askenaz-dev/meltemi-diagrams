import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnosticsToJson, stringifyJson } from "@meltemi/diagrams-model";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import {
  Workspace,
  projectTheme,
  relativePath,
  themeDefinitionsFor,
  toProjectPath,
} from "@meltemi/diagrams-project";
import { createNodeHost } from "@meltemi/diagrams-project/node";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import type { FontLibrary } from "@meltemi/diagrams-fonts";
import { renderSvg } from "@meltemi/diagrams-render";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { CLI_VERSION, run } from "../src/index.js";

const PROJECTS = join(REPO_ROOT, "corpus", "projects");
const builtInPacks = createNodeIconPacks();
const folders = (kind: string) =>
  readdirSync(join(PROJECTS, kind))
    .filter((name) => statSync(join(PROJECTS, kind, name)).isDirectory())
    .sort();

/** A workspace with the CLI's asset services and its own font library, as exports use them. */
function workspace(kind: string, name: string): { ws: Workspace; fonts: FontLibrary } {
  const fonts = createNodeFontLibrary();
  const ws = new Workspace(createNodeHost(), toProjectPath(join(PROJECTS, kind, name)), {
    toolVersion: CLI_VERSION,
    assets: {
      builtInPacks,
      inspectFont: (data, path) => {
        const result = fonts.addFont(data, path);
        return result.ok ? { ok: true, ...result.font } : result;
      },
    },
  });
  return { ws, fonts };
}

async function mdg(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd: REPO_ROOT,
  });
  return { code, stdout, stderr };
}

describe("valid projects", () => {
  it.each(folders("valid"))("%s compiles cleanly and renders its diagrams", async (name) => {
    const { ws, fonts } = workspace("valid", name);
    expect(ws.manifest().diagnostics).toEqual([]);
    expect(Object.fromEntries(ws.assets().diagnostics)).toEqual({});
    const program = ws.compileProject();
    expect(program.files.size).toBeGreaterThan(0);
    const icons = ws.assets().registry;
    const defaultTheme = projectTheme(program);
    // Diagram types of plugins arrange their diagrams by default.
    const engine = createElkEngine();
    for (const file of program.files.values()) {
      expect(file.diagnostics, relativePath(ws.root, file.path)).toEqual([]);
      const themes = themeDefinitionsFor(file);
      for (const diagram of file.compilation.document.diagrams) {
        const result = layoutDiagram(file.compilation, diagram, {
          themes,
          measurer: fonts,
          icons,
          defaultTheme,
          images: ws.imageResolver(file.path),
          engine,
        });
        expect(result.diagnostics).toEqual([]);
        await expect(renderSvg(result.scene!)).toMatchFileSnapshot(
          file.path.replace(/\.meltemi$/, ".svg"),
        );
      }
    }
  });
});

describe("invalid projects", () => {
  it.each(folders("invalid"))("%s reports its code", async (name) => {
    const { ws } = workspace("invalid", name);
    const program = ws.compileProject();
    const report: Record<string, unknown> = {};
    const manifest = ws.manifest();
    const assetDiagnostics = new Map([...ws.plugins().diagnostics]);
    for (const [path, list] of ws.assets().diagnostics) {
      assetDiagnostics.set(path, [...(assetDiagnostics.get(path) ?? []), ...list]);
    }
    const manifestList = [...manifest.diagnostics, ...(assetDiagnostics.get(manifest.path) ?? [])];
    if (manifestList.length > 0) report["project.json"] = diagnosticsToJson(manifestList);
    for (const [path, list] of [...assetDiagnostics].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (path !== manifest.path) report[relativePath(ws.root, path)] = diagnosticsToJson(list);
    }
    for (const file of [...program.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      if (file.diagnostics.length > 0) {
        report[relativePath(ws.root, file.path)] = diagnosticsToJson(file.diagnostics);
      }
    }
    const codes = Object.values(report).flatMap((list) =>
      (list as { code: string }[]).map((d) => d.code),
    );
    expect(codes).toContain(name);
    await expect(stringifyJson(report)).toMatchFileSnapshot(
      join(PROJECTS, "invalid", name, "expected.json"),
    );
  });

  it("covers every module and project code", () => {
    const docs = readFileSync(join(REPO_ROOT, "docs", "language", "diagnostics.md"), "utf8");
    const documented = [...docs.matchAll(/`((?:module|project|asset|plugin|type)\.[a-z-]+)`/g)].map(
      (m) => m[1]!,
    );
    expect(documented.length).toBeGreaterThan(0);
    for (const code of new Set(documented)) expect(folders("invalid")).toContain(code);
  });
});

describe("CLI on projects", () => {
  it("validates a project with an import cycle", async () => {
    const { code, stdout } = await mdg("validate", "corpus/projects/invalid/module.cycle");
    expect(code).toBe(1);
    expect(stdout).toContain(
      "corpus/projects/invalid/module.cycle/b.meltemi:1:8: error module.cycle Import cycle: a.meltemi → b.meltemi → a.meltemi.",
    );
  });

  it("prints manifest problems with the project.json path", async () => {
    const { code, stdout } = await mdg("validate", "corpus/projects/invalid/project.unknown-field");
    expect(code).toBe(0);
    expect(stdout).toContain(
      "corpus/projects/invalid/project.unknown-field/project.json:4:3: warning project.unknown-field",
    );
  });

  it("validates a single file with its imports", async () => {
    const { code, stdout } = await mdg(
      "validate",
      "corpus/projects/valid/commerce/diagrams/checkout.meltemi",
    );
    expect(code).toBe(0);
    expect(stdout).toBe("Checked 1 file: 0 errors, 0 warnings.\n");
  });

  it("exports a diagram that uses an imported theme", async () => {
    const { code, stdout } = await mdg(
      "export",
      "corpus/projects/valid/commerce/diagrams/checkout.meltemi",
      "--stdout",
    );
    expect(code).toBe(0);
    expect(stdout).toContain('fill="#07111F"');
    expect(stdout).toContain("Commerce · Meltemi Diagrams");
  });

  it("fails an export whose imports do not resolve", async () => {
    const { code, stderr } = await mdg(
      "export",
      "corpus/projects/invalid/module.not-found/a.meltemi",
      "--stdout",
    );
    expect(code).toBe(1);
    expect(stderr).toContain("module.not-found");
  });
});

describe("versions", () => {
  it("gives every package the CLI version", () => {
    for (const folder of readdirSync(join(REPO_ROOT, "packages"))) {
      const manifest = JSON.parse(
        readFileSync(join(REPO_ROOT, "packages", folder, "package.json"), "utf8"),
      );
      expect(manifest.version, folder).toBe(CLI_VERSION);
    }
  });
});

describe("plugins", () => {
  it("lists what a project's plugins add, and their problems", async () => {
    const listed = await mdg("plugins", "corpus/projects/valid/plugins");
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain("erd 1.0.0 (MIT)");
    expect(listed.stdout).toContain("diagram type org (Organisation chart): role, team");
    const json = JSON.parse(
      (await mdg("plugins", "corpus/projects/valid/plugins", "--json")).stdout,
    );
    expect(json.plugins[0]).toMatchObject({
      name: "erd",
      loaded: true,
      permissions: ["diagram-types", "icons"],
    });
    const broken = await mdg("plugins", "corpus/projects/invalid/plugin.incompatible");
    expect(broken.code).toBe(1);
    expect(broken.stdout).toContain("error plugin.incompatible");
    const valid = await mdg("validate", "corpus/projects/valid/plugins");
    expect(valid.stdout).toBe("Checked 2 files: 0 errors, 0 warnings.\n");
  });
});
