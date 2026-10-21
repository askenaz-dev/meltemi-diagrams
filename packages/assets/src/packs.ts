import { drawScale, median, opticalRatio, type IconGeometry } from "./icon.js";
import { messages } from "./messages/index.js";
import {
  iconFromNodes,
  sanitizeBody,
  sanitizeSvg,
  type IconNode,
  type IconProblem,
  type IconResult,
} from "./sanitize.js";

/** Version, origin and licence of an icon pack or font, as recorded in catalogs and locks. */
export interface AssetMetadata {
  readonly title: string;
  readonly version: string | null;
  /** `built-in`, or the project path of the pack file or folder. */
  readonly source: string;
  /** SPDX identifier or `LicenseRef-` name; null when unknown. */
  readonly license: string | null;
  readonly author: string | null;
  readonly url: string | null;
  readonly redistribute: boolean;
  /** The vendor's terms of use, repeated by the hosts' notices. */
  readonly terms?: string;
}

export const PACK_PREFIX = /^[a-z0-9][a-z0-9-]*$/;

export interface IconPack {
  readonly prefix: string;
  readonly metadata: AssetMetadata;
  /** Icon names in sorted order, aliases included. */
  names(): readonly string[];
  has(name: string): boolean;
  /** The icon, or the reason it cannot be used. Results are cached. */
  icon(name: string): IconResult | undefined;
  /** Words to search besides the name: tags and categories. */
  keywords(name: string): readonly string[];
  /** A readable name of an icon: the pack's label, else the name in words. */
  label(name: string): string;
  /** The pack's categories with their icon names, for libraries; empty without categories. */
  categories(): ReadonlyMap<string, readonly string[]>;
  /** The categories with how many icons each holds; known without reading a lazy pack. */
  categoryCounts(): ReadonlyMap<string, number>;
  /** Overrides the computed optical ratio, from licence metadata. */
  readonly opticalScale?: number;
  /**
   * False while the pack's files have not arrived (a browser fetches a built-in pack on first use),
   * so an icon it does not have yet may still come; absent or true once its icons are there.
   */
  readonly loaded?: boolean;
}

/** A name in words: `api-gateway-2` is `Api Gateway 2`. */
export function humanise(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** An icon ready to draw: its geometry and the size of its view box relative to the icon square. */
export interface ResolvedIcon {
  readonly reference: string;
  readonly pack: IconPack;
  readonly name: string;
  readonly geometry: IconGeometry;
  /** View box side as a share of `iconSize`, from the pack's optical ratio. */
  readonly scale: number;
}

/** Looks icons up for the layout. */
export interface IconResolver {
  resolve(reference: string): ResolvedIcon | undefined;
}

abstract class BasePack implements IconPack {
  private readonly cache = new Map<string, IconResult>();
  abstract readonly prefix: string;
  abstract readonly metadata: AssetMetadata;
  abstract names(): readonly string[];
  abstract has(name: string): boolean;
  protected abstract load(name: string): IconResult | undefined;
  keywords(_name: string): readonly string[] {
    return [];
  }

  label(name: string): string {
    return humanise(name);
  }

  categories(): ReadonlyMap<string, readonly string[]> {
    return new Map();
  }

  categoryCounts(): ReadonlyMap<string, number> {
    return new Map([...this.categories()].map(([title, names]) => [title, names.length]));
  }

  icon(name: string): IconResult | undefined {
    const cached = this.cache.get(name);
    if (cached) return cached;
    if (!this.has(name)) return undefined;
    const result = this.load(name);
    if (result) this.cache.set(name, result);
    return result;
  }
}

/** Reads a file of the `@tabler/icons` package by its path inside the package. */
export type TablerReader = (path: string) => string | undefined;

const TABLER_VIEW_BOX = { x: 0, y: 0, width: 24, height: 24 };
const TABLER_OUTLINE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};
const TABLER_FILLED = { fill: "currentColor", stroke: "none" };

/** The built-in Tabler pack: outline icons by name, filled ones with the `-filled` suffix. */
export class TablerPack extends BasePack {
  readonly prefix = "tabler";
  readonly metadata: AssetMetadata;
  /** Whether the outline icons were there when the pack was made. */
  readonly loaded: boolean;
  private readonly outline: Readonly<Record<string, readonly IconNode[]>>;
  private readonly filled: Readonly<Record<string, readonly IconNode[]>>;
  private sorted: string[] | undefined;
  private tags: Map<string, string[]> | undefined;

