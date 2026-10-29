/** Times are ISO-8601 strings in UTC with milliseconds (`Date.prototype.toISOString`). */
export type Iso = string;

/** The most API tokens an account may hold. */
export const MAX_TOKENS = 20;

/** The most members plus pending invitations a project may hold (the owner is not counted). */
export const MAX_MEMBERS = 50;

/** What the service caches of a person from the session token. */
export interface UserProfile {
  readonly sub: string;
  readonly name: string;
  readonly picture: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface User extends UserProfile {
  readonly createdAt: Iso;
  /** The name of the person's publications (`[a-z0-9-]{3,30}`, unique); null until they choose one. */
  readonly handle: string | null;
  /** Whether an administrator entitled the person to export without the Meltemi branding. */
  readonly unbrandedExports: boolean;
  /** The administrator who last set or revoked the entitlement; null until one did. */
  readonly unbrandedExportsBy: string | null;
  /** When the entitlement was last set or revoked; null until then. */
  readonly unbrandedExportsAt: Iso | null;
}

/** What the project's link gives to anyone who holds it: nothing, reading, or reading and writing. */
export type LinkAccess = "private" | "view" | "edit";

/** What a member of a project may do: read it, or read and change it. */
export type MemberRole = "viewer" | "editor";

/** What a person is to a project: its owner, or a member's role, as the store has it. */
export type ProjectRole = "owner" | MemberRole;

/** An API token as stored: only its SHA-256 (hex), never the token. */
export interface TokenRow {
  readonly id: string;
  readonly sub: string;
  readonly name: string;
  readonly hash: string;
  readonly createdAt: Iso;
  readonly lastUsedAt: Iso | null;
}

/** A one-time code the command line exchanges for a token: only its SHA-256 (hex) is stored. */
export interface CliCode {
  readonly hash: string;
  readonly sub: string;
  readonly state: string;
  readonly expiresAt: Iso;
}

/** A project as the list and the owner see it. */
export interface Project {
  readonly id: string;
  readonly ownerSub: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Iso;
  /** The last materialisation, rename or description change. */
  readonly updatedAt: Iso;
  /** The room's revision at the last materialisation; 0 until the first. */
  readonly revision: number;
  /** When the thumbnail was last written; null while there is none. */
  readonly thumbnailAt: Iso | null;
  /** What the project's link gives; `private` for a new project. */
  readonly linkAccess: LinkAccess;
}

/** A project in a person's list: their own (`owner`) or one they are a member of (the member's role). */
export interface ListedProject extends Project {
  readonly role: ProjectRole;
}

/** A project's member, with the profile the service caches of them (the owner alone sees `email`). */
export interface Member {
  readonly sub: string;
  readonly role: MemberRole;
  readonly addedAt: Iso;
  readonly name: string;
  readonly picture: string;
  readonly email: string;
}

/**
 * An invitation to a project, as stored. `email` is lower-case. `token` is the invitation's secret,
 * 32 lowercase hexadecimal characters (128 bits), kept in clear: the owner copies the link again
 * from the list (see `migrations/0003_sharing.sql`). It is pending while `acceptedAt` is null and it
 * is no older than `INVITATION_LIFETIME_MS`.
 */
export interface Invitation {
  readonly id: string;
  readonly projectId: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly token: string;
  readonly createdBy: string;
  readonly createdAt: Iso;
  readonly acceptedAt: Iso | null;
}

/** An invitation to record: pending, so with no `acceptedAt`. */
export type NewInvitation = Omit<Invitation, "acceptedAt">;

/** What accepting an invitation made of the person: the project and the role they hold in it. */
export interface Accepted {
  readonly projectId: string;
  readonly role: MemberRole;
}

/** A project published under its owner's handle: `https://<publish host>/<handle>/<slug>/`. */
export interface Publication {
  readonly projectId: string;
  readonly handle: string;
  readonly slug: string;
  readonly publishedAt: Iso;
  /** The size of the stored HTML. */
  readonly bytes: number;
}

/** A publication an administrator of the service removes, and why: what `takeDown` is given. */
export interface NewTakedown {
  readonly handle: string;
  readonly slug: string;
  /** The sub of the administrator. */
  readonly bySub: string;
  readonly reason: string;
  readonly at: Iso;
}

/**
 * A takedown as the store keeps it: what was given, and the project the publication belonged to
 * (the store reads it from the publication it removes), which is whose notice it is. `null` for a
 * record that predates the column.
 */
export interface Takedown extends NewTakedown {
  readonly projectId: string | null;
}

/**
 * What `claimPublish` answers: the request was recorded (`claimed`), the project does not exist
 * (`missing`), or the project already made as many requests as it may within the hour (`rate`),
 * and `freeAt` is when the earliest of them stops counting, so when to come back.
 */
export type PublishClaim =
  { readonly status: "claimed" | "missing" } | { readonly status: "rate"; readonly freeAt: Iso };

/** What the publish host asks of the store: whether a publication exists at an address, and nothing else. */
export interface PublicationReader {
  /** The publication at an address; undefined when there is none. */
  publication(handle: string, slug: string): Promise<Publication | undefined>;
}

/** A project to create: `id` is 20 characters of `[0-9a-z]`, chosen by the caller. */
export interface NewProject {
  readonly id: string;
  readonly ownerSub: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Iso;
}

/** What a rename or a description change gives; a field left out keeps its value. */
export interface ProjectPatch {
  readonly name?: string;
  readonly description?: string;
}

/** A blob the store has a row for (the bytes are in R2 under `blobs/<hash>`). */
export interface NewBlob {
  /** SHA-256 of the bytes, 64 lowercase hexadecimal characters. */
  readonly hash: string;
  readonly size: number;
  readonly mediaType: string;
}

export interface BlobRow extends NewBlob {
  readonly createdAt: Iso;
}

/** What a materialisation writes in one atomic step; see `applyMaterialisation`. */
export interface Materialisation {
  readonly projectId: string;
  /** The paths whose hash is new or changed, with the new hash. */
  readonly upserts: ReadonlyMap<string, string>;
  /** The paths that are gone. A path in both `deletes` and `upserts` ends up upserted. */
  readonly deletes: readonly string[];
  /** The blobs the upserts introduce that no row exists for yet. */
  readonly blobs: readonly NewBlob[];
  readonly revision: number;
  readonly now: Iso;
}

/** A version of a project; `number` counts from 1 and names it in the API. */
export interface Version {
  readonly projectId: string;
  readonly number: number;
  readonly label: string | null;
  readonly auto: boolean;
  /** The sub of the person who made it. */
  readonly createdBy: string;
  readonly createdAt: Iso;
}

export interface NewVersion {
  readonly projectId: string;
  readonly label: string | null;
  readonly auto: boolean;
  readonly createdBy: string;
  readonly createdAt: Iso;
}

/** The conditions under which `createVersion` records a version, checked in the same statement. */
export interface VersionGuard {
  /** Refuse (`"quota"`) while the project already holds this many versions. */
  readonly maxVersions: number;
  /** Refuse (`"rate"`) while `max` versions were made at or after `since`; none when left out. */
  readonly rate?: { readonly max: number; readonly since: Iso };
}

/** What `GET /api/account/usage` answers. */
export interface Usage {
  readonly projects: number;
  /** `users.storage_bytes`: as of the last `refreshStorageBytes`. */
  readonly storageBytes: number;
}

/**
 * Everything the service keeps: users, API tokens, handled deletion events, the codes of the
 * command line's approval and the failures that rate-limit their exchange (change cloud-accounts),
 * projects, their files, blobs, versions and usage (change cloud-projects), and the link level,
 * members, invitations, handles, publications and takedowns of change sharing-and-permissions.
 *
 * Two implementations pass one conformance suite: `memoryStore()` for the tests of the handlers
 * and `d1Store()` for the Worker.
 *
 * Ownership. The methods that take a `sub` and a project id (`project`, `updateProject`,
 * `setLinkAccess`, `deleteProject`, `copyProjectBlobs`) answer nothing, or false, for a project of
 * someone else: the owner is part of the statement. `projectById` is the one read with no owner,
 * for the resolution of what a person may do (`src/access.ts`), which is the only place that
 * decides who may open a project. The ones keyed by a project id alone (the files, the blobs, the
 * versions, the members, the invitations, the publications) are for the room and the materialiser,
 * which have no person, and for a route that has just resolved the person's access to the project;
 * they trust their caller. Every row they insert for a project goes in only while the project
 * exists, so a project deleted a moment before leaves no orphan.
 *
 * Every write that has more than one statement is one atomic batch, and a statement binds at most
 * 100 parameters (D1's limit) whatever the size of the lists it is given.
 */
export interface CloudStore {
  user(sub: string): Promise<User | undefined>;
  /** Creates the user, or refreshes the cached profile when it differs; returns the row. */
  upsertUser(profile: UserProfile, now: Iso): Promise<User>;

