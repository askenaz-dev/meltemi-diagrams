## MODIFIED Requirements

### Requirement: Language of exported content
Words the tool adds to exported content (the type lines of C4 entities and their `External`
prefix, the controls, summaries and headings of HTML players and catalogs, and the players' hover
cards, detail panels, trails, zoom controls and announcements, the type words of C4 entities on
cards included) SHALL be in the content language: the command line's `--lang` when given, else the
project's `locale`, else English, and in the playground the language of the export dialog, preset
from the project. Exported pages SHALL carry it as their `lang`. The interface language and the
machine's settings SHALL NOT change exported files.

#### Scenario: Spanish C4 view
- **WHEN** a project with `"locale": "es"` exports a container view where `api` is a container with
  technology Go
- **THEN** the drawing shows `[Contenedor: Go]` under the entity's name

#### Scenario: Same bytes everywhere
- **WHEN** the same project is exported on a machine set to Spanish and on one set to English,
  without `--lang`
- **THEN** the files are identical

#### Scenario: Spanish player
- **WHEN** a story is exported as an HTML player with `--lang es`
- **THEN** the page has `lang="es"`, its play button reads "Reproducir" and its summary lists the
  scenes as "Escena 1: …"

#### Scenario: Spanish cards and controls
- **WHEN** the `containers` view of commerce is exported as an HTML player with `--lang es` and
  `shop.api` is hovered
- **THEN** the card reads "Contenedor · HTTP", the zoom-in button is named "Acercar" and the
  drill-down of `shop.api` announces "Se abrió components"

#### Scenario: Machine language ignored
- **WHEN** the same page is exported on a machine set to Spanish without `--lang` and without a
  project `locale`
- **THEN** the card words are English and the bytes equal an export from an English machine
