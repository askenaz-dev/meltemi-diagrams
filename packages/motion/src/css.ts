import type { Scene, SceneItem } from "@meltemi/diagrams-layout";
import {
  circlePath,
  particleRadius,
  round,
  roundedRectPath,
  trackLength,
  trackPath,
} from "./geometry.js";
import { beforeLabel, outlineIndex, targetKey, traceTrack, withTargets } from "./frames.js";
import {
  DASH_PATTERN,
  DASH_PERIOD,
  GLOW,
  HALO,
  TRACE,
  type MotionEffect,
  type MotionPlan,
} from "./plan.js";

/** The class every animated element carries, so reduced motion can stop them all. */
export const MOTION_CLASS = "mdg-m";

const percent = (value: number) => `${round(value * 100)}%`;

/** `animation` of an effect: one keyframe set, linear, its delay and repeat, no fill mode. */
function animation(name: string, effect: MotionEffect): string {
  const count = effect.repeat === "forever" ? "infinite" : String(effect.repeat);
  return `animation: ${name} ${effect.durationMs}ms linear ${effect.delayMs}ms ${count} normal none;`;
}

/**
 * Keyframes of particle `i` of `k`: it starts at `i/k` of the track, reaches the end, jumps to the
 * start and comes back to `i/k`, so every particle shares the effect's delay.
 */
function particleKeyframes(name: string, k: number, i: number, reverse: boolean): string {
  const at = (d: number) => `offset-distance: ${percent(reverse ? 1 - d : d)}; opacity: 1;`;
  const s = i / k;
  if (i === 0) return `@keyframes ${name} { 0% { ${at(0)} } 100% { ${at(1)} } }`;
  const turn = 1 - s;
  return [
    `@keyframes ${name} {`,
    `  0% { ${at(s)} }`,
    `  ${percent(turn)} { ${at(1)} }`,
    `  ${round(turn * 100) + 0.001}% { ${at(0)} }`,
    `  100% { ${at(s)} }`,
    "}",
  ].join("\n");
}

/**
 * Keyframes of a trace's line: one dash as long as the track, offset from the whole length to
 * nothing while it grows, then the lit line fades. Per effect, since lengths differ.
 */
function traceKeyframes(name: string, length: number): string {
  const L = round(length);
  const at = (offset: number, opacity: number) =>
    `stroke-dasharray: ${L} ${L}; stroke-dashoffset: ${round(offset)}; opacity: ${opacity};`;
  return [
    `@keyframes ${name} {`,
    `  0% { ${at(L, 1)} }`,
    `  ${percent(TRACE.fill)} { ${at(0, 1)} }`,
    `  100% { ${at(0, 0)} }`,
    "}",
  ].join("\n");
}

/** Keyframes of a trace's head dot, which rides the track while the line grows, then fades. */
const TRACE_DOT_KEYFRAMES = [
  "@keyframes mdg-trace-dot {",
  "  0% { offset-distance: 0%; opacity: 1; }",
  `  ${percent(TRACE.fill)} { offset-distance: 100%; opacity: 1; }`,
  "  100% { offset-distance: 100%; opacity: 0; }",
  "}",
].join("\n");

/**
 * The scene with the animated SVG profile: a CSS style sheet and classes on the targets and on
 * overlays that are invisible outside their animations, so the drawing without effects is what
 * shows before a delay, after the last cycle, with reduced motion and where CSS animation is not
 * supported. CSS only: opacity, motion paths, dash offsets and scale, all linear.
 */
