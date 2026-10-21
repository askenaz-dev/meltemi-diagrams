import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { compile, toJson, type StoryAction } from "../src/index.js";

const purchase = readFileSync(join(CORPUS_ROOT, "valid", "stories", "purchase.meltemi"), "utf8");
const BASE =
  'language "0.2"\ndiagram checkout: flow {\n  node api\n  node db\n  api -> db as save\n  api -> db as audit\n}\n';
const story = (body: string, extra = "") =>
  compile(`${BASE}${extra}story tour for checkout {\n${body}\n}\n`);
const codes = (text: ReturnType<typeof compile>) => text.diagnostics.map((d) => d.code);

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

  it("keeps references to the view's ids", () => {
    const [s] = story("  scene one {\n    reveal api, db\n    trace save\n  }").document.stories;
    expect(s!.references.map((r) => [r.diagram, r.id, r.kind])).toEqual([
      ["checkout", "api", "element"],
      ["checkout", "db", "element"],
      ["checkout", "save", "relation"],
    ]);
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
