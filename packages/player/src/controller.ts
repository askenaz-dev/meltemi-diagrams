import { DEFAULT_LOCALE, type Locale } from "@meltemi/diagrams-i18n";
import {
  DRILL_DURATIONS,
  hasSceneOverlap,
  sceneGroups,
  sceneStills,
  storySceneIndexAt,
  transitionFor,
  type DrillSpec,
  type StoryTimeline,
  type StoryViewData,
  type TimelineAction,
  type TimelineScene,
} from "@meltemi/diagrams-motion";
import {
  storyAt,
  type EffectsPlayerDocument,
  type OpenTarget,
  type PlayerDocument,
  type StoryEntry,
  type StoryPlayerDocument,
} from "./format.js";
import { messages } from "./messages/index.js";

/** An element or a relation of the view on screen. */
export interface ItemRef {
  readonly role: "element" | "relation";
  readonly id: string;
}

/** A drill-down on its way: the move, its clock, and what to do when it settles. */
export interface DrillState {
  readonly spec: DrillSpec;
  /** Milliseconds since it started. */
  time: number;
  /** Views the document lacks, by key: the view a catalog page came from. */
  readonly extra: Readonly<Record<string, StoryViewData>>;
  /** The element to select once it settles. */
  readonly select: string | null;
  /** Whether the effects were playing before. */
  readonly resume: boolean;
}

/** Where the trail of views went down: the view, and its element that opened the next one. */
export interface TrailStep {
  readonly view: string;
  readonly element: string;
}

/** The trail never grows past this: `link` cycles are legal. */
export const TRAIL_LIMIT = 32;

export interface PlayerOptions {
  /** Starts playing at once, unless the viewer asks for reduced motion. */
  readonly autoplay?: boolean;
  /** Starts again at the end. */
  readonly loop?: boolean;
  /** Starts in the static view. */
  readonly static?: boolean;
  /** The viewer asks for reduced motion: the static view, and no autoplay. */
  readonly reducedMotion?: boolean;
  /** The language of what the player says; English by default. */
  readonly locale?: Locale;
  /**
   * A story document of several stories: the id of the one shown first; the first story when it
   * names none of them.
   */
  readonly story?: string;
}

export type PlayerCommand =
  | "toggle"
  | "back"
  | "forward"
  | "backSmall"
  | "forwardSmall"
  | "start"
  | "end"
  | "previousScene"
  | "nextScene"
  | "toggleStatic";

/** Steps of the arrow keys, in milliseconds. */
export const STEP = 1000;
export const SMALL_STEP = 100;

/**
 * The command of a key pressed in the player, or undefined. Left and Right step a second, `,` and
 * `.` a tenth (Shift and the arrows pan the drawing).
 */
export function commandForKey(key: string): PlayerCommand | undefined {
  switch (key) {
    case " ":
    case "k":
    case "K":
      return "toggle";
    case "ArrowLeft":
      return "back";
    case "ArrowRight":
      return "forward";
    case ",":
      return "backSmall";
    case ".":
      return "forwardSmall";
    case "Home":
      return "start";
    case "End":
      return "end";
    case "PageUp":
    case "p":
    case "P":
      return "previousScene";
    case "PageDown":
    case "n":
    case "N":
      return "nextScene";
    case "s":
    case "S":
      return "toggleStatic";
    default:
      return undefined;
  }
}

const secondsFormats = new Map<Locale, Intl.NumberFormat>();

/**
 * Seconds with up to three decimals in a language, like `decimal(locale, s, 3)`; the formatter is
 * made once, since the clock formats a time on every animation frame.
 */
function secondsFormat(locale: Locale): Intl.NumberFormat {
  let format = secondsFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false });
    secondsFormats.set(locale, format);
  }
  return format;
}

/** `1.2 s`, `800 ms` or `0 s`, with the language's decimal mark: `1,2 s` in Spanish. */
export function formatTime(ms: number, locale: Locale = DEFAULT_LOCALE): string {
  if (ms === 0) return "0 s";
  if (ms >= 1000) return `${secondsFormat(locale).format(Math.round(ms) / 1000)} s`;
  return `${Math.round(ms)} ms`;
}

/**
 * The state of a player without its page: the clock, the scenes, the static view and what to
 * announce. The runtime draws `frameTime` and calls `tick` on animation frames.
 */
