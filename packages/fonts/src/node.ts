import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BUNDLED_FAMILIES, FONT_PACKAGES } from "./families.js";
import { FontLibrary, type FontFileReader } from "./library.js";

/** The installed folders of the font packages, by package name; missing packages are left out. */
function packageRoots(): Map<string, string> {
  const require = createRequire(import.meta.url);
  const roots = new Map<string, string>();
  for (const name of FONT_PACKAGES) {
    try {
      roots.set(name, dirname(require.resolve(`${name}/package.json`)));
    } catch {
      // The package is missing; its files read as undefined and text falls back to estimates.
    }
  }
  return roots;
}

/** The package of a package-relative path, and the rest of the path. */
function splitPath(path: string): { name: string; rest: string[] } {
  const parts = path.split("/");
  const scoped = parts[0]!.startsWith("@");
  return { name: parts.slice(0, scoped ? 2 : 1).join("/"), rest: parts.slice(scoped ? 2 : 1) };
}

/** Reads bundled font files from the Fontsource packages installed next to this module. */
export function createNodeFontReader(): FontFileReader {
  const roots = packageRoots();
  return (path) => {
    const { name, rest } = splitPath(path);
    const root = roots.get(name);
    if (!root) return undefined;
    try {
      return new Uint8Array(readFileSync(join(root, ...rest)));
    } catch {
      return undefined;
    }
  };
}

/** A font library over the bundled fonts on the local file system. */
export function createNodeFontLibrary(): FontLibrary {
  return new FontLibrary(createNodeFontReader());
}

/** A file the font library reads: its package-relative path and the installed file. */
export interface BundledFontFile {
  /** The path the library reads, such as `@fontsource/inter/unicode.json`. */
  readonly path: string;
  readonly source: string;
}

/**
 * Every file the font library reads for the bundled families: the complete files, the script
 * subsets of the bundled weights and the Fontsource subset tables (`unicode.json`), sorted by
 * path. Hosts that ship the fonts with their bundle copy exactly these.
 */
export function bundledFontFiles(): BundledFontFile[] {
  const roots = packageRoots();
  const files = new Map<string, string>();
  const add = (path: string) => {
    const { name, rest } = splitPath(path);
    const root = roots.get(name);
    if (root) files.set(path, join(root, ...rest));
  };
  for (const family of BUNDLED_FAMILIES) {
    for (const path of Object.values(family.complete ?? {})) add(path);
    const { package: name, prefix } = family.subsets;
    const root = roots.get(name);
    if (!root) continue;
    add(`${name}/unicode.json`);
    const weights = family.weights.join("|");
    const subset = new RegExp(`^${prefix}-[a-z0-9-]+-(?:${weights})-normal\\.woff2$`);
    for (const file of readdirSync(join(root, "files")).filter((f) => subset.test(f))) {
      add(`${name}/files/${file}`);
    }
  }
  return [...files]
    .map(([path, source]) => ({ path, source }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
