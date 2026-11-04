import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { gridEngine } from "../../../test-support/grid-engine.js";
import {
  layoutDiagram,
  type ArrangeRequest,
  type Arrangement,
  type GroupItem,
  type LayoutEngine,
  type LayoutOptions,
  type PolylineItem,
  type RectItem,
  type Scene,
  type TextItem,
} from "../src/index.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function run(kind: "flow" | "free", body: string, options: LayoutOptions = {}, mode = "manual") {
  const source = `${PLAIN}diagram d: ${kind} {\n  layout ${mode}\n  theme "plain"\n${body}\n}\n`;
  const compilation = compile(source);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
  return { ...result, codes: result.diagnostics.map((d) => d.code) };
}

function group(scene: Scene, id: string): GroupItem {
  const found = scene.items.find(
    (i): i is GroupItem => i.kind === "group" && i.id === id && i.role === "element",
  );
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

const rects = (g: GroupItem) => g.items.filter((i): i is RectItem => i.kind === "rect");
const texts = (g: GroupItem) => g.items.filter((i): i is TextItem => i.kind === "text");
const leaders = (g: GroupItem) =>
  g.items.filter((i): i is PolylineItem => i.kind === "polyline" && i.className === "leader");

describe("notes in free compositions are drawn", () => {
  it("draws the lines of a note at the note size with an outline when it is styled", () => {
    const result = run(
      "free",
      '  note hint "Draft\\nnot final"\n  style hint { fill "#fff3bf"; stroke "#e8a600" }\n  placement {\n    place hint at (300, 100)\n  }',
    );
    const g = group(result.scene!, "hint");
    const [outline] = rects(g);
    expect(outline).toMatchObject({ fill: "#fff3bf", stroke: "#e8a600" });
    const lines = texts(g);
    expect(lines.map((t) => [t.text, t.size, t.weight, t.anchor])).toEqual([
      ["Draft", 11, 400, "start"],
      ["not final", 11, 400, "start"],
    ]);
    expect(lines[1]!.y - lines[0]!.y).toBe(18);
    // The note's box is the outline's.
    expect(g.bounds).toMatchObject({
      x: outline!.x,
      y: outline!.y,
      width: outline!.width,
      height: outline!.height,
    });
  });

  it("measures at fontSize and anchors centred text at the middle of its box", () => {
    const result = run(
      "free",
      '  note hint "Draft\\nnot final"\n  style hint { textAlign center; fontSize 16; fontWeight 600; stroke "#e8a600" }\n  placement {\n    place hint at (300, 100)\n    size hint (200, 60)\n  }',
    );
    const g = group(result.scene!, "hint");
    const lines = texts(g);
    expect(lines.map((t) => [t.size, t.weight, t.anchor])).toEqual([
      [16, 600, "middle"],
      [16, 600, "middle"],
    ]);
    const box = g.bounds!;
    for (const line of lines) expect(line.x).toBeCloseTo(box.x + box.width / 2, 5);
    expect(box.width).toBe(200);
    // Right-aligned text anchors at the right edge.
    const right = run(
      "free",
      '  note hint "Draft"\n  style hint { textAlign right }\n  placement {\n    place hint at (300, 100)\n    size hint (200, 40)\n  }',
    );
    expect(texts(group(right.scene!, "hint"))[0]).toMatchObject({ anchor: "end" });
  });

  it("sizes a note by its longest line and by fontSize", () => {
    const small = run("free", '  note n "Short"\n  placement {\n    place n at (100, 100)\n  }');
    const large = run(
      "free",
      '  note n "Short"\n  style n { fontSize 22 }\n  placement {\n    place n at (100, 100)\n  }',
    );
    const widthOf = (r: typeof small) => group(r.scene!, "n").bounds!.width;
    expect(widthOf(large)).toBeGreaterThan(widthOf(small));
    const two = run("free", '  note n "a\\nb"\n  placement {\n    place n at (100, 100)\n  }');
    expect(group(two.scene!, "n").bounds!.height).toBe(2 * 18 + 4);
  });

  it("paints a note on a front layer after the objects declared later", () => {
    const result = run(
      "free",
      '  layers main, front\n  note n "T" { layer front }\n  box a "A"\n  placement {\n    place n at (100, 100)\n    place a at (300, 100)\n  }',
    );
    const order = result.scene!.items.flatMap((i) => (i.kind === "group" ? [i.id] : []));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("n"));
  });

  it("reports no label overlap for a note over a shape, and a size that is too small", () => {
    const over = run(
      "free",
      '  box a "A"\n  note n "Over the box"\n  placement {\n    place a at (100, 100)\n    place n at (100, 122)\n  }',
    );
    expect(over.codes).not.toContain("layout.label-overlap");
    const tight = run(
      "free",
      '  note hint "Draft\\nnot final"\n  placement {\n    place hint at (100, 100)\n    size hint (40, 20)\n  }',
    );
    expect(tight.codes).toContain("layout.text-overflow");
    expect(group(tight.scene!, "hint").bounds!.width).toBe(40);
  });
});