  constructor(private readonly read: TablerReader) {
    super();
    const json = <T>(path: string, fallback: T): T => {
      const text = read(path);
      if (text === undefined) return fallback;
      try {
        return JSON.parse(text) as T;
      } catch {
        return fallback;
      }
    };
    this.outline = json("tabler-nodes-outline.json", {});
    this.loaded = Object.keys(this.outline).length > 0;
    this.filled = json("tabler-nodes-filled.json", {});
    const manifest = json<{ version?: string }>("package.json", {});
    this.metadata = {
      title: "Tabler Icons",
      version: manifest.version ?? null,
      source: "built-in",
      license: "MIT",
      author: "Paweł Kuna",
      url: "https://tabler.io/icons",
      redistribute: true,
    };
  }

  names(): readonly string[] {
    this.sorted ??= [
      ...Object.keys(this.outline),
      ...Object.keys(this.filled).map((n) => `${n}-filled`),
    ].sort();
    return this.sorted;
  }

  has(name: string): boolean {
    if (Object.hasOwn(this.outline, name)) return true;
    return name.endsWith("-filled") && Object.hasOwn(this.filled, name.slice(0, -"-filled".length));
  }

  protected load(name: string): IconResult | undefined {
    if (Object.hasOwn(this.outline, name)) {
      return iconFromNodes(this.outline[name]!, TABLER_VIEW_BOX, TABLER_OUTLINE);
    }
    const base = name.slice(0, -"-filled".length);
    return iconFromNodes(this.filled[base]!, TABLER_VIEW_BOX, TABLER_FILLED);
  }

  override keywords(name: string): readonly string[] {
    this.readTags();
    return this.tags!.get(name.replace(/-filled$/, "")) ?? [];
  }

  /** Tabler's categories, from `icons.json`; the outline icons only. */
  override categories(): ReadonlyMap<string, readonly string[]> {
    this.readTags();
    return this.byCategory!;
  }

  private byCategory: Map<string, string[]> | undefined;

  private readTags(): void {
    if (this.tags) return;
    this.tags = new Map();
    this.byCategory = new Map();
    const text = this.read("icons.json");
    if (text === undefined) return;
    try {
      const entries = JSON.parse(text) as Record<string, { tags?: unknown[]; category?: string }>;
      for (const [icon, entry] of Object.entries(entries)) {
        const words = (entry.tags ?? []).map(String);
        if (entry.category) {
          words.push(entry.category);
          if (Object.hasOwn(this.outline, icon)) {
            const list = this.byCategory.get(entry.category) ?? [];
            list.push(icon);
            this.byCategory.set(entry.category, list);
          }
        }
        this.tags.set(icon, words);
      }
    } catch {
      // Without tags, search matches names only and the pack has no categories.
    }
  }
}

/** An Iconify JSON icon set, already parsed. */
export interface IconifyJson {
  readonly prefix: string;
  readonly icons: Readonly<Record<string, IconifyIcon>>;
  readonly aliases?: Readonly<Record<string, { readonly parent: string } & Partial<IconifyIcon>>>;
  readonly width?: number;
  readonly height?: number;
  readonly left?: number;
  readonly top?: number;
  readonly categories?: Readonly<Record<string, readonly string[]>>;
  /** A Meltemi extension: a readable name per icon, for libraries and pickers. */
  readonly labels?: Readonly<Record<string, string>>;
  readonly info?: {
    readonly name?: string;
    readonly version?: string;
    readonly author?: { readonly name?: string; readonly url?: string };
    readonly license?: { readonly title?: string; readonly spdx?: string; readonly url?: string };
    readonly palette?: boolean;
    /** Meltemi extensions: the vendor's terms, and whether exports may carry the icons freely. */
    readonly terms?: string;
    readonly redistribute?: boolean;
  };
}

export interface IconifyIcon {
  readonly body: string;
  readonly width?: number;
  readonly height?: number;
  readonly left?: number;
  readonly top?: number;
}

/** A project pack in the Iconify JSON format. */
export class IconifyPack extends BasePack {
  readonly prefix: string;
  readonly metadata: AssetMetadata;
  readonly opticalScale?: number;
  private readonly sorted: string[];
  private readonly categoryOf = new Map<string, string[]>();

