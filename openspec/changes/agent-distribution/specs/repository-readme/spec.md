## Purpose

The README as the product's first page, in English and Spanish: what a visitor sees first, how to
install with an agent and without one, the gallery, and a comparison with the other ways of
making a diagram that says where each is better.

## ADDED Requirements

### Requirement: The first screen of the README
`README.md` and `README.es.md` SHALL open, before any `##` heading, with one sentence saying what
the product is, badges for the CI, the command line's npm version and the licence, links to the
web app, the documentation, the gallery and the changelog, and the editing demo. Their first
section SHALL be for coding agents and their second for installing without one.

#### Scenario: The order of the top
- **WHEN** the README test reads `README.md`
- **THEN** the three badges, the four links and the demo come before the first `##` heading, the first section is the agents' and the second holds `npm install --global @meltemi/diagrams-cli`

#### Scenario: A section moved above the agents'
- **WHEN** another section is placed before the agents' section
- **THEN** the README test fails naming the heading found first

### Requirement: The agents' section of the README
The agents' section SHALL hold the install commands of the plugin for Claude Code and Codex and of
the `skills` command, each in a fenced block, four requests in plain words that an agent with the
skill answers with a diagram, and a link to the agents guide. Each command SHALL be one that the
agents guide holds.

#### Scenario: The commands and the requests
- **WHEN** the README test reads the agents' section
- **THEN** it finds `/plugin marketplace add askenaz-dev/meltemi-diagrams`, `npx skills add askenaz-dev/meltemi-diagrams --skill meltemi-diagrams`, four quoted requests and a link to `docs/agents.md`

#### Scenario: A command that the guide does not hold
- **WHEN** a command of the README's agents' section is not in `docs/agents.md`
- **THEN** the README test fails naming the command

### Requirement: The gallery near the top
The gallery's grid, one picture for each profile linked to `gallery/README.md`, SHALL be the third
section of both READMEs, before the section on trying the product from the repository.

#### Scenario: Five pictures in the third section
- **WHEN** the README test reads the third section
- **THEN** it holds a picture of each of the flow, sequence, C4, free and gantt sheets of the gallery, and each picture's file exists

#### Scenario: A picture of the grid that is gone
- **WHEN** the grid names a file that the gallery does not hold
- **THEN** the README test fails naming the file

### Requirement: How it compares
Both READMEs SHALL hold a table that compares Mermaid and PlantUML, draw.io and Excalidraw,
diagrams an agent draws as HTML or SVG, and Meltemi Diagrams, by how a diagram is made, who
arranges it, what is reviewed in Git, how it is changed by hand, motion and where it shows without
a tool. A paragraph after it SHALL name what the others do better, GitHub drawing Mermaid in
Markdown among it.

#### Scenario: The table
- **WHEN** the README test reads the comparison
- **THEN** it finds the four columns and the six rows, and the paragraph after the table names Mermaid's rendering in GitHub and one advantage of each of the other two

#### Scenario: The paragraph removed
- **WHEN** the paragraph on what the others do better is deleted
- **THEN** the README test fails naming the comparison's section

### Requirement: The two READMEs keep one structure
`README.es.md` SHALL hold the sections of `README.md` in the same order, with the same commands,
badges and pictures, and a test SHALL fail naming the section or the command that one of them
lacks.

#### Scenario: A section only in English
- **WHEN** `README.md` gains a section that `README.es.md` does not have
- **THEN** the README test fails naming the section and `README.es.md`

#### Scenario: A command that differs
- **WHEN** a fenced command of the agents' section differs between the two files
- **THEN** the README test fails naming the command
