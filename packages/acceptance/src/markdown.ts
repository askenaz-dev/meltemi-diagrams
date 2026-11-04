import { writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

/** Writes a generated document formatted as the repository formats its Markdown. */
export async function writeMarkdown(path: string, text: string): Promise<void> {
  const config = (await resolveConfig(path)) ?? {};
  writeFileSync(path, await format(text, { ...config, filepath: path, parser: "markdown" }));
}
