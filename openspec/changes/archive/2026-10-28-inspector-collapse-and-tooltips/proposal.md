## Why

The owner asked on 2026-10-27 that "el panel de la derecha" be collapsible like the rest, with
icons that differ and tooltips that say what they do. The panel in the screenshot (DIAGRAM TEST,
Theme, Title, Description, Number messages from, Canvas) is not a pane of the playground: it is the
canvas package's `Inspector`, an `aside.panel.inspector` (`packages/canvas/src/inspector.ts:1029-1034`)
that `CanvasApp` appends as the third column of its own `.main` grid (`packages/canvas/src/app.ts:666-673`;
`grid-template-columns: auto 1fr auto`, `packages/canvas/canvas.css:205-210`), inside the
playground's canvas pane (`#app` fills `.canvas-pane`, `packages/playground/playground.css:407-411`;
`mountCanvas` at `packages/playground/src/shell.ts:551-571`), and it is none of the page's five
grid columns (`playground.css:368-377`). It is 260 px wide, fixed (`canvas.css:897-904`).
`Inspector.show` draws an `h2` and the fields (`inspector.ts:1088-1090`): no header row, no fold
button, no rail; the only panel head with a control is the theme panel's `panel-head` with its
Done button (`inspector.ts:1511-1522`). The one way to put the inspector away is the toolbar's
toggle "Show the properties" (`app.ts:3438-3441`; `packages/canvas/src/messages/en.ts:110`,
`es.ts:178`), a frame glyph among the grid, snap, minimap, layers and libraries toggles
(`app.ts:3424-3452`), out of the screenshot's crop (which shows only the `sequence` badge), with no
key, and with the same picture as the code pane's fold button (`packages/canvas/src/dom.ts:89`
against `packages/playground/src/ui.ts:29`). It flips `PersistedState.inspector` through
`persist()` (`app.ts:119`, `1458-1461`); `showInspector` reads the kept value with the host's
`CanvasSettings.inspector` as the default (`app.ts:1472-1474`, `422-429`;
`packages/playground/src/canvas-settings.ts:4-11`; VS Code's `meltemi.canvas.inspector`,
`packages/vscode/package.json:400-404`); and `syncToggles` hides the panel with `hidden`
(display none, `canvas.css:906-908`) when it is off, when the theme panel is open or when there
is no diagram (`app.ts:3896-3917`, lines 3910-3911). A hidden panel leaves no trace, and the way
back is the same unlabelled toggle. The two panes that do fold "like the rest" are the
playground's: the explorer folds to a 36 px rail from a button in its head and comes back from
the rail's button, with Ctrl+B page-wide and the fold kept with the settings
(`packages/playground/src/explorer/explorer.ts:122-125`, `183`, `191`, `238-262`;
`shell.ts:1024-1034`, `1644-1649`; `playground.css:861-931`), and the code pane folds the same
way with Ctrl+J (`shell.ts:139-140`, `494-511`, `613-640`, `1658-1666`; `playground.css:798-857`;
decision 0057). The canvas keymap binds L, U and K to the layers, the libraries and the pointer
(`packages/editor/src/canvas/keyboard.ts:178-181`) and nothing to the inspector. Persistence needs
nothing new: the playground keeps the canvas's whole `PersistedState` under `settings.canvas`
(`shell.ts:564-570`; `packages/playground/src/store.ts:29`) and VS Code keeps it in the webview's
state (`packages/vscode/src/webview/main.ts:20-21`), so a fold made in either host already survives
a reload once it is the same kept boolean.

