// Pure viewport math shared by the canvas and the HTML player: zoom, pan, fit, reveal and the
// minimap. Nothing here imports anything, so every runtime can bundle it.

/** A point in diagram or screen coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A box by its top-left corner and size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Pan in screen pixels and zoom factor: screen = pan + zoom × (diagram + offset). */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The smallest and largest zoom a viewer allows. */
export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const ZOOM_PRESETS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];
/** Margin around fitted content, in screen pixels. */
export const FIT_MARGIN = 24;

const LIMITS: ZoomLimits = { min: ZOOM_MIN, max: ZOOM_MAX };

export const center = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

export function boxFromCenter(point: Point, size: Size): Box {
  return { x: point.x - size.width / 2, y: point.y - size.height / 2, ...size };
}

export function unionBox(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

export const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** A zoom kept inside the limits (the canvas's 0.1 to 8 by default). */
export const clampZoom = (zoom: number, limits: ZoomLimits = LIMITS): number =>
  Math.min(limits.max, Math.max(limits.min, zoom));

/** Screen position of a diagram point. */
export function toScreen(viewport: Viewport, offset: Point, point: Point): Point {
  return {
    x: viewport.x + viewport.zoom * (point.x + offset.x),
    y: viewport.y + viewport.zoom * (point.y + offset.y),
  };
}

/** Diagram position of a screen point. */
export function toDiagram(viewport: Viewport, offset: Point, screen: Point): Point {
  return {
    x: (screen.x - viewport.x) / viewport.zoom - offset.x,
    y: (screen.y - viewport.y) / viewport.zoom - offset.y,
  };
}

/** Zooms to `zoom`, keeping the content under `screen` in place. */
export function zoomAt(
  viewport: Viewport,
  zoom: number,
  screen: Point,
  limits: ZoomLimits = LIMITS,
): Viewport {
  const next = clampZoom(zoom, limits);
  const sceneX = (screen.x - viewport.x) / viewport.zoom;
  const sceneY = (screen.y - viewport.y) / viewport.zoom;
  return { x: screen.x - next * sceneX, y: screen.y - next * sceneY, zoom: next };
}

/** The next preset zoom in (`1`) or out (`-1`) of the current one, around `screen`. */
export function zoomStep(
  viewport: Viewport,
  direction: 1 | -1,
  screen: Point,
  limits: ZoomLimits = LIMITS,
): Viewport {
  const current = viewport.zoom;
  const next =
    direction > 0
      ? (ZOOM_PRESETS.find((z) => z > current + 1e-9) ?? limits.max)
      : ([...ZOOM_PRESETS].reverse().find((z) => z < current - 1e-9) ?? limits.min);
  return zoomAt(viewport, next, screen, limits);
}

/** How a fit is computed: the screen margin, and the zoom it never goes above or below. */
export interface FitOptions {
  /** Margin around the fitted box, in screen pixels; `FIT_MARGIN` by default. */
  readonly margin?: number;
  /** The largest zoom of a fit; 1 by default, so a fit never enlarges. */
  readonly maxZoom?: number;
  /** The smallest zoom of a fit; `ZOOM_MIN` by default. */
  readonly minZoom?: number;
}

/**
 * The viewport that fits a box of scene coordinates in the screen with a margin, centred, and
 * never above `maxZoom`.
 */
export function fitBox(scene: Box, screen: Size, options: FitOptions = {}): Viewport {
  const margin = options.margin ?? FIT_MARGIN;
  const width = Math.max(1, screen.width - 2 * margin);
  const height = Math.max(1, screen.height - 2 * margin);
  const zoom = clampZoom(
    Math.min(
      options.maxZoom ?? 1,
      width / Math.max(1, scene.width),
      height / Math.max(1, scene.height),
    ),
    { min: options.minZoom ?? ZOOM_MIN, max: Math.max(ZOOM_MAX, options.maxZoom ?? 1) },
  );
  return {
    x: screen.width / 2 - zoom * (scene.x + scene.width / 2),
    y: screen.height / 2 - zoom * (scene.y + scene.height / 2),
    zoom,
  };
}

/** Fits the whole scene. */
export function fitViewport(content: Size, screen: Size, options: FitOptions = {}): Viewport {
  return fitBox({ x: 0, y: 0, ...content }, screen, options);
}

/** Fits boxes given in diagram coordinates. */
export function fitSelection(
  boxes: readonly Box[],
  offset: Point,
  screen: Size,
  options: FitOptions = {},
): Viewport | undefined {
  const union = unionBox(boxes);
  if (!union) return undefined;
  return fitBox({ ...union, x: union.x + offset.x, y: union.y + offset.y }, screen, options);
}

/**
 * The pan a scroll container would allow: on an axis where the zoomed content is smaller than
 * the screen it is centred; on an axis where it is larger no gap shows at either edge.
 */
export function clampPan(viewport: Viewport, content: Size, screen: Size): Viewport {
  const axis = (pan: number, length: number, room: number): number => {
    const size = length * viewport.zoom;
    if (size <= room) return (room - size) / 2;
    return Math.min(0, Math.max(room - size, pan));
  };
  return {
    x: axis(viewport.x, content.width, screen.width),
    y: axis(viewport.y, content.height, screen.height),
    zoom: viewport.zoom,
  };
}

/** Whether a pan by (dx, dy) screen pixels would move the content at all under `clampPan`. */
export function canPan(
  viewport: Viewport,
  content: Size,
  screen: Size,
  dx: number,
  dy: number,
): boolean {
  const moved = clampPan(
    { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom },
    content,
    screen,
  );
  const from = clampPan(viewport, content, screen);
  return Math.abs(moved.x - from.x) > 1e-6 || Math.abs(moved.y - from.y) > 1e-6;
}

/**
 * Where an SVG element of `size` draws a `viewBox` under the default `xMidYMid meet`: an element
 * pixel is `x + scale × scene` (and `y + scale × scene`).
 */
export function viewBoxPlacement(
  size: Size,
  viewBox: Box,
): { readonly scale: number; readonly x: number; readonly y: number } {
  const scale = Math.min(
    size.width / Math.max(1e-9, viewBox.width),
    size.height / Math.max(1e-9, viewBox.height),
  );
  return {
    scale,
    x: (size.width - viewBox.width * scale) / 2 - viewBox.x * scale,
    y: (size.height - viewBox.height * scale) / 2 - viewBox.y * scale,
  };
}

/** Keeps unchanged boxes still on screen when a render moves the diagram's offset. */
export function keepOrigin(viewport: Viewport, oldOffset: Point, newOffset: Point): Viewport {
  return {
    x: viewport.x + viewport.zoom * (oldOffset.x - newOffset.x),
    y: viewport.y + viewport.zoom * (oldOffset.y - newOffset.y),
    zoom: viewport.zoom,
  };
}

/** Scrolls the viewport so that `box` (diagram coordinates) is visible with a margin. */
export function revealBox(
  viewport: Viewport,
  offset: Point,
  box: Box,
  screen: Size,
  margin = FIT_MARGIN,
): Viewport {
  const topLeft = toScreen(viewport, offset, box);
  const bottomRight = toScreen(viewport, offset, { x: box.x + box.width, y: box.y + box.height });
  let { x, y } = viewport;
  if (topLeft.x < margin) x += margin - topLeft.x;
  else if (bottomRight.x > screen.width - margin) x -= bottomRight.x - (screen.width - margin);
  if (topLeft.y < margin) y += margin - topLeft.y;
  else if (bottomRight.y > screen.height - margin) {
    y -= bottomRight.y - (screen.height - margin);
  }
  return { x, y, zoom: viewport.zoom };
}

/** The minimap: the scene scaled into `box`, and the visible area as a rectangle in it. */
export interface Minimap {
  readonly scale: number;
  /** Where the scene starts inside the minimap box. */
  readonly origin: Point;
  /** The visible part of the scene, in minimap pixels. */
  readonly frame: Box;
}

export const MINIMAP_SIZE: Size = { width: 200, height: 140 };

export function minimapViewport(
  content: Size,
  viewport: Viewport,
  screen: Size,
  box: Size = MINIMAP_SIZE,
): Minimap {
  const scale = Math.min(
    box.width / Math.max(1, content.width),
    box.height / Math.max(1, content.height),
  );
  const origin = {
    x: (box.width - content.width * scale) / 2,
    y: (box.height - content.height * scale) / 2,
  };
  // The visible area in scene coordinates.
  const left = -viewport.x / viewport.zoom;
  const top = -viewport.y / viewport.zoom;
  return {
    scale,
    origin,
    frame: {
      x: origin.x + left * scale,
      y: origin.y + top * scale,
      width: (screen.width / viewport.zoom) * scale,
      height: (screen.height / viewport.zoom) * scale,
    },
  };
}

/** The pan that centres the visible area on a point of the minimap. */
export function minimapToViewport(
  map: Minimap,
  point: Point,
  viewport: Viewport,
  screen: Size,
): Viewport {
  const sceneX = (point.x - map.origin.x) / map.scale;
  const sceneY = (point.y - map.origin.y) / map.scale;
  return {
    x: screen.width / 2 - viewport.zoom * sceneX,
    y: screen.height / 2 - viewport.zoom * sceneY,
    zoom: viewport.zoom,
  };
}
