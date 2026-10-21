/**
 * What a path of a cloud project must be before it may be written under a folder (`cli-cloud`,
 * "Pull"): one rule for `pull` and for every command that reads a cloud project into a folder's
 * place (`review --base cloud`).
 *
 * The cloud already refuses every path that breaks its path rule, so what arrives is what the
 * service kept; the command line does not take that on trust, because the folder is the person's
 * and a project can be written by anybody who edits it. A path is refused when
 *
 * - it is not already in canonical form (`isCleanPath`: relative, `/`-separated, no `..`, nothing
 *   hidden, no `:`, at most 12 names of at most 100 plain ASCII characters);
 * - a name could not be written safely on Windows: it ends with a dot or a space (Windows drops
 *   both, so `a.` would be `a`) or is a device name (`con`, `nul`, `com1`, `lpt1`, ... with or
 *   without an extension);
 * - it resolves outside the folder (`insideFolder`), which the rule above already rules out and
 *   which is checked again on the real, resolved path anyway;
 * - in a set of paths, it differs from another only in letter case (one overwrites the other on
 *   Windows and macOS), or is a file where another path needs a folder.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import { isCleanPath } from "@meltemi/diagrams-project";

/** Why a path is not safe: the cloud's rule, or a name Windows cannot keep. */
export type PathProblem = "rule" | "windows-name" | "windows-dot";
/** Why a path is not safe in a set of paths. */
export type SetProblem = "letter-case" | "file-and-folder";

/** The device names Windows reserves, with or without an extension. */
const DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Why one path cannot be written safely anywhere, or undefined when it can. */
export function pathProblem(path: string): PathProblem | undefined {
  if (!isCleanPath(path)) return "rule";
  for (const name of path.split("/")) {
    if (/[. ]$/.test(name)) return "windows-dot";
    if (DEVICE_NAME.test(name)) return "windows-name";
  }
  return undefined;
}

/**
 * The paths of a set that cannot be written beside the others, each with why: the later of two
 * paths that differ only in letter case, and a path that is also the folder of another one.
 */
export function setProblems(paths: Iterable<string>): Map<string, SetProblem> {
  const sorted = [...new Set(paths)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const problems = new Map<string, SetProblem>();
  const seen = new Set<string>();
  const folders = new Set<string>();
  for (const path of sorted) {
    const lower = path.toLowerCase();
    if (seen.has(lower)) problems.set(path, "letter-case");
    seen.add(lower);
    const names = lower.split("/");
    for (let end = 1; end < names.length; end++) folders.add(names.slice(0, end).join("/"));
  }
  for (const path of sorted) {
    if (!problems.has(path) && folders.has(path.toLowerCase())) {
      problems.set(path, "file-and-folder");
    }
  }
  return problems;
}

/**
 * A path the cloud answered, safe to print: control characters and line separators (an escape
 * sequence in a name would reach the person's terminal) are written as `\uXXXX`. A path that
 * passes the path rule has none.
 */
export function printablePath(path: string): string {
  return path.replace(
    /[\p{Cc}\p{Zl}\p{Zp}]/gu,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** A path the service made for the loser of a name collision: `<path>~<id>`, 16 base32 characters. */
const LOSER = /^(.+)~[a-z2-7]{16}$/;

/**
 * The paths among `paths` that are the losers of a name collision: those the service lists as
 * `shown` in `collisions`, and any `<path>~<id>` whose `<path>` is a valid path. The service shows
 * such a path in its answers but never keeps one; it is never written and never sent.
 */
export function collisionLosers(
  paths: Iterable<string>,
  collisions: readonly unknown[],
): Set<string> {
  const losers = new Set<string>();
  for (const collision of collisions) {
    const shown =
      typeof collision === "object" && collision !== null
        ? (collision as { shown?: unknown }).shown
        : undefined;
    if (typeof shown === "string") losers.add(shown);
  }
  for (const path of paths) {
    const stem = LOSER.exec(path)?.[1];
    if (stem !== undefined && isCleanPath(stem)) losers.add(path);
  }
  return losers;
}

/**
 * Where a project path lands under a folder, as a native path, or undefined when the resolved
 * result is not inside the folder (or is the folder itself). `folder` is absolute.
 */
export function insideFolder(folder: string, path: string): string | undefined {
  const target = resolve(folder, ...path.split("/"));
  const from = relative(folder, target);
  if (from === "" || from === ".." || from.startsWith(`..${sep}`) || isAbsolute(from)) {
    return undefined;
  }
  return target;
}
