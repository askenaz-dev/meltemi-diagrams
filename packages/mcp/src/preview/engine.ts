// The drawing of a preview, with nothing of the platform: a project's files in memory, compiled,
// laid out and rendered by the command line's own export (`produceExport` of
// `@meltemi/diagrams-editor`, which `meltemi-diagrams export` calls) with the `system` font policy,
// so the SVG of a preview is the one `meltemi-diagrams export <file> --fonts system` writes for the
// same files. The fonts measured are the files the command line reads for the bundled families the
// renderer carries; the layout is ELK's main-thread dispatcher (a Durable Object has no Web Worker).
//
// What is costly to make is made once per object and shared by every drawing: the font library of
// the bundled families (its parsed fonts and measured widths), the icon packs and ELK. A project
// with fonts of its own in `assets/fonts/` gets a library of its own for each drawing, so that a font
// it removed is never measured again.

import {
  builtInLibraries,
  builtInPacks,
  type IconPack,
  type Library,
} from "@meltemi/diagrams-assets";
import {
  ProjectSessions,
  buildCatalog,
  produceExport,
  type ExportContext,
  type ExportRequest,
} from "@meltemi/diagrams-editor";
import { FontLibrary, bundledFamily, type FontFileReader } from "@meltemi/diagrams-fonts";
import { sortDiagnostics, type Diagnostic } from "@meltemi/diagrams-language";
import type { LayoutEngine } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { createMemoryHost, type ProjectHost, type Workspace } from "@meltemi/diagrams-project";
import {
  MAX_REPORT_DIAGNOSTICS,
  failure,
  type CatalogOutcome,
  type CatalogRequest,
  type ValidateOutcome,
  type ValidateRequest,
  type RenderFailure,
  type ReportDiagnostic,
  type ValidRequest,
} from "./protocol.js";

/** What the engine is given by its host: the bundled files it reads and ELK. */
export interface EngineResources {
  /** The version the sessions present, the command line's (`project.json` `tools` checks it). */
  readonly toolVersion: string;
  /** Reads the font files the library measures with, by their package-relative paths. */
  readonly fonts: FontFileReader;
  /** The bundled families `fonts` holds the files of; the others are measured with the fallback. */
  readonly measured: ReadonlySet<string>;
  /** Reads the bundled assets: `tabler/<file>`, `icons/<prefix>.json` and `libraries/<id>.json`. */
  readonly assets: (path: string) => string | undefined;
  /** The exports of `elkjs/lib/elk-worker.min.js`; the installed `elkjs` under Node when left out. */
  readonly loadElkWorker?: () => unknown;
}

/** A drawn SVG and what the report says of it. */
export interface Drawing {
  readonly ok: true;
  readonly svg: string;
  /** The SVG's size, in its units. */
  readonly width: number;
  readonly height: number;
  readonly elements: number;
  readonly relations: number;
  readonly diagnostics: readonly ReportDiagnostic[];
  readonly truncated: boolean;
  /**
   * Every family the text asks for, with whether the library measured it with its own files: the
   * report's `estimatedFonts` are the ones it did not (or, in a PNG, the ones not drawn either).
   */
  readonly families: readonly { readonly family: string; readonly measured: boolean }[];
  /** The project's own fonts the library registered: their families and paths (in `binaries`). */
  readonly projectFonts: readonly { readonly family: string; readonly path: string }[];
}

/** The folder of a project's own fonts (`FONTS_FOLDER` of `@meltemi/diagrams-project`). */
const PROJECT_FONT = /(^|\/)assets\/fonts\/[^/]+$/i;

/** The project's root in the in-memory file system: the room's paths are below it. */
const ROOT = "/";

/** Project sessions whose layout engine is one the engine keeps: ELK starts once per object. */
class PreviewSessions extends ProjectSessions {
  constructor(
    options: ConstructorParameters<typeof ProjectSessions>[0],
    defaults: ConstructorParameters<typeof ProjectSessions>[1],
    private readonly shared: LayoutEngine,
  ) {
    super(options, defaults);
  }

