## ADDED Requirements

### Requirement: Effect frame acceptance
The automated suite SHALL prove, with the tools alone, that an agent can check a diagram's effects
without a story: it SHALL write a run-owned diagram with a named relation, a `flow` effect and no
story, ask `preview` for the still picture and for frames at two instants, and pass only if the
mark advanced along the relation. The same journey SHALL run against the Worker's test host in the
package tests.

#### Scenario: The mark advanced
- **WHEN** the step previews the diagram at `300ms` and at `900ms`
- **THEN** it passes only if both reports name the effect on that relation at the revision written, the mark's `along` and coordinate grew between them and the two pictures differ

#### Scenario: A still picture
- **WHEN** the step previews the diagram without `at`
- **THEN** it passes only if the report carries no `motion` and the picture draws no particle

## MODIFIED Requirements

### Requirement: Complete hosted acceptance
Hosted delivery SHALL require all 36 automated MCP acceptance steps to pass with zero failures
and zero skips. Anonymous diagnostics and local-server runs SHALL label unavailable checks
as skipped and SHALL NOT claim complete hosted acceptance.

#### Scenario: Missing hosted prerequisite
- **WHEN** a hosted delivery run lacks an account token or OAuth fixture
- **THEN** the acceptance command exits nonzero and its sanitized evidence names the missing prerequisite

#### Scenario: Complete run
- **WHEN** both dedicated accounts and valid OAuth fixtures are available and all criteria hold
- **THEN** the command reports 36 passed, zero failed and zero skipped
