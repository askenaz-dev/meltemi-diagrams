# theme-tokens Specification

## Purpose
The complete theme token table, the six built-in themes, token-driven geometry and colour token names in styles.
## Requirements
### Requirement: Token table
Theme blocks SHALL accept the following tokens. An unknown token SHALL be `prop.unknown` with the list of tokens, and a value that does not fit SHALL be `prop.invalid-value` naming the expected value or range.

| Tokens | Value |
|---|---|
| `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`, `success`, `warning`, `danger`, `info` | a quoted, non-empty colour |
| `font`, `mono`, `brand`, `extends` | a quoted string |
| `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize` | a number from 6 to 48 |
| `labelWeight` | 400, 500, 600 or 700 |
| `padding`, `groupPadding`, `groupHeader`, `margin` | a number from 0 to 200 |
| `radius`, `groupRadius` | a number from 0 to 64 |
| `strokeWidth`, `connectorWidth` | a number from 0 to 8 |
| `arrowSize` | a number from 0 to 32 |
| `arrowhead` | a head: `none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne` |
| `corners` | `sharp` or `rounded` (built-in themes `sharp`; `sketch.*` `rounded`) |
| `sketch` | `none`, `light` or `rough`: how strokes are painted (built-in themes `none`; `sketch.*` `light`) |
| `iconSize` | a number from 8 to 64 (technical 18, editorial 16, stage 24) |
| `iconPosition` | `left`, `right`, `top`, `bottom` or `center` (stage `top`, the others `left`), the default of the style property of the same name |
| `frame` | `none`, `footer` or `header` |
| `mark` | `meltemi` or `none` |
| `flowDuration`, `dashDuration`, `pulseDuration`, `traceDuration` | a time from 100 ms to 60 s, written with `ms` or `s` as in `animate` |
| `selection`, `guide` | a quoted, non-empty colour, used by the canvas only (built-in themes write none) |

Numbers SHALL be written without a unit or with `px`, and SHALL be stored as numbers. Durations SHALL be stored as milliseconds. Built-in themes SHALL write no duration.

#### Scenario: Type and spacing tokens
- **WHEN** a theme block contains `labelSize 15; padding 20px; arrowhead open`
- **THEN** the theme definition has `labelSize` 15, `padding` 20 and `arrowhead` `open`, and no diagnostic is reported

#### Scenario: Number out of range
- **WHEN** a theme block contains `labelSize 80`
- **THEN** `prop.invalid-value` is reported on `80` and the message names the range 6 to 48

#### Scenario: Wrong value type
- **WHEN** a theme block contains `radius "8"` and `labelWeight 650`
- **THEN** `prop.invalid-value` is reported on `"8"` naming a number from 0 to 64, and on `650` listing 400, 500, 600 and 700

#### Scenario: Icon tokens
- **WHEN** a theme block contains `iconSize 20; iconPosition right`, and another contains `iconPosition middle`
- **THEN** the first has `iconSize` 20 and `iconPosition` `right`, so the nodes of a diagram drawn with it have their icon right of the label, and `prop.invalid-value` is reported on `middle` listing `left, right, top, bottom, center`

#### Scenario: Duration tokens
- **WHEN** a theme block contains `flowDuration 800ms; dashDuration 1.5s; pulseDuration 20ms`
- **THEN** the theme definition has `flowDuration` 800 and `dashDuration` 1500, and `prop.invalid-value` is reported on `20ms` naming the range 100 ms to 60 s

#### Scenario: Trace duration token
- **WHEN** a theme block contains `traceDuration 2s`
- **THEN** the theme definition has `traceDuration` 2000, and a trace without `duration` in a
  diagram drawn with that theme takes 2000 ms

#### Scenario: Rounded theme
- **WHEN** a theme block contains `corners rounded; arrowhead circleOutline`
- **THEN** the theme definition has `corners` `rounded` and `arrowhead` `circleOutline`, and
  relations drawn with it round their bends and end in an outlined circle

#### Scenario: Canvas colour tokens
- **WHEN** a theme block contains `selection "#0B6BCB"; guide "#16A34A"`
- **THEN** the theme definition has those two colours, no diagnostic is reported, and an export
  drawn with the theme is the same as without them

