# Private administration service

[Español](es/central-administration-service.md)

The hosted Diagrams Worker exports the named `Administration` entrypoint for the family's central
administration. It reuses Diagrams' existing administration handlers, permissions, database and
audit log. The interface is a private Cloudflare service binding; there is no public bridge URL.

## Binding and authentication

The identity Worker binds production explicitly:

```json
{
  "services": [
    {
      "binding": "DIAGRAMS_ADMIN",
      "service": "meltemi-diagrams-cloud",
      "entrypoint": "Administration"
    }
  ]
}
```

Use a separate binding to `meltemi-diagrams-staging` for staging. The request URL must use the
bound environment's exact configured origin: `https://diagrams.meltemi.dev` or
`https://staging.diagrams.meltemi.dev`. URL credentials, queries, fragments and other origins are
refused. The entrypoint does not forward caller-supplied destinations or headers.

Every call needs `Authorization: Bearer <Meltemi session JWT>`, at most 4096 characters. It is the
person's existing identity session, not an `mdg_` API token or another service credential. The
adapter checks signature, issuer, audience, expiry and a fresh identity session status for every
call. A revoked or unconfirmable session is refused, including in development. Caller cookies,
Origin, Host, account ids and role headers cannot substitute for this authentication.

Before calling the binding for a browser action, the central identity interface must check its
own live session, own Origin and scoped CSRF. The adapter rebuilds a same-origin cookie request
from the validated session and delegates to Diagrams. Existing roles still decide every action.

## Context and operations

`GET /context` returns only this shape:

```json
{
  "role": "invitee",
  "invitation": {
    "id": "0123456789abcdef0123456789abcdef",
    "invitedBy": { "name": "Owner" },
    "expiresAt": "2026-11-12T12:00:00.000Z"
  }
}
```

The context role is `owner`, `admin`, `invitee` or `none`; `invitation` is null except for an
eligible pending invitation. No profile, email, session id, token, entitlement or usage is exposed
by this read. `GET /api/admin` retains its existing `owner` or `administrator` role spelling.
The underlying `/api/session` route is not available through this entrypoint.

| Method and private path                                      | Body                                                    | Existing result and access                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /context`                                               | None                                                    | Minimal context for any valid session                                                                                                         |
| `POST /account-permission`                                   | `{ "account": "…", "permission": "unbranded-exports" }` | Account-permission lookup; owner or administrator                                                                                             |
| `GET /api/admin`                                             | None                                                    | Role, owners, administrators, owner-visible invitations, permission holders, latest 50 audit entries, publish host and latest 50 sponsorships |
| `POST /api/admin/invitations`                                | `{ "email": "…" }`                                      | Owner invites; 201 new, 200 already pending                                                                                                   |
| `DELETE /api/admin/invitations/<id>`                         | None                                                    | Owner revokes; 204                                                                                                                            |
| `POST /api/admin/invitations/<id>/accept`                    | None                                                    | Verified addressee accepts; 204                                                                                                               |
| `POST /api/admin/invitations/<id>/decline`                   | None                                                    | Verified addressee declines; 204                                                                                                              |
| `DELETE /api/admin/administrators/<sub>`                     | None                                                    | Owner removes an invited administrator, or administrator leaves; 204                                                                          |
| `GET /api/admin/permissions/<permission>`                    | None                                                    | Permission holders; owner or administrator                                                                                                    |
| `GET /api/admin/accounts/<account>/permissions/<permission>` | None                                                    | Existing account-permission lookup; owner or administrator                                                                                    |
| `PUT /api/admin/accounts/<account>/permissions/<permission>` | `{ "granted": true }` or `{ "granted": false }`         | Grant or revoke; owner or administrator                                                                                                       |
| `DELETE /api/admin/publications/<handle>/<slug>`             | Optional `{ "reason": "…" }`                            | Takedown; owner or administrator; 204                                                                                                         |

Use the constant `POST /account-permission` URL for lookups so an email or account identifier is
carried in the body rather than a service invocation URL. The body must contain exactly the two
nonempty strings `account` and `permission`. The adapter encodes them and calls the existing GET
handler internally. Once resolved, use the returned account `sub` for permission updates. The
only current permission is `unbranded-exports`; account lookup accepts a sub, `@handle` or verified
email under the existing rules. There is no account-list endpoint.

## Validation and responses

Nonempty bodies must be UTF-8 JSON objects with a JSON content type and at most 8192 bytes. GET
requests have no body. Each operation retains its own field validation, roles and limits: ten
pending administrator invitations, twenty invited administrators, verified invitee emails and
reasons of at most 500 characters. Successful mutations keep their existing transactional audit.

| Failure                                                                                        | Response                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------- |
| Missing, malformed, forged, expired, revoked or unconfirmable session                          | `401 auth.required`             |
| Unsupported method/path, encoded path separator, query or wrong environment origin             | `404 not-found`                 |
| Oversized, malformed or other invalid body                                                     | `400 request.invalid`           |
| Insufficient existing role or wrong invitation addressee                                       | Existing `404 not-found`        |
| Existing invitation limit, existing administrator, ambiguous account or other business failure | Existing status and stable code |

Errors have the normal `{ code, message }` shape. Data and errors use `Cache-Control: no-store`.
Do not log bearer tokens, cookies, bodies, private sponsorship information or account lookup text.
The existing public default handler does not select the private adapter through a header or path.

## Environments and coordinated delivery

The service operates on the bound Worker's own configuration and storage. A staging binding cannot
target the production origin. The local Docker Worker does not export `Administration` and keeps
hosted administration unavailable; it gains no identity or service-binding dependency.

Deliver the private backend before enabling the central Web integration. Changes to the hosted
account-panel interface are coordinated separately, once both services are verified. This contract
does not add mutations for owners in `ADMIN_SUBS`, deployment settings, secrets, quotas or billing;
those remain managed by their existing configuration and infrastructure contracts.
