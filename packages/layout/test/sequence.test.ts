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

describe("heads measured as drawn", () => {
  const body =
    '  actor customer "Customer"\n  participant api "API"\n  database db "DB"\n  collections jobs "Jobs"\n  customer -> api: "Pay" as pay\n  activate api\n  api -> db as save\n  deactivate api';

  /** The head group of a participant and its first drawn rectangle or path, in the scene. */
  const head = (scene: Scene, id: string) => groups(scene, "element").find((g) => g.id === id)!;

  it("gives a box beside an actor the bottom 40 units of the head row", () => {
    const result = run(body);
    const offset = result.offset!;
    const customer = result.boxes!.get("customer")!;
    const api = result.boxes!.get("api")!;
    // The actor's figure and label fill the row; the box sits at its bottom.
    expect(customer.height).toBe(60);
    expect(api).toMatchObject({ y: customer.y + 20, height: 40 });
    const rect = head(result.scene!, "api").items.find((i) => i.kind === "rect")!;
    expect(rect).toMatchObject({
      x: api.x + offset.x,
      y: api.y + offset.y,
      width: api.width,
      height: api.height,
    });
    expect(head(result.scene!, "api").bounds).toMatchObject({
      x: api.x + offset.x,
      y: api.y + offset.y,
      width: api.width,
      height: 40,
      radius: 8,
    });
    // A figure keeps its cell.
    expect(head(result.scene!, "customer").bounds).toMatchObject({ height: 60 });
  });

  it("counts a collections head's second box", () => {
    const result = run(body);
    const jobs = result.boxes!.get("jobs")!;
    const api = result.boxes!.get("api")!;
    expect(jobs.y).toBe(api.y - 4);
    expect(jobs.height).toBe(44);
    const back = head(result.scene!, "jobs").items.find((i) => i.kind === "rect")!;
    expect(back).toMatchObject({ y: jobs.y + result.offset!.y });
  });

  it("reports the shapes and radii of heads", () => {
    const result = run(body);
    expect(result.shapes!.get("api")).toBe("rounded");
    expect(result.radii!.get("api")).toBe(8);
    expect(result.shapes!.get("db")).toBe("cylinder");
    expect(result.radii!.has("db")).toBe(false);
    expect(result.shapes!.get("jobs")).toBe("rounded");
    // A figure has no outline to report.
    expect(result.shapes!.has("customer")).toBe(false);
  });

  it("measures a created head as drawn at its row", () => {
    const result = run('  actor a\n  a -> b\n  create c\n  b -> c: "new" as make');
    const c = result.boxes!.get("c")!;
    const b = result.boxes!.get("b")!;
    expect(c.height).toBe(40);
    expect(c.y).toBeGreaterThan(b.y);
    // The creating message ends on the middle of the drawn box.
    const end = result.connectors!.get("make")!.points.at(-1)!;
    expect(end.y).toBe(c.y + c.height / 2);
  });

  it("keeps the box of a diagram without figures as the whole row", () => {
    const result = run("  participant a\n  participant b\n  a -> b");
    expect(result.boxes!.get("a")!.height).toBe(40);
  });
});

describe("tokens of the drawing", () => {
  const body =
    '  actor customer\n  participant api\n  customer -> api: "Pay" as pay\n  activate api\n  api -> api as check\n  deactivate api\n  note n over api "Checks"';

  const strokes = (theme: string) => {
    const compilation = compile(
      `theme plain {\n  extends "${theme}"\n  frame none\n}\n\ndiagram s: sequence {\n  theme "plain"\n${body}\n}\n`,
    );
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!);
    const scene = result.scene!;
    const lifeline = groups(scene, "lifeline").find((g) => g.id === "api")!;
    const [line, bar] = lifeline.items;
    const rect = groups(scene, "element")
      .find((g) => g.id === "api")!
      .items.find((i) => i.kind === "rect")!;
    const note = groups(scene, "event").find((g) => g.id === "n")!.items[0]!;
    const pay = groups(scene, "relation").find((g) => g.id === "pay")!.items[0]!;
    return { line, bar, rect, note, pay };
  };

  it("strokes heads, bars, notes and lifelines with muted under technical.light", () => {
    const { line, bar, rect, note, pay } = strokes("technical.light");
    expect(rect).toMatchObject({ stroke: "#526579", fill: "#FFFFFF" });
    expect(bar).toMatchObject({ kind: "rect", stroke: "#526579", fill: "#FFFFFF" });
    expect(note).toMatchObject({ stroke: "#526579" });
    // The lifeline is a dashed guide at half strength behind the messages.
    expect(line).toMatchObject({ kind: "polyline", stroke: "#526579", dashed: true, opacity: 0.5 });
    expect(pay).toMatchObject({ kind: "polyline", stroke: "#526579", strokeWidth: 1.3 });
  });

  it("takes the dark theme's muted under technical.dark", () => {
    const { line, rect } = strokes("technical.dark");
    expect(rect).toMatchObject({ stroke: THEMES["technical.dark"]!.muted });
    expect(line).toMatchObject({ stroke: THEMES["technical.dark"]!.muted });
  });

  it("lets a written stroke replace muted on the head and the lifeline", () => {
    const result = run(
      "  participant api\n  participant db\n  api -> db\n  style api { stroke danger }",
    );
    const scene = result.scene!;
    const danger = THEMES["technical.light"]!.danger;
    const rect = groups(scene, "element")
      .find((g) => g.id === "api")!
      .items.find((i) => i.kind === "rect")!;
    expect(rect).toMatchObject({ stroke: danger });
    expect(groups(scene, "lifeline").find((g) => g.id === "api")!.items[0]).toMatchObject({
      stroke: danger,
    });
  });
});

describe("a participant the diagram does not draw", () => {
  it("reports the unknown element of an activation and draws nothing", () => {
    // Messages declare their participants; an activation of one nothing names does not.
    const compilation = compile(
      "diagram s: sequence {\n  participant a\n  a -> b\n  activate billing\n}\n",
    );
    expect(compilation.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
    expect(compilation.document.diagrams[0]!.hasErrors).toBe(true);
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