  /**
   * Handles a `user.deleted` event once: removes everything held for `sub` (the user, its
   * tokens and approval codes, its projects with their files, `project_blobs` rows, versions,
   * members, invitations, publications and publish requests, its memberships in the projects of others, and the
   * invitations that address its verified email) and records `eventId`, `sub` and `at` in the same
   * atomic step. The invitations the person created are on projects they own, and go with them
   * (only an owner invites). A repeat of the same event id changes nothing and answers
   * `"duplicate"`. The `blobs` rows are content-addressed and shared, so they stay for the weekly
   * collection; the `takedowns` stay, they are the service's record. The caller reads
   * `projectIdsOf(sub)` and `publicationsOwnedBy(sub)` first, to destroy the rooms, the thumbnails
   * and the published pages.
   */
  applyUserDeleted(eventId: string, sub: string, at: Iso): Promise<"applied" | "duplicate">;
  /**
   * Whether a deletion of `sub` was handled whose time is at or after `since`. The verifier trusts
   * a live session for an hour, so a session issued before the deletion (`since` is the moment it
   * was issued) must not bring the person back: it would create their row again. A session issued
   * after the deletion, by a person who signed in again, is not affected.
   */
  deletedSince(sub: string, since: Iso): Promise<boolean>;

  /** Adds a token unless the person already holds `limit` of them, in one atomic step. */
  createToken(token: TokenRow, limit: number): Promise<"created" | "quota">;
  tokenByHash(hash: string): Promise<TokenRow | undefined>;
  /** The tokens of a person, the newest first. */
  tokensOf(sub: string): Promise<TokenRow[]>;
  /** Removes a token of that person; false when they hold no such token. */
  deleteToken(sub: string, id: string): Promise<boolean>;
  touchToken(id: string, at: Iso): Promise<void>;

