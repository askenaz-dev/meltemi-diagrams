-- The online service's data in this change: exactly five tables (spec cloud-accounts: "Users and
-- the session answer", "Deletion events", "API tokens" and "The command line's approval page").
-- No token and no approval code in clear: `tokens.hash` and `cli_codes.hash` hold a SHA-256 in
-- hexadecimal and the database refuses anything else. No address of a person either:
-- `cli_failures.key` is a keyed hash of the caller.
--
-- Times are ISO-8601 text in UTC with milliseconds (they sort as text); booleans are 0 or 1.
-- There are no foreign keys: deleting a person is explicit and atomic (`applyUserDeleted`).
-- `users.handle` and the tables of projects and sharing belong to later migrations.

-- A person, from the first authenticated request. The profile is the session token's at that
-- moment and is refreshed when a request's claims differ. A deleted person's row is removed.
CREATE TABLE users (
  sub            TEXT NOT NULL PRIMARY KEY,
  name           TEXT NOT NULL,
  picture        TEXT NOT NULL,
  email          TEXT NOT NULL,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  created_at     TEXT NOT NULL
) STRICT;

-- An API token: only the SHA-256 of the `mdg_` token, never the token. `last_used_at` is NULL
-- until the token is first used.
CREATE TABLE tokens (
  id           TEXT NOT NULL PRIMARY KEY,
  sub          TEXT NOT NULL,
  name         TEXT NOT NULL,
  hash         TEXT NOT NULL UNIQUE CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  created_at   TEXT NOT NULL,
  last_used_at TEXT
) STRICT;

-- A person's tokens, and the count against the quota.
CREATE INDEX tokens_sub ON tokens (sub);

-- The deletion events already handled, so that a delivery repeated is answered and ignored, and so
-- that a session issued before a person's deletion is refused: `sub` is the person (an opaque id,
-- all that stays of them) and `at` the identity service's time of the deletion. The sweep removes
-- the events more than 31 days old: no session of that age can be presented any more.
CREATE TABLE processed_events (
  id  TEXT NOT NULL PRIMARY KEY,
  sub TEXT NOT NULL,
  at  TEXT NOT NULL
) STRICT;

-- What a stale session is refused by, and what the sweep finds the old events by.
CREATE INDEX processed_events_sub_at ON processed_events (sub, at);
CREATE INDEX processed_events_at ON processed_events (at);

-- The one-time code the command line exchanges for a token: only its SHA-256, bound to the
-- `state` the command line chose and to the person who approved, until `expires_at`. A code
-- nobody exchanges is removed by the sweep that every approval makes first.
CREATE TABLE cli_codes (
  hash       TEXT NOT NULL PRIMARY KEY CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  sub        TEXT NOT NULL,
  state      TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

-- What the sweep finds the expired codes by.
CREATE INDEX cli_codes_expires_at ON cli_codes (expires_at);

-- The failed exchanges of the command line, per caller, for the rate limit. A caller's rows
-- older than an hour are removed when it fails again, and everyone's by the sweep that every
-- failure makes first.
CREATE TABLE cli_failures (
  key TEXT NOT NULL,
  at  TEXT NOT NULL
) STRICT;

CREATE INDEX cli_failures_key_at ON cli_failures (key, at);

-- What the sweep finds the old failures by, of any caller.
CREATE INDEX cli_failures_at ON cli_failures (at);
