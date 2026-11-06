# Design

## Context

See `proposal.md` for motivation. The public Worker exports its HTTP handler and the project room
and renderer classes. `cloud()` checks the configured host, resolves a cookie or API-token principal,
checks unsafe cookie requests' own Origin and dispatches the administration routes. Those routes
already own roles, invitation acceptance, permission grants, takedowns and transactional audit.

## Goals / Non-Goals

The adapter provides an authenticated private transport without copying those business rules.
The interface and delivery boundaries are the separate changes named in the proposal.

## Decisions

### A named hosted entrypoint

`packages/cloud/src/worker.ts` exports `Administration` from a small class extending the platform's
`WorkerEntrypoint`. Its `fetch(Request)` delegates to a plain, Node-testable administration handler.
The default public export does not route into it. `worker-local.ts` does not export it. An identity
Worker binds `service = meltemi-diagrams-cloud`, `entrypoint = Administration`; staging binds the
staging Worker explicitly. A public adapter route or shared administrator API token was rejected
because a service binding already supplies the private service boundary without a new secret.

### A real session, checked freshly

Only `Authorization: Bearer <session JWT>` is accepted, with a 4 KiB maximum and three base64url
parts. A dedicated verifier uses the normal issuer and JWKS, `checkSession: true` and `cacheMs: 0`.
Development's fail-open session check is never used. Missing, forged, expired, revoked or unavailable
sessions fail closed with `401 auth.required`. The adapter never accepts a caller's user id or role.

### A closed HTTP-shaped protocol

The request URL's origin equals the configured `ORIGIN`, with no credentials, query or fragment.
Only `GET /context`, `POST /account-permission` and the method/path pairs documented by
`service-administration` are admitted. The lookup POST accepts exactly `{ account, permission }`
as nonempty strings and internally becomes the existing account-permission GET, with encoded
segments and no forwarded body. This keeps an email/account lookup out of service invocation URLs.
Decoded path segments cannot contain slashes, backslashes, controls or dot segments. Every body is
bounded to `MAX_JSON_BYTES` (8 KiB); nonempty bodies must be JSON objects. A canonical request is
rebuilt with the fixed origin, allowlisted path, JSON body, the validated session cookie and the
service's own Origin. All caller headers except the bearer used for authentication are discarded.
This avoids a generic proxy or trusting browser-supplied headers.

### Reuse the business handlers

The hosted dependency builder is exported for the named wrapper; its ordinary public verifier is
unchanged. The plain adapter validates the bearer with the dedicated fresh verifier, then delegates
the reconstructed request to `cloud()` with that verifier. The second normal principal resolution
retains deleted-account checks and profile synchronization. Reusing an already verified principal
was rejected because it would bypass those normal checks; administrative traffic is small enough
to accept the extra verification.

`GET /context` internally asks `GET /api/session` through `cloud()` and returns only
`{ role: "owner" | "admin" | "invitee" | "none", invitation: null | { id, invitedBy: { name }, expiresAt } }`.
It maps the existing `administrator` role to `admin` for the central interface. It exposes no
profile, email, token, session id, sign-in URL, entitlement or usage data. Invitees can discover
their invitation without receiving the privileged administration answer.

### Browser protection stays at the central interface

The identity Worker must validate its own live session, own Origin and scoped CSRF before invoking
the binding for a browser mutation. Existing Diagrams JSON administration handlers do not consume
CSRF tokens: they retain their cookie, Origin and per-action role gates. The adapter constructs
the own-Origin request only after its fresh bearer check. No public request header can enable
this translation.

## Risks / Trade-offs

- An unavailable identity service prevents administration → fail closed; preserve ordinary hosted
  session behavior outside this adapter.
- Contract drift between central forms and the backend → document the exact endpoint table and
  test every admitted operation against the existing handlers and role failures.
- Production/staging confusion → validate the target origin against each bound Worker's own
  configuration; use explicit bindings and distinct data.
- A cross-repository deployment dependency → deliver this backend before the central interface;
  coordinate account-panel changes only after both services are verified.

There are no unresolved design choices or new dependencies.
