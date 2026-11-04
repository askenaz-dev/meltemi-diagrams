-- Administrators and permissions (change administrators-and-permissions, spec
-- service-administration): the administrators an owner invited, the invitations to become one, and
-- the log of every administration act. The owners are not here: they are the `sub`s of the
-- `ADMIN_SUBS` secret, read on every request.
--
-- Same conventions as 0001 to 0005: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), every new table is STRICT, there are no foreign keys (deleting a person names every table:
-- `applyUserDeleted`), and the database refuses what a column may not hold.

-- A person who accepted an owner's invitation. `invited_by` is the owner who invited them, `since`
-- when they accepted. Removing an administrator, or their leaving, deletes the row.
CREATE TABLE administrators (
  sub        TEXT NOT NULL PRIMARY KEY,
  invited_by TEXT NOT NULL,
  since      TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- An owner's invitation of an email to administer the service. There is no token: the invitee is
-- whoever signs in with that email verified and chooses Accept. `email` is lower-case. It is pending
-- while `accepted_at`, `declined_at` and `revoked_at` are NULL and `expires_at` (seven days after
-- `created_at`) is still ahead; it ends with at most one of the three.
CREATE TABLE admin_invitations (
  id          TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
  email       TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  invited_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  declined_at TEXT,
  revoked_at  TEXT,
  CHECK ((accepted_at IS NOT NULL) + (declined_at IS NOT NULL) + (revoked_at IS NOT NULL) <= 1)
) STRICT;

-- The pending invitation of an email: what the session answer shows its addressee.
CREATE INDEX admin_invitations_email ON admin_invitations (email);

-- The invitations a person made: the ones still open go when that person is deleted.
CREATE INDEX admin_invitations_invited_by ON admin_invitations (invited_by);

-- Every administration act, appended in the same step as the act and never changed: who (`by_sub`),
-- when, what, to whom (`target_sub`, or the invited `target_email`), and the permission id or the
-- publication and its reason (`detail`). The rows stay when the people they name are deleted, and
-- the sweep drops them a year after `at`.
CREATE TABLE admin_log (
  id           TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
  at           TEXT NOT NULL,
  by_sub       TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('invite', 'revoke-invitation', 'accept', 'decline', 'remove', 'leave', 'grant', 'revoke', 'takedown')),
  target_sub   TEXT,
  target_email TEXT,
  detail       TEXT NOT NULL DEFAULT ''
) STRICT;

-- The latest entries first, and the sweep of the old ones.
CREATE INDEX admin_log_at ON admin_log (at);
