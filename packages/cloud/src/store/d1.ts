import type { D1Like, D1PreparedLike } from "../env.js";
import {
  PUBLICATION_COLUMNS,
  SELECT_PUBLICATION,
  d1PublicationReader,
  toPublication,
  type PublicationRecord,
} from "./d1-publications.js";
import {
  PUBLISH_WINDOW_MS,
  cliFailureCutoff,
  deletionCutoff,
  invitationCutoff,
  publishCutoff,
} from "./retention.js";
import { capacity } from "./shared.js";
import type {
  Accepted,
  BlobRow,
  CliCode,
  CloudStore,
  Invitation,
  LinkAccess,
  ListedProject,
  Member,
  MemberRole,
  NewBlob,
  Project,
  ProjectRole,
  PublishClaim,
  Takedown,
  TokenRow,
  User,
  Version,
} from "./types.js";

// The store over D1: every statement is a constant prepared with `?` placeholders and given its
// values through `bind()`, never built from a value. The few statements that take a list have
// as many placeholders as the list is long (`marks`, `groups`), a number and not a value. Times
// are ISO-8601 text (they sort as text), booleans are stored as 0 and 1, and a missing time is
// NULL. The tables are made by `migrations/0001_accounts.sql`, `0002_projects.sql` and
// `0003_sharing.sql`. There are no foreign keys, so deleting a person or a project names every
// table it empties. Where the interface promises an order, ties are broken by insertion order
// (`rowid`) so that `memoryStore()` and this store agree.
//
// D1 takes 100 bound parameters per statement. A list longer than one statement can bind is cut
// into chunks that fit, and the chunks of a write run in one `batch()`.

interface UserRecord {
  sub: string;
  name: string;
  picture: string;
  email: string;
  email_verified: number;
  created_at: string;
  handle: string | null;
  unbranded_exports: number;
  unbranded_exports_by: string | null;
  unbranded_exports_at: string | null;
}

interface TokenRecord {
  id: string;
  sub: string;
  name: string;
  hash: string;
  created_at: string;
  last_used_at: string | null;
}

interface CodeRecord {
  hash: string;
  sub: string;
  state: string;
  expires_at: string;
}

interface ProjectRecord {
  id: string;
  owner_sub: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  revision: number;
  thumbnail_at: string | null;
  link_access: string;
}

/** A row of the list of projects: the project and what the person is to it. */
interface ListedRecord extends ProjectRecord {
  role: string;
  seq: number;
}

interface MemberRecord {
  sub: string;
  role: string;
  added_at: string;
  name: string | null;
  picture: string | null;
  email: string | null;
}

interface InvitationRecord {
  id: string;
  project_id: string;
  email: string;
  role: string;
  token: string;
  created_by: string;
  created_at: string;
  accepted_at: string | null;
}

interface TakedownRecord {
  handle: string;
  slug: string;
  by_sub: string;
  reason: string;
  at: string;
  project_id: string | null;
}

interface BlobRecord {
  hash: string;
  size: number;
  media_type: string;
  created_at: string;
}

interface VersionRecord {
  project_id: string;
  number: number;
  label: string | null;
  auto: number;
  created_by: string;
  created_at: string;
}

// What a person's row is made of when it is written (the handle is chosen later, by its own
// statement), and what is read of it.
const USER_WRITE_COLUMNS = "sub, name, picture, email, email_verified, created_at";
const USER_COLUMNS = `${USER_WRITE_COLUMNS}, handle, unbranded_exports, unbranded_exports_by, unbranded_exports_at`;
const TOKEN_COLUMNS = "id, sub, name, hash, created_at, last_used_at";
const CODE_COLUMNS = "hash, sub, state, expires_at";
const PROJECT_COLUMNS =
  "id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, link_access";
const BLOB_COLUMNS = "hash, size, media_type, created_at";
const VERSION_COLUMNS = "project_id, number, label, auto, created_by, created_at";
const INVITATION_COLUMNS =
  "id, project_id, email, role, token, created_by, created_at, accepted_at";
const TAKEDOWN_COLUMNS = "handle, slug, by_sub, reason, at, project_id";

const toUser = (row: UserRecord): User => ({
  sub: row.sub,
  name: row.name,
  picture: row.picture,
  email: row.email,
  emailVerified: row.email_verified === 1,
  createdAt: row.created_at,
  handle: row.handle,
  unbrandedExports: row.unbranded_exports === 1,
  unbrandedExportsBy: row.unbranded_exports_by,
  unbrandedExportsAt: row.unbranded_exports_at,
});

