import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { codeNotesOf, effectsDocument, storyDocument } from "../src/index.js";

const FREE = `language "0.2"
diagram d: free {
  layout manual
  box api "API"
  note snippet "if (a) {\\n\\treturn;\\n}" on api
  note legend "Plain words"
  placement {
    place api at (100, 100)
    place snippet at (400, 100)
    place legend at (400, 300)
  }
  style snippet { textFormat code }
}
`;

const SEQUENCE = `language "0.2"
diagram s: sequence {
  api -> db: "Query"
  note r over api "retry:\\n  3 times"
  note p over db "Plain"
  style r { textFormat code }
}
`;

function drawn(text: string) {
  const compilation = compile(text);
  const diagram = compilation.document.diagrams[0]!;
  return { compilation, diagram, layout: layoutDiagram(compilation, diagram) };
}

describe("code notes in a player document", () => {
  it("carry a code note's text as written in its details, and name it by its first line", () => {
    const { diagram, layout } = drawn(FREE);
    const doc = effectsDocument({ diagram, layout })!;
    const details = doc.details.d!.elements;
    expect(details.snippet).toMatchObject({ kind: "note", code: "if (a) {\n\treturn;\n}" });
    expect(details.snippet!.event).toBeUndefined();
    expect(details.legend!.code).toBeUndefined();
    expect(details.api!.code).toBeUndefined();
    expect(doc.names.d!.labels.snippet).toBe("if (a) {");
  });

  it("enter the code notes of a sequence diagram as events that are selected for their text", () => {
    const { diagram, layout } = drawn(SEQUENCE);
    const doc = effectsDocument({ diagram, layout })!;
    expect(doc.details.s!.elements.r).toMatchObject({
      kind: "note",
      code: "retry:\n  3 times",
      event: true,
    });
    expect(doc.details.s!.elements.p).toBeUndefined();
    expect(doc.names.s!.labels.r).toBe("retry:");
  });

  it("are found from the view's styles, rules included", () => {
    const { diagram, layout } = drawn(
      SEQUENCE.replace("  style r { textFormat code }", "  rule note { textFormat code }"),
    );
    const codes = codeNotesOf(diagram, layout.theme);
    expect([...codes.keys()].sort()).toEqual(["p", "r"]);
    expect(codeNotesOf(diagram, undefined).size).toBe(0);
  });

  it("go into a story's document too", () => {
    const text = `${FREE}story tour for d {\n  scene a {\n    highlight snippet\n  }\n}\n`;
    const { compilation, diagram, layout } = drawn(text);
    const story = compilation.document.stories[0]!;
    const doc = storyDocument(story, new Map([["d", { diagram, layout }]]))!;
    const name = Object.keys(doc.details)[0]!;
    expect(doc.details[name]!.elements.snippet!.code).toBe("if (a) {\n\treturn;\n}");
  });
});
