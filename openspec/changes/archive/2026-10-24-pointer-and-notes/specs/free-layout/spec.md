## ADDED Requirements

### Requirement: Notes in free compositions are drawn
A free note SHALL be drawn as a flow note is: its lines of text at `fontSize` (the theme's `noteSize` by default), `fontWeight` (400 by default), aligned by `textAlign` (`left` by default) in `color` (the theme's `muted` by default), an icon before the first line when styled, and an outline with the note's `radius` (the theme's `radius` by default), `fill`, `stroke`, `width` and `line` only when `fill`, `stroke` or `pattern` is styled. Its default size SHALL be its longest line's width (plus the icon) by its line count times the note line height plus 4; a written `size` SHALL be kept, and one narrower than the longest line SHALL be `layout.text-overflow` on the `size`, as for any object with text. A free note SHALL be painted on its layer in source order among the other objects, SHALL take part in `place`, z-order, hit testing, selection, marquee selection, rotation and the composition checks as any object, and SHALL be excluded from the label audit as notes are.

#### Scenario: A note drawn in a free composition
- **WHEN** a free diagram declares `note hint "Draft\nnot final"` placed at (300, 100) with `style hint { fill "#fff3bf"; stroke "#e8a600" }`
- **THEN** the scene holds one rect filled `#fff3bf` stroked `#e8a600` and two text items at the note size, weight 400, start-anchored, 18 units apart under `technical.light`, and the note's box is the rect

#### Scenario: Centred text at a size
- **WHEN** the note has `style hint { textAlign center; fontSize 16 }` and `size hint (200, 60)`
- **THEN** both lines are measured at 16 px and anchored at the middle of the 200-unit box

#### Scenario: A note on a front layer
- **WHEN** `layers main, front` is declared, box `a` is declared after note `n`, and `n` writes `layer front`
- **THEN** the scene draws `a` before `n`

#### Scenario: A note on a shape
- **WHEN** a free note without an outline is placed over box `a`
- **THEN** no `layout.label-overlap` is reported for the note's text, as for a flow note

#### Scenario: A size too small for the text
- **WHEN** `size hint (40, 20)` is written for `note hint "Draft\nnot final"`
- **THEN** `layout.text-overflow` is reported on the `size` with the width the longest line needs, and the note is drawn at the written size
