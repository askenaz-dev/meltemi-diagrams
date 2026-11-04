# Coming from PlantUML

[Español](../es/tracks/from-plantuml.md)

You describe architectures and interactions as text and let a renderer draw them. Meltemi
Diagrams keeps the text, adds a canvas where every gesture edits that text, and draws from a
shared model so that views agree. This page shows what changes, how to bring your PlantUML files
over (preprocessor and C4-PlantUML included), and what to try first.

## What stays the same

- Diagrams are text files in your repository; `@startuml` blocks become `.meltemi` sheets.
- Component, deployment, use case and sequence diagrams have counterparts in the `flow` and
  `sequence` profiles, and C4-PlantUML maps to models and C4 views.
- Includes, macros and procedures keep working at import time: the importer runs the
  preprocessor.

## What is different

- **No Java, no server.** Everything runs locally in Node, the editor or a browser tab; PNG, PDF
  and video use the browser and FFmpeg you have installed.
- **Placement is yours.** Instead of direction hints (`-left->`) and hidden links, drag boxes on
  the canvas or write `place` statements; `layout assisted` keeps them and arranges the rest.
- **One model, many views.** C4-PlantUML views redeclare their elements; in Meltemi Diagrams a
  `model` declares them once and every view, sequence and slide refers to them, so renames and
  links stay right ([C4](../language/c4.md)).
- **Sequence diagrams know their scenarios.** `alt` branches can be named and chosen, and each
  scenario exports on its own ([sequence](../language/sequence.md)).

## Import your diagrams

```bash
meltemi-diagrams import architecture/checkout.puml
```

The importer reads `.puml`, `.plantuml`, `.pu`, `.iuml` and `.wsd` files and the PlantUML blocks of
Markdown files, one sheet per `@startuml` block, and never changes the source. `!include`d files
are read relative to the file; the C4-PlantUML standard library is recognised by name or URL.

This component diagram:

```text
@startuml checkout
title Checkout
actor Customer as customer
component "Web shop" as shop
component "Orders API" as api
database "Orders" as db
node "Payments" {
  component "Payment provider" as psp
}
customer --> shop : browses
shop --> api : places order
api --> db
api ..> psp : charges
@enduml
```

becomes this sheet, with the report `11 mapped, 0 approximated, 0 dropped` (the actor is a node
drawn as a person):

```text
language "0.2"

diagram checkout: flow {
  title "Checkout"
  layout auto

  node customer "Customer"
  node shop "Web shop"
  node api "Orders API"
  data db "Orders"
  group Payments {
    node psp "Payment provider"
  }

  customer -> shop: "browses"
  shop -> api: "places order"
  api -> db
  api --> psp: "charges"

  style customer { shape person }
}
```

Every construct is reported as mapped, approximated or dropped, with its line; the full table is
[Importing PlantUML](../import/plantuml.md). Import again with `--merge` to keep the placement and
styles you added since ([CLI](../cli.md)).

## Constructs side by side

| PlantUML                                | Meltemi                                    | Import                                  |
| --------------------------------------- | ------------------------------------------ | --------------------------------------- |
| `component "Label" as a`                | `node a "Label"`                           | mapped (`description.component`)        |
| `database "Label" as a`                 | `data a "Label"`                           | mapped (`description.database`)         |
| `node name { … }`, `package name { … }` | `group id "name" { … }`                    | mapped (`description.container.node`)   |
| `a --> b : text`                        | `a -> b: "text"`                           | mapped (`description.arrow`)            |
| `a ..> b`                               | `a --> b` (dashed)                         | mapped (`description.arrow`)            |
| `a --\|> b`, `a *-- b`, `a }o--\|\| b`  | the hollow triangle, diamond, crow's feet  | mapped (`description.arrow.head`)       |
| `a <--> b`                              | `a <-> b`                                  | mapped (`description.arrow.both`)       |
| `note right of a : text`                | `note` linked to its element               | mapped (`description.note`)             |
| `left to right direction`               | `direction LR`                             | mapped (`description.direction`)        |
| `actor`, `person`, `:Actor:`            | `node` with `style { shape person }`       | mapped (`description.actor`)            |
| `usecase`, `(Use case)`                 | `node` with `style { shape ellipse }`      | mapped (`description.usecase`)          |
| `cloud`, `hexagon`                      | `node` with `shape cloud`, `shape hexagon` | mapped (`description.cloud`)            |
| `card`, `file`, `folder`                | `node` with `shape document`               | mapped (`description.file`)             |
| `interface`, `()`, `circle`             | `node` with `shape circle`                 | mapped (`description.interface`)        |
| `<<stereotype>>`                        | the description `«stereotype»`             | approximated (`description.stereotype`) |
| `participant "Label" as a`              | `participant a "Label"`                    | mapped (`sequence.participant`)         |
| `a -> b : text`, `a --> b`              | `a -> b: "text"`, `a --> b`                | mapped (`sequence.message.call`)        |
| `a -> b ++`, `return text`              | `activate b`, a reply and `deactivate`     | mapped (`sequence.return`)              |
| `alt … else … end`                      | `alt id "…" { … } else "…" { … }`          | mapped (`sequence.alt`)                 |
| `group text … end`                      | `region id "text" { … }`                   | mapped (`sequence.group`)               |
| `== text ==`, `...`                     | `divider "text"`, `delay`                  | mapped (`sequence.divider`)             |
| `ref over a, b : text`                  | `note over a, b "ref: text"`               | approximated (`sequence.ref`)           |
| `!include`, `!define`, `!procedure`     | expanded before the import                 | mapped (`plantuml.include`)             |
| `!include <C4/C4_Container>`            | a model and a container view               | mapped (`plantuml.include.c4`)          |
| `Person(…)`, `System_Ext(…)`            | `person`, `system` with `external`         | mapped (`plantuml.c4.Person`)           |
| `Container(…)`, `ContainerDb(…)`        | `container`, `datastore`                   | mapped (`plantuml.c4.ContainerDb`)      |

Class, state, activity, timing, Gantt, mind map and the other PlantUML diagram types are not
imported; see [compatibility](../compatibility.md).

## First things to try

1. Import a C4-PlantUML folder: each file becomes a model with its view, and
   `meltemi-diagrams validate` checks that the view and the model agree.
2. Replace direction hints with placement: open the canvas, drag the boxes where you want them,
   and switch to `layout assisted`.
3. Give a sequence diagram scenarios (`scenario approved { choose result "Approved" }`) and export
   each with `--scenario` ([sequence](../language/sequence.md)).
