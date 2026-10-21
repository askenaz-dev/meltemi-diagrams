import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the repository root. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CORPUS_ROOT = join(REPO_ROOT, "corpus");

export interface CorpusFile {
  /** Path relative to `corpus/`, with forward slashes, e.g. `valid/edge/crlf.meltemi`. */
  readonly name: string;
  readonly path: string;
  readonly text: string;
}

/** Every `.meltemi` file under `corpus/<folder>`, sorted by name. Text is read byte-exact as UTF-8. */
export function corpusFiles(folder: string): CorpusFile[] {
  const root = join(CORPUS_ROOT, folder);
  const files: CorpusFile[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry.endsWith(".meltemi")) {
        files.push({
          name: relative(CORPUS_ROOT, path).split("\\").join("/"),
          path,
          text: readFileSync(path, "utf8"),
        });
      }
    }
  };
  visit(root);
  return files;
}

/** Deterministic pseudo-random generator for property tests. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
