## 1. Language

- [x] 1.1 `assumption` on relations of every profile and of models; C4 inheritance; JSON; layout; catalog; diff; completion, hover, grammar; quick fix to confirm; tests and snapshots.

## 2. Assist package

- [x] 2.1 Adapters (Anthropic, OpenAI-compatible), configuration, redaction; tests against a local server.
- [x] 2.2 Generated language guide from the skill, kept in sync by `pnpm skills:sync`; drift test.
- [x] 2.3 Prompts, proposals, partial application, reconciliation, repair, disclosure; tests.

## 3. Hosts

- [x] 3.1 `@meltemi/diagrams-editor/node`: shared files, checks and documents in the project, apply, explain; Git host moved here; tests.
- [x] 3.2 CLI `assist` (async run, consent prompt); tests with a stub provider.
- [x] 3.3 VS Code commands, settings, secret storage; VS Code test with a stub provider.

## 4. Docs

- [x] 4.1 `docs/assist.md`, decision 0029, grammar, CLI and editor guides, README, skill reference.

## 5. Verification

- [x] 5.1 typecheck, lint, test, browser suites, VS Code, package, licences.
