// The browser runtime of the player: `<meltemi-player>` and `mountPlayer`. It is bundled into one
// script with motion and the renderer, and draws every frame with the same functions as the
// command line and the canvas. Zoom, cards, the panel and drill-downs are drawn around the frame,
// never in it.
import { percent, resolveLocale, type Locale } from "@meltemi/diagrams-i18n";
import type { Point, Size, Viewport } from "@meltemi/diagrams-layout/viewport";
import { DRILL_DURATIONS, type DrillSpec, type StoryViewData } from "@meltemi/diagrams-motion";
import {
  DetailPanel,
  HoverCard,
  Trail,
  type CardContent,
  type Crumb,
  type PanelContent,
  type PanelFact,
  type PanelSectionContent,
} from "./cards.js";
import {
  PlayerController,
  commandForKey,
  effectsSummary,
  formatTime,
  storySummary,
  type ItemRef,
  type PlayerOptions,
} from "./controller.js";
import { el, icon, ICONS, quote } from "./dom.js";
import { easedDrillTime } from "./ease.js";
import { isPlayerDocument, type PlayerDocument } from "./format.js";
import { drillSvg, frameSvg } from "./frame.js";
import { messages } from "./messages/index.js";
import { Stage } from "./stage.js";
import { STYLE } from "./style.js";
import { viewerCommandForKey, type ViewerCommand } from "./viewport.js";

export { frameSvg };

/** An element or relation of a view, as hosts and events name it. */
export interface DetailRef extends ItemRef {
  readonly view: string;
}

/** Something a host opens for an element: a page of its own, with the transition to it. */
export interface HostTarget {
  /** What it opens, for the panel's button and the badge: "Containers of Commerce". */
  readonly label: string;
  readonly transition: "morph" | "fade" | "none";
  /** Anything the host needs to navigate. */
  readonly data?: unknown;
}

/** Links a host adds to the detail panel. */
export interface PanelSection {
  readonly heading: string;
  readonly items: readonly { readonly label: string; readonly href: string }[];
}

/** A view above the document's own, which the host knows: a catalog page. */
export interface HostCrumb {
  readonly title: string;
  go(): void;
}

/** A drill-down that a host plays into the document's own view as the player mounts. */
export interface EnterTransition {
  readonly fromKey: string;
  readonly from: StoryViewData;
  /** Going down, the element of `from` that opens the document; going up, the document's. */
  readonly element: string;
  readonly direction: "down" | "up";
  readonly transition: "morph" | "fade";
  /** The element to select once it settles. */
  readonly select?: string | null;
}

export interface MountOptions extends PlayerOptions {
  /** False hides the controls; the keyboard still works. */
  readonly controls?: boolean;
  /** False leaves out the text summary, for hosts that describe the drawing themselves. */
  readonly summary?: boolean;
  /**
   * The language of the controls, announcements and summary; by default the host's, as its
   * nearest `lang` attribute gives it, else English.
   */
  readonly locale?: Locale;
  /** False draws the frame and the playback controls only: no zoom, cards, panel or opening. */
  readonly interactive?: boolean;
  /** An element to select once mounted (a catalog's `?element=`). */
  readonly select?: string | null;
  /** What a host opens for an element the document opens nothing for. */
  readonly targets?: (view: string, id: string) => HostTarget | null;
  /** Called with a host's target after the camera moves to the element. */
  readonly onNavigate?: (target: HostTarget, origin: { view: string; id: string }) => void;
  /** Links a host adds to the panel of an element or relation. */
  readonly sections?: (ref: DetailRef) => readonly PanelSection[];
  /** The views a host knows above the document's own, outermost first. */
  readonly trail?: readonly HostCrumb[];
  /** A drill-down to play into the document as it mounts. */
  readonly enter?: EnterTransition;
}

/** A mounted player. */
export interface PlayerHandle {
  readonly controller: PlayerController;
  /**
   * The SVG of the frame on screen, exactly as the renderer wrote it; during a drill-down, the
   * frame of the view it settles on.
   */
  readonly svg: string;
  /** The user's zoom and pan; never part of `svg`. */
  readonly viewport: Viewport;
  readonly zoom: number;
  /** The key of the view on screen. */
  readonly view: string;
  /** The titles of the views above the one on screen, outermost first. */
  readonly trail: readonly string[];
  readonly selection: DetailRef | null;
  play(): void;
  pause(): void;
  seek(ms: number): void;
  goToScene(index: number): void;
  setStatic(on: boolean): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  actualSize(): void;
  /** A zoom around a stage point, the stage's centre by default. */
  setZoom(zoom: number, at?: Point): void;
  zoomTo(zoom: number, at?: Point): void;
  panBy(dx: number, dy: number): void;
  /** A point of the scene on screen, in stage pixels. */
  project(point: Point): Point;
  /** Selects an element (by id) or an item; false when the view has none such. */
  select(target: string | ItemRef | null): boolean;
  /** Selects an item and opens its panel; false when the view has none such. */
  showDetails(target: string | ItemRef): boolean;
  closeDetails(): void;
  /** What a double click does: opens what the element opens; false when nothing. */
  open(id: string): boolean;
  /** Goes up one view; false at the top. */
  up(): boolean;
  destroy(): void;
}

