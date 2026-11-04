## MODIFIED Requirements

### Requirement: Relation tool
The palette SHALL offer a relation tool (R; "Message" on sequence diagrams): the first click
chooses the source and highlights it, the second click the target, Escape cancels, and Shift
flips the dashes of the current kind (`->` to `-->`, `--` to `---`). It SHALL create the same text as dragging from a connection
handle. Its kinds SHALL be `->`, `-->`, `--`, `---`, `<->` and `<-->` in that order, listed in the arrow button's menu with a picture and a name each ("arrow", "dashed arrow", "line", "dashed line", "two-way arrow", "dashed two-way arrow"; in Spanish "flecha", "flecha discontinua", "línea", "línea discontinua", "flecha doble", "flecha doble discontinua"), cycled in that order by R while the tool is armed and named in the status line, the badge beside the pointer and the keyboard help; C4 views SHALL offer `->` alone and sequence diagrams none. The strip of a `--` or `---` relation SHALL show `none` greyed as the inherited value of both heads, and its line row SHALL rewrite `--` and `---` into each other, keeping the heads, as it rewrites `->` and `-->`.

#### Scenario: Two clicks
- **WHEN** the relation tool is chosen, `api` is clicked and then `db`
- **THEN** the text gains `api -> db` and the new relation is selected

#### Scenario: A line from the tool
- **WHEN** the arrow button's menu is opened, `--` is chosen, and `api` then `db` are clicked
- **THEN** the text gains `api -- db`, the status line named the line kind, and with Shift on the second click it gains `api --- db` instead

#### Scenario: R cycles six kinds
- **WHEN** R is pressed once to arm the tool and then five more times
- **THEN** the status line names `-->`, `--`, `---`, `<->` and `<-->` in turn, and a sixth press names `->` again

#### Scenario: Heads of a line in the strip
- **WHEN** `api -- db as link` is selected
- **THEN** the strip's start and end head buttons show `none` greyed, choosing `triangle` for the end writes `style link { arrowhead triangle }`, and the dashed chip of the line row rewrites the statement as `api --- db as link`

#### Scenario: No line kinds in a C4 view
- **WHEN** the relation tool is armed on a C4 view and R is pressed again
- **THEN** the kind stays `->`, and the arrow button's menu lists `->` alone

## ADDED Requirements

### Requirement: Text alignment picker
The strip SHALL show, for free boxes, one control headed "Text alignment" ("Alineación del texto") of nine cells, a 3 × 3 grid of pictures of a text block in a box at each pair of `textAlign` (`left`, `center`, `right`) and `verticalAlign` (`top`, `middle`, `bottom`), with the written pair pressed and the inherited pair (`center`, `middle` by default) greyed in a dashed cell; for free texts, the three horizontal cells with `left` as the inherited value; nothing for other kinds or other profiles. A cell SHALL write `textAlign` and `verticalAlign` of the selection with `setStyleProperty` for the properties that change, in one undo step; the row's "theme" chip SHALL remove both. The cells SHALL be a radio group moved with the arrow keys in both directions and chosen with Enter or Space, each cell named by its pair in the interface language; a multi-selection whose values differ SHALL show "mixed" with no cell pressed.

#### Scenario: Top left from the picker
- **WHEN** box `a` of a free composition is selected and the top-left cell is chosen
- **THEN** the text gains `style a { textAlign left; verticalAlign top }` in one undo step and the cell is pressed

#### Scenario: One property changes
- **WHEN** `a` has `style a { textAlign left; verticalAlign top }` and the middle-left cell is chosen
- **THEN** the statement becomes `style a { textAlign left }`, since `middle` is the default, and the top-left cell is no longer pressed

#### Scenario: A text's row
- **WHEN** `text t "T"` is selected
- **THEN** the control shows three cells, the left one greyed as inherited, and choosing the right one writes `style t { textAlign right }`

#### Scenario: Keyboard
- **WHEN** the picker has focus on the centre cell and Down then Enter are pressed
- **THEN** the text gains `verticalAlign bottom` for the selection, and the cell's accessible name is "centre, bottom" ("centro, abajo" in Spanish)

#### Scenario: Not on a flow node
- **WHEN** node `api` of a flow diagram is selected
- **THEN** the strip shows no alignment picker

#### Scenario: Read-only canvas
- **WHEN** the canvas is read-only and box `a` is selected
- **THEN** the picker's cells are drawn disabled with the written pair pressed, and choosing one writes nothing
