import { getLocale, type Locale } from "@meltemi/diagrams-i18n";
import { LineIndex, createDiagnostic, type Diagnostic } from "@meltemi/diagrams-language";
import { compile, type Compilation } from "@meltemi/diagrams-model";
import { LOCK_NAME, type ImageResolver } from "@meltemi/diagrams-assets";
import { discoverAssets, type AssetServices, type ProjectAssets } from "./assets.js";
import type { DirectoryEntry, ProjectHost } from "./host.js";
import { ProjectImages, type ImageLookup } from "./images.js";
import {
  PROJECT_LIMITS,
  projectThemeSetting,
  readManifest,
  type ManifestOptions,
  type ManifestResult,
} from "./manifest.js";
import { messages } from "./messages/index.js";
import { joinPath, normalizePath } from "./paths.js";
import { loadPlugins, type ProjectPlugins } from "./plugins.js";
import { buildProgram, projectThemeFile, type FileCompilation, type Program } from "./program.js";
import { MANIFEST_NAME } from "./root.js";
import { listSources } from "./sources.js";

export interface WorkspaceOptions extends ManifestOptions {
  /** Built-in icon packs and font parsing for `assets()`; without them only project packs exist. */
  readonly assets?: AssetServices;
}

/**
 * Compiles the files of one project incrementally. Single-file compilations are cached by text
 * and reused; resolution across files runs on every request and is linear in the imports.
 * Unsaved editor buffers are given as overlays. Diagnostics are written in the interface language;
 * when it changes, the results that hold words are made again in the new one.
 */
export class Workspace {
  /** Counters for tests and diagnostics of the cache. */
  readonly stats = { compilations: 0 };
  readonly root: string;
  private readonly texts = new Map<string, string | undefined>();
  private readonly overlays = new Map<string, string>();
  private readonly compiled = new Map<
    string,
    { text: string; compilation: Compilation; typed: boolean }
  >();
  private manifestResult: ManifestResult | undefined;
  private assetsResult: ProjectAssets | undefined;
  private pluginsResult: ProjectPlugins | undefined;
  /** The file of the project's default theme, whose changes invalidate the manifest checks. */
  private themeFile: string | null = null;
  private readonly images: ProjectImages;
  /** The interface language of the words in the cached results. */
  private locale: Locale = getLocale();

  constructor(
    readonly host: ProjectHost,
    root: string,
    readonly options: WorkspaceOptions,
  ) {
    this.root = normalizePath(root);
    this.images = new ProjectImages(host, this.root);
  }

  /**
   * Forgets the cached results that hold words for people (compilations, the manifest, plugins,
   * assets and images) once the interface language is not the one they were written in.
   */
  private followLocale(): void {
    const locale = getLocale();
    if (locale === this.locale) return;
    this.locale = locale;
    this.compiled.clear();
    this.images.clear();
    this.manifestResult = undefined;
    this.pluginsResult = undefined;
    this.assetsResult = undefined;
  }

  /** An image file of the project: its format, pixel size and data URI, cached until it changes. */
  image(path: string): ImageLookup {
    this.followLocale();
    return this.images.lookup(path);
  }

  /** Resolves the `image` paths of a file, for `LayoutOptions.images`. */
  imageResolver(file: string): ImageResolver {
    return this.images.resolverFor(normalizePath(file));
  }

  /** The unsaved text of a file, or undefined when it has none. */
  overlay(path: string): string | undefined {
    return this.overlays.get(normalizePath(path));
  }

  /** Sets (or with `null` clears) the unsaved text of a file. */
  setOverlay(path: string, text: string | null): void {
    const key = normalizePath(path);
    if (text === null) this.overlays.delete(key);
    else this.overlays.set(key, text);
    this.invalidate(key);
  }

  /** Forgets what is known about a file, for example after it changed on disk. */
  invalidate(path: string): void {
    const key = normalizePath(path);
    this.texts.delete(key);
    this.images.invalidate(key);
    if (key === joinPath(this.root, MANIFEST_NAME) || key === this.themeFile) {
      this.manifestResult = undefined;
    }
    // Plugins: project.json installs them; their folders declare types and icons.
    if (
      key === joinPath(this.root, MANIFEST_NAME) ||
      this.pluginsResult?.plugins.some((p) => key === p.folder || key.startsWith(`${p.folder}/`)) ||
      this.pluginsResult?.files.includes(key)
    ) {
      this.pluginsResult = undefined;
      this.assetsResult = undefined;
      this.compiled.clear();
    }
    if (
      key === joinPath(this.root, MANIFEST_NAME) ||
      key === joinPath(this.root, LOCK_NAME) ||
      key.startsWith(`${joinPath(this.root, "assets")}/`)
    ) {
      this.assetsResult = undefined;
    }
  }

  /**
   * The plugins project.json installs, with the diagram types and icon packs they may contribute;
   * read once until project.json or a plugin's folder changes.
   */
  plugins(): ProjectPlugins {
    this.followLocale();
    this.pluginsResult ??= loadPlugins((path) => this.text(path), this.root, this.manifest());
    return this.pluginsResult;
  }

  /** The manifest of the project, read once until invalidated. */
  manifest(): ManifestResult {
    this.followLocale();
    if (!this.manifestResult) {
      const path = joinPath(this.root, MANIFEST_NAME);
      const overlay = this.overlays.get(path);
      const host: ProjectHost =
        overlay === undefined
          ? this.host
          : {
              ...this.host,
              readFile: (p) => (normalizePath(p) === path ? overlay : this.host.readFile(p)),
            };
      this.manifestResult = this.checkTheme(readManifest(host, this.root, this.options));
    }
    return this.manifestResult;
  }

