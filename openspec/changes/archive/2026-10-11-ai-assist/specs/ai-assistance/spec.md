## ADDED Requirements

### Requirement: Optional providers
Assistance SHALL be optional: validation, layout, export, catalogs and reviews SHALL never call a
model. It SHALL support Anthropic's Messages API (default model `claude-opus-5-5`) and
OpenAI-compatible endpoints, configured from editor settings or the environment
(`MELTEMI_AI_PROVIDER`, `MELTEMI_AI_MODEL`, `MELTEMI_AI_BASE_URL`, `MELTEMI_AI_API_KEY`,
`ANTHROPIC_API_KEY`). Keys SHALL be kept outside project files and deliverables (environment or the
editor's secret storage) and SHALL never appear in messages or errors.

#### Scenario: Key in an error
- **WHEN** a provider answers 401 with a message that repeats the key
- **THEN** the error shown reads `[redacted]` in its place

### Requirement: Disclosure before sending
Before a request is sent, the person SHALL see the provider, model and endpoint (marked when it is
on this machine), each file shared with its size and why, and the length of their own words, and
SHALL agree; the command line SHALL refuse to send without a yes or `--yes`. A request SHALL share
only the file, the files it imports (or, for a new file, the project's models and themes), under
project-relative paths.

#### Scenario: Refused without consent
- **WHEN** `mdg assist modify` runs without `--yes` and nobody answers
- **THEN** the list is printed, nothing is sent, and the exit code is 2

### Requirement: Reviewable proposals
Answers SHALL become proposals against a recorded revision of the file: blocks replaced, added or
removed; a new file; or relations added with `assumption`. Each item SHALL list the semantic
changes it makes by itself, computed in the project. When the items together add errors, the
errors SHALL be sent back once for a corrected answer; remaining problems SHALL be listed.

#### Scenario: A database added
- **WHEN** a model answers with the `checkout` diagram plus a `db` element and a relation
- **THEN** the proposal lists `+ element db` and `+ relation` under one item

### Requirement: Partial acceptance and reconciliation
People SHALL accept any subset of items. Applying to a text that changed since the proposal SHALL
apply the items whose block did not change and report the others as conflicts. Nothing SHALL be
written when the result has errors the current text does not have.

#### Scenario: Edited meanwhile
- **WHEN** the person edits the block of item 1 after the proposal and accepts items 1 and 2
- **THEN** item 2 applies and item 1 is reported as changed since the proposal

### Requirement: Operations
Assistance SHALL generate a first structure from a description, modify a file by instruction,
suggest probably missing relations (marked as assumptions), and explain the changes of a review.

#### Scenario: Missing relations
- **WHEN** relations are suggested for a model
- **THEN** each accepted one is written as `a -> b: "label" { assumption "why" }`

### Requirement: Editor assistance
VS Code SHALL offer Generate Diagram with AI, Modify with AI, Suggest Missing Relations with AI,
Explain Changes with AI, Set AI Key and Clear AI Key; show what is sent in a modal; show the
proposal as a diff; let the person choose items; and apply them as one undo step.

#### Scenario: One undo step
- **WHEN** an accepted proposal is applied to an open file and the person undoes once
- **THEN** the file is back to its text before the proposal
