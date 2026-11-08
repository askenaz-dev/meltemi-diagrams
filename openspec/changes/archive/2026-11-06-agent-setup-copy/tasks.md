## 1. Copy control

- [x] 1.1 Add the localized icon button and standalone clipboard enhancement with failure selection.
- [x] 1.2 Build the module, update the page policy and preserve no-JavaScript readability.

## 2. Verification

- [x] 2.1 Update existing page/policy/sea checks and verify clipboard success, denial/retry and keyboard in the browser.
- [x] 2.2 Run typecheck, lint, unit tests and browser checks; review both languages at narrow and desktop widths and record the delivery limit.

## Verification — 2026-11-06

- Base: `3cc55c0f030bc5cd4269fb5ac3596f915b4d19a5`; isolated branch `codex/agent-setup-copy`.
- Whole repository `pnpm typecheck` and `pnpm lint` passed; `pnpm playground:build` passed.
- `pnpm test --maxWorkers=2 --reporter=dot`: 380 files, 11,289 passing tests and one existing skip;
  Node 24.15.0, 538.47 seconds. Setup/policy/sea/docs focus also passed 168/168. The final bilingual
  guide edit passed the documentation suite again, 90/90.
- `PLAYGROUND_TEST_FILTER='agent setup page' pnpm playground:test-browser`: 2/2 cases passed.
  Both languages cover exact native clipboard content, Enter activation, denial with selection,
  retry, light/dark still images, the control inside its block at 375px, and no-JavaScript access.
  The first fixture used an inner arrow that tsx named with its unavailable browser helper;
  binding `Promise.reject` fixes serialization without changing the app or weakening assertions.
- Native Chrome desktop review checked both languages and confirmed clipboard equality immediately
  after clicking. Screenshot: `C:/meltemi/artifacts/agent-setup-copy/one-prompt-es.png`.
  No viewport override was applied. The temporary loopback preview on 8913 was stopped afterward.
- Strict change validation and diff checks passed. Logs: `C:/meltemi/artifacts/agent-setup-copy/`.
- CLI archive synchronized one added and two modified requirements. Both canonical specifications
  validate; web-playground retains its 15 pre-existing long-description warnings, with none added.
- The public prompt, CLI commands, skill and MCP configuration are unchanged. There was no
  dependency download, lockfile change, remote publication or deployment. Full cloud and
  playground browser suites remain normal integration CI gates; only the two affected browser
  cases were run locally.