  createCliCode(code: CliCode): Promise<void>;
  /** Removes the code and returns it, expired or not; undefined when there is none. */
  takeCliCode(hash: string): Promise<CliCode | undefined>;
  /** Records a failed exchange by a caller (a keyed hash of its IP). */
  recordCliFailure(key: string, at: Iso): Promise<void>;
  /** How many failures that caller made at or after `since`. */
  cliFailuresSince(key: string, since: Iso): Promise<number>;

  /**
   * Removes what nothing else would, whoever it belongs to: the approval codes that expired at or
   * before `now`, the failed exchanges more than an hour older than `now` (one exactly an hour
   * old stays), the handled deletion events more than 31 days older (one exactly that old
   * stays) and the publish requests more than an hour older (one exactly an hour old stays). A
   * code is taken by its exchange and a caller's failures are pruned when that caller fails
   * again, so a code nobody exchanges, or a caller who never returns, would stay for ever.
   * The routes that add such rows call this first, so that a flood of them leaves the tables the
   * size of the last few minutes and the last hour.
   */
  sweep(now: Iso): Promise<void>;

  // ---- Projects ----------------------------------------------------------------------------

  /**
   * Adds the project unless the person already holds `limit` of them, in one atomic step (the
   * count and the insert are one statement, so racing creates cannot pass the quota). A second
   * project with the same id is refused with an error and the first stays; a person at the limit
   * gets `"quota"` first.
   */
  createProject(project: NewProject, limit: number): Promise<"created" | "quota">;
  /** The person's own project; undefined for one that does not exist or is someone else's. */
  project(sub: string, id: string): Promise<Project | undefined>;
  /**
   * The project, whoever owns it; undefined for one that does not exist. Only the resolution of
   * access (`src/access.ts`) reads a project this way: what a person may do with it is decided
   * there, from this row and `memberRole`.
   */
  projectById(id: string): Promise<Project | undefined>;
  /**
   * The projects the person owns (`role: "owner"`) and the ones they are a member of (the role they
   * were given, which a link may raise: the route says), the most recently updated first (of a tie,
   * the one created later).
   */
  listProjects(sub: string): Promise<ListedProject[]>;
  countProjects(sub: string): Promise<number>;
  /** The ids of the person's projects, oldest first: the rooms to destroy when they are deleted. */
  projectIdsOf(sub: string): Promise<string[]>;
  /** The sub of the project's owner; undefined for no such project. For the room, which has no person. */
  ownerOf(projectId: string): Promise<string | undefined>;
  /**
   * Renames and describes the person's project and sets `updated_at` to `now`; answers the project
   * as it is now, or undefined when it does not exist or is someone else's. An empty patch writes
   * nothing and answers the project as it is.
   */
  updateProject(
    sub: string,
    id: string,
    patch: ProjectPatch,
    now: Iso,
  ): Promise<Project | undefined>;
  /**
   * Sets what the project's link gives (`private`, `view` or `edit`) and answers the project as it
   * is now; undefined when it does not exist or is someone else's. The time of the project's last
   * change is not touched: who may open a project is not a change of its content.
   */
  setLinkAccess(sub: string, id: string, linkAccess: LinkAccess): Promise<Project | undefined>;
  /**
   * Deletes the person's project with its files, `project_blobs` rows, versions and their files,
   * members, invitations, publications and publish requests, in one atomic step; false when there is no such project
   * of theirs, and then nothing changes. The blobs stay for the weekly collection; the room, the
   * thumbnail and the published pages are the caller's (`publicationsOf` before).
   */
  deleteProject(sub: string, id: string): Promise<boolean>;
  /**
   * Records that a thumbnail is being written at `at`, unless one was recorded after `notAfter`
   * (a thumbnail exactly `notAfter` old may be replaced): the rate limit as one statement. False
   * for a project that does not exist or whose thumbnail is too recent.
   */
  claimThumbnail(projectId: string, at: Iso, notAfter: Iso): Promise<boolean>;
  /** Sets `thumbnail_at` as it is, null included: what a failed thumbnail write puts back. */
  setThumbnailAt(projectId: string, at: Iso | null): Promise<void>;

