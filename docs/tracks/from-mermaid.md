# Coming from Mermaid

[Español](../es/tracks/from-mermaid.md)

You already write diagrams as text next to your code, and a tool draws them. Meltemi Diagrams
keeps that: `.meltemi` files are plain text in your repository, reviewed in pull requests and
drawn by the command line, the editor and the playground. This page shows what changes, how to
bring your Mermaid diagrams over, and what to try first.

## What stays the same

- Diagrams are text, versioned with the code, and nothing needs an account or a server.
- A file declares nodes and arrows; the layout engine arranges what you do not place.
- Labels, groups (`subgraph`), classes and styles have direct counterparts.

## What is different

- **Ids and relations are named.** Every element has an id, and a relation can have one
  (`a -> b: "calls" as call`). Names are what routes, styles, stories and links point at, and
  renames reach every use.
- **Placement is written in the file.** Drag a box on the canvas and a `place` statement appears
  in the code; `layout assisted` keeps what you placed and arranges the rest. Mermaid recomputes
  the whole drawing every time.
- **One model, many views.** Architecture is a `model` of people, systems and containers, and C4
  views draw parts of it; the same entity keeps its identity in every view, the sequence diagram
  and the slide ([C4](../language/c4.md)).
- **Motion and delivery.** Effects, stories with scenes and a camera, the HTML player, PNG, vector
  PDF, MP4, WebM and GIF, and an offline catalog of the whole project
  ([features](../features.md)).

## Import your diagrams

```bash
meltemi-diagrams import docs/architecture.mmd
```

The importer reads `.mmd` and `.mermaid` files and the Mermaid blocks of Markdown files, writes a
`.meltemi` sheet next to each, and never changes the source. A whole folder works too
(`meltemi-diagrams import docs --out diagrams`). In VS Code, **Import from Mermaid or PlantUML…**
does the same, and **Import Selection as Meltemi Diagram** converts a fenced block of a Markdown
file.

This flowchart:

```text
flowchart LR
  shop[Web shop] -->|places order| api(Orders API)
  api --> db[(Orders)]
  api -.-> mail[Email service]
  subgraph payments [Payments]
    psp[Payment provider]
  end
  api ==> psp
```

becomes this sheet, with the report `14 mapped, 0 approximated, 0 dropped`:

```text
language "0.2"

diagram checkout: flow {
  direction LR
  layout auto

  node shop "Web shop"
  node api "Orders API"
  data db "Orders"
  node mail "Email service"
  group payments "Payments" {
    node psp "Payment provider"
  }

  shop -> api: "places order"
  api -> db
  api --> mail
  api -> psp as e1

  style e1 { width 3 }
}
```

### Reading the report

Every construct is **mapped** (same meaning, same drawing), **approximated** (same meaning, a
different drawing) or **dropped** (left out, with a finding on its line). An import that drops an
essential construct (an element, a relation, a message, an entity or a line it cannot read) is
**partial** and exits 1. The full table is [Importing Mermaid](../import/mermaid.md).

### Importing again

When the Mermaid source keeps changing, import again with `--merge`: the new sheet keeps the
placement, styles and other adjustments made since, matched by id
([CLI](../cli.md)).

## Constructs side by side

