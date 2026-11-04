import {
  ZOOM_MAX,
  ZOOM_MIN,
  canPan,
  clampPan,
  fitViewport,
  revealBox,
  zoomAt,
  zoomStep,
  type Box,
  type Point,
  type Size,
  type Viewport,
  type ZoomLimits,
} from "@meltemi/diagrams-layout/viewport";

/** A wheel delta of one pixel zooms by `exp(-WHEEL_ZOOM)`: the canvas's constant. */
export const WHEEL_ZOOM = 0.002;
/** A press that moves less than this, in screen pixels, is a click. */
export const DRAG_THRESHOLD = 3;
/** Shift and an arrow pan this fraction of the stage. */
export const PAN_FRACTION = 1 / 8;
/** Pixels of one wheel line, when the wheel counts in lines. */
export const LINE_DELTA = 16;

export type ViewerCommand =
  "zoomIn" | "zoomOut" | "zoomFit" | "zoomActual" | "panLeft" | "panRight" | "panUp" | "panDown";

/** The viewer command of a key: `+`/`=` in, `-` out, `0` fit, `1` actual size, Shift+arrows pan. */
export function viewerCommandForKey(key: string, shift: boolean): ViewerCommand | undefined {
  switch (key) {
    case "+":
    case "=":
      return "zoomIn";
    case "-":
      return "zoomOut";
    case "0":
      return "zoomFit";
    case "1":
      return "zoomActual";
    case "ArrowLeft":
      return shift ? "panLeft" : undefined;
    case "ArrowRight":
      return shift ? "panRight" : undefined;
    case "ArrowUp":
      return shift ? "panUp" : undefined;
    case "ArrowDown":
      return shift ? "panDown" : undefined;
    default:
      return undefined;
  }
}

const same = (a: Viewport, b: Viewport) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.zoom - b.zoom) < 1e-6;

/**
 * The viewer's zoom and pan over a drawing, without a page: the content is the drawing at actual
 * size (one scene unit per CSS pixel) and the stage the window that shows it. The viewport is
 * always clamped like a scroll container, fits never enlarge, and the drawing's own frame is
 * never touched: the runtime applies the viewport as a CSS transform.
 */
export class ViewerViewport {
  content: Size;
  stage: Size;
  viewport: Viewport;
  /** True until someone zooms or pans: a resize then refits. */
  fitted = true;

  constructor(content: Size, stage: Size = content) {
    this.content = content;
    this.stage = stage;
    this.viewport = this.fitted ? this.fitView() : { x: 0, y: 0, zoom: 1 };
  }

  private fitView(): Viewport {
    return fitViewport(this.content, this.stage, { margin: 0, maxZoom: 1, minZoom: 0.001 });
  }

  /** The zoom of a fit: the whole drawing, never above 100 %. */
  get fitZoom(): number {
    return this.fitView().zoom;
  }

  /** 0.1 to 8, the lower end lowered to the fit when that is smaller. */
  get limits(): ZoomLimits {
    return { min: Math.min(ZOOM_MIN, this.fitZoom), max: ZOOM_MAX };
  }

  get zoom(): number {
    return this.viewport.zoom;
  }

  /** The zoom as a whole percentage. */
  get percent(): number {
    return Math.round(this.viewport.zoom * 100);
  }

  /** Whether the drawing overflows the stage in some direction, so that it can be panned. */
  get pannable(): boolean {
    const zoom = this.viewport.zoom;
    return (
      this.content.width * zoom > this.stage.width + 0.5 ||
      this.content.height * zoom > this.stage.height + 0.5
    );
  }

  /** Whether the viewport is the fit of the stage. */
  get atFit(): boolean {
    return same(this.viewport, this.fitView());
  }

  get atMin(): boolean {
    return this.viewport.zoom <= this.limits.min + 1e-9;
  }

  get atMax(): boolean {
    return this.viewport.zoom >= this.limits.max - 1e-9;
  }

