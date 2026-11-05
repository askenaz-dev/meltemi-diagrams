# A local MCP server that draws on the person's machine

## Why

The hosted MCP endpoint (`agent-mcp`, decision 0072) does its heavy work in the renderer
Durable Object. That covers four tools:
- `preview` draws there;
- `validate` and `write_files` of a `.meltemi` file compile there;
- `publish` builds its catalog there.

Cloudflare's Durable Objects limits page, read on 2026-11-05 (updated 2026-10-29), says that
Durable Objects "have the same per invocation CPU limits as any Workers do", and the Workers Free
plan allows 10 ms of CPU an invocation. Measured on 2026-11-04 (`docs/performance.md`), a warm
SVG of the corpus's costliest diagram takes 68 ms, a PNG up to 175 ms and an object's first
drawing about 600 ms. So on the Free plan those four tools will very likely fail, and an agent
would neither see its drawings nor write a diagram. The owner keeps the Free plan until it is
needed (2026-11-05) and asked whether the drawing can move to the client.

It can, for the agents that run on the person's machine: Codex's command line and app,
Claude Code and Cursor all connect to an MCP server by its URL, a local one included. The command
line already holds the engine, the sign-in (`mdg login`, `MELTEMI_TOKEN`) and a safe client of the
HTTP API. A local server moves the CPU of compiling, drawing and building catalogs to the person's
machine, and leaves the service to store, sync and share, which the HTTP API does on the Free plan
today. It also gives an agent working in a folder, with no account, the same pictures as tool
results.

The owner asked (2026-11-05) for the local server to speak Streamable HTTP, the transport of the
hosted endpoint, rather than stdio.

This is a post-1.0 change outside `docs/roadmap-1.0.md`, on the hosted service and the command
line.

## What Changes

- **`mdg mcp`, a local MCP server over Streamable HTTP.** It listens on this machine only, at
  `http://127.0.0.1:7373/mcp` by default (`--port` picks another), stateless and `POST` only, like
  the hosted endpoint, with the same handler of the MCP SDK. It prints its address and runs until
  it is stopped. It serves the hosted endpoint's catalogue of twenty-seven tools, with the same
  names, words, schemas, annotations, results and error codes:
  - It reads and writes through the HTTP API (`/api/*`) with the command line's sign-in, so no
    call reaches `/mcp` or the renderer object.
  - `preview`, `validate`, the validation inside `write_files` and the catalog of `publish` are
    computed locally, with the engine the renderer object uses. That gives the same SVG as
    `mdg export --fonts system`, and the same PNG as the object for the same files.
  - `write_files` keeps its `ifRevision` and `idempotencyKey` semantics through the API's
    `ifRevision` and `Idempotency-Key`.
  - The server starts without a sign-in; each cloud tool then answers `auth.required`, naming
    `mdg login`.
- **Only this machine reaches it.** It binds the loopback address only, refuses a `Host` that is
  not the loopback (DNS rebinding) and an `Origin` that is not its own address (a web page), and,
  when `MELTEMI_MCP_KEY` is set, asks every request for that key as a bearer token, for a machine
  other people sign in to.
- **`mdg mcp --folder <dir>`, with no account.** Two tools, `validate` and `preview`, over the
  `.meltemi` files of a folder on disk, read at each call. Paths are kept inside the folder, and
  nothing is sent anywhere.
- **One catalogue and one engine, shared.** A new public package, `@meltemi/diagrams-mcp`, holds:
  - the tool definitions (names, titles, descriptions, scopes, input and output schemas,
    annotations);
  - the call wrapper (schema checks, refusals as `isError` with stable codes, a log line of
    name, duration and code) and the stateless HTTP handler;
  - the preview engine, rasteriser and renderer core, moved from `packages/cloud`, with a Node
    loader of their files.

  The hosted endpoint and `mdg mcp` both build from it: the room and the store answer the tools
  in the Worker, the HTTP API and the local engine on the machine. A test fails when the two
  `tools/list` differ.
- **Two small additions to the HTTP API**, so that every tool has a route: `GET /api/session`
  answers a token's account email, and `GET /api/account/publications` answers the account's
  publications, as `list_publications` without a project does.
- **A clear refusal from the hosted endpoint when the renderer object cannot answer.** If the
  object fails (CPU exceeded, overloaded), `preview`, `validate`, `write_files` and `publish`
  answer `renderer.unavailable` instead of `internal`, push nothing, and say the work can run on
  the person's machine with `mdg mcp`.
- **Proven like the endpoint.** `pnpm acceptance:mcp --local` runs the same suite through two
  `mdg mcp` processes over Streamable HTTP against a host (staging, or `wrangler dev` locally).
  `pnpm release:check` starts the installed `mdg mcp --folder` and draws a preview through it.
  Timings for warm and cold previews join `docs/performance.md`.
