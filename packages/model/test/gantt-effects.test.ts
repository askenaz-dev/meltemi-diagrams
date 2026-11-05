import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import { compile } from "../src/index.js";

// Effects on the targets of a gantt chart (the `motion-effects` capability, decision 0066): a task
// or milestone that follows others runs `flow` and `trace` along the dependency arrows into it.

const ROADMAP = readFileSync(join(REPO_ROOT, "corpus/valid/gantt/roadmap.meltemi"), "utf8");

/** The owner's chart with statements added before its closing brace. */
const roadmap = (extra: string): string => ROADMAP.replace(/\}\s*$/, `${extra}\n}\n`);

/** A small chart: a task, one that follows it, a milestone after that, a marker and a section. */
const SMALL = (body: string, extra = ""): string =>
  [
    'language "0.2"',
    "diagram plan: gantt {",
    extra,
    '  section build "Build" {',
    '    task design "Design" from 2026-06-01 for 3d',
    '    task code "Code" after design for 4d',
    '    milestone beta "Beta" after code',
    '    task alone "Alone" from 2026-06-02 for 1d',
    "  }",
    '  marker freeze "Freeze" at 2026-06-10',
    body,
    "}",
    "",
  ].join("\n");

function analyze(source: string) {
  const compilation = compile(source);
  const diagram = compilation.document.diagrams[0]!;
  const text = (d: { range: { start: { offset: number }; end: { offset: number } } }) =>
    source.slice(d.range.start.offset, d.range.end.offset);
  return { compilation, diagram, diagnostics: compilation.diagnostics, text };
}

afterEach(() => setLocale("en"));

