## Context

The documentation is English: about 55,000 words in `docs/`, the README and the import coverage
pages that `pnpm import:docs` generates from the importers' tables. After `localized-interface` and
`localized-messages` the product speaks Spanish, and its Spanish interface names things in Spanish
("Abrir el lienzo al lado", "barra de estilo"), so Spanish pages must use those words to match what
people see. A test already resolves every relative link and heading anchor of the repository's
Markdown.

## Goals / Non-Goals

**Goals:**

- A Spanish version of every page a person reads to learn and use the product.
- One way to switch language on every such page.
- Checks that keep the two languages in step when either changes.

**Non-Goals:**

- Decision notes, the roadmap, quality and verification results, launch and pilot material, the
  release process, CONTRIBUTING, the CHANGELOG, package READMEs on npm and OpenSpec artifacts:
  they are written for maintainers and stay English, linked as they are.
- Translating code: keywords, values, ids and samples stay as written.

## Decisions

### `docs/es/` mirrors `docs/`

A page in scope at `docs/<path>.md` has its Spanish version at `docs/es/<path>.md`, and the README
has `README.es.md`. The same relative paths keep links predictable: a Spanish page links to
`es/<path>` pages where they exist and to the English page otherwise (`../decisions/…`). Pages in
scope: the index, getting started, features, the editor, playground, CLI, player, catalog,
assistance, plugins, security, compatibility and performance guides, every page of
`docs/language/`, the three tracks and the two import pages.
Alternative: a suffix beside each page (`editor.es.md`). It keeps pairs together, but doubles every
folder's listing and makes relative links between Spanish pages longer to follow.

### A language line under each title

Each page in scope has, right under its title, a paragraph with the link to its other language:
`[Español](es/editor.md)` on the English page, `[English](../editor.md)` on the Spanish one. It is
the same everywhere, so a test can check it and a reader always finds it in the same place.

### Same code in both languages

Code blocks are the same in both versions, except comments, which are translated. Samples keep
their English labels, as code does; a test compares the code blocks of each pair with comments
removed, so a change to a sample in one language fails until the other follows. Anchors are each
language's own (Spanish headings give Spanish anchors), and the link test checks them all.

### Spanish words of the interface

Spanish pages name commands, settings, buttons and messages with the words of the Spanish
interface, from the catalogs, and follow the style guide and glossary of `@meltemi/diagrams-i18n`.

### Generated import pages

`pnpm import:docs` writes `docs/import/*.md` and `docs/es/import/*.md` from the coverage tables,
whose notes exist in both languages (`localized-messages`); the drift test covers both.

## Risks / Trade-offs

- [Two versions drift] → the pair test fails on a missing counterpart, a different sample or a
  broken link or anchor; CONTRIBUTING asks for both languages in the same change.
- [Prose can still differ in meaning] → reviews of documentation changes cover both pages; the
  checks catch structure, code and links, not meaning.
- [Size: 55,000 words] → translated by page groups, each checked by the same tests.
