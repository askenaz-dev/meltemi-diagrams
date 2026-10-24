import type { Range, TextEdit } from "@meltemi/diagrams-language";
import type {
  AnimationEffect,
  ElementKind,
  LineStyle,
  Point,
  StoryActionKind,
} from "@meltemi/diagrams-model";

/**
 * A structured change requested by a visual tool. Every operation names the diagram, model or
 * story it applies to; element and relation names refer to ids in that diagram.
 */
export type EditOperation =
  | {
      readonly kind: "setPosition";
      readonly diagram: string;
      readonly element: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "setSize";
      readonly diagram: string;
      readonly element: string;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: "setRoute";
      readonly diagram: string;
      /** A named relation; anonymous relations must be materialised first. */
      readonly relation: string;
      /**
       * A compass port, `auto`, or a port the source element declares; null writes the bare
       * element, letting the layout choose, and removes the route when nothing else is left in it.
       */
      readonly from?: string | null;
      /** The same for the target. */
      readonly to?: string | null;
      /** The point of `from`'s compass side, a percentage; the end is free without it. */
      readonly fromPosition?: number;
      /** The point of `to`'s compass side, a percentage. */
      readonly toPosition?: number;
      readonly via: readonly Point[];
    }
  | {
      readonly kind: "setLabelAnchor";
      readonly diagram: string;
      readonly relation: string;
      /** Percentage along the route, 0 to 100. */
      readonly at: number;
      readonly offset: Point;
    }
  | {
      readonly kind: "setRelationLabel";
      readonly diagram: string;
      readonly relation: string;
      readonly label: string | null;
    }
  | {
      readonly kind: "renameElement";
      readonly diagram: string;
      readonly element: string;
      readonly newId: string;
    }
  | {
      readonly kind: "materializeRelationId";
      readonly diagram: string;
      /** The key of the relation, such as `orders->db#1`. */
      readonly relationKey: string;
      readonly id: string;
    }
  | {
      readonly kind: "removeElement";
      readonly diagram: string;
      readonly element: string;
      readonly cascade: boolean;
    }
  | {
      /**
       * Writes `place` statements from an arrangement: for the elements without one (`unplaced`)
       * or for every element given (`all`, which also drops route waypoints), and turns
       * `layout auto` into `layout assisted`.
       */
      readonly kind: "arrange";
      readonly diagram: string;
      /** Centres of the arranged elements; with `all`, also of groups that are placed and sized. */
      readonly positions: ReadonlyMap<string, Point>;
      /** With `all`, the new sizes of groups that are placed and sized in the source. */
      readonly sizes?: ReadonlyMap<string, { readonly width: number; readonly height: number }>;
      /**
       * With `all`, the drawn points of relations by key, ends included, in diagram coordinates:
       * the bends between the ends are written as the route's `via`, the ends left free.
       */
      readonly routes?: ReadonlyMap<string, readonly Point[]>;
      readonly scope: "unplaced" | "all";
      /**
       * Also writes `place` and `size` for the groups in `positions` and `sizes` (free diagrams,
       * where group children are placed inside their group). Hosts pass the positions of group
       * children relative to the interior of their group (`LayoutResult.origins`).
       */
      readonly writeGroups?: boolean;
    }
  | {
      /** Several operations planned as one edit and one undo step (`planBatch`). */
      readonly kind: "batch";
      readonly operations: readonly EditOperation[];
    }
  | {
      /**
       * Declares a new element after the last declaration of the diagram or of `parent`, with a
       * generated `<kind><n>` id when `id` is absent, and writes `place` and `size` when given.
       */
      readonly kind: "createElement";
      readonly diagram: string;
      readonly elementKind: ElementKind;
      readonly id?: string;
      readonly label?: string;
      readonly at?: Point;
      readonly size?: { readonly width: number; readonly height: number };
      readonly parent?: string;
      /** The icon reference of an `icon` or the path of an `image` (free diagrams). */
      readonly source?: string;
      /** An icon for the element's style, written as `style <id> { icon "…" }` after it. */
      readonly icon?: string;
      /**
       * A shape of `BOX_SHAPES` for a free `box` or a flow `node`, written in the same style
       * statement as `icon` (`style <id> { shape hexagon }`); `rounded`, the default, writes none.
       */
      readonly shape?: string;
      /**
       * A note's attachment, written as `on <element>` after its text: the id of an element of the
       * diagram, or an entity path the view draws. Only notes take it.
       */
      readonly attachedTo?: string;
    }
  | {
      /**
       * Writes the `on <element>` clause of a note after its text, replaces the target of an
       * existing one, or removes it when `element` is null, in the same declaration.
       */
      readonly kind: "attachNote";
      readonly diagram: string;
      readonly note: string;
      readonly element: string | null;
    }
  | {
      /**
       * Declares a free line, `line <id> from (x, y) to (x, y) [via [...]]`, with a generated
       * `line<n>` id when `id` is absent, in the diagram body or in `parent`'s block; its points are
       * in that parent's interior coordinates. `styles` go in one `style` statement in the same edit.
       */
      readonly kind: "createLine";
      readonly diagram: string;
      readonly from: Point;
      readonly to: Point;
      readonly via?: readonly Point[];
      readonly parent?: string;
      readonly id?: string;
      readonly label?: string;
      readonly styles?: readonly { readonly property: string; readonly value: string }[];
    }
  | {
      /**
       * Moves the points of a free line, in its parent's interior coordinates: the `from` and `to`
       * tuples, and a `via` list after `to`, inserted or removed as bends appear or go.
       */
      readonly kind: "setLinePoints";
      readonly diagram: string;
      readonly element: string;
      readonly from: Point;
      readonly to: Point;
      readonly via: readonly Point[];
    }
  | {
      /**
       * Adds a relation; with ports it is named and routed. `line` and `heads` choose the token:
       * `->`, `-->`, `<->`, `<-->`, or the lines `--` and `---`.
       */
      readonly kind: "createRelation";
      readonly diagram: string;
      readonly from: string;
      readonly to: string;
      readonly line: LineStyle;
      /** `both` for `<->` or `<-->`, `none` for the lines `--` or `---`; a head at the end otherwise. */
      readonly heads?: "none" | "both";
      readonly label?: string;
      readonly id?: string;
      readonly fromPort?: string;
      readonly toPort?: string;
      /** The point of `fromPort`'s compass side, a percentage. */
      readonly fromPosition?: number;
      /** The point of `toPort`'s compass side, a percentage. */
      readonly toPosition?: number;
    }
  | {
      /** Renames a named relation and every reference to it. */
      readonly kind: "renameRelation";
      readonly diagram: string;
      readonly relation: string;
      readonly newId: string;
    }
  | {
      /** Deletes a relation (by id or key) with its route, label, styles and animations. */
      readonly kind: "removeRelation";
      readonly diagram: string;
      readonly relation: string;
    }
  | {
      /** Moves one end of a relation to another element or port, updating its route. */
      readonly kind: "reconnectRelation";
      readonly diagram: string;
      readonly relation: string;
      readonly end: "from" | "to";
      readonly element: string;
      readonly port?: string;
      /** The point of `port`'s compass side, a percentage. */
      readonly position?: number;
    }
  | {
      /** Switches a relation between `->` (solid) and `-->` (dashed). */
      readonly kind: "setRelationLine";
      readonly diagram: string;
      readonly relation: string;
      readonly line: LineStyle;
    }
  | {
      /** Sets the label of an element; an implicit element gains a declaration. */
      readonly kind: "setElementLabel";
      readonly diagram: string;
      readonly element: string;
      readonly label: string;
    }
  | {
      /** Sets or (with `null`) removes the description of an element or relation. */
      readonly kind: "setDescription";
      readonly diagram: string;
      readonly target: string;
      readonly targetKind: "element" | "relation";
      readonly description: string | null;
    }
  | {
      /** Sets the classes of an element or relation block; an empty list removes the statement. */
      readonly kind: "setClasses";
      readonly diagram: string;
      readonly target: string;
      readonly targetKind: "element" | "relation";
      readonly classes: readonly string[];
    }
  | {
      /** Rewrites a declaration as another kind, keeping id, label and block. */
      readonly kind: "setElementKind";
      readonly diagram: string;
      readonly element: string;
      readonly elementKind: Exclude<ElementKind, "group">;
    }
  | {
      /**
       * Sets or (with `null`) removes one style property of an element or relation, splitting a
       * statement shared by several targets when needed.
       */
      readonly kind: "setStyleProperty";
      readonly diagram: string;
      readonly target: string;
      /** `event`: a note or a fragment of a sequence diagram, by id. */
      readonly targetKind: "element" | "relation" | "event";
      readonly property: string;
      readonly value: string | number | null;
    }
  | {
      /**
       * Makes sure the target has an `animate` statement with `effect`, splitting a statement
       * shared with other targets, and sets or (with `null`) removes one of its properties.
       * Times are in milliseconds.
       */
      readonly kind: "setAnimation";
      readonly diagram: string;
      readonly target: string;
      readonly targetKind: "element" | "relation" | "event";
      readonly effect: AnimationEffect;
      readonly property?: "duration" | "repeat" | "delay" | "direction" | "particles" | "color";
      readonly value?: string | number | null;
    }
  | {
      /** Removes the target's `animate` statement with `effect`, or the target from it. */
      readonly kind: "removeAnimation";
      readonly diagram: string;
      readonly target: string;
      readonly effect: AnimationEffect;
    }
  | {
      /**
       * Sets the time of a story action, writing or replacing `over <n>ms` or the time of `hold`.
       * `path` is the scene index, then action indexes through `parallel` blocks; a path of the
       * scene index alone is the scene's transition.
       */
      readonly kind: "setStoryTiming";
      readonly story: string;
      readonly path: readonly number[];
      readonly durationMs: number;
    }
  | {
      /**
       * Appends an action to a scene: `reveal`, `hide`, `highlight`, `focus`, `camera` or `trace`
       * with ids of the scene's view (`all` for `focus` and `camera`), or `hold` with a time.
       */
      readonly kind: "insertStoryAction";
      readonly story: string;
      readonly scene: string;
      readonly action: Exclude<StoryActionKind, "parallel">;
      readonly targets: readonly string[];
      readonly all?: boolean;
      readonly durationMs?: number;
    }
  | {
      /** Removes the story action at `path` (see `setStoryTiming`). */
      readonly kind: "removeStoryAction";
      readonly story: string;
      readonly path: readonly number[];
    }
  | {
      /** Adds an empty scene after `after`, or at the end of the story. */
      readonly kind: "insertScene";
      readonly story: string;
      readonly id: string;
      readonly title?: string;
      readonly after?: string;
    }
  | {
      /**
       * Declares `theme <id> { extends "<base>" }` after the file's last theme, or after its header
       * and imports. Without `extends`, the theme extends the default theme.
       */
      readonly kind: "createTheme";
      readonly theme: string;
      readonly extends: string | null;
    }
  | {
      /**
       * Sets a token of a theme block of the file: replaces the written value, or adds the
       * token's statement. Colours and strings are written quoted, times in milliseconds.
       */
      readonly kind: "setThemeToken";
      readonly theme: string;
      readonly token: string;
      readonly value: string | number;
    }
  | {
      /** Removes a token's statement from a theme block, so the base theme's value applies. */
      readonly kind: "removeThemeToken";
      readonly theme: string;
      readonly token: string;
    }
  | {
      /** Sets or (with `null`) removes a diagram property such as `title` or `direction`. */
      readonly kind: "setDiagramProperty";
      readonly diagram: string;
      readonly property: string;
      readonly value: string | number | null;
    }
  | {
      /** Declares a named port in an element's block. */
      readonly kind: "addPort";
      readonly diagram: string;
      readonly element: string;
      readonly name: string;
      readonly side: "north" | "south" | "east" | "west";
      /** Position along the side from 0 to 1; 0.5 is written as no percentage. */
      readonly position?: number;
    }
  | {
      /** Removes a named port that no route uses. */
      readonly kind: "removePort";
      readonly diagram: string;
      readonly element: string;
      readonly name: string;
    }
  | {
      /** Moves sibling declarations into a new group. */
      readonly kind: "groupElements";
      readonly diagram: string;
      readonly elements: readonly string[];
      readonly id: string;
      readonly label: string;
    }
  | {
      /**
       * Turns a flow `node` or a free `box` into a group with the same id, label and block, which
       * holds `children` (siblings moved in, each with its `place` in the new interior when `at`
       * is given). Its styles keep everything but `shape` (`square` and `rectangle` become
       * `radius 0`); `size` is written when the element has none.
       */
      readonly kind: "convertToContainer";
      readonly diagram: string;
      readonly element: string;
      readonly children: readonly { readonly id: string; readonly at?: Point }[];
      readonly size?: { readonly width: number; readonly height: number };
    }
  | {
      /** Replaces a group with its children. */
      readonly kind: "ungroup";
      readonly diagram: string;
      readonly group: string;
    }
  | {
      /** Inserts the statements of a `diagram <id>: flow { }` fragment into the diagram. */
      readonly kind: "insertFragment";
      readonly diagram: string;
      readonly fragment: string;
    }
  | {
      /**
       * Moves a declaration among the declarations of its block: `front` last (drawn on top),
       * `back` first, `forward` and `backward` past one neighbour.
       */
      readonly kind: "reorderElement";
      readonly diagram: string;
      readonly element: string;
      readonly to: "front" | "back" | "forward" | "backward";
    }
  | {
      /**
       * Moves an element's declaration, with its block and the comments attached to it, into the
       * block of the group `parent`, or into the diagram body with `null`, after the last
       * declaration there. An implicit element gains its declaration there. Relations, styles and
       * animations stay where they are. Flow and free diagrams.
       */
      readonly kind: "moveElement";
      readonly diagram: string;
      readonly element: string;
      readonly parent: string | null;
      /** The element's new `place`, in the interior coordinates of `parent`; the place stays without it. */
      readonly at?: Point;
    }
  | {
      /** Renames a layer in `layers` and in every `layer` statement of the diagram. */
      readonly kind: "renameLayer";
      readonly diagram: string;
      readonly layer: string;
      readonly name: string;
    }
  | {
      /**
       * Sets or (with `null`) removes the `layer` or `link` statement of an element or relation,
       * or the `kind async` of a sequence message.
       */
      readonly kind: "setElementProperty";
      readonly diagram: string;
      readonly target: string;
      readonly targetKind: "element" | "relation";
      readonly property: "layer" | "link" | "kind" | "url";
      readonly value: string | null;
    }
  | {
      /** Sequence diagrams: makes a participant the `index`-th (0-based) of its block. */
      readonly kind: "reorderParticipant";
      readonly diagram: string;
      readonly participant: string;
      readonly index: number;
    }
  | {
      /** Sequence diagrams: moves an event past its neighbour, into or out of fragments; validated. */
      readonly kind: "moveEvent";
      readonly diagram: string;
      readonly event: string;
      readonly direction: "up" | "down";
    }
  | {
      /** Sequence diagrams: writes or (with 0 or null) removes `space <event>` or `gap <participant>`. */
      readonly kind: "setSpacing";
      readonly diagram: string;
      readonly target: string;
      readonly targetKind: "event" | "participant";
      readonly amount: number | null;
    }
  | {
      /**
       * Sequence diagrams: inserts an event statement after an event, first in a fragment branch,
       * or after the last event.
       */
      readonly kind: "insertEvent";
      readonly diagram: string;
      readonly statement: string;
      readonly after?: string;
      readonly inside?: { readonly fragment: string; readonly branch: number };
    }
  | {
      /** Sequence diagrams: wraps consecutive sibling events in a new fragment. */
      readonly kind: "wrapInFragment";
      readonly diagram: string;
      readonly events: readonly string[];
      readonly operator: string;
      readonly condition?: string;
      readonly id?: string;
    }
  | {
      /** Sequence diagrams: replaces a fragment with the events of its first branch. */
      readonly kind: "unwrapFragment";
      readonly diagram: string;
      readonly fragment: string;
    }
  | {
      /** Sequence diagrams: adds an `else`, `and` or `option` branch. */
      readonly kind: "addBranch";
      readonly diagram: string;
      readonly fragment: string;
      readonly condition?: string;
    }
  | {
      /** C4 views: draws an entity of the model: adds it to `include`, or out of `exclude`. */
      readonly kind: "includeEntity";
      readonly diagram: string;
      readonly entity: string;
    }
  | {
      /**
       * C4 views: stops drawing an entity: out of `include`, or into `exclude`; the view's
       * statements that only name it go too (with `cascade`; else they are listed).
       */
      readonly kind: "excludeEntity";
      readonly diagram: string;
      readonly entity: string;
      readonly cascade: boolean;
    }
  | {
      /**
       * C4 views: removes the view's statements that name a relation of its model, which another
       * file holds and loses it (with `cascade`; else they are listed as dependents, with the
       * view itself as drawing the relation unless `listDrawn` is false).
       */
      readonly kind: "forgetModelRelation";
      readonly diagram: string;
      /** The model relation's key: its id, or `<from>-><to>#<n>`. */
      readonly relation: string;
      readonly cascade: boolean;
      readonly listDrawn?: boolean;
    }
  | {
      /** C4 views: writes, changes or (with null) removes `label <target> "Text"`. */
      readonly kind: "setLocalLabel";
      readonly diagram: string;
      readonly target: string;
      readonly label: string | null;
    }
  | {
      /** Models: declares an entity in a parent entity, or at the model's root. */
      readonly kind: "createEntity";
      readonly model: string;
      readonly entityKind: string;
      readonly parent?: string;
      readonly id?: string;
      readonly label?: string;
    }
  | {
      /** Models: renames an entity in its declaration, model relations, views and links. */
      readonly kind: "renameEntity";
      readonly model: string;
      readonly entity: string;
      readonly newId: string;
    }
  | {
      /** Models: removes an entity with its children, relations and view statements (cascade). */
      readonly kind: "removeEntity";
      readonly model: string;
      readonly entity: string;
      readonly cascade: boolean;
    }
  | {
      /** Models: sets or (with null) removes an entity's label, description, technology or `external`. */
      readonly kind: "setEntityProperty";
      readonly model: string;
      readonly entity: string;
      readonly property: "label" | "description" | "technology" | "external" | "url";
      readonly value: string | boolean | null;
    }
  | {
      /** Models: adds a relation at the model's root. */
      readonly kind: "createModelRelation";
      readonly model: string;
      readonly from: string;
      readonly to: string;
      readonly label?: string;
      readonly id?: string;
      readonly technology?: string;
    }
  | {
      /** Models: moves one end of a relation to another entity, keeping its label, id and block. */
      readonly kind: "reconnectModelRelation";
      readonly model: string;
      readonly relation: string;
      readonly end: "from" | "to";
      readonly entity: string;
      /**
       * The view the end was dropped on, with the port (null: the layout chooses) and the point
       * written into its route of the relation, when it has one; the routes of the other views
       * follow the moved end by the usual rule.
       */
      readonly view?: string;
      readonly port?: string | null;
      readonly position?: number;
    }
  | {
      /**
       * C4 views of a file other than the model's: rewrites the end of the relation's routes that
       * no longer meets the drawn relation (the model moved it), or removes a route whose relation
       * the view no longer draws.
       */
      readonly kind: "rewriteRouteEnd";
      readonly diagram: string;
      /** The model relation's id. */
      readonly relation: string;
      readonly end: "from" | "to";
    }
  | {
      /**
       * Models: removes a relation with the view statements that name it (with `cascade`; else
       * they are listed as dependents, with the views of the file that draw the relation, other
       * than `view`).
       */
      readonly kind: "removeModelRelation";
      readonly model: string;
      readonly relation: string;
      readonly cascade: boolean;
      readonly view?: string;
    }
  | {
      /** Models: sets or (with null) removes a relation's label, technology, description or id. */
      readonly kind: "setModelRelationProperty";
      readonly model: string;
      readonly relation: string;
      readonly property: "label" | "technology" | "description" | "id";
      readonly value: string | null;
    }
  | {
      /** Sequence diagrams: names or renames a note or a fragment. */
      readonly kind: "renameEvent";
      readonly diagram: string;
      readonly event: string;
      readonly newId: string;
    }
  | {
      /**
       * Sequence diagrams: activates a participant right after a message, with the `deactivate`
       * after its reply; or removes that activation when there is one.
       */
      readonly kind: "toggleActivation";
      readonly diagram: string;
      readonly participant: string;
      readonly after: string;
    }
  | {
      /** Sequence diagrams: removes an activation, lifecycle event, note, divider, delay or fragment. */
      readonly kind: "removeEvent";
      readonly diagram: string;
      readonly event: string;
    }
  | {
      /**
       * Sequence diagrams: replaces the text of a note or the label of a divider or a delay; `null`
       * removes the label of a delay.
       */
      readonly kind: "setEventText";
      readonly diagram: string;
      readonly event: string;
      readonly text: string | null;
    }
  | {
      /** Sequence diagrams: places a note `over` participants, or `left of` or `right of` one. */
      readonly kind: "setNotePlacement";
      readonly diagram: string;
      readonly note: string;
      readonly position: "over" | "left" | "right";
      readonly participants: readonly string[];
    }
  | {
      /** Sequence diagrams: changes the operator of a fragment and the keywords of its branches. */
      readonly kind: "setFragmentOperator";
      readonly diagram: string;
      readonly fragment: string;
      readonly operator: string;
    }
  | {
      /** Sequence diagrams: sets or (with `null`) removes a branch condition. */
      readonly kind: "setFragmentCondition";
      readonly diagram: string;
      readonly fragment: string;
      readonly branch: number;
      readonly condition: string | null;
    }
  | {
      /** Replaces the icon reference of an `icon` object or the path of an `image` object. */
      readonly kind: "setElementSource";
      readonly diagram: string;
      readonly element: string;
      readonly source: string;
    }
  | {
      /**
       * Appends an empty `diagram <id>: <type> { }` after the last top-level statement of the file,
       * with `language "0.2"` first in a file without a header.
       */
      readonly kind: "createDiagram";
      readonly type: CreatableDiagramType;
      /** The new diagram's id; the first of `diagram1`, `diagram2`… the file does not use by default. */
      readonly id?: string;
      /** Written as `title "…"` inside the new block. */
      readonly title?: string;
    }
  | {
      /**
       * Copies a flow diagram as drawn into a new free diagram after it, linking every object to
       * its source. Hosts pass the drawn boxes and the measures of the source's theme.
       */
      readonly kind: "convertToFree";
      readonly diagram: string;
      /** The new diagram's id; `<source>_free` (or `_2`, `_3`…) by default. */
      readonly id?: string;
      /** Boxes of every element in diagram coordinates (`LayoutResult.boxes`). */
      readonly boxes: ReadonlyMap<
        string,
        { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
      >;
      /**
       * Group padding and title band and the tag text size. A titled group's interior starts
       * `groupHeader` below its top edge; an untitled one's (label `""`, no description, no icon),
       * `groupPadding`.
       */
      readonly metrics: {
        readonly groupPadding: number;
        readonly groupHeader: number;
        readonly tagSize: number;
      };
    };

export type EditOperationKind = EditOperation["kind"];

/** The types of diagrams `createDiagram` writes: C4 views need a model, written in text. */
export type CreatableDiagramType = "flow" | "free" | "sequence";

export interface EditPlan {
  readonly operation: EditOperation;
  /** Revision of the document the plan was computed against. */
  readonly baseRevision: number;
  /** Minimal edits against the text of `baseRevision`. */
  readonly edits: readonly TextEdit[];
  /** Edits that restore the original text when applied to the edited text. */
  readonly inverse: readonly TextEdit[];
  /** Information for the user, such as comments that mention a renamed element. */
  readonly notes: readonly string[];
}

export type DependentKind =
  | "element"
  | "relation"
  | "place"
  | "size"
  | "route"
  | "label"
  | "style"
  | "animate"
  | "constraint"
  | "link"
  | "event"
  | "space"
  | "gap"
  | "story"
  /** A note attached to the element: removing the element leaves the note without its clause. */
  | "attachment";

/** A statement that depends on the target of an operation. */
export interface Dependent {
  readonly kind: DependentKind;
  readonly name: string;
  readonly description: string;
  readonly range: Range;
}

export interface EditRejection {
  readonly code: string;
  readonly reason: string;
  readonly dependents?: readonly Dependent[];
  /** In a batch, the index of the operation that was refused. */
  readonly operationIndex?: number;
}

export type PlanResult =
  | { readonly ok: true; readonly plan: EditPlan }
  | { readonly ok: false; readonly rejection: EditRejection };

export interface VersionedDocument {
  readonly text: string;
  readonly revision: number;
}

export type ApplyResult =
  | { readonly ok: true; readonly document: VersionedDocument }
  | { readonly ok: false; readonly rejection: EditRejection };

export interface PlanOptions {
  /** Revision of the text that was compiled; defaults to 0. */
  readonly revision?: number;
}
