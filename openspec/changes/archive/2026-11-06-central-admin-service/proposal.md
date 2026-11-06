# Proposal

## Why

The family's central administration needs to operate Diagrams from one interface while its
authorization, storage and administration log remain owned by Diagrams. Its existing administration
API admits same-origin browser cookies, so a private authenticated service boundary is required.

This is a post-1.0 hosted-service change outside the product roadmap.

## What Changes

- Add the named hosted Worker entrypoint `Administration.fetch(Request)` for an explicit Cloudflare
  service binding from the family's identity Worker, using a live identity session rather than a
  new credential.
- Expose a minimal administrative context and the existing administration operations through a
  closed method/path contract, preserving each operation's existing role checks and audit writes.
- Reject unknown destinations, browser cookies as authentication, oversized bodies and revoked
  sessions. Keep the adapter unavailable through public HTTP and the local Docker distribution.

## Capabilities

### New Capabilities

- `administration-service`: the private authenticated transport and minimal role/invitation context
  by which the central family interface operates Diagrams administration.

### Modified Capabilities

None. The existing `service-administration` handlers and their cookie/Origin contract remain the
business authorization boundary; the private adapter constructs their validated request.

## Impact

`packages/cloud` gains a named Worker entrypoint, a plain transport handler and tests. The hosted
dependency builder and verifier acquire a fresh-session administrative variant. There are no new
dependencies, secrets, schema changes or automatic service bindings. Meltemi Web will bind the named
entrypoint for each explicitly configured environment.

## Non-goals

- The central interface belongs to Meltemi Web's `central-administration` change.
- Changes to the account panel belong to the coordinated hosted-service change
  `central-admin-interface`.
- Infrastructure and deployment bindings belong to the family's delivery change.
