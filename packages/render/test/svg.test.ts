import { describe, expect, it } from "vitest";
import { layoutDiagram, type Scene } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { escapeXml, renderSvg } from "../src/index.js";

function render(text: string): string {
  const compilation = compile(text);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return renderSvg(result.scene);
}

const sheet = `diagram d: flow {
  layout manual
  title "Checkout"
  description "Purchase path"
  api["Home & Experience <beta>"]
  db[("DB")]
  api -> db: "1" as r1
  placement { place api at (100, 100); place db at (100, 300) }
  style r1 { fill "#1b1f23"; color "#ffffff" }
}
`;

describe("renderSvg", () => {
  it("draws dotted lines and outlines as round dots spaced by their width", () => {
    const svg = render(
      sheet.replace(
        '  style r1 { fill "#1b1f23"; color "#ffffff" }',
        "  style r1 { line dotted }\n  style db { line dotted; width 2 }",
      ),
    );
    // The connector is a polyline, already with round caps; the outline needs them.
    expect(svg).toMatch(/<polyline [^>]*stroke-linecap="round" stroke-dasharray="0 4\.95"/);
    expect(svg).toMatch(/<path [^>]*stroke-dasharray="0 6" stroke-linecap="round"/);
    expect(svg.match(/stroke-linecap="round" stroke-linecap/)).toBeNull();
  });

  it("draws images inside their element with the description as title", () => {
    const compilation = compile(`diagram d: free {
  image logo "logo.png" { description "Company & logo" }
  placement {
    place logo at (100, 100)
    size logo (160, 40)
  }
}
`);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
      images: {
        resolve: () => ({
          format: "png",
          width: 320,
          height: 80,
          href: "data:image/png;base64,AA==",
        }),
      },
    });
    const svg = renderSvg(result.scene!);
    expect(svg).toMatch(
      /<g data-id="logo" data-role="element">\n\s+<image x="\d+" y="\d+" width="160" height="40" href="data:image\/png;base64,AA==" preserveAspectRatio="xMidYMid meet"><title>Company &amp; logo<\/title><\/image>/,
    );
  });

  it("emits a standalone, portable document", () => {
    const svg = render(sheet);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toMatch(/width="\d+(\.\d+)?" height="\d+(\.\d+)?" viewBox="0 0 /);
    expect(svg).toContain('data-id="api"');
    expect(svg).toContain('data-id="r1" data-role="relation"');
    expect(svg).not.toContain("<marker");
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("dominant-baseline");
    expect(svg).not.toContain("<![CDATA[");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("escapes text and attributes", () => {
    const svg = render(sheet);
    expect(svg).toContain("Home &amp; Experience &lt;beta&gt;");
    expect(svg).not.toContain("<beta>");
  });

  it("puts the title and description before any shape", () => {
    const svg = render(sheet);
    const title = svg.indexOf("<title>Checkout</title>");
    const desc = svg.indexOf("<desc>Purchase path</desc>");
    const firstRect = svg.indexOf("<rect");
    expect(title).toBeGreaterThan(0);
    expect(desc).toBeGreaterThan(title);
    expect(firstRect).toBeGreaterThan(desc);
  });

  it("is deterministic", () => {
    expect(render(sheet)).toBe(render(sheet));
  });

  it("formats numbers without trailing noise", () => {
    const scene: Scene = {
      width: 100.004,
      height: 50,
      background: "#fff",
      title: null,
      description: null,
      fonts: { body: "sans-serif", mono: "monospace" },
      gradients: [],
      patterns: [],
      items: [
        {
          kind: "text",
          x: 10.123,
          y: 20,
          baseline: 24.55,
          text: "x",
          size: 13,
          weight: 600,
          font: "body",
          anchor: "middle",
          fill: "#000",
        },
        {
          kind: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 10.555, y: -0 },
          ],
          stroke: "#000",
          strokeWidth: 1.3,
          dashed: true,
        },
      ],
    };
    const svg = renderSvg(scene);
    expect(svg).toContain('width="100" height="50"');
    expect(svg).toContain('x="10.12" y="24.55"');
    expect(svg).toContain('points="0,0 10.56,0"');
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).not.toContain("<title>");
  });

  it("escapes the five XML characters", () => {
    expect(escapeXml(`a & b < c > "d"`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
  });
});

describe("links", () => {
  it("wrap the drawing of elements with a url, and the whole picture with a link", () => {
    const compilation = compile(
      'diagram d: flow {\n  layout manual\n  api["API"] { url "https://docs.example.com/api?a=1&b=2" }\n  placement { place api at (100, 100) }\n}\n',
    );
    const scene = layoutDiagram(compilation, compilation.document.diagrams[0]!).scene!;
    const svg = renderSvg(scene);
    expect(svg).toContain(
      '<g data-id="api" data-role="element">\n    <a href="https://docs.example.com/api?a=1&amp;b=2">',
    );
    const linked = renderSvg({ ...scene, link: "purchase.purchase.html" });
    expect(linked).toMatch(/<\/rect>|fill="[^"]*"\/>\n {2}<a href="purchase\.purchase\.html">/);
    expect(linked.trimEnd().endsWith("  </a>\n</svg>")).toBe(true);
  });
});

