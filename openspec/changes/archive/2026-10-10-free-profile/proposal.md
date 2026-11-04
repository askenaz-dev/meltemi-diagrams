## Why

The proposal names four diagram types; `free` is the one for slides, executive compositions and
explanations that do not fit a strict notation. Today `diagram <id>: free { }` parses but is
reported as `profile.unsupported`. Roadmap change 9 asks for the complete free profile now:

- its objects, groups with interior coordinates, layers, connections and editor tools;
- the explicit conversion of a specialised view into a free copy that keeps identity links.

## What Changes

- **Free diagrams compile.** `diagram <id>: free { }` accepts the following:
  - `box`, `text`, `icon`, `image` and `group` objects (the shorthand `id["Label"]` is a box);
  - relations `->` and `-->`;
  - `placement`, constraints, `style`, `class`, `rule` and `animate`, as in flow;
  - the diagram properties of flow, with `layout manual` as the default, and `layers`.
- **Objects:**
  - **Boxes** take a `shape`: `rounded` (default), `rectangle`, `ellipse`, `diamond`, `cylinder` or
    `pill`.
  - **Text** objects are measured and take `fontSize`, `fontWeight` and `textAlign`.
  - **Icons** are drawn from the icon packs at 48 units by default.
  - **Images** are project files (PNG, JPEG, GIF, WebP or sanitised SVG), embedded in the export,
    with their description as alternative text.
- **Groups with interior coordinates.** The `place` of a child of a group is relative to the
  group's interior (its top-left corner inside the padding and the title band), so moving a group
  moves its contents without rewriting them. A group's `size` is written, or derived from its
  children.
- **Layers and order.** `layers back, main, front` orders the layers, `main` being the default
  layer. Elements and relations take `layer <name>` in their block. Within a layer, objects are
  painted in source order.
- **Identity links.** `link <diagram>.<element>` in an element block ties a free object to the
  element of another diagram in the file, or of an imported file. Rename keeps links in step,
  removal lists them as dependents, and go to definition follows them.
- **Conversion.** The `convertToFree` edit operation, `meltemi-diagrams convert --to free` and the
  editor command copy a flow diagram into a new free diagram in the same file. The copy has every
  position and size as drawn, the routes, labels, styles and animations, kind-matching shapes, and
  a `link` from each object to its source. The flow diagram is unchanged.
- **Layout and rendering.**
  - Free diagrams render through the same pipeline: frames for interior coordinates, the new kinds
    and shapes, layers, and an image scene item drawn as `<image>`.
  - `LayoutOptions.images` resolves image files.
  - `LayoutResult.origins` gives the interior origin of each child, so hosts write relative
    coordinates.
- **Editor tools for free diagrams.** In the VS Code canvas:
  - a palette of box, text, icon (with an icon picker) and image (with a file picker);
  - bring to front or back and forward or backward;
  - layers in the inspector;
  - moves, resizes and arrangements that write interior coordinates;
  - a **Convert to Free Composition** command for flow diagrams.

  Language services cover the new statements, kinds, shapes, layers and links.
- **New diagnostics:**
  - `ref.unknown-layer` and `ref.unknown-link`;
  - `asset.unknown-image`, `asset.unsupported-image` and `asset.outside-project`;
  - `layout.image-unavailable`.

## Capabilities

### New Capabilities

- `free-diagram-model`: the free profile's statements, object kinds, layers, links and validation.
- `free-layout`: frames for interior coordinates, sizes and drawing of the new kinds, layers and
  images.
- `view-conversion`: copying a flow diagram into a free diagram with identity links, as an edit,
  a command and a CLI command.
- `free-editor-tools`: the canvas and language-service support specific to free diagrams.

### Modified Capabilities

- `flow-diagram-model`: profile gating lets `free` compile.
- `model-json-interchange`: free diagrams, layers, links and sources in JSON.
- `source-editing`:
  - `createElement` for free kinds;
  - `reorderElement`;
  - `setElementProperty` (layer, link);
  - `arrange` that places groups;
  - links in rename and removal.
- `project-assets`: image files of a project are checked and resolved.
- `flow-svg-export`: the scene gains image items, which the renderer draws.

## Impact

- **`@meltemi/diagrams-model`:** the free profile, `FlowDiagram.type` `"flow" | "free"`, element
  `layer`, `link` and `source`, diagram `layers` and `links`, JSON keys, and the new codes.
- **`@meltemi/diagrams-layout` and `@meltemi/diagrams-render`:** free frames, kinds, shapes, layers
  and images.
- **`@meltemi/diagrams-assets` and `@meltemi/diagrams-project`:** image reading and checks.
- **`@meltemi/diagrams-edit`, `@meltemi/diagrams-editor`, `packages/vscode` and
  `@meltemi/diagrams-cli`:** the operations, tools and commands above.
- **Corpus:**
  - the free example moves from `parse-only` to `valid`;
  - new valid free sheets with images and links;
  - invalid cases for every new code.
- **Docs:** `docs/language/free.md`, the grammar, diagnostics, the editor guide and the skill.

## Non-goals

- The `sequence` and `c4` profiles and links to model entities, which come with those profiles
  (roadmap changes 10 and 11).
- Animation of free compositions beyond the existing `animate` statements (changes 13 and 14).
