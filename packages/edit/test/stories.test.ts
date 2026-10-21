import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation } from "../src/index.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");

function apply(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const next = applyTextEdits(text, result.plan.edits);
  // The inverse restores the text.
  expect(applyTextEdits(next, result.plan.inverse)).toBe(text);
  return next;
}

function refusal(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return result.rejection.code;
}

const SHORT = [
  'language "0.2"',
  "diagram one: flow {",
  "  node a",
  "  node b",
  "  a -> b as ab",
  "}",
  "diagram two: flow {",
  "  node a",
  "}",
  "",
  "story s for one {",
  "  scene first {",
  "    reveal a, b",
  "    hold 1s",
  "  }",
  "",
  "  scene second {",
  "    view two",
  "    transition fade",
  "    highlight a",
  "  }",
  "}",
  "",
].join("\n");

describe("setStoryTiming", () => {
  it("replaces the written time of an action", () => {
    const next = apply(purchase, {
      kind: "setStoryTiming",
      story: "purchase",
      path: [0, 0],
      durationMs: 1200,
    });
    expect(next).toContain("    reveal client, api, orders, db over 1200ms\n");
  });

  it("sets the time of a hold and of an action in a parallel block", () => {
    const hold = apply(purchase, {
      kind: "setStoryTiming",
      story: "purchase",
      path: [1, 3],
      durationMs: 3000,
    });
    expect(hold).toContain("    hold 3000ms\n");
    const inner = apply(purchase, {
      kind: "setStoryTiming",
      story: "purchase",
      path: [1, 2, 1],
      durationMs: 900,
    });
    expect(inner).toContain("      highlight db over 900ms\n");
  });

  it("writes `over` when no time is written, and times transitions", () => {
    const action = apply(SHORT, {
      kind: "setStoryTiming",
      story: "s",
      path: [0, 0],
      durationMs: 700,
    });
    expect(action).toContain("    reveal a, b over 700ms\n");
    const transition = apply(SHORT, {
      kind: "setStoryTiming",
      story: "s",
      path: [1],
      durationMs: 500,
    });
    expect(transition).toContain("    transition fade over 500ms\n");
    expect(compile(transition).document.stories[0]!.scenes[1]!.transition!.durationMs).toBe(500);
  });

  it("refuses parallel blocks, cuts, bad paths and bad times", () => {
    expect(
      refusal(purchase, {
        kind: "setStoryTiming",
        story: "purchase",
        path: [1, 2],
        durationMs: 100,
      }),
    ).toBe("edit.invalid-value");
    const cut = SHORT.replace("transition fade", "transition cut");
    expect(refusal(cut, { kind: "setStoryTiming", story: "s", path: [1], durationMs: 100 })).toBe(
      "edit.invalid-value",
    );
    expect(
      refusal(SHORT, { kind: "setStoryTiming", story: "s", path: [0, 9], durationMs: 100 }),
    ).toBe("edit.unsafe-target");
    expect(
      refusal(SHORT, { kind: "setStoryTiming", story: "nope", path: [0, 0], durationMs: 100 }),
    ).toBe("edit.unsafe-target");
    expect(
      refusal(SHORT, { kind: "setStoryTiming", story: "s", path: [0, 0], durationMs: 700_000 }),
    ).toBe("edit.invalid-value");
  });
});

describe("insertStoryAction", () => {
  it("appends an action with the view's ids", () => {
    const next = apply(SHORT, {
      kind: "insertStoryAction",
      story: "s",
      scene: "first",
      action: "trace",
      targets: ["ab"],
      durationMs: 1500,
    });
    expect(next).toContain("    hold 1s\n    trace ab over 1500ms\n  }");
    expect(compile(next).diagnostics).toEqual([]);
  });

  it("writes holds and `all`", () => {
    const hold = apply(SHORT, {
      kind: "insertStoryAction",
      story: "s",
      scene: "second",
      action: "hold",
      targets: [],
      durationMs: 2000,
    });
    expect(hold).toContain("    highlight a\n    hold 2000ms\n");
    const focus = apply(SHORT, {
      kind: "insertStoryAction",
      story: "s",
      scene: "first",
      action: "focus",
      targets: [],
      all: true,
    });
    expect(focus).toContain("    focus all\n");
  });

  it("checks targets against the scene's view", () => {
    // `b` is in `one`, not in `two`, the view of the second scene.
    expect(
      refusal(SHORT, {
        kind: "insertStoryAction",
        story: "s",
        scene: "second",
        action: "reveal",
        targets: ["b"],
      }),
    ).toBe("edit.unsafe-target");
    expect(
      refusal(SHORT, {
        kind: "insertStoryAction",
        story: "s",
        scene: "first",
        action: "trace",
        targets: ["a"],
      }),
    ).toBe("edit.invalid-value");
    expect(
      refusal(SHORT, {
        kind: "insertStoryAction",
        story: "s",
        scene: "first",
        action: "hold",
        targets: [],
      }),
    ).toBe("edit.invalid-value");
    expect(
      refusal(SHORT, {
        kind: "insertStoryAction",
        story: "s",
        scene: "first",
        action: "reveal",
        targets: [],
        all: true,
      }),
    ).toBe("edit.invalid-value");
    expect(
      refusal(SHORT, {
        kind: "insertStoryAction",
        story: "s",
        scene: "third",
        action: "reveal",
        targets: ["a"],
      }),
    ).toBe("edit.unsafe-target");
  });
});

