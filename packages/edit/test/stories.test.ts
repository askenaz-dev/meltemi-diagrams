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

describe("story removal", () => {
  const source =
    "diagram d: flow { node a }\n// Keep this explanation.\nstory tour for d { scene one { hold 1s } }\n// Keep the other story.\nstory other for d { scene one { hold 2s } }\n";
  it("removes one top-level story and restores every byte through its inverse", () => {
    const next = apply(source, { kind: "removeStory", story: "tour", cascade: false });
    expect(next).not.toContain("story tour");
    expect(next).toContain("diagram d");
    expect(next).toContain("// Keep this explanation.");
    expect(next).toContain("// Keep the other story.\nstory other");
  });
  it("enumerates export dependents and removes them only with consent", () => {
    const text =
      source + "export film for tour { format html }\nexport otherFilm for other { format html }\n";
    const refused = planEdit(compile(text), { kind: "removeStory", story: "tour", cascade: false });
    expect(refused).toMatchObject({
      ok: false,
      rejection: { code: "edit.has-dependents", dependents: [{ kind: "export", name: "film" }] },
    });
    const next = apply(text, { kind: "removeStory", story: "tour", cascade: true });
    expect(next).not.toContain("export film");
    expect(next).toContain("export otherFilm");
    expect(compile(next).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
  it("refuses an absent story", () => {
    expect(refusal(source, { kind: "removeStory", story: "missing", cascade: true })).toBe(
      "edit.unsafe-target",
    );
  });
  it.each(["\n", "\r\n"])(
    "keeps every byte when an unclosed story captures later source (%j)",
    (eol) => {
      const text = [
        'language "0.2"',
        "diagram base: flow { node a }",
        "story broken for base {",
        "  scene first { hold 1s }",
        "// This diagram is outside the intended story.",
        "diagram second: flow { node b }",
        "",
      ].join(eol);
      const compilation = compile(text);
      expect(compilation.parse.diagnostics.some((d) => d.severity === "error")).toBe(true);
      for (const cascade of [false, true]) {
        const result = planEdit(compilation, { kind: "removeStory", story: "broken", cascade });
        const after = result.ok ? applyTextEdits(text, result.plan.edits) : text;
        expect(after).toBe(text);
        expect(result).toMatchObject({
          ok: false,
          rejection: {
            code: "edit.unsafe-target",
            reason: "Fix the source syntax before removing a story.",
          },
        });
      }
    },
  );
  it("still removes a semantically invalid story when its syntax has safe boundaries", () => {
    const text = source.replace("story tour for d", "story tour for missing");
    const compilation = compile(text);
    expect(compilation.parse.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(compilation.diagnostics.some((d) => d.code === "story.unknown-diagram")).toBe(true);
    const next = apply(text, { kind: "removeStory", story: "tour", cascade: false });
    expect(next).toBe(text.replace("story tour for missing { scene one { hold 1s } }\n", ""));
  });
});

describe("scene total duration", () => {
  const source =
    "diagram d: flow { node a }\nstory tour for d {\n  scene one {\n    camera a over 2s\n    // Pause for the audience.\n    hold 1s // Keep this note.\n  }\n  scene two { hold 1s }\n}\n";
  it("changes only the final pause and later scene starts", () => {
    const next = apply(source, {
      kind: "setSceneDuration",
      story: "tour",
      scene: "one",
      durationMs: 4000,
    });
    expect(next).toBe(source.replace("hold 1s //", "hold 2000ms //"));
    const scenes = compile(next).document.stories[0]!.scenes;
    expect(scenes.map((s) => [s.durationMs, s.startMs])).toEqual([
      [4000, 0],
      [1000, 4000],
    ]);
    const zero = apply(source, {
      kind: "setSceneDuration",
      story: "tour",
      scene: "one",
      durationMs: 2000,
    });
    expect(zero).toContain("hold 0ms // Keep this note.");
  });
  it("refuses a total below the content minimum and unsupported values", () => {
    for (const durationMs of [1000, -1, NaN, Infinity, 602001]) {
      const result = planEdit(compile(source), {
        kind: "setSceneDuration",
        story: "tour",
        scene: "one",
        durationMs,
      });
      expect(result).toMatchObject({ ok: false, rejection: { code: "edit.invalid-value" } });
    }
    const short = planEdit(compile(source), {
      kind: "setSceneDuration",
      story: "tour",
      scene: "one",
      durationMs: 1000,
    });
    expect(!short.ok && short.rejection.reason).toContain("2 s");
  });
  it("adds a pause after parallel content and accounts for the transition", () => {
    const text =
      "diagram d: flow { node a }\nstory tour for d {\n  scene one {\n    transition fade over 500ms\n    parallel { camera a over 1500ms; highlight a over 1s }\n  }\n}\n";
    const next = apply(text, {
      kind: "setSceneDuration",
      story: "tour",
      scene: "one",
      durationMs: 3000,
    });
    expect(next).toContain(
      "parallel { camera a over 1500ms; highlight a over 1s }\n    hold 1000ms",
    );
    expect(compile(next).document.stories[0]!.durationMs).toBe(3000);
    const same = apply(text, {
      kind: "setSceneDuration",
      story: "tour",
      scene: "one",
      durationMs: 2000,
    });
    expect(same).toBe(text);
  });
  it("refuses a missing scene", () => {
    expect(
      refusal(source, {
        kind: "setSceneDuration",
        story: "tour",
        scene: "missing",
        durationMs: 2000,
      }),
    ).toBe("edit.unsafe-target");
  });
});

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

describe("createStory", () => {
  const CHECKOUT = 'language "0.2"\n\ndiagram checkout: flow {\n  a -> b as ab\n}\n';
  const codes = (text: string) => compile(text).diagnostics.map((d) => d.code);

  it("appends a story of one empty scene after the last statement, with a blank line", () => {
    const next = apply(CHECKOUT, { kind: "createStory", diagram: "checkout" });
    expect(next).toBe(`${CHECKOUT}\nstory story1 for checkout {\n  scene scene1 {\n  }\n}\n`);
    // Only the warning of the empty scene is new: the canvas fills it.
    expect(codes(CHECKOUT)).toEqual([]);
    expect(codes(next)).toEqual(["story.empty-scene"]);
    const story = compile(next).document.stories[0]!;
    expect([story.id, story.target.name, story.scenes.map((s) => s.id)]).toEqual([
      "story1",
      "checkout",
      ["scene1"],
    ]);
  });

  it("takes the next free id, past a profile's, with a title and a scene id when given", () => {
    const taken = `${CHECKOUT}\nstory story1 for checkout {\n  scene one {\n    reveal a\n  }\n}\n\nexport story2 for checkout {\n  format svg\n}\n`;
    const next = apply(taken, { kind: "createStory", diagram: "checkout", title: "Refund" });
    expect(
      next.endsWith(
        '\nstory story3 for checkout {\n  title "Refund"\n\n  scene scene1 {\n  }\n}\n',
      ),
    ).toBe(true);
    // What was written stays as it was.
    expect(next.startsWith(taken)).toBe(true);
    const named = apply(CHECKOUT, {
      kind: "createStory",
      diagram: "checkout",
      id: "refund",
      scene: "request",
    });
    expect(named).toContain("story refund for checkout {\n  scene request {\n  }\n}\n");
  });

  it("keeps a comment after the last statement on its line, and the file's line ends", () => {
    const commented = `${CHECKOUT.trimEnd()} // the shop\n// end of file\n`;
    const next = apply(commented, { kind: "createStory", diagram: "checkout" });
    expect(next).toBe(
      `${CHECKOUT.trimEnd()} // the shop\n\nstory story1 for checkout {\n  scene scene1 {\n  }\n}\n// end of file\n`,
    );
    const crlf = CHECKOUT.replace(/\n/g, "\r\n");
    const written = apply(crlf, { kind: "createStory", diagram: "checkout" });
    expect(written).toBe(
      `${crlf}\r\nstory story1 for checkout {\r\n  scene scene1 {\r\n  }\r\n}\r\n`,
    );
    // A file without a newline at its end.
    expect(apply(CHECKOUT.trimEnd(), { kind: "createStory", diagram: "checkout" })).toBe(
      `${CHECKOUT.trimEnd()}\n\nstory story1 for checkout {\n  scene scene1 {\n  }\n}\n`,
    );
    // Of any profile: a sequence diagram's story too.
    const sequence =
      'language "0.2"\n\ndiagram pay: sequence {\n  participant a\n  participant b\n  a -> b: "Pay"\n}\n';
    expect(codes(apply(sequence, { kind: "createStory", diagram: "pay" }))).toEqual([
      "story.empty-scene",
    ]);
  });

  it("refuses a diagram that is not the file's, and ids that are not ones or are taken", () => {
    const importing = `language "0.2"\n\nimport "./views.meltemi" as views\n\ndiagram checkout: flow {\n  a -> b\n}\n`;
    const result = planEdit(compile(importing), {
      kind: "createStory",
      diagram: "views.containers",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.rejection).toEqual({
      code: "edit.unsafe-target",
      reason:
        "A story's diagram must be one of the file's; `views.containers` is not (its diagrams: `checkout`).",
    });
    expect(refusal(CHECKOUT, { kind: "createStory", diagram: "checkout", id: "9x" })).toBe(
      "edit.invalid-id",
    );
    expect(refusal(CHECKOUT, { kind: "createStory", diagram: "checkout", id: "checkout" })).toBe(
      "edit.id-conflict",
    );
    expect(refusal(CHECKOUT, { kind: "createStory", diagram: "checkout", scene: "a b" })).toBe(
      "edit.invalid-id",
    );
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
