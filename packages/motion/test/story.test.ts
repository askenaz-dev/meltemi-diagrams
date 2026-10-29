import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  type GroupItem,
  type PathItem,
  type PolylineItem,
  type Scene,
  type SceneItem,
} from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile, type Compilation } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  boundsOf,
  sceneGroups,
  storyFrame,
  storyTimeline,
  storyViewData,
  trackLength,
  type StoryViews,
} from "@meltemi/diagrams-motion";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");
const engine = createElkEngine();

function setup(text: string) {
  const compilation: Compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const story = compilation.document.stories[0]!;
  const timeline = storyTimeline(story);
  const cache = new Map<string, ReturnType<typeof storyViewData>>();
  const views: StoryViews = (key) => {
    if (!cache.has(key)) {
      const diagram = compilation.document.diagrams.find((d) => d.id === key);
      cache.set(
        key,
        diagram
          ? storyViewData(diagram, layoutDiagram(compilation, diagram, { engine }))
          : undefined,
      );
    }
    return cache.get(key);
  };
  return {
    timeline,
    views,
    frame: (t: number) => storyFrame(timeline, views, t, { accent: "#ff0000" })!,
  };
}

const group = (scene: Scene, id: string, role = "element") =>
  sceneGroups(scene.items).find((g) => g.id === id && g.role === role);
const overlays = (scene: Scene): SceneItem[] => [
  ...(scene.items.find((i): i is GroupItem => i.kind === "group" && i.id === "story")?.items ?? []),
];

describe("story timeline", () => {
  it("times the purchase story", () => {
    const { timeline } = setup(purchase);
    expect(timeline.durationMs).toBe(7400);
    expect(timeline.scenes.map((s) => [s.id, s.startMs])).toEqual([
      ["overview", 0],
      ["processing", 1800],
    ]);
    expect(timeline.views).toEqual(["checkout"]);
    // Plain data: it survives JSON.
    expect(JSON.parse(JSON.stringify(timeline))).toEqual(timeline);
  });
});

