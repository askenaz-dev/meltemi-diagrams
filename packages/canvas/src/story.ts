import type {
  CanvasAction,
  SceneActionKind,
  StoryPlaybackInfo,
} from "@meltemi/diagrams-editor/canvas";
import { storyFrame, type TimelineAction, type TimelineScene } from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import { ICONS, clear, h, icon } from "./dom.js";
import { messages } from "./messages/index.js";

/** What the timeline needs from the canvas. */
export interface StoryHost {
  /** Shows a frame of the story in the canvas, at the frame's size. */
  draw(svg: string, width: number, height: number): void;
  /** Sends a story action for the current revision. */
  act(action: CanvasAction): void;
  /** The ids selected on the frame. */
  selection(): readonly string[];
  announce(text: string, error?: boolean): void;
  /** Writes the HTML player of the story beside the file. */
  exportPlayer(story: string): void;
}

/** Times snap to this step when a bar is dragged, in milliseconds. */
export const TIME_STEP = 100;
const ADDABLE: readonly SceneActionKind[] = [
  "reveal",
  "hide",
  "highlight",
  "focus",
  "camera",
  "trace",
  "hold",
];

/** A bar of the timeline: an action or a transition, with its lane in its scene. */
interface Bar {
  readonly path: readonly number[];
  readonly label: string;
  readonly kind: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly lane: number;
  /** Whether dragging its end writes a time. */
  readonly timed: boolean;
}

/** `1.2 s` or `800 ms`, as the interface language writes it: `1,2 s` in Spanish. */
export function formatTime(ms: number): string {
  return ms === 0 || ms >= 1000 ? messages().story.seconds(ms) : `${Math.round(ms)} ms`;
}

/** The bars of a scene: its transition, its actions on lane 0, a parallel block's on lanes 0..n. */
export function sceneBars(scene: TimelineScene, index: number): Bar[] {
  const bars: Bar[] = [];
  if (scene.transition && scene.transition.durationMs > 0) {
    bars.push({
      path: [index],
      label: messages().story.transition(scene.transition.kind),
      kind: "transition",
      startMs: scene.transition.startMs,
      durationMs: scene.transition.durationMs,
      lane: 0,
      timed: true,
    });
  }
  const label = (a: TimelineAction) =>
    a.kind === "hold"
      ? "hold"
      : `${a.kind} ${a.all ? "all" : a.targets.map((t) => t.id).join(", ")}`;
  for (const action of scene.actions) {
    if (action.kind === "parallel") {
      action.children.forEach((child, lane) =>
        bars.push({
          path: child.path,
          label: label(child),
          kind: child.kind,
          startMs: child.startMs,
          durationMs: child.durationMs,
          lane,
          timed: child.kind !== "parallel",
        }),
      );
      continue;
    }
    bars.push({
      path: action.path,
      label: label(action),
      kind: action.kind,
      startMs: action.startMs,
      durationMs: action.durationMs,
      lane: 0,
      timed: true,
    });
  }
  return bars;
}

/**
 * The story mode of the canvas: draws frames locally with the same functions as the exporter,
 * plays, pauses and scrubs without asking the host, and turns drags of the timeline into edits.
 */
export class StoryPanel {
  readonly element = h("div", {
    class: "timeline",
    hidden: true,
    role: "region",
    "aria-label": messages().story.timeline,
    tabindex: 0,
  });
  private playback: StoryPlaybackInfo | undefined;
  private time = 0;
  private playing = false;
  private request = 0;
  private last = 0;
  private selectedBar: string | undefined;
  /** A canvas that only shows: stories play, scrub and export, and nothing is written. */
  private readOnly = false;
  private fonts = "";
  private readonly fontStyle = h("style", {});
  private readonly playButton: HTMLButtonElement;
  private readonly clock = h("span", { class: "clock", "aria-live": "off" });
  private readonly sceneName = h("span", { class: "scene-name" });
  private readonly actionSelect = h("select", { "aria-label": messages().story.actionToAdd });
  private readonly removeButton: HTMLButtonElement;
  private readonly tracks = h("div", { class: "tracks" });
  private readonly ruler = h("div", {
    class: "ruler",
    "aria-label": messages().story.time,
    role: "slider",
  });
  private readonly rows = h("div", { class: "rows" });
  private readonly playhead = h("div", { class: "playhead" });

