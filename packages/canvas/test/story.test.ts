import type { TimelineAction, TimelineScene } from "@meltemi/diagrams-motion";
import { describe, expect, it } from "vitest";
import {
  reachableBars,
  reorderPosition,
  sceneBars,
  sceneDurationMinimum,
  sceneOverlapMaximum,
  storyPanelHeight,
} from "../src/story.js";

const action = (
  kind: TimelineAction["kind"],
  path: number[],
  startMs: number,
  durationMs: number,
  children: TimelineAction[] = [],
): TimelineAction => ({
  kind,
  path,
  startMs,
  durationMs,
  children,
  targets: [],
  all: true,
  line: 1,
});

const scene = (
  actions: TimelineAction[],
  transition: TimelineScene["transition"] = null,
): TimelineScene => ({
  id: "first",
  title: null,
  view: "d",
  startMs: 0,
  line: 1,
  durationMs: (transition?.durationMs ?? 0) + actions.reduce((sum, a) => sum + a.durationMs, 0),
  actions,
  transition,
});

describe("scene workspace timing constraints", () => {
  it("uses the prospective concurrent transition duration when enabling overlap", () => {
    const first = { ...scene([action("hold", [0, 0], 0, 5000)]), id: "first" };
    const next = {
      ...scene([action("hold", [1, 0], 9000, 2000)], {
        kind: "fade",
        startMs: 5000,
        durationMs: 4000,
      }),
      id: "next",
      startMs: 5000,
    };
    expect(next.durationMs).toBe(6000);
    expect(sceneOverlapMaximum([first, next], 1)).toBe(4000);
    expect(sceneDurationMinimum([first, next], 1)).toBe(4000);
    const concurrent = {
      ...next,
      startMs: 3000,
      durationMs: 4000,
      transition: { kind: "fade" as const, startMs: 3000, durationMs: 4000 },
      actions: [action("hold", [1, 0], 3000, 2000)],
    };
    expect(sceneOverlapMaximum([first, concurrent], 1)).toBe(4000);
    expect(sceneDurationMinimum([first, concurrent], 1)).toBe(4000);
    expect(sceneOverlapMaximum([first, concurrent], 0)).toBe(0);
  });

  it("retains either adjacent shared interval when reducing an ending pause", () => {
    const first = { ...scene([action("hold", [0, 0], 0, 5000)]), id: "first" };
    const middle = {
      ...scene([action("highlight", [1, 0], 3000, 500), action("hold", [1, 1], 3500, 2500)]),
      id: "middle",
      startMs: 3000,
    };
    const last = { ...scene([action("hold", [2, 0], 3500, 5000)]), id: "last", startMs: 3500 };
    expect(sceneDurationMinimum([first, middle, last], 1)).toBe(2500);
  });

  it("keeps a bounded panel height for corrupt saved state and short windows", () => {
    expect(storyPanelHeight(50, 700)).toBe(160);
    expect(storyPanelHeight(9999, 700)).toBe(604);
    expect(storyPanelHeight(NaN, 700)).toBe(240);
    expect(storyPanelHeight(260, 180)).toBe(96);
  });
});

describe("story clip insertion boundaries", () => {
  const precise = () =>
    scene(
      [
        action("reveal", [0, 0], 251, 1251),
        action("highlight", [0, 1], 1502, 775),
        action("hold", [0, 2], 2277, 333),
      ],
      { kind: "fade", startMs: 0, durationMs: 251 },
    );

  it("removes the moving clip before computing exact candidate starts", () => {
    expect(reorderPosition(precise(), 2, 0)).toEqual({ index: 0, startMs: 251 });
    expect(reorderPosition(precise(), 0, 100_000)).toEqual({ index: 2, startMs: 1359 });
    expect(reorderPosition(precise(), 1, 1502)).toEqual({ index: 1, startMs: 1502 });
  });

  it("chooses the nearest insertion slot without snapping millisecond durations", () => {
    expect(reorderPosition(precise(), 2, 1501)).toEqual({ index: 1, startMs: 1502 });
    expect(reorderPosition(precise(), 2, 2200)).toEqual({ index: 2, startMs: 2277 });
    const single = scene([action("hold", [0, 0], 0, 333)]);
    expect(reorderPosition(single, 0, 99_999)).toEqual({ index: 0, startMs: 0 });
  });

  it("anchors overlapping fade slots at the actual action start rather than after the transition", () => {
    const overlapping = {
      ...scene(
        [
          action("reveal", [1, 0], 2000, 1000),
          action("highlight", [1, 1], 3000, 1000),
          action("hold", [1, 2], 4000, 1000),
        ],
        { kind: "fade", startMs: 2000, durationMs: 2000 },
      ),
      startMs: 2000,
      durationMs: 3000,
    };
    expect(reorderPosition(overlapping, 2, 3000)).toEqual({ index: 1, startMs: 3000 });
    expect(reorderPosition(overlapping, 0, 2000)).toEqual({ index: 0, startMs: 2000 });
    expect(reorderPosition(overlapping, 0, 99_999)).toEqual({ index: 2, startMs: 4000 });
  });
});

