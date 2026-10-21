import type { IconPack, IconRegistry } from "./packs.js";

/** A ready-made element of a library: its icon, its name and, when it matters, its kind. */
export interface LibraryItem {
  readonly icon: string;
  readonly label: string;
  readonly kind?: string;
}

export interface LibraryCategory {
  readonly id: string;
  readonly title: string;
  /** How many elements the category holds, known before `items` is read. */
  readonly count: number;
  /** The elements; a pack's category reads its pack the first time. */
  readonly items: readonly LibraryItem[];
}

/** A library of ready-made elements by category, from a file or from a pack's categories. */
export interface Library {
  readonly id: string;
  readonly title: string;
  readonly categories: readonly LibraryCategory[];
  /** Where it comes from: `built-in`, a project or plugin file, or the pack it is read from. */
  readonly source: string;
}

const ID = /^[a-z][a-z0-9-]*$/;
const REFERENCE = /^[a-z0-9][a-z0-9-]*:[A-Za-z0-9_.-]+$/;

export type LibraryParse =
  | { readonly ok: true; readonly library: Library }
  | { readonly ok: false; readonly reason: string };

const kebab = (text: string) =>
  text
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

/** Reads a library file; the reason when it is not one. */
export function parseLibrary(text: string, source: string): LibraryParse {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `not JSON: ${(error as Error).message}` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "the file must hold an object" };
  }
  const object = value as Record<string, unknown>;
  if (typeof object.id !== "string" || !ID.test(object.id)) {
    return { ok: false, reason: "`id` must be a lower-case word" };
  }
  if (typeof object.title !== "string" || object.title.trim() === "") {
    return { ok: false, reason: "`title` must be a non-empty string" };
  }
  if (!Array.isArray(object.categories))
    return { ok: false, reason: "`categories` must be a list" };
  const categories: LibraryCategory[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of object.categories.entries()) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, reason: `category ${index + 1} must be an object` };
    }
    const category = entry as Record<string, unknown>;
    const id = typeof category.id === "string" ? category.id : kebab(String(category.title ?? ""));
    if (!ID.test(id) || ids.has(id)) {
      return { ok: false, reason: `category ${index + 1} needs a unique lower-case id` };
    }
    ids.add(id);
    if (typeof category.title !== "string" || category.title.trim() === "") {
      return { ok: false, reason: `category ${id} needs a title` };
    }
    if (!Array.isArray(category.items)) return { ok: false, reason: `category ${id} needs items` };
    const items: LibraryItem[] = [];
    for (const [i, raw] of category.items.entries()) {
      if (typeof raw !== "object" || raw === null) {
        return { ok: false, reason: `item ${i + 1} of ${id} must be an object` };
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.icon !== "string" || !REFERENCE.test(item.icon)) {
        return { ok: false, reason: `item ${i + 1} of ${id} needs an icon such as \`pack:name\`` };
      }
      if (typeof item.label !== "string" || item.label.trim() === "") {
        return { ok: false, reason: `item ${i + 1} of ${id} needs a label` };
      }
      if (
        item.kind !== undefined &&
        (typeof item.kind !== "string" || !/^[a-z][a-z0-9_]*$/.test(item.kind))
      ) {
        return { ok: false, reason: `item ${i + 1} of ${id} has an invalid kind` };
      }
      items.push({
        icon: item.icon,
        label: item.label,
        ...(typeof item.kind === "string" ? { kind: item.kind } : {}),
      });
    }
    categories.push({ id, title: category.title, count: items.length, items });
  }
  return { ok: true, library: { id: object.id, title: object.title, categories, source } };
}

/** The library of a pack that declares categories: one category per pack category, labelled. */
export function packLibrary(pack: IconPack): Library | undefined {
  const counts = pack.categoryCounts();
  if (counts.size === 0) return undefined;
  const list: LibraryCategory[] = [];
  const ids = new Set<string>();
  for (const [title, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    let id = kebab(title) || "other";
    let n = 2;
    while (ids.has(id)) id = `${kebab(title)}-${n++}`;
    ids.add(id);
    let items: LibraryItem[] | undefined;
    list.push({
      id,
      title,
      count,
      get items(): readonly LibraryItem[] {
        if (items) return items;
        // A lazy pack not read yet has no categories: nothing is kept, so the next ask reads it.
        const names = pack.categories().get(title);
        if (!names) return [];
        items = names.map((name) => ({ icon: `${pack.prefix}:${name}`, label: pack.label(name) }));
        return items;
      },
    });
  }
  return { id: pack.prefix, title: pack.metadata.title, categories: list, source: pack.prefix };
}

/**
 * The libraries of a document: the files first (built-in ones, then the project's and the
 * plugins'), then one per pack of the registry that declares categories and has no file of its
 * own, in prefix order.
 */
export function librariesOf(registry: IconRegistry, files: readonly Library[]): Library[] {
  const libraries = [...files];
  const taken = new Set(files.map((l) => l.id));
  for (const pack of registry.list()) {
    if (taken.has(pack.prefix)) continue;
    const library = packLibrary(pack);
    if (library) libraries.push(library);
  }
  return libraries;
}

/** An item found by a search, with the library and category it belongs to. */
export interface LibraryMatch {
  readonly library: Library;
  readonly category: LibraryCategory;
  readonly item: LibraryItem;
}

/** Items whose label, icon name or pack keywords hold every word of the query, best first. */
export function searchLibraries(
  libraries: readonly Library[],
  registry: IconRegistry,
  query: string,
  limit = 60,
): LibraryMatch[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length === 0) return [];
  const scored: { match: LibraryMatch; score: number }[] = [];
  for (const library of libraries) {
    for (const category of library.categories) {
      for (const item of category.items) {
        const label = item.label.toLowerCase();
        const colon = item.icon.indexOf(":");
        const name = item.icon.slice(colon + 1).toLowerCase();
        const pack = registry.pack(item.icon.slice(0, colon));
        const keywords = pack
          ? pack.keywords(item.icon.slice(colon + 1)).map((k) => k.toLowerCase())
          : [];
        let score = 0;
        for (const word of words) {
          if (label === word || name === word) score += 4;
          else if (label.startsWith(word) || name.startsWith(word)) score += 3;
          else if (label.includes(word) || name.includes(word)) score += 2;
          else if (keywords.some((k) => k.includes(word))) score += 1;
          else {
            score = 0;
            break;
          }
        }
        if (score > 0) scored.push({ match: { library, category, item }, score });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score || a.match.item.label.localeCompare(b.match.item.label));
  return scored.slice(0, limit).map((s) => s.match);
}

/** The ids of the libraries built into the tool, read as `libraries/<id>.json`. */
export const BUILT_IN_LIBRARIES = ["tech"] as const;

/** The built-in library files, through a reader of the bundled assets. */
export function builtInLibraries(read: (path: string) => string | undefined): Library[] {
  const libraries: Library[] = [];
  for (const id of BUILT_IN_LIBRARIES) {
    const text = read(`libraries/${id}.json`);
    if (text === undefined) continue;
    const parsed = parseLibrary(text, "built-in");
    if (parsed.ok) libraries.push(parsed.library);
  }
  return libraries;
}
