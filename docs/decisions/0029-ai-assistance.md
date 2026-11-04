# 0029. AI assistance: optional adapters, block proposals, consent and assumptions

Status: accepted (ai-assist change, 11 October 2026)

## Context

The proposal makes AI optional help that turns into reviewable changes validated syntactically
and semantically, never a dependency of a diagram's correctness. Operations: generate a first
structure, modify by instruction, explain differences, flag possibly incomplete relations marked
as assumptions; accept part of a change; work against a known revision and reconcile changes made
meanwhile; suggested resources must exist. Validation, layout and export work without AI; local and
remote adapters are optional; a build sends nothing; the interface shows the files shared; keys
live outside diagrams and deliverables.

## Decision

- **Adapters.** Anthropic's Messages API (default `claude-opus-5-5`, the most capable Claude model)
  and OpenAI-compatible chat endpoints, which cover local servers. Configuration from editor
  settings or the environment; keys from the environment or VS Code's secret storage only, and
  redacted from every error.
- **Proposals of whole blocks.** Models answer JSON: blocks to replace, add or remove, a whole new
  file, or relation endpoints that the tool writes with `assumption`. Blocks are located by kind
  and id, so text outside them, comments included, is untouched; each item carries the semantic
  changes it makes alone, computed in the project.
- **Revision and reconciliation.** A proposal keeps its base text and revision. Applying to a
  changed text applies the items whose block did not change and reports the others; the result
  must not add errors in the project, or nothing is written.
- **One repair round.** Errors of the whole proposal go back to the model once.
- **Consent first.** The provider, endpoint (local or remote), files with sizes and reasons and the
  length of the request are shown before sending; the command line needs a yes or `--yes`. A
  request carries the file and its imports (a new file: the project's models and themes), under
  project-relative paths, capped at 12 files and 200 KB.
- **The guide is the skill.** Prompts carry the agent skill's language references, generated into
  the package and checked for drift.
- **Assumptions are language.** `assumption "<why>"` on relations of diagrams and models: drawn
  dashed and muted, inherited by C4 views when all combined relations are assumptions, badged in
  the catalog, reported by reviews, confirmed by removing it (quick fix).

## Alternatives considered

- **Edit operations as the model's output.** Fine-grained, but the closed set of operations cannot
  express new stories, scenarios or views, and models follow free-form block text more reliably.
- **Text hunks as items.** Finer than blocks but hunks depend on each other (an element and its
  relations); blocks are self-contained and match how people think about a sheet.
- **A comment for assumptions.** Invisible in drawings, catalogs and reviews, and lost by tools
  that ignore comments.
- **A bundled local model.** Large and outside the approved downloads; any OpenAI-compatible local
  server works instead.

## Consequences

- `Relation` and `ModelRelation` have `assumption`; the model JSON carries it.
- Tests run against local stub servers; nothing in the repository calls a real provider.
- The playground (change 22) can reuse the package in the browser with a person's own key.
