## ADDED Requirements

### Requirement: Choosing the profile from the request
`SKILL.md` SHALL hold, in its workflow, a table from what the person wants to show to the profile
that draws it, with its reference and an example, and one row or more for each profile of the
language. It SHALL say when not to draw, because a table or a sentence says the same, and that the
agent states its plan in one line (profile, layout mode, theme and what it leaves out) and
continues without waiting for an answer.

#### Scenario: Messages over time
- **WHEN** an agent following the skill is asked for "the calls between the app, the API and the bank when a payment is declined"
- **THEN** it chooses `sequence`, says so in one line with what it leaves out, and writes the sheet without asking which profile to use

#### Scenario: Every profile has a row
- **WHEN** the skills test reads the table of `SKILL.md`
- **THEN** each of `flow`, `sequence`, `c4`, `free` and `gantt` is the profile of a row whose reference or example path exists in the skill

#### Scenario: A profile without a row is caught
- **WHEN** the language gains a profile that no row of the table names
- **THEN** the skills test fails naming the profile

#### Scenario: A list is not a diagram
- **WHEN** an agent following the skill is asked to "diagram" five services with their owner and their language, and no relation between them
- **THEN** the skill directs it to answer with a table and to offer a diagram of how the services relate

### Requirement: The design reference
The skill SHALL carry `reference/design.md`, listed under Reference in `SKILL.md`, with the
sections `## Focus`, `## Density`, `## Colour`, `## Text`, `## Arrangement`, `## What to avoid` and
`## Before you deliver`, in that order. Each rule SHALL name the statement of the language that
applies it, and every fenced `.meltemi` example in it SHALL validate without diagnostics.

#### Scenario: The sections
- **WHEN** the skills test reads `reference/design.md`
- **THEN** the seven headings are found in order and `SKILL.md` links the file under Reference

#### Scenario: The copies
- **WHEN** `pnpm skills:sync` runs
- **THEN** every copy of the skill holds `reference/design.md` with the canonical text

#### Scenario: An example that stops validating is caught
- **WHEN** a fenced example of `reference/design.md` gains a diagnostic
- **THEN** the skills test fails naming the example and the diagnostic's code

### Requirement: Focus and colour in the design reference
`reference/design.md` SHALL state that the accent marks the one or two elements a reader should
see first and that every other element keeps the theme's default style; that colours standing for
categories need a legend of `tag` elements, and that a colour without a meaning is removed; and
that dashed lines keep one meaning in a sheet.

#### Scenario: Five boxes to highlight
- **WHEN** an agent following the reference wants to highlight five boxes of a sheet as important
- **THEN** the reference directs it to choose the one or two that carry the message and to leave the others in the default style

#### Scenario: Colours by team
- **WHEN** the boxes of a sheet are coloured by the team that owns them
- **THEN** the reference directs the agent to add a row of `tag` elements with each colour and its team

### Requirement: Density in the design reference
`reference/design.md` SHALL state that a sheet reads at a glance with up to twelve boxes, that one
with more is organised in groups, and that one with more than thirty is split into an overview of
its groups and a detail sheet for each, joined by links, or into C4 views of one model. It SHALL
give a removal test to run before delivery: each box, arrow and label is removed unless a reader
would miss it.

#### Scenario: Thirty-four components
- **WHEN** an agent following the reference is asked to draw a platform of thirty-four components
- **THEN** it writes an overview of the groups and a detail sheet for each group, joined by links, or the views of a C4 model, and no single sheet of thirty-four boxes

#### Scenario: Two boxes that always go together
- **WHEN** two boxes of a sheet have the same neighbours and the same arrows
- **THEN** the removal test directs the agent to draw them as one box

#### Scenario: A system of twenty components
- **WHEN** an agent following the reference is asked to draw a system of twenty components
- **THEN** it keeps them in one sheet, inside groups, and splits nothing

### Requirement: Looking at the drawing before delivering
The skill's review step SHALL have the agent look at a picture and never at the text of an SVG: a
PNG exported to a temporary folder, or `preview` through MCP. It SHALL list the defects to look
for, have the agent name the ones it found and fixed or say why each does not apply, restructure
before moving coordinates, and stop after two rounds. With no browser and no MCP, the agent SHALL
say that the sheet was validated and not looked at.

#### Scenario: With the command line
- **WHEN** an agent following the skill has a sheet without diagnostics and a browser is installed
- **THEN** it exports a PNG to a temporary folder, reads the picture, names what it found and fixed, and leaves in the project only the export the person asked for

#### Scenario: Through MCP
- **WHEN** the agent works through the MCP tools
- **THEN** it looks at the picture that `preview` returns and reports in the same way

#### Scenario: Nothing to look with
- **WHEN** no browser is installed and no MCP tool is available
- **THEN** the agent reports that the sheet was validated and not looked at, and does not say that it reviewed the drawing

#### Scenario: The defects are named
- **WHEN** the skills test reads the review step of `SKILL.md`
- **THEN** it finds cut or overlapping text, a label away from its arrow, an arrow through a box it does not join, uneven gaps between peers, a crowded part beside an empty one and text too small to read

### Requirement: A theme from a brand
`reference/themes.md` SHALL hold a section on making a theme from a brand: the sources it takes (a
website the agent reads with its own tools, a tokens file, colours the person gives), the token
each value becomes, the bundled family nearest to each font, a `theme` block that extends a
built-in theme in a file of the project, and a report of each value used and each approximated.
The agent SHALL NOT make it the project's default theme unless asked.

#### Scenario: From a website
- **WHEN** an agent following the reference is asked to draw a sheet "in the colours of" a website
- **THEN** it writes a `theme` block that extends a built-in theme, uses it in the sheet it was asked for, and reports which colour became which token and which font was replaced by which bundled family

#### Scenario: A brand colour that cannot be read
- **WHEN** the brand's colour as the fill of tags gives `layout.low-contrast` with the text over it
- **THEN** the reference directs the agent to keep the brand's colour for the fill and to choose a text colour that passes, and to say so in its report

#### Scenario: A font that is not bundled
- **WHEN** the brand's font is not one of the bundled families
- **THEN** the theme names the nearest bundled family, never a system family, and the report says which one replaced it

#### Scenario: The project's default
- **WHEN** the person asked for one sheet in the brand's colours
- **THEN** `project.json` is unchanged and the other sheets keep their theme
