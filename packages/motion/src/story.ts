import type {
  GroupItem,
  LayoutResult,
  Scene,
  SceneBounds,
  SceneItem,
} from "@meltemi/diagrams-layout";
import type {
  FlowDiagram,
  Point,
  StoryAction,
  StoryDefinition,
  TargetKind,
} from "@meltemi/diagrams-model";
import { sceneAt } from "./frames.js";
import { circlePath, round, roundedRectPath, trackLength } from "./geometry.js";
import { motionOptions, planMotion, type MotionPlan } from "./plan.js";

/** One action of a story with its absolute time, as plain data. */
export interface TimelineAction {
  readonly kind: StoryAction["kind"];
  readonly path: readonly number[];
  readonly targets: readonly { readonly id: string; readonly kind: TargetKind }[];
  readonly all: boolean;
  readonly startMs: number;
  readonly durationMs: number;
  readonly children: readonly TimelineAction[];
  /** The source line of the action, for editors. */
  readonly line: number;
}

export interface TimelineScene {
  readonly id: string;
  readonly title: string | null;
  /** The key of the view in `StoryViews`. */
  readonly view: string;
  readonly transition: {
    readonly kind: "cut" | "fade" | "morph";
    readonly startMs: number;
    readonly durationMs: number;
  } | null;
  readonly startMs: number;
  readonly durationMs: number;
  readonly actions: readonly TimelineAction[];
  readonly line: number;
}

/** A story as plain data: what a player, an exporter or a webview needs to draw any instant. */
export interface StoryTimeline {
  readonly id: string;
  readonly title: string | null;
  readonly durationMs: number;
  readonly scenes: readonly TimelineScene[];
  /** The view keys the scenes use, in order of first use. */
  readonly views: readonly string[];
}

/** What a story needs of one view: its scene, its effects and the ends of its relations. */
export interface StoryViewData {
  readonly scene: Scene;
  readonly plan: MotionPlan;
  /** Relation key to its source and target ids, for focus. */
  readonly ends: Readonly<Record<string, readonly [string, string]>>;
}

export type StoryViews = (key: string) => StoryViewData | undefined;

/** The key of a view: the diagram id, prefixed by its file when it is imported. */
export function viewKey(view: {
  name: string;
  diagram: { id: string } | null;
  file: string | null;
}): string {
  if (!view.diagram) return view.name;
  return view.file === null ? view.diagram.id : `${view.file}#${view.diagram.id}`;
}

function timelineAction(action: StoryAction): TimelineAction {
  return {
    kind: action.kind,
    path: action.path,
    targets: action.targets.map((t) => ({ id: t.id, kind: t.kind })),
    all: action.all,
    startMs: action.startMs,
    durationMs: action.durationMs,
    children: action.children.map(timelineAction),
    line: action.range.start.line,
  };
}

/** The timeline of a compiled story. */
export function storyTimeline(story: StoryDefinition): StoryTimeline {
  const views: string[] = [];
  const scenes = story.scenes.map((scene): TimelineScene => {
    const key = viewKey(scene.view);
    if (!views.includes(key)) views.push(key);
    return {
      id: scene.id,
      title: scene.title,
      view: key,
      transition: scene.transition
        ? {
            kind: scene.transition.kind,
            startMs: scene.transition.startMs,
            durationMs: scene.transition.durationMs,
          }
        : null,
      startMs: scene.startMs,
      durationMs: scene.durationMs,
      actions: scene.actions.map(timelineAction),
      line: scene.range.start.line,
    };
  });
  if (views.length === 0) views.push(viewKey(story.target));
  return { id: story.id, title: story.title, durationMs: story.durationMs, scenes, views };
}

/** Every action with a target, flattened through `parallel`, in start order. */
function flatten(
  actions: readonly TimelineAction[],
  scene: number,
  out: { action: TimelineAction; scene: number }[] = [],
) {
  for (const action of actions) {
    if (action.kind === "parallel") flatten(action.children, scene, out);
    else out.push({ action, scene });
  }
  return out;
}

