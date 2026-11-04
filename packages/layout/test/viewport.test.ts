import { describe, expect, it } from "vitest";
import {
  canPan,
  clampPan,
  clampZoom,
  fitBox,
  fitSelection,
  fitViewport,
  revealBox,
  toDiagram,
  toScreen,
  viewBoxPlacement,
  zoomAt,
  zoomStep,
} from "../src/viewport.js";

describe("viewport math", () => {
  it("zooms around a point and clamps to the limits", () => {
    const viewport = { x: 40, y: 20, zoom: 1 };
    const offset = { x: 0, y: 0 };
    const point = { x: 300, y: 200 };
    const screen = toScreen(viewport, offset, point);
    const zoomed = zoomAt(viewport, 2, screen);
    expect(zoomed.zoom).toBe(2);
    expect(toDiagram(zoomed, offset, screen)).toEqual(point);
    expect(zoomAt(viewport, 100, screen).zoom).toBe(8);
    expect(zoomAt(viewport, 0.01, screen).zoom).toBe(0.1);
    expect(zoomAt(viewport, 0.01, screen, { min: 0.05, max: 8 }).zoom).toBe(0.05);
    expect(clampZoom(20, { min: 0.5, max: 4 })).toBe(4);
  });

  it("steps through the presets within the limits", () => {
    expect(zoomStep({ x: 0, y: 0, zoom: 1 }, 1, { x: 0, y: 0 }).zoom).toBe(1.25);
    expect(zoomStep({ x: 0, y: 0, zoom: 1 }, -1, { x: 0, y: 0 }).zoom).toBe(0.75);
    expect(zoomStep({ x: 0, y: 0, zoom: 8 }, 1, { x: 0, y: 0 }).zoom).toBe(8);
    expect(
      zoomStep({ x: 0, y: 0, zoom: 0.1 }, -1, { x: 0, y: 0 }, { min: 0.05, max: 8 }).zoom,
    ).toBe(0.05);
  });

  it("fits with the canvas margin by default and without one when asked", () => {
    expect(fitViewport({ width: 2000, height: 1000 }, { width: 1048, height: 548 }).zoom).toBe(0.5);
    expect(fitViewport({ width: 100, height: 50 }, { width: 1000, height: 800 }).zoom).toBe(1);
    const tight = fitViewport(
      { width: 480, height: 300 },
      { width: 480, height: 300 },
      { margin: 0 },
    );
    expect(tight).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(
      fitViewport({ width: 960, height: 600 }, { width: 480, height: 300 }, { margin: 0 }).zoom,
    ).toBe(0.5);
    expect(
      fitBox({ x: 0, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { maxZoom: 4 })
        .zoom,
    ).toBe(4);
    const huge = fitViewport(
      { width: 100_000, height: 100 },
      { width: 500, height: 300 },
      {
        margin: 0,
        minZoom: 0.001,
      },
    );
    expect(huge.zoom).toBeCloseTo(0.005);
    expect(fitSelection([], { x: 0, y: 0 }, { width: 10, height: 10 })).toBeUndefined();
  });

  it("clamps the pan like a scroll container", () => {
    const content = { width: 400, height: 200 };
    const screen = { width: 400, height: 200 };
    // At fit the content is centred and cannot move.
    expect(clampPan({ x: 50, y: -30, zoom: 1 }, content, screen)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampPan({ x: 0, y: 0, zoom: 0.5 }, content, screen)).toEqual({
      x: 100,
      y: 50,
      zoom: 0.5,
    });
    expect(canPan({ x: 0, y: 0, zoom: 1 }, content, screen, 10, 0)).toBe(false);
    // Zoomed in, no gap shows at either edge.
    const zoomed = { x: 0, y: 0, zoom: 2 };
    expect(clampPan({ ...zoomed, x: 30 }, content, screen).x).toBe(0);
    expect(clampPan({ ...zoomed, x: -900 }, content, screen).x).toBe(-400);
    expect(canPan(zoomed, content, screen, -10, 0)).toBe(true);
    expect(canPan(zoomed, content, screen, 10, 0)).toBe(false);
    expect(canPan({ ...zoomed, y: -200 }, content, screen, 0, -10)).toBe(false);
  });

  it("places a view box like xMidYMid meet", () => {
    expect(
      viewBoxPlacement({ width: 480, height: 300 }, { x: 0, y: 0, width: 480, height: 300 }),
    ).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    // A camera on the right half doubles the scale and shifts the scene left.
    const camera = viewBoxPlacement(
      { width: 480, height: 300 },
      { x: 240, y: 75, width: 240, height: 150 },
    );
    expect(camera.scale).toBe(2);
    expect(camera.x + camera.scale * 240).toBe(0);
    expect(camera.y + camera.scale * 75).toBe(0);
    // A taller box is centred horizontally.
    const tall = viewBoxPlacement(
      { width: 400, height: 200 },
      { x: 0, y: 0, width: 100, height: 100 },
    );
    expect(tall).toEqual({ scale: 2, x: 100, y: 0 });
  });

  it("reveals a box with a given margin", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const moved = revealBox(
      viewport,
      { x: 0, y: 0 },
      { x: 390, y: 10, width: 40, height: 20 },
      {
        width: 400,
        height: 300,
      },
      0,
    );
    expect(moved.x).toBe(-30);
    expect(moved.y).toBe(0);
  });
});
