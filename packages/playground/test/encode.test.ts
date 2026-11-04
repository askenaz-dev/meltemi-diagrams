import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findFfmpeg } from "@meltemi/diagrams-capture";
import { GifWriter, Histogram, Quantizer, gifDelays, lzw, medianCut } from "../src/encode/gif.js";
import { writeMp4 } from "../src/encode/mp4.js";
import { writeWebm, type EncodedFrame } from "../src/encode/webm.js";

const ffmpeg = findFfmpeg();
const ffprobe = ffmpeg
  ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
  : null;
const probe = ffprobe && existsSync(ffprobe) ? ffprobe : null;
const scratch = mkdtempSync(join(tmpdir(), "pg-encode-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Decodes GIF LZW data (after the code size byte, in sub-blocks) back to indices. */
function unlzw(data: Uint8Array, at: number, count: number): { indices: number[]; end: number } {
  const minCodeSize = data[at++]!;
  const bytes: number[] = [];
  for (let size = data[at++]!; size > 0; size = data[at++]!) {
    for (let i = 0; i < size; i++) bytes.push(data[at++]!);
  }
  const clear = 1 << minCodeSize;
  let size = minCodeSize + 1;
  let table: number[][] = [];
  const reset = () => {
    table = Array.from({ length: clear + 2 }, (_, i) => (i < clear ? [i] : []));
    size = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let bit = 0;
  let previous: number[] | undefined;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, bit++) {
      code |= ((bytes[bit >> 3]! >> (bit & 7)) & 1) << i;
    }
    return code;
  };
  while (out.length < count) {
    const code = read();
    if (code === clear) {
      reset();
      previous = undefined;
      continue;
    }
    if (code === clear + 1) break;
    let entry: number[];
    if (code < table.length) entry = table[code]!;
    else entry = [...previous!, previous![0]!];
    out.push(...entry);
    if (previous) table.push([...previous, entry[0]!]);
    previous = entry;
    if (table.length === 1 << size && size < 12) size++;
  }
  return { indices: out, end: at };
}

/** RGBA pixels of a square of `color` at `x` on white. */
function frame(
  width: number,
  height: number,
  x: number,
  color: [number, number, number],
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4).fill(255);
  for (let y = 10; y < 30; y++) {
    for (let i = x; i < x + 20; i++) {
      const p = (y * width + i) * 4;
      rgba.set([...color, 255], p);
    }
  }
  return rgba;
}

describe("GIF", () => {
  it("compresses indices that decode back exactly, through code size changes and clears", () => {
    const indices = Uint8Array.from({ length: 60_000 }, (_, i) => ((i * 7919) >> 3) % 200);
    const data = lzw(indices, 8);
    expect(unlzw(data, 0, indices.length).indices).toEqual([...indices]);
    const flat = new Uint8Array(5000).fill(3);
    expect(unlzw(lzw(flat, 2), 0, flat.length).indices).toEqual([...flat]);
  });

  it("finds the colours of flat pictures", () => {
    const histogram = new Histogram();
    histogram.add(frame(64, 40, 5, [37, 99, 235]));
    const palette = medianCut(histogram, 256);
    const colours = [];
    for (let i = 0; i < palette.length; i += 3) colours.push([...palette.subarray(i, i + 3)]);
    expect(colours).toHaveLength(2);
    expect(colours).toContainEqual([252, 252, 252]);
    const quantizer = new Quantizer(palette, false);
    const indices = quantizer.map(frame(64, 40, 5, [37, 99, 235]), 64, 40);
    expect(new Set(indices).size).toBe(2);
  });

  it("writes an animation that loops, with frames cropped to what changed", () => {
    const width = 64;
    const height = 40;
    const frames = [0, 10, 20, 20, 30].map((x) => frame(width, height, x, [220, 38, 38]));
    const histogram = new Histogram();
    for (const f of frames) histogram.add(f);
    const palette = medianCut(histogram);
    const quantizer = new Quantizer(palette, false);
    const writer = new GifWriter(width, height, palette, false);
    const delays = gifDelays(frames.length, 15);
    expect(gifDelays(3, 15)).toEqual([7, 6, 7]);
    frames.forEach((f, i) => writer.add(quantizer.map(f, width, height), delays[i]!));
    const gif = writer.finish();
    expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe("GIF89a");
    expect(gif[gif.length - 1]).toBe(0x3b);
    expect(new TextDecoder().decode(gif)).toContain("NETSCAPE2.0");
    // Four images: the repeated frame lengthens the one before.
    const descriptors = [...gif].filter(
      (b, i) => b === 0x2c && gif[i - 1] === 0 && gif[i - 7] === 0xf9,
    ).length;
    expect(descriptors).toBe(4);
    if (probe) {
      const file = join(scratch, "square.gif");
      writeFileSync(file, gif);
      const out = execFileSync(
        probe,
        [
          "-v",
          "error",
          "-count_frames",
          "-show_entries",
          "stream=codec_name,width,height,nb_read_frames",
          "-of",
          "json",
          file,
        ],
        { encoding: "utf8" },
      );
      const stream = JSON.parse(out).streams[0];
      expect(stream).toMatchObject({ codec_name: "gif", width, height });
      expect(Number(stream.nb_read_frames)).toBe(4);
    }
  });

  it("keeps a transparent index and whole frames for transparent animations", () => {
    const width = 16;
    const height = 8;
    const clear = new Uint8Array(width * height * 4);
    const histogram = new Histogram();
    histogram.add(clear);
    const palette = medianCut(histogram, 256, true);
    const quantizer = new Quantizer(palette, true);
    const indices = quantizer.map(clear, width, height);
    expect(new Set(indices)).toEqual(new Set([palette.length / 3 - 1]));
  });
});

