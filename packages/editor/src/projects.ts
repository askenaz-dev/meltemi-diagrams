import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import {
  builtInLibraries,
  builtInPacks,
  librariesOf,
  type IconPack,
  type Library,
} from "@meltemi/diagrams-assets";
import { FontLibrary, type FontFileReader } from "@meltemi/diagrams-fonts";
import { LANGUAGE_VERSION, type Range, type TextEdit } from "@meltemi/diagrams-language";
import { layoutDiagram, type LayoutEngine } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import {
  Workspace,
  dirnamePath,
  findFolderRoot,
  findProjectRoot,
  formatOptionsFor,
  joinPath,
  listImageFiles,
  projectTheme,
  referencesTo,
  renameEntityInProject,
  renameInImportingStories,
  themeDefinitionsFor,
  type FileCompilation,
  type ModelLocation,
  type ProjectHost,
} from "@meltemi/diagrams-project";
import { planEdit, type EditOperation } from "@meltemi/diagrams-edit";
import type { FlowDiagram, TargetKind } from "@meltemi/diagrams-model";
import { analyzeDocument, type DocumentAnalysis, type ImportedViews } from "./analysis.js";
import { messages } from "./messages/index.js";
import { declarationOf, renameOperation } from "./services/navigation.js";
import { referenceAt } from "./syntax.js";
import { setJsonField } from "./json-edit.js";
import { entityIn, type EntityAt } from "./services/entities.js";

export interface ProjectSessionsOptions {
  readonly toolVersion: string;
  /** Reads project files; the host's default (the local file system under Node). */
  readonly host?: ProjectHost;
  /** Reads the bundled font files; the host's default (the installed Fontsource packages). */
  readonly fontReader?: FontFileReader;
  /**
   * Reads the bundled assets: `tabler/<file>`, `icons/<prefix>.json` and `libraries/<id>.json`;
   * the host's default (the installed packages and this tool's own files).
   */
  readonly assetReader?: (path: string) => string | undefined;
  /** Loads the ELK worker module; the installed `elkjs` under Node. Browsers must give it. */
  readonly loadElkWorker?: () => unknown;
  /**
   * The language of the words the tool adds to drawings and exported pages, over the projects'
   * own `locale`: the command line's `--lang`. Never the machine's language.
   */
  readonly locale?: Locale;
}

/** What a host environment provides when the options leave it out. */
export interface ProjectDefaults {
  readonly host: () => ProjectHost;
  readonly fonts: () => FontLibrary;
  readonly iconPacks: () => IconPack[];
  readonly libraries: () => Library[];
}

/**
 * The workspaces of a host, one per project root. Each project has its own font library, so its
 * fonts in `assets/fonts/` never reach another project; the built-in icon packs and the layout
 * engine are shared. Command lines, editors and the playground use it alike; the Node entry fills
 * what the options leave out with the local file system and installed packages.
 */
export class ProjectSessions {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly libraries = new Map<Workspace, FontLibrary>();
  private readonly host: ProjectHost;
  private packs: IconPack[] | undefined;
  private builtInLibraries: Library[] | undefined;
  private elk: LayoutEngine | undefined;

  constructor(
    private readonly options: ProjectSessionsOptions,
    private readonly defaults?: ProjectDefaults,
  ) {
    const host = options.host ?? defaults?.host();
    if (!host) throw new Error("ProjectSessions needs a host to read project files.");
    this.host = host;
  }

  /** The ELK engine, loaded on first use. */
  get engine(): LayoutEngine {
    return (this.elk ??= createElkEngine(
      this.options.loadElkWorker ? { loadWorker: this.options.loadElkWorker } : {},
    ));
  }

  forFile(path: string): Workspace {
    return this.get(findProjectRoot(this.host, path));
  }

  forFolder(path: string): Workspace {
    return this.get(findFolderRoot(this.host, path));
  }

  /** Every workspace opened so far. */
  all(): Workspace[] {
    return [...this.workspaces.values()];
  }

  /** The font library of a project, with its project fonts registered. */
  fontsFor(workspace: Workspace): FontLibrary {
    workspace.assets();
    return this.libraries.get(workspace)!;
  }

