## MODIFIED Requirements

### Requirement: A preview of the current revision
`preview { project, path, diagram?, story?, at?, format?, width?, theme? }` SHALL draw the
named diagram (or the file's first), or the story's frame at `at` (its end by default), from
the project's files at the room's current revision with the same compilation, layout and
rendering as the command line, and SHALL answer an `image/png` item (`width` 1280 by default)
or, with `format: "svg"`, the SVG as text. With `at` and no `story` it SHALL draw the diagram's
effects at that instant.

#### Scenario: The same picture as the command line
- **WHEN** `preview` is called for `flow.meltemi` with `format: "svg"`
- **THEN** the SVG equals what `meltemi-diagrams export flow.meltemi --fonts system` writes for the same files

#### Scenario: A story frame
- **WHEN** `preview` names `story: "purchase"` and `at: "2.4s"`
- **THEN** the picture is the frame at 2.4 s

#### Scenario: A file that does not compile
- **WHEN** the file has an error
- **THEN** the result is `isError` with `code: "diagram.invalid"` and the diagnostics, and no picture

#### Scenario: An effect frame without a story
- **WHEN** `preview` is called with `at: "300ms"` and no `story` for a diagram whose relation `authorize` has `animate authorize { effect flow }`, in a file without a story
- **THEN** the SVG equals what `meltemi-diagrams export <file> --at 300ms --fonts system` writes, with the particle a quarter of the way along the relation

#### Scenario: Still by default
- **WHEN** the same diagram is previewed without `at`
- **THEN** the picture has no particle and equals the picture drawn before effect frames were reported

#### Scenario: Every host
- **WHEN** the same effect frame is asked from the hosted endpoint, the local account server and folder mode
- **THEN** each draws the diagram with its effects at that instant, whether or not the file has a story

## ADDED Requirements

### Requirement: The motion of an effect frame
The report of a diagram drawn with `at` SHALL carry `motion` `{ atMs, loopMs, effects,
truncated }`; a still picture and a story frame SHALL carry none. Each effect SHALL give its
target, role, effect, timing, `phase` and `marks`: the moving marks, with their centre in the
picture's coordinates and `along`, the share of the line travelled. At most fifty effects SHALL
be listed. The values SHALL be those the frame was drawn with.

#### Scenario: Two instants
- **WHEN** the diagram of `animate authorize { effect flow }` is previewed at `300ms` and at `900ms` through the tools alone
- **THEN** both reports name the effect on `authorize` with `phase` 0.25 and 0.75, the mark's `along` is 0.25 and 0.75, and its coordinate has moved toward the relation's target

#### Scenario: The fields of an effect
- **WHEN** the report of an effect frame is read
- **THEN** each effect has `target` and `role` (the `data-id` and `data-role` of its group in the SVG), `effect`, `durationMs`, `delayMs`, `repeat` (a count or `forever`), `direction` (`forward` or `reverse`), `phase` (0 to 1 of the current cycle) and `marks`, and `loopMs` is one seamless loop of every effect or `null`

#### Scenario: The marks of each effect
- **WHEN** a diagram has a `flow` with two particles, a `trace`, a `dash` and a `pulse`
- **THEN** the flow lists two marks, the trace one for its head, and the dash and the pulse none

#### Scenario: The mark is the one drawn
- **WHEN** the SVG of the frame at `300ms` is read
- **THEN** the particle's centre in the relation's group is the mark's `x` and `y`

#### Scenario: A PNG
- **WHEN** the same frame is asked as a PNG 1280 pixels wide
- **THEN** the mark's coordinates are in pixels of that picture

#### Scenario: Outside an effect's window
- **WHEN** an effect has `delay 1s` and the frame is asked at `500ms`
- **THEN** the effect is listed with `phase: null` and no marks, and its target is drawn without it

#### Scenario: Nothing animated
- **WHEN** a diagram without `animate` is previewed with `at: "1s"`
- **THEN** the picture is the still one and `motion.effects` is empty with `loopMs: null`

#### Scenario: More than fifty effects
- **WHEN** a diagram has sixty effects drawn
- **THEN** the first fifty are listed and `truncated` is true

#### Scenario: A still picture and a story frame
- **WHEN** `preview` is called without `at`, or with `story` and `at`
- **THEN** the report has no `motion`
