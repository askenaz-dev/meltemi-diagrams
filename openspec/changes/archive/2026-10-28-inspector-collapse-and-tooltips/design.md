## Context

**The inspector in the canvas.** `CanvasApp` builds its `.main` as a grid of three columns, `auto
1fr auto` (`packages/canvas/canvas.css:205-210`): the `.side` column with the libraries and layers
panels, the stage, and the inspector followed by the theme panel (`packages/canvas/src/app.ts:666-673`);
the menus, pickers and dialogs appended after them are positioned out of the flow. Only one of the
two right panels shows at a time: `syncToggles` sets `inspector.element.hidden = !showInspector ||
themePanel.open || noDiagram` and `themePanel.element.hidden = !showInspector || !themePanel.open`
(`app.ts:3896-3917`, lines 3910-3911), `.panel[hidden] { display: none }` (`canvas.css:906-908`),
and a panel that reappears slides in over `--mdg-motion-slow` (`canvas.css:2827-2829`, keyframes
`2982-2987`). `.panel` is 260 px wide with its own padding and scroll (`canvas.css:897-904`), and
story mode hides every panel of `.main` with `display: none !important` (`canvas.css:1727-1733`).
`noDiagram` is a field set when the file has no diagram (`app.ts:533`, `1515`, `1727`). The
`Inspector` is `h("aside", { class: "panel inspector", "aria-label": …, tabindex: -1 })`
(`packages/canvas/src/inspector.ts:1029-1034`); `show()` keeps a field being typed in, remembers
the focused control's `data-key`, then `clear(this.element)` and appends the datalist and an `h2`
with the model's title before the strip and the fields (`inspector.ts:1071-1095`), so anything
that must survive a render is re-appended as the datalist is (`1088-1090`); `setReadOnly` relabels
the aside and redraws every field disabled (`1058-1069`). The `ThemePanel` is the same kind of
aside, hidden by default, with a `panel-head` holding its `h2` and a Done button titled
`themePanel.doneTitle` (`inspector.ts:1483-1489`, `1511-1522`; `en.ts:648-658`); closing it gives
the focus to `inspector.element` (`app.ts:828-834`). `PersistedState.inspector` is a boolean
(`app.ts:114-129`), `local` is whatever the host's `getState()` returns (`app.ts:611`), `persist`
merges and writes it back (`1458-1461`), and `showInspector` is `this.local.inspector ??
this.settings.inspector` (`1472-1474`), the default being `CanvasSettings.inspector`
(`packages/editor/src/canvas/protocol.ts:296-309`; `true` in `app.ts:422-429` and in the
playground's `CANVAS_SETTINGS`, `packages/playground/src/canvas-settings.ts:4-11`; VS Code's
`meltemi.canvas.inspector`, `packages/vscode/package.json:400-404`). The toolbar's toggles are made
by `toggle()` over `button()`, which sets `title` to the label plus the key in parentheses and
`aria-label` to the label (`app.ts:3169-3195`); the inspector toggle calls `persist` and
`syncToggles` directly (`3438-3441`), as the grid, snap, minimap and layers toggles do, while the
layers command does the same and then focuses the panel (`5411-5415`). Every toggle is `data-edit`
(gone in story mode, `3461-3479`) and the inspector's is not `data-write`, so a read-only canvas
keeps it (`3483-3500`). The canvas's `ResizeObserver` only re-applies the viewport transform when
the stage changes size (`app.ts:692`, `1935-1959`). The keymap avoids VS Code's global keys
(`packages/editor/src/canvas/keyboard.ts:113-117`), binds `l`, `u` and `k` to the panels and the
pointer (`178-181`), and `CanvasCommand` is a closed union (`4-80`) whose key commands need words
in `packages/editor/src/messages/keys.ts` (`8`, `77-79`, `150-152`) and a row in the view-only
table (`packages/canvas/src/view-only.ts:8-31`; `packages/canvas/test/view-only.test.ts:10-12`).

**The page's panes and keys.** The playground's `onKey` handler returns while a dialog is open or
the target is a native input, select, contenteditable or a textarea other than the code's, and
then takes Ctrl+B (`!e.shiftKey && !e.altKey`), Ctrl+Shift+E, Ctrl+J, undo, redo and Ctrl+S
(`packages/playground/src/shell.ts:1633-1693`); `command(e)` is Ctrl on Windows and Linux, Cmd on
a Mac (`packages/playground/src/ui.ts:212-214`, `isMac` at `209`). The stage's `keyDown` asks
`commandFor` for the binding and returns, without `preventDefault` or `stopPropagation`, when
there is none (`packages/canvas/src/app.ts:5150-5175`, lines `5164-5165`), so a chord the keymap
does not bind bubbles from the stage to the page's handler as Ctrl+J does today. The explorer's rail and the
code pane's rail are the model: a fold button in the head and a rail button, both `aria-expanded`,
focus to the rail when folding from inside and into the pane when unfolding
(`packages/playground/src/explorer/explorer.ts:122-125`, `183`, `191`, `238-262`;
`shell.ts:494-511`, `613-640`), the state read as a boolean only (`shell.ts:1024-1034`, `613-616`),
the grid columns transitioned and the rail faded in after `--pg-motion-fast`
(`packages/playground/playground.css:368-377`, `798-857`, `871-907`), the rails scoped out of
narrow screens (`1527-1561`). The canvas is mounted with a state object that reads and writes
`settings.canvas` (`shell.ts:551-571`; `packages/playground/src/canvas-host.ts:83-108`;
`packages/playground/src/store.ts:29`), and the only settings message the page sends is
`settingsMessage(readOnly)` (`canvas-settings.ts:20-27`; `canvas-host.ts:136-138`). The explorer
starts folded on a first visit below 1100 px (`shell.ts:1031`).

