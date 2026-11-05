import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EmptySea, showEmptySea, type SeaModule } from "../src/empty-sea.js";
import {
  FLOW_MS,
  PLAY_MS,
  SETTLE_MS,
  playOnce,
  progressAt,
  reducedMotion,
  speedAt,
  type Driven,
  type Frames,
} from "../src/sea.js";
import { nothingToDraw } from "../src/studio.js";
import { newStudio } from "./support/cloud.js";

/**
 * The family's sea in the playground (`playground-sea`): which states of the studio wear it, how a
 * moment plays and comes to rest, and the colours it takes from the page.
 */

const DIAGRAM = 'diagram x: flow {\n  title "x"\n  a["A"]\n  b["B"]\n  a -> b\n}\n';

describe("the canvas with nothing to draw", () => {
  it.each([
    ["no file", "", true],
    ["project.json", "project.json", true],
    ["a file that is not a source", "notes.md", true],
    ["an image", "images/logo.svg", true],
    ["a source with a diagram", "diagrams/a.meltemi", false],
    ["a source with no diagram yet", "empty.meltemi", false],
  ])("%s: %s", (_what, path, nothing) => {
    expect(nothingToDraw(path)).toBe(nothing);
  });

  /** A studio and what its listeners heard, in order: the sea's word and the canvas's messages. */
  function heard(files: [string, string][], open?: string) {
    const studio = newStudio();
    const events: string[] = [];
    studio.listen({
      nothingToDraw: (on) => events.push(on ? "sea" : "no sea"),
      canvas: (messages) => {
        for (const message of messages) events.push(message.type);
      },
    });
    studio.load(files, open);
    studio.analyzeNow();
    return { studio, events };
  }

  it("says so for a project with no files, before the canvas's message", () => {
    const { studio, events } = heard([]);
    expect(studio.nothingToDraw).toBe(true);
    expect(events.indexOf("sea")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("sea")).toBeLessThan(events.indexOf("empty"));
  });

  it("says nothing for a project that opens on a diagram", () => {
    const { studio, events } = heard([["diagrams/a.meltemi", DIAGRAM]]);
    expect(studio.nothingToDraw).toBe(false);
    expect(events).not.toContain("sea");
    // The diagram's messages (a test's studio has no layout engine: it says the diagram is stale).
    expect(events).not.toContain("empty");
    expect(events.length).toBeGreaterThan(0);
  });

  it("says so when project.json or another file opens, and only when it changes", () => {
    const { studio, events } = heard([
      ["diagrams/a.meltemi", DIAGRAM],
      ["project.json", '{ "name": "x" }'],
      ["notes.md", "hello"],
    ]);
    studio.select("project.json");
    studio.analyzeNow();
    expect(studio.nothingToDraw).toBe(true);
    studio.select("notes.md");
    studio.analyzeNow();
    expect(events.filter((e) => e === "sea")).toHaveLength(1);
  });

  it("takes the sea away before the diagram is drawn", () => {
    const studio = newStudio();
    const events: string[] = [];
    let shown = 0;
    let disposed = 0;
    const sea = new EmptySea(() => {
      shown++;
      events.push("show");
      return () => {
        disposed++;
        events.push("dispose");
      };
    });
    studio.listen({
      nothingToDraw: (on) => sea.set(on),
      canvas: (messages) => {
        for (const message of messages) events.push(message.type);
      },
    });
    studio.load([
      ["project.json", '{ "name": "x" }'],
      ["diagrams/a.meltemi", DIAGRAM],
    ]);
    studio.select("project.json");
    studio.analyzeNow();
    expect(sea.shown).toBe(true);
    const before = events.length;
    studio.select("diagrams/a.meltemi");
    studio.analyzeNow();
    expect(sea.shown).toBe(false);
    expect([shown, disposed]).toEqual([1, 1]);
    // Opening the diagram: the disposer first, then the diagram's messages, and no sea after.
    const opened = events.slice(before);
    expect(opened[0]).toBe("dispose");
    expect(opened.length).toBeGreaterThan(1);
    expect(opened).not.toContain("empty");
    expect(opened).not.toContain("show");
  });

  it("shows the sea once however often it is told, and only after it was taken away again", () => {
    let shown = 0;
    const sea = new EmptySea(() => {
      shown++;
      return () => undefined;
    });
    sea.set(true);
    sea.set(true);
    sea.set(false);
    sea.set(false);
    sea.set(true);
    expect(shown).toBe(2);
  });
});

