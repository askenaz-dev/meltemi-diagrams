import { LOCALES, isLocale, type Locale } from "@meltemi/diagrams-i18n";
import {
  LANGUAGE_VERSION,
  LineIndex,
  createDiagnostic,
  type Diagnostic,
  type Severity,
  type Span,
} from "@meltemi/diagrams-language";
import { BUILT_IN_THEMES } from "@meltemi/diagrams-model";
import type { ProjectHost } from "./host.js";
import { parseJsonWithPositions, type JsonValue } from "./json.js";
import { messages } from "./messages/index.js";
import { joinPath, normalizePath, rootPrefix } from "./paths.js";
import { MANIFEST_NAME } from "./root.js";
import { parseRange, satisfiesRange } from "./semver.js";
import { readPluginSettings, type PluginSetting } from "./plugins.js";

/** Name under which the tool appears in `tools`. */
export const TOOL_NAME = "meltemi-diagrams";

/**
 * Bounds of a project, so that a repository from anywhere cannot exhaust an editor or an
 * automated job (decision 0030).
 */
export const PROJECT_LIMITS = {
  /** `.meltemi` sources compiled in one project. */
  files: 2000,
  /** Characters of `project.json` and of a plugin's manifest. */
  manifestCharacters: 1024 * 1024,
} as const;

/**
 * Bounds of a cloud project and of an account, used by the page (to refuse before sending), the
 * Worker (to refuse anyway) and the command line (`cloud-projects`, "Quotas"). The Worker answers
 * a breach with a `413` and a stable code (`quota.projects`, `quota.storage`, `quota.files`,
 * `quota.binary`, `quota.versions`, `doc.too-large`, `message.too-large`, `room.full`,
 * `publish.too-large`) or a `429` (`versions.rate`, `thumbnail.rate`, `publish.rate`).
 */
export const CLOUD_LIMITS = {
  /** Projects per account. */
  projects: 100,
  /** Bytes per account: the distinct blobs its projects and versions reference. */
  storageBytes: 200 * 1024 * 1024,
  /** Files (`paths` entries) per project. */
  files: 2000,
  /** Bytes of a project's encoded document. */
  documentBytes: 16 * 1024 * 1024,
  /** Characters of one text file (`SOURCE_LIMITS.characters`). */
  textCharacters: 2 * 1024 * 1024,
  /** Bytes of one image or font. */
  binaryBytes: 10 * 1024 * 1024,
  /** Versions per project, labelled ones counted. */
  versions: 200,
  /** Unlabelled versions kept per project after thinning. */
  unlabelledVersions: 100,
  /** Versions created per project in a minute before `versions.rate`. */
  versionsPerMinute: 6,
  /** Clients in one room. */
  clients: 20,
  /** Bytes of one room message, below the platform's 1 MiB so the room sees it. */
  message: 512 * 1024,
  /** Bytes of a thumbnail. */
  thumbnailBytes: 200 * 1024,
  /** Seconds between two thumbnails of one project before `thumbnail.rate`. */
  thumbnailSeconds: 30,
  /** Bytes (UTF-8) of the HTML of one publication, before `publish.too-large`. */
  publishBytes: 16 * 1024 * 1024,
  /** Publish requests per project per hour before `publish.rate`. */
  publishesPerHour: 10,
} as const;

/** Fields of `project.json`, in the order the schema documents them. */
export const MANIFEST_FIELDS = [
  "$schema",
  "name",
  "language",
  "tools",
  "sources",
  "exclude",
  "format",
  "theme",
  "locale",
  "icons",
  "catalog",
  "plugins",
  "cloud",
] as const;
export const REQUIRED_MANIFEST_FIELDS = ["name", "language"] as const;
/** Folders that are never compiled, whatever `exclude` says; hidden folders (`.git`, `.meltemi`) too. */
export const ALWAYS_EXCLUDED = ["node_modules"] as const;

export interface ProjectManifest {
  readonly name: string | null;
  readonly language: string | null;
  readonly tools: Readonly<Record<string, string>>;
  /** Relative paths, normalised, without a leading `./`. */
  readonly sources: readonly string[];
  readonly exclude: readonly string[];
  /** Formatter settings; `indent` is spaces per level or `"tab"`. */
  readonly format: { readonly indent: number | "tab" };
  /** Default theme: a built-in name or `<path>#<theme id>` with a normalised relative path. */
  readonly theme: string | null;
  /**
   * The language of the words the tool adds to exported drawings, players and catalogs; null when
   * not written, which means English.
   */
  readonly locale: Locale | null;
  /** Icon pack aliases: alias to pack prefix. */
  readonly icons: Readonly<Record<string, string>>;
  /** What `build catalog` writes and leaves out. */
  readonly catalog: CatalogSettings;
  /** Plugins installed explicitly, with their versions and permissions (decision 0030). */
  readonly plugins: readonly PluginSetting[];
  /** The cloud project this folder mirrors (`mdg push`, `mdg pull`); null when not written or invalid. */
  readonly cloud: CloudSetting | null;
}

