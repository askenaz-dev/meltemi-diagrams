## 1. Edit and session

- [x] 1.1 `createDiagram` in `@meltemi/diagrams-edit` (types, plan dispatch, header for empty files, next free id, title, refusals, inverse); messages en/es; `operations.test.ts` scenarios
- [x] 1.2 Session: canvas action `createDiagram` (validated), shows the new diagram; `empty` message gains `creatable` (none in story mode); session tests
- [x] 1.3 Inspector Canvas group (fit, document, slide, custom with width and height 100..10000) writing `preset` or `canvas` and removing the other in one batch; words en/es; inspector tests
- [x] 1.4 Session dry run: canvas message `preview { token, action }` for move and resize in flow, free and C4; plan as on drop, apply to a copy, analyse with the same context, lay out and answer `{ type: "preview", token, svg }` (null when refused or with errors); no history, revision or other messages; protocol validation; session tests (connector moved in the svg, text and revision unchanged, refused gives null)

## 2. Canvas

- [x] 2.1 Empty state: buttons per creatable kind (hidden when read-only), clearing selector, inspector, minimap and badges on `empty`; New diagram button and menu beside the selector; words en/es
- [x] 2.2 Split buttons: shared outline, 18 px arrow part with a chevron SVG at full contrast, hover and focus states, tooltips with keys en/es; right-click and 450 ms press on the main part open the menu, a short click arms the tool
- [x] 2.3 Live preview client: one preview in flight, latest gesture first, swap the stage SVG, keep dragged boxes under the pointer, overlay unchanged, Escape or refusal restores the last drawing, stale tokens ignored; move and resize
- [x] 2.4 Webview scenarios (`pnpm vscode:test-webview`): empty file → Flow diagram button; stale state cleared; New diagram menu; Canvas field slide and custom; long press opens the shapes grid and a click arms; a connector follows a dragged box before release and Escape restores; playground browser scenario for the empty file

## 3. Documentation and gates

- [x] 3.1 `docs/editor.md` and `docs/es/editor.md` (empty file, New diagram, Canvas field, split buttons, live preview); CHANGELOG 1.8.0 Canvas lines
- [x] 3.2 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm playground:test-browser`, `pnpm vscode:test`
