## 1. Corner radius on every shape with corners

- [x] 1.1 `shapes.ts`: `rectangle`, `square` and `framed` draw `roundedRectPath(box, options.radius ?? 0)`; `roundPolygon(points, r)` (quadratic corners cut `min(r, half of each edge)`) for the polygon shapes when `options.radius > 0`, used by the path and by the silhouette (8 samples per corner); vertices for magnets on the curves' midpoints; tests: unchanged paths without radius, rounded square and hexagon paths, `onOutline` and `pointInShape` on a rounded diamond, magnets on the curves
- [x] 1.2 `layout.ts` `shapeOptions`: the resolved `style.radius` for cornered shapes and decisions, and in place of the default body radius for persons and agents; tests: a square node with `radius 12`, a decision with `radius 8`, a circle with `radius 12` unchanged, a connector meeting a rounded diamond on its curve
- [x] 1.3 Inspector: Corner radius shown for the cornered shapes, decisions, persons and agents with the drawn radius greyed (0, the theme's, the body radius); hidden for ellipse, circle, pill, cylinder, cloud and document; tests on the inspector model

## 2. Rotation in the language

- [x] 2.1 `schema.ts`: `rotation` (0 to 360) in `STYLE_PROPERTIES` and `ELEMENT_ONLY_PROPERTIES`; `flow.ts`: per-target refusal on groups (`rotationRefusal`); `style-values.ts`: profile refusal in sequence and C4; messages en/es; tests for the scenarios of `style-classes-and-rules` (rule, group, sequence, out of range)
- [x] 2.2 Completion and hover of `rotation` in the editor's language services; tests

## 3. Turned drawing, routing, engine and checks

- [x] 3.1 `shapes.ts`: `turnPoint`, `turnedOutline(shape, box, options, degrees)` and `onPolygon(points, point, side)` exported (and from the `shapes` subpath); tests
- [x] 3.2 `layout.ts`: rotations from styles (0 and 360 none, groups none); drawn boxes after the constraints; element groups get `transform="rotate(...)"` in scene coordinates (shifted with the scene offset); `LayoutResult.rotations`; group derived boxes, label obstacles, canvas size and checks from drawn boxes; tests for "Turned node", "Turned free box in its group", "Not turned at 360", the SVG transform
- [x] 3.3 Connector ends: `ConnectorEnd.named.point`; free ends routed on the drawn box and projected onto the turned outline; named and pinned ends turned, with the side chosen by the turned normal; tests for the three `connector-routing` scenarios
- [x] 3.4 Engine: `arrangeRequest` sizes from drawn boxes; `placeAround` compares drawn boxes; tests for the two `layout-modes` scenarios
- [x] 3.5 Composition checks with drawn boxes; tests for the two `composition-checks` scenarios
- [x] 3.6 Corpus: `corpus/valid/free/turned.meltemi` and `corpus/valid/flow/rounded-shapes.meltemi` with SVG and model snapshots; regenerate and review any snapshot that changes

## 4. Editor

- [x] 4.1 `ElementInfo.rotation` and `ElementInfo.radius` in the render info; `stackAt`/`dropTarget` turn the point into the element's frame; `routes.ts` magnets, `attachEnd` and pinned points take the rotation (`toLocal`/`toDiagram` helpers); tests
- [x] 4.2 Inspector: the Rotation field (`style.rotation`, number with a 0–359 slider, 0 greyed) in the strip and the element fields for the kinds that take it; `setField` writes it and removes it at 0; tests
- [x] 4.3 Session: the context menu's Rotate 90° and Reset rotation as `setField` actions from the canvas (no new protocol action); resize of a turned element arrives as a `resize` with the box computed by the canvas; tests on the session for rotation writes

## 5. Canvas

- [x] 5.1 Turned overlays: selection frame, resize handles and connection handles in a `rotate()` group; hover outline, magnets and border points turned; marquee and guides by drawn box; inline editor textarea turned with CSS
- [x] 5.2 Rotation handle and the `rotate` drag: bearing, 15° snapping, Alt for free angles, status and badge, live turn of the element group and its selection, release writes `setField style.rotation`, Escape cancels; motion: fade-in, ease to the written angle, reduced motion
- [x] 5.3 Resize of a turned element in its own frame (opposite edge fixed, no grid snapping)
- [x] 5.4 Context menu: Rotate 90° and Reset rotation; messages en/es (rotation field label, handle tooltip, status, menu items)
- [x] 5.5 Webview tests: rotate with the handle (status, live drawing, one undo step), Alt for 37°, Escape restores, select by turned outline, resize a turned element, pin an end on a turned element, Rotate 90° from the menu, no handle on a group or read-only, corner radius slider on a hexagon, Rotation from the strip; screenshots of the handle and a turned element

## 6. Docs, decision, changelog, gates

- [x] 6.1 `docs/language/styles.md`, `layout.md`, `free.md` and the Spanish versions: `radius` on every cornered shape, `rotation`
- [x] 6.2 `docs/editor.md` and `docs/es/editor.md`: the rotation handle, the Rotation and Corner radius fields, the context menu, turned elements on the canvas
- [x] 6.3 The skill's references and `pnpm skills:sync`; decision 0045; CHANGELOG 1.8.0
- [x] 6.4 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm player:test-browser`; `openspec validate rotation-and-corner-radius`