describe("attached notes", () => {
  const MANUAL =
    '  api["API"]\n  note limits "500 rps" on api\n  placement {\n    place api at (420, 60)\n    size api (200, 56)\n    place limits at (420, 470)\n  }';

  it("ends the note's group with a dotted leader from its edge to the element's", () => {
    const result = run("flow", MANUAL);
    const g = group(result.scene!, "limits");
    const [leader] = leaders(g);
    expect(g.items[g.items.length - 1]).toBe(leader);
    expect(leader).toMatchObject({ stroke: "#526579", dashed: "dotted", strokeWidth: 1 });
    expect(leader!.points).toHaveLength(2);
    const note = g.bounds!;
    const api = group(result.scene!, "api").bounds!;
    const [from, to] = leader!.points;
    // It leaves the note's top edge and enters the bottom edge of `api`.
    expect(from!.y).toBeCloseTo(note.y, 0);
    expect(to!.y).toBeCloseTo(api.y + api.height, 0);
    // The leader is no relation: nothing of the sort is drawn or reported.
    expect(result.scene!.items.filter((i) => i.kind === "group" && i.role === "relation")).toEqual(
      [],
    );
    expect(result.connectors?.size ?? 0).toBe(0);
  });

  it("draws no leader when the note lies over its element, or targets itself or a hidden one", () => {
    const over = run(
      "flow",
      '  api["API"]\n  note n "Over" on api\n  placement {\n    place api at (300, 100)\n    place n at (300, 122)\n  }',
    );
    expect(leaders(group(over.scene!, "n"))).toEqual([]);
    expect(over.codes).toEqual([]);
  });

  it("keeps a turned note's leader in the note's own frame", () => {
    const result = run(
      "free",
      '  box a "A"\n  note n "Turned" on a\n  style n { rotation 90; stroke "#e8a600" }\n  placement {\n    place a at (100, 100)\n    place n at (500, 100)\n  }',
    );
    const g = group(result.scene!, "n");
    expect(g.transform).toMatch(/^rotate\(90 /);
    const [leader] = leaders(g);
    // The leader leaves the left of the turned note in the world; the group turns its items, so in
    // the note's own frame it starts on the bottom edge (a quarter turn clockwise brings the
    // bottom to the left).
    const box = g.bounds!;
    expect(leader!.points[0]!.y).toBeCloseTo(box.y + box.height, 0);
  });

  it("asks the engine for an edge from the element to a note in auto, not primary", () => {
    const requests: ArrangeRequest[] = [];
    const spy: LayoutEngine = {
      name: "spy",
      arrange(request: ArrangeRequest): Arrangement {
        requests.push(request);
        return gridEngine.arrange(request);
      },
    };
    const result = run("flow", '  a -> b\n  b -> c\n  note n "Why" on b', { engine: spy }, "auto");
    const edge = requests[0]!.edges.find((e) => e.id === "\u0002attach\u0002n")!;
    expect(edge).toMatchObject({
      source: "b",
      target: "n",
      primary: false,
      sourcePort: null,
      targetPort: null,
    });
    expect(edge.label ?? null).toBeNull();
    expect(requests[0]!.edges.filter((e) => e.id.startsWith("\u0002attach"))).toHaveLength(1);
    // The leader is drawn from the arranged places; no route is drawn for it.
    expect(leaders(group(result.scene!, "n"))).toHaveLength(1);
    expect(
      result.scene!.items.filter((i) => i.kind === "group" && i.role === "relation"),
    ).toHaveLength(2);
  });

  it("adds no edge for a placed note in assisted, nor in manual, and the note stays", () => {
    const requests: ArrangeRequest[] = [];
    const spy: LayoutEngine = {
      name: "spy",
      arrange(request: ArrangeRequest): Arrangement {
        requests.push(request);
        return gridEngine.arrange(request);
      },
    };
    const placed = run(
      "flow",
      '  a -> b\n  note n "Why" on b\n  placement {\n    place n at (100, 400)\n  }',
      { engine: spy },
      "assisted",
    );
    expect(requests[0]!.edges.some((e) => e.id.startsWith("\u0002attach"))).toBe(false);
    expect(group(placed.scene!, "n").bounds).toMatchObject({ x: expect.any(Number) });
    const box = group(placed.scene!, "n").bounds!;
    expect(box.x + box.width / 2).toBeCloseTo(group(placed.scene!, "n").bounds!.x + box.width / 2);
    expect(leaders(group(placed.scene!, "n"))).toHaveLength(1);
    // An unplaced note in assisted does get its edge.
    requests.length = 0;
    run("flow", '  a -> b\n  note n "Why" on b', { engine: spy }, "assisted");
    expect(requests[0]!.edges.some((e) => e.id === "\u0002attach\u0002n")).toBe(true);
  });

  it("reports an attached note without a place in manual layout, and places nothing", () => {
    const result = run(
      "flow",
      '  a["A"]\n  b["B"]\n  note n "Why" on b\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }',
    );
    expect(result.codes).toContain("layout.missing-placement");
    const missing = result.diagnostics.find((d) => d.code === "layout.missing-placement")!;
    expect(missing.data?.ids ?? [missing.message]).toBeTruthy();
  });

  it("draws a leader in a C4 view's note, to the entity it is attached to", () => {
    const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const compilation = compile(commerce);
    const view = compilation.document.diagrams.find((d) => d.id === "containers")!;
    const result = layoutDiagram(compilation, view, { engine: gridEngine });
    expect(result.scene).not.toBeNull();
    const note = group(result.scene!, "cache");
    expect(leaders(note)).toHaveLength(1);
    expect(texts(note).map((t) => t.text)).toEqual(["Cached 5 min"]);
    // The model's entities are untouched: the type line of an entity is no part of the note.
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
