import { describe, expect, it } from "vitest";
import { IconRegistry, SvgFolderPack } from "@meltemi/diagrams-assets";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { compile } from "@meltemi/diagrams-model";
import {
  auditLabels,
  estimateMeasurer,
  layoutDiagram,
  type ArrangeRequest,
  type Box,
  type GroupItem,
  type LayoutEngine,
  type LayoutOptions,
  type PolylineItem,
  type RectItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

const provider = new SvgFolderPack(
  "aws",
  new Map([
    [
      "lambda",
      '<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#ED7100"/><path fill="#FFFFFF" d="M18 50h8l7-15 9 15h6L35 26z"/></svg>',
    ],
  ]),
  {
    title: "aws",
    version: "1",
    source: "assets/icons/aws",
    license: "LicenseRef-Test",
    author: null,
    url: null,
    redistribute: false,
  },
);
const icons = new IconRegistry([provider, ...createNodeIconPacks()]);

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';
/** The technical themes' padding and icon size. */
const PADDING = 16;
const ICON_SIZE = 18;

function run(body: string, kind = "flow", options: LayoutOptions = {}, mode = "manual") {
  const source = `${PLAIN}diagram d: ${kind} {\n  layout ${mode}\n  theme "plain"\n${body}\n}\n`;
  const compilation = compile(source);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
    icons,
    ...options,
  });
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return {
    ...result,
    source,
    scene: result.scene,
    codes: result.diagnostics.map((d) => d.code),
  };
}

