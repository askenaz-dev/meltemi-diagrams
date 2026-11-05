## ADDED Requirements

### Requirement: The account's publications through the API
`GET /api/account/publications` SHALL answer, for the account signed in by cookie or token, its
handle (null until it chose one) and every publication of the projects it owns, each with its
project, slug, public address, date and size, as `list_publications` without a project answers
them. Without a principal it SHALL answer `401 auth.required`.

#### Scenario: Two projects published
- **WHEN** the account owns two projects that each have a publication, and the route is called with its token
- **THEN** the answer lists both publications, each with its project

#### Scenario: Nobody signed in
- **WHEN** the route is called with no cookie and no token
- **THEN** the answer is `401 auth.required`
