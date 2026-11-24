# Spec Delta

## ADDED Requirements

### Requirement: Code notes in the skill
The skill's references for flow diagrams, free compositions, sequence diagrams and C4 views SHALL teach that `style <note> { textFormat code }` draws a note as a code block, that the label holds the fragment with `\n`, `\t`, `\"` and `\\` and its spaces as they are, and that Markdown fences, no-break spaces and a hand-set monospace `font` are not how code is written. Its language reference SHALL list `textFormat`, and its themes reference `code` and `codeText`.

#### Scenario: An agent draws a snippet
- **WHEN** an agent with the skill is asked to add the body of a function beside a component of a flow sheet
- **THEN** it writes a `note` whose label is the body with `\n` and its indentation and a `style` with `textFormat code`, and writes no Markdown fence, no no-break space and no `font` for it

#### Scenario: A reference that misses the property
- **WHEN** `textFormat` is a style property of the language and the skill's language reference does not name it
- **THEN** the skill test fails naming the property

#### Scenario: The size rule still holds
- **WHEN** the skill's front matter and size test runs
- **THEN** `SKILL.md` stays under its limit

### Requirement: Checking a code note as an agent
The skill SHALL say that a code block is as wide as its longest line, so long lines are shortened or the note is given a `fontSize`, and that the block is checked in the export or, through the MCP, in the `preview` image. `docs/agents.md` and `docs/es/agents.md` SHALL say the same for people, and the copies under `.claude/skills/` and `.agents/skills/` SHALL equal `skills/` after `pnpm skills:sync`.

#### Scenario: Checked in the preview
- **WHEN** an agent connected to the MCP writes a code note and calls `preview`
- **THEN** the image shows the block with its indentation, and the skill told the agent to look for it there

#### Scenario: The references are synced
- **WHEN** `pnpm skills:sync` runs after the references change
- **THEN** the copies under `.claude/skills/meltemi-diagrams/` and `.agents/skills/meltemi-diagrams/` equal `skills/meltemi-diagrams/`

#### Scenario: A missing Spanish paragraph
- **WHEN** `docs/agents.md` describes code notes and `docs/es/agents.md` does not
- **THEN** the localized documentation test fails naming the Spanish page