  override get engine(): LayoutEngine {
    return this.shared;
  }
}

function reportDiagnostic(path: string, diagnostic: Diagnostic): ReportDiagnostic {
  return {
    path: path.startsWith(ROOT) ? path.slice(ROOT.length) : path,
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    line: diagnostic.range.start.line,
    column: diagnostic.range.start.column,
  };
}

/** The first family of a CSS font stack, without quotes. */
function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * A font library that remembers the stacks the layout measured with: it asks `knows` of each
 * stack before measuring with it (a style's written stack alone, else the theme's), so these are
 * the families the report judges, as the layout used them.
 */
class RecordingLibrary extends FontLibrary {
  readonly asked = new Set<string>();

  override knows(stack: string): boolean {
    this.asked.add(stack);
    return super.knows(stack);
  }
}

const count = (svg: string, role: string): number => svg.split(`data-role="${role}"`).length - 1;

function sizeOf(svg: string): { width: number; height: number } {
  const head = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  const width = Number(/\bwidth="([\d.]+)"/.exec(head)?.[1] ?? 0);
  const height = Number(/\bheight="([\d.]+)"/.exec(head)?.[1] ?? 0);
  return { width, height };
}

export class PreviewEngine {
  private readonly library: RecordingLibrary;
  private readonly packs: IconPack[];
  private readonly libraries: Library[];
  private readonly elk: LayoutEngine;

  constructor(private readonly resources: EngineResources) {
    this.library = new RecordingLibrary(resources.fonts);
    this.packs = builtInPacks(resources.assets);
    this.libraries = builtInLibraries(resources.assets);
    this.elk = createElkEngine(
      resources.loadElkWorker ? { loadWorker: resources.loadElkWorker } : {},
    );
  }

  /** Draws the request's diagram or story frame as the command line's SVG, or says why it cannot. */
  draw(request: ValidRequest): Drawing | RenderFailure {
    const contents: Record<string, string | Uint8Array> = {};
    for (const [path, text] of Object.entries(request.files)) contents[`${ROOT}${path}`] = text;
    for (const [path, bytes] of Object.entries(request.binaries)) {
      contents[`${ROOT}${path}`] = bytes;
    }
    const host = createMemoryHost(contents);
    const ownFonts = Object.keys(request.binaries).some((path) => PROJECT_FONT.test(path));
    const library = ownFonts ? new RecordingLibrary(this.resources.fonts) : this.library;
    // The shared library's record is this drawing's: drawing is synchronous, so nothing else
    // measures in between.
    library.asked.clear();
    const sessions = new PreviewSessions(
      { toolVersion: this.resources.toolVersion, host },
      {
        host: () => host,
        fonts: () => library,
        iconPacks: () => this.packs,
        libraries: () => this.libraries,
      },
      this.elk,
    );
    const path = `${ROOT}${request.file}`;
    const workspace = sessions.forFile(path);
    const file = workspace.file(path);
    if (!file) return failure("request.invalid", `${request.file} is not a .meltemi file.`);

    const diagnostics: ReportDiagnostic[] = file.diagnostics.map((d) =>
      reportDiagnostic(file.path, d),
    );
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      return failure(
        "diagram.invalid",
        `${request.file} has ${errors.length === 1 ? "an error" : `${errors.length} errors`}: nothing is drawn until it compiles.`,
        diagnostics.slice(0, MAX_REPORT_DIAGNOSTICS),
      );
    }

