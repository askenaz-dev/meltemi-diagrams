import type { C4Level } from "@meltemi/diagrams-model";
import type { DrillTransition, StoryTimeline, StoryViewData } from "@meltemi/diagrams-motion";

// The shape of player documents and the check of a document read from a page. The runtime imports
// this module and never the builders, so the page's script carries no layout code.

export const PLAYER_FORMAT = "meltemi-player";
export const PLAYER_VERSION = 3;
/** The versions the runtime reads: version 2 held a story document's one story as `timeline`. */
export const READABLE_VERSIONS: readonly number[] = [2, 3];

/** What the player knows of a view besides its scene: names for people. */
export interface ViewNames {
  /** The diagram's title, or null. */
  readonly title: string | null;
  /** Element, relation, note and fragment ids to the text people read. */
  readonly labels: Readonly<Record<string, string>>;
}

/** Where an element leads when it is opened: a view of the document, and what to select there. */
export interface OpenTarget {
  /** The key of the view in the document's `views`. */
  readonly view: string;
  /** The element to select in that view (a `link`'s target), or null for a child view. */
  readonly element: string | null;
  readonly transition: DrillTransition;
}

/** What hover cards and the detail panel say of an element. */
export interface ElementDetails {
  readonly kind: string;
  /** The C4 type word as the drawing writes it, in the content language; null outside C4. */
  readonly type: string | null;
  readonly technology: string | null;
  readonly description: string | null;
  readonly url: string | null;
  readonly external: boolean;
  /** The model entity the element draws or links to, by path; null when none. */
  readonly entity: string | null;
  /** What a double click, the plus badge or Enter opens; null when nothing. */
  readonly opens: OpenTarget | null;
}

/** What hover cards and the detail panel say of a relation (its ends are the view's `ends`). */
export interface RelationDetails {
  readonly label: string | null;
  readonly technology: string | null;
  readonly description: string | null;
  readonly assumption: string | null;
  /** C4 views: an end was lifted to a drawn ancestor. */
  readonly derived: boolean;
  /** C4 views: the model relations it stands for. */
  readonly sources: readonly string[];
  readonly async: boolean;
}

/** The details of one view: its elements and relations, its C4 level and the view above it. */
export interface ViewDetails {
  readonly elements: Readonly<Record<string, ElementDetails>>;
  readonly relations: Readonly<Record<string, RelationDetails>>;
  readonly c4: { readonly level: C4Level; readonly scope: string | null } | null;
  /** The first view of the document with an element that opens this one; null for the root. */
  readonly parent: { readonly view: string; readonly element: string } | null;
}

interface DocumentBase {
  readonly format: typeof PLAYER_FORMAT;
  readonly version: typeof PLAYER_VERSION;
  /** The story's or diagram's id. */
  readonly id: string;
  readonly title: string | null;
  readonly description: string | null;
  /** Names of every view, by view key. */
  readonly names: Readonly<Record<string, ViewNames>>;
  /** What cards and the panel say of every view, by view key. */
  readonly details: Readonly<Record<string, ViewDetails>>;
  /** The colour of highlights and traces. */
  readonly accent: string;
  /** `@font-face` rules for the text of the views; empty when fonts are left to the viewer. */
  readonly fontFaces: readonly string[];
}

/** One story of a story document: its id, title, description and timeline over the views. */
export interface StoryEntry {
  readonly id: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly timeline: StoryTimeline;
}

/**
 * Stories over the views they show: one, or several flows of the same drawing that a reader picks
 * from. The document's `id`, `title` and `description` are those of its first story.
 */
export interface StoryPlayerDocument extends DocumentBase {
  readonly kind: "story";
  /** At least one, in the order given. */
  readonly stories: readonly StoryEntry[];
  /** The scene, effects and relation ends of every view, by view key, shared by the stories. */
  readonly views: Readonly<Record<string, StoryViewData>>;
}

/** A view of an effects document: its scene and effects, and when they end. */
export interface EffectsViewData extends StoryViewData {
  /** When the last effect ends, or null when one repeats forever. */
  readonly durationMs: number | null;
}

/** A diagram and its `animate` effects, with the views it opens. */
export interface EffectsPlayerDocument extends DocumentBase {
  readonly kind: "effects";
  /** The key of the diagram's own view in `views`: its id. */
  readonly key: string;
  /** The diagram's view and every view a drill-down reaches from it, by key. */
  readonly views: Readonly<Record<string, EffectsViewData>>;
}

export type PlayerDocument = StoryPlayerDocument | EffectsPlayerDocument;

/** The view an effects document shows first: the diagram's own. */
export function rootView(document: EffectsPlayerDocument): EffectsViewData {
  return document.views[document.key]!;
}

/** The story a story document shows at an index: the first one for an index it does not have. */
export function storyAt(document: StoryPlayerDocument, index = 0): StoryEntry {
  return document.stories[index] ?? document.stories[0]!;
}

/**
 * Whether a value read from a page is a player document this runtime can play: version 3, or a
 * version 2 document that `readPlayerDocument` lifts to version 3.
 */
export function isPlayerDocument(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.format !== PLAYER_FORMAT || !READABLE_VERSIONS.includes(v.version as number)) return false;
  if (v.kind === "effects") return true;
  if (v.kind !== "story") return false;
  return v.version === 2
    ? typeof v.timeline === "object" && v.timeline !== null
    : Array.isArray(v.stories) && v.stories.length > 0;
}

/**
 * The version 3 document of a value read from a page, or undefined when it is none this runtime
 * reads: a version 2 story document's `timeline` becomes its one story, with the document's id,
 * title and description; anything else of version 2 reads as it is.
 */
export function readPlayerDocument(value: unknown): PlayerDocument | undefined {
  if (!isPlayerDocument(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.version === PLAYER_VERSION) return value as PlayerDocument;
  const { timeline, ...rest } = v;
  if (v.kind !== "story") return { ...rest, version: PLAYER_VERSION } as unknown as PlayerDocument;
  const story: StoryEntry = {
    id: String(v.id),
    title: (v.title as string | null | undefined) ?? null,
    description: (v.description as string | null | undefined) ?? null,
    timeline: timeline as StoryTimeline,
  };
  return { ...rest, version: PLAYER_VERSION, stories: [story] } as unknown as PlayerDocument;
}
