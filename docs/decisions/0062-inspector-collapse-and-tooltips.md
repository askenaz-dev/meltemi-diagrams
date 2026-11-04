# 0062. The properties fold to a rail, and every icon button names its key in one bubble

Status: accepted (inspector-collapse-and-tooltips change, 28 October 2026). Extends decisions 0017,
0048 and 0057.

## Context

The owner asked on 27 October 2026 that the panel at the right fold like the rest, with icons that
differ and tooltips that say what they do. That panel is the canvas package's inspector, the third
column of the canvas's own grid, in VS Code and in the playground alike, not a pane of the page. It
had no control of its own: the one way to put it away was the toolbar's "Show the properties"
toggle, with no key, whose picture was a frame with one vertical line, as were the explorer's and
the code pane's fold buttons. A hidden panel left no trace. Tooltips differed by region: the canvas
drew its own bubble after 400 ms, the page's buttons showed the browser's slow native title. Keys
sat inside some names ("Show the layers (L)", "Format the file (Shift+Alt+F)", "Hide the code
(Ctrl+J)") and not others, and the palette's titles said the key twice ("Node: click on the
canvas, or press N (N)").

## Decision

- **The fold lives in the canvas.** The inspector's aside (`#mdg-inspector`) gets a head row with
  its title and a fold button (**Hide the properties panel**) and a rail it folds to, 36 px wide,
  holding one button (**Show the properties panel**); the theme panel's head holds the same fold
  button, and the theme panel folds with the inspector and comes back with it. The rail is kept
  across the inspector's renders, as its datalist is, and `data-collapsed` lives on the aside.
- **One kept state.** The head's button, the rail's, the toolbar's toggle and a host's call
  (`CanvasApp.setInspectorCollapsed(collapsed)`, read back as `inspectorCollapsed`) all write
  `PersistedState.inspector`, read as a boolean only (a kept `"no"` is the host's default). The fold
  writes nothing to the document and works on a read-only canvas. Folding from inside the panel
  gives the focus to the rail's button; unfolding gives it to the panel, unless the toolbar has it.
  There is no rail without a diagram or while a story plays.
- **Motion on the canvas's tokens.** The width moves over `--mdg-motion-slow`, the contents fade
  over `--mdg-motion-fast`, the rail fades in after them; the stage follows through its
  `ResizeObserver`, so the drawing keeps its zoom and place. Reduced motion makes it instant.
- **Ctrl+Alt+B in the page, no key in the canvas.** The playground folds the properties with
  Ctrl+Alt+B (Cmd+Alt+B), VS Code's secondary side bar beside Ctrl+B and Ctrl+J, from anywhere but
  a field, on a narrow screen too, where the panel stays inside the Canvas tab. The canvas binds
  nothing: VS Code's workbench owns that chord. The host names its key to the canvas
  (`CanvasHostApi.keys.inspector`), and the canvas's titles show it.
- **A first visit below 1100 px starts folded**, as the explorer does; a kept choice wins.
- **One tooltip rule.** An icon-only control's name says what it does without a key; its `title`
  adds the key in parentheses; `aria-keyshortcuts` says the key (`ariaKeyshortcuts` maps Ctrl,
  Cmd and the Spanish "Mayús" to Control, Meta and Shift). A toggle keeps one name; a control whose
  effect flips is named per state (the theme switch says "Switch to the dark theme" or "Switch to
  the light theme"). The palette's titles say the key once ("Node (N)", "Icon (I)"); the split
  arrows are named by their menu ("More shapes") and keep their titles ("More shapes (F)").
- **One bubble.** The canvas exports `Tooltips` with a scope (`{ except }`) and `TOOLTIP_DELAY`;
  the playground draws its own controls' tooltips with it (`{ except: "#app" }`), so the header,
  the explorer and the code bar show the same bubble after the same 400 ms as the toolbar.
- **Three pictures.** The explorer keeps its frame with a bar at the left; the code pane's is a
  frame with code chevrons inside; the properties' a frame with a bar at the right holding two
  rows. All are hand-drawn 16 × 16 path data in the toolbar's style (decision 0014).

## Alternatives considered

- **The inspector as a column of the page**: VS Code would get nothing, and the canvas package
  would stop being one canvas for two hosts.
- **A rail as a sibling of the aside**: two elements for one state, and a hidden aside leaves
  nothing to animate.
- **A second kept key for the fold**: two sources of truth for one panel.
- **A plain canvas letter for the fold**: no mnemonic letter is free (P is the participant, I the
  icon picker), and it would work only while the canvas has the focus.
- **Ctrl+Alt+P or Ctrl+Shift+B**: no mirror of Ctrl+B and Ctrl+J; Ctrl+Shift+B is VS Code's
  build task and Chrome's bookmarks bar.
- **Keys kept in the names**: screen readers would read "Control+J" with every name, and the
  palette's would hold the key twice.
- **The browser's native titles on the page**: slow, unstyled and unlike the toolbar's.
- **Tabler's pictures** (`layout-sidebar`, `adjustments`): 24 × 24 at stroke 2 in a package the
  canvas does not depend on, beside twenty-odd 16 × 16 glyphs at stroke 1.3.

## Consequences

- Nine names lost their keys (the layers toggle, Format, the code's and the explorer's fold
  buttons, the three split arrows) and the theme switch is named per state; the browser suites'
  selectors follow.
- New public surface: `Tooltips`, `TOOLTIP_DELAY` and `ariaKeyshortcuts` exported by
  `@meltemi/diagrams-canvas`, `CanvasApp.setInspectorCollapsed` and `inspectorCollapsed`,
  `CanvasHostApi.keys`; the playground's `withKey` and `shownKey`.
- VS Code's `meltemi.canvas.inspector` stays the default the fold overrides; nothing writes it.
- The Libraries and Layers panels at the left keep their toolbar toggles and keys (U, L), with no
  head button or rail.
