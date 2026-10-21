import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";

const SCOPE = "@meltemi/diagrams-";
const SOURCE_CONDITION = "@meltemi/diagrams-source";

// Former names, assembled so this file does not match itself.
const OLD_SCOPE = "@" + "dac/";
const OLD_COMMAND = "stu" + "dio";
const LEFTOVERS = [
  OLD_SCOPE,
  `pnpm ${OLD_COMMAND}`,
  `${OLD_COMMAND} validate`,
  `${OLD_COMMAND} export`,
  `${OLD_COMMAND} import`,
];

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".ts",
  ".mjs",
  ".js",
  ".json",
  ".yaml",
  ".yml",
  ".meltemi",
  ".svg",
  ".html",
  ".txt",
]);

/** Folders that record history or are generated, and the change that performs the rename. */
const SKIPPED = new Set([
  "node_modules",
  "dist",
  ".git",
  // What the repository ignores (.gitignore): downloads, local state and generated output.
  ".vscode-test",
  ".test-output",
  ".wrangler",
  "release",
  "mi-prueba",
  "openspec/changes/archive",
  "openspec/changes/cli-and-package-names",
  "docs/decisions",
]);

function textFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(REPO_ROOT, path).split("\\").join("/");
    if (SKIPPED.has(entry) || SKIPPED.has(rel)) continue;
    if (statSync(path).isDirectory()) found.push(...textFiles(path));
    else if (TEXT_EXTENSIONS.has(extname(entry))) found.push(rel);
  }
  return found;
}

const packageFolders = readdirSync(join(REPO_ROOT, "packages")).filter((name) =>
  statSync(join(REPO_ROOT, "packages", name)).isDirectory(),
);

describe("package names", () => {
  it.each(packageFolders)("packages/%s is named in the Meltemi scope", (folder) => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "packages", folder, "package.json"), "utf8"),
    );
    if (folder === "vscode") {
      // VS Code extensions cannot carry an npm scope; the extension is private.
      expect(manifest).toMatchObject({
        name: "meltemi-diagrams",
        publisher: "meltemi",
        private: true,
      });
      expect(manifest.exports).toBeUndefined();
      return;
    }
    if (folder === "playground" || folder === "acceptance" || folder === "cloud") {
      // The playground is a static site, the acceptance suite a set of runners and the cloud
      // package a Worker, not libraries: private, with nothing to import.
      expect(manifest).toMatchObject({ name: `${SCOPE}${folder}`, private: true });
      expect(manifest.exports).toBeUndefined();
      return;
    }
    expect(manifest.name).toBe(`${SCOPE}${folder}`);
    expect(Object.keys(manifest.exports["."])).toContain(SOURCE_CONDITION);
  });

  it("leaves no former scope or command name in the repository", () => {
    const offenders: string[] = [];
    for (const file of textFiles(REPO_ROOT)) {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const leftover of LEFTOVERS) {
        if (text.includes(leftover)) offenders.push(`${file}: ${leftover}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("built-in theme names", () => {
  // Former theme names, assembled so this file does not match itself.
  const FORMER = ["meltemi", "stu" + "dio"].flatMap((family) =>
    ["light", "dark"].map((variant) => `${family}.${variant}`),
  );
  /** The change that renames the themes describes the former names. */
  const RENAME = "openspec/changes/styles-and-themes/";

  it("leaves no former theme name in the repository", () => {
    const offenders: string[] = [];
    for (const file of textFiles(REPO_ROOT)) {
      if (file.startsWith(RENAME)) continue;
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const name of FORMER) {
        if (text.includes(name)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
