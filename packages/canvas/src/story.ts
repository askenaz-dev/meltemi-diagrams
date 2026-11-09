import type {
  CanvasAction,
  SceneActionKind,
  StoryPlaybackInfo,
  StoryReorderInfo,
} from "@meltemi/diagrams-editor/canvas";
import {
  activeSceneIndices as activeStoryScenes,
  storyFrame,
  type TimelineAction,
  type TimelineScene,
} from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import { ICONS, clear, h, icon } from "./dom.js";
import { messages } from "./messages/index.js";

/** What the timeline needs from the canvas. */
export interface StoryHost {
  /** Shows a frame of the story in the canvas, at the frame's size. */
  draw(svg: string, width: number, height: number): void;
  /** Sends a story action for the current revision. */
  act(action: CanvasAction): boolean | void;
  /** Current revision, including source updates that cannot produce a new playback. */
  revision(): number;
  /** The host document, independent of revision and story ids. */
  document(): string | undefined;
  /** The locally saved panel height; no diagram or project source is written. */
  panelHeight?(): number | undefined;
  setPanelHeight?(height: number): void;
  editingChanged?(enabled: boolean): void;
  /** Confirms deleting a scene before submitting a source edit. */
  confirm(reason: string, run: () => void): void;
  /** The ids selected on the frame. */
  selection(): readonly string[];
  announce(text: string, error?: boolean): void;
  /** Writes the HTML player of the story beside the file. */
  exportPlayer(story: string): void;
  /** Writes a picture of every scene of the story: the host asks the format and where. */
  exportScenes(story: string): void;
}

/** Times snap to this step when a bar is dragged, in milliseconds. */
export const TIME_STEP = 100;
/**
 * What **Add to scene** offers, in this order. `draw` replays the selected pens, free lines and
 * named relations from their first point; on anything else the edit refuses it with its reason.
 */
const ADDABLE: readonly SceneActionKind[] = [
  "reveal",
  "hide",
  "highlight",
  "focus",
  "camera",
  "trace",
  "draw",
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
  /** A minimum hit area, drawn off the timed lane so adjacent clips remain reachable. */
  readonly short?: boolean;
  /** Keep the hit cap and its separate handle inside the track at the final timestamp. */
  readonly capOffsetPx?: number;
}

/** Give short root clips their own reachable caps without changing their timestamps. */
export function reachableBars(
  bars: readonly Bar[],
  pixelsPerMs: number,
  trackWidth = Infinity,
): Bar[] {
  const nextLane = Math.max(0, ...bars.map((bar) => bar.lane)) + 1;
  const ends: number[] = [];
  return bars.map((bar) => {
    if (bar.path.length !== 2 || bar.kind === "parallel" || bar.durationMs * pixelsPerMs >= 16)
      return bar;
    const capOffsetPx = Math.min(0, trackWidth - 27 - bar.startMs * pixelsPerMs);
    const left = bar.startMs * pixelsPerMs + capOffsetPx;
    let lane = ends.findIndex((end) => end <= left);
    if (lane === -1) lane = ends.length;
    // The selected end handle lies outside the 16 px body; reserve its separate hit area too.
    ends[lane] = left + 27;
    return { ...bar, lane: nextLane + lane, short: true, capOffsetPx };
  });
}

/** The exact insertion slots after removing one sequential action; never quantizes source time. */
export function reorderPosition(
  scene: TimelineScene,
  from: number,
  time: number,
): { index: number; startMs: number } {
  let startMs = scene.actions[0]?.startMs ?? scene.startMs + (scene.transition?.durationMs ?? 0);
  let best = { index: 0, startMs };
  let distance = Math.abs(time - startMs);
  let index = 0;
  for (let i = 0; i < scene.actions.length; i++) {
    if (i === from) continue;
    startMs += scene.actions[i]!.durationMs;
    index++;
    const next = Math.abs(time - startMs);
    if (next < distance) {
      best = { index, startMs };
      distance = next;
    }
  }
  return best;
}

interface PendingReorder extends StoryReorderInfo {
  readonly playback: StoryPlaybackInfo;
  readonly revision: number;
  readonly document: string | undefined;
}

interface PendingWrite {
  readonly revision: number;
  readonly document: string | undefined;
  readonly action: CanvasAction;
}

/** Keep enough diagram visible while allowing a useful editing area on short screens. */
export function storyPanelHeight(height: number, available: number): number {
  const maximum = Math.max(96, available - 96);
  const minimum = Math.min(160, maximum);
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(height) ? height : 240)));
}

function overlapOf(scenes: readonly TimelineScene[], index: number): number {
  const scene = scenes[index];
  const previous = scenes[index - 1];
  if (!scene || !previous) return 0;
  const amount = previous.startMs + previous.durationMs - scene.startMs;
  const rounding =
    Number.EPSILON *
    Math.max(1, Math.abs(previous.startMs), Math.abs(scene.startMs), previous.durationMs) *
    8;
  return amount > rounding ? amount : 0;
}

/** Enabling overlap changes a legacy transition prefix into concurrent transition time. */
export function sceneOverlapMaximum(scenes: readonly TimelineScene[], index: number): number {
  const scene = scenes[index];
  const previous = scenes[index - 1];
  if (!scene || !previous) return 0;
  const transition = scene.transition?.durationMs ?? 0;
  const last = scene.actions.at(-1);
  const actions = last
    ? last.startMs +
      last.durationMs -
      scene.startMs -
      (overlapOf(scenes, index) > 0 ? 0 : transition)
    : 0;
  return Math.min(previous.durationMs, Math.max(transition, actions), 600_000);
}

