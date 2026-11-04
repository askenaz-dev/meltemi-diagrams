## ADDED Requirements

### Requirement: Image items
The scene SHALL support an image item with a box, a data URI and an optional title. `renderSvg` SHALL draw it inside the element's `<g data-id>` as `<image x y width height href="data:…" preserveAspectRatio="xMidYMid meet">`, followed by a `<title>` holding the description when one exists. A scene with the same image twice SHALL embed it twice; no external reference SHALL be written. The placeholder for an unavailable image SHALL be a dashed rectangle with the file name.

#### Scenario: Image in the SVG
- **WHEN** a free diagram with `image logo "logo.png" { description "Company logo" }` sized (160, 40) is rendered with a resolver
- **THEN** the SVG holds `<g data-id="logo">` with an `<image` of width 160 and height 40, a `data:` `href`, `preserveAspectRatio="xMidYMid meet"` and `<title>Company logo</title>`

### Requirement: Free diagrams render through the same pipeline
`renderSvg` SHALL draw free scenes with the same structure, determinism and font policies as flow scenes. Free text objects SHALL be text items without a frame. Box shapes SHALL be path or rect items, and layer order SHALL be the order of the items.

#### Scenario: Free corpus snapshot
- **WHEN** `corpus/valid/free/overview.meltemi` is exported with the `system` policy
- **THEN** the SVG matches the stored snapshot, and rendering it twice gives identical text
