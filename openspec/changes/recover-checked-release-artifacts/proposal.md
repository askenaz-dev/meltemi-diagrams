## Why

Production recovery of 1.10.17 showed that `pnpm pack` can reorder workspace dependency keys.
The same source produced semantically identical packages with different bytes; GitHub correctly
refused the changed manifest while independent npm publication had already begun.

## What Changes

- Recover an explicitly selected original Release run artifact after validating its workflow,
  repository, CI/source identity, successful check attempt and archive digest.
- Reuse the checked bytes instead of rebuilding them. Keep the existing independent channels.
- Validate local artifact integrity before any publishing job can run. Recovery also checks
  existing npm/GitHub content before proceeding; fresh deliveries keep independent channels.
- Document the historical 1.10.17 mismatch without replacing existing packages or release assets.

## Capabilities

### New Capabilities

- `checked-release-recovery`: authorized artifact reuse and publication preflight.

### Modified Capabilities

None.

## Impact

Release workflow, delivery helpers/tests and releasing guidance. No product behavior, packing
canonicalization or deployment changes.
