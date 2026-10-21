## 1. Labels and composition in the layout

- [x] 1.1 `auditLabels` (cut by picture, background or shape; overlap with texts, boxes and drawn connectors; containers, annotations, layers)
- [x] 1.2 `layoutDiagram` reports `layout.label-cut` and `layout.label-overlap` without repeating other findings
- [x] 1.3 Labels slide to clear stops; connectors pass under group titles; default connectors go around boxes in assisted and manual mode
- [x] 1.4 `layout.connector-crossing`; fixtures in `corpus/invalid/` for the three codes; diagnostics and layout references
- [x] 1.5 `validate` reports each file's layout diagnostics; tests updated
- [x] 1.6 Unit tests: the audit, `splitAround`, `avoidingRoute`, label stops, the crossing check

## 2. Acceptance corpus and suite

- [x] 2.1 `corpus/acceptance/` sheets for the four profiles (long labels, cycles, nested containers, parallel relations, 30 elements), `errors/`, `edits/`
- [x] 2.2 `packages/acceptance`: package, tsconfig, vitest alias; SVG snapshots of the corpus; clean compile and layout
- [x] 2.3 The label target over every corpus, template and example
- [x] 2.4 Acceptance conditions: persistence, source, references, layout, connectors, sequence, C4, motion, import, delivery
- [x] 2.5 Syntax errors: diagnostics, services and the stale canvas
- [x] 2.6 Determinism of scenes and control frames

## 3. Runners

- [x] 3.1 PNG reader and pixel comparison; `pnpm acceptance:visual` with references, manifest, diffs and `--update`
- [x] 3.2 `pnpm acceptance:determinism` (SVG, HTML, PNG, MP4, WebM, GIF with frame hashes)
- [x] 3.3 `pnpm bench` of the editor's path with `--write` to `docs/performance.md`; targets asserted in tests
- [x] 3.4 `pnpm acceptance:first-export` (CLI per template, playground)
- [x] 3.5 `pnpm verification:browsers` (Edge, Chrome, Firefox through BiDi; PDF read from the file) writing `docs/verification/browsers.md`
- [x] 3.6 `pnpm verification:kit` and `docs/verification/office-apps.md`
- [x] 3.7 `pnpm acceptance` writing `docs/quality/results.md`

## 4. Documentation and verification

- [x] 4.1 `docs/quality.md`, decision 0032, README performance, CONTRIBUTING, roadmap
- [x] 4.2 Typecheck, lint, unit tests, every browser suite, VS Code tests, the full acceptance run on the reference machine; visual review of changed drawings
