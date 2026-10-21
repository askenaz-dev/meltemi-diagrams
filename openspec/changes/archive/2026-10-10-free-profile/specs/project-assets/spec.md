## ADDED Requirements

### Requirement: Project images
`Workspace.image(path)` SHALL read an image file of the project with `readBinary` and return its format, its pixel size and a data URI. The result SHALL be cached until the file changes or is invalidated.

- **Formats.** PNG, JPEG, GIF and WebP SHALL be recognised by their headers, and their pixel size read from them. SVG SHALL be sanitised like icons and written back as plain paths, and its size SHALL come from the `width` and `height` of the root element, or else from its `viewBox`.
- **Paths.** Paths SHALL be resolved against the `.meltemi` file's folder and SHALL stay inside the project root.

The project SHALL check the `image` declarations of the files it compiles:

- a missing file SHALL be `asset.unknown-image`;
- an unrecognised or broken file, or one over 8 MB, SHALL be `asset.unsupported-image`, naming the reason;
- a path outside the project, absolute, or with a URL scheme SHALL be `asset.outside-project`.

Each diagnostic SHALL be reported on the path string.

#### Scenario: PNG size
- **WHEN** `diagrams/logo.png`, a 320 × 80 PNG, is declared as `image logo "logo.png"` in `diagrams/sheet.meltemi`
- **THEN** `image("diagrams/logo.png")` returns format `png`, size 320 × 80 and a `data:image/png;base64,` URI, and nothing is reported

#### Scenario: Missing image
- **WHEN** `image logo "missing.png"` is declared and the file does not exist
- **THEN** `asset.unknown-image` is reported on `"missing.png"`

#### Scenario: Unsafe SVG
- **WHEN** an SVG image contains a `<script>` element and an `onload` attribute
- **THEN** the data URI holds the sanitised SVG without them

### Requirement: Image resolver for layout
`ProjectSessions` and the CLI SHALL pass `LayoutOptions.images` backed by `Workspace.image`, so exports and the canvas draw the project's images.

#### Scenario: Export with an image
- **WHEN** `meltemi-diagrams export` runs on a free sheet with `image logo "logo.png"` and the file exists
- **THEN** the SVG contains one `<image` whose `href` starts with `data:image/png;base64,`
