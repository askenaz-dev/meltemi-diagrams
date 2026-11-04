// The files of a template, for `POST /api/projects { template }`. The Worker cannot read a folder, and
// the playground's build already writes what it needs: `templates.json`, the files of `init`'s
// templates with the `project.json` each pins (`packages/playground/build.mjs`). That build is the
// Worker's static assets, so the same bytes the page offers are the ones a cloud project starts from.

import { TEMPLATES, isCleanPath } from "@meltemi/diagrams-project";
import { fail } from "./errors.js";

/** The name of a template `init` and the playground know, or undefined. */
export function templateName(value: unknown): keyof typeof TEMPLATES | undefined {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value)
    ? (value as keyof typeof TEMPLATES)
    : undefined;
}

/**
 * The files of a template by path, `project.json` included, read from the playground's build
 * (`/templates.json` of the assets). A build that does not hold the template, or holds one that is
 * not what the build writes, is a fault of this deployment: `internal`, logged without detail.
 */
export async function templateFiles(
  assets: { fetch(request: Request): Promise<Response> },
  origin: string,
  name: keyof typeof TEMPLATES,
): Promise<Record<string, string>> {
  const broken = (why: string): never => {
    console.error(`cloud: templates.json ${why}`);
    throw fail("internal");
  };
  const response = await assets.fetch(new Request(new URL("/templates.json", origin)));
  if (!response.ok) return broken(`answered ${response.status}`);
  let set: unknown;
  try {
    set = JSON.parse(await response.text());
  } catch {
    return broken("is not JSON");
  }
  const templates = (set as { templates?: unknown } | null)?.templates;
  if (!Array.isArray(templates)) return broken("holds no list of templates");
  const found = (templates as unknown[]).find(
    (entry) => (entry as { name?: unknown } | null)?.name === name,
  ) as { files?: unknown } | undefined;
  const files = found?.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    return broken(`holds no template ${name}`);
  }
  const out: [string, string][] = [];
  for (const [path, text] of Object.entries(files)) {
    if (typeof text !== "string" || !isCleanPath(path)) {
      return broken(`holds a file of ${name} that is not one`);
    }
    out.push([path, text]);
  }
  // `fromEntries` defines own keys, so a file named `__proto__` is a file.
  return Object.fromEntries(out);
}
