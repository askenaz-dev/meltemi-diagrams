## Context

- **Flow is complete.** Language, model, layout with ELK, rendering, edits, the editor services and
  the VS Code canvas all exist for flow diagrams.
- **Free only parses.** `diagram <id>: free { }` reports `profile.unsupported`. The proposal's
  example uses `canvas`, `theme`, `layout manual`, `text`, `box`, a relation, `placement` and
  `animate`.
- **The proposal asks for the following:**
  - boxes, text, icons, images, groups and connections, every adjustment saved as code;
  - group children in the coordinates of the group's interior;
  - waypoints in diagram space, with route ends bound to their objects;
  - layer order and the canvas tools (multiple selection, align, distribute, guides, grouping,
    layers, resize);
  - conversion of a specialised view to `free` as an explicit copy that may keep identity links,
    without promising reversibility.

## Goals / Non-Goals

**Goals:**

- Free diagrams with every object kind, interior coordinates, layers and links, through the
  existing pipeline and tools.
- A faithful conversion from flow, with links back to the source elements.

**Non-Goals:**

- Sequence and C4 profiles and model links (roadmap changes 10 and 11).

## Decisions

### D1. One model for flow and free

- **Shared model.** Free diagrams compile into the same `FlowDiagram` structure, with `type: "free"`,
  so layout, edits, the session, the inspector and the clipboard handle both.
- **Profile schema.** A profile table (`FLOW_PROFILE`, `FREE_PROFILE`) lists, for each profile:
  - element kinds and the statements of their blocks;
  - diagram properties and their defaults;
  - style properties.

  The analyser reads the table instead of fixed lists.

| | flow | free |
|---|---|---|
| Kinds | node, decision, data, group, note, tag | box, text, icon, image, group |
| Shorthand `id["L"]` | node | box |
| Shorthand `id[("L")]` | data | box with `shape cylinder` |
| Default `layout` | `auto` | `manual` |
| Extra diagram properties | — | `layers` |
| Extra block statements | `link` | `layer`, `link` |
| Extra style properties | — | `shape`, `fontSize`, `fontWeight`, `textAlign` |
| Group children | diagram coordinates | interior coordinates (D3) |

Alternative: a separate free model and pipeline. Rejected because every tool would be written
twice for the same geometry.

### D2. Objects

| Declaration | Object | Default size |
|---|---|---|
| `box <id> ["Label"] [{ … }]` | a shape with label and description | as a flow node, from the measured text |
| `text <id> "Text"` | measured text without a frame; `\n` breaks lines | the text's extent |
| `icon <id> "<pack>:<name>"` | an icon from the packs, coloured by `iconColor` | 48 × 48 |
| `image <id> "<path>"` | an image file of the project, alternative text from `description` | its pixel size, at most 640 wide, keeping the ratio; 160 × 120 when unknown |
| `group <id> ["Label"] { … }` | a band with title, holding objects and relations | written or derived (D3) |

**Text properties (free only):**

| Property | Values | Default |
|---|---|---|
| `shape` | `rounded`, `rectangle`, `ellipse`, `diamond`, `cylinder`, `pill` | `rounded` |
| `fontSize` | 6 to 160 | the theme's label size, or 1.6 times it for `text` |
| `fontWeight` | 400, 500, 600, 700 | the theme's |
| `textAlign` | `left`, `center`, `right` | `center` for boxes, `left` for text |

### D3. Interior coordinates

- **Interior origin.** The interior of a group starts at its top-left corner plus `groupPadding`
  across and `groupHeader` down.
- **Relative places.** In a free diagram, the `place` of a child is relative to the interior origin
  of its innermost group. Top-level objects use diagram coordinates, and so do route waypoints.
- **Groups need a place.** Without one, a group is `layout.missing-placement` in `manual`.
- **Group size.** A group without `size` takes:
  - width `groupPadding + max(child right) + groupPadding`;
  - height `groupHeader + max(child bottom) + groupPadding`;

  measured from the interior origin, so moving the group never changes it.