export class PlayerController {
  time = 0;
  playing = false;
  staticView: boolean;
  readonly loop: boolean;
  /** The language of the announcements. */
  readonly locale: Locale;

  constructor(
    readonly document: PlayerDocument,
    options: PlayerOptions = {},
  ) {
    this.effectsView = document.kind === "effects" ? document.key : "";
    this.story =
      document.kind === "story"
        ? Math.max(
            0,
            document.stories.findIndex((s) => s.id === options.story),
          )
        : 0;
    this.reducedMotion = options.reducedMotion === true;
    this.staticView = options.static === true || options.reducedMotion === true;
    this.loop = options.loop === true;
    this.locale = options.locale ?? DEFAULT_LOCALE;
    if (options.autoplay && !options.reducedMotion && !this.staticView) this.playing = true;
    if (this.staticView) this.time = this.sceneEnd(0);
  }

  /** The view of an effects document on screen, by key. */
  protected effectsView: string;
  /** A story document: the index of the story shown, in `stories`. */
  story: number;
  /** The final states of the scenes of the story shown, made once per story. */
  private stills: { readonly story: number; readonly at: readonly number[] } | null = null;
  /** Static overlapping scenes cannot be recovered from their end time alone. */
  private staticScene = 0;
  /** The element or relation selected, whose details the panel shows. */
  selection: ItemRef | null = null;
  /** The item the keyboard walk reached. */
  focused: ItemRef | null = null;
  /** The views above the one on screen, outermost first. */
  readonly trail: TrailStep[] = [];
  /** A drill-down on its way, or null. */
  drill: DrillState | null = null;
  private readonly reducedMotion: boolean;
  /** What to announce once a drill-down settles, until the runtime takes it. */
  private settled: string | null = null;

  /** The stories of a story document, in its order; none for effects. */
  get stories(): readonly StoryEntry[] {
    return this.document.kind === "story" ? this.document.stories : [];
  }

  /** The timeline of the story shown, or null for effects. */
  get timeline(): StoryTimeline | null {
    return this.document.kind === "story" ? storyAt(this.document, this.story).timeline : null;
  }

  /** The key of the view on screen: an effects document's current view, or the scene's view. */
  get view(): string {
    if (this.document.kind === "effects") return this.effectsView;
    const scene = this.scenes[this.sceneIndex];
    return scene?.view ?? this.timeline?.views[0] ?? "";
  }

  /** How long the document plays, or null for effects that repeat forever. */
  get duration(): number | null {
    return this.document.kind === "story"
      ? (this.timeline?.durationMs ?? 0)
      : (this.document.views[this.effectsView]?.durationMs ?? null);
  }

  get scenes(): readonly TimelineScene[] {
    return this.timeline?.scenes ?? [];
  }

  /** The scene at a time: the last one that has started. */
  sceneIndexAt(t: number): number {
    return storySceneIndexAt({ scenes: this.scenes }, t);
  }

  get sceneIndex(): number {
    if (this.staticView && this.timeline && hasSceneOverlap(this.timeline)) return this.staticScene;
    return this.sceneIndexAt(this.time);
  }

  /** The time of a scene's final state, as the stills of its exports take it (`sceneStills`). */
  sceneEnd(index: number): number {
    const timeline = this.timeline;
    if (!timeline) return 0;
    if (this.stills?.story !== this.story) {
      this.stills = { story: this.story, at: sceneStills(timeline).map((s) => s.atMs) };
    }
    return this.stills.at[index] ?? 0;
  }

  /**
   * Shows another story of the document: its first frame at time 0 (in the static view, its first
   * scene's final state), stopped; the static view stays as it is. Nothing is selected in it yet.
   */
  goToStory(index: number): void {
    const stories = this.stories;
    if (stories.length === 0) return;
    this.story = Math.max(0, Math.min(stories.length - 1, Math.trunc(index)));
    this.staticScene = 0;
    this.playing = false;
    this.selection = null;
    this.focused = null;
    this.time = this.staticView && this.scenes.length > 0 ? this.sceneEnd(0) : 0;
  }

  /** Whether the play button can play: never in the static view of a story. */
  get canPlay(): boolean {
    return !(this.staticView && this.document.kind === "story");
  }

