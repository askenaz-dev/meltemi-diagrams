## ADDED Requirements

### Requirement: Import entry point
`@meltemi/diagrams-import` SHALL export `importText(text, options)` with options `format`
(`mermaid`, `plantuml` or `markdown`), `fileName`, `readFile(path)` for local includes and
`hasIcon(name)` for icon packs. It SHALL return `{ text, status, format, diagrams, findings,
coverage }` and SHALL NOT throw for any input text. It SHALL use no Node APIs and no network.

#### Scenario: Result of a simple import
- **WHEN** `importText("flowchart LR\n  a --> b", { fileName: "checkout.mmd" })` runs
- **THEN** the result has status `complete`, format `mermaid`, one diagram `checkout` of type
  `flow`, and text that compiles without errors

#### Scenario: Garbage input does not throw
- **WHEN** the input is binary noise
- **THEN** the result has status `failed`, text `null` and an `import.unknown-format` finding

### Requirement: Format detection
`detectFormat(text, fileName?)` SHALL return `mermaid` for `.mmd` and `.mermaid`, `plantuml` for
`.puml`, `.plantuml`, `.pu`, `.iuml` and `.wsd`, and `markdown` for `.md` and `.markdown`. Without
a known extension it SHALL inspect the content: an `@start…` line means PlantUML; a first
significant line (after `---` front matter, `%%` comments and `%%{init}%%` directives) that is a
Mermaid diagram keyword means Mermaid; a fenced block tagged `mermaid`, `plantuml` or `puml` means
Markdown. Otherwise it SHALL return `null` and the import SHALL fail with `import.unknown-format`,
with a hint to pass `--from`.

#### Scenario: Content detection
- **WHEN** `diagram.txt` starts with `@startuml`
- **THEN** the format is `plantuml`

#### Scenario: Explicit format wins
- **WHEN** `notes.txt` holds a Mermaid flowchart and the format `mermaid` is passed
- **THEN** it is imported as Mermaid

### Requirement: Findings and status
Every construct that is not mapped exactly SHALL produce a finding with a code, a severity, a
message, its range in the source, the construct name, its status (`approximated` or `dropped`) and
whether it is essential. Approximations SHALL use `import.approximated` (info), dropped constructs
`import.unsupported-construct` (warning), unreadable lines `import.syntax` (warning, essential),
unsupported diagram types `import.unsupported-diagram` (error, essential). Elements, participants,
entities, relations and messages SHALL be essential; colours, layout hints, interactions and
legends SHALL NOT. The status SHALL be `failed` when no diagram was imported, `partial` when an
essential construct was dropped (with one `import.partial` warning that counts them), and
`complete` otherwise. `coverage` SHALL count, per diagram, the constructs mapped, approximated and
dropped.

#### Scenario: Approximations keep the import complete
- **WHEN** a Mermaid flowchart uses a hexagon node and a thick link
- **THEN** both produce `import.approximated`, and the status is `complete`

#### Scenario: Unreadable line
- **WHEN** a flowchart contains the line `A --=> B`
- **THEN** an `import.syntax` finding points at the line and the status is `partial`

#### Scenario: Unsupported diagram
- **WHEN** the input is a Mermaid `classDiagram`
- **THEN** the status is `failed` with `import.unsupported-diagram` naming the supported types

### Requirement: Ids and labels
Source ids that are not identifiers SHALL be rewritten deterministically (characters outside
`[A-Za-z0-9_]` become `_`, a leading digit gets the prefix `n`, collisions get `_2`, `_3`;
statement words such as `node` or `else` stay ids, since the language reads them by position), each with an `import.renamed-id` info finding. An element without a
label SHALL use its source id as its label. Diagram ids SHALL come from the PlantUML block name,
else the title, else the nearest Markdown heading, else the file stem, else the diagram kind,
rewritten the same way and unique in the sheet.

#### Scenario: Renamed id keeps the visible text
- **WHEN** a flowchart declares `order-api[Order API]` and `1 --> order-api`
- **THEN** the sheet declares `order_api "Order API"` and `n1 "1"`, with two `import.renamed-id`
  findings

### Requirement: Output guarantees
The text SHALL start with `language "0.2"` and a comment naming the source file and format, SHALL
be formatted with `formatSource`, SHALL be identical for identical inputs, and SHALL compile
without errors. Source line comments SHALL be kept as `//` comments before the statement that
follows them. When the self-check finds compile errors, they SHALL be added as findings and the
status SHALL be `partial`.

#### Scenario: Comments survive
- **WHEN** a Mermaid line `%% payment path` precedes `pay --> bank`
- **THEN** the sheet has `// payment path` on the line before the relation

#### Scenario: Deterministic output
- **WHEN** the same source is imported twice
- **THEN** both texts are byte for byte identical

### Requirement: Markdown input
In Markdown, each fenced block tagged `mermaid`, `plantuml` or `puml` SHALL become a diagram of one
sheet, in document order, with finding ranges in the Markdown file. Other blocks and prose SHALL be
ignored. A Markdown file without such blocks SHALL fail with `import.unsupported-diagram`.

#### Scenario: Two blocks
- **WHEN** a README has a `## Checkout` heading over a Mermaid flowchart and a `## Payment` heading
  over a PlantUML sequence
- **THEN** the sheet has a flow diagram `checkout` and a sequence diagram `payment`

### Requirement: Coverage tables
The package SHALL export `MERMAID_COVERAGE` and `PLANTUML_COVERAGE`: for each diagram type and
construct, its status (`mapped`, `approximated`, `dropped`), its target and notes, with the source
versions the tables were written against. `docs/import/mermaid.md` and `docs/import/plantuml.md`
SHALL be generated from them by `pnpm import:docs`, and a test SHALL fail when the files differ
from the tables.

#### Scenario: Drift is caught
- **WHEN** a construct is added to `MERMAID_COVERAGE` without regenerating the docs
- **THEN** the docs test fails and names `pnpm import:docs`
