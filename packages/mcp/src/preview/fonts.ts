// The fonts a PNG preview is drawn with. The rasteriser (resvg) reads TrueType and OpenType only,
// and the font packages ship WOFF and WOFF2: a WOFF file is the font's own tables, each compressed
// with zlib, so it is made a TrueType file again here, in memory, with nothing lost (decompressed
// with the platform's `DecompressionStream`, in the Worker as in Node). WOFF2 transforms its tables
// and cannot be undone so simply; the renderer does not draw with it.

/** The four faces a PNG is drawn with, each from its family's Latin WOFF in the font packages. */
export const RASTER_FACES = [
  { family: "Inter", weight: 400, path: "@fontsource/inter/files/inter-latin-400-normal.woff" },
  { family: "Inter", weight: 600, path: "@fontsource/inter/files/inter-latin-600-normal.woff" },
  {
    family: "Cascadia Mono",
    weight: 400,
    path: "@fontsource/cascadia-mono/files/cascadia-mono-latin-400-normal.woff",
  },
  {
    family: "Patrick Hand",
    weight: 400,
    path: "@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff",
  },
] as const;

/** The families a PNG draws with their own faces; text in another family takes Inter. */
export const RASTER_FAMILIES: ReadonlySet<string> = new Set(RASTER_FACES.map((f) => f.family));

/**
 * The bundled families the renderer measures with their own files, as the command line does: Inter
 * (the technical and stage themes, and the fallback of every family), IBM Plex Sans (the editorial
 * themes and the second fallback), Cascadia Mono (tags and code) and Patrick Hand (the sketch
 * themes). The thirteen Fontsource families are measured with the fallback and named in
 * `estimatedFonts`.
 */
export const MEASURED_FAMILIES: ReadonlySet<string> = new Set([
  "Inter",
  "IBM Plex Sans",
  "Cascadia Mono",
  "Patrick Hand",
]);

const WOFF_HEADER = 44;
const WOFF_ENTRY = 20;
const SFNT_ENTRY = 16;

/** Whether the bytes are a WOFF (1.0) file. */
export function isWoff(bytes: Uint8Array): boolean {
  return bytes.length >= WOFF_HEADER && String.fromCharCode(...bytes.subarray(0, 4)) === "wOFF";
}

/** Whether the bytes are a TrueType or OpenType file, which the rasteriser reads as they are. */
export function isSfnt(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const version = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
  // TrueType (1.0), OpenType with CFF outlines (`OTTO`) and Apple's TrueType (`true`).
  return version === 0x00010000 || version === 0x4f54544f || version === 0x74727565;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const NAME_TAG = 0x6e616d65; // "name"
const TYPOGRAPHIC_FAMILY = 16;

/**
 * A `name` table with its typographic family (name 16) set to `family`, for the rasteriser's font
 * matching: Fontsource's static faces name a weight's family after the weight (`Inter SemiBold`),
 * which a text in `Inter` at weight 600 would never find. A table of another format is kept.
 */
function withTypographicFamily(table: Uint8Array, family: string): Uint8Array {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  if (table.length < 6 || view.getUint16(0) !== 0) return table;
  const count = view.getUint16(2);
  const storage = view.getUint16(4);
  const records: { ids: [number, number, number, number]; text: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const nameId = view.getUint16(at + 6);
    if (nameId === TYPOGRAPHIC_FAMILY) continue;
    const length = view.getUint16(at + 8);
    const offset = storage + view.getUint16(at + 10);
    records.push({
      ids: [view.getUint16(at), view.getUint16(at + 2), view.getUint16(at + 4), nameId],
      text: table.subarray(offset, offset + length),
    });
  }
  // Windows, Unicode BMP, English (United States): UTF-16 big-endian.
  const text = new Uint8Array(family.length * 2);
  for (let i = 0; i < family.length; i++) {
    text[2 * i] = family.charCodeAt(i) >> 8;
    text[2 * i + 1] = family.charCodeAt(i) & 0xff;
  }
  records.push({ ids: [3, 1, 0x409, TYPOGRAPHIC_FAMILY], text });
  records.sort((a, b) => {
    for (let k = 0; k < 4; k++) if (a.ids[k] !== b.ids[k]) return a.ids[k]! - b.ids[k]!;
    return 0;
  });
  const head = 6 + records.length * 12;
  const out = new Uint8Array(head + records.reduce((sum, r) => sum + r.text.length, 0));
  const write = new DataView(out.buffer);
  write.setUint16(0, 0);
  write.setUint16(2, records.length);
  write.setUint16(4, head);
  let offset = 0;
  records.forEach((record, i) => {
    const at = 6 + i * 12;
    record.ids.forEach((id, k) => write.setUint16(at + 2 * k, id));
    write.setUint16(at + 8, record.text.length);
    write.setUint16(at + 10, offset);
    out.set(record.text, head + offset);
    offset += record.text.length;
  });
  return out;
}

/** The checksum of a table: its big-endian 32-bit words summed, padded with zeros. */
function checksumOf(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const word =
      ((data[i] ?? 0) << 24) |
      ((data[i + 1] ?? 0) << 16) |
      ((data[i + 2] ?? 0) << 8) |
      (data[i + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/**
 * A WOFF file as the TrueType (or OpenType) file it was made from: the same tables, in the same
 * order, each padded to four bytes; with `family`, its typographic family set to it
 * (`withTypographicFamily`). Throws when the bytes are not a WOFF file it can read.
 */
export async function sfntFromWoff(woff: Uint8Array, family?: string): Promise<Uint8Array> {
  if (!isWoff(woff)) throw new Error("not a WOFF file");
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  const flavor = view.getUint32(4);
  const count = view.getUint16(12);
  if (WOFF_HEADER + count * WOFF_ENTRY > woff.length) throw new Error("a truncated WOFF file");
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    const at = WOFF_HEADER + i * WOFF_ENTRY;
    const tag = view.getUint32(at);
    const offset = view.getUint32(at + 4);
    const compressed = view.getUint32(at + 8);
    const original = view.getUint32(at + 12);
    const checksum = view.getUint32(at + 16);
    if (offset + compressed > woff.length) throw new Error("a truncated WOFF table");
    const stored = woff.subarray(offset, offset + compressed);
    const data = compressed < original ? await inflate(stored) : stored;
    if (data.length !== original) throw new Error("a WOFF table of the wrong length");
    if (tag === NAME_TAG && family !== undefined) {
      const named = withTypographicFamily(data, family);
      tables.push({ tag, checksum: checksumOf(named), data: named });
    } else {
      tables.push({ tag, checksum, data });
    }
  }
  const pad = (n: number) => (n + 3) & ~3;
  let size = 12 + count * SFNT_ENTRY;
  for (const table of tables) size += pad(table.data.length);
  const out = new Uint8Array(size);
  const sfnt = new DataView(out.buffer);
  let power = 1;
  let selector = 0;
  while (power * 2 <= count) {
    power *= 2;
    selector++;
  }
  sfnt.setUint32(0, flavor);
  sfnt.setUint16(4, count);
  sfnt.setUint16(6, power * 16);
  sfnt.setUint16(8, selector);
  sfnt.setUint16(10, count * 16 - power * 16);
  let offset = 12 + count * SFNT_ENTRY;
  tables.forEach((table, i) => {
    const at = 12 + i * SFNT_ENTRY;
    sfnt.setUint32(at, table.tag);
    sfnt.setUint32(at + 4, table.checksum);
    sfnt.setUint32(at + 8, offset);
    sfnt.setUint32(at + 12, table.data.length);
    out.set(table.data, offset);
    offset += pad(table.data.length);
  });
  return out;
}