describe("layers", () => {
  it("marks the groups of elements and relations on a layer other than main", () => {
    const svg = render(
      'diagram d: flow {\n  layout manual\n  layers back, main\n  group band "Band" { layer back }\n  api["API"]\n  db["DB"]\n  api -> db as save { layer back }\n  placement {\n    place band at (200, 100)\n    size band (400, 200)\n    place api at (100, 100)\n    place db at (300, 100)\n  }\n}\n',
    );
    expect(svg).toContain('<g data-id="band" data-role="element" data-layer="back">');
    expect(svg).toContain('<g data-id="save" data-role="relation" data-layer="back">');
    expect(svg).toContain('<g data-id="api" data-role="element">');
    // The band on `back` is painted before the boxes of `main`.
    expect(svg.indexOf('data-id="band"')).toBeLessThan(svg.indexOf('data-id="api"'));
  });

  it("turns the group of a turned element about the centre of its box", () => {
    const text =
      'diagram d: flow {\n  layout manual\n  api["API"]\n  style api { rotation 45 }\n  placement {\n    place api at (300, 120)\n  }\n}\n';
    const compilation = compile(text);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const svg = renderSvg(result.scene!);
    const { x, y } = result.offset!;
    const r = (v: number) => Math.round(v * 100) / 100;
    expect(svg).toContain(
      `<g data-id="api" data-role="element" transform="rotate(45 ${r(300 + x)} ${r(120 + y)})">`,
    );
  });
});

describe("sketched strokes", () => {
  const free = (theme: string, extra = "") =>
    `diagram s: free {\n  layout manual\n  theme "${theme}"\n  box a "A"\n  box b "B"\n${extra}  a -> b as pay\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }\n}\n`;
  /** The markup of the group of `id` with `role`, up to its closing tag. */
  const groupOf = (svg: string, id: string, role: string) => {
    const start = svg.indexOf(`<g data-id="${id}" data-role="${role}"`);
    expect(start, `${role} ${id}`).toBeGreaterThanOrEqual(0);
    const indent = /\n( *)$/.exec(svg.slice(0, start))![1]!;
    const end = svg.indexOf(`\n${indent}</g>`, start);
    return svg.slice(start, end);
  };

  it("paint a box's fill once and its outline in two passes, text unchanged", () => {
    const sketched = render(free("sketch.light"));
    const clean = render(free("technical.light"));
    const box = groupOf(sketched, "a", "element");
    const lines = box.split("\n").slice(1);
    // The fill alone, then two stroke-only paths, then the label.
    expect(lines[0]).toMatch(/^ *<(rect|path) [^>]*stroke="none"/);
    expect(lines[1]).toMatch(/^ *<path d="M[^"]+" fill="none" stroke="#[0-9A-F]{6}"/);
    expect(lines[2]).toMatch(/^ *<path d="M[^"]+" fill="none" stroke="#[0-9A-F]{6}"/);
    expect(lines[1]).not.toBe(lines[2]);
    expect(box).not.toMatch(/<rect [^>]*stroke="(?!none)/);
    const texts = (svg: string) => groupOf(svg, "a", "element").match(/<text[^]*?<\/text>/g);
    expect(texts(sketched)).toEqual(texts(clean));
    // The relation and its head too; the frame's hairline as well, the mark untouched.
    const relation = groupOf(sketched, "pay", "relation");
    expect(relation).not.toContain("<polyline");
    expect(relation.match(/fill="none" stroke=/g)!.length).toBeGreaterThanOrEqual(2);
    expect(groupOf(sketched, "mark", "frame")).toBe(groupOf(clean, "mark", "frame"));
  });

  it("are the same bytes every time, and keep a shape's wobble after an unrelated edit", () => {
    const first = render(free("sketch.light"));
    expect(render(free("sketch.light"))).toBe(first);
    const edited = render(
      free("sketch.light", '  box c "C"\n').replace(
        "    place b at (400, 100)\n",
        "    place b at (400, 100)\n    place c at (100, 300)\n",
      ),
    );
    for (const [id, role] of [
      ["a", "element"],
      ["b", "element"],
      ["pay", "relation"],
    ] as const) {
      expect(groupOf(edited, id, role)).toBe(groupOf(first, id, role));
    }
  });

  it("move further from the outline when rough, and not at all under the other themes", () => {
    const rough = render(`theme hand { extends "sketch.light"; sketch rough }\n${free("hand")}`);
    expect(groupOf(rough, "a", "element")).not.toBe(
      groupOf(render(free("sketch.light")), "a", "element"),
    );
    for (const theme of ["technical.light", "editorial.dark", "stage.light"]) {
      const svg = render(free(theme));
      expect(groupOf(svg, "a", "element").match(/fill="none" stroke=/g), theme).toBeNull();
    }
  });

  it("carry the dash pattern, its offset and the class on both passes", () => {
    const compilation = compile(free("sketch.light"));
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const scene = result.scene!;
    // A dash effect's frame: the outline of `a` with a pattern, an offset and a class.
    const dashed: Scene = {
      ...scene,
      items: scene.items.map((item) =>
        item.kind === "group" && item.id === "a"
          ? {
              ...item,
              items: item.items.map((child, i) =>
                i === 0 && child.kind !== "group" && child.kind !== "text" && child.kind !== "image"
                  ? { ...child, dash: { array: [6, 4], offset: 3 }, className: "mdg-m mdg-e0" }
                  : child,
              ),
            }
          : item,
      ),
    };
    const passes = groupOf(renderSvg(dashed), "a", "element").match(
      /<path d="M[^"]+" fill="none"[^>]*>/g,
    )!;
    expect(passes).toHaveLength(2);
    for (const pass of passes) {
      expect(pass).toContain('stroke-dasharray="6 4" stroke-dashoffset="3"');
      expect(pass).toContain('class="mdg-m mdg-e0"');
    }
  });

  it("leave the scene the layout returns clean", () => {
    const compilation = compile(free("sketch.light"));
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const before = JSON.stringify(result.scene);
    renderSvg(result.scene!);
    expect(JSON.stringify(result.scene)).toBe(before);
    const clean = layoutDiagram(
      compile(free("technical.light")),
      compile(free("technical.light")).document.diagrams[0]!,
    );
    expect(result.boxes).toEqual(clean.boxes);
  });
});