  // ---- Files and materialisation -----------------------------------------------------------

  /** The files of the project as of the last materialisation: path to hash. Empty when none. */
  projectFiles(projectId: string): Promise<Map<string, string>>;
  /**
   * Writes a materialisation as ONE batch: the new blob rows (existing ones keep their size and
   * type and are only refreshed in `created_at`, never made older), the deleted paths, the
   * upserted paths (a row whose hash did not change is not rewritten) and the project's
   * `revision` and `updated_at`. Only the rows it is given are written; every statement binds at
   * most 100 parameters, so any number of paths is chunked inside the one batch. Answers false
   * when the project no longer exists: nothing is written for it, only the blob rows, which wait
   * for the collection.
   */
  applyMaterialisation(materialisation: Materialisation): Promise<boolean>;

  // ---- Blobs -------------------------------------------------------------------------------

  /** Which of the hashes have a blob row (any number of them, chunked). */
  blobsPresent(hashes: readonly string[]): Promise<Set<string>>;
  /**
   * Adds blob rows, ignoring the ones that exist (the first size and media type stand); a row
   * that exists is made as new as `now`, so that the collection, which judges by age, cannot take
   * a blob that was just registered again. A hash repeated in the list counts once.
   */
  addBlobs(blobs: readonly NewBlob[], now: Iso): Promise<void>;
  blob(hash: string): Promise<BlobRow | undefined>;
  /** Records that the project holds the hash (once; a repeat changes nothing). False for no such project. */
  addProjectBlob(projectId: string, hash: string): Promise<boolean>;
  removeProjectBlob(projectId: string, hash: string): Promise<boolean>;
  /** Whether `project_blobs` holds the hash for that project: the room's `blob.unknown` check. */
  hasProjectBlob(projectId: string, hash: string): Promise<boolean>;
  /** The hashes in `project_blobs` for the project, in order. */
  projectBlobs(projectId: string): Promise<string[]>;
  /**
   * Whether `project_blobs` or a version of the project holds the hash: what `GET` and `HEAD`
   * `…/blobs/<hash>` consult (never the live map).
   */
  projectHoldsBlob(projectId: string, hash: string): Promise<boolean>;
  /**
   * Gives the project `toId` the `project_blobs` rows of `fromId` (duplicate), only when the
   * person owns `toId` and `fromId` exists; answers how many rows were added (those already there
   * are not). `fromId` is any project: the person need not own it, the route having resolved their
   * `read` access to it (a viewer duplicates a project into their own account).
   */
  copyProjectBlobs(sub: string, fromId: string, toId: string): Promise<number>;

