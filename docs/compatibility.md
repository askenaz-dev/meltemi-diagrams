# Compatibility and known limitations

[Español](es/compatibility.md)

What Meltemi Diagrams 1.0 runs on, what it reads and writes, and what it does not do. "Verified"
means checked by the repository's tests or verification runs on the reference machine
([decision 0032](decisions/0032-reference-machine-and-quality-gates.md)); the results are in
[quality/results.md](quality/results.md).

## Runtime

| Component         | Supported                                           | Verified                                                                     |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Node.js           | 22.12 or later (ES modules)                         | Node 24.15 on Windows 11                                                     |
| Operating systems | Windows, macOS and Linux                            | Windows 11; see the limitations below                                        |
| Package managers  | npm, pnpm and Yarn install the published packages   | pnpm 10 (offline install of the release check)                               |
| CI                | GitHub Actions and GitLab CI (`init --ci`), Node 22 | the workflow files are generated and tested; not run on a hosted service yet |

Nothing needs a server or an account. Network is used only for optional AI assistance, with the
provider and key you configure ([assist](assist.md)), and for the optional account that the
playground offers when the [cloud service](cloud.md) serves it.

## Browsers and FFmpeg

PNG, PDF and video are captured by a browser installed on the machine, found automatically or
named with `MELTEMI_BROWSER`; video is encoded by an installed FFmpeg, found on the path or named
with `MELTEMI_FFMPEG`. Nothing is downloaded.

| Use                                                         | Supported                                         | Verified                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Captures (PNG, PDF, video frames)                           | Microsoft Edge, Google Chrome, Chromium           | Edge 155, Chrome 154                                                     |
| Video encoding                                              | FFmpeg with libx264 (MP4), libvpx-vp9 (WebM), GIF | FFmpeg 6.1.1                                                             |
| Opening exports (SVG, PNG, player, catalog, MP4, WebM, GIF) | current Edge, Chrome, Firefox and Safari          | Edge 155, Chrome 154, Firefox 157 ([browsers](verification/browsers.md)) |
| The playground                                              | current Edge, Chrome, Firefox and Safari          | Edge 155, Chrome 154, Firefox 157; Safari not verified                   |

The playground records WebM and MP4 with the browser's WebCodecs encoders; a browser without one
disables the format and shows the command that makes it. GIF needs no encoder.

## Editors

| Editor                                                | Supported                                                                                                         | Verified                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Visual Studio Code                                    | 1.95 or later                                                                                                     | 1.141 (`pnpm vscode:test`) |
| VS Code forks (VSCodium, Cursor, Windsurf and others) | through Open VSX or the `.vsix`, with the same engine                                                             | not verified               |
| Other editors                                         | the command line and `meltemi-diagrams preview`; the language services are a library (`@meltemi/diagrams-editor`) | —                          |

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
| Mermaid      | `flowchart` and `graph`, `sequenceDiagram`, the `C4*` diagrams, `architecture-beta`, `block-beta`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PlantUML     | component, deployment and use case (description) diagrams, sequence diagrams, C4-PlantUML; the preprocessor and includes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Markdown     | the Mermaid and PlantUML blocks of a file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shapes       | Meltemi draws twenty-four `shape` values ([free compositions](language/free.md#text-and-shapes)). Mermaid's hexagon, parallelogram, trapezoid, circle, stadium, subroutine, asymmetric, document and triangle keep their drawing, and its mirrored and double-ringed forms are drawn as the nearest shape; PlantUML's `cloud`, `hexagon`, `usecase`, `interface`, `circle`, `actor`, `person`, `card`, `file` and `folder` keep a drawing of their own. draw.io's files are not imported; its rectangles, rounded rectangles, squares, ellipses, circles, diamonds, parallelograms, trapezoids, hexagons, octagons, cylinders, clouds, documents, callouts, stars and triangles pointing up have a shape with the same picture; a triangle pointing another way and a stick-figure actor are drawn as the nearest shape (`triangle` points up, and `person` is a head over a body), and its nested containers are untitled groups |
| Not imported | Mermaid class, state, entity-relationship, journey, Gantt, pie, quadrant, requirement, Git graph, mind map, timeline, Sankey and XY charts; PlantUML class, activity, state, object, timing, Gantt, mind map, WBS and the other non-description diagrams; draw.io, Lucidchart, Visio and other editors' files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Every construct of an imported diagram is reported as mapped, approximated or dropped: see
[Importing Mermaid](import/mermaid.md) and [Importing PlantUML](import/plantuml.md).

## Slide and office applications

Exports are checked by hand in PowerPoint, Keynote and Google Slides with the verification kit;
the owner records the results per application, version and format in
[office applications](verification/office-apps.md). Expected from the formats themselves:

- Google Slides takes PNG and GIF pictures, and video only from Google Drive or YouTube.
- No slide application runs the HTML player inside a slide; share it as a file or a link, or embed
  the fragment in a web page.

## Known limitations

Outside 1.0, as the proposal decides:

- synthetic voice and AI-generated video;
- universal import (draw.io, Lucidchart, Visio and other editors' files);
- export to PPTX and conversion to editable PowerPoint shapes.

Realtime collaboration (several people editing the same file at once) was outside 1.0 too and is
not a limitation any more: the playground's cloud projects have it
([working together](playground.md#working-together)). What it does not do:

- It needs the cloud service and an account. The VS Code extension and the command line show no
  presence, though a push through the API or the command line reaches the people in a room live.
- A room holds twenty connections; the twenty-first waits and tries again.
- A person who is not signed in reads a snapshot of a shared project, sees nobody else and is seen
  by nobody.
- There is no following another person's view, and no comments, chat or voice.

In 1.0:

- macOS and Linux run the same code paths as Windows (browser and FFmpeg discovery included) but
  have not been verified on a machine; the reference results come from Windows 11.
- PDF from the playground goes through the browser's print dialog (choose **Save as PDF**); the
  command line writes PDF directly.
- Transparent video (WebM with alpha) is made by the command line only.
- GIF uses one palette of 256 colours for the whole animation.
- The catalog and the player show what was exported; they do not edit.
- AI assistance needs a provider key and sends the context it shows you first; everything else
  works offline.
- Video and PNG captures need a Chromium-based browser installed; Firefox is verified for viewing
  exports, not for capturing them.
