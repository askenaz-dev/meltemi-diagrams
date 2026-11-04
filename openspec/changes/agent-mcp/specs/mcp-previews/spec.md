# Spec Delta

## Purpose
Previews drawn on the server for agents: the renderer object, what a preview returns, its cache and its limits.

## ADDED Requirements

### Requirement: A preview of the current revision
`preview { project, path, diagram?, story?, at?, format?, width?, theme? }` SHALL draw the
named diagram (or the file's first), or the story's frame at `at` (its end by default), from
the project's files at the room's current revision with the same compilation, layout and
rendering as the command line, and SHALL answer an `image/png` item (`width` 1280 by default)
or, with `format: "svg"`, the SVG as text.

#### Scenario: The same picture as the command line
- **WHEN** `preview` is called for `flow.meltemi` with `format: "svg"`
- **THEN** the SVG equals what `meltemi-diagrams export flow.meltemi --fonts system` writes for the same files

#### Scenario: A story frame
- **WHEN** `preview` names `story: "purchase"` and `at: "2.4s"`
- **THEN** the picture is the frame at 2.4 s

#### Scenario: A file that does not compile
- **WHEN** the file has an error
- **THEN** the result is `isError` with `code: "diagram.invalid"` and the diagnostics, and no picture

### Requirement: The report beside the picture
Every preview SHALL carry a text report and `structuredContent` `{ revision, width, height,
elements, relations, diagnostics, estimatedFonts }`, so a client without sight of the image can
still judge the drawing.

#### Scenario: A PNG with its report
- **WHEN** `preview` is called with the defaults
- **THEN** the result holds one `image/png` item 1280 pixels wide and the report names the revision, the elements, the relations and no diagnostic

#### Scenario: A warning reported
- **WHEN** the diagram has an `layout.text-overflow` warning
- **THEN** the picture is drawn and `diagnostics` lists the warning with its line

### Requirement: The renderer object
Previews SHALL be drawn in a Durable Object per project, never in the Worker's request path
nor in the project's room, with the files and binaries the Worker hands it; it SHALL keep the
last twenty pictures per project by revision, target, format, width and theme, so a repeated
preview of an unchanged revision is answered from storage; fonts outside the bundled families
SHALL be drawn with the bundled fallback and named in `estimatedFonts`.

#### Scenario: Cached
- **WHEN** the same preview is asked twice at the same revision
- **THEN** the second answer is byte-equal and the object's render count is unchanged

#### Scenario: A Fontsource family
- **WHEN** the diagram writes `font "Caveat"`
- **THEN** the PNG is drawn with the fallback and `estimatedFonts` lists `Caveat`

### Requirement: Limits of previews
An account SHALL have at most 30 previews a minute (`429 rate.limited` with `retryAfter`), a
`width` over 2048 SHALL be refused `400`, and a diagram over the engine's safety limits SHALL be
refused as the command line refuses it, with its code.

#### Scenario: Too wide
- **WHEN** `width: 4096` is asked
- **THEN** the result is `isError` with `code: "request.invalid"` naming the limit

#### Scenario: Over the rate
- **WHEN** an account asks its 31st preview within a minute
- **THEN** the result is `isError` with `code: "rate.limited"` and no picture is drawn
