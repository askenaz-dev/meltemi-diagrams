## 1. Model

- [x] 1.1 `SEQUENCE_PROFILE`: participant kinds, `group`, diagram properties (`autonumber`), block statements (`kind`), sequence placement statements, rule kinds; `sequence` leaves the parse-only profiles
- [x] 1.2 Types: `type: "sequence"`, participant kinds, `Relation.async`, `SequenceEvent` union, `events`, `eventsByKey`, `SpaceEntry`, `GapEntry`, `scenarios`, `autonumber`, style targets on events
- [x] 1.3 Analyser: participants and groups, messages and `kind async`, events in order (activations, lifecycle, notes, fragments, dividers, delays), event keys, sequence placement, scenarios
- [x] 1.4 Order-checked rules: `sequence.activation`, `sequence.lifecycle`, unknown participants, branch-local state
- [x] 1.5 Scenario checks (`sequence.scenario`) and `resolveScenario`
- [x] 1.6 JSON for sequence diagrams; profile gating for `c4` only; snapshots
- [x] 1.7 Unit tests for every scenario of `sequence-diagram-model` and `sequence-scenarios`

## 2. Layout and rendering

- [x] 2.1 `layoutSequence`: columns, rows, heads, lifelines, activation bars, messages and arrowheads, self-calls, create and destroy, notes, fragments, dividers, delays, autonumber
- [x] 2.2 `LayoutResult` geometry (`boxes`, `connectors`, `labels`, `events`) and `LayoutOptions.scenario`
- [x] 2.3 Tests for the `sequence-layout` scenarios and scenario layouts

## 3. Edit operations

- [x] 3.1 `reorderParticipant`, `moveEvent` with validation, `setSpacing`
- [x] 3.2 `insertEvent`, `wrapInFragment`, `unwrapFragment`, `addBranch`, `setFragmentCondition`, `setElementProperty` `kind`
- [x] 3.3 Shared operations in sequence diagrams: `createElement` kinds, `removeElement` dependents, refusals of flow-only operations
- [x] 3.4 Tests for the `sequence-editing` scenarios and the corpus-wide operation test

## 4. Editor

- [x] 4.1 Language services: scopes, completion, hover, definition, tokens, quick fixes
- [x] 4.2 Session: sequence render (events), actions (reorder participant, space, move event, insert, wrap, activation toggle), scenario preview, inspector fields
- [x] 4.3 Keyboard map and protocol
- [x] 4.4 Tests for `sequence-editor-tools`

## 5. VS Code and CLI

- [x] 5.1 Webview: sequence palette and drags, Alt+Up/Down, Alt+A, scenario picker
- [x] 5.2 Extension: Export SVG scenario choice; grammar and snippets
- [x] 5.3 CLI `export --scenario`
- [x] 5.4 Webview, VS Code and CLI tests

## 6. Corpus, docs and verification

- [x] 6.1 Move the payment sequence to `corpus/valid/sequence/`; sheets for every construct and scenario; invalid sheets per new code; `profile.unsupported` and `export.no-diagram` examples on `c4`
- [x] 6.2 `docs/language/sequence.md`, grammar, diagnostics, editor guide, README, decision 0019, skill
- [x] 6.3 Typecheck, lint, tests, licences, corpus validation, webview, VS Code and package tests; visual review
