# Safety

[Español](es/security.md)

Meltemi Diagrams opens repositories from anywhere: the files of a colleague, a pull request, a
project downloaded to look at, a CI job over many repositories. Opening, validating, previewing or
exporting such a project must not run its code, read outside it, reach the network, or exhaust the
machine. This page lists what guarantees that, and where (decision 0030).

## No code runs

- Diagrams, themes, stories, models and export profiles are declarations; nothing in the language
  executes.
- Plugins are data (`docs/plugins.md`): diagram types and icon packs declared in JSON. Fields that
  would name code (`main`, `module`, `exports`, `scripts`, `bin`) are ignored with a warning.
- Exported players and catalogs carry their own script only; their content security policy
  allows no other script and no network request.

## Paths stay in the project

- Imports are relative `.meltemi` paths inside the project root; URLs, absolute paths and paths
  that leave the root are refused (`module.invalid-path`, `module.outside-project`).
- Images are files of the project (`asset.outside-project`); fonts and icon packs live in
  `assets/`; plugins are folders inside the project; catalog and profile outputs are relative paths
  inside it (an output written elsewhere is the person's explicit `--out`).

## No network

Nothing is fetched: no import, image, font, icon, plugin, theme or homepage URL is ever read from
the network. `url` properties are hyperlinks written into exports, never followed by the tool. The
only requests the product makes are the AI assistance a person starts and agrees to
(`docs/assist.md`) and the cloud commands a person runs (`docs/cli.md`), which talk to the one
service they resolved ([below](#the-command-line-and-the-cloud)); `review --base <revision>` runs
the local `git`.

## The playground

The playground (`docs/playground.md`) is a static page: its content security policy allows
scripts, styles, fonts and connections from its own origin only, and without an account no request
leaves it. Served by the cloud service ([cloud](cloud.md)) it offers an optional account: a
signed-in person's avatar is the one image that may come from another origin (the providers'
hosts), forms may post to the page itself and to the identity service (to sign out), and
connections stay on the page's own origin. The service refuses a change made with the session
cookie unless it comes from its own page, lets no other site frame the page, and keeps only the
SHA-256 of an API token.
Share links carry projects after `#`, which browsers never send; opening one decompresses at most
4 MiB and compiles the text with the limits below; nothing in it runs. Work stays in the browser's
storage until the person downloads it or, signed in, saves it to a cloud project.

## Cloud projects

Cloud projects (decision 0041, [cloud](cloud.md)) are how a person's work reaches the service, and
only when they choose it. Five things keep them safe:

- **The room.** Every change to a project passes its room, one Durable Object per project, which
  validates every transaction whatever its origin (a socket, a push through the API, a restored
  version): paths must follow [the path rule](cloud.md#the-path-rule) (relative, no `..`, nothing
  hidden), values must have the shape of the document, a binary must be a hash the project
  uploaded, and the limits must hold. A transaction that breaks a rule is rolled back and its
  sender told. The room answers only requests the Worker constructs, so no header or path of a
  browser reaches it and nobody can name their own role; the socket needs the session cookie and an
  `Origin` that is the service's own.
- **Sandboxed blobs.** An uploaded image or font is typed from its bytes, never from the
  `Content-Type` a client claims, and an SVG must be well-formed XML with an `svg` root. Every blob
  is served with `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff` and as an
  attachment, from an address scoped to the project that holds it, so a script inside an uploaded
  SVG executes nothing on the service's origin.
- **Thumbnails.** A thumbnail is an SVG that the page renders: the service takes at most 200 KiB of
  well-formed SVG, one every thirty seconds for a project, and serves it sandboxed.
- **Quotas.** Accounts and projects are bounded (100 projects, 200 MiB of storage, 2000 files,
  16 MiB of document, 10 MiB for an image or a font, 200 versions, 20 clients in a room, 512 KiB for
  a message, 50 members and invitations for a project, 16 MiB for a published page), and the rates
  are limited (six versions a minute and ten publish requests an hour for a project), each refusal
  with a stable code ([quotas and limits](cloud.md#quotas-and-limits)).
- **Presence comes from the room.** Who is where is relayed by the room and kept by nobody
  ([awareness](cloud.md#awareness)). The room sets the `sub`, name, picture and colour of every
  state it relays from the cookie that opened the sender's socket, whatever the message said, and
  keys the state by that socket, so nobody can appear as another person or speak for another's
  entry. A page reads who a person is from that and from nowhere else, and bounds what it takes
  (a name is one line of at most 100 characters, a picture passes the avatar rule and the page's
  policy, a position or an id that does not resolve is ignored). Every name reaches the header,
  the code and the canvas as a text node, so a name such as `<img src=x>` shows as its characters
  and builds nothing. The traffic is bounded too: a presence message over 16 KiB closes its sender,
  more than 20 a second are dropped and more than 100 close the socket (`awareness.rate`), a page
  sends four a second at most, and a viewer may send presence but never an update. The room keeps
  a client's last state only in the socket's attachment, never in its database, the canvas
  selection nowhere, and the page never saves it or writes it into an export.

## Sharing and publishing

Sharing and publishing (decision 0042, [cloud](cloud.md)) let a person's work reach other people,
again only when they choose it, and a new project is private. Four things keep them safe:

- **One permission check.** Who may open a project, and as what (`owner`, `editor` or `viewer`), is
  decided in one function that every route and the socket ask ([roles](cloud.md#roles)). A project
  the person may not open at all is `404`, the same answer as one that does not exist, so a private
  project does not reveal itself; an anonymous caller is told to sign in only where signing in would
  help (`401`), and every other shortfall is `403`. Only the owner changes who may open a project.
  The room takes the role from the Worker alone and closes a viewer's socket at its first update,
  leaving the document as it was. A change of access counts from the next request, and the routes
  that make it cut the sockets it may have outdated, so that the role is resolved again when the
  page reconnects ([when access changes](cloud.md#when-access-changes)).
- **Invitations in clear, and only to the owner.** The token of an invitation is the one secret the
  service keeps in clear, because the owner can copy its link again; it is a capability of the kind
  the link of an `edit` project is, is shown to the owner alone, is never logged, works once and
  lasts thirty days. API tokens and approval codes stay hash-only. An invitation by email matches
  only an email the identity service verified. A member sees the others' names and pictures, never
  their emails; a person who only has a link sees nobody.
- **A page that only shows.** View mode refuses every edit at the one place edits pass, and again at
  each control; the canvas is told `readOnly`, sends the page no action and hides what writes; the
  binding of a viewer never sends an update, and the room would refuse one. A person who is not
  signed in reads the project with ordinary requests to the page's own origin, and nothing of a
  viewed project is kept in the browser.
- **Published pages are other people's HTML, on a domain of their own.** A published page is the
  catalog the page built, served from a domain that is not under `meltemi.dev` by a second Worker
  that holds the database and the bucket and nothing else: no assets, no secret, no cookie and no
  API. It answers only `/<handle>/<slug>/`, with `nosniff` and `no-referrer`, and `404` with one
  body to everything else; the service refuses to build an address on a host that is its own or
  under the cookie's domain ([the publish host](cloud.md#the-publish-host)). The page runs under the
  catalog's own policy, which allows inline script and style and pictures and fonts from `data:` and
  `blob:`, and nothing else; the service does not check that the HTML is a catalog, and the
  isolation does not depend on it. A page is at most 16 MiB and a project may publish ten times an
  hour; the owner unpublishes, and the administrators listed in `ADMIN_SUBS` take a page down
  ([takedown](cloud.md#takedown)), a route that answers `404` to everybody else. The development
  route that serves a page from the service's own origin answers `404` unless `DEV` is set.

## The command line and the cloud

The cloud commands (`login`, `logout`, `whoami`, `push`, `pull`, `publish`, `projects` and
`review --base cloud`, [the command line](cli.md#the-cloud-commands)) are the one part of the
command line that holds a secret, an API token, and writes a service's files into a folder. Six
things keep them safe:

- **A token goes to one host.** The host is `--host`, else `MELTEMI_HOST`, else
  `https://diagrams.meltemi.dev`, and never the `cloud.host` of a `project.json`: a repository you
  cloned cannot send your token anywhere, and a manifest that names another host fails with
  `cloud.host-mismatch` before any request. A token is never sent over `http:` except to
  `127.0.0.1`, `localhost` or `[::1]` (`cloud.insecure-host`), a redirect is never followed with it
  (`cloud.redirect`), and the exchange of the one-time code carries none. Every request has a
  timeout and every answer is read through a size limit.
- **Tokens are never shown.** `redactSecrets` replaces `mdg_…` tokens in every message, error,
  `--json` document, review page and picture that the cloud commands write, and in the unexpected
  error that exits 70; the value of `MELTEMI_TOKEN` is removed like any secret-looking variable. A
  token comes in through standard input (`login --token`), never through an argument, so it stays out
  of shell histories and process lists. `whoami` prints a name, and the one-time code of `login` is
  never printed.
- **One file keeps the token.** `credentials.json` in the user's configuration folder is the only
  place a token is written. It is `0600` in a `0700` folder where the system has such modes
  (Windows keeps the permissions of the profile folder and the command changes nothing there), is
  written through a temporary file and a rename, and is never written over when it is not valid
  credentials (`credentials.corrupt`). `logout` forgets a token only after the service revoked it
  or said it no longer knows it, so a token that is still alive is never lost from sight.
- **The sign-in listens here only.** The listener is on `127.0.0.1` at a random port. It takes one
  `GET /` that carries a `code`, the request's own `state` and a `Host` that is its own address (a
  page that makes the browser call it by another name gets nothing), stops listening at the first
  such request and ends after five minutes. The one page it answers has no script, and its policy
  allows none. The code is bound to the `state` and exchanged once, with no token.
- **Pull writes inside the folder, after checking everything.** Every path the cloud answers is
  checked before the first byte is written: the cloud's [path rule](cloud.md#the-path-rule)
  (relative, no `..`, nothing hidden), names Windows could keep, no two paths that differ only in
  letter case, resolving inside the folder, and never through a link. One that fails refuses the
  whole pull with `pull.unsafe-path`. Files are written through a temporary file and a rename, so a
  link in the folder is replaced and never followed; files that differ are kept unless `--force`;
  images and fonts are checked against their hash. `review --base cloud` applies the same rule. The
  paths of a project are written by whoever edits it, and the command line does not take the
  service's word for them.
- **Nothing is overwritten unseen.** `push` compares every path with the cloud first, lists what
  differs and asks, or refuses without `--force`; it carries the revision it compared with, and a
  change that arrives meanwhile is compared again, not overwritten. Files it cannot send are named
  and never make it delete the cloud's.

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
| A playground share link         | 4 MiB decompressed, 2,000 files                            | a message                                                                  |
| A project archive opened        | 2,000 files, 64 MiB                                        | a message                                                                  |
| A published page                | 16 MiB, ten requests an hour for a project                 | `publish.too-large`, `publish.rate`                                        |
| Members of a project            | 50 with the pending invitations                            | `quota.members`                                                            |
| Presence messages               | 16 KiB; 20 a second relayed, 100 a second close the socket | `message.too-large`, `awareness.rate`                                      |
| A push to the cloud             | 2,000 files, 16 MiB of text, 10 MiB an image or a font     | `quota.files`, `doc.too-large`, `quota.binary`, refused before any request |

## Errors without secrets

- Keys for AI providers live in the environment or the editor's secret storage, never in project
  files or exports, and are redacted from every error.
- An unexpected error of the command line prints its message with the values of secret-looking
  environment variables (`*KEY*`, `*TOKEN*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`) removed, and
  no stack unless `MELTEMI_DEBUG` is set; it exits 70.
- API tokens of the cloud service (`mdg_…`) are replaced by `mdg_…` in every message, `--json`
  document and review page of the command line, wherever they came from.
- Pages and reports meant to be shared (catalogs, review pages, exported players) name versions and
  project-relative paths, never local paths.
