import type { CanvasSettings, HostMessage } from "@meltemi/diagrams-editor";

/** What the canvas shows and snaps to; the playground has no settings of its own for them. */
export const CANVAS_SETTINGS: CanvasSettings = {
  grid: 14,
  showGrid: true,
  snap: true,
  guides: true,
  minimap: true,
  inspector: true,
};

/**
 * The `settings` message's content for the studio's mode. A `settings` message replaces the
 * canvas's settings as a whole, so every one the page sends says `readOnly: true` while the page
 * is in view mode (`project-sharing`), and none says it otherwise: the canvas then shows without
 * editing, and a page that is later promoted to editing sends the plain settings and the canvas
 * edits again, with no reload.
 */
export function canvasSettings(readOnly: boolean): CanvasSettings {
  return readOnly ? { ...CANVAS_SETTINGS, readOnly: true } : CANVAS_SETTINGS;
}

/** The host message that gives the canvas its settings for the studio's mode (the only one the page sends). */
export function settingsMessage(readOnly: boolean): HostMessage {
  return { type: "settings", settings: canvasSettings(readOnly) };
}
