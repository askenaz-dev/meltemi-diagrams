import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  completions,
  hover,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";

const SHEET = [
  'language "0.2"',
  "",
  "diagram checkout: flow {",
  "  layout manual",
  "  node api",
  "  node db",
  "  api -> db as save",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "  }",
  "}",
  "",
].join("\n");

function open(text: string, diagram: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let messages = session.update(analyzeDocument({ text: current, revision: rev }));
  const send = (message: unknown) => {
    const result = session.receive(message);
    if (result.plan) {
      current = applyTextEdits(current, result.plan.edits);
      rev++;
      messages = session.update(analyzeDocument({ text: current, revision: rev }));
    } else if (result.messages.length > 0) {
      messages = [...result.messages];
    }
    return result;
  };
  send({ type: "pickDiagram", diagram });
  return {
    send,
    text: () => current,
    apply: (action: CanvasAction) => {
      const result = send({ type: "action", revision: rev, action });
      if (!result.plan) throw new Error(JSON.stringify(result.messages));
      return current;
    },
    render: () => messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!,
    inspector: () =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const field = (canvas: ReturnType<typeof open>, name: string) =>
  canvas.inspector().fields.find((f) => f.name === name);

describe("effects in the inspector", () => {
  it("turns an effect on, edits it and turns it off", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field(canvas, "effect.flow")).toMatchObject({
      value: null,
      placeholder: "off",
      options: ["off", "on"],
    });
    expect(field(canvas, "effect.flow.duration")).toBeUndefined();
    canvas.apply({ kind: "setField", ids: ["save"], field: "effect.flow", value: "on" });
    expect(canvas.text()).toContain("  animate save { effect flow }\n");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field(canvas, "effect.flow.duration")).toMatchObject({
      value: null,
      placeholder: "1200",
    });
    expect(field(canvas, "effect.flow.particles")).toBeDefined();
    canvas.apply({ kind: "setField", ids: ["save"], field: "effect.flow.duration", value: 2000 });
    expect(canvas.text()).toContain("animate save { effect flow; duration 2000ms }");
    canvas.apply({ kind: "setField", ids: ["save"], field: "effect.flow.repeat", value: "3" });
    expect(canvas.text()).toContain("repeat 3");
    canvas.apply({ kind: "setField", ids: ["save"], field: "effect.flow", value: "off" });
    expect(canvas.text()).not.toContain("animate");
  });

  it("traces a relation with the default speed greyed and offers direction and colour", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field(canvas, "effect.trace")).toMatchObject({ label: "Trace", value: null });
    canvas.apply({ kind: "setField", ids: ["save"], field: "effect.trace", value: "on" });
    expect(canvas.text()).toContain("  animate save { effect trace }\n");
    canvas.send({ type: "select", ids: ["save"] });
    expect(field(canvas, "effect.trace.duration")).toMatchObject({
      value: null,
      placeholder: "1500",
    });
    expect(field(canvas, "effect.trace.direction")).toBeDefined();
    expect(field(canvas, "effect.trace.color")).toBeDefined();
    expect(field(canvas, "effect.trace.particles")).toBeUndefined();
    canvas.apply({
      kind: "setField",
      ids: ["save"],
      field: "effect.trace.direction",
      value: "reverse",
    });
    expect(canvas.text()).toContain("animate save { effect trace; direction reverse }");
  });

  it("offers boxes a pulse and a dash, but no flow", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "select", ids: ["db"] });
    const names = canvas
      .inspector()
      .fields.filter((f) => f.name.startsWith("effect."))
      .map((f) => f.name);
    // The strip lists effects in one order for every target.
    expect(names).toEqual(["effect.dash", "effect.pulse"]);
    canvas.apply({ kind: "setField", ids: ["db"], field: "effect.pulse", value: "on" });
    canvas.send({ type: "select", ids: ["db"] });
    expect(field(canvas, "effect.pulse.color")).toBeDefined();
    expect(field(canvas, "effect.pulse.direction")).toBeUndefined();
  });
});

describe("playing effects on the canvas", () => {
  it("shows the animated profile while playing", () => {
    const canvas = open(
      SHEET.replace("  placement {", "  animate save { effect flow }\n  placement {"),
      "checkout",
    );
    expect(canvas.render()).toMatchObject({ effects: 1, playing: false });
    expect(canvas.render().svg).not.toContain("@keyframes");
    canvas.send({ type: "playEffects", on: true });
    expect(canvas.render().playing).toBe(true);
    expect(canvas.render().svg).toContain("@keyframes mdg-flow");
    canvas.send({ type: "playEffects", on: false });
    expect(canvas.render().svg).not.toContain("@keyframes");
  });

  it("has nothing to play without effects", () => {
    const canvas = open(SHEET, "checkout");
    canvas.send({ type: "playEffects", on: true });
    expect(canvas.render()).toMatchObject({ effects: 0, playing: false });
  });
});

