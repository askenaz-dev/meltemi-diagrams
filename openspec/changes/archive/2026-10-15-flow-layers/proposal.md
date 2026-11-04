## Why

The owner wants layers in their architecture diagrams: to add layers, and to put elements at
different depths, as draw.io and ProcessOn do with coloured bands behind groups of boxes. Layers
and the paint order exist for free compositions only (`layers`, `layer`, bring to front); flow
diagrams refuse them, and no diagram has a panel to manage layers.

## What Changes

- **Layers in flow diagrams.** `layers back, main, front` and `layer <name>` on elements, groups
  and relations work in flow diagrams as in free ones; the scene is painted layer by layer. The
  inspector's Layer and Layers fields show for flow diagrams.
- **A layers panel.** The canvas gets a Layers panel (toolbar toggle, key L) listing the layers
  front to back with how many things each holds: add a layer, rename it, remove it (its elements
  go back to `main`), move it up or down, hide or show it on the canvas, and move the selection
  to it. Hidden layers are a canvas-only view: nothing is written.
- **Layers in the SVG.** Every element and relation group on a layer other than `main` carries
  `data-layer="<name>"`, so hosts and stylesheets can address layers.
- The language stays 0.2: `layers` and `layer` are existing statements, accepted by one more
  profile.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `free-diagram-model`: layers in flow diagrams.
- `free-editor-tools`: the Layer fields in flow diagrams; the Layers panel.
- `flow-svg-export`: `data-layer` on groups.

## Impact

- Model: `FLOW_PROFILE` takes `layers` and `layer`. Edit: `setElementProperty layer` in flow;
  new `renameLayer` op. Layout/scene: `GroupItem.layer`; render writes `data-layer`. Canvas:
  `LayersPanel`, settings `layers`, key L. Editor: inspector fields; the session's `layers`
  actions.
- Docs: `docs/language/grammar-0.2.md`, `free.md`, `svg-export.md`, `docs/editor.md`, Spanish
  versions, the skill reference; CHANGELOG 1.7.0.
