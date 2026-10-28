## Purpose

Where and how the playground wears the Meltemi family's sea from `@meltemi/ocean`: while it loads,
when the canvas has nothing to draw, and as a still picture on the agent setup pages. It is never
shown behind work in progress, and it always comes to rest.

## ADDED Requirements

### Requirement: The sea while the page loads
While the page loads, it SHALL draw the `diagrams` sea state behind the boot line. The sea SHALL fade out as the page starts, and SHALL never delay the start: the editor becomes usable at the same moment it does without the sea.

#### Scenario: Loading
- **WHEN** the browser suite opens the page and samples the load screen before the page starts
- **THEN** the sea's canvas has drawn a frame that is not blank behind the boot line, and after the start the canvas is gone

#### Scenario: A sea that holds the page back
- **WHEN** starting the page waits on the sea's first frame or on its fade
- **THEN** the browser suite fails, comparing the start time with and without the sea

### Requirement: The sea when there is nothing to draw
When the canvas has nothing to draw (the project has no files, `project.json` is open, or the open file has no diagram), the canvas SHALL show the sea behind its message. While a diagram is drawn, edited, played or exported, the sea SHALL not be shown, and no frame of it SHALL be drawn.

#### Scenario: An empty project
- **WHEN** the browser suite empties a project's files
- **THEN** the canvas shows its "no files" message over the sea

#### Scenario: Opening a diagram
- **WHEN** the browser suite opens a `.meltemi` file with a diagram after the empty state
- **THEN** the sea is removed, its frame count stops, and the diagram is drawn as before

### Requirement: Motion comes to rest
Every moment that moves SHALL come to rest within 5 seconds. Under `prefers-reduced-motion: reduce`, the page SHALL draw a single still frame and request no animation frame.

#### Scenario: At rest
- **WHEN** the browser suite leaves an empty canvas for 6 seconds
- **THEN** no frame is drawn after the fifth second

#### Scenario: Reduced motion
- **WHEN** the browser suite opens the page emulating reduced motion
- **THEN** the load screen and the empty canvas each draw one frame and request no animation frame

### Requirement: The page's scheme
The sea SHALL take its colours from the page's own light or dark scheme, the one its switch chooses, and recolour when the switch changes. It SHALL use no colour that is not one of the page's tokens.

#### Scenario: Switching the scheme
- **WHEN** the browser suite flips the page's scheme switch with the empty canvas showing
- **THEN** the sea's background and points change to the other scheme's tokens without a reload

#### Scenario: A literal colour
- **WHEN** a `--sea-*` rule in `playground.css` names a literal colour instead of a `--pg-*` token
- **THEN** `pnpm test` fails naming the rule

### Requirement: A still picture on the agent setup pages
The agent setup pages in English and Spanish SHALL show the `diagrams` still picture of `@meltemi/ocean` as an image of the site, with empty alternative text. They SHALL load no script, and their Content-Security-Policy SHALL stay unchanged.

#### Scenario: The setup page
- **WHEN** `dist/agent-setup/index.html` and its Spanish twin are read after a build
- **THEN** each shows `sea-diagrams.svg` from the site with `alt=""`, holds no `<script>`, and the policy is the one decision 0063 set

#### Scenario: A missing picture
- **WHEN** the build does not write `sea-diagrams.svg`, or writes one that is not well-formed SVG
- **THEN** the build test fails naming the file

### Requirement: The sea's weight and requests
The code the page loads for the sea SHALL add at most 25 KB gzipped to the page, loaded only when one of its moments shows. It SHALL make no request.

#### Scenario: Weight
- **WHEN** the build test measures the chunks that carry the sea
- **THEN** they total at most 25 KB gzipped and are not part of the bundle the editor needs to start

#### Scenario: Only its own origin
- **WHEN** the browser suite runs the sea's checks
- **THEN** no request leaves the page's origin, and none is made by the sea at all
