## Implementation

- [x] Update the canonical setup prompt with current-agent and project defaults and uninterrupted proof.
- [x] Synchronize the one-line prompt and explanations in both web pages and documentation copies.
- [x] Update the agent-skill specification and verify prompt, parity, typecheck, lint, tests and build.

## Validation

- `pnpm typecheck` and `pnpm lint` passed.
- `pnpm test --maxWorkers=4`: 386 files passed; 11,370 tests passed, one skipped.
- `pnpm playground:test-browser`: all 136 scenarios passed, including both setup pages at 375 px
  and the prompt without JavaScript. The build copied the hosted prompt byte for byte.
- The four one-line prompt copies match after decoding HTML entities.
- CLI smoke check: `skill install --agent codex` wrote only `.agents/skills`; the temporary
  sequence template was copied into a project without `project.json`, validated with zero errors
  and warnings, and exported to SVG.
