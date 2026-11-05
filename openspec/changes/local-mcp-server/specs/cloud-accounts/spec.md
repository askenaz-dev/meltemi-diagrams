## ADDED Requirements

### Requirement: A token's session names its email
`GET /api/session` with an API token SHALL also answer `user.email`: the account's own address as
the service holds it, or an empty string when it holds none. The answer to a cookie and to nobody
SHALL be unchanged.

#### Scenario: The email of a token's account
- **WHEN** `GET /api/session` is called with an `mdg_` token of an account whose email is held
- **THEN** `user.email` is that address

#### Scenario: A cookie's answer
- **WHEN** `GET /api/session` is called with the page's cookie
- **THEN** the answer has the fields it had before, and no `user.email`