#### Scenario: Sketch token
- **WHEN** a theme block contains `sketch rough`, and another contains `sketch wobbly`
- **THEN** the first has `sketch` `rough`, so every stroke of a diagram drawn with it is painted in two jittered passes, and `prop.invalid-value` is reported on `wobbly` listing `none, light, rough`

### Requirement: Built-in themes
The layout SHALL provide eight built-in themes with every token set:

- `technical.light` and `technical.dark` for architecture review, with Inter, a footer frame with the Meltemi mark, and the brand `Meltemi Diagrams`;
- `editorial.light` and `editorial.dark` for documents and long reading, with IBM Plex Sans, no frame, `radius` 6, `connectorWidth` 1, `groupTitleSize` 12 and `open` arrowheads;
- `stage.light` and `stage.dark` for presentations and video, with Inter, a header frame, `labelSize` 16, `descriptionSize` 13, `relationLabelSize` 13, `strokeWidth` 1.5, `connectorWidth` 2, `arrowSize` 10 and `margin` 48;
- `sketch.light` and `sketch.dark` for whiteboards and early thinking, the technical pair with `sketch light`, `corners rounded` and Patrick Hand, the bundled hand font, as `font` (Inter after it in the stack, for the characters it lacks).

`technical.light` SHALL be the default theme. Every built-in theme SHALL use Cascadia Mono for `mono`. `BUILT_IN_THEMES` SHALL list the eight names, and the first segments `technical`, `editorial`, `stage` and `sketch` SHALL be reserved import names.

#### Scenario: Default theme
- **WHEN** a diagram without `theme` is laid out outside a project
- **THEN** the scene uses the `technical.light` tokens and ends with a footer frame

#### Scenario: Stage theme
- **WHEN** a diagram sets `theme "stage.dark"`
- **THEN** element labels are 16 px, the frame strip is at the top, and the canvas margin is 48 px

#### Scenario: Unknown variant of a built-in family
- **WHEN** a diagram sets `theme "technical.sepia"`
- **THEN** `layout.unknown-theme` is reported as a warning, with the eight built-in names in the hint

#### Scenario: Reserved import name
- **WHEN** a file contains `import "./brand.meltemi" as stage`
- **THEN** `module.reserved-name` is reported on `stage`, as it is for `as sketch`

#### Scenario: Sketch theme
- **WHEN** a diagram sets `theme "sketch.light"`
- **THEN** the scene has the technical light palette, `corners` `rounded`, `sketch` `light`, its strokes are painted in two passes, and the strip's light/dark switch offers `sketch.dark`

### Requirement: Token-driven geometry
The layout SHALL take every visual measure from the resolved theme:

- type sizes of labels, descriptions, group titles, notes, tags, relation labels and the frame;
- the label weight;
- the text padding of boxes (`padding`), the side and bottom padding of derived groups (`groupPadding`) and the title band of titled groups (`groupHeader`); an untitled group uses `groupPadding` on top;
- the canvas margin (`margin`);
- corner radii (`radius` for boxes and notes, `groupRadius` for groups), as the defaults that an element's or group's own `radius` style overrides;
- the outline width (`strokeWidth`) and the connector width (`connectorWidth`);
- the arrowhead shape (`arrowhead`) and length (`arrowSize`).

Line heights, pill heights and default box sizes SHALL scale with the type sizes. A box without `size` SHALL be at least as tall as its label and description lines plus four fifths of `padding` above and below. With the `technical.light` tokens, a box with one description line SHALL keep the 160 × 56 default size.

#### Scenario: Larger type grows boxes
- **WHEN** a node `api["API Gateway"]` without `size` is laid out with `technical.light` and with `stage.light`
- **THEN** the stage box is wider and taller than the technical box, and both contain their label

#### Scenario: Open and absent arrowheads
- **WHEN** a theme sets `arrowhead open`, and another sets `arrowhead none`
- **THEN** the first draws each head as an unfilled two-segment polyline in the connector colour and width, and the second draws no head and does not shorten the connector

#### Scenario: Widths and radii
- **WHEN** a theme extends `technical.light` with `radius 0; strokeWidth 2; connectorWidth 3`
- **THEN** node rects have radius 0 and stroke width 2, and connectors have stroke width 3