  constructor(
    private readonly json: IconifyJson,
    source: string,
    overrides: Partial<AssetMetadata> & { opticalScale?: number } = {},
  ) {
    super();
    this.prefix = json.prefix;
    const info = json.info ?? {};
    this.metadata = {
      title: overrides.title ?? info.name ?? json.prefix,
      version: overrides.version ?? info.version ?? null,
      source,
      license: overrides.license ?? info.license?.spdx ?? info.license?.title ?? null,
      author: overrides.author ?? info.author?.name ?? null,
      url: overrides.url ?? info.license?.url ?? info.author?.url ?? null,
      redistribute: overrides.redistribute ?? info.redistribute ?? true,
      ...(info.terms ? { terms: info.terms } : {}),
    };
    if (overrides.opticalScale !== undefined) this.opticalScale = overrides.opticalScale;
    this.sorted = [...Object.keys(json.icons), ...Object.keys(json.aliases ?? {})].sort();
    for (const [category, names] of Object.entries(json.categories ?? {})) {
      for (const name of names) {
        const list = this.categoryOf.get(name) ?? [];
        list.push(category);
        this.categoryOf.set(name, list);
      }
    }
  }

  names(): readonly string[] {
    return this.sorted;
  }

  has(name: string): boolean {
    return Object.hasOwn(this.json.icons, name) || Object.hasOwn(this.json.aliases ?? {}, name);
  }

  protected load(name: string): IconResult | undefined {
    let icon = this.json.icons[name];
    let override: Partial<IconifyIcon> = {};
    const seen = new Set<string>();
    let current = name;
    while (!icon && Object.hasOwn(this.json.aliases ?? {}, current) && !seen.has(current)) {
      seen.add(current);
      const alias = this.json.aliases![current]!;
      override = { ...alias, ...override };
      current = alias.parent;
      icon = this.json.icons[current];
    }
    // Problems are written in the interface language of the moment the icon is read.
    if (!icon) {
      return {
        ok: false,
        problem: { reason: "invalid", message: messages().icons.aliasWithoutParent(name) },
      };
    }
    const width = override.width ?? icon.width ?? this.json.width ?? 16;
    const height = override.height ?? icon.height ?? this.json.height ?? 16;
    const left = override.left ?? icon.left ?? this.json.left ?? 0;
    const top = override.top ?? icon.top ?? this.json.top ?? 0;
    if (typeof icon.body !== "string") {
      return { ok: false, problem: { reason: "invalid", message: messages().icons.noBody(name) } };
    }
    return sanitizeBody(icon.body, { x: left, y: top, width, height });
  }

  override keywords(name: string): readonly string[] {
    return this.categoryOf.get(name) ?? [];
  }

  override label(name: string): string {
    return this.json.labels?.[name] ?? humanise(name);
  }

  override categories(): ReadonlyMap<string, readonly string[]> {
    return new Map(Object.entries(this.json.categories ?? {}));
  }
}

/** The built-in packs besides Tabler, read as `icons/<prefix>.json`. */
export const BUILT_IN_PREFIXES = ["aws", "azure", "gcp", "kubernetes", "logos"] as const;

/**
 * A built-in Iconify pack read the first time it is used, so a browser fetches only the packs a
 * document needs. Until the file is there, the pack is empty and asks again on the next use.
 */
export class LazyIconifyPack implements IconPack {
  private inner: IconifyPack | undefined;
  private readonly info: NonNullable<IconifyJson["info"]>;
  private readonly known: AssetMetadata;
  private readonly knownCategories: ReadonlyMap<string, number>;

  constructor(
    readonly prefix: string,
    private readonly read: () => string | undefined,
    index?: BuiltInIndexEntry,
  ) {
    const info = index?.info ?? {};
    this.info = info;
    this.known = {
      title: info.name ?? prefix,
      version: info.version ?? null,
      source: "built-in",
      license: info.license?.spdx ?? info.license?.title ?? null,
      author: info.author?.name ?? null,
      url: info.license?.url ?? info.author?.url ?? null,
      redistribute: info.redistribute ?? true,
      ...(info.terms ? { terms: info.terms } : {}),
    };
    this.knownCategories = new Map(Object.entries(index?.categories ?? {}));
  }

  private pack(): IconifyPack | undefined {
    if (this.inner) return this.inner;
    const text = this.read();
    if (text === undefined) return undefined;
    try {
      const json = JSON.parse(text) as IconifyJson;
      if (json.prefix !== this.prefix) return undefined;
      // The index's `info` stands in for what the file does not say, such as the title of the
      // logos, whose file has none: the pack keeps its name once it is read.
      this.inner = new IconifyPack({ ...json, info: { ...this.info, ...json.info } }, "built-in");
    } catch {
      return undefined;
    }
    return this.inner;
  }

