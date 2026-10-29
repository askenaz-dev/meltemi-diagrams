import type { DiagramTypeDefinition } from "./diagram-types.js";
import type {
  Block,
  CstNode,
  Statement,
  Diagnostic,
  DiagramBlock,
  ExportBlock,
  ImportStatement,
  KeywordStatement,
  ModelBlock,
  ParseResult,
  Range,
  RelationStatement,
  ShorthandDeclaration,
  StoryBlock,
  ThemeBlock,
  Token,
} from "@meltemi/diagrams-language";

/**
 * Flow kinds: `node`, `decision`, `data` and `group` take part in the graph. `note` (free text) and
 * `tag` (a small pill) are annotations placed on the sheet; they may be relation endpoints too, but
 * usually are not.
 */
export type FlowElementKind = "node" | "decision" | "data" | "group" | "note" | "tag";
/** Free kinds: shapes, text, icons, images, notes, stickies, lines, pen strokes and groups. */
export type FreeElementKind =
  "box" | "text" | "icon" | "image" | "note" | "sticky" | "line" | "pen" | "group";
/** Sequence kinds: the participants, and groups of participants. */
export type ParticipantKind =
  | "participant"
  | "actor"
  | "boundary"
  | "control"
  | "entity"
  | "database"
  | "collections"
  | "queue";
/** Entities of an architecture model, drawn by C4 views. */
export type EntityKind = "person" | "system" | "container" | "datastore" | "component";
export type ElementKind = FlowElementKind | FreeElementKind | ParticipantKind | EntityKind;
export type DiagramType = "flow" | "free" | "sequence" | "c4";
/** The level of a C4 view. */
export type C4Level = "context" | "container" | "component";
export type LineStyle = "solid" | "dashed";
export type Direction = "LR" | "RL" | "TB" | "BT";
export type LayoutMode = "auto" | "assisted" | "manual";
export type Port = "north" | "south" | "east" | "west" | "auto";
export type PortSide = "north" | "south" | "east" | "west";
export type Routing = "auto" | "orthogonal" | "polyline" | "bezier";

/** `port <name> <side> [<n>%]` in an element block. */
export interface PortDefinition {
  readonly name: string;
  readonly side: PortSide;
  /** Position along the side from 0 to 1: left to right on north and south, top to bottom on east and west. */
  readonly position: number;
  readonly range: Range;
  readonly nameRange: Range;
}
export type AnimationEffect = "flow" | "pulse" | "dash" | "trace";
export type AnimationDirection = "forward" | "reverse";
export type Preset = "document" | "slide" | "board";
/** How a list group arranges its children: one under the other, or side by side. */
export type ListLayout = "column" | "row";
/** Where the children of a list sit across its axis. */
export type ListAlign = "start" | "center" | "end" | "stretch";
/** Targets of `rule <kind> { }`. */
export type RuleKind = ElementKind | "relation" | "fragment";
/** A style value: a colour (`@<token>` for a theme colour token), a word, or a number. */
export type StyleValue = string | number;
export type StyleProperties = Readonly<Record<string, StyleValue>>;

/** A class name applied with `class a, b`, where it is written. */
export interface ClassUse {
  readonly name: string;
  readonly range: Range;
}

/** An `icon` value written in a style statement, class or rule, where it is written. */
export interface IconUse {
  readonly reference: string;
  readonly range: Range;
}

/** `class <id> { }` in a diagram or a theme block. */
export interface ClassDefinition {
  readonly id: string;
  readonly properties: StyleProperties;
  readonly range: Range;
  readonly idRange: Range;
  readonly node: KeywordStatement;
}