describe("showEmptySea", () => {
  /** A sea chunk that arrives when the test says, and the moments it played. */
  function chunk() {
    const played: { destroyed: boolean }[] = [];
    let arrive: (module: SeaModule) => void = () => undefined;
    const module: SeaModule = {
      playMoment: () => {
        const moment = { destroyed: false };
        played.push(moment);
        return {
          element: {} as HTMLElement,
          report: {} as never,
          destroy: () => {
            moment.destroyed = true;
          },
        };
      },
    };
    const load = () => new Promise<SeaModule>((resolve) => (arrive = resolve));
    return { played, load, arrive: () => arrive(module) };
  }
  const host = { isConnected: true } as HTMLElement;

  it("plays the sea when its chunk arrives, and the disposer destroys it", async () => {
    const sea = chunk();
    const dispose = showEmptySea(host, { reducedMotion: false }, sea.load);
    sea.arrive();
    await Promise.resolve();
    await Promise.resolve();
    expect(sea.played).toHaveLength(1);
    dispose();
    expect(sea.played[0]!.destroyed).toBe(true);
  });

  it("never plays a sea disposed of before its chunk arrived", async () => {
    const sea = chunk();
    const dispose = showEmptySea(host, { reducedMotion: false }, sea.load);
    dispose();
    sea.arrive();
    await Promise.resolve();
    await Promise.resolve();
    expect(sea.played).toHaveLength(0);
  });

  it("leaves the message as it was when the chunk cannot be loaded", async () => {
    const dispose = showEmptySea(host, { reducedMotion: false }, () =>
      Promise.reject(new Error("offline")),
    );
    await Promise.resolve();
    expect(() => dispose()).not.toThrow();
  });
});

