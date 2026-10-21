// The Durable Object of a project's room (`ProjectRoom`): the platform's side, and nothing else. It
// wires the SQLite storage, the timers, the WebSocket Hibernation API and the Worker's internal
// requests to `RoomCore`, where every rule lives and every rule is tested. Like `worker.ts`, this
// file imports `cloudflare:workers` and so is compiled by the Workers program only.
//
// Reachable only through the Worker: the Worker constructs every request (`room-client.ts`), so a
// header such as `X-Meltemi-Role` is one the Worker set, never one a browser sent.

import { CLOUD_LIMITS } from "@meltemi/diagrams-project";
import { DurableObject } from "cloudflare:workers";
import { ERROR_STATUS } from "./errors.js";
import type { Env } from "./env.js";
import { json, readCappedBytes } from "./http.js";
import { PROJECT_ID } from "./ids.js";
import { materialise } from "./materialise.js";
import type { AwarenessRecord } from "./room-awareness.js";
import { RoomCore, type RoomSocket } from "./room-core.js";
import { sqlRoomStorage, type SqlRoomDb } from "./room-storage.js";
import {
  ROOM_ROLES,
  RoomError,
  parsePush,
  parseRestore,
  type RoomIdentity,
  type RoomRole,
} from "./rooms.js";
import { d1Store } from "./store/d1.js";

/** Who is on a socket, as the Worker said and the room named it. */
type Identity = RoomIdentity & { readonly id: string };

/**
 * What a socket remembers across a hibernation (at most 2 KiB when serialised): the identity, and
 * the last awareness state of the client (`aw`) once it has sent one. The room's core keeps the two
 * together under that limit (`fitRecord`).
 */
type Attachment = Identity & { readonly aw?: AwarenessRecord };

/** Where the development tool's lowered client limit is kept, so that it outlives a hibernation. */
const CLIENT_LIMIT_KEY = "dev-client-limit";

/** The most a request to the room may carry: a whole document and the JSON around it. */
const MAX_BODY_BYTES = CLOUD_LIMITS.documentBytes + 2 * 1024 * 1024;

/** The longest sub, name and picture address kept in an attachment (2 KiB serialised at most). */
const MAX_SUB = 200;
const MAX_NAME = 100;
const MAX_PICTURE = 500;

const OPEN = 1;

/** A header the Worker set with `encodeURIComponent`, decoded; what cannot be decoded is empty. */
function decoded(value: string | null, max: number): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).slice(0, max);
  } catch {
    return "";
  }
}

function roleOf(value: string | null): RoomRole {
  // Anything the Worker did not mean is the least a person can be.
  return ROOM_ROLES.find((role) => role === value) ?? "viewer";
}

