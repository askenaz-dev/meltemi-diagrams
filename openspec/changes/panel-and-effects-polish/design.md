## Context

The playground's columns are one grid: `.panes { --explorer: 260px; --split: 0.42;
grid-template-columns: var(--explorer) 1px calc((100% - var(--explorer) - 7px) * var(--split))
6px minmax(0, 1fr); transition: grid-template-columns var(--pg-motion) var(--pg-ease) }`
(`packages/playground/playground.css:368-377`), with `html.resizing .panes { transition: none }`
while an edge is dragged (`386-388`). The panes are appended as the explorer, its edge, the code
pane, the divider and the canvas pane, and the initial share is `settings.split ?? 0.42`
(`packages/playground/src/shell.ts:508-509`). The code pane is
`section#code-pane.pane.code-pane[role=tabpanel]` holding the code-path bar (`div.code-path`, a
30 px flex row with 12 px padding, `playground.css:762-774`, filled by `showFile`,
`shell.ts:1161-1174`), the code host, the sr-only help and the problems section (`468-484`). The
divider is `div.divider[role=separator][tabindex=0]` with `aria-label` `code.width`,
`aria-valuemin 20`, `aria-valuemax 80` (`485-494`); `split()` clamps the share, writes `--split`
and `aria-valuenow` and stores `settings.split` without saving (`574-581`); `dividerBehaviour`
captures the pointer, computes the share from the code pane's left edge and the panes' right edge
minus 6 px, sets `html.resizing`, saves on pointerup, and moves the share ±0.05 on the arrows
(`583-607`). There is no `dblclick` listener and no way to collapse the pane.

