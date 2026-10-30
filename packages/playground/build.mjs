// Builds the playground: a static site in dist/ that runs in a browser with nothing installed.
// Usage: tsx --conditions=@meltemi/diagrams-source build.mjs
import { build } from "esbuild";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_PACKAGES } from "@meltemi/diagrams-fonts";
import { bundledFontFiles } from "@meltemi/diagrams-fonts/node";
import { LANGUAGE_VERSION } from "@meltemi/diagrams-language";
import { TEMPLATES, templateManifest } from "@meltemi/diagrams-project";
import {
  ANONYMOUS_SESSION,
  PAGE_HEADERS,
  agentSetupPolicy,
  contentSecurityPolicy,
  identityOrigin,
} from "./policy.mjs";
import { templateThumbnails } from "./thumbnails.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dist = join(here, "dist");
const assets = join(dist, "assets");
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
// The identity service the page signs in with (`PLAYGROUND_IDENTITY`, default https://id.meltemi.dev).
// Checked first: a wrong value stops the build before it touches dist.
const identity = identityOrigin(process.env.PLAYGROUND_IDENTITY);

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
  legalComments: "none",
  logLevel: "warning",
  platform: "browser",
  target: "es2022",
  minify: true,
};

// The language's words for highlighting, from the grammar VS Code colours with: the lists of
// words that name their scope, not the patterns that colour their captures (`shape icon`).
const grammar = JSON.parse(
  readFileSync(join(repo, "packages", "vscode", "syntaxes", "meltemi.tmLanguage.json"), "utf8"),
);
const words = grammar.repository.keywords.patterns
  .filter((p) => typeof p.name === "string" && typeof p.match === "string")
  .map((p) => ({
    scope: p.name,
    pattern: p.match.replace(/^\\b\(/, "").replace(/\)\\b$/, ""),
  }));

// The page: ES modules, with the ELK worker in its own chunk fetched in parallel.
const page = await build({
  ...common,
  entryPoints: { playground: join(here, "src", "main.ts") },
  outdir: dist,
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  sourcemap: "linked",
  define: {
    __PLAYGROUND_VERSION__: JSON.stringify(version),
    __MELTEMI_WORDS__: JSON.stringify(words),
    PLAYGROUND_IDENTITY: JSON.stringify(identity),
  },
});
const nodeImports = Object.values(page.metafile.outputs)
  .flatMap((o) => o.imports)
  .filter((i) => i.external || i.path.startsWith("node:"));
if (nodeImports.length > 0) {
  throw new Error(`The page imports ${nodeImports.map((i) => i.path).join(", ")}.`);
}

// The runtimes written inline into exported players and catalogs.
const runtimes = [];
for (const [name, entry] of [
  ["player.js", join(repo, "packages", "player", "src", "runtime.ts")],
  ["catalog.js", join(repo, "packages", "catalog", "src", "runtime.ts")],
]) {
  runtimes.push(
    await build({
      ...common,
      entryPoints: [entry],
      outfile: join(assets, name),
      format: "iife",
      logOverride: { "empty-import-meta": "silent" },
    }),
  );
}

// Stylesheets, the page and its icon.
copy(join(repo, "packages", "canvas", "canvas.css"), join(dist, "canvas.css"));
copy(join(here, "playground.css"), join(dist, "playground.css"));
copy(join(repo, "brand", "meltemi-diagrams-glyph.svg"), join(dist, "favicon.svg"));
const policy = contentSecurityPolicy(identity);
writeFileSync(
  join(dist, "index.html"),
  readFileSync(join(here, "index.html"), "utf8")
    .replace("{{policy}}", policy)
    .replaceAll("{{version}}", version),
);
// A static server answers the page's one request to the API with this file: nobody is signed in.
// (The cloud Worker runs first and answers /api/session itself, so it never serves it.)
mkdirSync(join(dist, "api"), { recursive: true });
writeFileSync(join(dist, "api", "session"), ANONYMOUS_SESSION);
// The headers the cloud Worker's assets platform gives every file of the page (`policy.mjs`).
writeFileSync(join(dist, "_headers"), PAGE_HEADERS);

// The agent setup page in its two languages, its stylesheet and the prompt an agent reads, which is
// the command line's own file, copied unchanged (decision 0063).
const agentSetup = join(here, "agent-setup");
const agentSetupPage = (source) =>
  readFileSync(join(agentSetup, source), "utf8")
    .replace("{{policy}}", agentSetupPolicy())
    .replaceAll("{{version}}", version);
mkdirSync(join(dist, "agent-setup"), { recursive: true });
mkdirSync(join(dist, "es", "agent-setup"), { recursive: true });
writeFileSync(join(dist, "agent-setup", "index.html"), agentSetupPage("en.html"));
writeFileSync(join(dist, "es", "agent-setup", "index.html"), agentSetupPage("es.html"));
copy(join(agentSetup, "agent-setup.css"), join(dist, "agent-setup", "agent-setup.css"));
copy(
  join(repo, "packages", "cli", "agent-setup", "prompt.md"),
  join(dist, "agent-setup", "prompt.md"),
);

// Fonts: every file the font library reads. Tabler: the data the icon pack reads.
for (const file of bundledFontFiles()) {
  copy(file.source, join(assets, "fonts", ...file.path.split("/")));
}
const tabler = packageRoot("@tabler/icons", "assets");
for (const file of [
  "package.json",
  "tabler-nodes-outline.json",
  "tabler-nodes-filled.json",
  "icons.json",
]) {
  copy(join(tabler, file), join(assets, "tabler", file));
}

