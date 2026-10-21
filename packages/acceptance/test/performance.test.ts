import { describe, expect, it } from "vitest";
import { acceptanceSheets, projectSessions } from "../src/corpus.js";
import { TARGETS, analysisAfterEdit, canvasRoundTrip } from "../src/timing.js";

/** Slower machines than the reference one (decision 0032) get this much room. */
const ROOM = 4;

const thirty = acceptanceSheets().filter((s) => s.name.endsWith("/thirty"));

describe("performance targets", () => {
  it.each(thirty.map((s) => [s.name, s] as const))(
    "%s: analysis after an edit within the target",
    (_name, sheet) => {
      const timing = analysisAfterEdit(projectSessions(), sheet.path, 12);
      expect(timing.p95, `p95 ${timing.p95.toFixed(1)} ms`).toBeLessThan(TARGETS.analysis * ROOM);
    },
    120_000,
  );

  it.each(thirty.filter((s) => s.profile !== "sequence").map((s) => [s.name, s] as const))(
    "%s: a canvas drag round trip within the target",
    (_name, sheet) => {
      const timing = canvasRoundTrip(projectSessions(), sheet.path, 12);
      expect(timing.p95, `p95 ${timing.p95.toFixed(1)} ms`).toBeLessThan(TARGETS.canvas * ROOM);
    },
    120_000,
  );
});
