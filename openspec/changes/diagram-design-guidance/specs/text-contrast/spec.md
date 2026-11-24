## Purpose

Texts that can be read: a warning for every text whose colour is too close to the fill drawn
behind it, how that fill is found, the hint that fixes it, and the zero target over the built-in
themes, the corpus, the templates, the gallery and the examples.

## ADDED Requirements

### Requirement: Low contrast texts are reported
After every layout, in every profile, a text whose colour against the solid fill drawn behind it
has a contrast ratio under 4.5 to 1 SHALL be reported as the warning `layout.low-contrast` on the
statement that draws it, naming the text, the two colours, the ratio with two decimals and the
ratio needed. The ratio SHALL be that of WCAG 2, compared before rounding.

#### Scenario: White on a pale fill
- **WHEN** a flow sheet holds `api["Order API"]` and `style api { fill "#dae8fc"; color "#FFFFFF" }`
- **THEN** `layout.low-contrast` is reported on `api`, naming `Order API`, `#FFFFFF`, `#dae8fc`, the ratio `1.24` and the `4.5` needed

#### Scenario: The theme's own colours
- **WHEN** a flow sheet with nodes, groups, tags, notes and labelled relations is laid out in `technical.light` with no colour written
- **THEN** no `layout.low-contrast` is reported

#### Scenario: A ratio just above the least
- **WHEN** a text of `#3B82F6` lies on a fill of `#1b1f24`, whose ratio is 4.5027
- **THEN** no `layout.low-contrast` is reported

#### Scenario: In a sequence diagram
- **WHEN** a participant of a sequence diagram has `style bank { fill "#F59E0B"; color "#FFFFFF" }`
- **THEN** `layout.low-contrast` is reported on `bank` with the ratio `2.15`

### Requirement: Large texts need less
A text of 24 px or more, or of 18.66 px or more with a weight of 700, SHALL need a ratio of 3 to 1
instead of 4.5 to 1, and the warning SHALL name the ratio that applied to it.

#### Scenario: A large title
- **WHEN** a free text of `fontSize 28` and colour `#6B7C8F` lies on a white sheet, with a ratio of 4.28
- **THEN** no `layout.low-contrast` is reported

#### Scenario: The same colours in a small text
- **WHEN** a note of 11 px and colour `#6B7C8F` lies on a white fill
- **THEN** `layout.low-contrast` is reported with the ratio `4.28` and the `4.5` needed

### Requirement: The fill behind a text
The fill behind a text SHALL be that of the last shape painted before it that contains the centre
of its box: its own box or pill, else the group or band around it, else the sheet's background. A
fill with opacity below 1, a gradient, a pattern, an image, or a colour written neither in
hexadecimal nor as `rgb()` SHALL leave the text unchecked.

#### Scenario: A label on its pill
- **WHEN** a relation's label is drawn on its pill, over a group's band
- **THEN** its colour is compared with the pill's fill and not with the band's

#### Scenario: A title on a band
- **WHEN** a group has `style g { fill "#0B1830" }` and its title keeps the theme's ink `#0B1830`
- **THEN** `layout.low-contrast` is reported on `g`

#### Scenario: A gradient
- **WHEN** a box has a gradient fill and a white label
- **THEN** no `layout.low-contrast` is reported for that label

#### Scenario: A text over an image
- **WHEN** a free text lies over an image
- **THEN** no `layout.low-contrast` is reported for that text

### Requirement: One warning for each pair of colours
In one diagram, each pair of text colour and fill SHALL be reported once, on the first statement
in source order that draws it, and the message SHALL say how many other texts of the diagram share
the pair.

#### Scenario: A theme's tag colour
- **WHEN** `theme acme { extends "technical.light"; tag "#FDE68A" }` is used by a sheet with four tags
- **THEN** `layout.low-contrast` is reported once, on the first tag, with the ratio `1.25` and the three other texts it shares the pair with

#### Scenario: Two different pairs
- **WHEN** a sheet has one box with white text on `#dae8fc` and another with white text on `#F59E0B`
- **THEN** two warnings are reported, one on each box

### Requirement: A colour that passes as the hint
The warning SHALL carry a hint, in the interface language, with a `color` statement for a colour
that passes against that fill: the theme's `ink` when it does, and otherwise black or white,
whichever gives the higher ratio.

#### Scenario: The theme's ink passes
- **WHEN** white text on `#FDE68A` is reported in `technical.light`
- **THEN** the hint proposes `color "#0B1830"`, whose ratio against that fill is 14.20

#### Scenario: In Spanish
- **WHEN** the same sheet is validated with `--lang es`
- **THEN** the message and the hint are in Spanish, with the same code, colours and ratio

### Requirement: The zero target for contrast
Every built-in theme SHALL give no `layout.low-contrast` for a text drawn with its own tokens, in
any profile, and the corpus of valid sheets, the templates, the gallery and the examples SHALL
give none. A test SHALL fail naming the sheet, the text and the ratio when one appears.

#### Scenario: Every built-in theme
- **WHEN** the gallery's sheet of each profile is laid out with each of the eight built-in themes
- **THEN** no `layout.low-contrast` is reported

#### Scenario: A template that loses contrast
- **WHEN** a template's style gives a label a colour with a ratio of 3.9 against its fill
- **THEN** the contrast test fails naming the template, the label and `3.90`
