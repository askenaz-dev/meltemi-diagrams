import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  type GroupItem,
  type PathItem,
  type PolylineItem,
  type RectItem,
  type Scene,
  type SceneItem,
} from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile, type Compilation } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  BEFORE_NEXT_SCENE,
  boundsOf,
  sceneGroups,
  sceneStills,
  storyFrame,
  storyTimeline,
  storyViewData,
  trackLength,
  type StoryViews,
} from "@meltemi/diagrams-motion";
import { CORPUS_ROOT, REPO_ROOT } from "../../../test-support/corpus.js";

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

  it("gives each scene's final state: just before the next scene, and the end for the last", () => {
    const { timeline } = setup(purchase);
    expect(sceneStills(timeline)).toEqual([
      { id: "overview", title: null, view: "checkout", atMs: 1800 - BEFORE_NEXT_SCENE },
      { id: "processing", title: null, view: "checkout", atMs: 7400 },
    ]);
    expect(BEFORE_NEXT_SCENE).toBe(0.01);
    // A scene that takes no time is its own start.
    expect(
      sceneStills({
        scenes: [
          { ...timeline.scenes[0]!, startMs: 0, durationMs: 0 },
          { ...timeline.scenes[1]!, startMs: 0 },
        ],
      })[0]!.atMs,
    ).toBe(0);
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

describe("sequence diagrams in a story", () => {
  /**
   * A participant with a badge and a written activation, a call whose block activates `bank`, a
   * tagged message; a story that reveals `api` over a second, then focuses on it.
   */
  const SEQUENCE = [
    'language "0.2"',
    "diagram pay: sequence {",
    '  participant customer "Customer"',
    '  participant api "API" { tag "v2" }',
    '  participant bank "Bank"',
    '  customer -> api: "Pay" as pay { tag "PKCE" }',
    "  activate api",
    '  api -> bank: "Authorize" as authorize {',
    '    return "OK" as ok',
    "  }",
    '  customer -> bank: "Audit" as audit { tag "async" }',
    '  api --> customer: "Receipt" as receipt',
    "  deactivate api",
    "}",
    "story tour for pay {",
    "  scene one { reveal api over 1s }",
    "  scene two { focus api over 200ms }",
    "}",
  ].join("\n");
  /** The pill groups of an owner, inside its own group. */
  const pills = (owner: GroupItem) =>
    sceneGroups(owner.items).filter((g) => g.role === "tag" && g.id === owner.id);

  it("Tags go with their owner", () => {
    const { frame, views } = setup(SEQUENCE);
    const still = views("pay")!.scene;
    // The badge of `api` and the pill of `pay` are drawn inside their owners' groups.
    expect(pills(group(still, "api")!).map((g) => g.tag)).toEqual([0]);
    expect(pills(group(still, "pay", "relation")!).map((g) => g.tag)).toEqual([0]);
    // Revealed halfway, the participant's group is half visible with its badge, which has no
    // opacity of its own; the message to it follows its least visible end, its pill with it.
    const half = frame(500);
    const api = group(half, "api")!;
    expect(api.opacity).toBe(0.5);
    expect(pills(api).map((g) => g.opacity)).toEqual([undefined]);
    const pay = group(half, "pay", "relation")!;
    expect(pay.opacity).toBe(0.5);
    expect(pills(pay)).toHaveLength(1);
    // Focused on `api`, the message between `customer` and `bank` dims with its pill inside it.
    const focused = frame(1200);
    expect(group(focused, "api")!.opacity).toBeUndefined();
    expect(pills(group(focused, "api")!)).toEqual(pills(group(still, "api")!));
    const audit = group(focused, "audit", "relation")!;
    expect(audit.opacity).toBe(0.25);
    expect(pills(audit).map((g) => g.opacity)).toEqual([undefined]);
  });

  it("keeps a participant's activation bars in focus with it", () => {
    const { frame, views } = setup(SEQUENCE);
    const still = views("pay")!.scene;
    // The written bar of `api` and the bar the block of `authorize` draws on `bank`.
    expect(group(still, "api", "lifeline")!.items).toContainEqual(
      expect.objectContaining({ kind: "group", id: "activate#1", role: "event" }),
    );
    expect(group(still, "bank", "lifeline")!.items).toContainEqual(
      expect.objectContaining({ kind: "group", id: "authorize", role: "event" }),
    );
    const focused = frame(1200);
    // Focused on `api`: its bar stays as its participant does; `bank`'s bar dims as `bank` does.
    expect(group(focused, "activate#1", "event")!.opacity).toBeUndefined();
    expect(group(focused, "bank")!.opacity).toBe(0.25);
    expect(group(focused, "authorize", "event")!.opacity).toBe(0.25);
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

describe("gantt frames", () => {
  const ROADMAP = readFileSync(join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"), "utf8");
  /** Two bars of two days each, in a row and linked by an arrow, and a third task after them. */
  const BARS = (story: string) =>
    [
      'language "0.2"',
      "diagram plan: gantt {",
      '  task a "A" from 2026-06-01 for 2d',
      '  task b "B" after a for 2d',
      '  task c "C" after b for 2d',
      '  task d "D" after c for 2d',
      "}",
      "story walk for plan {",
      story,
      "}",
    ].join("\n");
  /** The owner's chart, with statements added before its closing brace, and a story about it. */
  const owners = (story: string, extra = "") =>
    `${ROADMAP.replace(/\}\s*$/, `${extra}\n}\n`)}\nstory plan for hoja_de_ruta_genai {\n${story}\n}\n`;
  const bar = (scene: Scene, id: string) => group(scene, id)!.bounds!;
  const first = (scene: Scene, id: string, kind: SceneItem["kind"]) =>
    group(scene, id)!.items.find((i) => i.kind === kind);
  /** The line a trace draws over an arrow: the polyline in the story's accent. */
  const traced = (scene: Scene, id: string) =>
    group(scene, id, "relation")!.items.find(
      (i): i is PolylineItem => i.kind === "polyline" && i.stroke === "#ff0000",
    );

  it("grows two bars one after the other: the left half of the first, nothing of the second", () => {
    const { frame, views } = setup(BARS("  scene one { draw a, b over 1s }"));
    const still = views("plan")!.scene;
    // Both bars are two days wide: 250 ms into a second is half of the first one's share.
    const at = frame(250);
    const a = bar(still, "a");
    const cut = Math.round((a.x + a.width / 2) * 100) / 100;
    const [fill, edge, label, ...rest] = group(at, "a")!.items;
    expect(rest).toEqual([]);
    expect(label).toMatchObject({ kind: "text", text: "A" });
    expect(fill).toMatchObject({ kind: "path", stroke: "none" });
    expect((fill as PathItem).d).toContain(`H${cut} V`);
    // The stroke leaves the cut edge open: only the top, the left and the bottom of the bar.
    expect(edge).toMatchObject({ kind: "path", fill: "none" });
    expect((edge as PathItem).d.startsWith(`M${cut} `)).toBe(true);
    expect((edge as PathItem).d.endsWith(`H${cut}`)).toBe(true);
    expect((fill as PathItem).fill).toBe((first(still, "a", "rect") as RectItem).fill);
    // The label is clipped to the same line, in the group's own coordinates.
    const clip = group(at, "a")!.textClip!;
    expect(clip.x + clip.width).toBeCloseTo(cut, 1);
    expect(clip.y).toBeLessThan(a.y);
    expect(clip.y + clip.height).toBeGreaterThan(a.y + a.height);
    // Nothing of the second bar, and no arrow into it yet.
    expect(group(at, "b")!.items).toEqual([]);
    expect(group(at, "a->b#1", "relation")!.opacity).toBe(0);
    // The tasks no action names are drawn as the chart draws them.
    expect(group(at, "c")).toEqual(group(views("plan")!.scene, "c"));
  });

  it("starts a task hidden when its first action is a draw, and leaves it drawn", () => {
    const { frame, views } = setup(
      BARS(
        "  scene intro { hold 500ms }\n  scene bars { draw a, b over 1s }\n  scene after { hold 1s }",
      ),
    );
    const still = views("plan")!.scene;
    expect(group(frame(200), "a")!.opacity).toBe(0);
    expect(group(frame(200), "b")!.opacity).toBe(0);
    expect(group(frame(200), "a->b#1", "relation")!.opacity).toBe(0);
    // The scene that draws them shows each from its start: a clipped group, then the group.
    expect(group(frame(510), "a")!.opacity).toBeUndefined();
    expect(group(frame(510), "a")!.textClip).toBeDefined();
    // 750 ms in, `a` is whole at half the action and `b` is half drawn; the arrow came in with `b`.
    const later = frame(1250);
    expect(group(later, "a")).toEqual(group(still, "a"));
    expect(group(later, "a")!.textClip).toBeUndefined();
    const b = bar(still, "b");
    const clip = group(later, "b")!.textClip!;
    expect(clip.x + clip.width).toBeCloseTo(b.x + b.width / 2, 1);
    expect(group(later, "a->b#1", "relation")!.opacity).toBeUndefined();
    // After the action both are drawn whole, as the chart draws them.
    const after = frame(1600);
    expect(group(after, "a")).toEqual(group(still, "a"));
    expect(group(after, "b")).toEqual(group(still, "b"));
    expect(group(after, "a->b#1", "relation")).toEqual(group(still, "a->b#1", "relation"));
  });

  it("shares the time in proportion to the width of the bars", () => {
    const text = [
      'language "0.2"',
      "diagram plan: gantt {",
      '  task long "Long" from 2026-06-01 for 6d',
      '  task short "Short" from 2026-06-01 for 2d',
      "}",
      "story walk for plan {",
      "  scene one { draw long, short over 800ms }",
      "}",
    ].join("\n");
    const { frame, views } = setup(text);
    const still = views("plan")!.scene;
    // `long` takes three quarters of the action: 600 ms. Half of it at 300 ms.
    const long = bar(still, "long");
    const half = group(frame(300), "long")!.textClip!;
    expect(half.x + half.width).toBeCloseTo(long.x + long.width / 2, 1);
    expect(group(frame(300), "short")!.items).toEqual([]);
    // Then `short`, over its own 200 ms: half of it at 700 ms.
    expect(group(frame(600), "long")).toEqual(group(still, "long"));
    const short = bar(still, "short");
    const second = group(frame(700), "short")!.textClip!;
    expect(second.x + second.width).toBeCloseTo(short.x + short.width / 2, 1);
  });

  it("keeps the rounded ends of a bar where the clip has not reached them", () => {
    const { frame, views } = setup(BARS("  scene one { draw a over 1s }"));
    const a = bar(views("plan")!.scene, "a");
    const radius = a.radius;
    expect(radius).toBeGreaterThan(0);
    const d = (t: number) => (first(frame(t), "a", "path") as PathItem).d;
    // Early, inside the rounded start: no straight top edge yet, two arcs and the cut.
    const early = d(Math.round((radius / 2 / a.width) * 1000));
    expect(early.match(/A/g)).toHaveLength(2);
    expect(early).not.toContain("H");
    // Past the start: both left arcs, the straight top and bottom up to the cut.
    expect(d(500).match(/A/g)).toHaveLength(2);
    expect(d(500)).toContain("H");
    // Near the end, inside the rounded finish: the right arcs are cut too.
    const late = d(Math.round(((a.width - radius / 2) / a.width) * 1000));
    expect(late.match(/A/g)).toHaveLength(4);
    // A bar that has not started draws nothing, and one that is done is the bar itself.
    expect(group(frame(0), "a")!.items).toEqual([]);
    expect(group(frame(1000), "a")).toEqual(group(views("plan")!.scene, "a"));
  });

  it("shows the label of a bar only where the clip has reached it, and after it when it is whole", () => {
    const { frame, views } = setup(owners("  scene one { draw tec0, sdlc2 over 2s }"));
    const still = views("hoja_de_ruta_genai")!.scene;
    const tec0 = group(still, "tec0")!;
    // The label of tec0 stands after its short bar: outside the clip until the bar is whole.
    expect(tec0.bounds!.label!.x).toBeGreaterThan(tec0.bounds!.x + tec0.bounds!.width - 1);
    const early = group(frame(400), "tec0")!;
    expect(early.textClip!.x + early.textClip!.width).toBeLessThan(tec0.bounds!.label!.x);
    expect(early.items.some((i) => i.kind === "text")).toBe(true);
    // The last task's label stands before its bar: inside the clip from its first frame.
    const sdlc2 = group(still, "sdlc2")!;
    expect(sdlc2.bounds!.label!.x + sdlc2.bounds!.label!.width).toBeLessThanOrEqual(
      sdlc2.bounds!.x + 1,
    );
    const start = group(frame(1100), "sdlc2")!.textClip!;
    expect(start.x).toBeLessThanOrEqual(sdlc2.bounds!.label!.x);
    expect(start.x + start.width).toBeGreaterThan(
      sdlc2.bounds!.label!.x + sdlc2.bounds!.label!.width,
    );
    // Whole at the end, with the label where the chart puts it.
    expect(group(frame(2000), "tec0")).toEqual(tec0);
  });

  it("writes the clip into the SVG once for each bar, drawn through by its label", () => {
    const { frame } = setup(BARS("  scene one { draw a, b over 1s }"));
    const ids = (t: number) =>
      [...renderSvg(frame(t)).matchAll(/<clipPath id="([^"]+)">/g)].map((m) => m[1]);
    // The first bar is half drawn, the second not started; then the first is whole.
    expect(ids(250)).toEqual(["mdg-draw-clip-a"]);
    expect(ids(750)).toEqual(["mdg-draw-clip-b"]);
    const svg = renderSvg(frame(250));
    expect(svg).toContain('clip-path="url(#mdg-draw-clip-a)"');
    expect(renderSvg(frame(250))).toBe(svg);
    // Whole bars need no clip.
    expect(renderSvg(frame(1500))).not.toContain("clipPath");
  });

  it("draws a sketched chart's bars cut, with the hand drawing only what is left of the outline", () => {
    const { frame } = setup(
      BARS("  scene one { draw a over 1s }").replace(
        "diagram plan: gantt {",
        'diagram plan: gantt {\n  theme "sketch.light"',
      ),
    );
    const svg = renderSvg(frame(500));
    expect(svg).toContain('data-id="a" data-role="element"');
    expect(svg).toContain("clipPath");
    expect(renderSvg(frame(500))).toBe(svg);
  });

  it("traces the arrows of a chain one after another, each over a share of its length", () => {
    const { frame, views } = setup(BARS("  scene one { trace d over 3s }"));
    const still = views("plan")!.scene;
    const key = (from: string, to: string) => `${from}->${to}#1`;
    const arrows = [key("a", "b"), key("b", "c"), key("c", "d")];
    // The three arrows are the same length: a third of the action each.
    const track = (id: string) => group(still, id, "relation")!.track!;
    expect(new Set(arrows.map((id) => Math.round(trackLength(track(id)) * 100)))).toHaveLength(1);
    /** Whether a trace covers an arrow from its first point to its last. */
    const whole = (line: PolylineItem, id: string) => {
      expect(line.points[0]).toEqual(track(id)[0]);
      expect(line.points[line.points.length - 1]).toEqual(track(id)[track(id).length - 1]);
      expect(trackLength(line.points)).toBeCloseTo(trackLength(track(id)), 1);
    };
    // Two thirds in: the first two arrows are whole, the third has not started.
    const at = frame(2000);
    for (const id of arrows.slice(0, 2)) {
      const line = traced(at, id)!;
      whole(line, id);
      expect(line.stroke).toBe("#ff0000");
    }
    expect(group(at, arrows[2]!, "relation")).toEqual(group(still, arrows[2]!, "relation"));
    // Half way through the second: the first whole, the second half grown, the third untouched.
    const middle = frame(1500);
    whole(traced(middle, arrows[0]!)!, arrows[0]!);
    const half = traced(middle, arrows[1]!)!;
    expect(trackLength(half.points)).toBeCloseTo(trackLength(track(arrows[1]!)) / 2, 0);
    expect(traced(middle, arrows[2]!)).toBeUndefined();
    // At the start the first arrow shows its start, as a trace does; at the end nothing is left.
    expect(traced(frame(0), arrows[0]!)).toBeDefined();
    expect(traced(frame(0), arrows[1]!)).toBeUndefined();
    for (const id of arrows)
      expect(group(frame(3000), id, "relation")).toEqual(group(still, id, "relation"));
  });

  it("shares a chain's time in proportion to the length of its arrows", () => {
    const { frame, views } = setup(owners("  scene one { trace flu3 over 3s }"));
    const still = views("hoja_de_ruta_genai")!.scene;
    const ids = ["flu0->flu1#1", "flu1->flu2#1", "flu2->flu3#1"];
    const lengths = ids.map((id) => trackLength(group(still, id, "relation")!.track!));
    const total = lengths[0]! + lengths[1]! + lengths[2]!;
    // At the end of the first arrow's share it is whole and the second has not grown.
    const t = (3000 * lengths[0]!) / total;
    const at = frame(Math.floor(t));
    expect(traced(at, ids[0]!)).toBeDefined();
    expect(trackLength(traced(at, ids[0]!)!.points)).toBeCloseTo(lengths[0]!, 0);
    const next = traced(frame(Math.ceil(t) + 50), ids[1]!);
    expect(next).toBeDefined();
    expect(trackLength(next!.points)).toBeLessThan(lengths[1]!);
  });

  it("suspends the flow into a task while its chain is traced", () => {
    const flow = "  animate flu3 { effect flow }";
    const { frame } = setup(owners("  scene one { trace flu3 over 3s }", flow));
    const particles = (scene: Scene) =>
      group(scene, "flu2->flu3#1", "relation")!.items.filter(
        (i) => i.kind === "path" && / a[\d.]+ /.test(i.d) && i.fill !== "#ff0000",
      );
    expect(particles(frame(2900))).toEqual([]);
    // The story carries on after the trace; the flow runs again.
    const longer = setup(owners("  scene one { trace flu3 over 3s\n    hold 2s }", flow));
    expect(particles(longer.frame(4000)).length).toBeGreaterThan(0);
    // Before the trace starts the flow runs as well.
    const before = setup(owners("  scene one { hold 1s\n    trace flu3 over 3s }", flow));
    expect(particles(before.frame(500)).length).toBeGreaterThan(0);
  });

  it("keeps the axis whole while a story hides every section", () => {
    const { frame, views } = setup(
      owners("  scene one { hide tecnologia, nuevo_flujo_genai_hub, i_d over 600ms }"),
    );
    const still = views("hoja_de_ruta_genai")!.scene;
    const axis = group(still, "axis", "axis")!;
    for (const t of [0, 300, 600]) {
      expect(group(frame(t), "axis", "axis")).toEqual(axis);
    }
    // The sections, their tasks and the arrows between them are gone.
    const end = frame(600);
    for (const id of ["tecnologia", "nuevo_flujo_genai_hub", "i_d"]) {
      expect(group(end, id)!.opacity).toBe(0);
    }
    for (const id of ["tec0->tec1#1", "flu1->flu2#1", "sdlc1->sdlc2#1"]) {
      expect(group(end, id, "relation")!.opacity).toBe(0);
    }
    // The tasks are held in their section's group: it hides them.
    expect(group(end, "tec1")!.opacity).toBeUndefined();
    expect(group(end, "tecnologia")!.items.some((i) => i.kind === "group" && i.id === "tec1")).toBe(
      true,
    );
  });

  it("reveals a section with its tasks and the arrows between them", () => {
    const { frame } = setup(owners("  scene one { reveal tecnologia over 600ms }"));
    const start = frame(0);
    expect(group(start, "tecnologia")!.opacity).toBe(0);
    expect(group(start, "tec0->tec1#1", "relation")!.opacity).toBe(0);
    // The other sections were not asked for: they are there.
    expect(group(start, "flu0->flu1#1", "relation")!.opacity).toBeUndefined();
    expect(group(frame(300), "tec0->tec1#1", "relation")!.opacity).toBe(0.5);
    expect(group(frame(600), "tec0->tec1#1", "relation")!.opacity).toBeUndefined();
    expect(group(frame(600), "tecnologia")!.opacity).toBeUndefined();
  });

  it("keeps a focused task's section in focus, and dims another section once", () => {
    const { frame } = setup(owners("  scene one { focus tec1 over 600ms }"));
    const end = frame(600);
    expect(group(end, "tec1")!.opacity).toBeUndefined();
    // Its section holds it: not dimmed. The task beside it is.
    expect(group(end, "tecnologia")!.opacity).toBeUndefined();
    expect(group(end, "tec0")!.opacity).toBe(0.25);
    // Another section is dimmed as a whole; its tasks are not dimmed again.
    expect(group(end, "nuevo_flujo_genai_hub")!.opacity).toBe(0.25);
    expect(group(end, "flu0")!.opacity).toBeUndefined();
    // An arrow with one end out of focus is dimmed; the axis never is.
    expect(group(end, "tec0->tec1#1", "relation")!.opacity).toBe(0.25);
    expect(group(end, "axis", "axis")!.opacity).toBeUndefined();
    // Focus on a section keeps its tasks, and the arrows between them, and dims the others.
    const whole = setup(owners("  scene one { focus tecnologia over 600ms }")).frame(600);
    expect(group(whole, "tecnologia")!.opacity).toBeUndefined();
    expect(group(whole, "tec0")!.opacity).toBeUndefined();
    expect(group(whole, "tec0->tec1#1", "relation")!.opacity).toBeUndefined();
    expect(group(whole, "i_d")!.opacity).toBe(0.25);
  });

  it("highlights and frames a task, a milestone and a section by their boxes", () => {
    const { frame, views } = setup(
      owners("  scene one { highlight tec1 over 1s\n    camera i_d over 500ms }"),
    );
    const still = views("hoja_de_ruta_genai")!.scene;
    const lit = frame(500);
    const [outline] = overlays(lit);
    const tec1 = bar(still, "tec1");
    expect(outline).toMatchObject({ kind: "path", stroke: "#ff0000" });
    expect(boundsOf(still, ["tec1"])).toMatchObject({
      x: tec1.x,
      y: tec1.y,
      width: tec1.width,
      height: tec1.height,
    });
    const section = bar(still, "i_d");
    expect(boundsOf(still, ["i_d"])).toMatchObject({
      x: section.x,
      y: section.y,
      width: section.width,
      height: section.height,
    });
    // The camera of the second action ends framed on the section.
    const framed = frame(1500);
    expect(framed.viewBox).toBeDefined();
  });

  it("draws the frame at a time before the story as the first, and after it as the last", () => {
    const { frame, timeline } = setup(BARS("  scene one { draw a, b over 1s }"));
    expect(renderSvg(frame(-100))).toBe(renderSvg(frame(0)));
    expect(renderSvg(frame(timeline.durationMs + 5000))).toBe(
      renderSvg(frame(timeline.durationMs)),
    );
  });

  it("is deterministic, and the animated and the captured frames are the same drawing", () => {
    const { frame } = setup(
      owners("  scene one { reveal tecnologia\n    draw tec0, tec1\n    trace flu3 }"),
    );
    for (const t of [0, 450, 1234, 2500, 4000]) {
      expect(renderSvg(frame(t))).toBe(renderSvg(frame(t)));
    }
  });

  it("plays the roadmap template's story: the axis stays, and its end is the chart itself", () => {
    const template = readFileSync(
      join(REPO_ROOT, "packages/cli/templates/roadmap/diagrams/roadmap.meltemi"),
      "utf8",
    );
    const { frame, timeline, views } = setup(template);
    const still = views("roadmap")!.scene;
    const axis = group(still, "axis", "axis");
    for (let t = 0; t <= timeline.durationMs + 250; t += 250) {
      const scene = frame(t);
      expect(group(scene, "axis", "axis"), `${t} ms`).toEqual(axis);
      expect(renderSvg(scene).startsWith("<svg"), `${t} ms`).toBe(true);
    }
    // Before the first action every section, the milestone and the marker are hidden, and so are
    // the arrows that join them.
    const start = frame(0);
    for (const id of ["discovery", "build", "launch", "go_live", "freeze"]) {
      expect(group(start, id)!.opacity, id).toBe(0);
    }
    expect(group(start, "design->backend#1", "relation")!.opacity).toBe(0);
    // The last scene traces the chain that sets the launch: five arrows, the longest-ending
    // predecessor of each task, from the interviews to the go live.
    const chain = timeline.scenes[3]!.actions[0]!;
    expect(chain.targets.map((t) => t.id)).toEqual([
      "interviews->scope#1",
      "scope->design#1",
      "design->backend#1",
      "backend->qa#1",
      "qa->go_live#1",
    ]);
    // The scene that reveals the launch shows its section, the milestone and the marker, and the
    // bars of the section grow after them.
    const ship = timeline.scenes[2]!;
    const shown = frame(ship.startMs + 600);
    for (const id of ["launch", "go_live", "freeze"]) {
      expect(group(shown, id)!.opacity, id).toBeUndefined();
    }
    expect(group(shown, "qa")!.items).toEqual([]);
    // After the story everything is drawn whole, as the chart is.
    expect(renderSvg(frame(timeline.durationMs))).toBe(renderSvg(still));
  });

  it("carries the sections that hold each task, and nothing for other diagrams", () => {
    const { views } = setup(owners("  scene one { hold 1s }"));
    const holders = views("hoja_de_ruta_genai")!.holders!;
    expect(holders.tec0).toEqual(["tecnologia"]);
    expect(holders.flu3).toEqual(["nuevo_flujo_genai_hub"]);
    expect(holders.tecnologia).toBeUndefined();
    const other = setup(purchase).views("checkout")!;
    expect("holders" in other).toBe(false);
  });
});
