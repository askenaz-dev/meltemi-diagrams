## Why

Trying 1.8.0 in the playground, the owner emptied the file to start clean and found no way to
create a diagram from the canvas: the stage only says to type `diagram <id>: flow { }`, while the
diagram selector, the inspector, the minimap and the layout badge keep showing the diagram that is
gone. Nothing in the inspector sets the size of the drawing either: `preset` is a field, `canvas
(w, h)` is not. The arrows that open the shapes grid and the kinds of arrow are 12 px wide with a
9 px grey caret, so they go unnoticed. And while a box is dragged only the box moves: its
connectors, labels and the groups around it stay where they were until the drop, which makes
moving feel rough next to draw.io.

## What Changes

- **A file without diagrams offers to create one.** The stage shows buttons for a flow diagram,
  a free composition and a sequence diagram; the selector, inspector, minimap and badges are
  cleared. A **New diagram** button beside the diagram selector adds one more to any file. Each
  writes `diagram <id>: <type> { }` (and `language "0.2"` when the file has no header) through a
  new `createDiagram` edit, and the canvas shows it.
- **The canvas size in the inspector.** The diagram's **Canvas** field chooses fit to content,
  document, slide or a custom width and height, writing `preset` or `canvas (w, h)` and removing
  the other, since they cannot be combined.
- **Visible split buttons.** The arrow parts of the box/node and relation buttons become clear
  dropdown controls: a chevron at full contrast, a width a pointer hits easily, one outline around
  both parts, hover and focus states, and a tooltip naming the menu and its key; a right-click or a
  long press on the main part opens the same menu.
- **Live preview while dragging and resizing.** During a move or a resize the canvas asks the
  session for a preview of the edit the drop would make; the session plans it on a scratch copy of
  the text, lays it out and answers with the drawing, without writing anything. Connectors,
  labels and groups follow the dragged boxes as they will be drawn after the drop; Escape restores
  the drawing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `diagram-canvas`: the empty file and new diagrams, the canvas size field, visible split buttons,
  live preview of moves and resizes.
- `source-editing`: `createDiagram`.

## Non-goals

- Creating C4 views from the canvas: a view needs a model, which is written in text.
- Live preview of route bends, label drags and sequence diagrams (sequence diagrams already move
  their events live).
- Collaborative preview: other people see the change after the drop, as today.

This is a post-1.0 change outside `docs/roadmap-1.0.md`; it joins the unreleased 1.8.0.

## Impact

- Edit: `createDiagram`. Editor: session actions `createDiagram` and `preview`, host message
  `preview`, the inspector's Canvas field, the empty-state facts. Canvas: empty state, New diagram
  menu, cleared stale state, split-button styling and gestures, live preview of moves and resizes.
  Hosts forward the new messages unchanged.
- Docs: `docs/editor.md` and `docs/es/editor.md`, CHANGELOG 1.8.0.
