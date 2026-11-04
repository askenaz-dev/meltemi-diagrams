## Why

The owner asked for English and Spanish across the product: the editing interface, the messages,
the pages people receive and the documentation. Today every word is an English literal in the
code (about 2,300 of them), nothing reads the user's language, and the drawings and pages the tool
exports carry English text of their own. This first change gives the product its two languages
where people work and where they read what was exported; the messages of the language and the
command line follow in `localized-messages`, and the documentation in `spanish-documentation`.

## What Changes

- **A localisation package.** `@meltemi/diagrams-i18n` holds the supported locales (`en`, `es`),
  the resolution of language tags (`es-CL`, `es_ES.UTF-8` → `es`), the locale of the tool's own
  words in a process or a page, typed catalogs (the Spanish catalog must have every English key,
  with the same parameters), and plural, list and number formatting through `Intl` with an
  explicit locale. A glossary and style guide keep the Spanish consistent.
- **The interface speaks the user's language.** The canvas (toolbar, palette, menus, strip,
  inspector, theme panel, dialogs, announcements, story timeline), the strings the editor service
  sends to it (field labels and titles, statuses, theme groups, effect names), the playground
  (menus, dialogs, export dialog, statuses, templates), and the VS Code extension (commands,
  settings, menus through `package.nls.es.json`; messages, pickers and progress at run time).
- **Choosing the language.** VS Code follows its display language, or `meltemi.language`
  (`auto`, `en`, `es`); the playground follows the browser and has a language switch that
  reloads the page with the work kept; the canvas takes the language of its host.
- **What is exported has a language of its own.** `project.json` gains `"locale": "en" | "es"`
  (default `en`), the command line takes `--lang`, and the playground's export dialog a language:
  exported drawings (the type lines of C4 entities, such as `[Contenedor: Go]`), HTML players and
  catalogs use it, never the machine's language, so the same sources give the same files
  everywhere.
- **Words written into the user's file** by the canvas (the default label of a new node, note or
  fragment, the starter text of a new playground file) follow the interface's language.

## Capabilities

### New Capabilities

- `localization`: supported locales and their resolution, the interface language of each host,
  the language of exported content, typed catalogs, formatting, and the rule that a missing or
  unsupported language falls back to English.

### Modified Capabilities

- `project-manifest`: the `locale` field.

## Impact

- New package `packages/i18n`; catalogs in `packages/canvas`, `packages/editor`, `packages/edit`
  (default labels), `packages/playground`, `packages/vscode` (`package.nls*.json`, runtime),
  `packages/player`, `packages/catalog`, `packages/layout` (C4 type lines), `packages/project`
  (templates, `locale`).
- Hosts pass the locale: VS Code (setting, webview `lang`), playground (switch, settings),
  CLI (`--lang` for written content), player and catalog pages (`lang`).
- Tests: English output unchanged (every existing test keeps passing); Spanish smoke tests per
  surface; the catalogs' completeness is checked by the compiler and a test for the `nls` files.
- Docs: `docs/editor.md`, `docs/playground.md`, `docs/cli.md`, `docs/language/projects.md`,
  decision 0037, CHANGELOG 1.3.0.
