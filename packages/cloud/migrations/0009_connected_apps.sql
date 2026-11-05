-- When each OAuth grant of an account was last used (change agent-mcp, specs mcp-authorization
-- "Connected apps" and cloud-accounts "The account's connected apps").
--
-- Same conventions as 0001 to 0008: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), every new table is STRICT, there are no foreign keys (deleting a person names every table:
-- `applyUserDeleted`), and the database refuses what a column may not hold.

-- The grants themselves are the authorization server's, in its table `oauth_store` (0010): this
-- table holds the one thing its library does not keep, the last time a grant's token reached the MCP
-- endpoint, written by a call at most once an hour. Revoking a grant from Connected apps removes its
-- row, and listing them removes the rows of grants that are gone.
CREATE TABLE app_uses (
  sub          TEXT NOT NULL,
  grant_id     TEXT NOT NULL CHECK (length(grant_id) BETWEEN 1 AND 64),
  last_used_at TEXT NOT NULL,
  PRIMARY KEY (sub, grant_id)
) STRICT, WITHOUT ROWID;
