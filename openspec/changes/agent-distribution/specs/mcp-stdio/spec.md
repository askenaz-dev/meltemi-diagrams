## Purpose

The local MCP server over standard input and output, for a client that starts the server itself,
such as a plugin: the same tools as the local listener, with no port, key or socket.

## ADDED Requirements

### Requirement: The stdio transport
`meltemi-diagrams mcp --stdio` SHALL serve the tools of the local server over standard input and
output as the Model Context Protocol defines that transport: the account's tools by default and
the folder's tools with `--folder`. Standard output SHALL carry protocol messages only, each
call's line SHALL go to standard error, and the process SHALL exit with code 0 when its input
closes.

#### Scenario: The folder's tools
- **WHEN** a client starts `mdg mcp --stdio --folder .` in a folder with `.meltemi` files and sends `initialize` and `tools/list`
- **THEN** the answers list `validate`, `inspect_story` and `preview`, and every line of standard output is a protocol message

#### Scenario: The same answers as the listener
- **WHEN** `preview` of one sheet is called over stdio and over `http://127.0.0.1:7373/mcp` with the same arguments
- **THEN** the two results hold the same picture and the same report

#### Scenario: The input closes
- **WHEN** the client closes the server's standard input
- **THEN** the process exits with code 0

### Requirement: No listener with stdio
With `--stdio` the command SHALL open no socket and SHALL read no key. `--port` together with
`--stdio` SHALL be a usage error (exit code 2), and so SHALL a folder that does not exist, before
anything is read from standard input.

#### Scenario: A port with stdio
- **WHEN** `mdg mcp --stdio --port 8000` runs
- **THEN** the exit code is 2, standard error says that `--stdio` takes no port, and nothing is written to standard output

#### Scenario: A folder that is not there
- **WHEN** `mdg mcp --stdio --folder missing` runs
- **THEN** the exit code is 2 and standard error names the folder

#### Scenario: No port is taken
- **WHEN** `mdg mcp --stdio --folder .` runs while another process holds port 7373
- **THEN** the server starts and answers `initialize`

### Requirement: The folder a client names
`--folder` SHALL take the folder from its value, and a value that is an unexpanded placeholder,
such as `${CLAUDE_PROJECT_DIR}` left as written by a client that expands none, SHALL be read as
the working folder. Paths of the tools SHALL stay inside the folder as they do through the
listener.

#### Scenario: A placeholder left as written
- **WHEN** a client starts `mdg mcp --stdio --folder ${CLAUDE_PROJECT_DIR}` without expanding the placeholder
- **THEN** the server serves its working folder

#### Scenario: A path outside the folder
- **WHEN** `validate` is called over stdio with the path `../other/sheet.meltemi`
- **THEN** the tool refuses it as it does through the listener

### Requirement: Help and guides for stdio
`mcp --help` SHALL list `--stdio` with one line, in both interface languages, and `docs/cli.md`,
`docs/agents.md` and their Spanish pairs SHALL say when to use it and give the line that adds it
to a client.

#### Scenario: The help
- **WHEN** `mdg mcp --help` runs with `--lang es`
- **THEN** the output lists `--stdio` with its line in Spanish

#### Scenario: A guide without its pair
- **WHEN** `docs/cli.md` describes `--stdio` and `docs/es/cli.md` does not
- **THEN** the localized documentation test fails naming `docs/es/cli.md`
