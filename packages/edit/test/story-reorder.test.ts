import { describe, expect, it } from "vitest";
import { applyTextEdits, parse, tokensOf } from "@meltemi/diagrams-language";
import { compile, type StoryAction } from "@meltemi/diagrams-model";
import { applyEdits, inversePlan, planEdit, type EditOperation } from "../src/index.js";

const prefix = "diagram d: flow { node a; node b; a -> b as ab }\nstory s for d {\n";
const suffix = "  scene other { hold 2s }\n}\nexport film for s { format html }\n";
const source = (body: string, eol = "\n") =>
  (prefix + "  scene one {\n" + body + "\n  }\n" + suffix).replaceAll("\n", eol);
const operation = (from: number, index: number, sceneIndex = 0): EditOperation => ({
  kind: "reorderStoryAction",
  story: "s",
  path: [sceneIndex, from],
  index,
});

function move(text: string, from: number, index: number, sceneIndex = 0): string {
  const result = planEdit(compile(text), operation(from, index, sceneIndex), { revision: 9 });
  if (!result.ok) expect.fail(`${result.rejection.code}: ${result.rejection.reason}`);
  const applied = applyEdits({ text, revision: 9 }, result.plan);
  if (!applied.ok) expect.fail(applied.rejection.reason);
  const next = applied.document.text;
  const comments = (value: string) =>
    [...tokensOf(parse(value).root)]
      .flatMap((token) =>
        token.leadingTrivia
          .filter((trivia) => trivia.kind === "LineComment" || trivia.kind === "BlockComment")
          .map((trivia) => trivia.text),
      )
      .sort();
  expect(comments(next)).toEqual(comments(text));
  expect(applyTextEdits(next, result.plan.inverse)).toBe(text);
  const undone = applyEdits(applied.document, inversePlan(result.plan, 10));
  expect(undone.ok && undone.document.text).toBe(text);
  expect(compile(next).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const beforeStory = compile(text).document.stories[0]!;
  const afterStory = compile(next).document.stories[0]!;
  expect(afterStory.durationMs).toBeCloseTo(beforeStory.durationMs, 9);
  for (let i = 0; i < beforeStory.scenes.length; i++)
    expect(afterStory.scenes[i]!.durationMs).toBeCloseTo(beforeStory.scenes[i]!.durationMs, 9);
  expect(next.startsWith(prefix.replaceAll("\n", text.includes("\r\n") ? "\r\n" : "\n"))).toBe(
    true,
  );
  expect(next.endsWith(suffix.replaceAll("\n", text.includes("\r\n") ? "\r\n" : "\n"))).toBe(true);
  return next;
}

function timing(action: StoryAction): unknown {
  return [action.kind, action.durationMs, action.writtenMs, action.children.map(timing)];
}

describe("story action reordering", () => {
  const body = "    hold 115ms\n    hold 227ms\n    hold 453ms";
  it.each([
    [2, 0, [453, 115, 227]],
    [0, 2, [227, 453, 115]],
    [0, 1, [227, 115, 453]],
    [2, 1, [115, 453, 227]],
    [1, 0, [227, 115, 453]],
    [1, 2, [115, 453, 227]],
  ])("moves action %i to final index %i", (from, index, times) => {
    const next = move(source(body), from, index);
    const actions = compile(next).document.stories[0]!.scenes[0]!.actions;
    expect(actions.map((action) => action.durationMs)).toEqual(times);
    expect(actions.map((action) => action.startMs)).toEqual([0, times[0], times[0]! + times[1]!]);
    expect(next).toBe(source(times.map((time) => `    hold ${time}ms`).join("\n")));
  });

  it("writes no edit for the current index", () => {
    const result = planEdit(compile(source(body)), operation(1, 1));
    expect(result.ok && result.plan.edits).toEqual([]);
  });

  it("preserves fractional written times without snapping or rejecting floating-point sums", () => {
    const text = source("    hold 0.1ms\n    hold 0.2ms\n    hold 0.3ms");
    expect(move(text, 0, 2)).toBe(source("    hold 0.2ms\n    hold 0.3ms\n    hold 0.1ms"));
  });

  it.each(["\n", "\r\n"])(
    "preserves fractional actions after a large absolute story clock (%j)",
    (eol) => {
      const withEarlierScene = (body: string) =>
        source(body, eol).replace(
          "  scene one {",
          `  scene earlier { hold 131071.9ms }${eol}  scene one {`,
        );
      const text = withEarlierScene(
        "    view d\n    transition cut\n    hold 0.1ms\n    hold 0.001ms\n    hold 0.3ms",
      );
      const next = move(text, 0, 2, 1);
      expect(next).toBe(
        withEarlierScene(
          "    view d\n    transition cut\n    hold 0.001ms\n    hold 0.3ms\n    hold 0.1ms",
        ),
      );
      const beforeScene = compile(text).document.stories[0]!.scenes[1]!;
      const afterScene = compile(next).document.stories[0]!.scenes[1]!;
      expect(afterScene.startMs).toBe(beforeScene.startMs);
      expect(afterScene.actions.map(timing)).toEqual([
        timing(beforeScene.actions[1]!),
        timing(beforeScene.actions[2]!),
        timing(beforeScene.actions[0]!),
      ]);
      expect(afterScene.transition?.durationMs).toBe(beforeScene.transition?.durationMs);
    },
  );

  it.each(["\n", "\r\n"])("moves attached and trailing comments verbatim (%j)", (eol) => {
    const text = source(
      "    // First action.\n    hold 115ms // Keep first.\n" +
        "    /* Second action. */\n    hold 227ms /* Keep second. */\n" +
        "    // Third action.\n    hold 453ms // Keep third.",
      eol,
    );
    const next = move(text, 2, 0);
    expect(next).toBe(
      source(
        "    // Third action.\n    hold 453ms // Keep third.\n" +
          "    // First action.\n    hold 115ms // Keep first.\n" +
          "    /* Second action. */\n    hold 227ms /* Keep second. */",
        eol,
      ),
    );
    if (eol === "\r\n") expect(next.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("does not attach comment lines across a blank line", () => {
    const text = source(
      "    hold 115ms\n    // Separate note.\n\n    // For the second.\n    hold 227ms\n    hold 453ms",
    );
    expect(move(text, 1, 0)).toBe(
      source(
        "    // For the second.\n    hold 227ms\n    // Separate note.\n\n    hold 115ms\n    hold 453ms",
      ),
    );
  });

  it("keeps multiline block comments with their action", () => {
    const text = source(
      "    hold 115ms\n    /* Explain\n       the second action. */\n    hold 227ms\n    hold 453ms",
    );
    expect(move(text, 1, 0)).toBe(
      source(
        "    /* Explain\n       the second action. */\n    hold 227ms\n    hold 115ms\n    hold 453ms",
      ),
    );
  });

  it.each(["\n", "\r\n"])("preserves semicolon syntax and inline block comments (%j)", (eol) => {
    const text = source("    hold 115ms; /* second */ hold 227ms /* tail */; hold 453ms;", eol);
    expect(move(text, 1, 0)).toBe(
      source("    /* second */ hold 227ms /* tail */; hold 115ms; hold 453ms;", eol),
    );
  });

  it.each(["\n", "\r\n"])(
    "keeps block comments after semicolons attached to the following action (%j)",
    (eol) => {
      for (const separator of [";", ";\n    ", "\n    "]) {
        const text = source(`    hold 1ms; /* second */${separator}hold 2ms;hold 3ms`, eol);
        expect(move(text, 0, 2)).toBe(
          source(`    /* second */${separator}hold 2ms; hold 3ms;hold 1ms`, eol),
        );
        expect(move(text, 1, 2)).toBe(
          source(`    hold 1ms; hold 3ms;/* second */${separator}hold 2ms`, eol),
        );
      }
    },
  );

  it.each(["\n", "\r\n"])(
    "keeps inline // after semicolons with the preceding action and standalone // with the next (%j)",
    (eol) => {
      const inline = source("    hold 1ms; // First.\n    hold 2ms;hold 3ms", eol);
      expect(move(inline, 0, 2)).toBe(
        source("    hold 2ms\n    hold 3ms;hold 1ms; // First.", eol),
      );
      expect(move(inline, 1, 2)).toBe(
        source("    hold 1ms; // First.\n    hold 3ms;hold 2ms", eol),
      );
      const text = source("    hold 1ms; // First.\n    // Second.\n    hold 2ms;hold 3ms", eol);
      expect(move(text, 0, 2)).toBe(
        source("    // Second.\n    hold 2ms\n    hold 3ms;hold 1ms; // First.", eol),
      );
      expect(move(text, 1, 2)).toBe(
        source("    hold 1ms; // First.\n    hold 3ms;\n    // Second.\n    hold 2ms", eol),
      );
    },
  );

  it.each(["\n", "\r\n"])("keeps a moved inline trailing line comment safe (%j)", (eol) => {
    const text = source("    hold 115ms; hold 227ms // Second.\n    hold 453ms", eol);
    const next = move(text, 1, 0);
    expect(next).toBe(source("    hold 227ms // Second.\n    hold 115ms\n    hold 453ms", eol));
  });

  it("moves a commented multiline payload into a one-line scene without swallowing neighbours", () => {
    const text =
      prefix +
      "  scene one { hold 115ms; hold 227ms\n    // Third.\n    hold 453ms // Tail.\n  }\n" +
      suffix;
    const next = move(text, 2, 0);
    expect(next).toContain("scene one { \n    // Third.\n    hold 453ms // Tail.\n    hold 115ms");
    expect(next).toContain("hold 227ms");
    expect(next.match(/\/\/ Third\./g)).toHaveLength(1);
    expect(next.match(/\/\/ Tail\./g)).toHaveLength(1);
  });

  it("moves a trailing line comment before an inline closing brace safely", () => {
    const text =
      prefix + "  scene one { hold 115ms // First.\n    hold 227ms; hold 453ms }\n" + suffix;
    const next = move(text, 0, 2);
    expect(next).toContain("hold 115ms // First.\n  }");
    expect(next).toContain("hold 227ms");
    expect(next).toContain("hold 453ms");
  });

  it("moves a nested parallel block as an unchanged unit and anchors transitions", () => {
    const parallel =
      "parallel {\n      camera a over 287ms\n      parallel { highlight b over 413ms; trace ab over 179ms }\n    }";
    const text = source(
      "    transition fade over 333ms\n    hold 115ms\n    // Together.\n    " +
        parallel +
        " // Group.\n    hold 453ms",
    );
    const next = move(text, 1, 0);
    expect(next).toContain(
      "transition fade over 333ms\n    // Together.\n    " + parallel + " // Group.",
    );
    const before = compile(text).document.stories[0]!.scenes[0]!;
    const after = compile(next).document.stories[0]!.scenes[0]!;
    expect(after.actions.map(timing)).toEqual([
      timing(before.actions[1]!),
      timing(before.actions[0]!),
      timing(before.actions[2]!),
    ]);
    expect(after.actions[0]!.children.every((child) => child.startMs === 333)).toBe(true);
    expect(after.transition).toMatchObject({ kind: "fade", startMs: 0, durationMs: 333 });
  });

  it("anchors an explicit view and its transition", () => {
    const text = source("    view d\n    transition fade over 333ms\n" + body);
    expect(move(text, 2, 0)).toBe(
      source(
        "    view d\n    transition fade over 333ms\n    hold 453ms\n    hold 115ms\n    hold 227ms",
      ),
    );
  });

  it.each(
    [[], [0], [0, 0, 0], [-1, 0], [0, -1], [0.5, 0], [0, NaN], [0, Infinity]].map((path) => ({
      path,
    })),
  )("refuses invalid or nested path %j", ({ path }) => {
    const result = planEdit(compile(source(body)), {
      kind: "reorderStoryAction",
      story: "s",
      path,
      index: 0,
    });
    expect(result).toMatchObject({ ok: false, rejection: { code: "edit.invalid-value" } });
  });

  it.each([-1, 3, 0.5, NaN, Infinity])("refuses final index %s", (index) => {
    expect(planEdit(compile(source(body)), operation(0, index))).toMatchObject({
      ok: false,
      rejection: { code: "edit.invalid-value" },
    });
  });

  it.each([
    { story: "missing", path: [0, 0] },
    { story: "s", path: [10, 0] },
    { story: "s", path: [0, 10] },
  ])("refuses an absent target %j", (target) => {
    expect(
      planEdit(compile(source(body)), { kind: "reorderStoryAction", ...target, index: 0 }),
    ).toMatchObject({ ok: false, rejection: { code: "edit.unsafe-target" } });
  });

  it("refuses ambiguous scene contents rather than crossing an unrecognized statement", () => {
    const text = source("    hold 115ms\n    unknown a\n    hold 227ms");
    expect(planEdit(compile(text), operation(0, 1))).toMatchObject({
      ok: false,
      rejection: { code: "edit.unsafe-target" },
    });
  });

  it.each(["\n", "\r\n"])("refuses recovered malformed boundaries without edits (%j)", (eol) => {
    const text = source(body, eol).replace(`  }${eol}  scene other`, `  scene other`);
    expect(compile(text).parse.diagnostics.some((d) => d.severity === "error")).toBe(true);
    expect(planEdit(compile(text), operation(0, 1))).toMatchObject({
      ok: false,
      rejection: { code: "edit.unsafe-target" },
    });
  });

  it("refuses applying a reorder plan to another source revision", () => {
    const text = source(body);
    const result = planEdit(compile(text), operation(0, 2), { revision: 9 });
    if (!result.ok) expect.fail(result.rejection.reason);
    expect(applyEdits({ text, revision: 10 }, result.plan)).toMatchObject({
      ok: false,
      rejection: { code: "edit.stale-revision" },
    });
  });
});
