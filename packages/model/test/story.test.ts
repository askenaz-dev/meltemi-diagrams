import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setLocale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  compile,
  drawTargetKind,
  storyTargetKind,
  toJson,
  type StoryAction,
} from "../src/index.js";
import { drivingArrows } from "../src/story.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");
const BASE =
  'language "0.2"\ndiagram checkout: flow {\n  node api\n  node db\n  api -> db as save\n  api -> db as audit\n}\n';
const story = (body: string, extra = "") =>
  compile(`${BASE}${extra}story tour for checkout {\n${body}\n}\n`);
const codes = (text: ReturnType<typeof compile>) => text.diagnostics.map((d) => d.code);
/** A whiteboard: two pens, a line, a named relation between stickies, a box and a note. */
const WHITEBOARD =
  'language "0.2"\ndiagram board: free {\n  pen title [(0, 0), (40, 4), (80, 0)]\n  pen arrow [(0, 40), (120, 40)]\n  line underline from (0, 20) to (80, 20)\n  sticky a "A"\n  sticky b "B"\n  a -> b as link\n  box api "API"\n  note hint "N"\n}\n';
const drawn = (body: string) => compile(`${WHITEBOARD}story walk for board {\n${body}\n}\n`);

describe("stories", () => {
  it("compiles the proposal's purchase story to 7.4 s", () => {
    const compilation = compile(purchase);
    expect(compilation.diagnostics).toEqual([]);
    const [s] = compilation.document.stories;
    expect(s!.id).toBe("purchase");
    expect(s!.target.diagram?.id).toBe("checkout");
    expect(s!.scenes.map((x) => [x.id, x.startMs, x.durationMs])).toEqual([
      ["overview", 0, 1800],
      ["processing", 1800, 5600],
    ]);
    expect(s!.durationMs).toBe(7400);
    expect(compilation.document.unsupported).toEqual([]);
    expect(toJson(compilation).stories[0]).toMatchObject({
      id: "purchase",
      target: "checkout",
      durationMs: 7400,
    });
  });

  it("times parallel blocks by their longest action", () => {
    const [s] = story(
      "  scene one {\n    parallel {\n      trace save over 1200ms\n      highlight db over 800ms\n    }\n    hold 2s\n  }",
    ).document.stories;
    const [parallel, hold] = s!.scenes[0]!.actions as [StoryAction, StoryAction];
    expect(parallel.durationMs).toBe(1200);
    expect(parallel.children.map((c) => [c.kind, c.startMs, c.durationMs])).toEqual([
      ["trace", 0, 1200],
      ["highlight", 0, 800],
    ]);
    expect([hold.startMs, hold.durationMs]).toEqual([1200, 2000]);
    expect(s!.scenes[0]!.durationMs).toBe(3200);
  });

  it("applies the default times", () => {
    const [s] = story(
      "  scene one {\n    reveal api\n    hide api\n    highlight db\n    focus db\n    camera db\n    trace save\n  }",
    ).document.stories;
    expect(s!.scenes[0]!.actions.map((a) => [a.kind, a.durationMs, a.writtenMs])).toEqual([
      ["reveal", 600, null],
      ["hide", 600, null],
      ["highlight", 1000, null],
      ["focus", 600, null],
      ["camera", 800, null],
      ["trace", 1200, null],
    ]);
  });

  it("reports unknown diagrams and targets", () => {
    const unknown = compile(`${BASE}story tour for missing {\n  scene one { hold 1s }\n}\n`);
    expect(codes(unknown)).toEqual(["story.unknown-diagram"]);
    expect(unknown.diagnostics[0]!.hints![0]).toContain("checkout");
    const target = story("  scene one {\n    reveal apu\n  }");
    expect(codes(target)).toEqual(["ref.unknown-element"]);
    expect(target.diagnostics[0]!.hints![0]).toContain("`api`");
  });

  it("checks what a trace follows", () => {
    const compilation = story("  scene one {\n    trace api\n  }");
    expect(codes(compilation)).toEqual(["story.invalid-target"]);
    expect(compilation.diagnostics[0]!.message).toMatch(/follows a relation/);
  });

  it("checks what a draw replays", () => {
    const compilation = story("  scene one {\n    draw save, api\n  }");
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "story.invalid-target",
        "`draw` takes pens, lines and relations; `api` is a `node` element.",
      ],
    ]);
    expect(compilation.diagnostics[0]!.range.start).toMatchObject({ line: 10, column: 16 });
    // The named relation is kept.
    const [action] = compilation.document.stories[0]!.scenes[0]!.actions;
    expect(action!.targets.map((t) => [t.id, t.kind])).toEqual([["save", "relation"]]);
  });

  it("reports actions on the same property at the same time", () => {
    const compilation = story(
      "  scene one {\n    parallel {\n      reveal db\n      hide db\n    }\n  }",
    );
    expect(codes(compilation)).toEqual(["story.conflict"]);
    const conflict = compilation.diagnostics[0]!;
    expect(conflict.range.start.line).toBe(12);
    expect(conflict.related?.[0]?.range.start.line).toBe(11);
    // Different channels, or one after the other, are fine.
    expect(
      codes(
        story(
          "  scene one {\n    parallel {\n      reveal db\n      highlight db\n    }\n    hide db\n  }",
        ),
      ),
    ).toEqual([]);
  });

  it("asks for a transition when the view changes", () => {
    const other = "diagram later: flow {\n  node api\n}\n";
    const missing = story(
      "  scene one { hold 1s }\n  scene two {\n    view later\n    reveal api\n  }",
      other,
    );
    expect(codes(missing)).toEqual(["story.missing-transition"]);
    const fine = story(
      "  scene one { hold 1s }\n  scene two {\n    view later\n    transition morph\n    reveal api\n  }",
      other,
    );
    expect(codes(fine)).toEqual([]);
    const two = fine.document.stories[0]!.scenes[1]!;
    expect(two.view.diagram?.id).toBe("later");
    expect(two.transition).toMatchObject({ kind: "morph", durationMs: 800, startMs: 1000 });
    expect(two.actions[0]!.startMs).toBe(1800);
  });

  it("warns about empty scenes and refuses bad times", () => {
    expect(codes(story("  scene one {\n  }"))).toEqual(["story.empty-scene"]);
    expect(story("  scene one {\n  }").diagnostics[0]!.severity).toBe("warning");
    expect(codes(story("  scene one {\n    reveal api over 2\n  }"))).toEqual([
      "prop.invalid-value",
    ]);
    expect(codes(story("  scene one {\n    hold 20min\n  }"))).toContain("prop.invalid-value");
  });

  it("shares the file namespace with diagrams", () => {
    const clash = compile(`${BASE}story checkout for checkout {\n  scene one { hold 1s }\n}\n`);
    expect(codes(clash)).toEqual(["ref.duplicate-id"]);
  });

  it("lists draw among the actions of an unknown one", () => {
    const compilation = story("  scene one {\n    scribble api\n    hold 1s\n  }");
    expect(compilation.diagnostics.map((d) => [d.code, d.hints])).toEqual([
      [
        "prop.unknown",
        ["Actions: reveal, hide, highlight, focus, camera, trace, draw, hold and parallel."],
      ],
    ]);
    expect(compilation.diagnostics[0]!.data?.candidates).toContain("draw");
  });

  it("keeps references to the view's ids", () => {
    const [s] = story("  scene one {\n    reveal api, db\n    trace save\n  }").document.stories;
    expect(s!.references.map((r) => [r.diagram, r.id, r.kind])).toEqual([
      ["checkout", "api", "element"],
      ["checkout", "db", "element"],
      ["checkout", "save", "relation"],
    ]);
  });

  it("knows what draw takes in a view", () => {
    const board = compile(WHITEBOARD).document.diagrams[0]!;
    expect(
      ["title", "underline", "link", "hint", "a", "ghost"].map((id) => drawTargetKind(id, board)),
    ).toEqual(["pen", "line", "relation", null, null, null]);
    // Pens and lines stay elements as story targets.
    expect(storyTargetKind("title", board)).toBe("element");
  });

  it("resolves imported diagrams through the compile options", () => {
    const host = compile(BASE);
    const text = `language "0.2"\nimport checkout from "./checkout.meltemi"\nstory tour for checkout {\n  scene one {\n    reveal api\n  }\n}\n`;
    expect(codes(compile(text))).toEqual([]);
    const resolved = compile(text, {
      diagrams: (name) =>
        name === "checkout"
          ? { diagram: host.document.diagrams[0]!, file: "/p/checkout.meltemi" }
          : undefined,
    });
    expect(codes(resolved)).toEqual([]);
    expect(resolved.document.stories[0]!.target.file).toBe("/p/checkout.meltemi");
    expect(resolved.document.stories[0]!.references[0]!.file).toBe("/p/checkout.meltemi");
  });
});

