import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  compile,
  flattenEvents,
  resolveScenario,
  toJson,
  type FlowDiagram,
  type FragmentEvent,
} from "../src/index.js";

function sequence(body: string) {
  const compilation = compile(`language "0.2"\ndiagram s: sequence {\n${body}\n}\n`);
  const diagram = compilation.document.diagrams[0] as FlowDiagram;
  return { compilation, diagram, codes: compilation.diagnostics.map((d) => d.code) };
}

const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

describe("sequence diagrams compile", () => {
  it("compiles the proposal's payment sequence", () => {
    const compilation = compile(payment);
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.type).toBe("sequence");
    expect(diagram.elements.map((e) => [e.id, e.kind])).toEqual([
      ["customer", "actor"],
      ["api", "participant"],
      ["bank", "participant"],
    ]);
    expect(diagram.events.map((e) => e.key)).toEqual([
      "pay",
      "activate#1",
      "authorize",
      "result",
      "deactivate#1",
    ]);
    const alt = diagram.events[3] as FragmentEvent;
    expect(alt.branches.map((b) => [b.condition, b.events.map((e) => e.key)])).toEqual([
      ["Aprobado", ["approved", "success"]],
      ["Rechazado", ["declined", "retry"]],
    ]);
    expect(diagram.relations.find((r) => r.key === "approved")!.line).toBe("dashed");
  });

  it("reads every participant kind, groups and implicit participants", () => {
    const { diagram, codes } = sequence(
      '  group backend "Backend" {\n    participant api "API"\n    database db "DB"\n  }\n  actor u "User"\n  boundary b\n  control c\n  entity e\n  collections cs\n  queue q\n  u -> api\n  api -> ghost',
    );
    expect(codes).toEqual([]);
    expect(diagram.elements.map((e) => [e.id, e.kind, e.groupPath.join("/")])).toEqual([
      ["backend", "group", ""],
      ["api", "participant", "backend"],
      ["db", "database", "backend"],
      ["u", "actor", ""],
      ["b", "boundary", ""],
      ["c", "control", ""],
      ["e", "entity", ""],
      ["cs", "collections", ""],
      ["q", "queue", ""],
      ["ghost", "participant", ""],
    ]);
  });

  it("refuses flow kinds with the sequence vocabulary in the hint", () => {
    const { compilation } = sequence('  node a "A"');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints![0]).toContain("`node` belongs to flow diagrams");
  });

  it("reads async messages, self-calls and autonumber", () => {
    const { diagram, codes } = sequence(
      '  autonumber 10\n  api -> queue: "Publish" as publish { kind async }\n  api -> api: "Validate" as validate',
    );
    expect(codes).toEqual([]);
    expect(diagram.relationsByKey.get("publish")).toMatchObject({ async: true, line: "solid" });
    expect(diagram.relationsByKey.get("validate")).toMatchObject({ from: "api", to: "api" });
    expect(diagram.properties.autonumber).toBe(10);
    expect(sequence("  autonumber\n  a -> b").diagram.properties.autonumber).toBe(1);
  });
  it("refuses the line tokens, naming the four arrows a message takes", () => {
    const { compilation } = sequence('  customer -- api: "Hello"');
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.invalid-value");
    expect(d!.range.start.column).toBe(12);
    expect(d!.message).toBe("`--` is not available here; write `->`, `-->`, `<->` or `<-->`.");
  });
});

