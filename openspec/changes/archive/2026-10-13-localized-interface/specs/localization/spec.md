## ADDED Requirements

### Requirement: Supported languages
The product SHALL support English (`en`) and Spanish (`es`). A language tag or POSIX locale SHALL
resolve to `es` when its language is Spanish (`es`, `es-CL`, `es_ES.UTF-8`) and to `en` otherwise;
a missing or unsupported language SHALL fall back to English. Every catalog SHALL have a Spanish
entry for each English one, with the same parameters, checked when the code is compiled.

#### Scenario: Regional tags
- **WHEN** the language is resolved from `es-419`, `es_MX.UTF-8`, `fr-FR` and an empty value
- **THEN** the results are `es`, `es`, `en` and `en`

### Requirement: Interface language
The words of the interface SHALL be in the interface language: in VS Code, the canvas, its
inspector and theme panel, the extension's messages, pickers and progress, and its command titles,
setting descriptions and menus; in the playground, every menu, dialog, status and the canvas. VS
Code SHALL take it from `meltemi.language` (`auto`, `en`, `es`; `auto` follows VS Code's display
language) and SHALL refresh open canvases when the setting changes; the playground SHALL take it
from its language switch, else the browser's language, keep the choice with its settings, and
reload the page with the work kept when it changes. Code, the language's keywords and values, and
the product name SHALL stay as they are.

#### Scenario: Spanish canvas in VS Code
- **WHEN** VS Code's display language is Spanish and `meltemi.language` is `auto`
- **THEN** the canvas palette offers "Nodo", the strip's rows are "Relleno", "Borde" and
  "Color del texto", and the command palette lists "Meltemi Diagrams: Abrir el lienzo al lado"

#### Scenario: Switching the playground
- **WHEN** the playground's language switch is set to Español
- **THEN** the page reloads with the same project and open file, and its menus, dialogs and
  canvas are in Spanish

### Requirement: Words written into a file
Text the canvas writes for the person (the default label of a new element, note or fragment, and
the starter text of a new playground file) SHALL be in the interface language.

#### Scenario: A Spanish node
- **WHEN** a node is created from the palette in a Spanish interface
- **THEN** the text gains `node1["Nodo"]`

### Requirement: Language of exported content
Words the tool adds to exported content (the type lines of C4 entities and their `External`
prefix, the controls, summaries and headings of HTML players and catalogs) SHALL be in the
content language: the command line's `--lang` when given, else the project's `locale`, else
English, and in the playground the language of the export dialog, preset from the project. Exported
pages SHALL carry it as their `lang`. The interface language and the machine's settings SHALL NOT
change exported files.

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

### Requirement: Formatting by language
Counts, lists and decimals shown to people SHALL be formatted for the language with `Intl` and an
explicit locale (plural forms, "A, B y C", "1,2 s" in Spanish). Values written in the language,
such as coordinates and times in the text, SHALL keep their written form.

#### Scenario: Seconds in the timeline
- **WHEN** the story timeline shows 1200 ms in a Spanish interface
- **THEN** it reads "1,2 s"
