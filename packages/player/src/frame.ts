import type { Scene } from "@meltemi/diagrams-layout";
import {
  drillFrame,
  sceneAt,
  storyFrame,
  type DrillSpec,
  type StoryViewData,
} from "@meltemi/diagrams-motion";
import { renderSvg } from "@meltemi/diagrams-render";
import type { PlayerDocument } from "./format.js";

export interface FrameOptions {
  /** The diagram without its effects. */
  readonly static?: boolean;
  /** Replaces the drawing's background; `transparent` leaves none. */
  readonly background?: string | null;
  /** Effects documents: the view to draw, by key; the diagram's own by default. */
  readonly view?: string;
}

/**
 * The scene of a document at `t` milliseconds: a story's frame, or a view of a diagram with its
 * effects, or without them in the static view.
 */
export function frameScene(
  data: PlayerDocument,
  t: number,
  options: FrameOptions = {},
): Scene | null {
  let scene: Scene | null;
  if (data.kind === "story") {
    scene = storyFrame(data.timeline, (key) => data.views[key], t, { accent: data.accent });
  } else {
    const view = data.views[options.view ?? data.key];
    scene = !view ? null : options.static ? view.scene : sceneAt(view.scene, view.plan, t);
  }
  if (!scene) return null;
  if (options.background) {
    scene = {
      ...scene,
      background: options.background === "transparent" ? "none" : options.background,
    };
  }
  return scene;
}

/**
 * The SVG of a document at `t` milliseconds, with font names (the page loads the document's font
 * faces): a story's frame, or a view of a diagram with its effects, or without them in the static
 * view. A `background` replaces the drawing's own; `transparent` leaves none.
 */
export function frameSvg(data: PlayerDocument, t: number, options: FrameOptions = {}): string {
  const scene = frameScene(data, t, options);
  return scene ? renderSvg(scene, { fonts: "system" }) : "";
}

/**
 * The scene of a drill-down between two views of an effects document at `t` milliseconds; `extra`
 * holds views the document lacks (a catalog's page drawing the view it came from).
 */
export function drillScene(
  data: PlayerDocument,
  spec: DrillSpec,
  t: number,
  extra: Readonly<Record<string, StoryViewData>> = {},
): Scene | null {
  return drillFrame(spec, (key) => extra[key] ?? data.views[key], t, { accent: data.accent });
}

/** The SVG of `drillScene`, with font names. */
export function drillSvg(
  data: PlayerDocument,
  spec: DrillSpec,
  t: number,
  extra: Readonly<Record<string, StoryViewData>> = {},
): string {
  const scene = drillScene(data, spec, t, extra);
  return scene ? renderSvg(scene, { fonts: "system" }) : "";
}
