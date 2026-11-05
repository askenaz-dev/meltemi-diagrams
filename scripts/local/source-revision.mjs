import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./settings.mjs";

// A source archive has no .git. Hash the supplied source, rather than claiming an unknown SHA.
const ignored = new Set([
  ".git",
  "node_modules",
  "dist",
  ".wrangler",
  ".test-output",
  ".vscode-test",
  "openspec",
  ".claude",
  ".codex",
  ".agents",
  "coverage",
  "release",
  "backups",
  "source-revision.txt",
]);
const hash = createHash("sha256");
async function walk(folder, relative = "") {
  const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  for (const entry of entries) {
    if (
      ignored.has(entry.name) ||
      entry.name.startsWith(".dev.vars") ||
      entry.name.startsWith(".env") ||
      entry.name.endsWith(".tsbuildinfo")
    )
      continue;
    const path = join(folder, entry.name);
    const name = `${relative}${entry.name}`;
    if (entry.isDirectory()) await walk(path, `${name}/`);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      hash.update(`${name}\0${bytes.length}\0`);
      hash.update(bytes);
    }
  }
}
await walk(ROOT);
console.log(hash.digest("hex"));