export class ProjectRoom extends DurableObject<Env> {
  private readonly core: RoomCore;
  private readonly db: SqlRoomDb;
  private storage: ReturnType<typeof sqlRoomStorage>;
  /** The project id the Worker last named, until the storage holds it. */
  private projectHint: string | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = {
      exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings),
      transactionSync: (run) => ctx.storage.transactionSync(run),
    };
    this.storage = sqlRoomStorage(this.db);
    const store = d1Store(env.DB);
    const projectId = (): string => {
      const id = ctx.id.name ?? this.projectHint ?? this.storage.project();
      if (id === undefined) throw new Error("the room does not know its project");
      return id;
    };
    this.core = new RoomCore({
      // `storage` is replaced when the room is destroyed (the database is dropped and made again).
      storage: {
        load: () => this.storage.load(),
        save: (revision, chunks) => this.storage.save(revision, chunks),
        destroy: () => this.storage.destroy(),
      },
      now: () => Date.now(),
      setTimer: (milliseconds, run) => setTimeout(run, milliseconds),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      // The alarm is only for awareness: it outlives the object, so a state is dropped after a wake.
      setAlarm: (at) => ctx.storage.setAlarm(at),
      sockets: () =>
        this.ctx
          .getWebSockets()
          .filter((ws) => ws.readyState === OPEN)
          .flatMap(wrap),
      projectId,
      hasBlob: (hash) => store.hasProjectBlob(projectId(), hash),
      // The room runs the materialiser itself, with its own `env`: the same Worker script, so the
      // same D1 and R2 bindings, and no route or service binding exists for it.
      materialise: (input) =>
        materialise({ store, blobs: env.BLOBS, now: () => new Date() }, input),
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      warn: (message) => console.warn(message),
    });
    try {
      const lowered = ctx.storage.kv.get<number>(CLIENT_LIMIT_KEY);
      if (typeof lowered === "number") this.core.limitClients(lowered);
    } catch {
      // No lowered limit to restore: the room admits as many as it may.
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.remember(request.headers.get("X-Meltemi-Project"));
    try {
      switch (`${request.method} ${url.pathname}`) {
        case "GET /connect":
          return await this.acceptSocket(request);
        case "GET /files":
          return json(await this.core.readFiles());
        case "PUT /files": {
          const push = parsePush(await this.body(request));
          if (!push) throw new RoomError("doc.invalid");
          return json(await this.core.push(push));
        }
        case "POST /restore": {
          const set = parseRestore(await this.body(request));
          if (!set) throw new RoomError("doc.invalid");
          return json(await this.core.restore(set.files, set.binaries, set.ifRevision));
        }
        case "POST /materialise": {
          const materialised = await this.core.materialiseNow();
          if (!materialised) throw new RoomError("internal");
          return json(materialised);
        }
        case "POST /destroy":
          await this.destroy();
          return json({});
        case "GET /stats":
          return json(this.core.stats());
        case "POST /limits": {
          // Development only (the Worker's route is): lowers how many clients the room admits.
          const body = (await this.body(request)) as { clients?: unknown } | null;
          const clients = typeof body?.clients === "number" ? body.clients : undefined;
          const applied = this.core.limitClients(clients);
          if (clients === undefined) this.ctx.storage.kv.delete(CLIENT_LIMIT_KEY);
          else this.ctx.storage.kv.put(CLIENT_LIMIT_KEY, applied);
          return json({ clients: applied });
        }
        case "POST /disconnect": {
          const target = (await this.body(request)) as {
            id?: unknown;
            sub?: unknown;
            except?: unknown;
          } | null;
          return json({
            closed: this.core.disconnect({
              ...(typeof target?.id === "string" ? { id: target.id } : {}),
              ...(typeof target?.sub === "string" ? { sub: target.sub } : {}),
              ...(typeof target?.except === "string" ? { except: target.except } : {}),
            }),
          });
        }
        default:
          return json({ code: "not-found", message: "There is nothing at this address." }, 404);
      }
    } catch (error) {
      return this.failure(error);
    }
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    for (const socket of wrap(ws)) await this.core.message(socket, message);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // The client closed: answer with a close of our own, which completes the handshake (the
    // platform does not do it for a hibernatable socket). A script may only send 1000 or 3000 to
    // 4999, so what the client sent (1005 for no code at all) is answered with a normal closure.
    const echo = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    try {
      ws.close(echo, reason.slice(0, 100));
    } catch {
      // Already closed: nothing left to complete.
    }
    for (const socket of wrap(ws)) await this.core.closed(socket);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    for (const socket of wrap(ws)) await this.core.closed(socket);
  }

  /** The alarm awareness set: drops the states that were silent for thirty seconds. */
  override async alarm(): Promise<void> {
    await this.core.alarm();
  }

  /** Accepts the upgrade the Worker constructed and hands the socket to the core. */
  private async acceptSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ code: "not-found", message: "There is nothing at this address." }, 404);
    }
    const sub = decoded(request.headers.get("X-Meltemi-Sub"), MAX_SUB);
    if (!sub) throw new RoomError("access.denied");
    const identity: Identity = {
      id: [...crypto.getRandomValues(new Uint8Array(8))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
      sub,
      role: roleOf(request.headers.get("X-Meltemi-Role")),
      name: decoded(request.headers.get("X-Meltemi-Name"), MAX_NAME),
      picture: decoded(request.headers.get("X-Meltemi-Picture"), MAX_PICTURE),
    };
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(identity);
    await this.core.connect(socketOf(server, identity));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The room's storage is deleted, its sockets are closed and the tables are made again, empty. */
  private async destroy(): Promise<void> {
    await this.core.destroy();
    // `deleteAll()` leaves an alarm that is set.
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.storage = sqlRoomStorage(this.db);
  }

  /** Keeps the project id the Worker named, once, for when the platform does not say. */
  private remember(project: string | null): void {
    if (!project || project === this.projectHint || !PROJECT_ID.test(project)) return;
    this.projectHint = project;
    this.storage.setProject(project);
  }

  private async body(request: Request): Promise<unknown> {
    const bytes = await readCappedBytes(request, MAX_BODY_BYTES);
    if (bytes === undefined) throw new RoomError("doc.too-large");
    if (bytes.length === 0) return null;
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new RoomError("doc.invalid");
    }
  }

  /** A refusal of the room's rules as JSON; anything else is an internal error without detail. */
  private failure(error: unknown): Response {
    if (error instanceof RoomError) {
      return json(
        { ...error.details, code: error.code, message: error.code },
        ERROR_STATUS[error.code],
      );
    }
    console.error("room: unexpected error:", error instanceof Error ? error.name : "unknown");
    return json({ code: "internal", message: "Something went wrong." }, 500);
  }
}

/** The core's view of a socket the platform holds, if it carries the identity the Worker gave it. */
function socketOf(ws: WebSocket, info: Identity): RoomSocket {
  return {
    info,
    // Read from the attachment each time: it is what survives a hibernation, and the only copy.
    get awareness() {
      return (ws.deserializeAttachment() as Attachment | null)?.aw;
    },
    keepAwareness: (record) => ws.serializeAttachment(record ? { ...info, aw: record } : info),
    send: (data) => ws.send(data as Uint8Array<ArrayBuffer>),
    close: (code, reason) => ws.close(code, reason),
  };
}

function wrap(ws: WebSocket): RoomSocket[] {
  const attachment = ws.deserializeAttachment() as Attachment | null;
  if (!attachment) return [];
  const { aw: _kept, ...identity } = attachment;
  return [socketOf(ws, identity)];
}
