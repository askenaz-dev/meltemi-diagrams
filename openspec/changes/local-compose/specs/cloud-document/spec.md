# Spec Delta

## MODIFIED Requirements

### Requirement: A project is a Yjs document in a room
A cloud project SHALL be a Yjs document with `files` (file id → `Y.Text`, the text files the
page edits), `paths` (file id → path, text and binary files alike) and `binaries` (file id →
SHA-256 of the bytes), held by one Durable Object `ProjectRoom` per project, SQLite-backed,
that loads the document from its storage on construction, applies every update as a
transaction, bumps a `revision` per transaction, and persists the encoded document and the
revision as a throttle for hosted WebSocket edits: at most once per second while changes keep arriving, once more after
the last one, at the latest ten seconds after the first unpersisted change, and when the last
client leaves; the encoded state SHALL be stored in chunks of at most 1 MiB with the revision
in one storage transaction. A rename SHALL be a change of the id's entry in `paths`; two ids
with one path SHALL be resolved with the lexically smaller id keeping the path and the other
reported as `<path>~<id>`, both listed as `collisions`. The room SHALL validate every
transaction whatever its origin (socket, push, restore): every path SHALL pass the path rule
(relative, `/`-separated, no empty, `.` or `..` segment, no segment starting with `.`, no
`\`, `:` or control character, at most 100 characters per segment and 12 segments: `cleanPath`
of `@meltemi/diagrams-project`), every key of `files` and `binaries` SHALL have a path, `files`
values SHALL be `Y.Text`, `binaries` values SHALL be lowercase 64-hex hashes present in
`project_blobs` for the project, and `CLOUD_LIMITS` SHALL hold (2000 entries, 2 Mi characters
per text, 16 MiB encoded); a transaction that breaks a rule SHALL be rolled back and answered
with `path.invalid`, `doc.invalid`, `blob.unknown`, `doc.too-large` or `quota.files`.

#### Scenario: Persisted while typing
- **WHEN** a hosted client sends an update every 200 ms for five seconds and then nothing
- **THEN** the room's storage holds the encoded document with every update and a revision raised by every transaction, written between five and seven times

#### Scenario: Never later than ten seconds
- **WHEN** a hosted client sends an update every 500 ms without a pause
- **THEN** the room's storage holds a state at most ten seconds old at any moment

#### Scenario: A large document reloads
- **WHEN** a room persists a document whose encoded state is 3 MiB and is constructed again
- **THEN** the reloaded document equals the persisted one and the storage holds three chunks

#### Scenario: A rename is one small change
- **WHEN** a client renames a 1 Mi-character file
- **THEN** the update it sends is under 1 KiB and the text's `Y.Text` is the same instance

#### Scenario: Over the limit
- **WHEN** an update would make a text exceed 2 Mi characters
- **THEN** the document is unchanged, the client receives kind 4 with `doc.too-large`, and its socket closes with 4413

#### Scenario: A bad path is rolled back
- **WHEN** an update sets `paths` of an id to `../secrets.meltemi` or `.git/hooks/post-checkout`
- **THEN** the document is unchanged, the client receives kind 4 with `path.invalid`, and its socket closes with 4400

#### Scenario: An unknown hash is rolled back
- **WHEN** an update sets a `binaries` entry to a hash the project never uploaded
- **THEN** the document is unchanged and the client receives kind 4 with `blob.unknown`

The separate local room SHALL persist every accepted source update before acknowledging or
relaying it. This policy SHALL be selected by the local Durable Object constructor, never by
request headers or a hosted configuration flag. Hosted socket edits retain the throttle above.

#### Scenario: Local browser update survives immediate reconstruction
- **WHEN** a local browser update has been accepted and relayed, and the room is reconstructed immediately without advancing timers or closing sockets
- **THEN** the source, binary references and revision match the accepted state

#### Scenario: Failed local browser persistence
- **WHEN** local room storage refuses an update
- **THEN** the room refuses it without relaying a positive update, preserves its prior document/revision and reconstructs with that prior state

### Requirement: Reads and pushes through the room
`GET /api/projects/:id/files` SHALL answer from the room `{ revision, files: { path: text },
binaries: { path: hash }, collisions }`, the ids translated to paths; `PUT
/api/projects/:id/files` with `{ files: { path: text | null }, binaries: { path: hash | null },
ifRevision? }` SHALL apply the changes as one transaction (origin `push`) in which an existing
path keeps its id, a new path gets one and `null` deletes the file, and answer the new
revision, or `409 revision.mismatch` with the current revision when `ifRevision` differs; a
path that fails the rule SHALL answer `400 path.invalid` and a binary hash the project does not
hold `400 blob.unknown`, with nothing applied.

#### Scenario: A push with a stale revision
- **WHEN** the room is at revision 7 and a push carries `ifRevision: 5`
- **THEN** the answer is `409 revision.mismatch` with `revision: 7` and nothing changes

#### Scenario: A push seen by a connected client
- **WHEN** a client is connected and a push changes `diagrams/a.meltemi`
- **THEN** the client receives the update and its text is the pushed one

#### Scenario: A push with a bad path
- **WHEN** a push names `..\\x.meltemi` among its files
- **THEN** the answer is `400 path.invalid` and the room's revision is unchanged

A successful push or restore SHALL save the encoded document and resulting revision atomically
before its response or update broadcast. A storage failure SHALL return `internal`, preserve the
prior document/revision and allow a retry with the original revision, without a positive broadcast.

#### Scenario: Rapid acknowledged API writes survive a restart
- **WHEN** several pushes including an uploaded binary and source edit are acknowledged, then the room is reconstructed immediately without advancing persistence timers
- **THEN** the complete latest source, binary references and revision are preserved

#### Scenario: Acknowledged restore survives a restart
- **WHEN** a restore removes and replaces files and is acknowledged, then the room is reconstructed immediately
- **THEN** the restored source, removals, binary references and revision are preserved

#### Scenario: API persistence failure is atomic
- **WHEN** storage refuses a push or restore
- **THEN** no positive response or update is sent, the prior source/revision remains readable and a retry with that revision can succeed

### Requirement: Materialisation to content-addressed files
Thirty seconds after the last change, when the last client leaves, and before a version is
made, the room SHALL materialise by diff: every text file's bytes hashed with SHA-256, new
blobs written to R2 under `blobs/<hash>` and to `blobs`, the current `project_files` read and
only the paths whose hash changed upserted and only the removed paths deleted, in statements of
at most 100 bound parameters inside one `batch()`, and `projects.revision` and `updated_at`
updated. The same content SHALL produce the same hash and no second blob.

#### Scenario: Only what changed
- **WHEN** a project with five files is materialised, one file is edited, and it is materialised again
- **THEN** exactly one new blob exists, one `project_files` row was written, and the four unchanged rows were not touched

#### Scenario: Materialisation failure leaves the room intact
- **WHEN** R2 refuses a write
- **THEN** the room keeps its document and revision, logs the failure without the content, and retries at the next trigger

Before a positive explicit materialisation/version checkpoint, the room SHALL save any dirty
encoded room state and its revision. If that save fails it SHALL refuse the checkpoint before
materialising an unpersisted candidate.

#### Scenario: A version checkpoint requires durable room state
- **WHEN** hosted socket edits are still awaiting their timer and explicit materialisation is requested
- **THEN** the room state is saved before a positive result and survives immediate reconstruction; a failed room save refuses the checkpoint

### Requirement: Rows written stay bounded
In hosted development the room SHALL expose `GET /stats` with the counts of storage writes,
materialisations, D1 rows written and incoming messages, and the hosted cloud browser suite SHALL type
for one minute in a project and assert at least 20 and at most 90 storage writes, at most 3
materialisations, at most 60 D1 rows written and at most 300 incoming messages.

#### Scenario: A minute of typing
- **WHEN** the suite types continuously for sixty seconds with pauses under a second
- **THEN** the room reports between 20 and 90 storage writes, at most 3 materialisations, at most 60 D1 rows written and at most 300 incoming messages

#### Scenario: Not in production
- **WHEN** `DEV` is not set
- **THEN** `GET /stats` answers 404

The immediate durability of the single-user local room is outside this hosted batching budget.
Local debug/statistics HTTP surfaces remain unavailable.

#### Scenario: Local durability does not select a hosted policy
- **WHEN** local and hosted rooms are constructed
- **THEN** the local room saves accepted updates immediately while the hosted minute-of-typing scenario still meets its existing write budget
