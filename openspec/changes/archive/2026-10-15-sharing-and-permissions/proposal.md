## Why

A cloud project is worth little until it can be shown and worked on with others. The owner
asked for Excalidraw's links with a Google-Docs-like model: with the link everyone views, or
everyone edits, or the link views while named people edit, or only named people see anything;
viewing by link must need no account because it drives adoption, while editing needs one
because it costs quota; and a project should publish as the HTML catalog the CLI already
builds. User-authored HTML cannot be served under `meltemi.dev`, so publications live on a
separate domain ([decision 0042](../../../docs/decisions/0042-sharing-and-publishing.md)).
Post-1.0 change, outside the roadmap; it applies after `cloud-projects`.

## What Changes

- **Link access times members**: each project has a link level (`private`, `view`, `edit`)
  and members by email with a role (`viewer`, `editor`) besides its owner; one function
  resolves what a request may do and every route and the room use it.
- **Invitations**: by email (resolved when that person signs in with the email verified) or by
  invitation link; pending invitations are listed, copyable and revocable by the owner only;
  members can leave; at most 50 members plus pending invitations per project.
- **Viewing by link**: `/p/<id>` opens the playground in read-only mode for anyone the link
  admits, signed in or not: canvas, stories, effects and every export work; code and canvas do
  not edit; "Make a copy" takes the project into the person's account or into the anonymous
  page. Anonymous viewers read a snapshot; signed-in viewers watch live.
- **The share dialog**: the link level, the project's link (`<origin>/p/<id>`), the members
  with their roles, invite by email with a role, pending invitations with their links, remove
  and leave; the owner manages, others see the link, their role and "Leave", never an
  invitation. The anonymous page keeps its `#p=` links.
- **Publishing**: a handle per account (chosen at first publication), a slug per project, the
  catalog built by the page (the same build as `mdg build catalog`) uploaded and served at
  `https://<PUBLISH_HOST>/<handle>/<slug>/` by a second, minimal Worker (`src/publish.ts`: R2
  and D1 bindings, no assets, no cookie, no API), unpublish, and a takedown route for the owner
  of the service. In development the main Worker serves publications under `/_published/` on
  its own origin, for tests only.
- **A read-only canvas**: the `settings` host message carries `readOnly`
  (`CanvasSettings.readOnly`), switchable at run time: no palette, no inspector edits, no
  drags, no connections; selection, zoom, stories and effects stay.
- **Cascade**: deleting the account removes its memberships, invitations and publications.
- Documentation: `docs/cloud.md` (permissions, publishing, the publish host),
  `docs/playground.md` (sharing, viewing, publishing), decision 0042.

## Capabilities

### New Capabilities

- `project-sharing`: link access, members, invitations, access resolution, viewing by link, the
  share dialog, the cascade.
- `publishing`: handles, slugs, publish and unpublish, serving on the publish host, takedown,
  the publish dialog.

### Modified Capabilities

- `cloud-document`: roles in the room: viewers connect and receive, never write.
- `cloud-accounts`: invitations by email resolve at sign-in; `GET /api/session` returns the
  handle.
- `canvas-package`: a read-only canvas through the `settings` message.
- `playground-cloud`: "Opening a project by address": the mode follows the role, anonymous
  viewers get view mode when the link admits, and an invitation survives the sign-in.
- `web-playground`: "Share links": the anonymous page's `#p=` links stay; a cloud project's
  dialog offers its short link instead.

## Non-goals

- Presence and simultaneous editing: `live-collaboration` (viewers who watch live already use
  the room's broadcast).
- `mdg publish`: `cli-cloud` (it uses this change's routes).
- The publish domain's registration and DNS: the delivery change; until then publishing works
  on the development host only.

## Impact

- `packages/cloud`: `src/access.ts`, routes for sharing, members, invitations, publishing and
  takedown, `migrations/0003_sharing.sql` (`projects.link_access`, `members`, `invitations`,
  `publications`, `takedowns`, `users.handle`), the publish Worker `src/publish.ts` with
  `wrangler.publish.jsonc`, the `DEV`-only `/_published/` route of the main Worker,
  `PUBLISH_HOST` and `ADMIN_SUBS` vars.
- `packages/playground`: `/p/<id>` (a redirect to `/?project=<id>`) opening, view mode
  (`CodePane.setReadOnly`, the `Playground` guards, the binding silent as viewer),
  `src/cloud/share.ts` (the dialog), `src/cloud/publish.ts`; `packages/canvas`: `readOnly` in
  `CanvasSettings`; messages in both languages.
- No new dependency.
