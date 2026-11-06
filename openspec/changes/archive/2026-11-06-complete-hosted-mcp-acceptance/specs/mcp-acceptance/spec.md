## ADDED Requirements

### Requirement: Complete hosted acceptance
Hosted delivery SHALL require all 34 automated MCP acceptance steps to pass with zero failures
and zero skips. Anonymous diagnostics and local-server runs SHALL label unavailable checks
as skipped and SHALL NOT claim complete hosted acceptance.

#### Scenario: Missing hosted prerequisite
- **WHEN** a hosted delivery run lacks an account token or OAuth fixture
- **THEN** the acceptance command exits nonzero and its sanitized evidence names the missing prerequisite

#### Scenario: Complete run
- **WHEN** both dedicated accounts and valid OAuth fixtures are available and all criteria hold
- **THEN** the command reports 34 passed, zero failed and zero skipped

### Requirement: Bounded OAuth acceptance fixtures
OAuth acceptance setup SHALL reuse the production OAuth provider and store, bound to the
selected hosted origin, database and verified dedicated test account. It SHALL create only
run-owned OAuth data, keep deployment authority outside the acceptance process, and clean
every fixture record even after failure. Normal product authorization SHALL remain unchanged.

#### Scenario: Credential enforcement
- **WHEN** the suite exercises expired, wrong-resource, narrow, refreshed and revoked fixtures
- **THEN** the deployed public MCP and OAuth endpoints enforce their rejection, scopes and lifecycle
  and the report identifies preprovisioned fixtures separately from interactive consent

#### Scenario: Wrong identity or environment
- **WHEN** fixture setup receives an unexpected origin, database or account identity
- **THEN** it fails before writing fixture records and emits no credential

#### Scenario: Failed test and cleanup
- **WHEN** an acceptance assertion fails after provisioning
- **THEN** unconditional cleanup deletes only the exact run-owned fixture records and confirms no residuals

#### Scenario: Credential diagnostics
- **WHEN** a fixture credential appears in an assertion or provider error
- **THEN** the output and artifacts redact it and the secret scanner fails any leaking step