  /**
   * Analyses a file of a project, with `text` as its unsaved content when given (an overlay that
   * stays until `close`).
   */
  analyze(path: string, text?: string, revision = 0): DocumentAnalysis {
    const workspace = this.forFile(path);
    if (text !== undefined) workspace.setOverlay(path, text);
    const file = workspace.file(path);
    const source = text ?? workspace.text(path) ?? "";
    if (!file) return analyzeDocument({ text: source, revision, layout: { engine: this.engine } });
    return this.analyzeFile(workspace, file, source, revision);
  }

  /**
   * Where a link through an import points: the linked element (or diagram, with the cursor on the
   * diagram part) in the imported file. Same-file links are resolved by `definition`.
   */
  linkDefinition(path: string, offset: number): { path: string; range: Range } | undefined {
    const file = this.forFile(path).file(path);
    if (!file) return undefined;
    const diagram = file.compilation.document.diagrams.find(
      (d) => d.node.start <= offset && offset <= d.node.end,
    );
    const link = diagram?.links.find(
      (l) => l.range.start.offset <= offset && offset <= l.range.end.offset,
    );
    if (!link) return undefined;
    const binding = file.bindings.get(link.binding ?? link.diagram);
    if (!binding || binding.target === null) return undefined;
    const id = link.binding !== null ? link.diagram : binding.member;
    const target = file.program.files.get(binding.target);
    const linked = target?.compilation.document.diagrams.find((d) => d.id === id);
    if (!target || !linked) return undefined;
    const onDiagram =
      link.binding !== null &&
      link.diagramRange.start.offset <= offset &&
      offset <= link.diagramRange.end.offset;
    const range = onDiagram ? linked.idRange : linked.elementsById.get(link.element)?.idRange;
    return range ? { path: target.path, range } : undefined;
  }

  /** The entity under a position of a file, with the location of its model. */
  private entityOf(
    path: string,
    offset: number,
  ): { at: EntityAt; model: ModelLocation } | undefined {
    const file = this.forFile(path).file(path);
    const at = file ? entityIn(file.compilation, offset) : undefined;
    if (!file || !at) return undefined;
    return { at, model: { file: at.model.file ?? file.path, id: at.model.definition.id } };
  }

  /** Where an entity of an imported model is declared; same-file models use `definition`. */
  entityDefinition(path: string, offset: number): { path: string; range: Range } | undefined {
    const found = this.entityOf(path, offset);
    if (!found || found.at.model.file === null) return undefined;
    return { path: found.model.file, range: found.at.entity.idRange };
  }

  /** Every use of the entity under a position in the files of the project. */
  entityReferences(
    path: string,
    offset: number,
    includeDeclaration = true,
  ): { path: string; range: Range }[] | undefined {
    const found = this.entityOf(path, offset);
    if (!found) return undefined;
    const program = this.forFile(path).compileProject();
    const all: { path: string; range: Range }[] = [];
    for (const file of program.files.values()) {
      const seen = new Set<number>();
      for (const reference of referencesTo(file, found.model)) {
        if (reference.path !== found.at.entity.path || seen.has(reference.token.start)) continue;
        if (!includeDeclaration && reference.role === "declaration") continue;
        seen.add(reference.token.start);
        all.push({ path: file.path, range: file.compilation.parse.lines.range(reference.token) });
      }
    }
    return all;
  }

  /**
   * Renames the entity under a position in its model and in every file of the project that
   * names it, or undefined when there is no entity there.
   */
  entityRename(
    path: string,
    offset: number,
    newId: string,
  ):
    | { readonly ok: true; readonly edits: ReadonlyMap<string, readonly TextEdit[]> }
    | { readonly ok: false; readonly reason: string }
    | undefined {
    const found = this.entityOf(path, offset);
    if (!found) return undefined;
    const program = this.forFile(path).compileProject();
    return renameEntityInProject(program, found.model, found.at.entity.path, newId);
  }

