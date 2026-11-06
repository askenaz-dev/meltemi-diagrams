# Tasks

## 1. Central navigation

- [x] 1.1 Add fixed destination, environment and role helpers and tests; update account menu and
  administration destination dispatch while preserving browser work.
- [x] 1.2 Remove the Administration modal section, browser client and unused catalogs; keep all
  seven personal product settings and local/anonymous controls, verified by unit tests/typecheck.

## 2. User verification

- [x] 2.1 Replace product administration form browser checks with central-navigation, language,
  deep-link, work-preservation and ordinary/local session checks; run the affected browser cases.
- [x] 2.2 Update English/Spanish account and administration docs and verify parity/link checks.
- [x] 2.3 Run repository typecheck and lint plus affected-package unit tests; record results and
  delivery dependencies.
- [x] 2.4 Update real-Worker browser expectations for the renamed product settings and central
  administration navigation, preserving account, token, sponsorship and permission lifecycle
  assertions; verify the complete cloud browser suite.

## Workflow follow-up

- Review and archive with the OpenSpec CLI when accepted.
- Deliver only after the private Diagrams backend and the central Web console are deployed and
  verified; the initial pull-request base is `codex/central-admin-service`.
- The pull request's remote CI runs the complete repository and playground browser suites.

## Verification record

- `pnpm playground:build`: passed; no shipped JavaScript contains an `/api/admin` client.
- `pnpm typecheck` and `pnpm lint`: passed repository-wide. The final browser file also passed
  the playground typecheck, scoped ESLint and formatting checks.
- Affected package and documentation tests: 66 files, 1513 tests passed.
- Actual browser: 11 affected scenarios passed, including owner and actual-staging-origin
  same-tab navigation with the latest source kept in departed-origin storage, Spanish invitee
  deep links, ordinary-account fallback, anonymous/local isolation and EN/ES menu keyboard access.
- Strict OpenSpec validation and `git diff --check`: passed.
- Delivery order: Diagrams #16, Web #31, then this navigation change. No merge or deployment was
  performed as part of this local implementation.
- The four real-Worker acceptance files check the renamed settings and central navigation while
  retaining account, token, sponsorship and permission lifecycle assertions. Cloud typecheck,
  scoped ESLint/format and independent review passed.
- Complete local `pnpm cloud:test-browser` at `3baa98c39dc996ba81ee807d828bf8e66d43b07c`:
  **105 passed, 0 failed**, exit code 0. This verifies the 104 scenarios and the Worker logging
  check; it is a completed result for that source, separate from the playground browser suite.
- External evidence: `C:/meltemi/artifacts/diagrams-central-admin-service/navigation-cloud-browser-summary.json`
  and `navigation-cloud-browser-final.log` in the same directory. The log's SHA-256 is
  `53dc2ef9a95d7cb42f709c915f79925364885a6148d6c560f6b0fcab66a542d9`.
