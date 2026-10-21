import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import {
  layoutDiagram,
  routePoints,
  sideFacing,
  THEMES,
  type GroupItem,
  type PathItem,
  type PolylineItem,
  type RectItem,
  type Scene,
  type SceneItem,
  type TextItem,
} from "../src/index.js";

function layout(text: string, id?: string) {
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = id
    ? compilation.document.diagrams.find((d) => d.id === id)!
    : compilation.document.diagrams[0]!;
  return layoutDiagram(compilation, diagram);
}

function scene(text: string, id?: string): Scene {
  const result = layout(text, id);
  if (!result.scene) throw new Error(result.diagnostics.map((d) => d.message).join("\n"));
  return result.scene;
}

function group(scene: Scene, id: string, role = "element"): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === role,
  );
  if (!found) throw new Error(`no ${role} ${id} in scene`);
  return found;
}

const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");
const paths = (g: GroupItem) => g.items.filter((i): i is PathItem => i.kind === "path");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const polyline = (g: GroupItem) => g.items.find((i): i is PolylineItem => i.kind === "polyline")!;
const labelGroup = (g: GroupItem) =>
  g.items.find((i): i is GroupItem => i.kind === "group" && i.role === "label")!;

/** A frameless sheet with the technical tokens, so geometry is easy to read. */
const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';
/** Lines `PLAIN` adds before the diagram. */
const PLAIN_LINES = 5;

const manual = (body: string, extra = '  theme "plain"\n') =>
  `${PLAIN}diagram d: flow {\n  layout manual\n${extra}${body}\n}\n`;

describe("manual layout geometry", () => {
  it("centres boxes on their place and applies default sizes", () => {
    const s = scene(
      manual(
        '  api["API"]\n  db[("DB")]\n  placement {\n    place api at (360, 180)\n    size api (200, 56)\n    place db at (700, 180)\n  }',
      ),
    );
    const api = rects(group(s, "api"))[0]!;
    expect([api.width, api.height]).toEqual([200, 56]);
    const db = paths(group(s, "db"));
    expect(db).toHaveLength(2);
    // Canvas starts at the margin: api is the leftmost box; the taller cylinder sets the top.
    expect([api.x, api.y]).toEqual([20, 24]);
    expect(s.width).toBe(20 + (780 - 260) + 20);
  });

  it("derives a group from its children and draws it first", () => {
    const s = scene(
      manual(
        '  group backend "Backend" {\n    api["API"]\n    db["DB"]\n  }\n  placement {\n    place api at (100, 100)\n    size api (160, 56)\n    place db at (300, 100)\n    size db (160, 56)\n  }',
      ),
    );
    const band = rects(group(s, "backend"))[0]!;
    expect([band.width, band.height]).toEqual([392, 112]);
    expect([band.x, band.y]).toEqual([20, 20]);
    expect(s.items.findIndex((i) => i.kind === "group" && i.id === "backend")).toBeLessThan(
      s.items.findIndex((i) => i.kind === "group" && i.id === "api"),
    );
    expect(texts(group(s, "backend"))[0]).toMatchObject({
      text: "Backend",
      anchor: "start",
      x: 40,
    });
  });

  it("derives an untitled group with the padding on top and draws no title", () => {
    const text = manual(
      '  group backend "" {\n    api["API"]\n    db["DB"]\n  }\n  placement {\n    place api at (100, 100)\n    size api (160, 56)\n    place db at (300, 100)\n    size db (160, 56)\n  }',
    );
    const result = layout(text);
    expect(result.boxes!.get("backend")).toEqual({ x: 4, y: 56, width: 392, height: 88 });
    const s = result.scene!;
    expect(texts(group(s, "backend"))).toEqual([]);
    expect(s.items.findIndex((i) => i.kind === "group" && i.id === "backend")).toBeLessThan(
      s.items.findIndex((i) => i.kind === "group" && i.id === "api"),
    );
  });

  it("reports missing placement in manual layout", () => {
    const result = layout(
      manual('  api["API"]\n  cache["Cache"]\n  placement { place api at (1, 1) }'),
    );
    expect(result.scene).toBeNull();
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["layout.missing-placement", "error"],
    ]);
    expect(result.diagnostics[0]!.range.start.line).toBe(PLAIN_LINES + 5);
  });

  it("reports unplaced elements in assisted layout and renders fully placed ones", () => {
    const text = (second: string) =>
      `diagram d: flow {\n  layout assisted\n  api["API"]\n  cache["Cache"]\n  placement {\n    place api at (1, 1)\n${second}  }\n}\n`;
    const unplaced = layout(text(""));
    expect(unplaced.scene).toBeNull();
    expect(unplaced.diagnostics[0]).toMatchObject({
      code: "layout.mode-unsupported",
      severity: "error",
    });
    expect(unplaced.diagnostics[0]!.range.start.line).toBe(2);
    expect(layout(text("    place cache at (1, 200)\n")).scene).not.toBeNull();
  });

  it("reports a group with place but no size", () => {
    const result = layout(
      manual('  group g "G" { a["A"] }\n  placement { place a at (1, 1); place g at (0, 0) }'),
    );
    expect(result.diagnostics.map((d) => d.code)).toEqual(["layout.missing-placement"]);
  });
});

