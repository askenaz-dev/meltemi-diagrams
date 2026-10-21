# localized-documentation Specification

## Purpose
The Spanish documentation under `docs/es/` and `README.es.md`, the language line of every page, and the checks that keep both languages in step.
## Requirements
### Requirement: Spanish documentation
Every page a person reads to learn and use the product SHALL have a Spanish version: `README.es.md` for the README, and `docs/es/<path>.md` for `docs/README.md`, `getting-started.md`, `features.md`, `editor.md`, `playground.md`, `cli.md`, `player.md`, `catalog.md`, `assist.md`, `plugins.md`, `security.md`, `compatibility.md`, `performance.md`, every page of `docs/language/`, the three tracks and the two import pages. Decision notes, the roadmap, quality and verification results, launch and pilot material, the release process, CONTRIBUTING and the CHANGELOG SHALL stay in English. Spanish pages SHALL use the words of the Spanish interface and the glossary of `@meltemi/diagrams-i18n`, and SHALL keep code as written.

#### Scenario: A guide in Spanish
- **WHEN** a person opens `docs/es/editor.md`
- **THEN** it explains the editor in Spanish, names the command "Abrir el lienzo al lado", and its samples are the English page's samples

### Requirement: Language links
Every page in scope SHALL have, right under its title, a paragraph linking to its other language: `[Español](…)` on English pages and `[English](…)` on Spanish ones. Links in Spanish pages SHALL lead to Spanish pages where they exist and to English pages otherwise.

#### Scenario: Switching from English
- **WHEN** a person reads `docs/cli.md`
- **THEN** the line under its title links to `es/cli.md`, whose line under the title links back to `../cli.md`

### Requirement: Both languages kept in step
A test SHALL fail when a page in scope has no Spanish version or no language line, when the code blocks of a pair differ once comments are removed, or when a relative link or heading anchor in either language does not resolve. `pnpm import:docs` SHALL generate the import pages in both languages from the coverage tables, and the drift test SHALL cover both.

#### Scenario: A sample changed in one language
- **WHEN** a sample in `docs/language/styles.md` changes and `docs/es/language/styles.md` does not
- **THEN** the test fails naming both files and the block

