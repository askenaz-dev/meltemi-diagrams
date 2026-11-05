// The family's sea where the page waits (`playground-sea`): `@meltemi/ocean`'s `diagrams` state,
// its points lifting and linking into a small flow while the fleet of Meltemi marks sails on it. A
// moment plays once and comes to rest within 5 seconds (design D3): its progress forms the flow,
// then the sea's own time slows to a stop, so the waves and the boats settle instead of freezing.
// Under reduced motion it draws one frame at rest and asks for no animation frame. Its colours are
// the page's `--sea-*` properties (D4), re-read when the scheme changes.
//
// This module is loaded only when a moment shows: `boot-sea.ts` imports it, and the empty canvas
// asks for it (`empty-sea.ts`), so it is never in the bundle the editor starts with (D1, D2).
import {
  MARK_BOX,
  MARK_GRADIENT,
  MARK_HULL,
  MARK_M,
  MARK_STROKE,
  createSea,
  fleetSize,
  restProgress,
  type Environment,
  type Sea,
  type SeaState,
} from "@meltemi/ocean";

/** The state the playground wears: the wind draws. */
export const SEA_STATE: SeaState = "diagrams";
/** From the first frame to rest, in milliseconds: every moment rests within 5 seconds (D3). */
export const PLAY_MS = 4500;
/** The flow forms over this long, from the first frame. */
export const FLOW_MS = 3600;
/** The sea's own time starts slowing here, and stops at `PLAY_MS`. */
export const SETTLE_MS = 3000;
/** The load screen dissolves over the editor in this long (D1). */
export const FADE_MS = 200;

const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** The share of the rest progress shown this long after the first frame. */
export function progressAt(elapsed: number): number {
  return elapsed >= PLAY_MS ? 1 : ease(elapsed / FLOW_MS);
}

/** How fast the sea's own time runs this long after the first frame: 1, slowing to 0 at rest. */
export function speedAt(elapsed: number): number {
  return 1 - ease((elapsed - SETTLE_MS) / (PLAY_MS - SETTLE_MS));
}