#### Scenario: Element radius over the token
- **WHEN** a theme sets `radius 0` and a node writes `style api { radius 12 }`
- **THEN** `api`'s rect has `rx` 12 and every other node has `rx` 0

#### Scenario: Several description lines
- **WHEN** a node without `size` has a description of three lines under `technical.light`
- **THEN** the box is taller than 56 px and no text line lies outside it

#### Scenario: Radius token out of range
- **WHEN** a theme block sets `groupRadius 80`
- **THEN** `prop.invalid-value` is reported on `80` naming the range 0 to 64

### Requirement: Semantic colours in styles
Colour properties of styles, classes and rules (`fill`, `stroke`, `color`) SHALL accept, besides a quoted colour, the bare name of a colour token (`danger`, `accent`, `muted`, …), except the canvas tokens `selection` and `guide`. The model SHALL store the name as `@<token>`, and the layout SHALL replace it with the token value of the resolved theme, so the colour follows the theme. A bare word that is not a colour token SHALL be `prop.invalid-value` listing the colour tokens.

#### Scenario: Token colour follows the theme
- **WHEN** `style db { stroke danger }` is laid out with `technical.light` and with `technical.dark`
- **THEN** the rect stroke is the `danger` value of each theme

#### Scenario: Unknown colour word
- **WHEN** a style block contains `fill red`
- **THEN** `prop.invalid-value` is reported on `red`, with a hint listing the colour tokens and the quoted form `fill "red"`

### Requirement: Sketched strokes
When the resolved theme's `sketch` is `light` or `rough`, the scene SHALL carry `sketch` with that level and `renderSvg` SHALL paint every stroked `rect`, `path` and `polyline` of the groups with roles `element`, `relation`, `label`, `frame`, `lifeline` and `event`, heads and label pills included, as a clean fill item without stroke (when it has a fill) followed by two stroke-only paths: the outline (a `rect` converted to four sides with quarter arcs for its radius) resampled into pieces of 16 px (`light`) or 12 px (`rough`), each sample moved along the outline's normal by at most 0.6 px (`light`) or 1.4 px (`rough`) from a pseudo-random sequence seeded by a hash of the group's id and the pass index, with the item's width, dash pattern, dash offset, class, opacity and transform on both passes. Text, images, icons, the brand mark, gradients and patterns SHALL be untouched, fills SHALL stay clean, and the scene the layout returns, its `track` and `bounds`, `LayoutResult`, the canvas overlays, hit tests, magnets and text places SHALL be the clean geometry. The same text SHALL render the same bytes; an anonymous relation's key or a generated id that changes when statements are reordered changes its jitter, and the documentation SHALL say so. Exports (SVG, PNG, PDF, the players, video) SHALL take the sketched drawing through the same `renderSvg`.

#### Scenario: Two passes on a box
- **WHEN** `box a "A"` is rendered with `theme "sketch.light"`
- **THEN** the SVG holds, for `a`, one `<rect>` or `<path>` with its fill and `stroke="none"`, then two `<path fill="none">` strokes, no `<rect>` with a stroke, and its `<text>` unchanged

#### Scenario: Deterministic
- **WHEN** the same sheet is rendered twice with `sketch.light`, and once more after an unrelated box is added
- **THEN** the first two outputs are identical, and the paths of the original boxes and named relations are unchanged in the third

#### Scenario: Clean geometry
- **WHEN** a free composition with `sketch rough` is laid out and shown on the canvas
- **THEN** `LayoutResult.boxes`, the groups' `track` and `bounds` and the selection outline are the same as under `technical.light`, and a flow particle runs along the clean track

#### Scenario: Dash on a sketched relation
- **WHEN** `animate pay { effect dash }` is rendered with `sketch.light` at 300 ms
- **THEN** both stroke passes of `pay` carry the same dash array and offset

#### Scenario: Not sketched by default
- **WHEN** the corpus is rendered with the six other built-in themes
- **THEN** every snapshot is byte-identical to the stored one

#### Scenario: Sketch is a theme token
- **WHEN** a free diagram writes `style a { sketch rough }`
- **THEN** `prop.unknown` is reported on `sketch` with the accepted style properties in the hint, and the drawing is not sketched

