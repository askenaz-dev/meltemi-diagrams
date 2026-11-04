# Phone playground layout

## Why

On a phone the owner found the top of the playground taking too much room and the page opening on
the code. At 412 × 915 the header took four rows (135 px), the tabs 37 px and the canvas's toolbar
three or four rows (83 px on the flow template, more on a sequence diagram): 255 px before the
canvas. The page opened on the **Code** tab, and the canvas, hidden while it was first drawn, fitted
its drawing to an 800 × 600 stage, so part of it was off the screen when the tab was chosen.

This is a post-1.0 presentation change outside `docs/roadmap-1.0.md`.

## What changes

- A narrow screen opens on the **Canvas** tab, its drawing fitted to the real stage.
- The narrow header is one row of buttons without their words, with a **More** menu for the theme
  switch, About and the language.
- The canvas's toolbar is one row that scrolls sideways on a narrow screen.

## Capabilities

- Modified: `web-playground` (the narrow layout and its header).

## Impact

`packages/playground` (`shell.ts`, `playground.css`, the icons and the header's words in English
and Spanish), its browser scenarios and the playground guide in both languages. Wide screens, the
canvas package and VS Code are unchanged.

## Non-goals

Opening a file from **Files** still shows the code, as the explorer's requirement says. The size
of the minimap on a phone is a separate question.
