## ADDED Requirements

### Requirement: Convert a flow diagram to free
`planEdit({ kind: "convertToFree", diagram, id?, boxes, metrics })` SHALL insert, after the source diagram, a free diagram named `id` or `<source>_free` (with `_2`, `_3`… when taken) that copies the flow diagram as drawn. The host SHALL pass the drawn boxes of the source (`LayoutResult.boxes`) and the theme measures the copy needs (`groupPadding`, `groupHeader`, the note and tag text sizes). The copy SHALL contain:

- **Properties:** `title`, `description`, `theme`, `preset` or `canvas`, `routing` and `direction` copied when they are set, and `layout manual`.
- **Objects:**
  - one per element, implicit ones included, with the same id, label, description, classes and ports and a `link <source>.<id>`;
  - node becomes `box`, decision and data boxes, note `text`, tag a box, and group a `group` with the same nesting and the same relations inside it.
- **Kind defaults:** a class `from_<kind>` for each flow kind that needs one, applied first to the converted objects of that kind:
  - decision `shape diamond`, data `shape cylinder`;
  - note `textAlign left` with the note size, weight 400 and colour `muted`;
  - tag `shape pill` with the tag fill, stroke and text colour, size and weight 500.

  The diagram's rules for a flow kind SHALL be merged into its class; rules for groups and relations SHALL be copied as written.
- **Positions:** a `place` and `size` for every element as drawn, children in interior coordinates of their copied group.
- **Relations:** the same arrows, labels, ids and blocks, with their `route` and `label` statements. Routes keep their waypoints, except when the source is `layout auto`, which did not draw them.
- **Styles:** the `class`, `style` and `animate` statements as written.

The source diagram SHALL be unchanged. The conversion SHALL be refused with `edit.unsafe-target` for a diagram with errors or without a drawn box for every element.

#### Scenario: Converting the checkout sheet
- **WHEN** `corpus/valid/checkout.meltemi` is converted with its ELK layout
- **THEN** the file gains `diagram checkout_free: free { … }` that compiles without errors. It holds `box api "API Gateway" { link checkout.api }` and `box db "PostgreSQL" { class from_data; link checkout.db }` with `class from_data { shape cylinder }`. Every box has a `place` and a `size`, and each box is drawn within one unit of the centre and size its source has.

#### Scenario: Children of a group
- **WHEN** a flow diagram with `group backend` holding `api` is converted
- **THEN** `api`'s `place` in the copy is relative to the interior of the copied `backend`, and both diagrams draw `api` at the same diagram position

### Requirement: Convert command
`meltemi-diagrams convert <file.meltemi> --to free [--diagram <id>] [--id <new-id>] [--stdout] [--check]` SHALL lay the diagram out like `export` and apply `convertToFree` to it, the only flow diagram of the file unless `--diagram` chooses one. It SHALL write the file and print `Converted "<id>" to "<new-id>" in <path>`. `--stdout` SHALL print the result instead of writing it, and `--check` SHALL write nothing and exit 1. A file with several flow diagrams and no `--diagram`, an unknown diagram, or `--to` other than `free` SHALL be usage errors (exit 2).

#### Scenario: Convert from the command line
- **WHEN** `meltemi-diagrams convert sheet.meltemi --to free` runs on a copy of the checkout sheet
- **THEN** the file gains the free diagram, and running `meltemi-diagrams export` on it writes two SVG files
