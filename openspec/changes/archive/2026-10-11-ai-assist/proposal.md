## Why

The proposal makes AI optional help to create and modify sources people can review: create models,
propose views by audience, draft walkthroughs and migrate sources. Every proposal must become a
reviewable change that passes syntactic and semantic validation, and a diagram's correctness never
depends on asking a model again. The planned operations are generating a first structure from a
description, modifying entities by instruction, explaining differences between versions and
flagging possibly incomplete relations, with inferred relations marked as assumptions; people may
accept part of a change without replacing the whole document. The assistant works against a known
revision; if the source changes meanwhile, the change is reconciled before it applies; suggested
resources must exist and no broken reference may slip in. Validation, layout and export work
without AI; local models and remote providers are optional adapters; a normal build sends nothing
to a provider; the interface shows which files are shared; keys are stored outside diagrams and
deliverables. Roadmap change 20 asks for all of it.

## What Changes

- **Assumptions in the language.** `assumption "<why>"` in relation blocks of diagrams and
  models: `Relation.assumption`, `ModelRelation.assumption`; C4 views inherit it when every model
  relation they combine is an assumption; drawn dashed in the muted colour; shown in the catalog
  and the review; a quick fix confirms the relation by removing the statement.
- **Package `@meltemi/diagrams-assist`.** Adapters for Anthropic's Messages API (default model
  `claude-opus-5-5`) and OpenAI-compatible endpoints (local servers such as Ollama, llama.cpp or LM
  Studio), configured from settings and the environment, with keys never in errors; prompts that
  carry the agent skill's language references (`guide.ts`, generated and checked); proposals of
  whole blocks (replace, add, remove), new files and relations marked as assumptions, each with
  the semantic changes it makes alone; partial application against the current text, leaving out
  items whose block changed since the proposal, refused when it adds errors; one automatic repair
  round that sends the errors back.
- **Project integration** in `@meltemi/diagrams-editor/node`: what a request shares (the file and
  the files it imports, or for a new file the project's models and themes; project-relative paths
  only), validation and descriptions in the project, application, explanations of reviews.
- **CLI.** `meltemi-diagrams assist generate|modify|relations|explain|apply` with `--prompt`,
  `--save`, `--apply`, `--items`, provider options; the list of what is sent is printed first and
  needs a yes (`--yes`); keys only from the environment.
- **VS Code.** Generate Diagram with AI, Modify with AI, Suggest Missing Relations with AI,
  Explain Changes with AI, Set and Clear AI Key (secret storage); settings
  `meltemi.assist.provider|model|baseUrl`; a modal lists what is sent; the proposal opens as a diff
  and items are chosen in a list; accepted items apply as one undo step.
- **Docs.** `docs/assist.md`, decision 0029, grammar, CLI and editor guides, README, skill.

## Capabilities

### New Capabilities

- `ai-assistance`: adapters, proposals, partial acceptance, reconciliation, disclosure, keys.
- `cli-assist`: the assist command.

### Modified Capabilities

- `flow-diagram-model`: relation assumptions (diagrams and models).

## Impact

- New package `@meltemi/diagrams-assist` (no dependency beyond the workspace; `fetch` of the
  platform). Tests use local stub servers; nothing calls a real provider.
- `Relation` and `ModelRelation` gain `assumption`; model JSON gains the field.
- The Git revision host moves to `@meltemi/diagrams-editor/node`.
