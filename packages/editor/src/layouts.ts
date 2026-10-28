import type { Locale } from "@meltemi/diagrams-i18n";
import { layoutDiagram, type LayoutResult } from "@meltemi/diagrams-layout";
import type { FlowDiagram, StoryDefinition } from "@meltemi/diagrams-model";
import { storyViews, type LaidOutView } from "@meltemi/diagrams-player";
import {
  projectTheme,
  themeDefinitionsFor,
  type FileCompilation,
  type Workspace,
} from "@meltemi/diagrams-project";
import type { ProjectSessions } from "./projects.js";

/**
 * Lays out a diagram with the themes, fonts, icons and images of the file that defines it, as
 * exports and the catalog draw it; `frame: "none"` leaves the theme's frame out (an export
 * without the branding).
 */
export function layoutIn(
  workspace: Workspace,
  projects: ProjectSessions,
  owner: FileCompilation,
  diagram: FlowDiagram,
  theme: string | null,
  scenario: string | undefined,
  locale: Locale = projects.contentLocale(workspace),
  frame?: "none",
): LayoutResult {
  return layoutDiagram(owner.compilation, diagram, {
    theme,
    defaultTheme: projectTheme(owner.program),
    locale,
    themes: themeDefinitionsFor(owner),
    measurer: projects.fontsFor(workspace),
    icons: workspace.assets().registry,
    engine: projects.engine,
    images: workspace.imageResolver(owner.path),
    ...(scenario !== undefined ? { scenario } : {}),
    ...(frame ? { frame } : {}),
  });
}

/**
 * The laid-out views of a story of `file`, by view key, or undefined when one of them is missing,
 * has errors or cannot be drawn. `lay` lays out one diagram of its owner.
 */
export function storyLayoutsIn(
  workspace: Workspace,
  file: FileCompilation,
  story: StoryDefinition,
  lay: (owner: FileCompilation, diagram: FlowDiagram) => LayoutResult,
): Map<string, LaidOutView> | undefined {
  const layouts = new Map<string, LaidOutView>();
  for (const [key, view] of storyViews(story)) {
    const owner = view.file === null ? file : workspace.file(view.file);
    const diagram = owner?.compilation.document.diagrams.find((d) => d.id === view.diagram?.id);
    if (!owner || !diagram || diagram.hasErrors) return undefined;
    const layout = lay(owner, diagram);
    if (!layout.scene) return undefined;
    layouts.set(key, { diagram, layout });
  }
  return layouts;
}
