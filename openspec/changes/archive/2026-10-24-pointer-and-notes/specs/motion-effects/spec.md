## ADDED Requirements

### Requirement: Effects on notes
`pulse` SHALL target notes in flow diagrams, free compositions and C4 views as elements. `dash` SHALL target a note or a free text that has an outline: one whose `style` entries, applied classes or a `rule` of the diagram for its kind set `fill`, `stroke` or `pattern`; on a note or text without one, `dash` SHALL be `animate.invalid-target` (error) with the reason naming the target and its kind and the hint to give it a `fill` or a `stroke`, or to use a pulse. The model SHALL expose the predicate (`outlined(diagram, element)`) so the editor offers the dash to the same targets. A theme's rule SHALL not count, since the model resolves no theme. The dash on an outlined note SHALL run along its outline rect, not its leader.

#### Scenario: Pulse on a free note
- **WHEN** a free diagram has `animate hint { effect pulse }` on a note
- **THEN** it compiles without diagnostics and the halo is planned on the note's box

#### Scenario: Dash on an outlined note
- **WHEN** a flow diagram has `style limits { stroke "#e8a600" }` and `animate limits { effect dash }` on a note
- **THEN** it compiles without diagnostics and the frame at 400 ms moves the dash of the note's rect, not of its leader

#### Scenario: Dash from a rule
- **WHEN** a free diagram has `rule note { fill "#fff3bf" }` and `animate hint { effect dash }`
- **THEN** it compiles without diagnostics

#### Scenario: Dash on a note without an outline
- **WHEN** a diagram has `animate limits { effect dash }` on a note with no `fill`, `stroke` or `pattern` from the diagram
- **THEN** `animate.invalid-target` says `limits` is a note without an outline and names the `fill` or `stroke` to write, or a pulse

#### Scenario: The editor offers the dash
- **WHEN** an outlined note is selected on the canvas
- **THEN** the Effects section lists Pulse and Moving dash, and a note without an outline lists Pulse alone
