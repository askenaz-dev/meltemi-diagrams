import {
  catalogData,
  catalogPage,
  type CatalogData,
  type DiagramInput,
  type LinkTarget,
  type ModelInput,
  type OpensInput,
  type StoryInput,
} from "@meltemi/diagrams-catalog";
import type { Diagnostic } from "@meltemi/diagrams-language";
import type { ElementLink, FlowDiagram } from "@meltemi/diagrams-model";
import { storyViews } from "@meltemi/diagrams-player";
import {
  DEFAULT_CATALOG,
  basenamePath,
  joinPath,
  relativePath,
  type FileCompilation,
  type Workspace,
} from "@meltemi/diagrams-project";
import { openTargetOf, resolveLink, type ViewRef } from "./drill.js";
import { layoutIn, storyLayoutsIn } from "./layouts.js";
import { messages } from "./messages/index.js";
import type { ProjectSessions } from "./projects.js";

export interface CatalogOptions {
  /** Where to write, as an absolute path: a folder (for `index.html`) or a `.html` file. */
  readonly out?: string;
  readonly title?: string;
  /** Includes the text of the catalogued files; the project's `catalog.source` by default. */
  readonly source?: boolean;
  /** The generator and its version, such as `Meltemi Diagrams 1.0.0`. */
  readonly generator: string;
  /** The catalog runtime script. */
  readonly script: () => string;
  /** A preview server's event stream, for pages that reload when the sources change. */
  readonly liveReload?: string;
}

/** A diagram or story left out of the catalog because it cannot be drawn. */
export interface SkippedEntry {
  /** Absolute path of its file. */
  readonly path: string;
  readonly id: string;
  /** Why, in the interface language, to follow the entry's name: "it has errors". */
  readonly reason: string;
}

export interface CatalogBuild {
  readonly html: string;
  /** Absolute path of the file to write. */
  readonly out: string;
  readonly data: CatalogData;
  readonly skipped: readonly SkippedEntry[];
  readonly warnings: readonly string[];
  /** Diagnostics of the catalogued files, layout included, by absolute path. */
  readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
}

/** Whether a project-relative path, or one block of it, is left out by `exclude`. */
export function isExcluded(exclude: readonly string[], file: string, id?: string): boolean {
  return exclude.some((entry) => {
    const hash = entry.indexOf("#");
    if (hash >= 0) return id !== undefined && entry === `${file}#${id}`;
    return entry === "." || file === entry || file.startsWith(`${entry}/`);
  });
}

/**
 * The catalog of a workspace's project (decision 0027): every diagram and story of its sources but
 * those excluded, laid out with the project's themes, fonts, icons and images, with links resolved
 * through imports, and only authorised metadata.
 */
