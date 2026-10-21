# editor-language-services Specification

## Purpose
Host-neutral language services on a `.meltemi` document analysed inside its project: merged diagnostics, completion, hover, symbols and navigation, rename, formatting, semantic tokens, quick fixes and refactors, and rendering shared with the command line.
## Requirements
### Requirement: Document analysis
`analyzeDocument` SHALL compile a `.meltemi` document inside its project, using the unsaved text as an overlay, and lay out every flow diagram without compile errors. Layout SHALL use the ELK engine, the themes in scope, the project's default theme, the project's fonts and the icon registry. The analysis SHALL hold:

- the text and its revision;
- the compilation;
- the diagnostics of compilation, modules and layout, deduplicated by code and offset and sorted by position;
- one view per flow diagram, with its id, title, layout mode and layout result.

#### Scenario: Unsaved text in a project
- **WHEN** `corpus/projects/valid/commerce/diagrams/checkout.meltemi` is analysed with unsaved text that adds an element without a place to its `assisted` diagram
- **THEN** the diagram uses the imported theme, the new element is arranged by ELK, and no file is written

#### Scenario: Merged diagnostics
- **WHEN** a document has a `prop.unknown` error in one diagram and two overlapping boxes in another
- **THEN** the diagnostics contain the error and one `layout.overlap` warning, each once

### Requirement: Completion
`completions(analysis, offset)` SHALL return the items that are valid at the cursor, according to the innermost block, the statement keyword and the argument index:

- top-level words;
- the statements of the flow body and the element ids that start a relation;
- element ids after `->` and `-->`;
- the statements of element blocks;
- the enumerated values of diagram properties;
- the themes in scope inside `theme "`;
- placement statements, then element or relation ids by argument;
- the ports of an element after `<element>.`;
- style properties and their values: enums, colour token names, classes in scope;
- icon references matching the typed prefix, at most 200;
- animation properties and their values.

Each item SHALL carry a kind and a short detail.

#### Scenario: Ports after a dot
- **WHEN** completion runs after `route publish from api.east to bus.` and `bus` declares the port `in`
- **THEN** the items are `in`, `north`, `south`, `east`, `west` and `auto`

#### Scenario: Values of a property
- **WHEN** completion runs after `layout ` in a flow body
- **THEN** the items are `auto`, `assisted` and `manual`

#### Scenario: Relation targets
- **WHEN** completion runs after `api -> ` in a diagram that declares `api`, `db` and `cache`
- **THEN** the items include `db` and `cache`

### Requirement: Hover
`hover(analysis, offset)` SHALL describe the token under the cursor in Markdown:

- an element: its kind, label, description, written or default position and size, and ports;
- a relation: its endpoints, label and route;
- a port: its side and position;
- a keyword or style property: one line from the language reference;
- a theme: its base and frame;
- an icon reference: its pack, licence and a preview image.

#### Scenario: Element hover
- **WHEN** the cursor is on `api` in `client -> api` and `api` is declared as `api["API Gateway"]` with `place api at (360, 180)`
- **THEN** the hover names the kind `node`, the label `API Gateway`, the position (360, 180) and the default size

### Requirement: Symbols and navigation
`documentSymbols` SHALL return the diagrams, with their groups, elements and relations nested as in the source. `definition`, `references` and `highlights` SHALL resolve identifier references through the compilation's reference table: the declaration of an element or relation, every use of it including ports and constraint targets, and the uses in the same diagram for highlights.

#### Scenario: References across statements
- **WHEN** references are requested on `api` used in a relation, a `place`, a `route` endpoint, a `row` constraint and a `style` target
- **THEN** the declaration and the five uses are returned with their ranges

### Requirement: Rename
`prepareRename` SHALL accept element ids and named relation ids and refuse keywords, ports, anonymous relations and strings, each with a reason. `rename` SHALL use `renameElement` or `renameRelation`, and SHALL return their rejections (`edit.id-conflict`, `edit.invalid-id`).

