import type { ProjectHost } from "./host.js";
import { dirnamePath } from "./paths.js";

export const MANIFEST_NAME = "project.json";

/**
 * The project root of a file: the nearest folder, starting with the file's own, that contains
 * `project.json`; without one, the file's own folder.
 */
export function findProjectRoot(host: ProjectHost, filePath: string): string {
  const start = dirnamePath(filePath);
  let folder = start;
  for (;;) {
    const entries = host.readDirectory(folder);
    if (entries?.some((e) => e.kind === "file" && e.name === MANIFEST_NAME)) return folder;
    const parent = dirnamePath(folder);
    if (parent === folder) return start;
    folder = parent;
  }
}

/** The root of a folder given to a command: the folder itself or its nearest manifest ancestor. */
export function findFolderRoot(host: ProjectHost, folder: string): string {
  const entries = host.readDirectory(folder);
  if (entries?.some((e) => e.kind === "file" && e.name === MANIFEST_NAME)) return folder;
  const root = findProjectRoot(host, `${folder}/${MANIFEST_NAME}`);
  return root;
}
