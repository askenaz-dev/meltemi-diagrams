import type { GroupItem, Scene, SceneBounds, SceneItem, Theme } from "@meltemi/diagrams-layout";
import {
  ANIMATION_DEFAULT_DURATIONS,
  ANIMATION_EFFECTS,
  THEME_DURATION_TOKENS,
  type AnimationEffect,
  type FlowDiagram,
  type Point,
} from "@meltemi/diagrams-model";

/** Durations an effect takes when its statement writes none, in milliseconds. */
export const DEFAULT_DURATIONS: Readonly<Record<AnimationEffect, number>> =
  ANIMATION_DEFAULT_DURATIONS;

/** The dash of the moving dash: 8 px drawn, 6 px gap. */
export const DASH_PATTERN: readonly [number, number] = [8, 6];
export const DASH_PERIOD = DASH_PATTERN[0] + DASH_PATTERN[1];
/** Halo growth and opacity of a pulse on a box, and of the glow of a relation. */
export const HALO = { scale: 0.15, opacity: 0.7, width: 2 } as const;
export const GLOW = { extra: 6, opacity: 0.5 } as const;
/**
 * A trace grows along its relation during the first `fill` of each cycle and fades out in the
 * rest; its line is `extra` wider than the relation's and its head dot `dot` more than that width.
 */
export const TRACE = { fill: 0.8, extra: 2, dot: 3 } as const;

/** One effect resolved against the drawn scene, with every default applied. */
export interface MotionEffect {
  /** Position in the plan; it names the effect's CSS classes. */
  readonly index: number;
  readonly target: string;
  readonly role: "relation" | "element" | "event";
  readonly effect: AnimationEffect;
  readonly durationMs: number;
  readonly repeat: number | "forever";
  readonly delayMs: number;
  readonly reverse: boolean;
  readonly particles: number;
  /** The particle, halo or glow colour. */
  readonly color: string;
  /** Relations: the drawn line in scene coordinates. */
  readonly track: readonly Point[] | null;
  /** Elements and events: the drawn box. */
  readonly bounds: SceneBounds | null;
  /** The stroke width of the target's line or outline. */
  readonly width: number;
}

export interface MotionPlan {
  readonly effects: readonly MotionEffect[];
}

export interface PlanOptions {
  /** The theme's colours by token name, to resolve `color accent` and the like. */
  readonly colors?: Readonly<Record<string, unknown>>;
  /** Default durations of the theme, which effects without a `duration` take before the constants. */
  readonly durations?: Readonly<Partial<Record<AnimationEffect, number>>>;
}

/** The default duration of each effect that a theme writes (`flowDuration` and the others). */
export function themeDurations(theme: Theme | undefined): Partial<Record<AnimationEffect, number>> {
  const durations: Partial<Record<AnimationEffect, number>> = {};
  if (!theme) return durations;
  for (const effect of ANIMATION_EFFECTS) {
    const value = theme[THEME_DURATION_TOKENS[effect]];
    if (typeof value === "number") durations[effect] = value;
  }
  return durations;
}

/** The plan options of a laid-out diagram: its theme's colours and default durations. */
export function motionOptions(theme: Theme | undefined): PlanOptions {
  return {
    colors: theme as unknown as Readonly<Record<string, unknown>> | undefined,
    durations: themeDurations(theme),
  };
}

/** Every group of a scene with an identity, depth first. */
export function sceneGroups(items: readonly SceneItem[], out: GroupItem[] = []): GroupItem[] {
  for (const item of items) {
    if (item.kind !== "group") continue;
    out.push(item);
    sceneGroups(item.items, out);
  }
  return out;
}

/** The first line or outline drawn in a group: its stroke and width. */
function strokeOf(group: GroupItem): { stroke: string; width: number } | null {
  for (const item of group.items) {
    if (
      (item.kind === "rect" || item.kind === "path" || item.kind === "polyline") &&
      item.stroke !== "none"
    ) {
      return { stroke: item.stroke, width: item.strokeWidth };
    }
  }
  return null;
}

/**
 * The effects of a diagram whose targets are drawn in the scene. Effects without an `effect`, and
 * targets the scene does not draw (another scenario, a hidden entity), are left out.
 */
