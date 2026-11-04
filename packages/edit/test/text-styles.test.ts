import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { planEdit, type EditOperation } from "../src/index.js";

function apply(operation: EditOperation, text: string): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(operation: EditOperation, text: string) {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection;
}

const flow = `diagram d: flow {
  api["API"]
  db[("DB")]
}
`;

const sequence = `diagram s: sequence {
  participant a "A"
  participant b "B"
  a -> b: "Pay" as pay
}
`;

const free = `diagram f: free {
  box a "A"
  image logo "logo.png"
}
`;

const style = (
  diagram: string,
  target: string,
  targetKind: "element" | "relation",
  property: string,
  value: string | number | null,
): EditOperation => ({ kind: "setStyleProperty", diagram, target, targetKind, property, value });

describe("text styles", () => {
  it("writes a font quoted and a size on a flow node", () => {
    let text = apply(style("d", "api", "element", "font", "Roboto"), flow);
    expect(text).toContain('  style api { font "Roboto" }\n');
    text = apply(style("d", "api", "element", "fontSize", 16), text);
    expect(text).toContain('  style api { font "Roboto"; fontSize 16 }\n');
    text = apply(style("d", "api", "element", "font", null), text);
    expect(text).toContain("  style api { fontSize 16 }\n");
  });

  it("writes a weight on a sequence message", () => {
    const text = apply(style("s", "pay", "relation", "fontWeight", 600), sequence);
    expect(text).toContain("  style pay { fontWeight 600 }\n");
  });

  it("refuses a size out of range and a font on an image", () => {
    expect(refused(style("d", "api", "element", "fontSize", 300), flow).code).toBe(
      "edit.invalid-value",
    );
    expect(refused(style("f", "logo", "element", "font", "Lora"), free).code).toBe(
      "edit.invalid-value",
    );
  });
});
