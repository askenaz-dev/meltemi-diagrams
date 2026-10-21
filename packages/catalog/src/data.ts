import type { Locale } from "@meltemi/diagrams-i18n";
import type { LayoutResult } from "@meltemi/diagrams-layout";
import type {
  C4Level,
  DiagramType,
  FlowDiagram,
  ModelDefinition,
  StoryDefinition,
} from "@meltemi/diagrams-model";
import {
  storyTimeline,
  transitionFor,
  type DrillTransition,
  type TimelineAction,
} from "@meltemi/diagrams-motion";
import {
  effectsDocument,
  rootView,
  storyDocument,
  type EffectsPlayerDocument,
  type LaidOutView,
  type StoryPlayerDocument,
} from "@meltemi/diagrams-player";
import type { Scene } from "@meltemi/diagrams-layout";
import {
  embeddableFaces,
  fontFaceRule,
  type EmbeddableFace,
  type FontProvider,
} from "@meltemi/diagrams-render";

export const CATALOG_FORMAT = "meltemi-catalog";
export const CATALOG_VERSION = 2;

/** Where an element leads: an element of another diagram, or a model entity. */
export type LinkTarget =
  | {
      readonly kind: "diagram";
      /** Project-relative path of the diagram's file. */
      readonly file: string;
      readonly diagram: string;
      readonly element: string;
    }
  | {
      readonly kind: "entity";
      /** Project-relative path of the model's file. */
      readonly file: string;
      readonly model: string;
      readonly path: string;
    };

/** A diagram as the host laid it out: one view per sequence scenario, after the diagram as written. */
export interface DiagramInput {
  /** Project-relative path of the file, such as `diagrams/checkout.meltemi`. */
  readonly file: string;
  readonly diagram: FlowDiagram;
  readonly views: readonly { readonly scenario: string | null; readonly layout: LayoutResult }[];
  /** Where each linked element leads, by element id, resolved by the host. */
  readonly links: Readonly<Record<string, LinkTarget>>;
  /**
   * What each element opens, by element id, as the host resolved it: a C4 child view, or the
   * diagram its `link` names with the element to select there.
   */
  readonly opens?: Readonly<Record<string, OpensInput>>;
  /** C4 views: the level, the scope's path and the model, its file project-relative. */
  readonly c4?: {
    readonly level: C4Level;
    readonly scope: string | null;
    readonly model: { readonly file: string; readonly id: string };
  } | null;
}

/** A view an element opens, by project-relative file and diagram id. */
export interface OpensInput {
  readonly file: string;
  readonly diagram: string;
  readonly element: string | null;
}

export interface StoryInput {
  readonly file: string;
  readonly story: StoryDefinition;
  /** The laid-out views of the story by view key. */
  readonly layouts: ReadonlyMap<string, LaidOutView>;
  /**
   * The diagrams the story shows, in order of first use, with the view key the story's timeline
   * names each by (the diagram id, or `<file>#<id>` for an imported one).
   */
  readonly shows: readonly {
    readonly file: string;
    readonly diagram: string;
    readonly key?: string;
  }[];
}

export interface ModelInput {
  readonly file: string;
  readonly model: ModelDefinition;
}

export interface CatalogInput {
  readonly title: string;
  readonly description: string | null;
  /** The generator and its version, such as `Meltemi Diagrams 1.0.0`. */
  readonly generator: string;
  /** In the order the catalog lists them: by file, then source order. */
  readonly diagrams: readonly DiagramInput[];
  readonly stories: readonly StoryInput[];
  readonly models: readonly ModelInput[];
  /** The text of each catalogued file by project-relative path, when the source is included. */
  readonly sources: Readonly<Record<string, string>> | null;
  /** Embeds the fonts of the drawings; without it, drawings use the viewer's fonts. */
  readonly fonts?: FontProvider;
  /** The content language of the words the documents carry (C4 type words); English by default. */
  readonly locale?: Locale;
}

export interface CatalogView {
  /** The sequence scenario the view draws, or null for the diagram as written. */
  readonly scenario: string | null;
  /** The scenario's label, or `As written`; pages name the view as written in their language. */
  readonly label: string;
  readonly document: EffectsPlayerDocument;
  /** Indexes in `CatalogData.fontFaces` of the faces the view's text uses. */
  readonly faces: readonly number[];
}

export interface CatalogElement {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly description: string | null;
  readonly technology: string | null;
  readonly url: string | null;
  readonly external: boolean;
  /** Where the element leads in the catalog, when its target is catalogued. */
  readonly target: CatalogTarget | null;
  /** The catalogued view a double click or the plus badge opens, and how. */
  readonly opens: CatalogOpens | null;
  /** Keys of the stories whose actions target the element in this diagram. */
  readonly stories: readonly string[];
}

