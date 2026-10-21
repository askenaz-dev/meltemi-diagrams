## Why

Most architects who would adopt Meltemi Diagrams keep their diagrams in Mermaid (READMEs, wikis)
or PlantUML (the owner's current tool is PlantUML-based). The proposal makes import a migration
path with rules: importers publish their coverage by construct, keep the original, produce native
source with a report, and never declare a conversion complete when an essential element is
missing. Roadmap change 12 asks for the full scope now: Mermaid `flowchart`, `sequenceDiagram`,
`C4*`, `architecture-beta` and `block-beta`; PlantUML component, deployment, use case, sequence and
C4-PlantUML, with the preprocessor; Markdown blocks; re-import that keeps manual adjustments by id;
and the CLI and VS Code commands. Every profile they map to now compiles: flow, free, sequence and
C4 models with views.

## What Changes

- **New package `@meltemi/diagrams-import`** (pure TypeScript, no Node APIs, no network):
  - format detection by file extension and by content;
  - a Mermaid front-end: `flowchart`/`graph` to flow diagrams, `sequenceDiagram` to sequence
    diagrams, `C4Context`/`C4Container`/`C4Component`/`C4Dynamic` to a model with a view,
    `architecture-beta` to flow diagrams with icons and sided routes, `block-beta` to free
    compositions on a grid;
  - a PlantUML front-end with a preprocessor (`!define`, `!definelong`, `!procedure`, `!function`
    with `!return`, `$variables`, `!if`/`!elseif`/`!else`/`!endif`, `!include` of local files and
    of the C4 standard library, built-in functions) and mappings for component, deployment and use
    case diagrams to flow, sequence diagrams to sequence, and C4-PlantUML to models with views;
  - Markdown input: each fenced `mermaid` or `plantuml` block becomes a diagram of one sheet;
  - a printer that writes ordinary, formatted `.meltemi` text that compiles without errors and
    renders, with the source's comments kept as comments;
  - a report: every construct is mapped, approximated or dropped, with its source position; a
    dropped essential construct makes the import `partial`; coverage tables per construct are
    published and documented.
- **Re-import keeping adjustments.** Importing into an existing sheet keeps, by id, its placement,
  styles, classes, animations, local labels and layout mode for the diagrams and elements that
  still exist, and reports what could not be kept.
- **CLI.** `meltemi-diagrams import <file>` with `--from`, `--out`, `--force`, `--merge`, `--json`
  and `--check`; the source is never modified; findings print like `validate`; exit 0 when
  complete, 1 when partial, 2 on usage errors or unsupported input.
- **VS Code.** **Import from Mermaid or PlantUML…**, **Convert to Meltemi Diagram** in the explorer
  for `.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.pu`, `.iuml` and `.md`, and **Import Selection as
  Meltemi Diagram**; the result opens with code and canvas; findings go to an output channel and
  to Problems on the source.
- **Docs.** `docs/import/mermaid.md` and `docs/import/plantuml.md` generated from the coverage
  tables and checked by a drift test; decision 0021; the skill's converting reference.

## Capabilities

### New Capabilities

- `diagram-import`: detection, the report and its codes, ids, comments, Markdown, output
  guarantees.
- `mermaid-import`: the Mermaid mappings.
- `plantuml-import`: the PlantUML mappings.
- `plantuml-preprocessor`: the preprocessor.
- `c4-import`: the C4 macros of both languages into models and views.
- `import-merge`: re-import keeping manual adjustments.
- `cli-import`: `meltemi-diagrams import`.
- `vscode-import`: the VS Code commands.

### Modified Capabilities

None.

## Impact

- New package `packages/import` (`@meltemi/diagrams-import`), depending on language, model and
  edit; the CLI and the VS Code extension depend on it.
- New diagnostic codes: `import.unknown-format`, `import.unsupported-diagram`, `import.syntax`,
  `import.unsupported-construct`, `import.approximated`, `import.renamed-id`, `import.partial`,
  `import.include`, `import.preprocessor`, `import.merge`.
- Corpus `corpus/import/{mermaid,plantuml,markdown,merge}/` with inputs, expected sheets and
  reports.
