## ADDED Requirements

### Requirement: Effects on a diagram or a story
The skill SHALL tell the two forms of motion apart by what the person asks for, in the workflow of
`SKILL.md` with a short example of each: animating an arrow or the diagram is `animate` on the
existing diagram's relations and adds no `story`; showing a flow step by step is a `story` of
scenes, times and actions. It SHALL say how each is checked, and the language, stories and MCP
references SHALL state the same rule.

#### Scenario: Animate the arrows of a diagram
- **WHEN** an agent following the skill is asked to "animate the arrows of this diagram"
- **THEN** it writes `animate` statements for the relations of the existing diagram, adds no story, and checks the effects on the diagram itself

#### Scenario: Show the flow step by step
- **WHEN** an agent following the skill is asked to "show me the flow step by step"
- **THEN** it writes a `story` with scenes, times and actions for the diagram and checks its timeline and scene frames

#### Scenario: An anonymous relation
- **WHEN** the arrow to animate has no id
- **THEN** the skill directs the agent to name it with `as <id>` and target that id, changing nothing else of the relation

#### Scenario: How each is checked
- **WHEN** the skill is read for the check of each form
- **THEN** effects are checked in the diagram's ordinary view with frames at two instants (`preview` with `at` and no `story`, or `export --at`), and a story with its compiled timeline and frames of its scenes

#### Scenario: The rule is where each form is read
- **WHEN** the skills test reads `SKILL.md` and the `language.md`, `stories.md` and `mcp.md` references
- **THEN** each states which request asks for effects and which for a story, and `SKILL.md` keeps its size rule
