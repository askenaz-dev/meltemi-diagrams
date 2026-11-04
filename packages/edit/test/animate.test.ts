import { describe, expect, it } from "vitest";
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

const base = (extra = "") =>
  `language "0.2"\n\ndiagram d: flow {\n  node api\n  note memo "Hi"\n  api -> db as save\n  api -> cache as ship\n  api -> queue\n${extra}}\n`;

describe("setAnimation", () => {
  it("adds an effect", () => {
    const after = run(base(), {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
    });
    expect(after).toContain("  api -> queue\n  animate save { effect flow }\n}");
  });

  it("adds an effect with a property after the last style", () => {
    const after = run(base('  style api { fill "#eee" }\n'), {
      kind: "setAnimation",
      diagram: "d",
      target: "api",
      targetKind: "element",
      effect: "pulse",
      property: "duration",
      value: 1500,
    });
    expect(after).toContain(
      '  style api { fill "#eee" }\n  animate api { effect pulse; duration 1500ms }\n',
    );
  });

  it("sets, replaces and removes a property", () => {
    const text = base("  animate save { effect flow }\n");
    const one = run(text, {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
      property: "particles",
      value: 3,
    });
    expect(one).toContain("animate save { effect flow; particles 3 }");
    const two = run(one, {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
      property: "particles",
      value: 2,
    });
    expect(two).toContain("animate save { effect flow; particles 2 }");
    const three = run(two, {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
      property: "particles",
      value: null,
    });
    expect(three).toContain("animate save { effect flow }");
  });

  it("splits a statement shared with other targets", () => {
    const after = run(base("  animate save, ship { effect flow }\n"), {
      kind: "setAnimation",
      diagram: "d",
      target: "ship",
      targetKind: "relation",
      effect: "flow",
      property: "duration",
      value: 2000,
    });
    expect(after).toContain(
      "  animate save { effect flow }\n  animate ship { effect flow; duration 2000ms }\n",
    );
  });

  it("keeps effects of other kinds apart", () => {
    const after = run(base("  animate save { effect flow }\n"), {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "dash",
      property: "direction",
      value: "reverse",
    });
    expect(after).toContain(
      "  animate save { effect flow }\n  animate save { effect dash; direction reverse }\n",
    );
  });

  it("writes colour tokens bare and colours quoted", () => {
    const token = run(base(), {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
      property: "color",
      value: "@accent",
    });
    expect(token).toContain("color accent");
    const css = run(base(), {
      kind: "setAnimation",
      diagram: "d",
      target: "save",
      targetKind: "relation",
      effect: "flow",
      property: "color",
      value: "#ff0000",
    });
    expect(css).toContain('color "#ff0000"');
  });

  it("refuses what the language refuses", () => {
    expect(
      refused(base(), {
        kind: "setAnimation",
        diagram: "d",
        target: "api",
        targetKind: "element",
        effect: "flow",
      }),
    ).toMatch(/^edit.invalid-value: Flow particles/);
    expect(
      refused(base(), {
        kind: "setAnimation",
        diagram: "d",
        target: "memo",
        targetKind: "element",
        effect: "dash",
      }),
    ).toMatch(/no outline/);
    expect(
      refused(base(), {
        kind: "setAnimation",
        diagram: "d",
        target: "api",
        targetKind: "element",
        effect: "pulse",
        property: "particles",
        value: 2,
      }),
    ).toMatch(/does not apply/);
    expect(
      refused(base(), {
        kind: "setAnimation",
        diagram: "d",
        target: "save",
        targetKind: "relation",
        effect: "flow",
        property: "duration",
        value: 10,
      }),
    ).toMatch(/100 to 60000/);
    expect(
      refused(base(), {
        kind: "setAnimation",
        diagram: "d",
        target: "api->queue#1",
        targetKind: "relation",
        effect: "flow",
      }),
    ).toMatch(/^edit.anonymous-relation/);
  });
});

describe("removeAnimation", () => {
  it("removes the statement or the target from it", () => {
    const alone = run(base("  animate save { effect flow }\n"), {
      kind: "removeAnimation",
      diagram: "d",
      target: "save",
      effect: "flow",
    });
    expect(alone).not.toContain("animate");
    const shared = run(base("  animate save, ship { effect flow }\n"), {
      kind: "removeAnimation",
      diagram: "d",
      target: "save",
      effect: "flow",
    });
    expect(shared).toContain("  animate ship { effect flow }\n");
  });
});