describe("events", () => {
  it("reads notes, lifecycles, dividers and delays with keys", () => {
    const { diagram, codes } = sequence(
      '  a -> b\n  note over a, b "Both"\n  note n2 left of a "Left"\n  create c\n  b -> c: "new"\n  destroy c\n  divider "Phase 2"\n  delay "Later"\n  delay',
    );
    expect(codes).toEqual([]);
    expect(diagram.events.map((e) => [e.kind, e.key])).toEqual([
      ["message", "a->b#1"],
      ["note", "note#1"],
      ["note", "n2"],
      ["create", "create#1"],
      ["message", "b->c#1"],
      ["destroy", "destroy#1"],
      ["divider", "divider#1"],
      ["delay", "delay#1"],
      ["delay", "delay#2"],
    ]);
    expect(diagram.eventsByKey.get("note#1")).toMatchObject({
      position: "over",
      participants: ["a", "b"],
    });
    expect(diagram.eventsByKey.get("n2")).toMatchObject({ position: "left", participants: ["a"] });
  });

  it("nests fragments with ids and keeps their places", () => {
    const { diagram, codes } = sequence(
      '  loop retries "Hasta 3" {\n    alt check "OK" {\n      b --> a\n    } else "Error" {\n      b --> a: "fail"\n    }\n  }\n  par {\n    a -> b\n  } and "Other" {\n    a -> c\n  }\n  critical "Pay" {\n    a -> b\n  } option "Timeout" {\n    a -> c\n  }\n  opt "Coupon" { a -> b }\n  break "Fraud" { a -> b }\n  region "Highlighted" { a -> b }',
    );
    expect(codes).toEqual([]);
    const retries = diagram.eventsByKey.get("retries") as FragmentEvent;
    expect(retries.operator).toBe("loop");
    expect(retries.branches[0]!.events.map((e) => e.key)).toEqual(["check"]);
    const check = diagram.eventsByKey.get("check") as FragmentEvent;
    expect(check.branches.map((b) => b.condition)).toEqual(["OK", "Error"]);
    expect(check.path).toEqual([{ fragment: "retries", branch: 0 }]);
    expect(diagram.eventsByKey.get("b->a#1")!.path).toEqual([
      { fragment: "retries", branch: 0 },
      { fragment: "check", branch: 0 },
    ]);
    expect(diagram.events.map((e) => e.key)).toEqual([
      "retries",
      "par#1",
      "critical#1",
      "opt#1",
      "break#1",
      "region#1",
    ]);
    expect(
      (diagram.eventsByKey.get("par#1") as FragmentEvent).branches.map((b) => b.condition),
    ).toEqual([null, "Other"]);
  });

  it("refuses a wrong branch keyword and declarations in fragments", () => {
    expect(sequence('  alt "A" { a -> b } and "B" { a -> c }').codes).toEqual([
      "prop.invalid-value",
    ]);
    expect(sequence('  opt "A" { participant x }').codes).toEqual(["prop.unknown"]);
  });
});

describe("order-checked rules", () => {
  it("accepts a deactivation in each branch", () => {
    const { codes } = sequence(
      '  a -> api\n  activate api\n  alt "OK" {\n    deactivate api\n  } else "No" {\n    deactivate api\n  }',
    );
    expect(codes).toEqual([]);
  });

  it("reports a deactivation of an inactive participant", () => {
    const { compilation } = sequence("  a -> api\n  deactivate api");
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["sequence.activation"]);
  });

  it("reports events after destroy and late or double creation", () => {
    expect(sequence('  a -> session\n  destroy session\n  a -> session: "Ping"').codes).toEqual([
      "sequence.lifecycle",
    ]);
    expect(sequence("  a -> b\n  create b").codes).toEqual(["sequence.lifecycle"]);
    expect(sequence("  create b\n  a -> b\n  destroy b\n  destroy b").codes).toEqual([
      "sequence.lifecycle",
    ]);
  });

  it("reports unknown participants and groups used as participants", () => {
    expect(sequence("  activate ghost").codes).toEqual(["ref.unknown-element"]);
    expect(sequence("  group g { participant a }\n  a -> g").codes).toEqual([
      "ref.unknown-element",
    ]);
  });
});

