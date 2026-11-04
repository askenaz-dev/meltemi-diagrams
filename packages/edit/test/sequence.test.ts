import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { activationPair, planEdit, type EditOperation } from "../src/index.js";

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

  it("declares an implicit participant where it keeps every column", () => {
    const columns = (source: string) =>
      compile(source).document.diagrams[0]!.elements.map((e) => e.id);
    const bare = 'diagram s: sequence {\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n}\n';
    // Named first by the second message: declared right before it.
    const labelled = run(bare, {
      kind: "setElementLabel",
      diagram: "s",
      element: "bank",
      label: "Bank",
    });
    expect(labelled).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay"\n  participant bank "Bank"\n  api -> bank: "Authorize"\n}\n',
    );
    expect(columns(labelled)).toEqual(["customer", "api", "bank"]);
    // Named first after `customer` in the same message: `customer` is declared before it.
    const described = run(bare, {
      kind: "setDescription",
      diagram: "s",
      target: "api",
      targetKind: "element",
      description: "REST",
    });
    expect(described).toBe(
      'diagram s: sequence {\n  participant customer\n  participant api "api" { description "REST" }\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n}\n',
    );
    expect(columns(described)).toEqual(["customer", "api", "bank"]);
    // After the declarations when nothing is named between them and the first mention.
    const declared =
      'diagram s: sequence {\n  participant customer "Customer"\n\n  customer -> api: "Pay"\n}\n';
    const kind = run(declared, {
      kind: "setElementKind",
      diagram: "s",
      element: "api",
      elementKind: "database",
    });
    expect(kind).toBe(
      'diagram s: sequence {\n  participant customer "Customer"\n  database api "api"\n\n  customer -> api: "Pay"\n}\n',
    );
    // A first mention in a call's block or a fragment: before the statement that holds it.
    const nested =
      'diagram s: sequence {\n  participant customer "Customer"\n  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize"\n  }\n  alt ok "OK" {\n    api -> audit: "Log"\n  }\n}\n';
    const classed = run(nested, {
      kind: "setClasses",
      diagram: "s",
      target: "audit",
      targetKind: "element",
      classes: ["external"],
    });
    expect(classed).toContain(
      '  }\n  participant audit "audit" { class external }\n  alt ok "OK" {',
    );
    expect(columns(classed)).toEqual(columns(nested));
    const bank = run(nested, {
      kind: "setElementLabel",
      diagram: "s",
      element: "bank",
      label: "Bank",
    });
    expect(bank).toContain(
      '  participant customer "Customer"\n  participant api\n  participant bank "Bank"\n  customer -> api',
    );
    expect(columns(bank)).toEqual(columns(nested));
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

/** The rejection of an operation, and the error a compilation of `wouldBe` reports with `code`. */
function refusedAs(text: string, operation: EditOperation, wouldBe: string, code: string) {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error("expected a rejection");
  const diagnostic = compile(wouldBe).diagnostics.find((d) => d.code === code);
  expect(diagnostic).toBeDefined();
  return { rejection: result.rejection, message: diagnostic!.message };
}

describe("explicit event moves to a destination", () => {
  const lines = (...statements: string[]) =>
    `diagram s: sequence {\n${statements.map((s) => `  ${s}\n`).join("")}}\n`;
  const move = (event: string, to: { after: string } | { before: string }): EditOperation => ({
    kind: "moveEvent",
    diagram: "s",
    event,
    to,
  });

  it("A move to a destination: the deactivate follows fetch, everything else in place", () => {
    const text = lines(
      "a -> b as ask",
      "activate b",
      "b -> c as fetch",
      "b -> c as store",
      "b --> a as reply",
      "deactivate b",
    );
    expect(run(text, move("deactivate#1", { after: "fetch" }))).toBe(
      lines(
        "a -> b as ask",
        "activate b",
        "b -> c as fetch",
        "deactivate b",
        "b -> c as store",
        "b --> a as reply",
      ),
    );
  });

  it("A destination in a fragment branch: the note goes first in the branch, re-indented", () => {
    const text = payment.replace(
      "  }\n\n  deactivate api",
      '  }\n  note over api "Checking"\n\n  deactivate api',
    );
    const after = run(text, {
      kind: "moveEvent",
      diagram: "payment",
      event: "note#1",
      to: { before: "approved" },
    });
    expect(after).toBe(
      payment.replace(
        '  alt result "Aprobado" {\n',
        '  alt result "Aprobado" {\n    note over api "Checking"\n',
      ),
    );
    const note = compile(after).document.diagrams[0]!.eventsByKey.get("note#1")!;
    expect(note.path).toEqual([{ fragment: "result", branch: 0 }]);
  });

  it("A destination that breaks the order is refused naming sequence.activation", () => {
    const text = lines(
      "a -> b as ask",
      "activate b",
      "b -> c as fetch",
      "deactivate b",
      "b --> a as reply",
    );
    const wouldBe = lines(
      "a -> b as ask",
      "b -> c as fetch",
      "deactivate b",
      "b --> a as reply",
      "activate b",
    );
    const { rejection, message } = refusedAs(
      text,
      move("activate#1", { after: "reply" }),
      wouldBe,
      "sequence.activation",
    );
    expect(rejection.code).toBe("edit.invalid-value");
    expect(rejection.reason).toBe(message);
  });

  it("Two forms or a destination inside the event are refused", () => {
    const text = lines(
      "a -> b as ask",
      'opt check "C" {',
      "  b -> c as fetch",
      "}",
      "b --> a as reply",
    );
    expect(
      refused(text, {
        kind: "moveEvent",
        diagram: "s",
        event: "reply",
        direction: "up",
        to: { after: "ask" },
      }),
    ).toBe(
      "edit.invalid-value: `moveEvent` moves an event by a `direction` or to a destination `to`: give exactly one of them.",
    );
    expect(refused(text, move("check", { after: "fetch" }))).toBe(
      "edit.unsafe-target: `fetch` is inside `check`, which cannot move into itself.",
    );
  });

  it("refuses neither form, a malformed destination, an unknown event and the event itself", () => {
    const text = lines("a -> b as ask", "b -> c as fetch", "b --> a as reply");
    expect(refused(text, { kind: "moveEvent", diagram: "s", event: "reply" })).toMatch(
      /^edit.invalid-value: `moveEvent` moves an event by a `direction` or to a destination/,
    );
    expect(
      refused(text, {
        kind: "moveEvent",
        diagram: "s",
        event: "reply",
        to: { after: "ask", before: "fetch" } as unknown as { after: string },
      }),
    ).toBe("edit.invalid-value: A destination is `{ after: <event> }` or `{ before: <event> }`.");
    expect(refused(text, move("reply", { before: "nope" }))).toBe(
      "edit.unsafe-target: Event `nope` does not exist in diagram `s`.",
    );
    expect(refused(text, move("reply", { after: "reply" }))).toBe(
      "edit.unsafe-target: `reply` cannot move after or before itself.",
    );
  });

  it("moves a fragment into a call's block, re-indented with its comments", () => {
    const text =
      'diagram s: sequence {\n  a -> b as call {\n    b -> c as inner\n    return "OK"\n  }\n  // The loop.\n  loop poll "Poll" { // each second\n    a -> c as ping\n  } // end\n}\n';
    expect(run(text, move("poll", { before: "inner" }))).toBe(
      'diagram s: sequence {\n  a -> b as call {\n    // The loop.\n    loop poll "Poll" { // each second\n      a -> c as ping\n    } // end\n    b -> c as inner\n    return "OK"\n  }\n}\n',
    );
    const crlf = text.replace(/\n/g, "\r\n");
    expect(run(crlf, move("poll", { after: "inner" }))).toBe(
      'diagram s: sequence {\n  a -> b as call {\n    b -> c as inner\n    // The loop.\n    loop poll "Poll" { // each second\n      a -> c as ping\n    } // end\n    return "OK"\n  }\n}\n'.replace(
        /\n/g,
        "\r\n",
      ),
    );
  });

  it("refuses a call moved into its own block", () => {
    const text =
      'diagram s: sequence {\n  a -> b as call {\n    b -> c as inner\n    return "OK"\n  }\n  a -> c as log\n}\n';
    expect(refused(text, move("call", { before: "inner" }))).toMatch(
      /^edit.unsafe-target: `inner` is inside `call`/,
    );
  });

  it("takes the comment lines above and the comment that ends the line", () => {
    const text = lines(
      "a -> b as ask",
      "activate b",
      "b -> c as fetch",
      "b -> c as store",
      "// Done with b.",
      "deactivate b // closes ask",
      "b --> a as reply",
    );
    expect(run(text, move("deactivate#1", { after: "fetch" }))).toBe(
      lines(
        "a -> b as ask",
        "activate b",
        "b -> c as fetch",
        "// Done with b.",
        "deactivate b // closes ask",
        "b -> c as store",
        "b --> a as reply",
      ),
    );
    // Before an event, above the comments that belong to it.
    const commented = lines("a -> b as ask", "// Fetch it.", "b -> c as fetch", "b --> a as reply");
    expect(run(commented, move("reply", { before: "fetch" }))).toBe(
      lines("a -> b as ask", "b --> a as reply", "// Fetch it.", "b -> c as fetch"),
    );
  });

  it("writes nothing when the event is already there, and joins a block written on one line", () => {
    const text = lines("a -> b as ask", "b -> c as fetch", "b --> a as reply");
    for (const to of [{ after: "ask" }, { before: "reply" }]) {
      const result = planEdit(compile(text), move("fetch", to));
      expect(result.ok && result.plan.edits).toEqual([]);
    }
    const call = lines('a -> b as call { b -> c as inner; return "OK" }', "a -> c as log");
    expect(run(call, move("log", { before: "inner" }))).toBe(
      lines('a -> b as call { a -> c as log; b -> c as inner; return "OK" }'),
    );
  });

  it("A return cannot leave its call: refused naming sequence.return", () => {
    const text =
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize"\n    return "OK"\n  }\n}\n';
    const wouldBe =
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    api -> bank: "Authorize"\n  }\n  return "OK"\n}\n';
    const { rejection, message } = refusedAs(
      text,
      { kind: "moveEvent", diagram: "s", event: "api->customer#1", direction: "down" },
      wouldBe,
      "sequence.return",
    );
    expect(rejection.code).toBe("edit.invalid-value");
    expect(rejection.reason).toBe(message);
  });
});

