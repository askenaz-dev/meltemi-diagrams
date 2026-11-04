# Spec Delta

## ADDED Requirements

### Requirement: The account's connected apps
The Worker SHALL read and change the account's OAuth grants on the person's behalf: `GET
/api/account/apps` SHALL answer `{ grants: [{ id, client: { name, uri }, scopes, createdAt,
lastUsedAt }] }` and `DELETE /api/account/apps/<id>` SHALL revoke the grant and answer `204`,
for a person signed in on the page only (`403 request.forbidden` for a token, `401
auth.required` for nobody), the `DELETE` under the `Origin` rule; `user.deleted` SHALL revoke
every grant of the account.

#### Scenario: Listed and revoked
- **WHEN** a person with a grant of `Codex` reads the list and deletes it
- **THEN** the list held `Codex` with its scopes and is empty afterwards

#### Scenario: Deleted with the account
- **WHEN** a `user.deleted` event arrives for a person with two grants
- **THEN** both grants' tokens are refused from then on

#### Scenario: An unknown grant
- **WHEN** `DELETE /api/account/apps/nope` is sent
- **THEN** the answer is `404 not-found`
