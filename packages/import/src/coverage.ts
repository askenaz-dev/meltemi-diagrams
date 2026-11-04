import type { Locale } from "@meltemi/diagrams-i18n";
import { BOUNDARY_PARAMS, C4_DROPPED_MACROS, ENTITY_MACROS } from "./c4.js";
import { COVERAGE_ES } from "./coverage-es.js";
import { MERMAID_UNSUPPORTED } from "./detect.js";
import { messages, type CoverageNote } from "./messages/index.js";
import { ARCHITECTURE_ICONS } from "./mermaid/architecture.js";
import { FLOW_KIND_OF_SHAPE, MERMAID_SHAPES } from "./mermaid/shapes.js";
import { DESCRIPTION_KINDS, PLAIN_CONTAINERS } from "./plantuml/description.js";
import type { ConstructStatus, SourceFormat } from "./report.js";

/** One construct of a source language and what the importer makes of it. */
export interface CoverageEntry {
  /** The section of the docs: a diagram type, `Common` or `Preprocessor`. */
  readonly section: string;
  /** The construct name in findings; a trailing `*` matches a family. */
  readonly construct: string;
  /** The source syntax, as Markdown. */
  readonly source: string;
  readonly status: ConstructStatus;
  /** What the sheet gets, as Markdown. */
  readonly target: string;
  /** What else to know about the mapping, in English, as Markdown. */
  readonly notes?: string;
  /**
   * The same note in Spanish, present exactly when `notes` is, so the import documentation can be
   * written in both languages. `coverageNotes` picks the note of a language.
   */
  readonly notesEs?: string;
}

/** The note of a coverage entry in a language: Spanish for `es`, English otherwise. */
export function coverageNotes(entry: CoverageEntry, locale: Locale): string | undefined {
  return locale === "es" ? entry.notesEs : entry.notes;
}

/** The language versions the tables were written against. */
export const COVERAGE_VERSIONS = {
  mermaid: "Mermaid 11",
  plantuml: "PlantUML 1.2025 and C4-PlantUML 2",
} as const;

/** An entry, with its note in both languages from the catalogs. */
const e = (
  section: string,
  construct: string,
  source: string,
  status: ConstructStatus,
  target: string,
  note?: CoverageNote,
): CoverageEntry =>
  note === undefined
    ? { section, construct, source, status, target }
    : {
        section,
        construct,
        source,
        status,
        target,
        notes: messages("en").coverage[note],
        notesEs: messages("es").coverage[note],
      };

function c4Entries(prefix: string, section: string): CoverageEntry[] {
  const out: CoverageEntry[] = [];
  for (const [name, macro] of Object.entries(ENTITY_MACROS)) {
    const target = `\`${macro.kind}\`${macro.external ? " with `external`" : ""}`;
    out.push(
      e(
        section,
        `${prefix}.${name}`,
        `\`${name}(alias, label, …)\``,
        macro.approx ? "approximated" : "mapped",
        target,
        macro.approx,
      ),
    );
  }
  for (const name of Object.keys(BOUNDARY_PARAMS)) {
    const target =
      name === "System_Boundary"
        ? "the `system` holding its containers; the view's scope"
        : name === "Container_Boundary"
          ? "the `container` holding its components; the view's scope"
          : "flattened: its elements are kept";
    const status: ConstructStatus =
      name === "System_Boundary" || name === "Container_Boundary" ? "mapped" : "approximated";
    const note: CoverageNote | undefined =
      name === "Container_Boundary"
        ? "containerBoundaryAsSystem"
        : name === "Boundary"
          ? "boundaryType"
          : undefined;
    out.push(
      e(section, `${prefix}.${name}`, `\`${name}(alias, label) { … }\``, status, target, note),
    );
  }
  out.push(
    e(
      section,
      `${prefix}.Rel`,
      "`Rel(from, to, label, techn)`",
      "mapped",
      "a model relation with `technology`",
    ),
    e(
      section,
      `${prefix}.Rel_Back`,
      "`Rel_Back(…)`, `Rel_Back_Neighbor(…)`",
      "mapped",
      "the reversed relation",
    ),
    e(
      section,
      `${prefix}.Rel_direction`,
      "`Rel_U`, `Rel_D`, `Rel_L`, `Rel_R`, `Rel_Up`… `Rel_Neighbor`",
      "approximated",
      "a relation",
      "directions",
    ),
    e(section, `${prefix}.BiRel`, "`BiRel(…)` and its directions", "approximated", "two relations"),
    e(
      section,
      `${prefix}.RelIndex`,
      "`RelIndex(n, from, to, …)`",
      "approximated",
      "a relation",
      "stepNumbers",
    ),
    e(section, `${prefix}.Rel.descr`, "`$descr` of a relation", "dropped", "—"),
    e(section, `${prefix}.tags`, "`$tags`", "dropped", "—"),
    e(section, `${prefix}.sprite`, "`$sprite`", "dropped", "—"),
    e(section, `${prefix}.link`, "`$link`", "dropped", "—"),
    e(section, `${prefix}.LAYOUT_LEFT_RIGHT`, "`LAYOUT_LEFT_RIGHT()`", "mapped", "`direction LR`"),
    e(section, `${prefix}.LAYOUT_LANDSCAPE`, "`LAYOUT_LANDSCAPE()`", "mapped", "`direction LR`"),
    e(section, `${prefix}.LAYOUT_TOP_DOWN`, "`LAYOUT_TOP_DOWN()`", "mapped", "`direction TB`"),
    e(section, `${prefix}.level`, "a level without its scope", "approximated", "the next level up"),
    e(
      section,
      `${prefix}.dynamic`,
      "dynamic diagrams",
      "approximated",
      "a container view",
      "stepNumbers",
    ),
    e(
      section,
      `${prefix}.nesting`,
      "persons or systems inside a boundary",
      "approximated",
      "top-level entities",
    ),
    e(
      section,
      `${prefix}.Component`,
      "components outside a container boundary",
      "approximated",
      "a container that holds them",
    ),
    e(
      section,
      `${prefix}.ContainerDb`,
      "containers outside a system boundary",
      "approximated",
      "the scope's system, or one named after the diagram",
    ),
    e(section, `${prefix}.Container`, "`Container(…)`", "mapped", "`container`", "looseContainers"),
    e(
      section,
      `${prefix}.Deployment_Node`,
      "`Deployment_Node`, `Node`, `Node_L`, `Node_R`",
      "dropped",
      "—",
      "deployment",
    ),
    e(section, `${prefix}.Node`, "`Node(…)`", "dropped", "—", "essential"),
    e(section, `${prefix}.unknown`, "other macros", "dropped", "—", "essential"),
    e(section, `${prefix}.statement`, "unreadable lines", "dropped", "—", "syntaxEssential"),
    e(section, `${prefix}.boundary`, "unbalanced `{` `}`", "dropped", "—", "syntax"),
    e(section, `${prefix}.duplicate`, "an alias declared twice", "dropped", "—", "syntaxFirstKept"),
  );
  for (const name of C4_DROPPED_MACROS) {
    out.push(e(section, `${prefix}.${name}`, `\`${name}(…)\``, "dropped", "—", "drawingOnly"));
  }
  return out;
}

