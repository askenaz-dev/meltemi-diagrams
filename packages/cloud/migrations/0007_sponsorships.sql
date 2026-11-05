-- Sponsorships received (change unbranded-by-donation, spec sponsorship-entitlement): GitHub
-- Sponsors tells the Worker of each sponsorship of the sponsored account (`POST /_sponsors/github`),
-- the row keeps it, and the account that linked the sponsor's GitHub sign-in claims it, which grants
-- the permission to export without the Meltemi branding.
--
-- Same conventions as 0001 to 0006: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), the new table is STRICT, there are no foreign keys (deleting a person names every table:
-- `applyUserDeleted` clears the person's claims), and the database refuses what a column may not
-- hold.

-- One sponsorship, from its `created` delivery: the delivery's id (a repeat of it is refused), the
-- sponsor's GitHub login, numeric id and type (`User` or `Organization`), whether the tier is
-- one-time, its amount in cents, the privacy level and when GitHub created it. The later actions
-- change `status` only: `active`, `pending-cancellation` or `cancelled`, the last for good. The
-- login is compared ignoring case, as GitHub compares logins. `claimed_by_sub` and `claimed_at` are
-- the account that claimed it and when, both NULL until then, and NULL again when that account is
-- deleted.
CREATE TABLE sponsorships (
  id             TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
  delivery_id    TEXT NOT NULL UNIQUE CHECK (length(delivery_id) BETWEEN 1 AND 100),
  sponsor_login  TEXT NOT NULL COLLATE NOCASE CHECK (length(sponsor_login) BETWEEN 1 AND 39),
  sponsor_id     INTEGER NOT NULL CHECK (sponsor_id >= 0),
  sponsor_type   TEXT NOT NULL CHECK (length(sponsor_type) BETWEEN 1 AND 40),
  one_time       INTEGER NOT NULL CHECK (one_time IN (0, 1)),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
  privacy        TEXT NOT NULL CHECK (privacy IN ('public', 'private')),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending-cancellation', 'cancelled')),
  created_at     TEXT NOT NULL,
  claimed_by_sub TEXT,
  claimed_at     TEXT,
  CHECK ((claimed_by_sub IS NULL) = (claimed_at IS NULL))
) STRICT;

-- The sponsorships of a login, ignoring case (the column's collation): what a claim looks for.
CREATE INDEX sponsorships_login ON sponsorships (sponsor_login);

-- The sponsorships an account claimed: what its deletion clears.
CREATE INDEX sponsorships_claimed_by ON sponsorships (claimed_by_sub);
