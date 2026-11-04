## Why

The owner asked for the documentation in Spanish as well. The guides and the language reference
are English only (about 50,000 words in `docs/`, the README and the import pages generated from
the coverage tables), so a Spanish speaker who uses the Spanish interface still has to read
English to learn the language.

## What Changes

- **Spanish guides and reference.** `docs/es/` mirrors the user-facing documentation: the index,
  getting started, features, the editor, playground, CLI, player, catalog, assist, plugins,
  security, compatibility and performance guides, the whole language reference
  (`docs/es/language/`), the tracks for people coming from other tools, and the import coverage
  pages, generated in Spanish from the same tables. `README.es.md` is the Spanish README.
- **Switching language.** Every translated page starts with a link to its other language; links
  inside Spanish pages lead to Spanish pages where they exist and to the English ones otherwise.
- **Kept in step.** A test fails when a page in scope has no Spanish counterpart, when the code
  blocks of the two versions differ (comments aside), or when a link or anchor in either language
  does not resolve. Decision notes, the roadmap, quality results and the owner's launch and pilot
  material stay in English and are linked as they are.

## Capabilities

### New Capabilities

- `localized-documentation`: the Spanish documentation set, the language links, and the checks
  that keep both languages in step.

### Modified Capabilities

- `documentation-tracks`: the documentation index and tracks exist in both languages.

## Impact

- New files under `docs/es/`, `README.es.md`; a language line at the top of the English pages in
  scope; `pnpm import:docs` writes both languages; the docs test covers both.
- CONTRIBUTING.md: how to update both languages.
