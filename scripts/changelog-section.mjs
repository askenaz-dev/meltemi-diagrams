// The notes of a GitHub release: the section of CHANGELOG.md for one version, without its
// heading, as the release workflow attaches it.
//
//   node scripts/changelog-section.mjs <version> [CHANGELOG.md]

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The text under `## <version>` (or `## <version> (<date>)`) up to the next `## `, trimmed. */
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}(\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [version, file = "CHANGELOG.md"] = process.argv.slice(2);
  const section = version ? changelogSection(readFileSync(file, "utf8"), version) : undefined;
  if (!section) {
    console.error(`CHANGELOG.md has no section for ${version ?? "(no version given)"}`);
    process.exit(1);
  }
  process.stdout.write(`${section}\n`);
}