**Tooltips and names.** `Tooltips(root)` listens for `pointerover` on its root, finds the nearest
`[title], [data-tip]` inside the root, leaves the drawing's own titles alone (`.content, .overlay`),
moves the title into `data-tip`, shows the bubble after `TOOLTIP_DELAY` (400 ms) and hides it on a
press, a key or the wheel; the bubble is `div.tooltip#mdg-tooltip[role=tooltip]`
(`packages/canvas/src/tooltip.ts:4`, `13-32`, `34-50`, `71-88`); the id is referenced nowhere
else. The canvas mounts one on its root and appends the bubble to it (`app.ts:604`, `653`, `690`).
The page's `iconButton` sets `title: options.title ?? label` and `aria-label` only for icon-only
buttons (`ui.ts:39-54`); the explorer's `button` helper sets both to the label
(`explorer.ts:116-121`); the tree row's ⋯ button has both too (`packages/playground/src/explorer/tree.ts:191-192`).
The menus set `aria-keyshortcuts` and show the key in a `kbd` (`packages/playground/src/menu.ts:13-14`,
`58`, `64`). The words with keys inside the name: `toolbar.layers` "Show the layers (L)"
(`packages/canvas/src/messages/en.ts:111`, `es.ts:179`), `header.format` "Format the file
(Shift+Alt+F)" (`packages/playground/src/messages/en.ts:33`, `es.ts:32`), `explorer.pane.show` and
`hide` with "(Ctrl+B)" (`explorer-en.ts:16-17`, `explorer-es.ts:12-13`), `code.show` and `hide`
with "(Ctrl+J)" (`en.ts:213-214`, `es.ts:200-201`); the browser suite finds the code's buttons by
those names (`packages/playground/test/browser/run.ts:2350`, `2356`, `2381`, `2490`, `2529`) and
the webview suite the layers toggle by its exact name (`packages/vscode/test/webview/run.ts:5995`)
or its prefix (`2744`, `4227`, `6295`, `6947`), and checks "Libraries (U)" as a title (`2793`).
The palette's `hint` is "Node: click on the canvas, or press N" and `shaped` "Node, rounded: click
on the canvas, or press N" (`en.ts:165`, `167-168`), passed to `button()` with the key again
(`app.ts:3263-3268`); the webview suite names two palette buttons that way (`run.ts:4417`, `4715`).
The icon tool's label, `palette.icon(key)` "Icon: find one for the selection or to place, or press
I" (`en.ts:172`), is passed to `button()` with the key again (`app.ts:3250-3255`). The split
arrows are made by `splitArrow(label)` from `toolbar.shapeMenu` "More shapes (F)", `arrowMenu`
"Kinds of arrow (R cycles)" and `groupMenu` "Group or container (G)" (`en.ts:81-85`,
`es.ts:156-158`; `app.ts:3618`, `3637`, `3658`), the key inside the name; the webview suite asserts
those as `aria-label` (`run.ts:4404`, `4701`) and as `title` (`5236`, `5245`), and the
`diagram-canvas` requirement "Visible split buttons" quotes them as the tooltip
(`openspec/specs/diagram-canvas/spec.md:533`). The playground suite presses the theme switch by
its name "Switch light and dark" (`packages/playground/test/browser/run.ts:3056`). The canvas's
Spanish catalog writes Shift as "Mayús" (`es.ts:195`). The canvas package depends on the editor,
i18n, motion and render packages only (`packages/canvas/package.json:35-40`), not on
`@meltemi/diagrams-assets`, where the Tabler pack lives (decision 0014). The glyphs: `ICONS.inspector`
"M2.5 3.5h11v9h-11z|M10 3.5v9" (`packages/canvas/src/dom.ts:89`), the explorer's `sidebar`
"M2.5 3h11v10h-11z|M6.2 3v10" (`packages/playground/src/explorer/icons.ts:28`), the code pane's
`codePane` "M2.5 3h11v10h-11z|M9.8 3v10" (`ui.ts:29`), beside `minimap` (`dom.ts:88`), the Code
tab's chevrons `code` (`ui.ts:27`) and the Canvas tab's `canvas` (`ui.ts:30`); all are 16 × 16
path data drawn by `icon()` (`dom.ts:37-52`) in the style decision 0014 set beside Tabler.

## Goals / Non-Goals

**Goals:**

- The properties panel folds and unfolds like the explorer and the code pane: a button in its
  head, a rail with one button, a page chord, one kept state, the focus moved, the viewport kept;
  in VS Code and the playground alike, on read-only canvases too.
- Every icon-only control of the canvas and the page says what it does in its name, shows the key
  in the same bubble after the same delay, and states the key to assistive technology.
