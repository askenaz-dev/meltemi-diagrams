import type { IconGradient, Paint, ResolvedIcon } from "@meltemi/diagrams-assets";
import type { GroupItem, PathItem, SceneGradient } from "./scene.js";

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Turns resolved icons into scene groups. Each icon instance gets its own gradient ids, so two
 * icons with gradients of the same name never clash in one SVG.
 */
export class IconPainter {
  readonly gradients: SceneGradient[] = [];
  private count = 0;

  /**
   * The icon drawn in a square of `size` whose top-left corner is (x, y): its view box scaled by
   * the pack's optical scale and centred in the square. Monochrome paints take `color`.
   */
  draw(icon: ResolvedIcon, x: number, y: number, size: number, color: string): GroupItem {
    const instance = ++this.count;
    const { viewBox } = icon.geometry;
    const drawn = size * icon.scale;
    const scale = drawn / Math.max(viewBox.width, viewBox.height);
    const tx = x + (size - viewBox.width * scale) / 2 - viewBox.x * scale;
    const ty = y + (size - viewBox.height * scale) / 2 - viewBox.y * scale;
    const ids = new Map<string, string>();
    for (const gradient of icon.geometry.gradients) {
      const id = `icon-${instance}-${gradient.id}`;
      ids.set(gradient.id, id);
      this.gradients.push(sceneGradient(gradient, id));
    }
    const paint = (value: Paint): string => {
      switch (value.kind) {
        case "none":
          return "none";
        case "current":
          return color;
        case "color":
          return value.value;
        case "gradient":
          return `url(#${ids.get(value.id) ?? value.id})`;
      }
    };
    const items: PathItem[] = icon.geometry.paths.map((path) => ({
      kind: "path",
      d: path.d,
      fill: paint(path.fill),
      stroke: paint(path.stroke),
      strokeWidth: path.stroke.kind === "none" ? 0 : path.strokeWidth,
      dashed: false,
      ...(path.lineCap === "round" || path.lineJoin === "round" ? { rounded: true } : {}),
      ...(path.transform ? { transform: path.transform } : {}),
      ...(path.opacity < 1 ? { opacity: path.opacity } : {}),
      ...(path.fillOpacity < 1 ? { fillOpacity: path.fillOpacity } : {}),
      ...(path.strokeOpacity < 1 ? { strokeOpacity: path.strokeOpacity } : {}),
      ...(path.fillRule === "evenodd" ? { fillRule: "evenodd" as const } : {}),
    }));
    return {
      kind: "group",
      id: icon.reference,
      role: "icon",
      transform: `translate(${round(tx)} ${round(ty)}) scale(${round(scale)})`,
      items,
    };
  }
}

function sceneGradient(gradient: IconGradient, id: string): SceneGradient {
  const common = {
    id,
    units: gradient.units,
    ...(gradient.transform ? { transform: gradient.transform } : {}),
    ...(gradient.spread !== "pad" ? { spread: gradient.spread } : {}),
    stops: gradient.stops.map((stop) => ({
      offset: stop.offset,
      color: stop.color,
      ...(stop.opacity < 1 ? { opacity: stop.opacity } : {}),
    })),
  };
  const c = gradient.coordinates;
  if (gradient.kind === "linear") {
    return {
      kind: "linear",
      ...common,
      x1: c.x1 ?? "0%",
      y1: c.y1 ?? "0%",
      x2: c.x2 ?? "100%",
      y2: c.y2 ?? "0%",
    };
  }
  return {
    kind: "radial",
    ...common,
    ...(c.cx !== undefined ? { cx: c.cx } : {}),
    ...(c.cy !== undefined ? { cy: c.cy } : {}),
    ...(c.r !== undefined ? { r: c.r } : {}),
    ...(c.fx !== undefined ? { fx: c.fx } : {}),
    ...(c.fy !== undefined ? { fy: c.fy } : {}),
  };
}
