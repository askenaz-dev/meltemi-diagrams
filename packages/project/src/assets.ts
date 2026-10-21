import {
  ASSET_LIMITS,
  byteLength,
  compareLocks,
  folderIntegrity,
  IconifyPack,
  IconRegistry,
  integrityOf,
  LOCK_NAME,
  LOCK_VERSION,
  PACK_PREFIX,
  parseLibrary,
  SvgFolderPack,
  type AssetLock,
  type AssetMetadata,
  type IconifyJson,
  type IconPack,
  type IconProblem,
  type Library,
  type LockedFont,
  type LockedPack,
  type LockedPlugin,
} from "@meltemi/diagrams-assets";
import {
  LineIndex,
  createDiagnostic,
  sortDiagnostics,
  type Diagnostic,
  type Severity,
  type Span,
} from "@meltemi/diagrams-language";
import type { ProjectHost } from "./host.js";
import type { LoadedPlugin } from "./plugins.js";
import { parseJsonWithPositions, type JsonMember, type JsonValue } from "./json.js";
import type { ManifestResult } from "./manifest.js";
import { messages } from "./messages/index.js";
import { joinPath, relativePath } from "./paths.js";

/** Folders and files of a project's assets, relative to the root. */
export const ICONS_FOLDER = "assets/icons";
export const FONTS_FOLDER = "assets/fonts";
export const LICENSES_FILE = "assets/licenses.json";
const FONT_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"];
/** The owner of the prefixes of the built-in packs, which no project path can be. */
const BUILT_IN = "built-in";

/** What a host knows about a font file: its family and whether it may be embedded. */
export type FontInspection =
  | {
      readonly ok: true;
      readonly family: string;
      readonly weight: number;
      readonly style: "normal" | "italic";
      readonly restricted: boolean;
    }
  | { readonly ok: false; readonly message: string };

/** Host services for assets: the built-in packs and font parsing (for example a `FontLibrary`). */
export interface AssetServices {
  readonly builtInPacks?: readonly IconPack[];
  readonly inspectFont?: (data: Uint8Array, path: string) => FontInspection;
}

export interface LicenseEntry {
  readonly license: string;
  readonly title?: string;
  readonly version?: string;
  readonly url?: string;
  readonly author?: string;
  readonly redistribute?: boolean;
  readonly opticalScale?: number;
}

export interface ProjectFontAsset {
  /** Project path of the file. */
  readonly path: string;
  /** Path relative to the root, as written in locks and listings. */
  readonly relative: string;
  readonly family: string | null;
  readonly weight: number | null;
  readonly style: "normal" | "italic" | null;
  readonly restricted: boolean;
  readonly license: string | null;
  readonly metadata: Partial<LicenseEntry>;
  readonly integrity: string;
}

export interface ProjectAssets {
  readonly registry: IconRegistry;
  /** Project packs with the project path of their file or folder. */
  readonly packs: readonly { readonly pack: IconPack; readonly path: string }[];
  /** Libraries of `assets/libraries/` and of plugins, in that order. */
  readonly libraries: readonly Library[];
  readonly fonts: readonly ProjectFontAsset[];
  /** The lock describing the assets as they are now. */
  readonly lock: AssetLock;
  /** The lock written in `assets.lock.json`, or null when there is none. */
  readonly writtenLock: AssetLock | null;
  /** Diagnostics by the project path of the file they concern. */
  readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
  /** Every file read, so editors know when to discover again. */
  readonly files: readonly string[];
}

interface Report {
  (
    path: string,
    text: string | undefined,
    input: {
      code: string;
      severity?: Severity;
      message: string;
      span?: Span;
      hints?: string[];
    },
  ): void;
}

const ICON_PROBLEM_CODES: Readonly<Record<IconProblem["reason"], string>> = {
  unsafe: "asset.unsafe-svg",
  "too-large": "asset.too-large",
  invalid: "asset.invalid-file",
};

/** The diagnostic code of an icon that cannot be used. */
export function iconProblemCode(problem: IconProblem): string {
  return ICON_PROBLEM_CODES[problem.reason];
}

function member(value: JsonValue | undefined, key: string): JsonMember | undefined {
  return value?.kind === "object" ? value.members.find((m) => m.key === key) : undefined;
}

