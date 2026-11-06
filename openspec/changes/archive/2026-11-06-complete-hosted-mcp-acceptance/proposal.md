## Why

Hosted MCP acceptance currently reports success with 28 of 34 automated steps skipped. Two
OAuth steps are placeholders even when both account tokens are configured. Delivery needs a
complete, authenticated gate that exercises deployed endpoints and clearly describes its evidence.

## What Changes

- Provision the existing CI account-token secrets through the family's Terraform configuration.
- Implement OAuth expiry, resource, scope, refresh and revocation acceptance using isolated,
  preprovisioned fixtures and the production OAuth provider library.
- Require all 34 automated steps in hosted delivery, with sanitized evidence and fixture cleanup.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-acceptance`: complete hosted acceptance and privileged fixture isolation.

## Impact

Post-1.0 operational quality change outside the roadmap. Touches acceptance tooling, deploy
workflow and operational documentation; no product authentication or public API changes.
The separate Web operational branch distributes the existing four Terraform-managed secrets.

## Non-goals

Interactive Codex and voice acceptance remains the existing manual procedure of `mcp-acceptance`.
No changes to the identity-service login or product authentication contract.