**Frame algorithm, run before the flow pipeline:**

1. Compute every size.
2. Walk the groups from the outermost inwards: a group's centre is its parent's interior origin
   plus its local place; its box comes from its size; its interior origin follows.
3. Children's absolute centres are their parent's origin plus their local place.
4. The result feeds the existing pipeline as absolute places and explicit group boxes.

`LayoutResult.origins` maps each child to its parent's interior origin, so hosts convert drawn
positions back to written ones.

**Modes:**

- **`auto`.** The engine arranges everything and groups fit their children, as in flow. Writing the
  arrangement down gives each group a `place` and a `size`.
- **`assisted`.** Groups must be placed: a placed child of an unplaced group cannot be read and is
  `layout.missing-placement` on the group.

### D4. Layers and paint order

- **Declaring layers.** `layers a, b, c` lists layers from back to front. `main` is always a layer;
  when it is not listed it comes last.
- **Using a layer.** `layer <name>` in an element or relation block picks its layer. An undeclared
  name is `ref.unknown-layer`.
- **Paint order.** The scene paints layer by layer. Within a layer, groups come first (outer before
  inner), then the other objects in source order, then relations. Tags and notes of flow keep
  their order; flow has a single layer.

### D5. Identity links

- **Syntax.** `link <diagram>.<element>` in an element block. The reference resolves to an element
  of another diagram of the same file, or, through an import binding, of an imported file
  (`<binding>.<diagram>.<element>` for namespace imports).
- **Errors.** An unresolved link is `ref.unknown-link`. The model resolves same-file links; the
  project resolves imported ones.
- **Editing.**
  - Renaming the source element rewrites the element part of every link to it in the file.
  - Removing it lists the links as dependents, and cascade removes them.
  - Go to definition on a link opens the source element.
- **Meaning.** A link is identity and metadata only, as the proposal says. Nothing is synchronised
  between the views.

### D6. Images

- **Paths.**
  - Image paths are relative to the file (`./` optional) and use `/`.
  - They must stay inside the project root, else `asset.outside-project`.
  - URLs and absolute paths are refused the same way, since network references stay off.
- **Formats.**
  - Supported: PNG, JPEG, GIF, WebP (read from their headers for the pixel size) and SVG.
  - SVG is sanitised with the icon sanitiser and its size comes from `viewBox`, `width` or
    `height`.
  - Unknown or broken files, and files over 8 MB, are `asset.unsupported-image`. A missing file is
    `asset.unknown-image`. The project checks all three when it has asset services.
- **Layout and rendering.**
  - `LayoutOptions.images` resolves a path to its data URI and size; `ProjectSessions` provides it.
  - Without a resolver, or for a missing file, the layout draws a placeholder and reports
    `layout.image-unavailable` (warning).
  - The renderer writes `<image href="data:…" preserveAspectRatio="xMidYMid meet">`, with the
    description as `<title>`, so the SVG stays portable.

### D7. Conversion from flow

`convertToFree { diagram, id?, boxes, metrics }` inserts `diagram <id>: free { }` after the source
diagram, with a default id of `<source>_free` (`_2`, `_3`… if taken). The copy is built from the
source's model and its drawn boxes. The host passes:

- `boxes`, from `LayoutResult.boxes`, so the edit package needs no layout engine;
- `metrics`, from `LayoutResult.theme`: the group padding and title band (to write interior
  coordinates) and the note and tag text sizes.

**Properties:** `title`, `description`, `theme`, `preset` or `canvas`, `routing` and `direction` are
copied when set, and `layout manual` is set.

**Objects:**

