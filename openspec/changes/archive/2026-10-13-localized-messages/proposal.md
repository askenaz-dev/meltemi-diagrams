## Why

After `localized-interface`, the editing interface speaks English and Spanish, but what the tool
says about the user's text does not: the 121 diagnostic codes and their 500 messages, hints and
related notes; quick-fix titles; hover and completion; the reasons an edit is refused (about 200);
the findings of the Mermaid and PlantUML importers; and the command line's help and output. These
are the words people read most when they are stuck, so the owner's request for both languages
needs them too.

## What Changes

- **Diagnostics in the interface language.** Every message, hint and related note of the
  language, the model, layout, projects, assets, plugins and limits comes from catalogs. Codes,
  severities and ranges stay the same; conformance still compares codes. A diagnostic may carry
  `data` (the candidates of a "did you mean", the ids and values a fix needs), so quick fixes stop
  reading English text.
- **Language services.** Quick-fix titles, hover documentation of every keyword and value,
  completion details and rename refusals.
- **Edit rejections.** The reasons of `edit.*` rejections and the descriptions of dependents in
  the delete dialog.
- **Import findings and coverage.** The notes of approximated and dropped constructs, the import
  report, and the coverage tables' texts (which also generate the import documentation in both
  languages).
- **The command line.** `--lang en|es` and `MELTEMI_LANG` (else `LC_ALL`, `LC_MESSAGES`, `LANG`,
  else the system's language) choose the language of help, messages and diagnostics; machine
  formats keep their keys and codes. The review report, a written file, follows `--lang` or the
  project's `locale`, like every export.
- Every host passes its interface language to compilation: VS Code's Problems view, hover and
  code actions, the playground's problems list and the canvas's "out of date" banner.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `language-syntax`: the diagnostics contract (messages in the interface language, `data`).
- `editor-language-services`: quick fixes from `data`; hover, completion and refusals localised.
- `diagram-import`: findings and coverage texts in both languages.
- `cli-binary`: `--lang` and the environment's language for help and messages.

## Impact

- Catalogs in `packages/language`, `packages/model`, `packages/layout`, `packages/project`,
  `packages/assets`, `packages/edit`, `packages/editor` (services), `packages/import`,
  `packages/cli`, `packages/assist` (user-facing messages).
- Snapshots stay English; new Spanish tests per package; the corpus' diagnostics are compared in
  English as today.
- Docs: `docs/language/diagnostics.md` keeps the English templates; `docs/cli.md`; CHANGELOG.