  play(): void {
    if (!this.canPlay) return;
    const duration = this.duration;
    if (duration !== null && this.time >= duration) this.time = 0;
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Moves the clock on by `elapsed` ms while playing; returns true when playback ended. */
  tick(elapsed: number): boolean {
    const drill = this.drill;
    if (drill) {
      drill.time += Math.max(0, elapsed);
      if (drill.time >= this.drillDuration) this.settle();
      return false;
    }
    if (!this.playing) return false;
    const duration = this.duration;
    const next = this.time + Math.max(0, elapsed);
    if (duration === null) {
      this.time = next;
      return false;
    }
    if (next < duration) {
      this.time = next;
      return false;
    }
    if (this.loop && duration > 0) {
      this.time = next % duration;
      return false;
    }
    this.time = duration;
    this.playing = false;
    return true;
  }

  /** Shows a time; in the static view, the final state of the scene at that time. */
  seek(t: number): void {
    const duration = this.duration;
    const clamped = Math.max(0, duration === null ? t : Math.min(duration, t));
    this.staticScene = this.sceneIndexAt(clamped);
    this.time =
      this.staticView && this.scenes.length > 0
        ? this.sceneEnd(this.sceneIndexAt(clamped))
        : clamped;
  }

  goToScene(index: number): void {
    const scenes = this.scenes;
    if (scenes.length === 0) return;
    const i = Math.max(0, Math.min(scenes.length - 1, index));
    this.staticScene = i;
    this.time = this.staticView ? this.sceneEnd(i) : scenes[i]!.startMs;
  }

  setStatic(on: boolean): void {
    const index = this.sceneIndex;
    this.staticView = on;
    if (!on) return;
    // Nothing moves in the static view.
    this.playing = false;
    this.staticScene = index;
    if (this.scenes.length > 0) this.time = this.sceneEnd(index);
  }

  /** The time whose frame is drawn. */
  get frameTime(): number {
    return this.time;
  }

  /** Runs a keyboard command. */
  run(command: PlayerCommand): void {
    switch (command) {
      case "toggle":
        this.toggle();
        break;
      case "back":
      case "forward":
      case "backSmall":
      case "forwardSmall": {
        if (this.staticView && this.scenes.length > 0) {
          this.goToScene(this.sceneIndex + (command.startsWith("back") ? -1 : 1));
          break;
        }
        const step = command.endsWith("Small") ? SMALL_STEP : STEP;
        this.pause();
        this.seek(this.time + (command.startsWith("back") ? -step : step));
        break;
      }
      case "start":
        this.pause();
        this.seek(0);
        break;
      case "end":
        this.pause();
        this.seek(this.duration ?? this.time);
        break;
      case "previousScene": {
        // In the animated view, the start of the current scene first, then the previous one.
        const index = this.sceneIndex;
        const start = this.scenes[index]?.startMs ?? 0;
        this.goToScene(!this.staticView && this.time > start + 250 ? index : index - 1);
        break;
      }
      case "nextScene":
        this.goToScene(this.sceneIndex + 1);
        break;
      case "toggleStatic":
        this.setStatic(!this.staticView);
        break;
    }
  }

  // ---------------------------------------------------------------- selection and drill-down

  /** The title of a view, or its key. */
  titleOf(view: string): string {
    return this.document.names[view]?.title ?? view;
  }

  /** The elements (with a box) and relations (with a track) of a view, in drawing order. */
  items(view: string = this.view): ItemRef[] {
    const scene = this.document.views[view]?.scene;
    if (!scene) return [];
    const elements: ItemRef[] = [];
    const relations: ItemRef[] = [];
    const seen = new Set<string>();
    for (const group of sceneGroups(scene.items)) {
      const key = `${group.role}:${group.id}`;
      if (seen.has(key)) continue;
      if (group.role === "element" && group.bounds)
        elements.push({ role: "element", id: group.id });
      else if (group.role === "relation" && group.track && group.track.length > 1)
        relations.push({ role: "relation", id: group.id });
      else continue;
      seen.add(key);
    }
    return [...elements, ...relations];
  }

  /**
   * Moves the keyboard walk to the next (`1`) or previous (`-1`) item that `shown` accepts,
   * wrapping at the ends; returns the item reached, or null when there is none.
   */
  moveFocus(step: 1 | -1, shown: (item: ItemRef) => boolean = () => true): ItemRef | null {
    const items = this.items().filter(shown);
    if (items.length === 0) return (this.focused = null);
    const current = this.focused;
    const at = current
      ? items.findIndex((i) => i.role === current.role && i.id === current.id)
      : -1;
    const next =
      at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
    return (this.focused = items[next]!);
  }

  /** Selects an item of the view on screen, or clears; false for an unknown item. */
  select(item: ItemRef | null): boolean {
    if (item === null) {
      this.selection = null;
      return true;
    }
    if (!this.items().some((i) => i.role === item.role && i.id === item.id)) return false;
    this.selection = item;
    return true;
  }

  /** What an element of the view on screen opens in the document; null for stories and drills. */
  canOpen(id: string): OpenTarget | null {
    if (this.document.kind !== "effects" || this.drill) return null;
    const target = this.document.details[this.view]?.elements[id]?.opens ?? null;
    return target && this.document.views[target.view] ? target : null;
  }

  private durations(): { cameraMs: number; transitionMs: number } {
    return this.reducedMotion ? { cameraMs: 0, transitionMs: 0 } : { ...DRILL_DURATIONS };
  }

  /** How long the drill-down on its way lasts. */
  get drillDuration(): number {
    const spec = this.drill?.spec;
    return spec ? spec.cameraMs + spec.transitionMs : 0;
  }

  private start(
    spec: DrillSpec,
    select: string | null,
    extra: Readonly<Record<string, StoryViewData>> = {},
  ): void {
    this.drill = { spec, time: 0, extra, select, resume: this.playing };
    this.playing = false;
    this.selection = null;
    this.focused = null;
    if (this.drillDuration <= 0) this.settle();
  }

  private settle(): void {
    const drill = this.drill;
    if (!drill) return;
    this.drill = null;
    this.effectsView = drill.spec.to;
    this.time = 0;
    this.playing = drill.resume && !this.staticView;
    this.selection = drill.select ? { role: "element", id: drill.select } : null;
    const title = this.titleOf(drill.spec.to);
    const t = messages(this.locale).player;
    this.settled = drill.spec.direction === "down" ? t.opened(title) : t.wentUp(title);
  }

  /** Opens what an element of the view on screen opens; false when it opens nothing here. */
  open(id: string): boolean {
    const target = this.canOpen(id);
    if (!target) return false;
    const from = this.view;
    this.trail.push({ view: from, element: id });
    if (this.trail.length > TRAIL_LIMIT) this.trail.shift();
    this.start(
      {
        from,
        to: target.view,
        element: id,
        transition: target.transition,
        direction: "down",
        ...this.durations(),
      },
      target.element,
    );
    return true;
  }

  /**
   * Plays a drill-down into the document's own view from a view the document lacks (a catalog
   * page that came from another page): going down, `element` is in `from`; going up, in the
   * document's view.
   */
  enter(
    from: { readonly key: string; readonly view: StoryViewData },
    element: string,
    direction: "down" | "up",
    transition: "morph" | "fade",
    select: string | null = null,
  ): void {
    if (this.document.kind !== "effects") return;
    this.effectsView = from.key;
    // Going down, the page it came from moved the camera already: the change of view is left.
    const durations = this.durations();
    if (direction === "down") durations.cameraMs = 0;
    this.start(
      {
        from: from.key,
        to: this.document.key,
        element,
        transition,
        direction,
        ...durations,
      },
      select,
      { [from.key]: from.view },
    );
  }

  /** Goes up to a view of the trail (the one just above by default); false when there is none. */
  up(index: number = this.trail.length - 1): boolean {
    if (this.document.kind !== "effects" || this.drill) return false;
    const step = this.trail[index];
    if (!step) return false;
    const above = this.document.views[step.view];
    const here = this.document.views[this.view];
    if (!above || !here) return false;
    this.trail.length = index;
    const written = this.document.details[step.view]?.elements[step.element]?.opens;
    const transition =
      written && written.view === this.view
        ? written.transition
        : transitionFor(above.scene, here.scene, step.element);
    this.start(
      {
        from: this.view,
        to: step.view,
        element: step.element,
        transition,
        direction: "up",
        ...this.durations(),
      },
      step.element,
    );
    return true;
  }

  /** What a settled drill-down says, once: "Opened containers". */
  takeSettled(): string | null {
    const text = this.settled;
    this.settled = null;
    return text;
  }

  /** The title of the story shown, or its id; null for effects. */
  get storyTitle(): string | null {
    const story = this.stories[this.story];
    return story ? (story.title ?? story.id) : null;
  }

  /** What a screen reader hears about the current scene, in the player's language. */
  announcement(): string {
    const scenes = this.scenes;
    const scene = scenes[this.sceneIndex];
    if (!scene) return "";
    return messages(this.locale).player.scene(
      this.sceneIndex + 1,
      scenes.length,
      scene.id,
      scene.title,
    );
  }
}

// ---------------------------------------------------------------------- summary

function phrase(
  doc: StoryPlayerDocument,
  view: string,
  action: TimelineAction,
  locale: Locale,
): string {
  const t = messages(locale).story;
  const labels = doc.names[view]?.labels ?? {};
  const name = (id: string) => labels[id] ?? id;
  const targets = t.list(action.targets.map((target) => name(target.id)));
  const time = formatTime(action.durationMs, locale);
  switch (action.kind) {
    case "reveal":
      return t.reveal(targets, time);
    case "hide":
      return t.hide(targets, time);
    case "highlight":
      return t.highlight(targets, time);
    case "focus":
      return action.all ? t.clearFocus : t.focus(targets);
    case "camera":
      return action.all ? t.frameAll : t.frame(targets);
    case "trace": {
      const id = action.targets[0]?.id ?? "";
      const ends = doc.views[view]?.ends;
      // The arrows of a gantt chart have no names: a trace of them follows the chain into a task.
      const last = ends?.[action.targets[action.targets.length - 1]?.id ?? ""];
      if (labels[id] === undefined && last) return t.traceChain(name(last[1]), time);
      const pair = ends?.[id];
      return t.trace(name(id), pair ? [name(pair[0]), name(pair[1])] : null, time);
    }
    case "draw":
      // The bars of a chart's tasks grow; strokes, lines and relations are drawn stroke by stroke.
      return action.targets.every(
        (target) => doc.details[view]?.elements[target.id]?.kind === "task",
      )
        ? t.drawBars(targets, time)
        : t.draw(targets, time);
    case "hold":
      return t.hold(time);
    case "parallel":
      return t.parallel(action.children.map((c) => phrase(doc, view, c, locale)).join("; "));
  }
}

export interface SummaryScene {
  readonly heading: string;
  readonly items: readonly string[];
}

/**
 * The scenes of a story of the document (its first by default) and their actions in words, with
 * labels instead of ids.
 */
export function storySummary(
  doc: StoryPlayerDocument,
  locale: Locale = DEFAULT_LOCALE,
  story = 0,
): SummaryScene[] {
  const t = messages(locale).story;
  let previous: string | undefined;
  return storyAt(doc, story).timeline.scenes.map((scene, i) => {
    const items: string[] = [];
    const viewTitle = doc.names[scene.view]?.title ?? scene.view.split("#").pop()!;
    if (scene.transition && previous !== undefined && previous !== scene.view) {
      const { kind, durationMs } = scene.transition;
      items.push(
        t.transition(kind, viewTitle, durationMs > 0 ? formatTime(durationMs, locale) : null),
      );
    }
    previous = scene.view;
    for (const action of scene.actions) items.push(phrase(doc, scene.view, action, locale));
    const end = scene.startMs + scene.durationMs;
    return {
      heading: t.scene(
        i + 1,
        scene.title ?? scene.id,
        formatTime(scene.startMs, locale),
        formatTime(end, locale),
      ),
      items,
    };
  });
}

/** The effects of a diagram in words. */
export function effectsSummary(
  doc: EffectsPlayerDocument,
  locale: Locale = DEFAULT_LOCALE,
  view: string = doc.key,
): string[] {
  const t = messages(locale).effects;
  const labels = doc.names[view]?.labels ?? {};
  const ends = doc.views[view]?.ends ?? {};
  return (doc.views[view]?.plan.effects ?? []).map((e) => {
    // An arrow of a gantt chart has no name of its own: the tasks it joins name it.
    const joined = ends[e.target];
    const name =
      labels[e.target] ??
      (joined
        ? messages(locale).player.relation(
            labels[joined[0]] ?? joined[0],
            labels[joined[1]] ?? joined[1],
          )
        : e.target);
    const what =
      e.effect === "flow"
        ? t.flow(name)
        : e.effect === "dash"
          ? t.dash(name)
          : e.effect === "trace"
            ? t.trace(name)
            : t.pulse(name);
    return t.cycle(
      what,
      formatTime(e.durationMs, locale),
      e.repeat === "forever" ? t.forever : t.times(e.repeat),
      e.delayMs > 0 ? formatTime(e.delayMs, locale) : null,
    );
  });
}