- The three pane glyphs are three different pictures.

**Non-Goals:**

- A resizable inspector (260 px stays, `canvas.css:898`), a presentation mode, or a new toolbar
  tool.
- Moving the inspector out of the canvas package into a page column.
- Changing what the inspector shows, the theme panel's content, the player's hover cards, or any
  export.
- A plain canvas letter for the fold, unless the owner picks one (an open question below).
- A head button and a rail for the Libraries and Layers panels at the left of the stage: they
  keep their toolbar toggles and keys (U, L); the owner named the panel at the right (an open
  question below).

## Decisions

### The fold lives in the canvas: a header row and a rail inside the inspector's aside

`Inspector.show` draws, after the datalist, a `div.panel-head` holding the `h2` and
`button.fold[data-key="inspector:fold"][aria-expanded][aria-controls="mdg-inspector"]` (the
properties glyph, name `inspector.hidePanel`), then the strip and the fields as today, then
re-appends a kept `div.inspector-rail` holding one `button.fold[aria-expanded="false"]
[aria-controls="mdg-inspector"]` (name `inspector.showPanel`); the aside gets `id="mdg-inspector"`.
`Inspector.setCollapsed(collapsed)` writes `data-collapsed` on the aside and `aria-expanded` on
both buttons; the stylesheet gives `.inspector[data-collapsed="true"]` a width of 36 px, no
padding and `overflow: hidden`, fades the head, the strip and the fields out (`opacity`, then
`visibility` after `--mdg-motion-fast`) and fades the rail in (absolute, inset 0, 8 px of top
padding, delayed by `--mdg-motion-fast`), the choreography of `.code-pane[data-collapsed="true"]`
(`playground.css:802-836`). The aside stays a grid item of `.main`'s `auto` third column, so its
width transition moves the column and the stage every frame, and the canvas's `ResizeObserver`
re-applies the transform (`app.ts:692`): no fit, no zoom. The `ThemePanel`'s `panel-head` gains
the same fold button before Done, so a person editing a theme folds from where they are. The
focus: folding from inside the aside (or the theme panel) moves it to the rail's button; unfolding
puts it on `inspector.element` (`tabindex -1`, `inspector.ts:1033`), as closing the theme panel
does (`app.ts:832`), and that path moves it to the rail's button instead when the panel is folded.
Because `show()` rebuilds the children on every render, the rail is a field re-appended like the
datalist and `data-collapsed` lives on the aside, which `clear()` leaves alone. Alternatives:
(a) the inspector as a sixth column of the page's grid with its own divider and rail (breaks "The
same canvas", `openspec/specs/web-playground/spec.md:52-60`, and the host-neutral package,
`openspec/specs/canvas-package/spec.md:6-12`: the inspector's DOM is built by `Inspector.show` on
every render and the webview and cloud suites assert `.inspector` inside `#app`; VS Code would
get nothing); (b) a rail as a sibling element of `.main` shown when the aside is hidden (two
elements for one state, and `display: none` on the aside leaves nothing to transition);
(c) the toolbar toggle alone with a key (no control on the panel and no trace once hidden, which
is the owner's complaint). Recommendation: the header row and the rail inside the aside.

### One kept state, read as a boolean, written by four controls through one method

`CanvasApp.setInspectorCollapsed(collapsed: boolean)` (public) does `persist({ inspector:
!collapsed })`, `syncToggles()` and the focus move; `get inspectorCollapsed()` returns
`!showInspector`. The toolbar's toggle, the header button, the rail's button and the page's chord
all call it, so `aria-pressed` on the toggle and `aria-expanded` on the two buttons never
disagree. `showInspector` becomes `typeof this.local.inspector === "boolean" ?
this.local.inspector : this.settings.inspector`, as the page reads `code.collapsed`
(`shell.ts:613-616`): a kept `"no"` opens the panel. `syncToggles` computes `collapsed =
!showInspector`, sets `inspector.element.hidden = noDiagram || (themePanel.open && !collapsed)`,
`themePanel.element.hidden = !themePanel.open || collapsed`, and calls
`inspector.setCollapsed(collapsed)`; story mode keeps hiding every panel, rail included, through
`.main.story-mode .panel` (`canvas.css:1727-1733`), so there is no rail while a story plays and
none without a diagram. The fold writes nothing to the document: `persist` reaches the host's
`setState` only, and the toggle is not `data-write`, so a read-only canvas (view mode) folds and
unfolds as an editing one, its fields staying disabled (`inspector.ts:1058-1069`). VS Code's
`meltemi.canvas.inspector` stays the default the kept state overrides and is never written back
(`vscode-extension` names it a setting of the extension; the fold is the webview's state,
`packages/vscode/src/webview/main.ts:20-21`). Alternatives: a second kept key `inspectorCollapsed`
beside `inspector` (two sources of truth for one panel); a `toggleInspector` canvas command for
the buttons (needed only for a key binding, see the next decision; the toolbar's own toggles call
`persist` directly today, `app.ts:3424-3445`). Recommendation: `PersistedState.inspector`, one
method, read defensively.

### Ctrl+Alt+B (Cmd+Alt+B) in the page; the canvas binds nothing; no plain letter by default

`onKey` (`shell.ts:1633-1693`) takes `key === "b" && e.altKey && !e.shiftKey` under the same
guards as Ctrl+B and Ctrl+J, calls `e.preventDefault()` and
`this.canvas.setInspectorCollapsed(!this.canvas.inspectorCollapsed)`; the existing Ctrl+B branch
already requires `!e.altKey` (`1644`), so the two never collide. The chord is VS Code's "toggle
secondary side bar", the pane that sits where the inspector sits, as Ctrl+B is its primary side
bar and Ctrl+J its panel; it is free in the page (the shell, the code pane's keys at
`packages/playground/src/code/pane.ts:449-469`, the explorer's tree and the canvas's bindings were
checked), and on a narrow screen it folds or unfolds the panel inside the Canvas tab without
switching tabs (the panel is the canvas's own, unlike the code and the explorer, which are tabs
there). The canvas binds nothing for it: VS Code's workbench owns Ctrl+Alt+B and the webview
forwards key presses to it (decision 0017, `docs/decisions/0017-canvas-interaction.md:7-10`;
`openspec/specs/diagram-canvas/spec.md:333-334`), so the chord joins the list of keys the canvas
leaves alone, and VS Code users fold with the header button, the rail's button or the toolbar's
toggle, all reachable by Tab. On Spanish Windows keyboards AltGr is reported as Ctrl+Alt, so
AltGr+B folds too; AltGr+B types nothing on the Spanish layouts, so nothing is lost. In Chrome on
a Mac, Cmd+Option+B opens the bookmark manager, which `preventDefault` claims as the page claims
Ctrl+J from the Downloads (decision 0057, `docs/decisions/0057-panel-and-effects-polish.md:33-34`).
Alternatives: Ctrl+Alt+P (P for properties; no mirror of Ctrl+B and Ctrl+J, and no VS Code
precedent); Ctrl+Shift+B (VS Code's build task, and Chrome's bookmarks bar); a plain canvas
letter bound to a `toggleInspector` command (works only while the canvas has focus and in VS Code
too, but no mnemonic letter is free: P is the sequence participant, I the icon picker, and the
free letters E, H, J, Q, W, Y, Z (`keyboard.ts:118-190`) must be learnt; if the owner picks one, the
command joins `CanvasCommand`, `KEY_BINDINGS`, `keys.ts` for the help, `VIEW_COMMANDS` and the
view-only table, and the toggle's tooltip names it in both hosts); no chord (the explorer and the
code have one, and the owner folds to work on the canvas with the keyboard). Recommendation:
Ctrl+Alt+B in the page, no canvas letter, both as open questions below.

### The host names the chord for the canvas's tooltips: `CanvasHostApi.keys`

`CanvasHostApi` (`app.ts:135-139`) gains `readonly keys?: { readonly inspector?: string }`: the
page passes `{ inspector: isMac ? "Cmd+Alt+B" : "Ctrl+Alt+B" }` from `mountCanvas`
(`canvas-host.ts:89-106`) and VS Code passes nothing. The toolbar's toggle passes
`host.keys?.inspector` as the shortcut of `toggle()`, and the header and rail buttons compose
their titles the same way, so the playground reads "Show the properties (Ctrl+Alt+B)", "Hide the
properties panel (Ctrl+Alt+B)" and "Show the properties panel (Ctrl+Alt+B)" while VS Code reads
the names alone. Alternatives: a `keys` field on `CanvasSettings` (a host UI concern in the
editor's protocol, re-sent with every `settings` message); the page patching the titles after the
mount (two owners of one attribute, and `Tooltips` moves titles into `data-tip` while the pointer
rests). Recommendation: an optional field of the host API, read once at construction. A `keys`
value that is not a non-empty string reads as no key: the titles are the names alone.

### The names of the three properties controls

The toolbar's toggle keeps its name, **Show the properties** (`toolbar.inspector`, which the
webview suite lists by exact name, `run.ts:5995`, and decision 0057 and the editor guide name);
the panel's head button is **Hide the properties panel** and the rail's **Show the properties
panel** (`inspector.hidePanel`, `inspector.showPanel`), so every `getByRole("button", { name,
exact: true })` matches one control and a screen reader hears which of the two it is on.
Alternatives: the panel's buttons named exactly as the other panes' ("Hide the properties" /
"Show the properties"), which makes the rail's button and the toolbar's toggle homonyms in the
accessibility tree and in every selector; renaming the toggle **Properties** as the Libraries
toggle is named ("Libraries (U)"), which touches the suite's list, the decision, the two guides
and the changelog for a word the owner has not complained about. Recommendation: the toggle as is,
the panel's buttons with "panel".

### A first visit below 1100 px starts folded; narrow screens keep the fold as kept

`canvasSettings(readOnly)` (`canvas-settings.ts:20-22`) computes `inspector` as `window.innerWidth
>= 1100`, read once when the page loads, as `explorerSettings()` reads the width for the explorer's
first rail (`shell.ts:1031`); a kept `settings.canvas.inspector` wins, since the setting is only
the default `showInspector` falls back to. Below 768 px the canvas is a tab (`shell.ts:115-116`)
and keeps the rail or the panel as kept; the canvas has no narrow-screen rules of its own and a
36 px rail beside the stage is what a 375 px tab wants. Alternatives: always open (260 of 375 px
on a phone, and 260 of a shared pane on a laptop that already folds its explorer); a narrow-screen
rule in `canvas.css` (the package does not know the page's breakpoints); clearing the kept state
on a narrow screen (a phone visit would forget a laptop's choice, the reason the code pane keeps
its state, decision 0057). Recommendation: the page's default by width, the kept choice first.

### Names without keys; keys in `title` and `aria-keyshortcuts`; one name per toggle

The rule, for every icon-only button, toggle, chip and split arrow of the canvas and the page:
`aria-label` (or the visible text) says what the control does, with no key; `title` is the name
plus the key in parentheses when the control has one, which is what the bubble shows;
`aria-keyshortcuts` carries the key as ARIA writes it ("Control+Alt+B", "Shift+Alt+F", "L";
"Meta+Alt+B" where the shown key is Cmd), through a small pure helper `ariaKeyshortcuts(shown)` in
`dom.ts` that maps the catalog's modifier words (Ctrl, Cmd, the Spanish "Mayús") to
Control, Meta and Shift, exported for the page; a toggle keeps one name and `aria-pressed`
("Show the properties", "Show the grid"), except a control whose effect flips, named per state
(the theme switch becomes "Switch to the dark theme" while light and "Switch to the light theme"
while dark, replacing `header.theme`; Pause and Play already read per state, decision 0052). The
canvas's `button()` gets `aria-keyshortcuts` from its `shortcut` argument; `toolbar.layers` loses
"(L)" and passes "L" as the libraries toggle passes "U"; the page's `iconButton` gains
`options.key` and sets the title and the attribute from it, the header's Undo ("Ctrl+Z"), Redo
("Ctrl+Shift+Z"), Format ("Shift+Alt+F", the name losing its key), the explorer's fold and rail
("Ctrl+B") and the code's ("Ctrl+J") passing theirs from a `keys` group of the page's catalog
(Spanish "Mayús"; keys equal in both languages are listed as rightly the same in the parity test,
`packages/playground/test/messages.test.ts:33-49`), with Cmd for Ctrl on a Mac. The palette says
the key once: `palette.hint(name)` becomes "Node: click on the canvas" (the form `declared`
already has, `en.ts:170`), `shaped(name, shape)` "Node, rounded: click on the canvas" and
`palette.icon` "Icon: find one for the selection or to place" as the accessible names, while the
title is the tool's name and the key, "Node (N)", "Node, rounded (N)", "Icon (I)", and
`aria-keyshortcuts` the key. The split arrows follow the rule too: `shapeMenu`, `arrowMenu` and
`groupMenu` become "More shapes", "Kinds of arrow" and "Group or container" as names, their
titles staying "More shapes (F)", "Kinds of arrow (R cycles)" and "Group or container (G)", which
is what the requirement "Visible split buttons" quotes as the tooltip (`spec.md:533`), so that
requirement does not change; their `aria-keyshortcuts` are "F", "R" and "G". The relation tool's
name stays `toolbar.relation` ("Relation: click the source, then the target") and its title the
one `relationTitle` or `relationKindsTitle` composes ("… (R; Shift for dashed)", `en.ts:75-79`),
the key once, with `aria-keyshortcuts` "R". The panels' icon buttons (layers' eye, up, down,
remove and Add, the story panel's, the inspector's chips, Choose… and Remove) already carry a
title equal to their name without a key (`packages/canvas/src/layers.ts:64`, `100-102`, `142`;
`packages/canvas/src/story.ts:278`; `inspector.ts:310`, `324`, `435`, `525`, `733`, `1328`, `1343`)
and the tree's ⋯ has its title (`tree.ts:192`): unchanged. Nine names lose their key (the layers
toggle, Format, the two code buttons, the two explorer buttons, the three split arrows) and the
theme switch is renamed, which the one spec that quotes a name with its key ("Collapsible code
pane", `web-playground/spec.md:217-218`) and the browser suites' selectors follow (`run.ts:3056`
in the playground's; `4404`, `4701` and `5995` in the webview's; the `aria-label^=` selectors at
`2744`, `4227`, `6295`, `6947` keep matching). Alternatives: keep the keys in the names (the
status quo reads "Control+J" aloud with every name, and leaves layers, Format and the split
arrows saying the key while libraries and pointer do not); keys in the names everywhere (louder,
and the palette's name would hold the key twice as its title does today); the rule for the six
pane and header words only, the split arrows exempted (one rule with an exception nobody can
explain at the toolbar). Recommendation: the rule, applied to all nine.

### One bubble for the page: `Tooltips` exported with a scope

`Tooltips` gains a second argument `{ except?: string }`: `over()` ignores a target inside an
element matching the selector, and the bubble loses its fixed id (referenced nowhere) so two can
share a page. The canvas keeps `new Tooltips(root)`; the page creates `new Tooltips(root, {
except: "#app" })` on the shell's root, appends its element after the status bar and styles it
with the `.tooltip` rules of `canvas.css` the page already links (`index.html:14`), so the header,
the explorer's bar and head, the tree's rows, the code bar and the rails show the same bubble after
400 ms, the control keeping its `title` for assistive technology. The code pane's own hover card
(`pane.ts:116`, `774-784`) is a different thing and stays. `Tooltips` and `TOOLTIP_DELAY` are
exported from `packages/canvas/src/index.ts`. Alternatives: a second bubble in the playground (two
implementations of one look); the browser's native title on the page (the owner's complaint:
slow, unstyled, and different from the toolbar's); one bubble on `document.body` for both (the
canvas mounts its own in both hosts and must not know the page, `canvas-package` 6-12).
Recommendation: export and scope.

