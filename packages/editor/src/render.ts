import {
  layoutDiagram,
  type Box,
  type BoxShape,
  type ConnectorGeometry,
  type LayoutResult,
} from "@meltemi/diagrams-layout";
import type { FlowDiagram, Point } from "@meltemi/diagrams-model";
import { animatedScene, motionOptions, planMotion, sceneAt } from "@meltemi/diagrams-motion";
import { renderSvg, type FontPolicy, type FontProvider } from "@meltemi/diagrams-render";
import { diagramView, type DocumentAnalysis } from "./analysis.js";
import { NO_TEXT_PLACES, textPlaces, type TextPlaces } from "./text-places.js";

/** Geometry of a rendered diagram in diagram coordinates; scene = diagram + offset. */
export interface RenderGeometry {
  readonly width: number;
  readonly height: number;
  readonly offset: Point;
  readonly boxes: ReadonlyMap<string, Box>;
  readonly labels: ReadonlyMap<string, Box>;
  readonly connectors: ReadonlyMap<string, ConnectorGeometry>;
  /** The drawn shape of every element box but groups'. */
  readonly shapes: ReadonlyMap<string, BoxShape>;
  /** The labels drawn outside their element's box (`shape icon`), by element id. */
  readonly elementLabels: ReadonlyMap<string, Box>;
  /** The angle of every turned element, by id. */
  readonly rotations: ReadonlyMap<string, number>;
  /** The corner radius of every element drawn with one, by id. */
  readonly radii: ReadonlyMap<string, number>;
  /**
   * Sequence diagrams: the pills of the tags of every participant and message that has some, by
   * participant id or message key, in source order.
   */
  readonly tags: ReadonlyMap<string, readonly Box[]>;
  /** Where the labels are drawn, for the inline editor. */
  readonly texts: TextPlaces;
}

export interface RenderedDiagram {
  readonly svg: string;
  readonly geometry: RenderGeometry;
}

/**
 * The SVG `meltemi-diagrams export` writes for a diagram of the analysis, with its geometry, or
 * undefined when the diagram does not render.
 */
export function renderDiagram(
  analysis: DocumentAnalysis,
  id: string,
  options: {
    readonly fonts?: FontPolicy;
    /** A scenario of a sequence diagram to draw instead of every event. */
    readonly scenario?: string;
    /** Effects: none (the default), the animated profile, or the frame at a time in ms. */
    readonly motion?: "static" | "animated" | { readonly at: number };
  } = {},
): RenderedDiagram | undefined {
  const view = diagramView(analysis, id);
  const layout =
    options.scenario !== undefined && view?.layout?.scene
      ? layoutDiagram(analysis.compilation, view.diagram, {
          ...analysis.layoutOptions,
          scenario: options.scenario,
        })
      : view?.layout;
  if (!layout || !view) return undefined;
  return renderLayout(view.diagram, layout, analysis.fonts, options);
}

/**
 * The SVG of a diagram laid out by the host, drawn as `renderDiagram` draws the diagrams of an
 * analysis with the same fonts, with its geometry; undefined without a scene.
 */
export function renderLayout(
  diagram: FlowDiagram,
  layout: LayoutResult,
  fonts: FontProvider | undefined,
  options: {
    readonly fonts?: FontPolicy;
    readonly motion?: "static" | "animated" | { readonly at: number };
  } = {},
): RenderedDiagram | undefined {
  const drawn = layout.scene;
  if (!drawn) return undefined;
  let scene = drawn;
  const motion = options.motion ?? "static";
  if (motion !== "static") {
    const plan = planMotion(diagram, drawn, motionOptions(layout.theme));
    scene = motion === "animated" ? animatedScene(drawn, plan) : sceneAt(drawn, plan, motion.at);
  }
  const svg = renderSvg(scene, {
    fonts: options.fonts ?? (fonts ? "embedded" : "system"),
    ...(fonts ? { provider: fonts } : {}),
  });
  const offset = layout.offset ?? { x: 0, y: 0 };
  const connectors = layout.connectors ?? new Map<string, ConnectorGeometry>();
  return {
    svg,
    geometry: {
      width: scene.width,
      height: scene.height,
      offset,
      boxes: layout.boxes ?? new Map(),
      labels: layout.labels ?? new Map(),
      connectors,
      shapes: layout.shapes ?? new Map(),
      elementLabels: layout.elementLabels ?? new Map(),
      rotations: layout.rotations ?? new Map(),
      radii: layout.radii ?? new Map(),
      tags: layout.tags ?? new Map(),
      // The drawing without effects: the text lies where the editor types it, a sticky's in the
      // room the layout wrapped it in, a message's label in the room between its lifelines.
      texts: layout.theme
        ? textPlaces(
            diagram,
            drawn,
            offset,
            layout.theme,
            connectors,
            layout.shapes,
            layout.stickies,
            layout.messageTexts,
          )
        : NO_TEXT_PLACES,
    },
  };
}

/**
 * `<stem>.svg` for a file with one diagram, `<stem>.<diagram-id>.svg` otherwise; a scenario
 * adds its id before the extension, as `meltemi-diagrams export --scenario` names it; HTML
 * players take `html`.
 */
export function exportFileName(
  stem: string,
  diagramId: string,
  diagramCount: number,
  scenario?: string,
  extension = "svg",
): string {
  const base = diagramCount > 1 ? `${stem}.${diagramId}` : stem;
  return scenario === undefined ? `${base}.${extension}` : `${base}.${scenario}.${extension}`;
}
