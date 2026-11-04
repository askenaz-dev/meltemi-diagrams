## 1. Plain containers and stacks (layout and checks)

- [x] 1.1 `headerOf(group)` in `packages/layout/src/layout.ts` (padding when the label is `""` with no description and no styled icon): derived box, `origins`, ELK padding, title-band obstacle, `textNeeds` width 0; `freeFrames` takes the callback; layout tests for the untitled derived size and interior origin in free and flow
- [x] 1.2 Drawing: no title, icon, description or `titles` hole for untitled groups; `checkComposition` takes `headerOf` for `container-margin`; engine test that `ArrangeGroup.padding.top` is the padding for an untitled group
- [x] 1.3 Stack rule in `checks.ts`: a later box fully inside an earlier box of the same layer is not `layout.overlap`; partial intersection still is; layer test on the box-vs-group loop and on `connector-crossing`; containers of an end box are not crossed; tests in `engine.test.ts` and `free.test.ts`
- [x] 1.4 `obstaclesFor` excludes containers of an end box; `labelObstacles` excludes the empty band of untitled groups; `auditLabels` does not report a container's own text over its children; tests in `audit.test.ts`
- [x] 1.5 `convertToFree` and `packages/editor/src/session.ts` `interior()`/`arrange.ts` use the per-group header; `convertToFree` and `insertFragment` keep `layers` and `layer`; edit and editor tests
- [x] 1.6 Mermaid block importer writes the padding interior for untitled groups; regenerate the import snapshot
- [x] 1.7 Acceptance sheets `corpus/acceptance/flow/stacked.meltemi` and `free/stacked.meltemi` (nested untitled square groups, a sibling-box stack, a band on a back layer) with SVG and visual snapshots, zero warnings; `corpus/valid/free/stack.meltemi` with model and SVG snapshots

## 2. Corner radius

- [x] 2.1 `radius` in `STYLE_PROPERTIES` and `ELEMENT_ONLY_PROPERTIES`; relations refuse it; out of range is `prop.invalid-value`; plugin kind styles accept it; model tests and `corpus/invalid/prop.invalid-value.meltemi` with `radius 99`
- [x] 2.2 Layout: `ResolvedStyle.radius`; nodes, `rounded` boxes, notes, free frames and groups read it over the theme token, clamped to half the shorter side; `rectangle`/`square` stay 0 and `pill` half the shorter side; `withBounds` copies it; layout tests (box 2 px, group 0 px, halo follows)
- [x] 2.3 Inspector: `style.radius` number field with a `range` hint (slider beside the number) for boxes, nodes, notes and groups, placeholder from the theme; numeric coercion; labels en/es; strip placement after corners; `strip.test.ts` and canvas control test

## 3. Shapes in the language and the layout

- [x] 3.1 `BOX_SHAPES` with the sixteen new values; `shape` leaves `FREE_STYLE_PROPERTIES` and is accepted on flow `node`, refused on `decision`, `data`, `note`, `tag`, sequence and C4 with `prop.invalid-value` naming `node`; hint messages en/es; `ElementJson.shape`; model tests, the conformance fixtures (`corpus/valid/free/shapes.meltemi`, a flow sheet with `style api { shape hexagon }`, `shape` on a decision in `prop.invalid-value`) and the JSON snapshots
- [x] 3.2 `packages/layout/src/shapes.ts`: `SHAPE_SIZES` for every shape (square ones 120 × 120), outline builders (polygons through `polygonPath`; cloud, document, callout, arrow, framed, flag paths; details clamped by `min(w, h)`), `SHAPE_INSET`; `shapeOf` reads the style for `node`; `shape()` draws every value; layout tests per shape (path commands, default size)
- [x] 3.3 Text in the inscribed area: `textNeeds`, `defaultSize`, `checkOverflow` and `shape()` use `SHAPE_INSET`; `SceneBounds.inner` filled by `withBounds` and used by the audit's cut test; tests (a diamond's description no longer crosses the outline; `text-overflow` suggests a width at which the text fits)
- [x] 3.4 `onOutline` projection for every connector end (anchors, waypoint projections, percentage and named ports, lanes, engine ends, `snapEnd`, detour stubs); the crossing check uses the outline of shaped boxes; tests with a diamond (`north 5%`, `east 95%`) and an ellipse (`west 8%`) ending on the outline, and a connector through a diamond's empty corner not reported
- [x] 3.5 Importers: Mermaid flowchart and block shape maps, PlantUML keywords, coverage rows, en/es messages; regenerate `docs/import/*.md` and the `corpus/import` fixtures; import tests
- [x] 3.6 Acceptance sheets `corpus/acceptance/flow/shapes.meltemi` and `free/shapes.meltemi` (every shape, connected, pinned ends on a diamond and an ellipse) with SVG and visual snapshots, zero warnings

## 4. Shapes in the editor and the canvas

