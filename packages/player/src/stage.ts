// The stage of the interactive player: a fixed window over the drawing, a content layer the user
// viewport transforms, the drawing itself (the renderer's SVG, never changed) and an overlay of
// hit tracks, rings and badges drawn from the scene's data, in scene units.
import type { GroupItem, Scene, SceneBounds } from "@meltemi/diagrams-layout";
import {
  viewBoxPlacement,
  type Box,
  type Point,
  type Size,
} from "@meltemi/diagrams-layout/viewport";
import { sceneGroups } from "@meltemi/diagrams-motion";
import type { ItemRef } from "./controller.js";
import { el, svgEl } from "./dom.js";
import { DRAG_THRESHOLD, LINE_DELTA, WHEEL_ZOOM, ViewerViewport } from "./viewport.js";

/** What the stage tells the player. */
export interface StageHandlers {
  /** The pointer moved over an item, or over nothing. */
  hover(item: ItemRef | null, event: PointerEvent): void;
  /** A click (not the end of a drag) on an item, or on the background. */
  click(item: ItemRef | null, event: MouseEvent): void;
  /** A double click on an element, or a press on its badge. */
  open(id: string): void;
  /** The pointer, the wheel or a pinch moved the drawing. */
  moved(): void;
  /** The stage changed size. */
  resized(size: Size): void;
  /** Whether an element is a container: relations crossing its box keep the pointer. */
  container(id: string): boolean;
}

/** What the overlay draws: on the view's scene, the rings of three states and the badges. */
export interface OverlayState {
  readonly scene: Scene | null;
  readonly hover: ItemRef | null;
  readonly selection: ItemRef | null;
  readonly focus: ItemRef | null;
  /** The elements that open something, with whether each is selected. */
  readonly badges: ReadonlyMap<string, string>;
}

/** Badges are hidden on boxes smaller than this on screen, in either direction. */
const BADGE_MIN_BOX = 32;
const BADGE_RADIUS = 10;

type Mode = "animate" | "slow" | "direct";

const accepted = (role: string | null): role is "element" | "relation" | "lifeline" =>
  role === "element" || role === "relation" || role === "lifeline";

