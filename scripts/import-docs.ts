// Writes docs/import/{mermaid,plantuml}.md and their Spanish versions in docs/es/import/ from the
// importers' coverage tables. Run with `pnpm import:docs`; a test in packages/import fails when the
// files are out of date.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coverageMarkdown } from "../packages/import/src/index.ts";

const folders = {
  en: join(process.cwd(), "docs", "import"),
  es: join(process.cwd(), "docs", "es", "import"),
} as const;
for (const [locale, folder] of Object.entries(folders) as ["en" | "es", string][]) {
  mkdirSync(folder, { recursive: true });
  for (const format of ["mermaid", "plantuml"] as const) {
    const file = join(folder, `${format}.md`);
    writeFileSync(file, coverageMarkdown(format, locale));
    console.log(`Wrote ${file}`);
  }
}
