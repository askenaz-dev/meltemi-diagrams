## Why

Stage 1 delivered the language, the `flow` model and source editing, but nothing can be seen: the only output is JSON. Converting a real architecture sheet (the Konfío Agent Platform design of 2026-10-09, 30 boxes, 4 bands, 13 arrows, numbered steps and capability tags) exposed two gaps at once. First, the product cannot be judged without a rendered image, and the proposal's first demo needs a static sheet. Second, real sheets use annotations the vocabulary lacked: free text inside a band, small pill markers on boxes, dashed "proposed" outlines, and one style shared by a dozen elements.

## What Changes

This change starts **Stage 2 (flow and free: themes, SVG and PNG)** with the pieces the conversion needs, scoped to manually placed `flow` diagrams.

- Extend the `flow` vocabulary: element kinds `note` (free text) and `tag` (small pill); style property `line` (`solid` or `dashed`) for outlines; `style` and `animate` statements that apply one block to several comma-separated targets.
- Add `@dac/layout`: turns a `flow` diagram with manual placement into a vector scene (boxes, group bands derived from their children when unplaced, cylinder and diamond shapes, routes with side anchors and waypoints, arrowheads, label pills, notes and tags) with built-in light and dark themes and default sizes when `size` is absent.
- Add `@dac/render`: serialises a scene to portable SVG (no markers, no `dominant-baseline`, inline attributes, `data-id` on every element and relation, `<title>` and `<desc>` from the diagram properties).
- Add `studio export <file> --format svg` with `--diagram`, `--out` and `--stdout`.
- Teach `removeElement` to drop a single target from a multi-target `style` or `animate` list instead of deleting the whole statement.
- Add the Konfío Agent Platform conversion under `examples/`, an annotations corpus file, SVG snapshots, the export reference and decision notes.

No **BREAKING** changes: every file that compiled before still compiles with the same model JSON.

## Capabilities

### New Capabilities
- `flow-svg-export`: manual layout geometry, route anchor rules, annotation rendering, themes, layout diagnostics and SVG portability for `flow` diagrams.
- `cli-export`: behaviour, outputs and exit codes of `studio export`.

### Modified Capabilities
- `flow-diagram-model`: element declarations gain `note` and `tag`; style and animate blocks accept several targets and the `line` property.
- `source-editing`: cascading removal keeps multi-target style and animate statements when other targets remain.

## Impact

- New packages `packages/layout` and `packages/render`; `@dac/cli` depends on both. No new runtime dependencies.
- `@dac/model` schema tables and `ElementKind` grow; the JSON format stays at version 0.1 (new kinds are new enum values).
- New diagnostic codes: `layout.missing-placement`, `layout.mode-unsupported`, `layout.unknown-theme`, `export.no-diagram`.
- `examples/` is a new top-level folder for real-world sheets; it is not part of the corpus and holds content provided by users, so it may be removed or kept private before publication.

## Non-goals

- Automatic or assisted layout: diagrams whose elements are not all placed are reported, not arranged.
- Text measurement: label widths are estimated from character counts; boxes with explicit `size` are exact.
- Icons, images, PNG, PDF, HTML catalog, animation playback, the `free` profile, theme files (`theme <id> { }`).
- Group-relative coordinates: `place` is always in diagram space in `flow` 0.2.
