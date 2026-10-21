import type { Scene, SceneItem } from "@meltemi/diagrams-layout";
import { round } from "./geometry.js";
import {
  boundsOf,
  frameBox,
  storyFrame,
  type StoryBox,
  type StoryFrameOptions,
  type StoryTimeline,
  type StoryViews,
} from "./story.js";

/** How long a drill-down's two phases last: the camera move, then the change of view. */
export const DRILL_DURATIONS = { cameraMs: 320, transitionMs: 480 } as const;

export type DrillTransition = "morph" | "fade";
export type DrillDirection = "down" | "up";

/**
 * A move between a view and the view an element opens. Going down, `from` is the view that draws
 * `element` and `to` the view it opens; going up, `from` is the view being left and `to` the view
 * that draws `element`, and the frames are those of the way down played backwards.
 */
export interface DrillSpec {
  readonly from: string;
  readonly to: string;
  readonly element: string;
  readonly transition: DrillTransition;
  readonly direction: DrillDirection;
  readonly cameraMs: number;
  readonly transitionMs: number;
}

/** The way down of a spec: from the view that draws the element to the one it opens. */
function downward(spec: DrillSpec): { parent: string; child: string } {
  return spec.direction === "down"
    ? { parent: spec.from, child: spec.to }
    : { parent: spec.to, child: spec.from };
}

/**
 * The timeline of the way down: a scene on the parent view with a camera on the element, then a
 * scene on the child view that the transition starts. Plain data; the way up plays it backwards.
 */
export function drillTimeline(spec: DrillSpec): StoryTimeline {
  const { parent, child } = downward(spec);
  const camera = Math.max(0, spec.cameraMs);
  const change = Math.max(0, spec.transitionMs);
  return {
    id: "drill",
    title: null,
    durationMs: camera + change,
    views: [parent, child],
    scenes: [
      {
        id: "from",
        title: null,
        view: parent,
        transition: null,
        startMs: 0,
        durationMs: camera,
        line: 0,
        actions: [
          {
            kind: "camera",
            path: [0, 0],
            targets: [{ id: spec.element, kind: "element" }],
            all: false,
            startMs: 0,
            durationMs: camera,
            children: [],
            line: 0,
          },
        ],
      },
      {
        id: "to",
        title: null,
        view: child,
        transition: {
          kind: change > 0 ? spec.transition : "cut",
          startMs: camera,
          durationMs: change,
        },
        startMs: camera,
        durationMs: change,
        line: 0,
        actions: [],
      },
    ],
  };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const whole = (scene: Scene): StoryBox => ({
  x: 0,
  y: 0,
  width: scene.width,
  height: scene.height,
});

/**
 * The scene of a drill-down at `t` milliseconds: the story frame of `drillTimeline`, with the
 * camera carried into the change of view (the view box goes from the element's camera box to the
 * whole child view) and the size of the larger view at every instant, so the picture never jumps.
 * The view box is always set. Null when a view is missing or the element has no bounds. Pure.
 */
export function drillFrame(
  spec: DrillSpec,
  views: StoryViews,
  t: number,
  options: StoryFrameOptions = {},
): Scene | null {
  const { parent, child } = downward(spec);
  const above = views(parent);
  const below = views(child);
  if (!above || !below) return null;
  // Only an element's box opens a view: a relation's track is no target.
  if (!hasElement(above.scene.items, spec.element)) return null;
  const bounds = boundsOf(above.scene, [spec.element]);
  if (!bounds) return null;
  const timeline = drillTimeline(spec);
  const duration = timeline.durationMs;
  const clamped = Math.min(Math.max(0, t), duration);
  // The way up is the way down played backwards.
  const time = spec.direction === "down" ? clamped : duration - clamped;
  const camera = Math.max(0, spec.cameraMs);
  const frame = storyFrame(timeline, views, time, options);
  if (!frame) return null;
  const width = Math.max(above.scene.width, below.scene.width);
  const height = Math.max(above.scene.height, below.scene.height);
  let box: StoryBox;
  if (time < camera || duration === 0) {
    box = duration === 0 ? whole(below.scene) : (frame.viewBox ?? whole(above.scene));
  } else {
    const change = duration - camera;
    const p = change <= 0 ? 1 : Math.min(1, (time - camera) / change);
    const from = frameBox(above.scene, bounds);
    const to = whole(below.scene);
    box = {
      x: lerp(from.x, to.x, p),
      y: lerp(from.y, to.y, p),
      width: lerp(from.width, to.width, p),
      height: lerp(from.height, to.height, p),
    };
  }
  return {
    ...frame,
    width,
    height,
    viewBox: {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
    },
  };
}

function hasElement(items: readonly SceneItem[], id: string): boolean {
  for (const item of items) {
    if (item.kind !== "group") continue;
    if (item.role === "element" && item.id === id && item.bounds) return true;
    if (hasElement(item.items, id)) return true;
  }
  return false;
}

/**
 * How a view opens another from one of its elements: `morph` when both scenes draw an element
 * with that id and bounds (a system box becomes the boundary of its container view), else `fade`.
 */
export function transitionFor(parent: Scene, child: Scene, element: string): DrillTransition {
  return hasElement(parent.items, element) && hasElement(child.items, element) ? "morph" : "fade";
}
