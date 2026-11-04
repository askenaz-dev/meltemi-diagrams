# view-conversion Specification

## Purpose
Copying a flow diagram, as drawn, into a new free diagram with identity links, as the `convertToFree` edit and the `convert` command.
## Requirements
### Requirement: Convert a flow diagram to free
`planEdit({ kind: "convertToFree", diagram, id?, boxes, metrics })` SHALL insert, after the source diagram, a free diagram named `id` or `<source>_free` (with `_2`, `_3`… when taken) that copies the flow diagram as drawn. The host SHALL pass the drawn boxes of the source (`LayoutResult.boxes`) and the theme measures the copy needs (`groupPadding`, `groupHeader`, the tag text size). The copy SHALL contain:

- **Properties:** `title`, `description`, `theme`, `preset` or `canvas`, `routing`, `direction` and `layers` copied when they are set, and `layout manual`.
- **Objects:**
  - one per element, implicit ones included, with the same id, label, description, classes, ports, `layer` and a `link <source>.<id>`;
  - node becomes `box`, decision and data boxes, note a `note` with the same text and its `on <element>` attachment when it has one, tag a box, and group a `group` with the same nesting, the same label and the same relations inside it.
- **Kind defaults:** a class `from_<kind>` for each flow kind that needs one, applied first to the converted objects of that kind:
  - decision `shape diamond`, data `shape cylinder`;
  - tag `shape pill` with the tag fill, stroke and text colour, size and weight 500.

  Notes need no class: a free note draws as a flow note does. The diagram's rules for a flow kind SHALL be merged into its class; rules for notes, groups and relations SHALL be copied as written. A node's own `shape` and `radius` styles are copied as written and therefore win over the class.
- **Positions:** a `place` and `size` for every element as drawn, children in interior coordinates of their copied group, measured from the group's own header (`groupHeader` for a titled group, `groupPadding` for an untitled one).
- **Relations:** the same arrows, labels, ids and blocks, with their `route` and `label` statements. Routes keep their waypoints, except when the source is `layout auto`, which did not draw them.
- **Styles:** the `class`, `style` and `animate` statements as written.

The source diagram SHALL be unchanged. The conversion SHALL be refused with `edit.unsafe-target` for a diagram with errors or without a drawn box for every element.

#### Scenario: Converting the checkout sheet
- **WHEN** `corpus/valid/checkout.meltemi` is converted with its ELK layout
- **THEN** the file gains `diagram checkout_free: free { … }` that compiles without errors. It holds `box api "API Gateway" { link checkout.api }` and `box db "PostgreSQL" { class from_data; link checkout.db }` with `class from_data { shape cylinder }`. Every box has a `place` and a `size`, and each box is drawn within one unit of the centre and size its source has.

#### Scenario: A note stays a note
- **WHEN** a flow diagram with `note limits "500 rps" on api` is converted
- **THEN** the copy holds `note limits "500 rps" on api { link <source>.limits }` with its `place` and `size`, no `from_note` class is written, and the copy draws the note's text and leader where the source does

#### Scenario: Children of a group
- **WHEN** a flow diagram with `group backend` holding `api` is converted
- **THEN** `api`'s `place` in the copy is relative to the interior of the copied `backend`, and both diagrams draw `api` at the same diagram position

#### Scenario: Children of an untitled group
- **WHEN** a flow diagram with `group backend ""` holding `api` is converted
- **THEN** `api`'s `place` in the copy is measured from 16 px below the group's top edge, and both diagrams draw `api` at the same position

#### Scenario: Layers survive
- **WHEN** a flow diagram with `layers back, main` and `group band "" { layer back }` is converted
- **THEN** the copy declares `layers back, main` and its `band` keeps `layer back`

#### Scenario: Conversion of a diagram with errors
- **WHEN** a flow diagram that reports `ref.unknown-element` is converted
- **THEN** the plan is refused with `edit.unsafe-target`

### Requirement: Convert command
`meltemi-diagrams convert <file.meltemi> --to free [--diagram <id>] [--id <new-id>] [--stdout] [--check]` SHALL lay the diagram out like `export` and apply `convertToFree` to it, the only flow diagram of the file unless `--diagram` chooses one. It SHALL write the file and print `Converted "<id>" to "<new-id>" in <path>`. `--stdout` SHALL print the result instead of writing it, and `--check` SHALL write nothing and exit 1. A file with several flow diagrams and no `--diagram`, an unknown diagram, or `--to` other than `free` or `json` SHALL be usage errors (exit 2).

`meltemi-diagrams convert <file.meltemi> --to json [--out <file>] [--stdout]` SHALL write the file's model JSON (format `model-json`, the interchange format) to `<stem>.model.json` beside the file, or to `--out`, or print it with `--stdout`; it SHALL exit 1 when the file has errors (the JSON lists them in `diagnostics`), and `--diagram`, `--id` and `--check` with it, or `--out` with `--to free`, SHALL be usage errors.

#### Scenario: Convert from the command line
- **WHEN** `meltemi-diagrams convert sheet.meltemi --to free` runs on a copy of the checkout sheet
- **THEN** the file gains the free diagram, and running `meltemi-diagrams export` on it writes two SVG files

#### Scenario: Model JSON
- **WHEN** `meltemi-diagrams convert sheet.meltemi --to json` runs on a copy of the checkout sheet
- **THEN** `sheet.model.json` holds the format `model-json` with the diagram `checkout`, the same text `--stdout` prints

