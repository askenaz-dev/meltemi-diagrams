import type { DrillSpec } from "@meltemi/diagrams-motion";

/**
 * A cubic Bézier easing curve from (0, 0) to (1, 1) with control points (x1, y1) and (x2, y2),
 * like CSS `cubic-bezier()`: progress in, eased progress out.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  const slope = (a: number, b: number, t: number) =>
    3 * a * (1 - t) * (1 - t) + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    // Newton's method for the curve's parameter at x = p, then bisection if it stalls.
    let t = p;
    for (let i = 0; i < 8; i++) {
      const error = at(x1, x2, t) - p;
      if (Math.abs(error) < 1e-6) return at(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let low = 0;
    let high = 1;
    t = p;
    for (let i = 0; i < 30; i++) {
      const x = at(x1, x2, t);
      if (Math.abs(x - p) < 1e-6) break;
      if (x < p) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return at(y1, y2, t);
  };
}

/** The ease of the viewer's transitions: the canvas's `--mdg-ease`. */
export const ease = cubicBezier(0.2, 0.7, 0.3, 1);

/**
 * The drill-down time to draw at a moment of its clock: each phase (the camera, then the change of
 * view) eased on its own, so the frames themselves stay linear and the move feels like the rest.
 */
export function easedDrillTime(spec: DrillSpec, elapsed: number): number {
  const camera = spec.cameraMs;
  const change = spec.transitionMs;
  if (elapsed <= 0) return 0;
  if (elapsed >= camera + change) return camera + change;
  if (elapsed < camera) return camera * ease(elapsed / camera);
  return camera + change * ease((elapsed - camera) / Math.max(1e-9, change));
}
