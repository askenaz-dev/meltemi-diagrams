## 1. Language and layout

- [x] 1.1 Model: `ICON_POSITIONS` + `right`, `bottom`, `center`; `LABEL_POSITIONS`; `labelPosition` and `iconSize` (`auto` or 8..128, a keyword-or-number spec) in `STYLE_PROPERTIES` and `ELEMENT_ONLY_PROPERTIES`; `BOX_SHAPES` + `icon`; relations refuse the three; model tests and `corpus/invalid/prop.invalid-value.meltemi` (`iconSize 200`)
- [x] 1.2 Layout: `ResolvedStyle.labelPosition/iconSize`; icon placement `right` and `bottom` (mirrors), `center` (label band at the edge, icon centred and auto-sized, 120 × 120 default); `iconSize` numbers grow default sizes and clamp in written sizes; `layout.label-position-ignored`; tests per position and size
- [x] 1.3 Layout: `shape icon` in `shapes.ts` and `layout.ts` (icon-only drawing, optional frame, label outside at `labelPosition`, box = icon square, bounds = box + label for the engine, overlap checks, derived groups and the canvas size; audit treats the label as own text; `layout.icon-missing` with a placeholder); `LayoutResult` exposes the bounds the canvas needs; tests for the free-layout and flow-svg-export scenarios; messages en/es
- [x] 1.4 Acceptance: `corpus/acceptance/flow/icons.meltemi` and `free/icons.meltemi` (five positions, sizes, centred icons, icon shapes with labels on four sides, connected) with SVG and visual snapshots, zero warnings; the `shapes` sheets gain `icon`

## 2. Session and protocol

- [x] 2.1 `searchIcons`/`icons` (packs by name and keyword via `iconChoices`, libraries via `searchLibraries`, grouped, 60 at most, thumbnails, `pack:name` first, empty query → Technology's first category, none in sequence/C4); tokens; session tests
- [x] 2.2 Create with an icon and a placement (`create.icon` + `create.shape: "icon"` | box | `elementKind: "icon"` in free), empty label for shapes; `setIcon` batch for a selection; `removeIcon`; `ElementInfo.takesIcon` and `icon`; the host `pickIcon` request leaves the canvas protocol (image picking stays); playground and VS Code hosts updated; tests
- [x] 2.3 Inspector: Icon field (thumbnail, name, Choose…, Remove), Icon position (glyphs `iconPosition`), Label position (glyphs `labelPosition`, only when the icon is the centre piece), Icon size (range 8..128, drawn size greyed, **auto**, Clear); strip order; words en/es; inspector tests

## 3. Canvas

- [x] 3.1 Icon picker popover (`icon-picker.ts`): search with 80 ms debounce, grouped results with thumbnails, keyboard navigation, recent icons, `pack:name` first, placement control with pictures (kept per canvas), apply to the selection or arm the tool (ghost with the icon, Enter creates at the centre), I opens and closes, read-only refuses; words en/es
- [x] 3.2 Drops: picker results and library items dragged onto a node, decision, data store or box highlight it and write only its icon; onto empty space create with the placement; the Libraries panel gets the placement control and the "Libraries (U)" tooltip; context menu **Icon…** and **Remove icon**
- [x] 3.3 Glyph families `iconPosition` (five pictures) and `labelPosition` (four); the inspector's Icon field renders thumbnail, name and the two buttons; Icon size slider with **auto**; canvas messages tests
- [x] 3.4 Motion tokens in `canvas.css` and transitions for popovers and menus (picker, shapes grid, arrow and New diagram menus, context menu, head grids), side panels, tooltips (400 ms delay), drop/connect target outlines, the inline editor's outline, buttons and chips; `prefers-reduced-motion`; screenshots light/dark looked at
- [x] 3.5 Browser scenarios (webview and playground): I with a selection; icon as the shape and in a box from the tool; drop onto a box; Remove icon; library default `shape icon` and the In a box choice; inspector Icon position picture, Label position appearing with `center`, Icon size auto; menu transition present and absent under reduced motion; read-only

## 4. Documentation and gates

- [x] 4.1 Docs en/es: `docs/language/styles.md` (`iconPosition` values, `labelPosition`, `iconSize`), `free.md` (`shape icon`, centred icons, shapes table), `assets.md` (libraries panel placement, drops), `docs/editor.md` (icon tool and picker, drops, context menu, inspector fields, motion), skill references (`pnpm skills:sync`, `pnpm assist:guide`), CHANGELOG 1.8.0
- [x] 4.2 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm conformance`, `pnpm acceptance:visual`, `pnpm vscode:test-webview`, `pnpm playground:test-browser`, `pnpm vscode:test`