### Glyphs

Hand-drawn 16 × 16 path data in the canvas's style (decision 0014; `dom.ts:37-55`, `ui.ts:6`), no
new icon pack: the explorer keeps `sidebar` (a frame with a bar at the left, `icons.ts:28`); the
code pane's `codePane` becomes a frame with code chevrons inside,
`M2.5 3h11v10h-11z|M6.8 6L5 8l1.8 2|M9.2 6L11 8l-1.8 2`, the frame saying "pane" and the chevrons
matching the Code tab's `code` (`ui.ts:27`); the canvas's `ICONS.inspector` becomes a frame with a
bar at the right holding two short rows, `M2.5 3h11v10h-11z|M9.5 3v10|M11 6h1.5|M11 8.5h1.5`, used
by the toolbar's toggle, the header button and the rail, so the properties read as "a panel with
rows" wherever they are folded or unfolded; `minimap` (a frame with a small box) and the Canvas
tab's `canvas` stay. Alternatives: Tabler's path data for the three (`layout-sidebar`,
`layout-sidebar-right`, `code`, or `adjustments` for the properties), which decision 0014 made the
pack of the diagrams' icons and which lives in `packages/assets`, a package the canvas does not
depend on: its glyphs are 24 × 24 at stroke 2 and would sit beside twenty-odd 16 × 16 glyphs at
stroke 1.3, so each would be redrawn by hand anyway; Tabler's sliders ("adjustments") redrawn for
the properties (a picture of settings rather than of a side panel, which the explorer's and the
code's are; the owner may prefer it, an open question); a chevron for the fold buttons (says a
direction, not a panel, and the rail's chevron would point the other way). Recommendation: the
three frames, hand-drawn in the set's style, Tabler's pictures as the model where one fits.

### Motion

The panel's `width` transitions over `--mdg-motion-slow` with `--mdg-ease` (the slide-in token of
side panels, `canvas.css:14-20`, `2821-2829`); the head, the strip and the fields fade over
`--mdg-motion-fast` and lose `visibility` after it; the rail fades in over `--mdg-motion` after a
`--mdg-motion-fast` delay, the explorer's and the code's choreography (`playground.css:818-836`,
`890-907`); the stage follows every frame through the `ResizeObserver`. The theme panel coming
back after an unfold keeps its slide. The tokens are zero under `prefers-reduced-motion`
(`canvas.css:35-45`), which keeps the existing reduced-motion scenarios green and the fold
instant. The bubble keeps its 400 ms delay and its fade (`tooltip.ts:4`; `canvas.css:2746-2758`).
The page's columns move over `--pg-motion`, 180 ms (`playground.css:84`, `376`), and the inspector
over the canvas's `--mdg-motion-slow`, 220 ms, the duration its own slide-in and the Libraries and
Layers panels already use (`canvas.css:15`, `2823-2829`): the panel is the canvas's, in VS Code
too, where no page token exists. Alternatives: a 180 ms token of the canvas for the fold alone (a
fourth duration beside three that the editor guide and the requirement "Motion and finish" name);
the page overriding `--mdg-motion-slow` inside `#app` (every canvas panel would then slide slower
or faster than in VS Code). Recommendation: the canvas's tokens; 40 ms between two panes that
never fold together is below notice.

