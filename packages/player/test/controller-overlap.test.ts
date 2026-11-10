import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { PlayerController, storyDocument } from "../src/index.js";

function document() {
  const compilation =
    compile(`diagram d: flow { layout manual; a -> b; placement { place a at (80, 80); place b at (400, 80) } }
story tour for d {
  scene a { hold 10s }
  scene b { overlap 8s; hold 10s }
  scene c { overlap 8s; hold 10s }
}`);
  expect(compilation.diagnostics).toEqual([]);
  const diagram = compilation.document.diagrams[0]!;
  return storyDocument(
    compilation.document.stories[0]!,
    new Map([["d", { diagram, layout: layoutDiagram(compilation, diagram) }]]),
  )!;
}

describe("overlapping scene navigation", () => {
  it("retains the directed static scene instead of selecting a later scene at its closing time", () => {
    const controller = new PlayerController(document(), { static: true });
    expect([controller.sceneIndex, controller.time]).toEqual([0, 10000]);
    controller.goToScene(1);
    expect([controller.sceneIndex, controller.time]).toEqual([1, 12000]);
    controller.run("previousScene");
    expect([controller.sceneIndex, controller.time]).toEqual([0, 10000]);
    controller.run("nextScene");
    expect([controller.sceneIndex, controller.time]).toEqual([1, 12000]);
    controller.goToScene(2);
    expect([controller.sceneIndex, controller.time]).toEqual([2, 14000]);
  });

  it("uses the latest started scene for ordinary seeking and captures it on entering static mode", () => {
    const controller = new PlayerController(document());
    controller.seek(3000);
    expect(controller.sceneIndex).toBe(1);
    controller.setStatic(true);
    expect([controller.sceneIndex, controller.time]).toEqual([1, 12000]);
    controller.seek(1000);
    expect([controller.sceneIndex, controller.time]).toEqual([0, 10000]);
    controller.setStatic(false);
    expect(controller.sceneIndex).toBe(2);
    controller.seek(3000);
    expect(controller.sceneIndex).toBe(1);
    controller.play();
    controller.tick(2000);
    expect(controller.sceneIndex).toBe(2);
  });

  it("starts a changed story at its first directed still", () => {
    const controller = new PlayerController(document(), { reducedMotion: true });
    controller.goToScene(2);
    controller.goToStory(0);
    expect([controller.sceneIndex, controller.time, controller.canPlay]).toEqual([0, 10000, false]);
  });
});
