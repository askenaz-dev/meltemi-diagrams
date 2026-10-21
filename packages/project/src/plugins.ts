// Plugins: data packages a project installs explicitly in project.json, with a pinned version, the
// permissions it grants and the compatibility each plugin declares with the model and the
// renderer. A plugin declares diagram types and icon packs; it never runs code (decision 0030).
import { integrityOf } from "@meltemi/diagrams-assets";
import {
  LineIndex,
  createDiagnostic,
  type Diagnostic,
  type Severity,
  type Span,
} from "@meltemi/diagrams-language";
import {
  MODEL_API_VERSION,
  readDiagramType,
  type DiagramTypeDefinition,
} from "@meltemi/diagrams-model";
import { parseJsonWithPositions, type JsonValue } from "./json.js";
import { PROJECT_LIMITS, type ManifestResult } from "./manifest.js";
import { messages, type PluginFailure } from "./messages/index.js";
import { joinPath, normalizePath, rootPrefix } from "./paths.js";
import { satisfiesRange } from "./semver.js";

/** The file that describes a plugin, at the top of its folder. */
export const PLUGIN_MANIFEST = "meltemi-plugin.json";

/**
 * What a project may grant a plugin. `network` is not among them: nothing a project installs
 * fetches anything.
 */
export const PLUGIN_PERMISSIONS = ["diagram-types", "icons"] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/** The renderer version plugins declare compatibility with; the SVG primitives and their styles. */
export const RENDERER_API_VERSION = "1.0.0";

/** A plugin as `project.json` installs it. */
export interface PluginSetting {
  readonly name: string;
  /** The plugin's folder, relative to the project root. */
  readonly path: string;
  /** The exact version installed. */
  readonly version: string;
  readonly permissions: readonly string[];
}

/** A plugin as the project loaded it. */
export interface LoadedPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string | null;
  readonly license: string | null;
  /** Where it comes from, as its manifest says; never fetched. */
  readonly homepage: string | null;
  /** The plugin's folder, as a project path. */
  readonly folder: string;
  /** Permissions both requested by the plugin and granted by the project. */
  readonly permissions: readonly PluginPermission[];
  readonly types: readonly DiagramTypeDefinition[];
  /** The icon pack of the plugin (a `.json` Iconify file or a folder of SVG files), when granted. */
  readonly icons: string | null;
  /** The plugin's library files, as project paths, when `icons` is granted. */
  readonly libraries: readonly string[];
  /** `sha256-<base64>` of the manifest. */
  readonly integrity: string;
}

