# Spec Delta

## ADDED Requirements

### Requirement: White space is drawn as written
Every text of a scene SHALL be drawn with the spaces its line holds, leading, trailing and repeated, as the layout measures them. `renderSvg` SHALL write `xml:space="preserve"` on a `<text>` element whose text starts or ends with a space or holds two consecutive spaces, and on no other; the element's content SHALL stay the scene's text. The `system`, `embedded` and `outlined` policies SHALL place the first glyph after leading spaces at the same x.

#### Scenario: An indented line
- **WHEN** a note's second line is `  return;` and the sheet is exported with the `embedded` policy
- **THEN** the line's element is `<text … xml:space="preserve">  return;</text>` and a browser draws `return;` two character advances right of the note's first line

#### Scenario: Text without such spaces is unchanged
- **WHEN** the annotations corpus file, whose texts hold only single spaces between words, is exported with the `system` policy
- **THEN** the SVG contains no `xml:space` and matches the stored snapshot

#### Scenario: Aligned columns
- **WHEN** a text's two lines are `a      = 1` and `longer = 2` in a monospace font
- **THEN** both `=` signs are drawn at the same x under each of the three policies

#### Scenario: Outlined text
- **WHEN** the indented line is exported with the `outlined` policy
- **THEN** its path starts two space advances right of the line's x and its `aria-label` is `  return;`

### Requirement: Tab stops
Before a line of text is measured or placed, each tab in it SHALL be replaced by the spaces that reach the next multiple of four characters of that line, so a tab advances to a tab stop in every output. A tab SHALL not be reported by `layout.unmeasured-font`, and the label in the model SHALL keep its tabs.

#### Scenario: Tabs reach tab stops
- **WHEN** a note's lines are `if (a) {`, a tab followed by `return;` and `ab` followed by a tab and `c`
- **THEN** the scene's second line is four spaces and `return;`, its third is `ab`, two spaces and `c`, and the note's label in the model still holds the two tabs

#### Scenario: A tab is no longer unmeasured
- **WHEN** a sheet whose only unusual character is a tab in a note is validated
- **THEN** no `layout.unmeasured-font` is reported

#### Scenario: A character that is still unmeasured
- **WHEN** the same note also holds a character no bundled font covers
- **THEN** `layout.unmeasured-font` names that character and not the tab