describe("story frames", () => {
  it("starts revealed boxes hidden and fades them in", () => {
    const { frame } = setup(purchase);
    expect(group(frame(0), "db")!.opacity).toBe(0);
    expect(group(frame(400), "db")!.opacity).toBe(0.5);
    expect(group(frame(800), "db")!.opacity).toBeUndefined();
    // Relations follow their least visible end.
    expect(group(frame(400), "save", "relation")!.opacity).toBe(0.5);
    expect(group(frame(800), "save", "relation")!.opacity).toBeUndefined();
  });

  it("draws a trace halfway and suspends the relation's flow", () => {
    const { frame, views } = setup(purchase);
    // `trace request over 1200ms` runs from 1800 to 3000.
    const at = frame(2400);
    // The trace is drawn in the relation's group, under its label.
    const relation = group(at, "request", "relation")!;
    const traced = relation.items.filter(
      (i) =>
        (i.kind === "polyline" && i.stroke === "#ff0000") ||
        (i.kind === "path" && i.fill === "#ff0000"),
    );
    const [line, head] = traced as [PolylineItem, PathItem];
    const label = relation.items.findIndex((i) => i.kind === "group" && i.role === "label");
    expect(relation.items.indexOf(head)).toBeLessThan(label);
    expect(overlays(at)).toEqual([]);
    expect(line.stroke).toBe("#ff0000");
    const track = group(views("checkout")!.scene, "request", "relation")!.track!;
    expect(trackLength(line.points)).toBeCloseTo(trackLength(track) / 2, 0);
    expect(head.fill).toBe("#ff0000");
    // The flow of `request` is not drawn while it is traced, and is drawn again afterwards: its
    // particles ride the relation under its label, beside the trace's red head.
    const particles = (scene: Scene) =>
      group(scene, "request", "relation")!.items.filter(
        (i) => i.kind === "path" && / a[\d.]+ /.test(i.d) && i.fill !== "#ff0000",
      );
    expect(particles(at)).toEqual([]);
    expect(particles(frame(3100)).length).toBeGreaterThan(0);
  });

  it("highlights for the action's time only", () => {
    const { frame } = setup(purchase);
    // `highlight db over 1200ms` runs from 4200 to 5400.
    const during = overlays(frame(4800)).find(
      (i) => i.kind === "path" && i.stroke === "#ff0000",
    ) as PathItem;
    expect(during.opacity).toBe(1);
    expect(overlays(frame(5600))).toEqual([]);
  });

  it("frames the camera and dims what is out of focus", () => {
    const text = purchase.replace(
      "    hold 2s\n  }\n}",
      "    hold 2s\n  }\n\n  scene closer {\n    focus db\n    camera db over 800ms\n  }\n}",
    );
    const { frame, views } = setup(text);
    const end = frame(7400 + 600 + 800);
    const db = group(views("checkout")!.scene, "db")!.bounds!;
    const box = end.viewBox!;
    expect(box.x).toBeLessThanOrEqual(db.x - 39);
    expect(box.x + box.width).toBeGreaterThanOrEqual(db.x + db.width + 39);
    expect(box.width / box.height).toBeCloseTo(end.width / end.height, 2);
    expect(group(end, "client")!.opacity).toBe(0.25);
    expect(group(end, "db")!.opacity).toBeUndefined();
    expect(renderSvg(end)).toContain(`viewBox="${box.x} ${box.y} ${box.width} ${box.height}"`);
  });

  it("morphs boxes matched by id between two views", () => {
    const text = [
      'language "0.2"',
      "diagram one: flow {",
      "  layout manual",
      "  node a",
      "  node b",
      "  placement {",
      "    place a at (100, 100)",
      "    place b at (300, 100)",
      "  }",
      "}",
      "diagram two: flow {",
      "  layout manual",
      "  node a",
      "  node c",
      "  placement {",
      "    place c at (100, 300)",
      "    place a at (300, 300)",
      "  }",
      "}",
      "story s for one {",
      "  scene first { hold 1s }",
      "  scene second {",
      "    view two",
      "    transition morph over 1s",
      "    hold 1s",
      "  }",
      "}",
    ].join("\n");
    const { frame } = setup(text);
    const middle = frame(1500);
    const moving = middle.items.find(
      (i): i is GroupItem => i.kind === "group" && i.id === "a#morph",
    )!;
    expect(moving.transform).toMatch(/^translate\(-100 0\)/);
    expect(group(middle, "c")!.opacity).toBe(0.5);
    expect(group(middle, "b")!.opacity).toBe(0.5);
    expect(frame(2000).items.some((i) => i.kind === "group" && i.id === "a#morph")).toBe(false);
  });

  it("is deterministic", () => {
    const { frame } = setup(purchase);
    expect(renderSvg(frame(4321))).toBe(renderSvg(frame(4321)));
  });
});

