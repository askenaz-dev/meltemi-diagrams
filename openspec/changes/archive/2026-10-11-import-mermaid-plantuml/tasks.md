## 1. Package and core

- [x] 1.1 Create `packages/import` (`@meltemi/diagrams-import`, source condition, tsconfig, vitest alias) with `report.ts` (findings, codes, status, coverage counts), `ids.ts` (id rewriting, diagram ids) and `detect.ts` (`detectFormat`). Test detection, ids and the status rules.
- [x] 1.2 Implement `writer.ts`: builders for flow, free, sequence and C4 (model plus view) that print ordinary `.meltemi` text with comments, names relations and fragments when needed, and format the result with `formatSource`; the self-check that compiles the text and adds errors as findings. Test that each builder's output compiles.
- [x] 1.3 Implement `importText` with Markdown extraction (`markdown.ts`, ranges mapped into the Markdown file, headings for diagram ids) and the header comment. Test the README scenario, determinism and unknown input.

## 2. Mermaid

- [x] 2.1 Front matter, `%%{init}%%`, comments, `accTitle`/`accDescr` and the diagram keyword table, with `import.unsupported-diagram` for the rest.
- [x] 2.2 Flowcharts: node shapes (classic and `@{ }`), labels (quotes, `<br>`, entities, Markdown strings, `fa:` icons), subgraphs and membership, links of every form with chains, `&`, labels, ids and animations, `classDef`/`class`/`:::`/`style`/`linkStyle`, interactions dropped. Test every scenario of the spec.
- [x] 2.3 Sequence diagrams: participants and kinds, boxes, `create`/`destroy`, arrows, activation shorthand, notes, fragments, `rect`, `autonumber`. Test the scenarios.
- [x] 2.4 `architecture-beta`: groups, services, icons, junctions, sided edges as routes. Test the scenario.
- [x] 2.5 `block-beta`: grid with columns, spans, spaces, nested blocks, shapes, block arrows, links and styles. Test the scenario.

## 3. PlantUML

- [x] 3.1 Preprocessor (`plantuml/preprocess.ts`): defines, definelong, variables, procedures, functions, conditionals, loops, includes (local, C4, stdlib, remote refused), built-ins, limits and source ranges. Test every scenario of the spec.
- [x] 3.2 Blocks and classification, dropped commands, comments, titles. Test the two-block scenario and the unsupported kinds.
- [x] 3.3 Description diagrams: element keywords and short forms, aliases, containers as groups, stereotypes, colours, arrows of every form, notes, direction, `together`. Test the scenarios.
- [x] 3.4 Sequence diagrams: participants, boxes, messages and gates, suffixes, `return`, notes, fragments, dividers, delays, spaces, `autonumber`. Test the scenarios.

## 4. C4

- [x] 4.1 Shared macro parser and mapper (`c4.ts`): entities, `_Ext`, `Db`/`Queue` forms, boundaries and synthetic parents, relations of every form, dropped styling macros, the view's level, scope, includes and direction. Wire it to Mermaid `C4*` and C4-PlantUML. Test the scenarios with both syntaxes.

## 5. Re-import

- [x] 5.1 Implement `mergeImport` (`merge.ts`) on the parse trees: kept statements per diagram, reduced lists, element block properties, relation id matching, fragment ids and scenarios, local labels, blocks not in the source, and the compile-and-drop safety loop. Test the spec scenarios and that merged sheets compile.

## 6. Coverage and docs

- [x] 6.1 Write `MERMAID_COVERAGE` and `PLANTUML_COVERAGE` (`coverage.ts`) with versions, a `scripts/import-docs.mjs` generator (`pnpm import:docs`) for `docs/import/mermaid.md` and `docs/import/plantuml.md`, and the drift test.
- [x] 6.2 Corpus `corpus/import/{mermaid,plantuml,markdown,merge}/` with inputs and expected sheets and reports, and a golden test that also lays out and renders every expected sheet with ELK.
- [x] 6.3 Decision `docs/decisions/0021-import.md`, diagnostics in `docs/language/diagnostics.md`, the README and docs index, and the skill's converting reference; run `pnpm skills:sync`.

## 7. Commands

- [x] 7.1 CLI `import` with `--from`, `--out`, `--force`, `--merge`, `--json`, `--check`, local includes inside the folder or project, project icon packs, findings with source positions, counts and exit codes; help text. Test the scenarios.
- [x] 7.2 VS Code: the three commands with menus and arguments, the overwrite question with Merge/Replace/Cancel, the output channel, the `meltemi-import` diagnostics collection and notifications; bundle the import package. Add a VS Code test for the explorer conversion and for merging.

## 8. Verification

- [x] 8.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package`, `pnpm licenses:inventory --check`; validate and export the corpus with the CLI; review rendered imports.