/** A `node` that keeps its shape in a style, as a cell of the tables (`COVERAGE_ES` has each). */
const nodeWithShape = (shape: string) => `\`node\` with \`shape ${shape}\``;

/** Mermaid's classic shapes, by their names in findings, as a flowchart writes them. */
const CLASSIC_SHAPES: readonly [shape: string, source: string][] = [
  ["rect", "`A[text]`"],
  ["round", "`A(text)`"],
  ["rhombus", "`A{text}`"],
  ["cylinder", "`A[(text)]`"],
  ["stadium", "`A([text])`"],
  ["subroutine", "`A[[text]]`"],
  ["circle", "`A((text))`"],
  ["doublecircle", "`A(((text)))`"],
  ["asymmetric", "`A>text]`"],
  ["hexagon", "`A{{text}}`"],
  ["lean_right", "`A[/text/]`"],
  ["lean_left", "`A[\\text\\]`"],
  ["trapezoid", "`A[/text\\]`"],
  ["inv_trapezoid", "`A[\\text/]`"],
];

/** The flowchart shapes: the classic ones and the `@{ shape: … }` names without a classic form. */
const FLOW_SHAPES: readonly [shape: string, source: string][] = [
  ...CLASSIC_SHAPES,
  ["document", "`A@{ shape: doc }`, `document`"],
  ["triangle", "`A@{ shape: tri }`, `extract`, `triangle`"],
];

const shapeStatus = (shape: string): ConstructStatus =>
  MERMAID_SHAPES[shape]!.approx ? "approximated" : "mapped";

/** What the approximated shapes lose. */
const SHAPE_NOTES: Readonly<Record<string, CoverageNote>> = {
  doublecircle: "doubleRing",
  lean_left: "mirrored",
  inv_trapezoid: "mirrored",
};

