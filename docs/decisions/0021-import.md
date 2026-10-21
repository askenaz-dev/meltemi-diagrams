# 0021. Importing Mermaid and PlantUML

Status: accepted (import-mermaid-plantuml change, 11 October 2026)

## Context

Most architects who would adopt Meltemi Diagrams already keep diagrams in Mermaid (READMEs, wikis)
or PlantUML. The proposal makes import a migration path with rules: importers publish their
coverage by construct and version, keep the original, produce native source with a report, never
declare a conversion complete when an essential element is missing, and never extract meaning from
a rendered image. Every profile an import maps to (flow, free, sequence, models with C4 views)
now compiles, lays out with ELK and renders.

## Decision

- **A pure package.** `@meltemi/diagrams-import` has no Node APIs and no network: hosts pass
  `readFile` for PlantUML includes and `hasIcon` for icon packs. The CLI and VS Code are thin
  wrappers around `importText` and `mergeImport`.
- **Front-ends write ordinary sheets.** Mermaid and PlantUML front-ends build small sheet
  structures that one printer writes as formatted `.meltemi` text with the source's comments. Flow
  diagrams use `layout auto`; `block-beta` grids become free compositions with places and sizes;
  architecture sides become route ports. The output is compiled before it is returned; it never has
  errors, or the import says why.
- **A report on every construct.** Every construct is counted as mapped, approximated or dropped.
  Findings carry the construct, its range in the source (in the Markdown file for fenced blocks,
  and the user's line for preprocessed text), and whether it is essential. Elements, relations,
  messages, entities and unreadable lines are essential: dropping one makes the import `partial`.
  The coverage tables in code are the docs (`docs/import/*.md`, generated, checked by a test), and
  the corpus test fails when a construct reported by an import is not in the tables.
- **A real PlantUML preprocessor.** Defines, long defines, variables, procedures, functions,
  conditionals, loops, local includes and built-in functions run before parsing, with limits on
  depth and size. Remote includes are never fetched; the C4-PlantUML and standard libraries are
  recognised by name and never read, so C4 macros reach the C4 mapper as calls.
- **One C4 mapper.** Mermaid `C4*` and C4-PlantUML share the macro parser and the mapping to a
  model and a view: boundaries become the systems and containers that hold their children, the
  level comes from the keyword or the included library, the scope from the boundary.
- **Fragments get ids.** Imported sequence fragments are named `<operator><n>` so scenarios,
  `space` and re-imports can name them.
- **Re-import merges by id.** `mergeImport` keeps the existing sheet's layout mode, placement,
  styles, classes, rules, animations, ports, links, layers, relation and fragment ids, scenarios and
  local labels whose targets still exist, reduces target lists, lets existing style properties
  replace imported ones property by property, keeps blocks the source does not produce, and drops
  any copied statement that would not compile, reporting each one. The merged sheet is written in a
  canonical order, so merging twice changes nothing.

## Alternatives considered

- **Embedding Mermaid or PlantUML.** Running their parsers would need a browser or Java and would
  produce their own layout, not a sheet the editor can adjust; a hand-written front-end reports
  exactly what it maps.
- **Importing positions from the rendered image.** The proposal rules it out; ELK lays imports out
  and the canvas and re-import keep the user's adjustments.
- **Fetching remote includes.** It would make imports depend on the network and on third-party
  content; the importer names the include it skipped instead.

## Consequences

- Mermaid diagram types other than flowchart, sequence, C4, architecture and block, and PlantUML
  diagrams other than component, deployment, use case, sequence and C4 are refused with
  `import.unsupported-diagram`.
- New constructs in Mermaid or PlantUML are reported as unreadable until the tables and front-ends
  learn them; `docs/import/` says which versions the tables follow.
- Routes from a side of a group now lay out with ELK and end on the group's drawn border.
