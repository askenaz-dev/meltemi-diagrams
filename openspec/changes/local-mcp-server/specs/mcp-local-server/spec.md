## ADDED Requirements

### Requirement: The command
`meltemi-diagrams mcp` (and `mdg mcp`) SHALL serve the Model Context Protocol over stdio:
- JSON-RPC messages, one per line, on stdin and stdout, and nothing else on stdout;
- `initialize` SHALL answer the server name `meltemi-diagrams`, the command line's version and
  the hosted endpoint's instructions;
- `--help` SHALL list `mcp` with one line in the interface language;
- an unknown option SHALL exit with code 2 and the usage before any message is read.

#### Scenario: Initialize over stdio
- **WHEN** a client starts `mdg mcp` and sends `initialize`
- **THEN** the answer names `meltemi-diagrams` and the command line's version, and every line on stdout is a JSON-RPC message

#### Scenario: Listed in the help
- **WHEN** `mdg --help` runs
- **THEN** `mcp` appears with its description, in English or in Spanish as the interface language is

#### Scenario: Unknown option
- **WHEN** `mdg mcp --port 9000` runs
- **THEN** the usage of `mcp` is printed on stderr and the exit code is 2

### Requirement: The cloud tools through the HTTP API
Without `--folder`, `mdg mcp` SHALL serve every tool of the hosted endpoint's catalogue, with
the same names, words, schemas and annotations, results that conform to the same output schemas,
and refusals with the same codes. It SHALL act through the service's HTTP API (`/api/*`) on the
host it signs in to, and SHALL never call `/mcp` or the renderer object.

#### Scenario: The same catalogue
- **WHEN** `tools/list` is called on `mdg mcp` and on the hosted endpoint of the same version
- **THEN** both answer the same twenty-seven tools with equal names, titles, descriptions, input and output schemas and annotations

#### Scenario: Only the HTTP API
- **WHEN** a client creates a project, writes a file, previews it and shares it through `mdg mcp` against a stub service
- **THEN** the stub received requests under `/api/` only, and none to `/mcp`

#### Scenario: A result checked by its schema
- **WHEN** a tool's handler answers a result that its output schema refuses
- **THEN** the call is `isError` with `code: "internal"`, and the test of that tool fails

### Requirement: Without a sign-in
`mdg mcp` SHALL start without a token. Every cloud tool SHALL then answer `isError` with
`code: "auth.required"` and a message naming `mdg login`. The token SHALL be looked up again at
each call, so a sign-in made meanwhile is used without a restart.

#### Scenario: A sign-in meanwhile
- **WHEN** `list_projects` answers `auth.required`, then `mdg login` runs in another terminal, and `list_projects` is called again
- **THEN** the second call answers the account's projects

#### Scenario: Not signed in
- **WHEN** `mdg mcp` runs with no credentials for the host and no `MELTEMI_TOKEN`, and `list_projects` is called
- **THEN** the result is `isError` with `code: "auth.required"` and a message that names `mdg login`

#### Scenario: A token the service refuses
- **WHEN** the service answers `401 token.invalid`
- **THEN** the tool's result is `isError` with `code: "token.invalid"` and the token appears in no output

### Requirement: The host and the token
`mdg mcp` SHALL find its host and token as the command line's cloud commands do:
- the host is `--host`, else `MELTEMI_HOST`, else `https://diagrams.meltemi.dev`;
- the token is `MELTEMI_TOKEN`, else the credentials file's entry for that host.

It SHALL send the token to that origin only, never follow a redirect, refuse a host that is not
`https:`, or `http:` on a loopback address, before reading a message, and never write the token
to stdout, stderr or a file.

#### Scenario: An insecure host
- **WHEN** `mdg mcp --host http://example.com` runs
- **THEN** it exits with code 2 and `cloud.insecure-host` on stderr, and no request is made

#### Scenario: A redirect
- **WHEN** the service answers a tool's request with `302` to another origin
- **THEN** the result is `isError` with `code: "cloud.redirect"` and no request reaches the other origin

