import { describe, expect, it } from "vitest";
import {
  layoutDiagram,
  resolveTheme,
  type GroupItem,
  type PathItem,
  type PolylineItem,
  type Scene,
  type SceneItem,
} from "@meltemi/diagrams-layout";
import { compile } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  animatedScene,
  defaultMotionDuration,
  motionDuration,
  motionLoop,
  motionOptions,
  parseTime,
  planMotion,
  pointAlong,
  sceneAt,
  sceneGroups,
  type MotionPlan,
} from "@meltemi/diagrams-motion";

function draw(body: string, layout = "manual") {
  const text = `language "0.2"\ndiagram d: flow {\n  layout ${layout}\n${body}\n}\n`;
  const compilation = compile(text);
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const diagram = compilation.document.diagrams[0]!;
  const result = layoutDiagram(compilation, diagram, {});
  const scene = result.scene!;
  return {
    diagram,
    scene,
    plan: planMotion(diagram, scene, {
      colors: result.theme as unknown as Record<string, unknown>,
    }),
  };
}

const straight = (animate: string) =>
  draw(
    [
      "  node a",
      "  node b",
      "  a -> b as r",
      `  animate r { ${animate} }`,
      "  placement {",
      "    place a at (100, 100)",
      "    place b at (500, 100)",
      "  }",
    ].join("\n"),
  );

const motionItems = (scene: Scene): SceneItem[] => [
  ...(scene.items.find((i): i is GroupItem => i.kind === "group" && i.role === "motion")?.items ??
    []),
];

/** The particles a relation's group holds under its label: the circle paths `circlePath` writes. */
const particleItems = (scene: Scene, id = "r"): SceneItem[] =>
  sceneGroups(scene.items)
    .find((g) => g.role === "relation" && g.id === id)!
    .items.filter((i) => i.kind === "path" && / a[\d.]+ /.test(i.d));

/** The centre of a circle path written by `circlePath`. */
function circleCentre(item: SceneItem): { x: number; y: number } {
  const m = /^M(-?[\d.]+) (-?[\d.]+) a([\d.]+)/.exec((item as PathItem).d)!;
  return { x: Number(m[1]) + Number(m[3]), y: Number(m[2]) };
}

