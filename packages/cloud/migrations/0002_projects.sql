-- The projects in the cloud (change cloud-projects, spec cloud-projects "Projects", "Images and
-- fonts by hash", "Versions", "Thumbnails" and "Usage and storage quota"): six tables, and the
-- running total of a person's bytes on `users`.
--
-- Same conventions as 0001: times are ISO-8601 text in UTC with milliseconds (they sort as
-- text), booleans are 0 or 1, every table is STRICT, and there are no foreign keys, so deleting a
-- project or a person is explicit and atomic (`deleteProject`, `applyUserDeleted`). A hash is a
-- SHA-256 in lowercase hexadecimal and the database refuses anything else.
--
-- Rows written are a budget (D1 counts every index entry as a row), so the tables that hold a row
-- per file are WITHOUT ROWID (one b-tree, not a table and a key) and the only index beyond the
-- keys is `projects_owner`. Nothing is looked up by hash in the big tables: the weekly collection
-- of blobs reads the three reference tables whole once, which costs reads, not writes.

-- Bytes of the distinct blobs a person's projects, project_blobs and versions reference, kept so
-- that the usage answer and the quota check do not add them up on every request. The store
-- refreshes it at materialisation, version creation and binary upload.
ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;

-- A project. `id` is 20 characters of base32 chosen by the Worker (the shape of an address,
-- `/p/<id>`). `revision` is the room's revision at the last materialisation; `updated_at` follows
-- it and a rename. `thumbnail_at` is when the thumbnail was last written (NULL: none) and bounds
-- their rate. `deleted_at` is reserved by the design and never set: a project is deleted for good.
CREATE TABLE projects (
  id           TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 20 AND id NOT GLOB '*[^0-9a-z]*'),
  owner_sub    TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  revision     INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  thumbnail_at TEXT,
  deleted_at   TEXT
) STRICT;

-- A person's projects: the list, the quota, the owner check and the cascade.
CREATE INDEX projects_owner ON projects (owner_sub);

-- The files of a project as of the last materialisation: path to the SHA-256 of the bytes.
CREATE TABLE project_files (
  project_id TEXT NOT NULL,
  path       TEXT NOT NULL,
  hash       TEXT NOT NULL CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (project_id, path)
) STRICT, WITHOUT ROWID;

-- Every hash uploaded to a project through its binaries, copied by duplicate and removed with the
-- project. The room's hash check and the blob routes consult it, never the live map.
CREATE TABLE project_blobs (
  project_id TEXT NOT NULL,
  hash       TEXT NOT NULL CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (project_id, hash)
) STRICT, WITHOUT ROWID;

-- A blob, by content: the bytes are in R2 under blobs/<hash>. Shared by every project and person
-- that holds the same bytes; removed by the weekly collection when nothing references it.
CREATE TABLE blobs (
  hash       TEXT NOT NULL PRIMARY KEY CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  size       INTEGER NOT NULL CHECK (size >= 0),
  media_type TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- A version of a project. `number` counts from 1 within the project; `label` is NULL for an
-- unlabelled version; `auto` is 1 for the daily and the pre-restore versions; `created_by` is the
-- person's sub.
CREATE TABLE versions (
  id         INTEGER NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  number     INTEGER NOT NULL CHECK (number >= 1),
  label      TEXT,
  auto       INTEGER NOT NULL CHECK (auto IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, number)
) STRICT;

-- The files of a version: a copy of `project_files` when it was made.
CREATE TABLE version_files (
  version_id INTEGER NOT NULL,
  path       TEXT NOT NULL,
  hash       TEXT NOT NULL CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (version_id, path)
) STRICT, WITHOUT ROWID;
