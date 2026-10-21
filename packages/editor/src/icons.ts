import {
  drawableNames,
  geometrySvg,
  humanise,
  searchLibraries,
  type IconLookup,
  type IconRegistry,
  type Library,
  type LibraryMatch,
} from "@meltemi/diagrams-assets";
import type { GroupItem, SceneItem } from "@meltemi/diagrams-layout";
import type { Element, FlowDiagram } from "@meltemi/diagrams-model";
import type { DiagramView, DocumentAnalysis } from "./analysis.js";
import type { IconChoiceInfo, IconGroupInfo } from "./canvas/protocol.js";
import { iconChoices } from "./services/completion.js";

/** How many icons the icon picker shows for one query, at most. */
export const ICON_RESULTS = 60;

/** The library whose first category the icon picker shows before anything is typed. */
const TECHNOLOGY = "tech";

/** A query that reads as an icon reference, `pack:name`. */
const REFERENCE = /^[a-z0-9][a-z0-9-]*:[A-Za-z0-9_.-]+$/;

/**
 * The kinds whose icon takes the five positions, an icon size and a label position, and which the
 * icon picker and icon drops give an icon: they draw a box around their text.
 */
const ICON_KINDS: ReadonlySet<string> = new Set(["node", "decision", "data", "box"]);

/** Whether an element of a kind takes the icon fields, in flow and free diagrams. */
export function iconKind(kind: string, diagram: FlowDiagram): boolean {
  return (diagram.type === "flow" || diagram.type === "free") && ICON_KINDS.has(kind);
}

/** Whether the icon picker and icon drops write `style <id> { icon }` on an element. */
export function takesIcon(diagram: FlowDiagram, element: Element): boolean {
  return iconKind(element.kind, diagram);
}

/** The icon written in the own style statements of a target, or null. */
export function writtenIcon(
  diagram: FlowDiagram,
  target: string,
  kind: "element" | "relation",
): string | null {
  let icon: string | null = null;
  for (const entry of diagram.styles) {
    if (entry.target !== target || entry.targetKind !== kind) continue;
    const value = entry.properties.icon;
    if (typeof value === "string") icon = value;
  }
  return icon;
}

/**
 * Whether a reference names an icon the packs draw: `found`; `loading` while the pack that may
 * have it is not there yet (a browser fetches a built-in pack on first use, and the lookup starts
 * it); else `missing`: an unknown pack or icon, or one the sanitiser refuses, which no thumbnail
 * will ever show.
 */
export function iconStatus(
  icons: IconRegistry | undefined,
  reference: string,
): "found" | "loading" | "missing" {
  return statusOf(icons?.lookup(reference));
}

function statusOf(lookup: IconLookup | undefined): "found" | "loading" | "missing" {
  if (lookup?.status === "found") return "found";
  return lookup?.status === "unknown-icon" && lookup.pack.loaded === false ? "loading" : "missing";
}

/**
 * A 24 px thumbnail of an icon, null while its pack is not there yet, with `missing` when the
 * reference names no icon the packs can draw.
 */
export function iconThumbnail(
  icons: IconRegistry | undefined,
  reference: string,
): Pick<IconChoiceInfo, "svg" | "missing"> {
  const lookup = icons?.lookup(reference);
  if (lookup?.status === "found") return { svg: geometrySvg(lookup.icon.geometry, 24, 24) };
  return statusOf(lookup) === "loading" ? { svg: null } : { svg: null, missing: true };
}

/**
 * A readable name of an icon: the pack's own name for it (`AWS Lambda`), else its name as it is
 * written (`database`), which is what one types to find it again.
 */
export function iconLabel(icons: IconRegistry | undefined, reference: string): string {
  const colon = reference.indexOf(":");
  const name = reference.slice(colon + 1);
  const label = icons?.pack(reference.slice(0, colon))?.label(name);
  return label !== undefined && label !== humanise(name) ? label : name;
}