/** The point `(x, y)` turned like a group's `rotate(d cx cy)` transform. */
function turned(point: Point, transform: string | undefined): Point {
  const match = transform?.match(/rotate\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
  if (!match) return point;
  const angle = (Number(match[1]) * Math.PI) / 180;
  const cx = Number(match[2]);
  const cy = Number(match[3]);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

const n = (value: number) => String(Math.round(value * 100) / 100);

export class Stage {
  readonly body: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly picture: HTMLDivElement;
  readonly overlay: SVGSVGElement;
  readonly viewer = new ViewerViewport({ width: 1, height: 1 });
  private markup = "";
  private size: Size = { width: 1, height: 1 };
  private viewBox: Box = { x: 0, y: 0, width: 1, height: 1 };
  private measured = 0;
  private readonly layers: Record<"hits" | "rings" | "badges", SVGGElement>;
  private readonly nodes = new Map<string, SVGElement>();
  private state: OverlayState | null = null;
  private readonly observer: ResizeObserver | undefined;
  private readonly pointers = new Map<number, Point>();
  private press: {
    id: number;
    start: Point;
    origin: ViewerViewport["viewport"];
    moved: boolean;
  } | null = null;
  private pinch: { distance: number; middle: Point; origin: ViewerViewport["viewport"] } | null =
    null;
  private suppressClick = false;

  constructor(
    private readonly root: ShadowRoot,
    readonly interactive: boolean,
    private readonly handlers: StageHandlers,
  ) {
    this.picture = el("div", { class: "picture" });
    this.overlay = svgEl("svg", { class: "overlay", "aria-hidden": "true" });
    this.layers = {
      hits: svgEl("g", { class: "hits" }),
      rings: svgEl("g", { class: "rings" }),
      badges: svgEl("g", { class: "badges" }),
    };
    this.overlay.append(this.layers.hits, this.layers.rings, this.layers.badges);
    this.content = el("div", { class: "content" }, this.picture);
    if (interactive) this.content.append(this.overlay);
    this.frame = el(
      "div",
      { class: interactive ? "frame interactive" : "frame", role: "img", tabindex: "0" },
      this.content,
    );
    this.body = el("div", { class: "body" }, this.frame);
    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.body);
    }
    if (interactive) this.listen();
  }

  /** The drawing's natural size: one scene unit per CSS pixel at 100 %. */
  setSize(size: Size, mode: Mode = "direct"): void {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.body.style.setProperty("--meltemi-w", `${n(width)}px`);
    this.body.style.setProperty("--meltemi-ratio", `${n(width)} / ${n(height)}`);
    this.body.style.setProperty("--meltemi-cw", `${n(width)}px`);
    this.body.style.setProperty("--meltemi-ch", `${n(height)}px`);
    this.viewer.setContent(this.size);
    this.measure(true);
    this.apply(mode);
  }

  /** Reads the stage's size from the page; refits while nothing has been zoomed. */
  measure(force = false): void {
    const width = this.body.clientWidth;
    if (width <= 0) return;
    if (!force && Math.abs(width - this.measured) < 0.5) return;
    this.measured = width;
    const stage = { width, height: (width * this.size.height) / this.size.width };
    this.viewer.resize(stage);
    this.apply("direct");
    this.handlers.resized(stage);
  }

  /** Puts a frame on the stage; true when the markup changed. */
  draw(markup: string): boolean {
    if (markup === this.markup) return false;
    this.markup = markup;
    this.picture.innerHTML = markup;
    const svg = this.picture.firstElementChild;
    if (svg) {
      svg.setAttribute("aria-hidden", "true");
      // The page's own tooltips would cover the cards: the DOM drops the drawing's titles, the
      // frame's markup (and every export) keeps them.
      if (this.interactive) for (const title of svg.querySelectorAll("title, desc")) title.remove();
      const box = svg
        .getAttribute("viewBox")
        ?.split(/[\s,]+/)
        .map(Number);
      if (box && box.length === 4 && box.every((v) => Number.isFinite(v))) {
        this.viewBox = { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! };
        this.overlay.setAttribute("viewBox", box.join(" "));
      }
    }
    if (this.state) this.render(this.state);
    return true;
  }

  /** Applies the viewport: animated over the motion tokens, slowly, or at once. */
  apply(mode: Mode = "animate"): void {
    const v = this.viewer.viewport;
    this.frame.classList.toggle("direct", mode === "direct");
    this.frame.classList.toggle("slow", mode === "slow");
    this.content.style.transform = `translate(${n(v.x)}px, ${n(v.y)}px) scale(${v.zoom})`;
    this.frame.classList.toggle("pannable", this.viewer.pannable);
    if (this.state) this.render(this.state);
  }

  /** One screen pixel in scene units, at the current camera and zoom. */
  private px(): number {
    const placement = viewBoxPlacement(this.size, this.viewBox);
    return 1 / Math.max(1e-9, placement.scale * this.viewer.zoom);
  }

  /** A box of the scene in content pixels (the drawing at actual size). */
  toContent(box: Box): Box {
    const p = viewBoxPlacement(this.size, this.viewBox);
    return {
      x: p.x + box.x * p.scale,
      y: p.y + box.y * p.scale,
      width: box.width * p.scale,
      height: box.height * p.scale,
    };
  }

  // ------------------------------------------------------------------------------ overlay

  /** Redraws the overlay: hit tracks, hover, selection and focus rings, and badges. */
  render(state: OverlayState): void {
    this.state = state;
    if (!this.interactive) return;
    const scene = state.scene;
    const want = new Set<string>();
    if (scene) {
      const px = this.px();
      const groups = sceneGroups(scene.items);
      const element = new Map<string, GroupItem>();
      const relation = new Map<string, GroupItem>();
      for (const g of groups) {
        if (g.role === "element" && g.bounds && !element.has(g.id)) element.set(g.id, g);
        else if (g.role === "relation" && g.track && g.track.length > 1 && !relation.has(g.id))
          relation.set(g.id, g);
      }
      const points = (g: GroupItem) => g.track!.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
      for (const [id, g] of relation) {
        const key = `hit:${id}`;
        want.add(key);
        this.node(key, "hits", "polyline", {
          class: "hit",
          points: points(g),
          "stroke-width": n(10 * px),
          "data-id": id,
          "data-role": "relation",
        });
      }
      const ring = (kind: "hover" | "selected" | "focus", item: ItemRef | null) => {
        if (!item) return;
        const key = `${kind}:${item.role}:${item.id}`;
        if (item.role === "element") {
          const g = element.get(item.id);
          if (!g?.bounds) return;
          const b: SceneBounds = g.bounds;
          want.add(key);
          const width = kind === "selected" ? 3 : 1.5;
          this.node(key, "rings", "rect", {
            class: `ring ${kind}`,
            x: n(b.x - 4),
            y: n(b.y - 4),
            width: n(b.width + 8),
            height: n(b.height + 8),
            rx: n(b.radius + 4),
            "stroke-width": n(width * px),
            "stroke-dasharray": kind === "focus" ? `${n(4 * px)} ${n(3 * px)}` : "none",
            transform: g.transform ?? "",
          });
        } else {
          const g = relation.get(item.id);
          if (!g) return;
          want.add(key);
          const width = kind === "selected" ? 8 : kind === "hover" ? 6 : 2;
          this.node(key, "rings", "polyline", {
            class: kind === "focus" ? `ring ${kind}` : `ring line ${kind}`,
            points: points(g),
            "stroke-width": n(width * px),
            "stroke-dasharray": kind === "focus" ? `${n(4 * px)} ${n(3 * px)}` : "none",
          });
        }
      };
      ring("hover", state.hover);
      ring("selected", state.selection);
      ring("focus", state.focus);
      for (const [id, name] of state.badges) {
        const g = element.get(id);
        if (!g?.bounds) continue;
        const b = g.bounds;
        if (b.width / px < BADGE_MIN_BOX || b.height / px < BADGE_MIN_BOX) continue;
        const key = `badge:${id}`;
        want.add(key);
        const at = turned({ x: b.x + b.width + 4, y: b.y - 4 }, g.transform);
        const selected = state.selection?.role === "element" && state.selection.id === id;
        const r = BADGE_RADIUS * px;
        const arm = 4.5 * px;
        const badge = this.node(key, "badges", "g", {
          class: selected ? "badge selected" : "badge",
          "data-open": id,
        });
        let circle = badge.querySelector("circle");
        let plus = badge.querySelector("path");
        let title = badge.querySelector<SVGTitleElement>("title");
        if (!circle || !plus || !title) {
          circle = svgEl("circle");
          plus = svgEl("path");
          title = svgEl("title");
          badge.replaceChildren(title, circle, plus);
        }
        title.textContent = name;
        for (const [k, v] of Object.entries({
          cx: n(at.x),
          cy: n(at.y),
          r: n(r),
          "stroke-width": n(1.5 * px),
        }))
          circle.setAttribute(k, v);
        plus.setAttribute(
          "d",
          `M${n(at.x - arm)} ${n(at.y)}H${n(at.x + arm)}M${n(at.x)} ${n(at.y - arm)}V${n(at.y + arm)}`,
        );
        plus.setAttribute("stroke-width", n(1.75 * px));
      }
    }
    for (const [key, node] of this.nodes) {
      if (want.has(key)) continue;
      node.remove();
      this.nodes.delete(key);
    }
  }

  private node(
    key: string,
    layer: keyof Stage["layers"],
    tag: "polyline" | "rect" | "g",
    attributes: Record<string, string>,
  ): SVGElement {
    let node = this.nodes.get(key);
    if (!node || node.localName !== tag) {
      node?.remove();
      node = svgEl(tag);
      this.nodes.set(key, node);
      this.layers[layer].append(node);
    }
    for (const [name, value] of Object.entries(attributes)) {
      if (value === "") node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
    return node;
  }

  // ------------------------------------------------------------------------------ pointer

  /** A point of the page in stage pixels. */
  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.frame.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** The element or relation an event happened on, through the drawing's groups. */
  itemAt(event: Event & { clientX: number; clientY: number }): ItemRef | null {
    for (const node of event.composedPath()) {
      if (node === this.frame) break;
      if (!(node instanceof Element)) continue;
      const role = node.getAttribute("data-role");
      const id = node.getAttribute("data-id");
      if (role === "motion" || id === null || !accepted(role)) continue;
      if (this.hidden(node)) return null;
      if (role === "relation" && this.overlay.contains(node)) {
        // A hit track crossing a box: the box under the pointer wins, unless it is a container.
        const under = this.elementUnder(event.clientX, event.clientY);
        if (under !== null) return { role: "element", id: under };
      }
      return { role: role === "relation" ? "relation" : "element", id };
    }
    return null;
  }

  private hidden(node: Element): boolean {
    for (let at: Element | null = node; at && at !== this.picture; at = at.parentElement) {
      if (at.getAttribute("opacity") === "0") return true;
    }
    return false;
  }

  private elementUnder(x: number, y: number): string | null {
    for (const found of this.root.elementsFromPoint(x, y)) {
      if (!this.picture.contains(found)) continue;
      const group = found.closest('[data-role="element"], [data-role="lifeline"]');
      const id = group?.getAttribute("data-id");
      if (group && id && !this.hidden(group) && !this.handlers.container(id)) return id;
    }
    return null;
  }

  private listen(): void {
    const frame = this.frame;
    frame.addEventListener("pointerdown", (e) => this.down(e));
    frame.addEventListener("pointermove", (e) => this.move(e));
    frame.addEventListener("pointerup", (e) => this.up(e));
    frame.addEventListener("pointercancel", (e) => this.up(e, true));
    frame.addEventListener("pointerleave", (e) => {
      if (!this.press) this.handlers.hover(null, e);
    });
    frame.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    frame.addEventListener("dragstart", (e) => e.preventDefault());
    frame.addEventListener(
      "click",
      (e) => {
        if (this.suppressClick) {
          this.suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const badge = (e.target as Element).closest?.("[data-open]");
        if (badge && this.overlay.contains(badge)) {
          e.preventDefault();
          e.stopPropagation();
          this.handlers.open(badge.getAttribute("data-open")!);
          return;
        }
        // A link in the drawing: a plain click selects; Ctrl, Cmd or Shift leave it to the browser.
        const anchor = e
          .composedPath()
          .find((n): n is Element => n instanceof Element && n.localName === "a");
        if (anchor && !(e.ctrlKey || e.metaKey || e.shiftKey)) e.preventDefault();
        if (anchor && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
        this.handlers.click(this.itemAt(e), e);
      },
      { capture: true },
    );
    frame.addEventListener("dblclick", (e) => {
      if ((e.target as Element).closest?.("[data-open]")) return;
      const item = this.itemAt(e);
      if (item?.role === "element") {
        e.preventDefault();
        this.handlers.open(item.id);
      }
    });
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as Element).closest?.("[data-open]")) return;
    this.suppressClick = false;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.button === 1) e.preventDefault();
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      this.pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        middle: this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }),
        origin: this.viewer.viewport,
      };
      this.press = null;
      for (const id of this.pointers.keys()) {
        if (!this.frame.hasPointerCapture(id)) this.frame.setPointerCapture(id);
      }
      this.frame.classList.add("pannable");
      return;
    }
    this.press = {
      id: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      origin: this.viewer.viewport,
      moved: false,
    };
  }

  private move(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId))
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = this.pinch;
    if (pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      const middle = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      this.viewer.viewport = pinch.origin;
      this.viewer.zoomBy(Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, pinch.middle);
      this.viewer.panBy(middle.x - pinch.middle.x, middle.y - pinch.middle.y);
      this.apply("direct");
      this.handlers.moved();
      return;
    }
    const press = this.press;
    if (press && press.id === e.pointerId) {
      const dx = e.clientX - press.start.x;
      const dy = e.clientY - press.start.y;
      if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!press.moved) {
        press.moved = true;
        this.frame.setPointerCapture(e.pointerId);
        this.frame.classList.add("panning");
        this.handlers.hover(null, e);
      }
      this.viewer.viewport = press.origin;
      this.viewer.panBy(dx, dy);
      this.apply("direct");
      this.handlers.moved();
      return;
    }
    if (e.pointerType !== "touch") this.handlers.hover(this.itemAt(e), e);
  }

  private up(e: PointerEvent, cancelled = false): void {
    this.pointers.delete(e.pointerId);
    if (this.frame.hasPointerCapture(e.pointerId)) this.frame.releasePointerCapture(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        this.suppressClick = true;
        this.frame.classList.toggle("pannable", this.viewer.pannable);
      }
      return;
    }
    const press = this.press;
    if (press && press.id === e.pointerId) {
      if (press.moved && !cancelled) this.suppressClick = true;
      this.press = null;
      this.frame.classList.remove("panning");
    }
  }

  private wheel(e: WheelEvent): void {
    const unit = e.deltaMode === 1 ? LINE_DELTA : e.deltaMode === 2 ? this.viewer.stage.height : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.viewer.zoomBy(Math.exp(-dy * WHEEL_ZOOM), this.local(e));
      this.apply("direct");
      this.handlers.moved();
      return;
    }
    if (e.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    // A drawing that does not overflow that way leaves the wheel to the page.
    if (!this.viewer.canPan(-dx, -dy)) return;
    e.preventDefault();
    this.viewer.panBy(-dx, -dy);
    this.apply("direct");
    this.handlers.moved();
  }

  /** Stops observing the page. */
  destroy(): void {
    this.observer?.disconnect();
  }
}
