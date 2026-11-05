# The MCP tools (projects in the person's account)

When the person connects you to the hosted endpoint, `https://diagrams.meltemi.dev/mcp`, or to the
local server `mdg mcp` on their machine, its tools act on the Meltemi Diagrams projects of their
account: you create projects, write `.meltemi` files, look at the drawings and share the result,
without a folder or the command line. Both serve the same tools with the same answers; the local
server draws and checks on the person's machine. The language is the same as everywhere else in
this skill; only where the files live changes.

## Connecting

The person connects once; never connect for them without being asked.

- Codex with OAuth (the person signs in and approves the scopes in the browser):
  `codex mcp add meltemi --url https://diagrams.meltemi.dev/mcp`, then `codex mcp login meltemi`.
- With an API token instead, made by the person in the app's **API tokens** dialog and kept in
  `MELTEMI_TOKEN`: in `~/.codex/config.toml`, a `[mcp_servers.meltemi]` table with
  `url = "https://diagrams.meltemi.dev/mcp"` and `bearer_token_env_var = "MELTEMI_TOKEN"`.

The local server instead, for an agent that runs on the person's machine (a client that only
reaches an address on the internet uses the endpoint):

- The person starts it and keeps it running: `npx -y @meltemi/diagrams-cli@latest mcp` (or `mdg mcp`)
  prints `http://127.0.0.1:7373/mcp`. Start it yourself only when they ask; it runs until stopped.
- Connect to that address: `codex mcp add meltemi --url http://127.0.0.1:7373/mcp`,
  `claude mcp add --transport http meltemi http://127.0.0.1:7373/mcp`, or a `url` in Cursor's
  `.cursor/mcp.json`.
- It uses the person's `mdg login`; until they sign in, each tool answers `auth.required`, and the
  next call after `mdg login` works without a restart. Never run `mdg login` for them.
- `mdg mcp --folder <dir>` serves `validate` and `preview` only, over the `.meltemi` files of a
  folder, with no account: write the files with your own tools, then check and look at them.
- On a machine other people use, the server may ask for `MELTEMI_MCP_KEY` as a bearer token; the
  person sets it in your client's configuration, never in a file you write.

Never ask for, print, read, copy or write the token (`mdg_…`); it stays in the environment. The
scopes are `projects:read`, `projects:write`, `sharing`, `live` and `publish`: a refusal
`scope.insufficient` names the one the connection lacks, and the person grants it, not you. A scope
never adds a role: in a project shared with the account, an editor writes but only the owner shares,
runs live sessions and publishes (`access.denied`).

## The tools

- The account: `whoami` (the account, its scopes, usage and limits).
- Projects: `list_projects`, `create_project` (empty, from a template `flow`, `c4`, `sequence`,
  `free` or `purchase`, or from files), `get_project` (its revision, its file paths and its address),
  `rename_project`.
- Files: `read_files` (the texts and the images' hashes, at a revision), `write_files` (texts by
  path, `null` deletes; images and fonts by the hash `upload_image` answered), `validate` (the
  diagnostics `meltemi-diagrams validate` prints), `upload_image` (PNG, JPEG, GIF, WebP, SVG or a
  font, base64, at most 10 MiB).
- Versions: `list_versions`, `create_version` (a label of at most 80 characters),
  `restore_version`.
- The app: `open_url` (the address that opens the project in the browser).
- Pictures: `preview` (a diagram, or a story's frame, drawn with the command line's engine: on the
  server through the endpoint, on the person's machine through the local server).
- Sharing: `get_sharing`, `set_link_access` (`private`, `view` or `edit`), `invite`,
  `list_invitations`, `revoke_invitation`, `set_member_role`, `remove_member`.
- Live sessions: `get_live`, `start_live`, `end_live`.
- Publishing: `list_publications`, `publish`, `unpublish`.

Every result carries its JSON; a refusal is an error result `{ code, message, … }` with a stable
code. Ids are never guessed: take a project's id from `list_projects` or `create_project`.

## The workflow

1. Read before you write: `get_project` or `read_files` gives the `revision`. A person may be editing
   the same project in the browser, and what they changed is in this read.
2. Write with `write_files` and `ifRevision` set to that revision, one logical change per call, with
   an `idempotencyKey` of your own for the change (1 to 64 visible ASCII characters, such as
   `checkout-add-retry-1`): when a call times out, send the same call with the same key, and it is
   applied once. `create_project` takes a key too.
3. Every `.meltemi` file you write is compiled with the project first. `diagram.invalid` means
   nothing was written: fix every error its `diagnostics` list (the codes are in
   [language.md](language.md)) and write again. Warnings come back with a successful write.
4. `revision.mismatch` means the project changed since your read (its `revision` is the current
   one): read again, keep the person's change, apply yours on top and write with the new revision.
   Never write the old text back over theirs.
5. `validate` the project, then `preview` what you changed: a PNG 1280 pixels wide by default
   (`width` from 16 to 2048), or `format: "svg"` for the SVG as text. The report beside the picture
   gives the revision drawn, the size, the elements and relations, the warnings
   (`layout.text-overflow`, `layout.overlap`, …) and the fonts the server estimated. Look at the
   picture when you can, read the report always, and fix what it shows as you would after an
   export.
6. Give the person `open_url`'s address. An open page shows every write at once, without a reload.

A preview that fails (`request.invalid`, `rate.limited`) never undoes a write that succeeded: say
what was saved, at which revision, and ask for the picture again. `renderer.unavailable` from the
endpoint means the service cannot draw or check right now, and nothing was written: say so, and
that the local server (`mdg mcp`) does this work on the person's machine. Thirty previews and three hundred
calls a minute per account are allowed; `rate.limited` gives `retryAfter` in seconds.

## Sharing, live sessions and publishing: only when asked

These change who can see the project, so run them only on the person's explicit request, and say
exactly what happened.

- `set_link_access` answers the project's link: `view` lets anybody with it read, `edit` lets a
  signed-in person edit. Saying so is part of the answer.
- `invite` makes an invitation and answers its link and `emailSent: false`. No email is sent: never
  say one was. Tell the person that the invitation exists, for whom and with which role, and give
  them its link only if they ask for it, to pass on themselves.
- `start_live` starts a session of 24 hours; anybody with its link joins without an account, editing
  unless `guestsEdit` is false. Give its term (`until`); give the link only when asked.
  `end_live` ends it.
- `publish` makes the project's catalog a public page at the account's handle and the `slug` you
  give, and answers only once that address has served it; `unpublish` removes one slug and leaves
  the others. `handle.required` means the person chooses a handle in the app first.
  `publish.unverified` means the page was published but its address did not answer yet: try the
  address again in a moment before saying it is live.

Never print, in your answer or a file, a token, or an invitation's or a live session's link that
the person did not ask for.
