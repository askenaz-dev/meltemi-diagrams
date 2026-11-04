import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import {
  coverageMarkdown,
  detectFormat,
  importText,
  isProseCell,
  MERMAID_COVERAGE,
  mergeImport,
  PLANTUML_COVERAGE,
  sanitizeId,
  type ImportResult,
} from "@meltemi/diagrams-import";
import { COVERAGE_ES } from "../src/coverage-es.js";

const engine = createElkEngine();
const codes = (r: ImportResult) => r.findings.map((f) => f.code);
const constructs = (r: ImportResult) => r.findings.map((f) => f.construct);

function imported(
  text: string,
  fileName = "sheet.mmd",
  readFile?: (p: string) => string | undefined,
): string {
  const result = importText(text, { fileName, ...(readFile ? { readFile } : {}) });
  expect(result.text, JSON.stringify(result.findings, null, 2)).not.toBeNull();
  expect(compile(result.text!).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return result.text!;
}

describe("diagram import", () => {
  it("imports a simple flowchart named after its file", () => {
    const result = importText("flowchart LR\n  a --> b", { fileName: "checkout.mmd" });
    expect(result.status).toBe("complete");
    expect(result.format).toBe("mermaid");
    expect(result.diagrams.map((d) => [d.id, d.type])).toEqual([["checkout", "flow"]]);
    expect(result.text).toContain("diagram checkout: flow {");
    expect(compile(result.text!).ok).toBe(true);
  });

  it("never throws on noise", () => {
    const noise = String.fromCharCode(...Array.from({ length: 300 }, (_, i) => (i * 7919) % 65000));
    const result = importText(noise);
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
    expect(codes(result)).toContain("import.unknown-format");
  });

  it("detects formats by extension and content", () => {
    expect(detectFormat("flowchart LR", "checkout.mmd")).toBe("mermaid");
    expect(detectFormat("anything", "a.puml")).toBe("plantuml");
    expect(detectFormat("anything", "a.iuml")).toBe("plantuml");
    expect(detectFormat("# readme", "README.md")).toBe("markdown");
    expect(detectFormat("@startuml\nA -> B\n@enduml", "diagram.txt")).toBe("plantuml");
    expect(detectFormat("---\ntitle: x\n---\n%% note\nsequenceDiagram\n", "x.txt")).toBe("mermaid");
    expect(detectFormat("Intro\n\n```mermaid\ngraph TD\n```\n", "x.txt")).toBe("markdown");
    expect(detectFormat("just prose", "notes.txt")).toBeNull();
  });

  it("lets an explicit format win", () => {
    const result = importText("flowchart LR\n  a --> b", {
      fileName: "notes.txt",
      format: "mermaid",
    });
    expect(result.status).toBe("complete");
  });

  it("keeps imports complete when it only approximates", () => {
    const result = importText("flowchart LR\n  a[\\Retry\\] ==> b", { fileName: "x.mmd" });
    expect(result.status).toBe("complete");
    expect(constructs(result)).toContain("flowchart.shape.lean_left");
    expect(result.text).toContain("width 3");
  });

  it("reports unreadable lines and marks the import partial", () => {
    const result = importText("flowchart LR\n  a --> b\n  A --=> B\n", { fileName: "x.mmd" });
    expect(result.status).toBe("partial");
    const syntax = result.findings.find((f) => f.code === "import.syntax")!;
    expect(syntax.range.start.line).toBe(3);
    expect(syntax.essential).toBe(true);
    expect(codes(result)).toContain("import.partial");
    expect(result.text).toContain("// Not imported: A --=> B");
    expect(result.text).not.toMatch(/node A\b/);
  });

  it("fails on unsupported diagrams", () => {
    const result = importText("classDiagram\n  A <|-- B", { fileName: "x.mmd" });
    expect(result.status).toBe("failed");
    expect(codes(result)).toEqual(["import.unsupported-diagram"]);
    expect(result.findings[0]!.hints?.[0]).toContain("flowchart");
  });

  it("rewrites ids and keeps the visible text", () => {
    expect(sanitizeId("order-api")).toBe("order_api");
    expect(sanitizeId("1")).toBe("n1");
    expect(sanitizeId("Café crème")).toBe("Cafe_creme");
    expect(sanitizeId("node")).toBe("node");
    const result = importText("flowchart LR\n  order-api[Order API]\n  1 --> order-api", {
      fileName: "x.mmd",
    });
    expect(result.text).toContain('node order_api "Order API"');
    expect(result.text).toContain('node n1 "1"');
    expect(result.findings.filter((f) => f.code === "import.renamed-id")).toHaveLength(2);
  });

  it("makes colliding ids unique", () => {
    const text = imported("flowchart LR\n  a-b --> a_b\n  a_b --> a.b", "x.mmd");
    expect(text).toContain("node a_b_2");
  });

  it("keeps comments before the statement that follows them", () => {
    const text = imported("flowchart LR\n  %% payment path\n  pay --> bank", "x.mmd");
    expect(text).toContain("  // payment path\n  pay -> bank");
  });

  it("is deterministic and starts with the header", () => {
    const source = "sequenceDiagram\n  A->>B: hi\n  B-->>A: bye";
    const a = importText(source, { fileName: "x.mmd" }).text!;
    expect(importText(source, { fileName: "x.mmd" }).text).toBe(a);
    expect(
      a.startsWith('language "0.2"\n\n// Imported from x.mmd (mermaid) by meltemi-diagrams.\n'),
    ).toBe(true);
  });

  it("imports the diagram blocks of a Markdown file", () => {
    const md = [
      "# Shop",
      "",
      "## Checkout",
      "",
      "```mermaid",
      "flowchart LR",
      "  a --> b",
      "```",
      "",
      "## Payment",
      "",
      "```plantuml",
      "@startuml",
      "Alice -> Bob : pay",
      "@enduml",
      "```",
      "",
    ].join("\n");
    const result = importText(md, { fileName: "README.md" });
    expect(result.format).toBe("markdown");
    expect(result.diagrams.map((d) => [d.id, d.type])).toEqual([
      ["checkout", "flow"],
      ["payment", "sequence"],
    ]);
    expect(result.diagrams[1]!.source.range.start.line).toBe(13);
  });

  it("fails Markdown without diagram blocks", () => {
    const result = importText("# Title\n\n```js\nx\n```\n", { fileName: "README.md" });
    expect(result.status).toBe("failed");
    expect(codes(result)).toEqual(["import.unsupported-diagram"]);
  });

  it("keeps the coverage docs in step with the tables, in English and in Spanish", () => {
    for (const [folder, locale] of [
      ["docs/import", "en"],
      ["docs/es/import", "es"],
    ] as const) {
      for (const format of ["mermaid", "plantuml"] as const) {
        const path = `${folder}/${format}.md`;
        const file = fileURLToPath(new URL(`../../../${path}`, import.meta.url));
        const written = readFileSync(file, "utf8");
        expect(written, `${path} is out of date: run pnpm import:docs`).toBe(
          coverageMarkdown(format, locale),
        );
      }
    }
  });

  it("words every prose cell of the tables in Spanish", () => {
    const entries = [...MERMAID_COVERAGE, ...PLANTUML_COVERAGE];
    const cells = new Set(
      entries.flatMap((e) => [e.section, e.source, e.target]).filter((c) => isProseCell(c)),
    );
    const diagramKeywords = new Set([
      "flowchart",
      "sequenceDiagram",
      "architecture-beta",
      "block-beta",
      "C4",
      "C4-PlantUML",
    ]);
    const missing = [...cells].filter(
      (c) => !diagramKeywords.has(c) && COVERAGE_ES[c] === undefined,
    );
    expect(missing).toEqual([]);
  });
});

describe("mermaid import", () => {
  it("takes the title from the front matter", () => {
    const text = imported("---\ntitle: Checkout\n---\nflowchart LR\n  a --> b", "flow.mmd");
    expect(text).toContain("diagram checkout: flow {");
    expect(text).toContain('title "Checkout"');
  });

  it("maps shapes", () => {
    const result = importText("flowchart TB\n  a[Start]\n  b{Paid?}\n  c[(Orders)]\n  d{{Retry}}", {
      fileName: "x.mmd",
    });
    const text = imported("flowchart TB\n  a[Start]\n  b{Paid?}\n  c[(Orders)]\n  d{{Retry}}");
    expect(text).toContain('node a "Start"');
    expect(text).toContain('decision b "Paid?"');
    expect(text).toContain('data c "Orders"');
    expect(text).toContain('node d "Retry"');
    expect(text).toContain("style d { shape hexagon }");
    expect(text.indexOf("style d")).toBeGreaterThan(text.indexOf('node d "Retry"'));
    expect(text).not.toMatch(/style [abc] /);
    expect(result.findings.filter((f) => f.code === "import.approximated")).toEqual([]);
  });

  it("draws a mirrored shape as the nearest one", () => {
    const result = importText("flowchart TB\n  e[\\Input\\]", { fileName: "x.mmd" });
    expect(result.text).toContain('node e "Input"');
    expect(result.text).toContain("style e { shape parallelogram }");
    const approximated = result.findings.filter((f) => f.code === "import.approximated");
    expect(approximated.map((f) => [f.construct, f.message])).toEqual([
      ["flowchart.shape.lean_left", "The lean left shape is drawn as a parallelogram."],
    ]);
    expect(compile(result.text!).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it.each([
    ["([t])", "pill", null],
    ["[[t]]", "framed", null],
    ["((t))", "circle", null],
    [">t]", "flag", null],
    ["{{t}}", "hexagon", null],
    ["[/t/]", "parallelogram", null],
    ["[/t\\]", "trapezoid", null],
    ["(((t)))", "circle", "flowchart.shape.doublecircle"],
    ["[\\t\\]", "parallelogram", "flowchart.shape.lean_left"],
    ["[\\t/]", "trapezoid", "flowchart.shape.inv_trapezoid"],
    ['@{ shape: hex, label: "t" }', "hexagon", null],
    ['@{ shape: lean-l, label: "t" }', "parallelogram", "flowchart.shape.lean_left"],
    ['@{ shape: doc, label: "t" }', "document", null],
    ['@{ shape: tri, label: "t" }', "triangle", null],
    ['@{ shape: fr-rect, label: "t" }', "framed", null],
  ])("writes the flowchart shape %s as `shape %s`", (written, shape, approximated) => {
    const result = importText(`flowchart TB\n  n${written}`, { fileName: "x.mmd" });
    expect(result.text).toContain('node n "t"');
    expect(result.text).toContain(`style n { shape ${shape} }`);
    expect(
      result.findings.filter((f) => f.code === "import.approximated").map((f) => f.construct),
    ).toEqual(approximated === null ? [] : [approximated]);
    expect(compile(result.text!).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("writes the shape before the styles of a node", () => {
    const text = imported("flowchart LR\n  a{{Retry}} --> b\n  style a fill:#f96");
    expect(text).toContain('style a { shape hexagon; fill "#f96" }');
  });

  it("declares a node in the subgraph that mentions it", () => {
    const text = imported("flowchart LR\n  a --> b\n  subgraph backend\n    b\n  end", "x.mmd");
    expect(text).toMatch(/group backend \{\n\s+node b\n\s+\}/);
    expect(text).toContain("a -> b");
  });

  it("expands chains and lists", () => {
    const text = imported("flowchart LR\n  a & b --> c -->|done| d", "x.mmd");
    expect(text).toContain("a -> c\n");
    expect(text).toContain("b -> c\n");
    expect(text).toContain('c -> d: "done"');
  });

  it("writes open links as lines, unnamed and unstyled", () => {
    const text = imported("flowchart LR\n  a --- b\n  c -.- d", "x.mmd");
    expect(text).toContain("a -- b\n");
    expect(text).toContain("c --- d\n");
    expect(text).not.toContain("as e1");
    expect(text).not.toContain("arrowhead");
  });

  it("writes a thick open link as a line with width 3", () => {
    const text = imported("flowchart LR\n  a === b", "x.mmd");
    expect(text).toContain("a -- b as e1");
    expect(text).toContain("style e1 { width 3 }");
    expect(text).not.toContain("arrowhead");
  });

  it("maps class definitions", () => {
    const text = imported(
      "flowchart LR\n  classDef hot fill:#f96,stroke:#333,stroke-width:4px\n  a:::hot --> b",
      "x.mmd",
    );
    expect(text).toContain('class hot { fill "#f96"; stroke "#333"; width 4 }');
    expect(text).toContain("node a { class hot }");
  });

  it("maps the activation shorthand", () => {
    const text = imported("sequenceDiagram\n  Alice->>+John: Hello\n  John-->>-Alice: Hi", "x.mmd");
    expect(text).toContain(
      'Alice -> John: "Hello"\n  activate John\n  John --> Alice: "Hi"\n  deactivate John',
    );
  });

  it("maps alternatives with ids", () => {
    const text = imported(
      "sequenceDiagram\n  a->>b: x\n  alt ok\n    b-->>a: y\n  else declined\n    b-->>a: z\n  end",
      "x.mmd",
    );
    expect(text).toContain('alt alt1 "ok" {');
    expect(text).toContain('} else "declined" {');
  });

  it("turns architecture sides into routes", () => {
    const text = imported(
      "architecture-beta\n  service db(database)[DB]\n  service server(server)[Server]\n  db:L -- R:server",
      "x.mmd",
    );
    expect(text).toContain("db -- server as e1");
    expect(text).toContain("route e1 from db.west to server.east");
    expect(text).not.toContain("style e1");
    expect(text).toContain('style db { icon "tabler:database" }');
  });

  it("drops icons of packs the project lacks", () => {
    const source = "architecture-beta\n  service fn(logos:aws-lambda)[Function]";
    const without = importText(source, { fileName: "x.mmd" });
    expect(without.text).not.toContain("logos:aws-lambda");
    expect(constructs(without)).toContain("architecture.icon");
    const withPack = importText(source, {
      fileName: "x.mmd",
      hasIcon: (n) => n === "logos:aws-lambda",
    });
    expect(withPack.text).toContain('icon "logos:aws-lambda"');
  });

  it("lays block diagrams out on a grid", () => {
    const text = imported("block-beta\n  columns 3\n  a b c\n  d:2 e", "x.mmd");
    expect(text).toContain("diagram x: free");
    expect(text).toContain("place d at (168, 126)");
    expect(text).toContain("size d (308, 56)");
    expect(text).toContain("place e at (420, 126)");
  });

  it("keeps the shapes of blocks", () => {
    const result = importText('block-beta\n  a{{"Hex"}}\n  b[/"Lean"/]\n  c((Round))\n  d(Soft)', {
      fileName: "x.mmd",
    });
    expect(result.text).toContain('box a "Hex"');
    expect(result.text).toContain("style a { shape hexagon }");
    expect(result.text).toContain('box b "Lean"');
    expect(result.text).toContain("style b { shape parallelogram }");
    expect(result.text).toContain("style c { shape circle }");
    // Rounded is the box's own shape.
    expect(result.text).not.toContain("style d");
    expect(result.findings.filter((f) => f.code === "import.approximated")).toEqual([]);
    expect(compile(result.text!).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("draws mirrored blocks as the nearest shape", () => {
    const result = importText("block-beta\n  a[\\In\\]\n  b[\\Top/]\n  c(((Stop)))", {
      fileName: "x.mmd",
    });
    expect(result.text).toContain("style a { shape parallelogram }");
    expect(result.text).toContain("style b { shape trapezoid }");
    expect(result.text).toContain("style c { shape circle }");
    expect(constructs(result)).toEqual([
      "blockbeta.shape.lean_left",
      "blockbeta.shape.inv_trapezoid",
      "blockbeta.shape.doublecircle",
    ]);
  });

  it("draws block arrows as arrows pointing right", () => {
    const result = importText('block-beta\n  r<["Go"]>(right)\n  l<["Back"]>(left)', {
      fileName: "x.mmd",
    });
    expect(result.text).toContain('box r "Go"');
    expect(result.text).toContain("style r { shape arrow }");
    expect(result.text).toContain('box l "Back"');
    expect(result.text).toContain("style l { shape arrow }");
    const approximated = result.findings.filter((f) => f.code === "import.approximated");
    expect(approximated.map((f) => [f.construct, f.range.start.line, f.message])).toEqual([
      ["blockbeta.arrow.direction", 3, "The block arrow is drawn pointing right."],
    ]);
    expect(result.coverage[0]!.constructs).toContainEqual({
      construct: "blockbeta.arrow",
      status: "mapped",
      count: 1,
    });
  });

  it("places the children of a nested block from its padding", () => {
    const source = "block-beta\n  columns 2\n  top\n  block:services:2\n    a b\n  end";
    const text = imported(source, "x.mmd");
    expect(text).toMatch(/group services "" \{\n\s+box a\n\s+box b\n\s+\}/);
    const compilation = compile(text);
    const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    expect(result.diagnostics.map((d) => d.code)).not.toContain("layout.container-margin");
    expect(result.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    const group = result.boxes!.get("services")!;
    for (const id of ["a", "b"]) {
      expect(result.origins!.get(id)!.y - group.y, id).toBe(16);
      // The cell's inset under the padding, and the same room below.
      const box = result.boxes!.get(id)!;
      expect(box.y - group.y, id).toBe(16 + 14);
      expect(group.y + group.height - (box.y + box.height), id).toBe(16 + 14);
    }
  });
});

describe("plantuml import", () => {
  it("imports every block", () => {
    const result = importText(
      "@startuml checkout\n[A] --> [B]\n@enduml\n\n@startuml payment\nAlice -> Bob : hi\n@enduml\n",
      { fileName: "x.puml" },
    );
    expect(result.diagrams.map((d) => [d.id, d.type])).toEqual([
      ["checkout", "flow"],
      ["payment", "sequence"],
    ]);
  });

  it("nests deployment containers", () => {
    const text = imported(
      '@startuml\nnode "Server" as srv {\n  [API] as api\n  database "DB" as db\n}\napi --> db : SQL\n@enduml',
      "x.puml",
    );
    expect(text).toMatch(/group srv "Server" \{\n\s+node api "API"\n\s+data db "DB"\n\s+\}/);
    expect(text).toContain('api -> db: "SQL"');
  });

  it("keeps the shapes of description elements", () => {
    const result = importText(
      '@startuml\ncloud "CDN" as cdn\nusecase "Pay" as pay\nactor Buyer\nBuyer --> pay\npay --> cdn\n@enduml',
      { fileName: "x.puml" },
    );
    expect(result.text).toContain('node cdn "CDN"');
    expect(result.text).toContain("style cdn { shape cloud }");
    expect(result.text).toContain('node pay "Pay"');
    expect(result.text).toContain("style pay { shape ellipse }");
    expect(result.text).toContain("node Buyer");
    expect(result.text).toContain("style Buyer { shape person }");
    expect(result.findings.filter((f) => f.code === "import.approximated")).toEqual([]);
    expect(compile(result.text!).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it.each([
    ["hexagon Gate as g", "hexagon"],
    ["card Note as g", "document"],
    ["file Log as g", "document"],
    ["folder Docs as g", "document"],
    ["interface API as g", "circle"],
    ["circle Point as g", "circle"],
    ["person Ann as g", "person"],
    ["() API as g", "circle"],
    ["(Browse) as g", "ellipse"],
    [":Clerk: as g", "person"],
  ])("writes `%s` with `shape %s`", (declaration, shape) => {
    const result = importText(`@startuml\n${declaration}\n@enduml`, { fileName: "x.puml" });
    expect(result.text).toMatch(/node g "\w+"/);
    expect(result.text).toContain(`style g { shape ${shape} }`);
    expect(result.findings.filter((f) => f.code === "import.approximated")).toEqual([]);
  });

  it("keeps no shape on containers, and writes it before colours", () => {
    const text = imported(
      "@startuml\ncloud Internet {\n  [Edge]\n}\ncloud Origin #ffcccc\n@enduml",
      "x.puml",
    );
    expect(text).toMatch(/group Internet \{\n\s+node Edge\n\s+\}/);
    expect(text).not.toContain("style Internet");
    expect(text).toContain('style Origin { shape cloud; fill "#ffcccc" }');
  });

  it("reverses left-pointing arrows", () => {
    const text = imported("@startuml\ncomponent a\ncomponent b\na <.. b\n@enduml", "x.puml");
    expect(text).toContain("b --> a");
  });

  it("joins notes to their elements", () => {
    const text = imported(
      "@startuml\ncomponent api\nnote right of api : Rate limited\n@enduml",
      "x.puml",
    );
    expect(text).toContain('note note1 "Rate limited"');
    expect(text).toContain("note1 --- api\n");
    expect(text).not.toContain("as e1");
    expect(text).not.toContain("arrowhead");
  });

  it("writes headless arrows as lines, a left diamond as a tail on a line", () => {
    const text = imported(
      "@startuml\ncomponent a\ncomponent b\ncomponent c\ncomponent d\na -- b\nc .. d\nb *-- c\na --|> d\n@enduml",
      "x.puml",
    );
    expect(text).toContain("a -- b\n");
    expect(text).toContain("c --- d\n");
    expect(text).toMatch(/b -- c as (e\d+)/);
    const tail = /b -- c as (e\d+)/.exec(text)![1]!;
    expect(text).toContain(`style ${tail} { arrowtail diamond }`);
    expect(text).toMatch(/a -> d as e\d+/);
    expect(text).toContain("arrowhead triangleOutline");
  });

  it("maps return to a reply", () => {
    const text = imported(
      "@startuml\nparticipant a\nparticipant b\na -> b ++ : pay\nreturn ok\n@enduml",
      "x.puml",
    );
    expect(text).toContain('a -> b: "pay"\n  activate b\n  b --> a: "ok"\n  deactivate b');
  });

  it("maps dividers and delays", () => {
    const text = imported(
      "@startuml\na -> b : x\n== Fulfilment ==\n...2 days later...\n@enduml",
      "x.puml",
    );
    expect(text).toContain('divider "Fulfilment"');
    expect(text).toContain('delay "2 days later"');
  });

  it("refuses other diagram kinds", () => {
    expect(importText("@startuml\nclass A\n@enduml", { fileName: "x.puml" }).status).toBe("failed");
    expect(
      importText("@startuml\nstart\n:step;\nstop\n@enduml", { fileName: "x.puml" }).status,
    ).toBe("failed");
    expect(importText("@startmindmap\n* a\n@endmindmap", { fileName: "x.puml" }).status).toBe(
      "failed",
    );
  });
});

describe("plantuml preprocessor", () => {
  it("expands function-like defines", () => {
    const text = imported(
      '@startuml\n!define SERVICE(n, l) component l as n\nSERVICE(api, "Order API")\n@enduml',
      "x.puml",
    );
    expect(text).toContain('node api "Order API"');
  });

  it("substitutes variables", () => {
    const text = imported('@startuml\n!$tech = "Kotlin"\n[API] <<$tech>>\n@enduml', "x.puml");
    expect(text).toContain('description "«Kotlin»"');
  });

  it("expands procedures with defaults", () => {
    const text = imported(
      '@startuml\n!procedure $svc($id, $label = "Service")\n  component "$label" as $id\n!endprocedure\n$svc(api)\n@enduml',
      "x.puml",
    );
    expect(text).toContain('node api "Service"');
  });

  it("selects conditional branches", () => {
    const text = imported(
      "@startuml\n!$prod = 1\n!if $prod == 1\n[Live]\n!else\n[Test]\n!endif\n@enduml",
      "x.puml",
    );
    expect(text).toContain("node Live");
    expect(text).not.toContain("Test");
  });

  it("reads local includes through the host", () => {
    const files: Record<string, string> = { "common/styles.iuml": "[Shared]\n" };
    const text = imported(
      "@startuml\n!include common/styles.iuml\n[Shared] --> [Other]\n@enduml",
      "main.puml",
      (p) => files[p],
    );
    expect(text).toContain("node Shared");
  });

  it("never fetches remote includes", () => {
    const asked: string[] = [];
    const result = importText(
      "@startuml\n!includeurl https://example.com/x.puml\n[A] --> [B]\n@enduml",
      {
        fileName: "x.puml",
        readFile: (p) => {
          asked.push(p);
          return undefined;
        },
      },
    );
    expect(asked).toEqual([]);
    const include = result.findings.find((f) => f.code === "import.include")!;
    expect(include.range.start.line).toBe(2);
  });

  it("stops runaway recursion", () => {
    const result = importText(
      "@startuml\n!procedure $loop($n)\n$loop($n)\n!endprocedure\n$loop(1)\n@enduml",
      {
        fileName: "x.puml",
      },
    );
    const error = result.findings.find((f) => f.code === "import.preprocessor")!;
    expect(error.severity).toBe("error");
    expect(error.range.start.line).toBe(5);
  });
});

describe("c4 import", () => {
  it("maps a container diagram into a model and a view", () => {
    const text = imported(
      [
        "@startuml",
        "!include <C4/C4_Container>",
        'Person(user, "User")',
        'System_Boundary(shop, "Shop") {',
        '  Container(api, "API", "Kotlin", "Orders")',
        "}",
        'Rel(user, api, "Uses", "HTTPS")',
        "@enduml",
      ].join("\n"),
      "shop.puml",
    );
    expect(text).toContain('person user "User"');
    expect(text).toMatch(
      /system shop "Shop" \{\n\s+container api "API" \{\n\s+description "Orders"\n\s+technology "Kotlin"/,
    );
    expect(text).toContain('user -> shop.api: "Uses" { technology "HTTPS" }');
    expect(text).toContain("diagram shop: c4 using shop_model");
    expect(text).toContain("level container");
    expect(text).toContain("scope shop");
  });

  it("places loose containers in a system named after the diagram", () => {
    const result = importText('C4Container\n  title Shop\n  Container(api, "API")', {
      fileName: "x.mmd",
    });
    expect(result.text).toContain('system shop "Shop" {');
    expect(constructs(result)).toContain("mermaid.c4.Container");
  });

  it("reverses back relations", () => {
    const text = imported(
      'C4Container\n  System_Boundary(s, "S") {\n    Container(api, "API")\n    ContainerDb(db, "DB")\n  }\n  Rel_Back(db, api, "Reads")',
      "x.mmd",
    );
    expect(text).toContain('s.api -> s.db: "Reads"');
  });

  it("draws context views", () => {
    const text = imported(
      'C4Context\n  Person(a, "A")\n  Person(b, "B")\n  System(x, "X")\n  System(y, "Y")\n  System_Ext(z, "Z")',
      "ctx.mmd",
    );
    expect(text).toContain("level context");
    expect(text).toContain("include a, b, x, y, z");
  });
});

describe("re-import", () => {
  const v1 = imported("flowchart LR\n  api --> db\n  api --> cache", "flow.mmd");
  const adjusted = v1
    .replace("layout auto", "layout assisted")
    .replace(
      /\n}\n$/,
      '\n  placement {\n    place api at (400, 120)\n  }\n  style cache { fill "red" }\n}\n',
    );

  it("keeps placement and layout", () => {
    const v2 = imported("flowchart LR\n  api --> db\n  api --> cache\n  api --> queue", "flow.mmd");
    const merged = mergeImport(adjusted, v2);
    expect(merged.text).toContain("layout assisted");
    expect(merged.text).toContain("place api at (400, 120)");
    expect(merged.text).toContain("node queue");
    expect(merged.findings).toEqual([]);
  });

  it("drops what no longer exists", () => {
    const v2 = imported("flowchart LR\n  api --> db", "flow.mmd");
    const merged = mergeImport(adjusted, v2);
    expect(merged.text).not.toContain("cache");
    expect(merged.findings.map((f) => f.code)).toEqual(["import.merge"]);
    expect(merged.findings[0]!.message).toContain("`cache`");
  });

  it("keeps blocks the source does not produce", () => {
    const withCopy = `${adjusted}\ndiagram flow_free: free {\n  box api "API"\n  placement {\n    place api at (80, 40)\n  }\n}\n`;
    const merged = mergeImport(withCopy, imported("flowchart LR\n  api --> db", "flow.mmd"));
    expect(merged.text).toContain("diagram flow_free: free");
    expect(
      merged.findings.some((f) => f.message.includes("`flow_free` is not in the source")),
    ).toBe(true);
  });
});