/** The `cloud` setting of a project: the service and the cloud project its folder mirrors. */
export interface CloudSetting {
  /** The service's origin, normalised: `https://diagrams.meltemi.dev`, or `http:` on the loopback. */
  readonly host: string;
  /** The cloud project's id: 20 lower-case letters and digits. */
  readonly project: string;
}

/** Settings of `cloud`, in the order the schema documents them. */
export const CLOUD_SETTINGS = ["host", "project"] as const;

/** The shape of a cloud project's id (the service's `PROJECT_ID`). */
export const CLOUD_PROJECT_ID = /^[0-9a-z]{20}$/;

/** Whether a URL host name (`new URL(...).hostname`) is this machine's: the only place `http:` is allowed. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

/** What `parseCloudHost` made of a text. */
export type CloudHostResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: "invalid" | "insecure" };

/**
 * Reads the address of a cloud service: an origin (`https://diagrams.meltemi.dev`, a trailing `/`
 * allowed), with no credentials, path, query or fragment. `http:` is accepted only for
 * `127.0.0.1`, `localhost` and `[::1]` (`insecure` otherwise, because a token would travel in the
 * clear); anything else that is not an origin is `invalid`. The answer is the normalised origin.
 */
export function parseCloudHost(value: string): CloudHostResult {
  if (!/^https?:\/\/[^\s?#\\]+$/i.test(value)) return { ok: false, reason: "invalid" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.username !== "" || url.password !== "" || url.pathname !== "/") {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    return { ok: false, reason: "insecure" };
  }
  return { ok: true, origin: url.origin };
}

/** The normalised origin of a valid cloud host, or null (see `parseCloudHost`). */
export function cloudHostOrigin(value: string): string | null {
  const parsed = parseCloudHost(value);
  return parsed.ok ? parsed.origin : null;
}

/** The `catalog` settings of a project (decision 0027). */
export interface CatalogSettings {
  /** The catalog's title; the project's `name` when null. */
  readonly title: string | null;
  readonly description: string | null;
  /** Where the catalog goes, relative to the root: a folder (for `index.html`) or a `.html` file. */
  readonly out: string;
  /** Folders or files relative to the root, or `<file>#<id>` for one block, left out. */
  readonly exclude: readonly string[];
  /** Whether the text of each catalogued file is included. */
  readonly source: boolean;
}

/** Settings of `catalog`, in the order the schema documents them. */
export const CATALOG_SETTINGS = ["title", "description", "out", "exclude", "source"] as const;

export const DEFAULT_CATALOG: CatalogSettings = {
  title: null,
  description: null,
  out: "catalog",
  exclude: [],
  source: false,
};

/** The default theme of a project: a built-in theme, or a theme of a project file. */
export type ProjectThemeSetting =
  | { readonly kind: "built-in"; readonly name: string }
  | { readonly kind: "file"; readonly path: string; readonly id: string };

/** Reads the `theme` setting of a manifest, or null when there is none. */
export function projectThemeSetting(manifest: ProjectManifest | null): ProjectThemeSetting | null {
  const theme = manifest?.theme ?? null;
  if (theme === null) return null;
  const hash = theme.lastIndexOf("#");
  if (hash < 0) return { kind: "built-in", name: theme };
  return { kind: "file", path: theme.slice(0, hash), id: theme.slice(hash + 1) };
}

export interface ManifestResult {
  /** Path of `project.json`. */
  readonly path: string;
  /** Text of the manifest, or undefined when the root has none. */
  readonly text: string | undefined;
  /** The manifest with defaults applied, or null when the root has no `project.json`. */
  readonly manifest: ProjectManifest | null;
  readonly diagnostics: readonly Diagnostic[];
  /** Spans of field values in the manifest text, for checks made after reading. */
  readonly spans: Readonly<Record<string, Span>>;
}

export interface ManifestOptions {
  /** Version of the running tool, checked against `tools`. */
  readonly toolVersion: string;
  /** Language version the tool implements; defaults to the language package's. */
  readonly languageVersion?: string;
}

export const DEFAULT_MANIFEST: ProjectManifest = {
  name: null,
  language: null,
  tools: {},
  sources: ["."],
  exclude: [],
  format: { indent: 2 },
  theme: null,
  locale: null,
  icons: {},
  catalog: DEFAULT_CATALOG,
  plugins: [],
  cloud: null,
};

/** Formatter options of a project: its `format` setting, or two spaces. */
export function formatOptionsFor(manifest: ProjectManifest | null): { indent: number | "tab" } {
  return { indent: manifest?.format.indent ?? 2 };
}

/** Reads and validates `<root>/project.json`. Never throws; every problem is a diagnostic. */
export function readManifest(
  host: ProjectHost,
  root: string,
  options: ManifestOptions,
): ManifestResult {
  const path = joinPath(root, MANIFEST_NAME);
  const text = host.readFile(path);
  if (text === undefined) return { path, text, manifest: null, diagnostics: [], spans: {} };

  const lines = new LineIndex(text);
  const diagnostics: Diagnostic[] = [];
  const spans: Record<string, Span> = {};
  const report = (
    code: string,
    message: string,
    span: Span,
    severity: Severity = "error",
    hints?: string[],
  ) => diagnostics.push(createDiagnostic(lines, { code, severity, message, span, hints }));
  // Diagnostics are written in the interface language of the moment they are made.
  const words = messages();
  const t = words.diagnostics.manifest;
  const hints = words.hints.manifest;

  if (text.length > PROJECT_LIMITS.manifestCharacters) {
    report("limit.too-large", t.tooLarge(text.length, PROJECT_LIMITS.manifestCharacters), {
      start: 0,
      end: 0,
    });
    return { path, text, manifest: DEFAULT_MANIFEST, diagnostics, spans };
  }
  const parsed = parseJsonWithPositions(text);
  if (!parsed.ok) {
    report("project.invalid-json", t.invalidJson(parsed.message), parsed.span);
    return { path, text, manifest: DEFAULT_MANIFEST, diagnostics, spans };
  }
  const value = parsed.value;
  if (value.kind !== "object") {
    report("project.invalid-value", t.notAnObject, value.span);
    return { path, text, manifest: DEFAULT_MANIFEST, diagnostics, spans };
  }

  const manifest: {
    name: string | null;
    language: string | null;
    tools: Record<string, string>;
    sources: string[];
    exclude: string[];
    format: { indent: number | "tab" };
    theme: string | null;
    locale: Locale | null;
    icons: Record<string, string>;
    catalog: CatalogSettings;
    plugins: PluginSetting[];
    cloud: CloudSetting | null;
  } = {
    name: null,
    language: null,
    tools: {},
    sources: ["."],
    exclude: [],
    format: { indent: 2 },
    theme: null,
    locale: null,
    icons: {},
    catalog: DEFAULT_CATALOG,
    plugins: [],
    cloud: null,
  };
  const seen = new Set<string>();
  const languageVersion = options.languageVersion ?? LANGUAGE_VERSION;

  const readPaths = (field: "sources" | "exclude", node: JsonValue): string[] | undefined => {
    if (node.kind !== "array") {
      report("project.invalid-value", t.pathList(field), node.span);
      return undefined;
    }
    const paths: string[] = [];
    for (const item of node.items) {
      if (item.kind !== "string" || item.value.trim() === "") {
        report("project.invalid-value", t.emptyPath(field), item.span);
        continue;
      }
      const normalized = inside(item.value);
      if (normalized === null) {
        report("project.invalid-value", t.outsidePath(item.value), item.span);
        continue;
      }
      paths.push(normalized);
    }
    return paths;
  };

  const readCatalog = (node: JsonValue): CatalogSettings => {
    const settings = { ...DEFAULT_CATALOG, exclude: [] as string[] };
    if (node.kind !== "object") {
      report("project.invalid-value", t.catalogObject, node.span);
      return settings;
    }
    for (const setting of node.members) {
      const item = setting.value;
      switch (setting.key) {
        case "title":
        case "description":
          if (item.kind !== "string" || (setting.key === "title" && item.value.trim() === "")) {
            report("project.invalid-value", t.catalogText(setting.key), item.span);
          } else settings[setting.key] = item.value.trim();
          break;
        case "out": {
          const out =
            item.kind === "string" && item.value.trim() !== "" ? inside(item.value) : null;
          if (out === null || out === ".") {
            report("project.invalid-value", t.catalogOut, item.span);
          } else settings.out = out;
          break;
        }
        case "exclude": {
          if (item.kind !== "array") {
            report("project.invalid-value", t.catalogExcludeList, item.span);
            break;
          }
          for (const entry of item.items) {
            const text = entry.kind === "string" ? entry.value.trim() : "";
            const hash = text.lastIndexOf("#");
            const path = inside(hash < 0 ? text : text.slice(0, hash));
            const id = hash < 0 ? null : text.slice(hash + 1);
            const valid =
              text !== "" &&
              path !== null &&
              (id === null || (path.endsWith(".meltemi") && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)));
            if (!valid) {
              report("project.invalid-value", t.catalogExcludeEntry, entry.span);
              continue;
            }
            settings.exclude.push(id === null ? path! : `${path}#${id}`);
          }
          break;
        }
        case "source":
          if (item.kind !== "boolean") {
            report("project.invalid-value", t.catalogSource, item.span);
          } else settings.source = item.value;
          break;
        default:
          report(
            "project.unknown-field",
            t.unknownCatalogSetting(setting.key),
            setting.keySpan,
            "warning",
            [hints.catalogSettings(CATALOG_SETTINGS)],
          );
      }
    }
    return settings;
  };

  /** The `cloud` object: both settings valid, else null with a diagnostic for each fault. */
  const readCloud = (node: JsonValue): CloudSetting | null => {
    const cloudHints = [hints.cloud];
    if (node.kind !== "object") {
      report("project.invalid-value", t.cloudObject, node.span, "error", cloudHints);
      return null;
    }
    let host: string | null = null;
    let project: string | null = null;
    let faulty = false;
    const written = new Set<string>();
    for (const setting of node.members) {
      if (written.has(setting.key)) {
        report("project.invalid-value", t.setTwice(setting.key), setting.keySpan);
        continue;
      }
      written.add(setting.key);
      const item = setting.value;
      switch (setting.key) {
        case "host": {
          const origin = item.kind === "string" ? cloudHostOrigin(item.value) : null;
          if (origin === null) {
            report("project.invalid-value", t.cloudHost, item.span, "error", cloudHints);
            faulty = true;
          } else host = origin;
          break;
        }
        case "project":
          if (item.kind !== "string" || !CLOUD_PROJECT_ID.test(item.value)) {
            report("project.invalid-value", t.cloudProject, item.span, "error", cloudHints);
            faulty = true;
          } else project = item.value;
          break;
        default:
          report(
            "project.unknown-field",
            t.unknownCloudSetting(setting.key),
            setting.keySpan,
            "warning",
            [hints.cloudSettings(CLOUD_SETTINGS)],
          );
      }
    }
    if (host === null || project === null) {
      // A setting that is there but wrong has been reported; one that is missing is reported once.
      if (!faulty) report("project.invalid-value", t.cloudObject, node.span, "error", cloudHints);
      return null;
    }
    return { host, project };
  };

  for (const member of value.members) {
    if (seen.has(member.key)) {
      report("project.invalid-value", t.setTwice(member.key), member.keySpan);
      continue;
    }
    seen.add(member.key);
    const node = member.value;
    spans[member.key] = node.span;
    switch (member.key) {
      case "$schema":
        if (node.kind !== "string") report("project.invalid-value", t.schema, node.span);
        break;
      case "name":
        if (node.kind !== "string" || node.value.trim() === "") {
          report("project.invalid-value", t.name, node.span);
        } else manifest.name = node.value;
        break;
      case "language":
        if (node.kind !== "string") {
          report("project.invalid-value", t.languageText, node.span);
        } else if (node.value !== languageVersion) {
          report(
            "project.invalid-value",
            t.languageUnsupported(node.value, languageVersion),
            node.span,
            "error",
            [hints.language(languageVersion)],
          );
          manifest.language = node.value;
        } else manifest.language = node.value;
        break;
      case "tools":
        if (node.kind !== "object") {
          report("project.invalid-value", t.toolsObject, node.span);
          break;
        }
        for (const tool of node.members) {
          if (tool.key !== TOOL_NAME) {
            report(
              "project.unknown-field",
              t.unknownTool(tool.key, TOOL_NAME),
              tool.keySpan,
              "warning",
            );
            continue;
          }
          if (tool.value.kind !== "string" || !parseRange(tool.value.value)) {
            report("project.invalid-value", t.versionRange, tool.value.span, "error", [
              hints.versionRange,
            ]);
            continue;
          }
          manifest.tools[tool.key] = tool.value.value;
          if (!satisfiesRange(options.toolVersion, tool.value.value)) {
            report(
              "project.tool-version",
              t.toolVersion(TOOL_NAME, tool.value.value, options.toolVersion),
              tool.value.span,
            );
          }
        }
        break;
      case "sources": {
        // Without one valid entry the project keeps the default, so its files are still checked.
        const paths = readPaths("sources", node);
        if (paths && paths.length > 0) manifest.sources = paths;
        break;
      }
      case "exclude": {
        const paths = readPaths("exclude", node);
        if (paths) manifest.exclude = paths;
        break;
      }
      case "format":
        if (node.kind !== "object") {
          report("project.invalid-value", t.formatObject, node.span);
          break;
        }
        for (const setting of node.members) {
          if (setting.key !== "indent") {
            report(
              "project.unknown-field",
              t.unknownFormatSetting(setting.key),
              setting.keySpan,
              "warning",
            );
            continue;
          }
          const value = setting.value;
          const valid =
            (value.kind === "string" && value.value === "tab") ||
            (value.kind === "number" &&
              Number.isInteger(value.value) &&
              value.value >= 1 &&
              value.value <= 8);
          if (!valid) {
            report("project.invalid-value", t.indent, value.span);
            continue;
          }
          manifest.format = { indent: value.kind === "string" ? "tab" : (value.value as number) };
        }
        break;
      case "theme": {
        const theme = readTheme(node);
        if (typeof theme === "string") manifest.theme = theme;
        else report("project.invalid-value", theme.message, node.span, "error", theme.hints);
        break;
      }
      case "locale":
        if (node.kind === "string" && isLocale(node.value)) manifest.locale = node.value;
        else {
          report("project.invalid-value", t.locale(LOCALES), node.span, "error", [hints.locale]);
        }
        break;
      case "catalog":
        manifest.catalog = readCatalog(node);
        break;
      case "cloud":
        manifest.cloud = readCloud(node);
        break;
      case "plugins":
        manifest.plugins = readPluginSettings(
          node,
          (message, span) => report("project.invalid-value", message, span),
          spans,
        );
        break;
      case "icons":
        if (node.kind !== "object") {
          report("project.invalid-value", t.iconsObject, node.span);
          break;
        }
        for (const alias of node.members) {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(alias.key)) {
            report("project.invalid-value", t.aliasName(alias.key), alias.keySpan);
            continue;
          }
          if (alias.value.kind !== "string" || alias.value.value.trim() === "") {
            report("project.invalid-value", t.aliasTarget, alias.value.span);
            continue;
          }
          manifest.icons[alias.key] = alias.value.value.trim();
          spans[`icons.${alias.key}`] = alias.value.span;
        }
        break;
      default:
        report("project.unknown-field", t.unknownField(member.key), member.keySpan, "warning", [
          words.hints.fields(MANIFEST_FIELDS),
        ]);
    }
  }
  const opening = { start: value.span.start, end: value.span.start + 1 };
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!seen.has(field)) {
      report("project.missing-field", t.missingField(field), opening, "error", [
        field === "language" ? hints.addLanguage(languageVersion) : hints.addName,
      ]);
    }
  }
  return { path, text, manifest, diagnostics, spans };
}

