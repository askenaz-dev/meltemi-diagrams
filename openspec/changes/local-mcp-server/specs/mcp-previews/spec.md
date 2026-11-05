## ADDED Requirements

### Requirement: An unavailable renderer
When a call to the renderer object fails (its CPU limit exceeded, the object overloaded or
unreachable), `preview`, `validate`, `write_files` and `publish` SHALL answer `isError` with
`code: "renderer.unavailable"` and a message that names `mdg mcp`, which does the same work on
the person's machine; `write_files` and `publish` SHALL then have changed nothing. The Worker's log
SHALL name the tool and the code only.

#### Scenario: A preview the object cannot draw
- **WHEN** the renderer object's `render` throws because its CPU limit was exceeded
- **THEN** `preview` answers `isError` with `code: "renderer.unavailable"` and a message naming `mdg mcp`

#### Scenario: A write that cannot be checked
- **WHEN** `write_files` writes a `.meltemi` file and the object's `validate` throws
- **THEN** the result is `isError` with `code: "renderer.unavailable"`, the room's revision is unchanged and the idempotency key keeps no answer

#### Scenario: Other failures stay internal
- **WHEN** a tool fails for a reason that is not the renderer object
- **THEN** its result is `isError` with `code: "internal"`, as before