## Inventory of icon-only controls

What every row gets, once: `aria-label` (or the visible text, where one exists) is the name, with
no key; `title` is the name followed by the key in parentheses when the control has one, and is
what the bubble shows; `aria-keyshortcuts` is the key as ARIA writes it; the bubble is the
canvas's `Tooltips` (400 ms after the pointer rests, fading in), the canvas's own on `#app` and the
page's on the shell with `except: "#app"`, the control keeping its `title` for assistive
technology; a toggle keeps one name and `aria-pressed`, a control whose effect flips is named per
state. Spanish titles write Shift as "Mayús"; on a Mac the shown key says Cmd for Ctrl and
`aria-keyshortcuts` "Meta". Glyphs are 16 × 16 path data: `ICONS` of `packages/canvas/src/dom.ts`,
of `packages/playground/src/ui.ts` and `EXPLORER_ICONS` of `packages/playground/src/explorer/icons.ts`.
"As is" means the words and the glyph do not change; "key off the name" means the name loses the
key it has today.

**Header** (`shell.ts:373-446`; words `packages/playground/src/messages/en.ts:24-44`, `es.ts:23-43`).
Open, Import, Share, Export, the Download menu, the language menu and the account menu show text
beside their glyph and keep their titles (`openTitle`, `importTitle`, `shareTitle`, `exportTitle`).