/** What the Mermaid importer does with each construct. */
export const MERMAID_COVERAGE: readonly CoverageEntry[] = [
  e(
    "Common",
    "mermaid.frontmatter.title",
    "front matter `title:`",
    "mapped",
    "`title`, and the diagram's id",
  ),
  e("Common", "mermaid.config", "front matter `config:`", "dropped", "—"),
  e("Common", "mermaid.frontmatter", "other front matter", "dropped", "—"),
  e("Common", "mermaid.init", "`%%{init: …}%%`", "dropped", "—"),
  e("Common", "mermaid.comment", "`%% text`", "mapped", "`// text` before the next statement"),
  e("Common", "mermaid.accTitle", "`accTitle: text`", "mapped", "`title`"),
  e(
    "Common",
    "mermaid.accDescr",
    "`accDescr: text`, `accDescr { … }`",
    "mapped",
    "`description`",
    "c4Description",
  ),
  e(
    "Common",
    "mermaid.label.html",
    "HTML in labels (`<b>`, `<i>`)",
    "approximated",
    "plain text",
    "lineBreaks",
  ),
  e(
    "Common",
    "mermaid.label.markdown",
    'Markdown strings ``"`**bold**`"``',
    "approximated",
    "plain text",
  ),
  e(
    "Common",
    "mermaid.label.icon",
    "`fa:fa-name` in labels",
    "approximated",
    "the text without the icon",
  ),
  ...MERMAID_UNSUPPORTED.map((name) =>
    e("Common", `mermaid.${name}`, `\`${name}\``, "dropped", "—", "unsupportedDiagram"),
  ),
  e(
    "Common",
    "mermaid.unknown",
    "an unknown diagram keyword",
    "dropped",
    "—",
    "unsupportedDiagram",
  ),
  e(
    "Common",
    "mermaid.diagram",
    "a source without a diagram",
    "dropped",
    "—",
    "unsupportedDiagram",
  ),

  e(
    "flowchart",
    "flowchart.direction",
    "`flowchart TB|TD|BT|LR|RL`, `graph …`, `direction`",
    "mapped",
    "`direction`; `layout auto`",
  ),
  e("flowchart", "flowchart.elk", "`flowchart-elk`", "approximated", "a flow diagram"),
  e("flowchart", "flowchart.header", "a malformed header", "dropped", "—", "syntax"),
  ...FLOW_SHAPES.map(([shape, source]) => {
    const kind = FLOW_KIND_OF_SHAPE[shape];
    const target = kind ? `\`${kind}\`` : nodeWithShape(MERMAID_SHAPES[shape]!.shape);
    const status = shapeStatus(shape);
    return e("flowchart", `flowchart.shape.${shape}`, source, status, target, SHAPE_NOTES[shape]);
  }),
  e(
    "flowchart",
    "flowchart.shape.h_cylinder",
    "`@{ shape: das }`, `lin-cyl`, `bow-rect` and other stored-data shapes",
    "approximated",
    "`data`",
  ),
  e(
    "flowchart",
    "flowchart.shape.text",
    "`@{ shape: text }`, `comment`, `brace`",
    "approximated",
    "`note`",
  ),
  e(
    "flowchart",
    "flowchart.shape.named",
    "other `@{ shape: … }` names",
    "approximated",
    "`node`",
    "classicShapes",
  ),
  e("flowchart", "flowchart.meta", "`@{ icon, img, pos, w, h, form, constraint }`", "dropped", "—"),
  e(
    "flowchart",
    "flowchart.subgraph",
    "`subgraph id [title] … end`, nested",
    "mapped",
    "`group`",
    "innermostSubgraph",
  ),
  e("flowchart", "flowchart.subgraph.direction", "`direction` inside a subgraph", "dropped", "—"),
  e("flowchart", "flowchart.link.arrow", "`-->`, `--->`", "mapped", "`->`"),
  e(
    "flowchart",
    "flowchart.link.open",
    "`---`, `-.-`, `===`",
    "mapped",
    "the line `--` for `---` and `===` (with `width 3`), the dashed line `---` for `-.-`",
  ),
  e("flowchart", "flowchart.link.dotted", "`-.->`", "mapped", "`-->`"),
  e("flowchart", "flowchart.link.thick", "`==>`", "mapped", "`->` with `width 3`"),
  e(
    "flowchart",
    "flowchart.link.label",
    "`-->|text|`, `-- text -->`",
    "mapped",
    "the relation's label",
  ),
  e(
    "flowchart",
    "flowchart.link.circle",
    "`--o`, `o--o`",
    "mapped",
    "`arrowhead circle`; `<->` with it for `o--o`",
  ),
  e(
    "flowchart",
    "flowchart.link.cross",
    "`--x`, `x--x`",
    "mapped",
    "`arrowhead cross`; `<->` with it for `x--x`",
  ),
  e(
    "flowchart",
    "flowchart.link.bidirectional",
    "`<-->`, `<-.->`, `<==>`",
    "mapped",
    "`<->`, `<-->`, `<->` with `width 3`",
  ),
  e("flowchart", "flowchart.link.invisible", "`~~~`", "dropped", "—"),
  e("flowchart", "flowchart.link.id", "`A e1@--> B`", "mapped", "`as e1`"),
  e(
    "flowchart",
    "flowchart.link.animation",
    "`e1@{ animate: true }`, `animation: fast|slow`",
    "mapped",
    "`animate e1 { effect flow }`",
  ),
  e(
    "flowchart",
    "flowchart.link.curve",
    "`e1@{ curve: … }`",
    "mapped",
    "`routing polyline` (`linear`), `orthogonal` (`step…`) or `bezier` (other curves)",
  ),
  e("flowchart", "flowchart.link.attribute", "other `e1@{ … }` attributes", "dropped", "—"),
  e(
    "flowchart",
    "flowchart.chain",
    "`A --> B --> C`, `A & B --> C`",
    "mapped",
    "one relation per pair",
  ),
  e(
    "flowchart",
    "flowchart.classDef",
    "`classDef name …`",
    "mapped",
    "`class name { … }`; `classDef default` becomes `rule node`, `rule decision`, `rule data`",
  ),
  e(
    "flowchart",
    "flowchart.class",
    "`class a,b name`, `a:::name`",
    "mapped",
    "`class name` in the element's block",
  ),
  e("flowchart", "flowchart.style", "`style id …`", "mapped", "`style id { … }`"),
  e(
    "flowchart",
    "flowchart.linkStyle",
    "`linkStyle 0,1 …`, `linkStyle default …`",
    "mapped",
    "`style e<n> { … }`, `rule relation { … }`",
  ),
  e(
    "flowchart",
    "flowchart.linkStyle.interpolate",
    "`linkStyle … interpolate`",
    "mapped",
    "`routing polyline`, `orthogonal` or `bezier`, as for `curve`",
  ),
  e(
    "flowchart",
    "flowchart.css",
    "CSS other than `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray`",
    "dropped",
    "—",
  ),
  e("flowchart", "flowchart.click", "`click`, `callback`, `href`", "dropped", "—"),
  e("flowchart", "flowchart.end", "`end` without `subgraph`", "dropped", "—", "syntax"),
  e("flowchart", "flowchart.statement", "unreadable lines", "dropped", "—", "syntaxKeptAsComment"),

  ...[
    "participant",
    "actor",
    "boundary",
    "control",
    "entity",
    "database",
    "collections",
    "queue",
  ].map((kind) =>
    e(
      "sequenceDiagram",
      `sequence.${kind}`,
      kind === "participant" || kind === "actor"
        ? `\`${kind} A as Label\``
        : `\`participant A@{ "type": "${kind}" }\``,
      "mapped",
      `\`${kind}\``,
    ),
  ),
  e(
    "sequenceDiagram",
    "sequence.participant.type",
    "other participant types",
    "approximated",
    "`participant`",
  ),
  e("sequenceDiagram", "sequence.box", "`box [colour] title … end`", "mapped", "`group`"),
  e("sequenceDiagram", "sequence.box.colour", "box colours", "dropped", "—"),
  e("sequenceDiagram", "sequence.create", "`create participant B`", "mapped", "`create b`"),
  e(
    "sequenceDiagram",
    "sequence.destroy",
    "`destroy B`",
    "mapped",
    "`destroy b` after B's next message",
  ),
  e("sequenceDiagram", "sequence.activate", "`activate A`", "mapped", "`activate a`"),
  e("sequenceDiagram", "sequence.deactivate", "`deactivate A`", "mapped", "`deactivate a`"),
  e(
    "sequenceDiagram",
    "sequence.activation.shorthand",
    "`A->>+B`, `B-->>-A`",
    "mapped",
    "`activate b`, `deactivate b`",
  ),
  e("sequenceDiagram", "sequence.message.->>", "`A->>B: text`", "mapped", '`a -> b: "text"`'),
  e("sequenceDiagram", "sequence.message.-->>", "`A-->>B`", "mapped", "`a --> b`"),
  e("sequenceDiagram", "sequence.message.-)", "`A-)B`", "mapped", "`a -> b { kind async }`"),
  e("sequenceDiagram", "sequence.message.--)", "`A--)B`", "mapped", "`a --> b { kind async }`"),
  e("sequenceDiagram", "sequence.message.->", "`A->B` (no arrowhead)", "approximated", "`a -> b`"),
  e(
    "sequenceDiagram",
    "sequence.message.-->",
    "`A-->B` (no arrowhead)",
    "approximated",
    "`a --> b`",
  ),
  e("sequenceDiagram", "sequence.message.-x", "`A-xB`", "approximated", "`a -> b`"),
  e("sequenceDiagram", "sequence.message.--x", "`A--xB`", "approximated", "`a --> b`"),
  e("sequenceDiagram", "sequence.message.<<->>", "`A<<->>B`", "mapped", "`a <-> b`"),
  e("sequenceDiagram", "sequence.message.<<-->>", "`A<<-->>B`", "mapped", "`a <--> b`"),
  e(
    "sequenceDiagram",
    "sequence.note",
    "`Note left of|right of|over A[,B]: text`",
    "mapped",
    '`note … "text"`',
  ),
  ...["loop", "alt", "else", "opt", "par", "and", "critical", "option", "break"].map((word) =>
    e(
      "sequenceDiagram",
      `sequence.${word}`,
      `\`${word} text\``,
      "mapped",
      word === "else" || word === "and" || word === "option"
        ? `\`} ${word} "text" {\``
        : `\`${word} ${word}1 "text" { … }\``,
    ),
  ),
  e(
    "sequenceDiagram",
    "sequence.rect",
    "`rect rgb(…) … end`",
    "mapped",
    "`region` with a `fill` style",
  ),
  e("sequenceDiagram", "sequence.autonumber", "`autonumber [start]`", "mapped", "`autonumber`"),
  e(
    "sequenceDiagram",
    "sequence.autonumber.step",
    "`autonumber start step`",
    "approximated",
    "`autonumber start`",
  ),
  e("sequenceDiagram", "sequence.autonumber.off", "`autonumber off`", "dropped", "—"),
  e("sequenceDiagram", "sequence.title", "`title text`", "mapped", "`title`"),
  e("sequenceDiagram", "sequence.links", "`link`, `links`", "dropped", "—"),
  e("sequenceDiagram", "sequence.properties", "`properties`, `details`", "dropped", "—"),
  e("sequenceDiagram", "sequence.end", "`end` without a block", "dropped", "—", "syntax"),
  e(
    "sequenceDiagram",
    "sequence.statement",
    "unreadable lines",
    "dropped",
    "—",
    "syntaxKeptAsComment",
  ),

  e("C4", "mermaid.c4.title", "`title text`", "mapped", "the view's `title`"),
  ...c4Entries("mermaid.c4", "C4"),

  e(
    "architecture-beta",
    "architecture.group",
    "`group id(icon)[Label] [in parent]`",
    "mapped",
    "`group` with an `icon` style",
  ),
  e(
    "architecture-beta",
    "architecture.service",
    "`service id(icon)[Label] [in group]`",
    "mapped",
    "`node` with an `icon` style",
  ),
  e(
    "architecture-beta",
    "architecture.junction",
    "`junction id [in group]`",
    "approximated",
    "a `node` without text",
  ),
  e(
    "architecture-beta",
    "architecture.icon",
    Object.keys(ARCHITECTURE_ICONS)
      .map((n) => `\`${n}\``)
      .join(", ") + ", `pack:name`",
    "mapped",
    Object.values(ARCHITECTURE_ICONS)
      .map((n) => `\`${n}\``)
      .join(", ") + "; `pack:name` when the project has the pack",
    "missingPacks",
  ),
  e(
    "architecture-beta",
    "architecture.edge",
    "`a:R -- L:b`",
    "mapped",
    "the named line `a -- b` with its route",
  ),
  e(
    "architecture-beta",
    "architecture.edge.arrow",
    "`a:R --> L:b`, `a:R <-- L:b`",
    "mapped",
    "a relation in the arrow's direction",
  ),
  e("architecture-beta", "architecture.edge.both", "`a:R <--> L:b`", "mapped", "`a <-> b`"),
  e(
    "architecture-beta",
    "architecture.edge.side",
    "the sides `L`, `R`, `T`, `B`",
    "mapped",
    "`route e<n> from a.east to b.west`",
    "sidesAsPorts",
  ),
  e(
    "architecture-beta",
    "architecture.edge.group",
    "`a{group}:R -- L:b`",
    "mapped",
    "a relation from `a`'s group",
  ),
  e(
    "architecture-beta",
    "architecture.group.in",
    "`in` naming something that is not a group",
    "dropped",
    "—",
  ),
  e(
    "architecture-beta",
    "architecture.service.in",
    "`in` naming something that is not a group",
    "dropped",
    "—",
  ),
  e(
    "architecture-beta",
    "architecture.junction.in",
    "`in` naming something that is not a group",
    "dropped",
    "—",
  ),
  e("architecture-beta", "architecture.title", "`title text`", "mapped", "`title`"),
  e(
    "architecture-beta",
    "architecture.statement",
    "unreadable lines",
    "dropped",
    "—",
    "syntaxEssential",
  ),

  e("block-beta", "blockbeta.columns", "`columns n`", "mapped", "a grid of 168 × 84 cells"),
  e("block-beta", "blockbeta.box", "`a`", "mapped", "`box` with `place` and `size`"),
  ...CLASSIC_SHAPES.map(([shape, source]) =>
    e(
      "block-beta",
      `blockbeta.shape.${shape}`,
      source.replace("`A", "`a"),
      shapeStatus(shape),
      `\`shape ${MERMAID_SHAPES[shape]!.shape}\``,
      SHAPE_NOTES[shape],
    ),
  ),
  e("block-beta", "blockbeta.span", "`a:2`", "mapped", "a box across two cells"),
  e("block-beta", "blockbeta.space", "`space`, `space:n`", "mapped", "empty cells"),
  e(
    "block-beta",
    "blockbeta.block",
    "`block:id:n … end`",
    "mapped",
    'an untitled `group ""` with its own columns',
  ),
  e("block-beta", "blockbeta.arrow", '`a<["text"]>(right)`', "mapped", "`shape arrow`"),
  e(
    "block-beta",
    "blockbeta.arrow.direction",
    '`a<["text"]>(left)`, `(up)`, `(down)`, `(x)`, `(y)`',
    "approximated",
    "`shape arrow`, pointing right",
  ),
  e("block-beta", "blockbeta.link", "`a --> b`, `a -- text --> b`", "mapped", "relations"),
  e("block-beta", "blockbeta.classDef", "`classDef`", "mapped", "`class`"),
  e("block-beta", "blockbeta.class", "`class a name`", "mapped", "the class in the box's block"),
  e("block-beta", "blockbeta.style", "`style a …`", "mapped", "`style a { … }`"),
  e("block-beta", "blockbeta.css", "other CSS properties", "dropped", "—"),
  e("block-beta", "blockbeta.end", "`end` without `block`", "dropped", "—", "syntax"),
  e("block-beta", "blockbeta.item", "unreadable items", "dropped", "—", "syntaxEssential"),
];