export interface ProjectPlugins {
  readonly plugins: readonly LoadedPlugin[];
  /** Every diagram type the loaded plugins declare and may register. */
  readonly types: readonly DiagramTypeDefinition[];
  /** Problems, by the file they are in: `project.json` or a plugin's manifest. */
  readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
  /** Files read, so that changes to them reload the plugins. */
  readonly files: readonly string[];
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NAME = /^[a-z][a-z0-9-]*$/;

function member(value: JsonValue, key: string) {
  return value.kind === "object" ? value.members.find((m) => m.key === key) : undefined;
}

/**
 * Loads the plugins `project.json` installs. A plugin contributes only what its manifest declares,
 * the project grants and this version supports; everything else is a diagnostic.
 */
export function loadPlugins(
  readText: (path: string) => string | undefined,
  root: string,
  manifest: ManifestResult,
): ProjectPlugins {
  const diagnostics = new Map<string, Diagnostic[]>();
  const files: string[] = [];
  const report = (
    path: string,
    text: string | undefined,
    code: string,
    message: string,
    span: Span = { start: 0, end: 0 },
    severity: Severity = "error",
    hints?: string[],
  ) => {
    const list = diagnostics.get(path) ?? [];
    list.push(
      createDiagnostic(new LineIndex(text ?? ""), { code, severity, message, span, hints }),
    );
    diagnostics.set(path, list);
  };
  // Diagnostics are written in the interface language of the moment they are made.
  const words = messages();
  const t = words.diagnostics.plugins;
  const plugins: LoadedPlugin[] = [];
  const types: DiagramTypeDefinition[] = [];
  const owners = new Map<string, string>();

  for (const setting of manifest.manifest?.plugins ?? []) {
    const settingSpan = manifest.spans[`plugins.${setting.name}`];
    const folder = joinPath(root, setting.path);
    const path = joinPath(folder, PLUGIN_MANIFEST);
    files.push(path);
    const text = readText(path);
    if (text === undefined) {
      report(
        manifest.path,
        manifest.text,
        "plugin.not-found",
        t.notFound(setting.name, PLUGIN_MANIFEST, setting.path),
        settingSpan,
      );
      continue;
    }
    if (text.length > PROJECT_LIMITS.manifestCharacters) {
      report(
        path,
        undefined,
        "limit.too-large",
        t.tooLarge(PLUGIN_MANIFEST, text.length, PROJECT_LIMITS.manifestCharacters),
      );
      continue;
    }
    const parsed = parseJsonWithPositions(text);
    if (!parsed.ok || parsed.value.kind !== "object") {
      report(
        path,
        text,
        "plugin.invalid-manifest",
        parsed.ok ? t.notAnObject(PLUGIN_MANIFEST) : t.invalidJson(PLUGIN_MANIFEST, parsed.message),
        parsed.ok ? parsed.value.span : parsed.span,
      );
      continue;
    }
    const json = JSON.parse(text) as Record<string, unknown>;
    const at = (key: string) => member(parsed.value, key)?.value.span ?? parsed.value.span;
    const str = (key: string) => (typeof json[key] === "string" ? (json[key] as string) : null);

    const name = str("name");
    if (name !== setting.name) {
      report(
        path,
        text,
        "plugin.name-mismatch",
        t.nameMismatch(name ?? "?", setting.name),
        at("name"),
      );
      continue;
    }
    const version = str("version");
    if (version === null || !SEMVER.test(version)) {
      report(path, text, "plugin.invalid-manifest", t.version, at("version"));
      continue;
    }
    if (version !== setting.version) {
      report(
        manifest.path,
        manifest.text,
        "plugin.version-mismatch",
        t.versionMismatch(setting.name, setting.version, version),
        settingSpan,
        "error",
        [words.hints.plugins.versionMismatch],
      );
      continue;
    }
    // Compatibility with the intermediate model and the renderer.
    const compatibility = json.compatibility as Record<string, unknown> | undefined;
    const model = typeof compatibility?.model === "string" ? compatibility.model : null;
    const renderer = typeof compatibility?.renderer === "string" ? compatibility.renderer : null;
    if (model === null || renderer === null) {
      report(path, text, "plugin.incompatible", t.compatibilityMissing, at("compatibility"));
      continue;
    }
    const failures: PluginFailure[] = [
      ...(satisfiesRange(MODEL_API_VERSION, model)
        ? []
        : [{ part: "model", version: MODEL_API_VERSION, needs: model } as const]),
      ...(satisfiesRange(RENDERER_API_VERSION, renderer)
        ? []
        : [{ part: "renderer", version: RENDERER_API_VERSION, needs: renderer } as const]),
    ];
    if (failures.length > 0) {
      report(
        path,
        text,
        "plugin.incompatible",
        t.incompatible(name, version, failures),
        at("compatibility"),
      );
      continue;
    }
    // Plugins are data: code is never loaded or run.
    for (const key of ["main", "module", "exports", "scripts", "bin"]) {
      if (key in json) {
        report(
          path,
          text,
          "plugin.code-ignored",
          t.codeIgnored(key),
          member(parsed.value, key)!.keySpan,
          "warning",
        );
      }
    }
    const requested = Array.isArray(json.permissions)
      ? json.permissions.filter((p): p is string => typeof p === "string")
      : [];
    const permissions: PluginPermission[] = [];
    for (const permission of requested) {
      if (!(PLUGIN_PERMISSIONS as readonly string[]).includes(permission)) {
        report(
          path,
          text,
          "plugin.permission-denied",
          permission === "network"
            ? t.networkNeverGranted
            : t.notAPermission(permission, PLUGIN_PERMISSIONS),
          at("permissions"),
        );
      } else if (!setting.permissions.includes(permission)) {
        report(
          manifest.path,
          manifest.text,
          "plugin.permission-denied",
          t.notGranted(name, permission),
          settingSpan,
          "warning",
          [words.hints.plugins.grant(permission)],
        );
      } else permissions.push(permission as PluginPermission);
    }
    for (const permission of setting.permissions) {
      if (!requested.includes(permission)) {
        report(
          manifest.path,
          manifest.text,
          "plugin.permission-denied",
          t.notRequested(name, permission),
          settingSpan,
          "warning",
        );
      }
    }

    const declared: DiagramTypeDefinition[] = [];
    const typesJson = Array.isArray(json.diagramTypes) ? json.diagramTypes : [];
    if (typesJson.length > 0 && !permissions.includes("diagram-types")) {
      // Reported with the permissions above.
    } else {
      for (const raw of typesJson) {
        const { definition, problems } = readDiagramType(raw, { name, version });
        for (const problem of problems)
          report(path, text, "plugin.invalid-manifest", problem, at("diagramTypes"));
        if (!definition) continue;
        const owner = owners.get(definition.type);
        if (owner) {
          report(
            path,
            text,
            "plugin.duplicate-type",
            t.duplicateType(definition.type, owner),
            at("diagramTypes"),
          );
          continue;
        }
        owners.set(definition.type, name);
        declared.push(definition);
      }
    }
    let icons: string | null = null;
    const iconsPath = str("icons");
    if (iconsPath !== null && permissions.includes("icons")) {
      const normalized = normalizePath(iconsPath.replace(/\\/g, "/"));
      if (rootPrefix(normalized) !== "" || normalized.startsWith("..")) {
        report(path, text, "plugin.invalid-manifest", t.iconsPath, at("icons"));
      } else icons = joinPath(folder, normalized);
    }
    const libraries: string[] = [];
    if (Array.isArray(json.libraries) && permissions.includes("icons")) {
      for (const entry of json.libraries) {
        const normalized =
          typeof entry === "string" ? normalizePath(entry.replace(/\\/g, "/")) : "";
        if (normalized === "" || rootPrefix(normalized) !== "" || normalized.startsWith("..")) {
          report(path, text, "plugin.invalid-manifest", t.librariesPath, at("libraries"));
          continue;
        }
        libraries.push(joinPath(folder, normalized));
      }
    }
    types.push(...declared);
    plugins.push({
      name,
      version,
      description: str("description"),
      license: str("license"),
      homepage: str("homepage"),
      folder,
      permissions,
      types: declared,
      icons,
      libraries,
      integrity: integrityOf(new TextEncoder().encode(text)),
    });
  }
  return { plugins, types, diagnostics, files };
}

/** Reads the `plugins` setting of project.json; problems are reported. */
export function readPluginSettings(
  node: JsonValue,
  report: (message: string, span: Span) => void,
  spans: Record<string, Span>,
): PluginSetting[] {
  const t = messages().diagnostics.plugins;
  if (node.kind !== "object") {
    report(t.settingsObject, node.span);
    return [];
  }
  const settings: PluginSetting[] = [];
  for (const entry of node.members) {
    if (!NAME.test(entry.key)) {
      report(t.name(entry.key), entry.keySpan);
      continue;
    }
    const value = entry.value;
    const field = (key: string) => member(value, key)?.value;
    const path = field("path");
    const version = field("version");
    const permissions = field("permissions");
    if (value.kind !== "object" || path?.kind !== "string" || version?.kind !== "string") {
      report(t.pathAndVersion(entry.key), value.span);
      continue;
    }
    const normalized = normalizePath(path.value.replace(/\\/g, "/"));
    if (
      rootPrefix(normalized) !== "" ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized === ""
    ) {
      report(t.folder(path.value), path.span);
      continue;
    }
    if (!SEMVER.test(version.value)) {
      report(t.exactVersion(version.value), version.span);
      continue;
    }
    const granted: string[] = [];
    if (permissions !== undefined) {
      if (permissions.kind !== "array") {
        report(t.permissionsList, permissions.span);
        continue;
      }
      for (const item of permissions.items) {
        if (
          item.kind !== "string" ||
          !(PLUGIN_PERMISSIONS as readonly string[]).includes(item.value)
        ) {
          report(
            item.kind === "string" && item.value === "network"
              ? t.networkNotGrantable
              : t.permissions(PLUGIN_PERMISSIONS),
            item.span,
          );
          continue;
        }
        granted.push(item.value);
      }
    }
    spans[`plugins.${entry.key}`] = entry.keySpan;
    settings.push({
      name: entry.key,
      path: normalized,
      version: version.value,
      permissions: granted,
    });
  }
  return settings;
}
