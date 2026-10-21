import { readFileSync, readdirSync } from "node:fs";
import type { DirectoryEntry, ProjectHost } from "./host.js";
import { toProjectPath } from "./paths.js";

/** A host over the local file system. Project paths are accepted by `node:fs` on every platform. */
export function createNodeHost(): ProjectHost {
  return {
    readFile(path) {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    readBinary(path) {
      try {
        return new Uint8Array(readFileSync(path));
      } catch {
        return undefined;
      }
    },
    readDirectory(path) {
      try {
        return readdirSync(path, { withFileTypes: true }).flatMap((entry): DirectoryEntry[] => {
          if (entry.isDirectory()) return [{ name: entry.name, kind: "directory" }];
          if (entry.isFile()) return [{ name: entry.name, kind: "file" }];
          return [];
        });
      } catch {
        return undefined;
      }
    },
  };
}

export { toProjectPath };
