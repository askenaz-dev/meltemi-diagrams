import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { planEdit, type EditOperation } from "../src/index.js";

function run(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(result.rejection.reason);
  const after = applyTextEdits(text, result.plan.edits);
  expect(applyTextEdits(after, result.plan.inverse)).toBe(text);
  expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return after;
}

function refused(text: string, operation: EditOperation): string {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  return `${result.rejection.code}: ${result.rejection.reason}`;
}

const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");
const statements = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /->/.test(l));

describe("reordering participants", () => {
  it("moves the bank first without touching messages", () => {
    const after = run(payment, {
      kind: "reorderParticipant",
      diagram: "payment",
      participant: "bank",
      index: 0,
    });
    expect(compile(after).document.diagrams[0]!.elements.map((e) => e.id)).toEqual([
      "bank",
      "customer",
      "api",
    ]);
    expect(statements(after)).toEqual(statements(payment));
  });

  it("reorders participant groups and does not count notes as declarations", () => {
    const text =
      'diagram s: sequence {\n  participant a "A"\n  group g "G" {\n    participant b "B"\n  }\n  note over a "N"\n  a -> b\n}\n';
    const after = run(text, {
      kind: "reorderParticipant",
      diagram: "s",
      participant: "g",
      index: 0,
    });
    expect(after).toContain(
      '  group g "G" {\n    participant b "B"\n  }\n  participant a "A"\n  note over a "N"',
    );
    const last = run(text, {
      kind: "reorderParticipant",
      diagram: "s",
      participant: "a",
      index: 5,
    });
    expect(last).toContain('  }\n  participant a "A"\n  note over a "N"');
  });

  it("moves a participant last and declares implicit ones", () => {
    const text =
      'diagram s: sequence {\n  participant a "A"\n  participant b "B"\n  a -> b\n  b -> c\n}\n';
    expect(
      run(text, { kind: "reorderParticipant", diagram: "s", participant: "a", index: 1 }),
    ).toContain('  participant b "B"\n  participant a "A"\n');
    expect(
      run(text, { kind: "reorderParticipant", diagram: "s", participant: "c", index: 0 }),
    ).toContain('  participant c "c"\n  participant a "A"');
  });
});

describe("moving events", () => {
  const text =
    'diagram s: sequence {\n  a -> b as m1\n  b -> c as m2\n  alt check "OK" {\n    c --> b as m3\n  } else "No" {\n    c --> b as m4\n  }\n  b --> a as m5\n}\n';
  const order = (after: string) => {
    const keys: string[] = [];
    const visit = (events: readonly import("@meltemi/diagrams-model").SequenceEvent[]) => {
      for (const e of events) {
        keys.push(e.key);
        if (e.kind === "fragment") for (const b of e.branches) visit(b.events);
      }
    };
    visit(compile(after).document.diagrams[0]!.events);
    return keys;
  };

  it("swaps neighbours", () => {
    expect(
      order(run(text, { kind: "moveEvent", diagram: "s", event: "m2", direction: "up" })),
    ).toEqual(["m2", "m1", "check", "m3", "m4", "m5"]);
  });

  it("moves into and out of fragments", () => {
    const into = run(text, { kind: "moveEvent", diagram: "s", event: "m2", direction: "down" });
    expect(into).toContain('alt check "OK" {\n    b -> c as m2\n    c --> b as m3');
    const intoLast = run(text, { kind: "moveEvent", diagram: "s", event: "m5", direction: "up" });
    expect(intoLast).toContain("    c --> b as m4\n    b --> a as m5\n  }");
    const across = run(text, { kind: "moveEvent", diagram: "s", event: "m3", direction: "down" });
    expect(across).toContain('} else "No" {\n    c --> b as m3\n    c --> b as m4');
    const out = run(text, { kind: "moveEvent", diagram: "s", event: "m3", direction: "up" });
    expect(out).toContain("  b -> c as m2\n  c --> b as m3\n  alt check");
  });

  it("refuses a move that breaks the activation rules", () => {
    const active = "diagram s: sequence {\n  a -> api as m\n  activate api\n  deactivate api\n}\n";
    expect(
      refused(active, { kind: "moveEvent", diagram: "s", event: "deactivate#1", direction: "up" }),
    ).toMatch(/^edit.invalid-value: `api` is not active here/);
  });
});

