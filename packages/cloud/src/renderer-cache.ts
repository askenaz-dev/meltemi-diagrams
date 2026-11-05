// The renderer object's cache in its SQLite (`mcp-previews`, "The renderer object"): the core's rules,
// engine and rasteriser are `@meltemi/diagrams-mcp/preview`'s, shared with the command line's local
// server, which keeps its answers in memory instead.

import {
  CACHE_ENTRIES,
  type CachedPreview,
  type PreviewCache,
  type RenderReport,
} from "@meltemi/diagrams-mcp/preview";
import type { SqlRoomDb } from "./room-storage.js";

/** The most bytes one row of the object's SQLite holds of an answer (a row is at most 2 MB). */
const CHUNK_BYTES = 1024 * 1024;

const CACHE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS previews (
     key TEXT PRIMARY KEY,
     content_type TEXT NOT NULL,
     report TEXT NOT NULL,
     chunks INTEGER NOT NULL,
     used INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS preview_chunks (
     key TEXT NOT NULL,
     n INTEGER NOT NULL,
     bytes BLOB NOT NULL,
     PRIMARY KEY (key, n)
   )`,
];

function bytesOf(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("the preview cache holds a chunk that is not bytes");
}

/**
 * The cache in the Durable Object's SQLite: an answer is a row and its bytes in chunks of 1 MiB,
 * written in one transaction with the eviction of the least recently used beyond `limit`, so the
 * object keeps its last twenty answers across restarts and never more.
 */
export function sqlPreviewCache(db: SqlRoomDb, limit = CACHE_ENTRIES): PreviewCache {
  for (const statement of CACHE_SCHEMA) db.exec(statement);
  const next = (): number => {
    const [row] = db.exec("SELECT COALESCE(MAX(used), 0) + 1 AS n FROM previews").toArray();
    return Number(row?.["n"] ?? 1);
  };
  const drop = (key: string) => {
    db.exec("DELETE FROM preview_chunks WHERE key = ?", key);
    db.exec("DELETE FROM previews WHERE key = ?", key);
  };
  return {
    get(key) {
      const [row] = db
        .exec("SELECT content_type, report, chunks FROM previews WHERE key = ?", key)
        .toArray();
      if (!row) return undefined;
      const chunks = db
        .exec("SELECT n, bytes FROM preview_chunks WHERE key = ? ORDER BY n", key)
        .toArray()
        .map((chunk) => bytesOf(chunk["bytes"]));
      if (chunks.length !== Number(row["chunks"])) {
        drop(key);
        return undefined;
      }
      const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      db.exec("UPDATE previews SET used = ? WHERE key = ?", next(), key);
      return {
        contentType: row["content_type"] as CachedPreview["contentType"],
        bytes,
        report: JSON.parse(String(row["report"])) as RenderReport,
      };
    },
    put(key, preview) {
      db.transactionSync(() => {
        drop(key);
        const chunks = Math.max(1, Math.ceil(preview.bytes.length / CHUNK_BYTES));
        for (let n = 0; n < chunks; n++) {
          // A copy of exactly the chunk's bytes: the platform binds an `ArrayBuffer`.
          const start = preview.bytes.byteOffset + n * CHUNK_BYTES;
          const end = Math.min(
            start + CHUNK_BYTES,
            preview.bytes.byteOffset + preview.bytes.length,
          );
          const bytes = preview.bytes.buffer.slice(start, end);
          db.exec("INSERT INTO preview_chunks (key, n, bytes) VALUES (?, ?, ?)", key, n, bytes);
        }
        db.exec(
          "INSERT INTO previews (key, content_type, report, chunks, used) VALUES (?, ?, ?, ?, ?)",
          key,
          preview.contentType,
          JSON.stringify(preview.report),
          chunks,
          next(),
        );
        const stale = db
          .exec("SELECT key FROM previews ORDER BY used DESC LIMIT -1 OFFSET ?", limit)
          .toArray();
        for (const row of stale) drop(String(row["key"]));
      });
    },
    size() {
      const [row] = db.exec("SELECT COUNT(*) AS n FROM previews").toArray();
      return Number(row?.["n"] ?? 0);
    },
  };
}