describe("motion plan", () => {
  it("applies the defaults", () => {
    const { plan } = straight("effect flow");
    expect(plan.effects).toHaveLength(1);
    expect(plan.effects[0]).toMatchObject({
      target: "r",
      role: "relation",
      effect: "flow",
      durationMs: 1200,
      repeat: "forever",
      delayMs: 0,
      reverse: false,
      particles: 1,
    });
    expect(plan.effects[0]!.track!.length).toBeGreaterThanOrEqual(2);
  });

  it("takes the theme's default speed when an effect writes no duration", () => {
    const text = [
      'language "0.2"',
      'theme quick { extends "technical.light"; flowDuration 800ms; pulseDuration 2s }',
      "diagram d: flow {",
      '  theme "quick"',
      "  layout manual",
      "  node a",
      "  node b",
      "  a -> b as r",
      "  b -> a as s",
      "  animate r { effect flow }",
      "  animate s { effect flow; duration 3s }",
      "  animate a { effect dash }",
      "  animate b { effect pulse }",
      "  placement {",
      "    place a at (100, 100)",
      "    place b at (500, 100)",
      "  }",
      "}",
      "",
    ].join("\n");
    const compilation = compile(text);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const result = layoutDiagram(compilation, diagram, {});
    expect(result.theme?.flowDuration).toBe(800);
    const plan = planMotion(diagram, result.scene!, motionOptions(result.theme));
    const duration = (target: string) => plan.effects.find((e) => e.target === target)!.durationMs;
    expect([duration("r"), duration("s"), duration("a"), duration("b")]).toEqual([
      800, 3000, 1000, 2000,
    ]);
    // A built-in theme writes no duration: the constants apply.
    const builtIn = resolveTheme("technical.light").theme;
    expect(motionOptions(builtIn).durations).toEqual({});
  });

  it("knows the finite length", () => {
    const { plan } = draw(
      "  node a\n  animate a { effect pulse; duration 1s; repeat 2; delay 500ms }\n  placement { place a at (100, 100) }",
    );
    expect(motionDuration(plan)).toBe(2500);
    expect(motionDuration(straight("effect flow").plan)).toBeNull();
    expect(motionDuration({ effects: [] })).toBe(0);
  });

  describe("the default length of a video", () => {
    /** A plan of effects with these cycles and delays, as `planMotion` would give them. */
    const plan = (...effects: { cycle: number; delay?: number; repeat?: number }[]): MotionPlan => {
      const base = straight("effect flow").plan.effects[0]!;
      return {
        effects: effects.map((e, index) => ({
          ...base,
          index,
          durationMs: e.cycle,
          delayMs: e.delay ?? 0,
          repeat: e.repeat ?? "forever",
        })),
      };
    };

    it("is one loop of every cycle: 6 s for the engine's defaults", () => {
      expect(defaultMotionDuration(plan({ cycle: 1200 }, { cycle: 1000 }))).toBe(6000);
      expect(defaultMotionDuration(plan({ cycle: 1200 }, { cycle: 1000 }, { cycle: 1500 }))).toBe(
        6000,
      );
      expect(defaultMotionDuration(plan({ cycle: 700 }, { cycle: 1000 }))).toBe(7000);
      expect(defaultMotionDuration(plan({ cycle: 1200 }))).toBe(1200);
    });

    it("takes the longest cycle when the common multiple passes 10 s", () => {
      expect(defaultMotionDuration(plan({ cycle: 1100 }, { cycle: 1300 }))).toBe(1300);
      expect(motionLoop(plan({ cycle: 1100 }, { cycle: 1300 }))).toBeNull();
      expect(motionLoop(plan({ cycle: 1200 }, { cycle: 1000 }))).toBe(6000);
      expect(motionLoop({ effects: [] })).toBeNull();
    });

    it("starts the loop after the longest delay", () => {
      expect(defaultMotionDuration(plan({ cycle: 1200, delay: 500 }, { cycle: 1000 }))).toBe(6500);
    });

    it("lasts a second without effects, and leaves a finite plan to its own length", () => {
      expect(defaultMotionDuration({ effects: [] })).toBe(1000);
      const finite = plan({ cycle: 1000, repeat: 2, delay: 500 });
      expect(motionDuration(finite)).toBe(2500);
    });

    it("is what the plans of real diagrams give", () => {
      const { plan: drawn } = draw(
        [
          "  node a",
          "  node b",
          "  a -> b as r",
          "  animate r { effect flow }",
          "  animate a { effect pulse }",
          "  placement {",
          "    place a at (100, 100)",
          "    place b at (500, 100)",
          "  }",
        ].join("\n"),
      );
      expect(motionDuration(drawn)).toBeNull();
      expect(defaultMotionDuration(drawn)).toBe(6000);
    });
  });

  it("resolves colour tokens and written colours", () => {
    const token = straight("effect flow; color danger").plan.effects[0]!.color;
    expect(token).toBe(resolveTheme("technical.light").theme.danger);
    expect(straight('effect flow; color "#123456"').plan.effects[0]!.color).toBe("#123456");
  });

  it("colours particles, halos and traces with the accent, and a moving dash with its line", () => {
    const theme = resolveTheme("technical.light").theme;
    const { plan } = draw(
      [
        "  node a",
        "  node b",
        "  node c",
        "  a -> b as r",
        "  b -> c as s",
        "  a -> c as t",
        "  animate r { effect flow }",
        "  animate s { effect trace }",
        "  animate t { effect dash }",
        "  animate a { effect pulse }",
        "  placement {",
        "    place a at (100, 100)",
        "    place b at (400, 100)",
        "    place c at (400, 300)",
        "  }",
      ].join("\n"),
    );
    const colour = (target: string) => plan.effects.find((e) => e.target === target)!.color;
    expect(theme.accent).not.toBe(theme.connector);
    expect([colour("r"), colour("s"), colour("a")]).toEqual([
      theme.accent,
      theme.accent,
      theme.accent,
    ]);
    // The line's own colour, not the box's pale border.
    expect(colour("t")).toBe(theme.connector);
  });

  it("carries tracks and bounds in the scene", () => {
    const { scene } = straight("effect flow");
    const groups = sceneGroups(scene.items);
    expect(
      groups.find((g) => g.role === "relation" && g.id === "r")!.track!.length,
    ).toBeGreaterThanOrEqual(2);
    const a = groups.find((g) => g.role === "element" && g.id === "a")!;
    expect(a.bounds).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
  });
});