describe("draw", () => {
  it("draws the strokes of a whiteboard in order, over the time written", () => {
    const compilation = drawn("  scene one {\n    draw title, arrow over 2s\n  }");
    expect(compilation.diagnostics).toEqual([]);
    const [action] = compilation.document.stories[0]!.scenes[0]!.actions;
    expect(action).toMatchObject({ kind: "draw", durationMs: 2000, writtenMs: 2000, startMs: 0 });
    expect(action!.targets.map((t) => [t.id, t.kind])).toEqual([
      ["title", "element"],
      ["arrow", "element"],
    ]);
    expect(compilation.document.stories[0]!.durationMs).toBe(2000);
  });

  it("takes pens, free lines and named relations, in 800 ms by default", () => {
    const compilation = drawn("  scene one {\n    draw underline, link\n    draw title\n  }");
    expect(compilation.diagnostics).toEqual([]);
    const actions = compilation.document.stories[0]!.scenes[0]!.actions;
    expect(actions.map((a) => [a.kind, a.startMs, a.durationMs, a.writtenMs])).toEqual([
      ["draw", 0, 800, null],
      ["draw", 800, 800, null],
    ]);
    expect(actions[0]!.targets.map((t) => [t.id, t.kind])).toEqual([
      ["underline", "element"],
      ["link", "relation"],
    ]);
    expect(compilation.document.stories[0]!.references.map((r) => r.id)).toEqual([
      "underline",
      "link",
      "title",
    ]);
  });

  it("refuses a box, a sticky and a note, saying what it takes", () => {
    const compilation = drawn("  scene one {\n    draw api, a, hint, title\n  }");
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["story.invalid-target", "`draw` takes pens, lines and relations; `api` is a `box` element."],
      [
        "story.invalid-target",
        "`draw` takes pens, lines and relations; `a` is a `sticky` element.",
      ],
      [
        "story.invalid-target",
        "`draw` takes pens, lines and relations; `hint` is a `note` element.",
      ],
    ]);
    expect(
      compilation.document.stories[0]!.scenes[0]!.actions[0]!.targets.map((t) => t.id),
    ).toEqual(["title"]);
  });

  it("names a note or a fragment of a sequence diagram", () => {
    const compilation = compile(
      'diagram s: sequence {\n  participant a\n  participant b\n  a -> b as call\n  note n over a "N"\n}\nstory t for s {\n  scene one {\n    draw n, call\n  }\n}\n',
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "story.invalid-target",
        "`draw` takes pens, lines and relations; `n` is a note or fragment.",
      ],
    ]);
  });

  it("conflicts with a reveal, a hide or a trace of the same target at the same time", () => {
    const shown = drawn(
      "  scene one {\n    parallel {\n      draw title\n      reveal title\n    }\n  }",
    );
    expect(codes(shown)).toEqual(["story.conflict"]);
    const traced = drawn(
      "  scene one {\n    parallel {\n      draw link\n      trace link\n    }\n  }",
    );
    expect(codes(traced)).toEqual(["story.conflict"]);
    // One after the other, or with another target, is fine.
    expect(
      codes(
        drawn(
          "  scene one {\n    draw title\n    hide title\n    parallel {\n      draw arrow\n      reveal a\n    }\n  }",
        ),
      ),
    ).toEqual([]);
  });

  it("reports one conflict for a target named twice, though it clashes on two channels", () => {
    for (const target of ["title", "link"]) {
      const twice = drawn(`  scene one {\n    draw ${target}, ${target}\n  }`);
      expect(
        twice.diagnostics.map((d) => [d.code, d.message, d.range.start.column, d.range.end.column]),
        target,
      ).toEqual([
        [
          "story.conflict",
          `\`draw\` overlaps an earlier action on the same visibility of \`${target}\`.`,
          5,
          12 + 2 * target.length,
        ],
      ]);
    }
    // Two targets that clash are two conflicts.
    expect(codes(drawn("  scene one {\n    draw title, arrow, title, arrow\n  }"))).toEqual([
      "story.conflict",
      "story.conflict",
    ]);
  });
});

