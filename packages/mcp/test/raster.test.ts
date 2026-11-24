import { describe, expect, it } from "vitest";
import { RASTER_FAMILIES, rasterFamilies } from "../src/preview/index.js";

const MONO =
  "ui-monospace, &quot;Cascadia Mono&quot;, Consolas, &quot;Liberation Mono&quot;, Menlo, monospace";

describe("the font families a preview is drawn with", () => {
  it("start the themes' monospace stack with Cascadia Mono, which resvg holds", () => {
    const svg = `<text x="0" y="0" font-family="${MONO}">  return;</text>`;
    expect(rasterFamilies(svg, RASTER_FAMILIES)).toBe(
      `<text x="0" y="0" font-family="&quot;Cascadia Mono&quot;, ${MONO}">  return;</text>`,
    );
  });

  it("leave a list that already starts with a family resvg holds", () => {
    const svg = '<svg font-family="&quot;Inter&quot;, &quot;Segoe UI&quot;, sans-serif">';
    expect(rasterFamilies(svg, RASTER_FAMILIES)).toBe(svg);
  });

  it("move a held family of a written stack first", () => {
    const svg = '<text font-family="Lora, &quot;Inter&quot;, sans-serif">x</text>';
    expect(rasterFamilies(svg, RASTER_FAMILIES)).toBe(
      '<text font-family="&quot;Inter&quot;, Lora, &quot;Inter&quot;, sans-serif">x</text>',
    );
  });

  it("put a project's own family first when the project holds it", () => {
    const svg = '<text font-family="Brand Sans, &quot;Inter&quot;">x</text>';
    expect(rasterFamilies(svg, new Set([...RASTER_FAMILIES, "Brand Sans"]))).toBe(svg);
  });

  it("draw a list naming only monospace in Cascadia Mono", () => {
    expect(rasterFamilies('<text font-family="monospace">x</text>', RASTER_FAMILIES)).toBe(
      '<text font-family="&quot;Cascadia Mono&quot;, monospace">x</text>',
    );
  });

  it("leave a list it holds nothing of to the fallback", () => {
    const svg = '<text font-family="&quot;IBM Plex Sans&quot;, Roboto, sans-serif">x</text>';
    expect(rasterFamilies(svg, RASTER_FAMILIES)).toBe(svg);
  });
});