describe("removeStoryAction and insertScene", () => {
  it("removes an action, also inside a parallel block", () => {
    const next = apply(purchase, { kind: "removeStoryAction", story: "purchase", path: [1, 2, 0] });
    expect(next).not.toContain("trace save");
    expect(next).toContain("    parallel {\n      highlight db over 1200ms\n    }\n");
  });

  it("adds a scene at the end or after another, with a blank line", () => {
    const last = apply(SHORT, { kind: "insertScene", story: "s", id: "third", title: "The end" });
    expect(last).toContain('    highlight a\n  }\n\n  scene third "The end" {\n  }\n}\n');
    const after = apply(SHORT, { kind: "insertScene", story: "s", id: "middle", after: "first" });
    expect(after).toContain("    hold 1s\n  }\n\n  scene middle {\n  }\n\n  scene second {");
    expect(compile(after).document.stories[0]!.scenes.map((s) => s.id)).toEqual([
      "first",
      "middle",
      "second",
    ]);
    expect(refusal(SHORT, { kind: "insertScene", story: "s", id: "first" })).toBe(
      "edit.id-conflict",
    );
    expect(refusal(SHORT, { kind: "insertScene", story: "s", id: "9x" })).toBe("edit.invalid-id");
  });
});

describe("renames and removals reach stories", () => {
  it("renames an element in the story", () => {
    const next = apply(purchase, {
      kind: "renameElement",
      diagram: "checkout",
      element: "db",
      newId: "store",
    });
    expect(next).toContain("    reveal client, api, orders, store over 800ms\n");
    expect(next).toContain("      highlight store over 1200ms\n");
    expect(compile(next).diagnostics).toEqual([]);
  });

  it("renames a relation it traces", () => {
    const next = apply(purchase, {
      kind: "renameRelation",
      diagram: "checkout",
      relation: "request",
      newId: "call",
    });
    expect(next).toContain("    trace call over 1200ms\n");
  });

  it("lists story actions among the dependents of a removal and removes them", () => {
    const result = planEdit(compile(purchase), {
      kind: "removeElement",
      diagram: "checkout",
      element: "db",
      cascade: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.rejection.dependents?.filter((d) => d.kind === "story").map((d) => d.description),
    ).toEqual([
      "`reveal` in story `purchase` on line 41",
      // `save` goes with `db`, and its trace with it.
      "`trace` in story `purchase` on line 49",
      "`highlight` in story `purchase` on line 50",
    ]);
    const next = apply(purchase, {
      kind: "removeElement",
      diagram: "checkout",
      element: "db",
      cascade: true,
    });
    expect(next).toContain("    reveal client, api, orders over 800ms\n");
    expect(next).not.toContain("highlight db");
    expect(next).not.toContain("trace save");
    // The parallel block left empty goes too.
    expect(next).toContain("    trace create over 1200ms\n    hold 2s\n");
    expect(compile(next).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("renames entity paths in stories of a C4 view", () => {
    const text = [
      'language "0.2"',
      "model shop {",
      '  system web "Web" {',
      '    container api "API"',
      "  }",
      "}",
      "diagram inside: c4 using shop {",
      "  level container",
      "  scope web",
      "}",
      "story tour for inside {",
      "  scene one {",
      "    reveal web.api",
      "  }",
      "}",
      "",
    ].join("\n");
    expect(compile(text).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const next = apply(text, {
      kind: "renameEntity",
      model: "shop",
      entity: "web.api",
      newId: "backend",
    });
    expect(next).toContain("    reveal web.backend\n");
    const parent = apply(text, {
      kind: "renameEntity",
      model: "shop",
      entity: "web",
      newId: "site",
    });
    expect(parent).toContain("    reveal site.api\n");
  });
});
