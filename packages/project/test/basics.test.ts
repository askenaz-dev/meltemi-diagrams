import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import {
  CATALOG_SETTINGS,
  MANIFEST_FIELDS,
  REQUIRED_MANIFEST_FIELDS,
  createMemoryHost,
  findFolderRoot,
  formatOptionsFor,
  findProjectRoot,
  listSources,
  normalizePath,
  parseJsonWithPositions,
  readManifest,
  relativePath,
  resolveImportPath,
  satisfiesRange,
  toProjectPath,
} from "../src/index.js";

const TOOL = { toolVersion: "0.3.0" };

describe("project paths", () => {
  it("normalises native and project paths", () => {
    expect(toProjectPath("C:\\work\\dac\\.\\a\\..\\b.meltemi")).toBe("C:/work/dac/b.meltemi");
    expect(normalizePath("/p//a/./b/../c")).toBe("/p/a/c");
    expect(normalizePath("/../x")).toBe("/x");
    expect(relativePath("/p", "/p/diagrams/a.meltemi")).toBe("diagrams/a.meltemi");
    expect(relativePath("/p/diagrams", "/p/themes/t.meltemi")).toBe("../themes/t.meltemi");
  });

  it("accepts relative .meltemi paths only", () => {
    expect(resolveImportPath("/p/diagrams/a.meltemi", "../themes/t.meltemi")).toEqual({
      ok: true,
      path: "/p/themes/t.meltemi",
    });
    for (const bad of [
      "https://example.com/theme.meltemi",
      "C:/x.meltemi",
      "/abs.meltemi",
      ".\\t.meltemi",
      "themes/t.meltemi",
      "./t.json",
      ".//t.meltemi",
    ]) {
      expect(resolveImportPath("/p/a.meltemi", bad).ok, bad).toBe(false);
    }
  });
});

describe("project root", () => {
  const host = createMemoryHost({
    "/w/architecture/project.json": '{ "name": "a", "language": "0.2" }',
    "/w/architecture/diagrams/checkout.meltemi": "",
    "/w/notes/sketch.meltemi": "",
  });

  it("finds the nearest manifest ancestor", () => {
    expect(findProjectRoot(host, "/w/architecture/diagrams/checkout.meltemi")).toBe(
      "/w/architecture",
    );
    expect(findFolderRoot(host, "/w/architecture/diagrams")).toBe("/w/architecture");
  });

  it("uses the file's folder without a manifest", () => {
    expect(findProjectRoot(host, "/w/notes/sketch.meltemi")).toBe("/w/notes");
  });
});

describe("JSON with positions", () => {
  it("keeps the spans of keys and values", () => {
    const text = '{ "name": "commerce", "list": [1, true, null, "x\\n"] }';
    const result = parseJsonWithPositions(text);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "object") return;
    const [name, list] = result.value.members;
    expect(text.slice(name!.keySpan.start, name!.keySpan.end)).toBe('"name"');
    expect(text.slice(name!.value.span.start, name!.value.span.end)).toBe('"commerce"');
    expect(list!.value.kind === "array" && list!.value.items.map((i) => i.kind)).toEqual([
      "number",
      "boolean",
      "null",
      "string",
    ]);
  });

  it("reports a trailing comma at the comma", () => {
    const text = '{ "name": "commerce", }';
    const result = parseJsonWithPositions(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(text.slice(result.span.start, result.span.end)).toBe(",");
  });

  it("reports unterminated strings and garbage", () => {
    expect(parseJsonWithPositions('{ "a": "x').ok).toBe(false);
    expect(parseJsonWithPositions("{} x").ok).toBe(false);
    expect(parseJsonWithPositions("").ok).toBe(false);
  });
});