describe("removing activations", () => {
  const lines = (...statements: string[]) =>
    `diagram s: sequence {\n${statements.map((s) => `  ${s}\n`).join("")}}\n`;
  const remove = (event: string): EditOperation => ({ kind: "removeEvent", diagram: "s", event });

  it("Remove an activation: the activate and its deactivate go in one edit", () => {
    const text = lines("a -> b as ask", "activate b", "b -> c", "deactivate b", "b --> a as reply");
    const result = planEdit(compile(text), remove("activate#1"));
    expect(result.ok).toBe(true);
    expect(run(text, remove("activate#1"))).toBe(
      lines("a -> b as ask", "b -> c", "b --> a as reply"),
    );
  });

  const nested = lines(
    "a -> b as ask",
    "activate b",
    "b -> c as fetch",
    "activate b",
    "c --> b as data",
    "deactivate b",
    "deactivate b",
    "b --> a as reply",
  );

  it("Remove by the deactivation: the outer pair goes, the inner pair stays", () => {
    expect(run(nested, remove("deactivate#2"))).toBe(
      lines(
        "a -> b as ask",
        "b -> c as fetch",
        "activate b",
        "c --> b as data",
        "deactivate b",
        "b --> a as reply",
      ),
    );
    expect(run(nested, remove("activate#2"))).toBe(
      lines(
        "a -> b as ask",
        "activate b",
        "b -> c as fetch",
        "c --> b as data",
        "deactivate b",
        "b --> a as reply",
      ),
    );
  });

  it("Remove an end alone, as a batch that read the pairs before it does", () => {
    const text =
      'diagram s: sequence {\n  a -> b: "m1"\n  activate b\n  a -> b: "m2"\n  activate b\n  alt x "X" {\n    a -> b: "m3"\n    deactivate b\n  }\n  a -> b: "m4"\n  deactivate b\n}\n';
    // The fragment takes the inner bar's `deactivate`; its `activate` goes alone, so the outer
    // bar keeps its own.
    const alone = (event: string): EditOperation => ({
      kind: "removeEvent",
      diagram: "s",
      event,
      alone: true,
    });
    expect(run(text, { kind: "batch", operations: [remove("x"), alone("activate#2")] })).toBe(
      'diagram s: sequence {\n  a -> b: "m1"\n  activate b\n  a -> b: "m2"\n  a -> b: "m4"\n  deactivate b\n}\n',
    );
    // A `deactivate` alone leaves its bar open to the end.
    expect(run(text, alone("deactivate#2"))).toBe(
      text.replace('  a -> b: "m4"\n  deactivate b\n', '  a -> b: "m4"\n'),
    );
    // An `activate` alone whose `deactivate` stays is refused: that `deactivate` would close
    // nothing.
    expect(refused(text, alone("activate#1"))).toBe("edit.invalid-value: `b` is not active here.");
  });

  it("Remove an open activation: only the activate goes", () => {
    const text = lines("a -> b as ask", "activate b", "b -> c");
    expect(run(text, remove("activate#1"))).toBe(lines("a -> b as ask", "b -> c"));
  });

  it("pairs activations across fragments and calls, as toggleActivation does", () => {
    const text =
      'diagram s: sequence {\n  a -> b as ask\n  activate b\n  opt check "C" {\n    b -> c as call {\n      activate c\n      return\n    }\n    deactivate c\n  }\n  deactivate b\n  activate a\n}\n';
    const diagram = compile(text).document.diagrams[0]!;
    const key = (k: string) => diagram.eventsByKey.get(k)!;
    expect(activationPair(diagram, key("activate#1"))?.key).toBe("deactivate#2");
    expect(activationPair(diagram, key("deactivate#2"))?.key).toBe("activate#1");
    expect(activationPair(diagram, key("activate#2"))?.key).toBe("deactivate#1");
    expect(activationPair(diagram, key("deactivate#1"))?.key).toBe("activate#2");
    expect(activationPair(diagram, key("activate#3"))).toBeNull();
    expect(activationPair(diagram, key("ask"))).toBeNull();
    expect(run(text, remove("deactivate#1"))).toBe(
      'diagram s: sequence {\n  a -> b as ask\n  activate b\n  opt check "C" {\n    b -> c as call {\n      return\n    }\n  }\n  deactivate b\n  activate a\n}\n',
    );
  });
});