describe("sequence placement", () => {
  it("reads space and gap", () => {
    const { diagram, codes } = sequence(
      '  a -> b as m1\n  note n over a "N"\n  placement {\n    space m1 20\n    space n 10\n    gap b 40\n    label m1 at 50% offset (0, -8)\n  }',
    );
    expect(codes).toEqual([]);
    expect(diagram.placement.map((p) => [p.statement, p.target])).toEqual([
      ["space", "m1"],
      ["space", "n"],
      ["gap", "b"],
      ["label", "m1"],
    ]);
  });

  it("refuses place with a hint", () => {
    const { compilation } = sequence("  a -> b\n  placement {\n    place a at (100, 100)\n  }");
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("prop.unknown");
    expect(d!.hints![0]).toContain("`space <event> <n>`");
  });

  it("refuses space on an anonymous event", () => {
    expect(sequence("  a -> b\n  placement { space a 10 }").codes).toEqual(["ref.unknown-element"]);
  });

  it("reads spacing and the sides, before by default", () => {
    const { diagram, codes } = sequence(
      "  spacing 56\n  a -> b as m1\n  b -> c as m2\n  placement {\n    space m1 20\n    space m2 10 after\n    gap b 24 before\n    gap c 30 after\n  }",
    );
    expect(codes).toEqual([]);
    expect(diagram.properties.spacing).toBe(56);
    expect(
      diagram.placement.map((p) =>
        p.statement === "space" || p.statement === "gap"
          ? [p.statement, p.target, p.amount, p.side]
          : [p.statement],
      ),
    ).toEqual([
      ["space", "m1", 20, "before"],
      ["space", "m2", 10, "after"],
      ["gap", "b", 24, "before"],
      ["gap", "c", 30, "after"],
    ]);
    expect(sequence("  a -> b").diagram.properties.spacing).toBeNull();
  });

  it("takes a negative gap between two participants, and both sides of one pair", () => {
    const { diagram, codes } = sequence(
      "  a -> b\n  b -> c\n  placement {\n    gap b -12\n    gap a 8 after\n    gap c -20 before\n  }",
    );
    expect(codes).toEqual([]);
    expect(diagram.placement.map((p) => ("amount" in p ? p.amount : null))).toEqual([-12, 8, -20]);
  });

  it("refuses a negative gap on the outer side of the first or the last participant", () => {
    const before = sequence("  a -> b\n  placement { gap a -10 }");
    expect(before.codes).toEqual(["prop.invalid-value"]);
    expect(before.compilation.diagnostics[0]!.message).toContain("first participant");
    expect(before.compilation.diagnostics[0]!.hints![0]).toContain("nothing left of `a`");
    const after = sequence("  a -> b\n  placement { gap b -10 after }");
    expect(after.codes).toEqual(["prop.invalid-value"]);
    expect(after.compilation.diagnostics[0]!.message).toContain("last participant");
    // On the inner side it is a tightening.
    expect(sequence("  a -> b\n  placement { gap a -10 after }").codes).toEqual([]);
  });

  it("refuses a negative space and a side that is not one, naming the form", () => {
    const space = sequence("  a -> b as m\n  placement { space m -5 }");
    expect(space.codes).toEqual(["prop.invalid-value"]);
    expect(space.compilation.diagnostics[0]!.message).toContain("0 or more");
    const side = sequence("  a -> b\n  placement { gap b 10 above }");
    expect(side.codes).toEqual(["prop.invalid-value"]);
    expect(side.compilation.diagnostics[0]!.message).toContain("`before` or `after`");
  });

  it("refuses a second gap on the same side of a participant, and takes one on each side", () => {
    expect(
      sequence("  a -> b\n  placement {\n    gap b 10\n    gap b 20 before\n  }").codes,
    ).toEqual(["placement.duplicate"]);
    expect(
      sequence("  a -> b\n  placement {\n    gap b 10\n    gap b 20 after\n  }").codes,
    ).toEqual([]);
  });

  it("refuses spacing outside 0 to 400", () => {
    expect(sequence("  spacing 401\n  a -> b").codes).toEqual(["prop.invalid-value"]);
    expect(sequence("  spacing 0\n  a -> b").codes).toEqual([]);
  });
});

