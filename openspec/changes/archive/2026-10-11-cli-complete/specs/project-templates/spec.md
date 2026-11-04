## ADDED Requirements

### Requirement: Init command
`meltemi-diagrams init [folder]` SHALL create a project in the folder (the working folder by
default, created when missing): `project.json` with the project's name (`--name`, or the folder's
name), the language version and the CLI's version range, and the files of the template
(`--template`, `flow` by default). It SHALL write nothing when one of the files exists or the folder
is already a project (except `--ci`), list the templates with `--list`, print each file created and
the next commands, and exit 2 on usage errors.

#### Scenario: New project
- **WHEN** `mdg init shop --template c4` runs in an empty folder
- **THEN** `shop/project.json`, `shop/models/system.meltemi` and `shop/diagrams/views.meltemi` are
  created and `mdg validate shop` reports no diagnostic

#### Scenario: Nothing replaced
- **WHEN** `diagrams/overview.meltemi` exists in the folder and `mdg init` runs
- **THEN** it exits 2, names the file, and writes nothing

### Requirement: Templates
The templates SHALL be `flow`, `c4`, `sequence`, `free` and `purchase`. Each SHALL validate without
diagnostics and build its catalog. `purchase` SHALL be the reference example: a model of a
customer, a web store, an API gateway, orders, payments, an event bus, an orders database and an
external payment provider; context and container views; a payment sequence linked to the model
with approved and declined scenarios; an executive free composition linked to the model; an
animated story from the context to the containers; and export profiles (PDF sheet, PNG slide, MP4
video), with catalog settings.

#### Scenario: Reference example
- **WHEN** `mdg init purchase --template purchase` runs
- **THEN** its catalog holds 4 diagrams and 1 story and its profiles include `video` (MP4)
