## MODIFIED Requirements

### Requirement: Takedown
An owner or an administrator (`service-administration`, "Owners and administrators") with the
session cookie SHALL remove any publication (`DELETE /api/admin/publications/<handle>/<slug>` with a
reason), from the account panel's Administration section or the route, recording `takedowns
(handle, slug, by_sub, reason, at)` and a `takedown` row of `admin_log` with `<handle>/<slug>` and
the reason, after which the address answers `404` and the owner's dialog shows the publication as
removed by the service; anyone else, and an API token of an owner or an administrator, SHALL get
`404` from the admin routes.

#### Scenario: Removed
- **WHEN** an administrator removes a publication
- **THEN** its address answers `404`, the project's publish dialog says the service removed it, and the administration log holds the takedown with its reason

#### Scenario: Not an administrator
- **WHEN** a signed-in person who is neither an owner nor an administrator calls the route
- **THEN** the answer is `404`

#### Scenario: An invited administrator
- **WHEN** an administrator invited by the owner, not listed in `ADMIN_SUBS`, removes a publication with the session cookie
- **THEN** the publication is removed and `takedowns.by_sub` is that administrator