| Control | Glyph | Name, English / Spanish | Key (in the title) | Change |
| --- | --- | --- | --- | --- |
| Undo | `undo` | Undo / Deshacer | Ctrl+Z | key added to the title |
| Redo | `redo` | Redo / Rehacer | Ctrl+Shift+Z / Ctrl+Mayús+Z | key added to the title |
| Format | `format` | Format the file / Dar formato al archivo | Shift+Alt+F / Mayús+Alt+F | key off the name |
| Theme switch | `moon` while light, `sun` while dark | Switch to the dark theme / Cambiar al tema oscuro; Switch to the light theme / Cambiar al tema claro | — | named per state (was "Switch light and dark") |
| About | `info` | About the playground / Acerca del playground | — | as is |

**Explorer** (`explorer.ts:116-134`, `183`, `191`; `switcher.ts:94-100`, `165-172`;
`tree.ts:143-144`, `191-192`; words `explorer-en.ts`, `explorer-es.ts`).

| Control | Glyph | Name, English / Spanish | Key | Change |
| --- | --- | --- | --- | --- |
| Fold, in the head | `sidebar` (frame, bar at the left) | Hide the explorer / Ocultar el explorador | Ctrl+B | key off the name |
| Rail | `sidebar` | Show the explorer / Mostrar el explorador | Ctrl+B | key off the name |
| New diagram | `newDiagram` | New diagram… / Nuevo diagrama… | — | as is |
| New folder | `newFolder` | New folder… / Nueva carpeta… | — | as is |
| Collapse the folders | `collapseAll` | Collapse the folders / Contraer las carpetas | — | as is |
| Switcher: rename | `rename` | Rename the project / Cambiar el nombre del proyecto | — | as is |
| Switcher: close | `close` | Close / Cerrar | — | as is |
| Row's ⋯ | `more` | More actions for ‹name› / Más acciones para ‹name› | — | as is |