/**
 * Discovers and checks the assets of a project: icon packs under `assets/icons/`, fonts under
 * `assets/fonts/`, `assets/licenses.json`, the aliases of `project.json` and the lock.
 */
export function discoverAssets(
  host: ProjectHost,
  root: string,
  manifest: ManifestResult,
  services: AssetServices,
  readText: (path: string) => string | undefined,
  listFolder: (path: string) => readonly { name: string; kind: "file" | "directory" }[],
  plugins: readonly LoadedPlugin[] = [],
): ProjectAssets {
  const diagnostics = new Map<string, Diagnostic[]>();
  const files: string[] = [];
  const report: Report = (path, text, input) => {
    const list = diagnostics.get(path) ?? [];
    list.push(
      createDiagnostic(new LineIndex(text ?? ""), {
        code: input.code,
        severity: input.severity ?? "error",
        message: input.message,
        span: input.span ?? { start: 0, end: 0 },
        hints: input.hints,
      }),
    );
    diagnostics.set(path, list);
  };
  const display = (path: string) => relativePath(root, path);
  // Diagnostics are written in the interface language of the moment the assets are discovered.
  const words = messages();
  const t = words.diagnostics.assets;
  const hints = words.hints.assets;

  // ------------------------------------------------------------- licences
  const licensesPath = joinPath(root, LICENSES_FILE);
  const licensesText = readText(licensesPath);
  const licenses = {
    icons: new Map<string, LicenseEntry>(),
    fonts: new Map<string, LicenseEntry>(),
  };
  const licenseKeys = { icons: new Map<string, Span>(), fonts: new Map<string, Span>() };
  if (licensesText !== undefined) {
    files.push(licensesPath);
    readLicenses(
      licensesText,
      (input) => report(licensesPath, licensesText, input),
      licenses,
      licenseKeys,
    );
  }

  // ------------------------------------------------------------- packs
  const builtIn = services.builtInPacks ?? [];
  const packs: { pack: IconPack; path: string }[] = [];
  // A project pack may replace a built-in provider pack (a newer vendor set); `tabler` stays.
  const taken = new Map<string, string>(
    builtIn.filter((p) => p.prefix === "tabler").map((p) => [p.prefix, BUILT_IN]),
  );
  const iconsFolder = joinPath(root, ICONS_FOLDER);
  const integrities = new Map<string, string>();
  const entries = [...listFolder(iconsFolder)].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = joinPath(iconsFolder, entry.name);
    let prefix: string;
    if (entry.kind === "file") {
      if (!entry.name.endsWith(".json")) continue;
      prefix = entry.name.slice(0, -".json".length);
    } else {
      prefix = entry.name;
    }
    if (!PACK_PREFIX.test(prefix)) {
      report(path, undefined, { code: "asset.invalid-file", message: t.packName(display(path)) });
      continue;
    }
    const owner = taken.get(prefix);
    if (owner !== undefined) {
      report(path, undefined, {
        code: "asset.duplicate-pack",
        message: t.duplicatePack(prefix, owner === BUILT_IN ? null : owner),
        hints: [hints.renamePack],
      });
      continue;
    }
    const license = licenses.icons.get(prefix);
    const pack =
      entry.kind === "file"
        ? iconifyPack(path, prefix, license, readText, report, display, integrities)
        : folderPack(path, prefix, license, readText, listFolder, report, display, integrities);
    files.push(path);
    if (!pack) continue;
    taken.set(prefix, display(path));
    packs.push({ pack, path });
    if (pack.metadata.license === null) {
      report(path, undefined, {
        code: "asset.missing-license",
        message: t.packWithoutLicense(prefix),
        hints: [hints.packLicense(prefix, LICENSES_FILE)],
      });
    }
    // Every icon is checked now, so validation reports unusable files before a diagram uses them.
    for (const name of pack.names()) {
      const result = pack.icon(name);
      if (result && !result.ok) {
        const target = entry.kind === "file" ? path : joinPath(path, `${name}.svg`);
        report(target, entry.kind === "file" ? readText(path) : readText(target), {
          code: iconProblemCode(result.problem),
          message: t.unusableIcon(`${prefix}:${name}`, result.problem.message),
        });
      }
    }
  }
  // Icon packs of plugins granted `icons`: named after the plugin, under its licence.
  for (const plugin of plugins) {
    if (plugin.icons === null) continue;
    const prefix = plugin.name;
    const owner = taken.get(prefix);
    if (owner !== undefined) {
      report(plugin.icons, undefined, {
        code: "asset.duplicate-pack",
        message: t.duplicatePluginPack(prefix, owner === BUILT_IN ? null : owner),
      });
      continue;
    }
    const license: LicenseEntry | undefined = plugin.license
      ? { license: plugin.license, title: prefix, version: plugin.version }
      : undefined;
    const pack = plugin.icons.endsWith(".json")
      ? iconifyPack(plugin.icons, prefix, license, readText, report, display, integrities)
      : folderPack(
          plugin.icons,
          prefix,
          license,
          readText,
          listFolder,
          report,
          display,
          integrities,
        );
    files.push(plugin.icons);
    if (!pack) continue;
    taken.set(prefix, display(plugin.icons));
    packs.push({ pack, path: plugin.icons });
  }
  // Libraries: the project's `assets/libraries/*.json`, then the plugins' files.
  const libraries: Library[] = [];
  const readLibrary = (path: string, code: string) => {
    const text = readText(path);
    files.push(path);
    if (text === undefined) {
      report(path, undefined, {
        code,
        message: words.diagnostics.plugins.invalidLibrary("missing"),
      });
      return;
    }
    const parsed = parseLibrary(text, display(path));
    if (parsed.ok) libraries.push(parsed.library);
    else
      report(path, text, {
        code,
        message: words.diagnostics.plugins.invalidLibrary(parsed.reason),
      });
  };
  const libraryFolder = `${root}/assets/libraries`;
  for (const entry of listFolder(libraryFolder)) {
    if (entry.kind === "file" && entry.name.endsWith(".json")) {
      readLibrary(`${libraryFolder}/${entry.name}`, "asset.invalid-library");
    }
  }
  for (const plugin of plugins) {
    for (const path of plugin.libraries) readLibrary(path, "plugin.invalid-manifest");
  }
  for (const [prefix, span] of licenseKeys.icons) {
    if (!packs.some((p) => p.pack.prefix === prefix) && !builtIn.some((p) => p.prefix === prefix)) {
      report(licensesPath, licensesText, {
        code: "asset.invalid-file",
        severity: "warning",
        message: t.noPack(prefix, ICONS_FOLDER),
        span,
      });
    }
  }

  // ------------------------------------------------------------- aliases
  const manifestPath = manifest.path;
  const aliases: Record<string, string> = {};
  const prefixes = new Set([...builtIn.map((p) => p.prefix), ...packs.map((p) => p.pack.prefix)]);
  for (const [alias, target] of Object.entries(manifest.manifest?.icons ?? {})) {
    const span = manifest.spans[`icons.${alias}`];
    if (prefixes.has(alias)) {
      report(manifestPath, manifest.text, {
        code: "project.invalid-value",
        message: t.aliasIsPack(alias),
        span,
      });
      continue;
    }
    if (!prefixes.has(target)) {
      report(manifestPath, manifest.text, {
        code: "project.invalid-value",
        message: t.aliasTarget(alias, target),
        span,
        hints: [hints.packs([...prefixes].sort())],
      });
      continue;
    }
    aliases[alias] = target;
  }

  // ------------------------------------------------------------- fonts
  const fonts: ProjectFontAsset[] = [];
  const fontsFolder = joinPath(root, FONTS_FOLDER);
  for (const entry of [...listFolder(fontsFolder)].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.kind !== "file") continue;
    const lower = entry.name.toLowerCase();
    if (!FONT_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
    const path = joinPath(fontsFolder, entry.name);
    files.push(path);
    const data = host.readBinary?.(path);
    if (!data) continue;
    if (data.length > ASSET_LIMITS.fontFile) {
      report(path, undefined, {
        code: "asset.too-large",
        message: t.tooLarge(display(path), ASSET_LIMITS.fontFile / 1024 / 1024),
      });
      continue;
    }
    const inspection = services.inspectFont?.(data, path);
    if (inspection && !inspection.ok) {
      report(path, undefined, { code: "asset.invalid-file", message: inspection.message });
      continue;
    }
    const family = inspection?.ok ? inspection.family : null;
    const entryLicense = family !== null ? licenses.fonts.get(family) : undefined;
    if (inspection?.ok && inspection.restricted) {
      report(path, undefined, {
        code: "asset.font-restricted",
        severity: "warning",
        message: t.fontRestricted(inspection.family),
      });
    }
    if (family !== null && !entryLicense) {
      report(path, undefined, {
        code: "asset.missing-license",
        message: t.fontWithoutLicense(family),
        hints: [hints.fontLicense(family, LICENSES_FILE)],
      });
    }
    fonts.push({
      path,
      relative: display(path),
      family,
      weight: inspection?.ok ? inspection.weight : null,
      style: inspection?.ok ? inspection.style : null,
      restricted: inspection?.ok ? inspection.restricted : false,
      license: entryLicense?.license ?? null,
      metadata: entryLicense ?? {},
      integrity: integrityOf(data),
    });
  }
  if (services.inspectFont) {
    for (const [family, span] of licenseKeys.fonts) {
      if (!fonts.some((f) => f.family === family)) {
        report(licensesPath, licensesText, {
          code: "asset.invalid-file",
          severity: "warning",
          message: t.noFont(family, FONTS_FOLDER),
          span,
        });
      }
    }
  }

  // ------------------------------------------------------------- lock
  const icons: Record<string, LockedPack> = {};
  for (const pack of builtIn) {
    icons[pack.prefix] = {
      version: pack.metadata.version,
      source: "built-in",
      license: pack.metadata.license,
    };
  }
  for (const { pack } of packs) {
    const integrity = integrities.get(pack.prefix);
    icons[pack.prefix] = {
      version: pack.metadata.version,
      source: pack.metadata.source,
      license: pack.metadata.license,
      ...(integrity ? { integrity } : {}),
    };
  }
  const lockedFonts: Record<string, LockedFont> = {};
  for (const font of fonts) {
    lockedFonts[font.relative] = {
      family: font.family ?? "",
      license: font.license,
      integrity: font.integrity,
    };
  }
  const lockedPlugins: Record<string, LockedPlugin> = {};
  for (const plugin of plugins) {
    lockedPlugins[plugin.name] = {
      version: plugin.version,
      path: relativePath(root, plugin.folder),
      integrity: plugin.integrity,
    };
  }
  const lock: AssetLock = {
    lockVersion: LOCK_VERSION,
    icons,
    fonts: lockedFonts,
    ...(plugins.length > 0 ? { plugins: lockedPlugins } : {}),
  };
  const lockPath = joinPath(root, LOCK_NAME);
  const lockText = readText(lockPath);
  let writtenLock: AssetLock | null = null;
  if (lockText !== undefined) {
    files.push(lockPath);
    writtenLock = readLock(lockText, (input) => report(lockPath, lockText, input));
    if (writtenLock) {
      for (const change of compareLocks(writtenLock, lock)) {
        report(lockPath, lockText, {
          code: "asset.lock-mismatch",
          severity: "warning",
          message: t.lockMismatch(LOCK_NAME, change),
          hints: [hints.lock],
        });
      }
    }
  }

  return {
    registry: new IconRegistry([...packs.map((p) => p.pack), ...builtIn], aliases),
    packs,
    libraries,
    fonts,
    lock,
    writtenLock,
    diagnostics: new Map([...diagnostics].map(([path, list]) => [path, sortDiagnostics(list)])),
    files,
  };
}