/**
 * An icon as the picker and the inspector show it: its reference, name and thumbnail, or that it
 * is missing.
 */
export function iconChoice(
  icons: IconRegistry | undefined,
  reference: string,
  label = iconLabel(icons, reference),
): IconChoiceInfo {
  return { reference, label, ...iconThumbnail(icons, reference) };
}

/** A library read from a pack's categories, whose items are that pack's icons. */
function fromPack(library: Library, icons: IconRegistry): boolean {
  return library.source === library.id && icons.pack(library.id)?.prefix === library.id;
}

/** The words of a query, lower case. */
const wordsOf = (query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "");

/**
 * The items of the categories whose title holds every word of the query, such as the Databases of
 * the Technology library for `database`: in library and category order.
 */
function categoryMatches(libraries: readonly Library[], query: string): LibraryMatch[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const found: LibraryMatch[] = [];
  for (const library of libraries) {
    for (const category of library.categories) {
      const title = category.title.toLowerCase();
      if (!words.every((w) => title.includes(w))) continue;
      for (const item of category.items) found.push({ library, category, item });
    }
  }
  return found;
}

/** An icon found for a query, with its group; its thumbnail is drawn once it is kept. */
interface Entry {
  readonly group: Omit<IconGroupInfo, "items">;
  readonly reference: string;
  readonly label: string;
}

/**
 * The icon picker's answer to a query, in groups with a title each, `limit` icons at most:
 *
 * - a typed `pack:name` that names an icon comes first, in its pack's group;
 * - then the icons of the packs whose name or keywords hold the query (`iconChoices`), with those
 *   whose readable name does (the libraries read from packs' categories), grouped by pack;
 * - then the items of the libraries of files (the built-in Technology library, the project's and
 *   the plugins') whose label, icon name or keywords hold it, then the items of the categories
 *   whose title does, grouped by library with their own labels.
 *
 * Each icon is offered once: a library item keeps its label over a pack's name. The packs and the
 * libraries each get half of `limit` when both have more, the other's room otherwise. An empty
 * query gives the first category of the Technology library (or of the first library), or without
 * libraries the first icons of Tabler (or of the first pack).
 *
 * Only icons the packs can draw are offered, and those of a pack still on its way (without their
 * thumbnail yet): never one whose thumbnail cannot exist, such as a library item naming an unknown
 * icon or a logo the sanitiser refuses, which would fail once written.
 */
export function iconGroups(
  analysis: DocumentAnalysis,
  libraries: readonly Library[],
  query: string,
  limit = ICON_RESULTS,
): IconGroupInfo[] {
  const icons = analysis.icons;
  if (!icons) return [];
  const offered = (entry: Entry) => iconStatus(icons, entry.reference) !== "missing";
  const packGroup = (reference: string): Entry["group"] => {
    const prefix = reference.slice(0, reference.indexOf(":"));
    const pack = icons.pack(prefix);
    return { id: pack?.prefix ?? prefix, kind: "pack", title: pack?.metadata.title ?? prefix };
  };
  const packEntry = (reference: string): Entry => ({
    group: packGroup(reference),
    reference,
    label: iconLabel(icons, reference),
  });
  const libraryEntry = (match: LibraryMatch): Entry => ({
    group: { id: match.library.id, kind: "library", title: match.library.title },
    reference: match.item.icon,
    label: match.item.label,
  });
  const files = libraries.filter((l) => !fromPack(l, icons));
  const wanted = query.trim();
  if (wanted === "") {
    const library = files.find((l) => l.id === TECHNOLOGY) ?? files[0];
    const category = library?.categories.find((c) => c.items.length > 0);
    if (library && category) {
      return grouped(
        icons,
        category.items
          .map((item) => libraryEntry({ library, category, item }))
          .filter(offered)
          .slice(0, limit),
      );
    }
    // The general-purpose pack, when the project has it.
    const pack = icons.pack("tabler") ?? icons.list()[0];
    return grouped(
      icons,
      (pack ? drawableNames(pack, limit) : []).map((name) => packEntry(`${pack!.prefix}:${name}`)),
    );
  }
  const seen = new Set<string>();
  const fresh = (entry: Entry) => {
    if (seen.has(entry.reference)) return false;
    seen.add(entry.reference);
    return true;
  };
  const typed =
    REFERENCE.test(wanted) && icons.lookup(wanted).status === "found"
      ? packEntry(wanted)
      : undefined;
  if (typed) fresh(typed);
  // The libraries' items first, so that an icon both offer keeps the library's label.
  const items = [...searchLibraries(files, icons, wanted, limit), ...categoryMatches(files, wanted)]
    .map(libraryEntry)
    .filter((entry) => offered(entry) && fresh(entry));
  const packs = [
    ...iconChoices(analysis, wanted, limit).map(packEntry),
    ...searchLibraries(
      libraries.filter((l) => fromPack(l, icons)),
      icons,
      wanted,
      limit,
    ).map((m) => packEntry(m.item.icon)),
  ].filter((entry) => offered(entry) && fresh(entry));
  const room = limit - (typed ? 1 : 0);
  const packCount = Math.min(packs.length, Math.max(Math.ceil(room / 2), room - items.length));
  return grouped(icons, [
    ...(typed ? [typed] : []),
    ...packs.slice(0, packCount),
    ...items.slice(0, room - packCount),
  ]);
}

