// What the Worker and the room say to each other: the types of the room's operations, the errors
// that cross the boundary and the parser of a push. No Cloudflare API is used here, so the
// handlers, the in-memory room of the tests and the Durable Object share it.

import type { Collision } from "./document.js";
import type { ErrorCode } from "./errors.js";

/** What a person may do in a room: change it (`owner`, `editor`) or only read it (`viewer`). */
export type RoomRole = "owner" | "editor" | "viewer";

export const ROOM_ROLES: readonly RoomRole[] = ["owner", "editor", "viewer"];

/** Who is on the other end of a socket, as the Worker resolved it (never as the client said). */
export interface RoomIdentity {
  readonly sub: string;
  readonly role: RoomRole;
  readonly name: string;
  readonly picture: string;
}

/** The latest files of a project, by path, as the room holds them. */
export interface RoomFiles {
  readonly revision: number;
  /** Path to text, by shown path. */
  readonly files: Record<string, string>;
  /** Path to the SHA-256 (hex) of the bytes of an image or a font. */
  readonly binaries: Record<string, string>;
  readonly collisions: readonly Collision[];
}

/** A push: files by path (`null` deletes), binaries by path, and the revision it expects. */
export interface PushRequest {
  readonly files?: Readonly<Record<string, string | null>>;
  readonly binaries?: Readonly<Record<string, string | null>>;
  /** The push is refused with `revision.mismatch` unless the room is at exactly this revision. */
  readonly ifRevision?: number;
}

/** What the development tools of the room count. */
export interface RoomStats {
  readonly revision: number;
  /** Open sockets. */
  readonly clients: number;
  /** Writes of the document to the room's storage. */
  readonly storageWrites: number;
  /** Times the room ran `materialise()`, failures included. */
  readonly materialisations: number;
  /** Of those, the ones that failed. */
  readonly materialiseFailures: number;
  /** D1 rows written, as `materialise()` reported them. */
  readonly d1RowsWritten: number;
  /** Messages received from clients since the room was constructed. */
  readonly messages: number;
  /** Of those, the awareness (kind 2) messages, the dropped and the invalid ones included. */
  readonly awareness: number;
  /** Awareness messages the room did not relay: beyond the rate of 20 a second, or malformed. */
  readonly awarenessDropped: number;
}

/** The limits the development tool may lower in a room, for the browser suite. */
export interface RoomLimitsRequest {
  /** Clients the room admits from now on (from 1 to `CLOUD_LIMITS.clients`); omitted, the real limit. */
  readonly clients?: number;
}

/**
 * Which clients are cut: one connection, every connection of a person, every connection but one
 * person's, or all. The development tool names them, and so do the routes that change who may do
 * what in a project: the role of a connection is resolved when it opens, so a person whose access
 * changed is cut, and meets the new rule when their page reconnects.
 */
export interface DisconnectTarget {
  readonly id?: string;
  readonly sub?: string;
  /** Every connection except this person's (the owner's, when the link of the project narrows). */
  readonly except?: string;
}

/**
 * The room as the Worker uses it. `durableRooms()` implements it over the Durable Object binding;
 * `memoryRooms()` of the tests implements it over the same logic with in-memory ports. A failure
 * of the room's rules is an `ApiError` carrying the code of the specification.
 */
