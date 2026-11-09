import type {
  GroupItem,
  LayoutResult,
  PathItem,
  PolylineItem,
  RectItem,
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
import { sceneAt, targetKey, withTargets } from "./frames.js";
import { circlePath, round, roundedRectPath, trackLength } from "./geometry.js";
import { drawnTrack, motionOptions, planMotion, type MotionPlan } from "./plan.js";

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

/** Whether any scene starts before its predecessor has finished. No source-only metadata. */
export function hasSceneOverlap(timeline: Pick<StoryTimeline, "scenes">): boolean {
  return timeline.scenes.some((scene, index, scenes) => {
    const previous = scenes[index - 1];
    if (!previous) return false;
    const end = previous.startMs + previous.durationMs;
    return (
      end - scene.startMs > Number.EPSILON * Math.max(1, Math.abs(end), Math.abs(scene.startMs)) * 8
    );
  });
}

/** The latest scene that has started; source order breaks simultaneous-start ties. */
export function storySceneIndexAt(timeline: Pick<StoryTimeline, "scenes">, t: number): number {
  let index = 0;
  for (let i = 0; i < timeline.scenes.length; i++) if (timeline.scenes[i]!.startMs <= t) index = i;
  return index;
}

/** Active half-open scene intervals, including instantaneous scenes and the final closing frame. */
export function activeSceneIndices(
  timeline: Pick<StoryTimeline, "scenes" | "durationMs">,
  t: number,
): number[] {
  const time = Math.min(Math.max(0, t), timeline.durationMs);
  return timeline.scenes.flatMap((scene, index) => {
    const end = scene.startMs + scene.durationMs;
    return scene.startMs <= time &&
      (time < end || (time === end && (scene.durationMs === 0 || end === timeline.durationMs)))
      ? [index]
      : [];
  });
}

/** What a story needs of one view: its scene, its effects and the ends of its relations. */
export interface StoryViewData {
  readonly scene: Scene;
  readonly plan: MotionPlan;
  /** Relation key to its source and target ids, for focus. */
  readonly ends: Readonly<Record<string, readonly [string, string]>>;
  /**
   * Gantt charts: the ids of the sections that hold each task, milestone and marker, whose groups
   * are drawn inside their section's. A section hidden or out of focus takes the arrows of what it
   * holds with it, and a task in focus keeps its section in focus. Absent in other views.
   */
  readonly holders?: Readonly<Record<string, readonly string[]>>;
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

/** The final state of a scene is drawn this long before the next one starts, in milliseconds. */
export const BEFORE_NEXT_SCENE = 0.01;

/** The still of a scene: the instant of its final state, the frame a slide or a page takes. */
export interface SceneStill {
  readonly id: string;
  readonly title: string | null;
  /** The key of the scene's view. */
  readonly view: string;
  /** The instant of the scene's final state, in milliseconds. */
  readonly atMs: number;
}

/**
 * The still of every scene of a timeline: the scene's end for the last one, and for the others
 * `BEFORE_NEXT_SCENE` before it, so the next scene's first frame (a transition, a reveal) never
 * shows. The player's static view and the exports of every scene draw these instants.
 */
export function sceneStills(timeline: Pick<StoryTimeline, "scenes">): SceneStill[] {
  const scenes = timeline.scenes;
  const overlapping = hasSceneOverlap(timeline);
  return scenes.map((scene, i) => {
    const end = scene.startMs + scene.durationMs;
    return {
      id: scene.id,
      title: scene.title,
      view: scene.view,
      atMs:
        overlapping || i === scenes.length - 1
          ? end
          : Math.max(scene.startMs, end - BEFORE_NEXT_SCENE),
    };
  });
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
  /**
   * The targets of `draw` actions under way, by `targetKey` of their role and id: how much of each
   * is drawn, from 0 (not started) to below 1.
   */
  draws: Map<string, number>;
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
          // In one loop: a pen's track may hold more points than a call takes arguments.
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -Infinity;
          let y1 = -Infinity;
          for (const p of item.track) {
            if (p.x < x0) x0 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.x > x1) x1 = p.x;
            if (p.y > y1) y1 = p.y;
          }
          add({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
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
  // Visibility: a target first revealed or drawn starts hidden.
  const opacity = new Map<string, number>();
  const firstVisibility = new Map<string, string>();
  for (const { action } of all) {
    if (action.kind !== "reveal" && action.kind !== "hide" && action.kind !== "draw") continue;
    for (const target of action.targets)
      if (!firstVisibility.has(target.id)) firstVisibility.set(target.id, action.kind);
  }
  for (const [id, kind] of firstVisibility) opacity.set(id, kind === "hide" ? 1 : 0);
  const highlights: StoryState["highlights"] = [];
  const traces: StoryState["traces"] = [];
  const draws: StoryState["draws"] = new Map();
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
        if (p < 1) {
          for (const [id, progress] of traceProgress(action, p, views(view)?.scene)) {
            traces.push({ id, progress });
          }
        }
        break;
      case "draw":
        // Drawing shows its targets: until its share is over, each is only its drawing so far.
        for (const target of action.targets) opacity.set(target.id, 1);
        if (p >= 1) break;
        for (const [key, fraction] of drawProgress(action, p, views(view)?.scene)) {
          if (fraction < 1) draws.set(key, fraction);
          else draws.delete(key);
        }
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
  return { scene: index, opacity, highlights, traces, draws, focus, camera };
}

interface OverlapClaim {
  readonly action: TimelineAction;
  readonly scene: number;
}

const upperBound = (values: readonly number[], value: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

/**
 * Claims are in scene/action priority order, not clock order. Each interpolation captures its
 * lower-priority value once at its own start. A range/point tree prepares those anchors without
 * recursion or quadratic scans when a later scene starts before many earlier scene actions.
 */
class ClaimTrack<T> {
  private readonly records: { claim: OverlapClaim; from: T; end: number }[] = [];

  constructor(
    private readonly initial: T,
    claims: readonly OverlapClaim[],
    private readonly sample: (claim: OverlapClaim, from: T, t: number) => T,
    private readonly duration: number,
    endOf: (claim: OverlapClaim) => number = () => Infinity,
  ) {
    const ends = claims.map(endOf);
    const points = [
      ...new Set([
        0,
        duration,
        ...claims.map((c) => c.action.startMs),
        ...ends.filter(Number.isFinite),
      ]),
    ].sort((a, b) => a - b);
    const tree = new Int32Array(points.length * 4).fill(-1);
    const query = (point: number, node = 1, left = 0, right = points.length - 1): number => {
      if (left === right) return tree[node]!;
      const middle = (left + right) >>> 1;
      return Math.max(
        tree[node]!,
        point <= middle
          ? query(point, node * 2, left, middle)
          : query(point, node * 2 + 1, middle + 1, right),
      );
    };
    const assign = (
      from: number,
      to: number,
      value: number,
      node = 1,
      left = 0,
      right = points.length - 1,
    ): void => {
      if (from > right || to < left || from > to) return;
      if (from <= left && right <= to) {
        tree[node] = value;
        return;
      }
      const middle = (left + right) >>> 1;
      assign(from, to, value, node * 2, left, middle);
      assign(from, to, value, node * 2 + 1, middle + 1, right);
    };
    for (const [index, claim] of claims.entries()) {
      const point = upperBound(points, claim.action.startMs) - 1;
      const prior = this.records[query(point)];
      const from = prior ? sample(prior.claim, prior.from, claim.action.startMs) : initial;
      const end = ends[index]!;
      this.records.push({ claim, from, end });
      const last =
        end === Infinity || end === duration ? points.length - 1 : upperBound(points, end) - 2;
      assign(point, last, index);
    }
  }

  /** The highest-priority started claim in the requested scene prefix. */
  valueAt(t: number, throughScene: number, closing = false): T {
    let low = 0;
    let high = this.records.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.records[middle]!.claim.scene <= throughScene) low = middle + 1;
      else high = middle;
    }
    for (let i = low - 1; i >= 0; i--) {
      const record = this.records[i]!;
      if (
        record.claim.action.startMs <= t &&
        (t < record.end || (t === record.end && (closing || record.end === this.duration)))
      )
        return this.sample(record.claim, record.from, t);
    }
    return this.initial;
  }
}

interface OverlapView {
  readonly claims: readonly OverlapClaim[];
  readonly visibility: ReadonlyMap<string, ClaimTrack<number>>;
  readonly camera: ClaimTrack<Box | null>;
  readonly focus: ClaimTrack<StoryState["focus"]>;
}

interface OverlapComposition {
  readonly sourceScenes: readonly (Scene | undefined)[];
  readonly views: ReadonlyMap<string, OverlapView>;
}

const overlapCompositions = new WeakMap<StoryTimeline, OverlapComposition>();

function overlapComposition(timeline: StoryTimeline, views: StoryViews): OverlapComposition {
  const sourceScenes = timeline.views.map((key) => views(key)?.scene);
  const cached = overlapCompositions.get(timeline);
  if (cached && cached.sourceScenes.every((scene, index) => scene === sourceScenes[index]))
    return cached;
  const all = timeline.scenes.flatMap((scene, index) => flatten(scene.actions, index));
  const prepared = new Map<string, OverlapView>();
  for (const key of timeline.views) {
    const data = views(key);
    if (!data) continue;
    const claims = all.filter((claim) => timeline.scenes[claim.scene]!.view === key);
    const visibility = new Map<string, ClaimTrack<number>>();
    const visibilityClaims = new Map<string, OverlapClaim[]>();
    for (const claim of claims) {
      if (!["reveal", "hide", "draw"].includes(claim.action.kind)) continue;
      for (const target of claim.action.targets) {
        const list = visibilityClaims.get(target.id) ?? [];
        list.push(claim);
        visibilityClaims.set(target.id, list);
      }
    }
    for (const [id, list] of visibilityClaims) {
      const first = list.reduce((a, b) => (b.action.startMs < a.action.startMs ? b : a));
      visibility.set(
        id,
        new ClaimTrack(
          first.action.kind === "hide" ? 1 : 0,
          list,
          ({ action }, from, t) =>
            action.kind === "draw"
              ? 1
              : lerp(
                  from,
                  action.kind === "hide" ? 0 : 1,
                  progress(t, action.startMs, action.durationMs),
                ),
          timeline.durationMs,
        ),
      );
    }
    const camera = new ClaimTrack<Box | null>(
      null,
      claims.filter((claim) => claim.action.kind === "camera"),
      ({ action }, from, t) => {
        const bounds = action.all
          ? null
          : boundsOf(
              data.scene,
              action.targets.map((target) => target.id),
            );
        return interpolateBox(
          data.scene,
          from,
          bounds ? frameBox(data.scene, bounds) : null,
          progress(t, action.startMs, action.durationMs),
        );
      },
      timeline.durationMs,
    );
    const focus = new ClaimTrack<StoryState["focus"]>(
      null,
      claims.filter((claim) => claim.action.kind === "focus"),
      ({ action }, from, t) => ({
        ids: action.all
          ? (from?.ids ?? new Set<string>())
          : new Set(action.targets.map((target) => target.id)),
        level: lerp(
          from?.level ?? 0,
          action.all ? 0 : 1,
          progress(t, action.startMs, action.durationMs),
        ),
      }),
      timeline.durationMs,
      (claim) => {
        const scene = timeline.scenes[claim.scene]!;
        return scene.startMs + scene.durationMs;
      },
    );
    prepared.set(key, { claims, visibility, camera, focus });
  }
  const composition = { sourceScenes, views: prepared };
  overlapCompositions.set(timeline, composition);
  return composition;
}

/** Per-view state, composed by channel with later-scene priority after a claim begins. */
function overlapStateAt(
  composition: OverlapComposition,
  key: string,
  t: number,
  throughScene: number,
  data: StoryViewData,
  closing = false,
): StoryState {
  const prepared = composition.views.get(key)!;
  const opacity = new Map(
    [...prepared.visibility].map(([id, track]) => [id, track.valueAt(t, throughScene)]),
  );
  const highlights = new Map<string, number>();
  const strokes = new Map<string, { kind: "trace" | "draw"; key: string; progress?: number }>();
  for (const { action, scene } of prepared.claims) {
    if (scene > throughScene || action.startMs > t) continue;
    const p = progress(t, action.startMs, action.durationMs);
    if (p >= 1) continue;
    if (action.kind === "highlight") {
      const ramp = Math.min(200, action.durationMs / 4);
      const intensity =
        ramp <= 0
          ? 1
          : Math.min(
              1,
              (t - action.startMs) / ramp,
              (action.startMs + action.durationMs - t) / ramp,
            );
      for (const target of action.targets) highlights.set(target.id, intensity);
    } else if (action.kind === "trace") {
      const fractions = new Map(traceProgress(action, p, data.scene));
      for (const target of action.targets)
        strokes.set(target.id, {
          kind: "trace",
          key: target.id,
          progress: fractions.get(target.id),
        });
    } else if (action.kind === "draw") {
      const fractions = drawProgress(action, p, data.scene);
      for (const target of action.targets) {
        const targetId = targetKey(target.kind, target.id);
        strokes.set(target.id, { kind: "draw", key: targetId, progress: fractions.get(targetId) });
      }
    }
  }
  const traces: StoryState["traces"] = [];
  const draws: StoryState["draws"] = new Map();
  for (const stroke of strokes.values()) {
    if (stroke.progress === undefined) continue;
    if (stroke.kind === "trace") traces.push({ id: stroke.key, progress: stroke.progress });
    else if (stroke.progress < 1) draws.set(stroke.key, stroke.progress);
  }
  const box = prepared.camera.valueAt(t, throughScene);
  return {
    scene: throughScene,
    opacity,
    highlights: [...highlights].map(([id, intensity]) => ({ id, intensity })),
    traces,
    draws,
    focus: prepared.focus.valueAt(t, throughScene, closing),
    camera: box ? { from: box, to: box, progress: 1 } : null,
  };
}

/** The group of a target in a scene: an element's or a relation's, by its kind. */
function targetGroup(scene: Scene, target: TimelineAction["targets"][number]) {
  return findGroup(scene.items, target.id, [target.kind]);
}

/**
 * Whether a group is the bar of a gantt task: an element with a box and no line to follow (a pen
 * that is a dot has a box too, but it is drawn by hand). What `draw` replays of it is its box,
 * from the start of the bar to its end.
 */
const isBar = (group: GroupItem): boolean =>
  group.role === "element" &&
  group.bounds !== undefined &&
  group.freehand !== true &&
  drawnTrack(group) === null;

/**
 * How far each target of a `trace` action has been traced at its progress `p`, as `[id, progress]`
 * in the order written. A trace of one relation runs over the whole action; a task's `trace` has
 * the arrows of its chain as targets, which run one after another, each over a share of the action
 * proportional to its length (equal shares when none has one), and stay drawn once they are. The
 * arrows that have not started are left out, but the first, which shows its start as a trace does.
 */
function traceProgress(
  action: TimelineAction,
  p: number,
  scene: Scene | undefined,
): [string, number][] {
  if (action.targets.length < 2) return action.targets.map((target) => [target.id, p]);
  const lengths = action.targets.map((target) => {
    const group = scene && targetGroup(scene, target);
    const track = group ? drawnTrack(group) : null;
    return track ? trackLength(track) : 0;
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const traced: [string, number][] = [];
  let start = 0;
  action.targets.forEach((target, i) => {
    const share = total > 0 ? lengths[i]! / total : 1 / lengths.length;
    const fraction = share > 0 ? Math.min(1, Math.max(0, (p - start) / share)) : p >= start ? 1 : 0;
    start += share;
    if (fraction > 0 || i === 0) traced.push([target.id, fraction]);
  });
  return traced;
}

/**
 * How much of each target of a `draw` action is drawn at its progress `p`, by `targetKey`: the
 * targets one after another in the order written, each over a share of the action proportional
 * to the length of the line it draws, or the width of the bar of a gantt task (equal shares when
 * none has a length, as dots), from 0 before its share to 1 after it. A target named twice shows
 * the drawing under way, else the one finished.
 */
function drawProgress(
  action: TimelineAction,
  p: number,
  scene: Scene | undefined,
): Map<string, number> {
  const lengths = action.targets.map((target) => {
    const group = scene && targetGroup(scene, target);
    if (!group) return 0;
    const track = drawnTrack(group);
    return track ? trackLength(track) : isBar(group) ? group.bounds!.width : 0;
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const drawn = new Map<string, number>();
  let start = 0;
  action.targets.forEach((target, i) => {
    const share = total > 0 ? lengths[i]! / total : 1 / lengths.length;
    const fraction = share > 0 ? Math.min(1, Math.max(0, (p - start) / share)) : p >= start ? 1 : 0;
    start += share;
    const key = targetKey(target.kind, target.id);
    if (fraction > 0 || !drawn.has(key)) drawn.set(key, fraction);
  });
  return drawn;
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

/**
 * The groups of a scene with story opacities applied: visibility times focus. `value` also gets
 * the participant whose lifeline holds the group, for an activation bar of a sequence diagram (a
 * group of role `event` inside a `lifeline` group).
 */
function withOpacity(
  items: readonly SceneItem[],
  value: (group: GroupItem, lifeline: string | undefined) => number,
  lifeline?: string,
): SceneItem[] {
  return items.map((item) => {
    if (item.kind !== "group") return item;
    const inner = withOpacity(item.items, value, item.role === "lifeline" ? item.id : lifeline);
    const own =
      item.role === "element" || item.role === "relation" || item.role === "event"
        ? value(item, lifeline)
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

/**
 * A pen, a free line or a relation drawn up to `fraction` of its line, as a trace grows: one
 * stroke along the whole line it draws (`drawnTrack`) in its own colour, width and opacity, with a
 * dash as long as the line offset so that only its first `fraction` shows, and no dot at the head.
 * A dashed or dotted stroke is cut at that length instead, so its own pattern shows as it grows.
 * Nothing shows before it starts; its heads and its label wait until it is whole.
 */
function drawnItems(group: GroupItem, fraction: number): SceneItem[] {
  const track = drawnTrack(group);
  const line = group.items.find(
    (i): i is PolylineItem | PathItem =>
      (i.kind === "polyline" || i.kind === "path") && i.stroke !== "none",
  );
  if (fraction <= 0 || !track || !line) return [];
  const stroke = {
    kind: "polyline",
    stroke: line.stroke,
    strokeWidth: line.strokeWidth,
    dashed: line.dashed,
    ...(line.opacity !== undefined ? { opacity: line.opacity } : {}),
  } as const;
  if (line.dashed !== false) {
    return [
      {
        ...stroke,
        points: partialTrack(track, fraction).map((q) => ({ x: round(q.x), y: round(q.y) })),
      },
    ];
  }
  // The same points at every frame, so a sketch theme paints the same wobble as the line grows.
  const length = round(trackLength(track));
  return [
    {
      ...stroke,
      points: track,
      // A gap longer than the line, so the dash shows once and leaves no dot at the end.
      dash: {
        array: [length, round(length + line.strokeWidth + 1)],
        offset: round(length * (1 - fraction)),
      },
    },
  ];
}

/**
 * A rectangle cut at `cut`: what lies left of that vertical line, as the fill of a closed path and
 * the stroke of an open one, so the cut edge has no stroke, as a clip leaves it. The rectangle's
 * rounded corners are kept where they are. Nothing when it starts right of the cut, and the
 * rectangle itself when it ends left of it.
 */
function cutRect(rect: RectItem, cut: number): SceneItem[] {
  const { x, y, width, height } = rect;
  const right = x + width;
  if (cut >= right) return [rect];
  if (cut <= x) return [];
  const bottom = y + height;
  const r = Math.max(0, Math.min(rect.radius, width / 2, height / 2));
  const n = round;
  const arc = (sweep: 0 | 1, px: number, py: number) =>
    `A${n(r)} ${n(r)} 0 0 ${sweep} ${n(px)} ${n(py)}`;
  /** How far a corner's arc has come in from the box's edge by `along` of its radius. */
  const inset = (along: number) => Math.sqrt(Math.max(0, r * r - along * along));
  let fill: string;
  let edge: string;
  if (r === 0) {
    fill = `M${n(x)} ${n(y)} H${n(cut)} V${n(bottom)} H${n(x)} Z`;
    edge = `M${n(cut)} ${n(y)} H${n(x)} V${n(bottom)} H${n(cut)}`;
  } else if (cut <= x + r) {
    const top = y + r - inset(x + r - cut);
    const low = bottom - r + inset(x + r - cut);
    fill = `M${n(cut)} ${n(top)} V${n(low)} ${arc(1, x, bottom - r)} V${n(y + r)} ${arc(1, cut, top)} Z`;
    edge = `M${n(cut)} ${n(top)} ${arc(0, x, y + r)} V${n(bottom - r)} ${arc(0, cut, low)}`;
  } else if (cut < right - r) {
    fill = `M${n(x + r)} ${n(y)} H${n(cut)} V${n(bottom)} H${n(x + r)} ${arc(1, x, bottom - r)} V${n(y + r)} ${arc(1, x + r, y)} Z`;
    edge = `M${n(cut)} ${n(y)} H${n(x + r)} ${arc(0, x, y + r)} V${n(bottom - r)} ${arc(0, x + r, bottom)} H${n(cut)}`;
  } else {
    const top = y + r - inset(cut - (right - r));
    const low = bottom - r + inset(cut - (right - r));
    fill = `M${n(x + r)} ${n(y)} H${n(right - r)} ${arc(1, cut, top)} V${n(low)} ${arc(1, right - r, bottom)} H${n(x + r)} ${arc(1, x, bottom - r)} V${n(y + r)} ${arc(1, x + r, y)} Z`;
    edge = `M${n(cut)} ${n(top)} ${arc(0, right - r, y)} H${n(x + r)} ${arc(0, x, y + r)} V${n(bottom - r)} ${arc(0, x + r, bottom)} H${n(right - r)} ${arc(0, cut, low)}`;
  }
  const opacity = rect.opacity === undefined ? {} : { opacity: rect.opacity };
  const out: SceneItem[] = [];
  if (rect.fill !== "none") {
    out.push({
      kind: "path",
      d: fill,
      fill: rect.fill,
      stroke: "none",
      strokeWidth: 0,
      dashed: false,
      ...opacity,
    });
  }
  if (rect.stroke !== "none" && rect.strokeWidth > 0) {
    out.push({
      kind: "path",
      d: edge,
      fill: "none",
      stroke: rect.stroke,
      strokeWidth: rect.strokeWidth,
      dashed: rect.dashed,
      ...opacity,
    });
  }
  return out;
}

/** The room a clip leaves around a bar and its label, so strokes and glyph edges are not cut. */
const CLIP_PAD = 2;

/**
 * The group of a gantt task drawn up to `fraction` of its bar: a clip that widens from the start
 * of the bar to its end. The bar is cut where the clip ends, and the group's texts (its label,
 * inside the bar or beside it) are clipped to the same line; nothing shows before the clip starts,
 * and the whole group once it has reached the end.
 */
function clippedBar(group: GroupItem, fraction: number): GroupItem {
  const bar = group.bounds!;
  if (fraction <= 0) return { ...group, items: [] };
  const cut = bar.x + bar.width * fraction;
  // A label before the bar, or in the section's column, lies left of the clip's start and shows
  // from the first frame; one after the bar shows when the bar is whole.
  const label = bar.label;
  const left = Math.min(bar.x, label?.x ?? bar.x) - CLIP_PAD;
  const top = Math.min(bar.y, label?.y ?? bar.y) - CLIP_PAD;
  const bottom = Math.max(bar.y + bar.height, label ? label.y + label.height : 0) + CLIP_PAD;
  return {
    ...group,
    items: group.items.flatMap((item) => (item.kind === "rect" ? cutRect(item, cut) : [item])),
    textClip: {
      id: `mdg-draw-clip-${group.id}`,
      x: round(left),
      y: round(top),
      width: round(cut - left),
      height: round(bottom - top),
      radius: 0,
    },
  };
}

/** The groups of tasks that `draw` actions are drawing, each clipped where its bar has grown. */
function withBars(items: readonly SceneItem[], draws: ReadonlyMap<string, number>): SceneItem[] {
  return items.map((item) => {
    if (item.kind !== "group") return item;
    const inner = withBars(item.items, draws);
    const fraction = isBar(item) ? draws.get(targetKey(item.role, item.id)) : undefined;
    if (fraction !== undefined) return clippedBar({ ...item, items: inner }, fraction);
    return inner.every((x, i) => x === item.items[i]) ? item : { ...item, items: inner };
  });
}

/** The groups a `draw` action is drawing, each replaced by its drawing so far. */
function withDrawings(
  items: readonly SceneItem[],
  draws: ReadonlyMap<string, number>,
): SceneItem[] {
  if (draws.size === 0) return [...items];
  // A pen, a line or a relation is drawn along its line; the bar of a task is clipped.
  const lines = withTargets(items, (group) => {
    const fraction = draws.get(targetKey(group.role, group.id));
    return fraction === undefined || isBar(group) ? null : drawnItems(group, fraction);
  });
  return withBars(lines, draws);
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
  // A trace suspends the local effects of its relation, and a drawing those of its target.
  const plan: MotionPlan = {
    effects: data.plan.effects.filter(
      (e) =>
        !(e.role === "relation" && traced.has(e.target)) &&
        !state.draws.has(targetKey(e.role, e.target)),
    ),
  };
  const animated = sceneAt(data.scene, plan, t);
  const focused = state.focus;
  // A gantt chart draws a task inside its section's group: the section holds it.
  const holders = data.holders ?? {};
  const members = new Map<string, string[]>();
  for (const [id, sections] of Object.entries(holders)) {
    for (const section of sections) members.set(section, [...(members.get(section) ?? []), id]);
  }
  const inFocus = (id: string, role: string): boolean => {
    if (!focused) return true;
    if (focused.ids.has(id)) return true;
    if (role === "relation") {
      const ends = data.ends[id];
      return ends !== undefined && inFocus(ends[0], "element") && inFocus(ends[1], "element");
    }
    // A task is in focus with its section, and a section with any task it holds.
    return (
      (holders[id] ?? []).some((holder) => focused.ids.has(holder)) ||
      (members.get(id) ?? []).some((member) => focused.ids.has(member))
    );
  };
  const opacity = (id: string) => state.opacity.get(id) ?? 1;
  /** How visible an end of an arrow is: its own opacity, and its section's, which it is drawn in. */
  const shown = (id: string) => Math.min(opacity(id), ...(holders[id] ?? []).map(opacity));
  /** Whether a task has yet to start growing under a `draw`: its arrows wait for it. */
  const waiting = (id: string) => (state.draws.get(targetKey("element", id)) ?? 1) <= 0;
  const overlays = storyOverlays(data.scene, state, accent);
  const drawn = withDrawings(withTraces(animated.items, overlays.traces), state.draws);
  const items = withOpacity(drawn, (group, lifeline) => {
    // A relation is drawn at the opacity of its least visible end, so no arrow points at a box
    // that is not there yet.
    const ends = group.role === "relation" ? data.ends[group.id] : undefined;
    const visible = ends?.some(waiting)
      ? 0
      : Math.min(opacity(group.id), ...(ends ?? []).map(shown));
    // An activation bar stands on its participant's lifeline: in focus when the participant is.
    const bar = group.role === "event" && lifeline !== undefined;
    // A task inside a section that is dimmed is dimmed with it, not twice.
    const covered = (holders[group.id] ?? []).some((holder) => !inFocus(holder, "element"));
    const dim =
      focused && !inFocus(group.id, group.role) && !covered && !(bar && focused.ids.has(lifeline))
        ? lerp(1, 0.25, focused.level)
        : 1;
    return visible * dim;
  });
  if (overlays.highlights.length > 0)
    items.push({ kind: "group", id: "story", role: "motion", items: overlays.highlights });
  return { ...animated, items };
}

/**
 * The scene of a story at `t` milliseconds: visibility, highlights, traces, drawings, focus and
 * camera, the transition between two views, and the views' own effects on the same clock. A
 * `draw` replays its pens, lines and relations one after another, each from its first point to
 * its last over a share of the action proportional to its length, in its own stroke, and leaves
 * them drawn. Pure.
 */
export function storyFrame(
  timeline: StoryTimeline,
  views: StoryViews,
  t: number,
  options: StoryFrameOptions = {},
): Scene | null {
  if (hasSceneOverlap(timeline)) return overlappingFrame(timeline, views, t, options);
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
  return transitionFrames(old, frame, p, transition.kind);
}

interface FramePlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** Bounds in the viewport where a composed frame is drawn, rather than its old local space. */
function projectedBounds(
  bounds: SceneBounds,
  sx: number,
  sy: number,
  x: number,
  y: number,
): SceneBounds {
  const rectangle = (box: Box): Box => ({
    x: box.x * sx + x,
    y: box.y * sy + y,
    width: box.width * sx,
    height: box.height * sy,
  });
  return {
    ...bounds,
    ...rectangle(bounds),
    radius: bounds.radius * Math.min(Math.abs(sx), Math.abs(sy)),
    ...(bounds.inner ? { inner: rectangle(bounds.inner) } : {}),
    ...(bounds.label ? { label: rectangle(bounds.label) } : {}),
  };
}

function placedBounds(items: readonly SceneItem[], place: FramePlacement): SceneItem[] {
  return items.map((item) =>
    item.kind === "group"
      ? {
          ...item,
          ...(item.bounds
            ? { bounds: projectedBounds(item.bounds, place.scale, place.scale, place.x, place.y) }
            : {}),
          items: placedBounds(item.items, place),
        }
      : item,
  );
}

/** Fit the view box that each camera actually sees to one common transition viewport. */
function framePlacement(scene: Scene, width: number, height: number): FramePlacement {
  const box = scene.viewBox ?? fullBox(scene);
  const scale = Math.min(width / box.width, height / box.height);
  return {
    x: (width - box.width * scale) / 2 - box.x * scale,
    y: (height - box.height * scale) / 2 - box.y * scale,
    scale,
  };
}

function transitionFrames(
  old: Scene,
  frame: Scene,
  p: number,
  kind: "fade" | "morph",
  cameras = false,
): Scene {
  const width = Math.max(old.width, frame.width);
  const height = Math.max(old.height, frame.height);
  const fromPlacement = cameras ? framePlacement(old, width, height) : null;
  const toPlacement = cameras ? framePlacement(frame, width, height) : null;
  const placed = (
    items: readonly SceneItem[],
    source: Scene,
    place: FramePlacement | null,
  ): readonly SceneItem[] => {
    if (!place) return items;
    const background: SceneItem[] =
      source.background === "none" || source.background === "transparent"
        ? []
        : [
            {
              kind: "rect",
              x: 0,
              y: 0,
              width,
              height,
              radius: 0,
              fill: source.background,
              stroke: "none",
              strokeWidth: 0,
              dashed: false,
            },
          ];
    return [
      ...background,
      {
        kind: "group",
        id: "story-camera",
        role: "motion",
        transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
        items: placedBounds(items, place),
      },
    ];
  };
  const viewport = cameras
    ? {
        viewBox: { x: 0, y: 0, width, height },
        gradients: [
          ...new Map(
            [...old.gradients, ...frame.gradients].map((gradient) => [gradient.id, gradient]),
          ).values(),
        ],
        patterns: [
          ...new Map(
            [...old.patterns, ...frame.patterns].map((pattern) => [pattern.id, pattern]),
          ).values(),
        ],
        ...(old.styleSheet ? { styleSheet: `${old.styleSheet}\n${frame.styleSheet ?? ""}` } : {}),
      }
    : {};
  if (kind === "fade") {
    return {
      ...frame,
      ...viewport,
      width,
      height,
      items: [
        {
          kind: "group",
          id: "before",
          role: "motion",
          items: placed(old.items, old, fromPlacement),
          opacity: round(1 - p),
        },
        {
          kind: "group",
          id: "after",
          role: "motion",
          items: placed(frame.items, frame, toPlacement),
          opacity: round(p),
        },
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
      let from = item.role === "element" && item.bounds ? oldBounds.get(item.id) : undefined;
      if (from && fromPlacement && toPlacement) {
        from = {
          ...from,
          x: (from.x * fromPlacement.scale + fromPlacement.x - toPlacement.x) / toPlacement.scale,
          y: (from.y * fromPlacement.scale + fromPlacement.y - toPlacement.y) / toPlacement.scale,
          width: (from.width * fromPlacement.scale) / toPlacement.scale,
          height: (from.height * fromPlacement.scale) / toPlacement.scale,
        };
      }
      if (from && item.bounds && (!cameras || (item.bounds.width > 0 && item.bounds.height > 0))) {
        moved.add(item.id);
        const to = item.bounds;
        const x = lerp(from.x, to.x, p);
        const y = lerp(from.y, to.y, p);
        const sx = lerp(from.width, to.width, p) / to.width;
        const sy = lerp(from.height, to.height, p) / to.height;
        const transform = `translate(${round(x - to.x * sx)} ${round(y - to.y * sy)}) scale(${round(sx * 1000) / 1000} ${round(sy * 1000) / 1000})`;
        const positioned = cameras
          ? { ...item, bounds: projectedBounds(to, sx, sy, x - to.x * sx, y - to.y * sy) }
          : item;
        return {
          kind: "group",
          id: `${item.id}#morph`,
          role: "motion",
          items: [positioned],
          transform,
        };
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
  return {
    ...frame,
    ...viewport,
    width,
    height,
    items: [
      ...placed(leaving(old.items), old, fromPlacement),
      ...placed(after, frame, toPlacement),
    ],
  };
}

function overlappingFrame(
  timeline: StoryTimeline,
  views: StoryViews,
  t: number,
  options: StoryFrameOptions,
  throughScene?: number,
): Scene | null {
  const time = Math.min(Math.max(0, t), timeline.durationMs);
  const composition = overlapComposition(timeline, views);
  const accent = options.accent ?? "#1f6feb";
  // Keep recursion out of arbitrarily long chains of concurrently entering transitions.
  const entering: { frame: Scene; kind: "fade" | "morph"; progress: number }[] = [];
  let index = throughScene ?? storySceneIndexAt(timeline, time);
  let result: Scene | null = null;
  while (index >= 0) {
    const scene = timeline.scenes[index]!;
    const data = views(scene.view);
    if (!data) return null;
    const state = overlapStateAt(
      composition,
      scene.view,
      time,
      index,
      data,
      throughScene !== undefined,
    );
    let frame = drawView(data, state, time, accent);
    if (state.camera) {
      const box = state.camera.to!;
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
    const transition = scene.transition;
    const p = transition ? progress(time, transition.startMs, transition.durationMs) : 1;
    if (index > 0 && transition && transition.kind !== "cut" && p < 1) {
      entering.push({ frame, kind: transition.kind, progress: p });
      index--;
    } else {
      result = frame;
      break;
    }
  }
  for (const transition of entering.reverse())
    result = transitionFrames(
      result!,
      transition.frame,
      transition.progress,
      transition.kind,
      true,
    );
  return result;
}

/** The closing frame of one scene, without later scenes masking it during their overlap. */
export function storySceneFrame(
  timeline: StoryTimeline,
  views: StoryViews,
  sceneIndex: number,
  options: StoryFrameOptions = {},
): Scene | null {
  const scene = timeline.scenes[sceneIndex];
  if (!scene) return null;
  // Keep future first-reveal targets initially hidden, while excluding their later claims.
  return overlappingFrame(timeline, views, scene.startMs + scene.durationMs, options, sceneIndex);
}

/**
 * What a story needs of a laid-out view: its scene, its effects and its relation ends, and in a
 * gantt chart the sections that hold each task.
 */
export function storyViewData(
  diagram: FlowDiagram,
  layout: LayoutResult,
): StoryViewData | undefined {
  if (!layout.scene) return undefined;
  const ends: Record<string, readonly [string, string]> = {};
  for (const relation of diagram.relations) ends[relation.key] = [relation.from, relation.to];
  const plan = planMotion(diagram, layout.scene, motionOptions(layout.theme));
  if (diagram.type !== "gantt") return { scene: layout.scene, plan, ends };
  const holders: Record<string, readonly string[]> = {};
  for (const element of diagram.elements) {
    if (element.groupPath.length > 0) holders[element.id] = element.groupPath;
  }
  return { scene: layout.scene, plan, ends, holders };
}
