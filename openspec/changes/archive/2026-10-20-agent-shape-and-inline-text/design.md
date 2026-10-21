## Context

- `BOX_SHAPES` (model `schema.ts`) has 22 values; the canvas mirrors them in
  `packages/editor/src/canvas/protocol.ts` `SHAPES` (pinned equal by a test); every geometry fact
  comes from `packages/layout/src/shapes.ts` (`SHAPE_SIZES`, `shapeOutline`, `onOutline`,
  `shapeMagnets`, `pointInShape`, `shapeTextArea`), and the canvas draws its pictures from
  `shapeOutline` through the `@meltemi/diagrams-layout/shapes` subpath. `person` is a head circle
  over a rounded body with the text in the body.
- Creation: the session's `create` writes `createElement` with `defaultLabel(kind)` ("Box",
  "Node", …) and the canvas opens the label editor on the new element (`app.ts` ~566).
- The inline editor (`app.ts` `editLabel` ~3925) is an `<input class="inline">` placed across the
  middle of the element's box, at least 120 px wide, styled by `canvas.css`.
- Labels and descriptions are split into lines at `\n` by the layout (`splitLines`).

## Decisions

### The `agent` shape

`agent` joins `BOX_SHAPES` after `person`. Its outline: a head — a rounded square of side
`min(0.42 w, 0.45 h)` centred on top, with two eyes (small circles at a third and two thirds of
its width, a quarter of its height above its middle) and an antenna (a 0.12 h line from the top of
the head ending in a dot) — over a rounded body taking the rest of the height (radius as
`person`'s body). The text area and the text centre are the body's, as for `person`; the outline
polygon is the body and the head (the antenna and eyes are details of the path, not of the
outline), so the north middle magnet and a north end meet the top of the head. Default size
160 × 120 at label size 13. Details scale with `min(w, h)` and are clamped so a 24 px box still
draws. Names: "agent" / "agente" in the grid and the inspector. *Alternative:* a box with a robot
icon (already possible with `icon`), which the owner did not find as a node of its own.

### Empty labels on creation

The session's `create` passes `label: ""` for `node`, `decision`, `data` and `box` (and the shapes
grid), so the text gains `node1[""]`, `decision decision1 ""`, `data1[("")]` and `box box1 ""`;
the new element is selected and the canvas does not open the editor for those kinds. `text`,
`note` and `tag` keep `defaultLabel` and the editor opens; groups keep "Group"; library elements
keep their label; sequence participants keep theirs. The edit package's `defaultLabel` is
unchanged (other callers keep it). *Alternative:* omit the label (rejected: a declaration without
a label shows its id).

### The inline editor

- A `<textarea class="inline">` (no `<input>`, so no autocomplete list), with `autocomplete`,
  `autocorrect`, `autocapitalize` off and `spellcheck="false"`.
- Placed over the text area of what is edited, in screen coordinates: an element's inscribed text
  area (the layout's `shapeTextArea` through the canvas's shape geometry, the body of `person` and
  `agent`, the label box of other kinds, a free text's box), a relation's label pill or, without a
  label, its midpoint.
- Styled as the drawing: the theme's font family, the label's font size times the zoom, its
  weight, colour and alignment (`textAlign` for free boxes and texts), line height 1.25, no
  background, no border; a 1 px outline in the canvas's `selection` colour marks it; the drawn
  label of that element or relation is hidden while editing and comes back on commit or cancel.
- Without soft wrapping (`white-space: pre`): it grows in width around its alignment point and in
  height with its lines, staying centred on the text area vertically.
- Keys: Enter commits, Shift+Enter inserts a line break (the label is written with `\n`), Escape
  cancels, Tab commits; a click outside commits. An empty commit on a shape writes `""`.
- The same editor serves ids (Shift+F2: one line, the id's font), relation labels and the
  sequence diagram's notes, fragments and dividers.

## Packages and interfaces

- `@meltemi/diagrams-model`: `BOX_SHAPES` + `agent`.
- `@meltemi/diagrams-layout`: agent geometry in `shapes.ts`; `BoxShape` + `agent`.
- `@meltemi/diagrams-editor`: `SHAPES` + `agent`; `create` writes empty labels for shape kinds;
  `ElementInfo` keeps what the canvas needs to place and style the editor (font size, weight,
  colour, alignment and the text area, from the layout) — a new `ElementInfo.text` field if the
  canvas cannot compute it.
- `@meltemi/diagrams-canvas`: names and picture of `agent`; the inline editor; no editor opened
  after creating a shape.

## Risks / Trade-offs

- [An empty shape is harder to find in the text] → its id names it (`box1`), and the outline and
  inspector show it.
- [Labels with `\n` in flow nodes] → the layout already splits labels at `\n`; tests cover a
  two-line node label drawn inside its shape.
