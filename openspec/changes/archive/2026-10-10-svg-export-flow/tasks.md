## 1. Vocabulary

- [x] 1.1 Add element kinds `note` and `tag`, style property `line`, and multi-target `style`/`animate` to the schema tables and the flow analyzer; keep per-target `prop.duplicate` detection
- [x] 1.2 Add model tests for annotations, multi-target styles and repeated properties; refresh corpus snapshots
- [x] 1.3 Update `docs/language/grammar-0.2.md` and `docs/language/model-json.md` for the new kinds and properties

## 2. Source editing

- [x] 2.1 Make `removeElement` drop a single target (and its comma) from multi-target `style` and `animate` statements, deleting the statement only when no target remains
- [x] 2.2 Add edit fixtures for one target removed and for all targets removed

## 3. Layout package

- [x] 3.1 Create `packages/layout` with the `Scene` and `Theme` types, the `studio.light` and `studio.dark` token tables and `resolveTheme()` with `layout.unknown-theme`
- [x] 3.2 Implement element boxes: placement, default sizes per kind, text width estimation for tags, notes and labels, groups derived from children, z-order
- [x] 3.3 Implement route anchors per decision D3 (`sideAnchor`, overlap centre, waypoint projection, `auto` sides) and polylines with arrowheads
- [x] 3.4 Implement shapes and text: node, data cylinder, decision diamond, group band with title, note lines, tag pill, relation label pill, descriptions
- [x] 3.5 Implement style application (fill, stroke, color, line, `none`) and diagnostics `layout.missing-placement` and `layout.mode-unsupported`
- [x] 3.6 Write layout tests for every scenario in `flow-svg-export` (geometry, anchors, labels, styles, themes, diagnostics)

## 4. Render package

- [x] 4.1 Create `packages/render` with `renderSvg(scene)`: header, background, `<title>`/`<desc>`, escaping, number formatting, `data-id` groups, no markers or `dominant-baseline`
- [x] 4.2 Write render tests: structure, escaping, determinism, title and description

## 5. CLI

- [x] 5.1 Implement `studio export` with `--diagram`, `--format`, `--out`, `--stdout`, diagnostic printing and exit codes
- [x] 5.2 Write CLI export tests, including `layout.mode-unsupported` on `checkout.arch`, `export.no-diagram` and unknown diagram or format

## 6. Corpus and documentation

- [x] 6.1 Add `corpus/valid/edge/annotations.arch` (notes, tags, shared styles, dashed outlines, data and decision shapes, groups, waypoints, step labels) with its SVG snapshot
- [x] 6.2 Add `corpus/invalid/layout.missing-placement.arch`, `layout.mode-unsupported.arch`, `layout.unknown-theme.arch` and `export.no-diagram` coverage; adapt the corpus tests so layout codes are checked by the layout package
- [x] 6.3 Write `docs/language/svg-export.md` (defaults, anchor rules, styles, themes, portability) and `docs/decisions/0006-route-anchors.md`; update `docs/language/diagnostics.md`, the README and `.prettierignore`

## 7. Konfío Agent Platform example

- [x] 7.1 Convert the HTML sheet to `examples/konfio-agent-platform/konfio-agent-platform.arch` with manual placement, bands as groups, proposed pieces dashed, steps as labels, Auth0 capabilities as tags, a legend, and the request flow as comments
- [x] 7.2 Export the SVG, open it in a browser beside the original and fix every visible difference that is not an intended improvement; record the intended differences in `examples/konfio-agent-platform/README.md`
- [x] 7.3 Add the example test that renders every `examples/**/*.arch` and compares it with its stored SVG

## 8. Quality

- [x] 8.1 Run typecheck, lint, test, build and `studio validate corpus/valid`, and update the CI workflow to export the corpus
- [x] 8.2 Validate the change with `openspec validate svg-export-flow --strict`
