import { describe, expect, it } from "vitest";
import { TEMPLATES, TEMPLATE_CONTENT_KINDS, templateManifest } from "../src/index.js";

const versions = { toolVersion: "1.11.0", languageVersion: "0.2" };

describe("the templates", () => {
  it("are seven, in the order init and the playground list them", () => {
    expect(Object.keys(TEMPLATES)).toEqual([
      "flow",
      "c4",
      "sequence",
      "free",
      "kanban",
      "whiteboard",
      "purchase",
    ]);
    expect(TEMPLATE_CONTENT_KINDS).toEqual(["models", "views", "diagrams", "stories"]);
  });

  it("describe the kanban board and the whiteboard with what they hold", () => {
    expect(TEMPLATES.kanban).toEqual({
      title: "Kanban board",
      description: "A board of columns and sticky cards",
      contents: { diagrams: 1, models: 0, views: 0, stories: 0 },
    });
    expect(TEMPLATES.whiteboard).toEqual({
      title: "Whiteboard",
      description: "A sketched board with strokes, stickies and a story that draws them",
      contents: { diagrams: 1, models: 0, views: 0, stories: 1 },
    });
  });

  it("write a manifest that pins the tool, with catalog settings only for the purchase example", () => {
    for (const name of ["kanban", "whiteboard"] as const) {
      expect(JSON.parse(templateManifest("board", name, versions))).toEqual({
        name: "board",
        language: "0.2",
        tools: { "meltemi-diagrams": "^1.11.0" },
      });
    }
    expect(JSON.parse(templateManifest("shop", "purchase", versions)).catalog.title).toBe(
      "Purchase",
    );
  });
});