/** Loads the documents' font faces into the page once: faces declared in shadow roots are unused. */
function loadFonts(rules: readonly string[]): void {
  if (rules.length === 0) return;
  const text = rules.join("\n");
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const key = `meltemi-${(hash >>> 0).toString(36)}`;
  if (document.head.querySelector(`style[data-meltemi-fonts="${key}"]`)) return;
  document.head.append(el("style", { "data-meltemi-fonts": key }, text));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The language of an element: its nearest `lang` attribute, else English. */
function localeOf(element: Element): Locale {
  return resolveLocale(element.closest("[lang]")?.getAttribute("lang"));
}

const sameItem = (a: ItemRef | null, b: ItemRef | null) =>
  a === b || (a !== null && b !== null && a.role === b.role && a.id === b.id);

/** How long the pointer rests on an item before its card shows, and how long a card stays warm. */
const CARD_DELAY = 400;
const CARD_WARM = 300;

/** Plays a player document in `host`, inside its shadow root. */
export function mountPlayer(
  host: HTMLElement,
  data: PlayerDocument,
  options: MountOptions = {},
): PlayerHandle {
  const locale = options.locale ?? localeOf(host);
  const t = messages(locale);
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  const controller = new PlayerController(data, { ...options, locale, reducedMotion });
  const interactive = options.interactive !== false;
  loadFonts(data.fontFaces);
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.replaceChildren();
  const story = data.kind === "story";

  // ------------------------------------------------------------------ the pieces of the page

  const card = new HoverCard();
  const panel = new DetailPanel(t.details, () => closePanel(true));
  const trail = new Trail(t.trail.label);
  const live = el("div", { class: "sr", "aria-live": "polite", role: "status" });
  const hint = el("span", { class: "sr", id: "hint" }, t.player.hint);
  let hover: ItemRef | null = null;

  const stage = new Stage(root, interactive, {
    hover: (item, event) => hovered(item, event),
    click: (item) => clicked(item),
    open: (id) => {
      open(id);
    },
    moved: () => {
      card.hide();
      zoomUi();
    },
    resized: (size) => {
      figure.dataset.details = size.width < 720 || size.height < 280 ? "below" : "side";
    },
    container: (id) => data.details[controller.view]?.elements[id]?.kind === "group",
  });
  stage.frame.style.setProperty("--meltemi-accent", data.accent);
  if (interactive) {
    stage.frame.setAttribute("aria-describedby", "hint");
    stage.body.append(panel.element);
  }

  const play = el("button", { type: "button", class: "play" });
  const previous = el(
    "button",
    { type: "button", "aria-label": t.controls.previous, title: t.controls.previousTitle },
    icon(ICONS.previous),
  );
  const next = el(
    "button",
    { type: "button", "aria-label": t.controls.next, title: t.controls.nextTitle },
    icon(ICONS.next),
  );
  const progress = el("input", {
    type: "range",
    min: "0",
    step: "100",
    "aria-label": t.controls.progress,
  });
  progress.style.accentColor = data.accent;
  const time = el("span", { class: "time", "aria-hidden": "true" });
  const scenes = el("select", { "aria-label": t.controls.scene });
  const staticButton = el(
    "button",
    { type: "button", "aria-label": t.controls.staticView, title: t.controls.staticTitle },
    icon(ICONS.static),
  );
  const playback = el(
    "span",
    { class: "playback" },
    play,
    ...(story ? [previous, next] : []),
    progress,
    time,
    ...(story ? [scenes] : []),
    staticButton,
  );
  const zoomOut = el(
    "button",
    { type: "button", "aria-label": t.controls.zoomOut, title: t.controls.zoomOutTitle },
    icon(ICONS.zoomOut),
  );
  const zoomLevel = el("button", {
    type: "button",
    class: "level",
    title: t.controls.actualSizeTitle,
  });
  const zoomIn = el(
    "button",
    { type: "button", "aria-label": t.controls.zoomIn, title: t.controls.zoomInTitle },
    icon(ICONS.zoomIn),
  );
  const fitButton = el(
    "button",
    { type: "button", "aria-label": t.controls.fit, title: t.controls.fitTitle },
    icon(ICONS.fit),
  );
  const zoomGroup = el(
    "div",
    { class: "zoom", role: "group", "aria-label": t.controls.zoomGroup },
    zoomOut,
    zoomLevel,
    zoomIn,
    fitButton,
  );
  const controls = el(
    "div",
    { class: "controls", role: "group", "aria-label": t.controls.group },
    playback,
    ...(interactive ? [zoomGroup] : []),
  );
  if (options.controls === false) controls.hidden = true;
  for (const [i, scene] of controller.scenes.entries()) {
    scenes.append(el("option", { value: String(i) }, `${i + 1}. ${scene.title ?? scene.id}`));
  }

  const summary = el("details", { class: "summary" }, el("summary", {}, t.story.summary));
  const summaryText = el("div");
  const elementsList = el("ul", { class: "elements", "aria-label": t.details.elements });
  summary.append(summaryText);
  if (interactive) summary.append(elementsList);
  const figure = el("figure", {
    class: "player",
    "aria-label": story
      ? t.player.story(data.title ?? data.id)
      : t.player.diagram(data.title ?? data.id),
  });
  figure.append(
    ...(interactive ? [trail.element] : []),
    stage.body,
    controls,
    live,
    ...(interactive ? [hint, card.element] : []),
    ...(options.summary === false ? [] : [summary]),
  );
  root.append(el("style", {}, STYLE), figure);

  // ------------------------------------------------------------------ the view on screen

  const viewData = (key: string): StoryViewData | undefined =>
    controller.drill?.extra[key] ?? data.views[key];
  const sizeOf = (key: string): Size => {
    const scene = viewData(key)?.scene;
    return scene ? { width: scene.width, height: scene.height } : { width: 1, height: 1 };
  };
  /** A story keeps one stage for all its views; an effects document fits the view on screen. */
  const storySize: Size | null = story
    ? Object.values(data.views).reduce(
        (size, view) => ({
          width: Math.max(size.width, view.scene.width),
          height: Math.max(size.height, view.scene.height),
        }),
        { width: 1, height: 1 },
      )
    : null;
  /** A view's title; a story's frame is named by the story. */
  const titleOf = (view: string) =>
    data.kind === "story" || view === data.key
      ? (data.title ?? data.names[view]?.title ?? data.id)
      : controller.titleOf(view);
  const labelOf = (view: string, id: string) => data.names[view]?.labels[id] ?? id;
  const details = (view: string) => data.details[view];

  /** What a host opens for an element, when the document opens nothing. */
  const hostTarget = (view: string, id: string): HostTarget | null =>
    data.kind === "effects" && !controller.canOpen(id)
      ? (options.targets?.(view, id) ?? null)
      : null;
  /** The name of what an element opens, or null. */
  const opensName = (view: string, id: string): string | null => {
    const target = controller.canOpen(id);
    if (target) return controller.titleOf(target.view);
    return hostTarget(view, id)?.label ?? null;
  };

  /** A relation's name: its label, else its ends. */
  const relationName = (view: string, key: string) => {
    const label = details(view)?.relations[key]?.label;
    if (label) return label;
    const ends = viewData(view)?.ends[key];
    return ends ? t.player.relation(labelOf(view, ends[0]), labelOf(view, ends[1])) : key;
  };
  const itemName = (view: string, item: ItemRef) =>
    item.role === "element" ? labelOf(view, item.id) : relationName(view, item.id);

  // ------------------------------------------------------------------ cards and panel

  const cardContent = (view: string, item: ItemRef): CardContent | null => {
    const info = details(view);
    if (!info) return null;
    if (item.role === "element") {
      const e = info.elements[item.id];
      if (!e) return null;
      const meta = [e.type, e.technology, e.external && !e.type ? t.details.external : null]
        .filter((x): x is string => Boolean(x))
        .join(" · ");
      return {
        title: labelOf(view, item.id),
        meta: meta || null,
        ends: null,
        text: e.description,
        note: null,
        url: e.url,
      };
    }
    const r = info.relations[item.id];
    if (!r) return null;
    const ends = viewData(view)?.ends[item.id];
    const between = ends ? t.player.relation(labelOf(view, ends[0]), labelOf(view, ends[1])) : null;
    return {
      title: relationName(view, item.id),
      meta: [r.technology, r.async ? t.details.async : null].filter(Boolean).join(" · ") || null,
      ends: r.label ? between : null,
      text: r.description,
      note: r.assumption ? t.details.assumed(r.assumption) : null,
      url: null,
    };
  };

  let cardTimer = 0;
  let warmUntil = 0;
  const showCard = (item: ItemRef, pointer: Point) => {
    const content = cardContent(controller.view, item);
    if (!content || controller.drill) return;
    const group =
      item.role === "element"
        ? stage.picture.querySelector(`[data-id=${quote(item.id)}][data-role="element"]`)
        : null;
    card.show(content, group?.getBoundingClientRect() ?? null, pointer);
  };
  const hideCard = () => {
    clearTimeout(cardTimer);
    if (card.visible) warmUntil = performance.now() + CARD_WARM;
    card.hide();
  };
  const hovered = (item: ItemRef | null, event: PointerEvent) => {
    if (sameItem(item, hover)) return;
    hover = item;
    clearTimeout(cardTimer);
    overlay();
    if (!item || event.pointerType === "touch") {
      hideCard();
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    if (card.visible || performance.now() < warmUntil) showCard(item, pointer);
    else cardTimer = window.setTimeout(() => showCard(item, pointer), CARD_DELAY);
  };

  const panelContent = (view: string, item: ItemRef): PanelContent | null => {
    const info = details(view);
    const ends = viewData(view)?.ends ?? {};
    if (!info) return null;
    const ref: DetailRef = { ...item, view };
    const hostSections: PanelSectionContent[] = (options.sections?.(ref) ?? []).map((s) => ({
      heading: s.heading,
      items: s.items.map((i) => ({ label: i.label, href: i.href })),
    }));
    if (item.role === "element") {
      const e = info.elements[item.id];
      if (!e) return null;
      const facts: PanelFact[] = [];
      if (e.technology) facts.push({ term: t.details.technology, value: e.technology });
      if (e.url) facts.push({ term: t.details.link, value: e.url, href: e.url, linkText: e.url });
      const outgoing: { label: string; action: () => void }[] = [];
      const incoming: { label: string; action: () => void }[] = [];
      for (const [key, [from, to]] of Object.entries(ends)) {
        const r = info.relations[key];
        const words = [r?.label, r?.technology].filter(Boolean).join(" · ");
        const pick = () => showDetails({ role: "relation", id: key });
        if (from === item.id)
          outgoing.push({
            label: words ? `${labelOf(view, to)} · ${words}` : labelOf(view, to),
            action: pick,
          });
        if (to === item.id)
          incoming.push({
            label: words ? `${labelOf(view, from)} · ${words}` : labelOf(view, from),
            action: pick,
          });
      }
      const target = controller.canOpen(item.id);
      const hostOpen = hostTarget(view, item.id);
      const openName = target ? controller.titleOf(target.view) : (hostOpen?.label ?? null);
      const type = [e.type, e.external && !e.type ? t.details.external : null]
        .filter(Boolean)
        .join(" · ");
      const sections: PanelSectionContent[] = [];
      if (outgoing.length > 0) sections.push({ heading: t.details.outgoing, items: outgoing });
      if (incoming.length > 0) sections.push({ heading: t.details.incoming, items: incoming });
      if (outgoing.length === 0 && incoming.length === 0)
        sections.push({ heading: t.details.relations, items: [], empty: t.details.noRelations });
      return {
        name: t.details.region(labelOf(view, item.id)),
        title: labelOf(view, item.id),
        type: type || null,
        facts,
        description: e.description,
        open:
          openName === null
            ? null
            : {
                label: t.details.open(openName),
                title: t.details.openTitle,
                run: () => open(item.id),
              },
        sections: [...sections, ...hostSections],
      };
    }
    const r = info.relations[item.id];
    if (!r) return null;
    const pair = ends[item.id];
    const facts: PanelFact[] = [];
    if (r.technology) facts.push({ term: t.details.technology, value: r.technology });
    if (r.assumption) facts.push({ term: t.details.assumption, value: r.assumption });
    const kind = [
      r.sources.length > 0 && data.details[view]?.c4
        ? `${t.details.standsFor(r.sources.length)}${r.derived ? ` · ${t.details.lifted}` : ""}`
        : null,
      r.async ? t.details.async : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const endItem = (id: string) => ({
      label: labelOf(view, id),
      action: () => showDetails({ role: "element", id }),
    });
    return {
      name: t.details.region(relationName(view, item.id)),
      title: relationName(view, item.id),
      type: kind || null,
      facts,
      description: r.description,
      open: null,
      sections: [
        ...(pair
          ? [
              { heading: t.details.from, items: [endItem(pair[0])] },
              { heading: t.details.to, items: [endItem(pair[1])] },
            ]
          : []),
        ...hostSections,
      ],
    };
  };

  const dispatch = (type: string, detail: unknown) =>
    host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

  const closePanel = (focusFrame: boolean) => {
    panel.hide();
    if (focusFrame) stage.frame.focus({ preventScroll: true });
  };

  /** Selects an item of the view on screen; opens its panel when asked. */
  const select = (item: ItemRef | null, withPanel: boolean, focusPanel = false): boolean => {
    if (!interactive) return false;
    if (!controller.select(item)) return false;
    overlay();
    const view = controller.view;
    if (item === null) {
      panel.hide();
      announce(t.player.cleared);
      dispatch("meltemi-select", null);
      return true;
    }
    if (withPanel) {
      const content = panelContent(view, item);
      if (content) panel.show(content, `${view}|${item.role}|${item.id}`);
      if (focusPanel) panel.focus();
    } else if (panel.open) {
      const content = panelContent(view, item);
      if (content) panel.show(content, `${view}|${item.role}|${item.id}`);
    }
    announce(t.player.selected(itemName(view, item)));
    dispatch("meltemi-select", { view, role: item.role, id: item.id });
    return true;
  };
  const showDetails = (item: ItemRef, focusPanel = false) => select(item, true, focusPanel);

  const clicked = (item: ItemRef | null) => {
    hideCard();
    if (controller.drill || moving) return;
    if (item === null) {
      if (controller.selection) select(null, false);
      return;
    }
    showDetails(item);
  };

  // ------------------------------------------------------------------ overlay, trail, lists

  const overlay = () => {
    if (!interactive) return;
    const view = controller.view;
    const badges = new Map<string, string>();
    if (!controller.drill && data.kind === "effects") {
      for (const id of Object.keys(details(view)?.elements ?? {})) {
        const name = opensName(view, id);
        if (name !== null) badges.set(id, `${t.details.open(name)} (${t.details.openTitle})`);
      }
    }
    stage.render({
      scene: controller.drill ? null : (viewData(view)?.scene ?? null),
      hover,
      selection: controller.selection,
      focus: controller.focused,
      badges,
    });
  };

  let shownView = "";
  /** Rebuilds what depends on the view on screen: the trail, the lists and the playback. */
  const viewChanged = () => {
    const view = controller.view;
    if (view === shownView || controller.drill) return;
    shownView = view;
    if (interactive) {
      const crumbs: Crumb[] = [
        ...(options.trail ?? []).map((c) => ({ title: c.title, go: () => c.go() })),
        ...controller.trail.map((step, index) => ({
          title: titleOf(step.view),
          go: () => {
            if (prepareDrill()) {
              controller.up(index);
              run();
            }
          },
        })),
      ];
      const above = crumbs[crumbs.length - 1];
      trail.show(
        crumbs,
        titleOf(view),
        above ? { up: t.trail.up(above.title), upTitle: t.trail.upTitle(above.title) } : null,
      );
      const buttons = Object.keys(details(view)?.elements ?? {}).map((id) => {
        const name = opensName(view, id);
        const label = name ? `${labelOf(view, id)}, ${t.details.opens(name)}` : labelOf(view, id);
        const button = el("button", { type: "button" }, label);
        button.addEventListener("click", () => showDetails({ role: "element", id }));
        return el("li", {}, button);
      });
      elementsList.replaceChildren(...buttons);
      elementsList.hidden = buttons.length === 0;
    }
    if (data.kind === "story") {
      if (summaryText.childElementCount === 0) {
        const list = el("ol");
        for (const scene of storySummary(data, locale)) {
          list.append(
            el(
              "li",
              {},
              scene.heading,
              el("ul", {}, ...scene.items.map((item) => el("li", {}, item))),
            ),
          );
        }
        summaryText.replaceChildren(list);
      }
    } else {
      const items = effectsSummary(data, locale, view);
      summaryText.replaceChildren(
        el(
          "ul",
          {},
          ...(items.length > 0 ? items : [t.effects.none]).map((item) => el("li", {}, item)),
        ),
      );
    }
    const hasEffects = !story && (data.views[view]?.plan.effects.length ?? 0) > 0;
    playback.hidden = !story && !hasEffects;
    controls.hidden = options.controls === false || (!interactive && playback.hidden);
    const endless = controller.duration === null;
    progress.hidden = endless;
    time.hidden = endless;
    stage.frame.dataset.view = view;
  };

  // ------------------------------------------------------------------ zoom

  const zoomUi = () => {
    if (!interactive) return;
    const viewer = stage.viewer;
    const text = percent(locale, viewer.zoom);
    zoomLevel.textContent = text;
    zoomLevel.setAttribute("aria-label", t.controls.zoomLevel(text));
    zoomOut.disabled = viewer.atMin;
    zoomIn.disabled = viewer.atMax;
  };
  const runViewer = (command: ViewerCommand, announceIt = true) => {
    hideCard();
    const focused = controller.focused;
    const at =
      focused && command.startsWith("zoom") && command !== "zoomFit"
        ? focusPoint(focused)
        : undefined;
    stage.viewer.run(command, at);
    stage.apply(command === "zoomFit" || command === "zoomActual" ? "slow" : "animate");
    zoomUi();
    if (announceIt && command.startsWith("zoom")) {
      const text = percent(locale, stage.viewer.zoom);
      announce(stage.viewer.atFit ? t.player.fitted(text) : t.player.zoom(text));
    }
  };
  /** The stage point at the centre of an item, for zooms around the focused one. */
  const focusPoint = (item: ItemRef): Point | undefined => {
    const box = boxOf(item);
    if (!box) return undefined;
    const content = stage.toContent(box);
    return stage.viewer.toScreen({
      x: content.x + content.width / 2,
      y: content.y + content.height / 2,
    });
  };
  const boxOf = (item: ItemRef) => {
    const scene = viewData(controller.view)?.scene;
    if (!scene) return null;
    const stack = [...scene.items];
    while (stack.length > 0) {
      const g = stack.shift()!;
      if (g.kind !== "group") continue;
      if (g.id === item.id && g.role === item.role) {
        if (g.bounds) return g.bounds;
        if (g.track && g.track.length > 0) {
          const xs = g.track.map((p) => p.x);
          const ys = g.track.map((p) => p.y);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
        }
      }
      stack.push(...g.items);
    }
    return null;
  };

  // ------------------------------------------------------------------ opening and going up

  /** A host's target on its way: the camera moves to the element, then the host navigates. */
  let moving: {
    spec: DrillSpec;
    time: number;
    target: HostTarget;
    id: string;
    done: boolean;
  } | null = null;

  /** Before a drill-down: back to the whole drawing, no card, no panel. */
  const prepareDrill = (): boolean => {
    if (controller.drill || moving) return false;
    hideCard();
    panel.hide();
    stage.viewer.fit();
    stage.apply("animate");
    zoomUi();
    return true;
  };

  const open = (id: string): boolean => {
    if (!interactive || controller.drill || moving || data.kind !== "effects") return false;
    if (controller.canOpen(id)) {
      prepareDrill();
      controller.open(id);
      run();
      return true;
    }
    const target = hostTarget(controller.view, id);
    if (!target) {
      select({ role: "element", id }, false);
      return false;
    }
    prepareDrill();
    const view = controller.view;
    const cameraMs = reducedMotion || target.transition === "none" ? 0 : DRILL_DURATIONS.cameraMs;
    moving = {
      spec: {
        from: view,
        to: view,
        element: id,
        transition: "fade",
        direction: "down",
        cameraMs,
        transitionMs: 0,
      },
      time: 0,
      target,
      id,
      done: false,
    };
    run();
    return true;
  };

  const navigate = () => {
    const move = moving;
    if (!move || move.done) return;
    move.done = true;
    const origin = { view: controller.view, id: move.id };
    options.onNavigate?.(move.target, origin);
    dispatch("meltemi-navigate", { target: move.target, origin });
    // A host that does not leave the page gets its drawing back.
    window.setTimeout(() => {
      if (moving !== move) return;
      moving = null;
      draw();
    }, 1000);
  };

  const goUp = (): boolean => {
    if (!interactive || controller.drill || moving) return false;
    if (controller.trail.length > 0) {
      prepareDrill();
      controller.up();
      run();
      return true;
    }
    return trail.goUp();
  };

  // ------------------------------------------------------------------ drawing

  let svg = "";
  let announced = -1;
  let request = 0;
  let last = 0;

  const announce = (text: string) => {
    if (text) live.textContent = text;
  };

  const drillSize = (spec: DrillSpec, eased: number): Size => {
    const down = spec.direction === "down";
    const parent = sizeOf(down ? spec.from : spec.to);
    const child = sizeOf(down ? spec.to : spec.from);
    const duration = spec.cameraMs + spec.transitionMs;
    const forward = down ? eased : duration - eased;
    if (forward <= spec.cameraMs || spec.transitionMs <= 0) return parent;
    const p = Math.min(1, (forward - spec.cameraMs) / spec.transitionMs);
    return {
      width: parent.width + (child.width - parent.width) * p,
      height: parent.height + (child.height - parent.height) * p,
    };
  };

  const draw = () => {
    const drill = controller.drill;
    let markup: string;
    if (drill) {
      const eased = easedDrillTime(drill.spec, drill.time);
      markup = drillSvg(data, drill.spec, eased, drill.extra);
      stage.setSize(drillSize(drill.spec, eased));
    } else if (moving) {
      const camera = moving.spec.cameraMs;
      const at =
        camera <= 0 ? 0 : Math.min(camera - 0.01, easedDrillTime(moving.spec, moving.time));
      markup = drillSvg(data, moving.spec, Math.max(0, at));
    } else {
      markup = frameSvg(data, controller.frameTime, {
        static: controller.staticView,
        view: controller.view,
      });
      svg = markup;
      stage.setSize(storySize ?? sizeOf(controller.view));
    }
    const settled = controller.takeSettled();
    viewChanged();
    if (stage.draw(markup) || settled) overlay();
    if (settled) {
      announce(settled);
      stage.viewer.fit();
      stage.apply("direct");
      zoomUi();
      dispatch("meltemi-view", { view: controller.view, title: titleOf(controller.view) });
      const selected = controller.selection;
      if (selected) dispatch("meltemi-select", { view: controller.view, ...selected });
    }
    const playing = controller.playing;
    play.replaceChildren(icon(playing ? ICONS.pause : ICONS.play));
    const label = playing ? t.controls.pause : t.controls.play;
    play.setAttribute("aria-label", label);
    play.title = t.controls.playTitle(label);
    play.disabled = !controller.canPlay;
    const duration = controller.duration ?? 0;
    progress.max = String(duration);
    progress.value = String(Math.round(controller.time));
    const now = formatTime(controller.time, locale);
    const end = formatTime(duration, locale);
    progress.setAttribute("aria-valuetext", t.controls.position(now, end));
    time.textContent = `${now} / ${end}`;
    const index = controller.sceneIndex;
    scenes.value = String(index);
    previous.disabled = index === 0 && (controller.staticView || controller.time === 0);
    next.disabled = index >= controller.scenes.length - 1;
    staticButton.setAttribute("aria-pressed", String(controller.staticView));
    const announcement = controller.announcement();
    const title = titleOf(controller.view);
    const name = announcement ? `${title}. ${announcement}` : title;
    stage.frame.setAttribute("aria-label", interactive ? t.player.interactive(name) : name);
    if (story && index !== announced) {
      announced = index;
      announce(announcement);
    }
  };

  const animating = () =>
    controller.playing || controller.drill !== null || (moving !== null && !moving.done);
  const loop = (now: number) => {
    const elapsed = now - last;
    last = now;
    if (moving && !moving.done) {
      moving.time += elapsed;
      if (moving.time >= moving.spec.cameraMs) navigate();
    } else controller.tick(elapsed);
    draw();
    if (animating()) request = requestAnimationFrame(loop);
  };
  const run = () => {
    cancelAnimationFrame(request);
    if (moving && !moving.done && moving.spec.cameraMs <= 0) navigate();
    if (animating()) {
      last = performance.now();
      request = requestAnimationFrame(loop);
    }
    draw();
  };

  // ------------------------------------------------------------------ controls and keys

  play.addEventListener("click", () => {
    controller.toggle();
    run();
  });
  previous.addEventListener("click", () => {
    controller.run("previousScene");
    run();
  });
  next.addEventListener("click", () => {
    controller.run("nextScene");
    run();
  });
  staticButton.addEventListener("click", () => {
    controller.setStatic(!controller.staticView);
    run();
  });
  progress.addEventListener("input", () => {
    controller.pause();
    controller.seek(Number(progress.value));
    run();
  });
  scenes.addEventListener("change", () => {
    controller.pause();
    controller.goToScene(Number(scenes.value));
    run();
  });
  zoomIn.addEventListener("click", () => runViewer("zoomIn"));
  zoomOut.addEventListener("click", () => runViewer("zoomOut"));
  zoomLevel.addEventListener("click", () => runViewer("zoomActual"));
  fitButton.addEventListener("click", () => runViewer("zoomFit"));

  /** The keyboard walk: focus the next item shown, reveal it and say what it is. */
  const walk = (step: 1 | -1) => {
    const item = controller.moveFocus(step, (i) => {
      const group = stage.picture.querySelector(`[data-id=${quote(i.id)}][data-role="${i.role}"]`);
      if (!group) return false;
      for (let at: Element | null = group; at && at !== stage.picture; at = at.parentElement) {
        if (at.getAttribute("opacity") === "0") return false;
      }
      return true;
    });
    overlay();
    if (!item) return;
    const box = boxOf(item);
    if (box) {
      stage.viewer.reveal(stage.toContent(box));
      stage.apply("animate");
      zoomUi();
    }
    const view = controller.view;
    const type = item.role === "element" ? (details(view)?.elements[item.id]?.type ?? null) : null;
    announce(t.player.focused(itemName(view, item), type));
  };

  figure.addEventListener("pointerdown", () => hideCard(), { capture: true });
  figure.addEventListener("wheel", () => hideCard(), { capture: true, passive: true });
  figure.addEventListener("keydown", (e) => {
    hideCard();
    const target = e.target as Element;
    if (target instanceof HTMLSelectElement) return;
    // The slider steps with its own keys; buttons click with Space and Enter.
    if (target instanceof HTMLInputElement && /^(Arrow|Home|End)/.test(e.key)) return;
    if (target instanceof HTMLButtonElement && (e.key === " " || e.key === "Enter")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (interactive && panel.element.contains(target)) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel(true);
      }
      return;
    }
    if (interactive) {
      const onStage = target === stage.frame;
      const viewerCommand = viewerCommandForKey(e.key, e.shiftKey);
      if (viewerCommand) {
        e.preventDefault();
        runViewer(viewerCommand);
        return;
      }
      if (onStage && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        walk(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (onStage && e.key === "Enter") {
        e.preventDefault();
        const focused = controller.focused;
        const selected = controller.selection;
        if (focused && !sameItem(focused, selected)) showDetails(focused, true);
        else if (selected?.role === "element" && opensName(controller.view, selected.id) !== null)
          open(selected.id);
        else if (selected) showDetails(selected, true);
        return;
      }
      if (onStage && e.key === "Backspace") {
        if (goUp()) e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (panel.open) {
          e.preventDefault();
          closePanel(true);
        } else if (controller.selection || controller.focused) {
          e.preventDefault();
          controller.focused = null;
          select(null, false);
        }
        return;
      }
    }
    const command = commandForKey(e.key);
    if (!command) return;
    e.preventDefault();
    controller.run(command);
    run();
  });

  // ------------------------------------------------------------------ mount

  if (options.enter && data.kind === "effects" && interactive) {
    const enter = options.enter;
    controller.enter(
      { key: enter.fromKey, view: enter.from },
      enter.element,
      enter.direction,
      enter.transition,
      enter.select ?? null,
    );
  }
  run();
  zoomUi();
  if (options.select && !controller.drill) {
    if (select({ role: "element", id: options.select }, false)) {
      const box = boxOf({ role: "element", id: options.select });
      if (box) {
        stage.viewer.reveal(stage.toContent(box));
        stage.apply("direct");
      }
    }
  }

  const resolve = (target: string | ItemRef): ItemRef =>
    typeof target === "string" ? { role: "element", id: target } : target;

  return {
    controller,
    get svg() {
      const drill = controller.drill;
      return drill
        ? frameSvg(data, 0, { static: controller.staticView, view: drill.spec.to })
        : svg;
    },
    get viewport() {
      return stage.viewer.viewport;
    },
    get zoom() {
      return stage.viewer.zoom;
    },
    get view() {
      return controller.view;
    },
    get trail() {
      return [
        ...(options.trail ?? []).map((c) => c.title),
        ...controller.trail.map((s) => titleOf(s.view)),
      ];
    },
    get selection() {
      const s = controller.selection;
      return s ? { ...s, view: controller.view } : null;
    },
    play: () => {
      controller.play();
      run();
    },
    pause: () => {
      controller.pause();
      run();
    },
    seek: (ms) => {
      controller.seek(ms);
      run();
    },
    goToScene: (index) => {
      controller.goToScene(index);
      run();
    },
    setStatic: (on) => {
      controller.setStatic(on);
      run();
    },
    zoomIn: () => runViewer("zoomIn", false),
    zoomOut: () => runViewer("zoomOut", false),
    fit: () => runViewer("zoomFit", false),
    actualSize: () => runViewer("zoomActual", false),
    setZoom: (zoom, at) => {
      stage.viewer.setZoom(zoom, at);
      stage.apply("animate");
      zoomUi();
    },
    zoomTo: (zoom, at) => {
      stage.viewer.setZoom(zoom, at);
      stage.apply("animate");
      zoomUi();
    },
    panBy: (dx, dy) => {
      stage.viewer.panBy(dx, dy);
      stage.apply("direct");
      zoomUi();
    },
    project: (point) => {
      const content = stage.toContent({ ...point, width: 0, height: 0 });
      return stage.viewer.toScreen(content);
    },
    select: (target) => select(target === null ? null : resolve(target), panel.open),
    showDetails: (target) => showDetails(resolve(target)),
    closeDetails: () => closePanel(false),
    open: (id) => open(id),
    up: () => goUp(),
    destroy: () => {
      cancelAnimationFrame(request);
      clearTimeout(cardTimer);
      stage.destroy();
      root.replaceChildren();
    },
  };
}

/** `<meltemi-player>`: plays the JSON document of its `<script type="application/json">`. */
class MeltemiPlayerElement extends HTMLElement {
  player: PlayerHandle | undefined;

  connectedCallback(): void {
    if (this.player) return;
    // A player pasted after the runtime is upgraded before its data is parsed.
    if (document.readyState === "loading" && !this.querySelector("script")) {
      document.addEventListener("DOMContentLoaded", () => this.connectedCallback(), { once: true });
      return;
    }
    // The element's language, or its page's: an exported fragment carries its own.
    const locale = localeOf(this);
    let data: unknown;
    try {
      data = JSON.parse(this.querySelector('script[type="application/json"]')?.textContent ?? "");
    } catch {
      data = undefined;
    }
    if (!isPlayerDocument(data)) {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      root.textContent = messages(locale).player.unreadable;
      return;
    }
    this.player = mountPlayer(this, data, {
      autoplay: this.hasAttribute("autoplay"),
      loop: this.hasAttribute("loop"),
      static: this.hasAttribute("static"),
      controls: this.getAttribute("controls") !== "false",
      interactive: this.getAttribute("interactive") !== "false",
      locale,
    });
  }

  disconnectedCallback(): void {
    this.player?.pause();
  }
}

if (!customElements.get("meltemi-player")) {
  customElements.define("meltemi-player", MeltemiPlayerElement);
}
(globalThis as { MeltemiPlayer?: unknown }).MeltemiPlayer = { mountPlayer, frameSvg, version: 2 };