describe("parallel clip presentation", () => {
  it("shows group headers and individually timed nested children on separate lanes", () => {
    const grouped = scene([
      action("parallel", [0, 0], 0, 800, [
        action("reveal", [0, 0, 0], 0, 800),
        action("parallel", [0, 0, 1], 0, 500, [
          action("highlight", [0, 0, 1, 0], 0, 300),
          action("camera", [0, 0, 1, 1], 0, 500),
        ]),
      ]),
      action("hold", [0, 1], 800, 333),
    ]);
    const bars = sceneBars(grouped, 0);
    expect(bars.map((b) => [b.path.join("."), b.kind, b.lane, b.timed])).toEqual([
      ["0.0", "parallel", 0, false],
      ["0.0.0", "reveal", 1, true],
      ["0.0.1", "parallel", 2, false],
      ["0.0.1.0", "highlight", 3, true],
      ["0.0.1.1", "camera", 4, true],
      ["0.1", "hold", 0, true],
    ]);
    expect(bars[0]!.durationMs).toBe(800);
    expect(reorderPosition(grouped, 0, 10_000)).toEqual({ index: 1, startMs: 333 });
  });

  it("keeps transitions outside action paths and omits instantaneous cuts", () => {
    const fade = scene([action("hold", [0, 0], 251, 333)], {
      kind: "fade",
      startMs: 0,
      durationMs: 251,
    });
    expect(sceneBars(fade, 0).map((b) => b.path)).toEqual([[0], [0, 0]]);
    const cut = scene([action("hold", [0, 0], 0, 333)], { kind: "cut", startMs: 0, durationMs: 0 });
    expect(sceneBars(cut, 0).map((b) => b.path)).toEqual([[0, 0]]);
  });
});

describe("short clip body access", () => {
  it("separates zero-duration and short bodies from neighbours at the same timestamp", () => {
    const original = sceneBars(
      scene([
        action("hold", [0, 0], 0, 0),
        action("hold", [0, 1], 0, 5),
        action("hold", [0, 2], 5, 1000),
      ]),
      0,
    );
    const reachable = reachableBars(original, 0.1);
    expect(reachable.map((bar) => [bar.startMs, bar.durationMs])).toEqual([
      [0, 0],
      [0, 5],
      [5, 1000],
    ]);
    expect(reachable.map((bar) => [bar.lane, !!bar.short])).toEqual([
      [1, true],
      [2, true],
      [0, false],
    ]);
    expect(original.map((bar) => bar.lane)).toEqual([0, 0, 0]);
  });

  it("reuses a short-clip lane only when both body and external handle have room", () => {
    const reachable = reachableBars(
      sceneBars(scene([action("hold", [0, 0], 0, 5), action("hold", [0, 1], 270, 5)]), 0),
      0.1,
    );
    expect(reachable.map((bar) => bar.lane)).toEqual([1, 1]);
  });

  it("keeps parallel headers and nested timing lanes intact", () => {
    const bars = sceneBars(
      scene([action("parallel", [0, 0], 0, 5, [action("hold", [0, 0, 0], 0, 5)])]),
      0,
    );
    expect(reachableBars(bars, 0.1)).toEqual(bars);
  });

  it("keeps an ending zero-duration body and its separate handle visible without moving its time", () => {
    const bars = sceneBars(
      scene([action("hold", [0, 0], 0, 1000), action("hold", [0, 1], 1000, 0)]),
      0,
    );
    const cap = reachableBars(bars, 0.1, 100)[1]!;
    expect(cap.startMs).toBe(1000);
    expect(cap.durationMs).toBe(0);
    expect(cap.capOffsetPx).toBe(-27);
    const left = cap.startMs * 0.1 + cap.capOffsetPx!;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + 27).toBeLessThanOrEqual(100);
    expect(
      reorderPosition(
        scene([action("hold", [0, 0], 0, 1000), action("hold", [0, 1], 1000, 0)]),
        1,
        1000,
      ),
    ).toEqual({ index: 1, startMs: 1000 });
  });
});
