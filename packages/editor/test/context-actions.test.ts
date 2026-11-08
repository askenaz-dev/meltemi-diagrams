import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasAction,
  type HostMessage,
} from "../src/index.js";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";

/** A canvas session on `text`, showing `diagram`, that applies the plans it answers. */
function open(text: string, diagram: string) {
  const session = new CanvasSession();
  let current = text;
  let rev = 1;
  let messages: readonly HostMessage[] = session.update(
    analyzeDocument({ text: current, revision: rev }),
  );
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
    messages: () => messages,
    act: (action: CanvasAction) => send({ type: "action", revision: rev, action }),
    status: () =>
      messages.find((m): m is HostMessage & { type: "status" } => m.type === "status")?.message,
    selection: () =>
      messages.find((m): m is HostMessage & { type: "render" } => m.type === "render")?.selection,
    inspector: () =>
      messages.find((m): m is HostMessage & { type: "inspector" } => m.type === "inspector")!.model,
  };
}

const PLACED = [
  "diagram checkout: flow {",
  "  layout assisted",
  "  node api",
  "  node db",
  "  node cache",
  "  api -> db as save",
  "  api -> cache",
  "  placement {",
  "    place api at (100, 100)",
  "    place db at (400, 100)",
  "    route save from api to db via [(250, 40)]",
  "  }",
  "}",
  "",
].join("\n");

afterEach(() => setLocale("en"));

describe("the layout mode from the canvas", () => {
  it("asks before automatic layout removes positions, and removes them once confirmed", () => {
    const canvas = open(PLACED, "checkout");
    const refused = canvas.act({ kind: "setLayoutMode", mode: "auto" });
    expect(refused.plan).toBeUndefined();
    const rejection = refused.messages[0] as HostMessage & { type: "rejected" };
    expect(rejection).toMatchObject({ type: "rejected", code: "edit.loses-placement" });
    expect(rejection.reason).toContain("2 positions and route");
    expect(canvas.text()).toBe(PLACED);
    expect(rejection.retry).toEqual({ kind: "setLayoutMode", mode: "auto", confirmed: true });
    const confirmed = canvas.act(rejection.retry!);
    expect(confirmed.plan).toBeDefined();
    expect(canvas.text()).toContain("  layout auto\n");
    expect(canvas.text()).not.toContain("place ");
    expect(canvas.text()).not.toContain("route save");
    expect(canvas.text()).not.toContain("placement");
  });

  it("changes to automatic at once when nothing would go", () => {
    const canvas = open(
      "diagram checkout: flow {\n  layout assisted\n  node api\n  node db\n  api -> db\n}\n",
      "checkout",
    );
    expect(canvas.act({ kind: "setLayoutMode", mode: "auto" }).plan).toBeDefined();
    expect(canvas.text()).toContain("  layout auto\n");
  });

  it("writes the missing positions before manual", () => {
    const canvas = open(PLACED, "checkout");
    expect(canvas.act({ kind: "setLayoutMode", mode: "manual" }).plan).toBeDefined();
    expect(canvas.text()).toContain("  layout manual\n");
    expect(canvas.text()).toMatch(/place cache at \(-?\d+, -?\d+\)/);
    expect(canvas.text()).toContain("place api at (100, 100)");
  });

  it("writes assisted alone", () => {
    const text = "diagram checkout: flow {\n  node api\n  node db\n  api -> db\n}\n";
    const canvas = open(text, "checkout");
    expect(canvas.act({ kind: "setLayoutMode", mode: "assisted" }).plan).toBeDefined();
    expect(canvas.text()).toBe(
      "diagram checkout: flow {\n  layout assisted\n  node api\n  node db\n  api -> db\n}\n",
    );
  });

  it("asks the same from the inspector's Layout field", () => {
    const canvas = open(PLACED, "checkout");
    const refused = canvas.act({ kind: "setField", ids: [], field: "layout", value: "auto" });
    expect(refused.messages[0]).toMatchObject({ type: "rejected", code: "edit.loses-placement" });
    expect(canvas.text()).toBe(PLACED);
  });

  it("says it in Spanish", () => {
    setLocale("es");
    const canvas = open(PLACED, "checkout");
    const refused = canvas.act({ kind: "setLayoutMode", mode: "auto" });
    expect((refused.messages[0] as { reason: string }).reason).toContain(
      "se perderán las 2 posiciones y la ruta que moviste a mano",
    );
  });

  it("is refused on a sequence diagram", () => {
    const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");
    const canvas = open(payment, "payment");
    const refused = canvas.act({ kind: "setLayoutMode", mode: "auto" });
    expect(refused.messages[0]).toMatchObject({ type: "rejected", code: "edit.invalid-value" });
  });
});

