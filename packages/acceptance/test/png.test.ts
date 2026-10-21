import { describe, expect, it } from "vitest";
import { compareImages, readPng, writePng, type Image } from "../src/png.js";

/** A white image with a dark rectangle at `x`. */
function picture(x: number): Image {
  const width = 120;
  const height = 60;
  const pixels = new Uint8Array(width * height * 4).fill(255);
  for (let y = 20; y < 40; y++) {
    for (let i = x; i < x + 30; i++) pixels.set([20, 40, 80, 255], (y * width + i) * 4);
  }
  return { width, height, pixels };
}

describe("pixel comparison", () => {
  it("reads back what it writes", () => {
    const image = picture(10);
    expect(readPng(writePng(image))).toEqual(image);
  });

  it("passes the same drawing and fails a moved one, with a diff", () => {
    expect(compareImages(picture(10), picture(10)).passed).toBe(true);
    const moved = compareImages(picture(10), picture(20));
    expect(moved.passed).toBe(false);
    expect(moved.longestRun).toBe(10);
    expect(moved.diff?.width).toBe(120);
    const resized = compareImages(picture(10), {
      width: 10,
      height: 10,
      pixels: new Uint8Array(400),
    });
    expect(resized.passed).toBe(false);
    expect(resized.reason).toMatch(/size/);
  });

  it("absorbs anti-aliasing: a few faint pixels", () => {
    const shifted = picture(10);
    const pixels = new Uint8Array(shifted.pixels);
    pixels.set([235, 235, 235, 255], (20 * 120 + 9) * 4);
    expect(compareImages(picture(10), { ...shifted, pixels }).passed).toBe(true);
  });
});