| Mermaid                                 | Meltemi                                       | Import                                     |
| --------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| `flowchart LR`, `graph TD`              | `diagram id: flow { direction LR }`           | mapped (`flowchart.direction`)             |
| `A[Label]`, `A(Label)`                  | `node a "Label"`, `a["Label"]`                | mapped (`flowchart.shape.rect`)            |
| `A[(Label)]`                            | `data a "Label"`, `a[("Label")]`              | mapped (`flowchart.shape.cylinder`)        |
| `A{Label}`                              | `decision a "Label"`                          | mapped (`flowchart.shape.rhombus`)         |
| `A{{Label}}`                            | `node a "Label"`, `style a { shape hexagon }` | mapped (`flowchart.shape.hexagon`)         |
| `A[/Label/]`, `A[/Label\]`              | `shape parallelogram`, `shape trapezoid`      | mapped (`flowchart.shape.lean_right`)      |
| `A([Label])`, `A[[Label]]`              | `shape pill`, `shape framed`                  | mapped (`flowchart.shape.stadium`)         |
| `A((Label))`, `A>Label]`                | `shape circle`, `shape flag`                  | mapped (`flowchart.shape.circle`)          |
| `A[\Label\]`, `A(((Label)))`            | the nearest shape: `parallelogram`, `circle`  | approximated (`flowchart.shape.lean_left`) |
| `A --> B`                               | `a -> b`                                      | mapped (`flowchart.link.arrow`)            |
| `A -.-> B`                              | `a --> b` (dashed)                            | mapped (`flowchart.link.dotted`)           |
| `A -->\|text\| B`                       | `a -> b: "text"`                              | mapped (`flowchart.link.label`)            |
| `A ==> B`                               | `a -> b` with `style { width 3 }`             | mapped (`flowchart.link.thick`)            |
| `A <--> B`                              | `a <-> b`                                     | mapped (`flowchart.link.bidirectional`)    |
| `A --o B`, `A o--o B`                   | `arrowhead circle`, `a <-> b` with it         | mapped (`flowchart.link.circle`)           |
| `subgraph id [title] … end`             | `group id "title" { … }`                      | mapped (`flowchart.subgraph`)              |
| `classDef name …`, `A:::name`           | `class name { … }`, `{ class name }`          | mapped (`flowchart.classDef`)              |
| `style A fill:#…`                       | `style a { fill "#…" }`                       | mapped (`flowchart.style`)                 |
| `e1@{ animate: true }`                  | `animate e1 { effect flow }`                  | mapped (`flowchart.link.animation`)        |
| `sequenceDiagram`, `participant A as L` | `diagram id: sequence { participant a "L" }`  | mapped (`sequence.participant`)            |
| `A->>B: text`                           | `a -> b: "text"`                              | mapped (`sequence.message.->>`)            |
| `A-->>B: text`                          | `a --> b: "text"`                             | mapped (`sequence.message.-->>`)           |
| `alt … else … end`                      | `alt id "…" { … } else "…" { … }`             | mapped (`sequence.alt`)                    |
| `loop text … end`                       | `loop id "text" { … }`                        | mapped (`sequence.loop`)                   |
| `Note over A,B: text`                   | `note over a, b "text"`                       | mapped (`sequence.note`)                   |
| `autonumber`                            | `autonumber`                                  | mapped (`sequence.autonumber`)             |
| `C4Container`, `Person(…)`              | `model` with `person`, a `c4` view            | mapped (`mermaid.c4.Person`)               |
| `Container(…)`, `ContainerDb(…)`        | `container`, `datastore`                      | mapped (`mermaid.c4.ContainerDb`)          |
| `System_Boundary(…) { … }`              | the `system` and the view's `scope`           | mapped (`mermaid.c4.System_Boundary`)      |
| `Rel(from, to, label, techn)`           | a model relation with `technology`            | mapped (`mermaid.c4.Rel`)                  |
| `architecture-beta`, `service id(icon)` | `node` with an `icon` style                   | mapped (`architecture.service`)            |
| `block-beta`, `columns n`               | placed boxes on a grid                        | mapped (`blockbeta.columns`)               |
| `block:id … end`                        | an untitled `group id ""` around its blocks   | mapped (`blockbeta.block`)                 |
| `a<["text"]>(right)`                    | a box with `shape arrow`                      | mapped (`blockbeta.arrow`)                 |

Class, state, entity-relationship, Gantt, pie and the other Mermaid diagram types are not
imported (`import.unsupported-diagram`); see [compatibility](../compatibility.md).

## First things to try

1. Open the imported sheet in VS Code with **Open Canvas to the Side**: drag a box and watch a `place`
   statement appear, then change `layout auto` to `layout assisted` so the rest still arranges
   itself ([editor](../editor.md)).
2. Turn a C4 diagram into a model with two views: the import already wrote the model; add a
   context view with `diagram context: c4 using <model> { level context }`.
3. Export what Mermaid cannot: `meltemi-diagrams export sheet.meltemi --format pdf` for a vector
   page with selectable text, or a story as MP4 ([stories](../language/stories.md)).
