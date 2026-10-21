// Builds the extension: two bundles, the assets they read at run time, and the notices of every
// bundled third-party component. Usage: tsx --conditions=@meltemi/diagrams-source build.mjs
import { build } from "esbuild";
import { FONT_PACKAGES } from "@meltemi/diagrams-fonts";
import { bundledFontFiles } from "@meltemi/diagrams-fonts/node";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dist = join(here, "dist");
const assets = join(dist, "assets");

/** A package's root folder, through the link in the node_modules of the package that uses it. */
function packageRoot(name, from) {
  const link = join(repo, "packages", from, "node_modules", ...name.split("/"));
  if (existsSync(join(link, "package.json"))) return realpathSync(link);
  const require = createRequire(join(repo, "packages", from, "package.json"));
  return dirname(require.resolve(`${name}/package.json`));
}

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });

const common = {
  absWorkingDir: here,
  bundle: true,
  conditions: ["@meltemi/diagrams-source"],
  metafile: true,
  sourcemap: true,
  legalComments: "none",
  logLevel: "warning",
  logOverride: { "empty-import-meta": "silent" },
};

const extension = await build({
  ...common,
  entryPoints: [join(here, "src", "extension", "extension.ts")],
  outfile: join(dist, "extension.cjs"),
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
});

const webview = await build({
  ...common,
  entryPoints: [join(here, "src", "webview", "main.ts")],
  outfile: join(dist, "webview.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
});

// The HTML player's runtime, written inline into exported pages.
const player = await build({
  ...common,
  entryPoints: [join(repo, "packages", "player", "src", "runtime.ts")],
  outfile: join(assets, "player.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: false,
  minify: true,
});

// The catalog's runtime (with the player), written inline into catalogs.
const catalog = await build({
  ...common,
  entryPoints: [join(repo, "packages", "catalog", "src", "runtime.ts")],
  outfile: join(assets, "catalog.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: false,
  minify: true,
});

// Fonts: every file the font library reads (complete files, subsets and their tables).
for (const file of bundledFontFiles()) {
  copy(file.source, join(assets, "fonts", ...file.path.split("/")));
}

// The canvas stylesheet, from the canvas package.
copy(join(repo, "packages", "canvas", "canvas.css"), join(dist, "canvas.css"));

// Tabler: the node data the icon pack reads.
const tabler = packageRoot("@tabler/icons", "assets");
for (const file of [
  "package.json",
  "tabler-nodes-outline.json",
  "tabler-nodes-filled.json",
  "icons.json",
]) {
  copy(join(tabler, file), join(assets, "tabler", file));
}

// The built-in provider packs and the logos, read as `icons/<prefix>.json`; the libraries.
const assetsPackage = join(repo, "packages", "assets");
for (const file of readdirSync(join(assetsPackage, "vendor"))) {
  copy(join(assetsPackage, "vendor", file), join(assets, "icons", file));
}
const logos = packageRoot("@iconify-json/logos", "assets");
copy(join(logos, "icons.json"), join(assets, "icons", "logos.json"));
for (const file of readdirSync(join(assetsPackage, "libraries"))) {
  copy(join(assetsPackage, "libraries", file), join(assets, "libraries", file));
}

// ELK: the worker the engine loads synchronously.
const elk = packageRoot("elkjs", "layout-elk");
copy(join(elk, "lib", "elk-worker.min.js"), join(assets, "elk-worker.min.js"));

// Brand file icon and the licence of the extension itself.
copy(join(repo, "brand", "meltemi-diagrams-file-icon.svg"), join(here, "media", "file-icon.svg"));
copy(join(repo, "LICENSE"), join(here, "LICENSE"));

// Notices: every package whose code is in a bundle, and every package whose files are copied.
const bundled = new Map();
const addPackage = (root) => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest.name.startsWith("@meltemi/")) return;
  bundled.set(manifest.name, { root, manifest });
};
for (const result of [extension, webview, player, catalog]) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const parts = input.split(/[\\/]/);
    const index = parts.lastIndexOf("node_modules");
    if (index < 0) continue;
    const scoped = parts[index + 1].startsWith("@");
    const name = parts.slice(index + 1, index + (scoped ? 3 : 2)).join("/");
    // Metafile paths are relative to the working directory, which is this package.
    const root = join(here, ...parts.slice(0, index + (scoped ? 3 : 2)));
    if (existsSync(join(root, "package.json")) && !bundled.has(name)) addPackage(root);
  }
}
for (const name of FONT_PACKAGES) addPackage(packageRoot(name, "fonts"));
addPackage(tabler);
addPackage(logos);
addPackage(elk);

const LICENSE_FILES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "license",
  "LICENCE",
  "OFL.txt",
  "LICENSE.OFL",
];
const notes = {
  elkjs:
    "Used under the Eclipse Public License 2.0, unmodified. Source code: https://github.com/kieler/elkjs (version 0.12.0).",
};

/** A notice section per bundled vendor icon set, from the `info` of its pack file. */
function vendorNotices(vendorFolder) {
  return readdirSync(vendorFolder)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const info = JSON.parse(readFileSync(join(vendorFolder, file), "utf8")).info ?? {};
      const license = info.license ?? {};
      return [
        `## ${info.name ?? file} ${info.version ?? ""}`.trim(),
        "",
        `License: ${license.spdx ?? license.title ?? "see the vendor"}${license.url ? ` · ${license.url}` : ""}`,
        "",
        `Published by ${info.author?.name ?? "the vendor"}${info.author?.url ? ` (${info.author.url})` : ""}; converted unmodified on ${info.converted ?? "an unknown date"}.`,
        "",
        "```text",
        info.terms ?? "",
        "```",
        "",
      ].join("\n");
    });
}

const sections = [...bundled.values()]
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  .map(({ root, manifest }) => {
    const file = LICENSE_FILES.map((f) => join(root, f)).find((f) => existsSync(f));
    const text = file
      ? readFileSync(file, "utf8").trim()
      : `See ${manifest.homepage ?? manifest.name}.`;
    const license =
      typeof manifest.license === "string"
        ? manifest.license
        : (manifest.license?.type ?? "unknown");
    return [
      `## ${manifest.name} ${manifest.version}`,
      "",
      `License: ${license}${manifest.homepage ? ` · ${manifest.homepage}` : ""}`,
      ...(notes[manifest.name] ? ["", notes[manifest.name]] : []),
      "",
      "```text",
      text,
      "```",
      "",
    ].join("\n");
  });
writeFileSync(
  join(here, "THIRD_PARTY_NOTICES.md"),
  [
    "# Third-party notices",
    "",
    "Meltemi Diagrams is MIT. This extension bundles the components below, each under its own",
    "licence. The fonts are under the SIL Open Font License 1.1; elkjs is under the Eclipse Public",
    "License 2.0. The provider icon sets keep their vendors' terms, repeated below.",
    "",
    ...sections,
    ...vendorNotices(join(assetsPackage, "vendor")),
  ].join("\n"),
);
writeFileSync(
  join(dist, "bundled-packages.json"),
  `${JSON.stringify([...bundled.keys()].sort(), null, 2)}\n`,
);

const size = (file) => `${Math.round(readFileSync(file).length / 1024)} KB`;
console.log(
  `Built ${relative(repo, join(dist, "extension.cjs")).split(sep).join("/")} (${size(join(dist, "extension.cjs"))}), webview.js (${size(join(dist, "webview.js"))}), ${bundled.size} third-party packages noted.`,
);
