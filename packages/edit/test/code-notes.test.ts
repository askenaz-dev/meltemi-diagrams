import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { planEdit, type EditOperation } from "../src/index.js";

function run(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(result.rejection.reason);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return `${result.rejection.code}: ${result.rejection.reason}`;
}

const free = (body: string) => `diagram s: free {\n  layout manual\n${body}\n}\n`;

describe("a new code note", () => {
  afterEach(() => setLocale("en"));

  it("is declared with its place and its format in one edit", () => {
    const after = run(free('  box a "A"'), {
      kind: "createElement",
      diagram: "s",
      elementKind: "note",
      label: "Code",
      at: { x: 300, y: 200 },
      textFormat: "code",
    });
    expect(after).toBe(
      free(
        '  box a "A"\n  note note1 "Code"\n  style note1 { textFormat code }\n\n  placement {\n    place note1 at (300, 200)\n  }',
      ),
    );
  });

  it("writes no format for a plain note", () => {
    const after = run(free('  box a "A"'), {
      kind: "createElement",
      diagram: "s",
      elementKind: "note",
      textFormat: "plain",
    });
    expect(after).not.toContain("textFormat");
  });

  it("is declared in a flow diagram, attached to an element", () => {
    const text = 'diagram f: flow {\n  api["API"]\n}\n';
    const after = run(text, {
      kind: "createElement",
      diagram: "f",
      elementKind: "note",
      label: "Code",
      attachedTo: "api",
      textFormat: "code",
    });
    expect(after).toContain('note note1 "Code" on api');
    expect(after).toContain("style note1 { textFormat code }");
  });

  it("is declared in a C4 view with its style", () => {
    const text =
      'model m {\n  system shop "Shop" {\n    container api "API"\n  }\n}\ndiagram v: c4 using m {\n  level container\n  scope shop\n}\n';
    const after = run(text, {
      kind: "createElement",
      diagram: "v",
      elementKind: "note",
      label: "Code",
      textFormat: "code",
    });
    expect(after).toContain('note note1 "Code"');
    expect(after).toContain("style note1 { textFormat code }");
    const view = compile(after).document.diagrams.find((d) => d.id === "v")!;
    expect(view.styles.find((s) => s.target === "note1")?.properties).toEqual({
      textFormat: "code",
    });
  });

  it("is refused for another kind", () => {
    expect(
      refused(free(""), {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        textFormat: "code",
      }),
    ).toBe("edit.invalid-value: A new box takes no `textFormat`; text formats are for notes.");
  });

  it("is refused for a format that is not one", () => {
    expect(
      refused(free(""), {
        kind: "createElement",
        diagram: "s",
        elementKind: "note",
        textFormat: "markdown" as "code",
      }),
    ).toBe("edit.invalid-value: `markdown` is not a text format; the formats are plain, code.");
  });

  it("says the refusal in Spanish", () => {
    setLocale("es");
    expect(
      refused(free(""), {
        kind: "createElement",
        diagram: "s",
        elementKind: "box",
        textFormat: "code",
      }),
    ).toContain("los formatos de texto son para las notas".replace(/^l/, "L"));
  });
});