  /** Adds a diagnostic when the default theme's file is missing or does not declare the theme. */
  private checkTheme(result: ManifestResult): ManifestResult {
    const setting = projectThemeSetting(result.manifest);
    this.themeFile = projectThemeFile(this.root, result);
    if (setting?.kind !== "file" || this.themeFile === null || result.text === undefined) {
      return result;
    }
    // The manifest is not read yet, so neither are its plugins: themes declare no diagrams.
    const compilation = this.load(this.themeFile, false);
    const themes = compilation?.document.themes.map((theme) => theme.id) ?? [];
    if (themes.includes(setting.id)) return result;
    const span = result.spans.theme ?? { start: 0, end: 0 };
    // Written in the interface language of the moment the manifest is checked.
    const words = messages();
    const diagnostic = createDiagnostic(new LineIndex(result.text), {
      code: "project.invalid-value",
      severity: "error",
      message: compilation
        ? words.diagnostics.manifest.themeNotDeclared(setting.path, setting.id)
        : words.diagnostics.manifest.themeFileMissing(setting.path),
      span,
      hints: [
        compilation
          ? words.hints.manifest.themesDeclared(themes)
          : words.hints.manifest.relativeToManifest,
      ],
    });
    return { ...result, diagnostics: [...result.diagnostics, diagnostic] };
  }

  /**
   * The project's icon packs, fonts, licences and lock, with their diagnostics. Cached until a
   * file under `assets/`, the lock or `project.json` changes.
   */
  assets(): ProjectAssets {
    this.followLocale();
    this.assetsResult ??= discoverAssets(
      this.host,
      this.root,
      this.manifest(),
      this.options.assets ?? {},
      (path) => this.text(path),
      (path) => this.listFolder(path),
      this.plugins().plugins,
    );
    return this.assetsResult;
  }

  /** The entries of a folder on the host, plus files that exist only as overlays. */
  private listFolder(path: string): DirectoryEntry[] {
    const folder = normalizePath(path);
    const entries = new Map<string, DirectoryEntry["kind"]>();
    for (const entry of this.host.readDirectory(folder) ?? []) entries.set(entry.name, entry.kind);
    for (const overlay of this.overlays.keys()) {
      if (!overlay.startsWith(`${folder}/`)) continue;
      const rest = overlay.slice(folder.length + 1);
      const slash = rest.indexOf("/");
      if (slash < 0) entries.set(rest, "file");
      else entries.set(rest.slice(0, slash), "directory");
    }
    return [...entries].map(([name, kind]) => ({ name, kind }));
  }

  /** The current text of a file: its overlay, or the host's content. */
  text(path: string): string | undefined {
    const key = normalizePath(path);
    const overlay = this.overlays.get(key);
    if (overlay !== undefined) return overlay;
    if (!this.texts.has(key)) this.texts.set(key, this.host.readFile(key));
    return this.texts.get(key);
  }

  /** The project's source files, sorted. */
  sources(): string[] {
    const listed = new Set(listSources(this.host, this.root, this.manifest().manifest));
    for (const path of this.overlays.keys()) {
      if (path.endsWith(".meltemi") && path.startsWith(`${this.root}/`)) listed.add(path);
    }
    // At most PROJECT_LIMITS.files; `limits()` reports the rest.
    return [...listed].sort().slice(0, PROJECT_LIMITS.files);
  }

  /** Problems with the bounds of the project, by file: too many sources. */
  limits(): ReadonlyMap<string, readonly Diagnostic[]> {
    const listed = listSources(this.host, this.root, this.manifest().manifest);
    if (listed.length <= PROJECT_LIMITS.files) return new Map();
    const manifest = this.manifest();
    const words = messages();
    const diagnostic = createDiagnostic(new LineIndex(manifest.text ?? ""), {
      code: "limit.too-many-files",
      severity: "error",
      message: words.diagnostics.limits.tooManyFiles(listed.length, PROJECT_LIMITS.files),
      span: { start: 0, end: 0 },
      hints: [words.hints.limits.tooManyFiles],
    });
    return new Map([[manifest.path, [diagnostic]]]);
  }

  /** Compiles a file and every file it imports. */
  compileFile(path: string): Program {
    return this.build([normalizePath(path)]);
  }

  /** Compiles every source of the project. */
  compileProject(): Program {
    return this.build(this.sources());
  }

  /** The compilation of one file within a program built for it. */
  file(path: string): FileCompilation | undefined {
    return this.compileFile(path).files.get(normalizePath(path));
  }

  private build(entries: readonly string[]): Program {
    this.followLocale();
    return buildProgram(
      this.host,
      this.root,
      this.manifest(),
      entries,
      (path) => this.load(path),
      (path) => this.overlays.has(path),
      // Icons are checked only by hosts that provide asset services, which know the built-in packs.
      this.options.assets ? this.assets() : undefined,
      (path) => this.images.lookup(path),
    );
  }

  private load(path: string, typed = true): Compilation | undefined {
    const text = this.text(path);
    if (text === undefined) return undefined;
    const cached = this.compiled.get(path);
    if (cached && cached.text === text && (cached.typed || !typed)) return cached.compilation;
    // Diagram types declared by the project's plugins compile with every file.
    const types = typed ? this.plugins().types : [];
    const compilation = compile(text, types.length > 0 ? { types } : {});
    this.stats.compilations++;
    this.compiled.set(path, { text, compilation, typed });
    return compilation;
  }
}
