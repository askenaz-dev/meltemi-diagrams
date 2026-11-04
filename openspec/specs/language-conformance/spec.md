# language-conformance Specification

## Purpose
What the language promises and how it changes, and the conformance suite that checks this or another implementation against the corpus.
## Requirements
### Requirement: Language change policy
`docs/language/policy.md` SHALL state what a language version promises (changes within a version
only add, never invalidate or change the meaning of a valid file), what needs a new version, how
deprecations are reported (warnings with a stable code and a quick fix, kept for at least one minor
product release), that format migrations are explicit commands that write the new file next to the
original and report what changed, how long previous versions stay readable, how the model and
renderer API versions are kept, and that every language change comes with a decision note, a
grammar update and conformance cases.

#### Scenario: Policy linked
- **WHEN** a person reads the grammar reference or the contribution guide
- **THEN** both link to the language change policy

### Requirement: Conformance suite
`pnpm conformance` SHALL run the conformance cases: every `corpus/valid/**/*.meltemi` against its
`<name>.model.json` (compared as JSON), every `corpus/invalid/*.meltemi` for the language codes of
its `<name>.diagnostics.json` (codes other than `layout.*`, which belong to the drawing, and
`asset.*`, which need the project's files), every valid project for no error and every invalid
project for the codes of its `expected.json` other than `layout.*`. By default it SHALL run this implementation in-process; `--command "<cmd {file}>"`
SHALL run another implementation that prints the model JSON, and `--diagnostics "<cmd {file}>"`
one that prints diagnostics as `validate --json` does. It SHALL report each failing case with the
first differing JSON path, print the totals, and exit 1 when a case fails.
`docs/language/conformance.md` SHALL describe the cases and the commands.

#### Scenario: This implementation conforms
- **WHEN** `pnpm conformance` runs
- **THEN** every case passes

#### Scenario: Another implementation
- **WHEN** `pnpm conformance --command "node other.js {file}"` runs with a command that drops a
  relation's label
- **THEN** the cases with labels fail and each names the path of the missing label

