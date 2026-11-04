## ADDED Requirements

### Requirement: Assist command
`meltemi-diagrams assist generate|modify|relations <file>` SHALL print the disclosure, ask for
consent (or take `--yes`), print the proposal (or JSON with `--json`), save it with `--save`, and
apply it with `--apply all|<list>`; `assist apply <proposal> [--items <list>]` SHALL apply a saved
proposal, reporting conflicts; `assist explain [path] [--base|--before]` SHALL print an explanation
of the review. Provider options SHALL be `--provider`, `--model`, `--base-url`; keys SHALL come only
from the environment. Exit codes: 0 done, 1 a proposal that cannot be applied or a provider error,
2 usage errors or nothing sent.

#### Scenario: Save and apply later
- **WHEN** `mdg assist modify view.meltemi --prompt "…" --save p.json --yes` then
  `mdg assist apply p.json --items 1` run
- **THEN** item 1 is written to `view.meltemi`
