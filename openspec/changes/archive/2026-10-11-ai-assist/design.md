## Context

- `diffDocuments` describes changes semantically (change 19); edit plans carry a base revision;
  `Workspace` overlays let hosts compile unsaved text in its project.
- The agent skill (`skills/meltemi-diagrams/reference`) is the concise language reference agents
  already use.

## Goals / Non-Goals

**Goals:** the four operations, reviewable and partially acceptable, validated in the project,
reconciled with edits made meanwhile; disclosure before sending; keys outside projects; local
models as first-class as remote providers.

**Non-Goals:** AI in validation, layout or export (never); agents that act without review;
storing conversations.

## Decisions

### D1. Proposals are whole blocks

Models answer with JSON: for `modify`, the blocks to replace, add or remove (each complete from
keyword to closing brace) and any imports; for `generate`, a whole file; for `relations`, a list of
endpoints, labels and reasons, which the tool writes as `from -> to: "label" { assumption "why" }`
in the named block. Blocks are what people review (one diagram, model or story at a time), what
the tool can locate exactly by id, and what keeps comments outside them untouched. Each item
carries the semantic changes it makes alone (`diffDocuments` in the project), so the list reads as
`+ element db "Orders"`, not as text.

### D2. Known revision and reconciliation

A proposal records the base text and its revision hash. Applying to a text that changed applies
the items whose block is unchanged (or, for additions, still absent; for relations, still present)
and reports the others as conflicts. The result must compile in the project without errors the
current text does not have; otherwise nothing is written. Generation proposals apply only to a file
that is still empty.

### D3. One repair round

When the items together add errors, the errors go back to the model once for a corrected answer;
a proposal that still adds errors lists them, and people can still accept the items that apply.

### D4. What is sent, and to whom

A request carries the rules, the guide pages the files need (language, plus sequence, C4, free or
stories), the file, and the files it imports transitively (a new file gets the project's models
and themes, which it may import), at most 12 files and 200 KB, under project-relative paths. The
CLI prints the list and asks (or needs `--yes`); VS Code shows it in a modal. Explanations send the
list of changes and the changed files.

### D5. Providers and keys

`anthropic` (Messages API, `x-api-key`, `anthropic-version: 2023-06-01`, default
`claude-opus-5-5`) and `openai-compatible` (`/chat/completions`, optional bearer key). The CLI reads
`MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`, `MELTEMI_AI_API_KEY` and
`ANTHROPIC_API_KEY`, never keys as flags (shell history); VS Code reads its settings and its secret
storage. Errors pass through `redact`. Local endpoints are marked as such in the disclosure.

### D6. Assumptions in the language

`assumption "<why>"` is a relation property in every profile and in models; the layout draws such
relations dashed in the theme's muted colour unless a style says otherwise; C4 views inherit it
when all the model relations they combine are assumptions; the catalog badges it; the review
reports `now an assumption` and `confirmed`; a quick fix removes it.

### D7. The guide is the skill

`packages/assist/src/guide.ts` is generated from the skill's references (`pnpm assist:guide`, run
by `pnpm skills:sync`); a test fails when it drifts.

## Risks / Trade-offs

- [Whole-block replacements] → a model may rewrite more than needed; the semantic list shows
  exactly what changes, and the rules ask to keep ids, comments and order.
- [Cost and privacy] → only the file and its imports are sent, after consent; nothing is sent by
  any other command.
