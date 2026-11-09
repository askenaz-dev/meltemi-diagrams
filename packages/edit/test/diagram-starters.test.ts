import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { DIAGRAM_STARTERS, planEdit, type EditOperation } from "../src/index.js";

afterEach(() => setLocale("en"));

function add(starter: (typeof DIAGRAM_STARTERS)[number], source = "", id?: string) {
  const before = compile(source);
  const result = planEdit(before, {
    kind: "createDiagramFromStarter",
    starter,
    ...(id ? { id } : {}),
  });
  if (!result.ok) throw new Error(result.rejection.reason);
  const text = applyTextEdits(source, result.plan.edits);
  expect(applyTextEdits(text, result.plan.inverse)).toBe(source);
  const compiled = compile(text);
  expect(compiled.diagnostics).toEqual([]);
  return { text, compiled };
}

describe("diagram starters", () => {
  it("provides one ordered catalogue of seven distinct identities", () => {
    expect(DIAGRAM_STARTERS).toEqual([
      "flow",
      "sequence",
      "c4",
      "gantt",
      "whiteboard",
      "kanban",
      "free",
    ]);
    expect(new Set(DIAGRAM_STARTERS).size).toBe(7);
  });
  for (const locale of ["en", "es"] as const)
    for (const starter of DIAGRAM_STARTERS) {
      it(`creates and lays out ${starter} in ${locale} without diagnostics`, () => {
        setLocale(locale);
        const { compiled } = add(starter);
        expect(compiled.document.diagrams).toHaveLength(1);
        const diagram = compiled.document.diagrams[0]!;
        const layout = layoutDiagram(compiled, diagram, { engine: createElkEngine() });
        expect(layout.diagnostics).toEqual([]);
      });
    }
  it("preserves comments, CRLF, indentation and exact undo while appending", () => {
    const source =
      'language "0.2"\r\n\r\ndiagram overview: flow {\r\n    // keep\r\n}\r\n// last comment\r\n';
    for (const starter of DIAGRAM_STARTERS) {
      const { text } = add(starter, source);
      expect(text).toContain("// last comment");
      expect(text).toContain("    // keep");
      expect(text.replaceAll("\r\n", "")).not.toContain("\n");
    }
  });
  it("allocates C4 names against all bindings and supports repeated additions", () => {
    const source = 'language "0.2"\nmodel model1 {}\ntheme diagram1 {}\n';
    const first = add("c4", source);
    const second = add("c4", first.text);
    const models = second.compiled.document.models.map((m) => m.id);
    expect(new Set(models).size).toBe(3);
    expect(second.compiled.document.diagrams.map((d) => d.id)).toEqual(["diagram2", "diagram3"]);
    expect(second.text).toContain("theme diagram1 {}");
  });
  it("creates board/list structure and localizes inserted content only at creation", () => {
    setLocale("es");
    const board = add("kanban");
    expect(board.text).toContain('group todo "Por hacer"');
    expect(board.text).toContain('sticky idea "Nueva idea"');
    expect(board.text).toContain("layout row");
    expect(board.text).toContain("preset board");
    setLocale("en");
    expect(board.text).toContain('"Nueva idea"');
    expect(add("whiteboard").text).toContain('theme "sketch.light"');
  });
  it("rejects unknown starters, conflicting ids and broken source atomically", () => {
    for (const operation of [
      { kind: "createDiagramFromStarter", starter: "unknown" },
      { kind: "createDiagramFromStarter", starter: "c4", id: "bad id" },
      { kind: "createDiagramFromStarter", starter: "c4", id: "existing" },
    ]) {
      const result = planEdit(compile("diagram existing: flow {}"), operation as EditOperation);
      expect(result.ok).toBe(false);
    }
    const result = planEdit(compile("diagram broken: flow {"), {
      kind: "createDiagramFromStarter",
      starter: "c4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.code).toBe("edit.unsafe-target");
  });
});
