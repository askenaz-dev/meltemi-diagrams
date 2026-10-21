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
    // The flow of `request` is not drawn while it is traced, and is drawn again afterwards.
    expect(at.items.some((i) => i.kind === "group" && i.id === "motion")).toBe(false);
    expect(frame(3100).items.some((i) => i.kind === "group" && i.id === "motion")).toBe(true);
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
