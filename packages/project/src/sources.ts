import type { ProjectHost } from "./host.js";
import { ALWAYS_EXCLUDED, type ProjectManifest } from "./manifest.js";
import { joinPath, relativePath } from "./paths.js";

export const SOURCE_EXTENSION = ".meltemi";

/**
 * Every `.meltemi` file of the project: under the `sources` paths, minus `exclude`, `node_modules`
 * and hidden folders, sorted by path so every run lists them in the same order.
 */
export function listSources(
  host: ProjectHost,
  root: string,
  manifest: ProjectManifest | null,
): string[] {
  const sources = manifest?.sources ?? ["."];
  const exclude = new Set((manifest?.exclude ?? []).map((p) => joinPath(root, p)));
  const isExcluded = (path: string) => {
    if (exclude.has(path)) return true;
    for (const excluded of exclude) if (path.startsWith(`${excluded}/`)) return true;
    return false;
  };
  const found = new Set<string>();
  const visit = (folder: string) => {
    for (const entry of host.readDirectory(folder) ?? []) {
      const path = joinPath(folder, entry.name);
      if (isExcluded(path)) continue;
      if (entry.kind === "directory") {
        const skipped =
          entry.name.startsWith(".") || (ALWAYS_EXCLUDED as readonly string[]).includes(entry.name);
        if (!skipped) visit(path);
      } else if (entry.name.endsWith(SOURCE_EXTENSION)) {
        found.add(path);
      }
    }
  };
  for (const source of sources) {
    const path = joinPath(root, source);
    if (isExcluded(path)) continue;
    if (host.readDirectory(path)) visit(path);
    else if (path.endsWith(SOURCE_EXTENSION) && host.readFile(path) !== undefined) found.add(path);
  }
  return [...found].sort((a, b) => {
    const ra = relativePath(root, a);
    const rb = relativePath(root, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
}