function group(s: Scene, id: string, role = "element"): GroupItem {
  const found = s.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id}`);
  return found;
}

const iconOf = (g: GroupItem) =>
  g.items.find((i): i is GroupItem => i.kind === "group" && i.role === "icon");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");

/** The square a Tabler icon (24 units, no optical scale) is drawn in. */
function tablerSquare(g: GroupItem): Box {
  const [, x, y, s] = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(g.transform!)!;
  // Scales are written with three decimals.
  const side = Math.round(Number(s) * 24 * 10) / 10;
  return { x: Number(x), y: Number(y), width: side, height: side };
}

/** The box a text's glyphs cover, as the label audit measures them with estimates. */
function glyphs(text: TextItem): Box {
  const width = estimateMeasurer.width(text.text, "Inter", text.weight, text.size);
  const top = text.baseline - (0.7 + 0.06) * text.size;
  const bottom = text.baseline + 0.22 * text.size;
  const x =
    text.anchor === "start" ? text.x : text.anchor === "end" ? text.x - width : text.x - width / 2;
  return { x, y: top, width, height: bottom - top };
}

const inside = (outer: Box, inner: Box, tolerance = 0.01) =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance;

const node = (style: string, label = "API", size = "") =>
  `  api["${label}"]\n  style api { ${style} }\n  placement {\n    place api at (300, 200)${size ? `\n    size api ${size}` : ""}\n  }`;

describe("icons beside the text", () => {
  it("puts an icon at the right of the label, sized, and widens the node for both", () => {
    const result = run(
      node('icon "tabler:server"; iconPosition right; iconSize 32', "API Gateway"),
    );
    expect(result.codes).toEqual([]);
    const g = group(result.scene, "api");
    const box = rects(g)[0]!;
    const icon = tablerSquare(iconOf(g)!);
    const label = texts(g)[0]!;
    expect(icon.width).toBeCloseTo(32, 6);
    expect(label.anchor).toBe("start");
    // The text first, the gap, then the icon, the row centred with the padding around it.
    expect(icon.x).toBeGreaterThan(glyphs(label).x + glyphs(label).width);
    expect(
      icon.x - (label.x + estimateMeasurer.width("API Gateway", "Inter", 600, 13)),
    ).toBeCloseTo(10, 0);
    expect(icon.x + icon.width).toBeLessThanOrEqual(box.x + box.width - PADDING + 0.01);
    expect(label.x).toBeGreaterThanOrEqual(box.x + PADDING - 0.01);
    expect(box.height).toBeGreaterThanOrEqual(32 + 2 * 13);
  });

  it("mirrors the left icon on the right, at the theme's size", () => {
    const left = group(run(node('icon "tabler:server"')).scene, "api");
    const right = group(run(node('icon "tabler:server"; iconPosition right')).scene, "api");
    const [l, r] = [tablerSquare(iconOf(left)!), tablerSquare(iconOf(right)!)];
    expect(l.width).toBeCloseTo(ICON_SIZE, 6);
    expect(r.width).toBeCloseTo(ICON_SIZE, 6);
    const box = rects(left)[0]!;
    const center = box.x + box.width / 2;
    // The rows mirror each other about the box's centre.
    expect(center - (l.x + l.width / 2)).toBeCloseTo(r.x + r.width / 2 - center, 1);
    expect(texts(right)[0]!.x).toBeLessThan(r.x);
  });

  it("puts an icon below the text and grows the node to hold it", () => {
    const result = run(node('icon "tabler:server"; iconPosition bottom; iconSize 40'));
    expect(result.codes).toEqual([]);
    const g = group(result.scene, "api");
    const box = rects(g)[0]!;
    const icon = tablerSquare(iconOf(g)!);
    const label = texts(g)[0]!;
    expect(box.height).toBeGreaterThan(56);
    expect(icon.width).toBeCloseTo(40, 6);
    expect(icon.y).toBeGreaterThan(glyphs(label).y + glyphs(label).height);
    expect(icon.x + icon.width / 2).toBeCloseTo(label.x, 1);
    expect(inside({ ...box, y: box.y + 12, height: box.height - 24 }, icon)).toBe(true);
    expect(inside(box, glyphs(label))).toBe(true);
  });

  it("mirrors the top icon below the text", () => {
    const top = group(run(node('icon "tabler:server"; iconPosition top')).scene, "api");
    const bottom = group(run(node('icon "tabler:server"; iconPosition bottom')).scene, "api");
    expect(rects(bottom)[0]!.height).toBe(rects(top)[0]!.height);
    const box = rects(top)[0]!;
    const middle = box.y + box.height / 2;
    const [t, b] = [tablerSquare(iconOf(top)!), tablerSquare(iconOf(bottom)!)];
    expect(middle - (t.y + t.height / 2)).toBeCloseTo(b.y + b.height / 2 - middle, 0);
    expect(texts(top)[0]!.y - middle).toBeCloseTo(middle - texts(bottom)[0]!.y, 0);
  });

  it("grows a node for a large icon beside its text", () => {
    const g = group(run(node('icon "tabler:server"; iconSize 64')).scene, "api");
    const box = rects(g)[0]!;
    expect(box.height).toBe(64 + 2 * 13);
    expect(inside(box, tablerSquare(iconOf(g)!))).toBe(true);
  });

  it("clamps an icon to a written size, and fits `auto` to it", () => {
    const clamped = group(
      run(node('icon "tabler:server"; iconSize 64', "API", "(160, 56)")).scene,
      "api",
    );
    // Half the padding above and below.
    expect(tablerSquare(iconOf(clamped)!).width).toBeCloseTo(56 - PADDING, 6);
    const auto = group(
      run(node('icon "tabler:server"; iconSize auto', "API", "(200, 90)")).scene,
      "api",
    );
    expect(tablerSquare(iconOf(auto)!).width).toBeCloseTo(90 - PADDING, 6);
    // Without a size, `auto` beside the text is the theme's size.
    const free = group(run(node('icon "tabler:server"; iconSize auto')).scene, "api");
    expect(tablerSquare(iconOf(free)!).width).toBeCloseTo(ICON_SIZE, 6);
    expect(rects(free)[0]!.height).toBe(56);
  });

  it.each(["bottom", "top", "right"])(
    "clamps an icon at the %s to a person's body, not its whole box",
    (position) => {
      const result = run(
        `  box p "Customer"\n  style p { shape person; icon "tabler:user"; iconPosition ${position}; iconSize auto }\n  placement {\n    place p at (300, 200)\n    size p (160, 104)\n  }`,
        "free",
      );
      expect(result.codes).toEqual([]);
      const g = group(result.scene, "p");
      // The body is the rounded rect below the head.
      const body = rects(g)[0]!;
      expect(body.y).toBeGreaterThan(result.boxes!.get("p")!.y + result.offset!.y);
      const icon = tablerSquare(iconOf(g)!);
      expect(icon.width).toBeGreaterThan(ICON_SIZE);
      expect(inside(body, icon)).toBe(true);
      expect(inside(body, glyphs(texts(g)[0]!))).toBe(true);
      expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
    },
  );

  it("reports an icon that reaches out of a written box even at its least size", () => {
    const result = run(
      `  box b "Customer"\n  style b { icon "tabler:user"; iconPosition top; iconSize auto }\n  placement {\n    place b at (300, 200)\n    size b (120, 20)\n  }`,
      "free",
    );
    const found = result.diagnostics.filter((d) => d.code === "layout.text-overflow");
    expect(found).toHaveLength(1);
    const fit = (found[0]!.data as { size: { width: number; height: number } }).size;
    expect(fit.width).toBe(120);
    expect(found[0]!.message).toBe(
      `\`b\` is 20 px tall but its icon and text "Customer" needs ${fit.height} px.`,
    );
    // At the suggested size the icon fits and nothing is reported.
    const fitted = run(
      `  box b "Customer"\n  style b { icon "tabler:user"; iconPosition top; iconSize auto }\n  placement {\n    place b at (300, 200)\n    size b (120, ${fit.height})\n  }`,
      "free",
    );
    expect(fitted.codes).toEqual([]);
    const g = group(fitted.scene, "b");
    expect(inside(rects(g)[0]!, tablerSquare(iconOf(g)!))).toBe(true);
  });
});

