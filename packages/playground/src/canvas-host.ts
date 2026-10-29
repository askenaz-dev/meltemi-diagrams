import { CanvasApp, type PersistedState } from "@meltemi/diagrams-canvas";
import type {
  CanvasMessage,
  HostMessage,
  PresencePerson,
  SessionResult,
} from "@meltemi/diagrams-editor";
import type { PresencePen } from "@meltemi/diagrams-editor/canvas";
import { CANVAS_SETTINGS, settingsMessage } from "./canvas-settings.js";
import type { Studio } from "./studio.js";
import { isMac } from "./ui.js";

export { CANVAS_SETTINGS };

/**
 * Other people's selections and pointers for the canvas to draw over the scene
 * (`live-collaboration`): never part of the project or of an export, and empty when nobody else has
 * anything selected or a pointer here.
 */
export function presenceMessage(
  people: readonly PresencePerson[],
  me?: { readonly colour: string },
): HostMessage {
  return me ? { type: "presence", people, me } : { type: "presence", people };
}

/** Where the person's pointer is over the canvas, as presence publishes it. */
export interface CanvasPointer {
  readonly x: number;
  readonly y: number;
  readonly diagram?: string;
}

/**
 * What a canvas's `presencePointer` message says: where the pointer is (diagram units, and the
 * diagram), or undefined once it left the canvas.
 */
export function pointerOf(
  message: Extract<CanvasMessage, { type: "presencePointer" }>,
): CanvasPointer | undefined {
  const { point, diagram } = message;
  if (!point) return undefined;
  return diagram === undefined ? { x: point.x, y: point.y } : { x: point.x, y: point.y, diagram };
}

/**
 * The points a stroke of the Pointer tool made, as presence publishes them; with `pen` they are a
 * stroke of the pen or the highlighter, and that is how it looks (`live-collaboration`, "Strokes
 * being drawn in presence").
 */
export interface CanvasLaser {
  readonly points: readonly { readonly x: number; readonly y: number; readonly t: number }[];
  readonly diagram?: string;
  readonly pen?: PresencePen;
}

/**
 * What a canvas's `presenceLaser` message says: the points, the diagram they are over, and the
 * width, colour, opacity and number of the stroke when it is one of the pen or the highlighter,
 * with `cancel` on the batch that ends one cancelled with Escape.
 */
export function laserOf(message: Extract<CanvasMessage, { type: "presenceLaser" }>): CanvasLaser {
  const { points, diagram, pen } = message;
  return {
    points,
    ...(diagram === undefined ? {} : { diagram }),
    ...(pen === undefined
      ? {}
      : {
          pen: {
            width: pen.width,
            colour: pen.colour,
            opacity: pen.opacity,
            stroke: pen.stroke,
            ...(pen.cancel === true ? { cancel: true as const } : {}),
          },
        }),
  };
}

/** What the canvas asks of the page beyond the session. */
export interface CanvasRequests {
  copy(text: string): void;
  paste(): Promise<string | undefined>;
  /** An image added to the project, as a path relative to the open file. */
  pickImage(): Promise<string | undefined>;
  exportDialog(): void;
  exportPlayer(story: string | undefined): void;
  openModel(): void;
  /**
   * The person's pointer moved over the canvas, or left it (undefined): for presence to share. The
   * Studio never hears of it; nothing of the document changes.
   */
  pointer?(at: CanvasPointer | undefined): void;
  /**
   * The points a stroke of the Pointer tool made: for presence to share in the same message as the
   * pointer. The Studio never hears of it.
   */
  laser?(batch: CanvasLaser): void;
}

/**
 * Mounts the canvas of `@meltemi/diagrams-canvas` in an element and connects it to the studio's
 * session, as the extension connects its webview: messages from the canvas reach the session on
 * the next task, as through a message channel, and the session's answers reach the canvas.
 */
export function mountCanvas(
  element: HTMLElement,
  studio: Studio,
  requests: CanvasRequests,
  state: { get(): PersistedState | undefined; set(state: PersistedState): void },
): CanvasApp {
  const app = new CanvasApp(
    element,
    {
      post: (message) => {
        // Where the pointer is goes to presence, at once and never through the Studio.
        if (message.type === "presencePointer") {
          requests.pointer?.(pointerOf(message));
          return;
        }
        if (message.type === "presenceLaser") {
          requests.laser?.(laserOf(message));
          return;
        }
        setTimeout(() => studio.receive(message), 0);
      },
      getState: () => state.get(),
      setState: (next) => state.set(next),
    },
    isMac,
  );
  const deliver = (messages: readonly HostMessage[]) => {
    for (const message of messages) app.receive(message);
  };
  const act = async (result: SessionResult) => {
    if (result.clipboard !== undefined) requests.copy(result.clipboard);
    if (result.readClipboard) {
      const text = await requests.paste();
      if (text !== undefined) studio.handle(studio.session.paste(text, result.readClipboard.at));
    }
    if (result.command === "export") requests.exportDialog();
    if (result.command === "exportPlayer") requests.exportPlayer(result.story);
    if (result.command === "openModel") requests.openModel();
    // Icons are chosen in the canvas's own picker; the page asks only for image files.
    if (result.pick) {
      const { kind, at, parent } = result.pick;
      const source = await requests.pickImage();
      if (source === undefined) return;
      const analysis = studio.document();
      if (analysis) studio.session.update(analysis);
      studio.handle(studio.session.createObject(kind, source, at, parent));
    }
  };
  studio.listen({
    canvas: deliver,
    request: (result) => void act(result),
    // View mode switches the canvas to showing only, and back, without a reload: the settings
    // message replaces the canvas's settings as a whole, so each one repeats what applies.
    readOnly: (on) => deliver([settingsMessage(on)]),
  });
  deliver([settingsMessage(studio.readOnly)]);
  return app;
}
