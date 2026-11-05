// The files the renderer object carries, named as the engine reads them, and the installed file
// each one is (a path below `packages/cloud/node_modules`, or of the assets package). The Worker
// bundles them as data and text modules (`renderer-bundle.js`, generated from this list by
// `scripts/renderer-bundle.ts`); the Node tests read the same files from disk, so the tests draw
// with exactly what the object holds. The engine itself is `@meltemi/diagrams-mcp/preview`'s.

import { RASTER_FACES } from "@meltemi/diagrams-mcp/preview";

/** A file of the bundle: the path the engine asks for, and where it is installed. */
export interface BundledFile {
  readonly path: string;
  /** `node_modules/<package>/<file>` below `packages/cloud`, or `../assets/<file>`. */
  readonly source: string;
}

/**
 * The assets the engine's reader serves (`tabler/<file>`, `icons/<prefix>.json` and
 * `libraries/<id>.json`, as `createNodeAssetReader` of `@meltemi/diagrams-assets/node` reads them):
 * Tabler's icons without its search tags, the five provider packs and the built-in library.
 */
export const ASSET_FILES: readonly BundledFile[] = [
  { path: "tabler/package.json", source: "node_modules/@tabler/icons/package.json" },
  {
    path: "tabler/tabler-nodes-filled.json",
    source: "node_modules/@tabler/icons/tabler-nodes-filled.json",
  },
  {
    path: "tabler/tabler-nodes-outline.json",
    source: "node_modules/@tabler/icons/tabler-nodes-outline.json",
  },
  { path: "icons/index.json", source: "../assets/vendor/index.json" },
  { path: "icons/aws.json", source: "../assets/vendor/aws.json" },
  { path: "icons/azure.json", source: "../assets/vendor/azure.json" },
  { path: "icons/gcp.json", source: "../assets/vendor/gcp.json" },
  { path: "icons/kubernetes.json", source: "../assets/vendor/kubernetes.json" },
  { path: "icons/logos.json", source: "node_modules/@iconify-json/logos/icons.json" },
  { path: "libraries/tech.json", source: "../assets/libraries/tech.json" },
];

/** The faces a PNG is drawn with (WOFF, made TrueType in memory), by their package paths. */
export const RASTER_FILES: readonly BundledFile[] = RASTER_FACES.map((face) => ({
  path: face.path,
  source: `node_modules/${face.path}`,
}));
