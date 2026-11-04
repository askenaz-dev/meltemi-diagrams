## ADDED Requirements

### Requirement: Invitations resolved at sign-in
`GET /api/session` with a cookie principal whose email the provider verified SHALL turn every
pending invitation for that email into a membership before answering, and SHALL include the
person's `handle` (or null) in the answer; an unverified email SHALL resolve nothing.

#### Scenario: Pending invitations become memberships
- **WHEN** two projects invited `ana@example.com` and Ana's verified session calls `GET /api/session`
- **THEN** both memberships exist and both invitations are accepted

#### Scenario: Nothing for an unverified email
- **WHEN** the session's `email_verified` is false
- **THEN** the invitations stay pending