function iconifyPack(
  path: string,
  prefix: string,
  license: LicenseEntry | undefined,
  readText: (path: string) => string | undefined,
  report: Report,
  display: (path: string) => string,
  integrities: Map<string, string>,
): IconPack | undefined {
  const text = readText(path);
  if (text === undefined) return undefined;
  const t = messages().diagnostics.assets;
  if (byteLength(text) > ASSET_LIMITS.iconifyFile) {
    report(path, text, {
      code: "asset.too-large",
      message: t.tooLarge(display(path), ASSET_LIMITS.iconifyFile / 1024 / 1024),
    });
    return undefined;
  }
  const parsed = parseJsonWithPositions(text);
  if (!parsed.ok) {
    report(path, text, {
      code: "asset.invalid-file",
      message: t.invalidJson(parsed.message),
      span: parsed.span,
    });
    return undefined;
  }
  const prefixMember = member(parsed.value, "prefix");
  const iconsMember = member(parsed.value, "icons");
  if (parsed.value.kind !== "object" || !iconsMember || iconsMember.value.kind !== "object") {
    report(path, text, {
      code: "asset.invalid-file",
      message: t.iconSetIcons,
      span: parsed.value.span,
    });
    return undefined;
  }
  if (
    !prefixMember ||
    prefixMember.value.kind !== "string" ||
    prefixMember.value.value !== prefix
  ) {
    report(path, text, {
      code: "asset.invalid-file",
      message: t.iconSetPrefix(prefix),
      span: prefixMember?.value.span ?? parsed.value.span,
    });
    return undefined;
  }
  const json = JSON.parse(text) as IconifyJson;
  integrities.set(prefix, integrityOf(new TextEncoder().encode(text)));
  return new IconifyPack(json, display(path), overrides(license));
}

