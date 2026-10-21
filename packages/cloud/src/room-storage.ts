// The room's storage over SQL (the SQLite of a Durable Object): the revision and the encoded
// document in chunks, written in ONE storage transaction. It takes the two things it needs of the
// platform as a small interface, so that the same code runs over `ctx.storage` in the Durable
// Object and over `node:sqlite` in the tests.
//
//   meta       (id = 1, revision, chunks, project)   one row
//   doc_chunks (n, bytes)                              the encoded document, 1 MiB at most per row

import type { RoomStorage, StoredRoom } from "./room-core.js";

/** What the storage needs of the platform: statements, and a way to run several as one transaction. */
export interface SqlRoomDb {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
  transactionSync<T>(run: () => T): T;
}

export interface SqlRoomStorage extends RoomStorage {
  /** The project id the room was told about (the Durable Object's own name is not always known). */
  project(): string | undefined;
  /** Remembers the project id; a repeat of what is stored writes nothing. */
  setProject(id: string): void;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     revision INTEGER NOT NULL,
     chunks INTEGER NOT NULL,
     project TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS doc_chunks (n INTEGER PRIMARY KEY, bytes BLOB NOT NULL)`,
];

/** The bytes of a BLOB column, which the platform gives as an `ArrayBuffer` and Node as a `Uint8Array`. */
function bytesOf(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("the room's storage holds a chunk that is not bytes");
}

export function sqlRoomStorage(db: SqlRoomDb): SqlRoomStorage {
  for (const statement of SCHEMA) db.exec(statement);

  return {
    load(): StoredRoom | undefined {
      const [meta] = db.exec("SELECT revision, chunks FROM meta WHERE id = 1").toArray();
      if (!meta) return undefined;
      const count = Number(meta["chunks"]);
      // A room that only remembers its project has no document yet.
      if (count === 0) return undefined;
      const rows = db.exec("SELECT n, bytes FROM doc_chunks ORDER BY n").toArray();
      if (rows.length !== count || rows.some((row, index) => Number(row["n"]) !== index)) {
        // Writes are one transaction, so this is damage and not a write in progress: do not carry on
        // with an empty document, which the next write would make permanent.
        throw new Error("the room's storage is incomplete");
      }
      return {
        revision: Number(meta["revision"]),
        chunks: rows.map((row) => bytesOf(row["bytes"])),
      };
    },

    save(revision, chunks): void {
      db.transactionSync(() => {
        db.exec("DELETE FROM doc_chunks WHERE n >= ?", chunks.length);
        chunks.forEach((chunk, n) => {
          // A copy of exactly the chunk's bytes: the platform binds an `ArrayBuffer`.
          const bytes = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
          db.exec(
            "INSERT INTO doc_chunks (n, bytes) VALUES (?, ?) ON CONFLICT(n) DO UPDATE SET bytes = excluded.bytes",
            n,
            bytes,
          );
        });
        db.exec(
          `INSERT INTO meta (id, revision, chunks) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, chunks = excluded.chunks`,
          revision,
          chunks.length,
        );
      });
    },

    destroy(): void {
      db.transactionSync(() => {
        db.exec("DELETE FROM doc_chunks");
        db.exec("DELETE FROM meta");
      });
    },

    project(): string | undefined {
      const [row] = db.exec("SELECT project FROM meta WHERE id = 1").toArray();
      const project = row?.["project"];
      return typeof project === "string" ? project : undefined;
    },

    setProject(id): void {
      if (this.project() === id) return;
      db.exec(
        `INSERT INTO meta (id, revision, chunks, project) VALUES (1, 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET project = excluded.project`,
        id,
      );
    },
  };
}