- [x] 4.1 `ElementInfo.shape`; `CanvasAction.create.shape` validated against `BOX_SHAPES`; `createElement.shape` writes `style <id> { shape <value> }` in the same edit (beside `icon`); edit, session and protocol tests
- [x] 4.2 Split Box/Node button: the main part creates the current shape and shows its picture, the arrow part (hidden when read-only) opens the picture grid of the twenty-two shapes; choosing one makes it current and arms the tool; B/N repeat it; per-shape ghost; announcements and words en/es; `view-only` command catalogue
- [x] 4.2b Key F opens the grid on flow and free diagrams: arrows move, typing filters by name (interface language and English), Enter creates the highlighted shape near the centre and makes it current, Escape closes; `CanvasCommand` `openShapes`, keys en/es; canvas and editor tests
- [x] 4.3 Glyph family `shape` drawn from the outline builders; family-aware `glyphName`; inspector Shape field with pictures and placeholder `rounded`, shown for boxes and flow nodes only; canvas messages tests for the new pictures in both languages
- [x] 4.4 Shape-aware canvas geometry: `elementAt`/attach/hover containment by outline, magnets (vertices and side midpoints, no corners on ellipses), border preview point on the outline, highlight as the outline; `routes.ts` and `canvas.test.ts` tests
- [x] 4.5 Completion and hover for the new shapes and `radius` in both profiles; playground completion scenario
- [x] 4.6 Split arrow button with the four kinds (`->`, `-->`, `<->`, `<-->`) and pictures; `create.relationKind` in the protocol and session; R arms the relation tool with the current kind and cycles it while armed, the status line and cursor badge name it, Shift on the second click still flips dashed; words en/es; canvas and session tests

## 5. Containers in the editor

- [x] 5.1 `moveElement` in `@meltemi/diagrams-edit` (cut with block and comments, re-indent, insert after the last declaration of the target, rewrite `place`, refuse own subtree and sequence/C4, implicit elements declared first, inverse exact); messages en/es; `operations.test.ts`, `plan.test.ts` and `corpus/edits/reparent-into-group`, `reparent-out-of-group`, `reparent-nested`, `reparent-blocked`
- [x] 5.2 Session: `move.parent` → `moveElement` + `setPosition` in the new interior in one batch (`GEOMETRY`); nudges never reparent; `create` passes `parent` for groups; refusal catalogues; `free.test.ts` scenarios (into, out, nested group from the palette, nudge keeps the parent)
- [x] 5.3 Canvas: one stack-under-point helper honouring hidden layers; drop target from the centre of the dragged selection, highlighted like the connect target; Alt keeps the parent; palette nests groups; `corpus/acceptance/edits/free-reparent.json`
- [x] 5.4 Select below: Alt+click cycles the stack in paint order, context-menu item, `nearestInDirection` prefers the nested shape; inspector Inside field mapped to `moveElement`; keys and words en/es; `selection.ts` tests
- [x] 5.5 Webview scenarios (`pnpm vscode:test-webview`): NESTED fixture; drag into and out of a group; Alt-drag keeps the parent; Alt+click selects below; palette nests a group; the Box button's grid creates a hexagon and B repeats it; F, `sta`, Enter creates a star; R twice then two clicks writes `-->`; Shape picture and Corner radius from the inspector; Spanish names; read-only hides the split arrows; playground browser scenario for the grid

## 6. Side fixes, documentation and release

- [x] 6.1 C4 kinds join `BOX_KINDS` in `checks.ts` (overlap-checked); `person` writable as a shape; corpus review for any new finding
- [x] 6.2 Docs en/es: `docs/language/free.md` (objects, shapes table, groups and interior, layers and stacks), `layout.md` (composition checks, engine), `styles.md` (`radius`, `shape`, tokens as defaults), `svg-export.md` (sizes, shapes, anchors), `grammar-0.2.md`, `diagnostics.md`, `model-json.md`, `docs/editor.md` (selection, gestures, palette, keys, layers, inspector), `docs/compatibility.md` (shapes row), import tracks
- [x] 6.3 Skill: `SKILL.md` rules and symptoms (stacks are not overlaps; untitled groups), `reference/free.md`, `layout.md`, `language.md`, `converting.md`, `themes.md`; `pnpm assist:guide`; `pnpm skills:sync`
- [x] 6.4 Decision `docs/decisions/0043-containers-shapes-and-corners.md` (narrows 0018, extends 0036 and 0038); CHANGELOG `## 1.8.0`; `pnpm release:version`
- [x] 6.5 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test` (snapshots reviewed with `pnpm test -u`), `pnpm acceptance:visual` reviewed then `--update`, `pnpm conformance`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package`, `pnpm playground:test-browser`, `pnpm mdg format --check examples skills corpus/projects/valid`, `pnpm licenses:inventory --check`, `pnpm mdg validate corpus/valid`