### Requirement: The drawing and the checking on the machine
`preview`, `validate`, the validation inside `write_files` and the catalog of `publish` SHALL be
computed in the server's own process with the hosted renderer object's engine, from the files at
the revision the HTTP API answered. A preview's SVG SHALL equal what `mdg export <file> --fonts
system` writes, and its PNG the renderer object's for the same request; families outside the
bundled ones SHALL be drawn with the bundled fallback and named in `estimatedFonts`.

#### Scenario: The same SVG as the command line
- **WHEN** `preview` is called for `flow.meltemi` with `format: "svg"`
- **THEN** the SVG equals what `mdg export flow.meltemi --fonts system` writes for the same files

#### Scenario: The same PNG as the hosted renderer
- **WHEN** the local engine and the renderer object's core draw the same request for `flow/thirty` at 1280
- **THEN** the two PNGs are byte-equal

#### Scenario: A Fontsource family
- **WHEN** the diagram writes `font "Caveat"`
- **THEN** the PNG is drawn with the fallback and `estimatedFonts` lists `Caveat`

#### Scenario: A file that does not compile
- **WHEN** `preview` names a file with an error
- **THEN** the result is `isError` with `code: "diagram.invalid"` and the diagnostics, and no picture

### Requirement: The images and fonts of a drawing
The images and fonts a drawing uses SHALL be fetched by their hash from
`/api/projects/<id>/blobs/<hash>` and kept in memory, up to 64 MiB a process, the least recently
used dropped first, and never written to disk.

#### Scenario: An image fetched once
- **WHEN** a diagram that uses `assets/logo.png` is previewed twice at the same revision
- **THEN** the blob is requested once, and both pictures show the image

#### Scenario: A blob the service refuses
- **WHEN** the blob of an image answers `404`
- **THEN** the preview is `isError` with the service's code, and no picture is drawn without the image

### Requirement: Writing from the machine
`write_files` SHALL read the files and revision from the HTTP API and, when the revision equals
`ifRevision`, validate every written `.meltemi` file against the project merged with the change,
refusing the call whole with `diagram.invalid` on an error. It SHALL push with `ifRevision` and
`Idempotency-Key`; when the revision read differs, it SHALL push without validating, so the
service replays what it kept for the key or refuses with `revision.mismatch`.

#### Scenario: An error refused whole
- **WHEN** `write_files` writes two files and one of them has an error
- **THEN** the result is `isError` with `code: "diagram.invalid"` and the diagnostics, and no push request was made

#### Scenario: A retry after success
- **WHEN** `write_files` succeeds at revision 41, answering revision 42, and is called again with the same key, body and `ifRevision: 41`
- **THEN** the answer is revision 42 again and the project has no revision 43

#### Scenario: A conflict
- **WHEN** `write_files` is called with `ifRevision: 41`, a new key, and the project is at 43
- **THEN** the result is `isError` with `code: "revision.mismatch"` and `revision: 43`, and nothing changed

### Requirement: Publishing from the machine
`publish` SHALL build the catalog in the server's process, as `mdg publish` builds it for the same
files and language, and send it with `PUT /api/projects/<id>/publish`. It SHALL answer the
hosted tool's fields and refuse an empty catalog with the hosted tool's code.

#### Scenario: The same page as the command line
- **WHEN** `publish` is called for a project and `mdg publish` runs on a pulled copy of the same revision
- **THEN** the two HTML bodies sent are byte-equal

#### Scenario: Nothing to publish
- **WHEN** the project has no diagram
- **THEN** the result is `isError` with the hosted tool's code for an empty catalog, and no request to publish was made

### Requirement: A folder with no account
`mdg mcp --folder <dir>` SHALL serve two tools only, `validate { path? }` and `preview { path,
diagram?, story?, at?, format?, width?, theme? }`, over the files under `<dir>` read from disk at
each call, with `project.json` and imports resolved as `mdg validate` and `mdg export` resolve
them, answering the cloud tools' reports and diagnostics. It SHALL make no network request, and
a `<dir>` that does not exist SHALL exit with code 2 before reading a message.

#### Scenario: Two tools
- **WHEN** `tools/list` is called on `mdg mcp --folder .`
- **THEN** it answers `validate` and `preview` only

#### Scenario: The file as it is on disk
- **WHEN** a file is edited on disk between two previews
- **THEN** the second preview draws the edited file

#### Scenario: A folder that does not exist
- **WHEN** `mdg mcp --folder ./missing` runs
- **THEN** it exits with code 2 naming the folder, before reading a message

#### Scenario: No network
- **WHEN** a client validates and previews through `mdg mcp --folder` with a `fetch` that records its calls
- **THEN** no call was recorded

### Requirement: Paths of the folder
A path given to a folder tool SHALL be clean (as the project's path rule) and SHALL resolve, its
links followed, under the real path of `<dir>`; any other path SHALL be refused with
`path.invalid` before anything is read.

#### Scenario: A path outside the folder
- **WHEN** `preview` is called with `path: "../secret.meltemi"`
- **THEN** the result is `isError` with `code: "path.invalid"` and nothing is read

#### Scenario: A link out of the folder
- **WHEN** `diagrams/out.meltemi` is a symbolic link to a file outside `<dir>`
- **THEN** `preview` of it answers `path.invalid`

### Requirement: Logs and limits of the local server
Each tool call SHALL leave one line on stderr: `mcp: <tool> <milliseconds> ms <code>`. A line
SHALL never hold:
- the call's arguments or result;
- a token;
- an invitation's or a live session's link.

A preview's `width` SHALL be bounded as on the hosted endpoint (320 to 2048) and a PNG fitted to
four megapixels. Previews SHALL be drawn one at a time per process, each request waiting its
turn.

#### Scenario: A clean log
- **WHEN** the acceptance suite runs through `mdg mcp` with a test token
- **THEN** stderr holds one line per call and none of them contains the token or a link that grants access

#### Scenario: Too wide
- **WHEN** `preview` is called with `width: 4096`
- **THEN** the result is `isError` with `code: "request.invalid"` naming the limit, and nothing is drawn

### Requirement: Speed of local previews
On the reference machine, a warm PNG preview of `flow/thirty` at 1280 SHALL take under 1 second
from the call to the answer, and a process's first preview under 3 seconds. The measured times
SHALL be recorded in `docs/performance.md`, and the benchmark SHALL fail when a target is
missed.

#### Scenario: Warm preview
- **WHEN** the benchmark previews `flow/thirty` fifteen times in one process, after a first preview
- **THEN** the median and the p95 are under 1 second

#### Scenario: A target missed
- **WHEN** the benchmark's measured p95 exceeds its target
- **THEN** the benchmark exits 1 naming the case and its time