function folderPack(
  path: string,
  prefix: string,
  license: LicenseEntry | undefined,
  readText: (path: string) => string | undefined,
  listFolder: (path: string) => readonly { name: string; kind: "file" | "directory" }[],
  report: Report,
  display: (path: string) => string,
  integrities: Map<string, string>,
): IconPack | undefined {
  const files = new Map<string, string>();
  const bytes = new Map<string, Uint8Array>();
  for (const entry of listFolder(path)) {
    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".svg")) continue;
    const text = readText(joinPath(path, entry.name));
    if (text === undefined) continue;
    files.set(entry.name.slice(0, -".svg".length), text);
    bytes.set(entry.name, new TextEncoder().encode(text));
  }
  if (files.size === 0) {
    report(path, undefined, {
      code: "asset.invalid-file",
      severity: "warning",
      message: messages().diagnostics.assets.emptyFolder(display(path)),
    });
  }
  integrities.set(prefix, folderIntegrity(bytes));
  const metadata: AssetMetadata = {
    title: license?.title ?? prefix,
    version: license?.version ?? null,
    source: display(path),
    license: license?.license ?? null,
    author: license?.author ?? null,
    url: license?.url ?? null,
    redistribute: license?.redistribute ?? true,
  };
  return new SvgFolderPack(prefix, files, metadata, license?.opticalScale);
}

