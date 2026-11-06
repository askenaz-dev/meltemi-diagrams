# Safety

[Español](es/security.md)

Meltemi can open diagrams from colleagues, repositories and shared projects. Local processing keeps
project code inert and file access bounded; cloud features add explicit storage and sharing choices.
This page explains those boundaries, the permissions clients must respect and the limits below.

## No code runs

- Diagrams, themes, stories, models and export profiles are declarations, not executable project code.
- [Plugins](plugins.md) declare diagram types and icon packs as data. Code-entry fields such as
  `main`, `module`, `exports`, `scripts` and `bin` are ignored with a warning.
- Exported players and catalogs contain Meltemi's own runtime. Their offline policy permits no
  external script or automatic network request; opening a hyperlink is the viewer's choice.

## Paths stay in the project

- Imports are relative `.meltemi` paths inside the project root. URLs, absolute paths and
  paths escaping it are refused (`module.invalid-path`, `module.outside-project`).
- Images, fonts, icon packs and plugins are project or bundled assets. A project cannot make
  an import or asset read an arbitrary file outside its root (`asset.outside-project`).
- Profile/catalog outputs stay inside the project. An explicit `--out` is the user's choice
  to write an export elsewhere.

## No network

After installation, local compilation, validation, layout and export read project/bundled files;
they do not fetch import, image, font, icon, plugin or theme URLs. A `url` property becomes a
hyperlink in the result and is not fetched by compilation. Git-based review reads the local Git history.

Network use depends on the workflow you choose: [AI assistance](assist.md) sends the disclosed
request to your provider after confirmation; cloud commands, hosted MCP, shared projects and live
sessions communicate with the service. The web app also loads its code and assets from its host.
A guest joining a shared or live project uses the network even without a Meltemi account.

## The web app

A browser-only project is kept in browser storage until you download it, share a fragment link or
save it to a service-backed project. A fragment share link carries the project after `#`, which
the browser does not send in its HTTP request; anyone who receives the full link can read its
contents. Opening one decompresses at most 4 MiB and applies the normal compilation limits.