/** A path inside the project, normalised (`.` for the root), or null when it leaves the project. */
function inside(value: string): string | null {
  const normalized = normalizePath(value.replace(/\\/g, "/"));
  if (rootPrefix(normalized) !== "" || normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized === "" ? "." : normalized;
}

/** Checks the form of the `theme` field: a built-in name or `<path>#<theme id>` in the project. */
function readTheme(node: JsonValue): string | { message: string; hints: string[] } {
  const words = messages();
  const t = words.diagnostics.manifest;
  const hints = [words.hints.manifest.theme(BUILT_IN_THEMES)];
  if (node.kind !== "string") return { message: t.themeText, hints };
  const value = node.value.trim();
  if ((BUILT_IN_THEMES as readonly string[]).includes(value)) return value;
  const hash = value.lastIndexOf("#");
  if (hash < 0) return { message: t.themeName(value), hints };
  const path = normalizePath(value.slice(0, hash).replace(/\\/g, "/"));
  const id = value.slice(hash + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) return { message: t.themeId(id), hints };
  if (!path.endsWith(".meltemi")) return { message: t.themeFile(value.slice(0, hash)), hints };
  if (rootPrefix(path) !== "" || path === ".." || path.startsWith("../")) {
    return { message: t.themeOutside(value.slice(0, hash)), hints };
  }
  return `${path}#${id}`;
}