describe("a moment of the sea", () => {
  /** Animation frames a test steps by hand, at the times it says. */
  function frames() {
    const pending = new Map<number, (time: number) => void>();
    let next = 0;
    const clock: Frames = {
      request: (callback) => {
        pending.set(++next, callback);
        return next;
      },
      cancel: (handle) => void pending.delete(handle),
    };
    const step = (time: number) => {
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) callback(time);
    };
    return { clock, step, pending };
  }

  /** A sea as the package drives it: its loop asks the environment for a frame after each frame. */
  function sea(environment: { requestFrame(cb: (t: number) => void): number }) {
    const drawn: { t: number; progress: number }[] = [];
    let progress = 0;
    let running = false;
    let reduced = false;
    const tick = (t: number) => {
      if (!running) return;
      drawn.push({ t, progress });
      environment.requestFrame(tick);
    };
    const driven: Driven & { stopped: boolean } = {
      stopped: false,
      start() {
        drawn.push({ t: 0, progress });
        if (reduced) return;
        running = true;
        environment.requestFrame(tick);
      },
      stop() {
        running = false;
        driven.stopped = true;
      },
      setProgress(p) {
        progress = p;
      },
    };
    return {
      driven,
      drawn,
      reduce: () => {
        reduced = true;
      },
    };
  }

  it("forms the flow, slows the sea's time and rests within 5 seconds", () => {
    expect(PLAY_MS).toBeLessThanOrEqual(5000);
    expect(FLOW_MS).toBeLessThan(PLAY_MS);
    expect(SETTLE_MS).toBeLessThan(PLAY_MS);
    const { clock, step, pending } = frames();
    let rested = 0;
    const player = playOnce(clock, { reducedMotion: false, rest: 1, rested: () => rested++ });
    const s = sea(player.environment);
    player.begin(s.driven);
    for (let t = 1000; t <= 6000; t += 16) step(t);
    const last = s.drawn.at(-1)!;
    expect(s.driven.stopped).toBe(true);
    expect(rested).toBe(1);
    expect(player.playing.rested).toBe(true);
    expect(last.progress).toBe(1);
    expect(pending.size).toBe(0);
    // The last frame was drawn at the time the sea came to rest, never later.
    const times = s.drawn.slice(1).map((d) => d.t);
    expect(Math.max(...times)).toBeLessThanOrEqual(1000 + PLAY_MS);
    // The sea's own time slows: the last steps of its clock are shorter than the first.
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(gaps.at(-1)!).toBeLessThan(gaps[0]! / 4);
    expect(player.playing.requested).toBeGreaterThan(200);
  });

  it("under reduced motion draws one frame at rest and requests none", () => {
    const { clock, pending } = frames();
    const player = playOnce(clock, { reducedMotion: true, rest: 1 });
    const s = sea(player.environment);
    s.reduce();
    s.driven.setProgress(1);
    player.begin(s.driven);
    expect(s.drawn).toEqual([{ t: 0, progress: 1 }]);
    expect(player.playing.requested).toBe(0);
    expect(player.playing.rested).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("ends with nothing pending when it is taken away while it plays", () => {
    const { clock, step, pending } = frames();
    const player = playOnce(clock, { reducedMotion: false, rest: 1 });
    const s = sea(player.environment);
    player.begin(s.driven);
    step(100);
    step(116);
    player.end();
    expect(pending.size).toBe(0);
  });

  it("reads the person's choice from matchMedia", () => {
    const asked: string[] = [];
    const match = (matches: boolean) => (query: string) => {
      asked.push(query);
      return { matches };
    };
    expect(reducedMotion(match(true))).toBe(true);
    expect(reducedMotion(match(false))).toBe(false);
    expect(reducedMotion(undefined)).toBe(false);
    expect(asked).toEqual(["(prefers-reduced-motion: reduce)", "(prefers-reduced-motion: reduce)"]);
  });

  it("plays its progress and its speed from the first frame to rest", () => {
    expect(progressAt(0)).toBe(0);
    expect(progressAt(FLOW_MS)).toBe(1);
    expect(progressAt(PLAY_MS + 1000)).toBe(1);
    expect(speedAt(0)).toBe(1);
    expect(speedAt(SETTLE_MS)).toBe(1);
    expect(speedAt(PLAY_MS)).toBe(0);
    for (let t = 0; t < PLAY_MS; t += 100) {
      expect(progressAt(t + 100)).toBeGreaterThanOrEqual(progressAt(t));
      expect(speedAt(t + 100)).toBeLessThanOrEqual(speedAt(t));
    }
  });
});

/** The `--sea-*` declarations of a stylesheet, with the rule each is in. */
function seaDeclarations(css: string): { rule: string; name: string; value: string }[] {
  const found: { rule: string; name: string; value: string }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of text.matchAll(rules)) {
    const rule = match[1]!.trim().split("\n").at(-1)!.trim();
    for (const declaration of match[2]!.matchAll(/(--sea-[\w-]+)\s*:\s*([^;]+);/g)) {
      found.push({ rule, name: declaration[1]!, value: declaration[2]!.trim() });
    }
  }
  return found;
}

/** The declarations that name something other than one of the page's `--pg-*` tokens. */
function literalSeaColours(css: string): string[] {
  return seaDeclarations(css)
    .filter((d) => !/^var\(--pg-[\w-]+\)$/.test(d.value))
    .map((d) => `${d.rule} { ${d.name}: ${d.value} }`);
}

describe("the sea's colours", () => {
  const css = readFileSync(new URL("../playground.css", import.meta.url), "utf8");

  it("are the page's tokens, in each of its schemes", () => {
    expect(literalSeaColours(css), "--sea-* rules of playground.css").toEqual([]);
    const declared = seaDeclarations(css);
    for (const rule of [":root", ':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      const names = declared.filter((d) => d.rule === rule).map((d) => d.name);
      expect(names.sort(), rule).toEqual(["--sea-bg", "--sea-crest", "--sea-point", "--sea-wind"]);
    }
  });

  it("finds a literal colour and names its rule", () => {
    const fixture = `:root {\n  --sea-point: var(--pg-muted);\n  --sea-crest: #22d3ee;\n}\n.x {\n  --sea-wind: rgb(1 2 3);\n}\n`;
    expect(literalSeaColours(fixture)).toEqual([
      ":root { --sea-crest: #22d3ee }",
      ".x { --sea-wind: rgb(1 2 3) }",
    ]);
  });
});
