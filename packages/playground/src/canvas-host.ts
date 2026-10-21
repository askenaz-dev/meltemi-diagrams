import { CanvasApp, type PersistedState } from "@meltemi/diagrams-canvas";
import type { HostMessage, PresencePerson, SessionResult } from "@meltemi/diagrams-editor";
import { CANVAS_SETTINGS, settingsMessage } from "./canvas-settings.js";
import type { Studio } from "./studio.js";
import { isMac } from "./ui.js";

export { CANVAS_SETTINGS };

/**
 * Other people's selections for the canvas to outline over the scene (`live-collaboration`): never
 * part of the project or of an export, and empty when nobody else has anything selected here.
 */
export function presenceMessage(people: readonly PresencePerson[]): HostMessage {
  return { type: "presence", people };
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
      post: (message) => setTimeout(() => studio.receive(message), 0),
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
