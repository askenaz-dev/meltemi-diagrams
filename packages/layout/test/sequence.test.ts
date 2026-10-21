import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  TextMetrics,
  THEMES,
  estimateMeasurer,
  layoutDiagram,
  type GroupItem,
  type LayoutOptions,
  type Scene,
  type SceneItem,
} from "../src/index.js";

function run(body: string, options: LayoutOptions = {}) {
  const compilation = compile(
    `theme plain {\n  extends "technical.light"\n  frame none\n}\n\ndiagram s: sequence {\n  theme "plain"\n${body}\n}\n`,
  );
  expect(compilation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, options);
  expect(result.scene).not.toBeNull();
  return result;
}

function groups(scene: Scene, role: string): GroupItem[] {
  return scene.items.filter((i): i is GroupItem => i.kind === "group" && i.role === role);
}

function texts(items: readonly SceneItem[]): string[] {
  return items.flatMap((i) =>
    i.kind === "text" ? [i.text] : i.kind === "group" ? texts(i.items) : [],
  );
}

describe("an empty diagram", () => {
  it("lays out with a finite size, as a new diagram has no participant yet", () => {
    const result = run("");
    expect(Number.isFinite(result.scene!.width)).toBe(true);
    expect(Number.isFinite(result.scene!.height)).toBe(true);
    expect(JSON.stringify(result.scene)).not.toContain("NaN");
    // With the frame, the title still sets the width.
    const framed = layoutDiagram(
      compile('diagram s: sequence {\n  title "checkout"\n}\n'),
      compile('diagram s: sequence {\n  title "checkout"\n}\n').document.diagrams[0]!,
    );
    expect(JSON.stringify(framed.scene)).not.toContain("NaN");
  });
});

describe("columns", () => {
  it("orders participants as declared and keeps labels between them", () => {
    const result = run(
      '  participant a "A"\n  participant b "B"\n  a -> b: "A rather long message label" as m',
    );
    const a = result.boxes!.get("a")!;
    const b = result.boxes!.get("b")!;
    const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
    const width = new TextMetrics(estimateMeasurer, THEMES["technical.light"]!).width(
      "A rather long message label",
      "body",
      400,
      THEMES["technical.light"]!.relationLabelSize,
    );
    expect(centre(b) - centre(a)).toBeGreaterThanOrEqual(width + 24);
  });

  it("adds a gap before a participant", () => {
    const plain = run("  a -> b").boxes!.get("b")!.x;
    const gapped = run("  a -> b\n  placement { gap b 40 }").boxes!.get("b")!.x;
    expect(gapped - plain).toBe(40);
  });
});

describe("rows keep event order", () => {
  it("draws events top to bottom and adds space", () => {
    const body = "  a -> b as m1\n  b -> c as m2\n  c -> a as m3";
    const plain = run(body);
    const ys = ["m1", "m2", "m3"].map((k) => plain.connectors!.get(k)!.points[0]!.y);
    expect(ys[0]).toBeLessThan(ys[1]!);
    expect(ys[1]).toBeLessThan(ys[2]!);
    const spaced = run(`${body}\n  placement { space m2 40 }`);
    expect(spaced.connectors!.get("m2")!.points[0]!.y - ys[1]!).toBe(40);
    expect(spaced.events!.get("m2")!.y).toBeGreaterThan(plain.events!.get("m1")!.y);
  });

  it("loops self-calls to the right", () => {
    const result = run('  a -> a: "Validate" as v');
    const points = result.connectors!.get("v")!.points;
    expect(points).toHaveLength(4);
    expect(points[1]!.x).toBeGreaterThan(points[0]!.x);
    expect(points[3]!.y).toBeGreaterThan(points[0]!.y);
  });
});

describe("drawing", () => {
  const payment = readFileSync(join(CORPUS_ROOT, "valid", "sequence", "payment.meltemi"), "utf8");

  it("draws the payment sequence with its fragment, bar and replies", () => {
    const compilation = compile(payment);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const scene = result.scene!;
    const headers = groups(scene, "label").filter((g) => g.id === "result");
    expect(texts(headers)).toEqual(["alt", "[Aprobado]", "[Rechazado]"]);
    const api = groups(scene, "lifeline").find((g) => g.id === "api")!;
    expect(api.items.filter((i) => i.kind === "rect")).toHaveLength(1);
    const approved = groups(scene, "relation").find((g) => g.id === "approved")!;
    expect(approved.items[0]).toMatchObject({ kind: "polyline", dashed: true });
    expect(approved.items[1]).toMatchObject({ kind: "polyline", dashed: false });
  });

  it("starts an activation bar at the arrow that activates it", () => {
    const result = run(
      '  customer -> api: "Pagar" as pay\n  activate api\n  api -> bank as auth\n  deactivate api',
    );
    const scene = result.scene!;
    const bar = groups(scene, "lifeline")
      .find((g) => g.id === "api")!
      .items.find((i) => i.kind === "rect")!;
    const pay = result.connectors!.get("pay")!.points[0]!.y + result.offset!.y;
    const auth = result.connectors!.get("auth")!.points[0]!.y + result.offset!.y;
    expect(bar).toMatchObject({ y: pay });
    expect(bar.kind === "rect" && bar.y + bar.height).toBe(auth);
  });

  it("draws created heads at their row and destroyed lifelines ending in a cross", () => {
    const result = run('  a -> b\n  create c\n  b -> c: "new" as make\n  destroy c');
    const head = result.boxes!.get("c")!;
    expect(head.y).toBeGreaterThan(result.boxes!.get("a")!.y);
    expect(groups(result.scene!, "event").some((g) => g.id === "destroy#1")).toBe(true);
  });

  it("numbers messages from the autonumber start", () => {
    const result = run("  autonumber 5\n  a -> b\n  b -> a");
    const numbers = groups(result.scene!, "relation").flatMap((g) =>
      g.items.flatMap((i) => (i.kind === "text" ? [i.text] : [])),
    );
    expect(numbers).toEqual(["5", "6"]);
  });

  it("draws notes, dividers and delays", () => {
    const result = run('  a -> b\n  note n over a, b "Both"\n  divider "Phase"\n  delay "Later"');
    expect(result.boxes!.has("n")).toBe(true);
    expect(texts(groups(result.scene!, "event"))).toEqual(["Both", "Phase", "Later"]);
  });
});

describe("scenarios", () => {
  const body =
    '  a -> b as ask\n  alt check "Yes" {\n    b --> a as ok\n  } else "No" {\n    b --> a as no\n  }\n  loop again "Poll" {\n    a -> b as poll\n  }\n  scenario rejected "Rejected" {\n    choose check "No"\n    repeat again 2\n  }';

  it("lays out one path", () => {
    const result = run(body, { scenario: "rejected" });
    expect([...result.connectors!.keys()]).toEqual(["ask", "no", "poll", "poll@2"]);
    expect(result.scene!.title).toBe("Rejected");
    expect(texts(groups(result.scene!, "label"))).toEqual([
      "loop",
      "[Poll 1/2]",
      "loop",
      "[Poll 2/2]",
    ]);
  });

  it("draws every event without a scenario", () => {
    const result = run(body);
    expect([...result.connectors!.keys()]).toEqual(["ask", "ok", "no", "poll"]);
  });
});
