import type { C4Level } from "@meltemi/diagrams-model";
import type { DrillTransition, StoryTimeline, StoryViewData } from "@meltemi/diagrams-motion";

// The shape of player documents and the check of a document read from a page. The runtime imports
// this module and never the builders, so the page's script carries no layout code.

export const PLAYER_FORMAT = "meltemi-player";
export const PLAYER_VERSION = 2;

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

/** A story: its timeline and the views it shows. */
export interface StoryPlayerDocument extends DocumentBase {
  readonly kind: "story";
  readonly timeline: StoryTimeline;
  /** The scene, effects and relation ends of every view, by view key. */
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

/** Whether a value read from a page is a player document this runtime can play. */
export function isPlayerDocument(value: unknown): value is PlayerDocument {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.format === PLAYER_FORMAT &&
    v.version === PLAYER_VERSION &&
    (v.kind === "story" || v.kind === "effects")
  );
}
