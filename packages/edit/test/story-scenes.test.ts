import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { planEdit, type EditOperation } from "../src/index.js";

function apply(source: string, operation: EditOperation): string {
  const result = planEdit(compile(source), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  const next = applyTextEdits(source, result.plan.edits);
  expect(applyTextEdits(next, result.plan.inverse)).toBe(source);
  expect(compile(next).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return next;
}

const base = `diagram d: flow { a -> b }
story tour for d {
  // Keep the framing explanation.
  scene first { camera a over 1s; hold 9s }
  scene second { highlight b over 2s; hold 4s }
}
export site for tour { format html }
story other for d { scene keep { hold 1s } }
`;

describe("story and scene display names", () => {
  for (const eol of ["\n", "\r\n"])
    it(`sets human names without changing stable ids or exports (${JSON.stringify(eol)})`, () => {
      const source = base.replaceAll("\n", eol);
      const titled = apply(source, {
        kind: "setStoryTitle",
        story: "tour",
        title: 'DEV y PROD — "A"',
      });
      const next = apply(titled, {
        kind: "setSceneTitle",
        story: "tour",
        scene: "first",
        title: "Identidad / acceso",
      });
      const story = compile(next).document.stories[0]!;
      expect(story.id).toBe("tour");
      expect(story.title).toBe('DEV y PROD — "A"');
      expect(story.scenes[0]!.id).toBe("first");
      expect(story.scenes[0]!.title).toBe("Identidad / acceso");
      expect(next).toContain("export site for tour");
      expect(next).toContain("// Keep the framing explanation.");
      expect(next).toContain("story other for d");
      const cleared = apply(apply(next, { kind: "setStoryTitle", story: "tour", title: null }), {
        kind: "setSceneTitle",
        story: "tour",
        scene: "first",
        title: null,
      });
      expect(compile(cleared).document.stories[0]!.title).toBeNull();
      expect(compile(cleared).document.stories[0]!.scenes[0]!.title).toBeNull();
    });

  it("updates the effective title while retaining duplicate declarations and comments", () => {
    const source =
      'diagram d: flow {node a}\nstory s for d {title "First"; title /* keep */ "Last"; scene one {hold 1s}}';
    const next = apply(source, { kind: "setStoryTitle", story: "s", title: "Human name" });
    expect(next).toContain('title "First"');
    expect(next).toContain('title /* keep */ "Human name"');
    expect(compile(next).document.stories[0]!.title).toBe("Human name");
  });

  it("does not write when display names are unchanged", () => {
    const source = 'diagram d: flow {node a}\nstory s for d {title "S";scene one "One" {hold 1s}}';
    for (const operation of [
      { kind: "setStoryTitle", story: "s", title: "S" },
      { kind: "setSceneTitle", story: "s", scene: "one", title: "One" },
    ] as const) {
      const result = planEdit(compile(source), operation);
      expect(result.ok && result.plan.edits).toEqual([]);
    }
  });
});

describe("scene removal", () => {
  it("retains the story after deleting its final scene", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {hold 1s}}\nstory other for d {scene keep {hold 2s}}";
    const next = apply(source, { kind: "removeScene", story: "s", scene: "one" });
    expect(compile(next).document.stories.map((s) => [s.id, s.scenes.length])).toEqual([
      ["s", 0],
      ["other", 1],
    ]);
  });

  it("clears an orphaned overlap but keeps the next scene and its comments", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {\n scene one {hold 10s}\n // Keep second.\n scene two {overlap 2s; hold 6s}\n scene three {hold 2s}\n}";
    const next = apply(source, { kind: "removeScene", story: "s", scene: "one" });
    expect(next).not.toContain("overlap 2s");
    expect(next).toContain("// Keep second.");
    expect(compile(next).document.stories[0]!.scenes.map((s) => [s.id, s.startMs])).toEqual([
      ["two", 0],
      ["three", 6000],
    ]);
  });

  it("preserves a following scene's implicitly inherited view", () => {
    const source =
      "diagram a: flow {node one}\ndiagram b: flow {node two}\nstory s for a {scene first {view b;transition cut;hold 1s}\n scene second {highlight two over 2s}}";
    const next = apply(source, { kind: "removeScene", story: "s", scene: "first" });
    const scene = compile(next).document.stories[0]!.scenes[0]!;
    expect(scene.view.name).toBe("b");
    expect(scene.transition?.kind).toBe("cut");
    expect(next).toContain("highlight two over 2s");
  });

  it("adds a required cut even when the following scene already declares its view", () => {
    const source =
      "diagram a: flow {node one}\ndiagram b: flow {node two}\nstory s for a {\nscene first {hold 1s}\nscene middle {view b;transition cut;hold 1s}\nscene last {view b;highlight two over 2s}\n}";
    const next = apply(source, { kind: "removeScene", story: "s", scene: "middle" });
    const scene = compile(next).document.stories[0]!.scenes[1]!;
    expect(scene.view.name).toBe("b");
    expect(scene.transition?.kind).toBe("cut");
  });

  it("inserts a new empty scene without giving the following scene an unrelated overlap", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {hold 10s}\n scene two {overlap 2s;hold 6s}}";
    const next = apply(source, { kind: "insertScene", story: "s", id: "new", after: "one" });
    expect(compile(next).document.stories[0]!.scenes.map((s) => [s.id, s.startMs])).toEqual([
      ["one", 0],
      ["new", 10000],
      ["two", 10000],
    ]);
  });
});