describe("spacing keeps order", () => {
  it("writes space before a named message, and removes it with 0", () => {
    const after = run(payment, {
      kind: "setSpacing",
      diagram: "payment",
      target: "authorize",
      targetKind: "event",
      amount: 28,
    });
    expect(after).toContain("placement {\n    space authorize 28\n  }");
    expect(statements(after)).toEqual(statements(payment));
    const changed = run(after, {
      kind: "setSpacing",
      diagram: "payment",
      target: "authorize",
      targetKind: "event",
      amount: 40,
    });
    expect(changed).toContain("space authorize 40");
    const removed = run(changed, {
      kind: "setSpacing",
      diagram: "payment",
      target: "authorize",
      targetKind: "event",
      amount: 0,
    });
    expect(removed).not.toContain("space authorize");
  });

  it("names anonymous events first and writes gaps", () => {
    const text = 'diagram s: sequence {\n  a -> b\n  note over a "N"\n}\n';
    const message = run(text, {
      kind: "setSpacing",
      diagram: "s",
      target: "a->b#1",
      targetKind: "event",
      amount: 14,
    });
    expect(message).toContain("  a -> b as a_b\n");
    expect(message).toContain("space a_b 14");
    const note = run(text, {
      kind: "setSpacing",
      diagram: "s",
      target: "note#1",
      targetKind: "event",
      amount: 14,
    });
    expect(note).toContain('  note note over a "N"');
    const gap = run(text, {
      kind: "setSpacing",
      diagram: "s",
      target: "b",
      targetKind: "participant",
      amount: 30,
    });
    expect(gap).toContain("gap b 30");
  });

  const three = "diagram s: sequence {\n  a -> b as m\n  b -> c\n}\n";
  const spacing = (
    target: string,
    targetKind: "event" | "participant",
    amount: number | null,
    side?: "before" | "after",
  ): EditOperation => ({
    kind: "setSpacing",
    diagram: "s",
    target,
    targetKind,
    amount,
    ...(side ? { side } : {}),
  });

  it("writes the side after, and leaves before unwritten", () => {
    const after = run(three, spacing("b", "participant", 20, "after"));
    expect(after).toContain("gap b 20 after");
    const both = run(after, spacing("b", "participant", 10));
    expect(both).toContain("gap b 10\n");
    expect(both).toContain("gap b 20 after");
    const space = run(three, spacing("m", "event", 12, "after"));
    expect(space).toContain("space m 12 after");
    // Each side changes and goes on its own.
    const changed = run(both, spacing("b", "participant", 35, "after"));
    expect(changed).toContain("gap b 35 after");
    expect(changed).toContain("gap b 10\n");
    const removed = run(changed, spacing("b", "participant", 0, "after"));
    expect(removed).not.toContain("after");
    expect(removed).toContain("gap b 10");
  });

  it("writes a negative gap between two participants, rounded", () => {
    expect(run(three, spacing("b", "participant", -12.4))).toContain("gap b -12");
    expect(run(three, spacing("a", "participant", -8, "after"))).toContain("gap a -8 after");
  });

  it("refuses a negative space, and a negative gap on the outer side of the edge", () => {
    expect(refused(three, spacing("m", "event", -5))).toBe(
      "edit.invalid-value: Space is 0 or more.",
    );
    expect(refused(three, spacing("a", "participant", -5))).toMatch(
      /^edit.invalid-value: There is nothing beyond `a` to bring closer/,
    );
    expect(refused(three, spacing("c", "participant", -5, "after"))).toMatch(
      /^edit.invalid-value: There is nothing beyond `c`/,
    );
  });
});

