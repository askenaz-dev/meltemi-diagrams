import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { commandFor } from "../src/canvas/keyboard.js";
import {
  analyzeDocument,
  CanvasSession,
  codeActions,
  completions,
  definition,
  hover,
  selectionAt,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";

const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

/** A session on a text, with helpers that apply actions and field edits. */
function open(text: string) {
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
  const apply = (action: CanvasAction): string => {
    const result = send({ type: "action", revision: rev, action });
    if (!result.plan) throw new Error(JSON.stringify(result.messages));
    return current;
  };
  return {
    session,
    send,
    apply,
    act: (action: CanvasAction) => session.receive({ type: "action", revision: rev, action }),
    text: () => current,
    messages: () => messages,
    render: () => messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")!,
    inspector: () =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const lines = (text: string, pattern: RegExp) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => pattern.test(l));

const key = (k: string, mods: { alt?: boolean; shift?: boolean } = {}) => ({
  key: k,
  code: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("sequence canvas", () => {
  it("renders participants, messages, events and scenarios", () => {
    const canvas = open(payment);
    const render = canvas.render();
    expect(render.profile).toBe("sequence");
    expect(render.elements.map((e) => [e.id, e.kind])).toEqual([
      ["customer", "actor"],
      ["api", "participant"],
      ["bank", "participant"],
    ]);
    expect(render.events.map((e) => e.key)).toEqual([
      "pay",
      "activate#1",
      "authorize",
      "result",
      "approved",
      "success",
      "declined",
      "retry",
      "deactivate#1",
    ]);
    const result = render.events.find((e) => e.key === "result")!;
    expect(result.box).not.toBeNull();
    expect(render.events.find((e) => e.key === "approved")!.parent).toBe("result");
    expect(render.scenarios).toEqual([
      { id: "approved", label: "Pago aprobado" },
      { id: "rejected", label: "Pago rechazado" },
    ]);
    expect(render.scenario).toBeNull();
  });

  it("gives a participant beside an actor its drawn box, shape and radius", () => {
    const render = open(payment).render();
    const customer = render.elements.find((e) => e.id === "customer")!;
    const api = render.elements.find((e) => e.id === "api")!;
    // The actor's figure and label fill the head row; the box is drawn at its bottom.
    expect(api.box.height).toBe(40);
    expect(api.box.y).toBe(customer.box.y + customer.box.height - 40);
    // The payment sheet uses `editorial.light`, whose boxes are rounded by 6.
    expect(api).toMatchObject({ shape: "rounded", radius: 6 });
    expect(customer.radius).toBeUndefined();
  });

  it("drags a participant to reorder it, leaving the messages", () => {
    const canvas = open(payment);
    const [customer, , bank] = canvas.render().elements;
    const delta = { x: customer!.box.x - (bank!.box.x + bank!.box.width / 2) - 10, y: 6 };
    const after = canvas.apply({ kind: "move", ids: ["bank"], delta });
    expect(compile(after).document.diagrams[0]!.elements.map((e) => e.id)).toEqual([
      "bank",
      "customer",
      "api",
    ]);
    expect(lines(after, /->/)).toEqual(lines(payment, /->/));
  });

  it("drags a head sideways to write the gap before it, says it, and back to remove it", () => {
    const canvas = open(payment);
    const status = () =>
      canvas.messages().find((m): m is HostMessage & { type: "status" } => m.type === "status")
        ?.message;
    const after = canvas.apply({ kind: "move", ids: ["bank"], delta: { x: 24, y: 2 } });
    expect(after).toContain("gap bank 24");
    expect(status()).toBe("Gap before bank: 24.");
    expect(lines(after, /^(actor|participant|queue|database) /)).toEqual(
      lines(payment, /^(actor|participant|queue|database) /),
    );
    const back = canvas.apply({ kind: "move", ids: ["bank"], delta: { x: -24, y: 0 } });
    expect(back).not.toContain("gap bank");
  });

  it("writes nothing when the first head is dragged left", () => {
    const canvas = open(payment);
    const result = canvas.act({ kind: "move", ids: ["customer"], delta: { x: -30, y: 0 } });
    expect(result.plan?.edits ?? []).toEqual([]);
  });

  it("says what the layout drew when a drag asks for less room than the labels need", () => {
    const canvas = open(
      'diagram s: sequence {\n  participant a "A"\n  participant b "B"\n  a -> b: "A rather long message label"\n}\n',
    );
    const after = canvas.apply({ kind: "move", ids: ["b"], delta: { x: -60, y: 0 } });
    expect(after).toContain("gap b -60");
    const status = canvas
      .messages()
      .find((m): m is HostMessage & { type: "status" } => m.type === "status")?.message;
    expect(status).toMatch(/^Gap before b: -60 written, -?\d+ drawn: the labels need the room\.$/);
  });

  it("drags a message down to write its space, clamped at 0", () => {
    const canvas = open(payment);
    const down = canvas.apply({ kind: "move", ids: ["authorize"], delta: { x: 3, y: 28 } });
    expect(down).toContain("space authorize 28");
    const up = canvas.apply({ kind: "move", ids: ["authorize"], delta: { x: 0, y: -100 } });
    expect(up).not.toContain("space authorize");
  });

  it("moves events with Alt+Up and Alt+Down", () => {
    expect(commandFor(key("ArrowUp", { alt: true }), false, "sequence")).toBe("moveEventUp");
    expect(commandFor(key("ArrowDown", { alt: true }), false, "sequence")).toBe("moveEventDown");
    expect(commandFor(key("ArrowDown", { alt: true }), false, "flow")).toBeUndefined();
    const canvas = open(payment);
    const after = canvas.apply({ kind: "moveEvent", id: "authorize", direction: "down" });
    expect(after).toContain(
      '  alt result "Aprobado" {\n    api -> bank: "Autorizar" as authorize\n',
    );
    expect(canvas.session.selected).toEqual(["authorize"]);
  });

  it("toggles an activation with Alt+A", () => {
    expect(commandFor(key("a", { alt: true }), false, "sequence")).toBe("toggleActivation");
    const text = "diagram s: sequence {\n  a -> b as ask\n  b --> a as reply\n}\n";
    const canvas = open(text);
    const on = canvas.apply({ kind: "toggleActivation", ids: ["ask"] });
    expect(on).toBe(
      "diagram s: sequence {\n  a -> b as ask\n  activate b\n  b --> a as reply\n  deactivate b\n}\n",
    );
    expect(canvas.apply({ kind: "toggleActivation", ids: ["ask"] })).toBe(text);
  });

  it("nests with Alt+N, returns with Alt+R and unnests with Alt+Shift+N", () => {
    expect(commandFor(key("n", { alt: true }), false, "sequence")).toBe("nestInCall");
    expect(commandFor(key("N", { alt: true, shift: true }), false, "sequence")).toBe("unnestCall");
    expect(commandFor(key("r", { alt: true }), false, "sequence")).toBe("addReturn");
    const text =
      'diagram s: sequence {\n  customer -> api: "Pay" as pay\n  api -> bank: "Authorize" as authorize\n  api --> customer: "Receipt" as receipt\n}\n';
    const canvas = open(text);
    const nested = canvas.apply({ kind: "nestInCall", ids: ["authorize", "receipt"] });
    expect(nested).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize" as authorize\n    api --> customer: "Receipt" as receipt\n  }\n}\n',
    );
    // The call is selected: Alt+R answers it at the end of its block.
    expect(canvas.session.selected).toEqual(["pay"]);
    const events = canvas.render().events;
    expect(events.find((e) => e.key === "authorize")?.parent).toBe("pay");
    const answered = canvas.apply({ kind: "addReturn", ids: canvas.session.selected });
    expect(answered).toContain('    api --> customer: "Receipt" as receipt\n    return\n  }\n');
    const ret = canvas.render().relations.find((r) => r.returns === "pay");
    expect(ret?.from).toBe("api");
    expect(canvas.apply({ kind: "unnestCall", ids: ["authorize"] })).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay" as pay\n  api -> bank: "Authorize" as authorize\n  api --> customer: "Receipt" as receipt\n  api --> customer\n}\n',
    );
  });

  it("refuses to nest without a call before the selection, and to unnest without one", () => {
    const canvas = open(payment);
    const first = canvas.render().events[0]!.key;
    const nest = canvas.act({ kind: "nestInCall", ids: [first] });
    expect(nest.plan).toBeUndefined();
    expect(nest.messages).toEqual([
      {
        type: "rejected",
        code: "edit.invalid-value",
        reason: "Select the events right after the call they belong to.",
      },
    ]);
    const unnest = canvas.act({ kind: "unnestCall", ids: [] });
    expect(unnest.messages[0]).toMatchObject({ reason: "Select a call, or an event inside one." });
  });

  it("creates participants where they are dropped, notes, dividers and fragments", () => {
    expect(commandFor(key("p"), false, "sequence")).toBe("createParticipant");
    expect(commandFor(key("f"), false, "sequence")).toBe("createFragment");
    const canvas = open(payment);
    const api = canvas.render().elements.find((e) => e.id === "api")!;
    const created = canvas.apply({
      kind: "create",
      elementKind: "queue",
      at: { x: api.box.x - 1, y: 40 },
    });
    expect(created).toContain(
      '  actor customer "Cliente"\n  queue queue1 "Queue"\n  participant api "API"',
    );
    const note = canvas.apply({ kind: "insertEvent", eventKind: "note", ids: ["pay"] });
    expect(note).toContain('as pay\n  note note1 over customer, api "Note"\n  activate api');
    expect(canvas.session.selected).toEqual(["note1"]);
    const divider = canvas.apply({ kind: "insertEvent", eventKind: "divider", ids: [] });
    expect(divider).toContain('  divider "Divider"\n\n  scenario approved');
    const wrapped = canvas.apply({ kind: "wrap", ids: ["declined", "retry"], operator: "loop" });
    expect(wrapped).toContain(
      '} else "Rechazado" {\n    loop loop1 "Condition" {\n      bank --> api: "Rechazo" as declined',
    );
  });

  it("removes events and edits their text from the canvas", () => {
    const canvas = open(payment);
    expect(canvas.apply({ kind: "setLabel", id: "result", label: "OK" })).toContain(
      'alt result "OK" {',
    );
    expect(canvas.text()).toContain('choose result "OK"');
    const removed = canvas.apply({
      kind: "remove",
      ids: ["activate#1", "deactivate#1"],
      cascade: true,
    });
    expect(removed).not.toContain("activate");
  });

  it("refuses flow geometry with a reason", () => {
    const canvas = open(payment);
    const result = canvas.act({
      kind: "resize",
      id: "api",
      box: { x: 0, y: 0, width: 200, height: 80 },
    });
    expect(result.messages[0]).toMatchObject({ type: "rejected", code: "edit.invalid-value" });
  });

  it("previews a scenario read-only until every event is shown again", () => {
    const canvas = open(payment);
    canvas.send({ type: "pickScenario", scenario: "approved" });
    const preview = canvas.render();
    expect(preview.scenario).toBe("approved");
    expect(preview.events).toEqual([]);
    expect(preview.svg).toContain("Pago aprobado");
    expect(preview.svg).not.toContain("Rechazo");
    expect(canvas.session.previewed).toBe("approved");
    const refused = canvas.act({ kind: "move", ids: ["authorize"], delta: { x: 0, y: 20 } });
    expect(refused.plan).toBeUndefined();
    expect(refused.messages[0]).toMatchObject({ type: "rejected" });
    canvas.send({ type: "pickScenario", scenario: null });
    expect(canvas.render().scenario).toBeNull();
    expect(canvas.apply({ kind: "move", ids: ["authorize"], delta: { x: 0, y: 14 } })).toContain(
      "space authorize 14",
    );
  });
});

describe("sequence inspector", () => {
  const field = (
    model: { fields: readonly { name: string; value: unknown; options?: readonly string[] }[] },
    name: string,
  ) => model.fields.find((f) => f.name === name);

  it("shows and writes message kinds and space", () => {
    const canvas = open(payment);
    canvas.send({ type: "select", ids: ["authorize"] });
    const model = canvas.inspector();
    expect(model.title).toBe("message authorize");
    expect(field(model, "message")).toMatchObject({
      value: "call",
      options: ["call", "reply", "async"],
    });
    expect(field(model, "fromPort")).toBeUndefined();
    expect(field(model, "style.routing")).toBeUndefined();
    const set = (name: string, value: string | number | null) =>
      canvas.apply({ kind: "setField", ids: ["authorize"], field: name, value });
    expect(set("message", "async")).toContain("as authorize { kind async }");
    expect(set("message", "reply")).toContain('api --> bank: "Autorizar" as authorize\n');
    expect(set("space", 20)).toContain("space authorize 20");
  });

  it("shows a return read-only, and writes its space", () => {
    const text = 'diagram s: sequence {\n  a -> b as call {\n    return "OK"\n  }\n}\n';
    const canvas = open(text);
    const key = canvas.render().relations.find((r) => r.returns === "call")!.key;
    canvas.send({ type: "select", ids: [key] });
    const model = canvas.inspector();
    expect(field(model, "message")).toMatchObject({
      value: "return",
      options: ["return"],
      readonly: true,
    });
    expect(field(model, "from")).toMatchObject({ value: "b", readonly: true });
    expect(field(model, "to")).toMatchObject({ value: "a", readonly: true });
    const spaced = canvas.apply({ kind: "setField", ids: [key], field: "space", value: 12 });
    expect(spaced).toMatch(/return "OK" as (\w+)\n[\s\S]*space \1 12\n/);
  });

  it("shows fragments with their conditions and notes with their placement", () => {
    const canvas = open(payment);
    canvas.send({ type: "select", ids: ["result"] });
    const model = canvas.inspector();
    expect(model.target.kind).toBe("event");
    expect(field(model, "operator")!.value).toBe("alt");
    expect(field(model, "condition.0")!.value).toBe("Aprobado");
    expect(field(model, "condition.1")!.value).toBe("Rechazado");
    const changed = canvas.apply({
      kind: "setField",
      ids: ["result"],
      field: "condition.1",
      value: "Denegado",
    });
    expect(changed).toContain('} else "Denegado" {');
    expect(changed).toContain('choose result "Denegado"');

    const noted = open('diagram s: sequence {\n  a -> b\n  note n over a "N"\n}\n');
    noted.send({ type: "select", ids: ["n"] });
    expect(field(noted.inspector(), "position")!.value).toBe("over");
    expect(
      noted.apply({ kind: "setField", ids: ["n"], field: "position", value: "right" }),
    ).toContain('note n right of a "N"');
    expect(noted.apply({ kind: "setField", ids: ["n"], field: "text", value: "Hi" })).toContain(
      'note n right of a "Hi"',
    );
    expect(noted.apply({ kind: "setField", ids: ["n"], field: "id", value: "hint" })).toContain(
      'note hint right of a "Hi"',
    );
    expect(noted.session.selected).toEqual(["hint"]);
  });

  it("shows participants with their kind and gap, and the diagram with autonumber", () => {
    const canvas = open(payment);
    canvas.send({ type: "select", ids: ["bank"] });
    const model = canvas.inspector();
    expect(field(model, "kind")!.options).toContain("queue");
    expect(field(model, "x")).toBeUndefined();
    expect(canvas.apply({ kind: "setField", ids: ["bank"], field: "gap", value: 40 })).toContain(
      "gap bank 40",
    );
    expect(
      canvas.apply({ kind: "setField", ids: ["bank"], field: "kind", value: "database" }),
    ).toContain('database bank "Banco"');
    // The gap after, and a negative gap between two participants; not outside the edge.
    expect(
      canvas.apply({ kind: "setField", ids: ["bank"], field: "gapAfter", value: 12 }),
    ).toContain("gap bank 12 after");
    expect(canvas.apply({ kind: "setField", ids: ["bank"], field: "gap", value: -10 })).toContain(
      "gap bank -10",
    );
    const refused = canvas.act({ kind: "setField", ids: ["customer"], field: "gap", value: -10 });
    expect(refused.plan).toBeUndefined();
    canvas.send({ type: "select", ids: [] });
    expect(field(canvas.inspector(), "direction")).toBeUndefined();
    expect(canvas.apply({ kind: "setField", ids: [], field: "autonumber", value: 1 })).toContain(
      '  theme "editorial.light"\n  autonumber 1\n',
    );
    expect(field(canvas.inspector(), "spacing")).toMatchObject({ placeholder: "40" });
    expect(canvas.apply({ kind: "setField", ids: [], field: "spacing", value: 56 })).toContain(
      "spacing 56",
    );
  });
});

describe("sequence language services", () => {
  const at = (text: string, marker = "|") => {
    const offset = text.indexOf(marker);
    return { text: text.replace(marker, ""), offset };
  };
  const labels = (text: string) => {
    const { text: t, offset } = at(text);
    return completions(analyzeDocument({ text: t }), offset).map((i) => i.label);
  };

  it("completes the vocabulary, participants, fragments and branches", () => {
    const body = payment.replace("  deactivate api\n", "  deactivate api\n  |\n");
    const items = labels(body);
    expect(items).toEqual(
      expect.arrayContaining([
        "queue",
        "activate",
        "alt",
        "divider",
        "autonumber",
        "scenario",
        "bank",
      ]),
    );
    expect(items).not.toContain("node");
    expect(labels(payment.replace("  deactivate api\n", "  activate |\n"))).toEqual([
      "customer",
      "api",
      "bank",
    ]);
    expect(labels(payment.replace("  deactivate api\n", "  note |\n"))).toEqual([
      "over",
      "left",
      "right",
    ]);
    expect(labels(payment.replace("  deactivate api\n", "  note left |\n"))).toEqual(["of"]);
    expect(labels(payment.replace('choose result "Aprobado"', "choose |"))).toEqual(["result"]);
    expect(labels(payment.replace('choose result "Aprobado"', 'choose result "|'))).toEqual([
      "Aprobado",
      "Rechazado",
    ]);
    expect(labels(payment.replace("as pay\n", "as pay { kind | }\n"))).toEqual(["sync", "async"]);
    const inside = labels(payment.replace('    bank --> api: "OK" as approved\n', "    |\n"));
    expect(inside).toContain("activate");
    expect(inside).not.toContain("participant");
  });

  it("completes calls, returns, sides and spacing", () => {
    const calls =
      'diagram s: sequence {\n  participant a\n  participant b\n  a -> b: "Pay" as pay {\n    |\n  }\n}\n';
    const inCall = labels(calls);
    expect(inCall).toEqual(expect.arrayContaining(["kind", "return", "activate", "note", "a"]));
    expect(inCall).not.toContain("participant");
    expect(labels(calls.replace("    |\n", "    b -> |\n"))).toEqual(["a", "b"]);
    // A return's block holds message properties only.
    const returned = labels(calls.replace("    |\n", '    return "OK" { | }\n'));
    expect(returned).toContain("kind");
    expect(returned).not.toContain("return");
    // The diagram's body: `spacing`, and no `return` outside a call.
    const body = labels(calls.replace("    |\n", "  }\n  |\n  {\n"));
    expect(body).toContain("spacing");
    expect(body).not.toContain("return");
    const placed = (statement: string) =>
      labels(calls.replace("    |\n", "  }\n  placement {\n    " + statement + "\n  }\n  {\n"));
    expect(placed("gap b -12 |")).toEqual(["before", "after"]);
    expect(placed("space pay 24 |")).toEqual(["before", "after"]);
  });

  it("hovers a return, its keyword and a nested event", () => {
    const text =
      'diagram s: sequence {\n  a -> b: "Pay" as pay {\n    note n over b "N"\n    return "OK" as ok\n  }\n}\n';
    const analysis = analyzeDocument({ text });
    const ret = text.indexOf("return");
    expect(hover(analysis, text.indexOf("ok\n") + 1)!.markdown).toContain("returns from `pay`");
    expect(hover(analysis, ret + 1)!.markdown).toContain("answers the call");
    expect(hover(analysis, text.indexOf("note n") + 1)!.markdown).toContain("in the call `pay`");
  });

  it("hovers events, goes from scenarios to fragments and selects events", () => {
    const analysis = analyzeDocument({ text: payment });
    const choose = payment.indexOf("choose result") + "choose ".length + 1;
    expect(hover(analysis, choose)!.markdown).toMatch(/^\*\*alt\*\* fragment `result`/);
    expect(hover(analysis, payment.indexOf("activate api") + 1)!.markdown).toBe(
      "**activate** `api`",
    );
    const target = definition(analysis, choose)!;
    expect(target.start.offset).toBe(payment.indexOf("result"));
    expect(selectionAt(analysis, payment.indexOf("deactivate api") + 2)).toMatchObject({
      id: "deactivate#1",
      kind: "event",
    });
    expect(selectionAt(analysis, payment.indexOf("deactivate api") + 12)).toMatchObject({
      id: "api",
      kind: "element",
    });
    const noted = 'diagram s: sequence {\n  a -> b\n  note over a "N"\n}\n';
    expect(selectionAt(analyzeDocument({ text: noted }), noted.indexOf('"N"'))).toMatchObject({
      id: "note#1",
      kind: "event",
    });
  });

  it("fixes a stray deactivate and an unknown participant", () => {
    const text = "diagram s: sequence {\n  a -> b\n  deactivate b\n  activate ghost\n}\n";
    const analysis = analyzeDocument({ text });
    const stray = analysis.diagnostics.find((d) => d.code === "sequence.activation")!;
    const removal = codeActions(
      analysis,
      { start: stray.range.start.offset, end: stray.range.start.offset },
      [stray],
    );
    expect(removal.map((a) => a.title)).toEqual([
      "Remove this `deactivate`",
      "Add `activate b` before it",
    ]);
    expect(applyTextEdits(text, removal[0]!.edits)).not.toContain("deactivate");
    const unknown = analysis.diagnostics.find((d) => d.code === "ref.unknown-element")!;
    const declare = codeActions(
      analysis,
      { start: unknown.range.start.offset, end: unknown.range.start.offset },
      [unknown],
    );
    expect(declare[0]!.title).toBe("Declare `ghost` as a participant");
    expect(applyTextEdits(text, declare[0]!.edits)).toContain('participant ghost "ghost"');
  });
});

describe("effects on what an imported sequence diagram leaves anonymous", () => {
  const imported = readFileSync(
    join(CORPUS_ROOT, "import", "mermaid", "sequence-payment.meltemi"),
    "utf8",
  );

  it("names a message for a trace, in one edit, and says so", () => {
    const canvas = open(imported);
    canvas.send({ type: "pickDiagram", diagram: "card_payment" });
    canvas.send({ type: "select", ids: ["Customer->Web#1"] });
    const names = canvas.inspector().fields.map((f) => f.name);
    expect(names).toContain("effect.trace");
    expect(names).toContain("effect.flow");
    const trace: CanvasAction = {
      kind: "setField",
      ids: ["Customer->Web#1"],
      field: "effect.trace",
      value: "on",
    };
    expect(canvas.act(trace).messages).toContainEqual({
      type: "status",
      message: "Named `Customer_Web`.",
    });
    const text = canvas.apply(trace);
    expect(text).toContain('  Customer -> Web: "Pay" as Customer_Web\n');
    expect(text).toContain("  animate Customer_Web { effect trace }\n");
    expect(canvas.inspector().target.ids).toEqual(["Customer_Web"]);
  });

  it("names a note for a pulse, and names nothing to turn an effect off", () => {
    const canvas = open(imported);
    canvas.send({ type: "pickDiagram", diagram: "card_payment" });
    canvas.send({ type: "select", ids: ["note#1"] });
    expect(canvas.inspector().fields.map((f) => f.name)).toContain("effect.pulse");
    const text = canvas.apply({
      kind: "setField",
      ids: ["note#1"],
      field: "effect.pulse",
      value: "on",
    });
    expect(text).toContain('  note note1 over Web, Api "The page never sees the card number"\n');
    expect(text).toContain("  animate note1 { effect pulse }\n");
    const off = canvas.act({
      kind: "setField",
      ids: ["Web->Api#1"],
      field: "effect.flow",
      value: "off",
    });
    expect(off.plan).toBeUndefined();
    expect(off.messages.some((m) => m.type === "rejected")).toBe(false);
  });

  it("names a note for a fill instead of refusing it, and keeps it selected", () => {
    const canvas = open(imported);
    canvas.send({ type: "pickDiagram", diagram: "card_payment" });
    canvas.send({ type: "select", ids: ["note#1"] });
    const fill: CanvasAction = {
      kind: "setField",
      ids: ["note#1"],
      field: "style.fill",
      value: "accent",
    };
    expect(canvas.act(fill).messages).toContainEqual({
      type: "status",
      message: "Named `note1`.",
    });
    const text = canvas.apply(fill);
    expect(text).toContain('  note note1 over Web, Api "The page never sees the card number"\n');
    expect(text).toContain("style note1 { fill accent }");
    expect(canvas.inspector().target.ids).toEqual(["note1"]);
  });
});