describe("draw frames", () => {
  /**
   * A whiteboard with two pens of the same length, the second green, wide and faded, and a flow
   * on the first; a story that waits, draws both over a second, then holds.
   */
  const BOARD = [
    'language "0.2"',
    "diagram board: free {",
    "  pen a [(0, 0), (100, 40), (200, 0)]",
    "  pen b [(0, 100), (100, 140), (200, 100)]",
    '  style b { stroke "#00aa00"; width 6; opacity 0.5 }',
    "  animate a { effect flow }",
    "}",
    "story walk for board {",
    "  scene intro { hold 500ms }",
    "  scene strokes { draw a, b over 1s }",
    "  scene after { hold 1s }",
    "}",
  ].join("\n");
  const drawn = (scene: Scene, id: string) =>
    group(scene, id)!.items.filter((i): i is PolylineItem => i.kind === "polyline");

  it("times the action with its targets in order", () => {
    const { timeline } = setup(BOARD);
    const [action] = timeline.scenes[1]!.actions;
    expect(action).toMatchObject({ kind: "draw", startMs: 500, durationMs: 1000 });
    expect(action!.targets.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("draws the first half of the first stroke and nothing of the second halfway through", () => {
    const { frame, views } = setup(BOARD);
    // 250 ms into the action: `a` takes the first half of the second, `b` the second half.
    const at = frame(750);
    const still = views("board")!.scene;
    const track = group(still, "a")!.track!;
    const [line, ...rest] = group(at, "a")!.items;
    expect(rest).toEqual([]);
    const stroke = line as PolylineItem;
    // The whole smoothed path, with a dash that shows its first half: the pen's own colour and
    // width, no dot at the head.
    expect(stroke.points[0]).toEqual(track[0]);
    expect(stroke.points[stroke.points.length - 1]).toEqual(track[track.length - 1]);
    expect(stroke.points.length).toBeGreaterThan(track.length);
    const pen = group(still, "a")!.items[0] as PathItem;
    expect(stroke.stroke).toBe(pen.stroke);
    expect(stroke.strokeWidth).toBe(pen.strokeWidth);
    const length = Math.round(trackLength(stroke.points) * 100) / 100;
    expect(stroke.dash!.array[0]).toBe(length);
    expect(stroke.dash!.array[1]).toBeGreaterThan(length);
    expect(stroke.dash!.offset).toBeCloseTo(length / 2, 1);
    expect(group(at, "a")!.opacity).toBeUndefined();
    // Nothing of `b` yet.
    expect(group(at, "b")!.items).toEqual([]);
    // A quarter later `b` is half drawn in its own colour and width, at its own opacity.
    const later = frame(1250);
    expect(group(later, "a")!.items[0]).toEqual(pen);
    const [green] = drawn(later, "b");
    expect(green).toMatchObject({ stroke: "#00aa00", strokeWidth: 6 });
    expect(green!.dash!.offset).toBeCloseTo(green!.dash!.array[0]! / 2, 1);
    expect(group(later, "b")!.styleOpacity).toBe(0.5);
  });

  it("suspends the target's effects while it is drawn", () => {
    const { frame } = setup(BOARD);
    const particles = (scene: Scene) =>
      group(scene, "a")!.items.filter((i) => i.kind === "path" && / a[\d.]+ /.test(i.d));
    expect(particles(frame(750))).toEqual([]);
    expect(particles(frame(1600)).length).toBeGreaterThan(0);
  });

  it("leaves both strokes whole at their own opacity after the action", () => {
    const { frame, views } = setup(BOARD);
    const still = views("board")!.scene;
    const after = frame(1600);
    expect(group(after, "b")).toEqual(group(still, "b"));
    expect(group(after, "b")!.styleOpacity).toBe(0.5);
    expect(group(after, "b")!.opacity).toBeUndefined();
    // `a` is its picture with its flow particles, and no dash of the drawing remains.
    expect(group(after, "a")!.items[0]).toEqual(group(still, "a")!.items[0]);
    expect(drawn(after, "a").some((i) => i.dash)).toBe(false);
    expect(overlays(after)).toEqual([]);
  });

  it("hides a stroke drawn in a later scene", () => {
    const { frame } = setup(BOARD);
    expect(group(frame(200), "a")!.opacity).toBe(0);
    expect(group(frame(200), "b")!.opacity).toBe(0);
    // The scene that draws them shows each from its start.
    expect(group(frame(510), "a")!.opacity).toBeUndefined();
  });

  it("shares the time in proportion to the lengths, a dot taking none", () => {
    const text = [
      'language "0.2"',
      "diagram board: free {",
      "  pen long [(0, 0), (200, 0)]",
      "  pen dot [(50, 50)]",
      "  pen short [(0, 100), (100, 100)]",
      "}",
      "story walk for board {",
      "  scene one { draw long, dot, short over 900ms }",
      "}",
    ].join("\n");
    const { frame, views } = setup(text);
    const offset = (scene: Scene, id: string) => drawn(scene, id)[0]!.dash!.offset;
    // `long` takes 600 ms: half of it at 300 ms.
    expect(offset(frame(300), "long")).toBeCloseTo(100, 1);
    expect(group(frame(300), "dot")!.items).toEqual([]);
    expect(group(frame(300), "short")!.items).toEqual([]);
    // Then the dot at once and `short` over 300 ms.
    const still = views("board")!.scene;
    expect(group(frame(750), "long")).toEqual(group(still, "long"));
    expect(group(frame(750), "dot")).toEqual(group(still, "dot"));
    expect(offset(frame(750), "short")).toBeCloseTo(50, 1);
  });

  it("draws a line and a named relation in their own colours, heads and label at the end", () => {
    const text = [
      'language "0.2"',
      "diagram board: free {",
      '  box x "X"',
      '  box y "Y"',
      '  x -> y: "pays" as link',
      '  style link { stroke "#123456" }',
      "  line l from (0, 300) to (300, 300)",
      "  style l { arrowhead triangle }",
      "  placement {",
      "    place x at (100, 100)",
      "    place y at (400, 100)",
      "  }",
      "}",
      "story walk for board {",
      "  scene one { draw link, l over 1s }",
      "}",
    ].join("\n");
    const { frame, views } = setup(text);
    const still = views("board")!.scene;
    const relation = group(frame(100), "link", "relation")!;
    expect(relation.items).toHaveLength(1);
    expect(relation.items[0]).toMatchObject({ kind: "polyline", stroke: "#123456" });
    // Nothing of the relation shows as the action starts, and its boxes stay.
    expect(group(frame(0), "link", "relation")!.items).toEqual([]);
    expect(group(frame(100), "x")).toEqual(group(still, "x"));
    expect(group(frame(1000), "link", "relation")).toEqual(group(still, "link", "relation"));
    const line = group(still, "l")!;
    const during = group(frame(990), "l")!;
    expect(during.items).toHaveLength(1);
    expect(during.items[0]).toMatchObject({
      kind: "polyline",
      stroke: (line.items[0] as PolylineItem).stroke,
    });
    expect(group(frame(1000), "l")).toEqual(line);
  });

  it("cuts a dashed or dotted stroke where it has grown, keeping its own pattern", () => {
    const text = [
      'language "0.2"',
      "diagram board: free {",
      "  pen p [(0, 0), (200, 0)]",
      "  pen q [(0, 40), (200, 40)]",
      "  style p { line dashed }",
      "  style q { line dotted }",
      "}",
      "story walk for board {",
      "  scene one { draw p, q over 1s }",
      "}",
    ].join("\n");
    const { frame, views } = setup(text);
    const [origin] = group(views("board")!.scene, "p")!.track!;
    const [dashed] = drawn(frame(250), "p");
    expect(dashed).toMatchObject({
      dashed: true,
      points: [origin, { ...origin, x: origin!.x + 100 }],
    });
    expect(dashed!.dash).toBeUndefined();
    const [dotted] = drawn(frame(750), "q");
    expect(dotted).toMatchObject({ dashed: "dotted" });
    expect(trackLength(dotted!.points)).toBeCloseTo(100, 1);
  });

  it("is deterministic", () => {
    const { frame } = setup(BOARD);
    expect(renderSvg(frame(987))).toBe(renderSvg(frame(987)));
  });
});

describe("camera bounds", () => {
  it("frames a group by its track when it has no bounds, however many points it holds", () => {
    const track = Array.from({ length: 130_000 }, (_, i) => ({
      x: i % 1000,
      y: Math.floor(i / 1000),
    }));
    const scene: Scene = {
      width: 1000,
      height: 200,
      background: "#fff",
      title: null,
      description: null,
      fonts: { body: "sans-serif", mono: "monospace" },
      gradients: [],
      patterns: [],
      items: [{ kind: "group", id: "p", role: "element", freehand: true, items: [], track }],
    };
    expect(boundsOf(scene, ["p"])).toEqual({ x: 0, y: 0, width: 999, height: 129 });
  });
});

describe("two views in one frame", () => {
  it("keeps the clip of a sticky in each view apart", () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
    const { frame } = setup(
      [
        "diagram one: free {",
        `  sticky s "${words}"`,
        "  placement { place s at (100, 100) }",
        "}",
        "diagram two: free {",
        `  sticky s "${words}"`,
        "  placement { place s at (500, 300) }",
        "}",
        "story st for one {",
        "  scene a { hold 1s }",
        "  scene b {",
        "    view two",
        "    transition fade over 1s",
        "    hold 1s",
        "  }",
        "}",
      ].join("\n"),
    );
    // Halfway through the fade both pictures are drawn, each sticky clipped to its own card.
    const svg = renderSvg(frame(1500));
    const ids = [...svg.matchAll(/<clipPath id="([^"]+)">/g)].map((m) => m[1]);
    expect(ids).toEqual(["clip-one-s", "clip-two-s"]);
    const used = new Set([...svg.matchAll(/clip-path="url\(#([^)]+)\)"/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual(["clip-one-s", "clip-two-s"]);
  });
});