describe("tag operations", () => {
  afterEach(() => setLocale("en"));

  const addTag = (
    target: string,
    targetKind: "element" | "relation",
    text: string,
    index?: number,
  ): EditOperation => ({
    kind: "addTag",
    diagram: "s",
    target,
    targetKind,
    text,
    ...(index === undefined ? {} : { index }),
  });
  const tagsOf = (text: string, key: string) =>
    compile(text)
      .document.diagrams[0]!.relationsByKey.get(key)!
      .tags.map((t) => t.text);

  it("A tag on a message without a block", () => {
    const text = 'diagram s: sequence {\n  a -> b: "Ask"\n}\n';
    const after = run(text, addTag("a->b#1", "relation", "PKCE"));
    expect(after).toBe('diagram s: sequence {\n  a -> b: "Ask" { tag "PKCE" }\n}\n');
    expect(tagsOf(after, "a->b#1")).toEqual(["PKCE"]);
  });

  it("A tag on a call with events: after its properties, before its events", () => {
    const text =
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    kind async\n    api -> bank: "Authorize"\n    return "OK"\n  }\n}\n';
    const after = run(text, addTag("pay", "relation", "v2"));
    expect(after).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay" as pay {\n    kind async\n    tag "v2"\n    api -> bank: "Authorize"\n    return "OK"\n  }\n}\n',
    );
    const events = (source: string) => {
      const call = compile(source).document.diagrams[0]!.eventsByKey.get("pay");
      return call?.kind === "message" ? call.events.map((e) => e.key) : [];
    };
    expect(events(after)).toEqual(events(text));
    // Without properties, first in the block.
    const bare = text.replace("    kind async\n", "");
    expect(run(bare, addTag("pay", "relation", "v2"))).toContain(
      '"Pay" as pay {\n    tag "v2"\n    api -> bank: "Authorize"',
    );
  });

  it("A tag on an implicit participant: declared among the participants with its block", () => {
    const text =
      'diagram s: sequence {\n  participant customer "Customer"\n  participant api "API"\n\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n}\n';
    const after = run(text, addTag("bank", "element", "external"));
    expect(after).toBe(text.replace('"API"\n', '"API"\n  participant bank { tag "external" }\n'));
    const diagram = compile(after).document.diagrams[0]!;
    expect(diagram.elements.map((e) => e.id)).toEqual(["customer", "api", "bank"]);
    expect(diagram.elementsById.get("bank")!.tags.map((t) => t.text)).toEqual(["external"]);
  });

  it("A tag on an implicit participant keeps its column", () => {
    const columns = (source: string) =>
      compile(source).document.diagrams[0]!.elements.map((e) => e.id);
    // Without declarations: right before the message that names it first.
    const bare = 'diagram s: sequence {\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n}\n';
    const bank = run(bare, addTag("bank", "element", "external"));
    expect(bank).toBe(
      'diagram s: sequence {\n  customer -> api: "Pay"\n  participant bank { tag "external" }\n  api -> bank: "Authorize"\n}\n',
    );
    expect(columns(bank)).toEqual(["customer", "api", "bank"]);
    // Named first after another implicit participant: that one is declared before it.
    const api = run(bare, addTag("api", "element", "v2"));
    expect(api).toBe(
      'diagram s: sequence {\n  participant customer\n  participant api { tag "v2" }\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n}\n',
    );
    expect(columns(api)).toEqual(["customer", "api", "bank"]);
    // Declared participants, and an implicit one named before the tagged one.
    const mixed =
      'diagram s: sequence {\n  participant customer "Customer"\n  participant api "API"\n\n  customer -> api: "Pay"\n  api -> bank: "Authorize"\n  bank -> audit: "Log"\n}\n';
    const audit = run(mixed, addTag("audit", "element", "external"));
    expect(audit).toBe(
      mixed.replace("  bank -> audit", '  participant audit { tag "external" }\n  bank -> audit'),
    );
    expect(columns(audit)).toEqual(["customer", "api", "bank", "audit"]);
    // A message sharing its line: the declarations join it with `; `.
    const shared = "diagram s: sequence {\n  a -> b; b -> c\n}\n";
    const c = run(shared, addTag("c", "element", "t"));
    expect(c).toBe('diagram s: sequence {\n  a -> b; participant c { tag "t" }; b -> c\n}\n');
    expect(columns(c)).toEqual(["a", "b", "c"]);
  });

  it("A tag at an index: before the tag at that index, a one-line block opening onto lines", () => {
    const text = 'diagram s: sequence {\n  a -> b as pay {\n    tag "v2"\n  }\n}\n';
    const after = run(text, addTag("pay", "relation", "v1", 0));
    expect(after).toBe(
      'diagram s: sequence {\n  a -> b as pay {\n    tag "v1"\n    tag "v2"\n  }\n}\n',
    );
    expect(tagsOf(after, "pay")).toEqual(["v1", "v2"]);
    const line = 'diagram s: sequence {\n  a -> b as pay { tag "v2" }\n}\n';
    expect(run(line, addTag("pay", "relation", "v1", 0))).toBe(after);
    // Past the last tag is the end.
    expect(tagsOf(run(line, addTag("pay", "relation", "v3", 5)), "pay")).toEqual(["v2", "v3"]);
    expect(run(line, addTag("pay", "relation", "v3"))).toBe(
      'diagram s: sequence {\n  a -> b as pay {\n    tag "v2"\n    tag "v3"\n  }\n}\n',
    );
  });

  it("Edit and remove", () => {
    const text = 'diagram s: sequence {\n  a -> b: "Ask" { tag "PKCE" }\n}\n';
    const edited = run(text, {
      kind: "setTag",
      diagram: "s",
      target: "a->b#1",
      targetKind: "relation",
      index: 0,
      text: "OAuth",
    });
    expect(edited).toBe('diagram s: sequence {\n  a -> b: "Ask" { tag "OAuth" }\n}\n');
    expect(
      run(edited, {
        kind: "removeTag",
        diagram: "s",
        target: "a->b#1",
        targetKind: "relation",
        index: 0,
      }),
    ).toBe('diagram s: sequence {\n  a -> b: "Ask"\n}\n');
  });

  it("An empty or repeated tag is refused with edit.invalid-value", () => {
    const text = 'diagram s: sequence {\n  a -> b: "Ask" { tag "PKCE" }\n}\n';
    expect(refused(text, addTag("a->b#1", "relation", ""))).toBe(
      "edit.invalid-value: A tag is one line of text, not empty.",
    );
    expect(refused(text, addTag("a->b#1", "relation", "PKCE"))).toBe(
      'edit.invalid-value: `a->b#1` already has the tag "PKCE".',
    );
    expect(refused(text, addTag("a->b#1", "relation", "two\nlines"))).toMatch(/one line/);
    expect(refused(text, addTag("a->b#1", "relation", "   "))).toMatch(/one line/);
    const two = text.replace('{ tag "PKCE" }', '{ tag "PKCE"; tag "v2" }');
    expect(
      refused(two, {
        kind: "setTag",
        diagram: "s",
        target: "a->b#1",
        targetKind: "relation",
        index: 1,
        text: "PKCE",
      }),
    ).toMatch(/^edit.invalid-value: .*already has the tag "PKCE"/);
    expect(
      refused(two, {
        kind: "setTag",
        diagram: "s",
        target: "a->b#1",
        targetKind: "relation",
        index: 1,
        text: "",
      }),
    ).toMatch(/^edit.invalid-value: A tag is one line/);
  });

  it("A tag outside a sequence diagram, or at an index the owner has no tag at, is refused", () => {
    const flow = 'diagram s: flow {\n  api["API"]\n}\n';
    expect(refused(flow, addTag("api", "element", "v2"))).toBe(
      "edit.unsafe-target: Tags go on the participants and messages of sequence diagrams, and `s` is not one.",
    );
    const text = 'diagram s: sequence {\n  a -> b: "Ask" { tag "PKCE" }\n  note n over a "N"\n}\n';
    expect(
      refused(text, {
        kind: "removeTag",
        diagram: "s",
        target: "a->b#1",
        targetKind: "relation",
        index: 3,
      }),
    ).toBe(
      "edit.unsafe-target: `a->b#1` has no tag at index 3; its tags are numbered from 0 to 0.",
    );
    expect(
      refused(text, {
        kind: "removeTag",
        diagram: "s",
        target: "a",
        targetKind: "element",
        index: 0,
      }),
    ).toBe("edit.unsafe-target: `a` has no tags.");
    expect(refused(text, addTag("n", "element", "v2"))).toBe(
      "edit.unsafe-target: `n` is neither a participant nor a message of `s`; tags go on participants and messages.",
    );
    expect(refused(text, addTag("a->b#1", "relation", "v2", -1))).toMatch(
      /^edit.unsafe-target: -1 is no place among the tags/,
    );
  });

  it("tags participants, declared and in groups, after their properties", () => {
    const text =
      'diagram s: sequence {\n  participant api "API"\n  group core "Core" {\n    participant db "DB" {\n      description "Store"\n    }\n  }\n  api -> db\n}\n';
    const api = run(text, addTag("api", "element", "v2"));
    expect(api).toContain('  participant api "API" { tag "v2" }\n');
    const db = run(text, addTag("db", "element", "legacy"));
    expect(db).toContain(
      '    participant db "DB" {\n      description "Store"\n      tag "legacy"\n    }\n',
    );
    expect(refused(text, addTag("core", "element", "x"))).toMatch(
      /^edit.unsafe-target: `core` is neither/,
    );
  });

  it("tags a return, and keeps the comments of the block", () => {
    const text =
      'diagram s: sequence {\n  a -> b as call {\n    return "OK" { tag "cached" }\n  }\n}\n';
    const key = "b->a#1";
    expect(tagsOf(run(text, addTag(key, "relation", "fast")), key)).toEqual(["cached", "fast"]);
    expect(
      run(text, { kind: "removeTag", diagram: "s", target: key, targetKind: "relation", index: 0 }),
    ).toBe('diagram s: sequence {\n  a -> b as call {\n    return "OK"\n  }\n}\n');
    const commented =
      'diagram s: sequence {\n  a -> b as ask {\n    // Why we tag it.\n    tag "PKCE" // the flow\n  }\n}\n';
    const removed = run(commented, {
      kind: "removeTag",
      diagram: "s",
      target: "ask",
      targetKind: "relation",
      index: 0,
    });
    expect(removed).toContain("// Why we tag it.");
    expect(removed).toContain("// the flow");
    expect(removed).not.toContain('tag "PKCE"');
    const renamed = run(commented, {
      kind: "setTag",
      diagram: "s",
      target: "ask",
      targetKind: "relation",
      index: 0,
      text: 'Say "hi"',
    });
    expect(renamed).toContain('    tag "Say \\"hi\\"" // the flow\n');
    const added = run(commented, addTag("ask", "relation", "v2"));
    expect(added).toContain('    tag "PKCE" // the flow\n    tag "v2"\n');
  });

  it("gives its reasons in Spanish", () => {
    setLocale("es");
    const text = 'diagram s: sequence {\n  a -> b: "Ask" { tag "PKCE" }\n}\n';
    expect(refused(text, addTag("a->b#1", "relation", "PKCE"))).toBe(
      'edit.invalid-value: `a->b#1` ya tiene la marca "PKCE".',
    );
    expect(refused(text, addTag("a->b#1", "relation", ""))).toBe(
      "edit.invalid-value: Una marca es una línea de texto, no vacía.",
    );
  });
});
