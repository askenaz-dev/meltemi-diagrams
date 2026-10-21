import { describe, expect, it } from "vitest";
import { IMAGE_MAX_BYTES, base64, defaultImageSize, readImage } from "../src/index.js";

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const c of part) out.push(c.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out);
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

function png(width: number, height: number): Uint8Array {
  return bytes(
    [0x89],
    "PNG",
    [0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    "IHDR",
    be32(width),
    be32(height),
    [8, 6, 0, 0, 0],
  );
}

describe("readImage", () => {
  it("reads the size of a PNG and embeds it", () => {
    const result = readImage(png(320, 80));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image).toMatchObject({ format: "png", width: 320, height: 80 });
    expect(result.image.href.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
  });

  it("reads the size of a JPEG from its frame header", () => {
    const jpeg = bytes(
      [0xff, 0xd8, 0xff, 0xe0],
      [0x00, 0x10],
      "JFIF",
      [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
      [0xff, 0xc0, 0x00, 0x11, 0x08],
      [0x00, 0x96], // height 150
      [0x01, 0x2c], // width 300
      [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    );
    expect(readImage(jpeg)).toMatchObject({
      ok: true,
      image: { format: "jpeg", width: 300, height: 150 },
    });
  });

  it("reads the size of a GIF", () => {
    const gif = bytes("GIF89a", le16(64), le16(32), [0, 0, 0]);
    expect(readImage(gif)).toMatchObject({
      ok: true,
      image: { format: "gif", width: 64, height: 32 },
    });
  });

  it("reads the three WebP chunk forms", () => {
    const header = (chunk: string, body: number[]) =>
      bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, [0, 0, 0, 0], body);
    const lossy = header("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(200), ...le16(100), 0, 0]);
    expect(readImage(lossy)).toMatchObject({ ok: true, image: { width: 200, height: 100 } });
    // 13-bit width - 1 = 199 and height - 1 = 99 packed after the 0x2f signature.
    const w = 199;
    const h = 99;
    const packed = [
      w & 0xff,
      ((w >> 8) & 0x3f) | ((h & 0x03) << 6),
      (h >> 2) & 0xff,
      (h >> 10) & 0x0f,
    ];
    const lossless = header("VP8L", [0x2f, ...packed, 0, 0, 0, 0, 0]);
    expect(readImage(lossless)).toMatchObject({ ok: true, image: { width: 200, height: 100 } });
    const extended = header("VP8X", [0, 0, 0, 0, ...le24(639), ...le24(479), 0]);
    expect(readImage(extended)).toMatchObject({ ok: true, image: { width: 640, height: 480 } });
  });

  it("refuses broken and unknown files with a reason", () => {
    expect(readImage(bytes([0x89], "PNG", [0x0d, 0x0a]))).toMatchObject({
      ok: false,
      message: expect.stringContaining("PNG"),
    });
    expect(readImage(bytes("hello"))).toMatchObject({
      ok: false,
      message: expect.stringContaining("not a PNG"),
    });
  });

  it("refuses files over 8 MB", () => {
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1);
    big.set(png(10, 10));
    expect(readImage(big)).toMatchObject({ ok: false, message: expect.stringContaining("8 MB") });
  });

  it("sanitises SVG images and keeps their size", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 24 12" onload="alert(1)"><script>alert(1)</script><rect width="24" height="12" fill="#f00"/></svg>';
    const result = readImage(new TextEncoder().encode(svg));
    expect(result.ok).toBe(false);
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 24 12"><rect width="24" height="12" fill="#f00"/></svg>';
    const ok = readImage(new TextEncoder().encode(clean));
    expect(ok).toMatchObject({ ok: true, image: { format: "svg", width: 120, height: 60 } });
    if (!ok.ok) return;
    const decoded = Buffer.from(ok.image.href.split(",")[1]!, "base64").toString("utf8");
    expect(decoded).toContain("<path");
    expect(decoded).not.toContain("script");
    expect(decoded).not.toContain("onload");
  });

  it("takes the view box when an SVG has no pixel size", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 0H40V20Z"/></svg>';
    expect(readImage(new TextEncoder().encode(svg))).toMatchObject({
      ok: true,
      image: { width: 40, height: 20 },
    });
  });
});

describe("helpers", () => {
  it("encodes base64 like Node", () => {
    for (const text of ["", "a", "ab", "abc", "abcd", "Meltemi ✓"]) {
      const data = new TextEncoder().encode(text);
      expect(base64(data)).toBe(Buffer.from(data).toString("base64"));
    }
  });

  it("scales wide images down to 640 and keeps unknown ones at 160 × 120", () => {
    expect(defaultImageSize({ width: 1280, height: 720 })).toEqual({ width: 640, height: 360 });
    expect(defaultImageSize({ width: 320, height: 80 })).toEqual({ width: 320, height: 80 });
    expect(defaultImageSize(undefined)).toEqual({ width: 160, height: 120 });
  });
});
