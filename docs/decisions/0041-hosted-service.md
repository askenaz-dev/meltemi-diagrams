# 0041. The hosted service: an optional account over the static page

Status: accepted (cloud-accounts, cloud-projects, live-collaboration and cli-cloud changes,
13 October 2026). Amends [0031](0031-web-playground.md).

## Context

The playground is a static page that works with no account and sends nothing (decision 0031).
The owner wants what Excalidraw and Mermaid Live give on top of that: projects that follow a
person between devices and survive a reinstalled browser, sharing, and editing together, with
sign-in through GitHub or Google and nothing of their own to host for identity. The family now
has an identity service (`id.meltemi.dev`, specified in the Meltemi Web repository) and the IDE
keeps its promise of no accounts, so the account is a layer this product adds, never a gate.
Cloudflare's free plan offers Workers, D1, R2 and Durable Objects; the owner had Workers in
mind from the start.

## Decision

- **Local first; the account is a layer.** Without an account the page is exactly 0031's:
  work in `localStorage`, share links in the fragment, no request beyond its own origin. Signed
  in, projects live in the cloud as well; the page keeps a local copy and works offline.
- **One Worker, one origin for the page and the API.** `packages/cloud` serves the playground's
  built site and the API from `diagrams.meltemi.dev`; the sign-in is a navigation to
  `id.meltemi.dev`, so the page's policy still allows connections to its own origin only, and
  the browser test that checks it keeps passing.
- **The family's identity, consumed as a contract.** The Worker verifies the session cookie
  with the identity service's public keys through its reference verifier, keeps users by `sub`,
  checks the session at most once an hour, handles `user.deleted` events, and never sees a
  provider token. Every host under `meltemi.dev` shares the cookie and is one site for
  `SameSite`, so every state change checks the `Origin` header.
- **A project is a document; the room is its authority.** Each cloud project is a Yjs
  document (text files as `Y.Text`, images by hash) held by one Durable Object, which merges
  every client's edits, persists its state, and materialises files to content-addressed blobs
  (D1 metadata, R2 bytes) on a pause, when the last client leaves and before a version is made.
  Meltemi's architecture makes this enough: canvas edits are text edits and layout is
  deterministic, so synchronising the text synchronises everything.
- **Versions are explicit and capped.** Autosave never creates one; a person names a version (or
  keeps one with no name), and the service adds one unlabelled version a day when the files
  changed and one before each restore. Unlabelled versions are thinned (100 at most, and one a
  week after thirty days), named ones are never removed, and a project holds 200 at most.
  Content addressing makes a version cost only what changed.
- **Collaboration is Yjs over the room.** Several people type at once without loss, undo
  covers each person's own edits, presence shows who is where; offline edits merge on
  reconnect. Presence is a small message of the page's own, relayed by the room with the
  identity the room knows for the sender and stored nowhere; a person's identity is never taken
  from what a peer sends.
- **The command line mirrors a repository.** `mdg login`, `logout`, `whoami`, `push`, `pull`,
  `publish` and `projects`, and `review --base cloud`, drive the page's API with an API token: for
  developers the repository is the truth and the cloud its mirror; for everyone else the cloud is
  the truth. `login` listens on the loopback, prints a check that the approval page repeats and
  exchanges a one-time code for a token kept in the user's configuration folder; `MELTEMI_TOKEN`
  replaces it in CI. A token goes only to the host the command resolved (`--host`, `MELTEMI_HOST`,
  else the default), never to the host a `project.json` names, and never over `http:` except to the
  loopback; `project.json` records the project (`cloud`) and a different host fails with
  `cloud.host-mismatch`. `push` compares every path with the cloud and asks, or refuses without
  `--force`, and carries the revision it compared with; CI pushes on merge with `--force --strict`
  (`init --ci --cloud`). `pull` checks every path before writing any. API tokens are redacted
  (`mdg_…`) from everything the command line prints.
- **Functionality before delivery.** Everything runs with `wrangler dev` and tests with
  in-memory stores and sessions signed with test keys; repositories, pipelines, DNS and secrets
  are a separate change once the functionality is validated.

## Alternatives considered

