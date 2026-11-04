import { basenamePath, dirnamePath, normalizePath } from "./paths.js";

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: "file" | "directory";
}

/**
 * Access to the files of a project. Paths are project paths (see `paths.ts`). Methods return
 * `undefined` when the file or folder cannot be read; they never throw.
 */
export interface ProjectHost {
  readFile(path: string): string | undefined;
  readDirectory(path: string): readonly DirectoryEntry[] | undefined;
  /** The bytes of a file, for fonts and other binary assets. Hosts without it cannot read fonts. */
  readBinary?(path: string): Uint8Array | undefined;
}

export type FileLookup =
  | { readonly status: "found"; readonly path: string }
  | { readonly status: "case-mismatch"; readonly path: string; readonly actual: string }
  | { readonly status: "missing"; readonly path: string };

/**
 * Looks a file up by its exact name in its folder, so that a path that differs only in letter
 * case is reported the same way on case-insensitive and case-sensitive file systems.
 */
export function lookupFile(host: ProjectHost, path: string): FileLookup {
  const name = basenamePath(path);
  const entries = host.readDirectory(dirnamePath(path));
  if (!entries) return { status: "missing", path };
  if (entries.some((e) => e.kind === "file" && e.name === name)) return { status: "found", path };
  const other = entries.find(
    (e) => e.kind === "file" && e.name.toLowerCase() === name.toLowerCase(),
  );
  if (other) {
    return { status: "case-mismatch", path, actual: `${dirnamePath(path)}/${other.name}` };
  }
  return { status: "missing", path };
}

/**
 * A host over in-memory files, for tests, the playground and editors without a file system. Text
 * files are strings; binary files are byte arrays.
 */
export function createMemoryHost(
  files: Readonly<Record<string, string | Uint8Array>>,
): ProjectHost {
  const contents = new Map<string, string | Uint8Array>();
  for (const [path, content] of Object.entries(files)) contents.set(normalizePath(path), content);
  return {
    readFile: (path) => {
      const content = contents.get(normalizePath(path));
      return typeof content === "string" ? content : undefined;
    },
    readBinary: (path) => {
      const content = contents.get(normalizePath(path));
      if (content === undefined) return undefined;
      return typeof content === "string" ? new TextEncoder().encode(content) : content;
    },
    readDirectory: (path) => {
      const folder = normalizePath(path);
      const prefix = folder.endsWith("/") ? folder : `${folder}/`;
      const entries = new Map<string, DirectoryEntry["kind"]>();
      for (const file of contents.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash < 0) entries.set(rest, "file");
        else entries.set(rest.slice(0, slash), "directory");
      }
      if (entries.size === 0) return undefined;
      return [...entries].map(([name, kind]) => ({ name, kind }));
    },
  };
}
