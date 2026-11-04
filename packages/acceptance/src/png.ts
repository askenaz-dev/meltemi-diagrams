import { deflateSync, inflateSync } from "node:zlib";

/** An image as 8-bit RGBA pixels, row by row. */
export interface Image {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Reads an 8-bit RGB or RGBA PNG without interlacing, as browsers write them. */
export function readPng(bytes: Uint8Array): Image {
  if (SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("Not a PNG file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Uint8Array[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const depth = body[8]!;
      const color = body[9]!;
      const interlace = body[12]!;
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) {
        throw new Error(
          `Unsupported PNG: depth ${depth}, colour type ${color}, interlace ${interlace}.`,
        );
      }
      channels = color === 6 ? 4 : 3;
    } else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels]! : 0;
      const b = previous[i]!;
      const c = i >= channels ? previous[i - channels]! : 0;
      let value = line[i]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = row[x * channels]!;
      out[o + 1] = row[x * channels + 1]!;
      out[o + 2] = row[x * channels + 2]!;
      out[o + 3] = channels === 4 ? row[x * channels + 3]! : 255;
    }
    previous.set(row);
  }
  return { width, height, pixels: out };
}

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Writes RGBA pixels as a PNG. */
export function writePng(image: Image): Uint8Array {
  const raw = new Uint8Array(image.height * (image.width * 4 + 1));
  for (let y = 0; y < image.height; y++) {
    raw.set(
      image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      y * (image.width * 4 + 1) + 1,
    );
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(
      [...type].map((c) => c.charCodeAt(0)),
      4,
    );
    out.set(body, 8);
    view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const h = new DataView(header.buffer);
  h.setUint32(0, image.width);
  h.setUint32(4, image.height);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** What a pixel comparison found. */
export interface Comparison {
  /** Pixels whose channels differ by more than the threshold, as a share of all pixels. */
  readonly ratio: number;
  readonly differing: number;
  /** The longest horizontal run of differing pixels. */
  readonly longestRun: number;
  readonly passed: boolean;
  /** The reference in grey with the differing pixels in red; undefined when sizes differ. */
  readonly diff?: Image;
  readonly reason?: string;
}

export const VISUAL_TOLERANCE = { channel: 16, ratio: 0.001, run: 2 } as const;

/** Compares two images within the visual tolerance. */
export function compareImages(reference: Image, actual: Image): Comparison {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return {
      ratio: 1,
      differing: Math.max(reference.width * reference.height, actual.width * actual.height),
      longestRun: Infinity,
      passed: false,
      reason: `size ${actual.width} × ${actual.height}, reference ${reference.width} × ${reference.height}`,
    };
  }
  const { width, height } = reference;
  const diff = new Uint8Array(width * height * 4);
  let differing = 0;
  let longestRun = 0;
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let different = false;
      for (let c = 0; c < 4; c++) {
        if (Math.abs(reference.pixels[o + c]! - actual.pixels[o + c]!) > VISUAL_TOLERANCE.channel)
          different = true;
      }
      if (different) {
        differing++;
        run++;
        longestRun = Math.max(longestRun, run);
        diff.set([220, 30, 30, 255], o);
      } else {
        run = 0;
        const grey = Math.round(
          (reference.pixels[o]! * 0.3 +
            reference.pixels[o + 1]! * 0.59 +
            reference.pixels[o + 2]! * 0.11) *
            0.4 +
            150,
        );
        diff.set([grey, grey, grey, 255], o);
      }
    }
  }
  const ratio = differing / (width * height);
  return {
    ratio,
    differing,
    longestRun,
    passed: ratio <= VISUAL_TOLERANCE.ratio && longestRun <= VISUAL_TOLERANCE.run,
    diff: { width, height, pixels: diff },
  };
}