- **Keeping 0031 as is** and pointing people at Git. Portability between devices and sharing
  with people who have no Git were the owner's asks.
- **A third-party identity platform or passwords.** Decided against in the Meltemi Web
  repository (its decision 0002).
- **REST autosave with revisions, and a room only for collaboration.** Two write paths, a
  merge dialog for conflicts between devices, and the same Durable Object anyway for
  collaboration; the room as the single authority is simpler.
- **Operational transformation written here instead of Yjs.** No download, but a transforming
  server, hand-written collaborative undo and presence; Yjs brings merge and undo by origin for
  one MIT download the owner approved. Presence stays the page's own and small, with no
  `y-protocols` package: an object keyed by connection, which the room relays.
- **GitHub as storage (gists or repositories).** Nothing to hold, but no images and a `repo`
  scope; the CLI covers the repository-as-truth case instead.
- **A state file in each clone** with the last pushed revision, to detect a conflict without
  fetching. It would be per clone, absent in CI and one more thing to explain; fetching the cloud's
  files is one request, and the review by id already exists.
- **Appending every update to the room's storage.** Safer if the platform evicts an object, and
  thousands of rows per typing session against a daily budget of a hundred thousand; the room
  writes its whole state on a throttle (a second, ten at most) instead, and a client resends what
  an eviction lost, because the room asks for it at every connection.

## Consequences

- The `web-playground` specification's first requirement becomes "a static page, an optional
  account, one origin"; kept work for cloud projects moves to IndexedDB; undo in a cloud project
  covers one's own edits.
- `docs/compatibility.md` stops listing realtime collaboration as a limitation.
- Presence is relayed, never stored: the room keeps a client's last state in its socket's
  attachment, so it survives a hibernation, and drops it when the socket closes or after thirty
  seconds of silence (an alarm). Its cost is bounded where it starts: a page sends four states a
  second at most, the room relays 20 a second per client and closes a client at 100
  (`awareness.rate`), a message over 16 KiB closes its sender, and a room holds twenty clients;
  the platform counts incoming WebSocket messages twenty to one against the free plan's request
  budget, and the room's counters tell how many arrived.
- Quotas per account and limits per document bound the free plan; the browser suite measures
  the rows the Durable Object and D1 write during a minute of typing.
- The room is the only writer of a project's document and is reachable only through requests the
  Worker constructs: the socket takes the session cookie alone, checks `Origin` itself (a socket
  is a `GET`, outside the rule for changes), and no header of a browser is forwarded, so nobody
  can name their own role. Every transaction is validated by the room whatever its origin, and
  every blob is served sandboxed from an address scoped to its project.
- Offline means a project that is open when the connection drops: the document is kept in
  IndexedDB and merges on reconnect. There is no service worker, so the page itself needs a
  connection to load, and a page started without one cannot ask who is signed in and opens as the
  anonymous project.
- The page's Worker runs with `run_worker_first: true` and dispatches on `Host`: on
  `diagrams.meltemi.dev` unrouted paths go to the static assets (which then count as Worker
  requests against the free plan's daily budget); the publish host is served by a second,
  minimal Worker (`packages/cloud/src/publish.ts`, its own `wrangler.publish.jsonc`, R2 and D1
  bindings, no assets) that serves `/<handle>/<slug>/` only, never sets a cookie and answers no
  API route.
- `/p/<id>` answers a 302 to `/?project=<id>` keeping the query; the page reads `project` and
  `invite` from `location.search` and keeps the address, so relative asset URLs and
  `base-uri 'none'` hold; the project's link stays `<origin>/p/<id>`.
- Files have stable ids: the document keeps `files`, `paths` and `binaries` keyed by file id, a
  rename is one `paths.set`, and the room, the routes, the binding and the CLI translate id and
  path (two ids on one path: the lexically smaller keeps it, the other gets `<path>~<id>`,
  reported as `collisions`).
- Published content and sharing follow decision 0042.
- `id.meltemi.dev`, `diagrams.meltemi.dev` and the publish host are deployed as Workers Custom
  Domains (`routes: [{ pattern: "…", custom_domain: true }]`), never Routes: Workers on one
  zone reach each other by `fetch` only through Custom Domains (error 1042 otherwise).
