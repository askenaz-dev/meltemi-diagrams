# Spec Delta

## ADDED Requirements

### Requirement: Idempotent creation and pushes
`POST /api/projects` and `PUT /api/projects/<id>/files` SHALL honour an `Idempotency-Key`
header (1 to 64 visible ASCII characters): the first answer is kept with the request's hash for
24 hours in the same atomic step as the change, a repeat with the same key and hash answers it
again with `Idempotent-Replayed: true`, the same key with another body is `409
idempotency.mismatch`, one whose first request still runs `409 idempotency.pending`; keys are per
account.

#### Scenario: A push replayed
- **WHEN** the same push is sent twice with `Idempotency-Key: k1`
- **THEN** both answers carry the same `revision`, the second with `Idempotent-Replayed: true`, and the room changed once

#### Scenario: Another body under the key
- **WHEN** a different push is sent with `Idempotency-Key: k1`
- **THEN** the answer is `409 idempotency.mismatch` and nothing changes

#### Scenario: A bad key
- **WHEN** the header holds 65 characters or a control character
- **THEN** the answer is `400 request.invalid` and nothing changes
