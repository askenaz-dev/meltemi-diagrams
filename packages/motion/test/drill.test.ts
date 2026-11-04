import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { layoutDiagram, type Scene } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  DRILL_DURATIONS,
  boundsOf,
  drillFrame,
  drillTimeline,
  frameBox,
  sceneGroups,
  storyViewData,
  transitionFor,
  type DrillSpec,
  type StoryViewData,
  type StoryViews,
} from "@meltemi/diagrams-motion";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
const engine = createElkEngine();
const compilation = compile(commerce);
const data = new Map<string, StoryViewData>();
for (const id of ["context", "containers", "components"]) {
  const diagram = compilation.document.diagrams.find((d) => d.id === id)!;
  data.set(id, storyViewData(diagram, layoutDiagram(compilation, diagram, { engine }))!);
}
const views: StoryViews = (key) => data.get(key);
const scene = (key: string): Scene => data.get(key)!.scene;

const down: DrillSpec = {
  from: "context",
  to: "containers",
  element: "shop",
  transition: "morph",
  direction: "down",
  ...DRILL_DURATIONS,
};
const up: DrillSpec = { ...down, from: "containers", to: "context", direction: "up" };

const group = (frame: Scene, id: string, role = "element") =>
  sceneGroups(frame.items).find((g) => g.id === id && g.role === role);

describe("drill-down frames", () => {
  it("times a camera scene and a change of view", () => {
    const timeline = drillTimeline(down);
    expect(timeline.durationMs).toBe(800);
    expect(timeline.scenes.map((s) => [s.view, s.startMs, s.durationMs])).toEqual([
      ["context", 0, 320],
      ["containers", 320, 480],
    ]);
    expect(timeline.scenes[1]!.transition).toEqual({
      kind: "morph",
      startMs: 320,
      durationMs: 480,
    });
    expect(JSON.parse(JSON.stringify(timeline))).toEqual(timeline);
  });

  it("frames the element, then carries the camera into the morph", () => {
    const width = Math.max(scene("context").width, scene("containers").width);
    const height = Math.max(scene("context").height, scene("containers").height);
    const start = drillFrame(down, views, 0)!;
    expect(start.viewBox).toEqual({
      x: 0,
      y: 0,
      width: scene("context").width,
      height: scene("context").height,
    });
    expect([start.width, start.height]).toEqual([width, height]);

    const camera = frameBox(scene("context"), boundsOf(scene("context"), ["shop"])!);
    const framed = drillFrame(down, views, 320)!;
    expect(framed.viewBox!.x).toBeCloseTo(camera.x, 1);
    expect(framed.viewBox!.width).toBeCloseTo(camera.width, 1);

    const middle = drillFrame(down, views, 560)!;
    expect(group(middle, "shop#morph", "motion")).toBeDefined();
    expect(middle.viewBox!.width).toBeCloseTo((camera.width + scene("containers").width) / 2, 1);
    expect([middle.width, middle.height]).toEqual([width, height]);

    const end = drillFrame(down, views, 800)!;
    expect(end.viewBox).toEqual({
      x: 0,
      y: 0,
      width: scene("containers").width,
      height: scene("containers").height,
    });
    expect(group(end, "shop#morph", "motion")).toBeUndefined();
    expect(group(end, "shop.api")).toBeDefined();
  });

  it("plays the way up as the way down backwards", () => {
    for (const t of [0, 160, 320, 560, 800]) {
      expect(renderSvg(drillFrame(up, views, t)!)).toBe(
        renderSvg(drillFrame(down, views, 800 - t)!),
      );
    }
  });

  it("cross-fades when the ids differ and cuts without durations", () => {
    expect(transitionFor(scene("context"), scene("containers"), "shop")).toBe("morph");
    expect(transitionFor(scene("context"), scene("containers"), "customer")).toBe("morph");
    expect(transitionFor(scene("containers"), scene("context"), "shop.api")).toBe("fade");
    const fade: DrillSpec = { ...down, transition: "fade" };
    const half = drillFrame(fade, views, 560)!;
    expect(group(half, "before", "motion")?.opacity).toBe(0.5);
    expect(group(half, "after", "motion")?.opacity).toBe(0.5);
    const cut: DrillSpec = { ...down, cameraMs: 0, transitionMs: 0 };
    const frame = drillFrame(cut, views, 0)!;
    expect(group(frame, "shop.api")).toBeDefined();
    expect(frame.viewBox).toEqual({
      x: 0,
      y: 0,
      width: scene("containers").width,
      height: scene("containers").height,
    });
  });

  it("needs both views and an element with bounds", () => {
    expect(drillFrame({ ...down, element: "visit" }, views, 100)).toBeNull();
    expect(drillFrame({ ...down, to: "nope" }, views, 100)).toBeNull();
  });

  it("gives the same scene for the same spec and time", () => {
    expect(renderSvg(drillFrame(down, views, 470)!)).toBe(renderSvg(drillFrame(down, views, 470)!));
  });
});
