import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
  type InspectorField,
  type PreviewedAction,
} from "../src/index.js";

/**
 * A session on a text as a host runs it: each plan is applied and analysed as the next revision,
 * and the messages of the last answer or update are kept.
 */
function open(text: string, revision = 1) {
  const session = new CanvasSession();
  let current = text;
  let rev = revision;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
  const act = (action: CanvasAction) => session.receive({ type: "action", revision: rev, action });
  const apply = (action: CanvasAction): string => {
    const result = act(action);
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    current = applyTextEdits(current, result.plan.edits);
    rev++;
    messages = session.update(analyzeDocument({ text: current, revision: rev }));
    return current;
  };
  /** Asks for the preview of a gesture, with the revision of the last update. */
  const preview = (action: PreviewedAction, token = 1) => act({ kind: "preview", token, action });
  return {
    session,
    act,
    apply,
    preview,
    text: () => current,
    revision: () => rev,
    messages: () => messages,
  };
}

const render = (messages: readonly HostMessage[]) =>
  messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!;
const inspector = (messages: readonly HostMessage[]) =>
  messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model;
const field = (messages: readonly HostMessage[], name: string): InspectorField | undefined =>
  inspector(messages).fields.find((f) => f.name === name);

/** The first rectangle drawn for an element, in scene coordinates. */
function rectOf(svg: string, id: string) {
  const number = "(-?[\\d.]+)";
  const match = new RegExp(
    `<g data-id="${id}" data-role="element">\\s*<rect x="${number}" y="${number}" width="${number}" height="${number}"`,
  ).exec(svg);
  if (!match) throw new Error(`No rectangle for ${id}`);
  return { x: +match[1]!, y: +match[2]!, width: +match[3]!, height: +match[4]! };
}

/** The point an arrowhead of a relation points at: the first point of its head. */
function tipOf(svg: string, key: string) {
  const id = key.replace(">", "&gt;");
  const match = new RegExp(
    `<g data-id="${id}" data-role="relation">[\\s\\S]*?<path d="M(-?[\\d.]+) (-?[\\d.]+)`,
  ).exec(svg);
  if (!match) throw new Error(`No arrowhead for ${key}`);
  return { x: +match[1]!, y: +match[2]! };
}

describe("new diagrams", () => {
  it("offers the three kinds in an empty file and shows the diagram created", () => {
    const canvas = open("");
    expect(canvas.messages()).toEqual([
      {
        type: "empty",
        revision: 1,
        message: expect.stringMatching(/^No diagram to draw/),
        creatable: ["flow", "free", "sequence"],
      },
    ]);
    const text = canvas.apply({ kind: "createDiagram", type: "flow" });
    expect(text).toBe('language "0.2"\n\ndiagram diagram1: flow {\n}\n');
    expect(canvas.session.current).toBe("diagram1");
    expect(render(canvas.messages())).toMatchObject({
      diagram: "diagram1",
      profile: "flow",
      diagrams: [{ id: "diagram1", title: null }],
    });
    expect(inspector(canvas.messages()).title).toBe("Diagram diagram1");
  });

  it("appends another diagram after the last one and switches to it", () => {
    const text = 'language "0.2"\n\ndiagram overview: flow {\n  a -> b\n}\n';
    const canvas = open(text);
    canvas.session.receive({ type: "select", ids: ["a"] });
    const after = canvas.apply({ kind: "createDiagram", type: "free" });
    expect(after).toBe(`${text}\ndiagram diagram1: free {\n}\n`);
    expect(canvas.session.current).toBe("diagram1");
    expect(canvas.session.selected).toEqual([]);
    const shown = render(canvas.messages());
    expect(shown.profile).toBe("free");
    expect(shown.diagrams.map((d) => d.id)).toEqual(["overview", "diagram1"]);
    // A sequence diagram takes the next free id.
    expect(canvas.apply({ kind: "createDiagram", type: "sequence" })).toContain(
      "\n\ndiagram diagram2: sequence {\n}\n",
    );
    expect(canvas.session.current).toBe("diagram2");
  });

  it("is one edit of the revision the canvas saw, and nothing for another kind", () => {
    const canvas = open("", 3);
    const stale = canvas.session.receive({
      type: "action",
      revision: 2,
      action: { kind: "createDiagram", type: "flow" },
    });
    expect(stale.plan).toBeUndefined();
    expect(stale.messages[0]).toMatchObject({ type: "rejected", code: "edit.stale-revision" });
    const c4 = canvas.session.receive({
      type: "action",
      revision: 3,
      action: { kind: "createDiagram", type: "c4" },
    });
    expect(c4).toEqual({ messages: [] });
    const created = canvas.act({ kind: "createDiagram", type: "free" });
    expect(created.plan!.baseRevision).toBe(3);
    expect(applyTextEdits(applyTextEdits("", created.plan!.edits), created.plan!.inverse)).toBe("");
  });
});