  // ---- Versions ----------------------------------------------------------------------------

  /**
   * Records a version of the project under the next number, copying the project's current
   * `project_files` into `version_files`, in one atomic step; the conditions of `guard` are part
   * of the statement. When refused nothing is written: `"missing"` for no such project, then
   * `"quota"` when it holds `guard.maxVersions` versions, else `"rate"`.
   */
  createVersion(
    version: NewVersion,
    guard: VersionGuard,
  ): Promise<Version | "quota" | "rate" | "missing">;
  /** The project's versions, the oldest first. */
  listVersions(projectId: string): Promise<Version[]>;
  version(projectId: string, number: number): Promise<Version | undefined>;
  /** The version with the highest number. */
  latestVersion(projectId: string): Promise<Version | undefined>;
  /** The files of one version, path to hash; undefined for no such version, empty for a version without files. */
  versionFiles(projectId: string, number: number): Promise<Map<string, string> | undefined>;
  /**
   * For each version, number to the paths whose hash differs from the previous version (the one
   * before it that still exists): added, changed and removed. The first lists all its paths. Paths
   * are in binary order. The database does the comparison, so the Worker reads only what changed.
   */
  versionChanges(projectId: string): Promise<Map<number, string[]>>;
  /** Removes the versions with those numbers and their files in one atomic step; unknown numbers are ignored. */
  deleteVersions(projectId: string, numbers: readonly number[]): Promise<void>;
  countVersions(projectId: string): Promise<number>;
  /** How many versions of the project were made at or after `since`. */
  countVersionsSince(projectId: string, since: Iso): Promise<number>;

  // ---- Usage -------------------------------------------------------------------------------

