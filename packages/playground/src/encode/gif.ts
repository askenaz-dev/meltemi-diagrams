// A GIF encoder for the playground's exports: one palette for the whole animation (median cut
// over a histogram of sampled frames), weak ordered dithering as FFmpeg's `paletteuse=dither=bayer`,
// frames cropped to the rectangle that changed, LZW, and looping. Deterministic: the same frames
// give the same bytes.

/** Pixels with less alpha than this are transparent when the palette keeps a transparent index. */
const ALPHA_CUT = 128;

/** Counts of colours, at 5 bits a channel, of RGBA pixels. */
export class Histogram {
  readonly counts = new Uint32Array(1 << 15);
  transparent = 0;

  add(rgba: Uint8Array | Uint8ClampedArray, step = 1): void {
    for (let i = 0; i < rgba.length; i += 4 * step) {
      if (rgba[i + 3]! < ALPHA_CUT) {
        this.transparent++;
        continue;
      }
      this.counts[((rgba[i]! >> 3) << 10) | ((rgba[i + 1]! >> 3) << 5) | (rgba[i + 2]! >> 3)]!++;
    }
  }
}

interface Box {
  colors: number[];
  total: number;
}

/**
 * A palette of at most `max` colours by median cut, as RGB triples; with `transparent`, the last
 * entry is kept for transparent pixels.
 */
export function medianCut(histogram: Histogram, max = 256, transparent = false): Uint8Array {
  const limit = Math.max(1, Math.min(256, max) - (transparent ? 1 : 0));
  const colors: number[] = [];
  let total = 0;
  for (let c = 0; c < histogram.counts.length; c++) {
    if (histogram.counts[c]! > 0) {
      colors.push(c);
      total += histogram.counts[c]!;
    }
  }
  const boxes: Box[] = colors.length > 0 ? [{ colors, total }] : [];
  const channel = (c: number, k: number) => (c >> (10 - 5 * k)) & 31;
  while (boxes.length < limit) {
    // Split the box with the most pixels among those with more than one colour.
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i]!.colors.length > 1 && (best < 0 || boxes[i]!.total > boxes[best]!.total))
        best = i;
    }
    if (best < 0) break;
    const box = boxes[best]!;
    let axis = 0;
    let widest = -1;
    for (let k = 0; k < 3; k++) {
      let low = 31;
      let high = 0;
      for (const c of box.colors) {
        const v = channel(c, k);
        if (v < low) low = v;
        if (v > high) high = v;
      }
      if (high - low > widest) {
        widest = high - low;
        axis = k;
      }
    }
    box.colors.sort((a, b) => channel(a, axis) - channel(b, axis) || a - b);
    let half = 0;
    let cut = 0;
    while (
      cut < box.colors.length - 1 &&
      half + histogram.counts[box.colors[cut]!]! <= box.total / 2
    ) {
      half += histogram.counts[box.colors[cut]!]!;
      cut++;
    }
    cut = Math.max(1, cut);
    const left = box.colors.slice(0, cut);
    const right = box.colors.slice(cut);
    const sum = (list: number[]) => list.reduce((n, c) => n + histogram.counts[c]!, 0);
    boxes.splice(best, 1, { colors: left, total: sum(left) }, { colors: right, total: sum(right) });
  }
  const palette = new Uint8Array((boxes.length + (transparent ? 1 : 0)) * 3);
  boxes.forEach((box, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of box.colors) {
      const n = histogram.counts[c]!;
      r += (channel(c, 0) * 8 + 4) * n;
      g += (channel(c, 1) * 8 + 4) * n;
      b += (channel(c, 2) * 8 + 4) * n;
    }
    palette[i * 3] = Math.round(r / box.total);
    palette[i * 3 + 1] = Math.round(g / box.total);
    palette[i * 3 + 2] = Math.round(b / box.total);
  });
  return palette;
}

/** The 8 × 8 Bayer matrix, 0 to 63. */
const BAYER = (() => {
  const m = new Int8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0;
      for (let bit = 0, xc = x ^ y, yc = y; bit < 3; bit++, xc >>= 1, yc >>= 1) {
        v = (v << 2) | ((yc & 1) << 1) | (xc & 1);
      }
      m[y * 8 + x] = v;
    }
  }
  return m;
})();

/**
 * Maps RGBA pixels to palette indices with weak ordered dithering (a few levels a channel, as
 * FFmpeg's `bayer_scale=5`); transparent pixels take the palette's last index when it keeps one.
 */
export class Quantizer {
  private readonly cache = new Map<number, number>();
  private readonly colors: number;

  constructor(
    readonly palette: Uint8Array,
    readonly transparent: boolean,
  ) {
    this.colors = palette.length / 3 - (transparent ? 1 : 0);
  }

  private nearest(r: number, g: number, b: number): number {
    const key = (r << 16) | (g << 8) | b;
    const known = this.cache.get(key);
    if (known !== undefined) return known;
    let best = 0;
    let bestDistance = Infinity;
    const p = this.palette;
    for (let i = 0; i < this.colors; i++) {
      const dr = r - p[i * 3]!;
      const dg = g - p[i * 3 + 1]!;
      const db = b - p[i * 3 + 2]!;
      const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
        if (distance === 0) break;
      }
    }
    if (this.cache.size < 1 << 20) this.cache.set(key, best);
    return best;
  }

  map(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
    const out = new Uint8Array(width * height);
    const clear = this.palette.length / 3 - 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (this.transparent && rgba[i + 3]! < ALPHA_CUT) {
          out[y * width + x] = clear;
          continue;
        }
        const d = (BAYER[(y & 7) * 8 + (x & 7)]! >> 4) - 2;
        const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
        out[y * width + x] = this.nearest(
          clamp(rgba[i]! + d),
          clamp(rgba[i + 1]! + d),
          clamp(rgba[i + 2]! + d),
        );
      }
    }
    return out;
  }
}

