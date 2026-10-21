## MODIFIED Requirements

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