export function buildCatalog(
  workspace: Workspace,
  projects: ProjectSessions,
  options: CatalogOptions,
): CatalogBuild {
  const root = workspace.root;
  const manifest = workspace.manifest().manifest;
  const settings = manifest?.catalog ?? DEFAULT_CATALOG;
  const rel = (path: string) => relativePath(root, path);
  const program = workspace.compileProject();
  const diagnostics = new Map<string, Diagnostic[]>();
  const seen = new Set<string>();
  const report = (path: string, list: readonly Diagnostic[]) => {
    for (const d of list) {
      const key = `${path}|${d.code}|${d.range.start.offset}|${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diagnostics.set(path, [...(diagnostics.get(path) ?? []), d]);
    }
  };
  const skipped: SkippedEntry[] = [];
  const warnings: string[] = [];
  // Reports are for the person who builds the catalog; the page itself takes the content language.
  const words = messages().catalog;
  const lay = (owner: FileCompilation, diagram: FlowDiagram, scenario?: string) => {
    const result = layoutIn(workspace, projects, owner, diagram, null, scenario);
    report(owner.path, result.diagnostics);
    return result;
  };

  /** Where a `link` leads: a diagram's element or a model's entity, through imports if needed. */
  const linkTarget = (file: FileCompilation, link: ElementLink): LinkTarget | null => {
    const place = resolveLink(file, link);
    if (!place) return null;
    return place.kind === "diagram"
      ? { kind: "diagram", file: rel(place.file), diagram: place.diagram, element: place.element }
      : { kind: "entity", file: rel(place.file), model: place.model, path: place.path };
  };

  const projectSources = workspace.sources();
  /** Views the catalog may open: not excluded (views with errors never open). */
  const accept = (view: ViewRef) => {
    const file = rel(view.owner.path);
    return (
      !isExcluded(settings.exclude, file) && !isExcluded(settings.exclude, file, view.diagram.id)
    );
  };
  const diagrams: DiagramInput[] = [];
  const stories: StoryInput[] = [];
  const catalogued = new Set<string>();
  for (const path of projectSources) {
    const file = program.files.get(path);
    const relative = rel(path);
    if (!file || isExcluded(settings.exclude, relative)) continue;
    report(path, file.diagnostics);
    const document = file.compilation.document;
    for (const diagram of document.diagrams) {
      if (isExcluded(settings.exclude, relative, diagram.id)) continue;
      if (diagram.hasErrors) {
        skipped.push({ path, id: diagram.id, reason: words.hasErrors });
        continue;
      }
      const views = [null, ...diagram.scenarios.map((s) => s.id)].map((scenario) => ({
        scenario,
        layout: lay(file, diagram, scenario ?? undefined),
      }));
      if (views.some((v) => !v.layout.scene)) {
        skipped.push({ path, id: diagram.id, reason: words.cannotDraw });
        continue;
      }
      const links: Record<string, LinkTarget> = {};
      for (const element of diagram.elements) {
        if (!element.entity) continue;
        links[element.id] = {
          kind: "entity",
          file: rel(element.entity.file ?? path),
          model: element.entity.model,
          path: element.entity.path,
        };
      }
      for (const link of diagram.links) {
        const target = linkTarget(file, link);
        if (target) links[link.owner] = target;
      }
      // What each element opens: a C4 child view, or the diagram its `link` names.
      const opens: Record<string, OpensInput> = {};
      for (const element of diagram.elements) {
        const target = openTargetOf(
          program,
          projectSources,
          { owner: file, diagram },
          element,
          accept,
        );
        if (!target) continue;
        opens[element.id] = {
          file: rel(target.view.owner.path),
          diagram: target.view.diagram.id,
          element: target.element,
        };
      }
      const c4 = diagram.c4?.resolved
        ? {
            level: diagram.c4.level,
            scope: diagram.c4.scope,
            model: {
              file: rel(diagram.c4.resolved.file ?? path),
              id: diagram.c4.resolved.definition.id,
            },
          }
        : null;
      diagrams.push({ file: relative, diagram, views, links, opens, c4 });
      catalogued.add(path);
    }
    for (const story of document.stories) {
      if (isExcluded(settings.exclude, relative, story.id)) continue;
      const layouts = storyLayoutsIn(workspace, file, story, (owner, diagram) =>
        lay(owner, diagram),
      );
      if (!layouts) {
        skipped.push({ path, id: story.id, reason: words.storyNotDrawn });
        continue;
      }
      const shows = [...storyViews(story)].flatMap(([key, view]) =>
        view.diagram ? [{ file: rel(view.file ?? path), diagram: view.diagram.id, key }] : [],
      );
      for (const shown of shows) {
        if (isExcluded(settings.exclude, shown.file, shown.diagram)) {
          warnings.push(
            words.excluded(`${relative}#${story.id}`, `${shown.file}#${shown.diagram}`),
          );
        }
      }
      stories.push({ file: relative, story, layouts, shows });
      catalogued.add(path);
    }
  }

  const models: ModelInput[] = [...program.files.values()]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .flatMap((file) =>
      file.compilation.document.models.map((model) => ({ file: rel(file.path), model })),
    );
  const source = options.source ?? settings.source;
  const sources: Record<string, string> | null = source ? {} : null;
  if (sources) {
    for (const path of [...catalogued].sort()) {
      const text = workspace.text(path);
      if (text !== undefined) sources[rel(path)] = text;
    }
  }

  const data = catalogData({
    title: options.title ?? settings.title ?? manifest?.name ?? basenamePath(root),
    description: settings.description,
    generator: options.generator,
    diagrams,
    stories,
    models,
    sources,
    fonts: projects.fontsFor(workspace),
    locale: projects.contentLocale(workspace),
  });
  const target = options.out ?? joinPath(root, settings.out);
  return {
    html: catalogPage(data, options.script(), {
      lang: projects.contentLocale(workspace),
      ...(options.liveReload ? { liveReload: options.liveReload } : {}),
    }),
    out: target.toLowerCase().endsWith(".html") ? target : joinPath(target, "index.html"),
    data,
    skipped,
    warnings,
    diagnostics,
  };
}
