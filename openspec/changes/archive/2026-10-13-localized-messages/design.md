## Context

`localized-interface` gave every package a typed catalog, an interface language per process or
page and an explicit content language for exports. What the tool says about the person's text is
still English: the diagnostics of the language, the model, layouts, projects, assets, plugins and
limits (121 codes, about 500 messages with their hints and related notes), the quick-fix titles,
hover and keyword documentation, completion details and rename refusals of the editor, the reasons
of edit rejections (about 200, in `packages/edit`), the findings, report and coverage notes of the
importers, and the command line's help, summaries, prompts and review report.

Quick fixes read words: `codeActions` takes the ids in backticks of a message, the candidates of a
hint ("Did you mean `x`?", "…: a, b, c") and the size written in the hint of `layout.text-overflow`.
Translating those texts would silently break the fixes.

The corpus compares diagnostics field by field (code, severity, message, range, hints, related);
conformance compares codes only.

## Goals / Non-Goals

**Goals:**

- Every message about the person's text in English and Spanish, in the interface language.
- Codes, severities and ranges unchanged; English messages byte-identical, so snapshots hold.
- Quick fixes that do not depend on words.
- The command line's language from `--lang`, the environment or the system.

**Non-Goals:**

- The language's keywords and values, which stay English.
- The documentation (`spanish-documentation`), except the import coverage notes, which are data.
- Keys of machine formats (`--format json`, the model JSON), which stay as they are.

## Decisions

### Messages are written in the interface language when they are created

Every diagnostic, refusal and finding takes its words from its package's catalog in the interface
language at the moment it is made (`getLocale()`), so every consumer (VS Code, the playground, the
command line, the review report, the model JSON) shows them as they are. The interface language
changes rarely: the command line sets it once per run, the playground reloads, and VS Code analyses
open documents again when `meltemi.language` changes.
Alternative: diagnostics carrying a code and arguments, rendered where they are shown. Every
consumer would need the renderer and the catalogs of every package, and cached results would have
no text of their own.

### One catalog entry per code

Each package's catalog has a `diagnostics` group with an entry per code (a function of the values
it names), and groups for hints and related notes. A message stays one sentence that names the
offending text in backticks, in both languages. Codes written in messages and hints (`` `theme` ``,
`layout manual`) are code and stay as written.

### `data` for fixes

`Diagnostic` gains an optional `data`: the ids the message names (`ids`), the alternatives a fix may
write (`candidates`), and values specific to a code (`size` of `layout.text-overflow`). Quick fixes
read `data` only; the parsing of messages and hints is removed. `data` is not part of the corpus
snapshots, the model JSON or the command line's JSON, which keep their fields.

### Language services, edits and import

- The editor's hover and keyword documentation, completion details, quick-fix titles and rename
  refusals come from the editor's catalog; code samples in the documentation stay as written.
- The reasons of `edit.*` rejections and the descriptions of dependents in the delete dialog come
  from `packages/edit`'s catalog; codes stay.
- Import findings and the import report follow the interface language. The coverage tables keep
  their English `notes` and gain the Spanish ones by construct, so the import documentation can be
  generated in both languages (`spanish-documentation` writes the Spanish pages).

### The command line

`--lang en|es`, else `MELTEMI_LANG`, `LC_ALL`, `LC_MESSAGES` and `LANG`, else the system's language,
choose the language of help, usage errors, summaries, progress, prompts and diagnostics (already
wired in `run()`; this change gives it the words). Files a command writes, the review report
included, follow `--lang`, else the project's `locale`, else English, like every export. Confirmation prompts accept the
answers of both languages (`y`, `yes`, `s`, `si`, `sí`). Machine formats keep their keys and codes.
The acceptance harness runs child processes with `MELTEMI_LANG=en`, so its assertions do not
depend on the machine.

## Risks / Trade-offs

- [About a thousand strings across ten packages] → split by package; typed catalogs catch missing
  entries and parameter mismatches; `untranslated` tests catch strings left in English.
- [Fixes that read text] → `data`; a test runs every fix with a Spanish interface.
- [A message created in one language and shown after a switch] → VS Code analyses open documents
  again; the playground reloads; the command line is one run.
- [Longer Spanish messages] → editors wrap them; the command line does not cut lines.
