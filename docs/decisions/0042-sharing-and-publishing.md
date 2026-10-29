# 0042. Sharing, permissions and published content on its own domain

Status: accepted (sharing-and-permissions change, 13 October 2026). Amended by
[decision 0050](0050-live-sessions.md): anonymous viewers follow the room live (the snapshot is only
the fallback), and a project's live session lets anyone with its link in as a guest.

## Context

With accounts (decision 0041) a project can be shared. The owner wants Excalidraw-like links
with a Google-Docs-like model: with the link everyone views, or everyone edits, or specific
people edit while the link views, or only specific people see anything; viewing by link should
need no account because it drives adoption, while creating, editing and collaborating need one
because they cost quota. The share links of 0031 (the project in the URL fragment) stay for
people without an account.

The session cookie is shared by every host under `meltemi.dev`, and those hosts are one site for
`SameSite`: HTML that a person uploads or publishes, served from any of them, could post to the
API with the cookie attached. User-authored content therefore cannot live under `meltemi.dev`.

## Decision

- **Link access times members.** A project has a link level (`private`, `view` or `edit`) and
  members by email with a role (`viewer` or `editor`), plus its owner. Anyone can view a
  `view` or `edit` project by its link, signed in or not; editing by link needs an account;
  members keep their role whatever the link level; `private` admits members only.
- **Invitations by email, resolved at sign-in.** An invitation names an email and a role and
  becomes a membership when a person signs in with that email verified by the provider, or
  when they open its invitation link signed in. Unverified emails never match.
- **Viewing is the app, read only.** `/p/<id>` opens the playground in read-only mode: the
  canvas, stories, effects and every export work; code and canvas do not edit; "make a copy"
  takes the project into one's own account or into the local, anonymous page. Anonymous viewers
  read a snapshot; signed-in viewers watch live. (Since decision 0050 anonymous viewers watch live
  too, with a guest identity, and read the snapshot only when the room does not answer.)
- **Published catalogs live on their own domain.** Publishing builds the project's HTML
  catalog (the same build as `mdg build catalog`) and serves it at
  `https://<PUBLISH_HOST>/<handle>/<slug>/`, a separate registrable domain the owner provides,
  isolated from the session cookie and from `diagrams.meltemi.dev`'s origin. A project's owner
  can unpublish a page, and the administrators of the service (a list of `sub`s in `ADMIN_SUBS`)
  can take any publication down.
- **A handle per account.** The first publication asks for a handle (`[a-z0-9-]{3,30}`,
  unique); it is part of public addresses only.

## Alternatives considered

- **Published catalogs under `diagrams.meltemi.dev/u/…`.** One domain, and user HTML on the
  API's origin with the family's cookie in reach: refused.
- **Sandboxed rendering of published content from data** instead of serving the uploaded HTML.
  Safer in theory, a second renderer in practice; the catalog build already produces the page,
  and a separate domain gives the isolation.
- **Viewing by link only with an account.** Simpler quotas, and a link that asks the reader to
  sign in before showing a diagram; a snapshot read costs nothing worth gating.
- **Per-file permissions.** Projects are the unit people share; files stay inside them.

## Consequences

- The owner registers a second domain for published content, served by a second, minimal
  Worker in `packages/cloud` (`src/publish.ts`, R2 and D1 bindings, no assets, no cookie, no
  API route; decision 0041); until the domain exists publishing works on the local development
  host only. The rule that the domain must not be under the session cookie's is made mechanical:
  the service refuses to build a public address on a `PUBLISH_HOST` that is its own host, the
  cookie's domain or under it.
- The Durable Object admits viewer connections that may not write; the API checks the role on
  every route: `manage` (the owner) deletes the project, changes its name, description and
  sharing, its members and invitations, publishes and unpublishes; `write` (editors) puts
  files, binaries and the thumbnail, creates and restores versions; `read` (viewers, and
  anyone a `view` or `edit` link admits, signed in or not) gets metadata, files, blobs,
  versions, thumbnail and snapshot, and `duplicate` needs only `read`; an anonymous caller on a
  route the link would open to a signed-in person gets `401 auth.required`, any other
  insufficient role `403 access.denied`, no access at all `404`.
- Invitations are the owner's: their tokens and links are returned to the owner only,
  `GET …/invitations` answers `403` to anyone else, non-owners see only the link level and
  their own role, the member list (names and pictures, never emails) reaches members only, and
  a project holds at most 50 members plus pending invitations (`413 quota.members`);
  invitations and memberships are deleted with the account. An invitation raises a role and
  never lowers it, works once and for thirty days, and its token is the one secret the service
  keeps in clear: the owner can copy the link of a pending invitation again, so it has to be
  recoverable. It is a capability of the kind the link of an `edit` project is, shown to the
  owner alone and never logged. API tokens and approval codes stay hash-only.
- The playground gains a share dialog, a read-only mode and the publish action; the command line
  has `mdg publish` (the `cli-cloud` change), which uses the same routes.
- [Decision 0061](0061-unbranded-exports.md) gives the administrators a second action beside the
  takedown: entitling an account to export without the Meltemi branding.