const progress = (t: number, start: number, duration: number) =>
  duration <= 0 ? (t >= start ? 1 : 0) : Math.min(1, Math.max(0, (t - start) / duration));

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** A box in scene coordinates: a target's bounds or a camera's view box. */
export interface StoryBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
type Box = StoryBox;

/** The state of a story at a time, before it is drawn. */
interface StoryState {
  scene: number;
  opacity: Map<string, number>;
  highlights: { id: string; intensity: number }[];
  traces: { id: string; progress: number }[];
  focus: { ids: Set<string>; level: number } | null;
  camera: { from: Box | null; to: Box | null; progress: number } | null;
}

export interface StoryFrameOptions {
  /** The colour of highlights and traces; the theme's accent. */
  readonly accent?: string;
}

/** The bounds of the targets of an action in a scene, from element bounds and relation tracks. */
export function boundsOf(scene: Scene, ids: readonly string[]): Box | null {
  let box: Box | null = null;
  const add = (b: Box) => {
    if (!box) {
      box = { ...b };
      return;
    }
    const x = Math.min(box.x, b.x);
    const y = Math.min(box.y, b.y);
    box = {
      x,
      y,
      width: Math.max(box.x + box.width, b.x + b.width) - x,
      height: Math.max(box.y + box.height, b.y + b.height) - y,
    };
  };
  const visit = (items: readonly SceneItem[]) => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (ids.includes(item.id)) {
        if (item.bounds) add(item.bounds);
        else if (item.track && item.track.length > 0) {
          const xs = item.track.map((p) => p.x);
          const ys = item.track.map((p) => p.y);
          add({
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          });
        }
      }
      visit(item.items);
    }
  };
  visit(scene.items);
  return box;
}