describe("language services for effects", () => {
  const complete = (marked: string) => {
    const offset = marked.indexOf("|");
    const text = marked.replace("|", "");
    return completions(analyzeDocument({ text }), offset).map((i) => i.label);
  };

  it("offers the properties of the block's effect", () => {
    const flow = complete(
      SHEET.replace("  placement {", "  animate save { effect flow; | }\n  placement {"),
    );
    expect(flow).toEqual([
      "effect",
      "duration",
      "repeat",
      "delay",
      "direction",
      "particles",
      "color",
    ]);
    const pulse = complete(
      SHEET.replace("  placement {", "  animate db { effect pulse; | }\n  placement {"),
    );
    expect(pulse).toEqual(["effect", "duration", "repeat", "delay", "color"]);
    const trace = complete(
      SHEET.replace("  placement {", "  animate save { effect trace; | }\n  placement {"),
    );
    expect(trace).toEqual(["effect", "duration", "repeat", "delay", "direction", "color"]);
    expect(
      complete(SHEET.replace("  placement {", "  animate save { effect | }\n  placement {")),
    ).toEqual(["flow", "pulse", "dash", "trace"]);
    expect(
      complete(
        SHEET.replace(
          "  placement {",
          "  animate save { effect flow; direction | }\n  placement {",
        ),
      ),
    ).toEqual(["forward", "reverse"]);
  });

  it("documents the properties", () => {
    const text = SHEET.replace(
      "  placement {",
      "  animate save { effect flow; particles 2 }\n  placement {",
    );
    const analysis = analyzeDocument({ text });
    expect(hover(analysis, text.indexOf("particles") + 2)!.markdown).toMatch(/1 to 8/);
  });
});

const ANONYMOUS = [
  'language "0.2"',
  "",
  "diagram checkout: flow {",
  "  layout manual",
  "  node api",
  "  node db",
  "  api -> db",
  "  api -> db",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "  }",
  "}",
  "",
].join("\n");

describe("anonymous relations", () => {
  it("are named when styled, in the same edit, and the status line says so", () => {
    const canvas = open(ANONYMOUS, "checkout");
    const result = canvas.send({
      type: "action",
      revision: 1,
      action: { kind: "setField", ids: ["api->db#1"], field: "style.stroke", value: "danger" },
    });
    expect(result.plan).toBeDefined();
    expect(result.messages).toContainEqual({
      type: "status",
      message: "Named the relation `api_db`.",
    });
    expect(canvas.text()).toContain("  api -> db as api_db\n  api -> db\n");
    expect(canvas.text()).toContain("style api_db { stroke danger }");
  });

  it("give two relations of the same pair distinct ids when styled together", () => {
    const canvas = open(ANONYMOUS, "checkout");
    canvas.apply({
      kind: "setField",
      ids: ["api->db#1", "api->db#2"],
      field: "style.width",
      value: 2,
    });
    expect(canvas.text()).toContain("  api -> db as api_db\n  api -> db as api_db_2\n");
    expect(canvas.text()).toMatch(/style api_db \{ width 2 \}/);
    expect(canvas.text()).toMatch(/style api_db_2 \{ width 2 \}/);
  });

  it("are named when an effect is turned on, not when it is turned off", () => {
    const canvas = open(ANONYMOUS, "checkout");
    const before = canvas.text();
    canvas.send({
      type: "action",
      revision: 1,
      action: { kind: "setField", ids: ["api->db#2"], field: "effect.dash", value: "off" },
    });
    expect(canvas.text()).toBe(before);
    expect(
      canvas.send({
        type: "action",
        revision: 1,
        action: { kind: "setField", ids: ["api->db#2"], field: "effect.dash", value: "off" },
      }).messages,
    ).not.toContainEqual(expect.objectContaining({ type: "rejected" }));
    canvas.apply({ kind: "setField", ids: ["api->db#2"], field: "effect.dash", value: "on" });
    expect(canvas.text()).toContain("  api -> db\n  api -> db as api_db\n");
    expect(canvas.text()).toContain("animate api_db { effect dash }");
  });

  it("take classes in their own block, without a name", () => {
    const canvas = open(ANONYMOUS, "checkout");
    canvas.send({ type: "select", ids: ["api->db#1"] });
    expect(field(canvas, "classes")).toMatchObject({ type: "classes", value: null });
    canvas.apply({ kind: "setField", ids: ["api->db#1"], field: "classes", value: "proposed" });
    expect(canvas.text()).toContain("  api -> db { class proposed }\n  api -> db\n");
  });
});