| Flow | Free | Kind class |
|---|---|---|
| node | `box` | — (or the diagram's `rule node`) |
| decision | `box` | `from_decision { shape diamond }` |
| data | `box` | `from_data { shape cylinder }` |
| note | `text` | `from_note { textAlign left; fontSize <note>; fontWeight 400; color muted }` |
| tag | `box` | `from_tag { shape pill; fill tag; stroke tag; color tagText; fontSize <tag>; fontWeight 500 }` |
| group | `group`, with its children and relations nested the same way | — |

- **Kind classes.** Free kinds are fewer than flow kinds, so the drawing of each flow kind becomes
  a class applied first to the converted objects. The diagram's `rule <kind>` properties for that
  kind are merged into the class. Precedence is kept: rules came before classes, and the kind
  class comes before the element's own classes. Rules for groups and relations are copied.
- **Blocks.** Each object keeps its id, label, description, classes and ports, and gains
  `link <source>.<id>`.
- **Positions.** Every object gets its drawn `place` and `size`: top-level in diagram coordinates,
  children in interior coordinates of their copied group. Groups get `place` and `size`.
- **Relations.** They keep their ids, labels, arrows and blocks. `route` keeps the written ports
  and waypoints, except for `layout auto` sources, whose waypoints were not drawn; `label` is
  copied.
- **Styles, classes and animations.** Copied as written.

The copy renders like the source except for kind-specific details, which the docs list: tags use
the body font instead of the mono font and sit under connectors; file-theme rules for flow kinds do
not reach the copy; connectors are routed again between the same boxes. The canvas command opens
the new diagram. The CLI is
`meltemi-diagrams convert <file> --to free [--diagram <id>] [--id <new>] [--stdout] [--check]`.

### D8. New edit operations

| Operation | Effect |
|---|---|
| `createElement` with `box`, `text`, `icon`, `image` and `source` | `box id "Label"`, `text id "Text"`, `icon id "pack:name"`, `image id "path"`; in free, `at` is relative to the parent's interior, as given by the host |
| `reorderElement { element, to }` | Moves the declaration to the front (last in its block), the back (first), forward or backward past one sibling declaration |
| `setElementProperty { target, targetKind, property, value }` | Sets or removes `layer` or `link` in the block |
| `arrange` with `writeGroups` | Also inserts `place` and `size` for groups (free) |
| `setElementSource { element, source }` | Replaces the icon reference or image path |
| `convertToFree` | D7 |
| `renameElement`, `removeElement` | Also update or list links (D5) |

### D9. Editor tools for free diagrams

- **Palette** (by profile): box (B), text (T), icon (I), image (M), group (G) and connect (C). In
  flow, T still creates a tag.
  - **Icon:** asks the host for a choice from the packs (a quick pick that searches as you type).
  - **Image:** asks for a file in the project (an open dialog) and stores the path relative to the
    `.meltemi` file. Files outside the project are refused with the reason.
- **Order and layers:**
  - Bring to front (Ctrl+Shift+]), send to back (Ctrl+Shift+[), bring forward (Ctrl+]), send
    backward (Ctrl+[), in the context menu as well;
  - the inspector's Layer field, and the diagram's Layers field.
- **Coordinates.**
  - The session writes child positions relative to their group (`LayoutResult.origins`) for moves,
    creations in a group, alignment, distribution, pastes and arrangements.
  - Moving a group writes only the group's place.
  - Resizing a group from the left or top shifts its children's places by the opposite amount, so
    they stay where they are drawn.
- **Copying.** A copy of a child whose group is not copied carries its drawn (absolute) position.
- **Conversion.** **Convert to Free Composition** (canvas toolbar menu, context menu and command
  palette) converts the current flow diagram and switches the canvas to the copy.
- **Language services:** completion of kinds, shapes, layers, link targets, image paths from the
  project and the new style properties; hover for the new kinds and for links; definition on links;
  quick fixes (declare an unknown layer, remove an unknown link, correct a typo).

## Risks / Trade-offs

- [Conversion is not reversible] → As the proposal says; the links keep traceability, and the flow
  diagram stays untouched.
- [Large images bloat the SVG] → The 8 MB limit, and images are embedded only once per render.
- [Interior coordinates surprise users who expect absolute ones] → The inspector shows written
  values, the docs explain the frame, and the canvas writes them correctly.