/** A camera box around `box` plus 40 px, at the scene's aspect ratio, centred on it. */
export function frameBox(scene: Scene, box: Box): Box {
  const margin = 40;
  let width = box.width + margin * 2;
  let height = box.height + margin * 2;
  const ratio = scene.width / scene.height;
  if (width / height > ratio) height = width / ratio;
  else width = height * ratio;
  if (width >= scene.width && height >= scene.height) {
    return { x: 0, y: 0, width: scene.width, height: scene.height };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function stateAt(timeline: StoryTimeline, t: number, views: StoryViews): StoryState {
  const scenes = timeline.scenes;
  let index = 0;
  for (let i = 0; i < scenes.length; i++) if (scenes[i]!.startMs <= t) index = i;
  const all = scenes.flatMap((s, i) => flatten(s.actions, i));
  all.sort((a, b) => a.action.startMs - b.action.startMs);
  // Visibility: a target first revealed starts hidden.
  const opacity = new Map<string, number>();
  const firstVisibility = new Map<string, string>();
  for (const { action } of all) {
    if (action.kind !== "reveal" && action.kind !== "hide") continue;
    for (const target of action.targets)
      if (!firstVisibility.has(target.id)) firstVisibility.set(target.id, action.kind);
  }
  for (const [id, kind] of firstVisibility) opacity.set(id, kind === "reveal" ? 0 : 1);
  const highlights: StoryState["highlights"] = [];
  const traces: StoryState["traces"] = [];
  let focus: StoryState["focus"] = null;
  let camera: StoryState["camera"] = null;
  let cameraBox: Box | null = null;
  let cameraView: string | null = null;
  for (const { action, scene } of all) {
    if (action.startMs > t) break;
    const p = progress(t, action.startMs, action.durationMs);
    const view = scenes[scene]!.view;
    switch (action.kind) {
      case "reveal":
      case "hide":
        for (const target of action.targets) {
          const from = opacity.get(target.id) ?? 1;
          opacity.set(target.id, lerp(from, action.kind === "reveal" ? 1 : 0, p));
        }
        break;
      case "highlight":
        if (p < 1) {
          const ramp = Math.min(200, action.durationMs / 4);
          const elapsed = t - action.startMs;
          const left = action.startMs + action.durationMs - t;
          const intensity = ramp <= 0 ? 1 : Math.min(1, elapsed / ramp, left / ramp);
          for (const target of action.targets) highlights.push({ id: target.id, intensity });
        }
        break;
      case "trace":
        if (p < 1) for (const target of action.targets) traces.push({ id: target.id, progress: p });
        break;
      case "focus":
        // Focus lasts to the end of its scene.
        if (scene === index) {
          const ids = new Set(action.targets.map((x) => x.id));
          const current = focus as StoryState["focus"];
          const previous: number = current?.level ?? 0;
          focus = action.all
            ? { ids: current?.ids ?? new Set<string>(), level: lerp(previous, 0, p) }
            : { ids, level: lerp(previous, 1, p) };
        }
        break;
      case "camera": {
        const data = views(view);
        if (!data) break;
        if (cameraView !== view) {
          cameraBox = null;
          cameraView = view;
        }
        const target = action.all
          ? null
          : (() => {
              const box = boundsOf(
                data.scene,
                action.targets.map((x) => x.id),
              );
              return box ? frameBox(data.scene, box) : null;
            })();
        camera = { from: cameraBox, to: target, progress: p };
        if (p >= 1) cameraBox = target;
        else cameraBox = interpolateBox(data.scene, cameraBox, target, p);
        break;
      }
    }
  }
  // A camera set in another view does not frame this one.
  if (camera && cameraView !== scenes[index]?.view) camera = null;
  return { scene: index, opacity, highlights, traces, focus, camera };
}

function fullBox(scene: Scene): Box {
  return { x: 0, y: 0, width: scene.width, height: scene.height };
}

function interpolateBox(scene: Scene, from: Box | null, to: Box | null, p: number): Box {
  const a = from ?? fullBox(scene);
  const b = to ?? fullBox(scene);
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    width: lerp(a.width, b.width, p),
    height: lerp(a.height, b.height, p),
  };
}

/** The groups of a scene with story opacities applied: visibility times focus. */
function withOpacity(
  items: readonly SceneItem[],
  value: (group: GroupItem) => number,
): SceneItem[] {
  return items.map((item) => {
    if (item.kind !== "group") return item;
    const inner = withOpacity(item.items, value);
    const own =
      item.role === "element" || item.role === "relation" || item.role === "event"
        ? value(item)
        : 1;
    const changed = inner.some((x, i) => x !== item.items[i]);
    if (own >= 1 && !changed) return item;
    const group: GroupItem = { ...item, items: inner };
    return own < 1 ? { ...group, opacity: round(own) } : group;
  });
}

/** The part of a track from its start to `fraction` of its length. */
function partialTrack(points: readonly Point[], fraction: number): Point[] {
  const total = trackLength(points);
  let left = total * fraction;
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length && left > 0; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (segment >= left) {
      const k = segment === 0 ? 0 : left / segment;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      break;
    }
    out.push(b);
    left -= segment;
  }
  return out;
}

function findGroup(
  items: readonly SceneItem[],
  id: string,
  roles: readonly string[],
): GroupItem | undefined {
  for (const item of items) {
    if (item.kind !== "group") continue;
    if (item.id === id && roles.includes(item.role)) return item;
    const inner = findGroup(item.items, id, roles);
    if (inner) return inner;
  }
  return undefined;
}

function strokeWidthOf(group: GroupItem): number {
  const line = group.items.find((i) => i.kind === "polyline" || i.kind === "path");
  return line && (line.kind === "polyline" || line.kind === "path") ? line.strokeWidth : 1.5;
}

/** Highlights and traces above the picture. */
/**
 * What a story draws over a view: highlight outlines above everything, and the traces, which go
 * into their relation's group under its label, by relation id.
 */
