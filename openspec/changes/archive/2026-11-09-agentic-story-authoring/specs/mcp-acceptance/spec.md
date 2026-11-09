## ADDED Requirements

### Requirement: Agentic story lifecycle acceptance
The automated suite SHALL exercise creating a story, inspecting and changing scene timing/order, preserving concurrent human comments and unrelated stories, previewing compiled boundary instants and deleting only the authored story. It SHALL verify stale-write rejection and dependent-export refusal, use run-owned generic fixtures and clean them after success or failure.

#### Scenario: Story authoring from end to end
- **WHEN** the lifecycle step runs against an editable MCP project
- **THEN** it proves compiled timing, conflict-safe preservation, valid previews and scoped cleanup without source loss

#### Scenario: A failed partial journey
- **WHEN** any lifecycle assertion fails
- **THEN** the step fails, retains redacted evidence and still attempts cleanup of its own fixtures
## MODIFIED Requirements

### Requirement: Complete hosted acceptance
Hosted delivery SHALL require all 35 automated MCP acceptance steps to pass with zero failures
and zero skips. Anonymous diagnostics and local-server runs SHALL label unavailable checks
as skipped and SHALL NOT claim complete hosted acceptance.

#### Scenario: Missing hosted prerequisite
- **WHEN** a hosted delivery run lacks an account token or OAuth fixture
- **THEN** the acceptance command exits nonzero and its sanitized evidence names the missing prerequisite

#### Scenario: Complete run
- **WHEN** both dedicated accounts and valid OAuth fixtures are available and all criteria hold
- **THEN** the command reports 35 passed, zero failed and zero skipped