  constructor(private readonly host: StoryHost) {
    document.head.append(this.fontStyle);
    const words = messages().story;
    this.playButton = this.button(words.play, ICONS.play, () => this.toggle());
    for (const kind of ADDABLE) this.actionSelect.append(h("option", { value: kind }, kind));
    const add = this.button(
      words.addToScene,
      ICONS.story,
      () => this.addToScene(),
      words.addToScene,
    );
    const scene = this.button(words.newScene, ICONS.group, () => this.newScene());
    this.removeButton = this.button(words.removeAction, ICONS.close, () => this.removeSelected());
    this.removeButton.disabled = true;
    // What writes the story: the canvas hides it while it is read-only.
    for (const control of [this.actionSelect, add, scene, this.removeButton]) {
      control.setAttribute("data-write", "");
    }
    const exportButton = this.button(
      words.exportPlayer,
      ICONS.export,
      () => this.playback && this.host.exportPlayer(this.playback.id),
      words.exportHtml,
    );
    const header = h(
      "div",
      { class: "timeline-bar" },
      this.playButton,
      this.clock,
      this.sceneName,
      h("span", { class: "spacer" }),
      this.actionSelect,
      add,
      scene,
      this.removeButton,
      exportButton,
    );
    this.tracks.append(this.ruler, this.rows, this.playhead);
    this.element.append(header, this.tracks);
    this.listen();
  }

  get active(): boolean {
    return this.playback !== undefined;
  }

  /** Turns read-only on or off: no grips on the bars and no action added, moved or removed. */
  setReadOnly(on: boolean): void {
    if (this.readOnly === on) return;
    this.readOnly = on;
    this.element.toggleAttribute("data-readonly", on);
    if (this.playback) this.buildRows();
  }

  get story(): string | undefined {
    return this.playback?.id;
  }

  /** The time shown, in milliseconds. */
  get at(): number {
    return this.time;
  }

  /** Shows a story, or a new version of it after an edit; the time stays where it was. */
  show(playback: StoryPlaybackInfo): void {
    const same = this.playback?.id === playback.id;
    this.playback = playback;
    if (!same) {
      this.time = 0;
      this.selectedBar = undefined;
    }
    this.time = Math.min(this.time, playback.timeline.durationMs);
    const fonts = playback.fontFaces.join("\n");
    if (fonts !== this.fonts) {
      this.fonts = fonts;
      this.fontStyle.textContent = fonts;
    }
    this.element.hidden = false;
    this.buildRows();
    this.draw();
  }

  /** Leaves story mode. */
  hide(): void {
    this.pause();
    this.playback = undefined;
    this.element.hidden = true;
    clear(this.rows);
  }

  /** Redraws the current frame, after a change of selection. */
  redraw(): void {
    if (this.playback) this.draw();
  }