describe("scenarios", () => {
  const body =
    '  a -> b as ask\n  alt check "Aprobado" {\n    b --> a as ok\n  } else "Rechazado" {\n    b --> a as no\n  }\n  loop retries "Poll" {\n    a -> b as poll\n  }\n  opt reminder "Remind" {\n    a -> b as remind\n  }\n';

  it("resolves a path", () => {
    const { diagram, codes } = sequence(
      `${body}  scenario rejected "Rechazado" {\n    choose check "Rechazado"\n    repeat retries 2\n    skip reminder\n  }`,
    );
    expect(codes).toEqual([]);
    const events = resolveScenario(diagram, "rejected")!;
    expect(flattenEvents(events).map((e) => e.key)).toEqual([
      "ask",
      "no",
      "retries",
      "poll",
      "retries@2",
      "poll@2",
    ]);
    const frames = events.filter((e): e is FragmentEvent => e.kind === "fragment");
    expect(frames.map((f) => f.branches[0]!.condition)).toEqual(["Poll 1/2", "Poll 2/2"]);
  });

  it("takes the first branch, one iteration and options by default", () => {
    const { diagram } = sequence(`${body}  scenario plain { }`);
    expect(flattenEvents(resolveScenario(diagram, "plain")!).map((e) => e.key)).toEqual([
      "ask",
      "ok",
      "retries",
      "poll",
      "remind",
    ]);
  });

  it("chooses branches by index", () => {
    const { diagram, codes } = sequence(`${body}  scenario second { choose check 2 }`);
    expect(codes).toEqual([]);
    expect(flattenEvents(resolveScenario(diagram, "second")!).map((e) => e.key)).toContain("no");
  });

  it.each([
    ['choose check "Pendiente"', "has no branch"],
    ["choose check 3", "has 2 branches"],
    ["choose retries 1", "does not apply"],
    ["repeat retries 0", "1 to 100"],
    ["skip nowhere", "Unknown fragment"],
  ])("reports `%s`", (statement, message) => {
    const { compilation } = sequence(`${body}  scenario bad { ${statement} }`);
    const [d] = compilation.diagnostics;
    expect(d!.code).toBe("sequence.scenario");
    expect(d!.message).toContain(message);
  });
});

describe("sequence JSON", () => {
  it("serialises events, async messages and scenarios", () => {
    const { compilation } = sequence(
      '  a -> b as m { kind async }\n  alt c "X" { b --> a }\n  scenario s { choose c 1 }',
    );
    const json = toJson(compilation).diagrams[0]!;
    expect(json.type).toBe("sequence");
    expect(json.relations[0]).toMatchObject({ key: "m", async: true });
    expect(json.events.map((e) => e.kind)).toEqual(["message", "fragment"]);
    expect(json.scenarios[0]).toMatchObject({ id: "s", choices: [{ kind: "choose", branch: 0 }] });
  });
});

