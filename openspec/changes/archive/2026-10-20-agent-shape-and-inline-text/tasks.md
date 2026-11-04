## 1. The agent shape

- [x] 1.1 Model: `BOX_SHAPES` gains `agent` after `person`; model tests (accepted on a node and a box, the unknown-shape list has 23)
- [x] 1.2 Layout: agent geometry in `shapes.ts` (outline path with head, eyes and antenna; polygon of body and head; 160 × 120 default; text area and centre in the body; magnets; clamps for 24 px); `BoxShape`; the shapes tests over every shape pass for `agent`; the free-layout scenario with a two-line label and a north end
- [x] 1.3 Editor and canvas: `SHAPES` mirror + `agent`; picture and names "agent" / "agente" in the grid and inspector; messages tests

## 2. Empty shapes and the inline editor

- [x] 2.1 Session: `create` writes an empty label for node, decision, data and box (palette, keys, grid, drop); text, note and tag keep their default text; groups keep "Group"; session tests
- [x] 2.2 Canvas: no label editor after creating a node, decision, data store or box; the editor still opens for text, note and tag
- [x] 2.3 Canvas inline editor: textarea with autocomplete, autocorrect, autocapitalize and spellcheck off; placed over the text area (inscribed area for shapes, body for person and agent, label pill or midpoint for relations); drawing's font, size × zoom, weight, colour and alignment; no background or border, a selection-coloured outline; drawn text hidden while open; grows with lines; Enter, Tab, click outside commit, Shift+Enter breaks a line (`\n`), Escape cancels; ids on one line; sequence notes, fragments and dividers use it too
- [x] 2.4 Browser scenarios: webview (empty box from B with no editor; double-click an empty hexagon, type, Enter; two lines with Shift+Enter; Escape; editor is a textarea with autocomplete off and sits inside the shape at the drawing's font size; agent from F + `agen`); playground scenario for creating an empty shape and adding text

## 3. Documentation and gates

- [x] 3.1 Docs en/es: `docs/language/free.md` shapes table (agent), `styles.md` shape list, `docs/editor.md` (empty shapes, the inline editor's keys), skill shape lists (`pnpm skills:sync`, `pnpm assist:guide`), CHANGELOG 1.8.0
- [x] 3.2 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm playground:test-browser`, `pnpm vscode:test`, `pnpm acceptance:visual`
