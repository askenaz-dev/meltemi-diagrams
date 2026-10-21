## Why

The product proposal (`propuesta-detallada-diagramas-como-codigo`, 2026-10-09) defines Architecture Studio, but no code exists yet: the repository holds the document and an empty OpenSpec scaffold. Stage 1 of the plan ("contracts and prototypes") must deliver the formal grammar, the intermediate model and minimal source edits before anything else, because the editor, the layout engine and the exporters all depend on stable IDs and on changing a file without losing comments or formatting. The proposal also sets a gate: drag, rename and connection edits must be proven to preserve comments before the grammar is stabilised.

## What Changes

This change covers **Stage 1 (contracts and prototypes)** of the proposal's plan, scoped to the `flow` profile, plus the workspace that every later stage builds on.

- Create the pnpm/TypeScript monorepo: `packages/language`, `packages/model`, `packages/edit`, `packages/cli`, a `corpus/` of reference `.arch` files, `docs/`, MIT license, lint and test tooling, and a CI workflow.
- Publish the formal grammar of language 0.2 (`docs/language/grammar-0.2.md`): lexical rules and EBNF for the whole surface shown in the proposal (header, `model`, `diagram` of the four types, `placement`, `style`/`theme`, `animate`, `story`, `export`), built on a generic statement structure so vocabulary can grow without grammar changes.
- Implement the lexer and parser producing a lossless concrete syntax tree (CST) with source positions, statement-level error recovery, and a diagnostics contract shared by all later components.
- Implement the typed intermediate model and validation for the `flow` profile: elements, relations, placement, style and animate blocks, reference resolution, ID uniqueness, property vocabulary, and the rule that compiling never modifies a file. Define the model shapes for `sequence`, `c4` and `free` so later stages extend rather than restructure; those profiles compile to an explicit "profile not supported yet" diagnostic.
- Implement JSON interchange for a compiled document, including source ranges for every element, relation and placement statement.
- Implement structured source edit operations (set position, set size, set route, set label anchor, set relation label, rename element, materialise a relation ID, remove element with dependency detection) that produce minimal text edits, preserve comments and formatting, return inverse edits, and are checked against a document revision.
- Ship a minimal CLI (`studio validate <path>`) as the first runnable vertical slice.
- Record decision notes for the parser approach, the generic statement grammar, provisional package names, and identifier rules.

No **BREAKING** changes: the repository is greenfield.

## Capabilities

### New Capabilities
- `arch-language-syntax`: lexical structure, grammar 0.2, lossless CST with positions, error recovery, and the diagnostics contract.
- `flow-diagram-model`: semantic model and validation of `flow` diagrams (elements, relations, placement, style, animate, IDs, references, profile gating).
- `source-editing`: structured operations that become minimal text edits, preserving comments and formatting, with rename, removal checks, inverses and revision checks.
- `model-json-interchange`: JSON representation of a compiled document and its diagnostics, with source map.
- `cli-validation`: behaviour, output and exit codes of `studio validate`.

### Modified Capabilities
None. This is the first change; `openspec/specs/` is empty.

## Impact

- New code only, under `packages/*`, `corpus/`, `docs/` and repository tooling files.
- Runtime dependencies are kept to a minimum: no parser generator, no layout engine, no browser automation. Dev dependencies: TypeScript, vitest, tsx, eslint, prettier.
- Establishes public interfaces later stages depend on: `parse()`, `compile()`, `Diagnostic`, `TextEdit`, `planEdit()`/`applyEdits()`, the CST node kinds, and the JSON interchange schema (`model-json` version 0.1).
- The existing PlantUML-based tool mentioned in the proposal is not part of this repository and is not touched.

## Non-goals

- Layout engines, text measurement, rendering (SVG/PNG) and any export format.
- Canvas, editor UI, timeline, undo/redo stack, language server (LSP).
- Semantics of `sequence`, `c4` and `free` beyond parsing and the unsupported-profile diagnostic; reordering operations (a `sequence` concern) are deferred to that stage.
- Importers (Mermaid, PlantUML), AI assistance, icon catalog, themes beyond parsing the `theme` property.
- A full formatter and incremental reparsing (whole-file reparse is sufficient at Stage 1 sizes).
- Final product, package or binary names: `@dac/*` and `studio` are provisional.
