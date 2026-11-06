# Tasks

## 1. Private transport slice

- [x] 1.1 Implement the plain bounded bearer-only handler, closed destinations and minimal context;
  verify valid/forged/revoked sessions, context roles and input refusal tests.
- [x] 1.2 Add the dedicated fresh-session verifier, shared hosted dependency builder and named
  `Administration` export; verify typecheck and that public/local entries cannot expose the adapter.

## 2. Administration contract

- [x] 2.1 Exercise every admitted administration method with existing business handlers, role
  failures, invitation acceptance and atomic audit effects; verify targeted integration tests.
- [x] 2.2 Document the exact protocol in English and Spanish, including environment bindings and
  browser protection responsibilities; verify the documentation parity/link checks.

## 3. Integration verification

- [x] 3.1 Run cloud tests, repository typecheck and lint; resolve regressions and record results.
- [x] 3.2 Verify a real local workerd service binding reaches the named entrypoint while default
  HTTP cannot select it, with generated test sessions and no production credentials or mutations.

## Workflow follow-up

- Review and archive with the OpenSpec CLI only when the requested implementation is accepted.
- Coordinate delivery in the order backend service, central Web interface, account-panel change.

## Verification record

- `pnpm typecheck` and `pnpm lint`: passed.
- `pnpm cloud:test`: 4049 passed; final service/action checks: 54 passed.
- `pnpm test --maxWorkers=2`: 380 files, 11290 passed and one skipped. The initial unrestricted
  run lost one Windows native worker in the CLI HTTP test; its isolated retry passed all eight
  cases, and the complete bounded run passed without errors.
- Documentation and network-boundary audit checks: 150 passed; strict OpenSpec validation passed.
- Real workerd production bundle through a named service binding: owner/ordinary context,
  administration read, constant lookup, D1 permission mutation and audit, public export isolation,
  forged bearer and immediate revocation passed without external network calls or platform errors.
- Pull-request CI `42136710213`, attempt 2, passed all seven jobs for source
  `da6e8457b5a38d0bd9a71151f507b6b3c1269a0d`. Archiving does not mark the coordinated OAuth,
  Web integration or production delivery checks complete.