/** A catalogued view an element opens: the entry, the element to select, the transition. */
export interface CatalogOpens {
  readonly entry: string;
  readonly element: string | null;
  readonly transition: DrillTransition;
}

export type CatalogTarget =
  | { readonly kind: "diagram"; readonly entry: string; readonly element: string }
  | { readonly kind: "entity"; readonly entity: string };

export interface CatalogRelation {
  readonly key: string;
  /** The ends' labels, for the tables, and their ids. */
  readonly from: string;
  readonly to: string;
  readonly fromId: string;
  readonly toId: string;
  /** Keys of the stories whose actions target the relation in this diagram. */
  readonly stories: readonly string[];
  readonly label: string | null;
  readonly description: string | null;
  readonly technology: string | null;
  /** Why the relation is assumed, when it was inferred and not confirmed. */
  readonly assumption: string | null;
}

interface EntryBase {
  /** The file path without `.meltemi`, then the block id: `diagrams/checkout/checkout`. */
  readonly key: string;
  readonly id: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly file: string;
  /** The file's folder, `""` at the project root. */
  readonly folder: string;
}

export interface DiagramEntry extends EntryBase {
  readonly kind: "diagram";
  readonly type: DiagramType;
  readonly views: readonly CatalogView[];
  readonly elements: readonly CatalogElement[];
  readonly relations: readonly CatalogRelation[];
  /** Keys of the stories that show the diagram. */
  readonly stories: readonly string[];
  /** Keys of the diagrams its elements link to, and of those that link to it. */
  readonly linksTo: readonly string[];
  readonly linkedFrom: readonly string[];
  /** C4 views: the level, and the scope's entity key. */
  readonly c4: { readonly level: C4Level; readonly scope: string | null } | null;
  /** The first entry, in catalog order, with an element that opens this one; null when none. */
  readonly parent: { readonly entry: string; readonly element: string } | null;
}

export interface StoryEntry extends EntryBase {
  readonly kind: "story";
  readonly document: StoryPlayerDocument;
  readonly faces: readonly number[];
  /** Keys of the catalogued diagrams the story shows. */
  readonly shows: readonly string[];
}

export type CatalogEntry = DiagramEntry | StoryEntry;

export interface CatalogEntity {
  /** The model file without `.meltemi`, the model id and the entity path. */
  readonly key: string;
  readonly file: string;
  readonly model: string;
  readonly path: string;
  readonly label: string;
  readonly kind: string;
  readonly technology: string | null;
  readonly description: string | null;
  readonly external: boolean;
  readonly url: string | null;
  /** The enclosing entity's key, or null at the model's root. */
  readonly parent: string | null;
  /** The catalogued views that draw or link to the entity, with the element that does. */
  readonly shownIn: readonly { readonly entry: string; readonly element: string }[];
  /** Keys of the catalogued C4 views scoped to the entity. */
  readonly views: readonly string[];
}

/** Everything the catalog page holds: the authorised content of the project (decision 0027). */
export interface CatalogData {
  readonly format: typeof CATALOG_FORMAT;
  readonly version: typeof CATALOG_VERSION;
  readonly title: string;
  readonly description: string | null;
  readonly generator: string;
  /** `@font-face` rules for the text of every drawing, each subset once. */
  readonly fontFaces: readonly string[];
  readonly entries: readonly CatalogEntry[];
  readonly entities: readonly CatalogEntity[];
  /** The text of each catalogued file, or null when the source is not included. */
  readonly sources: Readonly<Record<string, string>> | null;
}

const stem = (file: string) => file.replace(/\.meltemi$/, "");

/** The key of a diagram or story. */
export function entryKey(file: string, id: string): string {
  return `${stem(file)}/${id}`;
}

/** The key of a model entity. */
export function entityKey(file: string, model: string, path: string): string {
  return `${stem(file)}/${model}/${path}`;
}

