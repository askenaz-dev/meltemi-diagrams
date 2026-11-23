import type { GroupItem, Scene, SceneItem } from "@meltemi/diagrams-layout";
import type { Point } from "@meltemi/diagrams-model";
import {
  circlePath,
  particleRadius,
  pointAlong,
  round,
  roundedRectPath,
  trackLength,
} from "./geometry.js";
import {
  DASH_PATTERN,
  DASH_PERIOD,
  GLOW,
  HALO,
  TRACE,
  motionLoop,
  phaseAt,
  type MotionEffect,
  type MotionPlan,
} from "./plan.js";

/** The items with `change` applied to every group; unchanged groups keep their identity. */
export function withTargets(
  items: readonly SceneItem[],
  change: (group: GroupItem) => readonly SceneItem[] | null,
): SceneItem[] {
  return items.map((item) => {
    if (item.kind !== "group") return item;
    const inner = withTargets(item.items, change);
    const changed = change({ ...item, items: inner });
    if (changed) return { ...item, items: changed };
    return inner.every((x, i) => x === item.items[i]) ? item : { ...item, items: inner };
  });
}

/** The index of the first stroked line or outline of a group, or -1. */
export function outlineIndex(items: readonly SceneItem[]): number {
  return items.findIndex(
    (item) =>
      (item.kind === "rect" || item.kind === "path" || item.kind === "polyline") &&
      item.stroke !== "none",
  );
}

export const targetKey = (role: string, id: string) => `${role}\u0000${id}`;

/** The track a trace runs along, from where it starts: reversed for `direction reverse`. */
export function traceTrack(effect: MotionEffect): Point[] {
  const points = effect.track!.map((p) => ({ x: round(p.x), y: round(p.y) }));
  return effect.reverse ? points.reverse() : points;
}

/** How far a trace has grown at `phase` (0 to 1) and how visible it is. */
export function traceState(phase: number): { grown: number; opacity: number } {
  const grown = Math.min(1, phase / TRACE.fill);
  const opacity = phase <= TRACE.fill ? 1 : (1 - phase) / (1 - TRACE.fill);
  return { grown, opacity };
}

/**
 * A mark an effect moves along its line: its centre in scene coordinates, and how much of the
 * line it has travelled (0 to 1) in the direction the effect runs.
 */
export interface MotionMark {
  readonly x: number;
  readonly y: number;
  readonly along: number;
}

/** The head of a trace at `phase`: the end of the part grown so far. */
export function traceHead(effect: MotionEffect, phase: number): MotionMark {
  const { grown } = traceState(phase);
  const head = pointAlong(traceTrack(effect), grown);
  return { x: head.x, y: head.y, along: grown };
}

/**
 * The particles of a flow at `phase`, in the statement's order: each one `1 / particles` of the
 * line ahead of the one before, from the line's end when the effect is reversed.
 */
export function flowParticles(effect: MotionEffect, phase: number): MotionMark[] {
  const marks: MotionMark[] = [];
  for (let i = 0; i < effect.particles; i++) {
    // At the instant a particle reaches the end it is still there, as with CSS keyframes.
    let along = phase + i / effect.particles;
    if (along > 1) along -= 1;
    const at = pointAlong(effect.track!, effect.reverse ? 1 - along : along);
    marks.push({ x: at.x, y: at.y, along });
  }
  return marks;
}

/**
 * A trace at `phase`: the track drawn with one dash as long as the track, offset so that the part
 * grown so far shows, and a dot at its head; the animated profile draws the same values.
 */
export function traceAt(effect: MotionEffect, phase: number): SceneItem[] {
  const points = traceTrack(effect);
  const length = round(trackLength(points));
  const { grown, opacity } = traceState(phase);
  const head = traceHead(effect, phase);
  return [
    {
      kind: "polyline",
      points,
      stroke: effect.color,
      strokeWidth: round(effect.width + TRACE.extra),
      dashed: false,
      dash: { array: [length, length], offset: round(length * (1 - grown)) },
      opacity: round(opacity),
    },
    {
      kind: "path",
      d: circlePath(head.x, head.y, effect.width + TRACE.dot),
      fill: effect.color,
      stroke: "none",
      strokeWidth: 0,
      dashed: false,
      opacity: round(opacity),
    },
  ];
}

/**
 * The items of a relation's group with `extra` inserted before its label and the pills of its
 * tags (a sequence message's, drawn after the label), whichever comes first, so that they stay on
 * top: a message without a label still has its pills over the particles.
 */
export function beforeLabel(items: readonly SceneItem[], extra: readonly SceneItem[]): SceneItem[] {
  const label = items.findIndex(
    (i) => i.kind === "group" && (i.role === "label" || i.role === "tag"),
  );
  const at = label < 0 ? items.length : label;
  return [...items.slice(0, at), ...extra, ...items.slice(at)];
}

/**
 * The halo or glow an effect draws at `phase`, above everything else, or its particles, which go
 * into the relation's group under its label.
 */