Tooltips differ by region. The canvas draws its own bubble, `Tooltips`: a control's `title`,
shown after 400 ms and fading in, the title kept aside in `data-tip` while the pointer rests
(`packages/canvas/src/tooltip.ts:1-89`; mounted at `app.ts:653` and `690`; styles
`canvas.css:2733-2769`), and every toolbar button gets `aria-label` = its label and `title` = the
label plus the key in parentheses from `button()` (`app.ts:3169-3182`). The playground has no
bubble: `iconButton` sets `title` and, for icon-only buttons, `aria-label`
(`packages/playground/src/ui.ts:39-54`), so the header's Undo, Redo, Format, theme switch and
About (`shell.ts:184-185`, `382`, `401-409`), the explorer's bar (`explorer.ts:116-134`) and the
code bar's buttons show the browser's slow native tooltip, although the page links `canvas.css`
already (`packages/playground/index.html:14`) and `Tooltips` is simply not exported
(`packages/canvas/src/index.ts:1-4`). Keys in names are inconsistent: `toolbar.layers` bakes
"(L)" into the accessible name (`en.ts:111`) while the libraries and pointer toggles pass the key
to `button()` (`app.ts:3417-3423`, `3446-3452`); the header's Format bakes "(Shift+Alt+F)" in
(`packages/playground/src/messages/en.ts:33`), and the explorer's and the code's fold words carry
their chords in the name (`explorer-en.ts:16-17`, `en.ts:213-214`); the palette's titles say the
key twice, "Node: click on the canvas, or press N (N)" (`app.ts:3263-3268` with `palette.hint`,
`en.ts:165`; the icon tool's likewise, `app.ts:3250-3255` with `palette.icon`, `en.ts:172`); the
split arrows carry their key in the accessible name, "More shapes (F)", "Kinds of arrow (R
cycles)", "Group or container (G)" (`en.ts:81-85`; `app.ts:3618`, `3637`, `3658`); the theme switch
is named "Switch light and dark" whichever way it will switch (`shell.ts:401-407`, `en.ts:39`); and
the menus already state keys to assistive technology with `aria-keyshortcuts`
(`packages/playground/src/menu.ts:58`), which no button does. The three pane
glyphs are near-identical frames with one vertical line: the explorer's `sidebar`
(`packages/playground/src/explorer/icons.ts:28`), the code pane's `codePane` (`ui.ts:29`) and the
toolbar's `inspector` (`dom.ts:89`). This change gives the inspector a header button, a rail and a
page-wide chord, all one kept state with the toolbar's toggle, and one tooltip rule with distinct
glyphs for every icon-only control of the canvas and the page. Post-1.0 change, outside the
roadmap (`docs/roadmap-1.0.md`); it builds on `web-playground`, `project-explorer`,
`panel-and-effects-polish`, `canvas-feel-and-naming` and `pointer-and-notes`.

## What Changes

- **The inspector folds to a rail, in the canvas.** The panel gets a header row, its title and a
  fold button (**Hide the properties panel**, `aria-expanded`, `aria-controls`); folded, the panel
  is a 36 px rail holding one button (**Show the properties panel**) that unfolds it, as the
  explorer's and the code pane's rails do. The header button, the rail's button and the toolbar's
  "Show the properties" toggle flip the one kept state, `PersistedState.inspector`, so the toggle's
  `aria-pressed` and the panel always agree, in VS Code and in the playground alike, on read-only
  canvases too (nothing is written to the document). The theme panel folds with the inspector and
  comes back when it unfolds, with the same fold button in its head. There is no rail without a
  diagram or while a story plays. Folding from inside the panel moves the focus to the rail's
  button; unfolding puts it on the panel. The panel's width moves on the canvas's slow motion
  token and the rail fades in after it, none of it under reduced motion; the canvas keeps its
  viewport as the stage grows or shrinks. A kept value that is not a boolean reads as the host's
  default. VS Code's `meltemi.canvas.inspector` stays the default the fold overrides, never written.
- **A page chord in the playground.** Ctrl+Alt+B (Cmd+Alt+B) folds or unfolds the properties from
  anywhere in the page under the same guards as Ctrl+B and Ctrl+J, through a new public
  `CanvasApp.setInspectorCollapsed(collapsed)`; the page names the chord to the canvas
  (`CanvasHostApi.keys`), so the toolbar's toggle and the panel's buttons read "(Ctrl+Alt+B)" in
  their tooltips in the playground and nothing in VS Code, whose workbench owns that chord. A first
  visit on a window narrower than 1100 px starts with the rail, as the explorer does; a kept choice
  wins. On a narrow screen the canvas tab shows the panel or the rail as kept.
- **One tooltip rule for every icon-only control.** On the canvas and on the page: the accessible
  name says what the control does, without the key; the `title` is the name plus the key in
  parentheses when it has one; `aria-keyshortcuts` carries the key for assistive technology; a
  toggle keeps one name and `aria-pressed`, except a control whose effect flips (the theme switch
  is "Switch to the dark theme" or "Switch to the light theme"); the palette's titles say the key
  once ("Node (N)", "Icon (I)"); and the canvas's `Tooltips` bubble, exported and scoped, draws the
  page's tooltips too, so the header, the explorer's bar and the code bar show the same bubble
  after 400 ms as the toolbar. Nine existing names lose their keys ("Show the layers", "Format the
  file", "Hide the code", "Show the code", "Hide the explorer", "Show the explorer", "More shapes",
  "Kinds of arrow", "Group or container"), which move to the title and the attribute. The design
  lists every icon-only control of the page and the canvas (the header, the explorer's bar, head,
  switcher and rows, the code bar and rail, the canvas toolbar with its palette and split arrows,
  the panels, the inspector's head and rail) with its glyph, its name and its title in English and
  Spanish, its key and what draws its tooltip.
- **Distinct glyphs.** The explorer keeps its frame with a bar at the left; the code pane's fold
  button becomes a frame with code chevrons inside; the properties (the toolbar's toggle, the
  header button and the rail) become a frame with a bar at the right holding two short rows; all
  hand-drawn 16 × 16 path data in the style of every other glyph of the toolbar and the page, not
  path data copied from Tabler, which decision 0014 made the pack of the diagrams' icons (read from
  `packages/assets`, which the canvas package does not depend on), no new dependency.
