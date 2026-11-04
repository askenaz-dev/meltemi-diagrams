import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { effectsPlayerDocument, storyPlayerDocument } from "@meltemi/diagrams-editor";
import { frameSvg, type PlayerDocument } from "@meltemi/diagrams-player";
import { toProjectPath } from "@meltemi/diagrams-project";
import { ACCEPTANCE_ROOT, REPO_ROOT, acceptanceSheets, projectSessions } from "../src/corpus.js";

describe("determinism", () => {
  it.each(acceptanceSheets().map((s) => [s.name, s] as const))(
    "%s lays out to the same scene in fresh sessions",
    (_name, sheet) => {
      // Each session has its own font library, icon packs and ELK engine.
      const first = projectSessions().analyze(sheet.path);
      const second = projectSessions().analyze(sheet.path);
      expect(second.diagrams.map((d) => JSON.stringify(d.layout?.scene))).toEqual(
        first.diagrams.map((d) => JSON.stringify(d.layout?.scene)),
      );
    },
    60_000,
  );

  /** Frames at the start and end of every scene and the middle of every action. */
  const controlTimes = (doc: PlayerDocument): number[] => {
    if (doc.kind !== "story") return [0, 250, 500, 750, 1000, 1500, 2000];
    const times = new Set<number>([0, doc.timeline.durationMs]);
    for (const scene of doc.timeline.scenes) {
      times.add(scene.startMs);
      times.add(scene.startMs + scene.durationMs);
      for (const action of scene.actions) times.add(action.startMs + action.durationMs / 2);
    }
    return [...times].sort((a, b) => a - b);
  };

  const documents: [string, () => PlayerDocument][] = [
    [
      "the purchase story",
      () =>
        storyPlayerDocument(
          projectSessions().analyze(
            toProjectPath(join(REPO_ROOT, "corpus", "valid", "stories", "purchase.meltemi")),
          ),
          "purchase",
        )!,
    ],
    [
      "the effects of flow/parallel",
      () =>
        effectsPlayerDocument(
          projectSessions().analyze(
            toProjectPath(join(ACCEPTANCE_ROOT, "flow", "parallel.meltemi")),
          ),
          "parallel",
        )!,
    ],
    [
      "the effects of free/parallel",
      () =>
        effectsPlayerDocument(
          projectSessions().analyze(
            toProjectPath(join(ACCEPTANCE_ROOT, "free", "parallel.meltemi")),
          ),
          "parallel",
        )!,
    ],
  ];

  it.each(documents)("draws the same control frames of %s twice", (_name, make) => {
    const a = make();
    const b = make();
    for (const t of controlTimes(a)) expect(frameSvg(b, t), `at ${t} ms`).toBe(frameSvg(a, t));
  });
});