/** The top-level EBML element IDs of a WebM file, and the segment's children. */
function ebmlIds(
  data: Uint8Array,
  start = 0,
  end = data.length,
): { id: number; start: number; end: number }[] {
  const out: { id: number; start: number; end: number }[] = [];
  let at = start;
  const vint = (keepMarker: boolean) => {
    const first = data[at]!;
    let length = 1;
    while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
    let value = keepMarker ? first : first & (0xff >> length);
    for (let i = 1; i < length; i++) value = value * 256 + data[at + i]!;
    at += length;
    return value;
  };
  while (at < end) {
    const id = vint(true);
    const size = vint(false);
    out.push({ id, start: at, end: at + size });
    at += size;
  }
  return out;
}

const chunks = (count: number, fps: number): EncodedFrame[] =>
  Array.from({ length: count }, (_, i) => ({
    data: Uint8Array.from({ length: 50 + i }, (_, j) => (i + j) & 0xff),
    timestamp: Math.round((i * 1_000_000) / fps),
    key: i % (fps * 2) === 0,
  }));

describe("WebM", () => {
  it("writes a segment with information, a track, clusters per keyframe and cues", () => {
    const webm = writeWebm(chunks(90, 30), {
      codec: "V_VP9",
      width: 640,
      height: 360,
      durationMs: 3000,
      application: "Meltemi Diagrams test",
    });
    const top = ebmlIds(webm);
    expect(top.map((e) => e.id.toString(16))).toEqual(["1a45dfa3", "18538067"]);
    const segment = ebmlIds(webm, top[1]!.start, top[1]!.end).map((e) => e.id.toString(16));
    expect(segment).toEqual([
      "114d9b74",
      "1549a966",
      "1654ae6b",
      "1f43b675",
      "1f43b675",
      "1c53bb6b",
    ]);
    if (probe) {
      const file = join(scratch, "synthetic.webm");
      writeFileSync(file, webm);
      const out = execFileSync(
        probe,
        [
          "-v",
          "error",
          "-count_packets",
          "-show_entries",
          "stream=codec_name,width,height,nb_read_packets:format=duration",
          "-of",
          "json",
          file,
        ],
        { encoding: "utf8" },
      );
      const parsed = JSON.parse(out);
      expect(parsed.streams[0]).toMatchObject({ codec_name: "vp9", width: 640, height: 360 });
      expect(Number(parsed.streams[0].nb_read_packets)).toBe(90);
      expect(Number(parsed.format.duration)).toBeCloseTo(3, 1);
    }
  });
});

describe("MP4", () => {
  /** The boxes of an MP4 level: type, start of the body and end. */
  const boxes = (data: Uint8Array, start = 0, end = data.length) => {
    const view = new DataView(data.buffer, data.byteOffset);
    const out: { type: string; start: number; end: number }[] = [];
    for (let at = start; at < end;) {
      const size = view.getUint32(at);
      out.push({
        type: new TextDecoder().decode(data.subarray(at + 4, at + 8)),
        start: at + 8,
        end: at + size,
      });
      at += size;
    }
    return out;
  };

  it("writes moov before mdat with a sample table that points at every frame", () => {
    const frames = chunks(60, 30);
    const mp4 = writeMp4(frames, {
      width: 1280,
      height: 720,
      fps: 30,
      avcc: Uint8Array.from([1, 0x64, 0, 0x28, 0xff, 0xe0, 0]),
      application: "Meltemi Diagrams test",
    });
    const top = boxes(mp4);
    expect(top.map((b) => b.type)).toEqual(["ftyp", "moov", "mdat"]);
    const find = (
      list: ReturnType<typeof boxes>,
      path: string[],
    ): { start: number; end: number } => {
      const [head, ...rest] = path;
      const found = list.find((b) => b.type === head)!;
      return rest.length === 0 ? found : find(boxes(mp4, found.start, found.end), rest);
    };
    const moov = top[1]!;
    const stbl = find(boxes(mp4, moov.start, moov.end), ["trak", "mdia", "minf", "stbl"]);
    const view = new DataView(mp4.buffer);
    const children = boxes(mp4, stbl.start, stbl.end);
    expect(children.map((b) => b.type)).toEqual(["stsd", "stts", "stss", "stsc", "stsz", "stco"]);
    const stco = children.find((b) => b.type === "stco")!;
    expect(view.getUint32(stco.start + 8)).toBe(top[2]!.start);
    const stsz = children.find((b) => b.type === "stsz")!;
    expect(view.getUint32(stsz.start + 8)).toBe(60);
    expect(view.getUint32(stsz.start + 12)).toBe(50);
    const stss = children.find((b) => b.type === "stss")!;
    expect(view.getUint32(stss.start + 4)).toBe(1);
    // The samples are the frames, in order.
    expect(mp4.subarray(top[2]!.start, top[2]!.start + 50)).toEqual(frames[0]!.data);
  });

  it("adds composition offsets and an edit list when frames are reordered", () => {
    const frames = chunks(4, 30);
    const reordered = [frames[0]!, frames[2]!, frames[1]!, frames[3]!];
    const mp4 = writeMp4(reordered, {
      width: 64,
      height: 64,
      fps: 30,
      avcc: Uint8Array.from([1, 0x64, 0, 0x28, 0xff, 0xe0, 0]),
      application: "t",
    });
    const text = new TextDecoder("latin1").decode(mp4);
    expect(text).toContain("ctts");
    expect(text).toContain("elst");
  });
});
