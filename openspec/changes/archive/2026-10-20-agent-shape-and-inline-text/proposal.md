## Why

Trying the 1.8.0 canvas, the owner asked for three things. Architecture diagrams now draw AI
agents, and the shapes have a person but nothing for an agent. New boxes and nodes arrive with a
placeholder label ("Box", "Node", "Data") and open the label editor at once, while draw.io and
Excalidraw place an empty shape and add text only on a double-click. And editing a label in place
is rough: a dark single-line input lies across the middle of the shape, in another font and size,
under the browser's own autocomplete list.

## What Changes

- **An `agent` shape.** `shape agent` (the twenty-third shape) draws an AI agent: a robot head with
  an antenna and two eyes over a rounded body that holds the text, as `person` draws a head over a
  body. It has its own default size, text area, outline and magnets, a picture in the shapes grid
  and in the inspector ("Agent" / "Agente"), and works on free boxes and flow nodes like every
  shape.
- **Empty shapes by default.** Nodes, decisions, data stores and boxes created from the palette,
  the keyboard (N, D, S, B), the shapes grid or a drop are written with an empty label
  (`box box1 ""`, `node1[""]`) and selected, without opening the label editor; a double-click,
  Enter or F2 adds the text. Texts, notes and tags, which show nothing without text, keep their
  default text and open the editor; groups keep their title; library elements keep their label.
- **Text edited where it is drawn.** The inline editor becomes a borderless text area over the
  element's text area — the label box, the shape's inscribed area or the relation's label — in the
  font, size, weight, colour and alignment the drawing uses at the current zoom, with the drawn
  text hidden meanwhile. It grows with its lines; Shift+Enter breaks a line (written `\n`), Enter
  or a click outside commits, Escape cancels; the browser's autocomplete, spelling and correction
  are off.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `free-diagram-model`: the `agent` shape.
- `free-layout`: drawing the `agent` shape.
- `diagram-canvas`: empty shapes on creation; editing text in place.
- `free-editor-tools`: the free palette creates empty boxes.

## Non-goals

- An `agent` kind of element, participant or C4 entity: the shape is enough on nodes and boxes,
  and C4 entities come from their model.
- Rich text (bold, colours inside a label) and automatic wrapping of labels: labels stay plain
  text broken at `\n`.

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.8.0.

## Impact

- Model: `BOX_SHAPES` gains `agent`. Layout: the agent outline, size, text area and magnets in
  `shapes.ts`. Editor: the `SHAPES` mirror, empty labels on creation, no editor opened for shapes.
  Canvas: the shape's picture and names, the rewritten inline editor.
- Docs: `docs/language/free.md`, `styles.md`, `docs/editor.md` and their Spanish versions, the
  skill's shape lists, CHANGELOG 1.8.0.
