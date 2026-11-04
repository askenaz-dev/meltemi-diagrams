/**
 * The JSON files of a project's assets that the editor writes when icons are added: the licence of
 * a pack in `assets/licenses.json` and the icons' entries in `assets/libraries/project.json`.
 */

/** A change of a JSON file of the assets, made by a step over files. */
export type AssetFileChange =
  /** The pack `prefix` gets `licence` in `assets/licenses.json`, unless it has one already. */
  | { readonly kind: "licence"; readonly prefix: string; readonly licence: string }
  /**
   * Items join the category `category` (titled `title`) of the project's library, made when
   * missing; an item whose icon is listed already is not listed again.
   */
  | {
      readonly kind: "libraryItems";
      readonly category: string;
      readonly title: string;
      readonly items: readonly { readonly icon: string; readonly label: string }[];
    };

/** The id and title of the library the editor writes the added icons in. */
export const PROJECT_LIBRARY = { id: "project", title: "Project" } as const;

/** Why a JSON file of the assets cannot be changed: it is not the object it should be. */
export class AssetFileError extends Error {}

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The indentation of a JSON text: that of its first indented line, else two spaces. */
function indentOf(text: string): string | number {
  const line = /\n([ \t]+)\S/.exec(text);
  return line ? line[1]! : 2;
}

/**
 * The text of a JSON file of the assets after `change`: `text` is the file as it is, undefined
 * when there is none yet. The file keeps its indentation and line endings; a change that is made
 * already gives the text back as it was. Throws `AssetFileError` when the file is not the object
 * it should be.
 */
export function changedAssetFile(text: string | undefined, change: AssetFileChange): string {
  let value: unknown;
  if (text === undefined || text.trim() === "") {
    value = change.kind === "licence" ? {} : { ...PROJECT_LIBRARY, categories: [] };
  } else {
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new AssetFileError((error as Error).message);
    }
  }
  if (!isObject(value)) throw new AssetFileError("not an object");
  const before = JSON.stringify(value);
  if (change.kind === "licence") {
    const icons = value.icons ?? {};
    if (!isObject(icons)) throw new AssetFileError("`icons` is not an object");
    if (icons[change.prefix] === undefined) icons[change.prefix] = { license: change.licence };
    value.icons = icons;
  } else {
    const categories = value.categories ?? [];
    if (!Array.isArray(categories)) throw new AssetFileError("`categories` is not a list");
    let category = categories.find((c) => isObject(c) && c.id === change.category) as
      JsonObject | undefined;
    if (!category) {
      category = { id: change.category, title: change.title, items: [] };
      categories.push(category);
    }
    const items = category.items ?? [];
    if (!Array.isArray(items)) throw new AssetFileError("`items` is not a list");
    const listed = new Set(items.filter(isObject).map((item) => item.icon));
    for (const item of change.items) {
      if (!listed.has(item.icon)) items.push({ icon: item.icon, label: item.label });
    }
    category.items = items;
    value.categories = categories;
  }
  if (text !== undefined && JSON.stringify(value) === before) return text;
  const eol = text?.includes("\r\n") ? "\r\n" : "\n";
  const written = JSON.stringify(value, null, text === undefined ? 2 : indentOf(text));
  return `${written.replace(/\n/g, eol)}${eol}`;
}

/**
 * The id of the library category of a pack: its prefix, which a category id may hold when it
 * starts with a letter; else the prefix after `icons-`.
 */
export function libraryCategoryId(prefix: string): string {
  return /^[a-z]/.test(prefix) ? prefix : `icons-${prefix}`;
}