  private centre(): Point {
    return { x: this.stage.width / 2, y: this.stage.height / 2 };
  }

  private set(viewport: Viewport, fitted = false): void {
    this.viewport = clampPan(viewport, this.content, this.stage);
    this.fitted = fitted;
  }

  /** A new stage size: refits while fitted, else keeps the zoom and the point at the centre. */
  resize(stage: Size): void {
    if (stage.width <= 0 || stage.height <= 0) return;
    if (this.fitted) {
      this.stage = stage;
      this.viewport = this.fitView();
      return;
    }
    const centre = this.toContent(this.centre());
    this.stage = stage;
    const zoom = Math.max(this.limits.min, this.viewport.zoom);
    this.set({ x: stage.width / 2 - centre.x * zoom, y: stage.height / 2 - centre.y * zoom, zoom });
  }

  /** A new drawing (another view): refits while fitted, else keeps the zoom and clamps. */
  setContent(content: Size): void {
    this.content = content;
    if (this.fitted) this.viewport = this.fitView();
    else this.set(this.viewport);
  }

  /** The whole drawing, at most at actual size. */
  fit(): void {
    this.viewport = this.fitView();
    this.fitted = true;
  }

  /** Actual size around a stage point, the centre by default. */
  actualSize(at: Point = this.centre()): void {
    this.setZoom(1, at);
  }

  setZoom(zoom: number, at: Point = this.centre()): void {
    this.set(zoomAt(this.viewport, zoom, at, this.limits));
  }

  /** Multiplies the zoom around a stage point (the wheel and a pinch). */
  zoomBy(factor: number, at: Point): void {
    this.setZoom(this.viewport.zoom * factor, at);
  }

  /** The next preset zoom, around a stage point or the centre. */
  zoomIn(at: Point = this.centre()): void {
    this.set(zoomStep(this.viewport, 1, at, this.limits));
  }

  zoomOut(at: Point = this.centre()): void {
    this.set(zoomStep(this.viewport, -1, at, this.limits));
  }

  /** Moves the drawing by screen pixels, clamped. */
  panBy(dx: number, dy: number): void {
    this.set({ ...this.viewport, x: this.viewport.x + dx, y: this.viewport.y + dy });
  }

  /** Whether moving the drawing by (dx, dy) would move it at all. */
  canPan(dx: number, dy: number): boolean {
    return canPan(this.viewport, this.content, this.stage, dx, dy);
  }

  /** Pans just enough to show a box of the content inside the stage with a margin. */
  reveal(box: Box, margin = 16): void {
    const next = revealBox(this.viewport, { x: 0, y: 0 }, box, this.stage, margin);
    if (!same(next, this.viewport)) this.set(next);
  }

  /** Runs a key's or a button's command; zooms go around `at` or the centre. */
  run(command: ViewerCommand, at?: Point): void {
    const step = { x: this.stage.width * PAN_FRACTION, y: this.stage.height * PAN_FRACTION };
    switch (command) {
      case "zoomIn":
        return this.zoomIn(at);
      case "zoomOut":
        return this.zoomOut(at);
      case "zoomFit":
        return this.fit();
      case "zoomActual":
        return this.actualSize(at);
      case "panLeft":
        return this.panBy(step.x, 0);
      case "panRight":
        return this.panBy(-step.x, 0);
      case "panUp":
        return this.panBy(0, step.y);
      case "panDown":
        return this.panBy(0, -step.y);
    }
  }

  /** A content point (CSS pixels of the drawing at actual size) on the stage. */
  toScreen(point: Point): Point {
    return {
      x: this.viewport.x + this.viewport.zoom * point.x,
      y: this.viewport.y + this.viewport.zoom * point.y,
    };
  }

  /** A stage point in the content. */
  toContent(screen: Point): Point {
    return {
      x: (screen.x - this.viewport.x) / this.viewport.zoom,
      y: (screen.y - this.viewport.y) / this.viewport.zoom,
    };
  }
}