  /** Whether the file has been read. */
  get loaded(): boolean {
    return this.inner !== undefined;
  }

  get metadata(): AssetMetadata {
    return this.inner?.metadata ?? this.known;
  }

  get opticalScale(): number | undefined {
    return this.pack()?.opticalScale;
  }

  names(): readonly string[] {
    return this.pack()?.names() ?? [];
  }

  has(name: string): boolean {
    return this.pack()?.has(name) ?? false;
  }

  icon(name: string): IconResult | undefined {
    return this.pack()?.icon(name);
  }

  keywords(name: string): readonly string[] {
    return this.pack()?.keywords(name) ?? [];
  }

  label(name: string): string {
    return this.pack()?.label(name) ?? humanise(name);
  }

  categories(): ReadonlyMap<string, readonly string[]> {
    return this.pack()?.categories() ?? new Map();
  }

  categoryCounts(): ReadonlyMap<string, number> {
    if (this.inner) return this.inner.categoryCounts();
    return this.knownCategories;
  }
}

/** What `icons/index.json` says of a built-in pack: its `info` and the size of each category. */
export interface BuiltInIndexEntry {
  readonly info?: NonNullable<IconifyJson["info"]>;
  readonly categories?: Readonly<Record<string, number>>;
}

/**
 * The built-in packs through a reader of the bundled assets: Tabler's files under `tabler/` and
 * the provider packs as `icons/<prefix>.json`.
 */
export function builtInPacks(read: (path: string) => string | undefined): IconPack[] {
  let index: Readonly<Record<string, BuiltInIndexEntry>> = {};
  const text = read("icons/index.json");
  if (text !== undefined) {
    try {
      index = JSON.parse(text) as Readonly<Record<string, BuiltInIndexEntry>>;
    } catch {
      index = {};
    }
  }
  return [
    new TablerPack((path) => read(`tabler/${path}`)),
    ...BUILT_IN_PREFIXES.map(
      (prefix) => new LazyIconifyPack(prefix, () => read(`icons/${prefix}.json`), index[prefix]),
    ),
  ];
}

/** A project pack made of one SVG file per icon. */
export class SvgFolderPack extends BasePack {
  readonly metadata: AssetMetadata;
  readonly opticalScale?: number;
  private readonly sorted: string[];

  constructor(
    readonly prefix: string,
    private readonly files: ReadonlyMap<string, string>,
    metadata: AssetMetadata,
    opticalScale?: number,
  ) {
    super();
    this.metadata = metadata;
    if (opticalScale !== undefined) this.opticalScale = opticalScale;
    this.sorted = [...files.keys()].sort();
  }

  names(): readonly string[] {
    return this.sorted;
  }

  has(name: string): boolean {
    return this.files.has(name);
  }

  protected load(name: string): IconResult | undefined {
    const text = this.files.get(name);
    return text === undefined ? undefined : sanitizeSvg(text);
  }
}

/** The median optical ratio of up to 64 icons of a pack, in name order. */
export function packRatio(pack: IconPack): number | undefined {
  if (pack.opticalScale !== undefined) return pack.opticalScale;
  const ratios: number[] = [];
  for (const name of pack.names()) {
    if (ratios.length >= 64) break;
    const result = pack.icon(name);
    if (!result?.ok) continue;
    const ratio = opticalRatio(result.icon);
    if (ratio !== undefined) ratios.push(ratio);
  }
  return median(ratios);
}

export type IconLookup =
  | { readonly status: "found"; readonly icon: ResolvedIcon }
  | { readonly status: "unknown-pack"; readonly prefix: string; readonly packs: readonly string[] }
  | {
      readonly status: "unknown-icon";
      readonly pack: IconPack;
      readonly name: string;
      readonly suggestions: readonly string[];
    }
  | {
      readonly status: "unusable";
      readonly pack: IconPack;
      readonly name: string;
      readonly problem: IconProblem;
    }
  | { readonly status: "malformed" };

/** Packs and aliases of a project, resolving `pack:name` references. */
export class IconRegistry implements IconResolver {
  private readonly packs = new Map<string, IconPack>();
  private readonly scales = new Map<string, number>();