const toToken = (row: TokenRecord): TokenRow => ({
  id: row.id,
  sub: row.sub,
  name: row.name,
  hash: row.hash,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

const toCode = (row: CodeRecord): CliCode => ({
  hash: row.hash,
  sub: row.sub,
  state: row.state,
  expiresAt: row.expires_at,
});

const toProject = (row: ProjectRecord): Project => ({
  id: row.id,
  ownerSub: row.owner_sub,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  revision: Number(row.revision),
  thumbnailAt: row.thumbnail_at,
  // The database refuses any other text (`migrations/0003_sharing.sql`).
  linkAccess: row.link_access as LinkAccess,
});

const toListed = (row: ListedRecord): ListedProject => ({
  ...toProject(row),
  role: row.role as ProjectRole,
});

const toMember = (row: MemberRecord): Member => ({
  sub: row.sub,
  role: row.role as MemberRole,
  addedAt: row.added_at,
  name: row.name ?? "",
  picture: row.picture ?? "",
  email: row.email ?? "",
});

const toInvitation = (row: InvitationRecord): Invitation => ({
  id: row.id,
  projectId: row.project_id,
  email: row.email,
  role: row.role as MemberRole,
  token: row.token,
  createdBy: row.created_by,
  createdAt: row.created_at,
  acceptedAt: row.accepted_at,
});

const toTakedown = (row: TakedownRecord): Takedown => ({
  handle: row.handle,
  slug: row.slug,
  bySub: row.by_sub,
  reason: row.reason,
  at: row.at,
  projectId: row.project_id,
});

const toBlob = (row: BlobRecord): BlobRow => ({
  hash: row.hash,
  size: Number(row.size),
  mediaType: row.media_type,
  createdAt: row.created_at,
});

const toVersion = (row: VersionRecord): Version => ({
  projectId: row.project_id,
  number: Number(row.number),
  label: row.label,
  auto: row.auto === 1,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

/** The value SQLite stores for a boolean. */
const bit = (value: boolean): number => (value ? 1 : 0);

/** D1 takes at most this many bound parameters in a statement. */
const MAX_PARAMETERS = 100;
/** Rows of `blobs` (4 parameters each) in one INSERT. */
const BLOB_ROWS = Math.floor(MAX_PARAMETERS / 4);
/** Rows of `project_files` (path and hash) in one INSERT, which also binds the project once. */
const FILE_ROWS = Math.floor((MAX_PARAMETERS - 1) / 2);
/** Items of an `IN (…)` list in a statement that binds one more value. */
const LIST_ITEMS = MAX_PARAMETERS - 1;

/** `count` placeholders: `?, ?, ?`. The number comes from a list's length, never its content. */
const marks = (count: number): string => Array.from({ length: count }, () => "?").join(", ");

/** `count` copies of one row of placeholders: `(?, ?), (?, ?)`. */
const groups = (count: number, group: string): string =>
  Array.from({ length: count }, () => group).join(", ");

/** The items in lists of at most `size`. */
function chunked<T>(items: readonly T[], size: number): T[][] {
  const lists: T[][] = [];
  for (let i = 0; i < items.length; i += size) lists.push(items.slice(i, i + size));
  return lists;
}

/** The blobs with a hash that has not come before: the first of a repeated hash stands. */
function distinctBlobs(blobs: readonly NewBlob[]): NewBlob[] {
  const first = new Map<string, NewBlob>();
  for (const blob of blobs) if (!first.has(blob.hash)) first.set(blob.hash, blob);
  return [...first.values()];
}

/** The rows a read answered inside a batch (D1 answers each statement of a batch as `{ results }`). */
function rowsOf<T>(answer: unknown): T[] {
  const results = (answer as { results?: unknown } | null | undefined)?.results;
  // Guessing would turn a driver that does not answer a read into a person who does not exist.
  if (!Array.isArray(results)) throw new Error("the database did not answer the read of a batch");
  return results as T[];
}

// A new person, or the profile refreshed when a column differs. When nothing differs the
// conflict updates no row, so a request that changes nothing writes nothing. `created_at` is
// never in the update: the person keeps the time of their first request.
const UPSERT_USER = `INSERT INTO users (${USER_WRITE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (sub) DO UPDATE SET name = excluded.name, picture = excluded.picture, email = excluded.email, email_verified = excluded.email_verified WHERE users.name <> excluded.name OR users.picture <> excluded.picture OR users.email <> excluded.email OR users.email_verified <> excluded.email_verified`;

const SELECT_USER = `SELECT ${USER_COLUMNS} FROM users WHERE sub = ?`;

// The token goes in only while the person holds fewer than the limit: the count and the insert
// are one statement, so two requests cannot both pass the check.
const INSERT_TOKEN_UNDER_LIMIT = `INSERT INTO tokens (${TOKEN_COLUMNS}) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM tokens WHERE sub = ?) < ?`;

// ---- Projects ----------------------------------------------------------------------------

// The project goes in only while the person holds fewer than the limit, as the token does.
const INSERT_PROJECT_UNDER_LIMIT = `INSERT INTO projects (id, owner_sub, name, description, created_at, updated_at, revision, thumbnail_at, deleted_at) SELECT ?, ?, ?, ?, ?, ?, 0, NULL, NULL WHERE (SELECT COUNT(*) FROM projects WHERE owner_sub = ?) < ?`;

// The owner is part of every statement that reads or changes one project for a person.
const SELECT_PROJECT = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ? AND owner_sub = ?`;

// The one read with no owner: what a person may do with the project is resolved from this row.
const SELECT_PROJECT_BY_ID = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`;

// A field left out is bound as NULL and keeps its value (neither column can be NULL).
const UPDATE_PROJECT = `UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ? AND owner_sub = ? RETURNING ${PROJECT_COLUMNS}`;

// The link level changes for the owner alone and leaves `updated_at` as it is.
const SET_LINK_ACCESS = `UPDATE projects SET link_access = ? WHERE id = ? AND owner_sub = ? RETURNING ${PROJECT_COLUMNS}`;

// The projects a person owns and the ones they are a member of, in one read. The role of the first
// part is bound (the statements carry no literal); `seq` is the project's rowid, which breaks the
// ties of `updated_at` as the interface says (an ORDER BY of a compound select names output columns).
const LIST_PROJECTS = `SELECT p.id AS id, p.owner_sub AS owner_sub, p.name AS name, p.description AS description, p.created_at AS created_at, p.updated_at AS updated_at, p.revision AS revision, p.thumbnail_at AS thumbnail_at, p.link_access AS link_access, ? AS role, p.rowid AS seq FROM projects p WHERE p.owner_sub = ? UNION ALL SELECT p.id, p.owner_sub, p.name, p.description, p.created_at, p.updated_at, p.revision, p.thumbnail_at, p.link_access, m.role, p.rowid FROM members m JOIN projects p ON p.id = m.project_id WHERE m.sub = ? ORDER BY updated_at DESC, seq DESC`;

// A project's rows, children first, each only while the project is the person's; the project row
// goes last, so that the owner check still finds it for every statement before it.
const SELECT_OWNED_PROJECT_ID = "SELECT id FROM projects WHERE id = ? AND owner_sub = ?";
const DELETE_PROJECT_ROWS = [
  "DELETE FROM version_files WHERE version_id IN (SELECT v.id FROM versions v JOIN projects p ON p.id = v.project_id WHERE p.id = ? AND p.owner_sub = ?)",
  "DELETE FROM versions WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM project_blobs WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM members WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM invitations WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM publications WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM publish_log WHERE project_id IN (SELECT id FROM projects WHERE id = ? AND owner_sub = ?)",
  "DELETE FROM projects WHERE id = ? AND owner_sub = ?",
] as const;

// What deleting a person removes of the projects: the same, for every project they own.
const DELETE_OWNED_ROWS = [
  "DELETE FROM version_files WHERE version_id IN (SELECT v.id FROM versions v JOIN projects p ON p.id = v.project_id WHERE p.owner_sub = ?)",
  "DELETE FROM versions WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM project_files WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM project_blobs WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM members WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM invitations WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM publications WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM publish_log WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?)",
  "DELETE FROM projects WHERE owner_sub = ?",
] as const;

// What deleting a person removes of the sharing of others: their memberships, and the invitations
// that address their verified email (their own are on their projects, removed above).
const DELETE_MEMBERSHIPS = "DELETE FROM members WHERE sub = ?";
const DELETE_INVITATIONS_TO = "DELETE FROM invitations WHERE email = ?";

// The thumbnail may be written when none was, or when the last is not newer than the limit.
const CLAIM_THUMBNAIL =
  "UPDATE projects SET thumbnail_at = ? WHERE id = ? AND (thumbnail_at IS NULL OR thumbnail_at <= ?)";

// ---- Files and materialisation -----------------------------------------------------------

const PROJECT_EXISTS = "SELECT 1 AS found FROM projects WHERE id = ?";

// A new blob row, or an old one made as new as now (never older), keeping its size and type.
const insertBlobs = (rows: number): string =>
  `INSERT INTO blobs (${BLOB_COLUMNS}) VALUES ${groups(rows, "(?, ?, ?, ?)")} ON CONFLICT (hash) DO UPDATE SET created_at = excluded.created_at WHERE excluded.created_at > blobs.created_at`;

const deleteFiles = (paths: number): string =>
  `DELETE FROM project_files WHERE project_id = ? AND path IN (${marks(paths)})`;

// The rows come from the project's own row, so a project that is gone gets none; a row whose
// hash is already the one given is left alone. The project is bound last: it follows the rows.
const upsertFiles = (rows: number): string =>
  `INSERT INTO project_files (project_id, path, hash) SELECT p.id, v.column1, v.column2 FROM projects p, (VALUES ${groups(rows, "(?, ?)")}) AS v WHERE p.id = ? ON CONFLICT (project_id, path) DO UPDATE SET hash = excluded.hash WHERE project_files.hash <> excluded.hash`;

// Only a revision the project does not have yet: a room that was built again over a document it had
// already materialised (an object evicted and a person who only looked) writes the same revision
// again, which is no change and costs no row, and must not move the project up the list.
const UPDATE_REVISION =
  "UPDATE projects SET revision = ?, updated_at = ? WHERE id = ? AND revision <> ?";

// ---- Blobs -------------------------------------------------------------------------------

const selectBlobsPresent = (hashes: number): string =>
  `SELECT hash FROM blobs WHERE hash IN (${marks(hashes)})`;

// The hash is recorded only for a project that exists.
const INSERT_PROJECT_BLOB =
  "INSERT INTO project_blobs (project_id, hash) SELECT id, ? FROM projects WHERE id = ? ON CONFLICT (project_id, hash) DO NOTHING";

// The target must be the person's and the source must exist (the route has resolved that the person
// may read it); the rows that are already there are left alone.
const COPY_PROJECT_BLOBS =
  "INSERT INTO project_blobs (project_id, hash) SELECT ?, b.hash FROM project_blobs b WHERE b.project_id = ? AND EXISTS (SELECT 1 FROM projects WHERE id = ?) AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND owner_sub = ?) ON CONFLICT (project_id, hash) DO NOTHING";

// The upload table first; the versions only when it does not hold the hash (UNION ALL stops at
// the first row because of the LIMIT).
const SELECT_PROJECT_HOLDS_BLOB =
  "SELECT 1 AS found FROM project_blobs WHERE project_id = ? AND hash = ? UNION ALL SELECT 1 FROM versions v JOIN version_files f ON f.version_id = v.id WHERE v.project_id = ? AND f.hash = ? LIMIT 1";

// ---- Versions ----------------------------------------------------------------------------

// The version goes in under the next number only for a project that exists, holds fewer than the
// limit and has had fewer than the rate in the window: all one statement, so racing requests
// cannot pass the checks together. The unique key on (project_id, number) is the backstop.
const INSERT_VERSION = `INSERT INTO versions (${VERSION_COLUMNS}) SELECT p.id, COALESCE((SELECT MAX(number) FROM versions WHERE project_id = p.id), 0) + 1, ?, ?, ?, ? FROM projects p WHERE p.id = ? AND (SELECT COUNT(*) FROM versions WHERE project_id = p.id) < ? AND (SELECT COUNT(*) FROM versions WHERE project_id = p.id AND created_at >= ?) < ?`;

// The next two statements of the batch run only when the INSERT above wrote a row: changes() is
// the rows that statement changed, 0 when it was refused, and the newest version of the project
// is then the one it wrote. The read gives the row back; the copy takes the project's files.
const SELECT_NEW_VERSION = `SELECT ${VERSION_COLUMNS} FROM versions WHERE project_id = ? AND number = (SELECT MAX(number) FROM versions WHERE project_id = ?) AND changes() = 1`;
const COPY_VERSION_FILES =
  "INSERT INTO version_files (version_id, path, hash) SELECT v.id, f.path, f.hash FROM versions v JOIN project_files f ON f.project_id = v.project_id WHERE v.project_id = ? AND v.number = (SELECT MAX(number) FROM versions WHERE project_id = ?) AND changes() = 1";

// Why a version was refused, read after the fact.
const SELECT_VERSION_STATE =
  "SELECT (SELECT COUNT(*) FROM projects WHERE id = ?) AS found, (SELECT COUNT(*) FROM versions WHERE project_id = ?) AS held";

const SELECT_VERSIONS = `SELECT ${VERSION_COLUMNS} FROM versions WHERE project_id = ?`;

const SELECT_VERSION_FILES =
  "SELECT f.path AS path, f.hash AS hash FROM versions v LEFT JOIN version_files f ON f.version_id = v.id WHERE v.project_id = ? AND v.number = ?";

// Each version's paths that differ from the previous version's: those of its own with no equal
// (path and hash) row in the previous one, and those of the previous one it no longer has. The
// first version has no previous (NULL matches nothing), so all its paths are new.
const SELECT_VERSION_NUMBERS = "SELECT number FROM versions WHERE project_id = ? ORDER BY number";
const SELECT_VERSION_CHANGES =
  "WITH chain AS (SELECT v.id AS id, v.number AS number, (SELECT p.id FROM versions p WHERE p.project_id = v.project_id AND p.number < v.number ORDER BY p.number DESC LIMIT 1) AS prev FROM versions v WHERE v.project_id = ?) SELECT c.number AS number, f.path AS path FROM chain c JOIN version_files f ON f.version_id = c.id WHERE NOT EXISTS (SELECT 1 FROM version_files g WHERE g.version_id = c.prev AND g.path = f.path AND g.hash = f.hash) UNION ALL SELECT c.number AS number, g.path AS path FROM chain c JOIN version_files g ON g.version_id = c.prev WHERE NOT EXISTS (SELECT 1 FROM version_files f WHERE f.version_id = c.id AND f.path = g.path) ORDER BY number, path";

const deleteVersionFiles = (numbers: number): string =>
  `DELETE FROM version_files WHERE version_id IN (SELECT id FROM versions WHERE project_id = ? AND number IN (${marks(numbers)}))`;
const deleteVersionRows = (numbers: number): string =>
  `DELETE FROM versions WHERE project_id = ? AND number IN (${marks(numbers)})`;

// ---- Usage and collection ----------------------------------------------------------------

// The distinct hashes of a person's files, uploads and versions (UNION removes the repeats, so a
// blob shared by two projects counts once), and the sizes of the blobs with those hashes.
const OWNED_BYTES =
  "SELECT COALESCE(SUM(size), 0) FROM blobs WHERE hash IN (SELECT f.hash FROM project_files f JOIN projects p ON p.id = f.project_id WHERE p.owner_sub = ? UNION SELECT b.hash FROM project_blobs b JOIN projects p ON p.id = b.project_id WHERE p.owner_sub = ? UNION SELECT vf.hash FROM version_files vf JOIN versions v ON v.id = vf.version_id JOIN projects p ON p.id = v.project_id WHERE p.owner_sub = ?)";

// Every hash anything references; read whole, once per statement, by the weekly collection only.
const REFERENCED_HASHES =
  "SELECT hash FROM project_files UNION SELECT hash FROM project_blobs UNION SELECT hash FROM version_files";

const SELECT_UNREFERENCED_BLOBS = `SELECT hash FROM blobs WHERE created_at < ? AND hash NOT IN (${REFERENCED_HASHES}) ORDER BY created_at, hash LIMIT ?`;

// A blob is removed only if it is still old and still unreferenced when the statement runs.
const deleteUnreferencedBlobs = (hashes: number): string =>
  `DELETE FROM blobs WHERE created_at < ? AND hash IN (${marks(hashes)}) AND hash NOT IN (${REFERENCED_HASHES})`;

// ---- Members and invitations -------------------------------------------------------------

const SELECT_MEMBER_ROLE = "SELECT role FROM members WHERE project_id = ? AND sub = ?";

// The profile is the person's cached row; a member who has none (never) is listed with no name.
const SELECT_MEMBERS =
  "SELECT m.sub AS sub, m.role AS role, m.added_at AS added_at, u.name AS name, u.picture AS picture, u.email AS email FROM members m LEFT JOIN users u ON u.sub = m.sub WHERE m.project_id = ? ORDER BY m.added_at, m.sub";

const SET_MEMBER_ROLE = "UPDATE members SET role = ? WHERE project_id = ? AND sub = ?";
const DELETE_MEMBER = "DELETE FROM members WHERE project_id = ? AND sub = ?";

// The invitation goes in only for a project that exists and holds fewer than the limit of members
// and pending invitations together (not accepted, made after the cutoff): one statement, so two
// invitations racing for the last place cannot both have it. The owner is not a member.
const INSERT_INVITATION_UNDER_LIMIT = `INSERT INTO invitations (${INVITATION_COLUMNS}) SELECT ?, ?, ?, ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?) AND (SELECT COUNT(*) FROM members WHERE project_id = ?) + (SELECT COUNT(*) FROM invitations WHERE project_id = ? AND accepted_at IS NULL AND created_at > ?) < ?`;

const SELECT_PENDING_INVITATIONS = `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE project_id = ? AND accepted_at IS NULL AND created_at > ? ORDER BY created_at, rowid`;
const SET_INVITATION_ROLE =
  "UPDATE invitations SET role = ? WHERE project_id = ? AND id = ? AND accepted_at IS NULL";
const DELETE_INVITATION =
  "DELETE FROM invitations WHERE project_id = ? AND id = ? AND accepted_at IS NULL";
const SELECT_PENDING_BY_TOKEN = `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE token = ? AND accepted_at IS NULL AND created_at > ?`;

// Accepting. The member goes in with the invitation's role, or, when the person already is one,
// keeps the higher of the two (`editor` is bound twice: the statements carry no literal). The
// project's owner is left out of every statement: they are never a member, and the invitation stays
// pending for them. The statements of one acceptance run in one batch, so what the first reads is
// what the others change.
const ACCEPT_BY_TOKEN_ROWS =
  "FROM invitations i JOIN projects p ON p.id = i.project_id WHERE i.token = ? AND i.accepted_at IS NULL AND i.created_at > ? AND p.owner_sub <> ?";
const SELECT_ACCEPTABLE_BY_TOKEN = `SELECT i.project_id AS project_id, i.role AS role ${ACCEPT_BY_TOKEN_ROWS}`;
const INSERT_MEMBER_BY_TOKEN = `INSERT INTO members (project_id, sub, role, added_at) SELECT i.project_id, ?, i.role, ? ${ACCEPT_BY_TOKEN_ROWS} ON CONFLICT (project_id, sub) DO UPDATE SET role = CASE WHEN excluded.role = ? THEN ? ELSE members.role END`;
const MARK_ACCEPTED_BY_TOKEN =
  "UPDATE invitations SET accepted_at = ? WHERE token = ? AND accepted_at IS NULL AND created_at > ? AND EXISTS (SELECT 1 FROM projects p WHERE p.id = invitations.project_id AND p.owner_sub <> ?)";
const SELECT_ROLE_AFTER_TOKEN =
  "SELECT m.project_id AS project_id, m.role AS role FROM members m WHERE m.sub = ? AND m.project_id IN (SELECT project_id FROM invitations WHERE token = ?)";

const ACCEPT_BY_EMAIL_ROWS =
  "FROM invitations i JOIN projects p ON p.id = i.project_id WHERE i.email = ? AND i.accepted_at IS NULL AND i.created_at > ? AND p.owner_sub <> ?";
const SELECT_ACCEPTABLE_BY_EMAIL = `SELECT i.project_id AS project_id, i.role AS role ${ACCEPT_BY_EMAIL_ROWS} ORDER BY i.project_id`;
const INSERT_MEMBERS_BY_EMAIL = `INSERT INTO members (project_id, sub, role, added_at) SELECT i.project_id, ?, i.role, ? ${ACCEPT_BY_EMAIL_ROWS} ON CONFLICT (project_id, sub) DO UPDATE SET role = CASE WHEN excluded.role = ? THEN ? ELSE members.role END`;
const MARK_ACCEPTED_BY_EMAIL =
  "UPDATE invitations SET accepted_at = ? WHERE email = ? AND accepted_at IS NULL AND created_at > ? AND EXISTS (SELECT 1 FROM projects p WHERE p.id = invitations.project_id AND p.owner_sub <> ?)";
const SELECT_ROLES_AFTER_EMAIL =
  "SELECT m.project_id AS project_id, m.role AS role FROM members m WHERE m.sub = ? AND m.project_id IN (SELECT project_id FROM invitations WHERE email = ? AND accepted_at = ?) ORDER BY m.project_id";

// ---- Handles, publications and takedowns -------------------------------------------------

// The handle is set when the person has none or the same one, or when no publication is addressed
// by their current one (it would move under a published address), and while no one else holds it
// (the unique index is the backstop). `IS` is the comparison that is true for two NULLs.
const SET_HANDLE =
  "UPDATE users SET handle = ? WHERE sub = ? AND (handle IS ? OR NOT EXISTS (SELECT 1 FROM publications WHERE handle = users.handle)) AND NOT EXISTS (SELECT 1 FROM users other WHERE other.handle = ? AND other.sub <> ?)";
const HANDLE_HELD_BY_ANOTHER = "SELECT 1 AS held FROM users WHERE handle = ? AND sub <> ?";
// The handle's unique index (`users_handle`) finds its holder.
const SELECT_USER_BY_HANDLE = `SELECT ${USER_COLUMNS} FROM users WHERE handle = ?`;
const SET_UNBRANDED =
  "UPDATE users SET unbranded_exports = ?, unbranded_exports_by = ?, unbranded_exports_at = ? WHERE sub = ?";
const SELECT_ENTITLED = `SELECT ${USER_COLUMNS} FROM users WHERE unbranded_exports = 1 ORDER BY unbranded_exports_at, sub`;

const SELECT_PUBLICATIONS_OF = `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE project_id = ? ORDER BY published_at, slug`;
const SELECT_PUBLICATIONS_OWNED = `SELECT ${PUBLICATION_COLUMNS} FROM publications WHERE project_id IN (SELECT id FROM projects WHERE owner_sub = ?) ORDER BY published_at, slug`;

// The publication goes in for a project that exists, and only while no other project holds the
// address; one the project already has under the slug is replaced. With the flag set (`? = 1`) the
// project's owner must hold the handle too, in the same statement, so that a handle changed while a
// request was being read cannot leave a page under an address its owner released.
const PUT_PUBLICATION = `INSERT INTO publications (${PUBLICATION_COLUMNS}) SELECT p.id, ?, ?, ?, ? FROM projects p WHERE p.id = ? AND (? = 0 OR EXISTS (SELECT 1 FROM users u WHERE u.sub = p.owner_sub AND u.handle = ?)) AND NOT EXISTS (SELECT 1 FROM publications o WHERE o.handle = ? AND o.slug = ? AND o.project_id <> ?) ON CONFLICT (project_id, slug) DO UPDATE SET handle = excluded.handle, published_at = excluded.published_at, bytes = excluded.bytes`;
const OWNER_HOLDS_HANDLE =
  "SELECT 1 AS found FROM projects p JOIN users u ON u.sub = p.owner_sub WHERE p.id = ? AND u.handle = ?";
const DELETE_PUBLICATION = `DELETE FROM publications WHERE project_id = ? AND slug = ? RETURNING ${PUBLICATION_COLUMNS}`;
const COUNT_PUBLICATIONS_SINCE =
  "SELECT COUNT(*) AS published FROM publications WHERE project_id = ? AND published_at >= ?";

// A publish request is recorded for a project that exists, and only while fewer than the limit were
// made within the hour: the count and the insert are ONE statement, so racing requests cannot pass the
// limit.
const CLAIM_PUBLISH =
  "INSERT INTO publish_log (project_id, at) SELECT p.id, ? FROM projects p WHERE p.id = ? AND (SELECT COUNT(*) FROM publish_log WHERE project_id = ? AND at >= ?) < ?";
const SELECT_EARLIEST_PUBLISH =
  "SELECT MIN(at) AS earliest FROM publish_log WHERE project_id = ? AND at >= ?";
// What the sweep removes: the requests more than an hour old (by `publish_log_at`).
const SWEEP_PUBLISH_LOG = "DELETE FROM publish_log WHERE at < ?";

// The takedown is recorded only when there is a publication to take down, and in the same batch
// as its removal.
const INSERT_TAKEDOWN = `INSERT INTO takedowns (${TAKEDOWN_COLUMNS}) SELECT ?, ?, ?, ?, ?, project_id FROM publications WHERE handle = ? AND slug = ?`;
const DELETE_PUBLICATION_AT = "DELETE FROM publications WHERE handle = ? AND slug = ?";
const SELECT_TAKEDOWNS = `SELECT ${TAKEDOWN_COLUMNS} FROM takedowns WHERE handle = ? ORDER BY at DESC, slug`;

/** The role the owner has in the list of projects; a member's comes from their row. */
const OWNER: ProjectRole = "owner";
/** The role that wins when a person already a member is invited again. */
const EDITOR: MemberRole = "editor";

/** The service's store over a D1 database (or anything shaped like one). */
export function d1Store(db: D1Like): CloudStore {
  const publicationReader = d1PublicationReader(db);

  const run = async (statement: D1PreparedLike): Promise<void> => {
    await statement.run();
  };

  /** Runs a write and answers how many rows it changed, as D1 reports in `meta.changes`. */
  const runCounting = async (statement: D1PreparedLike): Promise<number> => {
    const changes = (await statement.run()).meta?.changes;
    // Guessing would turn a driver that does not report the count into a wrong answer to the person.
    if (typeof changes !== "number")
      throw new Error("the database did not report the rows changed");
    return changes;
  };

  /** Whether the deletion event was already handled. */
  const handled = async (eventId: string): Promise<boolean> => {
    const row = await db
      .prepare("SELECT 1 AS handled FROM processed_events WHERE id = ?")
      .bind(eventId)
      .first<{ handled: number }>();
    return row !== null;
  };

  /** The person's own project: the owner is part of the statement. */
  const readProject = async (sub: string, id: string): Promise<Project | undefined> => {
    const row = await db.prepare(SELECT_PROJECT).bind(id, sub).first<ProjectRecord>();
    return row ? toProject(row) : undefined;
  };

  /** Which of the hashes have a row: one read per chunk, all in one batch. */
  const blobsPresent = async (hashes: readonly string[]): Promise<Set<string>> => {
    const present = new Set<string>();
    const statements = chunked([...new Set(hashes)], MAX_PARAMETERS).map((list) =>
      db.prepare(selectBlobsPresent(list.length)).bind(...list),
    );
    if (statements.length === 0) return present;
    for (const answer of await db.batch(statements)) {
      for (const row of rowsOf<{ hash: string }>(answer)) present.add(row.hash);
    }
    return present;
  };

  return {
    async user(sub) {
      const row = await db.prepare(SELECT_USER).bind(sub).first<UserRecord>();
      return row ? toUser(row) : undefined;
    },
    async upsertUser(profile, now) {
      // The write and the read are one transaction: the row read is the row just written (or
      // kept), even when a deletion event for the same person lands between two requests.
      const [, read] = await db.batch([
        db
          .prepare(UPSERT_USER)
          .bind(
            profile.sub,
            profile.name,
            profile.picture,
            profile.email,
            bit(profile.emailVerified),
            now,
          ),
        db.prepare(SELECT_USER).bind(profile.sub),
      ]);
      const row = rowsOf<UserRecord>(read)[0];
      if (!row) throw new Error("the database did not return the user it wrote");
      return toUser(row);
    },

    async applyUserDeleted(eventId, sub, at) {
      if (await handled(eventId)) return "duplicate";
      // The invitations that address the person are found by their verified email, as the row
      // holds it now (the batch removes the row, so it is read first), in the case the
      // invitations were made in (lower).
      const mailed = await db
        .prepare("SELECT email FROM users WHERE sub = ? AND email_verified = 1")
        .bind(sub)
        .first<{ email: string }>();
      try {
        // The event's id and every deletion are one transaction: the person is gone and the event
        // is recorded, or neither. The foreign keys that do not exist cannot cascade, so each
        // table is named: the projects with their files, uploads, versions, members, invitations
        // and publications first (by the projects' owner, which has to be there to find them),
        // then the rest. The `blobs` rows are shared by content and stay for the weekly
        // collection, and the `takedowns` are the service's record.
        await db.batch([
          db
            .prepare("INSERT INTO processed_events (id, sub, at) VALUES (?, ?, ?)")
            .bind(eventId, sub, at),
          ...DELETE_OWNED_ROWS.map((statement) => db.prepare(statement).bind(sub)),
          db.prepare(DELETE_MEMBERSHIPS).bind(sub),
          ...(mailed ? [db.prepare(DELETE_INVITATIONS_TO).bind(mailed.email.toLowerCase())] : []),
          db.prepare("DELETE FROM tokens WHERE sub = ?").bind(sub),
          db.prepare("DELETE FROM cli_codes WHERE sub = ?").bind(sub),
          db.prepare("DELETE FROM users WHERE sub = ?").bind(sub),
        ]);
      } catch (error) {
        // Two deliveries of one event can both find it unhandled; the second batch then fails on
        // the event id's primary key and rolls back whole. Whatever the failure, an event id on
        // record means somebody else's batch did the work: that is a repeat, not an error. The
        // text of the failure is not read, only the table.
        if (await handled(eventId).catch(() => false)) return "duplicate";
        throw error;
      }
      return "applied";
    },
    async deletedSince(sub, since) {
      // By the index on (sub, at): one lookup, however many people were ever deleted.
      const row = await db
        .prepare("SELECT 1 AS deleted FROM processed_events WHERE sub = ? AND at >= ? LIMIT 1")
        .bind(sub, since)
        .first<{ deleted: number }>();
      return row !== null;
    },

    async createToken(token, limit) {
      const created = await runCounting(
        db
          .prepare(INSERT_TOKEN_UNDER_LIMIT)
          .bind(
            token.id,
            token.sub,
            token.name,
            token.hash,
            token.createdAt,
            token.lastUsedAt,
            token.sub,
            capacity(limit),
          ),
      );
      return created > 0 ? "created" : "quota";
    },
    async tokenByHash(hash) {
      const row = await db
        .prepare(`SELECT ${TOKEN_COLUMNS} FROM tokens WHERE hash = ?`)
        .bind(hash)
        .first<TokenRecord>();
      return row ? toToken(row) : undefined;
    },
    async tokensOf(sub) {
      // The newest first; of two created at the same instant, the one stored later.
      const { results } = await db
        .prepare(
          `SELECT ${TOKEN_COLUMNS} FROM tokens WHERE sub = ? ORDER BY created_at DESC, rowid DESC`,
        )
        .bind(sub)
        .all<TokenRecord>();
      return results.map(toToken);
    },
    async deleteToken(sub, id) {
      // The owner is part of the statement: nobody removes another person's token by its id.
      const removed = await runCounting(
        db.prepare("DELETE FROM tokens WHERE id = ? AND sub = ?").bind(id, sub),
      );
      return removed > 0;
    },
    async touchToken(id, at) {
      await run(db.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?").bind(at, id));
    },

    async createCliCode(code) {
      await run(
        db
          .prepare(`INSERT INTO cli_codes (${CODE_COLUMNS}) VALUES (?, ?, ?, ?)`)
          .bind(code.hash, code.sub, code.state, code.expiresAt),
      );
    },
    async takeCliCode(hash) {
      // One statement removes the code and returns it: of two requests that send the same code,
      // one gets the row and the other none.
      const row = await db
        .prepare(`DELETE FROM cli_codes WHERE hash = ? RETURNING ${CODE_COLUMNS}`)
        .bind(hash)
        .first<CodeRecord>();
      return row ? toCode(row) : undefined;
    },
    async recordCliFailure(key, at) {
      // One transaction: the caller's rows older than an hour go as the new one comes, so the
      // table holds an hour of failures per caller and not every failure there ever was.
      await db.batch([
        db
          .prepare("DELETE FROM cli_failures WHERE key = ? AND at < ?")
          .bind(key, cliFailureCutoff(at)),
        db.prepare("INSERT INTO cli_failures (key, at) VALUES (?, ?)").bind(key, at),
      ]);
    },
    async cliFailuresSince(key, since) {
      const row = await db
        .prepare("SELECT COUNT(*) AS failures FROM cli_failures WHERE key = ? AND at >= ?")
        .bind(key, since)
        .first<{ failures: number }>();
      return Number(row?.failures ?? 0);
    },

    async sweep(now) {
      // The four tables in one transaction, each by the index made for it (`cli_codes_expires_at`,
      // `cli_failures_at`, `processed_events_at`, `publish_log_at`): the sweep reads the rows it
      // removes and no others.
      await db.batch([
        db.prepare("DELETE FROM cli_codes WHERE expires_at <= ?").bind(now),
        db.prepare("DELETE FROM cli_failures WHERE at < ?").bind(cliFailureCutoff(now)),
        db.prepare("DELETE FROM processed_events WHERE at < ?").bind(deletionCutoff(now)),
        db.prepare(SWEEP_PUBLISH_LOG).bind(publishCutoff(now)),
      ]);
    },

    async createProject(project, limit) {
      const created = await runCounting(
        db
          .prepare(INSERT_PROJECT_UNDER_LIMIT)
          .bind(
            project.id,
            project.ownerSub,
            project.name,
            project.description,
            project.createdAt,
            project.createdAt,
            project.ownerSub,
            capacity(limit),
          ),
      );
      return created > 0 ? "created" : "quota";
    },
    project: readProject,
    async projectById(id) {
      const row = await db.prepare(SELECT_PROJECT_BY_ID).bind(id).first<ProjectRecord>();
      return row ? toProject(row) : undefined;
    },
    async listProjects(sub) {
      // The most recently updated first; of a tie, the one stored later.
      const { results } = await db.prepare(LIST_PROJECTS).bind(OWNER, sub, sub).all<ListedRecord>();
      return results.map(toListed);
    },
    async countProjects(sub) {
      const row = await db
        .prepare("SELECT COUNT(*) AS projects FROM projects WHERE owner_sub = ?")
        .bind(sub)
        .first<{ projects: number }>();
      return Number(row?.projects ?? 0);
    },
    async projectIdsOf(sub) {
      const { results } = await db
        .prepare("SELECT id FROM projects WHERE owner_sub = ? ORDER BY rowid")
        .bind(sub)
        .all<{ id: string }>();
      return results.map((row) => row.id);
    },
    async ownerOf(projectId) {
      const row = await db
        .prepare("SELECT owner_sub FROM projects WHERE id = ?")
        .bind(projectId)
        .first<{ owner_sub: string }>();
      return row ? row.owner_sub : undefined;
    },
    async updateProject(sub, id, patch, now) {
      // Nothing to change is a read, and writes nothing (not even the time).
      if (patch.name === undefined && patch.description === undefined) {
        return readProject(sub, id);
      }
      const row = await db
        .prepare(UPDATE_PROJECT)
        .bind(patch.name ?? null, patch.description ?? null, now, id, sub)
        .first<ProjectRecord>();
      return row ? toProject(row) : undefined;
    },
    async setLinkAccess(sub, id, linkAccess) {
      const row = await db
        .prepare(SET_LINK_ACCESS)
        .bind(linkAccess, id, sub)
        .first<ProjectRecord>();
      return row ? toProject(row) : undefined;
    },
    async deleteProject(sub, id) {
      // The read and the deletions are one transaction: what the read saw is what was deleted.
      const answers = await db.batch([
        db.prepare(SELECT_OWNED_PROJECT_ID).bind(id, sub),
        ...DELETE_PROJECT_ROWS.map((statement) => db.prepare(statement).bind(id, sub)),
      ]);
      return rowsOf(answers[0]).length > 0;
    },
    async claimThumbnail(projectId, at, notAfter) {
      return (await runCounting(db.prepare(CLAIM_THUMBNAIL).bind(at, projectId, notAfter))) > 0;
    },
    async setThumbnailAt(projectId, at) {
      await run(
        db.prepare("UPDATE projects SET thumbnail_at = ? WHERE id = ?").bind(at, projectId),
      );
    },

    async projectFiles(projectId) {
      const { results } = await db
        .prepare("SELECT path, hash FROM project_files WHERE project_id = ?")
        .bind(projectId)
        .all<{ path: string; hash: string }>();
      return new Map(results.map((row) => [row.path, row.hash]));
    },
    async applyMaterialisation(materialisation) {
      const { projectId, upserts, deletes, blobs, revision, now } = materialisation;
      // Whether the project is still there is read in the same transaction as the writes.
      const statements: D1PreparedLike[] = [db.prepare(PROJECT_EXISTS).bind(projectId)];
      for (const rows of chunked(distinctBlobs(blobs), BLOB_ROWS)) {
        statements.push(
          db
            .prepare(insertBlobs(rows.length))
            .bind(...rows.flatMap((blob) => [blob.hash, blob.size, blob.mediaType, now])),
        );
      }
      for (const paths of chunked([...new Set(deletes)], LIST_ITEMS)) {
        statements.push(db.prepare(deleteFiles(paths.length)).bind(projectId, ...paths));
      }
      for (const rows of chunked([...upserts], FILE_ROWS)) {
        statements.push(
          db
            .prepare(upsertFiles(rows.length))
            .bind(...rows.flatMap(([path, hash]) => [path, hash]), projectId),
        );
      }
      statements.push(db.prepare(UPDATE_REVISION).bind(revision, now, projectId, revision));
      const answers = await db.batch(statements);
      return rowsOf(answers[0]).length > 0;
    },

    blobsPresent,
    async addBlobs(blobs, now) {
      const statements = chunked(distinctBlobs(blobs), BLOB_ROWS).map((rows) =>
        db
          .prepare(insertBlobs(rows.length))
          .bind(...rows.flatMap((blob) => [blob.hash, blob.size, blob.mediaType, now])),
      );
      if (statements.length > 0) await db.batch(statements);
    },
    async blob(hash) {
      const row = await db
        .prepare(`SELECT ${BLOB_COLUMNS} FROM blobs WHERE hash = ?`)
        .bind(hash)
        .first<BlobRecord>();
      return row ? toBlob(row) : undefined;
    },
    async addProjectBlob(projectId, hash) {
      const answers = await db.batch([
        db.prepare(PROJECT_EXISTS).bind(projectId),
        db.prepare(INSERT_PROJECT_BLOB).bind(hash, projectId),
      ]);
      return rowsOf(answers[0]).length > 0;
    },
    async removeProjectBlob(projectId, hash) {
      const removed = await runCounting(
        db
          .prepare("DELETE FROM project_blobs WHERE project_id = ? AND hash = ?")
          .bind(projectId, hash),
      );
      return removed > 0;
    },
    async hasProjectBlob(projectId, hash) {
      const row = await db
        .prepare("SELECT 1 AS found FROM project_blobs WHERE project_id = ? AND hash = ?")
        .bind(projectId, hash)
        .first<{ found: number }>();
      return row !== null;
    },
    async projectBlobs(projectId) {
      const { results } = await db
        .prepare("SELECT hash FROM project_blobs WHERE project_id = ? ORDER BY hash")
        .bind(projectId)
        .all<{ hash: string }>();
      return results.map((row) => row.hash);
    },
    async projectHoldsBlob(projectId, hash) {
      const row = await db
        .prepare(SELECT_PROJECT_HOLDS_BLOB)
        .bind(projectId, hash, projectId, hash)
        .first<{ found: number }>();
      return row !== null;
    },
    async copyProjectBlobs(sub, fromId, toId) {
      return runCounting(db.prepare(COPY_PROJECT_BLOBS).bind(toId, fromId, fromId, toId, sub));
    },

    async createVersion(version, guard) {
      const maxVersions = capacity(guard.maxVersions);
      // No rate: the window holds everything and the allowance is unreachable.
      const since = guard.rate ? guard.rate.since : version.createdAt;
      const allowance = guard.rate ? capacity(guard.rate.max) : Number.MAX_SAFE_INTEGER;
      const answers = await db.batch([
        db
          .prepare(INSERT_VERSION)
          .bind(
            version.label,
            bit(version.auto),
            version.createdBy,
            version.createdAt,
            version.projectId,
            maxVersions,
            since,
            allowance,
          ),
        db.prepare(SELECT_NEW_VERSION).bind(version.projectId, version.projectId),
        db.prepare(COPY_VERSION_FILES).bind(version.projectId, version.projectId),
      ]);
      const row = rowsOf<VersionRecord>(answers[1])[0];
      if (row) return toVersion(row);

      // Refused, and nothing was written. Which condition it was is read after the fact: a
      // change in between can only make this answer one of the others, never write anything.
      const state = await db
        .prepare(SELECT_VERSION_STATE)
        .bind(version.projectId, version.projectId)
        .first<{ found: number; held: number }>();
      if (!state || Number(state.found) === 0) return "missing";
      return Number(state.held) >= maxVersions ? "quota" : "rate";
    },
    async listVersions(projectId) {
      const { results } = await db
        .prepare(`${SELECT_VERSIONS} ORDER BY number`)
        .bind(projectId)
        .all<VersionRecord>();
      return results.map(toVersion);
    },
    async version(projectId, number) {
      const row = await db
        .prepare(`${SELECT_VERSIONS} AND number = ?`)
        .bind(projectId, number)
        .first<VersionRecord>();
      return row ? toVersion(row) : undefined;
    },
    async latestVersion(projectId) {
      const row = await db
        .prepare(`${SELECT_VERSIONS} ORDER BY number DESC LIMIT 1`)
        .bind(projectId)
        .first<VersionRecord>();
      return row ? toVersion(row) : undefined;
    },
    async versionFiles(projectId, number) {
      const { results } = await db
        .prepare(SELECT_VERSION_FILES)
        .bind(projectId, number)
        .all<{ path: string | null; hash: string | null }>();
      // No row: no such version. A row without a path: the version has no files.
      if (results.length === 0) return undefined;
      const files = new Map<string, string>();
      for (const row of results)
        if (row.path !== null && row.hash !== null) files.set(row.path, row.hash);
      return files;
    },
    async versionChanges(projectId) {
      // Both reads in one transaction: the numbers and the changes are of the same moment.
      const [numbers, changes] = await db.batch([
        db.prepare(SELECT_VERSION_NUMBERS).bind(projectId),
        db.prepare(SELECT_VERSION_CHANGES).bind(projectId),
      ]);
      const byVersion = new Map<number, string[]>();
      for (const row of rowsOf<{ number: number }>(numbers)) byVersion.set(Number(row.number), []);
      for (const row of rowsOf<{ number: number; path: string }>(changes)) {
        byVersion.get(Number(row.number))?.push(row.path);
      }
      return byVersion;
    },
    async deleteVersions(projectId, numbers) {
      // Only whole numbers can name a version (and D1 binds no NaN or infinity).
      const unique = [...new Set(numbers)].filter((number) => Number.isSafeInteger(number));
      const lists = chunked(unique, LIST_ITEMS);
      // The files of every chunk, then the versions: one transaction.
      const statements = [
        ...lists.map((list) =>
          db.prepare(deleteVersionFiles(list.length)).bind(projectId, ...list),
        ),
        ...lists.map((list) => db.prepare(deleteVersionRows(list.length)).bind(projectId, ...list)),
      ];
      if (statements.length > 0) await db.batch(statements);
    },
    async countVersions(projectId) {
      const row = await db
        .prepare("SELECT COUNT(*) AS versions FROM versions WHERE project_id = ?")
        .bind(projectId)
        .first<{ versions: number }>();
      return Number(row?.versions ?? 0);
    },
    async countVersionsSince(projectId, since) {
      const row = await db
        .prepare(
          "SELECT COUNT(*) AS versions FROM versions WHERE project_id = ? AND created_at >= ?",
        )
        .bind(projectId, since)
        .first<{ versions: number }>();
      return Number(row?.versions ?? 0);
    },

    async storageBytesOf(sub) {
      const row = await db
        .prepare(`SELECT (${OWNED_BYTES}) AS bytes`)
        .bind(sub, sub, sub)
        .first<{ bytes: number }>();
      return Number(row?.bytes ?? 0);
    },
    async refreshStorageBytes(sub) {
      // One statement computes the total and stores it: the figure written is the figure of that
      // moment, whatever else is being written.
      const row = await db
        .prepare(
          `UPDATE users SET storage_bytes = (${OWNED_BYTES}) WHERE sub = ? RETURNING storage_bytes`,
        )
        .bind(sub, sub, sub, sub)
        .first<{ storage_bytes: number }>();
      return Number(row?.storage_bytes ?? 0);
    },
    async usage(sub) {
      const row = await db
        .prepare(
          "SELECT (SELECT COUNT(*) FROM projects WHERE owner_sub = ?) AS projects, COALESCE((SELECT storage_bytes FROM users WHERE sub = ?), 0) AS storage_bytes",
        )
        .bind(sub, sub)
        .first<{ projects: number; storage_bytes: number }>();
      return {
        projects: Number(row?.projects ?? 0),
        storageBytes: Number(row?.storage_bytes ?? 0),
      };
    },

    async unreferencedBlobs(olderThan, limit) {
      const { results } = await db
        .prepare(SELECT_UNREFERENCED_BLOBS)
        .bind(olderThan, capacity(limit))
        .all<{ hash: string }>();
      return results.map((row) => row.hash);
    },
    async deleteBlobs(hashes, olderThan) {
      const unique = [...new Set(hashes)];
      const statements = chunked(unique, LIST_ITEMS).map((list) =>
        db.prepare(deleteUnreferencedBlobs(list.length)).bind(olderThan, ...list),
      );
      if (statements.length === 0) return [];
      await db.batch(statements);
      // The ones without a row now: removed here, or by somebody else a moment before.
      const left = await blobsPresent(unique);
      return unique.filter((hash) => !left.has(hash));
    },

    async memberRole(projectId, sub) {
      const row = await db
        .prepare(SELECT_MEMBER_ROLE)
        .bind(projectId, sub)
        .first<{ role: string }>();
      return row ? (row.role as MemberRole) : undefined;
    },
    async members(projectId) {
      const { results } = await db.prepare(SELECT_MEMBERS).bind(projectId).all<MemberRecord>();
      return results.map(toMember);
    },
    async setMemberRole(projectId, sub, role) {
      return (await runCounting(db.prepare(SET_MEMBER_ROLE).bind(role, projectId, sub))) > 0;
    },
    async removeMember(projectId, sub) {
      return (await runCounting(db.prepare(DELETE_MEMBER).bind(projectId, sub))) > 0;
    },

    async createInvitation(invitation, limit) {
      const created = await runCounting(
        db
          .prepare(INSERT_INVITATION_UNDER_LIMIT)
          .bind(
            invitation.id,
            invitation.projectId,
            invitation.email,
            invitation.role,
            invitation.token,
            invitation.createdBy,
            invitation.createdAt,
            invitation.projectId,
            invitation.projectId,
            invitation.projectId,
            invitationCutoff(invitation.createdAt),
            capacity(limit),
          ),
      );
      if (created > 0) return "created";
      // Refused, and nothing was written: which condition it was is read after the fact.
      const found = await db.prepare(PROJECT_EXISTS).bind(invitation.projectId).first();
      return found ? "quota" : "missing";
    },
    async pendingInvitations(projectId, now) {
      const { results } = await db
        .prepare(SELECT_PENDING_INVITATIONS)
        .bind(projectId, invitationCutoff(now))
        .all<InvitationRecord>();
      return results.map(toInvitation);
    },
    async setInvitationRole(projectId, id, role) {
      return (await runCounting(db.prepare(SET_INVITATION_ROLE).bind(role, projectId, id))) > 0;
    },
    async deleteInvitation(projectId, id) {
      return (await runCounting(db.prepare(DELETE_INVITATION).bind(projectId, id))) > 0;
    },
    async pendingInvitationByToken(token, now) {
      const row = await db
        .prepare(SELECT_PENDING_BY_TOKEN)
        .bind(token, invitationCutoff(now))
        .first<InvitationRecord>();
      return row ? toInvitation(row) : undefined;
    },
    async acceptInvitation(token, sub, now): Promise<Accepted | undefined> {
      const cutoff = invitationCutoff(now);
      // One transaction: the read, the membership, the mark and the role the person ended up with.
      const answers = await db.batch([
        db.prepare(SELECT_ACCEPTABLE_BY_TOKEN).bind(token, cutoff, sub),
        db.prepare(INSERT_MEMBER_BY_TOKEN).bind(sub, now, token, cutoff, sub, EDITOR, EDITOR),
        db.prepare(MARK_ACCEPTED_BY_TOKEN).bind(now, token, cutoff, sub),
        db.prepare(SELECT_ROLE_AFTER_TOKEN).bind(sub, token),
      ]);
      const invited = rowsOf<{ project_id: string; role: string }>(answers[0])[0];
      if (!invited) return undefined;
      const held = rowsOf<{ project_id: string; role: string }>(answers[3]).find(
        (row) => row.project_id === invited.project_id,
      );
      return { projectId: invited.project_id, role: (held?.role ?? invited.role) as MemberRole };
    },
    async acceptInvitationsFor(sub, email, now): Promise<Accepted[]> {
      const cutoff = invitationCutoff(now);
      // The common case is a session of someone nobody invited: one read by the email's index, and
      // nothing is written.
      const { results: waiting } = await db
        .prepare(SELECT_ACCEPTABLE_BY_EMAIL)
        .bind(email, cutoff, sub)
        .all<{ project_id: string }>();
      if (waiting.length === 0) return [];
      const answers = await db.batch([
        db.prepare(INSERT_MEMBERS_BY_EMAIL).bind(sub, now, email, cutoff, sub, EDITOR, EDITOR),
        db.prepare(MARK_ACCEPTED_BY_EMAIL).bind(now, email, cutoff, sub),
        db.prepare(SELECT_ROLES_AFTER_EMAIL).bind(sub, email, now),
      ]);
      return rowsOf<{ project_id: string; role: string }>(answers[2]).map((row) => ({
        projectId: row.project_id,
        role: row.role as MemberRole,
      }));
    },

    async setHandle(sub, handle) {
      const changed = await runCounting(
        db.prepare(SET_HANDLE).bind(handle, sub, handle, handle, sub),
      );
      if (changed > 0) return "set";
      // Refused, and nothing was written: which condition it was is read after the fact.
      const user = await db.prepare(SELECT_USER).bind(sub).first<UserRecord>();
      if (!user) return "missing";
      const held = await db.prepare(HANDLE_HELD_BY_ANOTHER).bind(handle, sub).first();
      return held ? "taken" : "locked";
    },
    async userByHandle(handle) {
      const row = await db.prepare(SELECT_USER_BY_HANDLE).bind(handle).first<UserRecord>();
      return row ? toUser(row) : undefined;
    },

    async setUnbrandedExports(sub, on, by, at) {
      const changed = await runCounting(db.prepare(SET_UNBRANDED).bind(bit(on), by, at, sub));
      return changed > 0 ? "set" : "missing";
    },
    async entitledUsers() {
      const { results } = await db.prepare(SELECT_ENTITLED).all<UserRecord>();
      return results.map(toUser);
    },

    async publicationsOf(projectId) {
      const { results } = await db
        .prepare(SELECT_PUBLICATIONS_OF)
        .bind(projectId)
        .all<PublicationRecord>();
      return results.map(toPublication);
    },
    async publicationsOwnedBy(sub) {
      const { results } = await db
        .prepare(SELECT_PUBLICATIONS_OWNED)
        .bind(sub)
        .all<PublicationRecord>();
      return results.map(toPublication);
    },
    publication: publicationReader.publication,
    async putPublication(publication, options) {
      const { projectId, handle, slug, publishedAt, bytes } = publication;
      const guarded = options?.ownersHandle === true;
      const written = await runCounting(
        db
          .prepare(PUT_PUBLICATION)
          .bind(
            handle,
            slug,
            publishedAt,
            bytes,
            projectId,
            guarded ? 1 : 0,
            handle,
            handle,
            slug,
            projectId,
          ),
      );
      if (written > 0) return "put";
      // Refused, and nothing was written: the project is gone, its owner does not hold the handle,
      // or another project has the address.
      const found = await db.prepare(PROJECT_EXISTS).bind(projectId).first();
      if (!found) return "missing";
      if (guarded && !(await db.prepare(OWNER_HOLDS_HANDLE).bind(projectId, handle).first())) {
        return "handle";
      }
      return "taken";
    },
    async deletePublication(projectId, slug) {
      const row = await db
        .prepare(DELETE_PUBLICATION)
        .bind(projectId, slug)
        .first<PublicationRecord>();
      return row ? toPublication(row) : undefined;
    },
    async countPublicationsSince(projectId, since) {
      const row = await db
        .prepare(COUNT_PUBLICATIONS_SINCE)
        .bind(projectId, since)
        .first<{ published: number }>();
      return Number(row?.published ?? 0);
    },
    async claimPublish(projectId, at, limit): Promise<PublishClaim> {
      const cutoff = publishCutoff(at);
      const written = await runCounting(
        db.prepare(CLAIM_PUBLISH).bind(at, projectId, projectId, cutoff, capacity(limit)),
      );
      if (written > 0) return { status: "claimed" };
      // Refused, and nothing was written: the project is gone, or the hour is full.
      if (!(await db.prepare(PROJECT_EXISTS).bind(projectId).first())) return { status: "missing" };
      const row = await db
        .prepare(SELECT_EARLIEST_PUBLISH)
        .bind(projectId, cutoff)
        .first<{ earliest: string | null }>();
      const earliest = row?.earliest ?? at;
      return {
        status: "rate",
        freeAt: new Date(Date.parse(earliest) + PUBLISH_WINDOW_MS).toISOString(),
      };
    },

    async takeDown(takedown) {
      // One transaction: the publication read is the one removed, and the record goes in only for it.
      const answers = await db.batch([
        db.prepare(SELECT_PUBLICATION).bind(takedown.handle, takedown.slug),
        db
          .prepare(INSERT_TAKEDOWN)
          .bind(
            takedown.handle,
            takedown.slug,
            takedown.bySub,
            takedown.reason,
            takedown.at,
            takedown.handle,
            takedown.slug,
          ),
        db.prepare(DELETE_PUBLICATION_AT).bind(takedown.handle, takedown.slug),
      ]);
      const row = rowsOf<PublicationRecord>(answers[0])[0];
      return row ? toPublication(row) : undefined;
    },
    async takedownsOf(handle) {
      const { results } = await db.prepare(SELECT_TAKEDOWNS).bind(handle).all<TakedownRecord>();
      return results.map(toTakedown);
    },
  };
}