Cloud projects use same-origin API/WebSocket connections. Sign-in navigates through the account
service; provider avatars may load from GitHub or Google. Cookie-based changes require the
correct [Origin](cloud.md#the-origin-rule). These rules also apply to guest live sessions and
publicly shared projects; signed-out does not mean browser-only.

## Cloud projects

- **Validation.** Every update must satisfy the [path rule](cloud.md#the-path-rule), document
  shape, known asset references and quotas. Rejected updates keep the preceding valid state and
  report a stable code. Clients cannot grant themselves an identity or role through file contents.
- **Access.** Project roles are enforced for reads and changes. A viewer cannot edit; changing
  access disconnects affected connections so permissions are checked again.
- **Uploads.** Image/font type is checked from the bytes. Uploaded SVG must be well-formed XML
  with an `svg` root. Downloads use `Content-Security-Policy: sandbox`,
  `X-Content-Type-Options: nosniff` and an attachment disposition, scoped to an accessible project.
- **Saving.** HTTP pushes and restores persist before success. Hosted WebSocket writes may be
  buffered between writes (normally one second, with a ten-second bound from the first pending
  change). The browser keeps pending updates locally and resends after reconnecting. The local
  Docker workspace commits WebSocket changes before acknowledging them. Keep a project archive
  for an independent copy; offline behaviour is explained in [the web guide](web-app.md#offline).
- **Presence.** Names, account identities and roles are resolved by the service. Carets, selections
  and pointer activity are shared with connected participants, not included in the diagram source,
  exports or version history.
- **Limits.** Account storage, file sizes, rooms, messages and action rates are bounded; the exact
  values and diagnostic codes are [listed below](#limits).

## Sharing and publishing

A new cloud project is private. Its owner chooses link access and members; anonymous visitors
view shared projects, and an owner's live-session link can let guests edit. Only the owner
manages sharing and publishing. API/OAuth scopes never raise a project role.

Treat invitation and live-session links as access links. Revoking access or ending a session
prevents further use. An invitation tool returns a link; it does not send an email.

A published catalog contains the selected project metadata and drawings. Source is included only
when you explicitly enable `catalog.source` or `--source`. Publications use the separate
`meltemi.page` domain, with no Meltemi session cookie or project API. Updates and unpublishing
can take up to five minutes to reach an existing cache.

## The command line and the cloud

Cloud commands use the chosen service origin and credentials kept outside the project. `mdg login`
asks you to approve a browser request; `mdg login --token` reads a token from standard input.
Tokens are not command options or project settings. See [the CLI credential reference](cli.md#the-host-and-the-token).

Push/pull use revisions to detect a stale copy, and show the changes before writing. A rejected
revision or invalid document is not silently overwritten. These are explicit cloud operations;
local validation and export do not upload a project.

## Agents and the MCP endpoint

The [skill](agents.md) provides instructions, while MCP provides tools. Neither is an AI model.
Hosted/account MCP acts with the identity and scopes you grant and the project's existing role.
OAuth access can be revoked in **Diagrams settings → Connected apps**; API tokens can be revoked
under **API tokens**.

The local folder server, `mdg mcp --folder .`, offers `validate` and `preview`; the agent edits
files with its own tools. It listens on `127.0.0.1` and refuses browser-origin requests. On a
shared computer, configure its optional bearer key as described in
[the local MCP guide](agents.md#through-the-local-server). The Docker distribution has its own
[local access boundary](local-compose.md#access-and-offline-operation) and does not use a Meltemi account.

## Untrusted files are sanitised

SVG icons and images are rebuilt from their geometry: only shapes, paths, groups and gradients are
read, any other element (scripts, `foreignObject`, style sheets) is refused (`asset.unsafe-svg`),
and attributes are read only for geometry and paint, so event handlers and external references
never pass. Fonts are inspected before use; fonts whose licence forbids embedding are
only measured.

## Limits

| What                            | Limit                                                      | Reported as                                                                |
| ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| A `.meltemi` file               | 2 Mi characters                                            | `limit.too-large`                                                          |
| A diagram                       | 5,000 elements, 10,000 relations, 10,000 sequence events   | `limit.too-complex`                                                        |
| A project                       | 2,000 sources compiled                                     | `limit.too-many-files`                                                     |
| project.json, a plugin manifest | 1 Mi characters                                            | `limit.too-large`                                                          |
| Block nesting                   | 100 levels                                                 | `syntax.*`                                                                 |
| An SVG icon                     | 256 KiB, 2,000 elements, depth 32, 256 KiB of path data    | `asset.too-large`                                                          |
| An Iconify file, a font         | 16 MiB                                                     | `asset.too-large`                                                          |
| An image                        | 8 MiB                                                      | `asset.unsupported-image`                                                  |
| PNG and PDF captures            | 16,384 pixels a side                                       | a message                                                                  |
| A video                         | 600 s, 60 fps                                              | a message                                                                  |
| AI requests                     | 12 files, 200 KB                                           | files beyond are not sent                                                  |
| A web app share link            | 4 MiB decompressed, 2,000 files                            | a message                                                                  |
| A project archive opened        | 2,000 files, 64 MiB                                        | a message                                                                  |
| A published page                | 16 MiB, ten requests an hour for a project                 | `publish.too-large`, `publish.rate`                                        |
| Members of a project            | 50 with the pending invitations                            | `quota.members`                                                            |
| Presence messages               | 16 KiB; 20 a second relayed, 100 a second close the socket | `message.too-large`, `awareness.rate`                                      |
| Connections without an account  | 10 open ones in a room from one client address             | `connections.limit`                                                        |
| A live session                  | 24 hours, one hour with nobody in the room                 | `session.ended`                                                            |
| A push to the cloud             | 2,000 files, 16 MiB of text, 10 MiB an image or a font     | `quota.files`, `doc.too-large`, `quota.binary`, refused before any request |

## Errors without secrets

Service errors return stable codes and safe messages without credentials, cookies, request bodies
or stack traces. CLI diagnostics use project-relative paths unless a command explicitly asks for
absolute paths. Service diagnostic logs omit API tokens, invitation/live-session tokens and OAuth codes.