  setTime(ms: number): void {
    const p = this.playback;
    if (!p) return;
    this.time = Math.max(0, Math.min(p.timeline.durationMs, ms));
    this.draw();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    const p = this.playback;
    if (!p || this.playing) return;
    if (this.time >= p.timeline.durationMs) this.time = 0;
    this.playing = true;
    this.last = performance.now();
    this.syncPlay();
    const tick = (now: number) => {
      if (!this.playing || !this.playback) return;
      this.time = Math.min(this.playback.timeline.durationMs, this.time + (now - this.last));
      this.last = now;
      this.draw();
      if (this.time >= this.playback.timeline.durationMs) this.pause();
      else this.request = requestAnimationFrame(tick);
    };
    this.request = requestAnimationFrame(tick);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.request);
    this.syncPlay();
  }

  /** The scene at the current time. */
  currentScene(): { scene: TimelineScene; index: number } | undefined {
    const scenes = this.playback?.timeline.scenes ?? [];
    let index = -1;
    for (let i = 0; i < scenes.length; i++) if (scenes[i]!.startMs <= this.time) index = i;
    if (index < 0 && scenes.length > 0) index = 0;
    return index >= 0 ? { scene: scenes[index]!, index } : undefined;
  }

  private button(label: string, paths: string, run: () => void, text?: string): HTMLButtonElement {
    const button = h(
      "button",
      { type: "button", title: label, "aria-label": label },
      icon(paths),
      ...(text ? [text] : []),
    );
    button.addEventListener("click", run);
    return button;
  }

  private syncPlay(): void {
    const words = messages().story;
    const label = this.playing ? words.pause : words.play;
    this.playButton.title = label;
    this.playButton.setAttribute("aria-label", label);
    this.playButton.setAttribute("aria-pressed", String(this.playing));
    clear(this.playButton);
    this.playButton.append(icon(this.playing ? ICONS.pause : ICONS.play));
  }

  /** Draws the frame at the current time and moves the playhead. */
  private draw(): void {
    const p = this.playback!;
    const frame = storyFrame(p.timeline, (key) => p.views[key], this.time, { accent: p.accent });
    if (frame) this.host.draw(renderSvg(frame, { fonts: "system" }), frame.width, frame.height);
    const duration = p.timeline.durationMs;
    this.clock.textContent = `${formatTime(this.time)} / ${formatTime(duration)}`;
    const current = this.currentScene();
    this.sceneName.textContent = current
      ? messages().story.scene(current.scene.id, current.scene.title)
      : "";
    const x = duration === 0 ? 0 : this.time / duration;
    this.playhead.style.left = `calc(var(--label-width) + (100% - var(--label-width)) * ${x})`;
    this.ruler.setAttribute("aria-valuemin", "0");
    this.ruler.setAttribute("aria-valuemax", String(duration));
    this.ruler.setAttribute("aria-valuenow", String(Math.round(this.time)));
    this.ruler.setAttribute("aria-valuetext", formatTime(this.time));
  }

  private buildRows(): void {
    const p = this.playback!;
    const duration = Math.max(1, p.timeline.durationMs);
    clear(this.rows);
    // Ticks every second, or every five past 20 s.
    clear(this.ruler);
    const step = duration > 20_000 ? 5000 : 1000;
    for (let t = 0; t <= duration; t += step) {
      const tick = h("span", { class: "tick" }, formatTime(t));
      tick.style.left = `${(t / duration) * 100}%`;
      this.ruler.append(tick);
    }
    p.timeline.scenes.forEach((scene, index) => {
      const bars = sceneBars(scene, index);
      const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
      const area = h("div", { class: "lanes" });
      area.style.height = `${lanes * 20}px`;
      const band = h("div", { class: "scene-band" });
      band.style.left = `${(scene.startMs / duration) * 100}%`;
      band.style.width = `${(scene.durationMs / duration) * 100}%`;
      area.append(band);
      for (const bar of bars) area.append(this.barElement(bar, duration));
      const label = h(
        "div",
        { class: "scene-label", title: scene.title ?? scene.id },
        scene.title ? `${scene.id} — ${scene.title}` : scene.id,
      );
      label.addEventListener("click", () => this.setTime(scene.startMs));
      this.rows.append(h("div", { class: "scene-row" }, label, area));
    });
  }

  private barElement(bar: Bar, duration: number): HTMLElement {
    const key = bar.path.join(".");
    const words = messages().story;
    const element = h(
      "div",
      {
        class: `bar bar-${bar.kind}${this.selectedBar === key ? " selected" : ""}`,
        "data-path": key,
        title: words.bar(bar.label, formatTime(bar.startMs), formatTime(bar.durationMs)),
        role: "button",
        "aria-label": `${bar.label}, ${formatTime(bar.durationMs)}`,
      },
      h("span", { class: "bar-text" }, bar.label),
    );
    element.style.left = `${(bar.startMs / duration) * 100}%`;
    element.style.width = `${(bar.durationMs / duration) * 100}%`;
    element.style.top = `${bar.lane * 20 + 2}px`;
    element.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).classList.contains("grip")) return;
      e.stopPropagation();
      this.selectBar(key);
      this.setTime(bar.startMs);
    });
    if (bar.timed && !this.readOnly) {
      const grip = h("div", { class: "grip", title: words.grip });
      grip.addEventListener("pointerdown", (e) => this.retime(e, bar, element, duration));
      element.append(grip);
    }
    return element;
  }

  private selectBar(key: string | undefined): void {
    this.selectedBar = key;
    for (const bar of this.rows.querySelectorAll<HTMLElement>(".bar")) {
      bar.classList.toggle("selected", bar.dataset.path === key);
    }
    this.removeButton.disabled = key === undefined || !key.includes(".");
  }

  /** Drags the end of a bar; the new time is written when the pointer is released. */
  private retime(e: PointerEvent, bar: Bar, element: HTMLElement, duration: number): void {
    e.stopPropagation();
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    const area = element.parentElement!.getBoundingClientRect();
    const msPerPx = duration / Math.max(1, area.width);
    let next = bar.durationMs;
    const move = (ev: PointerEvent) => {
      const end = (ev.clientX - area.left) * msPerPx;
      next = Math.max(0, Math.round((end - bar.startMs) / TIME_STEP) * TIME_STEP);
      element.style.width = `${(next / duration) * 100}%`;
      element.title = `${bar.label} · ${formatTime(next)}`;
    };
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      if (next !== bar.durationMs && this.playback) {
        this.host.act({
          kind: "setStoryTiming",
          story: this.playback.id,
          path: bar.path,
          durationMs: next,
        });
      }
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  private addToScene(): void {
    const p = this.playback;
    const current = this.currentScene();
    if (this.readOnly || !p || !current) return;
    const action = this.actionSelect.value as SceneActionKind;
    const ids = [...this.host.selection()];
    if (action !== "hold" && action !== "focus" && action !== "camera" && ids.length === 0) {
      this.host.announce(messages().story.selectFirst(action), true);
      return;
    }
    this.host.act({ kind: "addToScene", story: p.id, scene: current.scene.id, action, ids });
  }

  private newScene(): void {
    const p = this.playback;
    if (this.readOnly || !p) return;
    const current = this.currentScene();
    this.host.act({
      kind: "insertScene",
      story: p.id,
      ...(current ? { after: current.scene.id } : {}),
    });
  }

  private removeSelected(): void {
    const p = this.playback;
    const key = this.selectedBar;
    if (this.readOnly || !p || !key || !key.includes(".")) return;
    this.selectedBar = undefined;
    this.host.act({ kind: "removeStoryAction", story: p.id, path: key.split(".").map(Number) });
  }

  private listen(): void {
    const scrub = (e: PointerEvent) => {
      const area = this.ruler.getBoundingClientRect();
      const p = this.playback;
      if (!p) return;
      const x = Math.max(0, Math.min(1, (e.clientX - area.left) / Math.max(1, area.width)));
      this.pause();
      this.setTime(x * p.timeline.durationMs);
    };
    this.ruler.addEventListener("pointerdown", (e) => {
      this.ruler.setPointerCapture(e.pointerId);
      scrub(e);
      const move = (ev: PointerEvent) => scrub(ev);
      const up = () => {
        this.ruler.removeEventListener("pointermove", move);
        this.ruler.removeEventListener("pointerup", up);
      };
      this.ruler.addEventListener("pointermove", move);
      this.ruler.addEventListener("pointerup", up);
    });
    this.element.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLSelectElement) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        this.toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : TIME_STEP;
        this.pause();
        this.setTime(this.time + (e.key === "ArrowLeft" ? -step : step));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        this.pause();
        this.setTime(e.key === "Home" ? 0 : (this.playback?.timeline.durationMs ?? 0));
      } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectedBar) {
        e.preventDefault();
        this.removeSelected();
      }
    });
  }
}
