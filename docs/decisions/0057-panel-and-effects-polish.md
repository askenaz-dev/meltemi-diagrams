# 0057. The code pane folds to a rail, and an effect's settings sit in a card under its toggle

Status: accepted (panel-and-effects-polish change, 24 October 2026). Extends decisions 0034, 0048
and 0052.

## Context

The owner met three rough edges on 2026-10-23, each with one cause in the code.

- The playground's code pane could be narrowed to a fifth of the width but never put away: the
  divider's share was clamped to 0.2..0.8, while the explorer beside it already folded to a 36 px
  rail with Ctrl+B and remembered the choice.
- The colour of a trace, a pulse or flow particles was a text box with a list of token names,
  because the editor gave the theme's swatches only to the colour fields it listed for the strip,
  and the effect colours were not among them; its placeholder still said "the line's", a default
  decision 0055 had replaced by the theme's `accent`.
- The settings of an effect (repeat, delay, direction, particles, colour) were plain fields drawn
  after every other field of the inspector, far from the toggle that turned the effect on, while
  the toggles and the speeds sat in the strip.

## Decision

- **The code pane folds to a 36 px rail, modelled on the explorer's.** A button at the right end
  of the code-path bar, a double click on the divider and Ctrl+J (Cmd+J) fold it; the rail's button
  or Ctrl+J unfold it. The fold is kept with the page's settings as `code.collapsed`, beside the
  share, read as folded only when the kept value is a boolean `true`; the share is left as it was,
  so unfolding restores it, and a double click restores the share before its first click. The grid
  columns move with the page's transition; the divider keeps its column, hidden and inert. The
  canvas keeps its viewport. The rail shows the open file's error count, titled with the problems'
  summary, or nothing. A reveal that asks for the focus (Show in text, a definition, a problem's
  line, a quick fix, Project settings) unfolds the pane through one helper; opening a file from the
  explorer and a canvas selection leave it folded. Narrow screens keep their tabs, where Ctrl+J
  shows the Code tab or the Canvas tab. Ctrl+J is claimed from the browser's Downloads as Ctrl+S is
  from Save page.
- **Effect colours are chip rows.** Every field of an effect that is on belongs to the strip, so
  the editor's existing branch gives the colour fields the theme's swatches and the canvas draws
  them with the row fill and stroke use; the placeholder is the `accent` token, from the theme.
- **An effect's settings are a card under its toggle.** The editor marks each field of an effect
  that is on with `group`, the name of its toggle, and the strip's list ends in a generated tail
  (the four effects times their six properties). The canvas draws, under the Effects row, one card
  per toggle that has fields: a disclosure button named "<effect>: settings" with the effect's name
  and a chevron, the duration's input beside it in the header, and the other settings inside, each
  shown without the effect's name but named in full for assistive technology. The card of an
  effect just turned on opens; every other card starts closed; a card opened or closed by hand
  stays so for that target while the canvas lasts, kept in the inspector and never persisted. A
  selection of several targets keeps the toggles only. Cards open and close in place by their
  height and opacity on the canvas's motion tokens, and a card that appears grows in.
- **No presentation mode.** The owner finds it low value: the folded code pane plus the toolbar's
  Show the properties, Libraries and Layers toggles make the clean stage; the pointer tool belongs
  to the pointer-and-notes change.

## Alternatives considered

- **Removing the divider's column when folded.** It changes the calc of the open state and the
  drag's arithmetic; the explorer's edge keeps its column unseen, and the pane does the same.
- **Hiding the pane with `display: none` and a header button.** Nothing animates and the problems
  vanish without a trace.
- **A share of 0 standing for folded.** Every reader of the share would need the special case,
  and the kept share would be lost.
- **Ctrl+\ or Ctrl+Shift+J.** The backslash is unreliable on Spanish keyboards, and the pane's
  toggle wants the plain chord, like the explorer's Ctrl+B.
- **Unfolding inside `show("code")`.** Every load and every opened file would unfold the kept fold.
- **A `<select>` of the tokens, or a popover picker, for effect colours.** No colour of one's own,
  or a heavier control than the row the person already knows from fill.
- **A separate titled Effects section after the strip, or a popover per toggle.** The settings
  would still sit away from the toggle that turned them on, and a popover closes on every render.
- **The canvas parsing `effect.<e>.<prop>` names.** The editor owns what belongs to an effect, as
  decision 0034 keeps the swatches in the editor.
- **Every card open, every card closed, or the state persisted.** Three effects would make the
  strip longer than the inspector; a person who turns Trace on would see nothing new; and a
  per-file memory for a transient disclosure keyed by ids that renames change.

## Consequences

- New words: the playground's `code.show` and `code.hide`, the canvas's
  `inspector.effectSettings` and `inspector.milliseconds`; the editor's
  `placeholders.linesColour` is gone.
- New public surface: `InspectorField.group`; the canvas's `effectCards`, `cardLabel` and
  `openCards`; the playground's `Settings.code` and `Playground.setCodeCollapsed`.
- The playground browser suite and the webview suite gain the fold, the cards and the colour rows;
  `strip.test.ts` lists the grouped fields of a relation's dash. The language stays 0.2.
- [Decision 0062](0062-inspector-collapse-and-tooltips.md) folds the properties panel the same way,
  to a rail from a button in its head, and names every fold button's key in its title only.
