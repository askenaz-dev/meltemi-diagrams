// The room's wire protocol (`cloud-projects`, "The room"): binary messages whose first byte is the
// kind. The page speaks the same one.

import type { RoomErrorCode } from "./rooms.js";

/** The first byte of a message. */
export const KIND = {
  /** Client to room: the client's state vector; the room answers kind 1 with what it lacks. Room to client: the room's own state vector, so the client can send what the room lacks. */
  sync: 0,
  /** Both ways: a Yjs update. */
  update: 1,
  /** Both ways: JSON presence states (`room-awareness.ts`); the room relays them, with the sender's identity. */
  awareness: 2,
  /**
   * Room to client, once on connect: JSON `{ role, revision, limits, collisions, you, live }`, `you`
   * with `guest`, and `live` the session's `{ until, guestsEdit }` for a connection it admitted.
   */
  hello: 3,
  /** Room to client: JSON `{ code }`, then the socket closes. */
  error: 4,
} as const;

/** The WebSocket close code that goes with each error code (4400 to 4429, and the two beside them). */
export const CLOSE_CODE: Readonly<Record<RoomErrorCode, number>> = {
  "path.invalid": 4400,
  "blob.unknown": 4400,
  "doc.invalid": 4400,
  "access.denied": 4403,
  "project.not-found": 4404,
  "room.full": 4409,
  "session.ended": 4410,
  "doc.too-large": 4413,
  "quota.files": 4413,
  "message.too-large": 4413,
  "connections.limit": 4428,
  "awareness.rate": 4429,
  "revision.mismatch": 4409,
  internal: 4500,
};

/** The close code of a connection the development tool cut: not an error, so the page reconnects. */
export const CLOSE_DISCONNECTED = 4000;

/** A message: the kind, then the payload. */
export function frame(kind: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const message = new Uint8Array(1 + payload.length);
  message[0] = kind;
  message.set(payload, 1);
  return message;
}

const encoder = new TextEncoder();

/** A message whose payload is JSON. */
export function jsonFrame(kind: number, value: unknown): Uint8Array {
  return frame(kind, encoder.encode(JSON.stringify(value)));
}

/** The bytes of what a WebSocket delivered, whichever form it came in. */
export function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Splits a message into its kind and payload; undefined for an empty one. */
export function parseFrame(bytes: Uint8Array): { kind: number; payload: Uint8Array } | undefined {
  if (bytes.length === 0) return undefined;
  return { kind: bytes[0] as number, payload: bytes.subarray(1) };
}
