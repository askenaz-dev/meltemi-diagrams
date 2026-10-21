-- Sharing and publishing (change sharing-and-permissions, specs project-sharing, publishing and
-- cloud-accounts): the link level of a project, its members and invitations, the handle of a
-- person, publications and takedowns, and the log that rates publishing. Everything the change
-- needs is here, so that the routes that come after only write code.
--
-- Same conventions as 0001 and 0002: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), every new table is STRICT, there are no foreign keys (deleting a project or a person names
-- every table: `deleteProject` and `applyUserDeleted`), and the database refuses what a column may
-- not hold. Rows written are a budget (D1 counts every index entry as a row), so the tables with
-- one row per person and project are WITHOUT ROWID and an index exists only where a lookup needs it.

-- What the project's link gives to anyone who holds it: nothing (a new project is private), reading
-- or reading and writing. Who may do what is decided in one place, `src/access.ts`.
ALTER TABLE projects ADD COLUMN link_access TEXT NOT NULL DEFAULT 'private' CHECK (link_access IN ('private', 'view', 'edit'));

-- The name of a person's publications, `[a-z0-9-]{3,30}`, chosen at the first publication. NULL
-- until then. Unique among the people who have one: the partial index leaves the people who have
-- none out of it (SQLite would allow many NULLs in a plain one; this one is smaller).
ALTER TABLE users ADD COLUMN handle TEXT CHECK (handle IS NULL OR (length(handle) BETWEEN 3 AND 30 AND handle NOT GLOB '*[^a-z0-9-]*'));

CREATE UNIQUE INDEX users_handle ON users (handle) WHERE handle IS NOT NULL;

-- A person the owner gave a role in a project. The owner is not a row here. `role` is what the
-- member was given; a link level may raise what they may do, never lower it.
CREATE TABLE members (
  project_id TEXT NOT NULL,
  sub        TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  added_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, sub)
) STRICT, WITHOUT ROWID;

-- A person's memberships: the list of their projects and the cascade of their deletion.
CREATE INDEX members_sub ON members (sub);

-- An invitation the owner made: by email (it becomes a membership when that email signs in verified)
-- or by link (whoever opens it signed in becomes a member). `email` is lower-case. `token` is 128
-- random bits in lowercase hexadecimal, kept IN CLEAR on purpose, unlike an API token or a code: the
-- owner copies the link of a pending invitation again from the list, so it has to be recoverable,
-- and it is a capability of the same kind as the link of a project that is `edit`. It is shown to the
-- owner alone, never logged, and works once (`accepted_at`) and for thirty days from `created_at`.
-- `id` names the invitation to the owner (revoke) and is not the token.
CREATE TABLE invitations (
  id          TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'),
  project_id  TEXT NOT NULL,
  email       TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  token       TEXT NOT NULL UNIQUE CHECK (length(token) = 32 AND token NOT GLOB '*[^0-9a-f]*'),
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  accepted_at TEXT
) STRICT;

-- A project's invitations: the owner's list, the limit, and the cascade of a deleted project.
CREATE INDEX invitations_project ON invitations (project_id);

-- The invitations for an email: resolved when that person signs in with the email verified, and
-- removed when they are deleted.
CREATE INDEX invitations_email ON invitations (email);

-- A project published as a page: `https://<publish host>/<handle>/<slug>/`. The key is the project
-- and the slug (a project may hold several); the address is unique. `bytes` is the size of the
-- stored HTML (the object itself is in R2 under published/<handle>/<slug>/index.html).
CREATE TABLE publications (
  project_id   TEXT NOT NULL,
  handle       TEXT NOT NULL CHECK (length(handle) BETWEEN 3 AND 30 AND handle NOT GLOB '*[^a-z0-9-]*'),
  slug         TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 60 AND slug NOT GLOB '*[^a-z0-9-]*'),
  published_at TEXT NOT NULL,
  bytes        INTEGER NOT NULL CHECK (bytes >= 0),
  PRIMARY KEY (project_id, slug),
  UNIQUE (handle, slug)
) STRICT, WITHOUT ROWID;

-- A publication an administrator of the service removed, kept as the record of it: the owner of the
-- handle sees it as removed by the service. Not part of the cascade of a person's deletion.
CREATE TABLE takedowns (
  handle  TEXT NOT NULL,
  slug    TEXT NOT NULL,
  by_sub  TEXT NOT NULL,
  reason  TEXT NOT NULL,
  at      TEXT NOT NULL,
  PRIMARY KEY (handle, slug, at)
) STRICT, WITHOUT ROWID;

-- The publish requests of the last hour, one row each: the rate of at most ten per project per hour
-- (`publish.rate`). `publications.published_at` cannot count them, for publishing a slug again
-- replaces its row and moves its time. A project and a time only, no person and no address; a row
-- older than an hour counts for nothing and is swept, and a project's rows go with it. It has a
-- rowid (not the project and the time as its key) so that two requests of one project in the very
-- same millisecond are two rows, as they are two requests.
CREATE TABLE publish_log (
  project_id TEXT NOT NULL,
  at         TEXT NOT NULL
) STRICT;

-- The requests of a project within the hour, which is the count that rates it, and the cascade of a
-- deleted project.
CREATE INDEX publish_log_project ON publish_log (project_id, at);

-- What the sweep reads: the rows old enough to go, whatever the project.
CREATE INDEX publish_log_at ON publish_log (at);