// The built-in provider packs and the logos as `icons/<prefix>.json`, fetched on demand; the
// libraries, fetched at the start.
const assetsPackage = join(repo, "packages", "assets");
for (const file of readdirSync(join(assetsPackage, "vendor"))) {
  copy(join(assetsPackage, "vendor", file), join(assets, "icons", file));
}
const logos = packageRoot("@iconify-json/logos", "assets");
copy(join(logos, "icons.json"), join(assets, "icons", "logos.json"));
for (const file of readdirSync(join(assetsPackage, "libraries"))) {
  copy(join(assetsPackage, "libraries", file), join(assets, "libraries", file));
}

// Templates: the files of `init`'s templates and the project.json it writes.
const templateRoot = join(repo, "packages", "cli", "templates");
const filesOf = (folder) => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(folder, path).split(sep).join("/"));
    }
  };
  walk(folder);
  return found.sort();
};
// Each template carries its title, description and contents (`TEMPLATES`), and the two pictures of
// its card in New project, drawn now from its first diagram (`thumbnails.mjs`).
mkdirSync(join(dist, "templates"), { recursive: true });
const templates = Object.entries(TEMPLATES).map(([name, { title, description, contents }]) => {
  const files = {
    "project.json": templateManifest(name, name, {
      toolVersion: version,
      languageVersion: LANGUAGE_VERSION,
    }),
    ...Object.fromEntries(
      filesOf(join(templateRoot, name)).map((file) => [
        file,
        readFileSync(join(templateRoot, name, ...file.split("/")), "utf8"),
      ]),
    ),
  };
  const pictures = templateThumbnails(name, files, version);
  const thumbnails = { light: `templates/${name}.light.svg`, dark: `templates/${name}.dark.svg` };
  writeFileSync(join(dist, thumbnails.light), pictures.light);
  writeFileSync(join(dist, thumbnails.dark), pictures.dark);
  return { name, title, description, contents, files, thumbnails };
});
writeFileSync(join(dist, "templates.json"), `${JSON.stringify({ version, templates })}\n`);

// Notices: every package whose code is in a bundle, and every package whose files are copied.
const bundled = new Map();
const addPackage = (root) => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (manifest.name.startsWith("@meltemi/")) return;
  bundled.set(manifest.name, { root, manifest });
};
for (const result of [page, ...runtimes]) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const parts = input.split(/[\\/]/);
    const index = parts.lastIndexOf("node_modules");
    if (index < 0) continue;
    const scoped = parts[index + 1].startsWith("@");
    const end = index + (scoped ? 3 : 2);
    const root = join(here, ...parts.slice(0, end));
    if (
      existsSync(join(root, "package.json")) &&
      !bundled.has(parts.slice(index + 1, end).join("/"))
    )
      addPackage(root);
  }
}
for (const name of FONT_PACKAGES) addPackage(packageRoot(name, "fonts"));
addPackage(tabler);
addPackage(logos);

const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENCE", "OFL.txt"];
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

const packages = [...bundled.values()].sort((a, b) =>
  a.manifest.name.localeCompare(b.manifest.name),
);
const licenseOf = (manifest) =>
  typeof manifest.license === "string" ? manifest.license : (manifest.license?.type ?? "unknown");
// The fonts' licence as their packages record it: one name when they share it.
const fontLicenses = [
  ...new Set(FONT_PACKAGES.map((name) => licenseOf(bundled.get(name).manifest))),
];
const fontsUnder =
  fontLicenses.length === 1 && fontLicenses[0] === "OFL-1.1"
    ? "the fonts under the SIL Open Font License 1.1,"
    : `the fonts under ${fontLicenses.join(", ")},`;
writeFileSync(
  join(dist, "NOTICES.md"),
  [
    "# Notices",
    "",
    `Meltemi Diagrams playground ${version}. Meltemi Diagrams is MIT. This site bundles the`,
    `components below, each under its own licence: ${fontsUnder}`,
    "elkjs under the Eclipse Public License 2.0, and the others as stated. The provider icon sets",
    "keep their vendors' terms, repeated below.",
    "",
    ...packages.map(({ root, manifest }) => {
      const file = LICENSE_FILES.map((f) => join(root, f)).find((f) => existsSync(f));
      const text = file
        ? readFileSync(file, "utf8").trim()
        : `See ${manifest.homepage ?? manifest.name}.`;
      return [
        `## ${manifest.name} ${manifest.version}`,
        "",
        `License: ${licenseOf(manifest)}${manifest.homepage ? ` · ${manifest.homepage}` : ""}`,
        ...(notes[manifest.name] ? ["", notes[manifest.name]] : []),
        "",
        "```text",
        text,
        "```",
        "",
      ].join("\n");
    }),
    ...vendorNotices(join(assetsPackage, "vendor")),
  ].join("\n"),
);
writeFileSync(
  join(dist, "notices.json"),
  `${JSON.stringify(
    packages.map(({ manifest }) => ({
      name: manifest.name,
      version: manifest.version,
      license: licenseOf(manifest),
    })),
  )}\n`,
);

// Every bundled component is in the repository's licence inventory (pnpm licenses:inventory).
const inventory = readFileSync(join(repo, "THIRD_PARTY_LICENSES.md"), "utf8");
const missing = packages.filter(({ manifest }) => !inventory.includes(`| ${manifest.name} |`));
if (missing.length > 0) {
  throw new Error(
    `Not in THIRD_PARTY_LICENSES.md: ${missing.map((p) => p.manifest.name).join(", ")}; run pnpm licenses:inventory.`,
  );
}

const size = (file) => `${Math.round(statSync(file).size / 1024)} KB`;
console.log(
  `Built ${relative(repo, dist).split(sep).join("/")}: playground.js (${size(join(dist, "playground.js"))}), ${Object.keys(page.metafile.outputs).filter((o) => o.endsWith(".js")).length} scripts, ${templates.length} templates, ${packages.length} third-party packages noted; signing in at ${identity}.`,
);