    const document = file.compilation.document;
    let target: ExportRequest["target"];
    if (request.story !== null) {
      const story = document.stories.find((s) => s.id === request.story);
      if (!story) {
        const names = document.stories.map((s) => s.id);
        return failure(
          "request.invalid",
          `${request.file} has no story ${request.story}${names.length > 0 ? `; it has ${names.join(", ")}` : ""}.`,
        );
      }
      target = { kind: "story", story };
    } else {
      const drawable = document.diagrams.filter((d) => !d.hasErrors);
      const diagram =
        request.diagram === null ? drawable[0] : drawable.find((d) => d.id === request.diagram);
      if (!diagram) {
        if (drawable.length === 0) {
          return failure(
            "diagram.invalid",
            `${request.file} has no diagram to draw: models, themes and stories draw through a diagram.`,
            diagnostics.slice(0, MAX_REPORT_DIAGNOSTICS),
          );
        }
        return failure(
          "request.invalid",
          `${request.file} has no diagram ${request.diagram}; it has ${drawable.map((d) => d.id).join(", ")}.`,
        );
      }
      target = { kind: "diagram", diagram, owner: file };
    }

    // The command line's own request for `export <file> --fonts system` (`export-command.ts`).
    const exportRequest: ExportRequest = {
      target,
      format: "svg",
      theme: request.theme,
      fonts: "system",
      motion: "static",
      at: request.at,
      scenario: undefined,
      scale: 2,
      size: null,
      background: null,
      link: null,
      embed: false,
      autoplay: false,
      loop: false,
      fps: null,
      durationMs: null,
      out: null,
    };
    const printed = new Set(file.diagnostics.map((d) => `${d.code}@${d.range.start.offset}`));
    const context: ExportContext = {
      file,
      workspace,
      projects: sessions,
      playerScript: () => "",
      report: (where, found) => {
        for (const d of found) diagnostics.push(reportDiagnostic(where, d));
      },
      printed,
    };
    const output = produceExport(context, exportRequest);
    const listed = () => diagnostics.slice(0, MAX_REPORT_DIAGNOSTICS);
    if ("problem" in output) return failure("diagram.invalid", output.problem, listed());
    if (!("text" in output)) return failure("diagram.invalid", "Nothing to draw.", listed());
    const svg = output.text;

