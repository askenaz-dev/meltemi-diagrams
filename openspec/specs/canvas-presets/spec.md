# canvas-presets Specification

## Purpose
Document and slide presets and fixed canvases: canvas sizing, centring, the frame strip and `layout.too-large` instead of shrinking text.
## Requirements
### Requirement: Preset and canvas properties
A flow diagram SHALL accept `preset document`, `preset slide` and `canvas (<width>, <height>)`. The canvas dimensions SHALL be numbers from 100 to 10,000 without a unit or with `px`. The checks SHALL be:

- another preset word is `prop.invalid-value` listing `document, slide`;
- a canvas value that is not a pair of numbers in range is `prop.invalid-value`;
- `preset` and `canvas` in the same diagram is `prop.invalid-value` on the second one, with the hint to keep one;
- either property written twice is `prop.duplicate`.

The model SHALL record `preset` (or null) and `canvas` as `{ width, height }` (or null).

#### Scenario: Slide preset
- **WHEN** a diagram contains `preset slide`
- **THEN** the diagram properties have `preset` `slide` and `canvas` null

#### Scenario: Fixed canvas
- **WHEN** a diagram contains `canvas (1280, 720)`
- **THEN** the diagram properties have `canvas` `{ width: 1280, height: 720 }`

#### Scenario: Preset and canvas together
- **WHEN** a diagram contains `preset slide` and then `canvas (800, 600)`
- **THEN** `prop.invalid-value` is reported on the `canvas` statement

#### Scenario: Unknown preset
- **WHEN** a diagram contains `preset poster`
- **THEN** `prop.invalid-value` is reported on `poster` listing `document, slide`

### Requirement: Canvas sizing
The layout SHALL size the canvas from the content: the bounds of the elements, connectors and labels plus the theme `margin` on every side, plus the frame strip when the theme has a frame. Then:

- with `preset document`, the canvas SHALL stay as computed, and a content canvas wider than 1,200 px SHALL be `layout.too-large` (warning);
- with `preset slide`, the canvas SHALL be widened or heightened to the 16:9 ratio with the content centred, and a content canvas wider than 1,920 px or taller than 1,080 px SHALL be `layout.too-large`;
- with `canvas (w, h)`, the canvas SHALL be `w × h` with the content centred, and a content canvas larger than `w` or `h` SHALL be `layout.too-large`, in which case that dimension SHALL grow to fit, so nothing is clipped.

The frame strip SHALL span the full canvas width, at the bottom (`footer`) or the top (`header`). `layout.too-large` SHALL be reported on the `preset` or `canvas` statement, name the content size and the limit, and hint to split the diagram into views or scenes instead of shrinking the text. Text SHALL never be scaled down to fit.

#### Scenario: Slide ratio
- **WHEN** a diagram with `preset slide` has a content canvas of 800 × 300 px
- **THEN** the scene is 800 × 450 px and the content is centred vertically

#### Scenario: Wide document
- **WHEN** a diagram with `preset document` has a content canvas 1,400 px wide
- **THEN** `layout.too-large` is reported as a warning on `preset document`, and the scene is still 1,400 px wide

#### Scenario: Fixed canvas with frame
- **WHEN** a diagram under `technical.light` sets `canvas (1280, 720)` and its content is 600 × 300 px
- **THEN** the scene is 1,280 × 720 px, the footer strip ends at the bottom edge and spans the full width, and the content is centred in the area above it

#### Scenario: Content larger than the canvas
- **WHEN** a diagram sets `canvas (400, 300)` and its content canvas is 600 × 200 px
- **THEN** `layout.too-large` is reported, and the scene is 600 × 300 px

