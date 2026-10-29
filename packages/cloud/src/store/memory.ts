import {
  PUBLISH_WINDOW_MS,
  adminLogCutoff,
  cliFailureCutoff,
  deletionCutoff,
  invitationCutoff,
  publishCutoff,
} from "./retention.js";
import { capacity, compareBinary } from "./shared.js";
import type {
  Accepted,
  AdminInvitation,
  AdminLogEntry,
  Administrator,
  BlobRow,
  CliCode,
  CloudStore,
  Invitation,
  Iso,
  MemberRole,
  Project,
  Publication,
  PublishClaim,
  Takedown,
  TokenRow,
  User,
  Version,
} from "./types.js";

/** A version with the files it was made with. */
interface VersionEntry {
  version: Version;
  files: Map<string, string>;
}

/** A membership as stored: the role and when it was given. */
interface MemberEntry {
  role: MemberRole;
  addedAt: Iso;
}

/** The role that wins when a person already a member is invited again. */
const EDITOR: MemberRole = "editor";

/** An in-memory store for the tests of the handlers; it passes the same suite as `d1Store`. */
export function memoryStore(): CloudStore {
  const users = new Map<string, User>();
  const tokens = new Map<string, TokenRow>();
  const codes = new Map<string, CliCode>();
  const events = new Map<string, { sub: string; at: Iso }>();
  const failures: { key: string; at: Iso }[] = [];

  // Projects. `seq` stands for the rowid that `d1Store` breaks ties with: the project stored
  // later has the greater one.
  const projects = new Map<string, { project: Project; seq: number }>();
  let seq = 0;
  // Sharing: a project's members by sub, the invitations in the order they were stored (`seq`
  // breaks the ties of their time), publications by project, and the takedowns in order.
  const members = new Map<string, Map<string, MemberEntry>>();
  const invitations: { invitation: Invitation; seq: number }[] = [];
  let invitationSeq = 0;
  const publications: Publication[] = [];
  const takedowns: Takedown[] = [];
  // The publish requests that rate publishing, as `publish_log` holds them: a project and a time.
  const publishLog: { projectId: string; at: Iso }[] = [];
  const files = new Map<string, Map<string, string>>();
  const projectBlobs = new Map<string, Set<string>>();
  const blobs = new Map<string, BlobRow>();
  // The versions of a project, in ascending order of number.
  const versions = new Map<string, VersionEntry[]>();
  // `users.storage_bytes`; a person with no entry has 0.
  const storage = new Map<string, number>();
  // Administration: the administrators by sub, the invitations and the log in the order they were
  // stored (`seq` stands for the rowid that breaks the ties of their time in `d1Store`).
  const administrators = new Map<string, Administrator>();
  const adminInvitations: { invitation: AdminInvitation; seq: number }[] = [];
  const adminLog: { entry: AdminLogEntry; seq: number }[] = [];
  let adminSeq = 0;
  const logAdmin = (entry: AdminLogEntry) =>
    adminLog.push({ entry: { ...entry }, seq: adminSeq++ });
  /** An invitation still open at `now`. */
  const open = (invitation: AdminInvitation, now: Iso): boolean =>
    invitation.acceptedAt === null &&
    invitation.declinedAt === null &&
    invitation.revokedAt === null &&
    invitation.expiresAt > now;
  const findOpen = (id: string, now: Iso) =>
    adminInvitations.find((entry) => entry.invitation.id === id && open(entry.invitation, now));

  const ownedBy = (sub: string) =>
    [...projects.values()].filter((entry) => entry.project.ownerSub === sub);

  /** Removes from the list, in place, what `gone` names. */
  const dropWhere = <T>(list: T[], gone: (item: T) => boolean): void => {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (item !== undefined && gone(item)) list.splice(i, 1);
    }
  };

  const removeProject = (id: string) => {
    projects.delete(id);
    files.delete(id);
    projectBlobs.delete(id);
    versions.delete(id);
    members.delete(id);
    dropWhere(invitations, (entry) => entry.invitation.projectId === id);
    dropWhere(publications, (publication) => publication.projectId === id);
    dropWhere(publishLog, (entry) => entry.projectId === id);
  };

  /** Pending: not accepted, and made after the cutoff (the invitation's thirty days are not over). */
  const pending = (invitation: Invitation, cutoff: Iso): boolean =>
    invitation.acceptedAt === null && invitation.createdAt > cutoff;

  /**
   * Makes the person a member with the invitation's role; one who already is keeps the higher of
   * the two and the time they were added. Answers the role they hold.
   */
  const admit = (projectId: string, sub: string, role: MemberRole, now: Iso): MemberRole => {
    const held = members.get(projectId) ?? new Map<string, MemberEntry>();
    const current = held.get(sub);
    const kept: MemberRole = current === undefined ? role : role === EDITOR ? EDITOR : current.role;
    held.set(sub, { role: kept, addedAt: current?.addedAt ?? now });
    members.set(projectId, held);
    return kept;
  };

  /** Registers a blob; one that exists keeps its size and type and is only made as new as `now`. */
  const putBlob = (blob: { hash: string; size: number; mediaType: string }, now: Iso) => {
    const existing = blobs.get(blob.hash);
    if (!existing) {
      blobs.set(blob.hash, {
        hash: blob.hash,
        size: blob.size,
        mediaType: blob.mediaType,
        createdAt: now,
      });
    } else if (now > existing.createdAt) {
      blobs.set(blob.hash, { ...existing, createdAt: now });
    }
  };

  /** Every hash some project, `project_blobs` row or version references. */
  const referenced = (): Set<string> => {
    const hashes = new Set<string>();
    for (const map of files.values()) for (const hash of map.values()) hashes.add(hash);
    for (const set of projectBlobs.values()) for (const hash of set) hashes.add(hash);
    for (const list of versions.values())
      for (const entry of list) for (const hash of entry.files.values()) hashes.add(hash);
    return hashes;
  };

  const bytesOf = (sub: string): number => {
    const hashes = new Set<string>();
    for (const { project } of ownedBy(sub)) {
      for (const hash of files.get(project.id)?.values() ?? []) hashes.add(hash);
      for (const hash of projectBlobs.get(project.id) ?? []) hashes.add(hash);
      for (const entry of versions.get(project.id) ?? [])
        for (const hash of entry.files.values()) hashes.add(hash);
    }
    let total = 0;
    for (const hash of hashes) total += blobs.get(hash)?.size ?? 0;
    return total;
  };

  const versionsOf = (projectId: string): VersionEntry[] => versions.get(projectId) ?? [];
  const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  return {
    async user(sub) {
      const user = users.get(sub);
      return user && { ...user };
    },
    async upsertUser(profile, now) {
      const existing = users.get(profile.sub);
      if (!existing) {
        const created: User = {
          ...profile,
          createdAt: now,
          handle: null,
          unbrandedExports: false,
          unbrandedExportsBy: null,
          unbrandedExportsAt: null,
        };
        users.set(profile.sub, created);
        return { ...created };
      }
      const differs =
        existing.name !== profile.name ||
        existing.picture !== profile.picture ||
        existing.email !== profile.email ||
        existing.emailVerified !== profile.emailVerified;
      if (!differs) return { ...existing };
      const refreshed: User = {
        ...profile,
        createdAt: existing.createdAt,
        handle: existing.handle,
        unbrandedExports: existing.unbrandedExports,
        unbrandedExportsBy: existing.unbrandedExportsBy,
        unbrandedExportsAt: existing.unbrandedExportsAt,
      };
      users.set(profile.sub, refreshed);
      return { ...refreshed };
    },

    async applyUserDeleted(eventId, sub, at) {
      if (events.has(eventId)) return "duplicate";
      events.set(eventId, { sub, at });
      const person = users.get(sub);
      for (const { project } of ownedBy(sub)) removeProject(project.id);
      // Their memberships in the projects of others, and the invitations that address their
      // verified email (their own invitations were on their projects, gone with them).
      for (const [projectId, held] of members) {
        held.delete(sub);
        if (held.size === 0) members.delete(projectId);
      }
      if (person?.emailVerified) {
        const address = person.email.toLowerCase();
        dropWhere(invitations, (entry) => entry.invitation.email === address);
      }
      storage.delete(sub);
      users.delete(sub);
      for (const [id, token] of tokens) if (token.sub === sub) tokens.delete(id);
      for (const [hash, code] of codes) if (code.sub === sub) codes.delete(hash);
      administrators.delete(sub);
      dropWhere(
        adminInvitations,
        ({ invitation }) =>
          invitation.invitedBy === sub &&
          invitation.acceptedAt === null &&
          invitation.declinedAt === null &&
          invitation.revokedAt === null,
      );
      return "applied";
    },
    async deletedSince(sub, since) {
      for (const event of events.values()) if (event.sub === sub && event.at >= since) return true;
      return false;
    },

    async createToken(token, limit) {
      const held = [...tokens.values()].filter((t) => t.sub === token.sub).length;
      // Written so that a limit that is not a number refuses, as `d1Store` does.
      if (!(held < limit)) return "quota";
      // The id and the hash are unique, as the table's keys make them: a second token with
      // either is refused and the first stays.
      if (tokens.has(token.id)) throw new Error(`token ${token.id} exists`);
      for (const other of tokens.values())
        if (other.hash === token.hash) throw new Error("token hash exists");
      tokens.set(token.id, { ...token });
      return "created";
    },
    async tokenByHash(hash) {
      const found = [...tokens.values()].find((t) => t.hash === hash);
      return found && { ...found };
    },
    async tokensOf(sub) {
      // Reversed first, so that of two tokens created at the same instant the one stored later
      // leads (the sort is stable), as `d1Store` orders by `rowid` descending.
      return [...tokens.values()]
        .reverse()
        .filter((t) => t.sub === sub)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .map((t) => ({ ...t }));
    },
    async deleteToken(sub, id) {
      const token = tokens.get(id);
      if (!token || token.sub !== sub) return false;
      tokens.delete(id);
      return true;
    },
    async touchToken(id, at) {
      const token = tokens.get(id);
      if (token) tokens.set(id, { ...token, lastUsedAt: at });
    },

    async createCliCode(code) {
      if (codes.has(code.hash)) throw new Error("code exists");
      codes.set(code.hash, { ...code });
    },
    async takeCliCode(hash) {
      const code = codes.get(hash);
      codes.delete(hash);
      return code && { ...code };
    },
    async recordCliFailure(key, at) {
      // The caller's failures older than an hour go as the new one comes, as in `d1Store`.
      const cutoff = cliFailureCutoff(at);
      for (let i = failures.length - 1; i >= 0; i--) {
        const failure = failures[i];
        if (failure && failure.key === key && failure.at < cutoff) failures.splice(i, 1);
      }
      failures.push({ key, at });
    },
    async cliFailuresSince(key, since) {
      return failures.filter((f) => f.key === key && f.at >= since).length;
    },

    async sweep(now) {
      // First, so that a time that is not one removes nothing, as in `d1Store`.
      const cutoff = cliFailureCutoff(now);
      const eventsCutoff = deletionCutoff(now);
      const publishesCutoff = publishCutoff(now);
      const logCutoff = adminLogCutoff(now);
      dropWhere(publishLog, (entry) => entry.at < publishesCutoff);
      dropWhere(adminLog, ({ entry }) => entry.at < logCutoff);
      for (const [hash, code] of codes) if (code.expiresAt <= now) codes.delete(hash);
      for (const [id, event] of events) if (event.at < eventsCutoff) events.delete(id);
      for (let i = failures.length - 1; i >= 0; i--) {
        const failure = failures[i];
        if (failure && failure.at < cutoff) failures.splice(i, 1);
      }
    },

    async createProject(project, limit) {
      const held = ownedBy(project.ownerSub).length;
      // The quota first, as the one conditional INSERT of `d1Store` answers it.
      if (!(held < limit)) return "quota";
      if (projects.has(project.id)) throw new Error(`project ${project.id} exists`);
      projects.set(project.id, {
        project: {
          id: project.id,
          ownerSub: project.ownerSub,
          name: project.name,
          description: project.description,
          createdAt: project.createdAt,
          updatedAt: project.createdAt,
          revision: 0,
          thumbnailAt: null,
          linkAccess: "private",
        },
        seq: ++seq,
      });
      return "created";
    },
    async project(sub, id) {
      const entry = projects.get(id);
      return entry && entry.project.ownerSub === sub ? { ...entry.project } : undefined;
    },
    async projectById(id) {
      const entry = projects.get(id);
      return entry && { ...entry.project };
    },
    async listProjects(sub) {
      const owned = ownedBy(sub).map((entry) => ({ entry, role: "owner" as const }));
      const shared = [...members].flatMap(([projectId, held]) => {
        const entry = projects.get(projectId);
        const member = held.get(sub);
        return entry && member ? [{ entry, role: member.role }] : [];
      });
      // The later stored first, then a stable sort by time: ties keep that order, as `rowid DESC`.
      return [...owned, ...shared]
        .sort((a, b) => b.entry.seq - a.entry.seq)
        .sort((a, b) =>
          a.entry.project.updatedAt < b.entry.project.updatedAt
            ? 1
            : a.entry.project.updatedAt > b.entry.project.updatedAt
              ? -1
              : 0,
        )
        .map(({ entry, role }) => ({ ...entry.project, role }));
    },
    async countProjects(sub) {
      return ownedBy(sub).length;
    },
    async projectIdsOf(sub) {
      return ownedBy(sub)
        .sort((a, b) => a.seq - b.seq)
        .map(({ project }) => project.id);
    },
    async ownerOf(projectId) {
      return projects.get(projectId)?.project.ownerSub;
    },
    async updateProject(sub, id, patch, now) {
      const entry = projects.get(id);
      if (!entry || entry.project.ownerSub !== sub) return undefined;
      if (patch.name !== undefined || patch.description !== undefined) {
        entry.project = {
          ...entry.project,
          name: patch.name ?? entry.project.name,
          description: patch.description ?? entry.project.description,
          updatedAt: now,
        };
      }
      return { ...entry.project };
    },
    async setLinkAccess(sub, id, linkAccess) {
      const entry = projects.get(id);
      if (!entry || entry.project.ownerSub !== sub) return undefined;
      entry.project = { ...entry.project, linkAccess };
      return { ...entry.project };
    },
    async deleteProject(sub, id) {
      const entry = projects.get(id);
      if (!entry || entry.project.ownerSub !== sub) return false;
      removeProject(id);
      return true;
    },
    async claimThumbnail(projectId, at, notAfter) {
      const entry = projects.get(projectId);
      if (!entry) return false;
      const last = entry.project.thumbnailAt;
      if (last !== null && last > notAfter) return false;
      entry.project = { ...entry.project, thumbnailAt: at };
      return true;
    },
    async setThumbnailAt(projectId, at) {
      const entry = projects.get(projectId);
      if (entry) entry.project = { ...entry.project, thumbnailAt: at };
    },

    async projectFiles(projectId) {
      return new Map(files.get(projectId));
    },
    async applyMaterialisation(materialisation) {
      const { projectId, upserts, deletes, blobs: added, revision, now } = materialisation;
      // The blob rows are global: they go in whether or not the project is still there.
      for (const blob of added) putBlob(blob, now);
      const entry = projects.get(projectId);
      if (!entry) return false;
      const map = files.get(projectId) ?? new Map<string, string>();
      for (const path of deletes) map.delete(path);
      for (const [path, hash] of upserts) map.set(path, hash);
      files.set(projectId, map);
      if (entry.project.revision !== revision) {
        entry.project = { ...entry.project, revision, updatedAt: now };
      }
      return true;
    },

    async blobsPresent(hashes) {
      return new Set(hashes.filter((hash) => blobs.has(hash)));
    },
    async addBlobs(added, now) {
      for (const blob of added) putBlob(blob, now);
    },
    async blob(hash) {
      const row = blobs.get(hash);
      return row && { ...row };
    },
    async addProjectBlob(projectId, hash) {
      if (!projects.has(projectId)) return false;
      const set = projectBlobs.get(projectId) ?? new Set<string>();
      set.add(hash);
      projectBlobs.set(projectId, set);
      return true;
    },
    async removeProjectBlob(projectId, hash) {
      return projectBlobs.get(projectId)?.delete(hash) ?? false;
    },
    async hasProjectBlob(projectId, hash) {
      return projectBlobs.get(projectId)?.has(hash) ?? false;
    },
    async projectBlobs(projectId) {
      return [...(projectBlobs.get(projectId) ?? [])].sort();
    },
    async projectHoldsBlob(projectId, hash) {
      if (projectBlobs.get(projectId)?.has(hash)) return true;
      return versionsOf(projectId).some((entry) => [...entry.files.values()].includes(hash));
    },
    async copyProjectBlobs(sub, fromId, toId) {
      // The source need only exist (the route resolved that the person may read it); the target is theirs.
      const from = projects.get(fromId);
      const to = projects.get(toId);
      if (!from || !to || to.project.ownerSub !== sub) return 0;
      const target = projectBlobs.get(toId) ?? new Set<string>();
      let added = 0;
      for (const hash of projectBlobs.get(fromId) ?? []) {
        if (target.has(hash)) continue;
        target.add(hash);
        added += 1;
      }
      projectBlobs.set(toId, target);
      return added;
    },

    async createVersion(version, guard) {
      if (!projects.has(version.projectId)) return "missing";
      const list = versions.get(version.projectId) ?? [];
      if (!(list.length < guard.maxVersions)) return "quota";
      if (guard.rate) {
        const { max, since } = guard.rate;
        const recent = list.filter((entry) => entry.version.createdAt >= since).length;
        if (!(recent < max)) return "rate";
      }
      const last = list[list.length - 1];
      const created: Version = {
        projectId: version.projectId,
        number: (last ? last.version.number : 0) + 1,
        label: version.label,
        auto: version.auto,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      };
      list.push({ version: created, files: new Map(files.get(version.projectId)) });
      versions.set(version.projectId, list);
      return { ...created };
    },
    async listVersions(projectId) {
      return versionsOf(projectId).map((entry) => ({ ...entry.version }));
    },
    async version(projectId, number) {
      const found = versionsOf(projectId).find((entry) => entry.version.number === number);
      return found && { ...found.version };
    },
    async latestVersion(projectId) {
      const last = versionsOf(projectId).at(-1);
      return last && { ...last.version };
    },
    async versionFiles(projectId, number) {
      const found = versionsOf(projectId).find((entry) => entry.version.number === number);
      return found && new Map(found.files);
    },
    async versionChanges(projectId) {
      const changes = new Map<number, string[]>();
      let previous: VersionEntry | undefined;
      for (const entry of versionsOf(projectId)) {
        const changed: string[] = [];
        for (const [path, hash] of entry.files) {
          if (previous?.files.get(path) !== hash) changed.push(path);
        }
        if (previous) {
          for (const path of previous.files.keys()) if (!entry.files.has(path)) changed.push(path);
        }
        changes.set(entry.version.number, changed.sort(compareBinary));
        previous = entry;
      }
      return changes;
    },
    async deleteVersions(projectId, numbers) {
      const gone = new Set(numbers);
      const list = versions.get(projectId);
      if (list) {
        versions.set(
          projectId,
          list.filter((entry) => !gone.has(entry.version.number)),
        );
      }
    },
    async countVersions(projectId) {
      return versionsOf(projectId).length;
    },
    async countVersionsSince(projectId, since) {
      return versionsOf(projectId).filter((entry) => entry.version.createdAt >= since).length;
    },

    async storageBytesOf(sub) {
      return bytesOf(sub);
    },
    async refreshStorageBytes(sub) {
      if (!users.has(sub)) return 0;
      const bytes = bytesOf(sub);
      storage.set(sub, bytes);
      return bytes;
    },
    async usage(sub) {
      return {
        projects: ownedBy(sub).length,
        storageBytes: users.has(sub) ? (storage.get(sub) ?? 0) : 0,
      };
    },

    async unreferencedBlobs(olderThan, limit) {
      const held = referenced();
      return [...blobs.values()]
        .filter((blob) => blob.createdAt < olderThan && !held.has(blob.hash))
        .sort((a, b) =>
          a.createdAt !== b.createdAt
            ? a.createdAt < b.createdAt
              ? -1
              : 1
            : a.hash < b.hash
              ? -1
              : 1,
        )
        .slice(0, capacity(limit))
        .map((blob) => blob.hash);
    },
    async deleteBlobs(hashes, olderThan) {
      const unique = [...new Set(hashes)];
      const held = referenced();
      for (const hash of unique) {
        const blob = blobs.get(hash);
        if (blob && blob.createdAt < olderThan && !held.has(hash)) blobs.delete(hash);
      }
      return unique.filter((hash) => !blobs.has(hash));
    },

    async memberRole(projectId, sub) {
      return members.get(projectId)?.get(sub)?.role;
    },
    async members(projectId) {
      return [...(members.get(projectId) ?? [])]
        .map(([sub, entry]) => {
          const person = users.get(sub);
          return {
            sub,
            role: entry.role,
            addedAt: entry.addedAt,
            name: person?.name ?? "",
            picture: person?.picture ?? "",
            email: person?.email ?? "",
          };
        })
        .sort((a, b) =>
          a.addedAt !== b.addedAt ? (a.addedAt < b.addedAt ? -1 : 1) : compareBinary(a.sub, b.sub),
        );
    },
    async setMemberRole(projectId, sub, role) {
      const entry = members.get(projectId)?.get(sub);
      if (!entry) return false;
      entry.role = role;
      return true;
    },
    async removeMember(projectId, sub) {
      const held = members.get(projectId);
      if (!held?.delete(sub)) return false;
      if (held.size === 0) members.delete(projectId);
      return true;
    },

    async createInvitation(invitation, limit) {
      if (!projects.has(invitation.projectId)) return "missing";
      const cutoff = invitationCutoff(invitation.createdAt);
      const held =
        (members.get(invitation.projectId)?.size ?? 0) +
        invitations.filter(
          (entry) =>
            entry.invitation.projectId === invitation.projectId &&
            pending(entry.invitation, cutoff),
        ).length;
      // Written so that a limit that is not a number refuses, as `d1Store` does.
      if (!(held < limit)) return "quota";
      // The id and the token are unique, as the table's keys make them.
      for (const { invitation: other } of invitations) {
        if (other.id === invitation.id) throw new Error(`invitation ${invitation.id} exists`);
        if (other.token === invitation.token) throw new Error("invitation token exists");
      }
      invitations.push({ invitation: { ...invitation, acceptedAt: null }, seq: ++invitationSeq });
      return "created";
    },
    async pendingInvitations(projectId, now) {
      const cutoff = invitationCutoff(now);
      return invitations
        .filter(
          (entry) => entry.invitation.projectId === projectId && pending(entry.invitation, cutoff),
        )
        .sort((a, b) =>
          a.invitation.createdAt !== b.invitation.createdAt
            ? a.invitation.createdAt < b.invitation.createdAt
              ? -1
              : 1
            : a.seq - b.seq,
        )
        .map(({ invitation }) => ({ ...invitation }));
    },
    async setInvitationRole(projectId, id, role) {
      const entry = invitations.find(
        (e) =>
          e.invitation.projectId === projectId &&
          e.invitation.id === id &&
          e.invitation.acceptedAt === null,
      );
      if (!entry) return false;
      entry.invitation = { ...entry.invitation, role };
      return true;
    },
    async deleteInvitation(projectId, id) {
      const at = invitations.findIndex(
        (e) =>
          e.invitation.projectId === projectId &&
          e.invitation.id === id &&
          e.invitation.acceptedAt === null,
      );
      if (at < 0) return false;
      invitations.splice(at, 1);
      return true;
    },
    async pendingInvitationByToken(token, now) {
      const cutoff = invitationCutoff(now);
      const found = invitations.find(
        (e) => e.invitation.token === token && pending(e.invitation, cutoff),
      );
      return found && { ...found.invitation };
    },
    async acceptInvitation(token, sub, now): Promise<Accepted | undefined> {
      const cutoff = invitationCutoff(now);
      const entry = invitations.find(
        (e) => e.invitation.token === token && pending(e.invitation, cutoff),
      );
      const owner = entry && projects.get(entry.invitation.projectId)?.project.ownerSub;
      // The project's owner is never made a member, and the invitation stays pending for them.
      if (!entry || owner === undefined || owner === sub) return undefined;
      const { projectId, role } = entry.invitation;
      const held = admit(projectId, sub, role, now);
      entry.invitation = { ...entry.invitation, acceptedAt: now };
      return { projectId, role: held };
    },
    async acceptInvitationsFor(sub, email, now): Promise<Accepted[]> {
      const cutoff = invitationCutoff(now);
      const waiting = invitations.filter(
        (e) =>
          e.invitation.email === email &&
          pending(e.invitation, cutoff) &&
          projects.has(e.invitation.projectId) &&
          projects.get(e.invitation.projectId)?.project.ownerSub !== sub,
      );
      const accepted = new Map<string, MemberRole>();
      for (const entry of waiting) {
        const { projectId, role } = entry.invitation;
        accepted.set(projectId, admit(projectId, sub, role, now));
        entry.invitation = { ...entry.invitation, acceptedAt: now };
      }
      return [...accepted]
        .sort(([a], [b]) => compareBinary(a, b))
        .map(([projectId]) => ({
          projectId,
          role: members.get(projectId)?.get(sub)?.role ?? "viewer",
        }));
    },

    async setHandle(sub, handle) {
      const person = users.get(sub);
      if (!person) return "missing";
      if (person.handle === handle) return "set";
      for (const other of users.values()) {
        if (other.sub !== sub && other.handle === handle) return "taken";
      }
      // A different handle would move a publication from under its address.
      if (person.handle !== null && publications.some((p) => p.handle === person.handle)) {
        return "locked";
      }
      users.set(sub, { ...person, handle });
      return "set";
    },
    async userByHandle(handle) {
      for (const user of users.values()) if (user.handle === handle) return { ...user };
      return undefined;
    },

    async setUnbrandedExports(sub, on, by, at, log) {
      const person = users.get(sub);
      if (!person) return "missing";
      if (log) logAdmin(log);
      users.set(sub, {
        ...person,
        unbrandedExports: on,
        unbrandedExportsBy: by,
        unbrandedExportsAt: at,
      });
      return "set";
    },
    async entitledUsers() {
      return (
        [...users.values()]
          .filter((user) => user.unbrandedExports)
          // As SQLite orders text: by its bytes, the time first, then the sub.
          .sort(
            (a, b) =>
              binary(a.unbrandedExportsAt ?? "", b.unbrandedExportsAt ?? "") ||
              binary(a.sub, b.sub),
          )
          .map((user) => ({ ...user }))
      );
    },
    async usersByEmail(email) {
      // As SQLite's lower(): ASCII letters only.
      const fold = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase());
      return [...users.values()]
        .filter((user) => user.emailVerified && fold(user.email) === email)
        .sort((a, b) => binary(a.createdAt, b.createdAt) || binary(a.sub, b.sub))
        .map((user) => ({ ...user }));
    },

    async administrators() {
      return [...administrators.values()]
        .sort((a, b) => binary(a.since, b.since) || binary(a.sub, b.sub))
        .map((administrator) => ({ ...administrator }));
    },
    async administrator(sub) {
      const administrator = administrators.get(sub);
      return administrator && { ...administrator };
    },
    async removeAdministrator(sub, log) {
      if (!administrators.has(sub)) return false;
      logAdmin(log);
      administrators.delete(sub);
      return true;
    },
    async createAdminInvitation(invitation, limit, log) {
      const pending = adminInvitations.filter((entry) =>
        open(entry.invitation, invitation.createdAt),
      ).length;
      // Written so that a limit that is not a number refuses, as `d1Store` does.
      if (!(pending < limit)) return "limit";
      adminInvitations.push({
        invitation: {
          ...invitation,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
        },
        seq: adminSeq++,
      });
      logAdmin(log);
      return "created";
    },
    async adminInvitations(now) {
      return adminInvitations
        .filter((entry) => open(entry.invitation, now))
        .sort((a, b) => binary(a.invitation.createdAt, b.invitation.createdAt) || a.seq - b.seq)
        .map((entry) => ({ ...entry.invitation }));
    },
    async adminInvitationFor(email, now) {
      const found = adminInvitations
        .filter((entry) => entry.invitation.email === email && open(entry.invitation, now))
        .sort((a, b) => binary(b.invitation.createdAt, a.invitation.createdAt) || b.seq - a.seq)[0];
      return found && { ...found.invitation };
    },
    async revokeAdminInvitation(id, now, log) {
      const entry = findOpen(id, now);
      if (!entry) return false;
      logAdmin(log);
      entry.invitation = { ...entry.invitation, revokedAt: now };
      return true;
    },
    async acceptAdminInvitation(id, sub, email, now, limit, log) {
      const entry = findOpen(id, now);
      if (!entry || entry.invitation.email !== email || administrators.has(sub)) return "none";
      if (!(administrators.size < limit)) return "limit";
      administrators.set(sub, { sub, invitedBy: entry.invitation.invitedBy, since: now });
      entry.invitation = { ...entry.invitation, acceptedAt: now };
      logAdmin(log);
      return "accepted";
    },
    async declineAdminInvitation(id, email, now, log) {
      const entry = findOpen(id, now);
      if (!entry || entry.invitation.email !== email) return false;
      logAdmin(log);
      entry.invitation = { ...entry.invitation, declinedAt: now };
      return true;
    },
    async adminLog(limit) {
      return [...adminLog]
        .sort((a, b) => binary(b.entry.at, a.entry.at) || b.seq - a.seq)
        .slice(0, Math.max(0, capacity(limit)))
        .map(({ entry }) => ({ ...entry }));
    },

    async publicationsOf(projectId) {
      return publications
        .filter((publication) => publication.projectId === projectId)
        .sort(byPublication)
        .map((publication) => ({ ...publication }));
    },
    async publicationsOwnedBy(sub) {
      return publications
        .filter((publication) => projects.get(publication.projectId)?.project.ownerSub === sub)
        .sort(byPublication)
        .map((publication) => ({ ...publication }));
    },
    async publication(handle, slug) {
      const found = publications.find((p) => p.handle === handle && p.slug === slug);
      return found && { ...found };
    },
    async putPublication(publication, options) {
      const entry = projects.get(publication.projectId);
      if (!entry) return "missing";
      if (
        options?.ownersHandle === true &&
        users.get(entry.project.ownerSub)?.handle !== publication.handle
      ) {
        return "handle";
      }
      const taken = publications.some(
        (other) =>
          other.handle === publication.handle &&
          other.slug === publication.slug &&
          other.projectId !== publication.projectId,
      );
      if (taken) return "taken";
      const at = publications.findIndex(
        (other) => other.projectId === publication.projectId && other.slug === publication.slug,
      );
      if (at < 0) publications.push({ ...publication });
      else publications[at] = { ...publication };
      return "put";
    },
    async deletePublication(projectId, slug) {
      const at = publications.findIndex((p) => p.projectId === projectId && p.slug === slug);
      if (at < 0) return undefined;
      const [removed] = publications.splice(at, 1);
      return removed && { ...removed };
    },
    async countPublicationsSince(projectId, since) {
      return publications.filter((p) => p.projectId === projectId && p.publishedAt >= since).length;
    },
    async claimPublish(projectId, at, limit): Promise<PublishClaim> {
      const cutoff = publishCutoff(at);
      if (!projects.has(projectId)) return { status: "missing" };
      const counted = publishLog
        .filter((entry) => entry.projectId === projectId && entry.at >= cutoff)
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      if (!(counted.length < capacity(limit))) {
        // The earliest request of the hour is the one whose leaving makes room (with a limit of 0
        // there is none, and the hour from now is as good an answer as any).
        const earliest = counted[0];
        const freeAt = new Date(
          (earliest ? Date.parse(earliest.at) : Date.parse(at)) + PUBLISH_WINDOW_MS,
        ).toISOString();
        return { status: "rate", freeAt };
      }
      publishLog.push({ projectId, at });
      return { status: "claimed" };
    },

    async takeDown(takedown, log) {
      const at = publications.findIndex(
        (p) => p.handle === takedown.handle && p.slug === takedown.slug,
      );
      if (at < 0) return undefined;
      if (log) logAdmin(log);
      const [removed] = publications.splice(at, 1);
      takedowns.push({ ...takedown, projectId: removed?.projectId ?? null });
      return removed && { ...removed };
    },
    async takedownsOf(handle) {
      // The latest first; of two at the same instant, the slug in binary order.
      return takedowns
        .filter((t) => t.handle === handle)
        .sort((a, b) => (a.at !== b.at ? (a.at < b.at ? 1 : -1) : compareBinary(a.slug, b.slug)))
        .map((t) => ({ ...t }));
    },
  };
}

/** Publications in the order the interface promises: the earliest published first, then by slug. */
function byPublication(a: Publication, b: Publication): number {
  return a.publishedAt !== b.publishedAt
    ? a.publishedAt < b.publishedAt
      ? -1
      : 1
    : compareBinary(a.slug, b.slug);
}
