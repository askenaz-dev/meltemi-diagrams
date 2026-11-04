/**
 * Project paths are POSIX strings: `/` separators, no `.` or `..` segments, an absolute prefix
 * (`/`, or a drive such as `C:/`). Hosts convert native paths with `toProjectPath`.
 */
import { messages } from "./messages/index.js";

/** Converts a native path (backslashes, any drive letter case) to a project path. */
export function toProjectPath(nativePath: string): string {
  return normalizePath(nativePath.replace(/\\/g, "/"));
}

/** The absolute prefix of a path: `/`, `C:/`, or an empty string for relative paths. */
export function rootPrefix(path: string): string {
  const drive = /^[A-Za-z]:\//.exec(path);
  if (drive) return `${drive[0][0]!.toUpperCase()}:/`;
  return path.startsWith("/") ? "/" : "";
}

/** Resolves `.` and `..` segments and repeated separators; never climbs above the prefix. */
export function normalizePath(path: string): string {
  const prefix = rootPrefix(path);
  const segments: string[] = [];
  for (const segment of path.slice(prefix.length).split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
      else if (prefix === "") segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  return prefix + segments.join("/");
}

export function joinPath(base: string, ...parts: string[]): string {
  return normalizePath([base, ...parts].join("/"));
}

/** The folder of a path (`/a/b.meltemi` → `/a`). The parent of a root is the root itself. */
export function dirnamePath(path: string): string {
  const prefix = rootPrefix(path);
  const rest = path.slice(prefix.length);
  const slash = rest.lastIndexOf("/");
  return slash < 0 ? prefix : prefix + rest.slice(0, slash);
}

export function basenamePath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** True when `path` is `root` or lies inside it. */
export function isInside(root: string, path: string): boolean {
  if (path === root) return true;
  const base = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(base);
}

/** The path of `path` relative to `from`, with `..` segments when needed. */
export function relativePath(from: string, path: string): string {
  if (rootPrefix(from) !== rootPrefix(path)) return path;
  const a = from.slice(rootPrefix(from).length).split("/").filter(Boolean);
  const b = path.slice(rootPrefix(path).length).split("/").filter(Boolean);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const up = a.slice(common).map(() => "..");
  return [...up, ...b.slice(common)].join("/") || ".";
}

export type ImportPathCheck =
  { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string };

/**
 * Checks the text of an import path and resolves it against the importing file. Only relative
 * `./` and `../` paths with `/` separators and the `.meltemi` extension are accepted.
 */
export function resolveImportPath(importingFile: string, spec: string): ImportPathCheck {
  // The reasons are written in the interface language of the moment the path is checked.
  const t = messages().paths;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(spec)) return { ok: false, reason: t.importUrl };
  if (spec.startsWith("/")) return { ok: false, reason: t.absolute };
  if (spec.includes("\\")) return { ok: false, reason: t.separator };
  if (!spec.startsWith("./") && !spec.startsWith("../")) return { ok: false, reason: t.relative };
  if (!spec.endsWith(".meltemi")) return { ok: false, reason: t.extension };
  if (spec.split("/").some((segment, i) => segment === "" && i > 0)) {
    return { ok: false, reason: t.emptySegment };
  }
  return { ok: true, path: joinPath(dirnamePath(importingFile), spec) };
}
