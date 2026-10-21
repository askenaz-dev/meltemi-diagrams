# 0018. The free profile

Status: accepted (free-profile change, 10 October 2026)

## Context

The proposal names four diagram types. `free` is for slides, executive compositions and
explanations that do not fit a strict notation. It asks for boxes, text, icons, images, groups and
connections, every adjustment saved as code, children of a group in the coordinates of its
interior, layers, and the conversion of a specialised view into a free copy that keeps identity
links without promising reversibility. Flow diagrams already have the whole pipeline: model,
layout with ELK, rendering, edits, language services and the canvas.

## Decision

- **One model.** Free diagrams compile into the `FlowDiagram` structure with `type: "free"`. A
  profile table (`FLOW_PROFILE`, `FREE_PROFILE`) lists each profile's kinds, shorthand kinds,
  block statements, diagram properties with their defaults, and style properties; the analyser
  reads the table instead of fixed lists. Layout, edits, the session, the inspector and the
  clipboard handle both profiles.
- **Objects.** `box`, `text`, `icon`, `image` and `group`. Boxes take `shape`; boxes and text take
  `fontSize`, `fontWeight` and `textAlign`. Flow diagrams refuse these properties and free
  diagrams refuse the flow kinds, by name, so a mixed-up file explains itself.
- **Interior coordinates.** A child's `place` is relative to its group's top-left corner plus
  `groupPadding` and `groupHeader`. Groups need a `place`; their size is written or derived from
  their children's local edges, so moving a group never changes it. Before the flow pipeline runs,
  a frame pass turns local places into diagram coordinates, innermost sizes first and outermost
  centres first. `LayoutResult.origins` gives each child's interior origin, and every host (canvas,
  inspector, Arrange, the `layout` command) writes positions through it.
- **Layers.** `layers` lists layers back to front, with `main` implicit and last when unlisted.
  The scene paints layer by layer, groups first, then objects in source order, then relations.
  Bring to front and send to back reorder declarations, so the order lives in the text.
- **Links.** `link <diagram>.<element>` (and through imports) records identity. The model resolves
  same-file links; the project resolves imported ones. Rename rewrites links, removal lists them
  as dependents, ungroup removes the links to the group, go to definition follows them. Nothing is
  synchronised.
- **Images.** Project files (PNG, JPEG, GIF, WebP, sanitised SVG, 8 MB at most), read from their
  headers by `@meltemi/diagrams-assets`, cached by the workspace, resolved by
  `LayoutOptions.images`, and embedded as `data:` URIs inside `<image>`, so exports stay
  standalone. Without a resolver a placeholder is drawn with a warning.
- **Conversion.** `convertToFree` copies a flow diagram from its model and its drawn boxes, which
  the host passes with the theme measures, so the edit package needs no layout engine. The
  drawing of each flow kind becomes a class `from_<kind>` applied first to the converted objects,
  with the diagram's rules for that kind merged in, which keeps the precedence of rules below
  classes.

## Alternatives considered

- **A separate free model and pipeline.** Every tool would be written twice for the same geometry.
- **Absolute coordinates for children.** Moving a group would rewrite every child, and the text
  would not say what belongs together.
- **Explicit styles for converted kinds.** `style` statements outrank classes, so a converted tag
  would lose its class colours; a first class keeps the order.
- **Image references by URL.** Network references stay off, and exports must be portable.

## Consequences

- Free diagrams get completion, hover, definitions, quick fixes, the canvas palette, the inspector,
  Arrange and export from the same code as flow diagrams.
- Converted copies differ from their sources only in documented details: tag font, tag order
  under connectors, file-theme rules for flow kinds, and re-routed connectors.
- Sequence and C4 profiles can reuse the profile table and links when they arrive.
