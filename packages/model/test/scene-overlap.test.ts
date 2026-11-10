import { describe, expect, it } from "vitest";
import { compile, toJson } from "../src/index.js";

const BASE = `language "0.2"
diagram d: flow { a -> b as r }
`;
const story = (body: string) => compile(`${BASE}story tour for d {\n${body}\n}\n`);
const errors = (result: ReturnType<typeof compile>) =>
  result.diagnostics.filter((d) => d.severity === "error");

describe("relative scene overlap", () => {
  it("schedules three concurrent scenes, keeps paths, and exports the existing JSON shape", () => {
    const result = story(`scene a { hold 10s }
scene b { overlap 8s; hold 10s }
scene c { overlap 8s; hold 10s }`);
    expect(result.diagnostics).toEqual([]);
    const compiled = result.document.stories[0]!;
    expect(
      compiled.scenes.map((scene) => [scene.startMs, scene.durationMs, scene.actions[0]!.startMs]),
    ).toEqual([
      [0, 10000, 0],
      [2000, 10000, 2000],
      [4000, 10000, 4000],
    ]);
    expect(compiled.scenes.map((scene) => scene.actions[0]!.path)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(compiled.durationMs).toBe(14000);
    expect(Object.keys(toJson(result).stories[0]!.scenes[1]!)).not.toContain("overlapMs");
  });

  it("runs incoming actions during its transition and derives duration from the longest track", () => {
    const result = story(`scene a { hold 10s }
scene b { overlap 1s; transition fade over 4s; hold 2s }`);
    expect(errors(result)).toEqual([]);
    const b = result.document.stories[0]!.scenes[1]!;
    expect([b.startMs, b.durationMs, b.actions[0]!.startMs]).toEqual([9000, 4000, 9000]);
    expect(b.transition).toMatchObject({ startMs: 9000, durationMs: 4000 });
    expect(result.document.stories[0]!.durationMs).toBe(13000);
  });

  it("retains the sequential transition prefix when overlap is omitted or zero", () => {
    for (const declaration of ["", "overlap 0ms;"]) {
      const result = story(`scene a { hold 10s }
scene b { ${declaration} transition fade over 4s; hold 2s }`);
      expect(errors(result)).toEqual([]);
      const b = result.document.stories[0]!.scenes[1]!;
      expect([b.startMs, b.durationMs, b.actions[0]!.startMs]).toEqual([10000, 6000, 14000]);
      expect(result.document.stories[0]!.durationMs).toBe(16000);
    }
  });

  it("accepts both equal bounds and an incoming scene consisting only of a transition", () => {
    for (const content of ["hold 2s", "transition fade over 2s"]) {
      const result = story(`scene a { hold 2s }; scene b { overlap 2s; ${content} }`);
      expect(result.diagnostics).toEqual([]);
      expect(result.document.stories[0]!.scenes[1]).toMatchObject({ startMs: 0, durationMs: 2000 });
      expect(result.document.stories[0]!.durationMs).toBe(2000);
    }
  });

  it.each([
    ["first", "scene a { overlap 1ms; hold 1s }"],
    ["previous duration", "scene a { hold 1s }; scene b { overlap 2s; hold 3s }"],
    ["own duration", "scene a { hold 3s }; scene b { overlap 2s; hold 1s }"],
    ["negative", "scene a { hold 1s }; scene b { overlap -1ms; hold 1s }"],
    ["unit", "scene a { hold 1s }; scene b { overlap 1min; hold 1s }"],
    ["maximum", "scene a { hold 600s; hold 1s }; scene b { overlap 601s; hold 600s; hold 1s }"],
    ["late", "scene a { hold 1s }; scene b { hold 1s; overlap 1s }"],
    ["duplicate", "scene a { hold 1s }; scene b { overlap 1s; overlap 1s; hold 1s }"],
    ["extra argument", "scene a { hold 1s }; scene b { overlap 1s 2s; hold 1s }"],
    ["block", "scene a { hold 1s }; scene b { overlap 1s {}; hold 1s }"],
    ["empty", "scene a { hold 1s }; scene b { overlap 1s }"],
  ])("refuses %s overlap with a ranged stable diagnostic", (_name, body) => {
    const result = story(body);
    expect(errors(result).map((error) => error.code)).toContain("prop.invalid-value");
    expect(errors(result).every((error) => error.range.end.offset > error.range.start.offset)).toBe(
      true,
    );
    expect(result.document.stories[0]!.scenes.every((scene) => scene.startMs >= 0)).toBe(true);
  });

  it("permits cross-scene claims while retaining same-scene parallel conflicts", () => {
    const concurrent = story(`scene a { camera a over 2s; reveal a over 2s }
scene b { overlap 2s; camera b over 2s; hide a over 2s }`);
    expect(errors(concurrent)).toEqual([]);
    const parallel = story(`scene a { parallel { reveal a over 2s; hide a over 2s } }
scene b { overlap 1s; hold 2s }`);
    expect(errors(parallel).map((error) => error.code)).toEqual(["story.conflict"]);
  });

  it("keeps the required transition on a view change and accepts either header position", () => {
    const declarations = [
      "overlap 1s; view other; transition cut",
      "view other; overlap 1s; transition cut",
    ];
    for (const header of declarations) {
      const result = compile(`${BASE}diagram other: flow { a -> b }
story tour for d { scene a { hold 2s }; scene b { ${header}; hold 2s } }`);
      expect(errors(result)).toEqual([]);
      expect(result.document.stories[0]!.scenes[1]).toMatchObject({
        startMs: 1000,
        durationMs: 2000,
      });
    }
    const missing = compile(`${BASE}diagram other: flow { a -> b }
story tour for d { scene a { hold 2s }; scene b { overlap 1s; view other; hold 2s } }`);
    expect(errors(missing).map((error) => error.code)).toEqual(["story.missing-transition"]);
  });

  it("does not perturb an old fractional clock, including a transition-only scene", () => {
    const result = story(`scene a { hold 131071.9ms }
scene b { transition fade over 0.1ms }
scene c { hold 0.001ms; hold 0.3ms }`);
    expect(errors(result)).toEqual([]);
    const [a, b, c] = result.document.stories[0]!.scenes;
    const firstEnd = 131071.9;
    const secondEnd = firstEnd + 0.1;
    const finalEnd = secondEnd + 0.001 + 0.3;
    expect(a!.startMs + a!.durationMs).toBe(firstEnd);
    expect(b!.durationMs).toBe(secondEnd - firstEnd);
    expect(c!.startMs).toBe(secondEnd);
    expect(result.document.stories[0]!.durationMs).toBe(finalEnd);
  });

  it("accepts equal fractional bounds after a large preceding clock", () => {
    for (const duration of [0.001, 0.01, 0.1, 0.3]) {
      const result = story(`scene prefix { hold 131071.9ms }
scene a { hold ${duration}ms }
scene b { overlap ${duration}ms; hold ${duration}ms }`);
      expect(errors(result), `${duration}ms`).toEqual([]);
    }
  });
});