export interface RoomsApi {
  /**
   * Opens a client's socket on the project's room and answers the upgrade. `request` is the
   * client's request, which is never forwarded: the room gets a request the Worker constructs,
   * with the identity in headers that only the Worker sets.
   */
  connect(projectId: string, request: Request, identity: RoomIdentity): Promise<Response>;
  /** The latest files, from the room (never from D1). */
  read(projectId: string): Promise<RoomFiles>;
  /** Applies a push as one transaction; `409 revision.mismatch` carries the current revision. */
  push(projectId: string, body: PushRequest): Promise<{ revision: number }>;
  /**
   * Makes the room hold exactly these files (a version restored) as one transaction. With
   * `ifRevision` the room refuses (`409 revision.mismatch`, carrying its revision) unless it is at
   * exactly that revision: the one a materialisation answered, so that what the restore replaces
   * is what the version made before it recorded.
   */
  restore(
    projectId: string,
    files: Readonly<Record<string, string>>,
    binaries: Readonly<Record<string, string>>,
    ifRevision?: number,
  ): Promise<{ revision: number }>;
  /**
   * Materialises now (before a version is made); throws `internal` when it could not. Answers the
   * revision the store holds afterwards.
   */
  materialise(projectId: string): Promise<{ revision: number }>;
  /** Deletes the room's storage and closes its sockets (the project was deleted). */
  destroy(projectId: string): Promise<void>;
  /** The development counters. */
  stats(projectId: string): Promise<RoomStats>;
  /** Closes the sockets the target names; answers how many. */
  disconnect(projectId: string, target?: DisconnectTarget): Promise<{ closed: number }>;
  /** Lowers the room's limits (development only); answers the limits now in force. */
  limits(projectId: string, request: RoomLimitsRequest): Promise<{ clients: number }>;
}

/** The codes of the specification that the room raises. */
export type RoomErrorCode = Extract<
  ErrorCode,
  | "path.invalid"
  | "blob.unknown"
  | "doc.invalid"
  | "doc.too-large"
  | "quota.files"
  | "revision.mismatch"
  | "access.denied"
  | "message.too-large"
  | "awareness.rate"
  | "room.full"
  | "project.not-found"
  | "internal"
>;

/** A refusal of the room's rules. It crosses the boundary as JSON and comes back as an `ApiError`. */
export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A record whose values are all `string` or `null` (`null` only when `nulls`), else undefined. */
function stringRecord(
  value: unknown,
  nulls: boolean,
): Readonly<Record<string, string | null>> | undefined {
  if (!isRecord(value)) return undefined;
  for (const entry of Object.values(value)) {
    if (typeof entry === "string") continue;
    if (entry === null && nulls) continue;
    return undefined;
  }
  return value as Record<string, string | null>;
}

/**
 * A push from untrusted JSON: `files` and `binaries` (each optional) are objects of string or
 * `null`, `ifRevision` (optional) a non-negative integer. Undefined for any other shape. Whether
 * a path or a hash is acceptable is the document's to say.
 */
export function parsePush(value: unknown): PushRequest | undefined {
  if (!isRecord(value)) return undefined;
  const push: { -readonly [K in keyof PushRequest]: PushRequest[K] } = {};
  if (value["files"] !== undefined) {
    const files = stringRecord(value["files"], true);
    if (!files) return undefined;
    push.files = files;
  }
  if (value["binaries"] !== undefined) {
    const binaries = stringRecord(value["binaries"], true);
    if (!binaries) return undefined;
    push.binaries = binaries;
  }
  if (value["ifRevision"] !== undefined) {
    const revision = value["ifRevision"];
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
      return undefined;
    }
    push.ifRevision = revision;
  }
  return push;
}

/**
 * A full set of files (a restore) from untrusted JSON: objects of strings, and the `ifRevision`
 * (optional) the room must be at, a non-negative integer.
 */
export function parseRestore(value: unknown):
  | {
      files: Record<string, string>;
      binaries: Record<string, string>;
      ifRevision?: number;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  const files = value["files"] === undefined ? {} : stringRecord(value["files"], false);
  const binaries = value["binaries"] === undefined ? {} : stringRecord(value["binaries"], false);
  if (!files || !binaries) return undefined;
  const set = {
    files: files as Record<string, string>,
    binaries: binaries as Record<string, string>,
  };
  const revision = value["ifRevision"];
  if (revision === undefined) return set;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    return undefined;
  }
  return { ...set, ifRevision: revision };
}
