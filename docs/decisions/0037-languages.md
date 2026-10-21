# 0037. English and Spanish

Status: accepted (localized-interface change, 12 October 2026)

## Context

Every word of the product was an inline English literal: the canvas, the editor's inspector and
statuses, the playground, the VS Code extension, the HTML player and catalog. The owner asked for
English and Spanish everywhere a person works: the editor and playground, errors and messages,
exported pages and the documentation. Exports are byte-identical across machines (decisions 0016,
0024, 0027, 0032), yet drawings and pages carry some words of the tool: the type lines of C4
entities (`[Container: Go]`), the controls of players and the headings of catalogs.

## Decision

- **Typed catalogs, one per package.** Each package keeps its words in `src/messages/en.ts` and
  `es.ts`; the Spanish object has the English one's type, so a missing word or a different list of
  values does not compile. Sentences with values are functions, so each language builds its own
  grammar (plurals, gender, order). `@meltemi/diagrams-i18n` holds the locales, the resolution of
  language tags, `catalog(en, es)` and formatting with `Intl`.
- **One interface language per process or page.** `setLocale` and `getLocale` hold the language of
  the extension host, the command line or the playground; catalogs default to it, so the many
  places that build interface words do not pass a parameter. VS Code follows `meltemi.language`
  (`auto` follows its display language) and its contributions use `package.nls.json` and
  `package.nls.es.json`; webviews get it as their `<html lang>`; the playground follows the
  browser until a language is chosen, and choosing reloads the page.
- **Explicit languages for content.** What is written to files never reads the interface
  language: drawings, players and catalogs take the project's `"locale"` (English by default), or
  `--lang` and the playground's export dialog for one export, and pages carry it as their `lang`.
  The language is part of the input, so the same sources and options give the same bytes on every
  machine.
- **Words written into sources follow the interface.** A new node is labelled "Nodo" in a Spanish
  canvas, as if the person had typed it.
- **Display words are never values.** The inspector says "mixed" and "theme" through flags
  (`mixed`, `fromTheme`) and VS Code compares the button it shows with the same catalog entry, so
  translating a word cannot change behaviour.
- **Messages are made in the interface language.** Diagnostics, quick-fix titles, hover,
  completion, edit refusals, import findings and the command line's messages take their words
  when they are created. Codes, severities and ranges do not change; diagnostics carry `data`
  (the ids they name, the alternatives a fix may write, the size that fits a text), and fixes and
  checks read it, never the words. Model changes carry facts that `describeChange` words in a
  language; the review report, a written file, follows the content language.
- **Documentation in both languages.** The pages people read to use the product have Spanish
  versions under `docs/es/`, with a language line under each title and the same code; notes for
  maintainers stay English.
- **Code is not translated.** Keywords, values of the language, ids, UML fragment operators and
  the product name stay as written in both languages.

## Alternatives considered

- **ICU message strings.** One syntax for every language, but a parser in every bundle and a
  second syntax to learn, with no type checking of values.
- **JSON files with keys.** Easy to hand to translators, but no checking that both languages have
  the same words and values.
- **`vscode.l10n`.** Native to VS Code, but the canvas, the playground, the command line and the
  exported pages need the same words outside VS Code.
- **The machine's language for exports.** Natural for one person, but two machines would export
  different bytes from the same sources, which breaks reviews, caches and the visual references.

## Consequences

- English output is unchanged: every snapshot, visual reference and acceptance condition holds.
- `@meltemi/diagrams-i18n` is the nineteenth public package; both catalogs of the runtimes are
  inlined in exported pages, a few kilobytes.
- Adding a language is a catalog per package and the locale in `LOCALES`; the type of the English
  catalog lists every word it needs.
