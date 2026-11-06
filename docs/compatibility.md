# Compatibility and known limitations

[Español](es/compatibility.md)

Supported environments, file formats and current limitations. These requirements describe the
product; dated benchmark and verification reports are maintained separately in the repository.

## Runtime

| Component         | Requirements                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js           | 22.12 or later for the CLI and JavaScript packages (ES modules)                                      |
| Operating systems | Windows, macOS and Linux with a supported Node runtime                                               |
| Package managers  | The published packages can be installed with npm, pnpm or Yarn; the getting-started examples use npm |
| CI                | `init --ci github` and `init --ci gitlab` generate validation/export workflows for your project      |

Local validation, layout and SVG export work without a server or a Meltemi account after
installation. Cloud storage, collaboration, publishing and account MCP connections use the
service; optional [AI assistance](assist.md) connects to the provider you configure. The web app
loads its own code, fonts and icon packs from its host. Local Docker usage is documented in
[the local workspace guide](local-compose.md).

## Browsers and FFmpeg

CLI PNG, PDF and video exports use an installed Edge, Chrome or Chromium, found automatically
or selected with `MELTEMI_BROWSER`. Video also uses an installed FFmpeg, found on the path or
selected with `MELTEMI_FFMPEG`. Export does not install these tools for you.

| Use                                                 | Requirements                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CLI captures (PNG, PDF, video frames)               | Microsoft Edge, Google Chrome or Chromium                                                 |
| CLI video encoding                                  | FFmpeg with libx264 for MP4, libvpx-vp9 for WebM, and GIF support                         |
| Viewing SVG, PNG, player, catalog and video exports | A current browser with support for that media format                                      |
| The web app                                         | A current Edge, Chrome, Firefox or Safari; available video formats depend on its encoders |

The web app records WebM and MP4 with the browser's WebCodecs encoders. When an encoder is
unavailable, it disables that format and shows the CLI command that can create it. GIF needs
no video encoder.

## Editors

| Editor             | Requirements                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Visual Studio Code | 1.95 or later; install `meltemi.meltemi-diagrams-vscode`                                                                     |
| VS Code forks      | A compatible extension API; install through Open VSX or the release VSIX. Compatibility also depends on the fork             |
| Other editors      | Edit `.meltemi` text and use `mdg validate`, `mdg export` and `mdg preview`; tools can also embed `@meltemi/diagrams-editor` |

## Files

| Format               | Read                                                 | Written                                                    |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `.meltemi`           | language 0.2, UTF-8, LF or CRLF                      | the same; edits keep comments and formatting               |
| `project.json`       | the [project schema](../schemas/project.schema.json) | by `init` and the editor                                   |
| Model JSON           | —                                                    | `convert --to json` ([model JSON](language/model-json.md)) |
| SVG                  | icons and images in projects (sanitised)             | static or animated, fonts embedded, outlined or named      |
| PNG, JPEG, WebP, GIF | images in projects                                   | PNG, and GIF animations                                    |
| PDF                  | —                                                    | vector pages with fonts, text and links                    |
| MP4, WebM            | —                                                    | 1080p at 30 fps by default; WebM may be transparent        |
| HTML                 | —                                                    | the player (page or fragment) and the catalog              |
| Mermaid, PlantUML    | see below                                            | —                                                          |

## Import coverage

| Source       | Imported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mermaid      | `flowchart` and `graph`, `sequenceDiagram`, the `C4*` diagrams, `architecture-beta`, `block-beta`, `gantt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PlantUML     | component, deployment and use case (description) diagrams, sequence diagrams, C4-PlantUML; the preprocessor and includes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Markdown     | the Mermaid and PlantUML blocks of a file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shapes       | Meltemi draws twenty-four `shape` values ([free compositions](language/free.md#text-and-shapes)). Mermaid's hexagon, parallelogram, trapezoid, circle, stadium, subroutine, asymmetric, document and triangle keep their drawing, and its mirrored and double-ringed forms are drawn as the nearest shape; PlantUML's `cloud`, `hexagon`, `usecase`, `interface`, `circle`, `actor`, `person`, `card`, `file` and `folder` keep a drawing of their own. draw.io's files are not imported; its rectangles, rounded rectangles, squares, ellipses, circles, diamonds, parallelograms, trapezoids, hexagons, octagons, cylinders, clouds, documents, callouts, stars and triangles pointing up have a shape with the same picture; a triangle pointing another way and a stick-figure actor are drawn as the nearest shape (`triangle` points up, and `person` is a head over a body), and its nested containers are untitled groups |
| Not imported | Mermaid class, state, entity-relationship, journey, pie, quadrant, requirement, Git graph, mind map, timeline, Sankey and XY charts; PlantUML class, activity, state, object, timing, Gantt, mind map, WBS and the other non-description diagrams; draw.io, Lucidchart, Visio and other editors' files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Every construct of an imported diagram is reported as mapped, approximated or dropped: see
[Importing Mermaid](import/mermaid.md) and [Importing PlantUML](import/plantuml.md).

## Slide and office applications

Choose an export format your destination application accepts. PNG is useful for a picture with a
fixed appearance; SVG and PDF retain vector shapes and text where the destination supports them.
Keep the `.meltemi` source so you can revise the diagram and export it again.

The HTML player is a web page: share its file or link, or embed its fragment in a web page.
Meltemi does not turn that player into an interactive slide object.

## Known limitations

- Meltemi does not provide synthetic voice, AI-generated video, PPTX export or editable PowerPoint shapes.
- Imports cover the documented Mermaid and PlantUML constructs. There is no importer for draw.io,
  Lucidchart or Visio files; see the [coverage tables](#import-coverage).
- Collaborative editing works in service-backed projects: hosted cloud projects or the
  [local Docker workspace](local-compose.md). It does not add live presence to a standalone
  folder in VS Code or the CLI, although a CLI/API push reaches an open cloud project.
- A hosted room holds at most 20 connections, with at most 10 anonymous connections from one
  network. An owner's live session lets guests edit without an account and lasts at most a day.
  Guests cannot upload images/fonts, create versions, share or publish.
- There is no following another person's view, comments, chat or voice.
- PDF from the web app uses the browser's print dialog (**Save as PDF**); the CLI writes PDF directly.
- Transparent video (WebM with alpha) is available through the CLI.
- If the hosted MCP renderer answers `renderer.unavailable`, use the
  [local MCP server](agents.md#through-the-local-server) for account projects or the Docker workspace.