export function overlayAt(effect: MotionEffect, phase: number): SceneItem[] {
  if (effect.effect === "pulse") {
    if (effect.bounds) {
      return [
        {
          kind: "path",
          d: roundedRectPath(effect.bounds, 1 + HALO.scale * phase),
          fill: "none",
          stroke: effect.color,
          strokeWidth: HALO.width,
          dashed: false,
          opacity: round(HALO.opacity * (1 - phase)),
        },
      ];
    }
    return [
      {
        kind: "polyline",
        points: effect.track!.map((p) => ({ x: round(p.x), y: round(p.y) })),
        stroke: effect.color,
        strokeWidth: effect.width + GLOW.extra,
        dashed: false,
        opacity: round(GLOW.opacity * (1 - phase)),
      },
    ];
  }
  if (effect.effect === "flow") {
    const r = particleRadius(effect.width);
    return flowParticles(effect, phase).map((at) => ({
      kind: "path",
      d: circlePath(at.x, at.y, r),
      fill: effect.color,
      stroke: "none",
      strokeWidth: 0,
      dashed: false,
    }));
  }
  return [];
}

/** One effect of a plan at an instant: what it is, and where the frame at that instant draws it. */
export interface EffectState {
  /** The id of the group the effect runs on, and its role: the SVG's `data-id` and `data-role`. */
  readonly target: string;
  readonly role: MotionEffect["role"];
  readonly effect: MotionEffect["effect"];
  readonly durationMs: number;
  readonly delayMs: number;
  readonly repeat: number | "forever";
  readonly direction: "forward" | "reverse";
  /**
   * How far the effect is through its current cycle, 0 to 1; null before its delay and after its
   * last repeat, when the target is drawn without it.
   */
  readonly phase: number | null;
  /** The particles of a flow and the head of a trace; none for a dash, a pulse or outside the window. */
  readonly marks: readonly MotionMark[];
}

/** A plan at an instant. */
export interface MotionState {
  readonly atMs: number;
  /** One seamless loop of every effect (`motionLoop`), or null. */
  readonly loopMs: number | null;
  /** Every effect of the plan, in its order. */
  readonly effects: readonly EffectState[];
}

const share = (value: number): number => Math.round(value * 10000) / 10000;

/**
 * What `sceneAt` draws of each effect of the plan at `t` milliseconds, as numbers: the phase of
 * its cycle and the centres of its moving marks, computed by the functions the frame draws with
 * and rounded as the frame writes them. Pure, as `sceneAt` is.
 */
export function motionStateAt(plan: MotionPlan, t: number): MotionState {
  return {
    atMs: t,
    loopMs: motionLoop(plan),
    effects: plan.effects.map((effect) => {
      const phase = phaseAt(effect, t);
      let marks: MotionMark[] = [];
      if (phase !== null && effect.track) {
        if (effect.effect === "flow") marks = flowParticles(effect, phase);
        if (effect.effect === "trace") marks = [traceHead(effect, phase)];
      }
      return {
        target: effect.target,
        role: effect.role,
        effect: effect.effect,
        durationMs: effect.durationMs,
        delayMs: effect.delayMs,
        repeat: effect.repeat,
        direction: effect.reverse ? "reverse" : "forward",
        phase: phase === null ? null : share(phase),
        marks: marks.map((mark) => ({
          x: round(mark.x),
          y: round(mark.y),
          along: share(mark.along),
        })),
      };
    }),
  };
}

/**
 * The scene at `t` milliseconds: dashes moved along their lines and outlines, traces grown along
 * their relations, halos and glows, particles on their tracks. Targets outside their effect's
 * window are drawn as without effects. Pure: the same scene, plan and time give the same result.
 */
export function sceneAt(scene: Scene, plan: MotionPlan, t: number): Scene {
  const active = plan.effects
    .map((effect) => ({ effect, phase: phaseAt(effect, t) }))
    .filter((x): x is { effect: MotionEffect; phase: number } => x.phase !== null);
  if (active.length === 0) return scene;
  const dashes = new Map<string, { phase: number; reverse: boolean }>();
  const traces = new Map<string, SceneItem[]>();
  const particles = new Map<string, SceneItem[]>();
  for (const { effect, phase } of active) {
    const key = targetKey(effect.role, effect.target);
    if (effect.effect === "dash") dashes.set(key, { phase, reverse: effect.reverse });
    if (effect.effect === "trace") traces.set(key, traceAt(effect, phase));
    if (effect.effect === "flow") particles.set(key, overlayAt(effect, phase));
  }
  const items = withTargets(scene.items, (group) => {
    const key = targetKey(group.role, group.id);
    const dash = dashes.get(key);
    const trace = traces.get(key);
    const flow = particles.get(key);
    if (!dash && !trace && !flow) return null;
    let list: readonly SceneItem[] = group.items;
    const index = dash ? outlineIndex(list) : -1;
    if (dash && index >= 0) {
      const offset = round((dash.reverse ? 1 : -1) * DASH_PERIOD * dash.phase);
      list = list.map((item, i) =>
        i === index && item.kind !== "group" && item.kind !== "text" && item.kind !== "image"
          ? { ...item, dash: { array: DASH_PATTERN, offset } }
          : item,
      );
    }
    if (trace) list = beforeLabel(list, trace);
    // Particles ride the line under its label, which stays readable as they pass.
    if (flow) list = beforeLabel(list, flow);
    return list === group.items ? null : [...list];
  });
  // Halos and glows above the drawing.
  const overlays: SceneItem[] = [];
  for (const { effect, phase } of active)
    if (effect.effect === "pulse") overlays.push(...overlayAt(effect, phase));
  if (overlays.length > 0)
    items.push({ kind: "group", id: "motion", role: "motion", items: overlays });
  return { ...scene, items };
}
