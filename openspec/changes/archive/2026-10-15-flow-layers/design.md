## Context

`layers` is read by the shared analyzer when the profile's `diagramProperties` has it, and
`layer` on elements, groups and relations when the profile's property tables have it
(`FREE_PROFILE` only). The layout paints every profile through `paintOrder`, which walks the
layers, so flow diagrams already paint `main` only. `reorderElement` and the z-order keys work in
flow diagrams. The inspector gates the Layer field on `type === "free"`; `setElementProperty
layer` refuses other types. The diagram's Layers field is a comma-separated text field: no way to
add a layer with a click, to rename one, or to see what is on it.

## Goals / Non-Goals

**Goals:** layers in flow diagrams with the same text; a panel that makes layers usable without
typing; the layer readable from the SVG.

**Non-Goals:** layers in sequence diagrams (events are ordered) and C4 views (drawn from the
model); exporting a hidden layer's state (hiding is a view of the canvas); per-layer locking.

## Decisions

### The same statements

`FLOW_PROFILE.diagramProperties.layers` and `layer` on its element, group and relation tables.
The analyzer, the paint order, completion, hover and the quick fix that declares a layer follow
from the tables. Sequence and C4 keep refusing with `prop.unknown`.

### Panel actions map to edits

- Add: `setDiagramProperty layers` with the new name appended before `main`, generated as
  `layer<n>`; the panel then lets the person rename it.
- Rename: a new `renameLayer` op rewrites the name in `layers` and in every `layer` statement of
  the diagram (`main` cannot be renamed; a taken name is `edit.invalid-value`).
- Remove: a batch of `setElementProperty layer null` for everything on it, then
  `setDiagramProperty layers` without it; removing the last listed layer deletes the statement.
- Up/down: `setDiagramProperty layers` reordered (front is last).
- Move the selection: `setElementProperty layer` for each selected element and relation.
- Hide/show: the canvas adds `visibility: hidden` for `[data-layer="x"]` groups and leaves
  hidden things out of rectangle and keyboard selection; the state lives with the canvas's
  persisted state, per diagram.

Canvas actions: `addLayer`, `renameLayer`, `removeLayer`, `moveLayer`, `setLayer` (ids); the
session plans them. The panel reads `CanvasRender.layers` and counts from `ElementInfo.layer` and
`RelationInfo.layer`.

### `data-layer` in the scene

`GroupItem.layer` is set for element and relation groups whose layer is not `main`; the SVG
renderer writes `data-layer`. Exports gain an attribute only on files that use layers.

## Risks / Trade-offs

- [Hidden layers and edits] → actions on hidden things are refused by the panel's filtering of
  the selection, not by the session; the text stays the truth.
- [Renaming a layer touches many statements] → one edit plan, one undo step.
