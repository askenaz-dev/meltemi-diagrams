## Why

The canvas already edits everything the language can express and writes every gesture into the
text, but styling it is typing: colours are text fields with a list of token names, custom themes
exist only as hand-written `theme` blocks, icons on flow nodes are typed as `tabler:…`, an
anonymous relation refuses a colour or an effect until someone names it, and the default speed of
an effect is a constant nobody can change. Every drawing tool people come from (draw.io,
Excalidraw, Lucidchart) gives them a format panel with swatches and lets them derive their own
theme from a built-in one. The owner's review of 1.0 asks for exactly that: direct styling on the
canvas, custom themes that extend the base ones, and a default animation speed a theme can set.

## What Changes

- **A quick style strip in the inspector.** The top of the inspector becomes a format panel, as in
  draw.io's sidebar: swatches of the effective theme's colour tokens for fill, stroke and text, a
  colour picker for a value of one's own, a "theme" control that returns to the inherited value,
  line style, width, arrowhead, and the effects (flow, dash, pulse) with their speed. It applies to
  one item or to the whole selection, and every control writes the same `style` and `animate`
  statements the fields below it write today. Swatches write token names, so a styled box follows
  the theme; the picker writes a colour, which stays fixed.
- **Styling names anonymous relations.** Setting a style or an effect on `a -> b` names it in the
  same edit (`as a_b`), as labels and routes already do; relations also get a classes field.
- **A relation tool in the palette.** Click the source, click the target: `a -> b` (`-->` with
  Shift), beside the connection handles and the C key that exist today.
- **An icon picker in every profile.** The Icon style field opens the searching picker that free
  `icon` objects already have, for flow nodes, participants and relations.
- **Custom themes from the canvas.** The Theme field offers "New theme from this one…", which
  writes `theme <id> { extends "<current>" }` into the file or as the project's theme file and
  default, and "Edit theme…", which opens a theme panel: colour tokens with swatches and a picker,
  fonts chosen among the bundled and the project's fonts, type sizes, spacing, shape, icons, the
  frame and the effect durations. Each change is a minimal text edit of the theme block, in the
  file that holds it. Three edit operations carry it: `createTheme`, `setThemeToken` and
  `removeThemeToken`.
- **Effect durations in themes.** Three new theme tokens, `flowDuration`, `dashDuration` and
  `pulseDuration`, give a theme its own default speed; an effect that writes no `duration` takes
  the theme's, else the engine's constant (1200 ms for flow, 1 s otherwise). The scene carries the
  resolved durations so the planner, the players and the exports agree. This is the only language
  change, and it is additive within language 0.2.
- **Light and dark in one click.** The strip's theme row offers the light or dark counterpart of
  the current built-in family; choosing it writes `theme "<family>.dark"`. The playground's page
  switch keeps changing only the page.
- The product version moves to 1.1.0.

Out of scope, as decided: standalone lines that connect nothing, a font family per element, colour
tokens with names of one's own beyond the fixed set, arranging only a selection, and the laser
pointer for presentations (a change of the player).

## Capabilities

### New Capabilities

- `quick-styling`: the style strip of the inspector (swatches, picker, inherit, line, width,
  arrowhead, effects and speed) for one item or a selection, the naming of anonymous relations
  when styled, the relation tool of the palette, the icon picker from the Icon field, and the
  light/dark counterpart of a theme.
- `theme-editing`: creating a theme that extends the current one, in the file or as the project's
  theme file, and editing its tokens from a panel, with the edit operations that write theme
  blocks and the limits on fonts.

### Modified Capabilities

- `theme-tokens`: the token table gains `flowDuration`, `dashDuration` and `pulseDuration`.
- `motion-effects`: an effect without `duration` takes the theme's duration token before the
  engine's constant; scenes carry the resolved durations.
- `diagram-canvas`: the palette creates relations with a tool; the inspector starts with the style
  strip and styles a multiple selection.
- `motion-editing`: effects in the inspector work on anonymous relations by naming them, and show
  the theme's default speed.

## Impact

- Language and model: `packages/model` (theme tokens, scene defaults), `packages/motion` (planner
  defaults), `packages/layout` (theme resolution into the scene), docs `styles.md` and
  `motion.md`, corpus and conformance cases, the model JSON (additive).
- Editing: `packages/edit` (three theme operations, relation naming on style and effect),
  `packages/editor` (inspector model with swatches and theme panel, project theme creation,
  `project.json` default theme edit), `packages/canvas` (strip, picker, relation tool, theme
  panel), both hosts for the icon pick and for creating a project theme file.
- No new dependencies: the colour picker is the browser's `<input type="color">`.
- Drawings do not change: no visual reference moves unless a theme is edited.
