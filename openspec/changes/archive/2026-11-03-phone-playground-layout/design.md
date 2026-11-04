# Design

## Context

Below 768 px `Playground` (`packages/playground/src/shell.ts`) adds `narrow` to the shell and shows
one of three tabs, Files, Code and Canvas; it showed Code at start. The header is a wrapping flex
row: the brand with its name and tag, then the actions, where Open, Import, Share and Export
already hide their words on a narrow screen, but the Download and language menus and the sign-in
link kept theirs, and the separators stayed. The canvas's toolbar wraps its tools (`canvas.css`).
The canvas sizes its first fit with `screen()`, which falls back to 800 × 600 while its stage has no
size, as it had behind the Code tab.

## Decisions

1. The narrow view starts on the canvas (`view = "canvas"`). The stage is then visible when the
   first drawing comes, so the first fit is the stage's own; no change to the canvas is needed.
   Opening a file from Files and following someone's file still show the code.
2. The narrow header is one row: the brand is its logo, separators go, every button shows its
   picture only (its words stay for assistive technology, its title for the bubble), the menu
   buttons lose their chevrons, and the theme switch, About and the language go into a **More**
   menu (three dots), made with the existing `menuButton`; More is hidden on wide screens. The
   language choices are More's entries after a separator, with their own names and the
   Automatic entry's detail. Even with pictures only, the header's eleven controls need about
   426 px, more than a 360–412 px phone, so some had to move; these three are the least used.
   From 360 px the row fits; at 320 px it wraps to two rows, inside the screen.
3. The canvas's toolbar is one row on a narrow screen that scrolls sideways, with soft shadows at
   an edge where more tools lie, drawn as the canvas's menus draw theirs. The canvas's menus open
   below the toolbar, in its main area, so the scrolling row clips none of them. The rule is the
   playground's, scoped to `.shell.narrow #app`, so a narrow VS Code panel keeps its wrapping
   toolbar.
4. The account button of a person signed in is its picture on a narrow screen; its name stays in
   its accessible name and its menu.

## Risks and verification

Scenarios at 360, 375 and 412 px measure the header and the toolbar as one row each with no
sideways scrolling, open a menu of the scrolled toolbar in view, check More's entries and its theme
switch, and check that a wide screen has the buttons and no More. The existing header scenarios
check the header inside the screen from 320 px to 1440 px, signed in or not.
