import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtInLibraries, type Library } from "./libraries.js";
import { TablerPack, builtInPacks, type IconPack, type TablerReader } from "./packs.js";

/**
 * This module's folder and a `require` beside it, found when first needed: hosts that bundle the
 * library as CommonJS (the VS Code extension) load this module without calling it.
 */
function locate(): { readonly here: string; readonly require: NodeJS.Require } {
  return {
    here: dirname(fileURLToPath(import.meta.url)),
    require: createRequire(import.meta.url),
  };
}

/** The root of `@tabler/icons`, installed next to this module. */
function tablerRoot(require: NodeJS.Require): string | undefined {
  try {
    // The package maps every subpath to `icons/`, so resolve an icon and walk up to its root.
    return dirname(dirname(dirname(require.resolve("@tabler/icons/outline/server.svg"))));
  } catch {
    return undefined;
  }
}

const readText = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/**
 * Reads the bundled assets under Node: `tabler/<file>` from `@tabler/icons`, `icons/logos.json`
 * from `@iconify-json/logos`, the other `icons/<prefix>.json` from this package's `vendor/`
 * folder and `libraries/<id>.json` from its `libraries/` folder.
 */
export function createNodeAssetReader(): (path: string) => string | undefined {
  const { here, require } = locate();
  const tabler = tablerRoot(require);
  let logos: string | undefined;
  try {
    logos = require.resolve("@iconify-json/logos/icons.json");
  } catch {
    logos = undefined;
  }
  return (path) => {
    if (path.startsWith("tabler/")) {
      return readText(tabler && join(tabler, ...path.slice("tabler/".length).split("/")));
    }
    if (path === "icons/logos.json") return readText(logos);
    if (path.startsWith("icons/"))
      return readText(join(here, "..", "vendor", path.slice("icons/".length)));
    if (path.startsWith("libraries/")) {
      return readText(join(here, "..", "libraries", path.slice("libraries/".length)));
    }
    return undefined;
  };
}

/** Reads files of the `@tabler/icons` package installed next to this module. */
export function createNodeTablerReader(): TablerReader {
  const read = createNodeAssetReader();
  return (path) => read(`tabler/${path}`);
}

/** The built-in icon packs, read from the local file system. */
export function createNodeIconPacks(): IconPack[] {
  return builtInPacks(createNodeAssetReader());
}

/** The built-in libraries, read from the local file system. */
export function createNodeLibraries(): Library[] {
  return builtInLibraries(createNodeAssetReader());
}

export { TablerPack };