const PLANTUML_START_KINDS = [
  "gantt",
  "mindmap",
  "wbs",
  "json",
  "yaml",
  "salt",
  "ditaa",
  "dot",
  "math",
  "latex",
  "chen",
  "chronology",
  "files",
  "regex",
  "ebnf",
  "board",
  "creole",
  "def",
  "flow",
  "git",
  "nwdiag",
  "project",
  "wire",
];

/** What the PlantUML importer does with each construct. */
export const PLANTUML_COVERAGE: readonly CoverageEntry[] = [
  e(
    "Preprocessor",
    "plantuml.preprocessor.define",
    "`!define NAME value`, `!define NAME(a, b) body`, `##`",
    "mapped",
    "expanded",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.definelong",
    "`!definelong NAME(a) … !enddefinelong`, `!undef`",
    "mapped",
    "expanded",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.variables",
    "`!$x = v`, `!$x ?= v`, `!global`, `!local`, `$x` in lines",
    "mapped",
    "substituted",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.procedure",
    "`!procedure`, `!unquoted procedure`, defaults, keyword arguments",
    "mapped",
    "expanded",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.function",
    "`!function … !return … !endfunction`, one-line `!function $f($a) !return …`",
    "mapped",
    "evaluated",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.conditional",
    "`!if`, `!elseif`, `!else`, `!endif`, `!ifdef`, `!ifndef`",
    "mapped",
    "the selected lines",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.loop",
    "`!while … !endwhile`, `!foreach $x in [ … ] … !endfor`",
    "mapped",
    "the repeated lines",
    "passes",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.builtins",
    "`%strlen`, `%substr`, `%strpos`, `%upper`, `%lower`, `%string`, `%intval`, `%boolval`, `%true`, `%false`, `%not`, `%newline`, `%chr`, `%ord`, `%mod`, `%dec2hex`, `%hex2dec`, `%variable_exists`, `%function_exists`, `%get_variable_value`, `%set_variable_value`, `%call_user_func`, `%size`, `%splitstr`, `%str2json`, `%json_key_exists`",
    "mapped",
    "evaluated",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.stable",
    "`%date`, `%now`, `%random`, `%getenv`, `%filename`, `%dirpath`, `%version`, colour functions",
    "approximated",
    "stable values",
    "deterministic",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor.assert",
    "`!assert`, `!log`, `!dump_memory`",
    "mapped",
    "checked or ignored",
  ),
  e(
    "Preprocessor",
    "plantuml.include",
    "`!include path`, `!include_once`, `!include_many`, `!includesub path!ID`, `!include path!n`",
    "mapped",
    "the file's lines",
    "relativeIncludes",
  ),
  e(
    "Preprocessor",
    "plantuml.include.c4",
    "`!include <C4/C4_Container>` and the C4-PlantUML files by URL",
    "mapped",
    "the C4 level",
    "recognised",
  ),
  e(
    "Preprocessor",
    "plantuml.include.stdlib",
    "`!include <aws/…>` and other standard libraries",
    "dropped",
    "—",
    "libraryMacros",
  ),
  e(
    "Preprocessor",
    "plantuml.include.error",
    "`!includeurl`, `!include https://…`, absolute paths, paths outside the folder, missing files, `!import`",
    "dropped",
    "—",
    "neverFetches",
  ),
  e(
    "Preprocessor",
    "plantuml.preprocessor",
    "errors, more than 100 nested expansions or 100 000 lines",
    "dropped",
    "—",
    "preprocessorEssential",
  ),
  e("Preprocessor", "plantuml.theme", "`!theme`", "dropped", "—"),
  e("Preprocessor", "plantuml.pragma", "`!pragma`", "dropped", "—"),

  e("Common", "plantuml.title", "`title text`, `title … end title`", "mapped", "`title`"),
  e("Common", "plantuml.comment", "`' text`, `/' … '/`", "mapped", "`// text`"),
  e(
    "Common",
    "plantuml.block",
    "`@startuml name … @enduml`",
    "mapped",
    "one diagram per block; `name` is its id",
    "unclosedBlock",
  ),
  e("Common", "plantuml.skinparam", "`skinparam`", "dropped", "—"),
  e("Common", "plantuml.style", "`<style> … </style>`", "dropped", "—"),
  ...["legend", "header", "footer", "caption"].map((w) =>
    e("Common", `plantuml.${w}`, `\`${w}\``, "dropped", "—"),
  ),
  e("Common", "plantuml.hide", "`hide`, `show`, `remove`, `restore`", "dropped", "—"),
  ...["scale", "newpage", "allowmixing", "allow_mixing", "mainframe", "set", "page"].map((w) =>
    e("Common", `plantuml.${w}`, `\`${w}\``, "dropped", "—"),
  ),
  e("Common", "plantuml.sprite", "`sprite`", "dropped", "—"),
  ...["class", "activity", "state", "object", "timing", "data"].map((kind) =>
    e("Common", `plantuml.${kind}`, `${kind} diagrams`, "dropped", "—", "unsupportedDiagram"),
  ),
  ...PLANTUML_START_KINDS.map((kind) =>
    e("Common", `plantuml.${kind}`, `\`@start${kind}\``, "dropped", "—", "unsupportedDiagram"),
  ),
  e("Common", "plantuml.C4_Deployment", "`C4_Deployment`", "dropped", "—", "unsupportedDiagram"),
  e("Common", "plantuml.C4_Sequence", "`C4_Sequence`", "dropped", "—", "unsupportedDiagram"),
  e("Common", "plantuml.empty", "an empty block", "dropped", "—", "unsupportedDiagram"),

  ...Object.entries(DESCRIPTION_KINDS).map(([keyword, info]) =>
    e(
      "Component, deployment and use case",
      `description.${keyword}`,
      `\`${keyword}\``,
      "mapped",
      info.shape !== undefined ? nodeWithShape(info.shape) : `\`${info.kind}\``,
    ),
  ),
  e(
    "Component, deployment and use case",
    "description.short",
    "`[Component]`, `()`, `(Use case)`, `:Actor:`",
    "mapped",
    "as their keywords",
  ),
  ...Object.keys(DESCRIPTION_KINDS).map((keyword) =>
    e(
      "Component, deployment and use case",
      `description.container.${keyword}`,
      `\`${keyword} name { … }\``,
      PLAIN_CONTAINERS.has(keyword) ? "mapped" : "approximated",
      "`group`",
    ),
  ),
  e(
    "Component, deployment and use case",
    "description.alias",
    '`"Label" as a`, `a as "Label"`, `[Label] as a`',
    "mapped",
    "id and label",
  ),
  e(
    "Component, deployment and use case",
    "description.stereotype",
    "`<<stereotype>>`",
    "approximated",
    "description `«stereotype»`",
  ),
  e(
    "Component, deployment and use case",
    "description.colour",
    "`#colour`, `#line:c`, `#line.dashed`, `#text:c`",
    "mapped",
    "`fill`, `stroke`, `line dashed`, `color`",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow",
    "`-->`, `->`, `..>`, `--`, `<--`, `-[#red]->`, `-[bold]->`, `-[thickness=n]->`",
    "mapped",
    "relations; dotted is `-->`; no head is the line `--` (`---` when dotted); colours and widths become styles",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.head",
    "`--|>`, `<|--`, `*--`, `o--`, `--x`, `}|--||`, `}o--o|`",
    "mapped",
    "`triangleOutline`, `diamond`, `diamondOutline`, `cross` and the crow's-foot heads at their end",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.head.other",
    "`--#`, `--+`, `--^`, `-(0-`",
    "approximated",
    "plain arrowheads",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.both",
    "`<-->`, `<..>`, `*--*`",
    "mapped",
    "`<->`, `<-->`, with the head at both ends",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.direction",
    "`-left->`, `-up->`, `-l->` and other direction hints",
    "approximated",
    "a relation",
    "directions",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.multiplicity",
    '`a "1" --> "*" b`',
    "approximated",
    "a relation without end labels",
  ),
  e(
    "Component, deployment and use case",
    "description.arrow.hidden",
    "`-[hidden]->`",
    "dropped",
    "—",
  ),
  e(
    "Component, deployment and use case",
    "description.note",
    '`note left|right|top|bottom of x : text`, `note … end note`, `note "text" as N`',
    "mapped",
    "`note` joined to its element by the dashed line `---`",
  ),
  e(
    "Component, deployment and use case",
    "description.note.link",
    "`note on link`",
    "dropped",
    "—",
  ),
  e(
    "Component, deployment and use case",
    "description.direction",
    "`left to right direction`, `top to bottom direction`",
    "mapped",
    "`direction LR`, `direction TB`",
  ),
  e(
    "Component, deployment and use case",
    "description.together",
    "`together { … }`",
    "dropped",
    "—",
    "elementsKept",
  ),
  e(
    "Component, deployment and use case",
    "description.port",
    "`port`, `portin`, `portout`",
    "dropped",
    "—",
  ),
  e(
    "Component, deployment and use case",
    "description.container",
    "unbalanced `{` `}`",
    "dropped",
    "—",
    "syntax",
  ),
  e(
    "Component, deployment and use case",
    "description.declaration",
    "a declaration without a name",
    "dropped",
    "—",
    "syntax",
  ),
  e(
    "Component, deployment and use case",
    "description.statement",
    "unreadable lines",
    "dropped",
    "—",
    "syntaxKeptAsComment",
  ),

  ...[
    "participant",
    "actor",
    "boundary",
    "control",
    "entity",
    "database",
    "collections",
    "queue",
  ].map((kind) =>
    e("Sequence", `sequence.${kind}`, `\`${kind} "Label" as a\``, "mapped", `\`${kind}\``),
  ),
  e("Sequence", "sequence.participant.colour", "participant colours", "dropped", "—"),
  e("Sequence", "sequence.participant.stereotype", "participant stereotypes", "dropped", "—"),
  e("Sequence", "sequence.box", '`box "title" … end box`', "mapped", "`group`"),
  e("Sequence", "sequence.box.colour", "box colours", "dropped", "—"),
  e("Sequence", "sequence.message.call", "`a -> b : text`", "mapped", '`a -> b: "text"`'),
  e("Sequence", "sequence.message.reply", "`a --> b`", "mapped", "`a --> b`"),
  e("Sequence", "sequence.message.async", "`a ->> b`, `a -->> b`", "mapped", "`{ kind async }`"),
  e(
    "Sequence",
    "sequence.message.head",
    "`->x`, `->o`, `-\\`, `-//` and other heads",
    "approximated",
    "plain messages",
  ),
  e(
    "Sequence",
    "sequence.message.both",
    "`<->`, `<-->`",
    "mapped",
    "`<->`, `<-->`; two different heads are approximated as one way",
  ),
  e("Sequence", "sequence.message.colour", "`-[#red]>`", "dropped", "—"),
  e(
    "Sequence",
    "sequence.gate",
    "`[-> a`, `a ->]`, `?-> a`",
    "approximated",
    "messages through a participant `outside`",
  ),
  e("Sequence", "sequence.teoz", "`& a -> b`", "approximated", "sequential messages"),
  e(
    "Sequence",
    "sequence.activation.shorthand",
    "`a -> b ++`, `a -> b --`",
    "mapped",
    "`activate b`, `deactivate a`",
  ),
  e("Sequence", "sequence.create", "`create b`, `**`", "mapped", "`create b`"),
  e("Sequence", "sequence.destroy", "`destroy b`, `!!`", "mapped", "`destroy b`"),
  e("Sequence", "sequence.activate", "`activate b`", "mapped", "`activate b`"),
  e("Sequence", "sequence.deactivate", "`deactivate b`", "mapped", "`deactivate b`"),
  e(
    "Sequence",
    "sequence.return",
    "`return text`",
    "mapped",
    "a reply to the caller and `deactivate`",
  ),
  e("Sequence", "sequence.autonumber", "`autonumber [start]`", "mapped", "`autonumber`"),
  e(
    "Sequence",
    "sequence.autonumber.format",
    '`autonumber start step "format"`',
    "approximated",
    "`autonumber start`",
  ),
  e("Sequence", "sequence.autonumber.control", "`autonumber stop|resume|inc`", "dropped", "—"),
  ...["alt", "else", "opt", "loop", "par", "break", "critical"].map((word) =>
    e(
      "Sequence",
      `sequence.${word}`,
      `\`${word} text\``,
      "mapped",
      word === "else" ? '`} else "text" {` (`and` in `par`)' : `\`${word} ${word}1 "text" { … }\``,
    ),
  ),
  e("Sequence", "sequence.group", "`group text`", "mapped", '`region region1 "text" { … }`'),
  e(
    "Sequence",
    "sequence.note",
    "`note left|right|over a[, b] : text`, `note … end note`",
    "mapped",
    "`note`",
  ),
  e("Sequence", "sequence.note.shape", "`hnote`, `rnote`", "approximated", "`note`"),
  e(
    "Sequence",
    "sequence.note.across",
    "`note across`",
    "approximated",
    "a note over every participant",
  ),
  e(
    "Sequence",
    "sequence.note.message",
    "`note left: text` after a message",
    "approximated",
    "a note beside its participant",
  ),
  e(
    "Sequence",
    "sequence.ref",
    "`ref over a, b : text`",
    "approximated",
    '`note over a, b "ref: text"`',
  ),
  e("Sequence", "sequence.divider", "`== text ==`", "mapped", '`divider "text"`'),
  e("Sequence", "sequence.delay", "`...`, `...text...`", "mapped", "`delay`"),
  e("Sequence", "sequence.space", "`|||`, `||45||`", "dropped", "—"),
  e("Sequence", "sequence.footbox", "`hide footbox`", "dropped", "—"),
  e("Sequence", "sequence.end", "`end` without a fragment", "dropped", "—", "syntax"),
  e("Sequence", "sequence.statement", "unreadable lines", "dropped", "—", "syntaxKeptAsComment"),

  e(
    "C4-PlantUML",
    "plantuml.c4.direction",
    "`left to right direction`",
    "mapped",
    "`direction LR`",
  ),
  ...c4Entries("plantuml.c4", "C4-PlantUML"),
];

