# 0034. Styling on the canvas and custom themes

Status: accepted (canvas-styling-and-themes change, 12 October 2026). Effect colours take the
strip's chip rows and the settings of an effect sit in a card under its toggle by
[decision 0057](0057-panel-and-effects-polish.md).

## Context

Reviewing 1.0, the owner found that styling on the canvas meant typing token names into text
fields, that custom themes existed only as hand-written `theme` blocks, that the speed of effects
was a constant of the engine, and that styles and effects were refused on anonymous relations.
They asked for palettes like draw.io's and Excalidraw's: predefined colours, palettes of one's own,
and colours of boxes, lines and text changed on the diagram. Their decisions: a palette of one's
own is a custom theme that extends a base theme; the quick controls belong in the sidebar, as
draw.io's format panel, with the full inspector below; the engine's speed stays the default and a
theme may set its own; there are no standalone lines.

## Decision

- **A palette is a theme.** The canvas offers no colour list of its own: the chips of the style
  strip are the effective theme's sixteen colour tokens, drawn in the colours that theme resolves
  them to. A custom theme is a `theme <id> { extends "<base>" … }` block, so a palette of one's own
  is versioned, shared and exported like the rest of the text.
- **Tokens follow the theme; colours stay.** A chip writes the token's name, the picker a quoted
  hex, **Theme** removes the property. This is the distinction the language already makes, made
  visible.
- **The strip is part of the inspector model.** The editor service marks the strip's fields and
  gives colour fields their swatches; the canvas only draws them. VS Code and the playground get
  the same strip without code of their own.
- **Themes are edited where they are written.** Creating a theme writes a block in the file or
  `themes/<id>.meltemi` plus the default of `project.json` (a minimal text edit of one field).
  The theme panel writes each token into the block's own file through `setThemeToken` and
  `removeThemeToken`. Edits of other files are returned to the host, which applies them as it
  applies renames.
- **The speed of effects is a theme token.** `flowDuration`, `dashDuration` and `pulseDuration`
  are times in the theme; the motion planner takes an effect's own duration, else the theme's,
  else the engine's. Built-in themes write none, so no drawing or frame of an existing file
  changes.
- **Styling an anonymous relation names it**, in the same edit, as labels and routes already did.
- **Relations are drawn with a tool too.** The palette's relation tool sends the same action as a
  drag from a connection handle; it only makes the gesture discoverable.

## Alternatives considered

- **Named colours of one's own (`brand1`).** A second vocabulary beside the tokens, which every
  theme would have to define; the sixteen tokens already cover the roles a diagram needs.
- **A floating style bar over the selection.** Closer to Excalidraw, but it covers the drawing
  and needs its own keyboard model; the owner preferred draw.io's sidebar.
- **Rewriting `project.json` through `JSON.stringify`.** Simple, but it would reformat the
  owner's file; a one-field edit keeps it as written.
- **A global default speed in the settings.** It would make the same file animate differently on
  two machines; a theme travels with the project.

## Consequences

- What is seen on the canvas is what every export draws: the strip and the panel only write text.
- A theme of the project changes every diagram that follows it; the status line names the file
  each change is written to, and each host's undo is per file.
- Fonts are chosen among families exports can embed; a hand-written stack is kept and shown as
  "custom".