/** The padding may shrink, but existing content and either adjacent overlap must still fit. */
export function sceneDurationMinimum(scenes: readonly TimelineScene[], index: number): number {
  const scene = scenes[index];
  if (!scene) return 0;
  const last = scene.actions.at(-1);
  const content = last?.kind === "hold" ? last.startMs - scene.startMs : scene.durationMs;
  return Math.max(
    content,
    scene.transition?.durationMs ?? 0,
    overlapOf(scenes, index),
    overlapOf(scenes, index + 1),
  );
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
    a.kind === "parallel"
      ? messages().story.parallelGroup(a.children.length)
      : a.kind === "hold"
        ? "hold"
        : `${a.kind} ${a.all ? "all" : a.targets.map((t) => t.id).join(", ")}`;
  const add = (action: TimelineAction, lane: number): number => {
    bars.push({
      path: action.path,
      label: label(action),
      kind: action.kind,
      startMs: action.startMs,
      durationMs: action.durationMs,
      lane,
      timed: action.kind !== "parallel",
    });
    if (action.kind === "parallel") {
      let next = lane + 1;
      for (const child of action.children) next = add(child, next);
      return next;
    }
    return lane + 1;
  };
  for (const action of scene.actions) add(action, 0);
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
  private playbackRevision = 0;
  private playbackDocument: string | undefined;
  private time = 0;
  private playing = false;
  private request = 0;
  private last = 0;
  private selectedBar: string | undefined;
  private selectedSceneId: string | undefined;
  private pendingWrite: PendingWrite | undefined;
  private sourceStale = false;
  private preferredHeight: number;
  private cancelInteraction: (() => void) | undefined;
  private cancelResize: (() => void) | undefined;
  private interactionSource: { revision: number; document: string | undefined } | undefined;
  private pendingReorder: PendingReorder | undefined;
  /** A canvas that only shows: stories play, scrub and export, and nothing is written. */
  private readOnly = false;
  private fonts = "";
  private readonly fontStyle = h("style", {});
  private readonly playButton: HTMLButtonElement;
  private readonly clock = h("span", { class: "clock", "aria-live": "off" });
  private readonly sceneSelect = h("select", {
    class: "story-scene-select",
    "aria-label": messages().story.selectedScene,
  });
  private readonly storyTitle = h("input", {
    type: "text",
    class: "story-title",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": messages().story.storyName,
  });
  private readonly sceneTitle = h("input", {
    type: "text",
    class: "scene-title",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": messages().story.sceneName,
  });
  private readonly deleteSceneButton: HTMLButtonElement;
  private readonly resizeEdge = h("div", {
    class: "story-resize-edge",
    role: "separator",
    tabindex: 0,
    "aria-label": messages().story.panelHeight,
    "aria-orientation": "horizontal",
  });
  private readonly timingMode = h("select", { "aria-label": messages().story.sceneTiming });
  private readonly overlap = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "scene-overlap",
    "aria-label": messages().story.overlapDuration,
  });
  private readonly overlapField = h("label", { class: "scene-overlap-field", hidden: true });
  private readonly overlapHint = h("span", { class: "scene-overlap-hint" });
  private readonly transitionKind = h("select", { "aria-label": messages().story.transitionKind });
  private readonly transitionDuration = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "scene-transition-duration",
    "aria-label": messages().story.transitionDuration,
  });
  private readonly transitionField = h("label", { class: "scene-transition-field", hidden: true });
  private readonly sceneSpan = h("span", { class: "scene-span" });
  private readonly actionSelect = h("select", { "aria-label": messages().story.actionToAdd });
  private readonly removeButton: HTMLButtonElement;
  private readonly moveEarlier: HTMLButtonElement;
  private readonly moveLater: HTMLButtonElement;
  private readonly timing = h("div", { class: "story-timing", "data-write": "" });
  private readonly sceneDuration = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "scene-duration",
  }) as HTMLInputElement;
  private readonly actionDuration = h("input", {
    type: "text",
    inputmode: "decimal",
    class: "action-duration",
    placeholder: "—",
  }) as HTMLInputElement;
  private readonly actionTiming = h("label", { class: "action-timing", hidden: true });
  private readonly minimum = h("span", { class: "scene-minimum" });
  private readonly timingError = h("span", { class: "timing-error", role: "status" });
  private readonly drafts = new WeakMap<
    HTMLInputElement,
    {
      playback: StoryPlaybackInfo;
      revision: number;
      document: string | undefined;
      value: string;
      target: string;
    }
  >();
  private readonly tracks = h("div", { class: "tracks" });
  private readonly ruler = h("div", {
    class: "ruler",
    "aria-label": messages().story.time,
    role: "slider",
  });
  private readonly rows = h("div", { class: "rows" });
  private readonly playhead = h("div", { class: "playhead" });

  constructor(private readonly host: StoryHost) {
    const savedHeight = host.panelHeight?.();
    this.preferredHeight = Number.isFinite(savedHeight) ? savedHeight! : 260;
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
    add.classList.add("story-add-action");
    const scene = this.button(
      words.newScene,
      ICONS.group,
      () => this.newScene(),
      words.newSceneShort,
    );
    this.deleteSceneButton = this.button(
      words.deleteScene,
      "M3 4h10M6 4V2.5h4V4M4.5 4l.7 9h5.6l.7-9",
      () => this.deleteScene(),
      words.deleteScene,
    );
    this.removeButton = this.button(words.removeAction, ICONS.close, () => this.removeSelected());
    this.removeButton.disabled = true;
    this.moveEarlier = this.button(
      words.moveEarlier,
      "M10 3L5 8l5 5",
      () => this.moveSelected(-1),
      words.moveEarlier,
    );
    this.moveLater = this.button(
      words.moveLater,
      "M6 3l5 5-5 5",
      () => this.moveSelected(1),
      words.moveLater,
    );
    this.moveEarlier.classList.add("story-move-earlier");
    this.moveLater.classList.add("story-move-later");
    for (const button of [this.moveEarlier, this.moveLater]) button.setAttribute("data-write", "");
    // What writes the story: the canvas hides it while it is read-only.
    for (const control of [
      this.actionSelect,
      add,
      scene,
      this.removeButton,
      this.deleteSceneButton,
    ]) {
      control.setAttribute("data-write", "");
    }
    const exportButton = this.button(
      words.exportPlayer,
      ICONS.export,
      () => this.playback && this.host.exportPlayer(this.playback.id),
      words.exportHtml,
    );
    // The pictures of every scene's final state: offered read-only too, as Export HTML is.
    const scenesButton = this.button(
      words.exportScenesTitle,
      ICONS.image,
      () => this.playback && this.host.exportScenes(this.playback.id),
      words.exportScenes,
    );
    scenesButton.classList.add("export-scenes");
    const header = h(
      "div",
      { class: "timeline-bar" },
      this.playButton,
      this.clock,
      this.sceneSelect,
      h("span", { class: "spacer" }),
      this.actionSelect,
      add,
      scene,
      this.removeButton,
      this.deleteSceneButton,
      exportButton,
      scenesButton,
    );
    this.tracks.append(this.ruler, this.rows, this.playhead);
    this.sceneDuration.setAttribute("aria-label", words.sceneDuration);
    this.actionDuration.setAttribute("aria-label", words.actionDuration);
    this.actionTiming.append(words.actionDuration, this.actionDuration);
    this.overlapField.append(words.overlapDuration, this.overlap);
    this.transitionField.append(words.transitionDuration, this.transitionDuration);
    this.timingMode.append(
      h("option", { value: "sequential" }, words.sequential),
      h("option", { value: "overlap" }, words.overlapping),
    );
    for (const kind of ["cut", "fade", "morph"] as const)
      this.transitionKind.append(h("option", { value: kind }, words.transitionKinds[kind]));
    this.timing.append(
      h("label", { class: "story-name-field" }, words.storyName, this.storyTitle),
      h("label", {}, words.sceneName, this.sceneTitle),
      h("label", {}, words.sceneDuration, this.sceneDuration),
      this.minimum,
      h("label", {}, words.sceneTiming, this.timingMode),
      this.overlapField,
      this.overlapHint,
      h("label", {}, words.transitionKind, this.transitionKind),
      this.transitionField,
      this.sceneSpan,
      this.actionTiming,
      this.moveEarlier,
      this.moveLater,
      this.timingError,
    );
    this.element.append(this.resizeEdge, header, this.timing, this.tracks);
    this.listenTiming(this.sceneDuration, true);
    this.listenTiming(this.actionDuration, false);
    this.listenSceneFields();
    this.sceneSelect.addEventListener("change", () => this.selectScene(this.sceneSelect.value));
    this.sceneSelect.addEventListener("keydown", (event) => {
      if (event.key === "F2" && this.selectedSceneId) {
        event.preventDefault();
        event.stopPropagation();
        this.editSceneName(this.selectedSceneId);
      }
    });
    this.resizeBehaviour();
    this.listen();
    let trackWidth = this.ruler.clientWidth;
    new ResizeObserver(() => {
      const width = this.ruler.clientWidth;
      if (width === trackWidth) return;
      trackWidth = width;
      if (this.playback) {
        this.cancelInteraction?.();
        this.buildRows();
        this.syncTiming();
      }
    }).observe(this.ruler);
    requestAnimationFrame(() => {
      const parent = this.element.parentElement;
      if (parent) new ResizeObserver(() => this.applyHeight()).observe(parent);
    });
  }

  get active(): boolean {
    return this.playback !== undefined;
  }

  /** Turns read-only on or off: no grips on the bars and no action added, moved or removed. */
  setReadOnly(on: boolean): void {
    if (this.readOnly === on) return;
    this.readOnly = on;
    this.cancelInteraction?.();
    if (on) {
      this.pendingReorder = undefined;
      this.pendingWrite = undefined;
    }
    this.element.toggleAttribute("data-readonly", on);
    if (this.playback) {
      this.buildRows();
      this.syncTiming();
    }
  }

  get story(): string | undefined {
    return this.playback?.id;
  }

  /** The time shown, in milliseconds. */
  get at(): number {
    return this.time;
  }

  /** Shows a story, or a new version of it after an edit; the time stays where it was. */
  show(playback: StoryPlaybackInfo, reordered?: StoryReorderInfo): void {
    this.cancelInteraction?.();
    const previous = this.playback;
    const previousRevision = this.playbackRevision;
    const oldIndex =
      previous?.timeline.scenes.findIndex((s) => s.id === this.selectedSceneId) ?? -1;
    const same = previous?.id === playback.id && this.playbackDocument === this.host.document();
    const write = this.pendingWrite;
    const unchangedWrite =
      same &&
      write &&
      write.document === this.host.document() &&
      write.revision === this.host.revision();
    this.pendingWrite = unchangedWrite ? write : undefined;
    const pending = this.pendingReorder;
    const acknowledged =
      same &&
      pending &&
      reordered &&
      pending.story === reordered.story &&
      pending.index === reordered.index &&
      pending.path.join(".") === reordered.path.join(".") &&
      pending.document === this.host.document() &&
      this.host.revision() > pending.revision;
    // A ready/refresh reply may redraw the unchanged source while the move is still in flight.
    // Only an acknowledgement or a different source/navigation resolves that pending selection.
    const unchanged =
      same &&
      pending &&
      !reordered &&
      pending.story === playback.id &&
      pending.document === this.host.document() &&
      this.host.revision() === pending.revision;
    this.pendingReorder = unchanged ? pending : undefined;
    this.playback = playback;
    this.playbackRevision = this.host.revision();
    this.playbackDocument = this.host.document();
    this.sourceStale = false;
    if (!same) {
      this.time = 0;
      this.selectedBar = undefined;
      this.selectedSceneId = playback.timeline.scenes[0]?.id;
      for (const input of this.timing.querySelectorAll<HTMLInputElement>("input")) {
        this.drafts.delete(input);
        input.removeAttribute("aria-invalid");
      }
    } else if (!playback.timeline.scenes.some((s) => s.id === this.selectedSceneId)) {
      this.selectedSceneId =
        playback.timeline.scenes[
          Math.min(Math.max(0, oldIndex), playback.timeline.scenes.length - 1)
        ]?.id;
      this.selectedBar = undefined;
      this.time = this.selectedScene()?.scene.startMs ?? 0;
    }
    if (same && !write && previousRevision !== this.host.revision()) this.selectedBar = undefined;
    if (same && write && !unchangedWrite && write.action.kind === "insertScene") {
      const added = playback.timeline.scenes.filter(
        (s) => !previous?.timeline.scenes.some((old) => old.id === s.id),
      );
      if (added.length === 1) {
        this.selectedSceneId = added[0]!.id;
        this.selectedBar = undefined;
        this.time = added[0]!.startMs;
      }
    }
    if (acknowledged) {
      const path = [pending.path[0]!, pending.index];
      this.selectedBar = path.join(".");
      this.selectedSceneId = playback.timeline.scenes[path[0]!]!.id;
      this.time = playback.timeline.scenes[path[0]!]!.actions[path[1]!]!.startMs;
      this.drafts.delete(this.actionDuration);
      this.actionDuration.removeAttribute("aria-invalid");
    }
    this.time = Math.min(this.time, playback.timeline.durationMs);
    const fonts = playback.fontFaces.join("\n");
    if (fonts !== this.fonts) {
      this.fonts = fonts;
      this.fontStyle.textContent = fonts;
    }
    this.element.hidden = false;
    this.applyHeight();
    clear(this.sceneSelect);
    for (const scene of playback.timeline.scenes)
      this.sceneSelect.append(h("option", { value: scene.id }, scene.title || scene.id));
    this.sceneSelect.value = this.selectedSceneId ?? "";
    this.sceneSelect.disabled = playback.timeline.scenes.length === 0;
    this.buildRows();
    this.draw();
    if (acknowledged)
      this.rows
        .querySelector<HTMLElement>(`.bar[data-path="${this.selectedBar}"]`)
        ?.focus({ preventScroll: true });
  }

  /** A render can change the source before a replacement story can be compiled. */
  sourceChanged(revision: number, document: string | undefined): void {
    const source = this.interactionSource;
    if (source && (source.revision !== revision || source.document !== document))
      this.cancelInteraction?.();
    if (
      this.playback &&
      (revision !== this.playbackRevision || document !== this.playbackDocument)
    ) {
      this.sourceStale = true;
      this.syncTiming();
    }
  }

  /** Navigation takes effect before the host's new playback reaches the canvas. */
  beginNavigation(): void {
    this.cancelInteraction?.();
    this.cancelResize?.();
    this.pendingReorder = undefined;
    this.pendingWrite = undefined;
    this.sourceStale = true;
    this.pause();
    if (this.playback) this.syncTiming();
  }

  /** The host rejected the single submitted move; the source order was never preview-written. */
  rejectReorder(): void {
    this.cancelInteraction?.();
    this.pendingReorder = undefined;
    this.pendingWrite = undefined;
    if (this.playback) this.syncTiming();
  }

  /** Leaves story mode. */
  hide(): void {
    this.cancelInteraction?.();
    this.cancelResize?.();
    this.pendingReorder = undefined;
    this.pendingWrite = undefined;
    this.pause();
    this.playback = undefined;
    this.element.hidden = true;
    clear(this.rows);
    this.selectedBar = undefined;
    this.selectedSceneId = undefined;
    this.timingError.textContent = "";
    for (const input of this.timing.querySelectorAll<HTMLInputElement>("input")) {
      input.removeAttribute("aria-invalid");
      this.drafts.delete(input);
    }
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

  /** The editing target is stable even when empty or concurrent scenes share a time. */
  private selectedScene(): { scene: TimelineScene; index: number } | undefined {
    const scenes = this.playback?.timeline.scenes ?? [];
    const index = scenes.findIndex((scene) => scene.id === this.selectedSceneId);
    return index >= 0 ? { scene: scenes[index]!, index } : undefined;
  }

  private selectScene(id: string): void {
    const scene = this.playback?.timeline.scenes.find((s) => s.id === id);
    if (!scene) return;
    this.pause();
    this.selectedSceneId = id;
    this.sceneSelect.value = id;
    this.selectBar(undefined);
    this.setTime(scene.startMs);
  }

  private writable(): boolean {
    return (
      !!this.playback &&
      !this.readOnly &&
      !this.pendingWrite &&
      !this.sourceStale &&
      this.playbackRevision === this.host.revision() &&
      this.playbackDocument === this.host.document()
    );
  }

  /** Lock before posting: browser hosts can acknowledge a source plan synchronously. */
  private write(action: CanvasAction): void {
    if (!this.writable()) return;
    this.cancelInteraction?.();
    this.pendingWrite = { revision: this.host.revision(), document: this.host.document(), action };
    this.syncTiming();
    if (this.host.act(action) === false) {
      this.pendingWrite = undefined;
      this.pendingReorder = undefined;
      this.syncTiming();
    }
  }

  private button(label: string, paths: string, run: () => void, text?: string): HTMLButtonElement {
    const button = h(
      "button",
      { type: "button", title: label, "aria-label": label },
      icon(paths),
      // The words beside the glyph give way to it when the timeline is narrow.
      ...(text ? [h("span", { class: "label" }, text)] : []),
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
    const frame =
      storyFrame(p.timeline, (key) => p.views[key], this.time, { accent: p.accent }) ??
      (p.timeline.scenes.length === 0 ? Object.values(p.views)[0]?.scene : undefined);
    if (frame) this.host.draw(renderSvg(frame, { fonts: "system" }), frame.width, frame.height);
    const duration = p.timeline.durationMs;
    this.clock.textContent = `${formatTime(this.time)} / ${formatTime(duration)}`;
    this.clock.title = this.clock.textContent;
    const x = duration === 0 ? 0 : this.time / duration;
    this.playhead.style.left = `clamp(var(--label-width), calc(var(--label-width) + (100% - var(--label-width)) * ${x}), calc(100% - 1px))`;
    this.syncSceneRows();
    this.ruler.setAttribute("aria-valuemin", "0");
    this.ruler.setAttribute("aria-valuemax", String(duration));
    this.ruler.setAttribute("aria-valuenow", String(Math.round(this.time)));
    this.ruler.setAttribute("aria-valuetext", formatTime(this.time));
    this.syncTiming();
  }

  private buildRows(): void {
    const p = this.playback!;
    const duration = Math.max(1, p.timeline.durationMs);
    clear(this.rows);
    // Fit readable labels to the actual track width; neither end nor a near-end tick overflows.
    clear(this.ruler);
    const width = this.ruler.clientWidth;
    const minimumStep = Math.max(1000, duration / Math.max(1, Math.floor(width / 80)));
    const scale = 10 ** Math.floor(Math.log10(minimumStep));
    const step = [1, 2, 5, 10]
      .map((factor) => factor * scale)
      .find((value) => value >= minimumStep)!;
    const ticks = [0];
    for (let t = step; t < p.timeline.durationMs; t += step) {
      if (((duration - t) / duration) * width >= 80) ticks.push(t);
    }
    if (p.timeline.durationMs > 0) ticks.push(p.timeline.durationMs);
    for (const t of ticks) {
      const tick = h("span", { class: "tick" }, formatTime(t));
      if (t > 0 && t === p.timeline.durationMs) tick.classList.add("end-tick");
      else {
        tick.style.left = `${(t / duration) * 100}%`;
        if (t > 0) tick.classList.add("backward-tick");
      }
      this.ruler.append(tick);
    }
    p.timeline.scenes.forEach((scene, index) => {
      const bars = reachableBars(
        sceneBars(scene, index),
        this.ruler.clientWidth / duration,
        this.ruler.clientWidth,
      );
      const lanes = Math.max(1, ...bars.map((b) => b.lane + 1));
      const area = h("div", { class: "lanes" });
      area.style.height = `${lanes * 20}px`;
      const band = h("div", { class: "scene-band" });
      band.style.left = `${(scene.startMs / duration) * 100}%`;
      band.style.width = `${(scene.durationMs / duration) * 100}%`;
      area.append(band);
      for (const bar of bars.filter((b) => b.kind === "parallel")) {
        const outline = h("div", { class: "story-parallel-outline", "aria-hidden": "true" });
        const prefix = `${bar.path.join(".")}.`;
        const lastLane = Math.max(
          bar.lane,
          ...bars.filter((b) => b.path.join(".").startsWith(prefix)).map((b) => b.lane),
        );
        outline.style.left = `min(${(bar.startMs / duration) * 100}%, calc(100% - 4px))`;
        outline.style.width = `${(bar.durationMs / duration) * 100}%`;
        outline.style.top = `${bar.lane * 20}px`;
        outline.style.height = `${(lastLane - bar.lane + 1) * 20}px`;
        area.append(outline);
      }
      for (const bar of bars) area.append(this.barElement(bar, duration));
      const label = h(
        "div",
        { class: "scene-label", title: scene.title ? `${scene.title} — ${scene.id}` : scene.id },
        scene.title || scene.id,
      );
      label.tabIndex = 0;
      label.setAttribute("role", "button");
      const select = () => {
        this.selectScene(scene.id);
      };
      label.addEventListener("click", select);
      label.addEventListener("dblclick", () => this.editSceneName(scene.id));
      label.addEventListener("keydown", (e) => {
        if (e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          this.editSceneName(scene.id);
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          select();
        }
      });
      this.rows.append(
        h("div", { class: "scene-row", "data-scene": scene.id, "data-index": index }, label, area),
      );
    });
    this.syncSceneRows();
  }

  /** Rebuilds (resize/read-only included) retain editing and concurrent playback indications. */
  private syncSceneRows(): void {
    const p = this.playback;
    if (!p) return;
    const indices = activeStoryScenes(p.timeline, this.time);
    const active = new Set(indices);
    const dominant = indices.at(-1);
    for (const row of this.rows.querySelectorAll<HTMLElement>(".scene-row")) {
      const index = Number(row.dataset.index);
      const selected = row.dataset.scene === this.selectedSceneId;
      row.classList.toggle("selected-scene", selected);
      row.classList.toggle("active-scene", active.has(index));
      row.classList.toggle("dominant-scene", dominant === index);
      const label = row.querySelector(".scene-label");
      label?.setAttribute("aria-pressed", String(selected));
      if (dominant === index) label?.setAttribute("aria-current", "step");
      else label?.removeAttribute("aria-current");
      if (active.has(index)) label?.setAttribute("aria-description", messages().story.activeScene);
      else label?.removeAttribute("aria-description");
    }
  }

  private barElement(bar: Bar, duration: number): HTMLElement {
    const key = bar.path.join(".");
    const words = messages().story;
    const movable = bar.path.length === 2 && !this.readOnly;
    const draggable =
      movable &&
      this.playback!.timeline.scenes[bar.path[0]!]!.actions.some((action) => action.durationMs > 0);
    const element = h(
      "div",
      {
        class: `bar bar-${bar.kind}${movable ? " movable" : ""}${movable && !draggable ? " order-only" : ""}${bar.short ? " short-clip" : ""}${this.selectedBar === key ? " selected" : ""}`,
        "data-path": key,
        title: `${words.bar(bar.label, formatTime(bar.startMs), formatTime(bar.durationMs))}${movable ? ` · ${draggable ? words.reorderHelp : words.reorderZero}` : ""}`,
        role: "button",
        tabindex: "0",
        "aria-label": `${bar.label}, ${formatTime(bar.durationMs)}`,
      },
      h("span", { class: "bar-text" }, bar.short ? formatTime(bar.durationMs) : bar.label),
    );
    element.style.left = bar.capOffsetPx
      ? `calc(${(bar.startMs / duration) * 100}% + ${bar.capOffsetPx}px)`
      : `min(${(bar.startMs / duration) * 100}%, calc(100% - ${bar.short ? 16 : 4}px))`;
    element.style.width = `${(bar.durationMs / duration) * 100}%`;
    element.style.top = `${bar.lane * 20 + 2}px`;
    element.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).classList.contains("grip")) return;
      e.stopPropagation();
      this.selectBar(key);
      this.setTime(bar.startMs);
      if (draggable) this.reorder(e, bar, element, duration);
    });
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        this.selectBar(key);
        this.setTime(bar.startMs);
      }
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
    if (key) {
      const scene = this.playback?.timeline.scenes[Number(key.split(".")[0])];
      if (scene) {
        this.selectedSceneId = scene.id;
        this.sceneSelect.value = scene.id;
      }
    }
    for (const bar of this.rows.querySelectorAll<HTMLElement>(".bar")) {
      bar.classList.toggle("selected", bar.dataset.path === key);
    }
    this.removeButton.disabled = key === undefined || !key.includes(".");
    this.syncTiming();
  }

  private selectedMovable(): { scene: TimelineScene; path: readonly [number, number] } | undefined {
    if (!this.playback || !this.selectedBar) return;
    const path = this.selectedBar.split(".").map(Number);
    if (path.length !== 2) return;
    const scene = this.playback.timeline.scenes[path[0]!];
    if (scene?.actions[path[1]!]) return { scene, path: [path[0]!, path[1]!] };
  }

  private moveSelected(direction: -1 | 1): void {
    const selected = this.selectedMovable();
    const playback = this.playback;
    if (!selected || !playback || !this.writable() || this.pendingReorder) return;
    const index = selected.path[1] + direction;
    if (index < 0 || index >= selected.scene.actions.length) return;
    this.pause();
    this.submitReorder(playback, selected.path, index);
  }

  private submitReorder(playback: StoryPlaybackInfo, path: readonly number[], index: number): void {
    if (
      !this.writable() ||
      this.pendingReorder ||
      playback !== this.playback ||
      index === path[1] ||
      this.host.revision() !== this.playbackRevision ||
      this.host.document() !== this.playbackDocument
    )
      return;
    this.cancelInteraction?.();
    this.pendingReorder = {
      playback,
      revision: this.host.revision(),
      document: this.host.document(),
      story: playback.id,
      path,
      index,
    };
    this.syncTiming();
    this.write({ kind: "reorderStoryAction", story: playback.id, path, index });
  }

  /** Moves a whole sequential clip to an insertion boundary, without changing its duration. */
  private reorder(e: PointerEvent, bar: Bar, element: HTMLElement, duration: number): void {
    const playback = this.playback;
    const scene = playback?.timeline.scenes[bar.path[0]!];
    if (!playback || !scene || !this.writable() || this.pendingReorder || e.button !== 0) return;
    this.cancelInteraction?.();
    const revision = this.host.revision();
    const documentId = this.host.document();
    this.interactionSource = { revision, document: documentId };
    const area = element.parentElement!;
    const original = element.getBoundingClientRect();
    const offsetX = e.clientX - original.left;
    const offsetY = e.clientY - original.top;
    const ghost = h("div", { class: "story-drag-preview", "aria-hidden": "true" }, bar.label);
    ghost.style.width = `${original.width}px`;
    ghost.style.height = `${original.height}px`;
    const marker = h("div", { class: "story-insertion-marker", "aria-hidden": "true" });
    const hint = h("div", { class: "story-drop-label", role: "status" });
    let x = e.clientX;
    let y = e.clientY;
    let dragging = false;
    let finished = false;
    let frame = 0;
    let valid = false;
    let candidate = { index: bar.path[1]!, startMs: bar.startMs };
    const current = () =>
      !this.readOnly &&
      this.playback === playback &&
      this.host.revision() === revision &&
      this.host.document() === documentId;
    const update = () => {
      const rect = area.getBoundingClientRect();
      // A short cap may sit inward from its exact timestamp; pointer deltas preserve that anchor.
      const at = bar.startMs + ((x - e.clientX) * duration) / Math.max(1, rect.width);
      candidate = reorderPosition(scene, bar.path[1]!, at);
      const sceneLeft = rect.left + (scene.startMs / duration) * rect.width;
      const sceneRight = rect.left + ((scene.startMs + scene.durationMs) / duration) * rect.width;
      valid = x >= sceneLeft && x <= sceneRight && y >= rect.top && y <= rect.bottom && current();
      ghost.style.left = `${x - offsetX}px`;
      ghost.style.top = `${y - offsetY}px`;
      ghost.classList.toggle("invalid", !valid);
      marker.hidden = !valid;
      marker.style.left = `${(candidate.startMs / duration) * 100}%`;
      hint.textContent = valid
        ? messages().story.reorderAt(formatTime(candidate.startMs), formatTime(bar.durationMs))
        : messages().story.reorderOutside;
      hint.style.left = `${Math.max(4, Math.min(window.innerWidth - 260, x))}px`;
      hint.style.top = `${y + 22}px`;
    };
    const scroll = () => {
      frame = 0;
      if (!dragging || finished) return;
      const rect = this.tracks.getBoundingClientRect();
      const delta = y < rect.top + 28 ? -8 : y > rect.bottom - 28 ? 8 : 0;
      const before = this.tracks.scrollTop;
      if (delta) this.tracks.scrollTop += delta;
      if (before !== this.tracks.scrollTop) {
        update();
        frame = requestAnimationFrame(scroll);
      }
    };
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      element.removeEventListener("lostpointercapture", cancel);
      cancelAnimationFrame(frame);
      ghost.remove();
      marker.remove();
      hint.remove();
      element.classList.remove("reordering");
      this.cancelInteraction = undefined;
      this.interactionSource = undefined;
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      if (commit && dragging && valid && current())
        this.submitReorder(playback, bar.path, candidate.index);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      if (!current()) {
        finish(false);
        return;
      }
      if (!dragging) {
        const dx = Math.abs(x - e.clientX);
        const dy = Math.abs(y - e.clientY);
        if (dy > 5 && dy > dx) {
          finish(false);
          return;
        }
        if (dx < 5) return;
        dragging = true;
        this.pause();
        element.setPointerCapture(e.pointerId);
        element.classList.add("reordering");
        document.body.append(ghost, hint);
        area.append(marker);
      }
      ev.preventDefault();
      update();
      if (!frame) frame = requestAnimationFrame(scroll);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (dragging) {
        x = ev.clientX;
        y = ev.clientY;
        update();
      }
      finish(true);
    };
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };
    this.cancelInteraction = cancel;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    element.addEventListener("lostpointercapture", cancel);
  }

  /** Drags the end of a bar; the new time is written when the pointer is released. */
  private retime(e: PointerEvent, bar: Bar, element: HTMLElement, duration: number): void {
    const playback = this.playback;
    const revision = this.host.revision();
    if (!playback || !this.writable() || this.pendingReorder) return;
    this.cancelInteraction?.();
    this.interactionSource = { revision, document: this.host.document() };
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
    const finish = (commit: boolean) => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", cancel);
      grip.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key, true);
      this.cancelInteraction = undefined;
      this.interactionSource = undefined;
      if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
      if (
        commit &&
        next !== bar.durationMs &&
        this.playback === playback &&
        this.host.revision() === revision &&
        !this.pendingReorder &&
        this.writable()
      ) {
        this.write({
          kind: "setStoryTiming",
          story: playback.id,
          path: bar.path,
          durationMs: next,
        });
      } else if (!commit) {
        element.style.width = `${(bar.durationMs / duration) * 100}%`;
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        cancel();
      }
    };
    this.cancelInteraction = cancel;
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", cancel);
    grip.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key, true);
  }

  private selectedTimingBar(): Bar | undefined {
    const p = this.playback;
    if (!p || this.selectedBar === undefined) return undefined;
    return p.timeline.scenes
      .flatMap(sceneBars)
      .find((bar) => bar.timed && bar.path.join(".") === this.selectedBar);
  }

  /** Numerical timing is precise; scene totals only adjust the last pause. */
  private syncTiming(): void {
    const words = messages().story;
    const current = this.selectedScene();
    const scene = current?.scene;
    const enabled = this.writable() && !this.pendingReorder;
    this.host.editingChanged?.(enabled);
    this.element.toggleAttribute("data-busy", !enabled);
    this.element.setAttribute("aria-busy", String(!!this.pendingWrite || this.sourceStale));
    this.timing.classList.toggle("empty-story", !scene);
    if (this.playback)
      this.syncInput(this.storyTitle, this.playback.title || this.playback.id, this.playback.id);
    if (scene && current) {
      const scenes = this.playback!.timeline.scenes;
      const maximum = sceneOverlapMaximum(scenes, current.index);
      const overlap = overlapOf(scenes, current.index);
      const planned = this.pendingWrite?.action;
      const intended =
        planned?.kind === "setSceneOverlap" && planned.scene === scene.id
          ? planned.durationMs
          : overlap;
      this.minimum.textContent = words.minimum(
        formatTime(sceneDurationMinimum(scenes, current.index)),
      );
      this.syncTimeInput(this.sceneDuration, scene.durationMs, scene.id);
      this.syncInput(this.sceneTitle, scene.title || scene.id, scene.id);
      this.timingMode.value = intended > 0 ? "overlap" : "sequential";
      this.overlapField.hidden = false;
      this.syncTimeInput(this.overlap, intended, scene.id);
      this.overlapHint.textContent =
        current.index > 0 ? words.overlapMaximum(formatTime(maximum)) : words.firstScene;
      this.timingMode.options[1]!.disabled = maximum <= 0;
      this.transitionKind.value = scene.transition?.kind ?? "cut";
      this.transitionField.hidden = false;
      this.syncTimeInput(this.transitionDuration, scene.transition?.durationMs ?? 0, scene.id);
      this.sceneSpan.textContent = words.sceneRange(
        formatTime(scene.startMs),
        formatTime(scene.startMs + scene.durationMs),
      );
    } else {
      this.minimum.textContent = words.emptyStory;
    }
    const bar = this.selectedTimingBar();
    this.actionTiming.hidden = !scene;
    if (bar) this.syncTimeInput(this.actionDuration, bar.durationMs, bar.path.join("."));
    else this.syncInput(this.actionDuration, "", "no-action");
    for (const control of this.timing.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input,select,button"))
      control.disabled = !enabled || !scene;
    this.storyTitle.disabled = !enabled;
    this.actionDuration.disabled ||= !bar;
    this.overlap.disabled ||= this.timingMode.value !== "overlap";
    this.transitionDuration.disabled ||= this.transitionKind.value === "cut";
    const movable = this.selectedMovable();
    this.moveEarlier.disabled = !enabled || !movable || movable.path[1] === 0;
    this.moveLater.disabled =
      !enabled || !movable || movable.path[1] === movable.scene.actions.length - 1;
    for (const control of this.element.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      ".timeline-bar [data-write]",
    ))
      control.disabled = !enabled;
    this.actionSelect.disabled ||= !scene;
    this.deleteSceneButton.disabled ||= !scene;
    this.element
      .querySelector<HTMLButtonElement>(".story-add-action")
      ?.toggleAttribute("disabled", !enabled || !scene);
    this.removeButton.disabled = !enabled || !this.selectedBar?.includes(".");
  }

  private syncTimeInput(input: HTMLInputElement, ms: number, target: string): void {
    this.syncInput(input, String(ms / 1000), target);
  }

  private syncInput(input: HTMLInputElement, value: string, target: string): void {
    const draft = this.drafts.get(input);
    // Keep a submitted value visible while its source edit is awaiting acknowledgement.
    if (this.pendingWrite && draft?.target === target) return;
    const focused = document.activeElement === input;
    // Keep an unfinished or rejected value available for correction. A clean focused field can
    // follow its acknowledged source edit, so the next Enter does not use an old revision.
    if (
      draft &&
      ((focused && draft.target === target && input.value !== draft.value) ||
        (input.hasAttribute("aria-invalid") && draft.target === target))
    )
      return;
    input.value = value;
    input.removeAttribute("aria-invalid");
    if (focused && this.playback)
      this.drafts.set(input, {
        playback: this.playback,
        revision: this.host.revision(),
        document: this.host.document(),
        value: input.value,
        target,
      });
  }

  private listenTiming(input: HTMLInputElement, scene: boolean): void {
    input.addEventListener("focus", () => {
      this.pause();
      const p = this.playback;
      const target = scene ? this.selectedSceneId : this.selectedBar;
      const draft = this.drafts.get(input);
      if (
        p &&
        target !== undefined &&
        !(input.hasAttribute("aria-invalid") && draft?.target === target)
      ) {
        this.drafts.set(input, {
          playback: p,
          revision: this.host.revision(),
          document: this.host.document(),
          value: input.value,
          target,
        });
      }
    });
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      this.timingError.textContent = "";
    });
    const commit = () => {
      const draft = this.drafts.get(input);
      if (
        this.readOnly ||
        this.pendingWrite ||
        this.pendingReorder ||
        !draft ||
        input.value === draft.value
      )
        return;
      const words = messages().story;
      const number = Number(input.value.replace(",", "."));
      const ms = Math.round(number * 1000);
      let error = "";
      if (
        !this.writable() ||
        draft.playback.id !== this.playback?.id ||
        draft.revision !== this.host.revision() ||
        draft.document !== this.host.document()
      )
        error = words.timingChanged;
      else if (input.value.trim() === "" || !Number.isFinite(number) || number < 0)
        error = words.invalidTime;
      else if (scene) {
        const selected = draft.playback.timeline.scenes.find((s) => s.id === draft.target)!;
        const minimum = sceneDurationMinimum(
          draft.playback.timeline.scenes,
          draft.playback.timeline.scenes.indexOf(selected),
        );
        if (ms < minimum) error = words.belowMinimum(formatTime(minimum));
        else if (ms - minimum > 600_000) error = words.invalidTime;
      } else if (ms > 600_000) error = words.invalidTime;
      if (error) {
        input.setAttribute("aria-invalid", "true");
        this.timingError.textContent = error;
        return;
      }
      this.drafts.set(input, { ...draft, value: input.value });
      this.timingError.textContent = "";
      const original = scene
        ? draft.playback.timeline.scenes.find((s) => s.id === draft.target)?.durationMs
        : this.selectedTimingBar()?.durationMs;
      if (ms === original) {
        this.syncTiming();
        return;
      }
      this.write(
        scene
          ? {
              kind: "setSceneDuration",
              story: draft.playback.id,
              scene: draft.target,
              durationMs: ms,
            }
          : {
              kind: "setStoryTiming",
              story: draft.playback.id,
              path: draft.target.split(".").map(Number),
              durationMs: ms,
            },
      );
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        const draft = this.drafts.get(input);
        if (draft) input.value = draft.value;
        input.removeAttribute("aria-invalid");
        this.timingError.textContent = "";
      }
    });
  }

  private editSceneName(id: string): void {
    if (!this.writable()) return;
    this.selectScene(id);
    this.sceneTitle.focus({ preventScroll: true });
    this.sceneTitle.select();
  }

  private listenSceneFields(): void {
    const words = messages().story;
    const bind = (
      input: HTMLInputElement,
      make: (value: string, target: string) => CanvasAction | string | undefined,
      story = false,
    ) => {
      input.addEventListener("focus", () => {
        this.pause();
        if (!this.playback || (!story && !this.selectedSceneId)) return;
        this.drafts.set(input, {
          playback: this.playback,
          revision: this.playbackRevision,
          document: this.playbackDocument,
          value: input.value,
          target: story ? this.playback.id : this.selectedSceneId!,
        });
      });
      input.addEventListener("input", () => {
        input.removeAttribute("aria-invalid");
        this.timingError.textContent = "";
      });
      const commit = () => {
        const draft = this.drafts.get(input);
        if (
          this.readOnly ||
          this.pendingWrite ||
          this.pendingReorder ||
          !draft ||
          input.value === draft.value
        )
          return;
        const result =
          !this.writable() ||
          draft.revision !== this.host.revision() ||
          draft.document !== this.host.document() ||
          draft.playback.id !== this.playback?.id
            ? words.timingChanged
            : make(input.value, draft.target);
        if (typeof result === "string") {
          input.setAttribute("aria-invalid", "true");
          this.timingError.textContent = result;
          return;
        }
        this.drafts.set(input, { ...draft, value: input.value });
        input.removeAttribute("aria-invalid");
        this.timingError.textContent = "";
        if (result) this.write(result);
        else this.syncTiming();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          const draft = this.drafts.get(input);
          if (draft) input.value = draft.value;
          input.removeAttribute("aria-invalid");
          this.timingError.textContent = "";
        }
      });
    };
    const milliseconds = (value: string): number | undefined => {
      const number = Number(value.replace(",", "."));
      return value.trim() !== "" && Number.isFinite(number) && number >= 0 && number <= 600
        ? Math.round(number * 1000)
        : undefined;
    };
    bind(
      this.storyTitle,
      (value) => {
        const p = this.playback!;
        const title = value.trim() || null;
        if (title === p.title || (p.title === null && title === p.id)) return;
        return { kind: "setStoryTitle", story: p.id, title };
      },
      true,
    );
    bind(this.sceneTitle, (value, id) => {
      const scene = this.playback!.timeline.scenes.find((scene) => scene.id === id);
      if (!scene) return words.timingChanged;
      const title = value.trim() || null;
      if (title === scene.title || (scene.title === null && title === scene.id)) return;
      return { kind: "setSceneTitle", story: this.playback!.id, scene: scene.id, title };
    });
    bind(this.overlap, (value, id) => {
      const index = this.playback!.timeline.scenes.findIndex((scene) => scene.id === id);
      const scene = this.playback!.timeline.scenes[index];
      if (!scene) return words.timingChanged;
      const durationMs = milliseconds(value);
      if (durationMs === undefined) return words.invalidTime;
      const maximum = sceneOverlapMaximum(this.playback!.timeline.scenes, index);
      if (durationMs > maximum) return words.overlapTooLong(formatTime(maximum));
      if (durationMs === overlapOf(this.playback!.timeline.scenes, index)) return;
      return { kind: "setSceneOverlap", story: this.playback!.id, scene: scene.id, durationMs };
    });
    bind(this.transitionDuration, (value, id) => {
      const scene = this.playback!.timeline.scenes.find((scene) => scene.id === id);
      if (!scene) return words.timingChanged;
      const durationMs = milliseconds(value);
      if (durationMs === undefined) return words.invalidTime;
      const transition = scene.transition?.kind;
      if (!transition || transition === "cut" || durationMs === scene.transition?.durationMs)
        return;
      return {
        kind: "setSceneTransition",
        story: this.playback!.id,
        scene: scene.id,
        transition,
        durationMs,
      };
    });
    this.timingMode.addEventListener("change", () => {
      const selected = this.selectedScene();
      if (!selected || !this.writable()) return;
      const current = overlapOf(this.playback!.timeline.scenes, selected.index);
      const amount =
        this.timingMode.value === "sequential"
          ? 0
          : current ||
            Math.min(1000, sceneOverlapMaximum(this.playback!.timeline.scenes, selected.index));
      if (amount === current) return;
      this.write({
        kind: "setSceneOverlap",
        story: this.playback!.id,
        scene: selected.scene.id,
        durationMs: amount,
      });
    });
    this.transitionKind.addEventListener("change", () => {
      const selected = this.selectedScene();
      if (!selected || !this.writable()) return;
      const transition = this.transitionKind.value as "cut" | "fade" | "morph";
      if (transition === (selected.scene.transition?.kind ?? "cut")) return;
      this.write({
        kind: "setSceneTransition",
        story: this.playback!.id,
        scene: selected.scene.id,
        transition,
        ...(transition === "cut"
          ? {}
          : { durationMs: selected.scene.transition?.durationMs || 500 }),
      });
    });
  }

  private applyHeight(): void {
    if (this.element.hidden) return;
    const available = this.availableHeight();
    const height = storyPanelHeight(this.preferredHeight, available);
    this.element.style.height = `${height}px`;
    this.resizeEdge.setAttribute("aria-valuemin", String(storyPanelHeight(0, available)));
    this.resizeEdge.setAttribute("aria-valuemax", String(storyPanelHeight(available, available)));
    this.resizeEdge.setAttribute("aria-valuenow", String(height));
    this.resizeEdge.setAttribute("aria-valuetext", `${height} px`);
  }

  private availableHeight(): number {
    const parent = this.element.parentElement;
    return (
      (parent?.clientHeight ?? window.innerHeight) -
      (parent?.querySelector(".toolbar")?.getBoundingClientRect().height ?? 0)
    );
  }

  private resizeBehaviour(): void {
    this.resizeEdge.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      this.cancelInteraction?.();
      const available = this.availableHeight();
      const current = this.element.getBoundingClientRect().height;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? available
            : current + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 40 : 10);
      this.preferredHeight = storyPanelHeight(next, available);
      this.applyHeight();
      this.host.setPanelHeight?.(this.preferredHeight);
    });
    this.resizeEdge.addEventListener("dblclick", () => {
      this.preferredHeight = 260;
      this.applyHeight();
      this.host.setPanelHeight?.(this.preferredHeight);
    });
    this.resizeEdge.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.cancelInteraction?.();
      this.cancelResize?.();
      this.resizeEdge.focus({ preventScroll: true });
      this.resizeEdge.setPointerCapture(event.pointerId);
      const previous = this.preferredHeight;
      const initial = this.element.getBoundingClientRect().height;
      let finished = false;
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        this.preferredHeight = initial + event.clientY - next.clientY;
        this.applyHeight();
      };
      const finish = (commit: boolean) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
        this.resizeEdge.removeEventListener("lostpointercapture", cancel);
        this.cancelResize = undefined;
        if (!commit) this.preferredHeight = previous;
        this.applyHeight();
        if (this.resizeEdge.hasPointerCapture(event.pointerId))
          this.resizeEdge.releasePointerCapture(event.pointerId);
        if (commit) {
          this.preferredHeight = this.element.getBoundingClientRect().height;
          this.host.setPanelHeight?.(this.preferredHeight);
        }
      };
      const up = (next: PointerEvent) => {
        if (next.pointerId === event.pointerId) finish(true);
      };
      const cancel = () => finish(false);
      this.cancelResize = cancel;
      const key = (next: KeyboardEvent) => {
        if (next.key !== "Escape") return;
        next.preventDefault();
        next.stopPropagation();
        cancel();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
      this.resizeEdge.addEventListener("lostpointercapture", cancel);
    });
  }

  private deleteScene(): void {
    const p = this.playback;
    const selected = this.selectedScene();
    const revision = this.playbackRevision;
    const document = this.playbackDocument;
    if (!this.writable() || this.pendingReorder || !p || !selected) return;
    const id = selected.scene.id;
    this.host.confirm(messages().story.deleteSceneConfirm(selected.scene.title || id), () => {
      if (
        !this.writable() ||
        this.pendingReorder ||
        this.playback?.id !== p.id ||
        this.selectedSceneId !== id ||
        revision !== this.host.revision() ||
        document !== this.host.document()
      ) {
        this.host.announce(messages().story.timingChanged, true);
        return;
      }
      this.write({ kind: "removeScene", story: p.id, scene: id });
    });
  }

  /** The story-level destructive action belongs to the upper story toolbar. */
  deleteStory(): void {
    const playback = this.playback;
    const revision = this.playbackRevision;
    const document = this.playbackDocument;
    if (!playback || !this.writable()) return;
    this.host.confirm(messages().story.deleteStoryConfirm(playback.title || playback.id), () => {
      if (
        !this.writable() ||
        this.playback?.id !== playback.id ||
        revision !== this.host.revision() ||
        document !== this.host.document()
      ) {
        this.host.announce(messages().story.timingChanged, true);
        return;
      }
      this.write({ kind: "removeStory", story: playback.id, cascade: false });
    });
  }

  /** A dependency confirmation is still a panel write, with the same lock and snapshot guard. */
  confirmStoryRemoval(story: string): void {
    if (!this.writable() || this.playback?.id !== story) {
      this.host.announce(messages().story.timingChanged, true);
      return;
    }
    this.write({ kind: "removeStory", story, cascade: true });
  }

  private addToScene(): void {
    const p = this.playback;
    const current = this.selectedScene();
    if (!this.writable() || this.pendingReorder || !p || !current) return;
    const action = this.actionSelect.value as SceneActionKind;
    const ids = [...this.host.selection()];
    if (action !== "hold" && action !== "focus" && action !== "camera" && ids.length === 0) {
      this.host.announce(messages().story.selectFirst(action), true);
      return;
    }
    this.write({ kind: "addToScene", story: p.id, scene: current.scene.id, action, ids });
  }

  private newScene(): void {
    const p = this.playback;
    if (!this.writable() || this.pendingReorder || !p) return;
    const current = this.selectedScene();
    this.write({
      kind: "insertScene",
      story: p.id,
      ...(current ? { after: current.scene.id } : {}),
    });
  }

  private removeSelected(): void {
    const p = this.playback;
    const key = this.selectedBar;
    if (!this.writable() || this.pendingReorder || !p || !key || !key.includes(".")) return;
    this.selectedBar = undefined;
    this.write({ kind: "removeStoryAction", story: p.id, path: key.split(".").map(Number) });
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
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "F2" && this.selectedSceneId) {
        e.preventDefault();
        e.stopPropagation();
        this.editSceneName(this.selectedSceneId);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        (e.target as Element).closest(".scene-label")
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteScene();
      } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        e.stopPropagation();
        const bar = (e.target as Element).closest<HTMLElement>(".bar");
        if (bar?.dataset.path) this.selectBar(bar.dataset.path);
        this.moveSelected(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === " " || e.key === "k") {
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