export function animatedScene(scene: Scene, plan: MotionPlan): Scene {
  if (plan.effects.length === 0) return scene;
  const rules: string[] = [];
  const keyframes = new Map<string, string>();
  const particleRules: string[] = [];
  const dashes = new Map<string, MotionEffect>();
  const overlays: SceneItem[] = [];
  const halos: SceneItem[] = [];
  const traces = new Map<string, SceneItem[]>();

  for (const effect of plan.effects) {
    const own = `mdg-e${effect.index}`;
    if (effect.effect === "trace") {
      // The line and its dot go into the relation's group, under its label, as in frames.
      const points = traceTrack(effect);
      const name = `mdg-trace-${effect.index}`;
      keyframes.set(name, traceKeyframes(name, trackLength(points)));
      keyframes.set("mdg-trace-dot", TRACE_DOT_KEYFRAMES);
      rules.push(`.${own} { ${animation(name, effect)} }`);
      particleRules.push(
        `.${own}-dot { offset-path: path("${trackPath(points)}"); offset-rotate: 0deg; ${animation("mdg-trace-dot", effect)} }`,
      );
      traces.set(targetKey(effect.role, effect.target), [
        {
          kind: "polyline",
          points,
          stroke: effect.color,
          strokeWidth: round(effect.width + TRACE.extra),
          dashed: false,
          opacity: 0,
          className: `${MOTION_CLASS} ${own}`,
        },
        {
          kind: "path",
          d: circlePath(0, 0, effect.width + TRACE.dot),
          fill: effect.color,
          stroke: "none",
          strokeWidth: 0,
          dashed: false,
          opacity: 0,
          className: `${MOTION_CLASS} ${own}-dot`,
        },
      ]);
      continue;
    }
    if (effect.effect === "dash") {
      dashes.set(targetKey(effect.role, effect.target), effect);
      const name = effect.reverse ? "mdg-dash-reverse" : "mdg-dash";
      keyframes.set(
        name,
        `@keyframes ${name} { from { stroke-dasharray: ${DASH_PATTERN.join(" ")}; stroke-dashoffset: 0; } to { stroke-dasharray: ${DASH_PATTERN.join(" ")}; stroke-dashoffset: ${effect.reverse ? DASH_PERIOD : -DASH_PERIOD}; } }`,
      );
      rules.push(`.${own} { ${animation(name, effect)} }`);
      continue;
    }
    if (effect.effect === "pulse") {
      if (effect.bounds) {
        keyframes.set(
          "mdg-halo",
          `@keyframes mdg-halo { from { opacity: ${HALO.opacity}; transform: scale(1); } to { opacity: 0; transform: scale(${1 + HALO.scale}); } }`,
        );
        rules.push(
          `.${own} { transform-box: fill-box; transform-origin: center; ${animation("mdg-halo", effect)} }`,
        );
        halos.push({
          kind: "path",
          d: roundedRectPath(effect.bounds),
          fill: "none",
          stroke: effect.color,
          strokeWidth: HALO.width,
          dashed: false,
          opacity: 0,
          className: `${MOTION_CLASS} ${own}`,
        });
      } else {
        keyframes.set(
          "mdg-glow",
          `@keyframes mdg-glow { from { opacity: ${GLOW.opacity}; } to { opacity: 0; } }`,
        );
        rules.push(`.${own} { ${animation("mdg-glow", effect)} }`);
        halos.push({
          kind: "polyline",
          points: effect.track!.map((p) => ({ x: round(p.x), y: round(p.y) })),
          stroke: effect.color,
          strokeWidth: effect.width + GLOW.extra,
          dashed: false,
          opacity: 0,
          className: `${MOTION_CLASS} ${own}`,
        });
      }
      continue;
    }
    // Flow: one particle per class, moved along the track by a motion path.
    const path = trackPath(effect.track!);
    const r = particleRadius(effect.width);
    for (let i = 0; i < effect.particles; i++) {
      // The first particle's keyframes do not depend on how many particles there are.
      const name = `mdg-flow${effect.reverse ? "-reverse" : ""}${i === 0 ? "" : `-${effect.particles}-${i}`}`;
      keyframes.set(name, particleKeyframes(name, effect.particles, i, effect.reverse));
      const particle = `${own}-${i}`;
      particleRules.push(
        `.${particle} { offset-path: path("${path}"); offset-rotate: 0deg; ${animation(name, effect)} }`,
      );
      overlays.push({
        kind: "path",
        d: circlePath(0, 0, r),
        fill: effect.color,
        stroke: "none",
        strokeWidth: 0,
        dashed: false,
        opacity: 0,
        className: `${MOTION_CLASS} ${particle}`,
      });
    }
  }

  const items = withTargets(scene.items, (group) => {
    const key = targetKey(group.role, group.id);
    const effect = dashes.get(key);
    const trace = traces.get(key);
    if (!effect && !trace) return null;
    let list: readonly SceneItem[] = group.items;
    const index = effect ? outlineIndex(list) : -1;
    if (effect && index >= 0) {
      list = list.map((item, i) =>
        i === index && item.kind !== "group" && item.kind !== "text" && item.kind !== "image"
          ? { ...item, className: `${MOTION_CLASS} mdg-e${effect.index}` }
          : item,
      );
    }
    if (trace) list = beforeLabel(list, trace);
    return list === group.items ? null : [...list];
  });
  const motion = [...halos, ...overlays];
  if (motion.length > 0) items.push({ kind: "group", id: "motion", role: "motion", items: motion });

  const sheet = [
    ...[...keyframes.keys()].sort().map((k) => keyframes.get(k)!),
    ...rules,
    // Motion paths are newer than the rest; without them particles and trace dots stay invisible.
    ...(particleRules.length > 0
      ? [`@supports (offset-path: path("M0 0")) {`, ...particleRules.map((r) => `  ${r}`), "}"]
      : []),
    // Overlays never take pointer events, so a canvas can still be clicked through them.
    `[data-role="motion"] { pointer-events: none; }`,
    `@media (prefers-reduced-motion: reduce) { .${MOTION_CLASS} { animation: none !important; } }`,
  ];
  return { ...scene, items, styleSheet: sheet.join("\n") };
}