describe("centred icons", () => {
  it("draws the icon as the picture of a 120 × 120 box, the label at the bottom", () => {
    const result = run(
      '  box db "Orders"\n  style db { icon "tabler:database"; iconPosition center }\n  placement {\n    place db at (300, 200)\n  }',
      "free",
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("db")).toMatchObject({ width: 120, height: 120 });
    const g = group(result.scene, "db");
    const box = rects(g)[0]!;
    const icon = tablerSquare(iconOf(g)!);
    const label = texts(g)[0]!;
    expect(icon.width).toBeGreaterThan(ICON_SIZE);
    // The label inside near the bottom edge, the icon centred in the room above it.
    expect(label.y).toBeGreaterThan(box.y + box.height / 2);
    expect(glyphs(label).y + glyphs(label).height).toBeLessThanOrEqual(box.y + box.height - 12);
    expect(icon.x + icon.width / 2).toBeCloseTo(box.x + box.width / 2, 1);
    expect(icon.y + icon.height).toBeLessThan(glyphs(label).y);
    expect(icon.y - box.y).toBeCloseTo(PADDING, 0);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it.each([
    ["top", (icon: Box, label: TextItem) => icon.y > glyphs(label).y + glyphs(label).height],
    ["left", (icon: Box, label: TextItem) => icon.x > glyphs(label).x + glyphs(label).width],
    ["right", (icon: Box, label: TextItem) => icon.x + icon.width < glyphs(label).x],
  ] as const)("puts the label at the %s edge, the icon beside it", (side, holds) => {
    const result = run(
      `  db["Orders"]\n  style db { icon "tabler:database"; iconPosition center; labelPosition ${side} }\n  placement {\n    place db at (300, 200)\n  }`,
    );
    expect(result.codes).toEqual([]);
    const g = group(result.scene, "db");
    const box = rects(g)[0]!;
    const label = texts(g)[0]!;
    const icon = tablerSquare(iconOf(g)!);
    expect(holds(icon, label)).toBe(true);
    expect(inside(box, icon)).toBe(true);
    expect(inside(box, glyphs(label))).toBe(true);
    expect(box.height).toBe(120);
    // A label beside the icon leaves it the room a label below would.
    if (side !== "top") expect(box.width).toBeGreaterThan(120);
  });

  it("grows the box for a written icon size, and keeps it in a written box", () => {
    const big = run(
      '  db["Orders"]\n  style db { icon "tabler:database"; iconPosition center; iconSize 96 }\n  placement {\n    place db at (300, 200)\n  }',
    );
    const box = big.boxes!.get("db")!;
    expect(box.width).toBe(96 + 2 * PADDING);
    expect(box.height).toBe(96 + 3 * PADDING + 13);
    expect(tablerSquare(iconOf(group(big.scene, "db"))!).width).toBeCloseTo(96, 6);
    const sized = run(
      '  db["Orders"]\n  style db { icon "tabler:database"; iconPosition center; iconSize 96 }\n  placement {\n    place db at (300, 200)\n    size db (100, 100)\n  }',
    );
    expect(sized.codes).toEqual([]);
    const icon = tablerSquare(iconOf(group(sized.scene, "db"))!);
    // A written size holds the icon, with the padding around it and between it and the label.
    expect(icon.width).toBe(100 - 3 * PADDING - 13);
    expect(inside(rects(group(sized.scene, "db"))[0]!, icon)).toBe(true);
  });

  it("keeps half the padding around an icon in a small written box", () => {
    const result = run(
      '  e["Payments service"]\n  style e { icon "tabler:server"; iconPosition center }\n  placement {\n    place e at (300, 200)\n    size e (160, 56)\n  }',
    );
    expect(result.codes).toEqual([]);
    const g = group(result.scene, "e");
    const box = rects(g)[0]!;
    const label = texts(g)[0]!;
    const icon = tablerSquare(iconOf(g)!);
    // Half the padding above the icon, between it and the label, and below the label.
    expect(icon.width).toBeGreaterThanOrEqual(8);
    expect(icon.y - box.y).toBeCloseTo(PADDING / 2, 0);
    expect(inside(box, glyphs(label))).toBe(true);
    expect(icon.y + icon.height).toBeLessThan(glyphs(label).y);
  });

  it("reports a written box too small for the centred icon, with its default size", () => {
    const result = run(
      '  c["Payments"]\n  style c { icon "tabler:server"; iconPosition center }\n  placement {\n    place c at (300, 200)\n    size c (80, 40)\n  }',
    );
    const found = result.diagnostics.filter((d) => d.code === "layout.text-overflow");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      '`c` is 80 × 40 px but its icon and text "Payments" needs 120 × 120 px.',
    );
    expect(found[0]!.data).toMatchObject({ size: { element: "c", width: 120, height: 120 } });
    // At the size it suggests, the icon is drawn and nothing is reported.
    const fitted = run(
      '  c["Payments"]\n  style c { icon "tabler:server"; iconPosition center }\n  placement {\n    place c at (300, 200)\n    size c (120, 120)\n  }',
    );
    expect(fitted.codes).toEqual([]);
    expect(iconOf(group(fitted.scene, "c"))).toBeDefined();
  });

  it("centres the icon in the shape of a decision and a data store", () => {
    const result = run(
      '  decision ok "Approved?"\n  data db "Orders"\n  style ok, db { icon "tabler:check"; iconPosition center }\n  placement {\n    place ok at (200, 200)\n    place db at (500, 200)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
    for (const id of ["ok", "db"]) {
      const g = group(result.scene, id);
      const icon = tablerSquare(iconOf(g)!);
      expect(icon.width, id).toBeGreaterThan(ICON_SIZE);
      expect(inside(g.bounds!.inner!, icon), id).toBe(true);
    }
  });

  it("lays out centred icons on shapes about as fast as plain shapes", () => {
    const sheet = (styling: string) => {
      const lines: string[] = [];
      const places: string[] = [];
      for (let i = 0; i < 150; i++) {
        lines.push(
          i % 3 === 0
            ? `  decision n${i} "Decision ${i}"`
            : i % 3 === 1
              ? `  data n${i} "Store ${i}"`
              : `  n${i}["Service ${i}"]`,
        );
        places.push(`    place n${i} at (${(i % 15) * 260}, ${Math.floor(i / 15) * 260})`);
      }
      const source = `${PLAIN}diagram d: flow {\n  layout manual\n  theme "plain"\n${lines.join("\n")}\n  placement {\n${places.join("\n")}\n  }\n${styling}\n}\n`;
      const compilation = compile(source);
      return () => layoutDiagram(compilation, compilation.document.diagrams[0]!, { icons });
    };
    const fastest = (layout: () => unknown) => {
      layout();
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        layout();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const plain = fastest(sheet(""));
    const centred = fastest(
      sheet(
        '  rule node { icon "tabler:server"; iconPosition center }\n  rule decision { icon "tabler:check"; iconPosition center }\n  rule data { icon "tabler:database"; iconPosition center }',
      ),
    );
    // Each centred element is sized and laid out once, whatever asks for it again.
    expect(centred).toBeLessThan(5 * plain + 10);
  });
});

describe("label positions", () => {
  it("reports a label position that has no effect and draws the node as without it", () => {
    const body = (extra: string) => node(`icon "tabler:server"${extra}`);
    const plain = run(body(""));
    const result = run(body("; labelPosition top"));
    const found = result.diagnostics.filter((d) => d.code === "layout.label-position-ignored");
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe("warning");
    expect(found[0]!.message).toBe(
      "The `labelPosition` of `api` has no effect: its icon is not the centre piece.",
    );
    expect(found[0]!.hints).toEqual([
      "Set `iconPosition center` or `shape icon` to put the label at an edge, or remove `labelPosition`.",
    ]);
    const lines = result.source.split("\n");
    const line = lines[found[0]!.range.start.line - 1]!;
    expect(line.slice(found[0]!.range.start.column - 1, found[0]!.range.end.column - 1)).toBe(
      "labelPosition top",
    );
    expect(result.scene).toEqual(plain.scene);
  });

  it("reports a rule's label position once, and not when an element it styles uses it", () => {
    const unused = run(
      '  a["A"]\n  b["B"]\n  rule node { labelPosition left }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(unused.codes).toEqual(["layout.label-position-ignored"]);
    const used = run(
      '  a["A"]\n  b["B"]\n  rule node { labelPosition left }\n  style b { icon "tabler:server"; shape icon }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(used.codes).toEqual([]);
  });
});

describe("label positions from the theme and on other kinds", () => {
  const THEMED =
    'theme labelled {\n  extends "technical.light"\n  frame none\n  rule node { labelPosition top }\n  class pic { labelPosition right }\n}\n\n';

  function themed(body: string) {
    const source = `${THEMED}diagram d: flow {\n  layout manual\n  theme "labelled"\n${body}\n}\n`;
    const compilation = compile(source);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { icons });
    return {
      source,
      found: result.diagnostics.filter((d) => d.code === "layout.label-position-ignored"),
    };
  }

  const nodes =
    '  a["A"]\n  b["B"]\n  c["C"]\n  placement {\n    place a at (100, 100)\n    place b at (300, 100)\n    place c at (500, 100)\n    place d at (700, 100)\n  }';

  it("reports a theme rule's label position once, on the diagram's theme", () => {
    const { source, found } = themed(`  d["D"]\n${nodes}`);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      "The `labelPosition` the theme gives `d` and the elements styled like it has no effect: none has its icon as the centre piece.",
    );
    expect(found[0]!.hints).toEqual([
      "Set `iconPosition center` or `shape icon` on the elements, or remove `labelPosition` from the theme.",
    ]);
    const line = source.split("\n")[found[0]!.range.start.line - 1]!;
    expect(line.trim()).toBe('theme "labelled"');
  });

  it("does not report a theme rule's label position that an element uses", () => {
    const { found } = themed(
      `  d["D"]\n  style d { icon "tabler:server"; iconPosition center }\n${nodes}`,
    );
    expect(found).toEqual([]);
  });

  it("reports a theme class's label position once for the elements that apply it", () => {
    const { found } = themed(
      `  d["D"]\n  style b, c, d { class pic }\n  style d { icon "tabler:server"; iconPosition center; labelPosition bottom }\n${nodes}`,
    );
    // The rule gives `a` its label position; `b` and `c` take the class's, which nothing uses.
    expect(found.map((d) => d.data!.ids)).toEqual([["a"], ["b"]]);
  });

  it.each([
    [
      '  group g "G" {\n    api["API"]\n  }\n  style g { icon "tabler:server"; labelPosition top }',
      "g",
    ],
    ['  tag t "Tag"\n  style t { icon "tabler:server"; labelPosition left }', "t"],
    ['  note n "Note"\n  style n { labelPosition left }', "n"],
  ])(
    "reports a label position on a kind that never takes it, and says to remove it",
    (body, id) => {
      const source = `${PLAIN}diagram d: flow {\n  layout manual\n  theme "plain"\n${body}\n  placement {\n    place ${id === "g" ? "api" : id} at (100, 100)\n  }\n}\n`;
      const compilation = compile(source);
      const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { icons });
      const found = result.diagnostics.filter((d) => d.code === "layout.label-position-ignored");
      expect(found).toHaveLength(1);
      expect(found[0]!.data!.ids).toEqual([id]);
      expect(found[0]!.hints).toEqual([
        "Remove `labelPosition`: it only places the label of a node, decision, data store or box whose icon is the centre piece.",
      ]);
    },
  );

  it("says to remove the label position of a free text or icon", () => {
    const result = run(
      '  text tx "Hello"\n  icon ic "tabler:server"\n  style tx, ic { iconPosition center; labelPosition top }\n  placement {\n    place tx at (100, 100)\n    place ic at (300, 100)\n  }',
      "free",
    );
    const found = result.diagnostics.filter((d) => d.code === "layout.label-position-ignored");
    expect(found).toHaveLength(1);
    expect(found[0]!.hints![0]).toMatch(/^Remove `labelPosition`/);
  });
});

describe("icon shapes", () => {
  const lambda = (extra = "", place = "") =>
    `  box fn "Lambda"\n  style fn { icon "aws:lambda"; shape icon${extra} }\n  placement {\n    place fn at (300, 200)\n${place}  }`;

  it("draws only the icon in a 64 × 64 box with its label under it", () => {
    const result = run(lambda(), "free");
    expect(result.codes).toEqual([]);
    const box = result.boxes!.get("fn")!;
    expect(box).toEqual({ x: 268, y: 168, width: 64, height: 64 });
    expect(result.shapes!.get("fn")).toBe("icon");
    const g = group(result.scene, "fn");
    expect(rects(g)).toEqual([]);
    const icon = iconOf(g)!;
    // The icon fills its square, without the pack's optical scale.
    expect(icon.transform).toMatch(/scale\(1\)$/);
    const drawn = g.bounds!;
    const [label] = texts(g);
    expect(label!.text).toBe("Lambda");
    expect(label!.anchor).toBe("middle");
    expect(label!.x).toBeCloseTo(drawn.x + 32, 6);
    expect(glyphs(label!).y).toBeGreaterThan(drawn.y + drawn.height + 6);
    // The label is the element's own: its box is known to the scene and the canvas.
    expect(inside(drawn.label!, glyphs(label!), 0.75)).toBe(true);
    const outside = result.elementLabels!.get("fn")!;
    expect(outside.y).toBe(232 + 8);
    expect(outside.x + outside.width / 2).toBeCloseTo(300, 6);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("ends a connector to its south side at the icon's bottom edge, under its label", () => {
    const result = run(
      lambda(
        "",
        "    place api at (300, 420)\n    route call from api.north to fn.south\n",
      ).replace('  box fn "Lambda"', '  box fn "Lambda"\n  box api "API"\n  api -> fn as call'),
      "free",
    );
    expect(result.codes).toEqual([]);
    const points = result.connectors!.get("call")!.points;
    expect(points[points.length - 1]).toEqual({ x: 300, y: 232 });
    // The connector passes under the label: no piece of it crosses the label's text.
    const relation = group(result.scene, "call", "relation");
    const label = glyphs(texts(group(result.scene, "fn"))[0]!);
    for (const piece of relation.items.filter((i): i is PolylineItem => i.kind === "polyline")) {
      const ys = piece.points.map((p) => p.y);
      const crosses =
        Math.min(...ys) < label.y + label.height &&
        Math.max(...ys) > label.y &&
        piece.points[0]!.x > label.x;
      expect(crosses).toBe(false);
    }
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  /** The pieces of a relation's line and the points of its heads. */
  function drawnRelation(scene: Scene, key: string) {
    const g = group(scene, key, "relation");
    const pieces = g.items.filter((i): i is PolylineItem => i.kind === "polyline");
    const heads = g.items
      .filter((i) => i.kind === "path")
      .flatMap((i) =>
        [...(i as { d: string }).d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
          x: Number(m[1]),
          y: Number(m[2]),
        })),
      );
    return { pieces, heads };
  }

  const near = (a: { x: number; y: number }, b: { x: number; y: number }, tolerance = 0.6) =>
    Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
  /** Whether a line ends at the base of a triangle head: the middle of its back corners. */
  const attached = (heads: { x: number; y: number }[], end: { x: number; y: number }) =>
    heads.length === 3 &&
    near({ x: (heads[1]!.x + heads[2]!.x) / 2, y: (heads[1]!.y + heads[2]!.y) / 2 }, end);

  it.each([
    ["left", "Left label", "    place src at (100, 260)\n    place left at (380, 260)\n"],
    ["top", "Down label", "    place src at (380, 100)\n    place left at (380, 300)\n"],
  ])(
    "draws the head of a connector entering by its %s label beyond the label, clear of the text",
    (side, text, places) => {
      const result = run(
        `  src["Source"]\n  left["${text}"]\n  src -> left as call\n  style left { icon "aws:lambda"; shape icon; labelPosition ${side} }\n  placement {\n${places}  }`,
      );
      expect(result.codes).toEqual([]);
      const label = glyphs(texts(group(result.scene, "left"))[0]!);
      const { pieces, heads } = drawnRelation(result.scene, "call");
      expect(pieces).toHaveLength(1);
      // The head lies before the label, a few pixels from its text, and the line reaches it.
      for (const p of heads) {
        if (side === "left") expect(p.x).toBeLessThanOrEqual(label.x - 2);
        else expect(p.y).toBeLessThanOrEqual(label.y - 2);
      }
      expect(attached(heads, pieces[0]!.points[pieces[0]!.points.length - 1]!)).toBe(true);
      // Editors still see the connector end on the icon.
      const points = result.connectors!.get("call")!.points;
      const box = result.boxes!.get("left")!;
      const tip = points[points.length - 1]!;
      if (side === "left") expect(tip.x).toBeCloseTo(box.x, 6);
      else expect(tip.y).toBeCloseTo(box.y, 6);
      expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
    },
  );

  it("never hides a bend under its label: the route turns beyond it or goes around", () => {
    // `q`'s label is on its right and `fn` lies below the label: the route into the east side
    // would turn down under the label's text.
    const result = run(
      '  fn["Function"]\n  q["Queue messages"]\n  fn -> q as call\n  style q { icon "aws:lambda"; shape icon; labelPosition right }\n  placement {\n    place q at (100, 100)\n    place fn at (220, 200)\n  }',
    );
    const label = result.elementLabels!.get("q")!;
    const points = result.connectors!.get("call")!.points;
    // No bend of the route lies under the label.
    for (const p of points.slice(1, -1)) {
      expect(inside(label, { ...p, width: 0, height: 0 }, -0.5)).toBe(false);
    }
    const { pieces, heads } = drawnRelation(result.scene, "call");
    expect(pieces).toHaveLength(1);
    const line = pieces[0]!.points;
    expect(attached(heads, line[line.length - 1]!)).toBe(true);
    expect(result.codes).toEqual([]);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("draws a connector between two labels that face each other from label to label", () => {
    const result = run(
      '  a["Sender"]\n  b["Receiver"]\n  a -> b as call\n  style a { icon "aws:lambda"; shape icon; labelPosition right }\n  style b { icon "aws:lambda"; shape icon; labelPosition left }\n  placement {\n    place a at (100, 100)\n    place b at (500, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    const from = glyphs(texts(group(result.scene, "a"))[0]!);
    const to = glyphs(texts(group(result.scene, "b"))[0]!);
    const { pieces, heads } = drawnRelation(result.scene, "call");
    expect(pieces).toHaveLength(1);
    const line = pieces[0]!.points;
    expect(line[0]!.x).toBeGreaterThanOrEqual(from.x + from.width + 2);
    for (const p of heads) expect(p.x).toBeLessThanOrEqual(to.x - 2);
    expect(attached(heads, line[line.length - 1]!)).toBe(true);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("goes around its own label instead of drawing across it when there is no room beyond it", () => {
    const result = run(
      '  fn["Fn"]\n  near["Near"]\n  fn -> near as call\n  style fn { icon "aws:lambda"; shape icon; labelPosition right }\n  placement {\n    place fn at (80, 80)\n    place near at (167, 80)\n    size near (60, 40)\n  }',
    );
    const label = glyphs(texts(group(result.scene, "fn"))[0]!);
    const { pieces } = drawnRelation(result.scene, "call");
    expect(pieces).toHaveLength(1);
    const line = pieces[0]!.points;
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1]!, line[i]!];
      const crosses =
        Math.max(a.x, b.x) > label.x &&
        Math.min(a.x, b.x) < label.x + label.width &&
        Math.max(a.y, b.y) > label.y &&
        Math.min(a.y, b.y) < label.y + label.height;
      expect(crosses).toBe(false);
    }
    expect(result.codes).not.toContain("layout.label-overlap");
  });

  it("reports a box over its label as an overlap", () => {
    const result = run(
      lambda("", "    place over at (300, 255)\n    size over (40, 16)\n").replace(
        '  box fn "Lambda"',
        '  box fn "Lambda"\n  box over ""',
      ),
      "free",
    );
    expect(result.codes).toContain("layout.overlap");
    expect(result.diagnostics.find((d) => d.code === "layout.overlap")!.data!.ids).toEqual([
      "fn",
      "over",
    ]);
  });

  it("reports a later box lying wholly on its label as an overlap, not a stack", () => {
    const result = run(
      lambda("", "    place cover at (300, 248)\n    size cover (40, 8)\n").replace(
        '  box fn "Lambda"',
        '  box fn "A rather long label for the function"\n  box cover ""',
      ),
      "free",
    );
    const label = result.elementLabels!.get("fn")!;
    const cover = result.boxes!.get("cover")!;
    expect(inside(label, cover)).toBe(true);
    const found = result.diagnostics.filter((d) => d.code === "layout.overlap");
    expect(found.map((d) => d.data!.ids)).toEqual([["fn", "cover"]]);
  });

  it("does not report a box in the empty corner beside its icon and above its label", () => {
    const result = run(
      '  box fn "A rather long label for the function"\n  box side "Side"\n  style fn { icon "aws:lambda"; shape icon }\n  placement {\n    place fn at (200, 100)\n    place side at (268, 60)\n    size side (50, 40)\n  }',
      "free",
    );
    const label = result.elementLabels!.get("fn")!;
    const side = result.boxes!.get("side")!;
    // The box reaches into the extent of icon and label, but touches neither.
    const icon = result.boxes!.get("fn")!;
    expect(side.x).toBeGreaterThan(icon.x + icon.width);
    expect(side.x + side.width).toBeLessThan(label.x + label.width);
    expect(side.y + side.height).toBeGreaterThan(icon.y);
    expect(side.y + side.height).toBeLessThan(label.y);
    expect(result.codes).not.toContain("layout.overlap");
  });

  it("warns without an icon and draws a dashed placeholder with the id", () => {
    const result = run(
      '  box b "B"\n  style b { shape icon }\n  placement {\n    place b at (300, 200)\n  }',
      "free",
    );
    expect(result.codes).toEqual(["layout.icon-missing"]);
    const found = result.diagnostics[0]!;
    expect(found.message).toBe(
      "`b` is drawn as its icon, but it has no `icon`; a placeholder is drawn instead.",
    );
    const line = result.source.split("\n")[found.range.start.line - 1]!;
    expect(line.slice(found.range.start.column - 1, found.range.end.column - 1)).toBe("shape icon");
    const g = group(result.scene, "b");
    const placeholder = rects(g)[0]!;
    expect(placeholder.dashed).toBe(true);
    expect([placeholder.width, placeholder.height]).toEqual([64, 64]);
    expect(texts(g).map((t) => t.text)).toEqual(["b", "B"]);
  });

  it("takes its square from iconSize, its box from a size, and a frame from a fill", () => {
    const sized = run(lambda("; iconSize 40"), "free");
    expect(sized.boxes!.get("fn")).toMatchObject({ width: 40, height: 40 });
    const written = run(lambda("", "    size fn (120, 80)\n"), "free");
    expect(written.codes).toEqual([]);
    const icon = iconOf(group(written.scene, "fn"))!;
    // The 64-unit icon fits the box's shorter side, centred.
    expect(icon.transform).toMatch(/scale\(1\.25\)$/);
    const framed = run(lambda('; fill "#eef"; stroke accent'), "free");
    const frame = rects(group(framed.scene, "fn"))[0]!;
    // The frame grows around the icon by half the padding, as a free text's does.
    expect([frame.width, frame.height, frame.fill]).toEqual([80, 80, "#eef"]);
    expect(iconOf(group(framed.scene, "fn"))!.transform).toMatch(/scale\(1\)$/);
  });

  it("keeps a written iconSize as the icon's side inside a frame", () => {
    for (const side of [16, 32]) {
      const result = run(lambda(`; iconSize ${side}; fill "#eef"; stroke accent`), "free");
      expect(result.codes).toEqual([]);
      expect(result.boxes!.get("fn")).toMatchObject({
        width: side + PADDING,
        height: side + PADDING,
      });
      // The 64-unit icon is drawn at the written side.
      const icon = iconOf(group(result.scene, "fn"))!;
      expect(icon.transform).toMatch(new RegExp(`scale\\(${side / 64}\\)$`));
    }
  });

  it("warns when a written size leaves its frame no room for the icon", () => {
    const result = run(lambda("; stroke accent", "    size fn (20, 20)\n"), "free");
    const found = result.diagnostics.filter((d) => d.code === "layout.text-overflow");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe(
      "`fn` is 20 × 20 px, too small to draw its icon: it needs 80 × 80 px.",
    );
    expect(found[0]!.hints).toEqual([
      "Use `size fn (80, 80)`, or remove its `size` to draw the icon at its `iconSize`.",
    ]);
    expect(found[0]!.data).toMatchObject({ size: { element: "fn", width: 80, height: 80 } });
    // A size that leaves the icon its least side is drawn without a warning.
    const least = run(lambda("; stroke accent", "    size fn (24, 24)\n"), "free");
    expect(least.codes).toEqual([]);
    expect(iconOf(group(least.scene, "fn"))!.transform).toMatch(/scale\(0\.125\)$/);
  });

  it.each([
    ["top", (box: Box, label: Box) => label.y + label.height <= box.y - 8 + 0.01],
    ["bottom", (box: Box, label: Box) => label.y >= box.y + box.height + 8 - 0.01],
    ["left", (box: Box, label: Box) => Math.abs(label.x + label.width - (box.x - 8)) < 0.01],
    ["right", (box: Box, label: Box) => Math.abs(label.x - (box.x + box.width + 8)) < 0.01],
  ] as const)("draws its label at the %s, half the padding away", (side, holds) => {
    const result = run(lambda(`; labelPosition ${side}`), "free");
    expect(result.codes).toEqual([]);
    const box = result.boxes!.get("fn")!;
    const label = result.elementLabels!.get("fn")!;
    expect(holds(box, label)).toBe(true);
    expect(auditLabels(result.scene, estimateMeasurer)).toEqual([]);
  });

  it("aligns its label by textAlign", () => {
    const left = run(lambda("; textAlign left"), "free");
    expect(left.elementLabels!.get("fn")!.x).toBe(268);
    expect(texts(group(left.scene, "fn"))[0]!.anchor).toBe("start");
    const right = run(lambda("; textAlign right"), "free");
    const label = right.elementLabels!.get("fn")!;
    expect(label.x + label.width).toBeCloseTo(332, 6);
  });

  it("is 64 × 64 in flow, or its iconSize, and a derived group holds its label", () => {
    const result = run(
      '  group g "Group" {\n    fn["AWS Lambda function"]\n  }\n  small["Small"]\n  style fn { icon "aws:lambda"; shape icon }\n  style small { icon "aws:lambda"; shape icon; iconSize 32 }\n  placement {\n    place fn at (100, 100)\n    place small at (400, 100)\n  }',
    );
    expect(result.codes).toEqual([]);
    expect(result.boxes!.get("fn")).toMatchObject({ width: 64, height: 64 });
    expect(result.boxes!.get("small")).toMatchObject({ width: 32, height: 32 });
    const label = result.elementLabels!.get("fn")!;
    const groupBox = result.boxes!.get("g")!;
    expect(label.width).toBeGreaterThan(64);
    expect(inside(groupBox, { ...label, x: label.x - 16, width: label.width + 32 })).toBe(true);
    expect(groupBox.y + groupBox.height).toBeCloseTo(label.y + label.height + 16, 6);
  });

  it("grows a free group for its label", () => {
    const result = run(
      '  group g "Group" {\n    box fn "Lambda"\n  }\n  style fn { icon "aws:lambda"; shape icon }\n  placement {\n    place g at (200, 200)\n    place fn at (60, 40)\n  }',
      "free",
    );
    expect(result.codes).toEqual([]);
    const label = result.elementLabels!.get("fn")!;
    const groupBox = result.boxes!.get("g")!;
    expect(groupBox.y + groupBox.height).toBeCloseTo(label.y + label.height + 16, 6);
  });

  it("sends the engine its extent, with ports on the icon, and ends its routes on the icon", () => {
    let request: ArrangeRequest | undefined;
    const engine: LayoutEngine = {
      name: "test",
      arrange(r) {
        request = r;
        // The extent of `fn` sits right of `api`, its top-left corner at (200, 0).
        const fn = r.nodes.find((n) => n.id === "fn")!;
        const port = fn.ports[0]!;
        const y = port.position * fn.height;
        return {
          centers: new Map([
            ["api", { x: 0, y: y - 0 }],
            ["fn", { x: 200 + fn.width / 2, y: fn.height / 2 }],
          ]),
          routes: new Map([
            [
              "call",
              [
                { x: 80, y },
                { x: 200, y },
              ],
            ],
          ]),
        };
      },
    };
    const result = run(
      '  api["API"]\n  fn["AWS Lambda function"]\n  api -> fn as call\n  style fn { icon "aws:lambda"; shape icon }',
      "flow",
      { engine },
      "auto",
    );
    expect(result.codes).toEqual([]);
    const fn = request!.nodes.find((n) => n.id === "fn")!;
    const label = result.elementLabels!.get("fn")!;
    // The engine places the icon and its label.
    expect(fn.width).toBeCloseTo(label.width, 6);
    expect(fn.height).toBeCloseTo(64 + 8 + label.height, 6);
    // The relation's end has a port on the icon's west side, by its middle.
    const edge = request!.edges[0]!;
    expect(edge.targetPort).toBe(fn.ports[0]!.id);
    expect(fn.ports[0]!.side).toBe("west");
    expect(fn.ports[0]!.position * fn.height).toBeCloseTo(32, 6);
    // The box is the icon's square inside the extent, and the route ends on its side.
    const box = result.boxes!.get("fn")!;
    expect(box.width).toBe(64);
    expect(box.y).toBeCloseTo(0, 6);
    expect(box.x + box.width / 2).toBeCloseTo(200 + fn.width / 2, 6);
    const points = result.connectors!.get("call")!.points;
    expect(points[points.length - 1]).toEqual({ x: box.x, y: 32 });
  });

  it("arranges a relation turned back at an icon shape again, its target port facing back", () => {
    const requests: ArrangeRequest[] = [];
    const engine: LayoutEngine = {
      name: "test",
      arrange(r) {
        requests.push(r);
        const fn = r.nodes.find((n) => n.id === "fn")!;
        const queue = r.nodes.find((n) => n.id === "queue")!;
        const port = queue.ports[0]!;
        // The engine puts the queue left of the function, as for a relation it turns back.
        const fnCenter = { x: 600, y: 100 };
        const queueCenter = { x: 100, y: 100 };
        const tipX = queueCenter.x + (port.side === "east" ? 1 : -1) * (queue.width / 2);
        const startX = fnCenter.x + fn.width / 2;
        const y = 100 - queue.height / 2 + port.position * queue.height;
        // Into the west side, the route wraps around the queue; into the east side, it is direct.
        const route =
          port.side === "west"
            ? [
                { x: startX, y },
                { x: startX + 20, y },
                { x: startX + 20, y: 300 },
                { x: tipX - 20, y: 300 },
                { x: tipX - 20, y },
                { x: tipX, y },
              ]
            : [
                { x: startX, y },
                { x: startX + 20, y },
                { x: startX + 20, y: y - 80 },
                { x: tipX + 20, y: y - 80 },
                { x: tipX + 20, y },
                { x: tipX, y },
              ];
        return {
          centers: new Map([
            ["fn", fnCenter],
            ["queue", queueCenter],
          ]),
          routes: new Map([["call", route]]),
        };
      },
    };
    const result = run(
      '  fn["Function"]\n  queue["Queue"]\n  fn -> queue as call\n  style fn, queue { icon "aws:lambda"; shape icon }',
      "flow",
      { engine },
      "auto",
    );
    expect(requests).toHaveLength(2);
    const portOf = (r: ArrangeRequest, id: string) => r.nodes.find((n) => n.id === id)!.ports[0]!;
    expect([portOf(requests[0]!, "fn").side, portOf(requests[0]!, "queue").side]).toEqual([
      "east",
      "west",
    ]);
    // The second request keeps the source leaving by the flow and turns the target's port back.
    expect([portOf(requests[1]!, "fn").side, portOf(requests[1]!, "queue").side]).toEqual([
      "east",
      "east",
    ]);
    // The shorter routes of the second arrangement are kept: the connector enters the east side.
    const queue = result.boxes!.get("queue")!;
    const points = result.connectors!.get("call")!.points;
    expect(points[points.length - 1]!.x).toBeCloseTo(queue.x + queue.width, 6);
    expect(result.connectors!.get("call")!.toSide).toBe("east");
  });

  it("arranges once when no relation at an icon shape is turned back", () => {
    let calls = 0;
    const engine: LayoutEngine = {
      name: "test",
      arrange() {
        calls++;
        return {
          centers: new Map([
            ["fn", { x: 100, y: 100 }],
            ["queue", { x: 400, y: 100 }],
          ]),
          routes: new Map(),
        };
      },
    };
    run(
      '  fn["Function"]\n  queue["Queue"]\n  fn -> queue as call\n  style fn, queue { icon "aws:lambda"; shape icon }',
      "flow",
      { engine },
      "auto",
    );
    expect(calls).toBe(1);
  });

  it("makes the canvas hold its label", () => {
    const result = run(lambda("; labelPosition left"), "free");
    const label = result.elementLabels!.get("fn")!;
    // The label reaches left of the box: the margin is kept left of the label.
    expect(label.x + result.offset!.x).toBeCloseTo(20, 0);
  });
});