describe("scene at time t", () => {
  it("places a particle along the track", () => {
    const { scene, plan } = straight("effect flow; duration 1s");
    const track = plan.effects[0]!.track!;
    const frame = sceneAt(scene, plan, 250);
    const [particle] = particleItems(frame);
    const expected = pointAlong(track, 0.25);
    const at = circleCentre(particle!);
    expect(at.x).toBeCloseTo(expected.x, 1);
    expect(at.y).toBeCloseTo(expected.y, 1);
  });

  it("draws particles of `max(4, 1.5 × width)`, the same in frames and in the animated SVG", () => {
    /** The radius of the circle paths `circlePath` writes. */
    const radius = (item: SceneItem) => Number(/ a([\d.]+) /.exec((item as PathItem).d)![1]);
    for (const [width, expected] of [
      [1, 4],
      [1.3, 4],
      [4, 6],
    ] as const) {
      const { scene, plan } = straight(`effect flow`);
      const wide = { ...plan, effects: plan.effects.map((e) => ({ ...e, width })) };
      const [particle] = particleItems(sceneAt(scene, wide, 300));
      expect(radius(particle!), `width ${width}`).toBe(expected);
      const [css] = particleItems(animatedScene(scene, wide));
      expect(radius(css!), `width ${width}`).toBe(expected);
    }
    // The connector of the default theme is 1.3 wide: the particle is 4, in the accent.
    const { scene, plan } = straight("effect flow");
    expect(plan.effects[0]!.width).toBe(1.3);
    const [drawn] = particleItems(sceneAt(scene, plan, 300)) as PathItem[];
    // Under the relation's label, which stays readable as it passes, in both profiles.
    const labelled = draw(
      [
        "  node a",
        "  node b",
        '  a -> b: "Pay" as r',
        "  animate r { effect flow }",
        "  placement {",
        "    place a at (100, 100)",
        "    place b at (500, 100)",
        "  }",
      ].join("\n"),
    );
    for (const drawnScene of [
      sceneAt(labelled.scene, labelled.plan, 600),
      animatedScene(labelled.scene, labelled.plan),
    ]) {
      const relation = sceneGroups(drawnScene.items).find((g) => g.id === "r")!;
      const label = relation.items.findIndex((i) => i.kind === "group" && i.role === "label");
      expect(label).toBeGreaterThan(0);
      expect(relation.items.indexOf(particleItems(drawnScene)[0]!)).toBeLessThan(label);
    }
    expect(drawn!.fill).toBe(resolveTheme("technical.light").theme.accent);
  });

  it("reverses and spaces several particles", () => {
    const { scene, plan } = straight("effect flow; duration 1s; particles 2; direction reverse");
    const track = plan.effects[0]!.track!;
    const items = particleItems(sceneAt(scene, plan, 100));
    expect(items).toHaveLength(2);
    expect(circleCentre(items[0]!).x).toBeCloseTo(pointAlong(track, 0.9).x, 1);
    expect(circleCentre(items[1]!).x).toBeCloseTo(pointAlong(track, 0.4).x, 1);
  });

  it("is static outside the window", () => {
    const { scene, plan } = straight("effect flow; delay 1s; repeat 1");
    expect(sceneAt(scene, plan, 500)).toBe(scene);
    expect(sceneAt(scene, plan, 2200)).toBe(scene);
    expect(sceneAt(scene, plan, 1500)).not.toBe(scene);
  });

  it("moves the dash along the line", () => {
    const { scene, plan } = straight("effect dash");
    const frame = sceneAt(scene, plan, 600);
    const relation = sceneGroups(frame.items).find((g) => g.role === "relation" && g.id === "r")!;
    const line = relation.items[0] as PolylineItem;
    expect(line.dash).toEqual({ array: [8, 6], offset: -8.4 });
    expect(renderSvg(frame)).toContain('stroke-dasharray="8 6" stroke-dashoffset="-8.4"');
  });

  it("draws a halo for a pulse", () => {
    const { scene, plan } = draw(
      "  node a\n  animate a { effect pulse; duration 1s }\n  placement { place a at (100, 100) }",
    );
    const [halo] = motionItems(sceneAt(scene, plan, 400)) as PathItem[];
    expect(halo!.opacity).toBe(0.42);
    expect(halo!.fill).toBe("none");
    const box = plan.effects[0]!.bounds!;
    // Scaled 1.06 around the centre: the left edge moves out by 3 % of the width.
    const left = Number(/^M([\d.]+)/.exec(halo!.d)![1]) - box.radius * 1.06;
    expect(left).toBeCloseTo(box.x - box.width * 0.03, 0);
  });

  it("never moves boxes", () => {
    const { scene, plan } = draw(
      "  node a\n  node b\n  a -> b as r\n  animate a { effect pulse }\n  animate r { effect flow }\n  animate b { effect dash }\n  placement {\n    place a at (100, 100)\n    place b at (400, 100)\n  }",
    );
    const frame = sceneAt(scene, plan, 700);
    const boxes = (s: Scene) =>
      sceneGroups(s.items)
        .filter((g) => g.bounds)
        .map((g) => g.bounds);
    expect(boxes(frame)).toEqual(boxes(scene));
  });

  it("is deterministic", () => {
    const { scene, plan } = straight("effect flow; particles 3");
    expect(renderSvg(sceneAt(scene, plan, 333))).toBe(renderSvg(sceneAt(scene, plan, 333)));
  });
});

