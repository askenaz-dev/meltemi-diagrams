## 1. Model

- [x] 1.1 Add the profile table (`FLOW_PROFILE`, `FREE_PROFILE`): kinds, shorthand kinds, block statements, diagram properties with defaults, style properties; free kinds in `RULE_KINDS`; `FREE_STYLE_PROPERTIES` (`shape`, `fontSize`, `fontWeight`, `textAlign`); drop `free` from the parse-only profiles
- [x] 1.2 Extend the types: `FlowDiagram.type` `"flow" | "free"`, `ElementKind` with the free kinds, `Element.layer`, `link`, `source` and their ranges, `Relation.layer`, `DiagramProperties.layers`, `FlowDiagram.links`, reference roles `layer` and `link`
- [x] 1.3 Make the analyser read the profile: free declarations and shorthand, `text`/`icon`/`image` sources, image path checks (`asset.outside-project`), flow kinds refused in free and free kinds in flow, `layers`, `layer` and `link` statements, `ref.unknown-layer`, free style properties refused in flow, `layout manual` default
- [x] 1.4 Resolve same-file links after every diagram is analysed (`ref.unknown-link`), leaving links through import bindings to the project
- [x] 1.5 Compile `free` diagrams in `compile`, with profile gating for `sequence` and `c4` only
- [x] 1.6 JSON: `type`, `layers`, element `layer`, `link`, `source`, relation `layer`; regenerate the model snapshots
- [x] 1.7 Unit tests for every scenario of `free-diagram-model`, profile gating and JSON

## 2. Assets and project

- [x] 2.1 Image readers in `@meltemi/diagrams-assets`: PNG, JPEG, GIF and WebP headers, SVG size and sanitising, data URIs, the 8 MB limit
- [x] 2.2 `Workspace.image(path)` with caching and invalidation, and the project checks `asset.unknown-image`, `asset.unsupported-image` and `asset.outside-project`
- [x] 2.3 Project resolution of links through import bindings (`ref.unknown-link` for unresolved ones)
- [x] 2.4 Tests for the `project-assets` scenarios and imported links

## 3. Layout and rendering

- [x] 3.1 Free frames: interior origins, derived group sizes, absolute places for the pipeline, `LayoutResult.origins`, `layout.missing-placement` for unplaced groups
- [x] 3.2 Sizes and drawing of boxes with shapes, text objects, icons and images; `fontSize`, `fontWeight`, `textAlign`
- [x] 3.3 Layers and paint order
- [x] 3.4 `LayoutOptions.images`, placeholders and `layout.image-unavailable`
- [x] 3.5 Image scene item and `<image>` rendering in `@meltemi/diagrams-render`
- [x] 3.6 Free diagrams in `auto` and `assisted` with ELK; composition checks on free diagrams
- [x] 3.7 Tests for every scenario of `free-layout` and `flow-svg-export`

## 4. Edit operations

- [x] 4.1 `createElement` with the free kinds and `source`, kind checks per profile
- [x] 4.2 `reorderElement`
- [x] 4.3 `setElementProperty` for `layer` and `link`, and `setElementSource`
- [x] 4.4 `arrange` with `writeGroups` and interior coordinates
- [x] 4.5 Links in `renameElement` (element and diagram renames) and `removeElement` (dependents and cascade)
- [x] 4.6 `convertToFree`
- [x] 4.7 Tests for the `source-editing` and `view-conversion` edit scenarios

## 5. Editor services and canvas

- [x] 5.1 Completion, hover, definition, tokens and quick fixes for free kinds, style properties, layers, links and image paths
- [x] 5.2 Session: interior coordinates for moves, nudges, creations, alignment, distribution, pastes, arrangements and group resizes; group moves write only the group
- [x] 5.3 Palette by profile, z-order commands and key bindings, Layer and Layers inspector fields, copy with drawn positions
- [x] 5.4 Conversion from the canvas session
- [x] 5.5 `ProjectSessions` passes the image resolver
- [x] 5.6 Tests for the `free-editor-tools` scenarios

## 6. VS Code and CLI

- [x] 6.1 Webview: free palette, z-order menu entries, Layer fields, conversion entry
- [x] 6.2 Extension: icon quick pick, image open dialog with the project check, **Convert to Free Composition** command, grammar and snippets for the free statements
- [x] 6.3 CLI `convert` command, and the image resolver in `export`, `validate` and `layout`
- [x] 6.4 Webview, VS Code and CLI tests

## 7. Corpus, docs and verification

- [x] 7.1 Move the free example to `corpus/valid/free/overview.meltemi`; add free sheets with groups, layers, icons, images and links, and converted views; invalid sheets for every new code; snapshots
- [x] 7.2 `docs/language/free.md`, the grammar, the diagnostics list, the editor guide, the README, decision 0018 and the skill (`pnpm skills:sync`)
- [x] 7.3 Run typecheck, lint, tests, licences, corpus validation, webview, VS Code and package tests; review the free SVGs and canvas screenshots