describe("manifest", () => {
  const manifest = (text: string, toolVersion = "0.3.0") =>
    readManifest(createMemoryHost({ "/p/project.json": text }), "/p", { toolVersion });
  const codes = (text: string) => manifest(text).diagnostics.map((d) => d.code);

  it("accepts a minimal manifest and applies defaults", () => {
    const result = manifest('{ "name": "commerce", "language": "0.2" }');
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest).toMatchObject({ name: "commerce", sources: ["."], exclude: [] });
  });

  it("returns no manifest for a root without project.json", () => {
    const result = readManifest(createMemoryHost({ "/p/a.meltemi": "" }), "/p", TOOL);
    expect(result).toMatchObject({ manifest: null, diagnostics: [] });
  });

  it("reports broken JSON", () => {
    const result = manifest('{ "name": "commerce", }');
    expect(result.diagnostics.map((d) => [d.code, d.range.start.column])).toEqual([
      ["project.invalid-json", 21],
    ]);
  });

  it("reports unknown and missing fields", () => {
    const result = manifest('{ "nmae": "commerce", "language": "0.2" }');
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["project.unknown-field", "warning"],
      ["project.missing-field", "error"],
    ]);
    expect(result.diagnostics[1]!.message).toContain("`name`");
  });

  it("reports invalid values", () => {
    expect(codes('{ "name": "", "language": "0.2" }')).toEqual(["project.invalid-value"]);
    expect(codes('{ "name": "a", "language": "0.1" }')).toEqual(["project.invalid-value"]);
    expect(codes('{ "name": "a", "language": "0.2", "sources": ["../x"] }')).toEqual([
      "project.invalid-value",
    ]);
    expect(
      codes('{ "name": "a", "language": "0.2", "tools": { "meltemi-diagrams": "lol" } }'),
    ).toEqual(["project.invalid-value"]);
    expect(codes("[]")).toEqual(["project.invalid-value"]);
  });

  it("reads the language of exported content", () => {
    expect(manifest('{ "name": "a", "language": "0.2" }').manifest!.locale).toBeNull();
    const spanish = manifest('{ "name": "a", "language": "0.2", "locale": "es" }');
    expect(spanish.diagnostics).toEqual([]);
    expect(spanish.manifest!.locale).toBe("es");
    const french = manifest('{ "name": "a", "language": "0.2", "locale": "fr" }');
    expect(french.diagnostics.map((d) => d.code)).toEqual(["project.invalid-value"]);
    expect(french.diagnostics[0]!.message).toBe('`locale` must be "en" or "es".');
  });

  it("checks the tool version", () => {
    const result = manifest(
      '{ "name": "a", "language": "0.2", "tools": { "meltemi-diagrams": "^0.9.0" } }',
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(["project.tool-version"]);
    expect(result.diagnostics[0]!.message).toContain("^0.9.0");
    expect(result.diagnostics[0]!.message).toContain("0.3.0");
  });

  it("reads version ranges", () => {
    for (const range of ["~0.3.0", "^0.3.0", ">=0.3.0 <1.0.0", "*", "0.3.4", "0.1.0 || 0.3.4"]) {
      expect(satisfiesRange("0.3.4", range), range).toBe(true);
    }
    for (const range of ["0.3.5", "^0.4.0", "~0.2.0", "<0.3.4", "nonsense"]) {
      expect(satisfiesRange("0.3.4", range), range).toBe(false);
    }
    expect(satisfiesRange("1.4.0", "^1.2.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfiesRange("0.0.4", "^0.0.3")).toBe(false);
  });
});

describe("format settings", () => {
  const manifest = (format: string) =>
    readManifest(
      createMemoryHost({
        "/p/project.json": `{ "name": "a", "language": "0.2", "format": ${format} }`,
      }),
      "/p",
      TOOL,
    );

  it("reads the indentation", () => {
    const result = manifest('{ "indent": 4 }');
    expect(result.diagnostics).toEqual([]);
    expect(formatOptionsFor(result.manifest)).toEqual({ indent: 4 });
    expect(formatOptionsFor(manifest('{ "indent": "tab" }').manifest)).toEqual({ indent: "tab" });
    expect(formatOptionsFor(null)).toEqual({ indent: 2 });
  });

  it("reports an invalid indentation and keeps the default", () => {
    const result = manifest('{ "indent": 12 }');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["project.invalid-value"]);
    expect(formatOptionsFor(result.manifest)).toEqual({ indent: 2 });
  });

  it("reports an unknown format key", () => {
    expect(manifest('{ "width": 80 }').diagnostics.map((d) => d.code)).toEqual([
      "project.unknown-field",
    ]);
  });
});