  /**
   * The sum of `blobs.size` over the distinct hashes the person's `project_files`,
   * `project_blobs` and `version_files` reference: a blob shared by two projects or by a project
   * and its versions counts once. Read fresh, for the quota check before a write.
   */
  storageBytesOf(sub: string): Promise<number>;
  /** Computes `storageBytesOf` and stores it in `users.storage_bytes` in one statement; answers it (0 for no such user, nothing stored). */
  refreshStorageBytes(sub: string): Promise<number>;
  /** The number of projects and the stored bytes; zeros for a person who is not there. */
  usage(sub: string): Promise<Usage>;

  // ---- Collection of blobs -----------------------------------------------------------------

  /**
   * Up to `limit` hashes of blobs created before `olderThan` that no `project_files`,
   * `project_blobs` or `version_files` row references, oldest first. This reads the three
   * reference tables whole, once: it is the weekly collection, not a request.
   */
  unreferencedBlobs(olderThan: Iso, limit: number): Promise<string[]>;
  /**
   * Removes the blob rows of those hashes in one atomic step, but only the ones that are still
   * unreferenced and still created before `olderThan`: a blob registered or referenced since the
   * list was made stays. Answers the hashes that no longer have a row, which are the ones whose
   * bytes the caller deletes from R2 (the row first, the bytes second, so a failure in between
   * leaves an unreferenced object and never a row without bytes).
   */
  deleteBlobs(hashes: readonly string[], olderThan: Iso): Promise<string[]>;

  // ---- Members -----------------------------------------------------------------------------

  /** The role the person was given in the project; undefined for one who is not a member (the owner is not). */
  memberRole(projectId: string, sub: string): Promise<MemberRole | undefined>;
  /** The project's members, the earliest added first (of a tie, by sub), with their cached profile. */
  members(projectId: string): Promise<Member[]>;
  /** Changes a member's role; false for a person who is not a member, and then nothing changes. */
  setMemberRole(projectId: string, sub: string, role: MemberRole): Promise<boolean>;
  /** Removes a member; false for a person who is not one. */
  removeMember(projectId: string, sub: string): Promise<boolean>;

  // ---- Invitations -------------------------------------------------------------------------

  /**
   * Records a pending invitation unless the project already holds `limit` members plus pending
   * invitations, as one statement: racing invitations cannot pass the limit. Pending means not
   * accepted and not expired (`INVITATION_LIFETIME_MS` before the invitation's own `createdAt`, the
   * moment that counts). `"missing"` for a project that does not exist, then `"quota"`; nothing is
   * written when refused. The email is lower-case and the token 32 lowercase hexadecimal
   * characters: the database refuses anything else.
   */
  createInvitation(
    invitation: NewInvitation,
    limit: number,
  ): Promise<"created" | "quota" | "missing">;
  /** The project's pending invitations as of `now`, the earliest first. Expired and accepted ones are not listed. */
  pendingInvitations(projectId: string, now: Iso): Promise<Invitation[]>;
  /** Changes the role of a pending invitation of that project; false when there is none. */
  setInvitationRole(projectId: string, id: string, role: MemberRole): Promise<boolean>;
  /** Removes an invitation of that project that was not accepted (revoking it); false when there is none. */
  deleteInvitation(projectId: string, id: string): Promise<boolean>;
  /** The pending invitation with that token as of `now`; undefined for an unknown, accepted or expired one. */
  pendingInvitationByToken(token: string, now: Iso): Promise<Invitation | undefined>;
  /**
   * Makes the person a member with the role of the pending invitation that holds `token`, and marks
   * the invitation accepted, in one atomic step: of two people who present the same token at once,
   * one gets it. A person who is already a member keeps the higher of the two roles (an invitation
   * raises, never lowers; the owner changes a role with `setMemberRole`). The project's owner is
   * never made a member and the invitation stays pending for them. Undefined for an unknown,
   * accepted or expired token.
   */
  acceptInvitation(token: string, sub: string, now: Iso): Promise<Accepted | undefined>;
  /**
   * Does `acceptInvitation` for every pending invitation addressed to `email` (lower-case), in one
   * atomic step; answers the projects and the roles that came of it, which is nothing for an email
   * nobody invited and then writes nothing. The caller has to know the email is verified.
   */
  acceptInvitationsFor(sub: string, email: string, now: Iso): Promise<Accepted[]>;

