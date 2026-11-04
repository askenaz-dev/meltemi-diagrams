## MODIFIED Requirements

### Requirement: Templates
The templates SHALL be `flow`, `c4`, `sequence`, `free` and `purchase`. Each SHALL validate without
diagnostics and build its catalog. `purchase` SHALL be the reference example: a model of a
customer, a web store, an API gateway, orders, payments, an event bus, an orders database and an
external payment provider; context and container views; a payment sequence linked to the model
with approved and declined scenarios; an executive free composition linked to the model; an
animated story from the context to the containers; and export profiles (PDF sheet, PNG slide, MP4
video), with catalog settings. Their names, descriptions and `project.json` SHALL come from
`@meltemi/diagrams-project` (`TEMPLATES`, `templateManifest`), so that `init` and the playground
offer the same templates with the same manifests.

#### Scenario: Reference example
- **WHEN** `mdg init purchase --template purchase` runs
- **THEN** its catalog holds 4 diagrams and 1 story and its profiles include `video` (MP4)

#### Scenario: Same manifest in both hosts
- **WHEN** `templateManifest("shop", "purchase", versions)` is called
- **THEN** it returns the `project.json` text `init --template purchase --name shop` writes, with the catalog settings
