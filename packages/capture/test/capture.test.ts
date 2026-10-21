import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  capture,
  capturePage,
  captureSync,
  findBrowser,
  outputSize,
  pngInfo,
} from "../src/index.js";

const browser = findBrowser();
const scratch = mkdtempSync(join(tmpdir(), "mdg-capture-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The RGBA pixel at (x, y) of an 8-bit RGB or RGBA PNG. */
function pixel(png: Uint8Array, x: number, y: number): [number, number, number, number] {
  const { width, alpha } = pngInfo(png);
  const bpp = alpha ? 4 : 3;
  const chunks: Uint8Array[] = [];
  let offset = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const data = inflateSync(Buffer.concat(chunks));
  const stride = width * bpp;
  let previous = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let r = 0; r <= y; r++) {
    const filter = data[r * (stride + 1)]!;
    const line = data.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1));
    row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = previous[i]!;
      const c = i >= bpp ? previous[i - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][
        filter
      ]!;
      row[i] = (line[i]! + predictor) & 0xff;
    }
    previous = row;
  }
  const at = x * bpp;
  return [row[at]!, row[at + 1]!, row[at + 2]!, alpha ? row[at + 3]! : 255];
}

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">' +
  '<a href="https://example.com/docs"><rect x="100" y="50" width="100" height="100" fill="#ff0000"/></a>' +
  '<text x="20" y="30" font-family="Arial" font-size="16">Checkout</text></svg>';

describe("pages", () => {
  it("draw the picture at the output size, with a page of that size", () => {
    const page = capturePage({
      kind: "pdf",
      svg: SVG,
      width: 300,
      height: 200,
      background: "#fff",
    });
    expect(page).toContain("@page { size: 300px 200px; margin: 0; }");
    expect(page).toContain("background: #fff;");
    expect(
      capturePage({ kind: "png", svg: SVG, width: 1, height: 1, background: "red}body{x" }),
    ).toContain("background: transparent;");
    expect(outputSize({ width: 300, height: 200 }, null)).toEqual({ width: 300, height: 200 });
    expect(outputSize({ width: 300, height: 200 }, { width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("need a browser", () => {
    expect(findBrowser({ MELTEMI_BROWSER: join(scratch, "missing.exe") })).toBeNull();
  });
});

describe.skipIf(!browser)("captures with the installed browser", () => {
  it("writes PNG at a pixel scale, transparent or on a background", async () => {
    const { browser: product, results } = await capture([
      { kind: "png", svg: SVG, width: 300, height: 200, scale: 2 },
      { kind: "png", svg: SVG, width: 300, height: 200, scale: 1, background: "#00ff00" },
    ]);
    expect(product).toMatch(/(Edg|Chrome|HeadlessChrome|Chromium)\//);
    const [transparent, green] = results as [Uint8Array, Uint8Array];
    expect(pngInfo(transparent)).toMatchObject({ width: 600, height: 400, alpha: true });
    expect(pixel(transparent, 2, 2)[3]).toBe(0);
    expect(pixel(transparent, 300, 200)).toEqual([255, 0, 0, 255]);
    expect(pixel(green, 2, 2)).toEqual([0, 255, 0, 255]);
  }, 60_000);

  it("prints vector PDF on a page of the picture's size, with text and links", async () => {
    const { results } = await capture([
      { kind: "pdf", svg: SVG, width: 300, height: 200, background: "#ffffff" },
    ]);
    const pdf = Buffer.from(results[0]!).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    // 300 × 200 CSS pixels are 225 × 150 points.
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
    expect(Number(box[1])).toBeCloseTo(225, 0);
    expect(Number(box[2])).toBeCloseTo(150, 0);
    expect(pdf).toContain("/URI (https://example.com/docs)");
    expect(pdf).toMatch(/\/FontFile[23]?/);
  }, 60_000);

  it("runs synchronously in a child process for the command line", () => {
    const out = join(scratch, "sync.png");
    const { browser: product } = captureSync([
      { kind: "png", svg: SVG, width: 300, height: 200, scale: 1, out },
    ]);
    expect(product.length).toBeGreaterThan(0);
    expect(pngInfo(readFileSync(out))).toMatchObject({ width: 300, height: 200 });
  }, 60_000);
});
