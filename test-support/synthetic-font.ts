/**
 * Builds a small TrueType font for tests and the corpus: printable ASCII as plain rectangles,
 * 600 units wide (300 for the space) on a 1000-unit em. The family, weight and `fsType` are
 * parameters, so tests can register project fonts with any name and embedding permission without
 * shipping third-party font files. Released under CC0-1.0 with the corpus.
 *
 * Run `pnpm exec tsx test-support/synthetic-font.ts <out.ttf> [family] [fsType]` to write one.
 */

export interface SyntheticFontOptions {
  readonly family: string;
  readonly weight?: number;
  /** OS/2 embedding permissions; 0 is installable, 2 is restricted. */
  readonly fsType?: number;
}

const FIRST = 32;
const LAST = 126;
const UNITS = 1000;

class Writer {
  private readonly bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    return this.u16(Math.floor(v / 0x10000) & 0xffff).u16(v & 0xffff);
  }
  raw(data: Uint8Array | number[]) {
    for (const b of data) this.bytes.push(b);
    return this;
  }
  pad4() {
    while (this.bytes.length % 4 !== 0) this.bytes.push(0);
    return this;
  }
  get length() {
    return this.bytes.length;
  }
  done(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum =
      (sum +
        ((data[i]! << 24) |
          ((data[i + 1] ?? 0) << 16) |
          ((data[i + 2] ?? 0) << 8) |
          (data[i + 3] ?? 0))) >>>
      0;
  }
  return sum;
}

function utf16(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    out.push(code >> 8, code & 0xff);
  }
  return out;
}

export function syntheticFont(options: SyntheticFontOptions): Uint8Array {
  const weight = options.weight ?? 400;
  const fsType = options.fsType ?? 0;
  const count = 1 + (LAST - FIRST + 1); // .notdef, then one glyph per character
  const advance = (gid: number) => (gid === 1 ? 300 : 600);

  // glyf and loca: empty .notdef and space, rectangles elsewhere.
  const glyf = new Writer();
  const offsets: number[] = [];
  for (let gid = 0; gid < count; gid++) {
    offsets.push(glyf.length);
    if (gid <= 1) continue;
    glyf.i16(1).i16(50).i16(0).i16(550).i16(700); // one contour and its bounds
    glyf.u16(3).u16(0); // last point index, no instructions
    glyf.u8(1).u8(1).u8(1).u8(1); // four on-curve points
    for (const dx of [50, 500, 0, -500]) glyf.i16(dx);
    for (const dy of [0, 0, 700, 0]) glyf.i16(dy);
  }
  offsets.push(glyf.length);
  const loca = new Writer();
  for (const offset of offsets) loca.u16(offset / 2);

  const head = new Writer()
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0)
    .u32(0x5f0f3cf5)
    .u16(0x000b)
    .u16(UNITS)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .i16(0)
    .i16(0)
    .i16(600)
    .i16(700)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(0)
    .i16(0);
  const hhea = new Writer()
    .u32(0x00010000)
    .i16(800)
    .i16(-200)
    .i16(0)
    .u16(600)
    .i16(0)
    .i16(0)
    .i16(550)
    .i16(1)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .u16(count);
  const maxp = new Writer().u32(0x00010000).u16(count).u16(4).u16(1);
  for (let i = 0; i < 11; i++) maxp.u16(i === 2 ? 2 : 0); // maxZones is 2
  const os2 = new Writer().u16(4).i16(600).u16(weight).u16(5).u16(fsType);
  for (let i = 0; i < 11; i++) os2.i16(0); // sub/superscript, strikeout, family class
  os2.raw(new Array(10).fill(0)); // panose
  os2.u32(1).u32(0).u32(0).u32(0); // Basic Latin
  os2.raw([0x4d, 0x44, 0x47, 0x20]); // vendor "MDG "
  os2.u16(0x0040).u16(FIRST).u16(LAST);
  os2.i16(800).i16(-200).i16(0).u16(800).u16(200);
  os2.u32(1).u32(0);
  os2.i16(500).i16(700).u16(0).u16(32).u16(1);
  const hmtx = new Writer();
  for (let gid = 0; gid < count; gid++) hmtx.u16(advance(gid)).i16(gid <= 1 ? 0 : 50);
  const cmap = new Writer()
    .u16(0)
    .u16(1)
    .u16(3)
    .u16(1)
    .u32(12)
    .u16(4)
    .u16(32)
    .u16(0)
    .u16(4)
    .u16(4)
    .u16(1)
    .u16(0)
    .u16(LAST)
    .u16(0xffff)
    .u16(0)
    .u16(FIRST)
    .u16(0xffff)
    .u16((1 - FIRST + 0x10000) & 0xffff)
    .u16(1)
    .u16(0)
    .u16(0);
  const names: [number, string][] = [
    [1, options.family],
    [2, "Regular"],
    [4, `${options.family} Regular`],
    [6, options.family.replace(/\s+/g, "") + "-Regular"],
  ];
  const nameTable = new Writer()
    .u16(0)
    .u16(names.length)
    .u16(6 + names.length * 12);
  const strings: number[] = [];
  for (const [id, text] of names) {
    const encoded = utf16(text);
    nameTable.u16(3).u16(1).u16(0x0409).u16(id).u16(encoded.length).u16(strings.length);
    strings.push(...encoded);
  }
  nameTable.raw(strings);
  const post = new Writer()
    .u32(0x00030000)
    .u32(0)
    .i16(-100)
    .i16(50)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0);

  const tables: [string, Uint8Array][] = [
    ["OS/2", os2.done()],
    ["cmap", cmap.done()],
    ["glyf", glyf.done()],
    ["head", head.done()],
    ["hhea", hhea.done()],
    ["hmtx", hmtx.done()],
    ["loca", loca.done()],
    ["maxp", maxp.done()],
    ["name", nameTable.done()],
    ["post", post.done()],
  ];
  const font = new Writer()
    .u32(0x00010000)
    .u16(tables.length)
    .u16(128)
    .u16(3)
    .u16(tables.length * 16 - 128);
  let offset = 12 + tables.length * 16;
  const placed: number[] = [];
  for (const [, data] of tables) {
    placed.push(offset);
    offset += Math.ceil(data.length / 4) * 4;
  }
  tables.forEach(([tag, data], i) => {
    font.raw([...tag].map((c) => c.charCodeAt(0)));
    font.u32(checksum(data)).u32(placed[i]!).u32(data.length);
  });
  for (const [, data] of tables) font.raw(data).pad4();
  return font.done();
}

// `tsx test-support/synthetic-font.ts <out> [family] [fsType]` writes a font file.
if (process.argv[1]?.endsWith("synthetic-font.ts") && process.argv[2]) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    process.argv[2],
    syntheticFont({
      family: process.argv[3] ?? "Corpus Sans",
      fsType: Number(process.argv[4] ?? 0),
    }),
  );
}
