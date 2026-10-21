import type { Locale } from "@meltemi/diagrams-i18n";
import { c4TypeName, type LayoutResult } from "@meltemi/diagrams-layout";
import type { FlowDiagram, StoryDefinition } from "@meltemi/diagrams-model";
import {
  motionDuration,
  storyTimeline,
  storyViewData,
  viewKey,
  type DrillTransition,
  type StoryTimeline,
  type StoryViewData,
} from "@meltemi/diagrams-motion";
import { fontFaceRules, type FontProvider } from "@meltemi/diagrams-render";
import {
  PLAYER_FORMAT,
  PLAYER_VERSION,
  type EffectsPlayerDocument,
  type EffectsViewData,
  type ElementDetails,
  type OpenTarget,
  type RelationDetails,
  type StoryPlayerDocument,
  type ViewDetails,
  type ViewNames,
} from "./format.js";

export * from "./format.js";

/** A diagram with its layout, as a host laid it out with its themes and assets. */
export interface LaidOutView {
  readonly diagram: FlowDiagram;
  readonly layout: LayoutResult;
}

/** What an element opens, as a host resolved it: views are named by the host's keys. */
export interface HostOpenTarget {
  readonly view: string;
  readonly element: string | null;
  readonly transition: DrillTransition;
}

/** The views a host bundles with a diagram and what their elements open. */
export interface DrillViews {
  /** The host's key of the diagram's own view. */
  readonly root: string;
  /** The other views, by the host's keys, in the order they were reached. */
  readonly views: ReadonlyMap<string, LaidOutView>;
  /** By the host's view key, then element id: what the element opens. */
  readonly opens: ReadonlyMap<string, Readonly<Record<string, HostOpenTarget>>>;
}