  // ---- Handles -----------------------------------------------------------------------------

  /**
   * Gives the person a handle (`[a-z0-9-]{3,30}`, the database refuses another shape), in one
   * statement: `"taken"` while another person holds it, `"locked"` when the person already has a
   * different handle and a publication, which is addressed by it, exists, `"missing"` for a person
   * with no row. Their own handle again is `"set"` and changes nothing.
   */
  setHandle(sub: string, handle: string): Promise<"set" | "taken" | "locked" | "missing">;
  /** The person who holds a handle, or undefined when nobody does. */
  userByHandle(handle: string): Promise<User | undefined>;

  // ---- Entitlements --------------------------------------------------------------------------

  /**
   * Entitles the person to export without the Meltemi branding, or revokes it, recording the
   * administrator and the time, in one statement: `"missing"` for a person with no row, who is
   * then not written.
   */
  setUnbrandedExports(sub: string, on: boolean, by: string, at: Iso): Promise<"set" | "missing">;
  /** The people entitled to export without the branding, the earliest grant first. */
  entitledUsers(): Promise<User[]>;

  // ---- Publications ------------------------------------------------------------------------

  /** The project's publications, the earliest published first. */
  publicationsOf(projectId: string): Promise<Publication[]>;
  /** The publications of every project the person owns: what to delete from R2 when they are deleted. */
  publicationsOwnedBy(sub: string): Promise<Publication[]>;
  /** The publication at an address; what the publish host serves. */
  publication(handle: string, slug: string): Promise<Publication | undefined>;
  /**
   * Records the publication of a project under a slug, replacing the project's publication under
   * that slug (a project may hold several, one per slug). `"taken"` while another project holds the
   * address (`handle`, `slug`), `"missing"` for a project that does not exist; nothing is written
   * then. One statement. With `ownersHandle` the row goes in only while the project's owner holds the
   * publication's handle, in the same statement (`"handle"` otherwise): a request that read the
   * handle, was slow, and met a change of it in the meantime would otherwise publish at an address
   * its owner no longer has, which `setHandle`'s lock on a handle in use is there to prevent.
   */
  putPublication(
    publication: Publication,
    options?: { readonly ownersHandle?: boolean },
  ): Promise<"put" | "taken" | "missing" | "handle">;
  /** Removes the project's publication under that slug and answers it; undefined when there is none. */
  deletePublication(projectId: string, slug: string): Promise<Publication | undefined>;
  /** How many of the project's publications were published at or after `since`. */
  countPublicationsSince(projectId: string, since: Iso): Promise<number>;
  /**
   * Records a publish request of the project at `at`, unless it already made `limit` of them within
   * the last hour (at or after `publishCutoff(at)`), as ONE statement: racing requests cannot pass
   * the limit. This is the rate of `publish.rate`: it counts requests, not publications, because
   * publishing a slug again replaces its row and moves its time (`countPublicationsSince` cannot see
   * the repeats). Nothing is recorded for a project that does not exist (`missing`) nor when the
   * limit is reached (`rate`, with when the earliest request of the hour stops counting). The
   * sweep removes what is more than an hour old, and a project's rows go with it.
   */
  claimPublish(projectId: string, at: Iso, limit: number): Promise<PublishClaim>;

  // ---- Takedowns ---------------------------------------------------------------------------

  /**
   * Removes the publication at the address and records the takedown with the project it belonged
   * to, in one atomic step; answers the publication removed (whose object the caller deletes), or
   * undefined when there is none and then records nothing.
   */
  takeDown(takedown: NewTakedown): Promise<Publication | undefined>;
  /** The takedowns of a handle, the latest first. */
  takedownsOf(handle: string): Promise<Takedown[]>;
}