describe("animated SVG", () => {
  it("writes keyframes, classes and a motion path, without scripts", () => {
    const { scene, plan } = straight("effect flow");
    const svg = renderSvg(animatedScene(scene, plan));
    expect(svg).toContain("<style><![CDATA[");
    expect(svg).toContain("@keyframes mdg-flow");
    expect(svg).toMatch(/\.mdg-e0-0 \{ offset-path: path\("M[\d. ]+L/);
    expect(svg).toContain('class="mdg-m mdg-e0-0"');
    expect(svg).toContain("prefers-reduced-motion: reduce");
    expect(svg).not.toContain("<script");
    expect(svg).not.toMatch(/<animate|<set /);
  });

  it("keeps overlays invisible outside their keyframes", () => {
    const { scene, plan } = draw(
      "  node a\n  animate a { effect pulse }\n  placement { place a at (100, 100) }",
    );
    const animated = animatedScene(scene, plan);
    const [halo] = motionItems(animated) as PathItem[];
    expect(halo!.opacity).toBe(0);
    expect(animated.styleSheet).toContain("transform-box: fill-box");
  });

  it("starts the second particle half way", () => {
    const { scene, plan } = straight("effect flow; duration 1s; particles 2");
    const sheet = animatedScene(scene, plan).styleSheet!;
    expect(sheet).toContain(
      "@keyframes mdg-flow-2-1 {\n  0% { offset-distance: 50%; opacity: 1; }",
    );
    const second = particleItems(sceneAt(scene, plan, 0))[1]!;
    expect(circleCentre(second).x).toBeCloseTo(pointAlong(plan.effects[0]!.track!, 0.5).x, 1);
  });

  it("matches frames at the instant a particle turns", () => {
    const { scene, plan } = straight("effect flow; duration 1s; particles 2");
    // Phase 0.5: the second particle is at the end in CSS (keyframe 50%), and in the frame.
    const second = particleItems(sceneAt(scene, plan, 500))[1]!;
    const track = plan.effects[0]!.track!;
    expect(circleCentre(second).x).toBeCloseTo(track[track.length - 1]!.x, 1);
  });

  it("leaves diagrams without effects unchanged", () => {
    const { scene } = draw("  node a\n  placement { place a at (100, 100) }");
    const empty: MotionPlan = { effects: [] };
    expect(animatedScene(scene, empty)).toBe(scene);
    expect(renderSvg(sceneAt(scene, empty, 100))).toBe(renderSvg(scene));
  });
});

describe("traces", () => {
  const labelled = (animate: string) =>
    draw(
      [
        "  node a",
        "  node b",
        '  a -> b: "go" as r',
        `  animate r { ${animate} }`,
        "  placement {",
        "    place a at (100, 100)",
        "    place b at (500, 100)",
        "  }",
      ].join("\n"),
    );
  const relation = (scene: Scene) =>
    sceneGroups(scene.items).find((g) => g.role === "relation" && g.id === "r")!;
  const length = (points: readonly { x: number; y: number }[]) =>
    points
      .slice(1)
      .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);

  it("takes the theme's accent and 1500 ms", () => {
    const { plan } = labelled("effect trace");
    expect(plan.effects[0]).toMatchObject({ effect: "trace", durationMs: 1500, repeat: "forever" });
    expect(plan.effects[0]!.color).toBe(resolveTheme("technical.light").theme.accent);
  });

  it("grows along the relation under its label, then fades", () => {
    const { scene, plan } = labelled("effect trace; duration 1s");
    const track = plan.effects[0]!.track!;
    const L = Math.round(length(track) * 100) / 100;
    const half = relation(sceneAt(scene, plan, 400));
    const kinds = half.items.map((i) => (i.kind === "group" ? i.role : i.kind));
    // The line and its head, then the trace and its dot, then the label on top.
    expect(kinds.slice(-3)).toEqual(["polyline", "path", "label"]);
    const line = half.items[half.items.length - 3] as PolylineItem;
    const dot = half.items[half.items.length - 2] as PathItem;
    expect(line.dash!.array).toEqual([L, L]);
    expect(line.dash!.offset).toBeCloseTo(L / 2, 1);
    expect(line.opacity).toBe(1);
    expect(circleCentre(dot).x).toBeCloseTo(pointAlong(track, 0.5).x, 1);
    const fading = relation(sceneAt(scene, plan, 900));
    const lit = fading.items[fading.items.length - 3] as PolylineItem;
    expect(lit.dash!.offset).toBe(0);
    expect(lit.opacity).toBe(0.5);
    expect(motionItems(sceneAt(scene, plan, 400))).toEqual([]);
  });

  it("runs from the end when reversed", () => {
    const { scene, plan } = labelled("effect trace; duration 1s; direction reverse");
    const track = plan.effects[0]!.track!;
    const start = relation(sceneAt(scene, plan, 0));
    const dot = start.items[start.items.length - 2] as PathItem;
    expect(circleCentre(dot).x).toBeCloseTo(track[track.length - 1]!.x, 1);
  });

  it("writes the same states as keyframes, invisible outside them", () => {
    const { scene, plan } = labelled("effect trace; duration 1s");
    const L = Math.round(length(plan.effects[0]!.track!) * 100) / 100;
    const animated = animatedScene(scene, plan);
    const sheet = animated.styleSheet!;
    expect(sheet).toContain(
      `@keyframes mdg-trace-0 {\n  0% { stroke-dasharray: ${L} ${L}; stroke-dashoffset: ${L}; opacity: 1; }\n  80% { stroke-dasharray: ${L} ${L}; stroke-dashoffset: 0; opacity: 1; }\n  100% { stroke-dasharray: ${L} ${L}; stroke-dashoffset: 0; opacity: 0; }\n}`,
    );
    expect(sheet).toContain("@keyframes mdg-trace-dot");
    expect(sheet).toMatch(/\.mdg-e0-dot \{ offset-path: path\("M[\d. ]+L/);
    const group = relation(animated);
    const overlays = group.items.filter(
      (i): i is PolylineItem | PathItem =>
        (i.kind === "polyline" || i.kind === "path") && (i.className ?? "").includes("mdg-e0"),
    );
    expect(overlays.map((i) => i.opacity)).toEqual([0, 0]);
    expect(renderSvg(animated)).not.toContain("<script");
  });

  it("combines with a pulse on the same relation", () => {
    const { scene, plan } = draw(
      [
        "  node a",
        "  node b",
        "  a -> b as r",
        "  animate r { effect trace }",
        "  animate r { effect pulse }",
        "  placement {",
        "    place a at (100, 100)",
        "    place b at (500, 100)",
        "  }",
      ].join("\n"),
    );
    expect(plan.effects.map((e) => e.effect)).toEqual(["trace", "pulse"]);
    const frame = sceneAt(scene, plan, 300);
    expect(motionItems(frame)).toHaveLength(1);
    expect(relation(frame).items.length).toBe(relation(scene).items.length + 2);
  });

  it("targets relations only", () => {
    const compilation = compile(
      'language "0.2"\ndiagram d: flow {\n  node a\n  animate a { effect trace }\n}\n',
    );
    const invalid = compilation.diagnostics.find((d) => d.code === "animate.invalid-target")!;
    expect(invalid.message).toMatch(/trace runs along relations/);
  });
});

describe("free lines", () => {
  function free(body: string) {
    const compilation = compile(`language "0.2"\ndiagram d: free {\n${body}\n}\n`);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const scene = layoutDiagram(compilation, diagram, {}).scene!;
    return { scene, plan: planMotion(diagram, scene) };
  }
  const lineGroup = (scene: Scene) =>
    sceneGroups(scene.items).find((g) => g.role === "element" && g.id === "l")!;

  it("runs flow particles along a line, as along a relation", () => {
    const { scene, plan } = free("  line l from (0, 0) to (300, 0)\n  animate l { effect flow }");
    expect(plan.effects).toHaveLength(1);
    expect(plan.effects[0]).toMatchObject({ target: "l", role: "element", bounds: null });
    expect(plan.effects[0]!.track).toHaveLength(2);
    const frame = sceneAt(scene, plan, 600);
    const particles = lineGroup(frame).items.filter(
      (i) => i.kind === "path" && / a[\d.]+ /.test(i.d),
    );
    expect(particles).toHaveLength(1);
  });

  it("dashes a line's stroke and glows along it for a pulse, with no halo", () => {
    const { scene, plan } = free(
      "  line l from (0, 0) to (300, 0)\n  animate l { effect dash }\n  animate l { effect pulse }",
    );
    expect(plan.effects.map((e) => [e.effect, e.bounds])).toEqual([
      ["dash", null],
      ["pulse", null],
    ]);
    const frame = sceneAt(scene, plan, 300);
    const [line] = lineGroup(frame).items.filter((i): i is PolylineItem => i.kind === "polyline");
    expect(line!.dash).toBeDefined();
    // No rounded-rectangle halo above the drawing: the glow follows the line.
    expect(
      motionItems(frame).some((i) => i.kind === "path" && /^M[\d.]+ [\d.]+[hHvV]/.test(i.d)),
    ).toBe(false);
  });
});

describe("sketched strokes", () => {
  it("move the dash on both passes of a sketched relation, along the clean track", () => {
    const text = [
      'language "0.2"',
      "diagram d: free {",
      '  theme "sketch.light"',
      "  layout manual",
      '  box a "A"',
      '  box b "B"',
      "  a -> b as pay",
      "  animate pay { effect dash }",
      "  animate pay { effect flow }",
      "  placement {",
      "    place a at (100, 100)",
      "    place b at (400, 100)",
      "  }",
      "}",
    ].join("\n");
    const compilation = compile(text);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const scene = layoutDiagram(compilation, diagram, {}).scene!;
    expect(scene.sketch).toBe("light");
    const plan = planMotion(diagram, scene);
    // The particles run on the clean track the layout drew.
    const pay = sceneGroups(scene.items).find((g) => g.id === "pay" && g.role === "relation")!;
    expect(plan.effects.find((e) => e.effect === "flow")!.track).toEqual(pay.track);
    const frame = sceneAt(scene, plan, 300);
    expect(frame.sketch).toBe("light");
    const svg = renderSvg(frame);
    const start = svg.indexOf('<g data-id="pay" data-role="relation"');
    const group = svg.slice(start, svg.indexOf("</g>", start));
    const passes = group.match(/<path d="M[^"]+" fill="none"[^>]*stroke-dasharray[^>]*>/g)!;
    expect(passes).toHaveLength(2);
    const dash = (pass: string) =>
      /stroke-dasharray="[^"]+" stroke-dashoffset="[^"]+"/.exec(pass)![0];
    expect(dash(passes[0]!)).toBe(dash(passes[1]!));
    expect(dash(passes[0]!)).not.toContain('stroke-dashoffset="0"');
  });
});

describe("other profiles", () => {
  it("animates sequence messages, participants and notes", () => {
    const text = [
      'language "0.2"',
      "diagram s: sequence {",
      '  participant a "A"',
      '  participant b "B"',
      '  a -> b: "Pay" as pay',
      '  note n over a, b "Wait"',
      "  animate pay { effect flow }",
      "  animate b { effect pulse }",
      "  animate n { effect pulse }",
      "}",
    ].join("\n");
    const compilation = compile(text);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const scene = layoutDiagram(compilation, diagram, {}).scene!;
    const plan = planMotion(diagram, scene);
    expect(plan.effects.map((e) => [e.target, e.role])).toEqual([
      ["pay", "relation"],
      ["b", "element"],
      ["n", "event"],
    ]);
    // Two halos above the drawing, the message's particle on its line.
    const frame = sceneAt(scene, plan, 300);
    expect(motionItems(frame)).toHaveLength(2);
    expect(particleItems(frame, "pay")).toHaveLength(1);
  });

  it("pulses a sequence participant on its drawn box beside an actor", () => {
    const text = [
      'language "0.2"',
      "diagram s: sequence {",
      '  actor a "A"',
      '  participant b "B"',
      '  a -> b: "Pay" as pay',
      "  animate b { effect pulse }",
      "}",
    ].join("\n");
    const compilation = compile(text);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const result = layoutDiagram(compilation, diagram, {});
    const scene = result.scene!;
    const plan = planMotion(diagram, scene);
    const pulse = plan.effects.find((e) => e.target === "b")!;
    // The head row is the actor's height; the box, and so the halo, is its bottom 40 units.
    const head = scene.items.find(
      (i): i is GroupItem => i.kind === "group" && i.role === "element" && i.id === "b",
    )!;
    const drawn = head.items.find((i) => i.kind === "rect")!;
    expect(pulse.bounds).toMatchObject({
      x: drawn.kind === "rect" ? drawn.x : NaN,
      y: drawn.kind === "rect" ? drawn.y : NaN,
      width: drawn.kind === "rect" ? drawn.width : NaN,
      height: 40,
    });
    const box = result.boxes!.get("b")!;
    expect(pulse.bounds!.y).toBe(box.y + result.offset!.y);
    // Its border is the pale `line` token: the halo takes the accent, so it shows.
    const themed = planMotion(diagram, scene, motionOptions(result.theme));
    expect(themed.effects.find((e) => e.target === "b")!.color).toBe(result.theme!.accent);
  });

  it("animates C4 entities and model relations by path", () => {
    const text = [
      'language "0.2"',
      "model m {",
      '  person user "User"',
      '  system shop "Shop"',
      '  user -> shop: "Buys" as buys',
      "}",
      "diagram v: c4 using m {",
      "  level context",
      "  layout manual",
      "  placement {",
      "    place user at (100, 100)",
      "    place shop at (400, 100)",
      "  }",
      "  animate shop { effect pulse }",
      "  animate buys { effect flow }",
      "}",
    ].join("\n");
    const compilation = compile(text);
    expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    const scene = layoutDiagram(compilation, diagram, {}).scene!;
    const plan = planMotion(diagram, scene);
    expect(plan.effects.map((e) => e.target)).toEqual(["shop", "buys"]);
  });
});

describe("times", () => {
  it("reads milliseconds and seconds", () => {
    expect(parseTime("600ms")).toBe(600);
    expect(parseTime("1.5s")).toBe(1500);
    expect(parseTime("250")).toBe(250);
    expect(parseTime("-1s")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
});
