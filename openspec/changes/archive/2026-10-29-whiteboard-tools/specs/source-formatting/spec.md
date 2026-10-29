## ADDED Requirements

### Requirement: Pen statements
`formatSource` SHALL print a `pen` statement's point list filled, however its lines were broken, when its tuples are separated by commas (tuples written without a comma between them stay on the line where the source has them, since the parser does not continue a list after an item without a comma): on one line when the whole statement fits in 100 columns, and otherwise `[` at the end of the statement's first line, the tuples one level deeper with as many per line as fit in 100 columns, `, ` between them and the comma that follows the last tuple of a line kept at the end of that line, and `]` on its own line, followed by the block when there is one. The formatter keeps the tokens it is given, so it neither adds nor removes a comma: the last line ends with one only when the source has one before `]`. `via` lists keep the rule of "Canonical layout" (one item per line when expanded). The safety guarantees SHALL hold for pen statements.

#### Scenario: A short stroke
- **WHEN** the input is `pen p [(0,0),\n(10,10),(20,0)]`
- **THEN** the output is `pen p [(0, 0), (10, 10), (20, 0)]` on one line

#### Scenario: A long stroke
- **WHEN** a pen statement holds sixty tuples, some one per line
- **THEN** the output puts `[` at the end of the first line, the tuples one level deeper filled to 100 columns with a trailing comma on every line, and `]` on its own line, and formatting the output again changes nothing

#### Scenario: A via list keeps its rule
- **WHEN** the input is `line l from (0, 0) to (100, 0) via [(50, 20),\n(60, 20)]`
- **THEN** the `via` list is printed one item per line as before

#### Scenario: A broken pen statement is refused
- **WHEN** the input contains `pen p [(0, 0), (10,]`
- **THEN** the result is `ok: false` with a syntax diagnostic, and the input is not modified