The explorer is the model for a rail. The page's `layout(width, collapsed)` callback sets
`--explorer` to `36px` or `${width}px` and `root.dataset.explorer` to `rail` or `open`
(`shell.ts:990-993`); `explorerSettings()` reads the kept object defensively (`collapsed` only when
it is a boolean, else `window.innerWidth < 1100`, `939-949`) and `saveSettings` keeps
`settings.explorer = { ...next }` (`986-989`). `Explorer` builds a `collapseButton` and a
`railButton` with the `EXPLORER_ICONS.sidebar` glyph and the words `show`/`hide`, both with
`aria-expanded` (`explorer.ts:122-125`); `applyLayout` writes `data-collapsed` on the aside and
the edge (`238-249`); `setCollapsed` moves the focus to the rail button when folding from inside
and to the tree when opening (`255-262`); the edge combines a pointer drag with a `dblclick` that
resets the width (`270-293`). The CSS fades `.explorer-body` out (opacity, then `visibility`
after `--pg-motion-fast`) and the absolutely positioned `.explorer-rail` in with a delay of
`--pg-motion-fast` (`playground.css:799-835`); `.explorer-edge[data-collapsed=true] { visibility:
hidden }` keeps its grid column so the columns after it do not move (`857-859`). Narrow screens
(`NARROW = 768`, `shell.ts:116`) make `.panes` a single column, hide `.divider`, show panes by
`data-view` and make the explorer "the Files tab, never a rail" (`playground.css:474-485`,
`1454-1474`); `show(view)` sets `root.dataset.view` and the tabs (`shell.ts:564-571`). The
document's `keydown` handler returns while a dialog is open or the target is a native input,
select, contenteditable or another textarea, and takes Ctrl+B, Ctrl+Shift+E, Ctrl+Z, Ctrl+Shift+Z,
Ctrl+Y and Ctrl+S, the last with `preventDefault` over the browser's Save page
(`shell.ts:1546-1595`); `command(e)` is Ctrl on Windows and Linux and Cmd on a Mac
(`packages/playground/src/ui.ts:210-212`). Ctrl+J is bound nowhere in the page: not in the shell,
not in the code pane (Ctrl+Space, Ctrl+., Ctrl+click, Shift+Alt+F, F2, F12,
`packages/playground/src/code/pane.ts:159`, `437-476`), not in the explorer's tree (Ctrl+D,
`explorer.ts:428`), and not among the canvas's bindings (`packages/editor/src/canvas/keyboard.ts:116-182`),
whose `commandFor` returns nothing for an unbound key so the press reaches the document
(`packages/canvas/src/app.ts:4539-4540`). `Settings` is `{ theme?, language?, split?, canvas?,
explorer? }` and `loadSettings` returns whatever object is kept, unvalidated
(`packages/playground/src/store.ts:23-32`, `170-178`). `showAnalysis` writes the open file's
error count to `root.dataset.problems` and the problems title to its `h2`, announcing a change
(`shell.ts:1427-1447`). The canvas reacts to its pane's size with `new ResizeObserver(() =>
this.layout()).observe(this.stage)`, and `layout()` only re-applies the viewport transform and
the grid background (`app.ts:628`, `1844-1860`): no fit, no zoom.

The strip is built by `withStrip` (`packages/editor/src/inspector.ts:898-954`): `STRIP` lists its
fields in order (`865-890`: theme, the three colours, `line`, `style.line`, width, the heads,
routing, corners, radius, rotation, shape, icon position, then `effect.flow`,
`effect.flow.duration`, `effect.dash`, `effect.dash.duration`, `effect.pulse`,
`effect.pulse.duration`, `effect.trace`, `effect.trace.duration`); a field in it gets `section:
"strip"`, a duration the theme's or the engine's default as placeholder (`915-923`), a `color`
field the theme's swatches (`924`), and the fields are stable-sorted by `STRIP.indexOf`, non-strip
fields last (`945-952`). `InspectorField.section` is typed as the literal `"strip"`
(`packages/editor/src/canvas/protocol.ts:315-316`). `effectFields` emits per effect the toggle
and, when the entry exists, `.duration` (number), `.repeat` (text, placeholder `forever`),
`.delay` (number), `.direction` (enum of `ANIMATION_DIRECTIONS`) where it applies, `.particles`
(number, flow) and `.color` (type `color`, value the written colour minus its `@`, placeholder
`placeholders.linesColour`) for flow, pulse and trace (`packages/editor/src/effects.ts:49-133`;
`ANIMATION_EFFECT_PROPERTIES` at `packages/model/src/schema.ts:54-61`), labelled
`effectField(name, field)` as "Trace: colour" (`packages/editor/src/messages/en.ts:148-156`). The
spread of `effectFields` closes the fields of a flow element, a flow relation, a C4 element, a
styled sequence event and a C4 relation (`inspector.ts:1021`, `1038`, `1061`, `1079`, `1101`); a
selection of several targets gets `sharedEffectFields` instead, toggles only, `mixed` when some
have the effect (`957-981`, `1128`). `effectOperations` turns `effect.<e>.<prop>` into
`setAnimation { property, value }` with the text as is for `color` (`effects.ts:136-186`), and
the edit layer writes a bare identifier for a token and a quoted string otherwise
(`packages/edit/src/animate.ts:113-117`), so a chip gives `color accent` and the picker
`color "#E8A33D"`; durations outside `ANIMATION_LIMITS` are refused with
`reasons().animations.timeRange` (`animate.ts:78-89`).

The canvas's `Inspector.show` (`packages/canvas/src/inspector.ts:802-845`) keeps a field being
typed in (`holdsTyping`, `62-83`), remembers the focused control's `data-key` or id, clears the
aside and draws the title, then a `section.strip` with every strip field that is neither a toggle
(`/^effect\.(flow|dash|pulse|trace)$/`) nor a speed (`/^effect\.\w+\.duration$/`), then
`effectsRow(toggles)`, then the speeds (`823-840`), then every non-strip field through `field()`
(`841-843`), and `refocus` finds the control again by `data-key` or id (`86-95`). `stripField`
chooses `colorRow` for `type === "color" && field.swatches`, `effectToggle` for the toggles,
`themeRow`, `glyphField`, `rangeField`, else `plainField` (`994-1002`); `field()` never chooses
`colorRow` (`1047-1063`). `colorRow` draws a `div.field.colors[data-field]` with a `.row-label`
(the label span, the shown value, the native picker whose start colour is `colorOf(value) ??
colorOf(placeholder)` resolved through the swatches, `#000000` when neither is a colour) and a
`div.chips[role=radiogroup]` of the Theme chip and one chip per swatch, each with a `data-key`
(`615-702`, `98-112`). `effectsRow` wraps the toggles in `div.field.effects-row[data-field=
"effects"]` with `span#mdg-effects-label` and the `.value` from `effectsSummary`, exported and
unit-tested without a DOM (`741-759`, `728-735`; `packages/canvas/test/effects-row.test.ts`).
Field ids are `keyOf(name)` = `mdg-field-` plus the name with non-word characters as `-` (`56`),
which the webview suite relies on (`#mdg-field-effect-dash-duration`,
`packages/vscode/test/webview/run.ts:1472-1484`). The canvas's motion tokens are
`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms, `--mdg-motion-slow` 220 ms and `--mdg-ease`,
zeroed under `prefers-reduced-motion` (`packages/canvas/canvas.css:17-42`); popovers rise and fade
with `display … allow-discrete` and `@starting-style` (`2600-2632`); there is no height-collapse
pattern in `canvas.css`, while the playground opens a folder with `grid-template-rows: 0fr → 1fr`
on a wrapper whose child has `min-height: 0; overflow: hidden` (`playground.css:1335-1348`).

## Goals / Non-Goals

**Goals:**

- The code pane folds and unfolds like the explorer, from the bar, the divider and the keyboard,
  is remembered, and leaves the canvas where it was.
- Every effect colour is chosen the way fill and stroke are, and says what applies without one.
- The settings of an effect sit with its toggle, inside the strip, open when the effect was just
  turned on and quiet otherwise, in both hosts of the canvas.

**Non-Goals:**

- A presentation mode or any new toolbar tool (`pointer-and-notes` adds the pointer).
- The strip's alignment picker and the relation tool (`lines-and-text-alignment`).
- New controls for direction or repeat beyond the select and the text the inspector has today.
- Persisting the cards' open state, or any change to the language, the grammar, the model JSON,
  the layout, the render or the exports.

## Decisions

### The code pane collapses to a rail, modelled on the explorer

The code pane keeps its place in the grid and folds to a 36 px column, as the explorer does. The
shell sets `root.dataset.code` to `rail` or `open` and `data-collapsed` on `section#code-pane`
and on the divider; the stylesheet gives `.shell[data-code="rail"]:not(.narrow) .panes` the
columns `var(--explorer) 1px 36px 6px minmax(0, 1fr)`, so the existing transition on
`grid-template-columns` animates the fold and `--split` stays untouched for the way back; the
divider keeps its 6 px column with `visibility: hidden`, as the explorer's edge does
(`playground.css:857-859`), so the calc of the open state and the pointer code of
`dividerBehaviour` do not change. The code-path bar, the code host, the help and the problems
fade out (`opacity`, then `visibility` after `--pg-motion-fast`) and a `div.code-rail`,
absolutely positioned over the column with 8 px of top padding, fades in with the delay the
explorer's rail uses. Two controls fold it: a `button.button` at the right end of the code-path
bar (`iconButton("codePane", code.hide)`, `aria-expanded="true"`, `aria-controls="code-pane"`)
and a double click on the divider; the rail holds one `button.button` (`code.show`,
`aria-expanded="false"`, `aria-controls="code-pane"`) that unfolds it. `ICONS.codePane` in
`packages/playground/src/ui.ts` is the explorer's sidebar glyph mirrored (the inner line at the
right, `M2.5 3h11v10h-11z|M9.8 3v10`), since the code sits left of the canvas and folds toward
the explorer. Folding from inside the pane moves the focus to the rail button; unfolding puts it
in the code (`CodePane.focus`, `pane.ts:191`), as `setCollapsed` does for the explorer. The
canvas keeps its viewport: its `ResizeObserver` only re-applies the transform (`app.ts:1844-1860`),
which the browser suite asserts rather than adds. Alternatives: removing the 6 px column when
folded (changes the calc of the open state and the drag's arithmetic); hiding the pane with
`display: none` and a header button (nothing animates, the problems vanish without a trace); a
narrower rail than the explorer's (two rails of different widths side by side look wrong).
Recommendation: the 36 px rail with the hidden divider.

### Ctrl+J toggles the code, with the browser caveat recorded

The document handler of `onKey` (`shell.ts:1546-1595`) takes Ctrl+J (Cmd+J on a Mac) under the
same guards as Ctrl+B: not while a dialog is open, not from a native input, select, contenteditable
or another textarea, with `preventDefault`. Ctrl+J is VS Code's "toggle panel", free in the page
(the shell, the code pane, the explorer's tree and the canvas's bindings were checked), and the
webview is not affected (VS Code has no playground). In Chrome, Edge and Firefox it is the
Downloads shortcut; it is not in Chrome's unpreventable set, so `preventDefault` claims it exactly
as Ctrl+S already claims Save page (`1575-1576`). On a narrow screen the pane is a tab, so Ctrl+J
shows the Code tab when another is shown and the Canvas tab otherwise, the way Ctrl+B closes the
Files tab there (`1560`). Alternatives: Ctrl+\ (VS Code's split editor; on Spanish keyboards the
backslash is AltGr+º, which `e.key` reports as `\` only with AltGr held, unreliable); Ctrl+Shift+J
(free too, but the pane's toggle wants the plain chord like Ctrl+B); no shortcut (the rail button
and the bar button would be the only way, and the owner collapses to work on the canvas with the
keyboard). Recommendation: Ctrl+J, documented with the Downloads caveat in the playground guide.

### The state is `settings.code.collapsed`, read defensively, beside `split`

`Settings` gains `code?: { collapsed?: boolean }` (`store.ts:23-32`), outside `explorer` so the
explorer's `saveSettings` spread (`shell.ts:986-989`) does not drop it, and `codeSettings()` reads
it as `explorerSettings()` reads the explorer's: `collapsed` only when the kept value is a
boolean, else `false`. The shell never calls `split()` while folded, so `settings.split` keeps
the last open share and unfolding restores it; the divider's pointer and key handlers return while
`data-collapsed` is `true` (the column is hidden, but a key on a focused hidden separator must not
write a share), and a double click on the divider restores the share recorded at its first
pointerdown before folding, so the two tiny moves of the clicks do not change it. Alternatives: a
`split` of 0 standing for folded (every reader of `split` would need the special case, and the
kept share would be lost); a key under `explorer` (dropped by its spread); no memory (the
explorer's rail is remembered, and a fold made to work on the canvas should survive a reload).
Recommendation: `settings.code.collapsed`.

### The rail shows the error count, or nothing

The rail holds, under its button, a `span.code-rail-problems` that `showAnalysis`
(`shell.ts:1427-1447`) fills with the open file's error count and whose `title` is the problems
title it already composes, hidden (`hidden` attribute) at zero; warnings are not counted, as the
explorer's badges count errors first. The live region keeps announcing the problems' summary as
today (`1439-1443`), so a folded pane still says when the file breaks. Alternatives: a CSS badge
from `attr(data-problems)` on the root (the attribute already exists at `1438`, but errors and
warnings would need a second attribute and the title could not be set); no badge (the problems
list is hidden while folded, and an error in the file would be invisible on a wide screen);
errors and warnings (the explorer's badge shows one number, errors first, and the rail is 36 px).
Recommendation: errors or nothing, with the title for the detail.

### A reveal with focus unfolds the pane; a canvas selection and an opened file do not

Four places reveal a range with the focus: the studio's `reveal` callback when `range.focus` is
true (`shell.ts:284-287`, the answer to the canvas's **Show in text**, `focusText` in
`packages/canvas/src/app.ts:5372-5374` and `packages/editor/src/session.ts:752-754`), `reveal(path,
range)` for a definition in another file (`1340-1344`), `definition` for a local one (`1406-1413`)
and a problem item's click (`1461-1464`); each calls `code.reveal(…, true)` and then `show("code")`
for the narrow screen. A focus into a `visibility: hidden` textarea is lost, so these four call one
helper, `revealCode(start, end)`, which calls `setCodeCollapsed(false)` before the reveal and the
`show("code")`; `show()` itself never changes the fold, so the constructor's `show("code")`
(`558`), `openFile` (`933-936`), the rename paths (`911`, `928`) and Ctrl+B's Files-tab fallback
(`1560`) leave a folded pane folded. Of the four, only **Show in text** is reachable while the pane
is folded on a wide screen: F12, Ctrl+click and the problems list live inside the pane and fire
only while it is open. Opening a diagram from the explorer leaves the pane folded: the click shows
the diagram on the canvas, and the rail's badge shows its errors; on a narrow screen `openFile`
keeps showing the Code tab as today. A canvas selection reveals without focus (`range.focus`
false) and leaves the pane folded: the selection is set in the hidden textarea and shows when the
pane opens. Alternatives: unfolding inside `show("code")` (every load would unfold the kept fold,
and so would opening a file); unfolding on every reveal (selecting on the canvas would reopen the
code the person just folded); never unfolding (**Show in text** would select text nobody can see).
Recommendation: unfold on a reveal with focus only, through the one helper.

### Narrow screens keep their tabs; the rail is scoped out of them

Every rail rule is scoped to `.shell:not(.narrow)`, as the explorer's are (`playground.css:
1454-1474`): the single-column grid ignores `--split` already (`474-476`) and the Code tab shows
the whole pane whatever `settings.code.collapsed` holds; the bar button and the rail are hidden
there. Widening the window applies the kept state again without any code, since the state lives
in `data-code` and the stylesheet. Alternative: clearing the kept state when the page is narrow
(a phone visit would forget a laptop's choice). Recommendation: scope the rules, keep the state.

### Effect colours get the swatches and the `accent` placeholder

Once every `effect.<e>.*` field is in `STRIP` (next decision), `withStrip`'s existing branch
gives the three colour fields `swatches = themeSwatches(theme)` (`inspector.ts:924`) and
`stripField` chooses `colorRow` for them (`canvas inspector.ts:996`), so flow, pulse and trace
colours are the same row as fill and stroke: the Theme chip (`inspector.themeChip`), sixteen token
chips, the native picker. The row sends a token name or an uppercase hex, `effectOperations`
passes it as text, and `animate.ts:113-117` writes `color accent` or `color "#E8A33D"`;
`effectFields` strips the `@` of a written token (`effects.ts:125-127`), so the written chip is
checked. `effectFields` sets the placeholder to `accent` with `fromTheme: true`, in place of
`placeholders.linesColour`, which leaves `en.ts` and `es.ts`: `colorRow` then reads
"accent (inherited)" at the right and the picker starts at `colorOf("accent", swatches)`, the
theme's accent, instead of `#000000`. The Theme chip keeps its wording and title: choosing it
removes `color`, after which the accent applies, which is what "inherit from the theme" says.
Alternatives: keep the text box with the datalist (the owner's complaint); a `<select>` of the
sixteen tokens (no colour of one's own); a popover picker like the icon picker (heavier than the
row the person already knows from fill, and the card has room). Recommendation: `colorRow` with
`accent` as the placeholder.

### Effect cards in the strip, grouped by a `group` key

`InspectorField` gains `group?: string`: the name of the toggle field whose card holds this
field (`effect.trace` for `effect.trace.color`). `STRIP` becomes the style fields followed by
`EFFECT_ORDER.flatMap((e) => [`effect.${e}`, ...EFFECT_PROPERTIES.map((p) =>
`effect.${e}.${p}`)])` with `EFFECT_ORDER = ["flow", "dash", "pulse", "trace"]` (the strip's
order today) and `EFFECT_PROPERTIES = ["duration", "repeat", "delay", "direction", "particles",
"color"]`, so the effect part is one generated tail that `lines-and-text-alignment` does not
touch when it slots its alignment field among the style fields. `withStrip` marks every
`effect.<e>.<prop>` field `section: "strip"` and `group: "effect.<e>"`, keeps the duration's
placeholder, and gives the colour its swatches; the toggles are unchanged. In the canvas,
`Inspector.show` replaces the `toggles`/`speeds` regexes with the exported pure helper
`effectCards(strip)`, which returns the toggles in order and, for each, the fields whose `group`
names it; the strip is drawn as the ungrouped fields, then `effectsRow(toggles)`, then one card
per toggle that has fields (an effect that is on for one target), in the toggles' order. A card
is `div.effect-card[data-effect="effect.<e>"]` with a header row holding
`button.card-head[data-key="effect.<e>:card"][aria-expanded][aria-controls]` (visible text the
effect's name, `aria-label` `inspector.effectSettings(name)` so it never shares the toggle's
accessible name, a chevron glyph) and the duration's input beside it (`fieldControl` with the
field's id `mdg-field-effect-<e>-duration`, its placeholder, `aria-label` the field's label, the
unit `inspector.milliseconds` after it), then `div.card-body#mdg-card-effect-<e>` (the id the
header's `aria-controls` names, formed like `keyOf`) holding repeat, delay, direction, particles
and the colour row as they apply. The visible text of each control inside a card is
`cardLabel(header, label)`, the field's label with the header's name and the colon removed when
it starts with them ("Trace: colour" shows "colour"), while the `aria-label` keeps the full label
so every accessible name stays unique; `colorRow` gains an optional shown label for the same
reason. The toggles' row, its `data-field="effects"`, its `.row-label > span`, its `.value` and
the group named "Effects" with its four buttons do not change. A selection of several targets
has toggles only (`sharedEffectFields`), so no card is drawn and a mixed toggle has nothing to
open. Alternatives: (a) a separate titled Effects section after the strip (the settings would
still sit away from the toggle that turned them on, and the strip is where the owner looks);
(b) a popover per toggle, like the icon picker (the duration would be out of sight, a popover
closes on every render while the canvas animates, and the inspector rebuilds its DOM on each
render); (c) the canvas parsing `effect.<e>.<prop>` names as today (the editor owns what belongs
to an effect, as decision 0034 keeps the swatches in the editor). Recommendation: cards under the
Effects row, grouped by the editor.

### The card of an effect just turned on opens; the state lives in the inspector for the session

The inspector rebuilds its DOM on every render (`clear(this.element)`, `817`), so the open state
cannot live in the DOM. `Inspector` keeps `cards: Map<string, Set<string>>` keyed by the target
(`target.kind` plus `target.ids.join()`) holding the effects whose cards are open, cleared by
`clear()` (a file without diagrams) and never persisted. The exported pure helper
`openCards(previous, next, kept)` returns the set for the next model: the kept set for the same
target, plus every effect whose toggle was off (or absent) in `previous` and is on in `next`,
minus the effects turned off; a different target starts from its kept set, empty on first sight.
The header button toggles the effect in the set and redraws the strip; its `data-key` lets
`refocus` return the focus after a redraw, and it stops `keydown` propagation as every control
does. The duration stays visible in the header whether the card is open or closed, so the strip
always "shows the speed greyed" as the quick-styling requirement says. Alternatives: every card
open (the strip of a relation with three effects would be longer than the inspector); every card
closed (the person turns Trace on and sees nothing new but a header); persisting the state with
the canvas's `PersistedState` (a per-file memory for a transient disclosure, and the state is
keyed by target ids that renames change). Recommendation: just-turned-on opens, kept per target
for the session.

### Motion

- **The fold.** The grid columns move over `--pg-motion` (180 ms) with `--pg-ease`, as they do
  when the explorer folds; the code-path bar, the code and the problems fade over
  `--pg-motion-fast` and lose `visibility` after it; the rail fades in over `--pg-motion` after a
  `--pg-motion-fast` delay, exactly the explorer's choreography (`playground.css:799-835`); the
  divider's accent on hover and focus stays. The badge appears and disappears with the rail. The
  playground's reduced-motion rule (`4046-4052`) removes all of it.
- **The cards.** `.card-body` is `display: grid; grid-template-rows: 0fr; opacity: 0;
  transition: grid-template-rows var(--mdg-motion) var(--mdg-ease), opacity var(--mdg-motion-fast)
  var(--mdg-ease)` with a child `min-height: 0; overflow: hidden`, and `1fr` with `opacity: 1`
  when its header is `aria-expanded="true"`, the pattern the playground's folders use, which
  `canvas.css` lacks; the chevron turns 90° over `--mdg-motion-fast`. A card that appears because
  its effect was just turned on grows from `0fr` through `@starting-style`, so the strip grows
  instead of jumping; a card that leaves because its effect was turned off is simply not drawn
  (the render replaces the inspector's DOM). Chips, toggles and the picker keep their colour
  transitions. The canvas's tokens are zero under `prefers-reduced-motion` (`canvas.css:35-42`),
  which keeps the existing reduced-motion scenarios green.

## Risks / Trade-offs

- [Ctrl+J is the browser's Downloads shortcut] → the page claims it with `preventDefault` as it
  claims Ctrl+S; the playground guide names the key and says so; the browser suite proves the
  page handles it headless (`page.keyboard.press("Control+j")`).
- [A kept `code.collapsed` from another device folds the pane on a first look] → the rail's
  button is visible and labelled, the status line names the key, and a reveal with focus unfolds
  the pane.
- [`strip.test.ts` pins the exact strip order, and `lines-and-text-alignment` edits the same
  list] → the effect part of `STRIP` is a generated tail, and the test's expectations change
  only where an effect is on (the dash of the relation under `brand` now lists its repeat, delay
  and direction after its duration).
- [The webview suite relies on `#mdg-field-effect-<e>-duration`, its placeholder,
  `.strip [data-field="effects"]` and the group "Effects" with four buttons] → the duration
  input keeps its id and placeholder in the card's header, and the toggles' row is untouched;
  the scenario's screenshot `inspector-effects-row.png` is looked at.
- [Two buttons named after one effect] → the header button's accessible name is
  `inspector.effectSettings(name)` ("Moving dash: settings"), so `getByRole("button", { name:
  "Moving dash" })` still finds the toggle alone; the Spanish words are added and the three
  parity tests cover them.
- [`holdsTyping` finds a field by id] → the duration input in the header keeps `keyOf(name)` as
  its id, and the card's body controls keep theirs, so a render while typing a delay still waits.
- [The card's colour row inherits `#000000` when the theme has no `accent`] → every theme family
  resolves `accent`; `colorOf("accent", swatches)` finds it in the sixteen swatches.
- [A double click on the divider writes a share from the two clicks' moves] → the pointerdown
  records `settings.split`, the `dblclick` restores it before folding, and the explorer's edge
  already combines the two listeners the same way (`explorer.ts:272-286`).
- [Folding while a drag of the divider is captured] → a double click ends its own two pointer
  captures before `dblclick` fires; the `html.resizing` class is removed on each pointerup.
- [The rail hides the problems list] → the badge counts errors, the live region announces the
  summary, and the explorer's tree keeps its per-file counts.