function overrides(
  license: LicenseEntry | undefined,
): Partial<AssetMetadata> & { opticalScale?: number } {
  if (!license) return {};
  return {
    license: license.license,
    ...(license.title !== undefined ? { title: license.title } : {}),
    ...(license.version !== undefined ? { version: license.version } : {}),
    ...(license.url !== undefined ? { url: license.url } : {}),
    ...(license.author !== undefined ? { author: license.author } : {}),
    ...(license.redistribute !== undefined ? { redistribute: license.redistribute } : {}),
    ...(license.opticalScale !== undefined ? { opticalScale: license.opticalScale } : {}),
  };
}

type Input = Parameters<Report>[2];

const LICENSE_FIELDS = [
  "license",
  "title",
  "version",
  "url",
  "author",
  "redistribute",
  "opticalScale",
];

/** Reads `assets/licenses.json`, reporting problems at their spans. */
function readLicenses(
  text: string,
  report: (input: Input) => void,
  out: { icons: Map<string, LicenseEntry>; fonts: Map<string, LicenseEntry> },
  keys: { icons: Map<string, Span>; fonts: Map<string, Span> },
): void {
  const words = messages();
  const t = words.diagnostics.assets;
  const parsed = parseJsonWithPositions(text);
  if (!parsed.ok) {
    report({
      code: "asset.invalid-file",
      message: t.invalidJson(parsed.message),
      span: parsed.span,
    });
    return;
  }
  if (parsed.value.kind !== "object") {
    report({
      code: "asset.invalid-file",
      message: t.licensesObject(LICENSES_FILE),
      span: parsed.value.span,
    });
    return;
  }
  for (const section of parsed.value.members) {
    if (section.key !== "icons" && section.key !== "fonts") {
      report({
        code: "asset.invalid-file",
        severity: "warning",
        message: t.licensesKey(section.key, LICENSES_FILE),
        span: section.keySpan,
      });
      continue;
    }
    if (section.value.kind !== "object") {
      report({
        code: "asset.invalid-file",
        message: t.sectionObject(section.key),
        span: section.value.span,
      });
      continue;
    }
    const kind = section.key;
    for (const entry of section.value.members) {
      keys[kind].set(entry.key, entry.keySpan);
      if (entry.value.kind !== "object") {
        report({
          code: "asset.invalid-file",
          message: t.entryObject(entry.key),
          span: entry.value.span,
        });
        continue;
      }
      const result: Record<string, string | number | boolean> = {};
      let valid = true;
      for (const field of entry.value.members) {
        const value = field.value;
        if (
          !LICENSE_FIELDS.includes(field.key) ||
          (field.key === "opticalScale" && kind === "fonts")
        ) {
          report({
            code: "asset.invalid-file",
            severity: "warning",
            message: t.unknownLicenseField(field.key, entry.key),
            span: field.keySpan,
            hints: [
              words.hints.fields(
                LICENSE_FIELDS.filter((f) => kind === "icons" || f !== "opticalScale"),
              ),
            ],
          });
          continue;
        }
        if (field.key === "redistribute") {
          if (value.kind !== "boolean") {
            report({ code: "asset.invalid-file", message: t.redistribute, span: value.span });
            valid = false;
          } else result.redistribute = value.value;
          continue;
        }
        if (field.key === "opticalScale") {
          if (value.kind !== "number" || value.value < 0.5 || value.value > 1.5) {
            report({ code: "asset.invalid-file", message: t.opticalScale, span: value.span });
            valid = false;
          } else result.opticalScale = value.value;
          continue;
        }
        if (value.kind !== "string" || value.value.trim() === "") {
          report({
            code: "asset.invalid-file",
            message: t.licenseText(field.key),
            span: value.span,
          });
          valid = false;
          continue;
        }
        result[field.key] = value.value.trim();
      }
      if (typeof result.license !== "string") {
        if (valid) {
          report({
            code: "asset.invalid-file",
            message: t.noLicense(entry.key),
            span: entry.keySpan,
            hints: [words.hints.assets.spdx],
          });
        }
        continue;
      }
      if (!/^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.+-]+)$/.test(result.license)) {
        report({
          code: "asset.invalid-file",
          message: t.licenseId(result.license),
          span: member(entry.value, "license")!.value.span,
        });
        continue;
      }
      out[kind].set(entry.key, result as unknown as LicenseEntry);
    }
  }
}

