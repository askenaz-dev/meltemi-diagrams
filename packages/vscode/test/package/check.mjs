// Lists the files in meltemi-diagrams.vsix (a zip) and checks what it must and must not contain.
// Usage: tsx --conditions=@meltemi/diagrams-source test/package/check.mjs (run by
// `pnpm vscode:package`).
import { readFileSync } from "node:fs";
import { bundledFontFiles } from "@meltemi/diagrams-fonts/node";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const zip = readFileSync(join(root, "meltemi-diagrams.vsix"));

/** Names of the entries, read from the zip's central directory. */
function entries(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("Not a zip file.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Broken central directory.");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

const names = entries(zip);
const required = [
  "extension/package.json",
  // The words of the contributions, which VS Code picks by its display language.
  "extension/package.nls.json",
  "extension/package.nls.es.json",
  "extension/README.md",
  "extension/LICENSE.txt",
  "extension/THIRD_PARTY_NOTICES.md",
  "extension/dist/extension.cjs",
  "extension/dist/webview.js",
  "extension/dist/canvas.css",
  "extension/dist/assets/player.js",
  "extension/dist/assets/elk-worker.min.js",
  "extension/dist/assets/tabler/tabler-nodes-outline.json",
  "extension/dist/assets/fonts/inter-ui/web/Inter-Regular.woff2",
  "extension/dist/assets/fonts/@fontsource/cascadia-mono/unicode.json",
  "extension/dist/assets/fonts/@fontsource/roboto/unicode.json",
  "extension/dist/assets/fonts/@fontsource/cascadia-mono/files/cascadia-mono-latin-400-normal.woff2",
  "extension/media/icon.png",
  "extension/syntaxes/meltemi.tmLanguage.json",
  "extension/snippets/meltemi.json",
  "extension/language-configuration.json",
  // Every font file the font library reads, so the extension measures as the CLI does.
  ...bundledFontFiles().map((f) => `extension/dist/assets/fonts/${f.path}`),
];
const problems = [];
for (const name of required) {
  // vsce may rename LICENSE to LICENSE.txt and README.md to readme.md.
  const lower = names.map((n) => n.toLowerCase());
  const found =
    lower.includes(name.toLowerCase()) ||
    (name.endsWith("LICENSE.txt") && lower.includes("extension/license"));
  if (!found) problems.push(`missing ${name}`);
}
for (const name of names) {
  if (
    /\.ts$/.test(name) ||
    name.includes("node_modules/") ||
    name.includes("/test/") ||
    name.includes("/src/")
  ) {
    problems.push(`should not contain ${name}`);
  }
}
const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
for (const name of JSON.parse(readFileSync(join(root, "dist", "bundled-packages.json"), "utf8"))) {
  if (!notices.includes(`## ${name} `))
    problems.push(`THIRD_PARTY_NOTICES.md does not name ${name}`);
}
if (!notices.includes("Eclipse Public License"))
  problems.push("THIRD_PARTY_NOTICES.md lacks the EPL text of elkjs");

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`meltemi-diagrams.vsix: ${names.length} files, contents as expected.`);
