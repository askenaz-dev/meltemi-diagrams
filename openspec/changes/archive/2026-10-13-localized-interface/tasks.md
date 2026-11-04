## 1. Foundation

- [x] 1.1 `packages/i18n`: locales, `resolveLocale`, `getLocale`/`setLocale`, `catalog(en, es)`, `Intl` helpers (plural, list, number, seconds); README with the glossary and style guide; unit tests
- [x] 1.2 `project.json` `locale` (manifest, validation, `ProjectSessions` and layout options); the command line's `--lang` for written content (export, build catalog, player); layout option `locale` for the C4 type lines

## 2. Catalogs

- [x] 2.1 Canvas: toolbar, palette, menus, strip and inspector controls, glyph names, theme panel, dialogs, announcements, story timeline; the webview takes `<html lang>`
- [x] 2.2 Editor service strings the canvas shows: field labels, titles, placeholders (with `mixed` and inherited values as flags), statuses, theme groups and labels, effect names, sequence and C4 fields; default labels written into files (`packages/edit`)
- [x] 2.3 Playground: shell, dialogs, export dialog (with the content language), statuses, templates; the language switch and its reload
- [x] 2.4 VS Code: `package.nls.json` and `package.nls.es.json` for every contribution; runtime messages, pickers, progress, output channel; `meltemi.language`; button comparisons through the catalog
- [x] 2.5 Player and catalog runtimes and pages: controls, summaries, headings, search; `lang` from the export

## 3. Tests and documentation

- [x] 3.1 Unit tests: resolution, catalogs' formatting, Spanish strings of each package, C4 type lines in Spanish, `locale` validation; English output and every snapshot unchanged
- [x] 3.2 Browser suites in Spanish: a webview test, a playground test with the switch, a player and a catalog page; a VS Code test of the `nls` files' completeness
- [x] 3.3 Docs (`editor.md`, `playground.md`, `cli.md`, `projects.md`, `player.md`, `catalog.md`), decision 0037, CHANGELOG 1.3.0; typecheck, lint, every suite, conformance, acceptance
