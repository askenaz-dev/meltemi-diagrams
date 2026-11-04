## MODIFIED Requirements

### Requirement: Spanish documentation
Every page a person reads to learn and use the product SHALL have a Spanish version: `README.es.md` for the README, and `docs/es/<path>.md` for `docs/README.md`, `getting-started.md`, `features.md`, `editor.md`, `playground.md`, `cloud.md`, `cli.md`, `player.md`, `catalog.md`, `assist.md`, `plugins.md`, `security.md`, `compatibility.md`, `performance.md`, `agents.md`, every page of `docs/language/`, the three tracks and the two import pages. Decision notes, the roadmap, quality and verification results, launch and pilot material, the release process, CONTRIBUTING and the CHANGELOG SHALL stay in English. Spanish pages SHALL use the words of the Spanish interface and the glossary of `@meltemi/diagrams-i18n`, and SHALL keep code as written.

#### Scenario: A guide in Spanish
- **WHEN** a person opens `docs/es/editor.md`
- **THEN** it explains the editor in Spanish, names the command "Abrir el lienzo al lado", and its samples are the English page's samples

#### Scenario: The agents page in Spanish
- **WHEN** a person opens `docs/es/agents.md`
- **THEN** it explains the prompt, the installation and the proof in Spanish, and its fenced blocks (the one-line prompt, the commands) are the English page's

#### Scenario: A page listed without its twin
- **WHEN** `docs/agents.md` is in the translated list and `docs/es/agents.md` is missing
- **THEN** the documentation test fails naming `docs/es/agents.md`
