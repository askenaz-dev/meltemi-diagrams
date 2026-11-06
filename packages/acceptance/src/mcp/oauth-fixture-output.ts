// Filesystem metadata only: neither the runner nor cleanup may overwrite their private journal.
import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function aliases(left: string, right: string): boolean {
  const comparable = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);
  const canonical = (path: string): string => {
    const absolute = resolve(path);
    try {
      return realpathSync(absolute);
    } catch (error) {
      const parent = dirname(absolute);
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === absolute) throw error;
      return join(canonical(parent), basename(absolute));
    }
  };
  if (comparable(resolve(left)) === comparable(resolve(right))) return true;
  try {
    if (comparable(canonical(left)) === comparable(canonical(right))) return true;
    // A dangling output-file symlink also needs refusal; its future target is not safe to guess.
    if (lstatSync(left).isSymbolicLink()) return true;
    const first = statSync(left, { bigint: true });
    const second = statSync(right, { bigint: true });
    return first.dev === second.dev && first.ino === second.ino;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    return true;
  }
}

/** True also means an inaccessible path: output must fail closed without replacing private data. */
export function fixtureOutputAliases(file: string, outputs: readonly string[]): boolean {
  let physical = resolve(file);
  try {
    physical = realpathSync(file);
  } catch {
    /* The caller validates the input separately. */
  }
  const protectedFiles = [...new Set([resolve(file), physical])].flatMap((path) => [
    path,
    `${path}.registration.json`,
  ]);
  return outputs.some((output) =>
    protectedFiles.some((privateFile) => aliases(output, privateFile)),
  );
}