**Code pane** (`shell.ts:139-140`; words `en.ts:213-214`, `es.ts:200-201`).

| Control | Glyph | Name, English / Spanish | Key | Change |
| --- | --- | --- | --- | --- |
| Fold, at the end of the code-path bar | `codePane` → frame with code chevrons | Hide the code / Ocultar el código | Ctrl+J | key off the name, new glyph |
| Rail | the same | Show the code / Mostrar el código | Ctrl+J | key off the name, new glyph |

**Canvas toolbar** (`app.ts:3247-3459`; words `packages/canvas/src/messages/en.ts:62-117`,
`es.ts:141-184`, the palette's `en.ts:143-172`, `es.ts:224-228`). The diagram, scenario, story and zoom pickers are
selects with visible text and change nothing.

| Control | Glyph | Name, English / Spanish | Key | Change |
| --- | --- | --- | --- | --- |
| Palette tools (node, decision, store, note, tag, group; box, text, image; participant, actor; the C4 entity) | `ICONS[kind]` | ‹Tool›: click on the canvas / ‹Herramienta›: haz clic en el lienzo (`palette.hint`; `shaped` adds the shape: "Node, rounded: …") | the tool's letter per profile (editor guide's table) | title "Node (N)", "Node, rounded (N)": the key off the name |
| Icon tool | `icon` | Icon: find one for the selection or to place / Icono: busca uno para la selección o para colocarlo (`palette.icon`) | I | title "Icon (I)": the key off the name |
| Relation / Message | `relation` | Relation: click the source, then the target / Relación: haz clic en el origen y luego en el destino | R (title by `relationTitle`, "… (R; Shift for dashed)") | `aria-keyshortcuts` added |
| Split arrow: shapes | chevron | More shapes / Más formas | F (title "More shapes (F)") | key off the name |
| Split arrow: arrow kinds | chevron | Kinds of arrow / Tipos de flecha | R (title "Kinds of arrow (R cycles)") | key off the name |
| Split arrow: group kinds | chevron | Group or container / Grupo o contenedor | G (title "Group or container (G)") | key off the name |
| New diagram | `plus` | New diagram / Nuevo diagrama | — | as is |
| Connect | `connect` | Connect the selected element to… / Conectar el elemento seleccionado con… | C | as is |
| More participants | `participants` | More participants / Más participantes | — | as is |
| Note | `note` | Note over the selection / Nota sobre la selección | O | as is |
| Fragment | `fragment` | Fragment around the selected events / Fragmento alrededor de los eventos seleccionados | F | as is |
| Divider, Delay | `divider`, `delay` | Divider / Separador; Delay / Retraso | — | as is |
| Add from the model (C4) | `model` | Add from the model… / Agregar desde el modelo… | A | as is |
| Zoom out, Zoom in | `zoomOut`, `zoomIn` | Zoom out / Alejar; Zoom in / Acercar | -, + | as is |
| Fit the diagram | `fit` | Fit the diagram / Ajustar el diagrama a la vista | Shift+1 / Mayús+1 | as is |
| Pointer | `pointer` | Pointer / Puntero | K | as is |
| Grid | `grid` | Show the grid / Mostrar la cuadrícula | — | as is |
| Snap | `snap` | Snap to the grid and guides / Ajustar a la cuadrícula y a las guías | — | as is |
| Minimap | `minimap` (frame with a small box) | Show the minimap / Mostrar el minimapa | — | as is |
| Properties | `inspector` → frame, bar at the right with two rows | Show the properties / Mostrar las propiedades | the host's (Ctrl+Alt+B in the playground, none in VS Code) | new glyph, the host's key in the title |
| Layers | `layers` | Show the layers / Mostrar las capas | L | key off the name |
| Libraries | `library` | Libraries / Bibliotecas | U | as is |
| Arrange | `arrange` | Arrange / Organizar | — | as is |
| Effects | `pause` / `play` | Pause effects / Pausar los efectos; Play effects / Reproducir los efectos | — | as is (named per state) |
| Export SVG | `export` | Export SVG / Exportar SVG | — | as is |