/** The folder of a project-relative path, `""` at the root. */
export function folderOf(file: string): string {
  const slash = file.lastIndexOf("/");
  return slash < 0 ? "" : file.slice(0, slash);
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();
const faceKey = (face: EmbeddableFace) => `${face.family}|${face.weight}|${face.subset}`;

/** Turns laid-out diagrams, stories and models into the catalog's data. */
export function catalogData(input: CatalogInput): CatalogData {
  const diagramKeys = new Set(input.diagrams.map((d) => entryKey(d.file, d.diagram.id)));
  const storyKeys = new Map<string, string[]>();
  const linkedFrom = new Map<string, Set<string>>();
  const shownIn = new Map<string, { entry: string; element: string }[]>();

  // Documents first, so the fonts can cover every scene.
  const diagramViews = input.diagrams.map((d) =>
    d.views.flatMap((v) => {
      const document = effectsDocument(
        { diagram: d.diagram, layout: v.layout },
        input.locale ? { locale: input.locale } : {},
      );
      return document ? [{ scenario: v.scenario, document }] : [];
    }),
  );
  const storyDocuments = input.stories.map((s) =>
    storyDocument(s.story, s.layouts, input.locale ? { locale: input.locale } : {}),
  );
  const scenes: Scene[] = [
    ...diagramViews.flatMap((views) => views.map((v) => rootView(v.document).scene)),
    ...storyDocuments.flatMap((doc) => (doc ? Object.values(doc.views).map((v) => v.scene) : [])),
  ];
  const faces = input.fonts ? embeddableFaces(scenes, input.fonts) : [];
  const faceIndex = new Map(faces.map((face, i) => [faceKey(face), i]));
  const facesOf = (list: readonly Scene[]): number[] =>
    input.fonts
      ? [
          ...new Set(
            embeddableFaces(list, input.fonts)
              .map((face) => faceIndex.get(faceKey(face)))
              .filter((i): i is number => i !== undefined),
          ),
        ].sort((a, b) => a - b)
      : [];

  /** Stories by diagram entry, then by element id or relation key. */
  const targetedBy = new Map<string, Map<string, Set<string>>>();
  const target = (entry: string, id: string, story: string) => {
    const byId = targetedBy.get(entry) ?? new Map<string, Set<string>>();
    targetedBy.set(entry, byId);
    byId.set(id, (byId.get(id) ?? new Set()).add(story));
  };

  const stories: StoryEntry[] = [];
  input.stories.forEach((s, i) => {
    const document = storyDocuments[i];
    if (!document) return;
    const key = entryKey(s.file, s.story.id);
    // The document names views by diagram id; the written timeline by view key, in the same order.
    const written = storyTimeline(s.story).views;
    const entryOfView = new Map<string, string>();
    document.timeline.views.forEach((view, n) => {
      const shown = s.shows.find((v) => v.key === written[n]);
      if (shown) entryOfView.set(view, entryKey(shown.file, shown.diagram));
    });
    const visit = (actions: readonly TimelineAction[], entry: string) => {
      for (const action of actions) {
        if (action.kind === "parallel") visit(action.children, entry);
        else for (const t of action.targets) target(entry, t.id, key);
      }
    };
    for (const scene of document.timeline.scenes) {
      const entry = entryOfView.get(scene.view);
      if (entry) visit(scene.actions, entry);
    }
    const shows = [
      ...new Set(s.shows.map((v) => entryKey(v.file, v.diagram)).filter((k) => diagramKeys.has(k))),
    ];
    for (const shown of shows) storyKeys.set(shown, [...(storyKeys.get(shown) ?? []), key]);
    stories.push({
      kind: "story",
      key,
      id: s.story.id,
      title: s.story.title,
      description: s.story.description,
      file: s.file,
      folder: folderOf(s.file),
      document,
      faces: facesOf(Object.values(document.views).map((v) => v.scene)),
      shows,
    });
  });

  /** The scene of each catalogued diagram as written, for the transitions of drill-downs. */
  const rootScenes = new Map<string, Scene>();
  input.diagrams.forEach((d, i) => {
    const first = diagramViews[i]?.[0];
    if (first) rootScenes.set(entryKey(d.file, d.diagram.id), rootView(first.document).scene);
  });

  const diagrams: DiagramEntry[] = [];
  input.diagrams.forEach((d, i) => {
    const views = diagramViews[i]!;
    if (views.length === 0) return;
    const key = entryKey(d.file, d.diagram.id);
    const opensOf = (id: string): CatalogOpens | null => {
      const written = d.opens?.[id];
      if (!written) return null;
      const entry = entryKey(written.file, written.diagram);
      const from = rootScenes.get(key);
      const to = rootScenes.get(entry);
      if (entry === key || !from || !to) return null;
      return { entry, element: written.element, transition: transitionFor(from, to, id) };
    };
    const storiesOf = (id: string) => [...(targetedBy.get(key)?.get(id) ?? [])].sort();
    const targetOf = (id: string): CatalogTarget | null => {
      const link = d.links[id];
      if (!link) return null;
      if (link.kind === "entity") {
        const entity = entityKey(link.file, link.model, link.path);
        shownIn.set(entity, [...(shownIn.get(entity) ?? []), { entry: key, element: id }]);
        return { kind: "entity", entity };
      }
      const entry = entryKey(link.file, link.diagram);
      if (!diagramKeys.has(entry) || entry === key) return null;
      linkedFrom.set(entry, (linkedFrom.get(entry) ?? new Set()).add(key));
      return { kind: "diagram", entry, element: link.element };
    };
    const elements = d.diagram.elements.map((e): CatalogElement => ({
      id: e.id,
      label: oneLine(e.label || e.id),
      kind: e.kind,
      description: e.description,
      technology: e.technology,
      url: e.url,
      external: e.external,
      target: targetOf(e.id),
      opens: opensOf(e.id),
      stories: storiesOf(e.id),
    }));
    const labelOf = (id: string) => elements.find((e) => e.id === id)?.label ?? id;
    diagrams.push({
      kind: "diagram",
      key,
      id: d.diagram.id,
      title: d.diagram.properties.title,
      description: d.diagram.properties.description,
      file: d.file,
      folder: folderOf(d.file),
      type: d.diagram.type,
      views: views.map(({ scenario, document }) => ({
        scenario,
        label:
          scenario === null
            ? "As written"
            : oneLine(d.diagram.scenarios.find((s) => s.id === scenario)?.label || scenario),
        document,
        faces: facesOf([rootView(document).scene]),
      })),
      elements,
      relations: d.diagram.relations.map((r) => ({
        key: r.key,
        from: labelOf(r.from),
        to: labelOf(r.to),
        fromId: r.from,
        toId: r.to,
        stories: storiesOf(r.key),
        label: r.label === null ? null : oneLine(r.label),
        description: r.description,
        technology: r.technology,
        assumption: r.assumption,
      })),
      stories: [],
      linksTo: [
        ...new Set(elements.flatMap((e) => (e.target?.kind === "diagram" ? [e.target.entry] : []))),
      ],
      linkedFrom: [],
      c4: d.c4
        ? {
            level: d.c4.level,
            scope:
              d.c4.scope === null ? null : entityKey(d.c4.model.file, d.c4.model.id, d.c4.scope),
          }
        : null,
      parent: null,
    });
  });

  // Entries in the order of their files, then of their blocks in the file.
  const order = new Map<string, number>();
  [...input.diagrams.map((d) => d.file), ...input.stories.map((s) => s.file)]
    .sort()
    .forEach((file) => order.has(file) || order.set(file, order.size));
  const offset = (entry: CatalogEntry) => {
    const source =
      entry.kind === "diagram"
        ? input.diagrams.find((d) => entryKey(d.file, d.diagram.id) === entry.key)?.diagram.range
        : input.stories.find((s) => entryKey(s.file, s.story.id) === entry.key)?.story.range;
    return source?.start.offset ?? 0;
  };
  const ordered: CatalogEntry[] = [
    ...diagrams.map((d) => ({
      ...d,
      stories: storyKeys.get(d.key) ?? [],
      linkedFrom: [...(linkedFrom.get(d.key) ?? [])].sort(),
    })),
    ...stories,
  ].sort((a, b) => order.get(a.file)! - order.get(b.file)! || offset(a) - offset(b));
  // The parent of a diagram: the first entry with an element that opens it.
  const parents = new Map<string, { entry: string; element: string }>();
  for (const entry of ordered) {
    if (entry.kind !== "diagram") continue;
    for (const element of entry.elements) {
      const opened = element.opens?.entry;
      if (opened && opened !== entry.key && !parents.has(opened))
        parents.set(opened, { entry: entry.key, element: element.id });
    }
  }
  const entries: CatalogEntry[] = ordered.map((entry) =>
    entry.kind === "diagram" ? { ...entry, parent: parents.get(entry.key) ?? null } : entry,
  );

  const entities: CatalogEntity[] = [];
  for (const { file, model } of input.models) {
    for (const entity of model.entities) {
      const key = entityKey(file, model.id, entity.path);
      const shown = shownIn.get(key);
      if (!shown) continue;
      entities.push({
        key,
        file,
        model: model.id,
        path: entity.path,
        label: oneLine(entity.label || entity.id),
        kind: entity.kind,
        technology: entity.technology,
        description: entity.description,
        external: entity.external,
        url: entity.url,
        parent: entity.parent === null ? null : entityKey(file, model.id, entity.parent),
        shownIn: shown,
        views: entries
          .filter((e): e is DiagramEntry => e.kind === "diagram" && e.c4?.scope === key)
          .map((e) => e.key),
      });
    }
  }

  return {
    format: CATALOG_FORMAT,
    version: CATALOG_VERSION,
    title: input.title,
    description: input.description,
    generator: input.generator,
    fontFaces: faces.map(fontFaceRule),
    entries,
    entities,
    sources: input.sources,
  };
}
