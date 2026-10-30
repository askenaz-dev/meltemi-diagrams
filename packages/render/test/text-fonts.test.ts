import { describe, expect, it } from "vitest";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { THEMES, layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { escapeXml, renderSvg, type FontPolicy } from "../src/index.js";

const fonts = createNodeFontLibrary();
const LIGHT = THEMES["technical.light"]!;

function render(style: string, policy: FontPolicy): string {
  const compilation = compile(`language "0.2"
diagram d: flow {
  api["Orders"]
  db["Stock"]
  layout manual
  placement { place api at (100, 100); place db at (400, 100) }
  ${style}
}
`);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { measurer: fonts });
  return renderSvg(result.scene!, { fonts: policy, provider: fonts });
}

const textOf = (svg: string, content: string) =>
  [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].find((m) => m[1] === content)?.[0];

describe("written fonts in SVG", () => {
  it("draws a text in its written family before the theme's, and embeds that family", () => {
    const svg = render('style api { font "Roboto" }', "embedded");
    expect(textOf(svg, "Orders")).toContain(`font-family="${escapeXml(`Roboto, ${LIGHT.font}`)}"`);
    expect(textOf(svg, "Stock")).not.toContain("font-family");
    expect(svg).toMatch(/@font-face\{font-family:"Roboto";font-weight:600;/);
    expect(svg).toMatch(/@font-face\{font-family:"Inter";font-weight:600;/);
  });

  it("outlines a written family with its own glyphs", () => {
    const svg = render('style api { font "Roboto" }', "outlined");
    expect(svg).not.toContain("<text");
    const path = /<path transform="[^"]*" d="([^"]*)" fill="[^"]*" aria-label="Orders"\/>/.exec(
      svg,
    );
    expect(path).not.toBeNull();
    const roboto = fonts.outline("Orders", "Roboto", 600, LIGHT.labelSize);
    expect(path![1]).toBe(roboto.d);
    expect(roboto.width).toBeCloseTo(fonts.width("Orders", "Roboto", 600, LIGHT.labelSize), 0);
  });

  it("leaves a written family nobody has to the viewer", () => {
    const embedded = render('style api { font "Comic Sans MS" }', "embedded");
    expect(embedded).not.toContain('font-family:"Comic Sans MS"');
    expect(textOf(embedded, "Orders")).toContain(
      `font-family="${escapeXml(`Comic Sans MS, ${LIGHT.font}`)}"`,
    );
    const outlined = render('style api { font "Comic Sans MS" }', "outlined");
    expect(textOf(outlined, "Orders")).toBeDefined();
    expect(textOf(outlined, "Stock")).toBeUndefined();
  });

  it("writes the same bytes twice", () => {
    expect(render('style api { font "Lora"; fontSize 18 }', "embedded")).toBe(
      render('style api { font "Lora"; fontSize 18 }', "embedded"),
    );
  });
});
