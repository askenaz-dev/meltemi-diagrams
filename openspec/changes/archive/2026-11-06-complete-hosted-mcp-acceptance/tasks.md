## 1. Complete the hosted runner

- [x] 1.1 Implement bounded OAuth fixture setup/cleanup with provider and remote D1 adapter.
- [x] 1.2 Implement criteria 27/28, fixture redaction and a strict 34-step completeness gate.
- [x] 1.3 Integrate setup, strict acceptance and unconditional cleanup in hosted delivery.
- [x] 1.4 Add focused failure-path tests and document exact fixture provenance and account prerequisites.
- [x] 1.5 Fail closed when a registration receipt survives without its signed cleanup journal.
- [x] 1.6 Preserve private cleanup files when a results, log or cleanup-summary path collides with them.

## 2. Configure and verify

- [x] 2.1 Issue four named tokens for the authorized two dedicated accounts, and distribute through existing IaC only.
- [x] 2.2 Run staging and production hosted suites, fix real failures, and prove 34/34 with zero skips and cleanup.
- [x] 2.3 Run repository checks, review changes and record sanitized evidence.
- [x] 2.4 Sync canonical specs and archive the implemented change after local and hosted verification.
