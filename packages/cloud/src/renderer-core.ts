// The rules of the renderer object (`mcp-previews`, "The renderer object"), with nothing of the
// platform, like the room's core: a request is validated, looked up in the cache of the object's
// last twenty answers, else drawn (`renderer-engine.ts`), made a PNG when asked
// (`renderer-raster.ts`) and kept. A repeated request at an unchanged revision is answered with the
// bytes of the first answer, and draws nothing. `renderer.ts` gives it the Durable Object's SQLite
// and the bundled files; the tests give it `node:sqlite` and the installed packages.

import type { PreviewEngine } from "./renderer-engine.js";
import { RASTER_FAMILIES, isSfnt, isWoff, sfntFromWoff } from "./renderer-fonts.js";
import {
  CACHE_ENTRIES,
  cacheKeyOf,
  validateRequest,
  type RenderOutcome,
  type RenderReport,
  type RenderSuccess,
  type ValidRequest,
} from "./renderer-protocol.js";
import { rasterise } from "./renderer-raster.js";
import type { SqlRoomDb } from "./room-storage.js";

/** An answer as the cache keeps it. */
export interface CachedPreview {
  readonly contentType: RenderSuccess["contentType"];
  readonly bytes: Uint8Array;
  readonly report: RenderReport;
}

/** The object's last answers, by request (`cacheKeyOf`), the least recently used dropped first. */
export interface PreviewCache {
  get(key: string): CachedPreview | undefined;
  put(key: string, preview: CachedPreview): void;
  /** How many answers are kept. */
  size(): number;
}

/** What the core needs of its host. */
export interface RendererPorts {
  readonly cache: PreviewCache;
  /** The engine, made on first use: the bundled fonts and icons are read then. */
  engine(): PreviewEngine | Promise<PreviewEngine>;
  /**
   * The faces a PNG is drawn with (TrueType), with the rasteriser started; called on the first PNG.
   */
  rasterFonts(): Promise<readonly Uint8Array[]>;
}

/** The core's counters, for the tests and the measurements. */
export interface RendererStats {
  /** Pictures drawn since the object started (an answer from the cache draws none). */
  readonly renders: number;
  /** Answers the cache holds. */
  readonly cached: number;
}

const TEXT = new TextEncoder();

export class RendererCore {
  private renders = 0;

  constructor(private readonly ports: RendererPorts) {}

  stats(): RendererStats {
    return { renders: this.renders, cached: this.ports.cache.size() };
  }

  async render(input: unknown): Promise<RenderOutcome> {
    const request = validateRequest(input);
    if ("ok" in request) return request;
    const key = cacheKeyOf(request);
    const kept = this.ports.cache.get(key);
    if (kept) return { ok: true, ...kept, cached: true };

    const engine = await this.ports.engine();
    const drawing = engine.draw(request);
    if (!drawing.ok) return drawing;
    this.renders++;

    let preview: CachedPreview;
    if (request.format === "svg") {
      preview = {
        contentType: "image/svg+xml",
        bytes: TEXT.encode(drawing.svg),
        report: {
          revision: request.revision,
          format: "svg",
          width: drawing.width,
          height: drawing.height,
          elements: drawing.elements,
          relations: drawing.relations,
          diagnostics: drawing.diagnostics,
          estimatedFonts: drawing.families.filter((f) => !f.measured).map((f) => f.family),
          truncated: drawing.truncated,
        },
      };
    } else {
      const own = await projectFaces(request, drawing.projectFonts);
      const fonts = [...(await this.ports.rasterFonts()), ...own.faces];
      const raster = rasterise(drawing.svg, request.width!, drawing, fonts);
      preview = {
        contentType: "image/png",
        bytes: raster.png,
        report: {
          revision: request.revision,
          format: "png",
          width: raster.width,
          height: raster.height,
          elements: drawing.elements,
          relations: drawing.relations,
          diagnostics: drawing.diagnostics,
          estimatedFonts: drawing.families
            .filter(
              (f) => !f.measured || !(RASTER_FAMILIES.has(f.family) || own.drawn.has(f.family)),
            )
            .map((f) => f.family),
          truncated: drawing.truncated,
          fitted: raster.fitted,
        },
      };
    }
    this.ports.cache.put(key, preview);
    return { ok: true, ...preview, cached: false };
  }
}

/**
 * The project's own fonts the rasteriser can draw with: TrueType and OpenType as they are, WOFF made
 * TrueType again. A WOFF2 font, or one that cannot be read, is left to the fallback.
 */
async function projectFaces(
  request: ValidRequest,
  fonts: readonly { readonly family: string; readonly path: string }[],
): Promise<{ faces: Uint8Array[]; drawn: Set<string> }> {
  const faces: Uint8Array[] = [];
  const drawn = new Set<string>();
  for (const { family, path } of fonts) {
    const bytes = request.binaries[path];
    if (!bytes) continue;
    try {
      if (isSfnt(bytes)) faces.push(bytes);
      else if (isWoff(bytes)) faces.push(await sfntFromWoff(bytes));
      else continue;
      drawn.add(family);
    } catch {
      // A font the rasteriser cannot read is drawn with the fallback, and the report names it.
    }
  }
  return { faces, drawn };
}

/** The cache in memory: the tests, and an object whose storage is not SQL. */
export function memoryPreviewCache(limit = CACHE_ENTRIES): PreviewCache {
  const entries = new Map<string, CachedPreview>();
  return {
    get(key) {
      const found = entries.get(key);
      if (found) {
        // The most recently used goes last, so the first is the one to drop.
        entries.delete(key);
        entries.set(key, found);
      }
      return found;
    },
    put(key, preview) {
      entries.delete(key);
      entries.set(key, preview);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    size: () => entries.size,
  };
}

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