/** Entries in groups with their thumbnails, the groups in the order of their first entry. */
function grouped(icons: IconRegistry, entries: readonly Entry[]): IconGroupInfo[] {
  const groups = new Map<string, { group: Entry["group"]; items: IconChoiceInfo[] }>();
  for (const { group, reference, label } of entries) {
    const key = `${group.kind}:${group.id}`;
    let found = groups.get(key);
    if (!found) groups.set(key, (found = { group, items: [] }));
    found.items.push(iconChoice(icons, reference, label));
  }
  return [...groups.values()].map(({ group, items }) => ({ ...group, items }));
}

/**
 * The side an element's icon is drawn with, in pixels, read from the drawing: the scale of its
 * icon in the scene by the icon's view box and its pack's optical scale (none for `shape icon`,
 * whose icon fills its square). Undefined when it draws no icon.
 */
export function drawnIconSize(
  view: DiagramView,
  icons: IconRegistry | undefined,
  id: string,
): number | undefined {
  const scene = view.layout?.scene;
  if (!scene || !icons) return undefined;
  const group = elementGroup(scene.items, id);
  const icon = group ? iconGroup(group.items) : undefined;
  const scale = icon?.transform ? /scale\(([-+\d.e]+)/.exec(icon.transform)?.[1] : undefined;
  const resolved = icon ? icons.resolve(icon.id) : undefined;
  if (!resolved || scale === undefined) return undefined;
  const { width, height } = resolved.geometry.viewBox;
  const optical = view.layout?.shapes?.get(id) === "icon" ? 1 : resolved.scale;
  const side = (Number(scale) * Math.max(width, height)) / optical;
  return Number.isFinite(side) ? Math.round(side) : undefined;
}

/** The group the scene draws an element in. */
function elementGroup(items: readonly SceneItem[], id: string): GroupItem | undefined {
  for (const item of items) {
    if (item.kind !== "group") continue;
    if (item.role === "element" && item.id === id) return item;
    const found = elementGroup(item.items, id);
    if (found) return found;
  }
  return undefined;
}

/** The icon an element's group draws itself, not one of another element drawn inside it. */
function iconGroup(items: readonly SceneItem[]): GroupItem | undefined {
  for (const item of items) {
    if (item.kind !== "group" || item.role === "element") continue;
    if (item.role === "icon") return item;
    const found = iconGroup(item.items);
    if (found) return found;
  }
  return undefined;
}
