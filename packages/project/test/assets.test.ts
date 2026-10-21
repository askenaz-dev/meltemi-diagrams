import { describe, expect, it } from "vitest";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { FontLibrary } from "@meltemi/diagrams-fonts";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import { Workspace, createMemoryHost, type FontInspection } from "../src/index.js";

const builtInPacks = createNodeIconPacks();
const ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>';
const BRAND = JSON.stringify({
  prefix: "brand",
  width: 24,
  height: 24,
  icons: { logo: { body: '<path fill="currentColor" d="M2 2h20v20H2z"/>' } },
  info: { name: "Brand", version: "1.0.0", license: { spdx: "CC-BY-4.0" } },
});

function workspace(
  files: Record<string, string | Uint8Array>,
  manifest: Record<string, unknown> = {},
): Workspace {
  const fonts = new FontLibrary(() => undefined);
  const entries = Object.entries(files).map(([path, content]) => [`/p/${path}`, content]);
  const host = createMemoryHost({
    "/p/project.json": JSON.stringify({ name: "p", language: "0.2", ...manifest }),
    ...Object.fromEntries(entries),
  });
  return new Workspace(host, "/p", {
    toolVersion: "1.0.0",
    assets: {
      builtInPacks,
      inspectFont: (data, path): FontInspection => {
        const result = fonts.addFont(data, path);
        return result.ok ? { ok: true, ...result.font } : result;
      },
    },
  });
}

const codes = (ws: Workspace) =>
  Object.fromEntries(
    [...ws.assets().diagnostics].map(([path, list]) => [path, list.map((d) => d.code)]),
  );

const diagram = (style: string) =>
  `diagram d: flow {\n  layout manual\n  api["API"]\n  style api { ${style} }\n  placement { place api at (1, 1) }\n}\n`;

