import type { FlowDiagram, StoryDefinition, TargetKind } from "@meltemi/diagrams-model";
import {
  storyTimeline,
  storyViewData,
  type StoryTimeline,
  type StoryViewData,
} from "@meltemi/diagrams-motion";
import {
  effectsDocument,
  storyDocument,
  storyViews,
  type EffectsPlayerDocument,
  type LaidOutView,
  type StoryPlayerDocument,
} from "@meltemi/diagrams-player";
import { fontFaceRules } from "@meltemi/diagrams-render";
import { diagramView, type DocumentAnalysis } from "./analysis.js";

/** Everything a canvas needs to draw any instant of a story by itself, as plain data. */
export interface StoryPlayback {
  readonly id: string;
  readonly title: string | null;
  readonly timeline: StoryTimeline;
  /** The scene, effects and relation ends of every view the story shows, by view key. */
  readonly views: Readonly<Record<string, StoryViewData>>;
  /** What an action can name in every view: elements, named relations, notes and fragments. */
  readonly targets: Readonly<
    Record<string, readonly { readonly id: string; readonly kind: TargetKind }[]>
  >;
  /** The colour of highlights and traces: the accent of the first view's theme. */
  readonly accent: string;
  /** `@font-face` rules for the text of every view, so frames drawn with font names match. */
  readonly fontFaces: readonly string[];
}

/** The stories of a document, for the canvas's story picker. */
export function storyChoices(
  analysis: DocumentAnalysis,
): { readonly id: string; readonly title: string | null }[] {
  return analysis.compilation.document.stories.map((s) => ({ id: s.id, title: s.title }));
}

function targetsOf(diagram: FlowDiagram): { id: string; kind: TargetKind }[] {
  return [
    ...diagram.elements.map((e) => ({ id: e.id, kind: "element" as const })),
    ...diagram.relations.flatMap((r) =>
      r.id === null ? [] : [{ id: r.id, kind: "relation" as const }],
    ),
    ...[...diagram.eventsByKey.values()].flatMap((e) =>
      e.id === null || e.kind === "message" ? [] : [{ id: e.id, kind: "event" as const }],
    ),
  ];
}

/** The layout of a story's view: a diagram of the document, or one of an imported file. */
function layoutOf(
  analysis: DocumentAnalysis,
  view: StoryDefinition["target"],
): LaidOutView | undefined {
  if (!view.diagram) return undefined;
  if (view.file === null) {
    const local = diagramView(analysis, view.diagram.id);
    return local?.layout ? { diagram: local.diagram, layout: local.layout } : undefined;
  }
  return analysis.importedView?.(view.file, view.diagram.id);
}

/**
 * The playback of a story of the document, or undefined when it does not exist or a view it shows
 * cannot be drawn.
 */
export function storyPlayback(analysis: DocumentAnalysis, id: string): StoryPlayback | undefined {
  const story = analysis.compilation.document.stories.find((s) => s.id === id);
  if (!story) return undefined;
  const timeline = storyTimeline(story);
  const layouts = storyLayouts(analysis, story);
  if (!layouts) return undefined;
  const views: Record<string, StoryViewData> = {};
  const targets: Record<string, { id: string; kind: TargetKind }[]> = {};
  const faces = new Set<string>();
  let accent: string | undefined;
  for (const [key, laid] of layouts) {
    const data = storyViewData(laid.diagram, laid.layout);
    if (!data) return undefined;
    views[key] = data;
    targets[key] = targetsOf(laid.diagram);
    accent ??= laid.layout.theme?.accent;
    if (analysis.fonts)
      for (const rule of fontFaceRules(data.scene, analysis.fonts)) faces.add(rule);
  }
  return {
    id: story.id,
    title: story.title,
    timeline,
    views,
    targets,
    accent: accent ?? "#1f6feb",
    fontFaces: [...faces],
  };
}

/** The laid-out views of a story by view key, or undefined when one cannot be drawn. */
function storyLayouts(
  analysis: DocumentAnalysis,
  story: StoryDefinition,
): Map<string, LaidOutView> | undefined {
  const layouts = new Map<string, LaidOutView>();
  for (const [key, view] of storyViews(story)) {
    const laid = layoutOf(analysis, view);
    if (!laid) return undefined;
    layouts.set(key, laid);
  }
  return layouts;
}

/** The player document of a story of the document, with its fonts embedded. */
export function storyPlayerDocument(
  analysis: DocumentAnalysis,
  id: string,
): StoryPlayerDocument | undefined {
  const story = analysis.compilation.document.stories.find((s) => s.id === id);
  const layouts = story ? storyLayouts(analysis, story) : undefined;
  if (!story || !layouts) return undefined;
  return storyDocument(story, layouts, {
    ...(analysis.fonts ? { fonts: analysis.fonts } : {}),
    locale: analysis.layoutOptions.locale,
  });
}

/** The player document of a diagram of the document and its effects. */
export function effectsPlayerDocument(
  analysis: DocumentAnalysis,
  id: string,
): EffectsPlayerDocument | undefined {
  const view = diagramView(analysis, id);
  if (!view?.layout?.scene) return undefined;
  return effectsDocument(
    { diagram: view.diagram, layout: view.layout },
    {
      ...(analysis.fonts ? { fonts: analysis.fonts } : {}),
      locale: analysis.layoutOptions.locale,
    },
  );
}
