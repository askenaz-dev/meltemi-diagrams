import { readImage, type ImageResolver, type ResolvedImage } from "@meltemi/diagrams-assets";
import type { ProjectHost } from "./host.js";
import { messages } from "./messages/index.js";
import { dirnamePath, isInside, joinPath, normalizePath, relativePath } from "./paths.js";

/** What reading an image file of the project found. */
export type ImageLookup =
  | { readonly status: "found"; readonly image: ResolvedImage }
  | { readonly status: "missing" }
  | { readonly status: "unsupported"; readonly message: string }
  /** The host cannot read binary files, so the image is not checked. */
  | { readonly status: "unreadable" };

export type ImagePathCheck =
  { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string };

/**
 * Resolves the path of an `image` object against the folder of its `.meltemi` file. The path must
 * be relative, use `/`, have no URL scheme and stay inside the project root.
 */
export function resolveImagePath(root: string, file: string, written: string): ImagePathCheck {
  // The reasons are written in the interface language of the moment the path is checked.
  const t = messages().paths;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(written)) return { ok: false, reason: t.imageUrl };
  if (written.startsWith("/")) return { ok: false, reason: t.absolute };
  if (written.includes("\\")) return { ok: false, reason: t.separator };
  const path = joinPath(dirnamePath(file), written);
  if (!isInside(normalizePath(root), path)) {
    return { ok: false, reason: t.leavesProject(written) };
  }
  return { ok: true, path };
}

/** Reads and caches the image files of a project. */
export class ProjectImages {
  private readonly cache = new Map<string, ImageLookup>();

  constructor(
    private readonly host: ProjectHost,
    private readonly root: string,
  ) {}

  /** The image at a project path, read once until invalidated. */
  lookup(path: string): ImageLookup {
    const key = normalizePath(path);
    let found = this.cache.get(key);
    if (!found) {
      found = this.read(key);
      this.cache.set(key, found);
    }
    return found;
  }

  invalidate(path: string): void {
    this.cache.delete(normalizePath(path));
  }

  /** Forgets every file read, for example once the interface language of their reasons changed. */
  clear(): void {
    this.cache.clear();
  }

  /** A resolver for the images of one file, for `LayoutOptions.images`. */
  resolverFor(file: string): ImageResolver {
    return {
      resolve: (written) => {
        const target = resolveImagePath(this.root, file, written);
        if (!target.ok) return undefined;
        const found = this.lookup(target.path);
        return found.status === "found" ? found.image : undefined;
      },
    };
  }

  private read(path: string): ImageLookup {
    if (!this.host.readBinary) return { status: "unreadable" };
    const bytes = this.host.readBinary(path);
    if (!bytes) return { status: "missing" };
    const result = readImage(bytes);
    return result.ok
      ? { status: "found", image: result.image }
      : { status: "unsupported", message: result.message };
  }
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)$/i;
const SKIPPED_FOLDERS = new Set(["node_modules", ".git", "dist", "out", ".vscode-test"]);

/**
 * The image files of a project as paths relative to `folder` (the folder of a `.meltemi` file),
 * sorted, for completion. Icon packs and fonts under `assets/` are left out; the walk stops after
 * `limit` files.
 */
export function listImageFiles(
  host: ProjectHost,
  root: string,
  folder: string,
  limit = 2000,
): string[] {
  const found: string[] = [];
  const base = normalizePath(root);
  const walk = (path: string, depth: number) => {
    if (found.length >= limit || depth > 8) return;
    for (const entry of host.readDirectory(path) ?? []) {
      const child = joinPath(path, entry.name);
      if (entry.kind === "directory") {
        if (SKIPPED_FOLDERS.has(entry.name) || entry.name.startsWith(".")) continue;
        if (
          child === joinPath(base, "assets", "icons") ||
          child === joinPath(base, "assets", "fonts")
        )
          continue;
        walk(child, depth + 1);
      } else if (IMAGE_FILE.test(entry.name)) {
        found.push(child);
        if (found.length >= limit) return;
      }
    }
  };
  walk(base, 0);
  return found.map((path) => relativePath(normalizePath(folder), path)).sort();
}