  constructor(
    packs: readonly IconPack[],
    private readonly aliases: Readonly<Record<string, string>> = {},
  ) {
    for (const pack of packs) if (!this.packs.has(pack.prefix)) this.packs.set(pack.prefix, pack);
  }

  /** Packs in prefix order. */
  list(): IconPack[] {
    return [...this.packs.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
  }

  pack(prefixOrAlias: string): IconPack | undefined {
    return this.packs.get(this.aliases[prefixOrAlias] ?? prefixOrAlias);
  }

  aliasList(): Readonly<Record<string, string>> {
    return this.aliases;
  }

  lookup(reference: string): IconLookup {
    const colon = reference.indexOf(":");
    if (colon <= 0 || colon === reference.length - 1) return { status: "malformed" };
    const prefix = reference.slice(0, colon);
    const name = reference.slice(colon + 1);
    const pack = this.pack(prefix);
    if (!pack) {
      return {
        status: "unknown-pack",
        prefix,
        packs: [...this.packs.keys(), ...Object.keys(this.aliases)].sort(),
      };
    }
    const result = pack.icon(name);
    if (!result) {
      return {
        status: "unknown-icon",
        pack,
        name,
        suggestions: suggest(pack, name).map((n) => `${prefix}:${n}`),
      };
    }
    if (!result.ok) return { status: "unusable", pack, name, problem: result.problem };
    let scale = this.scales.get(pack.prefix);
    if (scale === undefined) {
      scale = drawScale(packRatio(pack));
      this.scales.set(pack.prefix, scale);
    }
    return { status: "found", icon: { reference, pack, name, geometry: result.icon, scale } };
  }

  resolve(reference: string): ResolvedIcon | undefined {
    const found = this.lookup(reference);
    return found.status === "found" ? found.icon : undefined;
  }
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

/**
 * Up to five names close to a misspelt one, of icons the pack can draw: small edit distance
 * first, then shared prefixes.
 */
function suggest(pack: IconPack, name: string): string[] {
  const scored: { name: string; score: number }[] = [];
  for (const candidate of pack.names()) {
    if (Math.abs(candidate.length - name.length) > 3) continue;
    const d = distance(candidate, name);
    if (d <= 2) scored.push({ name: candidate, score: d });
  }
  scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const names: string[] = [];
  for (const { name: candidate } of scored) {
    if (names.length >= 5) break;
    if (drawable(pack, candidate)) names.push(candidate);
  }
  return names;
}

/**
 * Whether a pack can draw an icon: it has it, and its SVG passes the sanitiser (a logo drawn with
 * `<mask>`, `<clipPath>` or `<use>` does not).
 */
export function drawable(pack: IconPack, name: string): boolean {
  return pack.icon(name)?.ok === true;
}

/** The first `limit` names of a pack in name order, leaving out the icons it cannot draw. */
export function drawableNames(pack: IconPack, limit: number): string[] {
  const names: string[] = [];
  for (const name of pack.names()) {
    if (names.length >= limit) break;
    if (drawable(pack, name)) names.push(name);
  }
  return names;
}

/**
 * References whose name or keywords contain every word of the query, ignoring case: exact names
 * first, then name prefixes, then the rest, each in reference order. Icons the packs cannot draw
 * are left out, so that nothing offered fails when it is written.
 */
export function searchIcons(registry: IconRegistry, query: string, limit = 50): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "");
  if (words.length === 0) return [];
  const joined = words.join("-");
  const found: {
    pack: IconPack;
    name: string;
    reference: string;
    rank: number;
    general: boolean;
  }[] = [];
  for (const pack of registry.list()) {
    for (const name of pack.names()) {
      const lower = name.toLowerCase();
      const haystack = `${lower} ${pack.keywords(name).join(" ").toLowerCase()}`;
      if (!words.every((w) => haystack.includes(w))) continue;
      const rank = lower === joined ? 0 : lower.startsWith(joined) ? 1 : 2;
      // Between equal matches, the general-purpose Tabler icon comes before a provider's.
      const reference = `${pack.prefix}:${name}`;
      found.push({ pack, name, reference, rank, general: pack.prefix === "tabler" });
    }
  }
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.general) - Number(a.general) ||
      a.reference.localeCompare(b.reference),
  );
  // Only the icons kept are read: the sanitiser runs on as many as the limit needs.
  const kept: string[] = [];
  for (const { pack, name, reference } of found) {
    if (kept.length >= limit) break;
    if (drawable(pack, name)) kept.push(reference);
  }
  return kept;
}