describe("call blocks and returns", () => {
  const CALLS =
    '  customer -> api: "Pay" as pay {\n    kind async\n    description "The payment"\n    api -> bank: "Authorize" as authorize {\n      return "OK" as ok\n    }\n    note n over api "Checked"\n    return "Receipt"\n  }';

  it("holds events inside a call, its properties working beside them", () => {
    const { diagram, codes } = sequence(CALLS);
    expect(codes).toEqual([]);
    const [pay] = diagram.events;
    expect(pay!.kind).toBe("message");
    if (pay!.kind !== "message") return;
    expect(pay.events.map((e) => e.key)).toEqual(["authorize", "n", "api->customer#1"]);
    expect(pay.events.every((e) => e.path.at(-1) && "message" in e.path.at(-1)!)).toBe(true);
    const authorize = pay.events[0]!;
    expect(authorize.kind === "message" && authorize.events.map((e) => e.key)).toEqual(["ok"]);
    expect(authorize.kind === "message" && authorize.events[0]!.path).toEqual([
      { message: "pay" },
      { message: "authorize" },
    ]);
    const relation = diagram.relationsByKey.get("pay")!;
    expect([relation.async, relation.description]).toEqual([true, "The payment"]);
  });

  it("makes a return a dashed reply from the callee to the caller, naming its call", () => {
    const { diagram } = sequence(CALLS);
    const ok = diagram.relationsByKey.get("ok")!;
    expect([ok.from, ok.to, ok.line, ok.label, ok.returns, ok.heads]).toEqual([
      "bank",
      "api",
      "dashed",
      "OK",
      "authorize",
      "end",
    ]);
    const receipt = diagram.relationsByKey.get("api->customer#1")!;
    expect([receipt.returns, receipt.label, receipt.node.kind]).toEqual([
      "pay",
      "Receipt",
      "KeywordStatement",
    ]);
    // Every other relation answers nothing.
    expect(diagram.relationsByKey.get("pay")!.returns).toBeNull();
  });

  it("numbers a return with the written replies of the same pair, in source order", () => {
    const { diagram } = sequence('  a -> b { return }\n  b --> a: "Later"');
    expect(diagram.relations.map((r) => [r.key, r.returns])).toEqual([
      ["a->b#1", null],
      ["b->a#1", "a->b#1"],
      ["b->a#2", null],
    ]);
  });

  it("refuses a return outside a call, and an event after a return", () => {
    const outside = sequence("  a -> b\n  return");
    expect(outside.codes).toEqual(["sequence.return"]);
    expect(outside.compilation.diagnostics[0]!.message).toContain("inside the call's block");
    const after = sequence('  a -> b as call {\n    return\n    b -> c: "Too late"\n  }');
    expect(after.codes).toEqual(["sequence.return"]);
    expect(after.compilation.diagnostics[0]!.message).toBe(
      "`call` already returned; move this event before the `return`.",
    );
  });

  it("ends a branch with a return in it, and only that branch", () => {
    const { codes } = sequence(
      '  a -> b as call {\n    alt check "Yes" {\n      return "Y"\n    } else "No" {\n      b -> c\n      return "N"\n    }\n  }',
    );
    expect(codes).toEqual([]);
  });

  it("keeps the receiver active for the block: a deactivate of it there is refused", () => {
    expect(sequence("  a -> b as call {\n    deactivate b\n  }").codes).toEqual([
      "sequence.activation",
    ]);
    // An explicit activation inside nests deeper, and its deactivate is fine.
    expect(sequence("  a -> b as call {\n    activate b\n    deactivate b\n  }").codes).toEqual([]);
  });

  it("writes returns and nested events to the JSON", () => {
    const json = toJson(sequence(CALLS).compilation).diagrams[0]!;
    expect(json.relations.find((r) => r.key === "ok")).toMatchObject({ returns: "authorize" });
    const pay = json.events[0]!;
    expect(pay.kind === "message" && pay.events.map((e) => e.key)).toEqual([
      "authorize",
      "n",
      "api->customer#1",
    ]);
  });

  it("keeps a call's block in a scenario, repeated with the loop around it", () => {
    const { diagram } = sequence(
      '  loop poll "Until ready" {\n    a -> b as ask {\n      return "Not yet" as reply\n    }\n  }\n  scenario twice { repeat poll 2 }',
    );
    const events = resolveScenario(diagram, "twice")!;
    const loops = events.filter((e): e is FragmentEvent => e.kind === "fragment");
    const second = loops[1]!.branches[0]!.events[0]!;
    expect(second.key).toBe("ask@2");
    expect(second.kind === "message" && second.events.map((e) => e.key)).toEqual(["reply@2"]);
    expect(flattenEvents(diagram.events).map((e) => e.key)).toEqual(["poll", "ask", "reply"]);
  });
});
