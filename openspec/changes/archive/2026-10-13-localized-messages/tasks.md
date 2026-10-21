## 1. Diagnostics

- [x] 1.1 `Diagnostic.data` (`ids`, `candidates`, values of particular codes), set by every diagnostic a fix reads; quick fixes read `data` only (no parsing of messages or hints); corpus snapshots, model JSON and CLI JSON keep their fields
- [x] 1.2 Catalogs of diagnostics, hints and related notes in `packages/language`, `packages/model`, `packages/layout`, `packages/project`, `packages/assets` (plugins and limits included)

## 2. Services, edits and import

- [x] 2.1 Editor services: hover and keyword documentation, completion details and documentation, quick-fix titles, rename refusals
- [x] 2.2 Edit rejections and the delete dialog's dependents (`packages/edit`)
- [x] 2.3 Import findings, the import report, and coverage notes in English and Spanish (`packages/import`)

## 3. Command line and hosts

- [x] 3.1 The command line: help, usage errors, messages, summaries, progress, prompts (answers in both languages), the review report and model-change details; the assist command's messages
- [x] 3.2 VS Code analyses open documents again when `meltemi.language` changes; the acceptance harness runs child processes with `MELTEMI_LANG=en`

## 4. Tests and documentation

- [x] 4.1 Spanish tests in each package (every quick fix with a Spanish interface); `untranslated` checks; English snapshots, conformance and acceptance unchanged
- [x] 4.2 Docs (`cli.md` messages and environment, `editor.md`, `language/diagnostics.md` note on languages), decision 0037 completed, CHANGELOG; typecheck, lint, every suite