- **Agents and people told.** The following gain the local server:
  - the skill's `reference/mcp.md` and `docs/agents.md`:
    - start it with `npx -y @meltemi/diagrams-cli@latest mcp` and keep it running;
    - `codex mcp add meltemi --url http://127.0.0.1:7373/mcp`;
    - `claude mcp add --transport http meltemi http://127.0.0.1:7373/mcp`;
    - Cursor's `mcp.json` with the `url`;
    - when to choose it over the hosted URL;
  - `docs/cli.md` (the command, its options and its English and Spanish help);
  - `docs/cloud.md` (where each tool's work happens);
  - decision note 0073;
  - the changelog's open section.

No new third-party dependency. `@modelcontextprotocol/server` 2.3.1 (Apache-2.0), `zod` (MIT)
and `@resvg/resvg-wasm` 2.6.2 (MPL-2.0) were approved for `agent-mcp`. They now ship in public
packages, so the licence inventory and the notices name them there. The server's HTTP bridge is
Node's own `node:http`; no framework is added.

## Non-goals

- Changing the Cloudflare account's plan. The owner keeps the Free plan (2026-11-05), and the
  account and its limits belong to Meltemi Web's `delivery` change. The hosted endpoint's tools
  keep their behaviour and still need the renderer object to have CPU. This change only names
  the refusal when it does not.
- A stdio transport. The owner chose Streamable HTTP.
- Reaching the local server from another machine. It listens on the loopback only.
- Synthetic voice: a 1.0 exclusion. Speaking to the agent is the client's own feature.

## Capabilities

### New Capabilities

- `mcp-local-server`: `mdg mcp` and `mdg mcp --folder`: the Streamable HTTP server on the
  loopback, its address, its key and the requests it refuses, the sign-in and host it uses, the
  tools it serves and where their work happens, its parity with the hosted endpoint, its logs,
  limits and errors.

### Modified Capabilities

- `mcp-server`: the catalogue is defined once and served by both servers, and the two
  `tools/list` are equal.
- `mcp-previews`: `renderer.unavailable` when the renderer object cannot answer, for the four
  tools that depend on it, with nothing pushed.
- `mcp-acceptance`: the suite also runs through the local server (`--local`).
- `agent-skill`: the skill's MCP reference and the agents guide add the local server and how to
  choose between the two.
- `release-packaging`: twenty npm tarballs, and the release check starts the installed local
  server and draws one preview through it.
- `cloud-accounts`: a token's session answers the account's email.
- `publishing`: the account's publications have a route of the HTTP API.

## Impact

- **New** `packages/mcp` (`@meltemi/diagrams-mcp`, public, MIT):
  - the catalogue;
  - the wrapper (from `packages/cloud/src/mcp/tool.ts`) and the HTTP handler (from
    `mcp/endpoint.ts`);
  - the shapes (from `mcp/shapes.ts`);
  - `./preview`: the renderer core, engine, protocol, rasteriser and fonts (from
    `packages/cloud/src/renderer-core.ts`, `renderer-engine.ts`, `renderer-protocol.ts`,
    `renderer-raster.ts` and `renderer-fonts.ts`);
  - `./node`: the engine and the raster faces loaded from the installed packages.
- **`packages/cloud`**: each tool keeps its `run` body, attached to the package's definition. The
  renderer object imports the engine from the package; the bundle loading (`renderer-bundle.js`,
  `renderer-runtime.ts`), the SQLite cache and the bundle's file list stay. The new error code
  `renderer.unavailable` goes in `errors.ts`. The session route gains `email` for a token, and a
  new route answers the account's publications.
- **`packages/cli`**:
  - `mcp-command.ts` with the HTTP server on the loopback;
  - `mcp-cloud.ts`, the tools over `CloudClient`, which gains a JSON call with an
    `Idempotency-Key` for the routes the tools need beyond push, pull and publish;
  - `mcp-folder.ts`;
  - help and messages in English and Spanish.
- **`packages/acceptance`**: `--local`, which starts two local servers and runs the suite through
  them.
- **Release**: `scripts/preflight-release.mjs`, `scripts/publish-npm.mjs`, `RELEASING.md` and
  the release check go from nineteen packages to twenty. The npm token must be allowed to create
  `@meltemi/diagrams-mcp`, or the owner creates the package once.
- **Docs**: `docs/agents.md`, `docs/cli.md`, `docs/cloud.md`, `docs/performance.md`, the Spanish
  copies, `skills/meltemi-diagrams/reference/mcp.md` (synced), decision 0073 and `CHANGELOG.md`.