/** `rule <kind> { }` in a diagram or a theme block. */
export interface RuleEntry {
  readonly kind: RuleKind;
  readonly properties: StyleProperties;
  readonly range: Range;
  readonly kindRange: Range;
  readonly node: KeywordStatement;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * `link <block>.<element>` in an element block: identity with an element of another diagram, or
 * with an entity of an architecture model (`link commerce.shop.api`).
 */
export interface ElementLink {
  /** The element whose block holds the link. */
  readonly owner: string;
  /** The reference as written, such as `checkout.api` or `shop.checkout.api`. */
  readonly text: string;
  /** The namespace import the link goes through, or null. */
  readonly binding: string | null;
  /**
   * The linked block: a diagram or model id of the file, a member import's name, or the id in the
   * namespace's file.
   */
  readonly diagram: string;
  /** The element id in a diagram, or the entity path in a model. */
  readonly element: string;
  /** What the link names once resolved; null when it goes through an import not resolved yet. */
  readonly target: "diagram" | "model" | null;
  readonly range: Range;
  readonly diagramRange: Range;
  readonly elementRange: Range;
  /** The `link` statement. */
  readonly node: KeywordStatement;
}

/** A path written in an `image` declaration. */
export interface ImageUse {
  readonly element: string;
  readonly path: string;
  /** Range of the string literal. */
  readonly range: Range;
}

/** The points of a free `line`: `from (x, y) to (x, y) via [(x, y), ...]`. */
export interface LinePoints {
  readonly from: Point;
  readonly to: Point;
  readonly via: readonly Point[];
}

/** The points of a `pen` stroke: `pen <id> [(x, y), (x, y), ...]`, one at least. */
export interface PenPoints {
  readonly points: readonly Point[];
}

/**
 * A list: a free group whose block writes `layout column` or `layout row`, which arranges its
 * children in source order along that axis.
 */
export interface ListGroup {
  readonly layout: ListLayout;
  /** `spacing <n>`: the distance between children; null when not written. */
  readonly spacing: number | null;
  /** `align start|center|end|stretch`: where children sit across the axis; null if not written. */
  readonly align: ListAlign | null;
}

/** A box, decision, data store or group of a flow diagram. */
export interface Element {
  readonly id: string;
  readonly kind: ElementKind;
  readonly label: string;
  /** True when the element exists only because a relation mentions it. */
  readonly implicit: boolean;
  readonly description: string | null;
  /** Classes applied in the declaration block, in the order written. */
  readonly classes: readonly ClassUse[];
  /** Named ports declared in the block, in the order written. */
  readonly ports: readonly PortDefinition[];
  /** The `layer` of the block (free diagrams), or null for the default layer. */
  readonly layer: string | null;
  readonly layerRange: Range | null;
  /** The `link` of the block, or null. */
  readonly link: ElementLink | null;
  /** The `url` of the block (or of the C4 entity), which exports turn into a hyperlink; or null. */
  readonly url: string | null;
  /** The icon reference of `icon` objects or the path of `image` objects; null otherwise. */
  readonly source: string | null;
  readonly sourceRange: Range | null;
  /** Whether the declaration writes a label; elements without one may take a linked entity's. */
  readonly labelWritten: boolean;
  /** C4 views: the model entity the element draws; null elsewhere. */
  readonly entity: EntityRef | null;
  /** C4 views: the entity's technology. */
  readonly technology: string | null;
  /** C4 views: an external person or system. */
  readonly external: boolean;
  /** The shape the declaration implies: `cylinder` for `id[("Label")]`; a style's `shape` is apart. */
  readonly shape: string | null;
  /**
   * Free `line` objects: the points written in the statement, in the interior coordinates of the
   * innermost group; null on every other kind.
   */
  readonly line: LinePoints | null;
  /**
   * `pen` strokes: the points written in the statement, decimals kept, in the interior coordinates
   * of the innermost group; null on every other kind.
   */
  readonly pen: PenPoints | null;
  /**
   * Free groups whose block writes `layout column|row`: the list; null on other groups and on every
   * element.
   */
  readonly list: ListGroup | null;
  /**
   * Notes: the id of the element the note is attached to (`note <id> "Text" on <element>`), or
   * the entity path in a C4 view; null without the clause and on every other kind.
   */
  readonly attachedTo: string | null;
  readonly attachedToRange: Range | null;
  /** Declared diagram types: the element's kind there (it is drawn as a `box`); null elsewhere. */
  readonly typeKind: string | null;
  /** Declared diagram types: the values of the kind's own properties. */
  readonly data: Readonly<Record<string, string | number | boolean>>;
  /** Ids of the enclosing groups, outermost first. */
  readonly groupPath: readonly string[];
  /** Range of the declaring statement, or of the first mention for implicit elements. */
  readonly range: Range;
  readonly idRange: Range;
  readonly idToken: Token;
  /** Declaring statement; undefined for implicit elements. */
  readonly node: ShorthandDeclaration | KeywordStatement | undefined;
}

export interface Relation {
  /** The relation id, or `<from>-><to>#<n>` for anonymous relations. Never written to the source. */
  readonly key: string;
  readonly id: string | null;
  readonly from: string;
  readonly to: string;
  readonly line: LineStyle;
  /**
   * Where the written token puts heads: `end` for `->` and `-->`, `both` for `<->` and `<-->`,
   * `none` for the lines `--` and `---`. The default of the drawn heads; styles still apply.
   */
  readonly heads: "end" | "both" | "none";
  /** Written `<->` or `<-->` (`heads` is `both`): a head at both ends, unless styles say otherwise. */
  readonly twoWay: boolean;
  /** Sequence diagrams: `kind async` in the block. */
  readonly async: boolean;
  /**
   * Sequence diagrams: the key of the call a `return` answers, inside that call's block; null for
   * every other relation and in every other profile.
   */
  readonly returns: string | null;
  /** C4 views: the technology of the model relation, or of the combination. */
  readonly technology: string | null;
  /** C4 views: the keys of the model relations the relation stands for; empty elsewhere. */
  readonly sources: readonly string[];
  /** C4 views: true when an end was lifted to a visible ancestor. */
  readonly derived: boolean;
  readonly label: string | null;
  readonly description: string | null;
  /**
   * `assumption "<why>"`: the relation was inferred, not confirmed (decision 0029). C4 views take
   * it from the model when every relation they combine is an assumption. Null when confirmed.
   */
  readonly assumption: string | null;
  /** Declared diagram types: the values of the relation properties the type declares. */
  readonly data: Readonly<Record<string, string | number | boolean>>;
  /** Classes applied in the relation block, in the order written. */
  readonly classes: readonly ClassUse[];
  /** The `layer` of the block (free diagrams), or null for the default layer. */
  readonly layer: string | null;
  readonly layerRange: Range | null;
  readonly groupPath: readonly string[];
  readonly range: Range;
  /** Range of the `as <id>` identifier; null for anonymous relations. */
  readonly idRange: Range | null;
  /** The relation statement, or a sequence diagram's `return` statement (`returns` is set). */
  readonly node: RelationStatement | KeywordStatement;
}

interface PlacementBase {
  readonly target: string;
  readonly range: Range;
  readonly targetRange: Range;
  readonly node: KeywordStatement;
}

export interface PlaceEntry extends PlacementBase {
  readonly statement: "place";
  readonly x: number;
  readonly y: number;
}

export interface SizeEntry extends PlacementBase {
  readonly statement: "size";
  readonly width: number;
  readonly height: number;
}

export interface RouteEndpoint {
  readonly element: string;
  /** A compass port, `auto`, or the name of a port declared by the element. */
  readonly port: string;
  /** True when `port` is a named port of the element. */
  readonly named: boolean;
  /** Whether the port is written in the source (`api.east`) or implied (`api`). */
  readonly explicitPort: boolean;
  /**
   * The point of a compass side the end is pinned to, from 0 to 1 (`api.east 25%` is 0.25), like a
   * named port's position; absent when the anchor rules choose the point.
   */
  readonly position?: number;
}

export interface RouteEntry extends PlacementBase {
  readonly statement: "route";
  readonly from: RouteEndpoint;
  readonly to: RouteEndpoint;
  readonly via: readonly Point[];
}

export interface LabelEntry extends PlacementBase {
  readonly statement: "label";
  readonly at: number;
  readonly offset: Point;
}

/**
 * Sequence diagrams: `space <event> <n> [before|after]`, extra room above (`before`, the default)
 * or below a named event; 0 or more.
 */
export interface SpaceEntry extends PlacementBase {
  readonly statement: "space";
  readonly amount: number;
  readonly side: "before" | "after";
}

/**
 * Sequence diagrams: `gap <participant> <n> [before|after]`, room added left (`before`, the
 * default) or right of a participant; negative between two participants brings them closer, down
 * to the floor the layout keeps.
 */
export interface GapEntry extends PlacementBase {
  readonly statement: "gap";
  readonly amount: number;
  readonly side: "before" | "after";
}

export type PlacementEntry =
  PlaceEntry | SizeEntry | RouteEntry | LabelEntry | SpaceEntry | GapEntry;

export type ConstraintKind = "align" | "row" | "column" | "order" | "distance";
export type AlignEdge = "top" | "middle" | "bottom" | "left" | "center" | "right";

/** A relative constraint of a placement block. */
export interface ConstraintEntry {
  readonly kind: ConstraintKind;
  readonly targets: readonly string[];
  readonly targetRanges: readonly Range[];
  /** The aligned edge: written for `align`, `middle` for `row`, `center` for `column`. */
  readonly edge: AlignEdge | null;
  /** The axis of `order`, or null for the diagram's direction. */
  readonly axis: "horizontal" | "vertical" | null;
  /** The minimum gap of `distance`. */
  readonly distance: number | null;
  readonly range: Range;
  readonly node: KeywordStatement;
}

/** What a style or animation names: an element, a named relation, or a named note or fragment. */
export type TargetKind = "element" | "relation" | "event";

export interface StyleEntry {
  readonly target: string;
  readonly targetKind: TargetKind;
  /** Explicit properties; numbers stay numbers and colour token names are `@<token>`. */
  readonly properties: StyleProperties;
  /** Classes applied by this statement, in the order written. */
  readonly classes: readonly ClassUse[];
  readonly range: Range;
  readonly targetRange: Range;
  readonly node: KeywordStatement;
}

export interface AnimationEntry {
  readonly target: string;
  readonly targetKind: TargetKind;
  readonly effect: AnimationEffect | null;
  /** Written values; `null` when the statement leaves them to the effect's default. */
  readonly durationMs: number | null;
  readonly repeat: number | "forever" | null;
  readonly delayMs: number | null;
  readonly direction: AnimationDirection | null;
  readonly particles: number | null;
  /** A CSS colour, or `@<token>` for a colour token. */
  readonly color: string | null;
  readonly range: Range;
  readonly targetRange: Range;
  readonly node: KeywordStatement;
}

export interface DiagramProperties {
  readonly direction: Direction;
  readonly layout: LayoutMode;
  readonly theme: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly preset: Preset | null;
  readonly canvas: { readonly width: number; readonly height: number } | null;
  readonly routing: Routing;
  /** Layers from back to front; `main` always present. Flow diagrams have only `main`. */
  readonly layers: readonly string[];
  /** Sequence diagrams: the number of the first message with `autonumber`, or null. */
  readonly autonumber: number | null;
  /**
   * Sequence diagrams: `spacing <n>`, the distance between adjacent heads in diagram units, or
   * null for the default (40, scaled with the theme's labels).
   */
  readonly spacing: number | null;
}

export type ReferenceRole =
  | "declaration"
  | "relation-id"
  | "relation-endpoint"
  | "place"
  | "size"
  | "route"
  | "route-endpoint"
  | "label"
  | "style"
  | "animate"
  | "constraint"
  | "event"
  | "space"
  | "gap"
  | "scenario"
  /** The target of a note's `on <element>`. */
  | "attachment";
/** An identifier token in the source that resolves to an element or a named relation. */
export interface Reference {
  readonly token: Token;
  readonly target: string;
  readonly targetKind: TargetKind;
  readonly role: ReferenceRole;
  /** The statement that contains the token. */
  readonly statement: CstNode;
}

export type FragmentOperator = "alt" | "opt" | "loop" | "par" | "break" | "critical" | "region";

/** Where an event sits: the fragments and branches around it, outermost first. */
/** A place in a fragment: its key and the branch. */
export interface FragmentPlace {
  readonly fragment: string;
  /** 0-based branch index. */
  readonly branch: number;
}

/** A place in a call's block: the key of the call. */
export interface MessagePlace {
  readonly message: string;
}

/** Where an event stands: inside a fragment's branch, or inside a call's block. */
export type EventPlace = FragmentPlace | MessagePlace;

interface EventBase {
  /** The relation key of a message; otherwise the id, or `<kind>#<n>` in order of appearance. */
  readonly key: string;
  /** The written id of a note or fragment, or of a named message; null otherwise. */
  readonly id: string | null;
  /** The range of the written id, or null. */
  readonly idRange: Range | null;
  readonly path: readonly EventPlace[];
  readonly range: Range;
  readonly node: Statement;
}

export interface MessageEvent extends EventBase {
  readonly kind: "message";
  readonly relation: string;
  /**
   * The events of the call's block, which happen after its arrow and before what follows it, the
   * receiver active meanwhile; empty for a message without a block.
   */
  readonly events: readonly SequenceEvent[];
}

export interface ParticipantEvent extends EventBase {
  readonly kind: "activate" | "deactivate" | "create" | "destroy";
  readonly participant: string;
  readonly participantRange: Range;
}

export interface NoteEvent extends EventBase {
  readonly kind: "note";
  readonly position: "over" | "left" | "right";
  readonly participants: readonly string[];
  readonly text: string;
}

export interface FragmentBranch {
  /** The condition or label, or null when none is written. */
  readonly condition: string | null;
  readonly conditionRange: Range | null;
  readonly events: readonly SequenceEvent[];
  /** The clause: `alt "…" { }`, `else "…" { }`… */
  readonly range: Range;
  readonly block: Block;
}

export interface FragmentEvent extends EventBase {
  readonly kind: "fragment";
  readonly operator: FragmentOperator;
  readonly branches: readonly FragmentBranch[];
}

export interface DividerEvent extends EventBase {
  readonly kind: "divider";
  readonly label: string;
}

export interface DelayEvent extends EventBase {
  readonly kind: "delay";
  readonly label: string | null;
}

/** One event of a sequence diagram, in order. */
export type SequenceEvent =
  MessageEvent | ParticipantEvent | NoteEvent | FragmentEvent | DividerEvent | DelayEvent;

/** One statement of a `scenario` block. */
export interface ScenarioChoice {
  readonly kind: "choose" | "repeat" | "skip" | "take";
  readonly fragment: string;
  /** `choose`: the 0-based branch. */
  readonly branch: number | null;
  /** `repeat`: the iterations. */
  readonly iterations: number | null;
  readonly range: Range;
  readonly fragmentRange: Range;
  readonly node: KeywordStatement;
}

/** `scenario <id> ["Label"] { }`: one path through the alternatives and loops. */
export interface SequenceScenario {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly ScenarioChoice[];
  readonly range: Range;
  readonly idRange: Range;
  readonly node: KeywordStatement;
}

/**
 * A compiled `flow`, `free` or `sequence` diagram. Both profiles share this structure (decision 0018): free
 * diagrams use the free kinds, layers and interior coordinates for group children.
 */
export interface FlowDiagram {
  readonly type: DiagramType;
  readonly id: string;
  readonly range: Range;
  readonly idRange: Range;
  readonly node: DiagramBlock;
  readonly block: Block | undefined;
  readonly properties: DiagramProperties;
  readonly elements: readonly Element[];
  readonly relations: readonly Relation[];
  readonly placement: readonly PlacementEntry[];
  /** Relative constraints of placement blocks, in source order. */
  readonly constraints: readonly ConstraintEntry[];
  readonly styles: readonly StyleEntry[];
  readonly animations: readonly AnimationEntry[];
  /** `class <id> { }` declarations of the diagram. */
  readonly classes: readonly ClassDefinition[];
  /** `rule <kind> { }` statements of the diagram, in source order. */
  readonly rules: readonly RuleEntry[];
  /**
   * Icon values of the diagram's style statements, classes and rules, and the sources of `icon`
   * objects, in source order.
   */
  readonly icons: readonly IconUse[];
  /** Paths of `image` objects, in source order. */
  readonly images: readonly ImageUse[];
  /** The `link` statements of element blocks, in source order. */
  readonly links: readonly ElementLink[];
  /** Ranges of the names listed by `layers`. */
  readonly layerRanges: ReadonlyMap<string, Range>;
  /** Sequence diagrams: the ordered tree of events; empty for other profiles. */
  readonly events: readonly SequenceEvent[];
  /** Every event of the tree by key, fragments' events included. */
  readonly eventsByKey: ReadonlyMap<string, SequenceEvent>;
  /** Sequence diagrams: the `scenario` blocks, in source order. */
  readonly scenarios: readonly SequenceScenario[];
  readonly references: readonly Reference[];
  /** C4 views: the level, scope, lists and labels; null for other profiles. */
  readonly c4: C4View | null;
  /** Tokens that name model entities: view references and links; empty when there are none. */
  readonly entityReferences: readonly EntityReference[];
  /** `placement { }` statements at diagram level, in source order. */
  readonly placementBlocks: readonly KeywordStatement[];
  readonly elementsById: ReadonlyMap<string, Element>;
  /** Relations by key (the id for named relations). */
  readonly relationsByKey: ReadonlyMap<string, Relation>;
  /**
   * A diagram of a type declared by a plugin: its definition (the diagram compiles on the free
   * profile, its kinds drawn as boxes); null for the built-in types.
   */
  readonly definition: DiagramTypeDefinition | null;
  /** True when the diagram contains syntax errors; edits are refused. */
  readonly hasSyntaxErrors: boolean;
  /** True when the diagram has any error diagnostic; it is left out of the JSON. */
  readonly hasErrors: boolean;
}

/** A diagram of an unknown type (`profile.unknown`). */
export interface UnsupportedBlock {
  readonly kind: "diagram";
  /** The type as written. */
  readonly profile: string;
  readonly id: string | null;
  readonly range: Range;
  readonly node: DiagramBlock;
}

/** A `theme <id> { }` block: tokens as written, resolved against built-in themes by the layout. */
export interface ThemeDefinition {
  readonly id: string;
  /** Name of the base theme, or null to inherit from the default theme. */
  readonly extends: string | null;
  readonly extendsRange: Range | null;
  /** Token values as written; colours and fonts are strings, enum tokens words, sizes numbers. */
  readonly tokens: Readonly<Record<string, string | number>>;
  readonly classes: readonly ClassDefinition[];
  readonly rules: readonly RuleEntry[];
  /** Icon values of the theme's classes and rules. */
  readonly icons: readonly IconUse[];
  readonly range: Range;
  readonly idRange: Range;
  readonly node: ThemeBlock;
}

/** A name bound by an `import` statement. */
export interface ImportBinding {
  /** The bound name: the namespace, the alias, or the imported id. */
  readonly name: string;
  /** The imported id for member imports; null for a namespace import. */
  readonly member: string | null;
  /** Range of the token that binds the name. */
  readonly range: Range;
  /** Range of the imported id for member imports. */
  readonly memberRange: Range | null;
}

/** An `import` statement as written; resolution happens in `@meltemi/diagrams-project`. */
export interface ImportDeclaration {
  readonly form: "namespace" | "members";
  /** The path string, or null when it is missing. */
  readonly path: string | null;
  readonly pathRange: Range | null;
  readonly bindings: readonly ImportBinding[];
  readonly range: Range;
  /** True when the statement follows a top-level block. */
  readonly afterBlock: boolean;
  readonly node: ImportStatement;
}

export interface Document {
  /** Version from the `language` header, or null when the file has none. */
  readonly language: string | null;
  readonly imports: readonly ImportDeclaration[];
  readonly diagrams: readonly FlowDiagram[];
  readonly themes: readonly ThemeDefinition[];
  readonly models: readonly ModelDefinition[];
  /** The `story` blocks of the file, in source order. */
  readonly stories: readonly StoryDefinition[];
  /** The `export` profiles of the file, in source order. */
  readonly exports: readonly ExportProfile[];
  /** Diagrams of an unknown type, kept so that tools can name them. */
  readonly unsupported: readonly UnsupportedBlock[];
}

// ---------------------------------------------------------------------- export profiles

export type ExportFormat = "svg" | "png" | "pdf" | "html" | "mp4" | "webm" | "gif";

/** What a profile exports: a diagram (of this file or imported) or a story of this file. */
export interface ExportTarget {
  /** The name written after `for`. */
  readonly name: string;
  readonly kind: "diagram" | "story" | null;
  readonly diagram: FlowDiagram | null;
  readonly story: StoryDefinition | null;
  /** The file of an imported diagram; null for this file. */
  readonly file: string | null;
}

/** `export <id> for <target> { … }`: a reproducible delivery. */
export interface ExportProfile {
  readonly id: string;
  readonly target: ExportTarget;
  readonly format: ExportFormat | null;
  readonly size: { readonly width: number; readonly height: number } | null;
  readonly scale: number | null;
  /** `transparent`, a quoted colour, or a colour token as `@<name>`; null for the theme's. */
  readonly background: string | null;
  readonly atMs: number | null;
  readonly motion: "static" | "animated" | null;
  readonly theme: string | null;
  readonly fonts: "embedded" | "outlined" | "system" | null;
  readonly scenario: string | null;
  readonly link: string | null;
  readonly fps: number | null;
  readonly durationMs: number | null;
  /** The output path relative to the file, or null for `<stem>.<id>.<ext>`. */
  readonly file: string | null;
  readonly autoplay: boolean;
  readonly loop: boolean;
  readonly embed: boolean;
  /** The options as written, for editors. */
  readonly options: readonly { readonly name: string; readonly range: Range }[];
  readonly range: Range;
  readonly idRange: Range;
  readonly node: ExportBlock;
}

// ---------------------------------------------------------------------- architecture models

/** An entity of a model, as a view or a link names it. */
export interface EntityRef {
  /** The model's id in its file. */
  readonly model: string;
  readonly path: string;
  /** The model's file, or null for the compiled file. */
  readonly file: string | null;
}

/** `person`, `system`, `container`, `datastore` or `component` in a `model` block. */
export interface ModelEntity {
  /** The ids from the model's root joined with dots, such as `shop.api`. */
  readonly path: string;
  readonly id: string;
  readonly kind: EntityKind;
  readonly label: string;
  readonly description: string | null;
  readonly technology: string | null;
  readonly external: boolean;
  /** A hyperlink for exports, or null. */
  readonly url: string | null;
  /** The enclosing entity's path, or null at the root. */
  readonly parent: string | null;
  readonly range: Range;
  readonly idRange: Range;
  readonly idToken: Token;
  readonly node: KeywordStatement;
}

/** A relation of a model, between entity paths. */
export interface ModelRelation {
  /** The id, or `<from>-><to>#<n>`. */
  readonly key: string;
  readonly id: string | null;
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly technology: string | null;
  readonly description: string | null;
  /** `assumption "<why>"`: the relation was inferred, not confirmed; null when confirmed. */
  readonly assumption: string | null;
  readonly range: Range;
  readonly idRange: Range | null;
  /** The entity whose block holds the relation, or null at the model's root. */
  readonly scope: string | null;
  readonly node: RelationStatement;
}

export type EntityReferenceRole =
  | "declaration"
  | "endpoint"
  | "scope"
  | "include"
  | "exclude"
  | "label"
  | "relation"
  | "placement"
  | "style"
  | "animate"
  | "link"
  /** A target of a story action in a C4 view. */
  | "story"
  /** The target of a view note's `on <entity path>`. */
  | "attachment";

/** A token that names an entity: one part of a qualified reference such as `shop.api`. */
export interface EntityReference {
  readonly token: Token;
  /** The model, as the reference's file names it: its id, an import name or `<namespace>.<id>`. */
  readonly model: string;
  /** The path the token names: `shop` for the first part of `shop.api`. */
  readonly path: string;
  readonly role: EntityReferenceRole;
}

/** `model <id> { }`: entities, nesting and relations shared by C4 views. */
export interface ModelDefinition {
  readonly id: string;
  readonly range: Range;
  readonly idRange: Range;
  readonly node: ModelBlock;
  /** Entities in source order, parents before children. */
  readonly entities: readonly ModelEntity[];
  readonly entitiesByPath: ReadonlyMap<string, ModelEntity>;
  readonly relations: readonly ModelRelation[];
  readonly relationsByKey: ReadonlyMap<string, ModelRelation>;
  /** Every entity token of the model block: declarations and relation endpoints. */
  readonly references: readonly EntityReference[];
  readonly hasErrors: boolean;
}

/** A model found for a name, with the file it is defined in. */
export interface ResolvedModel {
  readonly definition: ModelDefinition;
  /** The model's file, or null for the compiled file. */
  readonly file: string | null;
}

export interface CompileOptions {
  /**
   * Resolves a model named through an import: a member import (`commerce`) or a namespace
   * (`models.commerce`). Hosts with a project pass it; local models never need it.
   */
  readonly models?: (name: string) => ResolvedModel | undefined;
  /**
   * Resolves a diagram named through an import, for stories: a member import (`checkout`) or a
   * namespace (`views.checkout`). Local diagrams never need it.
   */
  readonly diagrams?: (name: string) => ResolvedDiagram | undefined;
  /** Diagram types declared by plugins (decision 0030), compiled besides the built-in ones. */
  readonly types?: readonly DiagramTypeDefinition[];
}

/** A diagram found through an import, with the file that defines it. */
export interface ResolvedDiagram {
  readonly diagram: FlowDiagram;
  /** The defining file's path, or null for the compiled file itself. */
  readonly file: string | null;
}

// ---------------------------------------------------------------------- stories

export type StoryActionKind =
  "reveal" | "hide" | "highlight" | "focus" | "camera" | "trace" | "draw" | "hold" | "parallel";
export type StoryTransitionKind = "cut" | "fade" | "morph";

/**
 * An element, relation or event a story action names, in the scene's view. Pens and free lines
 * are elements; what `draw` takes is told by `drawTargetKind`.
 */
export interface StoryTarget {
  readonly id: string;
  readonly kind: TargetKind;
  readonly range: Range;
}

/** The diagram a story or scene shows: written name, and the diagram when it resolved. */
export interface StoryView {
  readonly name: string;
  readonly diagram: FlowDiagram | null;
  /** The file that defines it for imported diagrams; null for the story's own file. */
  readonly file: string | null;
}

export interface StoryAction {
  readonly kind: StoryActionKind;
  /** Scene index, then action indexes through `parallel` blocks. */
  readonly path: readonly number[];
  readonly targets: readonly StoryTarget[];
  /** `focus all` or `camera all`. */
  readonly all: boolean;
  /** The time the action takes, with defaults applied; `parallel`: its longest action. */
  readonly durationMs: number;
  /** The written time (`over` or `hold`), or null. */
  readonly writtenMs: number | null;
  /** Absolute start in the story. */
  readonly startMs: number;
  /** Actions of a `parallel` block. */
  readonly children: readonly StoryAction[];
  readonly range: Range;
  /** The written time's argument, for edits; null when none is written. */
  readonly timeRange: Range | null;
  readonly node: KeywordStatement;
}

export interface StoryTransition {
  readonly kind: StoryTransitionKind;
  readonly durationMs: number;
  readonly writtenMs: number | null;
  readonly startMs: number;
  readonly range: Range;
  readonly timeRange: Range | null;
  readonly node: KeywordStatement;
}

export interface StoryScene {
  readonly id: string;
  readonly title: string | null;
  readonly index: number;
  readonly view: StoryView;
  readonly transition: StoryTransition | null;
  readonly actions: readonly StoryAction[];
  readonly startMs: number;
  readonly durationMs: number;
  readonly range: Range;
  readonly idRange: Range;
  readonly node: KeywordStatement;
}

/** A part of a story target in a C4 view that names an entity of the view's model. */
export interface StoryEntityReference extends EntityReference {
  /** The view the target is in; its `c4.resolved` is the model. */
  readonly view: StoryView;
}

/** A token of a story that names an element, relation or event of a view. */
export interface StoryReference {
  /** The view's diagram id. */
  readonly diagram: string;
  /** The file of the view; null for the story's own file. */
  readonly file: string | null;
  readonly id: string;
  readonly kind: TargetKind;
  readonly range: Range;
}

export interface StoryDefinition {
  readonly id: string;
  /** The diagram written after `for`. */
  readonly target: StoryView;
  readonly title: string | null;
  readonly description: string | null;
  readonly scenes: readonly StoryScene[];
  readonly durationMs: number;
  readonly references: readonly StoryReference[];
  /** The parts of targets in C4 views that name entities of the view's model. */
  readonly entityReferences: readonly StoryEntityReference[];
  readonly range: Range;
  readonly idRange: Range;
  readonly node: StoryBlock;
}

/** A local label of a C4 view: `label <entity-or-relation> "Text"`. */
export interface LocalLabel {
  readonly target: string;
  readonly targetKind: "element" | "relation";
  readonly text: string;
  readonly range: Range;
  readonly targetRange: Range;
  readonly node: KeywordStatement;
}

/** One entity of an `include` or `exclude` list. */
export interface ViewListEntry {
  readonly path: string;
  readonly range: Range;
}

/** The C4 part of a view. */
export interface C4View {
  /** The model as written after `using`. */
  readonly model: string;
  readonly modelRange: Range;
  /** The resolved model, or null when it is unknown or not resolved yet. */
  readonly resolved: ResolvedModel | null;
  readonly level: C4Level;
  readonly scope: string | null;
  /** The written `include` list, or null when the view draws its default set. */
  readonly includes: readonly ViewListEntry[] | null;
  readonly excludes: readonly ViewListEntry[];
  readonly includeNode: KeywordStatement | null;
  readonly excludeNode: KeywordStatement | null;
  readonly labels: readonly LocalLabel[];
  /** Keys of the relations written in the view to combine model relations. */
  readonly combined: readonly string[];
}

export interface Compilation {
  readonly text: string;
  /** The options the text was compiled with; edits verify their result with them. */
  readonly options: CompileOptions;
  readonly parse: ParseResult;
  /** Syntax and semantic diagnostics, ordered by position. */
  readonly diagnostics: readonly Diagnostic[];
  readonly document: Document;
  /** True when there is no error diagnostic. */
  readonly ok: boolean;
}