- **Documentation.** The editor guide (the panes, the settings table, motion and tooltips) and the
  playground guide (the properties panel, its chord, tooltips) in English and Spanish; the canvas
  package's README (`Tooltips`, `setInspectorCollapsed`, `keys`); the changelog's 1.10.0 section;
  decision 0062.

## Non-goals

- The spacing of sequence participants and nested calls belong to
  `sequence-spacing-and-nested-calls`.
- Exports without the branding belong to `unbranded-exports`.
- The agents' setup prompt, the skill's web page and the skill's own text belong to
  `agent-setup-prompt`.
- The clean stage for presenting belongs to `panel-and-effects-polish` (decision 0057): the
  folded panes and the toolbar's toggles, with no presentation mode.
- The hover cards of the HTML player belong to `interactive-html-views` (decision 0047): exported
  content with its own `role="tooltip"` cards, untouched here.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: ADDED "Collapsible inspector" (the header row and fold button, the rail, one
  kept state with the toolbar's toggle, the theme panel, no rail without a diagram, focus moves,
  the kept viewport, motion, read-only canvases, a kept value that is not a boolean) and
  "Tooltips of icon-only controls" (the name, title and `aria-keyshortcuts` rule, one name per
  toggle, the palette's and the icon tool's titles, the split arrows' names, the bubble after
  400 ms, a glyph no other control shares); MODIFIED "Keyboard operation and focus" (Ctrl+Alt+B
  joins the keys the canvas leaves to its host).
- `web-playground`: ADDED "Collapsible properties panel" (Ctrl+Alt+B, its guards, the chord named
  in the canvas's tooltips, the fold kept with `settings.canvas`, the first visit below 1100 px,
  narrow screens) and "Tooltips of the page's controls" (the shared bubble scoped out of `#app`,
  the rule on the header, explorer and code bar buttons, the theme switch's names, the three pane
  glyphs); MODIFIED "Collapsible code pane" (the fold buttons named without the chord, which moves
  to the title and `aria-keyshortcuts`; the glyph).
- `canvas-package`: MODIFIED "Canvas package" (the public surface grows by `Tooltips` with its
  scope and `TOOLTIP_DELAY`, `ariaKeyshortcuts`, `CanvasApp.setInspectorCollapsed` and
  `inspectorCollapsed`, and `CanvasHostApi.keys`).

## Impact

- `packages/canvas`: `src/inspector.ts` (the header row, the fold button, the rail, `setCollapsed`,
  the id `mdg-inspector`; the theme panel's fold button), `src/app.ts` (`showInspector` read as a
  boolean only, `setInspectorCollapsed` and `inspectorCollapsed`, `syncToggles`, the focus moves,
  `CanvasHostApi.keys`, `button()` with `aria-keyshortcuts`, the palette's titles), `src/tooltip.ts`
  (the `except` scope, no fixed id), `src/dom.ts` (`ICONS.inspector`, `ariaKeyshortcuts`),
  `src/index.ts` (`Tooltips`, `ariaKeyshortcuts` exported), `canvas.css` (the panel head, the rail,
  the width transition), `src/messages/en.ts` and `es.ts` (`inspector.hidePanel`,
  `inspector.showPanel`, `toolbar.layers`, `shapeMenu`, `arrowMenu` and `groupMenu` without the
  key, `palette.hint`, `shaped` and `icon` without the key); `test/messages.test.ts`,
  `test/dom.test.ts` (new, for `ariaKeyshortcuts`); `README.md`.
- `packages/playground`: `src/shell.ts` (Ctrl+Alt+B in `onKey`, the page's `Tooltips`, the theme
  switch's names), `src/canvas-host.ts` (`keys` passed to the canvas), `src/canvas-settings.ts`
  (the first-visit default), `src/ui.ts` (`ICONS.codePane`, `iconButton` with a key, the page's
  keys), `src/explorer/explorer.ts` (the fold buttons' keys), `src/messages/en.ts`, `es.ts`,
  `explorer-en.ts` and `explorer-es.ts` (names without keys, the theme switch's two names, the
  `keys` group); `test/messages.test.ts`, `test/browser/run.ts`.
- `packages/vscode/test/webview/run.ts`: the fold, the rail, the toolbar in sync, the reload, the
  theme panel, read-only and story mode, the titles and the Spanish words.
- `packages/cloud/test/browser/scenarios-viewing.ts`: the view-mode scenario still reads the
  inspector's disabled fields.
- `docs/editor.md`, `docs/es/editor.md`, `docs/playground.md`, `docs/es/playground.md`,
  `CHANGELOG.md`, `docs/decisions/0062-inspector-collapse-and-tooltips.md`.