describe("route anchors", () => {
  it("meets facing sides at the centre of their overlap", () => {
    const points = routePoints(
      { x: 260, y: 20, width: 200, height: 56 },
      "south",
      { x: 240, y: 110, width: 460, height: 50 },
      "north",
      [],
    );
    expect(points).toEqual([
      { x: 360, y: 76 },
      { x: 360, y: 110 },
    ]);
  });

  it("falls back to side centres when extents do not overlap", () => {
    const points = routePoints(
      { x: 0, y: 0, width: 100, height: 50 },
      "south",
      { x: 300, y: 200, width: 100, height: 50 },
      "north",
      [],
    );
    expect(points).toEqual([
      { x: 50, y: 50 },
      { x: 350, y: 200 },
    ]);
  });

  it("projects a waypoint onto the side", () => {
    const points = routePoints(
      { x: 800, y: 20, width: 220, height: 56 },
      "east",
      { x: 580, y: 530, width: 460, height: 56 },
      "north",
      [{ x: 1035, y: 48 }],
    );
    expect(points).toEqual([
      { x: 1020, y: 48 },
      { x: 1035, y: 48 },
      { x: 1035, y: 530 },
    ]);
  });

  it("adds an elbow between perpendicular sides", () => {
    const points = routePoints(
      { x: 0, y: 0, width: 100, height: 50 },
      "east",
      { x: 300, y: 200, width: 100, height: 50 },
      "north",
      [],
    );
    expect(points).toEqual([
      { x: 100, y: 25 },
      { x: 350, y: 25 },
      { x: 350, y: 200 },
    ]);
  });

  it("chooses auto sides by proportion", () => {
    const wide = { x: 240, y: 290, width: 540, height: 200 };
    expect(sideFacing(wide, { x: 920, y: 390 })).toBe("east");
    expect(sideFacing({ x: 260, y: 20, width: 200, height: 56 }, { x: 470, y: 135 })).toBe("south");
    const s = scene(
      manual(
        '  a["A"]\n  b["B"]\n  a -> b\n  placement { place a at (100, 100); place b at (100, 300) }',
      ),
    );
    const line = polyline(group(s, "a->b#1", "relation"));
    const a = rects(group(s, "a"))[0]!;
    expect(line.points[0]!.y).toBe(a.y + a.height);
    expect(line.points[0]!.x).toBe(a.x + a.width / 2);
  });

  it("pulls the line back and draws a filled arrowhead", () => {
    const s = scene(
      manual(
        '  a["A"]\n  b["B"]\n  a -> b\n  placement { place a at (100, 100); place b at (100, 300) }',
      ),
    );
    const relation = group(s, "a->b#1", "relation");
    const line = polyline(relation);
    const head = paths(relation)[0]!;
    const b = rects(group(s, "b"))[0]!;
    expect(line.points[1]!.y).toBe(b.y - 8);
    expect(head.d.startsWith(`M100 ${b.y}`)).toBe(true);
    expect(head.fill).toBe(line.stroke);
  });
});