**Canvas panels.** The Layers panel's Add, eye, up, down and remove buttons (`layers.ts:64`,
`100-102`, `142`), the story panel's buttons (`story.ts:275-285`), the inspector's chips, Choose…
and Remove (`inspector.ts:310`, `324`, `435`, `525`, `733`, `1328`, `1343`) and the theme panel's
Done (text, titled "Close the theme" / its Spanish) carry a title equal to their name and no key:
as is, drawn by the canvas's bubble as today.

**Inspector, new** (`inspector.ts`; words `inspector.hidePanel`, `inspector.showPanel`).

| Control | Glyph | Name, English / Spanish | Key | Change |
| --- | --- | --- | --- | --- |
| Fold, in the head (the theme panel's head too) | `inspector` | Hide the properties panel / Ocultar el panel de propiedades | the host's | new |
| Rail | `inspector` | Show the properties panel / Mostrar el panel de propiedades | the host's | new |

## Risks / Trade-offs

- [Two buttons named "Show the properties …" when folded] → the panel's buttons are "Hide the
  properties panel" and "Show the properties panel", the toolbar's toggle stays "Show the
  properties", so `getByRole("button", { name, exact: true })` matches one control each
  (`run.ts:5995` keeps passing); the hidden one of the pair is `visibility: hidden`, out of the
  accessibility tree.
- [Ctrl+Alt+B from a field of the inspector] → the chord is not taken from a native input (the
  guard of `onKey`, as for Ctrl+J), so from a field one presses the header button; documented.
- [`.main`'s third column is `auto`] → the width transition is on the aside itself, so the column
  follows without a grid transition; the browser suites assert the computed `transition-duration`
  of the aside (0.22 s, 0 s under reduced motion) and the stage's transform unchanged after the
  fold.
- [The inspector rebuilds its DOM on every render while folded] → `data-collapsed` lives on the
  aside and the rail is re-appended by `show()`; the webview scenario folds, edits the diagram
  (a render) and asserts the rail is still there.
- [Nine accessible names lose their key and the theme switch is renamed] → the one spec that
  quotes a name with its key is modified here and the selectors of the browser suites
  (`packages/playground/test/browser/run.ts:2350`, `2356`, `2381`, `2490`, `2529`, `3056`;
  `packages/vscode/test/webview/run.ts:4404`, `4417`, `4701`, `4715`, `5995`) are updated in the
  same tasks; `aria-label^=` selectors keep matching.
- [Cmd+Option+B is Chrome's bookmark manager on a Mac] → claimed with `preventDefault` as Ctrl+J
  is; the playground guide says so.
- [The cloud suite reads the inspector's disabled fields in view mode] → the scenario runs on a
  wide viewport with no kept fold (`scenarios-viewing.ts:184-206`); it unfolds first if a later
  scenario inherits a fold.
- [`aria-keyshortcuts` with Spanish words] → the helper maps "Mayús" to Shift and is unit-tested in
  both languages.

## Open Questions

- Which chord folds the properties in the playground: Ctrl+Alt+B (the default here, mirroring
  Ctrl+B and Ctrl+J and VS Code's secondary side bar; AltGr+B on Spanish Windows keyboards) or
  Ctrl+Alt+P?
- Should the canvas also bind a plain letter to the fold for VS Code users (E, H, J, Q, W, Y, Z or
  Shift+P are free on every profile), given that no mnemonic letter is free? Default: no letter;
  the buttons serve VS Code.
- May the nine existing names lose their keys ("Hide the code" with "(Ctrl+J)" in the title and
  `aria-keyshortcuts`, likewise the explorer's, the layers toggle, Format and the three split
  arrows)? Default: yes, the rule applies to all.
- Should the header's, the explorer's and the code bar's tooltips take the canvas's bubble (one
  look across the page, 400 ms) or stay the browser's native title? Default: the bubble.
- Should the Libraries and Layers panels at the left fold the same way, with a head button and a
  rail, or keep their toolbar toggles and keys (U, L)? Default: the toggles, as today.
- Should the rail show anything besides its button (the selected element's kind, as the code's
  rail shows the error count)? Default: nothing, as the explorer's rail.
- Should a first visit on a window narrower than 1100 px start folded, as the explorer does?
  Default: yes.
- Does the properties glyph (a frame with a bar at the right holding rows, hand-drawn in the
  set's style) read right, or are Tabler's sliders (`adjustments`) preferred for the properties?
  Default: the frame, so the three panes are three frames that differ.
- Is a resizable inspector wanted? Default: no, 260 px stays.