#### Scenario: Rename a relation
- **WHEN** `save` is a relation used by `route save ...`, `label save ...` and `style save { }`, and it is renamed to `persist`
- **THEN** the relation and the three statements name `persist`, and nothing else changes

### Requirement: Formatting
`formatDocument(analysis)` SHALL format with the project's options and return a single edit replacing the smallest changed range, or no edit when the text is already formatted or has syntax errors.

#### Scenario: Already formatted
- **WHEN** a formatted file is formatted again
- **THEN** no edit is returned

### Requirement: Semantic tokens
`semanticTokens(analysis)` SHALL classify:

- element ids as `variable`;
- group ids as `namespace`;
- relation ids as `function`;
- ports as `property`;
- class names as `class`;
- theme names as `type`.

The declaring token SHALL carry the `declaration` modifier. The tokens SHALL be ordered and SHALL not overlap.

#### Scenario: Declaration and use
- **WHEN** `api["API"]` is declared and used in `api -> db`
- **THEN** both `api` tokens are `variable`, and only the first has `declaration`

### Requirement: Quick fixes and refactors
`codeActions(analysis, range, diagnostics)` SHALL offer one edit plan per action:

| Diagnostic or selection | Actions |
|---|---|
| `layout.missing-placement`, `layout.mode-unsupported` | Arrange the unplaced elements with ELK |
| `layout.placement-ignored` | Switch to `layout assisted`; switch to `layout manual` |
| `ref.unknown-element` | Declare the element as a node |
| `placement.unknown-port` | Declare the port on the facing side; use each existing port |
| `layout.text-overflow` | Set the size to the width in the hint |
| `prop.unknown`, `layout.unknown-theme`, `theme.unknown-class`, `asset.unknown-icon` | Replace with the closest accepted alternative |
| a relation without an id | Name this relation |
| a flow diagram | Arrange diagram (recompute every position) |

Each plan SHALL be verified like any other edit. Fixes SHALL take the ids, alternatives and values they need from the diagnostic's `data`, never from its words, and their titles SHALL be in the interface language.

#### Scenario: Unknown port
- **WHEN** `route publish from api.east to bus.inbox` reports `placement.unknown-port` and `bus` declares `in`
- **THEN** the actions are "Declare port `inbox` on `bus`", which adds `port inbox west` to the block of `bus`, and "Use `bus.in`"

#### Scenario: Ignored placement
- **WHEN** a `layout auto` diagram reports `layout.placement-ignored`
- **THEN** "Switch to `layout assisted`" replaces `layout auto` with `layout assisted` and the diagnostic disappears after the edit

#### Scenario: Fixes in Spanish
- **WHEN** the interface language is Spanish and a diagram writes the unknown property `colour`
- **THEN** the fix is offered with a Spanish title and writes the same replacement as in English

### Requirement: Rendering and export names
`renderDiagram` SHALL return the SVG that `meltemi-diagrams export` writes for the same diagram and options, together with the layout geometry. `exportFileName(stem, diagramId, diagramCount)` SHALL return `<stem>.svg` for one diagram and `<stem>.<diagram-id>.svg` otherwise.

#### Scenario: Same bytes as the CLI
- **WHEN** `corpus/valid/edge/annotations.meltemi` is rendered by `renderDiagram` and exported by the CLI
- **THEN** the two SVG strings are equal

### Requirement: Services in the interface language
Hover descriptions and keyword documentation, completion details and documentation, rename refusals and the reasons an edit is refused SHALL be in the interface language. Code in them (keywords, values, ids, samples) SHALL stay as written.

#### Scenario: Spanish hover
- **WHEN** the interface language is Spanish and the cursor is on the keyword `place`
- **THEN** the hover describes it in Spanish and keeps `place <id> at (<x>, <y>)` as written

#### Scenario: Spanish refusal
- **WHEN** the interface language is Spanish and a rename to an id already in use is refused
- **THEN** the reason is in Spanish and names both ids in backticks