export interface DocumentOptions {
  /** Embeds the fonts of the text; without it, frames use the fonts of the viewer. */
  readonly fonts?: FontProvider;
  /** The content language of the type words; English by default, never the machine's. */
  readonly locale?: Locale;
  /** Effects documents: the views a drill-down reaches and what opens them. */
  readonly drill?: DrillViews;
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

function namesOf(diagram: FlowDiagram): ViewNames {
  const labels: Record<string, string> = {};
  for (const element of diagram.elements) labels[element.id] = oneLine(element.label || element.id);
  for (const relation of diagram.relations) {
    if (relation.id !== null) labels[relation.id] = oneLine(relation.label ?? relation.id);
  }
  for (const event of diagram.eventsByKey.values()) {
    if (event.id === null || event.kind === "message") continue;
    const text =
      event.kind === "note"
        ? event.text
        : event.kind === "fragment"
          ? (event.branches[0]?.condition ?? event.operator)
          : event.id;
    labels[event.id] = oneLine(text || event.id);
  }
  return { title: diagram.properties.title, labels };
}

/**
 * The details of a view: only the compiled diagram's labels, kinds, type words, technology,
 * descriptions, URLs, entity paths and relation fields; never comments, positions or paths.
 */
export function detailsOf(
  diagram: FlowDiagram,
  locale: Locale = "en",
  opens: Readonly<Record<string, OpenTarget>> = {},
  parent: ViewDetails["parent"] = null,
): ViewDetails {
  const elements: Record<string, ElementDetails> = {};
  for (const element of diagram.elements) {
    const linked = element.link?.target === "model" ? element.link.element : null;
    elements[element.id] = {
      kind: element.kind,
      type: c4TypeName(element, locale),
      technology: element.technology,
      description: element.description,
      url: element.url,
      external: element.external,
      entity: element.entity?.path ?? linked,
      opens: opens[element.id] ?? null,
    };
  }
  const relations: Record<string, RelationDetails> = {};
  for (const relation of diagram.relations) {
    relations[relation.key] = {
      label: relation.label === null ? null : oneLine(relation.label),
      technology: relation.technology,
      description: relation.description,
      assumption: relation.assumption,
      derived: relation.derived,
      sources: relation.sources,
      async: relation.async,
    };
  }
  const c4 = diagram.c4 ? { level: diagram.c4.level, scope: diagram.c4.scope } : null;
  return { elements, relations, c4, parent };
}

function facesOf(views: readonly StoryViewData[], fonts: FontProvider | undefined): string[] {
  if (!fonts) return [];
  const faces = new Set<string>();
  for (const view of views) for (const rule of fontFaceRules(view.scene, fonts)) faces.add(rule);
  return [...faces];
}

/** A document key for a diagram id that no view of `taken` uses yet: `id`, `id-2`, `id-3`… */
function freeKey(id: string, taken: Readonly<Record<string, unknown>>): string {
  let name = id;
  for (let n = 2; Object.hasOwn(taken, name); n++) name = `${id}-${n}`;
  return name;
}

/**
 * The player document of a story, from the laid-out views it shows by view key, or undefined when
 * one of them is missing or cannot be drawn.
 */
export function storyDocument(
  story: StoryDefinition,
  layouts: ReadonlyMap<string, LaidOutView>,
  options: DocumentOptions = {},
): StoryPlayerDocument | undefined {
  const written = storyTimeline(story);
  const views: Record<string, StoryViewData> = {};
  const names: Record<string, ViewNames> = {};
  const details: Record<string, ViewDetails> = {};
  // The document names views by diagram id, never by the file an imported diagram comes from,
  // so no local path reaches a page (decision 0027).
  const keys = new Map<string, string>();
  let accent: string | undefined;
  for (const key of written.views) {
    const laid = layouts.get(key);
    const data = laid ? storyViewData(laid.diagram, laid.layout) : undefined;
    if (!laid || !data) return undefined;
    const name = freeKey(laid.diagram.id, views);
    keys.set(key, name);
    views[name] = data;
    names[name] = namesOf(laid.diagram);
    details[name] = detailsOf(laid.diagram, options.locale);
    accent ??= laid.layout.theme?.accent;
  }
  const timeline: StoryTimeline = {
    ...written,
    views: written.views.map((key) => keys.get(key)!),
    scenes: written.scenes.map((scene) => ({ ...scene, view: keys.get(scene.view) ?? scene.view })),
  };
  return {
    format: PLAYER_FORMAT,
    version: PLAYER_VERSION,
    kind: "story",
    id: story.id,
    title: story.title,
    description: story.description,
    timeline,
    views,
    names,
    details,
    accent: accent ?? "#1f6feb",
    fontFaces: facesOf(Object.values(views), options.fonts),
  };
}

/** The view keys a story shows, with the view each key stands for. */
export function storyViews(story: StoryDefinition): Map<string, StoryDefinition["target"]> {
  const keys = new Map<string, StoryDefinition["target"]>();
  for (const view of [story.target, ...story.scenes.map((s) => s.view)]) {
    const key = viewKey(view);
    if (!keys.has(key)) keys.set(key, view);
  }
  return keys;
}

/**
 * The player document of a diagram and its effects, with the views a drill-down reaches from it
 * when the host gives them, or undefined when the diagram cannot be drawn. A bundled view that
 * cannot be drawn is left out, with the targets that lead to it.
 */
export function effectsDocument(
  view: LaidOutView,
  options: DocumentOptions = {},
): EffectsPlayerDocument | undefined {
  const root = storyViewData(view.diagram, view.layout);
  if (!root) return undefined;
  const drill = options.drill;
  const rootHost = drill?.root ?? view.diagram.id;
  // Host keys to document keys, root first, in the order the host reached the views.
  const laidOut = new Map<string, LaidOutView>([[rootHost, view]]);
  for (const [host, other] of drill?.views ?? []) if (!laidOut.has(host)) laidOut.set(host, other);
  const keys = new Map<string, string>();
  const views: Record<string, EffectsViewData> = {};
  const names: Record<string, ViewNames> = {};
  const diagrams = new Map<string, FlowDiagram>();
  for (const [host, laid] of laidOut) {
    const data = host === rootHost ? root : storyViewData(laid.diagram, laid.layout);
    if (!data) continue;
    const name = freeKey(laid.diagram.id, views);
    keys.set(host, name);
    views[name] = { ...data, durationMs: motionDuration(data.plan) };
    names[name] = namesOf(laid.diagram);
    diagrams.set(name, laid.diagram);
  }
  // What each element opens, by document keys; targets outside the document are dropped.
  const opens = new Map<string, Record<string, OpenTarget>>();
  for (const [host, name] of keys) {
    const written = drill?.opens.get(host) ?? {};
    const targets: Record<string, OpenTarget> = {};
    for (const [id, target] of Object.entries(written)) {
      const to = keys.get(target.view);
      if (to === undefined || to === name) continue;
      targets[id] = { view: to, element: target.element, transition: target.transition };
    }
    opens.set(name, targets);
  }
  // The parent of a view: the first view, in the order reached, with an element that opens it.
  const parents = new Map<string, ViewDetails["parent"]>();
  for (const [name, targets] of opens) {
    for (const [element, target] of Object.entries(targets)) {
      if (target.view === keys.get(rootHost) || parents.has(target.view)) continue;
      parents.set(target.view, { view: name, element });
    }
  }
  const details: Record<string, ViewDetails> = {};
  for (const [name, diagram] of diagrams) {
    details[name] = detailsOf(
      diagram,
      options.locale,
      opens.get(name) ?? {},
      parents.get(name) ?? null,
    );
  }
  const key = keys.get(rootHost)!;
  return {
    format: PLAYER_FORMAT,
    version: PLAYER_VERSION,
    kind: "effects",
    id: view.diagram.id,
    key,
    title: view.diagram.properties.title,
    description: view.diagram.properties.description,
    views,
    names,
    details,
    accent: view.layout.theme?.accent ?? "#1f6feb",
    fontFaces: facesOf(Object.values(views), options.fonts),
  };
}