/** The coverage entry that names a construct, if any. */
export function coverageOf(format: SourceFormat, construct: string): CoverageEntry | undefined {
  const table = format === "mermaid" ? MERMAID_COVERAGE : PLANTUML_COVERAGE;
  return (
    table.find((entry) => entry.construct === construct) ??
    table.find(
      (entry) =>
        entry.construct.endsWith("*") && construct.startsWith(entry.construct.slice(0, -1)),
    )
  );
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** The words of a coverage page, by language; tables' cells are translated by `COVERAGE_ES`. */
const PAGE_WORDS = {
  en: {
    title: (name: string) => `# Importing ${name}`,
    other: (format: SourceFormat) => `[Español](../es/import/${format}.md)`,
    generated:
      "<!-- Generated by `pnpm import:docs` from packages/import/src/coverage.ts; do not edit. -->",
    intro: (version: string) => [
      `Written against ${version}. \`meltemi-diagrams import\` and the VS Code commands report every`,
      "construct that is not mapped exactly: **approximated** constructs keep their meaning with a",
      "different drawing; **dropped** ones are left out. An import that drops an essential construct",
      "(an element, a relation, a message, an entity or a line it cannot read) is `partial`.",
    ],
    header: "| Source | Meltemi | Status | Notes |",
    status: { mapped: "mapped", approximated: "approximated", dropped: "dropped" },
    versions: COVERAGE_VERSIONS,
  },
  es: {
    title: (name: string) => `# Importar ${name}`,
    other: (format: SourceFormat) => `[English](../../import/${format}.md)`,
    generated:
      "<!-- Generado por `pnpm import:docs` a partir de packages/import/src/coverage.ts; no editar. -->",
    intro: (version: string) => [
      `Escrito para ${version}. \`meltemi-diagrams import\` y los comandos de VS Code informan de cada`,
      "construcción que no se convierte exactamente: las **aproximadas** conservan su significado con",
      "otro dibujo; las **descartadas** se omiten. Una importación que descarta una construcción",
      "esencial (un elemento, una relación, un mensaje, una entidad o una línea que no puede leer) es",
      "`partial`.",
    ],
    header: "| Origen | Meltemi | Estado | Notas |",
    status: { mapped: "convertido", approximated: "aproximado", dropped: "descartado" },
    versions: { mermaid: "Mermaid 11", plantuml: "PlantUML 1.2025 y C4-PlantUML 2" },
  },
} satisfies Record<Locale, unknown>;

/**
 * The Markdown page of a coverage table, as written to `docs/import/<format>.md` in English and to
 * `docs/es/import/<format>.md` in Spanish, each with a link to the other.
 */
export function coverageMarkdown(format: SourceFormat, locale: Locale = "en"): string {
  const table = format === "mermaid" ? MERMAID_COVERAGE : PLANTUML_COVERAGE;
  const name = format === "mermaid" ? "Mermaid" : "PlantUML";
  const words = PAGE_WORDS[locale];
  const text = (value: string) => (locale === "es" ? (COVERAGE_ES[value] ?? value) : value);
  const lines: string[] = [
    words.title(name),
    "",
    words.other(format),
    "",
    words.generated,
    "",
    ...words.intro(words.versions[format]),
    "",
  ];
  const sections = [...new Set(table.map((entry) => entry.section))];
  for (const section of sections) {
    lines.push(`## ${text(section)}`, "", words.header, "| --- | --- | --- | --- |");
    for (const entry of table.filter((x) => x.section === section)) {
      const notes = coverageNotes(entry, locale) ?? "";
      lines.push(
        `| ${cell(text(entry.source))} | ${cell(text(entry.target))} | ${words.status[entry.status]} | ${cell(notes)} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Whether a cell of a coverage table has words for people besides code. */
export function isProseCell(value: string): boolean {
  return value.replace(/`[^`]*`/g, "").replace(/[\s,;.()…—]/g, "") !== "";
}