  /**
   * Edits in the other files of the project that a rename planned in `path` needs: their stories
   * name the renamed id through an import of its diagram. Empty for other operations.
   */
  storyRenames(path: string, operation: EditOperation): ReadonlyMap<string, readonly TextEdit[]> {
    const renames = renamesOf(operation);
    if (renames.length === 0) return new Map();
    const workspace = this.forFile(path);
    const file = workspace.file(path);
    if (!file) return new Map();
    const program = workspace.compileProject();
    const all = new Map<string, TextEdit[]>();
    for (const r of renames) {
      for (const [other, edits] of renameInImportingStories(
        program,
        file.path,
        r.diagram,
        r.id,
        r.newId,
        r.kind,
      )) {
        all.set(other, [...(all.get(other) ?? []), ...edits]);
      }
    }
    return all;
  }

  /**
   * The element, relation or event under a position: written in its diagram, or a story target,
   * with the file that defines the diagram.
   */
  private diagramTargetOf(
    path: string,
    offset: number,
  ): { file: FileCompilation; diagram: FlowDiagram; id: string; kind: TargetKind } | undefined {
    const workspace = this.forFile(path);
    const file = workspace.file(path);
    if (!file) return undefined;
    for (const story of file.compilation.document.stories) {
      if (offset < story.node.start || offset > story.node.end) continue;
      const ref = story.references.find(
        (r) => r.range.start.offset <= offset && offset <= r.range.end.offset,
      );
      if (!ref) return undefined;
      const owner = ref.file === null ? file : workspace.file(ref.file);
      const diagram = owner?.compilation.document.diagrams.find((d) => d.id === ref.diagram);
      return owner && diagram ? { file: owner, diagram, id: ref.id, kind: ref.kind } : undefined;
    }
    const found = referenceAt(file.compilation, offset);
    return found
      ? {
          file,
          diagram: found.diagram,
          id: found.reference.target,
          kind: found.reference.targetKind,
        }
      : undefined;
  }

  /**
   * Where a story's imported view, or a target in it, is declared: the diagram (after `for` or
   * `view`) or the element, relation or event in the file of the diagram.
   */
  storyDefinition(path: string, offset: number): { path: string; range: Range } | undefined {
    const file = this.forFile(path).file(path);
    if (!file) return undefined;
    const story = file.compilation.document.stories.find(
      (s) => s.node.start <= offset && offset <= s.node.end,
    );
    if (!story) return undefined;
    const views = [
      { node: story.node.target, view: story.target },
      ...story.scenes.flatMap((scene) =>
        (scene.node.block?.statements ?? []).flatMap((s) =>
          s.kind === "KeywordStatement" && s.keyword.text === "view"
            ? [{ node: s.args[0], view: scene.view }]
            : [],
        ),
      ),
    ];
    for (const { node, view } of views) {
      if (!node || node.start > offset || offset > node.end) continue;
      return view.file !== null && view.diagram
        ? { path: view.file, range: view.diagram.idRange }
        : undefined;
    }
    const target = this.diagramTargetOf(path, offset);
    if (!target || target.file === file) return undefined;
    const range = declarationOf(target.diagram, target.kind, target.id);
    return range ? { path: target.file.path, range } : undefined;
  }

  /**
   * Every use of an element, relation or event of a diagram across the project, when stories of
   * other files name it: in its diagram, the stories of its file and those of the files that
   * import it. Undefined when no other file names it.
   */
  targetReferences(
    path: string,
    offset: number,
    includeDeclaration = true,
  ): { path: string; range: Range }[] | undefined {
    const target = this.diagramTargetOf(path, offset);
    if (!target) return undefined;
    const { file, diagram, id, kind } = target;
    const program = this.forFile(path).compileProject();
    const others: { path: string; range: Range }[] = [];
    for (const other of program.files.values()) {
      if (other.path === file.path) continue;
      for (const story of other.compilation.document.stories) {
        for (const r of story.references) {
          if (r.file === file.path && r.diagram === diagram.id && r.id === id && r.kind === kind) {
            others.push({ path: other.path, range: r.range });
          }
        }
      }
    }
    if (others.length === 0) return undefined;
    const lines = file.compilation.parse.lines;
    const own: { path: string; range: Range }[] = diagram.references
      .filter(
        (r) =>
          r.target === id &&
          r.targetKind === kind &&
          (includeDeclaration || (r.role !== "declaration" && r.role !== "relation-id")),
      )
      .map((r) => ({ path: file.path, range: lines.range(r.token) }));
    for (const story of file.compilation.document.stories) {
      for (const r of story.references) {
        if (r.file === null && r.diagram === diagram.id && r.id === id && r.kind === kind) {
          own.push({ path: file.path, range: r.range });
        }
      }
    }
    return [...own, ...others];
  }

