import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { DIAGRAM_STARTERS } from "@meltemi/diagrams-edit/starters";
import { compile } from "@meltemi/diagrams-model";
import { newDiagramText } from "../src/explorer/tree-model.js";
import { en as canvasEn } from "../../canvas/src/messages/en.js";
import { es as canvasEs } from "../../canvas/src/messages/es.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

afterEach(() => setLocale("en"));
describe("creation catalogue across projects", () => {
  it("names and describes the same choices in explorer and shared canvas", () => {
    for (const [host, canvas] of [
      [en, canvasEn],
      [es, canvasEs],
    ] as const) {
      for (const id of DIAGRAM_STARTERS) {
        expect(host.explorer.actions.kinds[id]).toBe(canvas.diagrams[id]);
        expect(host.explorer.actions.descriptions[id]).toBe(canvas.diagramDescriptions[id]);
      }
    }
  });
  for (const starter of DIAGRAM_STARTERS)
    it(`creates a standalone ${starter} file`, () => {
      const text = newDiagramText(starter, `test_${starter}`);
      const result = compile(text);
      expect(result.diagnostics).toEqual([]);
      expect(result.document.diagrams).toHaveLength(1);
      expect(result.document.diagrams[0]?.properties.title).toBe(`test_${starter}`);
    });
  it("generates localized prepared board content while preserving supplied titles", () => {
    setLocale("es");
    const board = newDiagramText("kanban", "Diseño Kanban");
    expect(board).toContain('title "Diseño Kanban"');
    expect(board).toContain('group todo "Por hacer"');
    expect(newDiagramText("c4", "Diseño C4")).toContain('person user "Usuario"');
  });
});
