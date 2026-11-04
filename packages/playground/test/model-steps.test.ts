// The canvas edits the model of a C4 view that another file of the project holds: the studio
// plans the session's steps over both files and applies them as one step of the history.

import { describe, expect, it } from "vitest";
import type { CanvasAction, HostMessage } from "@meltemi/diagrams-editor";
import { newStudio } from "./support/cloud.js";

const MODEL = [
  'language "0.2"',
  "",
  "model commerce {",
  '  person customer "Cliente"',
  '  system shop "Commerce" {',
  '    container web "Web"',
  '    container api "API"',
  "  }",
  "",
  '  customer -> shop.web: "Compra"',
  '  shop.web -> shop.api: "HTTPS" as request',
  "}",
  "",
].join("\n");

const VIEW = [
  'language "0.2"',
  "",
  'import commerce from "../models/commerce.meltemi"',
  "",
  "diagram containers: c4 using commerce {",
  "  level container",
  "  scope shop",
  "  layout manual",
  "",
  "  placement {",
  "    place customer at (120, 80)",
  "    place shop.web at (120, 320)",
  "    place shop.api at (120, 560)",
  "  }",
  "}",
  "",
].join("\n");

const MODEL_FILE = "models/commerce.meltemi";
const VIEW_FILE = "diagrams/containers.meltemi";

function rig() {
  const studio = newStudio();
  const canvas: HostMessage[] = [];
  const statuses: string[] = [];
  studio.listen({
    canvas: (messages) => canvas.push(...messages),
    status: (message) => statuses.push(message),
  });
  studio.addFiles(
    [
      [
        "project.json",
        JSON.stringify({ name: "p", language: "0.2", sources: ["models", "diagrams"] }),
      ],
      [MODEL_FILE, MODEL],
      [VIEW_FILE, VIEW],
    ],
    VIEW_FILE,
  );
  studio.analyzeNow();
  studio.receive({ type: "pickDiagram", diagram: "containers" });
  const act = (action: CanvasAction) =>
    studio.receive({ type: "action", revision: studio.revision(), action });
  return { studio, canvas, statuses, act };
}

describe("the model of a view in another file, edited from the canvas", () => {
  it("names and animates a relation in both files, undone in one step", () => {
    const { studio, statuses, act } = rig();
    act({ kind: "setField", ids: ["customer->shop.web#1"], field: "effect.flow", value: "on" });
    expect(studio.text(MODEL_FILE)).toContain(
      '  customer -> shop.web: "Compra" as customer_shop_web\n',
    );
    expect(studio.text(VIEW_FILE)).toContain("  animate customer_shop_web { effect flow }\n");
    expect(statuses).toContain("Changed models/commerce.meltemi.");
    expect(studio.undo()).toBe(true);
    expect(studio.text(MODEL_FILE)).toBe(MODEL);
    expect(studio.text(VIEW_FILE)).toBe(VIEW);
    expect(studio.redo()).toBe(true);
    expect(studio.text(MODEL_FILE)).toContain("as customer_shop_web");
  });

  it("moves an end of a relation in the model's file", () => {
    const { studio, act } = rig();
    act({ kind: "setEnd", relation: "request", end: "to", element: "customer", port: null });
    expect(studio.text(MODEL_FILE)).toContain('  shop.web -> customer: "HTTPS" as request\n');
    expect(studio.text(VIEW_FILE)).toBe(VIEW);
  });

  it("asks before removing a relation the view drew an entity for, then removes it", () => {
    const { studio, canvas, act } = rig();
    act({ kind: "remove", ids: ["customer->shop.web#1"], cascade: false });
    const asked = canvas.find((m) => m.type === "rejected") as
      { code: string; dependents?: { description: string }[]; retry?: CanvasAction } | undefined;
    expect(asked?.code).toBe("edit.has-dependents");
    expect(asked?.dependents?.map((d) => d.description).sort()).toEqual([
      "`customer` no longer drawn in the view `containers`",
      expect.stringMatching(/^place `customer` on line \d+$/),
    ]);
    expect(studio.text(MODEL_FILE)).toBe(MODEL);
    expect(asked?.retry).toEqual({ kind: "remove", ids: ["customer->shop.web#1"], cascade: true });
    act(asked!.retry!);
    expect(studio.text(MODEL_FILE)).not.toContain("customer -> shop.web");
    expect(studio.text(VIEW_FILE)).not.toContain("place customer");
    expect(studio.undo()).toBe(true);
    expect(studio.text(MODEL_FILE)).toBe(MODEL);
    expect(studio.text(VIEW_FILE)).toBe(VIEW);
  });

  it("declares a container from the palette in the model's file and places it, undone in one step", () => {
    const { studio, act } = rig();
    act({ kind: "create", elementKind: "container", at: { x: 420, y: 320 } });
    expect(studio.text(MODEL_FILE)).toContain(
      '    container api "API"\n    container container1 ""\n',
    );
    expect(studio.text(VIEW_FILE)).toMatch(/place shop\.container1 at \(\d+, \d+\)/);
    expect(studio.undo()).toBe(true);
    expect(studio.text(MODEL_FILE)).toBe(MODEL);
    expect(studio.text(VIEW_FILE)).toBe(VIEW);
  });
});
