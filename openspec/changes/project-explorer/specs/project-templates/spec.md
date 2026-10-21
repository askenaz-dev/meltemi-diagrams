## MODIFIED Requirements

### Requirement: Templates
The templates SHALL be `flow`, `c4`, `sequence`, `free` and `purchase`. Each SHALL validate without
diagnostics and build its catalog. `purchase` SHALL be the reference example: a model of a
customer, a web store, an API gateway, orders, payments, an event bus, an orders database and an
external payment provider; context and container views; a payment sequence linked to the model
with approved and declined scenarios; an executive free composition linked to the model; an
animated story from the context to the containers; and export profiles (PDF sheet, PNG slide, MP4
video), with catalog settings. Its container view SHALL be laid out top to bottom so that it is no
wider than twice its height, and its executive slide SHALL fit the shop group to its boxes. Their
names, titles in words, descriptions, contents (the counts of diagrams, models, views and stories)
and `project.json` SHALL come from `@meltemi/diagrams-project` (`TEMPLATES`, `templateManifest`),
so that `init` and the playground offer the same templates with the same manifests, which pin the
released tool version; `init --list` SHALL print each template's name, title, description and
contents, and the playground's build SHALL write them into `templates.json` with two thumbnails
per template, the template's first diagram rendered as static SVG without embedded fonts in its
theme and in the dark counterpart, each at most 200 KiB.

#### Scenario: Reference example
- **WHEN** `mdg init purchase --template purchase` runs
- **THEN** its catalog holds 4 diagrams and 1 story and its profiles include `video` (MP4)

#### Scenario: Same manifest in both hosts
- **WHEN** `templateManifest("shop", "purchase", versions)` is called
- **THEN** it returns the `project.json` text `init --template purchase --name shop` writes, with the catalog settings

#### Scenario: Balanced container view
- **WHEN** the purchase container view is laid out
- **THEN** its picture is no wider than twice its height

#### Scenario: Listing the templates
- **WHEN** `mdg init --list` runs
- **THEN** it prints five lines, `c4` with its title, its description and "1 model, 2 views", and `purchase` with "4 diagrams, 1 story"

#### Scenario: Thumbnails in the build
- **WHEN** `pnpm playground:build` runs
- **THEN** `dist/templates.json` names, for each template, two SVG files under `dist/templates/` that exist, are under 200 KiB and embed no font

#### Scenario: Contents that do not match the files
- **WHEN** a template's declared contents differ from what its files compile to
- **THEN** the templates test fails naming the template and both counts