function storyOverlays(
  scene: Scene,
  state: StoryState,
  accent: string,
): { highlights: SceneItem[]; traces: Map<string, SceneItem[]> } {
  const out: SceneItem[] = [];
  const traces = new Map<string, SceneItem[]>();
  for (const { id, intensity } of state.highlights) {
    const group = findGroup(scene.items, id, ["element", "event", "relation"]);
    if (!group) continue;
    if (group.bounds) {
      out.push({
        kind: "path",
        d: roundedRectPath(inflate(group.bounds, 4)),
        fill: "none",
        stroke: accent,
        strokeWidth: 3,
        dashed: false,
        opacity: round(intensity),
      });
    } else if (group.track) {
      out.push({
        kind: "polyline",
        points: group.track,
        stroke: accent,
        strokeWidth: strokeWidthOf(group) + 6,
        dashed: false,
        opacity: round(0.6 * intensity),
      });
    }
  }
  for (const { id, progress: p } of state.traces) {
    const group = findGroup(scene.items, id, ["relation"]);
    if (!group?.track || group.track.length < 2) continue;
    const width = strokeWidthOf(group);
    const part = partialTrack(group.track, p).map((q) => ({ x: round(q.x), y: round(q.y) }));
    const head = part[part.length - 1]!;
    traces.set(id, [
      {
        kind: "polyline",
        points: part,
        stroke: accent,
        strokeWidth: width + 2,
        dashed: false,
      },
      {
        kind: "path",
        d: circlePath(head.x, head.y, width + 3),
        fill: accent,
        stroke: "none",
        strokeWidth: 0,
        dashed: false,
      },
    ]);
  }
  return { highlights: out, traces };
}

/** Puts the trace of each relation in its group, before the label so the label stays readable. */
function withTraces(items: readonly SceneItem[], traces: Map<string, SceneItem[]>): SceneItem[] {
  if (traces.size === 0) return [...items];
  return items.map((item) => {
    if (item.kind !== "group") return item;
    const trace = item.role === "relation" ? traces.get(item.id) : undefined;
    if (!trace) return { ...item, items: withTraces(item.items, traces) };
    const label = item.items.findIndex((i) => i.kind === "group" && i.role === "label");
    const at = label < 0 ? item.items.length : label;
    return { ...item, items: [...item.items.slice(0, at), ...trace, ...item.items.slice(at)] };
  });
}

function inflate(bounds: SceneBounds, by: number): SceneBounds {
  return {
    x: bounds.x - by,
    y: bounds.y - by,
    width: bounds.width + by * 2,
    height: bounds.height + by * 2,
    radius: bounds.radius + by,
  };
}

/** The drawing of one view at time t, with effects, opacities and overlays, without camera. */
function drawView(data: StoryViewData, state: StoryState, t: number, accent: string): Scene {
  const traced = new Set(state.traces.map((x) => x.id));
  // A trace suspends the local effects of its relation.
  const plan: MotionPlan = {
    effects: data.plan.effects.filter((e) => !(e.role === "relation" && traced.has(e.target))),
  };
  const animated = sceneAt(data.scene, plan, t);
  const focused = state.focus;
  const inFocus = (id: string, role: string) => {
    if (!focused) return true;
    if (focused.ids.has(id)) return true;
    if (role === "relation") {
      const ends = data.ends[id];
      return ends !== undefined && focused.ids.has(ends[0]) && focused.ids.has(ends[1]);
    }
    return false;
  };
  const overlays = storyOverlays(data.scene, state, accent);
  const items = withOpacity(withTraces(animated.items, overlays.traces), (group) => {
    // A relation is drawn at the opacity of its least visible end, so no arrow points at a box
    // that is not there yet.
    const ends = group.role === "relation" ? data.ends[group.id] : undefined;
    const visible = Math.min(
      state.opacity.get(group.id) ?? 1,
      ...(ends ?? []).map((end) => state.opacity.get(end) ?? 1),
    );
    const dim = focused && !inFocus(group.id, group.role) ? lerp(1, 0.25, focused.level) : 1;
    return visible * dim;
  });
  if (overlays.highlights.length > 0)
    items.push({ kind: "group", id: "story", role: "motion", items: overlays.highlights });
  return { ...animated, items };
}

/**
 * The scene of a story at `t` milliseconds: visibility, highlights, traces, focus and camera, the
 * transition between two views, and the views' own effects on the same clock. Pure.
 */
