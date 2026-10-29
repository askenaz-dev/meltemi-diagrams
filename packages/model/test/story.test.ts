import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  compile,
  drawTargetKind,
  storyTargetKind,
  toJson,
  type StoryAction,
} from "../src/index.js";

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