/** The animation frames the page gives a moment: the browser's, or a test's. */
export interface Frames {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

/** What a moment drives of a sea: the package's handle, or a test's. */
export interface Driven {
  start(): void;
  stop(): void;
  setProgress(progress: number): void;
}

/** What a moment reports while it plays, for the browser suite and the curious. */
export interface Playing {
  /** Animation frames the sea asked for. */
  readonly requested: number;
  /** Whether it has come to rest. */
  readonly rested: boolean;
}

/**
 * Plays a sea once: `sea` was made with `requestFrame`/`cancelFrame` from `frames()`'s answer,
 * which is how the moment sets the progress and slows the sea's time before each of its frames,
 * and stops it at rest after `PLAY_MS`. A reduced sea draws its one frame at `rest` and requests
 * none. `rested` is called once it rests.
 */
export function playOnce(
  frames: Frames,
  options: { readonly reducedMotion: boolean; readonly rest: number; readonly rested?: () => void },
): {
  readonly environment: Pick<Environment, "requestFrame" | "cancelFrame">;
  readonly playing: Playing;
  /** Starts the sea the environment was given to. */
  begin(sea: Driven): void;
  /** Cancels what is pending; the sea is the caller's to destroy. */
  end(): void;
} {
  let sea: Driven | undefined;
  let requested = 0;
  let rested = false;
  let first: number | undefined;
  let previous = 0;
  let virtual = 0;
  const handles = new Set<number>();
  const rest = () => {
    if (rested) return;
    rested = true;
    options.rested?.();
  };
  const environment = {
    requestFrame(callback: (time: number) => void): number {
      requested++;
      const handle = frames.request((now) => {
        handles.delete(handle);
        if (rested || !sea) return;
        if (first === undefined) {
          first = now;
          previous = now;
        }
        const elapsed = now - first;
        // The sea's own clock slows to a stop: what it draws moves less and less, then not at all.
        virtual += (now - previous) * Math.max(0, speedAt(elapsed));
        previous = now;
        sea.setProgress(options.rest * progressAt(elapsed));
        callback(first + virtual);
        if (elapsed >= PLAY_MS) {
          sea.stop();
          rest();
        }
      });
      handles.add(handle);
      return handle;
    },
    cancelFrame(handle: number): void {
      handles.delete(handle);
      frames.cancel(handle);
    },
  };
  return {
    environment,
    playing: {
      get requested() {
        return requested;
      },
      get rested() {
        return rested;
      },
    },
    begin(driven) {
      sea = driven;
      driven.start();
      if (options.reducedMotion) rest();
    },
    end() {
      for (const handle of handles) frames.cancel(handle);
      handles.clear();
      rested = true;
    },
  };
}

/** Whether the person asked for reduced motion, as `matchMedia` answers. */
export function reducedMotion(
  match: ((query: string) => { matches: boolean }) | undefined,
): boolean {
  return match?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// The moment on the page ----------------------------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.append(...children);
  return element;
}

let moments = 0;

/**
 * The fleet: the lead holds the brand's mark once (its gradient, its `m` and its hull) and every
 * other boat uses it, as on meltemi.dev, so the mark's shape exists once in the page. The package
 * only writes their transforms.
 */
function fleet(count: number): { lead: HTMLElement; boats: HTMLElement[] } {
  const id = `sea-${++moments}`;
  const box = `0 0 ${MARK_BOX} ${MARK_BOX}`;
  const lead = document.createElement("div");
  lead.className = "sea-mark";
  const g = MARK_GRADIENT;
  lead.append(
    svg(
      "svg",
      { viewBox: box, focusable: "false" },
      svg(
        "defs",
        {},
        svg(
          "linearGradient",
          {
            id: `${id}-gradient`,
            x1: g.x1,
            y1: g.y1,
            x2: g.x2,
            y2: g.y2,
            gradientUnits: "userSpaceOnUse",
          },
          svg("stop", { offset: 0, "stop-color": g.from }),
          svg("stop", { offset: 1, "stop-color": g.to }),
        ),
      ),
      svg("path", {
        id: `${id}-m`,
        d: MARK_M,
        fill: "none",
        stroke: `url(#${id}-gradient)`,
        "stroke-width": MARK_STROKE,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
      svg("path", { id: `${id}-hull`, d: MARK_HULL, fill: `url(#${id}-gradient)` }),
    ),
  );
  const boats = Array.from({ length: count - 1 }, () => {
    const boat = document.createElement("div");
    boat.className = "sea-boat";
    boat.append(
      svg(
        "svg",
        { viewBox: box, focusable: "false" },
        svg("use", { href: `#${id}-m` }),
        svg("use", { href: `#${id}-hull` }),
      ),
    );
    return boat;
  });
  return { lead, boats };
}

/** A sea on the page, as the browser suite reads it (`window.meltemiSea`). */
export interface SeaReport extends Playing {
  readonly renderer: Sea["renderer"];
  readonly frames: number;
  readonly progress: number;
  readonly links: number;
  readonly boats: number;
  /** Whether it is still on the page. */
  readonly shown: boolean;
}

/** The seas the page has shown, by moment: the last of each, as `window.meltemiSea`. */
function reports(): { boot?: SeaReport; empty?: SeaReport } {
  const page = window as unknown as { meltemiSea?: { boot?: SeaReport; empty?: SeaReport } };
  page.meltemiSea ??= {};
  return page.meltemiSea;
}

/** A moment of the sea on the page: its layer, and the ways it leaves. */
export interface SeaMoment {
  /** The layer the sea and its fleet are in. */
  readonly element: HTMLElement;
  readonly report: SeaReport;
  /** Takes the sea away at once: no frame is drawn after. */
  destroy(): void;
}

/**
 * Puts the sea in `host`, before `before` (else as its first child), and plays it once. Returns
 * undefined, leaving nothing behind, when the browser can draw neither WebGL2 nor Canvas 2D.
 */
export function playMoment(
  host: HTMLElement,
  options: {
    readonly moment: "boot" | "empty";
    readonly reducedMotion: boolean;
    readonly before?: Node | null;
  },
): SeaMoment | undefined {
  const element = document.createElement("div");
  element.className = `sea sea-${options.moment}`;
  element.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.className = "sea-canvas";
  const { lead, boats } = fleet(fleetSize(SEA_STATE));
  const ships = document.createElement("div");
  ships.className = "sea-fleet";
  // The lead sails in front of the others.
  ships.append(...boats, lead);
  element.append(canvas, ships);
  host.insertBefore(element, options.before ?? host.firstChild);

  const rest = restProgress(SEA_STATE);
  const frames: Frames = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  };
  const player = playOnce(frames, { reducedMotion: options.reducedMotion, rest });
  const sea = createSea(
    canvas,
    {
      state: SEA_STATE,
      reducedMotion: options.reducedMotion,
      progress: options.reducedMotion ? rest : 0,
      fleet: [lead, ...boats],
    },
    player.environment,
  );
  if (sea.renderer === "none") {
    sea.destroy();
    element.remove();
    return undefined;
  }
  player.begin(sea);

  // The scheme: the page's switch (`data-theme`) and the system's, which the page follows unless
  // the switch chose (D4).
  const restyle = () => sea.restyle();
  const theme = new MutationObserver(restyle);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", restyle);
  // The host's size: the panes move, the window changes. At rest this draws the one new frame.
  let sized = false;
  const size = new ResizeObserver(() => {
    // The first answer is the size the sea was made with.
    if (sized) sea.resize();
    sized = true;
  });
  size.observe(element);

  let shown = true;
  const report: SeaReport = {
    get renderer() {
      return sea.renderer;
    },
    get frames() {
      return sea.frames;
    },
    get progress() {
      return sea.progress;
    },
    get links() {
      return sea.figures.links;
    },
    get boats() {
      return sea.figures.boats;
    },
    get requested() {
      return player.playing.requested;
    },
    get rested() {
      return player.playing.rested;
    },
    get shown() {
      return shown;
    },
  };
  reports()[options.moment] = report;
  return {
    element,
    report,
    destroy() {
      if (!shown) return;
      shown = false;
      player.end();
      const webgl = sea.renderer === "webgl2";
      sea.destroy();
      // The context goes with the sea, rather than waiting for the collector: a person who opens
      // project.json and a diagram in turn would otherwise pile contexts up to the browser's limit.
      if (webgl) canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      theme.disconnect();
      scheme.removeEventListener("change", restyle);
      size.disconnect();
      element.remove();
    },
  };
}
