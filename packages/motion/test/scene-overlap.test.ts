import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { layoutDiagram, type GroupItem, type Scene } from "@meltemi/diagrams-layout";
import { renderSvg } from "@meltemi/diagrams-render";
import {
  IDENTITY,
  apply,
  boundsOf as pathBounds,
  flatten,
  multiply,
  parsePath,
  parseTransform,
  type Matrix,
  type Point,
} from "../../assets/src/path.js";
import {
  activeSceneIndices,
  boundsOf,
  frameBox,
  hasSceneOverlap,
  sceneGroups,
  sceneStills,
  storyFrame,
  storySceneFrame,
  storySceneIndexAt,
  storyTimeline,
  storyViewData,
  type StoryViews,
} from "../src/index.js";

const DIAGRAM = `diagram d: flow {
  layout manual
  a -> b as r
  placement { place a at (80, 100); size a (80, 40); place b at (520, 200); size b (80, 40) }
}
`;

function setup(body: string, extra = "") {
  const compilation = compile(`language "0.2"\n${DIAGRAM}${extra}\nstory tour for d { ${body} }`);
  expect(compilation.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual(
    [],
  );
  const timeline = storyTimeline(compilation.document.stories[0]!);
  const data = new Map(
    compilation.document.diagrams.map((diagram) => [
      diagram.id,
      storyViewData(diagram, layoutDiagram(compilation, diagram))!,
    ]),
  );
  const views: StoryViews = (key) => data.get(key);
  return {
    timeline,
    views,
    data,
    frame: (t: number) => storyFrame(timeline, views, t, { accent: "#f00" })!,
  };
}

const group = (scene: Scene, id: string) =>
  sceneGroups(scene.items).find((item) => item.id === id && item.role === "element")!;
const opacity = (scene: Scene, id: string) => group(scene, id).opacity ?? 1;
const highlightItems = (scene: Scene) =>
  scene.items.find((item): item is GroupItem => item.kind === "group" && item.id === "story")
    ?.items ?? [];

/** Read the actual nested SVG placement, independently of the groups' bounds metadata. */
function displayedBox(scene: Scene, id: string) {
  const points: Point[] = [];
  const visit = (items: Scene["items"], parent: Matrix, inside = false) => {
    for (const item of items) {
      if (item.kind === "group") {
        const matrix = multiply(parent, parseTransform(item.transform ?? "")!);
        visit(item.items, matrix, inside || (item.id === id && item.role === "element"));
      } else if (inside && item.kind === "path") {
        const matrix = multiply(parent, parseTransform(item.transform ?? "")!);
        points.push(...flatten(parsePath(item.d)!).map((point) => apply(matrix, point)));
      } else if (inside && item.kind === "rect") {
        points.push(
          ...[
            { x: item.x, y: item.y },
            { x: item.x + item.width, y: item.y + item.height },
          ].map((point) => apply(parent, point)),
        );
      }
    }
  };
  visit(scene.items, IDENTITY);
  const bounds = pathBounds(points)!;
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

describe("concurrent story composition", () => {
  it("reports two and three active intervals, including ties and the final closing frame", () => {
    const { timeline } = setup(`scene a { hold 10s }
scene b { overlap 8s; hold 10s }
scene c { overlap 8s; hold 10s }`);
    expect(hasSceneOverlap(timeline)).toBe(true);
    expect(activeSceneIndices(timeline, 1000)).toEqual([0]);
    expect(activeSceneIndices(timeline, 3000)).toEqual([0, 1]);
    expect(activeSceneIndices(timeline, 5000)).toEqual([0, 1, 2]);
    expect(activeSceneIndices(timeline, 10000)).toEqual([1, 2]);
    expect(activeSceneIndices(timeline, 14000)).toEqual([2]);
    expect(storySceneIndexAt(timeline, 5000)).toBe(2);
    expect(sceneStills(timeline).map((scene) => scene.atMs)).toEqual([10000, 12000, 14000]);
    const simultaneous = setup("scene a { hold 1s }; scene b { overlap 1s; hold 1s }").timeline;
    expect(activeSceneIndices(simultaneous, 1000)).toEqual([0, 1]);
    expect(storySceneIndexAt(simultaneous, 0)).toBe(1);
  });

  it("anchors incoming visibility at its start rather than the older scene's moving value", () => {
    const { frame } = setup(`scene a { hide a over 10s }
scene b { overlap 5s; reveal a over 10s }`);
    expect(opacity(frame(4000), "a")).toBe(0.6);
    expect(opacity(frame(5000), "a")).toBe(0.5);
    expect(opacity(frame(6000), "a")).toBe(0.55);
    expect(opacity(frame(10000), "a")).toBe(0.75);
  });

  it("does not let an earlier scene's later action regain priority", () => {
    const { frame } = setup(`scene a { hold 8s; hide a over 2s }
scene b { overlap 5s; reveal a over 1s; hold 6s }`);
    expect(opacity(frame(8500), "a")).toBe(1);
    expect(opacity(frame(9500), "a")).toBe(1);
  });

  it("anchors an incoming camera at its start and keeps out-of-order seeks deterministic", () => {
    const { timeline, views, frame } = setup(`scene a { camera a over 10s }
scene b { overlap 5s; camera b over 10s }`);
    const scene = views("d")!.scene;
    const a = frameBox(scene, boundsOf(scene, ["a"])!);
    const b = frameBox(scene, boundsOf(scene, ["b"])!);
    const full = { x: 0, y: 0, width: scene.width, height: scene.height };
    const expected = Object.fromEntries(
      Object.keys(full).map((key) => {
        const property = key as keyof typeof full;
        const atStart = full[property] + (a[property] - full[property]) * 0.5;
        return [key, atStart + (b[property] - atStart) * 0.1];
      }),
    );
    const first = frame(6000);
    for (const [key, value] of Object.entries(expected))
      expect(first.viewBox![key as keyof typeof full]).toBeCloseTo(value, 1);
    frame(14000);
    frame(1000);
    expect(renderSvg(frame(6000))).toBe(renderSvg(first));
    expect(timeline.durationMs).toBe(15000);
  });

  it("keeps distinct highlights and lets a newer transient claim temporarily replace an older one", () => {
    const separate = setup(`scene a { highlight a over 10s }
scene b { overlap 5s; highlight b over 10s }`);
    expect(highlightItems(separate.frame(6000))).toHaveLength(2);
    const same = setup(`scene a { highlight a over 10s }
scene b { overlap 5s; highlight a over 2s; hold 5s }`);
    expect(highlightItems(same.frame(5050))).toHaveLength(1);
    expect(highlightItems(same.frame(5050))[0]).toMatchObject({ opacity: 0.25 });
    expect(highlightItems(same.frame(7500))[0]).toMatchObject({ opacity: 1 });
  });

  it("keeps an earlier focus active until its scene ends unless a later scene claims focus", () => {
    const carry = setup(`scene a { focus a over 1s; hold 9s }
scene b { overlap 5s; hold 7s }`);
    expect(opacity(carry.frame(7000), "b")).toBe(0.25);
    expect(opacity(carry.frame(11000), "b")).toBe(1);
    const cleared = setup(`scene a { focus a over 1s; hold 9s }
scene b { overlap 5s; focus all over 1s; hold 6s }`);
    expect(opacity(cleared.frame(7000), "b")).toBe(1);
  });

  it("cross-fades same-view scenes while outgoing and incoming actions continue", () => {
    const { frame } = setup(`scene a { hide a over 10s }
scene b { overlap 5s; transition fade over 2s; reveal a over 10s }`);
    const at = frame(6000);
    const before = at.items.find(
      (item): item is GroupItem => item.kind === "group" && item.id === "before",
    )!;
    const after = at.items.find(
      (item): item is GroupItem => item.kind === "group" && item.id === "after",
    )!;
    expect(before.opacity).toBe(0.5);
    expect(after.opacity).toBe(0.5);
    expect(sceneGroups(before.items).find((item) => item.id === "a")!.opacity).toBe(0.4);
    expect(sceneGroups(after.items).find((item) => item.id === "a")!.opacity).toBe(0.55);
    expect(frame(7000).items.some((item) => item.kind === "group" && item.id === "before")).toBe(
      false,
    );
  });

  it.each(["fade", "morph"])(
    "composes three concurrent %s transitions without freezing their actions",
    (kind) => {
      const { frame } = setup(`scene a { hide a over 10s }
scene b { overlap 8s; transition ${kind} over 10s; reveal a over 10s }
scene c { overlap 8s; transition ${kind} over 10s; hide a over 10s }`);
      const at = frame(5000);
      expect(at.items.length).toBeGreaterThan(0);
      const svg = renderSvg(at);
      expect(svg).not.toContain("NaN");
      frame(12000);
      expect(renderSvg(frame(5000))).toBe(svg);
      if (kind === "fade")
        expect(sceneGroups(at.items).filter((item) => item.id === "before")).toHaveLength(2);
      else expect(sceneGroups(at.items).some((item) => item.id.endsWith("#morph"))).toBe(true);
    },
  );

  it("keeps different view states separate during a transition", () => {
    const { frame } = setup(
      `scene a { hide a over 10s }
scene b { overlap 5s; view other; transition fade over 2s; reveal a over 10s }`,
      "diagram other: flow { layout manual; a -> b; placement { place a at (250, 100); place b at (100, 300) } }",
    );
    const at = frame(6000);
    const before = at.items.find(
      (item): item is GroupItem => item.kind === "group" && item.id === "before",
    )!;
    const after = at.items.find(
      (item): item is GroupItem => item.kind === "group" && item.id === "after",
    )!;
    expect(sceneGroups(before.items).find((item) => item.id === "a")!.opacity).toBe(0.4);
    expect(sceneGroups(after.items).find((item) => item.id === "a")!.opacity).toBe(0.1);
  });

  it("closes a chosen scene without later claims while retaining future targets' initial visibility", () => {
    const { timeline, views, frame } = setup(`scene a { hide a over 10s }
scene b { overlap 5s; reveal a over 10s }
scene c { reveal b over 1s }`);
    expect(opacity(frame(10000), "a")).toBe(0.75);
    const closing = storySceneFrame(timeline, views, 0)!;
    expect(opacity(closing, "a")).toBe(0);
    expect(opacity(closing, "b")).toBe(0);
    expect(storySceneFrame(timeline, views, -1)).toBeNull();
  });

  it("keeps a third morph continuous with the preceding in-flight morph and cameras", () => {
    const { frame } = setup(`scene a { camera a over 10s }
scene b { overlap 8s; transition morph over 10s; camera b over 10s }
scene c { overlap 8s; transition morph over 10s; camera all over 10s }`);
    const before = displayedBox(frame(3999.999), "a");
    const entering = displayedBox(frame(4000), "a");
    for (const key of Object.keys(before) as (keyof typeof before)[])
      expect(entering[key], key).toBeCloseTo(before[key], 0);
  });

  it("retains the exact legacy path and still instants without positive overlap", () => {
    const { timeline, views, frame } = setup(
      "scene a { hide a over 1s }; scene b { reveal a over 1s }",
    );
    expect(hasSceneOverlap(timeline)).toBe(false);
    expect(sceneStills(timeline).map((scene) => scene.atMs)).toEqual([999.99, 2000]);
    const zero = { ...timeline, scenes: timeline.scenes.map((scene) => ({ ...scene })) };
    for (const t of [0, 333, 1000, 1500, 2000])
      expect(renderSvg(storyFrame(zero, views, t, { accent: "#f00" })!)).toBe(renderSvg(frame(t)));
  });
});
