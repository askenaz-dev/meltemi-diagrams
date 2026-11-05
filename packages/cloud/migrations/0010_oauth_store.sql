-- The authorization server's state (change agent-mcp, spec mcp-authorization "Clients and consent",
-- "Tokens" and "Connected apps"): the OAuth clients, grants, codes, tokens and consent transactions of
-- `@cloudflare/workers-oauth-provider`, which reads and writes them as a KV namespace
-- (`src/oauth/store.ts` gives it this table with a KV namespace's interface). Nothing else reads or
-- writes it. It replaces the KV namespace `OAUTH_KV`: the family's Terraform token cannot create KV
-- namespaces, and the Workers Free plan allows 1,000 KV writes a day for the whole account, which a
-- dozen connected agents would use up; D1 allows 100,000 rows written a day.
--
-- Same conventions as 0001 to 0009 (every new table is STRICT, there are no foreign keys, the
-- database refuses what a column may not hold), with one difference: `expires_at` is seconds since
-- 1970, as a KV entry's `expiration`, because that is how the library speaks of its expiries.

-- One row per entry. `key` is the library's (`client:<id>`, `grant:<user>:<grant>`,
-- `token:<user>:<grant>:<hash>`, `transaction:<hash>`; at most 512 characters, as KV's 512 bytes),
-- `value` its text (codes, tokens and client secrets are kept as hashes, props encrypted),
-- `expires_at` when the entry is gone (NULL: never) and `metadata` the key's metadata as JSON (NULL:
-- none). An expired row is absent from every read; the weekly cron removes it.
CREATE TABLE oauth_store (
  key        TEXT NOT NULL PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 512),
  value      TEXT NOT NULL,
  expires_at INTEGER,
  metadata   TEXT
) STRICT, WITHOUT ROWID;

-- The weekly cron removes the expired rows by this index; rows that never expire are not in it.
CREATE INDEX oauth_store_expires_at ON oauth_store (expires_at) WHERE expires_at IS NOT NULL;
