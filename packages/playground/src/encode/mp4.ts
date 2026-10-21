// An MP4 writer for H.264 chunks in AVC format from the browser's encoder: `ftyp`, then `moov`
// before `mdat` (fast start), one video track whose sample table points into one chunk.
import { messages } from "../messages/index.js";
import type { EncodedFrame } from "./webm.js";

const encoder = new TextEncoder();

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Big-endian integers and the like, written into a growing list of bytes. */
class Bytes {
  readonly parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v >> 8).u8(v);
  }
  u32(v: number) {
    return this.u8(v >>> 24)
      .u8(v >>> 16)
      .u8(v >>> 8)
      .u8(v);
  }
  i32(v: number) {
    return this.u32(v >>> 0);
  }
  bytes(data: Uint8Array | readonly number[]) {
    for (const b of data) this.parts.push(b);
    return this;
  }
  text(value: string) {
    return this.bytes(encoder.encode(value));
  }
  zeros(count: number) {
    for (let i = 0; i < count; i++) this.parts.push(0);
    return this;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const body = concat(children);
  return concat([
    new Bytes()
      .u32(8 + body.length)
      .text(type)
      .done(),
    body,
  ]);
}

const full = (type: string, version: number, flags: number, body: Uint8Array) =>
  box(
    type,
    new Bytes()
      .u8(version)
      .u8(flags >> 16)
      .u16(flags)
      .done(),
    body,
  );

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

export interface Mp4Options {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The `avcC` record the encoder gave as its decoder configuration description. */
  readonly avcc: Uint8Array;
  readonly application: string;
}

/**
 * An MP4 file of H.264 frames in decoding order, `fps` frames a second. Frames whose
 * presentation time differs from their decoding order get composition offsets and an edit list.
 */
export function writeMp4(frames: readonly EncodedFrame[], options: Mp4Options): Uint8Array {
  const timescale = options.fps * 1000;
  const delta = 1000;
  const count = frames.length;
  const duration = count * delta;
  const movieDuration = Math.round((duration / timescale) * 1000);

  // Presentation times in the track's timescale, from the chunks' microseconds.
  const pts = frames.map((f) => Math.round((f.timestamp * timescale) / 1_000_000));
  let shift = 0;
  for (let i = 0; i < count; i++) shift = Math.max(shift, i * delta - pts[i]!);
  const offsets = pts.map((p, i) => p + shift - i * delta);
  const reordered = offsets.some((o) => o !== 0);

  const ftyp = box(
    "ftyp",
    new Bytes().text("isom").u32(512).text("isom").text("iso2").text("avc1").text("mp41").done(),
  );
  const mvhd = full(
    "mvhd",
    0,
    0,
    new Bytes()
      .u32(0)
      .u32(0)
      .u32(1000)
      .u32(movieDuration)
      .u32(0x00010000)
      .u16(0x0100)
      .zeros(10)
      .bytes(MATRIX.flatMap((v) => [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]))
      .zeros(24)
      .u32(2)
      .done(),
  );
  const tkhd = full(
    "tkhd",
    0,
    3,
    new Bytes()
      .u32(0)
      .u32(0)
      .u32(1)
      .u32(0)
      .u32(movieDuration)
      .zeros(8)
      .u16(0)
      .u16(0)
      .u16(0)
      .u16(0)
      .bytes(MATRIX.flatMap((v) => [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]))
      .u32(options.width * 0x10000)
      .u32(options.height * 0x10000)
      .done(),
  );
  const edts = reordered
    ? box(
        "edts",
        full("elst", 0, 0, new Bytes().u32(1).u32(movieDuration).u32(shift).u16(1).u16(0).done()),
      )
    : new Uint8Array(0);
  const mdhd = full(
    "mdhd",
    0,
    0,
    new Bytes().u32(0).u32(0).u32(timescale).u32(duration).u16(0x55c4).u16(0).done(),
  );
  const hdlr = full(
    "hdlr",
    0,
    0,
    new Bytes().u32(0).text("vide").zeros(12).text("VideoHandler").u8(0).done(),
  );
  const vmhd = full("vmhd", 0, 1, new Bytes().zeros(8).done());
  const dinf = box(
    "dinf",
    full("dref", 0, 0, concat([new Bytes().u32(1).done(), full("url ", 0, 1, new Uint8Array(0))])),
  );
  const name = new Uint8Array(32);
  const label = encoder.encode(options.application.slice(0, 31));
  name[0] = label.length;
  name.set(label, 1);
  const avc1 = box(
    "avc1",
    new Bytes()
      .zeros(6)
      .u16(1)
      .zeros(16)
      .u16(options.width)
      .u16(options.height)
      .u32(0x00480000)
      .u32(0x00480000)
      .u32(0)
      .u16(1)
      .bytes(name)
      .u16(0x0018)
      .u16(0xffff)
      .done(),
    box("avcC", options.avcc),
  );
  const stsd = full("stsd", 0, 0, concat([new Bytes().u32(1).done(), avc1]));
  const stts = full("stts", 0, 0, new Bytes().u32(1).u32(count).u32(delta).done());
  const keys = frames.flatMap((f, i) => (f.key ? [i + 1] : []));
  const stss = full(
    "stss",
    0,
    0,
    new Bytes()
      .u32(keys.length)
      .bytes(keys.flatMap((k) => [k >>> 24, (k >>> 16) & 0xff, (k >>> 8) & 0xff, k & 0xff]))
      .done(),
  );
  const ctts = reordered
    ? full(
        "ctts",
        0,
        0,
        (() => {
          const b = new Bytes().u32(count);
          for (const offset of offsets) b.u32(1).u32(offset);
          return b.done();
        })(),
      )
    : new Uint8Array(0);
  const stsc = full("stsc", 0, 0, new Bytes().u32(1).u32(1).u32(count).u32(1).done());
  const sizes = new Bytes().u32(0).u32(count);
  for (const frame of frames) sizes.u32(frame.data.length);
  const stsz = full("stsz", 0, 0, sizes.done());

  // The chunk offset depends on the size of moov, which does not depend on its value.
  const moovFor = (offset: number) => {
    const stco = full("stco", 0, 0, new Bytes().u32(1).u32(offset).done());
    const stbl = box("stbl", stsd, stts, ...(reordered ? [ctts] : []), stss, stsc, stsz, stco);
    const minf = box("minf", vmhd, dinf, stbl);
    const mdia = box("mdia", mdhd, hdlr, minf);
    const trak = box("trak", tkhd, ...(reordered ? [edts] : []), mdia);
    return box("moov", mvhd, trak);
  };
  const payload = frames.reduce((n, f) => n + f.data.length, 0);
  const moovSize = moovFor(0).length;
  const offset = ftyp.length + moovSize + 8;
  if (offset + payload > 0xffffffff) throw new Error(messages().video.mp4TooLarge);
  const moov = moovFor(offset);
  const mdatHeader = new Bytes()
    .u32(8 + payload)
    .text("mdat")
    .done();
  return concat([ftyp, moov, mdatHeader, ...frames.map((f) => f.data)]);
}