/** Reads `assets.lock.json`; problems are reported and give null. */
function readLock(text: string, report: (input: Input) => void): AssetLock | null {
  const words = messages();
  const t = words.diagnostics.assets;
  const parsed = parseJsonWithPositions(text);
  if (!parsed.ok) {
    report({
      code: "asset.invalid-file",
      message: t.invalidJson(parsed.message),
      span: parsed.span,
    });
    return null;
  }
  const value = parsed.value;
  const version = member(value, "lockVersion");
  if (
    value.kind !== "object" ||
    version?.value.kind !== "number" ||
    version.value.value !== LOCK_VERSION
  ) {
    report({
      code: "asset.invalid-file",
      message: t.lockVersion(LOCK_NAME, LOCK_VERSION),
      span: version?.value.span ?? value.span,
      hints: [words.hints.assets.writeLock],
    });
    return null;
  }
  try {
    const json = JSON.parse(text) as Partial<AssetLock>;
    if (
      typeof json.icons !== "object" ||
      typeof json.fonts !== "object" ||
      !json.icons ||
      !json.fonts
    ) {
      throw new Error("missing sections");
    }
    return {
      lockVersion: LOCK_VERSION,
      icons: json.icons,
      fonts: json.fonts,
      ...(typeof json.plugins === "object" && json.plugins ? { plugins: json.plugins } : {}),
    };
  } catch {
    report({
      code: "asset.invalid-file",
      message: t.lockSections(LOCK_NAME),
      span: value.span,
      hints: [words.hints.assets.writeLock],
    });
    return null;
  }
}
