-- Idempotency keys and call windows (change agent-mcp, specs cloud-projects "Idempotent creation
-- and pushes", mcp-server "Limits of the endpoint" and mcp-previews "Limits of previews").
--
-- Same conventions as 0001 to 0006: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), every new table is STRICT, there are no foreign keys (deleting a person names every table:
-- `applyUserDeleted`), and the database refuses what a column may not hold. The number 0007 is
-- another change's.

-- The first answer of a request made with an `Idempotency-Key`, per account: `POST /api/projects`
-- and `PUT /api/projects/<id>/files`, and the MCP tools that forward the key. `route` is the method
-- and the route the key was used on, `request_hash` the SHA-256 (hex) of the request's body; a
-- repeat with both the same answers `status` and `body` again. `status` and `body` are NULL while the
-- first request is being answered (a claim). Rows older than a day are removed by the account's next
-- claim and by the weekly cron.
CREATE TABLE idempotency (
  sub          TEXT NOT NULL,
  key          TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 64 AND key NOT GLOB '*[^!-~]*'),
  route        TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  status       INTEGER CHECK (status BETWEEN 100 AND 599),
  body         TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (sub, key),
  CHECK ((status IS NULL) = (body IS NULL))
) STRICT, WITHOUT ROWID;

-- The weekly cron removes the keys of every account by age.
CREATE INDEX idempotency_created_at ON idempotency (created_at);

-- How many calls of a kind (`call`: an MCP tool call; `preview`: a preview) an account made in a
-- minute (`minute` is the minute, `2026-11-04T12:03`). A call adds one to its window and removes the
-- account's earlier windows of the kind, so an account holds at most one row of each.
CREATE TABLE call_windows (
  sub    TEXT NOT NULL,
  kind   TEXT NOT NULL CHECK (kind IN ('call', 'preview')),
  minute TEXT NOT NULL CHECK (length(minute) = 16),
  count  INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (sub, kind, minute)
) STRICT, WITHOUT ROWID;
