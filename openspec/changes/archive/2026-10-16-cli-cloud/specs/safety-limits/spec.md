## ADDED Requirements

### Requirement: API tokens are secrets
`redactSecrets` SHALL replace API tokens (`mdg_` followed by base64url characters) with
`mdg_…` in every message, error and uncaught failure the command line prints, as it does for
provider keys.

#### Scenario: Uncaught failure with a token
- **WHEN** an uncaught error's message holds `mdg_abc123`
- **THEN** the printed text holds `mdg_…` and the exit code is 70

#### Scenario: Not a token
- **WHEN** a message holds `mdg_` alone or `mdg push`
- **THEN** it is printed unchanged