describe("sources", () => {
  it("lists sources minus excluded and always-excluded folders", () => {
    const host = createMemoryHost({
      "/p/project.json": '{ "name": "a", "language": "0.2", "exclude": ["drafts"] }',
      "/p/diagrams/b.meltemi": "",
      "/p/diagrams/a.meltemi": "",
      "/p/drafts/old.meltemi": "",
      "/p/node_modules/x/y.meltemi": "",
      "/p/.meltemi/cache/c.meltemi": "",
      "/p/notes.txt": "",
    });
    const { manifest } = readManifest(host, "/p", TOOL);
    expect(listSources(host, "/p", manifest)).toEqual([
      "/p/diagrams/a.meltemi",
      "/p/diagrams/b.meltemi",
    ]);
  });

  it("limits sources to the listed folders", () => {
    const host = createMemoryHost({
      "/p/project.json": '{ "name": "a", "language": "0.2", "sources": ["diagrams"] }',
      "/p/diagrams/a.meltemi": "",
      "/p/other/b.meltemi": "",
    });
    const { manifest } = readManifest(host, "/p", TOOL);
    expect(listSources(host, "/p", manifest)).toEqual(["/p/diagrams/a.meltemi"]);
  });
});

describe("manifest schema", () => {
  it("documents exactly the fields the reader accepts", () => {
    const schema = JSON.parse(
      readFileSync(join(REPO_ROOT, "schemas", "project.schema.json"), "utf8"),
    );
    expect(Object.keys(schema.properties)).toEqual([...MANIFEST_FIELDS]);
    expect(schema.required).toEqual([...REQUIRED_MANIFEST_FIELDS]);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties.catalog.properties)).toEqual([...CATALOG_SETTINGS]);
  });
});

describe("catalog settings", () => {
  const read = (catalog: string) =>
    readManifest(
      createMemoryHost({
        "/p/project.json": `{ "name": "shop", "language": "0.2", "catalog": ${catalog} }`,
      }),
      "/p",
      TOOL,
    );

  it("defaults to the project name, catalog/ and no source", () => {
    const result = readManifest(
      createMemoryHost({ "/p/project.json": '{ "name": "shop", "language": "0.2" }' }),
      "/p",
      TOOL,
    );
    expect(result.manifest!.catalog).toEqual({
      title: null,
      description: null,
      out: "catalog",
      exclude: [],
      source: false,
    });
  });

  it("reads every setting", () => {
    const result = read(
      '{ "title": " Shop ", "description": "Views", "out": "./public/catalog", "exclude": ["drafts/", "diagrams/a.meltemi#x"], "source": true }',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest!.catalog).toEqual({
      title: "Shop",
      description: "Views",
      out: "public/catalog",
      exclude: ["drafts", "diagrams/a.meltemi#x"],
      source: true,
    });
  });

  it("reports wrong values, paths outside the project and unknown settings", () => {
    const result = read(
      '{ "title": "", "out": "../site", "exclude": ["/abs", "a.meltemi#1x", "notes#x", 3], "source": "yes", "private": true }',
    );
    const codes = result.diagnostics.map((d) => `${d.code}:${d.severity}`);
    expect(codes.filter((c) => c === "project.invalid-value:error")).toHaveLength(7);
    expect(codes).toContain("project.unknown-field:warning");
    expect(result.manifest!.catalog.out).toBe("catalog");
    expect(result.manifest!.catalog.exclude).toEqual([]);
    expect(read('"all"').diagnostics[0]!.code).toBe("project.invalid-value");
  });
});
