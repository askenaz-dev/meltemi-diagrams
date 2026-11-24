# Tasks

## 1. White space drawn as written

- [x] 1.1 Check that `xml:space="preserve"` on `<text>` keeps leading and repeated spaces in Edge, in the PDF it prints and in resvg (the MCP preview's rasteriser), with a hand-edited SVG of the owner's fragment; record the three results in `docs/decisions/0078-code-block-notes.md` (D1). Verified by the three images showing the second line indented.
- [x] 1.2 In `packages/render/src/svg.ts`, write `xml:space="preserve"` on a `<text>` whose text starts or ends with a space or holds two consecutive spaces, and on no other; add cases to `packages/render/test/svg.test.ts` (indented line, aligned columns, a text without such spaces). Verified by `pnpm vitest run packages/render` with every stored snapshot unchanged.
- [x] 1.3 Add a render test that the first glyph after leading spaces starts at the same x under `system`, `embedded` and `outlined` (`packages/render/test/text-fonts.test.ts`). Verified by the test passing.
- [x] 1.4 Export a free sheet with three notes (the owner's fragment in the body font, the same in `font "Cascadia Mono"` with a `fill`, and the two lines `a      = 1` and `longer = 2`) to SVG and PNG with `pnpm mdg export` and confirm each keeps its spaces. Verified by looking at the PNG.
- [x] 1.5 Document the rule in `docs/language/svg-export.md` and its Spanish copy, and add the `CHANGELOG.md` entry under Unreleased. Verified by the docs tests in `pnpm test`.

## 2. Tab stops

- [x] 2.1 Add `expandTabs(line)` (four-character stops) to `packages/layout/src/text.ts`, export it from the package, and unit-test it (tab at column 0, mid-line, several tabs, no tab returns the same string). Verified by `pnpm vitest run packages/layout/test/measure.test.ts`.
- [x] 2.2 Use the expanded line wherever a label's lines are measured or placed in `layout.ts` and `sequence.ts`, so `TextItem.text` holds no tab; add layout tests that a tabbed note has the width of its expanded lines and reports no `layout.unmeasured-font`. Verified by `pnpm vitest run packages/layout`.
- [x] 2.3 Make `drawnLines` in `packages/canvas/src/inline.ts` compare against `expandTabs` of each line, with a unit test for a tabbed label. Verified by `pnpm vitest run packages/canvas`.
- [x] 2.4 Document tab stops beside the white-space rule in `docs/language/svg-export.md` and its Spanish copy. Verified by the docs tests.

## 3. The `textFormat` property and the code tokens

- [x] 3.1 Add `textFormat` (`plain`, `code`) to the style properties in `packages/model/src/schema.ts` for the four profiles that have notes, with the target check (notes only, `prop.invalid-value` and its hint elsewhere, ignored from a class) and its English and Spanish messages. Verified by new cases in the model tests for a style, a class, a rule, a box target, a gantt target and an unknown value.
- [x] 3.2 Carry `textFormat` in the style entry of the model JSON and add it to `docs/language/model-json.md`. Verified by a JSON round-trip test.
- [x] 3.3 Add the `code` and `codeText` tokens to the theme table (`schema.ts`), to `Theme` and every built-in theme in `packages/layout/src/theme.ts`, and to the `prop.unknown` hint. Verified by `packages/layout/test/themes.test.ts` cases for a built-in light and dark theme, an extending theme and an invalid value.
- [x] 3.4 Resolve `textFormat` in `packages/layout/src/styles.ts` (`ResolvedStyle`) for elements and sequence events, with precedence tests (rule, class, style, `plain` over a rule). Verified by `packages/layout/test/styles.test.ts`.
- [x] 3.5 Document the property in `docs/language/styles.md` and the tokens in the themes section, with Spanish copies, and add a conformance case under the corpus `pnpm conformance` reads. Verified by `pnpm conformance` and the docs tests.

## 4. Code notes are drawn

- [x] 4.1 Draw a code note in `layout.ts` for flow, free and C4: mono role, panel rect, insets, default colours, and the default size from the text plus insets; tests in `packages/layout/test/notes.test.ts` for the seven-line fragment under `technical.light` (rect, seven items, x offsets, size). Verified by `pnpm vitest run packages/layout/test/notes.test.ts`.
- [x] 4.2 Apply written `font`, `fontSize`, `fontWeight`, `color`, `fill`, `stroke`, `width`, `line`, `radius`, `icon` and (free) `textAlign` to the block, with tests for each override. Verified by the same test file.
- [x] 4.3 Keep a written `size`: clip the text items to the panel inside its insets and report `layout.text-overflow` on the `size` with the needed size; test a too-small size and a turned, clipped note (`rotation.test.ts`). Verified by `pnpm vitest run packages/layout`.
- [x] 4.4 Draw a code note of a sequence diagram in `sequence.ts` (folded corner kept, `code` fill, `codeText` text, mono role), with a test in `packages/layout/test/sequence.test.ts`. Verified by that test.
- [x] 4.5 Check attachments, layers, effects and the label audit on a code note (leader to `on <element>`, exclusion from `layout.label-overlap`) with tests beside the existing note cases. Verified by `pnpm vitest run packages/layout`.
- [x] 4.6 Export the owner's fragment as a code note to SVG (three font policies), PNG and PDF and compare the indentation; add a visual baseline to `pnpm acceptance:visual`; the MCP preview starts each `font-family` list with a family resvg holds, so code is drawn in Cascadia Mono there too. Verified by the visual run and by looking at the three images.
- [x] 4.7 Document code notes in `docs/language/free.md`, `sequence.md`, `c4.md` and the flow reference, with Spanish copies; the acceptance sheet `free/code` of 4.6 is the example (the gallery keeps one sheet per profile). Verified by the docs tests.

## 5. Editor services and operations

- [x] 5.1 Let the create operation of `packages/edit` write a note with `textFormat code` (declaration, `place`, `style`) as one edit, with a test in the edit package's operations tests. Verified by `pnpm vitest run packages/edit`.
- [x] 5.2 Add the `style.textFormat` inspector field in `packages/editor/src/inspector.ts` (notes only, before `style.font` in `STRIP`), the removal of the property for **Plain text** and the `textFormat plain` write when a class or rule makes the note code. Verified by new cases in the editor's inspector tests.
- [x] 5.3 Report the theme's mono family as the effective font of a code note in `packages/editor/src/fonts.ts`, and give its text place the insets, the mono stack and `format: "code"` (`text-places.ts`, `TextPlace` in `canvas/protocol.ts`). Verified by editor tests of the font field and of the place of a code note.
- [x] 5.4 Add `copyText { id }` to the canvas protocol and answer it in `session.ts` with the note's label on `clipboard` and a status message; allow it on view-only sessions. Verified by a session test for an element note, a sequence note, a plain note (refused) and a read-only session.
- [x] 5.5 Completion and hover for `textFormat` and its values in `services/completion.ts`, `services/hover.ts` and `messages/services.ts` (English and Spanish), and the "Code" token group in `themes.ts`. Verified by the language-service tests, including that a box's style block is not offered the property.
- [x] 5.6 Keep the format through copy and paste of a fragment, duplicate and `convert --to free`. Verified by a clipboard test and a conversion test.

## 6. Canvas

- [x] 6.1 Show **Format** first in the Text category (`property-tabs.ts` `TEXT`, words in `messages/en.ts` and `messages/es.ts`) and wire its two choices. Verified by a webview scenario: select a note, open Text, choose **Code** and **Plain text**, and compare the text of the document.
- [x] 6.2 Split the note button on flow, free and C4 palettes with the **Note** and **Code block** menu (click, right-click, held press, drag onto the canvas), creating the block in one edit and opening its editor with the word selected. Verified by webview scenarios for the menu, the drop, the undo step and the hidden button on sequence and read-only canvases.
- [x] 6.3 Give `InlineEditor` its code keys behind `InlineOptions` (Enter with auto-indent, Tab, Shift+Tab, the indentation unit, Ctrl+Enter, Escape), `tab-size: 4` in `canvas.css`, and the keys in `aria-description`; unit-test the indentation unit and the line edits as pure functions. Verified by `pnpm vitest run packages/canvas`.
- [x] 6.4 Place the editor of a code note inside the panel's insets in the mono font. Verified by a webview scenario that compares the editor's first line box with the drawn first line (within 1 px) at 100 % and 200 % zoom.
- [x] 6.5 Add **Copy code** to the flow and free, C4, sequence and read-only context menus for exactly one selected code note. Verified by webview scenarios that read the clipboard after the item, on an editing and on a read-only canvas, and that a plain note has no item.
- [x] 6.6 Add playground browser scenarios for the whole path: **Code block**, paste the fragment, Ctrl+Enter, reload the project, **Copy code**, and compare the clipboard with the fragment. Verified by `pnpm playground:test-browser`.
- [x] 6.7 Check the block, the menu and the editor in the light and dark canvas themes, with the menu's open and close transitions matching the other split buttons, and keep the screenshots for the QA note of 9.4. Verified by looking at the screenshots.
- [x] 6.8 Document the canvas side in `docs/editor.md` and `docs/es/editor.md` (note tool menu, Format, keys in a code note, Copy code). Verified by the docs tests.

## 7. Viewers

- [x] 7.1 Carry the text format of elements and the code notes of sequence drawings in the viewer data the exports write. Verified by an exports test that reads the data of a flow and a sequence drawing.
- [x] 7.2 Show the preformatted block and **Copy code** in the detail panel of `packages/player`, with the live-region announcement and the selection fallback when the clipboard is refused. Verified by `pnpm player:test-browser` scenarios for a copy, a long line and a refused clipboard.
- [x] 7.3 Make a code note of a sequence drawing selectable by pointer and arrow keys in the viewer. Verified by a player browser scenario.
- [x] 7.4 Run the catalog's browser suite with a drawing that holds a code note. Verified by `pnpm catalog:test-browser`.
- [x] 7.5 Document the panel in `docs/player.md` and its Spanish copy. Verified by the docs tests.

## 8. Skill, agents guide and decision note

- [x] 8.1 Add code notes to `skills/meltemi-diagrams/reference/free.md`, `sequence.md`, `c4.md`, `language.md` and the themes reference, with the rule against Markdown fences, no-break spaces and a hand-set `font`. Verified by the skill tests in `packages/render/test/skills.test.ts`, extended to fail when `textFormat` is missing.
- [x] 8.2 Run `pnpm skills:sync` and add the paragraph to `docs/agents.md` and `docs/es/agents.md`. Verified by the sync test and the docs tests.
- [x] 8.3 Draw the owner's fragment through the local MCP (`write_files`, `validate`, `preview`) and check the preview image shows the indentation. Verified by the preview PNG.
- [x] 8.4 Complete decision note `docs/decisions/0078-code-block-notes.md` with decisions D1 to D12 as built, linked from the QA note of 9.4 (the decisions folder has no index). Verified by the docs link check.

## 9. Integration

- [x] 9.1 Run `pnpm typecheck`, `pnpm lint` and `pnpm test`. Verified by the three passing.
- [x] 9.2 Run `pnpm vscode:test-webview`, `pnpm playground:test-browser`, `pnpm player:test-browser` and `pnpm catalog:test-browser`. Verified by the four passing.
- [x] 9.3 Run `pnpm acceptance:visual` and review every baseline that changed because of preserved spaces, accepting each one by one. Verified by the visual run passing with the reviewed baselines.
- [x] 9.4 Walk the five acceptance criteria of the request on the web playground with the owner's fragment (create and paste, Format above Font and back, save, reopen, preview, SVG and PNG, copy back into an editor, a project saved before the change). Verified by a QA note under `docs/quality/` with the result of each criterion.