describe("stories about a gantt chart", () => {
  const ROADMAP = readFileSync(join(CORPUS_ROOT, "valid", "gantt", "roadmap.meltemi"), "utf8");
  /** The owner's chart with statements added before its closing brace. */
  const withChart = (extra: string) => ROADMAP.replace(/\}\s*$/, `${extra}\n}\n`);
  const plan = (body: string, chart = ROADMAP) =>
    compile(`${chart}\nstory plan for hoja_de_ruta_genai {\n${body}\n}\n`);
  afterEach(() => setLocale("en"));

  it("tells a plan section by section: a reveal, then the bars drawn in order", () => {
    const compilation = plan(
      "  scene one {\n    reveal tecnologia\n    draw tec0, tec1, tec2 over 3s\n  }",
    );
    expect(compilation.diagnostics).toEqual([]);
    const [reveal, draw] = compilation.document.stories[0]!.scenes[0]!.actions as [
      StoryAction,
      StoryAction,
    ];
    expect([reveal.kind, reveal.targets.map((t) => [t.id, t.kind])]).toEqual([
      "reveal",
      [["tecnologia", "element"]],
    ]);
    expect(draw).toMatchObject({ kind: "draw", durationMs: 3000, writtenMs: 3000, startMs: 600 });
    expect(draw.targets.map((t) => [t.id, t.kind])).toEqual([
      ["tec0", "element"],
      ["tec1", "element"],
      ["tec2", "element"],
    ]);
  });

  it("takes tasks, milestones, markers and sections as the elements of the other actions", () => {
    const chart = withChart("  milestone beta after tec2\n  marker freeze at 2026-06-10");
    const compilation = plan(
      "  scene one {\n    reveal tecnologia, beta, freeze\n    hide tec1\n    highlight tec0, beta\n    focus tec2\n    camera flu0, i_d\n  }",
      chart,
    );
    expect(compilation.diagnostics).toEqual([]);
  });

  it("traces the chain that drives a task as its arrows, earliest first", () => {
    const compilation = plan("  scene one {\n    trace flu3\n  }");
    expect(compilation.diagnostics).toEqual([]);
    const [action] = compilation.document.stories[0]!.scenes[0]!.actions;
    expect(action).toMatchObject({ kind: "trace", durationMs: 1200, writtenMs: null });
    expect(action!.targets.map((t) => [t.id, t.kind])).toEqual([
      ["flu0->flu1#1", "relation"],
      ["flu1->flu2#1", "relation"],
      ["flu2->flu3#1", "relation"],
    ]);
    // The task is what the story names: that is its reference.
    const [story] = compilation.document.stories;
    expect(story!.references.map((r) => [r.diagram, r.id, r.kind])).toEqual([
      ["hoja_de_ruta_genai", "flu3", "element"],
    ]);
    // Every arrow keeps the place where the task is written.
    const written = action!.targets[0]!.range;
    expect(action!.targets.every((t) => t.range === written)).toBe(true);
  });

  it("traces one arrow into a task that follows one task, over the time written", () => {
    const compilation = plan("  scene one {\n    trace tec1 over 2s\n  }");
    expect(compilation.diagnostics).toEqual([]);
    const [action] = compilation.document.stories[0]!.scenes[0]!.actions;
    expect(action!.durationMs).toBe(2000);
    expect(action!.targets.map((t) => t.id)).toEqual(["tec0->tec1#1"]);
  });

  it("follows the predecessor with the latest end, the first written when they end together", () => {
    const chart = [
      'language "0.2"',
      "diagram plan: gantt {",
      "  task a from 2026-06-01 for 2d",
      "  task b from 2026-06-01 for 5d",
      "  task c from 2026-06-01 for 5d",
      "  task d after a, b, c for 1d",
      "  task e after d for 1d",
      "}",
      "story s for plan {",
      "  scene one { trace e }",
      "}",
      "",
    ].join("\n");
    const compilation = compile(chart);
    expect(compilation.diagnostics).toEqual([]);
    // d follows a, b and c; b and c end together and b is written first.
    expect(
      compilation.document.stories[0]!.scenes[0]!.actions[0]!.targets.map((t) => t.id),
    ).toEqual(["b->d#1", "d->e#1"]);
    const diagram = compilation.document.diagrams[0]!;
    expect(drivingArrows(diagram, "d")).toEqual(["b->d#1"]);
    expect(drivingArrows(diagram, "a")).toEqual([]);
    expect(drivingArrows(diagram, "nope")).toBeNull();
  });

  it("traces into a milestone that follows a task", () => {
    const compilation = plan(
      "  scene one {\n    trace beta\n  }",
      withChart("  milestone beta after sdlc2"),
    );
    expect(compilation.diagnostics).toEqual([]);
    expect(
      compilation.document.stories[0]!.scenes[0]!.actions[0]!.targets.map((t) => t.id),
    ).toEqual(["sdlc1->sdlc2#1", "sdlc2->beta#1"]);
  });

  it("refuses a trace into a task without dependencies, a section and a marker", () => {
    const compilation = plan(
      "  scene one {\n    trace tec0\n    trace tecnologia\n    trace freeze\n  }",
      withChart("  marker freeze at 2026-06-10"),
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "story.invalid-target",
        "`tec0` has no dependency arrows to trace; `trace` takes a task or a milestone that follows others with `after`.",
      ],
      [
        "story.invalid-target",
        "`trace` follows the dependency arrows into a task or a milestone; `tecnologia` is a section.",
      ],
      [
        "story.invalid-target",
        "`trace` follows the dependency arrows into a task or a milestone; `freeze` is a marker.",
      ],
    ]);
    expect(compilation.document.stories[0]!.scenes[0]!.actions[0]!.targets).toEqual([]);
  });

  it("refuses to draw a section, a milestone and a marker, saying what draw takes", () => {
    const compilation = plan(
      "  scene one {\n    draw tecnologia, beta, freeze, tec0\n  }",
      withChart("  milestone beta after tec2\n  marker freeze at 2026-06-10"),
    );
    expect(compilation.diagnostics.map((d) => [d.code, d.message])).toEqual([
      [
        "story.invalid-target",
        "`draw` takes pens, lines, relations and gantt tasks; `tecnologia` is a `section` element.",
      ],
      [
        "story.invalid-target",
        "`draw` takes pens, lines, relations and gantt tasks; `beta` is a `milestone` element.",
      ],
      [
        "story.invalid-target",
        "`draw` takes pens, lines, relations and gantt tasks; `freeze` is a `marker` element.",
      ],
    ]);
    // The task is kept.
    expect(
      compilation.document.stories[0]!.scenes[0]!.actions[0]!.targets.map((t) => t.id),
    ).toEqual(["tec0"]);
  });

  it("keeps the messages of the other profiles for their own diagrams", () => {
    const compilation = story("  scene one {\n    draw save, api\n  }");
    expect(compilation.diagnostics.map((d) => d.message)).toEqual([
      "`draw` takes pens, lines and relations; `api` is a `node` element.",
    ]);
  });

  it("knows what draw takes in a chart", () => {
    const chart = compile(ROADMAP).document.diagrams[0]!;
    expect(
      ["tec0", "tecnologia", "tec0->tec1#1", "ghost"].map((id) => drawTargetKind(id, chart)),
    ).toEqual(["task", null, null, null]);
    // Tasks stay elements as story targets.
    expect(storyTargetKind("tec0", chart)).toBe("element");
  });

  it("reports an unknown task with the close ones", () => {
    const compilation = plan("  scene one {\n    draw tec9\n  }");
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
    expect(compilation.diagnostics[0]!.data?.candidates).toContain("tec0");
  });

  it("conflicts when two traces of one chain overlap, naming the arrow, and when a task is drawn twice", () => {
    const traces = plan(
      "  scene one {\n    parallel {\n      trace flu3\n      trace flu2\n    }\n  }",
    );
    expect(traces.diagnostics.map((d) => d.code)).toEqual(["story.conflict"]);
    expect(traces.diagnostics[0]!.message).toBe(
      "`trace` overlaps an earlier action on the same trace of `flu0->flu1#1`.",
    );
    expect(codes(plan("  scene one {\n    draw tec0, tec0\n  }"))).toEqual(["story.conflict"]);
    // One after the other is fine.
    expect(codes(plan("  scene one {\n    trace flu3\n    trace flu2\n  }"))).toEqual([]);
  });

  it("says the same in Spanish, with the same code and place", () => {
    const body = "  scene one {\n    trace tec0\n    draw tecnologia\n  }";
    const english = plan(body).diagnostics;
    setLocale("es");
    const spanish = plan(body).diagnostics;
    expect(spanish.map((d) => [d.code, d.range])).toEqual(english.map((d) => [d.code, d.range]));
    expect(spanish.map((d) => d.message)).toEqual([
      "`tec0` no tiene flechas de dependencia que recorrer; `trace` admite una tarea o un hito que sigue a otros con `after`.",
      "`draw` admite trazos de lápiz, líneas, relaciones y tareas de Gantt; `tecnologia` es un elemento `section`.",
    ]);
  });

  it("writes the chain's arrows into the model JSON of the story", () => {
    const json = toJson(plan("  scene one {\n    trace flu3\n  }")).stories[0]!;
    const [action] = json.scenes[0]!.actions;
    expect(action).toMatchObject({ kind: "trace" });
    expect(JSON.stringify(action)).toContain("flu2->flu3#1");
  });
});
