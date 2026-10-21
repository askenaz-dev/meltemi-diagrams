## 1. Workspace scaffold

- [x] 1.1 Create the pnpm workspace: root `package.json` (private, ESM, Node 22.12+ engines; Node 20 reached end of life in April 2026), `pnpm-workspace.yaml` with `packages/*`, `.npmrc`, `.gitignore`, `.editorconfig`
- [x] 1.2 Add `tsconfig.base.json` (strict, ES2022, NodeNext, declaration output) and a `tsconfig.json` per package extending it
- [x] 1.3 Add vitest at the root with a workspace config, and `eslint` plus `prettier` with a minimal shared config; add root scripts `build`, `test`, `lint`, `typecheck`
- [x] 1.4 Create package skeletons `packages/language`, `packages/model`, `packages/edit`, `packages/cli` with `src/index.ts`, one placeholder test each, and workspace dependencies between them; verify `pnpm -r typecheck` and `pnpm test` pass
- [x] 1.5 Add `LICENSE` (MIT), `README.md` (purpose, provisional names, how to run tests) and `CONTRIBUTING.md` (decision notes, corpus rules, no-data-loss rule)
- [x] 1.6 Add a GitHub Actions workflow running install, typecheck, lint, test, build and `studio validate` on Node 22 and 24 (Linux and Windows)

## 2. Language documentation and decisions

- [x] 2.1 Write `docs/decisions/0001-parser-approach.md`, `0002-provisional-names.md`, `0003-generic-statement-grammar.md` and `0004-identifiers-and-keys.md` from design decisions D1 to D5
- [x] 2.2 Write `docs/language/grammar-0.2.md`: lexical rules, EBNF for the statement shapes, terminators and continuation, and the recognised vocabulary per profile (flow complete; sequence, c4 and free as parsed-only tables)
- [x] 2.3 Write `docs/language/diagnostics.md` listing every diagnostic code from the specs with severity and message template

## 3. Corpus

- [x] 3.1 Create `corpus/valid/checkout.arch` and `corpus/parse-only/` with `overview.arch` (free), `payment.arch` (sequence), `commerce.arch` (model plus c4 view) and `purchase.arch` (story plus export), transcribed from the proposal with `language "0.2"` headers and comments; the non-flow files live in `parse-only/` because they report unsupported profiles by design
- [x] 3.2 Create `corpus/valid/edge/` files covering tabs, CRLF, `;`-joined statements, block comments between statements, trailing comments, a group with nested elements, parallel relations and a self-relation
- [x] 3.3 Create `corpus/invalid/` files, one per syntax and semantic diagnostic code in the specs, each named after the code
- [x] 3.4 Add a corpus README describing the snapshot files (`*.diagnostics.json`, `*.model.json`) and how to regenerate them

## 4. Lexer

- [x] 4.1 Implement `Token`, `Trivia`, token kinds and `tokenize(text)` with identifiers, strings and escapes, numbers with units, arrows, punctuation, line breaks and trivia attachment
- [x] 4.2 Implement lexer diagnostics `syntax.unexpected-character`, `syntax.unterminated-string`, `syntax.bom` and `syntax.mixed-line-endings`
- [x] 4.3 Implement `LineIndex` with offset-to-position and position-to-offset conversion (1-based lines and columns, UTF-16 offsets)
- [x] 4.4 Write lexer tests for every token class, each diagnostic, CRLF, BOM and the unsupported-arrow hint

## 5. Parser and CST

- [x] 5.1 Implement `CstNode`, node kinds, `toText()` and a `Missing` node
- [x] 5.2 Implement parsing of the header and top-level blocks (`model`, `diagram` with `: <type>` and optional `using`, `story`, `export`, `theme`) with `syntax.header-not-first` and `syntax.unexpected-top-level`
- [x] 5.3 Implement block parsing with the three statement forms, arguments (identifier, qualified ref, string, number with unit, tuple, list, commas), block chains, terminators and bracket continuation
- [x] 5.4 Implement statement-level error recovery with `syntax.expected-token` and resynchronisation at line break, `;` or `}`
- [x] 5.5 Write parser tests for every scenario in `arch-language-syntax`, including the one-bad-statement recovery case and pathological inputs
- [x] 5.6 Write the round-trip property test: every corpus file and 200 random mutations per file satisfy `toText(parse(text)) === text`

## 6. Model and validation (flow)