describe("labels and annotations", () => {
  it("places a step label beside the arrow", () => {
    const s = scene(
      manual(
        '  a["A"]\n  b["B"]\n  a -> b: "1" as r1\n  placement {\n    place a at (100, 100); place b at (100, 300)\n    label r1 at 50% offset (16, 0)\n  }',
      ),
    );
    const relation = group(s, "r1", "relation");
    const line = polyline(relation);
    const pill = rects(labelGroup(relation))[0]!;
    const midY = (line.points[0]!.y + line.points[1]!.y + 8) / 2;
    expect(pill.x + pill.width / 2).toBe(line.points[0]!.x + 16);
    expect(pill.y + pill.height / 2).toBeCloseTo(midY, 0);
    expect(pill.radius).toBe(9);
    expect(texts(labelGroup(relation))[0]!.text).toBe("1");
  });

  it("renders a note as left-aligned lines without a rect", () => {
    const s = scene(
      manual(
        '  note limits "Límites a validar\\nOBO: 30 RPS\\nCIBA: Enterprise"\n  placement { place limits at (100, 100) }',
      ),
    );
    const note = group(s, "limits");
    expect(rects(note)).toHaveLength(0);
    const lines = texts(note);
    expect(lines.map((t) => t.text)).toEqual([
      "Límites a validar",
      "OBO: 30 RPS",
      "CIBA: Enterprise",
    ]);
    expect(new Set(lines.map((t) => t.x)).size).toBe(1);
    expect(lines[1]!.y - lines[0]!.y).toBe(18);
    expect(lines[0]!.anchor).toBe("start");
  });

  it("draws shapes by kind", () => {
    const s = scene(
      manual(
        '  data db "DB"\n  decision ok "OK?"\n  tag t "JWT"\n  placement { place db at (100, 100); place ok at (300, 100); place t at (500, 100) }',
      ),
    );
    expect(paths(group(s, "db"))).toHaveLength(2);
    expect(paths(group(s, "ok"))[0]!.d).toMatch(/^M\d+(\.\d+)? \d+(\.\d+)? L/);
    const tag = rects(group(s, "t"))[0]!;
    expect(tag.height).toBe(18);
    expect(tag.radius).toBe(9);
    expect(texts(group(s, "t"))[0]!.font).toBe("mono");
    expect(s.items[s.items.length - 1]).toMatchObject({ id: "t" });
  });

  it("stacks description lines under the label", () => {
    const s = scene(
      manual(
        '  node p "proxy" { description "line one\\nline two" }\n  placement { place p at (100, 100) }',
      ),
    );
    const t = texts(group(s, "p"));
    expect(t.map((x) => x.text)).toEqual(["proxy", "line one", "line two"]);
    expect(t[2]!.y - t[1]!.y).toBe(16);
    expect(t[0]!.size).toBeGreaterThan(t[1]!.size);
  });
});

describe("styles and themes", () => {
  const styled = (style: string) =>
    scene(
      manual(
        `  node proxy "P"\n  a -> b: "1" as r1\n  placement { place proxy at (100, 100); place a at (300, 100); place b at (300, 300) }\n  ${style}`,
      ),
    );

  it("dashes a proposed element and applies its stroke", () => {
    const s = styled('style proxy { line dashed; stroke "#c4552c" }');
    expect(rects(group(s, "proxy"))[0]).toMatchObject({ dashed: true, stroke: "#c4552c" });
  });

  it("colours a relation label without touching the connector", () => {
    const s = styled('style r1 { fill "#1b1f23"; color "#ffffff" }');
    const relation = group(s, "r1", "relation");
    expect(polyline(relation).stroke).toBe(THEMES["technical.light"]!.connector);
    expect(rects(labelGroup(relation))[0]).toMatchObject({ fill: "#1b1f23", stroke: "#1b1f23" });
    expect(texts(labelGroup(relation))[0]!.fill).toBe("#ffffff");
  });

  it("overrides the arrow style with `line` and draws `none` fills", () => {
    const s = styled('style r1 { line dashed }\n  style proxy { fill "none" }');
    expect(polyline(group(s, "r1", "relation")).dashed).toBe(true);
    expect(rects(group(s, "proxy"))[0]!.fill).toBe("none");
  });

  it("warns on unknown themes and uses the default tokens", () => {
    const result = layout(
      manual('  a["A"]\n  placement { place a at (1, 1) }', '  theme "corporate"\n'),
    );
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["layout.unknown-theme", "warning"],
    ]);
    expect(result.diagnostics[0]!.range.start.line).toBe(PLAIN_LINES + 3);
    expect(result.scene!.background).toBe(THEMES["technical.light"]!.background);
  });

  it("switches tokens with editorial.dark", () => {
    const s = scene(
      manual('  a["A"]\n  placement { place a at (1, 1) }', '  theme "editorial.dark"\n'),
    );
    expect(s.background).toBe(THEMES["editorial.dark"]!.background);
    expect(rects(group(s, "a"))[0]!.fill).toBe(THEMES["editorial.dark"]!.surface);
  });

  it("carries title and description", () => {
    const s = scene(
      manual(
        '  a["A"]\n  placement { place a at (1, 1) }',
        '  title "Checkout"\n  description "Purchase path"\n',
      ),
    );
    expect([s.title, s.description]).toEqual(["Checkout", "Purchase path"]);
  });
});

describe("scene shape", () => {
  it("wraps every element and relation in an identified group", () => {
    const s = scene(
      manual('  a["A"]\n  a -> b as r\n  placement { place a at (1, 1); place b at (1, 200) }'),
    );
    const ids = s.items
      .filter((i): i is GroupItem => i.kind === "group")
      .map((i) => `${i.role}:${i.id}`);
    expect(ids).toEqual(["element:a", "element:b", "relation:r"]);
    const flat = (items: readonly SceneItem[]): string[] =>
      items.flatMap((i) => (i.kind === "group" ? flat(i.items) : [i.kind]));
    expect(flat(s.items)).toEqual(["rect", "text", "rect", "text", "polyline", "path"]);
  });
});