/** LZW-compressed image data in GIF sub-blocks, after the minimum code size byte. */
export function lzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out: number[] = [minCodeSize];
  const block: number[] = [];
  let bits = 0;
  let buffer = 0;
  const flushByte = (byte: number) => {
    block.push(byte);
    if (block.length === 255) {
      out.push(255, ...block);
      block.length = 0;
    }
  };
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let size = minCodeSize + 1;
  let next = end + 1;
  const write = (code: number) => {
    buffer |= code << bits;
    bits += size;
    while (bits >= 8) {
      flushByte(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  let table = new Map<number, number>();
  write(clear);
  let prefix = indices.length > 0 ? indices[0]! : 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      table.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      write(clear);
      table = new Map();
      size = minCodeSize + 1;
      next = end + 1;
    }
    prefix = k;
  }
  if (indices.length > 0) write(prefix);
  write(end);
  if (bits > 0) flushByte(buffer & 0xff);
  if (block.length > 0) out.push(block.length, ...block);
  out.push(0);
  return Uint8Array.from(out);
}

/**
 * Writes an animated GIF frame by frame: the first frame whole, then the rectangle of each frame
 * that differs from the one before (the rest stays), with delays in centiseconds. With a
 * transparent index, every frame is whole and replaces the one before, so that what disappears
 * does not stay behind transparent pixels.
 */
export class GifWriter {
  private readonly parts: Uint8Array[] = [];
  private previous: Uint8Array | undefined;
  private readonly bits: number;
  private pendingDelay = 0;
  private pending: { indices: Uint8Array; x: number; y: number; w: number; h: number } | undefined;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly palette: Uint8Array,
    readonly transparent: boolean,
  ) {
    const colors = palette.length / 3;
    this.bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, colors))));
    const size = 1 << this.bits;
    const header = new Uint8Array(13 + size * 3 + 19);
    header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
    header[6] = width & 0xff;
    header[7] = width >> 8;
    header[8] = height & 0xff;
    header[9] = height >> 8;
    header[10] = 0x80 | ((this.bits - 1) << 4) | (this.bits - 1);
    header[11] = 0;
    header[12] = 0;
    header.set(palette, 13);
    // NETSCAPE2.0: loop forever.
    header.set(
      [
        0x21,
        0xff,
        0x0b,
        ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)),
        0x03,
        0x01,
        0x00,
        0x00,
        0x00,
      ],
      13 + size * 3,
    );
    this.parts.push(header);
  }

  /** Adds a frame of palette indices, shown for `delay` centiseconds. */
  add(indices: Uint8Array, delay: number): void {
    const previous = this.previous;
    let x0 = 0;
    let y0 = 0;
    let x1 = this.width - 1;
    let y1 = this.height - 1;
    if (previous && this.transparent) {
      let same = true;
      for (let i = 0; i < indices.length && same; i++) same = indices[i] === previous[i];
      if (same) {
        this.pendingDelay += delay;
        return;
      }
    } else if (previous) {
      x0 = this.width;
      y0 = this.height;
      x1 = -1;
      y1 = -1;
      for (let y = 0; y < this.height; y++) {
        const row = y * this.width;
        for (let x = 0; x < this.width; x++) {
          if (indices[row + x] !== previous[row + x]) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) {
        // Nothing changed: the previous frame lasts longer.
        this.pendingDelay += delay;
        return;
      }
    }
    this.flush();
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const crop = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      crop.set(indices.subarray((y0 + y) * this.width + x0, (y0 + y) * this.width + x0 + w), y * w);
    }
    this.pending = { indices: crop, x: x0, y: y0, w, h };
    this.pendingDelay = delay;
    this.previous = indices;
  }

  private flush(): void {
    const frame = this.pending;
    if (!frame) return;
    const delay = Math.min(0xffff, Math.max(0, Math.round(this.pendingDelay)));
    const clear = this.palette.length / 3 - 1;
    const control = Uint8Array.from([
      0x21,
      0xf9,
      0x04,
      // Disposal 1 (keep) for opaque frames; 2 (back to transparent) with a transparent index.
      this.transparent ? (2 << 2) | 1 : 1 << 2,
      delay & 0xff,
      delay >> 8,
      this.transparent ? clear : 0,
      0,
    ]);
    const descriptor = Uint8Array.from([
      0x2c,
      frame.x & 0xff,
      frame.x >> 8,
      frame.y & 0xff,
      frame.y >> 8,
      frame.w & 0xff,
      frame.w >> 8,
      frame.h & 0xff,
      frame.h >> 8,
      0,
    ]);
    this.parts.push(control, descriptor, lzw(frame.indices, Math.max(2, this.bits)));
    this.pending = undefined;
  }

  finish(): Uint8Array {
    this.flush();
    this.parts.push(Uint8Array.from([0x3b]));
    const size = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * Delays in centiseconds of frames shown at `fps`, rounded so that their sum follows the clock:
 * 15 fps gives 7, 7, 6, 7, 7, 6…
 */
export function gifDelays(count: number, fps: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps),
  );
}