- [x] 6.1 Define the intermediate model types: `Compilation`, `Document`, `FlowDiagram`, `Element`, `Relation`, `PlacementStatement`, `StyleBlock`, `AnimateBlock`, source-map ranges, and typed shells for `SequenceDiagram`, `C4View`, `FreeDiagram`, `Model`, `Story` and `ExportProfile`
- [x] 6.2 Define the profile schema tables (diagram properties, element kinds, element and relation block properties, placement statements, ports, style properties, animate properties) for flow, plus parsed-only tables for the other profiles
- [x] 6.3 Implement `compile(text)`: top-level dispatch, profile gating (`profile.unsupported`, `profile.unknown`), and per-diagram isolation of errors
- [x] 6.4 Implement flow element analysis: shorthand and typed declarations, implicit declarations, labels, groups and group paths, `ref.duplicate-id`, element block properties
- [x] 6.5 Implement flow relation analysis: arrows, labels, `as` ids, endpoint resolution, anonymous keys `<from>-><to>#<n>`, the qualified-reference hint
- [x] 6.6 Implement diagram property validation (`direction`, `layout`, `theme`, `title`, `description`) with `prop.unknown`, `prop.invalid-value` and `prop.duplicate`
- [x] 6.7 Implement placement analysis: `place`, `size`, `route`, `label`, ports, percentage range, `ref.unknown-relation` with its hint, `placement.route-mismatch` and `placement.duplicate`
- [x] 6.8 Implement style and animate analysis with the schema tables, time units and repeat values
- [x] 6.9 Write corpus snapshot tests: diagnostics for every `corpus/invalid` file and models for every `corpus/valid` flow file; verify compile never throws on the pathological inputs

## 7. JSON interchange

- [x] 7.1 Implement `toJson(compilation)` and `diagnosticsToJson()` with fixed key order and ranges on every entry
- [x] 7.2 Write `docs/language/model-json.md` describing version 0.1 and add snapshot tests against `corpus/valid/*.model.json`

## 8. Source editing

- [x] 8.1 Implement `TextEdit`, `applyTextEdits()` (non-overlapping, applied from the end), `invertTextEdits()`, `detectLineEnding()` and `detectIndent()` in `@dac/language`
- [x] 8.2 Implement `planEdit()` scaffolding in `@dac/edit`: `EditOperation` union, `EditPlan`, `EditRejection`, target resolution through the source map, `edit.unsafe-target` and `edit.anonymous-relation`
- [x] 8.3 Implement `setPosition` and `setSize` with token-level replacement and the insertion rules (existing block, empty block, no block)
- [x] 8.4 Implement `setRoute` and `setLabelAnchor` with token-level replacement and insertion
- [x] 8.5 Implement `setRelationLabel` (replace, add, remove) and `materializeRelationId` with `edit.already-named` and `edit.id-conflict`
- [x] 8.6 Implement `renameElement` over all identifier references, with `edit.id-conflict`, `edit.invalid-id` and comment notes
- [x] 8.7 Implement `removeElement` with dependent detection, `edit.has-dependents`, and cascading whole-line or `;`-aware deletion
- [x] 8.8 Implement `applyEdits(document, plan)` with revision tracking, `edit.stale-revision` and inverse plans
- [x] 8.9 Write edit fixture tests (`before.arch`, operation JSON, `after.arch`) for every scenario in `source-editing`, including CRLF, tabs, `;`-joined statements and comments, and assert exact text plus inverse round trip

## 9. CLI

- [x] 9.1 Implement `studio validate <path>...` with recursive `.arch` discovery, the line format, the summary and exit codes 0, 1 and 2
- [x] 9.2 Implement `--json` and `--strict`
- [x] 9.3 Add CLI tests that spawn the command against `corpus/valid` and `corpus/invalid`, and a root script `pnpm studio validate corpus`

## 10. Quality gate

- [x] 10.1 Add a benchmark script (`pnpm bench`; vitest 5 replaced its `bench()` API) measuring parse and compile time of the largest corpus file, a 30-node diagram, a drag-and-recompile cycle and a 2,505-line file, and record the results in the README
- [x] 10.2 Run the Stage 1 gate manually (move, rename, route and label edits on `checkout.arch` with comments) and record the outcome in `docs/decisions/0005-stage1-gate.md`
- [x] 10.3 Verify the CI steps pass (run locally: frozen install, typecheck, lint, test with `CI=true`, build, `studio validate`; the GitHub workflow has not run because the folder is not a git repository yet), update the README quick start, and list the open questions from the design in `docs/language/grammar-0.2.md` under "Not yet decided"
