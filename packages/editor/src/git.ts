import { spawnSync } from "node:child_process";
import {
  joinPath,
  normalizePath,
  toProjectPath,
  type DirectoryEntry,
  type ProjectHost,
} from "@meltemi/diagrams-project";
import { reviewMessages } from "./messages/review.js";

function git(cwd: string, args: readonly string[]): { ok: boolean; out: Buffer; error: string } {
  const result = spawnSync("git", args, { cwd, windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) return { ok: false, out: Buffer.alloc(0), error: result.error.message };
  return {
    ok: result.status === 0,
    out: result.stdout ?? Buffer.alloc(0),
    error: (result.stderr ?? Buffer.alloc(0)).toString("utf8").trim(),
  };
}

/**
 * A host that reads the files of `folder` as they were at a Git revision: the folder listing of
 * the revision, and the contents of its blobs, read on demand (decision 0028). A message, in the
 * interface language, when the folder is not in a Git repository or the revision is unknown.
 */
export function gitRevisionHost(folder: string, revision: string): ProjectHost | string {
  const t = reviewMessages().git;
  const top = git(folder, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return t.notARepository;
  const root = toProjectPath(top.out.toString("utf8").trim());
  const known = git(root, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
  if (!known.ok) return t.unknownRevision(revision);
  const listing = git(root, ["ls-tree", "-r", "-z", "--name-only", revision]);
  if (!listing.ok) return t.cannotList(revision, listing.error);
  const files = new Set(
    listing.out
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((path) => joinPath(root, path)),
  );
  const blobs = new Map<string, Buffer | undefined>();
  const read = (path: string): Buffer | undefined => {
    const key = normalizePath(path);
    if (!files.has(key)) return undefined;
    if (!blobs.has(key)) {
      const shown = git(root, ["show", `${revision}:${key.slice(root.length + 1)}`]);
      blobs.set(key, shown.ok ? shown.out : undefined);
    }
    return blobs.get(key);
  };
  return {
    readFile: (path) => read(path)?.toString("utf8"),
    readBinary: (path) => {
      const bytes = read(path);
      return bytes ? new Uint8Array(bytes) : undefined;
    },
    readDirectory: (path) => {
      const folderPath = normalizePath(path);
      const prefix = `${folderPath}/`;
      const entries = new Map<string, DirectoryEntry["kind"]>();
      for (const file of files) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash < 0) entries.set(rest, "file");
        else entries.set(rest.slice(0, slash), "directory");
      }
      return entries.size === 0 ? undefined : [...entries].map(([name, kind]) => ({ name, kind }));
    },
  };
}