  /**
   * Renames a target of an imported view named in a story: in the file of its diagram and in the
   * stories of every file that imports it. Undefined when the position is not such a target.
   */
  storyTargetRename(
    path: string,
    offset: number,
    newId: string,
  ):
    | { readonly ok: true; readonly edits: ReadonlyMap<string, readonly TextEdit[]> }
    | { readonly ok: false; readonly reason: string }
    | undefined {
    const target = this.diagramTargetOf(path, offset);
    const here = this.forFile(path).file(path);
    if (!target || !here || target.file.path === here.path) return undefined;
    const planned = planEdit(
      target.file.compilation,
      renameOperation(target.diagram.id, target.kind, target.id, newId),
    );
    if (!planned.ok) return { ok: false, reason: planned.rejection.reason };
    const edits = new Map<string, TextEdit[]>([[target.file.path, [...planned.plan.edits]]]);
    const program = this.forFile(path).compileProject();
    for (const [other, list] of renameInImportingStories(
      program,
      target.file.path,
      target.diagram.id,
      target.id,
      newId,
      target.kind,
    )) {
      edits.set(other, [...(edits.get(other) ?? []), ...list]);
    }
    return { ok: true, edits };
  }

  /**
   * Plans an operation on another file of a project, for edits a canvas asks of the file that holds
   * them, such as a token of the project's theme.
   */
  planInFile(
    path: string,
    operation: EditOperation,
  ): { ok: true; edits: readonly TextEdit[] } | { ok: false; reason: string } {
    const file = this.forFile(path).file(path);
    if (!file) return { ok: false, reason: messages().projects.notAFile(path) };
    const result = planEdit(file.compilation, operation);
    return result.ok
      ? { ok: true, edits: result.plan.edits }
      : { ok: false, reason: result.rejection.reason };
  }

  /**
   * Creates a theme for the project of a file: `themes/<id>.meltemi` with the block, and the
   * project's default theme in `project.json`, so every diagram without its own theme uses it.
   */
  createProjectTheme(
    path: string,
    id: string,
    base: string,
  ):
    | {
        ok: true;
        create: readonly { readonly path: string; readonly text: string }[];
        edits: ReadonlyMap<string, readonly TextEdit[]>;
      }
    | { ok: false; reason: string } {
    const workspace = this.forFile(path);
    const manifest = workspace.manifest();
    const words = messages().projects;
    if (manifest.text === undefined) return { ok: false, reason: words.noManifest };
    const themePath = joinPath(workspace.root, "themes", `${id}.meltemi`);
    if (this.host.readFile(themePath) !== undefined) {
      return { ok: false, reason: words.themeExists(id) };
    }
    let edits: TextEdit[];
    try {
      edits = setJsonField(manifest.text, "theme", `themes/${id}.meltemi#${id}`);
    } catch {
      return { ok: false, reason: words.unreadableManifest };
    }
    const text = `language "${LANGUAGE_VERSION}"\n\ntheme ${id} {\n  extends ${JSON.stringify(base)}\n}\n`;
    return {
      ok: true,
      create: [{ path: themePath, text }],
      edits: new Map([[manifest.path, edits]]),
    };
  }

  /** Forgets the unsaved content of a file. */
  close(path: string): void {
    this.forFile(path).setOverlay(path, null);
  }