export function storyFrame(
  timeline: StoryTimeline,
  views: StoryViews,
  t: number,
  options: StoryFrameOptions = {},
): Scene | null {
  const accent = options.accent ?? "#1f6feb";
  const time = Math.min(Math.max(0, t), timeline.durationMs);
  const state = stateAt(timeline, time, views);
  const scene = timeline.scenes[state.scene];
  const key = scene?.view ?? timeline.views[0];
  const data = key !== undefined ? views(key) : undefined;
  if (!data) return null;
  let frame = drawView(data, state, time, accent);
  if (state.camera) {
    const box = interpolateBox(
      data.scene,
      state.camera.from,
      state.camera.to,
      state.camera.progress,
    );
    frame = {
      ...frame,
      viewBox: {
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
      },
    };
  }
  const transition = scene?.transition;
  const previous = state.scene > 0 ? timeline.scenes[state.scene - 1] : undefined;
  if (!transition || !previous || previous.view === scene.view || transition.kind === "cut")
    return frame;
  const p = progress(time, transition.startMs, transition.durationMs);
  if (p >= 1) return frame;
  const before = views(previous.view);
  if (!before) return frame;
  const old = drawView(before, state, time, accent);
  const width = Math.max(old.width, frame.width);
  const height = Math.max(old.height, frame.height);
  if (transition.kind === "fade") {
    return {
      ...frame,
      width,
      height,
      items: [
        { kind: "group", id: "before", role: "motion", items: old.items, opacity: round(1 - p) },
        { kind: "group", id: "after", role: "motion", items: frame.items, opacity: round(p) },
      ],
    };
  }
  // Morph: boxes present in both views move from their old place to the new one; the rest fades.
  const oldBounds = new Map<string, SceneBounds>();
  const collect = (items: readonly SceneItem[]) => {
    for (const item of items) {
      if (item.kind !== "group") continue;
      if (item.role === "element" && item.bounds) oldBounds.set(item.id, item.bounds);
      collect(item.items);
    }
  };
  collect(old.items);
  const moved = new Set<string>();
  const morph = (items: readonly SceneItem[]): SceneItem[] =>
    items.map((item) => {
      if (item.kind !== "group") return item;
      const from = item.role === "element" && item.bounds ? oldBounds.get(item.id) : undefined;
      if (from && item.bounds) {
        moved.add(item.id);
        const to = item.bounds;
        const x = lerp(from.x, to.x, p);
        const y = lerp(from.y, to.y, p);
        const sx = lerp(from.width, to.width, p) / to.width;
        const sy = lerp(from.height, to.height, p) / to.height;
        const transform = `translate(${round(x - to.x * sx)} ${round(y - to.y * sy)}) scale(${round(sx * 1000) / 1000} ${round(sy * 1000) / 1000})`;
        return { kind: "group", id: `${item.id}#morph`, role: "motion", items: [item], transform };
      }
      if (item.role === "element" || item.role === "relation" || item.role === "event") {
        return { ...item, opacity: round((item.opacity ?? 1) * p) };
      }
      return { ...item, items: morph(item.items) };
    });
  const after = morph(frame.items);
  const leaving = (items: readonly SceneItem[]): SceneItem[] =>
    items.flatMap((item): SceneItem[] => {
      if (item.kind !== "group") return [item];
      // The new view's frame and the moved boxes replace the old ones.
      if (item.role === "frame" || (item.role === "element" && moved.has(item.id))) return [];
      if (item.role === "element" || item.role === "relation" || item.role === "event") {
        return [{ ...item, opacity: round((item.opacity ?? 1) * (1 - p)) }];
      }
      return [{ ...item, items: leaving(item.items) }];
    });
  return { ...frame, width, height, items: [...leaving(old.items), ...after] };
}

/** What a story needs of a laid-out view: its scene, its effects and its relation ends. */
export function storyViewData(
  diagram: FlowDiagram,
  layout: LayoutResult,
): StoryViewData | undefined {
  if (!layout.scene) return undefined;
  const ends: Record<string, readonly [string, string]> = {};
  for (const relation of diagram.relations) ends[relation.key] = [relation.from, relation.to];
  const plan = planMotion(diagram, layout.scene, motionOptions(layout.theme));
  return { scene: layout.scene, plan, ends };
}
