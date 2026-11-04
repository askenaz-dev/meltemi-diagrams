import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLock } from "@meltemi/diagrams-assets";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import {
  PLUGIN_PERMISSIONS,
  PROJECT_LIMITS,
  RENDERER_API_VERSION,
  Workspace,
  createMemoryHost,
  toProjectPath,
} from "../src/index.js";

const TOOL = { toolVersion: "1.0.0" };
const corpus = (relative: string) =>
  readFileSync(join(REPO_ROOT, "corpus", "projects", "valid", "plugins", relative), "utf8");

function project(files: Record<string, string>): Workspace {
  return new Workspace(createMemoryHost(files), "/p", TOOL);
}

describe("plugins", () => {
  const files = {
    "/p/project.json": corpus("project.json"),
    "/p/plugins/erd/meltemi-plugin.json": corpus("plugins/erd/meltemi-plugin.json"),
    "/p/plugins/erd/icons/key.svg": corpus("plugins/erd/icons/key.svg"),
    "/p/diagrams/schema.meltemi": corpus("diagrams/schema.meltemi"),
  };

  it("load what project.json installs and grants, with provenance", () => {
    expect(PLUGIN_PERMISSIONS).toEqual(["diagram-types", "icons"]);
    expect(RENDERER_API_VERSION).toBe("1.0.0");
    const ws = project(files);
    const { plugins, types, diagnostics } = ws.plugins();
    expect([...diagnostics]).toEqual([]);
    expect(plugins.map((p) => [p.name, p.version, p.permissions, p.icons])).toEqual([
      ["erd", "1.0.0", ["diagram-types", "icons"], "/p/plugins/erd/icons"],
    ]);
    expect(types.map((t) => t.type)).toEqual(["erd", "org"]);
    expect(plugins[0]!.integrity).toMatch(/^sha256-/);
    expect(ws.file("/p/diagrams/schema.meltemi")!.diagnostics).toEqual([]);
    expect(ws.assets().registry.lookup("erd:key").status).toBe("found");
    const lock = formatLock(ws.assets().lock);
    expect(JSON.parse(lock).plugins).toEqual({
      erd: { version: "1.0.0", path: "plugins/erd", integrity: plugins[0]!.integrity },
    });
  });

  it("load the libraries a plugin declares, and report a file that is not one", () => {
    const manifest = JSON.parse(files["/p/plugins/erd/meltemi-plugin.json"]);
    manifest.libraries = ["shapes.json", "broken.json"];
    const ws = project({
      ...files,
      "/p/plugins/erd/meltemi-plugin.json": JSON.stringify(manifest),
      "/p/plugins/erd/shapes.json": JSON.stringify({
        id: "erd-shapes",
        title: "ERD shapes",
        categories: [{ id: "keys", title: "Keys", items: [{ icon: "erd:key", label: "Key" }] }],
      }),
      "/p/plugins/erd/broken.json": '{"id":"x","title":"X"}',
      "/p/assets/libraries/mine.json": JSON.stringify({
        id: "mine",
        title: "Mine",
        categories: [{ id: "a", title: "A", items: [{ icon: "tabler:server", label: "Server" }] }],
      }),
    });
    expect(ws.plugins().plugins[0]!.libraries).toEqual([
      "/p/plugins/erd/shapes.json",
      "/p/plugins/erd/broken.json",
    ]);
    const assets = ws.assets();
    expect(assets.libraries.map((l) => [l.id, l.source])).toEqual([
      ["mine", "assets/libraries/mine.json"],
      ["erd-shapes", "plugins/erd/shapes.json"],
    ]);
    const problems = [...assets.diagnostics.entries()].flatMap(([path, list]) =>
      list.map((d) => [path, d.code]),
    );
    expect(problems).toContainEqual(["/p/plugins/erd/broken.json", "plugin.invalid-manifest"]);
  });

  it("contribute nothing that is not granted", () => {
    const manifest = JSON.parse(files["/p/project.json"]);
    manifest.plugins.erd.permissions = ["icons"];
    const ws = project({ ...files, "/p/project.json": JSON.stringify(manifest) });
    expect(ws.plugins().types).toEqual([]);
    const warnings = [...ws.plugins().diagnostics.values()].flat().map((d) => d.code);
    expect(warnings).toEqual(["plugin.permission-denied"]);
    expect(ws.file("/p/diagrams/schema.meltemi")!.diagnostics[0]!.code).toBe("profile.unknown");
  });

  it("reload when a plugin's manifest changes", () => {
    const ws = project(files);
    expect(ws.plugins().types).toHaveLength(2);
    const changed = JSON.parse(files["/p/plugins/erd/meltemi-plugin.json"]);
    changed.diagramTypes = changed.diagramTypes.slice(0, 1);
    ws.setOverlay("/p/plugins/erd/meltemi-plugin.json", JSON.stringify(changed));
    expect(ws.plugins().types.map((t) => t.type)).toEqual(["erd"]);
  });
});

describe("project limits", () => {
  it("refuse an oversized project.json and count the sources", () => {
    const big = project({
      "/p/project.json": `{ "name": "p", "language": "0.2", "x": "${"x".repeat(PROJECT_LIMITS.manifestCharacters)}" }`,
    });
    expect(big.manifest().diagnostics.map((d) => d.code)).toEqual(["limit.too-large"]);
    const sources: Record<string, string> = {
      "/p/project.json": '{ "name": "p", "language": "0.2" }',
    };
    for (let i = 0; i <= PROJECT_LIMITS.files; i++) sources[`/p/f${i}.meltemi`] = "";
    const many = project(sources);
    expect(many.sources()).toHaveLength(PROJECT_LIMITS.files);
    expect([...many.limits().values()].flat().map((d) => d.code)).toEqual(["limit.too-many-files"]);
    expect(toProjectPath("C:\\p")).toBe("C:/p");
  });
});