describe("asset discovery", () => {
  it("finds packs, fonts and licences", () => {
    const ws = workspace(
      {
        "assets/icons/brand.json": BRAND,
        "assets/icons/aws/lambda.svg": ICON,
        "assets/fonts/Company-Regular.ttf": syntheticFont({ family: "Company" }),
        "assets/licenses.json": JSON.stringify({
          icons: { aws: { license: "LicenseRef-AWS", redistribute: false } },
          fonts: { Company: { license: "OFL-1.1" } },
        }),
      },
      { icons: { cloud: "aws" } },
    );
    const assets = ws.assets();
    expect(codes(ws)).toEqual({});
    expect(assets.packs.map((p) => p.pack.prefix)).toEqual(["aws", "brand"]);
    expect(assets.fonts.map((f) => [f.family, f.weight, f.license])).toEqual([
      ["Company", 400, "OFL-1.1"],
    ]);
    expect(assets.registry.resolve("cloud:lambda")?.name).toBe("lambda");
    expect(assets.registry.pack("aws")!.metadata.redistribute).toBe(false);
    expect(assets.lock.icons.tabler).toEqual({
      version: "3.48.0",
      source: "built-in",
      license: "MIT",
    });
    expect(assets.lock.icons.aws!.integrity).toMatch(/^sha256-/);
  });

  it("sees files added through overlays", () => {
    const ws = workspace({
      "assets/icons/aws/lambda.svg": ICON,
      "assets/licenses.json": JSON.stringify({ icons: { aws: { license: "CC0-1.0" } } }),
    });
    expect(ws.assets().registry.resolve("aws:s3")).toBeUndefined();
    ws.setOverlay("/p/assets/icons/aws/s3.svg", ICON);
    expect(ws.assets().registry.resolve("aws:s3")?.name).toBe("s3");
  });

  it("requires licences and reports unusable icons on their files", () => {
    const ws = workspace({
      "assets/icons/local/box.svg": ICON,
      "assets/icons/local/bad.svg": "<svg viewBox='0 0 1 1'><script/></svg>",
      "assets/fonts/Company.ttf": syntheticFont({ family: "Company" }),
    });
    expect(codes(ws)).toEqual({
      "/p/assets/icons/local": ["asset.missing-license"],
      "/p/assets/icons/local/bad.svg": ["asset.unsafe-svg"],
      "/p/assets/fonts/Company.ttf": ["asset.missing-license"],
    });
    expect(ws.assets().diagnostics.get("/p/assets/icons/local")![0]!.hints![0]).toContain(
      '"local": { "license"',
    );
  });

  it("lets licences override Iconify metadata and checks their fields", () => {
    const ws = workspace({
      "assets/icons/brand.json": BRAND,
      "assets/licenses.json": JSON.stringify({
        icons: {
          brand: { license: "LicenseRef-Brand" },
          ghost: { license: "MIT", redistribute: "no" },
        },
        extra: {},
      }),
    });
    expect(ws.assets().registry.pack("brand")!.metadata.license).toBe("LicenseRef-Brand");
    const list = ws.assets().diagnostics.get("/p/assets/licenses.json")!;
    expect(list.map((d) => [d.code, d.severity])).toEqual([
      ["asset.invalid-file", "warning"],
      ["asset.invalid-file", "error"],
      ["asset.invalid-file", "warning"],
    ]);
    expect(list[1]!.message).toContain("`redistribute` must be true or false");
  });

  it("reports duplicate packs, bad prefixes and invalid files", () => {
    const ws = workspace({
      "assets/icons/tabler.json": JSON.stringify({ prefix: "tabler", icons: {} }),
      "assets/icons/Brand/x.svg": ICON,
      "assets/icons/broken.json": "{ not json",
      "assets/fonts/fake.ttf": new Uint8Array([1, 2, 3, 4]),
    });
    expect(codes(ws)).toEqual({
      "/p/assets/icons/tabler.json": ["asset.duplicate-pack"],
      "/p/assets/icons/Brand": ["asset.invalid-file"],
      "/p/assets/icons/broken.json": ["asset.invalid-file"],
      "/p/assets/fonts/fake.ttf": ["asset.invalid-file"],
    });
  });

  it("checks aliases against packs", () => {
    const ws = workspace({}, { icons: { cloud: "oci", tabler: "tabler" } });
    const list = ws.assets().diagnostics.get("/p/project.json")!;
    expect(list.map((d) => d.message)).toEqual([
      "The alias `cloud` names `oci`, which is not an icon pack.",
      "The alias `tabler` is already the name of an icon pack.",
    ]);
  });

  it("reports restricted fonts and compares the lock", () => {
    const ws = workspace({
      "assets/fonts/Locked.ttf": syntheticFont({ family: "Locked", fsType: 2 }),
      "assets/licenses.json": JSON.stringify({ fonts: { Locked: { license: "LicenseRef-L" } } }),
      "assets.lock.json": JSON.stringify({ lockVersion: 1, icons: {}, fonts: {} }),
    });
    // One mismatch per built-in pack the empty lock lacks, and one for the font.
    expect(codes(ws)).toEqual({
      "/p/assets/fonts/Locked.ttf": ["asset.font-restricted"],
      "/p/assets.lock.json": Array.from(
        { length: builtInPacks.length + 1 },
        () => "asset.lock-mismatch",
      ),
    });
  });
});

describe("icon checks in project compilation", () => {
  it("reports unknown packs and icons with suggestions", () => {
    const ws = workspace({
      "a.meltemi": diagram('icon "tabler:servr"'),
      "b.meltemi": diagram('icon "oci:vm"'),
    });
    const a = ws.file("/p/a.meltemi")!.diagnostics;
    expect(a.map((d) => [d.code, d.range.start.line, d.range.start.column])).toEqual([
      ["asset.unknown-icon", 4, 20],
    ]);
    expect(a[0]!.hints).toEqual(["Did you mean `tabler:server`?"]);
    const b = ws.file("/p/b.meltemi")!.diagnostics;
    expect(b.map((d) => d.code)).toEqual(["asset.unknown-pack"]);
    expect(b[0]!.hints![0]).toContain("tabler");
  });

  it("checks icons of classes, rules and themes", () => {
    const ws = workspace({
      "a.meltemi":
        `theme t { class db { icon "tabler:databse" } }\n${diagram('fill "#fff"')}`.replace(
          "diagram d: flow {\n",
          'diagram d: flow {\n  rule data { icon "tabler:database" }\n',
        ),
    });
    const list = ws.file("/p/a.meltemi")!.diagnostics;
    expect(list.map((d) => [d.code, d.range.start.line])).toEqual([["asset.unknown-icon", 1]]);
  });

  it("does not check icons without asset services", () => {
    const host = createMemoryHost({
      "/p/project.json": JSON.stringify({ name: "p", language: "0.2" }),
      "/p/a.meltemi": diagram('icon "nowhere:x"'),
    });
    const ws = new Workspace(host, "/p", { toolVersion: "1.0.0" });
    expect(ws.file("/p/a.meltemi")!.diagnostics).toEqual([]);
  });
});