describe("inserting events and fragments", () => {
  it("wraps consecutive events in an option", () => {
    const after = run(payment, {
      kind: "wrapInFragment",
      diagram: "payment",
      events: ["approved", "success"],
      operator: "opt",
      condition: "Con cupón",
    });
    expect(after).toContain(
      '  alt result "Aprobado" {\n    opt "Con cupón" {\n      bank --> api: "OK" as approved\n      api --> customer: "Confirmación" as success\n    }\n  } else',
    );
  });

  it("refuses events that are not consecutive", () => {
    expect(
      refused(payment, {
        kind: "wrapInFragment",
        diagram: "payment",
        events: ["pay", "authorize"],
        operator: "loop",
      }),
    ).toMatch(/consecutive/);
  });

  it("unwraps a fragment with one branch and refuses one with more", () => {
    const text = 'diagram s: sequence {\n  loop "Poll" {\n    a -> b\n    b --> a\n  }\n}\n';
    expect(run(text, { kind: "unwrapFragment", diagram: "s", fragment: "loop#1" })).toBe(
      "diagram s: sequence {\n  a -> b\n  b --> a\n}\n",
    );
    expect(
      refused(payment, { kind: "unwrapFragment", diagram: "payment", fragment: "result" }),
    ).toMatch(/other branches/);
  });

  it("adds branches and changes conditions", () => {
    const added = run(payment, {
      kind: "addBranch",
      diagram: "payment",
      fragment: "result",
      condition: "Pendiente",
    });
    expect(added).toContain('} else "Pendiente" {\n  }');
    const changed = run(payment, {
      kind: "setFragmentCondition",
      diagram: "payment",
      fragment: "result",
      branch: 1,
      condition: "Denegado",
    });
    expect(changed).toContain('} else "Denegado" {');
  });

  it("inserts events after an event, in a branch, and at the end", () => {
    const after = run(payment, {
      kind: "insertEvent",
      diagram: "payment",
      after: "authorize",
      statement: 'note over api, bank "Timeout 3 s"',
    });
    expect(after).toContain(
      '  api -> bank: "Autorizar" as authorize\n  note over api, bank "Timeout 3 s"\n',
    );
    const inside = run(payment, {
      kind: "insertEvent",
      diagram: "payment",
      inside: { fragment: "result", branch: 1 },
      statement: "activate bank",
    });
    expect(inside).toContain('} else "Rechazado" {\n    activate bank\n');
    const end = run(payment, {
      kind: "insertEvent",
      diagram: "payment",
      statement: 'divider "Fin"',
    });
    expect(end).toContain('  deactivate api\n  divider "Fin"\n');
  });

  it("removes events with their space and replaces note text", () => {
    const text =
      'diagram s: sequence {\n  a -> b\n  note n over a "N"\n  placement { space n 10 }\n}\n';
    const removed = run(text, { kind: "removeEvent", diagram: "s", event: "n" });
    expect(removed).not.toContain("note");
    expect(removed).not.toContain("space n");
    expect(
      run(text, { kind: "setEventText", diagram: "s", event: "n", text: 'Say "hi"' }),
    ).toContain('note n over a "Say \\"hi\\""');
    expect(refused(text, { kind: "removeEvent", diagram: "s", event: "a->b#1" })).toMatch(
      /removeRelation/,
    );
  });

  const decided =
    'diagram s: sequence {\n  a -> b as ask\n  alt check "Yes" {\n    b --> a as ok\n  } else "No" {\n    b --> a as no\n  }\n  placement { space check 10 }\n  style check, ask { stroke accent }\n  scenario sad { choose check "No" }\n}\n';

  it("removes a fragment with its messages and everything that names them", () => {
    const after = run(decided, { kind: "removeEvent", diagram: "s", event: "check" });
    expect(after).toBe(
      "diagram s: sequence {\n  a -> b as ask\n  placement { }\n  style ask { stroke accent }\n  scenario sad { }\n}\n",
    );
  });

  it("unwraps a decided fragment and follows condition changes into scenarios", () => {
    const text = decided.replace('} else "No" {\n    b --> a as no\n  }', "}");
    const unwrapped = run(text.replace('choose check "No"', 'choose check "Yes"'), {
      kind: "unwrapFragment",
      diagram: "s",
      fragment: "check",
    });
    expect(unwrapped).toContain("  a -> b as ask\n  b --> a as ok\n");
    expect(unwrapped).not.toContain("choose");
    const renamed = run(decided, {
      kind: "setFragmentCondition",
      diagram: "s",
      fragment: "check",
      branch: 1,
      condition: "Never",
    });
    expect(renamed).toContain('choose check "Never"');
    const removed = run(decided, {
      kind: "setFragmentCondition",
      diagram: "s",
      fragment: "check",
      branch: 1,
      condition: null,
    });
    expect(removed).toContain("choose check 2");
  });

  it("renames and names notes and fragments", () => {
    const renamed = run(decided, {
      kind: "renameEvent",
      diagram: "s",
      event: "check",
      newId: "verdict",
    });
    expect(renamed.match(/verdict/g)).toHaveLength(4);
    const text = 'diagram s: sequence {\n  a -> b\n  note over a "N"\n}\n';
    expect(
      run(text, { kind: "renameEvent", diagram: "s", event: "note#1", newId: "hint" }),
    ).toContain('note hint over a "N"');
    expect(
      refused(decided, { kind: "renameEvent", diagram: "s", event: "check", newId: "ask" }),
    ).toMatch(/^edit.id-conflict/);
  });

  it("toggles an activation after a message, until the reply", () => {
    const text =
      "diagram s: sequence {\n  a -> b as ask\n  b -> c as fwd\n  b --> a as reply\n  a -> c as later\n}\n";
    const on = run(text, {
      kind: "toggleActivation",
      diagram: "s",
      participant: "b",
      after: "ask",
    });
    expect(on).toBe(
      "diagram s: sequence {\n  a -> b as ask\n  activate b\n  b -> c as fwd\n  b --> a as reply\n  deactivate b\n  a -> c as later\n}\n",
    );
    expect(
      run(on, { kind: "toggleActivation", diagram: "s", participant: "b", after: "ask" }),
    ).toBe(text);
    const last = run(text, {
      kind: "toggleActivation",
      diagram: "s",
      participant: "c",
      after: "later",
    });
    expect(last).toContain("  a -> c as later\n  activate c\n  deactivate c\n}");
  });

  it("edits labels, note placement, operators and autonumber", () => {
    const text =
      'diagram s: sequence {\n  autonumber\n  a -> b\n  note n over a "N"\n  divider "D"\n  delay\n  opt check "C" {\n    b --> a\n  }\n}\n';
    const set = (operation: Record<string, unknown>) =>
      run(text, { diagram: "s", ...operation } as unknown as EditOperation);
    expect(set({ kind: "setEventText", event: "delay#1", text: "Later" })).toContain(
      '  delay "Later"\n',
    );
    expect(set({ kind: "setEventText", event: "divider#1", text: "E" })).toContain('divider "E"');
    expect(
      refused(text, { kind: "setEventText", diagram: "s", event: "divider#1", text: null }),
    ).toMatch(/needs its text/);
    expect(
      set({ kind: "setNotePlacement", note: "n", position: "right", participants: ["b"] }),
    ).toContain('note n right of b "N"');
    expect(
      set({ kind: "setNotePlacement", note: "n", position: "over", participants: ["a", "b"] }),
    ).toContain('note n over a, b "N"');
    expect(set({ kind: "setFragmentOperator", fragment: "check", operator: "loop" })).toContain(
      '  loop check "C" {',
    );
    const alt = run(set({ kind: "setFragmentOperator", fragment: "check", operator: "alt" }), {
      kind: "addBranch",
      diagram: "s",
      fragment: "check",
      condition: "No",
    });
    expect(
      run(alt, { kind: "setFragmentOperator", diagram: "s", fragment: "check", operator: "par" }),
    ).toContain('  par check "C" {\n    b --> a\n  } and "No" {');
    expect(
      refused(alt, {
        kind: "setFragmentOperator",
        diagram: "s",
        fragment: "check",
        operator: "opt",
      }),
    ).toMatch(/single branch/);
    expect(set({ kind: "setDiagramProperty", property: "autonumber", value: 10 })).toContain(
      "  autonumber 10\n",
    );
    expect(
      set({
        kind: "setStyleProperty",
        target: "n",
        targetKind: "event",
        property: "fill",
        value: "accent",
      }),
    ).toContain("style n { fill accent }");
  });

  it("sets and removes kind async", () => {
    const after = run(payment, {
      kind: "setElementProperty",
      diagram: "payment",
      target: "authorize",
      targetKind: "relation",
      property: "kind",
      value: "async",
    });
    expect(after).toContain('api -> bank: "Autorizar" as authorize { kind async }');
    expect(compile(after).document.diagrams[0]!.relationsByKey.get("authorize")!.async).toBe(true);
  });
});