describe("numbering messages", () => {
  const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

  it("writes autonumber, and removes it whatever its start", () => {
    const canvas = open(payment, "payment");
    expect(canvas.act({ kind: "setAutonumber", on: true }).plan).toBeDefined();
    expect(canvas.text()).toMatch(/\n {2}autonumber\n/);
    expect(canvas.status()).toBe("The messages are numbered from 1.");
    const from10 = open(canvas.text().replace("autonumber\n", "autonumber 10\n"), "payment");
    expect(from10.act({ kind: "setAutonumber", on: false }).plan).toBeDefined();
    expect(from10.text()).toBe(payment);
  });

  it("is refused outside sequence diagrams", () => {
    const canvas = open(PLACED, "checkout");
    expect(canvas.act({ kind: "setAutonumber", on: true }).messages[0]).toMatchObject({
      type: "rejected",
    });
  });

  it("is refused while a scenario is previewed", () => {
    const canvas = open(payment, "payment");
    canvas.send({ type: "pickScenario", scenario: "approved" });
    const refused = canvas.act({ kind: "setAutonumber", on: true });
    expect(refused.plan).toBeUndefined();
    expect(canvas.text()).toBe(payment);
  });
});

describe("reversing from the canvas", () => {
  it("reverses a named relation and says its new direction", () => {
    const canvas = open(PLACED, "checkout");
    expect(canvas.act({ kind: "reverse", ids: ["save"] }).plan).toBeDefined();
    expect(canvas.text()).toContain("db -> api as save");
    expect(canvas.text()).toContain("route save from db to api via [(250, 40)]");
    expect(canvas.status()).toBe("The relation now goes from `db` to `api`.");
    expect(canvas.selection()).toEqual(["save"]);
  });

  it("keeps an anonymous relation selected under its new key", () => {
    const canvas = open(PLACED, "checkout");
    expect(canvas.act({ kind: "reverse", ids: ["api->cache#1"] }).plan).toBeDefined();
    expect(canvas.text()).toContain("  cache -> api\n");
    expect(canvas.selection()).toEqual(["cache->api#1"]);
  });

  it("names the participant a written activation now activates", () => {
    const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");
    const canvas = open(payment, "payment");
    expect(canvas.act({ kind: "reverse", ids: ["pay"] }).plan).toBeDefined();
    expect(canvas.text()).toContain('api -> customer: "Pagar" as pay\n  activate customer');
    expect(canvas.status()).toContain("now activates `customer`");
  });

  it("reverses a free line", () => {
    const canvas = open("diagram s: free {\n  line l1 from (0, 0) to (100, 0)\n}\n", "s");
    expect(canvas.act({ kind: "reverse", ids: ["l1"] }).plan).toBeDefined();
    expect(canvas.text()).toContain("line l1 from (100, 0) to (0, 0)");
    expect(canvas.status()).toBe("`l1` now runs the other way.");
  });

  it("refuses a box", () => {
    const canvas = open(PLACED, "checkout");
    expect(canvas.act({ kind: "reverse", ids: ["api"] }).messages[0]).toMatchObject({
      type: "rejected",
      code: "edit.unsafe-target",
    });
  });
});

describe("effects for several targets", () => {
  it("turns an effect on where it is missing and keeps it where it is", () => {
    const text = PLACED.replace(
      "  api -> cache\n",
      "  api -> cache as warm\n  animate save { effect pulse }\n",
    );
    const canvas = open(text, "checkout");
    canvas.send({ type: "select", ids: ["save", "warm"] });
    expect(canvas.inspector().fields.find((f) => f.name === "effect.pulse")).toMatchObject({
      mixed: true,
    });
    expect(
      canvas.act({ kind: "setField", ids: ["save", "warm"], field: "effect.pulse", value: "on" })
        .plan,
    ).toBeDefined();
    expect(canvas.text()).toContain("animate save { effect pulse }");
    expect(canvas.text()).toContain("animate warm { effect pulse }");
    expect(
      canvas.act({ kind: "setField", ids: ["save", "warm"], field: "effect.pulse", value: null })
        .plan,
    ).toBeDefined();
    expect(canvas.text()).not.toContain("animate");
  });
});
