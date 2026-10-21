import { describe, expect, it } from "vitest";
import { IconRegistry, SvgFolderPack } from "@meltemi/diagrams-assets";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
import { layoutDiagram, type Scene } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { syntheticFont } from "../../../test-support/synthetic-font.js";
import { renderSvg } from "../src/index.js";

const local = new SvgFolderPack(
  "local",
  new Map([
    [
      "glow",
      '<svg viewBox="0 0 24 24"><defs><radialGradient id="r" cx="50%" cy="50%" r="50%" gradientTransform="rotate(45)"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#f00"/></radialGradient></defs><path fill="url(#r)" fill-rule="evenodd" opacity="0.5" transform="translate(1 1)" d="M2 2h20v20H2z"/></svg>',
    ],
  ]),
  {
    title: "local",
    version: null,
    source: "assets/icons/local",
    license: "CC0-1.0",
    author: null,
    url: null,
    redistribute: true,
  },
);
const icons = new IconRegistry([...createNodeIconPacks(), local]);

function scene(body: string, font?: string): Scene {
  const theme = font ? `theme t { extends "technical.light"; frame none; font "${font}" }\n` : "";
  const text = `${theme}diagram d: flow {\n  layout manual\n${font ? '  theme "t"\n' : ""}  api["API"]\n${body}\n  placement { place api at (100, 100) }\n}\n`;
  const compilation = compile(text);
  const library = createNodeFontLibrary();
  library.addFont(syntheticFont({ family: "Corpus Sans" }), "assets/fonts/CorpusSans-Regular.ttf");
  library.addFont(syntheticFont({ family: "Locked Sans", fsType: 2 }), "assets/fonts/Locked.ttf");
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
    icons,
    measurer: library,
  });
  return result.scene!;
}

describe("icons in SVG", () => {
  it("draws Tabler icons as transformed groups of round-capped paths", () => {
    const svg = renderSvg(scene('  style api { icon "tabler:server" }'));
    expect(svg).toMatch(
      /<g data-id="tabler:server" data-role="icon" transform="translate\([\d.]+ [\d.]+\) scale\(0\.75\)">/,
    );
    expect(svg).toContain('stroke-linecap="round" stroke-linejoin="round"');
    expect(svg).not.toMatch(/<use|<image|<symbol/);
  });

  it("writes radial gradients, path transforms, opacity and fill rules", () => {
    const svg = renderSvg(scene('  style api { icon "local:glow" }'));
    expect(svg).toContain(
      '<radialGradient id="icon-1-r" gradientUnits="objectBoundingBox" cx="50%" cy="50%" r="50%" gradientTransform="matrix(0.7071 0.7071 -0.7071 0.7071 0 0)">',
    );
    expect(svg).toContain('<stop offset="0" stop-color="#fff" stop-opacity="0.8"/>');
    expect(svg).toContain(
      'transform="matrix(1 0 0 1 1 1)" opacity="0.5" fill-rule="evenodd" fill="url(#icon-1-r)"',
    );
  });
});

describe("project fonts in SVG", () => {
  const library = createNodeFontLibrary();
  library.addFont(syntheticFont({ family: "Corpus Sans" }), "assets/fonts/CorpusSans-Regular.ttf");
  library.addFont(syntheticFont({ family: "Locked Sans", fsType: 2 }), "assets/fonts/Locked.ttf");

  it("embeds a project font whole, as TrueType without unicode-range", () => {
    const svg = renderSvg(scene("", "'Corpus Sans', sans-serif"), {
      fonts: "embedded",
      provider: library,
    });
    expect(svg).toMatch(
      /@font-face\{font-family:"Corpus Sans";font-weight:400;src:url\(data:font\/ttf;base64,[A-Za-z0-9+/=]+\) format\("truetype"\)\}/,
    );
  });

  it("keeps restricted fonts as text under embedded and outlined", () => {
    const s = scene("", "'Locked Sans', sans-serif");
    expect(renderSvg(s, { fonts: "embedded", provider: library })).not.toContain(
      'font-family:"Locked Sans"',
    );
    const outlined = renderSvg(s, { fonts: "outlined", provider: library });
    expect(outlined).toContain(">API</text>");
  });
});