    const families = new Map<string, boolean>();
    for (const stack of library.asked) {
      const family = library.family(stack);
      if (family === undefined) {
        families.set(firstFamily(stack), false);
        continue;
      }
      const bundled = bundledFamily(family);
      families.set(family, bundled === undefined || this.resources.measured.has(family));
    }
    return {
      ok: true,
      svg,
      ...sizeOf(svg),
      elements: count(svg, "element"),
      relations: count(svg, "relation"),
      diagnostics: diagnostics.slice(0, MAX_REPORT_DIAGNOSTICS),
      truncated: diagnostics.length > MAX_REPORT_DIAGNOSTICS,
      families: [...families].map(([family, measured]) => ({ family, measured })),
      projectFonts: ownFonts
        ? library.projectFonts().map((font) => ({
            family: font.family,
            path: font.source.startsWith(ROOT) ? font.source.slice(ROOT.length) : font.source,
          }))
        : [],
    };
  }
  /** Project sessions over a host, with the engine's shared fonts, icons, libraries and ELK. */
  private sessionsOver(host: ProjectHost, library: FontLibrary): PreviewSessions {
    return new PreviewSessions(
      { toolVersion: this.resources.toolVersion, host },
      {
        host: () => host,
        fonts: () => library,
        iconPacks: () => this.packs,
        libraries: () => this.libraries,
      },
      this.elk,
    );
  }

  /**
   * The diagnostics of a project's files, as `meltemi-diagrams validate <folder>` gathers them (the
   * manifest, the limits, plugins and assets, every source with its composition), for the paths
   * asked or for all. The host reads the texts only: an image is not checked (`unreadable`) and a
   * font is not measured, so a check never needs the bytes of the project's images and fonts.
   */
  validate(request: ValidateRequest): ValidateOutcome {
    const contents: Record<string, string> = {};
    for (const [path, text] of Object.entries(request.files)) contents[`${ROOT}${path}`] = text;
    const memory = createMemoryHost(contents);
    const host: ProjectHost = {
      readFile: (path) => memory.readFile(path),
      readDirectory: (path) => memory.readDirectory(path),
    };
    const sessions = this.sessionsOver(host, this.library);
    const workspace = sessions.forFolder(ROOT);
    const results = new Map<string, Diagnostic[]>();
    const add = (path: string, list: readonly Diagnostic[]) =>
      results.set(path, [...(results.get(path) ?? []), ...list]);
    const manifest = workspace.manifest();
    if (manifest.diagnostics.length > 0) add(manifest.path, manifest.diagnostics);
    for (const [path, list] of [
      ...workspace.limits(),
      ...workspace.plugins().diagnostics,
      ...workspace.assets().diagnostics,
    ]) {
      add(path, list);
    }
    const asked = request.paths
      ? new Set(request.paths.map((path) => `${ROOT}${path}`))
      : undefined;
    const program = workspace.compileProject();
    for (const [file, compiled] of program.files) {
      if (!file.startsWith(ROOT) || (asked && !asked.has(file))) continue;
      const list = [...compiled.diagnostics];
      if (request.layout !== false && !list.some((d) => d.severity === "error")) {
        const seen = new Set(list.map((d) => `${d.code}@${d.range.start.offset}|${d.message}`));
        for (const d of sessions.analyze(file).diagnostics) {
          if (
            d.code.startsWith("layout.") &&
            !seen.has(`${d.code}@${d.range.start.offset}|${d.message}`)
          ) {
            list.push(d);
          }
        }
      }
      add(file, list);
    }
    const all: ReportDiagnostic[] = [];
    for (const [path, list] of results) {
      if (asked && !asked.has(path)) continue;
      for (const d of sortDiagnostics(list)) all.push(reportDiagnostic(path, d));
    }
    return {
      ok: true,
      diagnostics: all.slice(0, MAX_REPORT_DIAGNOSTICS),
      errors: all.filter((d) => d.severity === "error").length,
      warnings: all.filter((d) => d.severity === "warning").length,
      truncated: all.length > MAX_REPORT_DIAGNOSTICS,
    };
  }

  /**
   * The project's catalog, as `meltemi-diagrams build catalog` builds it (`buildCatalog` of
   * `@meltemi/diagrams-editor`, the build the page's publishing and the command line share), over
   * the files and the bytes of the images and fonts they use. A catalog with nothing in it is
   * `diagram.invalid`, with the diagnostics that say why.
   */
  catalog(request: CatalogRequest): CatalogOutcome {
    const contents: Record<string, string | Uint8Array> = {};
    for (const [path, text] of Object.entries(request.files)) contents[`${ROOT}${path}`] = text;
    for (const [path, bytes] of Object.entries(request.binaries ?? {})) {
      contents[`${ROOT}${path}`] = bytes;
    }
    const host = createMemoryHost(contents);
    const ownFonts = Object.keys(request.binaries ?? {}).some((path) => PROJECT_FONT.test(path));
    const library = ownFonts ? new RecordingLibrary(this.resources.fonts) : this.library;
    const sessions = this.sessionsOver(host, library);
    const workspace: Workspace = sessions.forFolder(ROOT);
    const build = buildCatalog(workspace, sessions, {
      generator: request.generator,
      script: () => request.script,
    });
    const diagnostics: ReportDiagnostic[] = [];
    for (const [path, list] of build.diagnostics) {
      for (const d of sortDiagnostics(list)) diagnostics.push(reportDiagnostic(path, d));
    }
    const listed = diagnostics.slice(0, MAX_REPORT_DIAGNOSTICS);
    const skipped = build.skipped.map((entry) => {
      const path = entry.path.startsWith(ROOT) ? entry.path.slice(ROOT.length) : entry.path;
      return `${path}#${entry.id}`;
    });
    if (build.data.entries.length === 0) {
      return failure(
        "diagram.invalid",
        skipped.length > 0
          ? `Nothing in the project can be drawn: ${skipped.join(", ")} cannot be.`
          : "The project has no diagram or story to publish.",
        listed,
      );
    }
    return {
      ok: true,
      html: build.html,
      entries: build.data.entries.length,
      skipped,
      diagnostics: listed,
      truncated: diagnostics.length > MAX_REPORT_DIAGNOSTICS,
    };
  }
}
