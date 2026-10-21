import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { planEdit, type EditOperation } from "../src/index.js";

function apply(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  return applyTextEdits(text, result.plan.edits);
}

const FLOW = 'diagram d: flow {\n  api["API"]\n  db["DB"] { description "Orders" }\n}\n';
const url = (target: string, value: string | null): EditOperation => ({
  kind: "setElementProperty",
  diagram: "d",
  target,
  targetKind: "element",
  property: "url",
  value,
});

describe("url edits", () => {
  it("write, replace and remove the url of an element", () => {
    const added = apply(FLOW, url("api", "https://docs.example.com/api"));
    expect(added).toContain('api["API"] { url "https://docs.example.com/api" }');
    const inBlock = apply(FLOW, url("db", "/docs/db"));
    expect(inBlock).toContain('db["DB"] { description "Orders"; url "/docs/db" }');
    expect(compile(inBlock).document.diagrams[0]!.elementsById.get("db")!.url).toBe("/docs/db");
    expect(apply(added, url("api", null))).toBe(FLOW);
  });

  it("refuse unsafe URLs and relations", () => {
    const refused = planEdit(compile(FLOW), url("api", "javascript:alert(1)"));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.rejection.code).toBe("edit.invalid-value");
  });

  it("write the url of a model entity", () => {
    const model = 'model m {\n  system s "S"\n}\n';
    const next = apply(model, {
      kind: "setEntityProperty",
      model: "m",
      entity: "s",
      property: "url",
      value: "mailto:team@example.com",
    });
    expect(compile(next).document.models[0]!.entitiesByPath.get("s")!.url).toBe(
      "mailto:team@example.com",
    );
  });
});
