## Context

Every user-facing word is an inline English literal: about 240 in the canvas, 550 in the editor
service strings the canvas shows, 255 in the playground, 170 in the VS Code extension, 125 in the
player and catalog runtimes (an inventory is in the change's exploration). Nothing reads a
language: there is no `vscode.l10n`, no `package.nls.json`, no `navigator.language`. Exports must
be byte-identical across machines (decisions 0016, 0024, 0027, 0032), and the drawings carry some
words of the tool: the type lines of C4 entities (`[Container: Go]`, `External Person`,
`[Software System]`). Player and catalog runtimes are inlined into every exported page.

## Goals / Non-Goals

**Goals:**

- English and Spanish everywhere a person works or reads an export, with one mechanism.
- The interface follows the user's language; exported files follow the project's, never the
  machine's.
- English output unchanged, so every existing test, snapshot and visual reference still holds.

**Non-Goals:**

- The messages of the language (diagnostics, quick fixes, hover, completion), edit rejections,
  import findings and the command line's own output: `localized-messages`.
- The documentation: `spanish-documentation`.
- The language's keywords and values, which are code and stay English; the brand name
  "Meltemi Diagrams"; UML fragment operators (`alt`, `loop`), which are notation.
- More languages; the mechanism allows them, the catalogs ship two.

## Decisions

### Typed catalogs, one per package

Each package keeps its words in `src/messages/en.ts` and `es.ts`: plain objects of strings and of
functions for sentences with values (`connected: (from, to) => \`Connected ${from} to ${to}.\``).
The Spanish object is typed as the English one, so a missing key or a different parameter list is
a compile error. Functions let each language build its own grammar (plurals, gender, order)
instead of one template language for both. `catalog(en, es)` returns the catalog of a locale.
Alternatives: ICU message strings (a parser in every bundle and a second syntax to learn); JSON
files with keys (no type checking of parameters); `vscode.l10n` (VS Code only).

### One interface locale per process or page, explicit locales for content

`setLocale` and `getLocale` hold the interface language of a process (the extension host, the
command line) or a page (the playground, a webview). Catalog lookups default to it, so the many
call sites that build interface strings do not thread a parameter. Content that is written to
files (drawings, players, catalogs) takes an explicit `locale` option and never reads the
process's language; this keeps exports reproducible while the interface follows the person.

### Where the interface language comes from

- VS Code: `meltemi.language` (`auto`, `en`, `es`; `auto` follows `vscode.env.language`). The
  contributions (command titles, setting descriptions, menus) use `package.nls.json` and
  `package.nls.es.json`, which VS Code picks by its own display language. The webview gets the
  language in its `<html lang>`. Changing the setting refreshes open canvases.
- The playground: the browser's language, or the language switch in the header, kept with the
  other settings; switching reloads the page (the project is kept in the browser already), so
  every part starts in the new language without a second code path.
- Player and catalog pages: their `<html lang>`, written when they are exported.

### The language of exported content

`project.json` gains `"locale": "en" | "es"` (default `en`; another value is
`project.invalid-value`). The command line's `--lang` sets it for one run (it also sets the
language of the command's own messages, in `localized-messages`), and the playground's export
dialog offers it, preset from the project. Drawings use it for the words the tool adds (the C4
type lines, the default `External` prefix), so a Spanish project draws `[Contenedor: Go]`; HTML
players and catalogs use it for their controls and headings and write it as the page's `lang`.
Files outside a project use English unless `--lang` says otherwise. Because the language is part
of the input, the same sources and options give the same bytes on every machine.

### Words written into files

A new node gets the label "Nodo" in a Spanish interface: default labels and starter texts are what
the person would have typed, so they follow the interface language, not the project's.

### Formatting

`Intl.PluralRules`, `Intl.ListFormat` and `Intl.NumberFormat` with the explicit locale for counts,
lists ("A, B y C") and decimals ("1,2 s"). Coordinates and values written in the language keep the
dot, since they are code.

### Spanish style

Neutral Spanish, infinitives for commands ("Exportar SVG"), "tú" where a sentence addresses the
person, code in backticks unchanged. A glossary in `packages/i18n/README.md` fixes the terms
(canvas: lienzo, relation: relación, label: etiqueta, tag: marca, arrowhead: punta, story:
historia, scene: escena, player: reproductor, catalog: catálogo, …).

## Risks / Trade-offs

- [Tests assert English names] → tests run in English by default; Spanish has its own smoke tests
  in each browser suite.
- [Display words used as values] → the inspector's "mixed" and "theme" placeholders become flags
  (`mixed: true`, inherited values), so translating them cannot change behaviour; VS Code button
  comparisons compare against the same catalog entry that was shown.
- [The reload on switching language in the playground] → the project, the open file and the
  settings are kept; only transient state (an open dialog) is lost.
- [Catalog size in bundles] → both languages are inlined in the webview and player runtimes, a few
  tens of kilobytes; exported pages carry only the runtime's catalogs, not the editor's.
