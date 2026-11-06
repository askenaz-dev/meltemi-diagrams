## 1. Hosted cadence

- [x] 1.1 Set the hosted cron to the first and fifteenth at 03:00 UTC and reconcile handler comments.
- [x] 1.2 Update the existing scheduler fixtures/assertion and check both generated environments.

## 2. Documentation and verification

- [x] 2.1 Align English/Spanish cloud and web-app guides with the twice-monthly schedule.
- [x] 2.2 Run strict change validation, typecheck, lint and unit tests; record the results and deployment limit.

## Verification — 2026-11-06

- Base: main `e99bf28eca8d43f81394e03cbd5d104149408d79`; isolated local branch
  `codex/twice-monthly-maintenance`.
- `openspec validate twice-monthly-maintenance --strict`, `pnpm typecheck` and `pnpm lint`: passed.
- `pnpm test --maxWorkers=2 --reporter=dot`: 380 files, 11,291 passing tests and one existing skip;
  Node 24.15.0, 352.48 seconds. Logs: `C:/meltemi/artifacts/twice-monthly-maintenance/`.
- Actual `deployConfig` output checked for production and staging: `0 3 1,15 * *` in both.
  Calendar check over 2025–2029 confirms 24 runs/year and 14–17-day gaps, including leap years.
- TypeScript printing with comments removed confirms all 11 edited runtime source files are
  otherwise identical to the base. The only runtime configuration change is the cron expression.
- No dependencies downloaded, lockfile changed, remote branch published or infrastructure deployed.
  The schedule becomes effective only after normal integration and deployment.
- Archived with the CLI, syncing one added and one modified requirement. Canonical validation
  passes in normal mode. Strict canonical validation retains the same three pre-existing
  long-description warnings (`requirements[0]`, `[2]`, `[3]`) as the original main checkout;
  neither touched requirement introduces a warning.
