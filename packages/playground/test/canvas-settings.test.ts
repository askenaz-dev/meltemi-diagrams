import { describe, expect, it } from "vitest";
import { CANVAS_SETTINGS, canvasSettings } from "../src/canvas-settings.js";

describe("the canvas's settings", () => {
  it("show the properties on a wide window, and fold them on a narrow one", () => {
    expect(canvasSettings(false, true)).toEqual(CANVAS_SETTINGS);
    expect(canvasSettings(false, false)).toEqual({ ...CANVAS_SETTINGS, inspector: false });
  });

  it("keep view mode whatever the width", () => {
    expect(canvasSettings(true, true)).toEqual({ ...CANVAS_SETTINGS, readOnly: true });
    expect(canvasSettings(true, false)).toEqual({
      ...CANVAS_SETTINGS,
      inspector: false,
      readOnly: true,
    });
  });
});
