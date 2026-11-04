// Sets the product version everywhere it is written: the version of every package of the
// workspace (the extension included), the CLI's version constant, which the bundles inline, and the
// files that quote it (`VERSION_MENTIONS`).
// The language version and the model and renderer API versions are separate contracts and do not
// move with it (docs/language/policy.md).
// Usage: pnpm release:version <x.y.z>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI_SOURCE = join(root, "packages", "cli", "src", "cli.ts");
const CONSTANT = /export const CLI_VERSION = "[^"]*";/;

/**
 * Files that quote the product version besides the manifests: the purchase example is the project
 * template, which requires the version that wrote it, the corpus' expected message for a project
 * that requires a later version names the running one, and the skill's `metadata` names the
 * version it teaches.
 */
export const VERSION_MENTIONS = [
  {
    path: join(root, "examples", "purchase", "project.json"),
    pattern: /("meltemi-diagrams":\s*"\^)\d+\.\d+\.\d+(")/,
  },
  {
    path: join(root, "corpus", "projects", "invalid", "project.tool-version", "expected.json"),
    pattern: /(but this is version )\d+\.\d+\.\d+(\.)/,
  },
  // The skill's front matter says which product version it teaches (decision 0063).
  {
    path: join(root, "skills", "meltemi-diagrams", "SKILL.md"),
    pattern: /(^ {2}version: )\d+\.\d+\.\d+(\r?)$/m,
  },
];

/** The manifests whose version is the product's. */
export function versionedManifests(repoRoot = root) {
  return readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(repoRoot, "packages", entry.name, "package.json"));
}

/** Writes `version` into every manifest and the CLI's constant; returns the files changed. */
export function setVersion(version, repoRoot = root) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`"${version}" is not a version of the form x.y.z.`);
  }
  const changed = [];
  for (const path of versionedManifests(repoRoot)) {
    const text = readFileSync(path, "utf8");
    const next = text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
    if (JSON.parse(next).version !== version) throw new Error(`${path} has no product version.`);
    if (next !== text) {
      writeFileSync(path, next);
      changed.push(path);
    }
  }
  for (const mention of VERSION_MENTIONS) {
    const path = join(repoRoot, mention.path.slice(root.length + 1));
    const { pattern } = mention;
    const text = readFileSync(path, "utf8");
    if (!pattern.test(text)) throw new Error(`${path} no longer quotes the version.`);
    const next = text.replace(pattern, `$1${version}$2`);
    if (next !== text) {
      writeFileSync(path, next);
      changed.push(path);
    }
  }
  const cliSource = join(repoRoot, CLI_SOURCE.slice(root.length + 1));
  const source = readFileSync(cliSource, "utf8");
  if (!CONSTANT.test(source)) throw new Error(`${CLI_SOURCE} has no CLI_VERSION constant.`);
  const next = source.replace(CONSTANT, `export const CLI_VERSION = "${version}";`);
  if (next !== source) {
    writeFileSync(cliSource, next);
    changed.push(cliSource);
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: pnpm release:version <x.y.z>");
    process.exit(2);
  }
  try {
    const changed = setVersion(version);
    for (const path of changed)
      console.log(`  ${path.slice(root.length + 1).replaceAll("\\", "/")}`);
    console.log(`\nSet version ${version} in ${changed.length} files.`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