describe("overlap and transition source controls", () => {
  it("refuses a cascading element removal that would invalidate an overlap", () => {
    const source =
      "diagram d: flow {node a;node b}\nstory s for d {scene one {highlight a over 10s}\nscene two {overlap 8s;highlight b over 10s}}";
    const removal = {
      kind: "removeElement",
      diagram: "d",
      element: "a",
      cascade: true,
    } as const;
    const result = planEdit(compile(source), removal);
    expect(!result.ok && result.rejection.code).toBe("edit.invalid-value");
    const sequential = apply(source, {
      kind: "setSceneOverlap",
      story: "s",
      scene: "two",
      durationMs: 0,
    });
    const next = apply(sequential, removal);
    expect(compile(next).document.stories[0]!.scenes[0]!.durationMs).toBe(0);
    expect(next).toContain("highlight b over 10s");
  });

  it("places overlap before the action's attached comments and restores sequential placement", () => {
    const source = base.replace(
      "scene second {",
      "scene second {\n    // Explain the highlight.\n   ",
    );
    const next = apply(source, {
      kind: "setSceneOverlap",
      story: "tour",
      scene: "second",
      durationMs: 1500,
    });
    const scene = compile(next).document.stories[0]!.scenes[1]!;
    expect(scene.startMs).toBe(8500);
    expect(next).toMatch(/overlap 1500ms\n\s*\/\/ Explain the highlight/);
    const after = apply(next, {
      kind: "setSceneOverlap",
      story: "tour",
      scene: "second",
      durationMs: 0,
    });
    expect(compile(after).document.stories[0]!.scenes[1]!.startMs).toBe(10000);
  });

  it("preserves comments inside a transition when changing its kind and removing its time", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {transition fade /* keep kind */ over /* keep time */ 2s;hold 1s}}";
    const next = apply(source, {
      kind: "setSceneTransition",
      story: "s",
      scene: "one",
      transition: "cut",
    });
    expect(next).toContain("/* keep kind */");
    expect(next).toContain("/* keep time */");
    expect(compile(next).document.stories[0]!.scenes[0]!.transition?.kind).toBe("cut");
  });

  it("creates a transition and then changes its time through one reversible operation", () => {
    const next = apply(base, {
      kind: "setSceneTransition",
      story: "tour",
      scene: "second",
      transition: "fade",
      durationMs: 1200,
    });
    const timed = apply(next, {
      kind: "setSceneTransition",
      story: "tour",
      scene: "second",
      transition: "morph",
      durationMs: 700,
    });
    expect(compile(timed).document.stories[0]!.scenes[1]!.transition?.durationMs).toBe(700);
  });

  it("refuses a timed cut consistently with or without an existing transition", () => {
    for (const source of [
      base,
      base.replace("scene second {", "scene second {transition fade over 1s;"),
    ]) {
      const result = planEdit(compile(source), {
        kind: "setSceneTransition",
        story: "tour",
        scene: "second",
        transition: "cut",
        durationMs: 1000,
      });
      expect(!result.ok && result.rejection.code).toBe("edit.invalid-value");
    }
  });

  it("uses the overlap-mode duration to refuse an impossible overlap", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {hold 10s}\nscene two {transition fade over 4s;hold 2s}}";
    const result = planEdit(compile(source), {
      kind: "setSceneOverlap",
      story: "s",
      scene: "two",
      durationMs: 5000,
    });
    expect(!result.ok && result.rejection.code).toBe("edit.invalid-value");
    expect(!result.ok && result.rejection.reason).toContain("4 s");
  });

  it("retimes an overlapped scene whose transition is longer than its current ending pause", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {hold 10s}\nscene two {overlap 1s;transition fade over 4s;hold 2s}}";
    const next = apply(source, {
      kind: "setSceneDuration",
      story: "s",
      scene: "two",
      durationMs: 5000,
    });
    expect(compile(next).document.stories[0]!.scenes[1]!.durationMs).toBe(5000);
    expect(next).toContain("hold 5000ms");
  });

  it("refuses to shorten an outgoing overlap and leaves the source unchanged", () => {
    const source =
      "diagram d: flow {node a}\nstory s for d {scene one {hold 10s}\nscene two {overlap 8s;hold 10s}}";
    const result = planEdit(compile(source), {
      kind: "setSceneDuration",
      story: "s",
      scene: "one",
      durationMs: 7000,
    });
    expect(!result.ok && result.rejection.code).toBe("edit.invalid-value");
    expect(!result.ok && result.rejection.reason).toContain("8 s");
  });
});

describe("unsafe story source", () => {
  for (const operation of [
    { kind: "removeScene", story: "s", scene: "one" },
    { kind: "setStoryTitle", story: "s", title: "Name" },
    { kind: "setSceneTitle", story: "s", scene: "one", title: "Name" },
  ] as const)
    it(`refuses recovered syntax for ${operation.kind}`, () => {
      const result = planEdit(
        compile("diagram d: flow {node a}\nstory s for d {scene one {hold 1s"),
        operation,
      );
      expect(!result.ok && result.rejection.code).toBe("edit.unsafe-target");
    });
});
