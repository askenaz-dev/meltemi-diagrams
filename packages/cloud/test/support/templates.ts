// Test support: the `templates.json` the playground's build writes (`packages/playground/build.mjs`),
// made the same way from the same folders, so that a project created from a template starts with the
// files the page would offer. Only the versions the manifest pins are made up.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES, templateManifest } from "@meltemi/diagrams-project";
import type { Harness } from "./index.js";

const TEMPLATE_ROOT = fileURLToPath(new URL("../../../cli/templates/", import.meta.url));

/** The files of a folder by relative path, `/`-separated, sorted. */
function filesOf(folder: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(folder, path).split(sep).join("/"));
    }
  };
  walk(folder);
  return found.sort();
}

export interface TemplateEntry {
  readonly name: string;
  readonly description: string;
  readonly files: Readonly<Record<string, string>>;
}

/** The templates as the build writes them: `project.json` first, then the template's own files. */
export function builtTemplates(): TemplateEntry[] {
  return Object.entries(TEMPLATES).map(([name, description]) => ({
    name,
    description,
    files: {
      "project.json": templateManifest(name, name as keyof typeof TEMPLATES, {
        toolVersion: "1.7.0",
        languageVersion: "0.2",
      }),
      ...Object.fromEntries(
        filesOf(join(TEMPLATE_ROOT, name)).map((file) => [
          file,
          readFileSync(join(TEMPLATE_ROOT, name, ...file.split("/")), "utf8"),
        ]),
      ),
    },
  }));
}

/** One template by name. */
export function builtTemplate(name: string): TemplateEntry {
  const found = builtTemplates().find((template) => template.name === name);
  if (!found) throw new Error(`no template ${name}`);
  return found;
}

/** Makes the harness's assets answer `/templates.json`, as the page's build does. */
export function serveTemplates(h: Harness): void {
  h.assets.files.set("/templates.json", {
    body: `${JSON.stringify({ version: "1.7.0", templates: builtTemplates() })}\n`,
    type: "application/json",
  });
}
