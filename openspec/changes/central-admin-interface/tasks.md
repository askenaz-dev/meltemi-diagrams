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
- [ ] 2.4 Update real-Worker browser expectations for the renamed product settings and central
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
- The navigation pull request's first cloud browser run found old product-modal selectors in
  four acceptance files. They now check central navigation and keep their real backend lifecycle
  assertions; cloud typecheck, scoped ESLint/format and independent review passed. The complete
  105-check local cloud browser run is in progress; no complete pass is claimed yet.
