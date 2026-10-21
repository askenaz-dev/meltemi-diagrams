// The release check: every package built from clean, packed, its tarball checked, the CLI installed
// from the tarballs into an empty folder (never from the registry) and run through the main
// journey, and the VS Code extension packaged. Nothing is published. Usage: pnpm release:check
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { REPO_ROOT, TOOL_VERSION } from "./corpus.js";
import { readTarball } from "./tarball.js";

export const RELEASE_DIR = join(REPO_ROOT, "release");
const SOURCE_CONDITION = "@meltemi/diagrams-source";

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  bin?: Record<string, string>;
  exports?: unknown;
  types?: string;
  dependencies?: Record<string, string>;
}

export interface StepResult {
  readonly step: string;
  readonly passed: boolean;
  readonly lines: readonly string[];
}

/** Runs pnpm: the one running this script when there is one, else the one on the path. */
function pnpm(args: readonly string[], cwd: string): SpawnSyncReturns<string> {
  const execPath = process.env.npm_execpath;
  const options = {
    cwd,
    encoding: "utf8" as const,
    maxBuffer: 256 * 1024 * 1024,
    // Messages in English, whatever the machine's language.
    env: { ...process.env, MELTEMI_LANG: "en" },
  };
  return execPath && /pnpm/i.test(execPath)
    ? spawnSync(process.execPath, [execPath, ...args], options)
    : spawnSync("pnpm", args, { ...options, shell: process.platform === "win32" });
}