  private analyzeFile(
    workspace: Workspace,
    file: FileCompilation,
    text: string,
    revision: number,
  ): DocumentAnalysis {
    const fonts = this.fontsFor(workspace);
    const assets = workspace.assets();
    return analyzeDocument({
      text,
      revision,
      compilation: file.compilation,
      diagnostics: file.diagnostics,
      layout: {
        themes: themeDefinitionsFor(file),
        defaultTheme: projectTheme(file.program),
        locale: this.contentLocale(workspace),
        measurer: fonts,
        icons: assets.registry,
        engine: this.engine,
        images: workspace.imageResolver(file.path),
      },
      icons: assets.registry,
      libraries: () =>
        librariesOf(assets.registry, [...(this.builtInLibraries ?? []), ...assets.libraries]),
      fonts,
      formatOptions: formatOptionsFor(workspace.manifest().manifest),
      imageFiles: () => listImageFiles(this.host, workspace.root, dirnamePath(file.path)),
      importedView: this.importedViews(workspace, file),
    });
  }

  /** Lays out diagrams of other files for the stories of `file`, once per analysis. */
  private importedViews(workspace: Workspace, file: FileCompilation): ImportedViews | undefined {
    if (file.compilation.document.stories.length === 0) return undefined;
    const cache = new Map<string, ReturnType<ImportedViews>>();
    return (path, id) => {
      const key = `${path}#${id}`;
      if (!cache.has(key)) {
        const owner = workspace.file(path);
        const diagram = owner?.compilation.document.diagrams.find((d) => d.id === id);
        cache.set(
          key,
          owner && diagram && !diagram.hasErrors
            ? {
                diagram,
                layout: layoutDiagram(owner.compilation, diagram, {
                  themes: themeDefinitionsFor(owner),
                  defaultTheme: projectTheme(owner.program),
                  locale: this.contentLocale(workspace),
                  measurer: this.fontsFor(workspace),
                  icons: workspace.assets().registry,
                  engine: this.engine,
                  images: workspace.imageResolver(owner.path),
                }),
              }
            : undefined,
        );
      }
      return cache.get(key);
    };
  }

  /**
   * The language of the words the tool adds to what a project exports: the sessions' `locale`, else
   * the project's, else English.
   */
  contentLocale(workspace: Workspace): Locale {
    return this.options.locale ?? workspace.manifest().manifest?.locale ?? DEFAULT_LOCALE;
  }

  private get(root: string): Workspace {
    let workspace = this.workspaces.get(root);
    if (!workspace) {
      const library = this.options.fontReader
        ? new FontLibrary(this.options.fontReader)
        : (this.defaults?.fonts() ?? new FontLibrary(() => undefined));
      this.packs ??= this.options.assetReader
        ? builtInPacks(this.options.assetReader)
        : (this.defaults?.iconPacks() ?? []);
      this.builtInLibraries ??= this.options.assetReader
        ? builtInLibraries(this.options.assetReader)
        : (this.defaults?.libraries() ?? []);
      workspace = new Workspace(this.host, root, {
        toolVersion: this.options.toolVersion,
        assets: {
          builtInPacks: this.packs,
          inspectFont: (data, path) => {
            const result = library.addFont(data, path);
            return result.ok ? { ok: true, ...result.font } : result;
          },
        },
      });
      this.workspaces.set(root, workspace);
      this.libraries.set(workspace, library);
    }
    return workspace;
  }
}

/** The renames of ids of diagrams in an operation, through batches. */
function renamesOf(
  operation: EditOperation,
): { diagram: string; id: string; newId: string; kind: TargetKind }[] {
  switch (operation.kind) {
    case "batch":
      return operation.operations.flatMap(renamesOf);
    case "renameElement":
      return [
        {
          diagram: operation.diagram,
          id: operation.element,
          newId: operation.newId,
          kind: "element",
        },
      ];
    case "renameRelation":
      return [
        {
          diagram: operation.diagram,
          id: operation.relation,
          newId: operation.newId,
          kind: "relation",
        },
      ];
    case "renameEvent":
      return [
        { diagram: operation.diagram, id: operation.event, newId: operation.newId, kind: "event" },
      ];
    default:
      return [];
  }
}
