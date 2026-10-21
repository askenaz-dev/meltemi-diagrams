## 1. Engine: bands, container sizes, group boxes

- [x] 1.1 `@meltemi/diagrams-layout`: `ArrangeRequest.groups[].minimum` and `Arrangement.groups` in `engine.ts`; `arrangeRequest` passes the written `size` of a placed group with children as `minimum`; a test on the request
- [x] 1.2 `@meltemi/diagrams-layout-elk`: the four size options on compound nodes with a minimum, `collect` records every container's box, `Arrangement.groups` returned; a test with the 238 × 196 container holding a 160 × 64 box (the pinned build honours the minimum, or the padding pass is implemented and tested, at most one extra pass)
- [x] 1.3 `layoutDrawing`: the `bands` set in every mode; a band is drawn at its place and size in `auto`, left out of the request, and its `place` is not the first ignored placement; the `auto` box of a group with a minimum is the engine's box; tests: a childless placed and sized group in `auto` draws without diagnostics, a sized container holds its size after an `auto` layout, an unsized group still fits its children
- [x] 1.4 `checks.ts`: export `stacked` for hosts; a test that the export matches the overlap rule

## 2. Lanes per side

- [x] 2.1 `routing.ts` / `layout.ts`: `sideLanes` replacing `parallelLanes`: sides from a first pass of `anchorPoints`, groups by (box, side) of free ends, ordering by the other anchor's coordinate, 16 px or the label rule, clamped; pinned ends and engine routes untouched; detours still require lane 0
- [x] 2.2 Tests: two parallel relations unchanged (16 px, symmetric); two relations into `client.north` from left and right end 16 px apart in the right order with no `layout.connector-overlap`; a pinned end stays at its percentage; an `auto` diagram with engine routes draws as before
- [x] 2.3 Regenerate the SVG and visual snapshots that change (files with several free ends on one side) and review them

## 3. Recompute keeps the picture

- [x] 3.1 `@meltemi/diagrams-edit`: `arrange.routes` in `types.ts`; with scope `all`, after freeing the ends, write `route <id> from <a> to <b> via [...]` for relations with bends (rounded, ends free, named ports kept), replacing or adding the statement; name anonymous relations first in the same plan; tests for the three scenarios of `layout-actions` (bends written, anonymous relation named, straight routes removed) and the inverse
- [x] 3.2 `@meltemi/diagrams-editor` `arrangeOperation`: pass `result.connectors` as `routes` for scope `all`, the engine's group boxes in `sizes`, and return the first layout error with the `undefined` result; tests on the owner's sheet (`db` stacked on `node3`, the back edge `db -> client`) that the operation carries bends for the back edge
- [x] 3.3 CLI: `layout --all` test that an `auto` diagram with a back edge and a label exported before and after has the same bends per connector within 1 px, and that the file holds the `via` lists; `--check` unchanged
- [x] 3.4 Regenerate the corpus snapshots of files arranged with `--all` (they gain `via` lists) and review them

## 4. Conversion to a container

- [x] 4.1 `@meltemi/diagrams-edit`: `convertToContainer` in `types.ts`, `structure.ts` and `plan.ts`: the group block in place with label and description, children moved with `moveElement` semantics and their `at`, styles kept without `shape` (`square`/`rectangle` → `radius 0`, empty statements removed), `size` kept or written, refusals (`edit.unsafe-target` kinds, sequence and C4, bad children; `edit.has-dependents` for ports) with messages in English and Spanish
- [x] 4.2 Tests and fixtures: the flow square with `db` (`corpus/edits/convert-container-flow`), the free box with a child `at` and a written size, the ports refusal, the bad child refusal, the inverse; the plan compiles and `db -> client` still resolves
- [x] 4.3 `@meltemi/diagrams-editor` session: action `convertToContainer { id }` computing children with `stacked` (same layer, declared after), free `at` from the new interior, `size` from the box; status message naming the container and its children; the stack hint after a drop (status only); the refused-arrange status; tests on the session
- [x] 4.4 Inspector: the **Convert to container** button under **Inside** for flow nodes and free boxes; a test on the inspector model

## 5. The container on the palette

- [x] 5.1 Editor protocol and canvas: `container` palette kind creating a group with label `""`, `at` and `size`, selected without the label editor; the group button as a split button with the Group and Container entries and pictures; G creates the current kind; Alt+G unchanged; context menu entry **Convert to container** on nodes and boxes; messages en/es
- [x] 5.2 Webview tests: create a container from the menu and with G (text, selection, no editor), convert the square with the database on it (text, status, dragging the container moves the database), the stack hint after a drop, the refused-arrange status
- [x] 5.3 Run `pnpm vscode:test-webview` and the canvas unit tests

## 6. Docs, decision, changelog

- [x] 6.1 `docs/editor.md` and `docs/es/editor.md`: the split group button and the container, Convert to container, the stack hint, Recompute writes bends and bands stay, the refused-arrange message, the keyboard table (G creates the current kind)
- [x] 6.2 `docs/language/layout.md`, `svg-export.md` and the Spanish versions: bands in `auto`, a written group size as a minimum, `--all` writes bends and keeps the connectors, lanes per side replacing parallel lanes
- [x] 6.3 The skill's layout and editor references and `pnpm skills:sync`
- [x] 6.4 `docs/decisions/0044-containers-from-the-canvas-and-arrangements-that-keep-the-picture.md`; CHANGELOG 1.8.0 entries (language unchanged)
- [x] 6.5 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm player:test-browser`; `openspec validate --change containers-and-arrange-routes`
