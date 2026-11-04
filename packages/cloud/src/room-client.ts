// The Worker's side of the room: `RoomsApi` over the Durable Object binding. Every call is a
// request THIS FILE constructs: the fixed internal address `https://room/<operation>` and only the
// headers it sets. Nothing of the client's request is forwarded (not its path, not a header, so a
// browser's `X-Meltemi-Role` never reaches the room) and the identity goes in headers the room
// trusts because only the Worker can set them.

import { fail, type ErrorCode, ERROR_STATUS } from "./errors.js";
import type {
  DisconnectTarget,
  LiveGrant,
  LiveState,
  PushRequest,
  RoomFiles,
  RoomIdentity,
  RoomLimitsRequest,
  RoomStats,
  RoomsApi,
} from "./rooms.js";

/** The one thing the room is asked: a request, answered with a response. */
export interface RoomStubLike {
  fetch(request: Request): Promise<Response>;
}

/** What `env.ROOMS` is: a Durable Object namespace, as far as this file uses it. */
export interface RoomNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): RoomStubLike;
}

/** The headers the Worker sets on the upgrade it passes to the room. */
export const ROOM_HEADERS = {
  project: "X-Meltemi-Project",
  sub: "X-Meltemi-Sub",
  role: "X-Meltemi-Role",
  name: "X-Meltemi-Name",
  picture: "X-Meltemi-Picture",
  guest: "X-Meltemi-Guest",
  live: "X-Meltemi-Live",
  address: "X-Meltemi-Address",
} as const;

/** A live session as the room answers it, with its times as numbers. */
function liveStateOf(value: unknown): LiveState | null {
  if (typeof value !== "object" || value === null) return null;
  return value as LiveState;
}

/** An error the room answered with, back as the `ApiError` the handler answers. */
async function failure(response: Response): Promise<Error> {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: nothing the room meant to say.
  }
  const { code, message, ...details } = body;
  if (typeof code === "string" && code in ERROR_STATUS) {
    return fail(
      code as ErrorCode,
      typeof message === "string" && message !== code ? message : undefined,
      Object.keys(details).length > 0 ? details : undefined,
    );
  }
  return fail("internal");
}

export function durableRooms(namespace: RoomNamespaceLike): RoomsApi {
  /** A request to the room of a project: a fixed address, a method, and JSON when there is a body. */
  const ask = async (
    projectId: string,
    operation: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<Response> => {
    const headers: Record<string, string> = { [ROOM_HEADERS.project]: projectId };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const request = new Request(`https://room/${operation}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const response = await namespace.get(namespace.idFromName(projectId)).fetch(request);
    if (!response.ok) throw await failure(response);
    return response;
  };
  const answer = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  return {
    async connect(projectId, _request, identity: RoomIdentity, live?: string) {
      // The client's request is not forwarded: the room gets the upgrade and the identity, built
      // here, and the token only when the Worker was given one in the socket's query.
      const request = new Request("https://room/connect", {
        headers: {
          Upgrade: "websocket",
          [ROOM_HEADERS.project]: projectId,
          [ROOM_HEADERS.sub]: encodeURIComponent(identity.sub),
          [ROOM_HEADERS.role]: identity.role,
          [ROOM_HEADERS.name]: encodeURIComponent(identity.name),
          [ROOM_HEADERS.picture]: encodeURIComponent(identity.picture),
          ...(identity.guest === true ? { [ROOM_HEADERS.guest]: "1" } : {}),
          ...(identity.address !== undefined
            ? { [ROOM_HEADERS.address]: encodeURIComponent(identity.address) }
            : {}),
          ...(live !== undefined ? { [ROOM_HEADERS.live]: live } : {}),
        },
      });
      const response = await namespace.get(namespace.idFromName(projectId)).fetch(request);
      if (response.status !== 101) throw await failure(response);
      return response;
    },
    async startLive(projectId, body) {
      return answer<LiveState>(await ask(projectId, "live", "PUT", body));
    },
    async readLive(projectId) {
      return liveStateOf(await answer<unknown>(await ask(projectId, "live", "GET")));
    },
    async endLive(projectId) {
      await ask(projectId, "live", "DELETE");
    },
    async checkLive(projectId, token) {
      const { live } = await answer<{ live: LiveGrant | null }>(
        await ask(projectId, "live/check", "POST", { token }),
      );
      return live ?? null;
    },
    async read(projectId) {
      return answer<RoomFiles>(await ask(projectId, "files", "GET"));
    },
    async push(projectId, body: PushRequest) {
      return answer<{ revision: number }>(await ask(projectId, "files", "PUT", body));
    },
    async restore(projectId, files, binaries, ifRevision) {
      return answer<{ revision: number }>(
        await ask(projectId, "restore", "POST", {
          files,
          binaries,
          ...(ifRevision !== undefined ? { ifRevision } : {}),
        }),
      );
    },
    async materialise(projectId) {
      return answer<{ revision: number }>(await ask(projectId, "materialise", "POST"));
    },
    async destroy(projectId) {
      await ask(projectId, "destroy", "POST");
    },
    async stats(projectId) {
      return answer<RoomStats>(await ask(projectId, "stats", "GET"));
    },
    async disconnect(projectId, target: DisconnectTarget = {}) {
      return answer<{ closed: number }>(await ask(projectId, "disconnect", "POST", target));
    },
    async limits(projectId, request: RoomLimitsRequest) {
      return answer<{ clients: number }>(await ask(projectId, "limits", "POST", request));
    },
  };
}