export function planMotion(
  diagram: FlowDiagram,
  scene: Scene,
  options: PlanOptions = {},
): MotionPlan {
  const groups = sceneGroups(scene.items);
  const find = (role: string, id: string) => groups.find((g) => g.role === role && g.id === id);
  const effects: MotionEffect[] = [];
  for (const entry of diagram.animations) {
    if (entry.effect === null) continue;
    const role = entry.targetKind;
    const group = find(role, entry.target);
    if (!group) continue;
    const track = role === "relation" ? (group.track ?? null) : null;
    const bounds = role !== "relation" ? (group.bounds ?? null) : null;
    if (role === "relation" ? !track || track.length < 2 : !bounds) continue;
    const drawn = strokeOf(group);
    const accent = typeof options.colors?.accent === "string" ? options.colors.accent : "#1f6feb";
    // Particles, halos and traces in the target's own colour would not show on it: they take the
    // accent, as stories do. A moving dash animates the line itself, in its own colour.
    let color = entry.effect === "dash" && drawn && drawn.stroke !== "none" ? drawn.stroke : accent;
    if (entry.color !== null) {
      if (entry.color.startsWith("@")) {
        const token = options.colors?.[entry.color.slice(1)];
        if (typeof token === "string") color = token;
      } else color = entry.color;
    }
    effects.push({
      index: effects.length,
      target: entry.target,
      role,
      effect: entry.effect,
      durationMs:
        entry.durationMs ?? options.durations?.[entry.effect] ?? DEFAULT_DURATIONS[entry.effect],
      repeat: entry.repeat ?? "forever",
      delayMs: entry.delayMs ?? 0,
      reverse: entry.direction === "reverse",
      particles: entry.particles ?? 1,
      color,
      track,
      bounds,
      width: drawn?.width ?? 1.5,
    });
  }
  return { effects };
}

/** The finite length of the plan in milliseconds, or `null` when an effect repeats forever. */
export function motionDuration(plan: MotionPlan): number | null {
  let end = 0;
  for (const e of plan.effects) {
    if (e.repeat === "forever") return null;
    end = Math.max(end, e.delayMs + e.repeat * e.durationMs);
  }
  return end;
}

/** The longest a default duration lasts when the cycles' common multiple is longer. */
export const DEFAULT_DURATION_CAP_MS = 10_000;
/** How long a video of a diagram without moving effects lasts. */
export const STILL_DURATION_MS = 1000;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * How long a video of the plan lasts when nothing says: the least common multiple of the effects'
 * cycles after the longest delay, so the loop is seamless, rounded to whole milliseconds; the
 * longest cycle after that delay when the multiple would pass `DEFAULT_DURATION_CAP_MS`; and
 * `STILL_DURATION_MS` for a plan without effects. With the engine's defaults (flow 1200 ms, dash
 * and pulse 1000 ms, trace 1500 ms) any mix lasts 6 s.
 */
export function defaultMotionDuration(plan: MotionPlan): number {
  if (plan.effects.length === 0) return STILL_DURATION_MS;
  return motionLoop(plan) ?? longestCycle(plan);
}

/**
 * The length of one seamless loop of every effect of the plan, after the longest delay: the least
 * common multiple of the cycles, or null when it passes `DEFAULT_DURATION_CAP_MS` or the plan has
 * no effects.
 */
export function motionLoop(plan: MotionPlan): number | null {
  if (plan.effects.length === 0) return null;
  const delay = longestDelay(plan);
  let multiple = 1;
  for (const effect of plan.effects) {
    const cycle = Math.max(1, Math.round(effect.durationMs));
    multiple = (multiple / gcd(multiple, cycle)) * cycle;
    if (multiple + delay > DEFAULT_DURATION_CAP_MS) return null;
  }
  return multiple + delay;
}

const longestDelay = (plan: MotionPlan) =>
  Math.round(Math.max(...plan.effects.map((e) => e.delayMs)));

/** The longest cycle of the plan after its longest delay. */
const longestCycle = (plan: MotionPlan) =>
  Math.max(...plan.effects.map((e) => Math.max(1, Math.round(e.durationMs)))) + longestDelay(plan);

/** The phase of an effect at `t` in [0, 1), or `null` outside its window. */
export function phaseAt(effect: MotionEffect, t: number): number | null {
  const local = t - effect.delayMs;
  if (local < 0) return null;
  const cycle = Math.floor(local / effect.durationMs);
  if (effect.repeat !== "forever" && cycle >= effect.repeat) return null;
  return (local - cycle * effect.durationMs) / effect.durationMs;
}
