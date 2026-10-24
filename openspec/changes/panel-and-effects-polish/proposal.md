## Why

Three things the owner met on 2026-10-23 make the playground and the effects feel unfinished,
and each has one cause in the code. The playground's three columns are one CSS grid driven by
`--explorer` and `--split` (`packages/playground/playground.css:368-377`); `split()` clamps the
code's share to 0.2..0.8 and stores `settings.split` (`packages/playground/src/shell.ts:574-581`),
the divider drags and takes the arrow keys (`583-607`), and nothing collapses the code pane, while
the explorer beside it already folds to a 36 px rail with one button, remembered in the settings
and toggled by Ctrl+B (`shell.ts:990-993`, `1557-1562`; `packages/playground/src/explorer/explorer.ts:255-262`).
The colour of a trace, a pulse or flow particles is a text box: `effectFields` emits
`effect.<e>.color` as a `color` field (`packages/editor/src/effects.ts:117-130`), but `withStrip`
gives theme swatches only to colour fields listed in `STRIP` (`packages/editor/src/inspector.ts:865-890`,
`924`), which names the four toggles and their durations and nothing else, so the canvas draws the
field with `field()` (`packages/canvas/src/inspector.ts:1047-1063`), which ends in `plainField`
and `fieldControl`'s `<input list="mdg-color-tokens">` (`138-202`, line `174`), never with the
`colorRow` of chips, native picker and inherit that fill and stroke get (`615-702`). Its
placeholder, `placeholders.linesColour` ("the line's", `effects.ts:128`), is stale besides: since
`export-defaults-and-visible-effects` (decision 0055) particles, halos and traces default to the
theme's `accent` (`packages/motion/src/plan.ts:123-131`, `docs/language/motion.md:34`). Last, the
settings of an effect are thrown at the end of the inspector: `Inspector.show` draws the strip as
its fields, then `effectsRow(toggles)`, then the speed fields (`packages/canvas/src/inspector.ts:823-840`),
and every non-strip field after it (`841-843`), so repeat, delay, direction, particles and colour
of each effect land after Label, Description, Layer and the rest, where the connection to the
toggle is lost. This change fixes the three. The owner finds a presentation mode low value: the
folded code plus the toolbar's Show the properties, Libraries and Layers toggles make the clean
stage, so none is added. Post-1.0 change, outside the roadmap
(`docs/roadmap-1.0.md`); it builds on `web-playground`, `project-explorer`,
`canvas-styling-and-themes`, `motion-effects`, `canvas-feel-and-naming` and
`export-defaults-and-visible-effects`.

## What Changes

- **A collapsible code pane in the playground.** A button at the right end of the code-path bar
  and a double click on the divider fold the code pane to a 36 px rail, modelled on the explorer's:
  one button that expands it, with the open file's error count beneath when there are errors.
  Ctrl+J (Cmd+J) toggles it from anywhere in the page; the state is kept with the page's settings
  beside `split`, and expanding restores the kept share. The grid columns move with the existing
  transition and the canvas keeps its viewport (no fit, no zoom). A reveal that asks for the focus
  (**Show in text** from the canvas's menus, go to definition, a problem's line, a quick fix)
  unfolds the pane; opening a file from the explorer and a canvas selection leave it folded.
  Narrow screens keep their Files, Code and Canvas tabs, where the rail never applies.
- **Effect colours as chip rows.** The colour of flow particles, a pulse and a trace is drawn with
  the same row as fill and stroke: the Theme chip, the effective theme's colour token chips with
  the colours it resolves them to, and the native picker. A chip writes `color accent`, the picker `color "#E8A33D"`, Theme removes the
  property; the placeholder is the `accent` token, so the row reads "accent (inherited)" and the
  picker starts at the theme's accent. `placeholders.linesColour` leaves the editor's words.
- **Effect settings with their effects.** Right under the Effects row, one card per effect that
  is on, headed by the effect's name as a disclosure button with the duration beside it (its input
  keeps its id and the theme's default greyed), holding repeat, delay, direction, particles and
  colour as they apply. The card of an effect just turned on opens; the others start closed;
  open and closed are kept per target for the canvas session, never persisted. The loose speed
  fields and the stray fields at the end of the inspector disappear. The editor marks every effect
  field for the strip with a `group` key, the toggle's name, so the canvas draws the cards without
  knowing the effects. A selection of several targets keeps toggles only, as today.
- **Documentation.** The editor guide (the strip, the effects) and the playground guide (the code
  pane, its keys) in English and Spanish, the changelog's 1.10.0 section, decision 0057.

## Non-goals

- The relation tool's changes and the text alignment picker of the strip belong to
  `lines-and-text-alignment`.
- The pointer tool of the toolbar belongs to `pointer-and-notes`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-playground`: a new requirement, "Collapsible code pane" (the rail, the bar button, the
  divider's double click, Ctrl+J, the kept state, the kept viewport, the narrow-screen tabs).
- `quick-styling`: new requirements "Effect colour rows" (the chips, picker and Theme for the
  colour of flow, pulse and trace, with `accent` as what applies) and "Effect cards in the strip"
  (one card per effect that is on under the Effects row, its header, its fields, its open state,
  its motion, toggles only for a selection).
- `motion-editing`: a new requirement, "Effect settings beside their toggles" (the fields of an
  effect are shown with its toggle, never after the target's other fields; the colour field names
  the theme's `accent` as its default).

## Impact

- `packages/editor`: `src/canvas/protocol.ts` (`InspectorField.group`), `src/inspector.ts`
  (`STRIP` as the style fields plus every field of each effect, `withStrip` marking the groups),
  `src/effects.ts` (the colour's placeholder `accent`), messages `en`/`es`
  (`placeholders.linesColour` removed); `test/strip.test.ts`, `test/effects.test.ts`,
  `test/messages.test.ts`.
- `packages/canvas`: `src/inspector.ts` (the cards, their pure helpers `effectCards`, `cardLabel`
  and `openCards`, the open state per target, `colorRow` for effect colours), `canvas.css` (the
  cards and their motion), messages `en`/`es` (`inspector.effectSettings`,
  `inspector.milliseconds`); `test/effects-row.test.ts`, `test/messages.test.ts`.
- `packages/playground`: `src/shell.ts` (the bar button, the rail, the divider's double click,
  Ctrl+J, `codeSettings`, the reveal that expands), `src/store.ts` (`Settings.code`), `src/ui.ts`
  (`ICONS.codePane`), `playground.css` (the rail column, the rail, the hidden divider, the
  narrow-screen scope), messages `en`/`es` (`code.show`, `code.hide`); `test/messages.test.ts`,
  `test/browser/run.ts`.
- `packages/vscode/test/webview/run.ts`: the effect cards and colour rows, the three-box
  selection, the Spanish words.
- `docs/editor.md`, `docs/es/editor.md`, `docs/playground.md`, `docs/es/playground.md`,
  `CHANGELOG.md`, `docs/decisions/0057-panel-and-effects-polish.md`.
