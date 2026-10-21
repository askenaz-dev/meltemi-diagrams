import { messages } from "./messages/index.js";

/** A file of an archive: its `/`-separated path and its bytes. */
export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

/** What reading an archive accepts at most. */
export const ZIP_LIMITS = {
  files: 2000,
  /** The total size of the files once uncompressed. */
  bytes: 64 * 1024 * 1024,
} as const;

export class ZipError extends Error {}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of data, as ZIP and PNG use it. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Runs bytes through a compression stream, stopping beyond `limit` bytes of output. */
export async function transform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ZipError(messages().archive.tooLarge);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export const deflateRaw = (data: Uint8Array) =>
  transform(data, new CompressionStream("deflate-raw"));
export const inflateRaw = (data: Uint8Array, limit?: number) =>
  transform(data, new DecompressionStream("deflate-raw"), limit);

/** The MS-DOS time and date of a moment, as ZIP stores them. */
function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const encoder = new TextEncoder();

/**
 * A ZIP archive of the entries, each deflated when that makes it smaller, with UTF-8 names.
 * The modification time is `date` (now by default) for every entry.
 */
export async function writeZip(
  entries: readonly ZipEntry[],
  options: { date?: Date } = {},
): Promise<Uint8Array> {
  const { time, date } = dosTime(options.date ?? new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const deflated = entry.data.length > 0 ? await deflateRaw(entry.data) : entry.data;
    const compress = deflated.length < entry.data.length;
    const body = compress ? deflated : entry.data;
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, compress ? 8 : 0, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, body.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, compress ? 8 : 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true);
    c.setUint32(24, entry.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const directorySize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const decoder = new TextDecoder();

/**
 * The files of a ZIP archive, stored or deflated, within `ZIP_LIMITS`. Folders are left out, and
 * a single top folder that holds everything is removed from the paths.
 */
export async function readZip(
  data: Uint8Array,
  limits: { files: number; bytes: number } = ZIP_LIMITS,
): Promise<ZipEntry[]> {
  const m = messages().archive;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  const stop = Math.max(0, data.length - 22 - 0xffff);
  while (end >= stop && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < stop) throw new ZipError(m.notZip);
  const count = view.getUint16(end + 10, true);
  if (count > limits.files) throw new ZipError(m.tooMany(count, limits.files));
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ZipError(m.directoryDamaged);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new ZipError(m.encrypted(name));
    total += size;
    if (total > limits.bytes) throw new ZipError(m.filesTooLarge);
    if (local + 30 > data.length || view.getUint32(local, true) !== 0x04034b50) {
      throw new ZipError(m.damaged(name));
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const body = data.subarray(start, start + compressed);
    let content: Uint8Array;
    if (method === 0) content = body.slice();
    else if (method === 8) content = await inflateRaw(body, size);
    else throw new ZipError(m.compression(name));
    if (content.length !== size || crc32(content) !== crc) {
      throw new ZipError(m.damaged(name));
    }
    entries.push({ path: name.replace(/\\/g, "/").replace(/^\/+/, ""), data: content });
  }
  // A folder zipped as a whole: its files are the project.
  const tops = new Set(entries.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")));
  if (tops.size === 1 && !tops.has("")) {
    const top = [...tops][0]!;
    return entries.map((e) => ({ path: e.path.slice(top.length + 1), data: e.data }));
  }
  return entries;
}
