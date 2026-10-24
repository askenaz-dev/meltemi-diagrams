## ADDED Requirements

### Requirement: Line tokens and line statements
`formatSource` SHALL lay out `--` and `---` as it lays out the arrows (one space on each side) and a `line` statement as a keyword statement whose tuples and `via` list follow the spacing rules of "Canonical layout" (no space after `(` or before `)`, one after each comma, the space before `[` kept), and its safety guarantees SHALL hold for both.

#### Scenario: A line relation and a line object
- **WHEN** the input is `diagram d:free{\n  a--b\n  line l "L" from (0,0) to (100,0) via [(50,20),(60,20)]\n}`
- **THEN** the output is `diagram d: free {\n  a -- b\n  line l "L" from (0, 0) to (100, 0) via [(50, 20), (60, 20)]\n}\n`

#### Scenario: Multi-line via of a line object
- **WHEN** a `line` statement writes its list as `via [(50, 20),\n(60, 20)]`
- **THEN** the output puts `via [` at the end of the line, one item per line one level deeper with its comma, and `]` on its own line

#### Scenario: A broken line token is refused
- **WHEN** the input contains `a ---> b`
- **THEN** the result is `ok: false` with `syntax.unexpected-character`, and the input is not modified