describe("shared operations in sequence diagrams", () => {
  it("creates participants and appends messages after the last event", () => {
    const actor = run(payment, { kind: "createElement", diagram: "payment", elementKind: "actor" });
    expect(actor).toContain('  participant bank "Banco"\n  actor actor1 "Actor"\n');
    const message = run(payment, {
      kind: "createRelation",
      diagram: "payment",
      from: "api",
      to: "customer",
      line: "dashed",
      label: "Listo",
    });
    expect(message).toContain('  deactivate api\n  api --> customer: "Listo"\n');
  });

  it("removes a participant with its messages, events and gaps", () => {
    const text = `${payment.replace("  deactivate api\n", '  deactivate api\n  note over bank "B"\n  placement { gap bank 20 }\n')}`;
    const result = planEdit(compile(text), {
      kind: "removeElement",
      diagram: "payment",
      element: "bank",
      cascade: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(new Set(result.rejection.dependents!.map((d) => d.kind))).toEqual(
        new Set(["relation", "event", "gap"]),
      );
    }
    const after = run(text, {
      kind: "removeElement",
      diagram: "payment",
      element: "bank",
      cascade: true,
    });
    expect(after).not.toContain("bank");
  });

  it("refuses flow geometry", () => {
    expect(
      refused(payment, { kind: "setPosition", diagram: "payment", element: "api", x: 1, y: 2 }),
    ).toMatch(/^edit.invalid-value: `setPosition` does not apply to sequence diagrams/);
  });
});

describe("nesting calls", () => {
  const flat =
    'diagram s: sequence {\n  customer -> api: "Pay" as pay\n  // Ask the bank first.\n  api -> bank: "Authorize" as authorize\n  api --> customer: "Receipt" as receipt\n}\n';

  it("nests the events right after a call in a new block, comments with them", () => {
    const after = run(flat, {
      kind: "nestInCall",
      diagram: "s",
      call: "pay",
      events: ["authorize"],
    });
    expect(after).toContain(
      '  customer -> api: "Pay" as pay {\n    // Ask the bank first.\n    api -> bank: "Authorize" as authorize\n  }\n',
    );
    const two = run(flat, {
      kind: "nestInCall",
      diagram: "s",
      call: "pay",
      events: ["receipt", "authorize"],
    });
    expect(two).toContain('    api --> customer: "Receipt" as receipt\n  }\n');
  });

  it("appends to a block the call has, its properties kept", () => {
    const text =
      "diagram s: sequence {\n  a -> b as call {\n    kind async\n  }\n  b -> c as next\n}\n";
    const after = run(text, { kind: "nestInCall", diagram: "s", call: "call", events: ["next"] });
    expect(after).toContain("  a -> b as call {\n    kind async\n    b -> c as next\n  }\n");
  });

  it("refuses events that are not right after the call", () => {
    expect(
      refused(flat, { kind: "nestInCall", diagram: "s", call: "pay", events: ["receipt"] }),
    ).toBe("edit.unsafe-target: Select the events right after the call they belong to.");
  });

  it("unnests a call, writing each return as a reply with its key, and nests it back", () => {
    const nested =
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize" as authorize\n    return "Receipt" as receipt\n  }\n}\n';
    const before = compile(nested).document.diagrams[0]!;
    const after = run(nested, { kind: "unnestCall", diagram: "s", call: "pay" });
    expect(after).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay" as pay\n  api -> bank: "Authorize" as authorize\n  api --> customer: "Receipt" as receipt\n}\n',
    );
    const unnested = compile(after).document.diagrams[0]!;
    expect(unnested.relationsByKey.has("receipt")).toBe(true);
    expect(before.relationsByKey.get("receipt")!.returns).toBe("pay");
    // Nesting the two back draws a block whose events are the same two.
    const back = run(after, {
      kind: "nestInCall",
      diagram: "s",
      call: "pay",
      events: ["authorize", "receipt"],
    });
    expect(compile(back).document.diagrams[0]!.events[0]).toMatchObject({ key: "pay" });
  });

  it("inserts an event last in a call's block, creating it", () => {
    const after = run(flat, {
      kind: "insertEvent",
      diagram: "s",
      statement: 'return "OK"',
      inside: { message: "authorize" },
    });
    expect(after).toContain('  api -> bank: "Authorize" as authorize {\n    return "OK"\n  }\n');
  });

  it("refuses an activation on a call whose block activates the receiver", () => {
    const text = "diagram s: sequence {\n  a -> b as call {\n    b -> c\n  }\n}\n";
    expect(
      refused(text, { kind: "toggleActivation", diagram: "s", participant: "b", after: "call" }),
    ).toBe("edit.invalid-value: The block of `call` already activates `b`.");
  });

  it("edits a return's label and name, and refuses its line and its ends", () => {
    const text = 'diagram s: sequence {\n  a -> b as call {\n    return "OK"\n  }\n}\n';
    const key = "b->a#1";
    const named = run(text, {
      kind: "materializeRelationId",
      diagram: "s",
      relationKey: key,
      id: "ok",
    });
    expect(named).toContain('    return "OK" as ok\n');
    expect(
      run(named, { kind: "setRelationLabel", diagram: "s", relation: "ok", label: "Done" }),
    ).toContain('    return "Done" as ok\n');
    expect(
      refused(text, { kind: "setRelationLine", diagram: "s", relation: key, line: "solid" }),
    ).toBe(
      "edit.invalid-value: A `return` answers its call; unnest the call to write the reply by hand.",
    );
  });

  it("moves an event into the call before it, before a trailing return, and out again", () => {
    const text =
      'diagram s: sequence {\n  a -> b as call {\n    b -> c as inner\n    return "OK"\n  }\n  note n over a "N"\n}\n';
    const inside = run(text, { kind: "moveEvent", diagram: "s", event: "n", direction: "up" });
    expect(inside).toContain('    b -> c as inner\n    note n over a "N"\n    return "OK"\n');
    const out = run(text, { kind: "moveEvent", diagram: "s", event: "inner", direction: "up" });
    expect(out).toContain('  b -> c as inner\n  a -> b as call {\n    return "OK"\n  }\n');
  });
});