describe("the Canvas field", () => {
  const sheet = (statement = "") =>
    `diagram d: flow {\n  layout manual\n${statement}  api["API"]\n  db[("DB")]\n  api -> db\n  placement {\n    place api at (126, 112)\n    place db at (420, 112)\n  }\n}\n`;
  const choose = (canvas: ReturnType<typeof open>, name: string, value: string | number | null) =>
    canvas.act({ kind: "setField", ids: [], field: name, value });

  it("replaces the preset field: fit to the content, a preset or a custom size", () => {
    const canvas = open(sheet());
    expect(field(canvas.messages(), "preset")).toBeUndefined();
    expect(field(canvas.messages(), "canvas")).toEqual({
      name: "canvas",
      label: "Canvas",
      type: "enum",
      value: null,
      placeholder: "fit",
      options: ["document", "slide", "board", "custom"],
    });
    expect(field(canvas.messages(), "canvas.width")).toBeUndefined();
    expect(field(open(sheet("  preset slide\n")).messages(), "canvas")!.value).toBe("slide");
    const custom = open(sheet("  canvas (800, 600)\n")).messages();
    expect(field(custom, "canvas")!.value).toBe("custom");
    const range = { min: 100, max: 10000, step: 1 };
    expect(field(custom, "canvas.width")).toMatchObject({ type: "number", value: 800, range });
    expect(field(custom, "canvas.height")).toMatchObject({ type: "number", value: 600, range });
    // Sequence diagrams have it too.
    const sequence = open("diagram s: sequence {\n  a -> b\n}\n").messages();
    expect(field(sequence, "canvas")).toMatchObject({ placeholder: "fit" });
    expect(field(sequence, "preset")).toBeUndefined();
  });

  it("writes a slide over a custom size in one plan", () => {
    const text = sheet("  canvas (800, 600)\n");
    const result = choose(open(text), "canvas", "slide");
    const after = applyTextEdits(text, result.plan!.edits);
    expect(after).toContain("  preset slide\n");
    expect(after).not.toContain("canvas (");
    // One undo step brings the custom size back.
    expect(applyTextEdits(after, result.plan!.inverse)).toBe(text);
  });

  it("starts a custom size from the drawing and sets its width and height", () => {
    const canvas = open(sheet());
    const drawn = render(canvas.messages());
    let text = canvas.apply({ kind: "setField", ids: [], field: "canvas", value: "custom" });
    expect(text).toContain(`  canvas (${drawn.width}, ${drawn.height})\n`);
    // Choosing it again changes nothing.
    expect(choose(canvas, "canvas", "custom").plan).toBeUndefined();
    text = canvas.apply({ kind: "setField", ids: [], field: "canvas.width", value: 1600 });
    expect(text).toContain(`  canvas (1600, ${drawn.height})\n`);
    text = canvas.apply({ kind: "setField", ids: [], field: "canvas.height", value: "900" });
    expect(text).toContain("  canvas (1600, 900)\n");
    expect(text).not.toContain("preset");
    expect(compile(text).document.diagrams[0]!.properties.canvas).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("writes a board, which grows with the drawing, over a custom size in one plan", () => {
    const text = sheet("  canvas (800, 600)\n");
    const canvas = open(text);
    const after = canvas.apply({ kind: "setField", ids: [], field: "canvas", value: "board" });
    expect(after).toContain("  preset board\n");
    expect(after).not.toContain("canvas (");
    expect(field(canvas.messages(), "canvas")).toMatchObject({ value: "board" });
    expect(field(canvas.messages(), "canvas.width")).toBeUndefined();
    expect(compile(after).document.diagrams[0]!.properties.preset).toBe("board");
    // Back to fitting the content: nothing written.
    expect(canvas.apply({ kind: "setField", ids: [], field: "canvas", value: null })).toBe(sheet());
  });

  it("goes from a preset to a custom size and back to fitting the content", () => {
    const canvas = open(sheet("  preset document\n"));
    let text = canvas.apply({ kind: "setField", ids: [], field: "canvas.width", value: 1200 });
    expect(text).toMatch(/ {2}canvas \(1200, \d+\)\n/);
    expect(text).not.toContain("preset");
    text = canvas.apply({ kind: "setField", ids: [], field: "canvas", value: "document" });
    expect(text).toContain("  preset document\n");
    expect(text).not.toContain("canvas (");
    text = canvas.apply({ kind: "setField", ids: [], field: "canvas", value: null });
    expect(text).toBe(sheet());
  });

  it("refuses a side out of range and a choice it does not have, writing nothing", () => {
    const canvas = open(sheet("  canvas (800, 600)\n"));
    const small = choose(canvas, "canvas.width", 50);
    expect(small.plan).toBeUndefined();
    expect(small.messages).toEqual([
      { type: "rejected", code: "edit.invalid-value", reason: "Write a number from 100 to 10000." },
    ]);
    expect(choose(canvas, "canvas.height", 10001).plan).toBeUndefined();
    expect(choose(canvas, "canvas.height", "tall").messages[0]).toMatchObject({
      reason: "Write a number.",
    });
    expect(choose(canvas, "canvas", "poster").messages[0]).toMatchObject({
      type: "rejected",
      reason: "The canvas is one of `fit`, `document`, `slide`, `board`, `custom`.",
    });
    expect(canvas.text()).toBe(sheet("  canvas (800, 600)\n"));
  });
});

describe("live previews of moves and resizes", () => {
  const pair = `diagram d: flow {
  layout manual
  client["Client"]
  api["API"]
  client -> api
  placement {
    place client at (112, 112)
    place api at (420, 112)
  }
}
`;

  it("draws the connector of a dragged box ending where the drop puts the box, writing nothing", () => {
    const canvas = open(pair);
    canvas.session.receive({ type: "select", ids: ["api"] });
    const before = render(canvas.messages());
    const box = rectOf(before.svg, "api");
    expect(tipOf(before.svg, "client->api#1").x).toBe(box.x);
    const result = canvas.preview({ kind: "move", ids: ["api"], delta: { x: 200, y: 0 } }, 7);
    expect(result.plan).toBeUndefined();
    expect(result.messages).toHaveLength(1);
    const answer = result.messages[0] as HostMessage & { type: "preview" };
    expect(answer).toMatchObject({ type: "preview", token: 7, width: before.width + 200 });
    expect(answer.offset).toEqual(before.offset);
    const moved = rectOf(answer.svg!, "api");
    expect(moved).toEqual({ ...box, x: box.x + 200 });
    expect(tipOf(answer.svg!, "client->api#1")).toEqual({
      x: moved.x,
      y: tipOf(before.svg, "client->api#1").y,
    });
    expect(rectOf(answer.svg!, "client")).toEqual(rectOf(before.svg, "client"));
    // The session is as it was: same drawing, same revision, same selection.
    expect(render(canvas.session.state()).svg).toBe(before.svg);
    expect(canvas.session.selected).toEqual(["api"]);
    const drop = canvas.act({ kind: "move", ids: ["api"], delta: { x: 200, y: 0 } });
    expect(drop.plan!.baseRevision).toBe(1);
    // The drop draws what the preview drew.
    canvas.apply({ kind: "move", ids: ["api"], delta: { x: 200, y: 0 } });
    expect(render(canvas.messages()).svg).toBe(answer.svg);
  });

  it("previews the first drag of an automatic diagram as the drop writes it", () => {
    const auto = `diagram d: flow {\n  client["Client"]\n  api["API"]\n  db[("DB")]\n  client -> api\n  api -> db\n}\n`;
    const canvas = open(auto);
    const before = render(canvas.messages());
    const answer = canvas.preview({ kind: "move", ids: ["db"], delta: { x: 0, y: 140 } })
      .messages[0] as HostMessage & { type: "preview" };
    canvas.apply({ kind: "move", ids: ["db"], delta: { x: 0, y: 140 } });
    expect(canvas.text()).toContain("layout assisted");
    expect(answer.svg).toBe(render(canvas.messages()).svg);
    expect(answer.svg).not.toBe(before.svg);
  });

  it("previews a rotation of an automatic diagram in place, and the drop writes it after the arrangement", () => {
    const auto = `diagram d: flow {
  client["Client"]
  api["API"]
  db[("DB")]
  client -> api
  api -> db
}
`;
    const canvas = open(auto);
    const before = render(canvas.messages());
    const box = before.elements.find((e) => e.id === "api")!.box;
    const turn = { kind: "setField", ids: ["api"], field: "style.rotation", value: 30 } as const;
    const answer = canvas.preview(turn, 3).messages[0] as HostMessage & { type: "preview" };
    expect(answer).toMatchObject({ type: "preview", token: 3 });
    // The turned box stays where the arrangement has it: the engine does not move it away. The
    // drawing grows past the top for the turned corners, so its offset says where that is.
    expect(answer.box).toEqual(box);
    const c = {
      x: box.x + box.width / 2 + answer.offset!.x,
      y: box.y + box.height / 2 + answer.offset!.y,
    };
    expect(answer.svg).toContain(`rotate(30 ${c.x} ${Math.round(c.y * 100) / 100})`);
    const drop = canvas.act({ kind: "setField", ids: ["api"], field: "style.rotation", value: 30 });
    expect(drop.plan).toBeDefined();
    canvas.apply({ kind: "setField", ids: ["api"], field: "style.rotation", value: 30 });
    // One plan: the arrangement, then the rotation.
    expect(canvas.text()).toContain("layout assisted");
    expect(canvas.text()).toContain("style api { rotation 30 }");
    expect(canvas.text()).toMatch(/place api at/);
    expect(render(canvas.messages()).elements.find((e) => e.id === "api")!.box).toEqual(box);
    expect(answer.svg).toBe(render(canvas.messages()).svg);
  });

  it("has no drawing for a rotation the language refuses", () => {
    const canvas = open(pair);
    const answer = canvas.preview({
      kind: "setField",
      ids: ["api"],
      field: "style.rotation",
      value: 400,
    }).messages[0] as HostMessage & { type: "preview" };
    expect(answer.svg).toBeNull();
    expect(answer.box).toBeUndefined();
  });

  it("grows an unsized free group with a resized child", () => {
    const composition = `diagram s: free {
  layout manual
  group g "G" {
    box a "A"
  }
  box b "B"
  a -> b
  placement {
    place g at (200, 150)
    place a at (60, 40)
    place b at (500, 150)
  }
}
`;
    const canvas = open(composition);
    const before = render(canvas.messages());
    const a = before.elements.find((e) => e.id === "a")!.box;
    const group = rectOf(before.svg, "g");
    const result = canvas.preview({
      kind: "resize",
      id: "a",
      box: { ...a, width: a.width + 120, height: a.height + 80 },
    });
    const svg = (result.messages[0] as HostMessage & { type: "preview" }).svg!;
    expect(rectOf(svg, "g")).toEqual({
      ...group,
      width: group.width + 120,
      height: group.height + 80,
    });
    expect(canvas.text()).toBe(composition);
  });

  it("has no drawing for what the drop refuses, and keeps what waits for an edit", () => {
    const nested = `diagram d: flow {
  layout manual
  group outer "Outer" {
    group inner "Inner" {
      api["API"]
    }
  }
  db[("DB")]
  api -> db
  placement {
    place api at (126, 112)
    place db at (420, 112)
  }
}
`;
    const canvas = open(nested);
    // A node created and not yet applied: the session waits to select it.
    const created = canvas.act({ kind: "create", elementKind: "node", at: { x: 700, y: 300 } });
    const refused = canvas.preview(
      { kind: "move", ids: ["outer"], delta: { x: 0, y: 0 }, parent: "inner" },
      9,
    );
    expect(refused).toEqual({ messages: [{ type: "preview", token: 9, svg: null }] });
    // A box moved off the diagram's elements writes nothing either.
    expect(
      (
        canvas.preview({ kind: "move", ids: ["ghost"], delta: { x: 1, y: 0 } }).messages[0] as {
          svg: string | null;
        }
      ).svg,
    ).toBeNull();
    const text = applyTextEdits(nested, created.plan!.edits);
    const messages = canvas.session.update(analyzeDocument({ text, revision: 2 }));
    expect(canvas.session.selected).toEqual(["node1"]);
    expect(messages).toContainEqual({ type: "select", ids: ["node1"] });
  });

  it("has no drawing for a text that changed, a copy with errors or a sequence diagram", () => {
    const canvas = open(pair, 4);
    canvas.session.update(analyzeDocument({ text: pair, revision: 5 }));
    const old = canvas.session.receive({
      type: "action",
      revision: 4,
      action: {
        kind: "preview",
        token: 2,
        action: { kind: "move", ids: ["api"], delta: { x: 1, y: 0 } },
      },
    });
    // Only the answer: no refusal, no render; the canvas gets the new text's render anyway.
    expect(old).toEqual({ messages: [{ type: "preview", token: 2, svg: null }] });
    // A diagram that cannot be drawn has no preview.
    const broken = open(pair.replace('api["API"]', 'api["API'));
    expect(
      (
        broken.preview({ kind: "move", ids: ["client"], delta: { x: 1, y: 0 } }).messages[0] as {
          svg: string | null;
        }
      ).svg,
    ).toBeNull();
    const sequence = open("diagram s: sequence {\n  a -> b\n}\n");
    expect(
      sequence.preview({ kind: "move", ids: ["a"], delta: { x: 200, y: 0 } }).messages,
    ).toEqual([{ type: "preview", token: 1, svg: null }]);
  });

  it("previews a move in a C4 view, and none between its boundaries", () => {
    const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
    const canvas = open(commerce);
    canvas.session.receive({ type: "pickDiagram", diagram: "containers" });
    const before = render(canvas.session.state());
    const moved = canvas.preview({ kind: "move", ids: ["shop.api"], delta: { x: 28, y: 0 } });
    const svg = (moved.messages[0] as HostMessage & { type: "preview" }).svg;
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toBe(before.svg);
    const boundary = before.elements.find((e) => e.kind === "group")!;
    const outside = before.elements.find((e) => e.kind !== "group" && e.parent === null)!;
    const across = canvas.preview({
      kind: "move",
      ids: [outside.id],
      delta: { x: 0, y: 0 },
      parent: boundary.id,
    });
    expect((across.messages[0] as { svg: string | null }).svg).toBeNull();
  });
});