const output = (run: SpawnSyncReturns<string>) =>
  `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n");

const manifestOf = (folder: string) =>
  JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as Manifest;

/** The packages of the workspace, public ones first by folder name. */
function packages(): { folder: string; manifest: Manifest }[] {
  return readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && existsSync(join(REPO_ROOT, "packages", e.name, "package.json")),
    )
    .map((e) => {
      const folder = join(REPO_ROOT, "packages", e.name);
      return { folder, manifest: manifestOf(folder) };
    });
}

/** Every file path an `exports` map names, without the development condition. */
function exportedPaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== SOURCE_CONDITION)
    .flatMap(([, v]) => exportedPaths(v));
}

/** What is wrong with a packed tarball, if anything. */
export function tarballProblems(files: ReadonlyMap<string, Buffer>, version: string): string[] {
  const problems: string[] = [];
  const packed = files.get("package/package.json");
  if (!packed) return ["no package.json"];
  const manifest = JSON.parse(packed.toString("utf8")) as Manifest;
  if (manifest.version !== version) problems.push(`version ${manifest.version}, not ${version}`);
  for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
    if (range.startsWith("workspace:")) problems.push(`dependency ${name} is ${range}`);
  }
  if (JSON.stringify(manifest.exports ?? {}).includes(SOURCE_CONDITION)) {
    problems.push("exports name the source condition");
  }
  const named = [
    ...exportedPaths(manifest.exports),
    ...Object.values(manifest.bin ?? {}),
    ...(manifest.types ? [manifest.types] : []),
  ];
  for (const path of named) {
    if (path.includes("*")) continue;
    if (!files.has(`package/${path.replace(/^\.\//, "")}`)) problems.push(`missing ${path}`);
  }
  if (!files.has("package/README.md")) problems.push("no README.md");
  if (!files.has("package/LICENSE")) problems.push("no LICENSE");
  for (const path of files.keys()) {
    if (/^package\/(src|test)\//.test(path)) problems.push(`ships ${path}`);
  }
  return problems;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The installed CLI's journey through a project, in `folder`. */
function journey(folder: string, cliBin: string): string[] {
  const lines: string[] = [];
  const mdg = (...args: string[]) => {
    const run = spawnSync(process.execPath, [cliBin, ...args], {
      cwd: folder,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // The journey reads English messages, whatever the machine's language.
      env: { ...process.env, MELTEMI_LANG: "en" },
    });
    if (run.status !== 0) {
      throw new Error(`meltemi-diagrams ${args.join(" ")} exited ${run.status}: ${output(run)}`);
    }
    return run.stdout.trim();
  };
  const exists = (path: string) => {
    if (!existsSync(join(folder, path))) throw new Error(`${path} was not written`);
    return statSync(join(folder, path)).size;
  };
  const version = mdg("--version");
  if (version !== TOOL_VERSION) throw new Error(`--version prints ${version}`);
  lines.push(`--version prints ${version}`);
  mdg("init", "shop", "--template", "purchase");
  lines.push(`init wrote ${readdirSync(join(folder, "shop"), { recursive: true }).length} entries`);
  const validated = mdg("validate", "shop");
  if (!/0 errors, 0 warnings/.test(validated)) throw new Error(`validate: ${validated}`);
  lines.push(`validate: ${validated}`);
  mdg("export", "shop", "--out", "out/svg");
  const svgs = readdirSync(join(folder, "out", "svg"), { recursive: true }).filter((f) =>
    String(f).endsWith(".svg"),
  );
  if (svgs.length === 0) throw new Error("export wrote no SVG");
  lines.push(`export: ${svgs.length} SVG files`);
  const slide = "shop/diagrams/executive.meltemi";
  mdg("export", slide, "--format", "png", "--out", "out/slide.png");
  lines.push(`export --format png: ${exists("out/slide.png")} bytes`);
  mdg("export", slide, "--format", "pdf", "--out", "out/slide.pdf");
  lines.push(`export --format pdf: ${exists("out/slide.pdf")} bytes`);
  if (findFfmpeg()) {
    const story = "shop/stories/purchase.meltemi";
    mdg(
      "export",
      story,
      "--story",
      "purchase",
      "--format",
      "mp4",
      "--duration",
      "2s",
      "--out",
      "out/story.mp4",
    );
    lines.push(`export --format mp4: ${exists("out/story.mp4")} bytes`);
  } else lines.push("export --format mp4: skipped, FFmpeg is not installed");
  mdg("build", "catalog", "shop");
  lines.push(`build catalog: ${exists("shop/catalog/index.html")} bytes`);
  writeFileSync(
    join(folder, "legacy.mmd"),
    "flowchart LR\n  shop[Web shop] --> orders[(Orders)]\n",
  );
  mdg("import", "legacy.mmd");
  exists("legacy.meltemi");
  const imported = mdg("validate", "legacy.meltemi");
  lines.push(`import of a Mermaid file: ${imported}`);
  return lines;
}

export function runReleaseCheck(): StepResult[] {
  const results: StepResult[] = [];
  const step = (name: string, run: () => string[]) => {
    const start = performance.now();
    process.stdout.write(`${name}… `);
    try {
      const lines = run();
      console.log(`✓ (${((performance.now() - start) / 1000).toFixed(0)} s)`);
      for (const line of lines) console.log(`    ${line}`);
      results.push({ step: name, passed: true, lines });
      return true;
    } catch (error) {
      const lines = (error as Error).message.split("\n");
      console.log("✗");
      for (const line of lines) console.log(`    ${line}`);
      results.push({ step: name, passed: false, lines });
      return false;
    }
  };
  const all = packages();
  const publics = all.filter((p) => !p.manifest.private);
  const tarballs: { name: string; file: string }[] = [];

  const built = step("Build every package from clean", () => {
    for (const { folder } of all) {
      rmSync(join(folder, "dist"), { recursive: true, force: true });
      rmSync(join(folder, "tsconfig.build.tsbuildinfo"), { force: true });
    }
    const run = pnpm(["-r", "build"], REPO_ROOT);
    if (run.status !== 0) throw new Error(`pnpm -r build failed:\n${output(run)}`);
    return [`${all.length} packages built`];
  });
  if (!built) return results;

  const packed = step("Pack and check every public package", () => {
    rmSync(RELEASE_DIR, { recursive: true, force: true });
    mkdirSync(RELEASE_DIR, { recursive: true });
    const lines: string[] = [];
    const problems: string[] = [];
    for (const { folder, manifest } of publics) {
      const run = pnpm(["pack", "--pack-destination", RELEASE_DIR], folder);
      if (run.status !== 0) throw new Error(`pnpm pack ${manifest.name} failed:\n${output(run)}`);
      const file = join(
        RELEASE_DIR,
        `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`,
      );
      if (!existsSync(file))
        throw new Error(`${manifest.name}: ${relative(REPO_ROOT, file)} was not written`);
      const bytes = readFileSync(file);
      const files = readTarball(bytes);
      for (const problem of tarballProblems(files, TOOL_VERSION))
        problems.push(`${manifest.name}: ${problem}`);
      tarballs.push({ name: manifest.name, file });
      lines.push(`${manifest.name}: ${files.size} files, ${(bytes.length / 1024).toFixed(0)} KB`);
    }
    if (problems.length > 0) throw new Error(problems.join("\n"));
    return lines;
  });
  if (!packed) return results;

  const scratch = join(tmpdir(), `meltemi-release-${process.pid}`);
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  try {
    // Every Meltemi package comes from its tarball (the overrides), never from the registry.
    // Third-party packages come from the store when it has the version resolved, else from the
    // registry: an offline install resolves ranges from cached registry metadata, which a fresh
    // machine or a CI runner does not have.
    const installed = step("Install the CLI from the tarballs", () => {
      const overrides = Object.fromEntries(
        tarballs.map((t) => [t.name, `file:${t.file.replaceAll("\\", "/")}`]),
      );
      writeFileSync(
        join(scratch, "package.json"),
        JSON.stringify(
          {
            name: "release-check",
            private: true,
            dependencies: { "@meltemi/diagrams-cli": overrides["@meltemi/diagrams-cli"] },
            pnpm: { overrides },
          },
          null,
          2,
        ),
      );
      const run = pnpm(["install", "--prefer-offline"], scratch);
      if (run.status !== 0) throw new Error(`pnpm install failed:\n${output(run)}`);
      const bins = ["meltemi-diagrams", "mdg"].filter((bin) =>
        readdirSync(join(scratch, "node_modules", ".bin")).some(
          (f) => f === bin || f.startsWith(`${bin}.`),
        ),
      );
      if (bins.length !== 2) throw new Error(`commands installed: ${bins.join(", ") || "none"}`);
      const packages = readdirSync(join(scratch, "node_modules", ".pnpm")).filter((d) =>
        d.startsWith("@meltemi"),
      );
      return [
        `${packages.length} Meltemi packages and their dependencies installed`,
        "commands meltemi-diagrams and mdg",
      ];
    });
    if (installed) {
      const cliBin = join(scratch, "node_modules", "@meltemi", "diagrams-cli", "dist", "bin.js");
      step("Run the installed CLI through the main journey", () => journey(scratch, cliBin));
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  step("Package the VS Code extension", () => {
    const run = pnpm(["vscode:package"], REPO_ROOT);
    if (run.status !== 0) throw new Error(`pnpm vscode:package failed:\n${output(run)}`);
    const vsix = join(REPO_ROOT, "packages", "vscode", "meltemi-diagrams.vsix");
    const target = join(RELEASE_DIR, `meltemi-diagrams-${TOOL_VERSION}.vsix`);
    copyFileSync(vsix, target);
    return [
      `${relative(REPO_ROOT, target).replaceAll("\\", "/")}: ${(statSync(target).size / 1024 / 1024).toFixed(2)} MB`,
    ];
  });

  step("Write the release manifest", () => {
    const files = readdirSync(RELEASE_DIR)
      .filter((f) => f.endsWith(".tgz") || f.endsWith(".vsix"))
      .sort()
      .map((file) => {
        const bytes = readFileSync(join(RELEASE_DIR, file));
        return { file, bytes: bytes.length, sha256: sha256(bytes) };
      });
    writeFileSync(
      join(RELEASE_DIR, "manifest.json"),
      `${JSON.stringify({ version: TOOL_VERSION, files }, null, 2)}\n`,
    );
    return [`release/manifest.json: ${files.length} files`];
  });
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = runReleaseCheck();
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log(`\nThe release check failed: ${failed.map((r) => r.step).join("; ")}.`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nRelease ${TOOL_VERSION} is ready in release/. Publish it as RELEASING.md says:\n` +
        '  for tarball in ./release/*.tgz; do npm publish "$tarball" --access public; done\n' +
        `  vsce publish --packagePath release/meltemi-diagrams-${TOOL_VERSION}.vsix\n` +
        `  ovsx publish release/meltemi-diagrams-${TOOL_VERSION}.vsix`,
    );
  }
}
