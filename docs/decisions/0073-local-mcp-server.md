# 0073. A local MCP server that draws on the person's machine, over Streamable HTTP

Status: accepted (local-mcp-server change, 5 November 2026). Builds on decisions
[0072](0072-agent-mcp.md), [0041](0041-hosted-service.md) and [0063](0063-agent-setup-prompt.md).

## Context

The hosted MCP endpoint (decision 0072) does its heavy work in the renderer Durable Object:
`preview` draws there, `validate` and the check inside `write_files` compile there, and `publish`
builds its catalog there. Cloudflare's Durable Objects limits page (read on 5 November 2026) says
that a Durable Object has the same CPU limit per invocation as any Worker, and the Workers Free plan
allows 10 ms; a warm SVG of the corpus's costliest diagram takes 68 ms, a PNG up to 175 ms and an
object's first drawing about 600 ms (`docs/performance.md`). On the Free plan, which the owner keeps
until it is needed, an agent through the endpoint would very likely see no picture and write no
diagram. The owner asked whether the drawing could move to the client, and then that the local
server speak Streamable HTTP, the endpoint's own transport, rather than stdio.

## Decision

1. **A backend over the HTTP API, not a proxy of `/mcp`.** `mdg mcp` answers every tool through the
   routes the web app and `mdg push`/`pull` already use, and draws, checks and builds catalogs in
   its own process. Forwarding calls to `/mcp` would still spend the renderer object's CPU on
   `write_files` and `validate`, and build the Worker's twenty-seven-tool server per request.
2. **Streamable HTTP on the loopback.** Node's `node:http` listens on `127.0.0.1` (port 7373 by
   default, `--port`), each request turned into a web `Request` for the same stateless handler the
   endpoint uses (`createMcpHandler`, `legacy: "stateless"`), `POST` only. The first line printed
   is the address; the logs go to standard error; Ctrl+C ends it. Stdio was rejected at the owner's
   word: one transport for both servers, the same configuration by URL in every agent, one server
   several agents share. Both transports would be two to keep equal.
3. **Only this machine.** Before the SDK reads anything: a `Host` that is not a loopback name is
   `403` (DNS rebinding), an `Origin` other than the server's own address is `403` (stricter than
   the SDK's port-agnostic loopback list, which would admit a page of any local port), a path other
   than `/mcp` is `404`, another method `405`, an unserved protocol version `400`, a body over
   24 MiB `413`. `MELTEMI_MCP_KEY` (16 characters or more), when set, is asked of every request as
   its bearer token, compared in constant time, for a machine other people sign in to. A key by
   default was rejected: every agent's configuration would need it, and a personal machine gains
   nothing.
4. **A public package, `@meltemi/diagrams-mcp`.** The twenty-seven definitions (moved verbatim from
   the Worker, without their `run`), the folder's two, the call wrapper (`buildServer`, its hooks,
   `Refusal`, `errorResult`), the stateless handler and the shapes are its main entry;
   `./preview` holds the renderer core, engine, protocol, rasteriser and fonts moved from
   `packages/cloud`; `./node` loads them from the installed packages with exactly the files the
   Worker bundles. The Worker attaches its operations to each definition (`implement`) and adds its
   counting and scope checks as hooks; the command line types its handlers by the definitions, so a
   tool without one does not compile. Code in `packages/cli` imported by the Worker, or definitions
   copied, were rejected: a private Worker depending on the command line, or two catalogues to keep
   equal by a test alone. The package's `idempotencyKey` pattern and scopes are copies of the
   Worker's, held equal by a test, because the Worker's always-loaded modules must not evaluate the
   SDK.
5. **`write_files` validates, and the service decides a moved revision.** It reads the files, merges
   the change and checks every written `.meltemi` file; at the revision it was asked to write on,
   an error refuses the call whole. Then it pushes with `ifRevision` and `Idempotency-Key`: at
   another revision the service replays what it kept for the key (a retry after success) or
   refuses with `revision.mismatch`. Refusing locally would break the retry of criterion 12.
6. **The folder is a catalogue of its own.** `--folder <dir>` serves `validate` and `preview` only,
   over the folder read as `push` would send it, paths kept under its real path, with no account
   and no network. Both catalogues at once would need other names; no folder mode would leave an
   agent in a repository without pictures as tool results.
7. **It starts without a sign-in.** Each cloud tool answers `auth.required`, naming `mdg login`, and
   the token is read again at each call. Exiting would show an agent a server that is not there.
   An `mdg_` token has every scope on the endpoint too, so nothing is narrowed (`--read-only` was
   rejected as a second catalogue to keep equal).
8. **Two answers added to the HTTP API.** A token's `GET /api/session` gives the account's `email`,
   and `GET /api/account/publications` lists the account's publications, so that `whoami` and
   `list_publications` without a project have a route; one request a project was the alternative.
9. **`renderer.unavailable` on the endpoint.** A throw from a renderer stub call (its CPU limit, an
   overload, a reset) is `503 renderer.unavailable`, whose message names `mdg mcp`, and a write it
   could not check pushes nothing and keeps no answer for its key. Browser Run stays the fallback
   should remote-only clients matter before the plan changes.
10. **Proven like the endpoint.** `pnpm acceptance:mcp --local` runs the suite through two built
    `mdg mcp` processes, a token in each one's environment, the agents connected with no bearer,
    the steps of the endpoint's own door and OAuth server skipped with their reason, and the
    servers' log scanned like the Worker's. `pnpm release:check` draws a PNG through the installed
    `mcp --folder`.
11. **Agents connect by URL.** The person runs `npx -y @meltemi/diagrams-cli@latest mcp` and keeps it
    running; `codex mcp add meltemi --url http://127.0.0.1:7373/mcp`, `claude mcp add --transport
http` and Cursor's `url` connect to it. The address is `127.0.0.1`, not `localhost`, because the
    server does not listen on `::1`.

## Consequences

- A twentieth public package, `@meltemi/diagrams-mcp`, with `@modelcontextprotocol/server`, `zod`
  and `@resvg/resvg-wasm` (MPL-2.0, unmodified) as dependencies; the release scripts check twenty
  tarballs. Its first publish needs an npm token allowed to create the package.
- The command line grows by the package and resvg's WebAssembly (about 2.4 MiB).
- `mdg mcp` previews cost the machine what they cost the renderer object: a warm PNG 1280 of
  `flow/thirty` in 67 ms, a process's first in 0.6 s ([performance](../performance.md)).
- The person keeps a terminal open while the agent works; an agent cannot start an HTTP server it
  connects to by URL.
- The endpoint still needs the renderer object's CPU for its four drawing tools; on the Free plan a
  remote-only client gets `renderer.unavailable` with its reason.
- New public surface: the command `mcp`, the error code `renderer.unavailable`, `mcp.port-in-use`,
  `GET /api/account/publications`, `user.email` in a token's session, `MELTEMI_MCP_KEY`, and
  `pnpm acceptance:mcp --local` and `pnpm cli:bench-mcp`.