describe("removing calls", () => {
  const text =
    'diagram s: sequence {\n  a -> b: "Pay" as pay {\n    b -> c: "Ask" as ask\n    note n over b "N"\n    alt stock "In stock" {\n      return "OK" as ok\n    }\n  }\n  a -> b: "Again" as again\n  style ask, again { color "#f00" }\n  placement {\n    space n 10\n    space ask 12\n  }\n  scenario sc "S" {\n    choose stock "In stock"\n  }\n}\n';

  it("removes a call with the events of its block and what names them", () => {
    expect(run(text, { kind: "removeRelation", diagram: "s", relation: "pay" })).toBe(
      'diagram s: sequence {\n  participant c\n  a -> b: "Again" as again\n  style again { color "#f00" }\n  placement {\n  }\n  scenario sc "S" {\n  }\n}\n',
    );
  });

  it("lists the nested events of a removed participant's calls, and removes them on cascade", () => {
    const rejection = planEdit(compile(text), {
      kind: "removeElement",
      diagram: "s",
      element: "a",
      cascade: false,
    });
    if (rejection.ok) throw new Error("expected a rejection");
    expect(rejection.rejection.dependents?.map((d) => `${d.kind} ${d.name}`)).toEqual(
      expect.arrayContaining(["relation ask", "event n", "event stock", "space n", "space ask"]),
    );
    expect(run(text, { kind: "removeElement", diagram: "s", element: "a", cascade: true })).toBe(
      'diagram s: sequence {\n  participant b; participant c\n  placement {\n  }\n  scenario sc "S" {\n  }\n}\n',
    );
  });

  it("runs every relation operation on a return", () => {
    const call = 'diagram s: sequence {\n  a -> b as call {\n    return "OK" as ok\n  }\n}\n';
    const op = { diagram: "s", relation: "ok" } as const;
    expect(run(call, { kind: "setRelationLabel", ...op, label: null })).toContain(
      "    return as ok\n",
    );
    expect(
      run(call, {
        kind: "setElementProperty",
        diagram: "s",
        target: "ok",
        targetKind: "relation",
        property: "kind",
        value: "async",
      }),
    ).toContain('    return "OK" as ok { kind async }\n');
    expect(run(call, { kind: "removeRelation", ...op })).toBe(
      "diagram s: sequence {\n  a -> b as call {\n  }\n}\n",
    );
    const answers =
      "edit.invalid-value: A `return` answers its call; unnest the call to write the reply by hand.";
    expect(refused(call, { kind: "setRelationLine", ...op, line: "solid" })).toBe(answers);
    expect(refused(call, { kind: "reconnectRelation", ...op, end: "to", element: "b" })).toBe(
      answers,
    );
  });
});
