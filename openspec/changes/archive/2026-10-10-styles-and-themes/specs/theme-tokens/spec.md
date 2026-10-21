## ADDED Requirements

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
| `arrowhead` | `triangle`, `open` or `none` |
| `frame` | `none`, `footer` or `header` |
| `mark` | `meltemi` or `none` |

Numbers SHALL be written without a unit or with `px`, and SHALL be stored as numbers.

#### Scenario: Type and spacing tokens
- **WHEN** a theme block contains `labelSize 15; padding 20px; arrowhead open`
- **THEN** the theme definition has `labelSize` 15, `padding` 20 and `arrowhead` `open`, and no diagnostic is reported

#### Scenario: Number out of range
- **WHEN** a theme block contains `labelSize 80`
- **THEN** `prop.invalid-value` is reported on `80` and the message names the range 6 to 48

#### Scenario: Wrong value type
- **WHEN** a theme block contains `radius "8"` and `labelWeight 650`
- **THEN** `prop.invalid-value` is reported on `"8"` naming a number from 0 to 64, and on `650` listing 400, 500, 600 and 700

### Requirement: Built-in themes
The layout SHALL provide six built-in themes with every token set:

- `technical.light` and `technical.dark` for architecture review, with Inter, a footer frame with the Meltemi mark, and the brand `Meltemi Diagrams`;
- `editorial.light` and `editorial.dark` for documents and long reading, with IBM Plex Sans, no frame, `radius` 6, `connectorWidth` 1, `groupTitleSize` 12 and `open` arrowheads;
- `stage.light` and `stage.dark` for presentations and video, with Inter, a header frame, `labelSize` 16, `descriptionSize` 13, `relationLabelSize` 13, `strokeWidth` 1.5, `connectorWidth` 2, `arrowSize` 10 and `margin` 48.

`technical.light` SHALL be the default theme. Every built-in theme SHALL use Cascadia Mono for `mono`. `BUILT_IN_THEMES` SHALL list the six names, and the first segments `technical`, `editorial` and `stage` SHALL be reserved import names.

#### Scenario: Default theme
- **WHEN** a diagram without `theme` is laid out outside a project
- **THEN** the scene uses the `technical.light` tokens and ends with a footer frame

#### Scenario: Stage theme
- **WHEN** a diagram sets `theme "stage.dark"`
- **THEN** element labels are 16 px, the frame strip is at the top, and the canvas margin is 48 px

#### Scenario: Removed names are unknown
- **WHEN** a diagram sets `theme "meltemi.light"`
- **THEN** `layout.unknown-theme` is reported as a warning, with the six built-in names in the hint

#### Scenario: Reserved import name
- **WHEN** a file contains `import "./brand.meltemi" as stage`
- **THEN** `module.reserved-name` is reported on `stage`

### Requirement: Token-driven geometry
The layout SHALL take every visual measure from the resolved theme:

- type sizes of labels, descriptions, group titles, notes, tags, relation labels and the frame;
- the label weight;
- the text padding of boxes (`padding`), the side and bottom padding of derived groups (`groupPadding`) and their title band (`groupHeader`);
- the canvas margin (`margin`);
- corner radii (`radius` for boxes and notes, `groupRadius` for groups);
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

#### Scenario: Several description lines
- **WHEN** a node without `size` has a description of three lines under `technical.light`
- **THEN** the box is taller than 56 px and no text line lies outside it

### Requirement: Semantic colours in styles
Colour properties of styles, classes and rules (`fill`, `stroke`, `color`) SHALL accept, besides a quoted colour, the bare name of a colour token (`danger`, `accent`, `muted`, …). The model SHALL store the name as `@<token>`, and the layout SHALL replace it with the token value of the resolved theme, so the colour follows the theme. A bare word that is not a colour token SHALL be `prop.invalid-value` listing the colour tokens.

#### Scenario: Token colour follows the theme
- **WHEN** `style db { stroke danger }` is laid out with `technical.light` and with `technical.dark`
- **THEN** the rect stroke is the `danger` value of each theme

#### Scenario: Unknown colour word
- **WHEN** a style block contains `fill red`
- **THEN** `prop.invalid-value` is reported on `red`, with a hint listing the colour tokens and the quoted form `fill "red"`
