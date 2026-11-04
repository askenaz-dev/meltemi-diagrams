## 1. Model

- [x] 1.1 `model` blocks: entities, nesting, paths, block properties, relations with relative and qualified endpoints, `model.*` and `ref.unknown-entity` diagnostics, `document.models`, references for navigation and rename
- [x] 1.2 `C4_PROFILE` in the profile table; `c4` leaves the parse-only profiles; `model` leaves the parse-only blocks
- [x] 1.3 View analysis: `using`, `level`, `scope`, `include`, `exclude`, default sets, boundaries, elements from entities, local labels, qualified targets in placement, styles and animations
- [x] 1.4 Relations in views: lifting, `sources`, `derived`, explicit combination, `c4.unsupported-relation`
- [x] 1.5 Compile options with a model resolver, `Compilation.options`, `ref.unknown-model`
- [x] 1.6 Links to model entities and label reuse
- [x] 1.7 JSON: `models`, the `c4` section of views, relation `sources` and `derived`, element `entity`, `technology`, `external`; snapshots
- [x] 1.8 Unit tests for every scenario of `architecture-model` and `c4-views`

## 2. Project

- [x] 2.1 Recompile files with views or links of imported models against them; project checks for imported model names and links
- [x] 2.2 Cross-file rename plans for model entities
- [x] 2.3 Tests with project corpora

## 3. Layout and rendering

- [x] 3.1 C4 kinds: default sizes, person, box, cylinder and boundary drawing, type lines, external styling
- [x] 3.2 Built-in C4 classes from theme tokens; relation technology lines
- [x] 3.3 Tests for the `c4-layout` scenarios

## 4. Edit operations

- [x] 4.1 Model operations: `createEntity`, `renameEntity`, `removeEntity`, `setEntityProperty`, `createModelRelation`, `removeModelRelation`, `setModelRelationProperty`
- [x] 4.2 View operations: `includeEntity`, `excludeEntity`, `setLocalLabel`; qualified ids in placement, constraints, styles, animations and arrange; refusals
- [x] 4.3 Verification against the compile options; tests for `c4-editing`, the corpus-wide operation test

## 5. Editor

- [x] 5.1 Language services: scopes, completion, hover, definition, references, rename, tokens, symbols, quick fixes
- [x] 5.2 Session and inspector: C4 render, "Add from the model…", delete as exclude, entity and relation fields
- [x] 5.3 Tests for `c4-editor-tools`

## 6. VS Code and CLI

- [x] 6.1 Webview: C4 palette and the entity picker
- [x] 6.2 Extension: project-wide rename, definition into model files, "Open the model", grammar and snippets
- [x] 6.3 CLI: validate, export and layout of views
- [x] 6.4 Webview, VS Code and CLI tests

## 7. Corpus, docs and verification

- [x] 7.1 Corpus: valid model and views, a project with a model file and view files, invalid sheets per new code; `profile.unsupported` and `export.no-diagram` examples updated
- [x] 7.2 `docs/language/c4.md`, grammar, diagnostics, model JSON, editor guide, README, decision 0020, skill
- [x] 7.3 Typecheck, lint, tests, licences, corpus validation, webview, VS Code and package tests; visual review
