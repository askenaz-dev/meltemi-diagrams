import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { renderSvg } from "../src/index.js";

function render(text: string, theme?: string): string {
  const compilation = compile(text);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { theme });
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return renderSvg(result.scene);
}

const sheet = (extra = "") =>
  `diagram d: flow {\n  title "Checkout"\n  layout manual\n${extra}  a["A"]\n  a -> b\n  placement { place a at (100, 100); place b at (300, 100) }\n}\n`;

describe("gradient definitions", () => {
  it("declares the mark gradient once and transforms the mark group", () => {
    const svg = render(sheet());
    expect(svg.match(/<defs>/g)).toHaveLength(1);
    expect(svg).toContain('<linearGradient id="meltemi-wind" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('<stop offset="0" stop-color="#1D4ED8"/>');
    expect(svg).toContain('<stop offset="1" stop-color="#0891B2"/>');
    expect(svg).toMatch(
      /<g data-id="mark" data-role="frame" transform="translate\(20 [\d.]+\) scale\([\d.]+\)">/,
    );
    expect(svg).toContain(
      'stroke="url(#meltemi-wind)" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"',
    );
    expect(svg).toContain(">Meltemi Diagrams</text>");
    expect(svg).not.toContain("<marker");
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("dominant-baseline");
  });

  it("omits defs for neutral themes", () => {
    const svg = render(sheet('  theme "editorial.light"\n'));
    expect(svg).not.toContain("<defs>");
    expect(svg).not.toContain('data-role="frame"');
  });

  it("uses the override theme", () => {
    const svg = render(sheet('  theme "editorial.light"\n'), "technical.dark");
    expect(svg).toContain('fill="#07111F"');
    expect(svg).toContain('<stop offset="0" stop-color="#3B82F6"/>');
  });
});

describe("pattern definitions", () => {
  it("declares each pattern once in defs and fills overlays with it", () => {
    const svg = render(
      sheet('  theme "editorial.light"\n  style a, b { pattern hatch; stroke "#c4552c" }\n'),
    );
    expect(svg.match(/<defs>/g)).toHaveLength(1);
    expect(svg.match(/<pattern /g)).toHaveLength(1);
    expect(svg).toContain(
      '<pattern id="pattern-1" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">',
    );
    expect(svg).toContain('stroke="#c4552c" stroke-width="1.5" stroke-opacity="0.35"');
    expect(svg.match(/fill="url\(#pattern-1\)"/g)).toHaveLength(2);
  });

  it("draws dots and a cross grid", () => {
    const dots = render(sheet('  theme "editorial.light"\n  style a { pattern dots }\n'));
    expect(dots).toMatch(/<pattern id="pattern-1" [^>]*height="8">\n\s+<circle cx="4" cy="4"/);
    const cross = render(sheet('  theme "editorial.light"\n  style a { pattern cross }\n'));
    expect(cross).toContain('d="M0 0V8M0 0H8"');
  });

  it("draws open arrowheads as unfilled polylines", () => {
    const svg = render(sheet('  theme "editorial.light"\n'));
    expect(svg.match(/<polyline /g)).toHaveLength(2);
    expect(svg).not.toMatch(/<path d="M[^"]*Z" fill="#5b6570"/);
  });
});
