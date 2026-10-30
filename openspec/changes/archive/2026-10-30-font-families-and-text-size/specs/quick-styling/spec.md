## ADDED Requirements

### Requirement: Text group of the strip
For a selection whose every item takes the text properties (`style-classes-and-rules`, "Text properties in every profile"), in every profile, the strip SHALL show a group headed **Text** ("Texto") after the shape and alignment controls and before Effects, holding: the font picker's button (`diagram-canvas`, "Font picker") for `font`, with the inherited family greyed and "theme" inheriting again; a size control for `fontSize`, a field whose list offers 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72 and 96, with − and + buttons that step from the effective size to the previous or next value of the list (a size between two values steps to the nearer one in the direction pressed), the inherited size greyed as placeholder, any number from 6 to 160 accepted when typed, a number outside it refused in place naming the range, and "theme" removing the property; and a weight row for `fontWeight` of four chips showing "Aa" drawn at 400, 500, 600 and 700, named Regular, Medium, Semibold and Bold ("Normal", "Media", "Seminegrita", "Negrita"), a radio group moved with the arrow keys, the written chip pressed, the inherited greyed, and a "theme" chip. Each control SHALL write its property with `setStyleProperty` for every selected item in one batch plan, SHALL show "mixed" where the selection's values differ, and SHALL be drawn disabled on a read-only canvas with the written values shown. The strip SHALL show no Text group for a selection that holds an icon, an image or a pen. The group replaces the Text size and Text weight fields the strip showed for stickies.

#### Scenario: Size of a flow node from the list
- **WHEN** node `api` of a flow diagram is selected, the size field shows 13 greyed, and 20 is chosen from its list
- **THEN** the text gains `style api { fontSize 20 }`, the box grows around the label and the field shows 20

#### Scenario: Stepping with the buttons
- **WHEN** `api` has `fontSize 15` and + is pressed twice, then − once
- **THEN** the text holds `fontSize 16`, then `fontSize 18`, then `fontSize 16`, each in its own undo step

#### Scenario: A weight for three boxes
- **WHEN** boxes `a`, `b` and `c` of a free composition are selected and the Semibold chip is chosen
- **THEN** one undo step writes `fontWeight 600` for the three, and the chip is pressed

#### Scenario: A font for a selection
- **WHEN** `api` and `db` are selected, the font button is pressed and `Roboto` is chosen
- **THEN** one undo step writes `style api { font "Roboto" }` and `style db { font "Roboto" }`, and the button shows "Roboto" drawn in Roboto

#### Scenario: Typed out of range
- **WHEN** 300 is typed in the size field
- **THEN** the field refuses it naming the range 6 to 160 and the text is unchanged

#### Scenario: Mixed sizes
- **WHEN** `api` with `fontSize 20` and `db` without a size are selected
- **THEN** the size field shows "mixed" and the weight row has no chip pressed

#### Scenario: No text group for an image
- **WHEN** image `logo` is selected, or `api` and `logo` together
- **THEN** the strip shows no Text group

#### Scenario: Read-only
- **WHEN** the canvas is read-only and `api` with `fontWeight 700` is selected
- **THEN** the Bold chip is pressed and disabled, the size field and the − and + buttons are disabled, and pressing + writes nothing

#### Scenario: Spanish names
- **WHEN** the interface language is Spanish and `api` is selected
- **THEN** the group is headed "Texto" and its weight chips are named "Normal", "Media", "Seminegrita" and "Negrita"

### Requirement: Text size keys
Ctrl+Shift+. (`growText`) and Ctrl+Shift+, (`shrinkText`), Cmd on macOS, SHALL step the effective size of every selected item that takes `fontSize` to the next or previous value of the size list in one batch plan, SHALL announce the new size in the live region, SHALL do nothing at the ends of the list, with nothing selected, with a selection that takes no size or on a read-only canvas, and SHALL be listed in the keyboard help and the editor guide. The canvas SHALL prevent the default of both key events.

#### Scenario: Grow and shrink
- **WHEN** `api` is selected under `technical.light` (13 px) and Ctrl+Shift+. is pressed, then Ctrl+Shift+, twice
- **THEN** the text holds `style api { fontSize 14 }`, then `fontSize 12`, then `fontSize 11`, the live region announces each size, and three undo steps exist

#### Scenario: At the end of the list
- **WHEN** `api` has `fontSize 96` and Ctrl+Shift+. is pressed
- **THEN** nothing is written and nothing is announced

#### Scenario: A selection that takes no size
- **WHEN** image `logo` is selected and Ctrl+Shift+. is pressed
- **THEN** nothing is written, and the event's default is still prevented

#### Scenario: A mixed selection
- **WHEN** `api` with `fontSize 20` and `db` without a size are selected and Ctrl+Shift+, is pressed
- **THEN** one undo step writes `fontSize 18` for `api` and `fontSize 12` for `db`