describe("flow and trace on a gantt task or milestone", () => {
  it("takes a flow into a task that follows another", () => {
    const { diagnostics, diagram } = analyze(roadmap("animate flu3 { effect flow }"));
    expect(diagnostics).toEqual([]);
    expect(diagram.animations).toHaveLength(1);
    expect(diagram.animations[0]).toMatchObject({
      target: "flu3",
      targetKind: "element",
      effect: "flow",
    });
  });

  it("takes a trace into a task, and a flow or a trace into a milestone that follows one", () => {
    const { diagnostics, diagram } = analyze(
      SMALL(
        "animate code { effect trace }\nanimate beta { effect flow }\nanimate beta { effect trace }",
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.animations.map((a) => [a.target, a.effect])).toEqual([
      ["code", "trace"],
      ["beta", "flow"],
      ["beta", "trace"],
    ]);
  });

  it("refuses a trace on a task without dependencies, saying it has no arrows to trace", () => {
    const { diagnostics, text } = analyze(roadmap("animate tec0 { effect trace }"));
    expect(diagnostics.map((d) => d.code)).toEqual(["animate.invalid-target"]);
    expect(diagnostics[0]!.message).toBe(
      "`tec0` has no dependency arrows to trace; `trace` takes a task or a milestone that follows others with `after`.",
    );
    expect(text(diagnostics[0]!)).toBe("tec0");
    expect(diagnostics[0]!.severity).toBe("error");
  });

  it("refuses a flow on a task or a milestone without dependencies", () => {
    const first = analyze(SMALL("animate design { effect flow }"));
    expect(first.diagnostics.map((d) => d.code)).toEqual(["animate.invalid-target"]);
    expect(first.diagnostics[0]!.message).toBe(
      "`design` has no dependency arrows for particles to run along; `flow` takes a task or a milestone that follows others with `after`.",
    );
    // A milestone that names a date and no task has none either.
    const milestone = analyze(
      [
        'language "0.2"',
        "diagram plan: gantt {",
        "  milestone launch at 2026-07-01",
        "  animate launch { effect flow }",
        "}",
        "",
      ].join("\n"),
    );
    expect(milestone.diagnostics.map((d) => d.code)).toEqual(["animate.invalid-target"]);
  });

  it("does not count `until` or the previous task as an arrow, which are not drawn", () => {
    const chart = analyze(
      [
        'language "0.2"',
        "diagram plan: gantt {",
        "  task a from 2026-06-01 for 2d",
        "  task b until c",
        "  task c from 2026-06-05 for 1d",
        "  task d for 2d",
        "  animate b { effect trace }",
        "  animate d { effect flow }",
        "}",
        "",
      ].join("\n"),
    );
    expect(chart.diagnostics.map((d) => d.code)).toEqual([
      "animate.invalid-target",
      "animate.invalid-target",
    ]);
    expect(chart.diagram.relations).toEqual([]);
  });

  it("names what a section or a marker is, and what the effect accepts", () => {
    const { diagnostics } = analyze(
      SMALL("animate build { effect flow }\nanimate freeze { effect trace }"),
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      "animate.invalid-target",
      "animate.invalid-target",
    ]);
    expect(diagnostics[0]!.message).toBe(
      "Flow particles run along the dependency arrows into a task or a milestone; `build` is a section.",
    );
    expect(diagnostics[1]!.message).toBe(
      "A trace runs along the dependency arrows into a task or a milestone; `freeze` is a marker.",
    );
  });

  it("keeps the effect valid when the arrows are not drawn, since they are still in the model", () => {
    const { diagnostics, diagram } = analyze(
      SMALL("animate code { effect flow }", "  dependencies hidden"),
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.relations.map((r) => r.key)).toEqual(["design->code#1", "code->beta#1"]);
  });

  it("allows a flow and a trace on one task, and refuses the same effect twice", () => {
    const both = analyze(SMALL("animate code { effect flow }\nanimate code { effect trace }"));
    expect(both.diagnostics).toEqual([]);
    const twice = analyze(SMALL("animate code { effect flow }\nanimate code { effect flow }"));
    expect(twice.diagnostics.map((d) => d.code)).toEqual(["animate.conflict"]);
  });

  it("says the same in Spanish, with the same code and place", () => {
    const source = SMALL("animate design { effect trace }\nanimate freeze { effect flow }");
    const english = analyze(source).diagnostics;
    setLocale("es");
    const spanish = analyze(source).diagnostics;
    expect(spanish.map((d) => [d.code, d.range])).toEqual(english.map((d) => [d.code, d.range]));
    expect(spanish[0]!.message).toBe(
      "`design` no tiene flechas de dependencia que recorrer; `trace` admite una tarea o un hito que sigue a otros con `after`.",
    );
    expect(spanish[1]!.message).toBe(
      "Las partículas recorren las flechas de dependencia que llegan a una tarea o a un hito; `freeze` es una marca.",
    );
    expect(spanish[0]!.message).not.toBe(english[0]!.message);
  });
});

describe("pulse and dash on gantt targets", () => {
  it("pulses a milestone, a task, a marker and a section", () => {
    const { diagnostics, diagram } = analyze(
      roadmap(
        "milestone beta after tec2\nanimate beta { effect pulse }\nanimate tec1 { effect pulse }\nanimate tecnologia { effect pulse }\nmarker freeze at 2026-06-10\nanimate freeze { effect pulse }",
      ),
    );
    expect(diagnostics).toEqual([]);
    expect(diagram.animations.map((a) => a.target)).toEqual([
      "beta",
      "tec1",
      "tecnologia",
      "freeze",
    ]);
  });

  it("dashes the outline of a task, a milestone, a marker and a section", () => {
    const { diagnostics } = analyze(
      SMALL(
        "animate design { effect dash }\nanimate beta { effect dash }\nanimate freeze { effect dash }\nanimate build { effect dash }",
      ),
    );
    expect(diagnostics).toEqual([]);
  });

  it("takes a pulse and a dash on a task with no dependencies", () => {
    const { diagnostics } = analyze(
      roadmap("animate tec0 { effect pulse }\nanimate tec0 { effect dash }"),
    );
    expect(diagnostics).toEqual([]);
  });
});
