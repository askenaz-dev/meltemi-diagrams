import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile, formatDate } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";
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
      "gantt",
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

// ---------------------------------------------------------------------------------------------
// Mermaid gantt charts

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const OWNER = readFileSync(join(REPO, "corpus/import/mermaid/gantt-roadmap.mmd"), "utf8");
const TODAY = "2026-10-29";

/** A gantt source with the given lines, indented as Mermaid's examples are. */
const chart = (...lines: string[]): string =>
  `gantt\n${lines.map((l) => (l === "" ? l : `    ${l}`)).join("\n")}\n`;

/** An import with the import's day pinned. */
const run = (source: string, options: { locale?: "en" | "es" } = {}): ImportResult =>
  importText(source, { fileName: "chart.mmd", today: TODAY, ...options });

/** The sheet of a gantt source, which must compile without a diagnostic. */
function sheet(source: string): string {
  const result = run(source);
  expect(result.text, JSON.stringify(result.findings, null, 2)).not.toBeNull();
  expect(compile(result.text!).diagnostics).toEqual([]);
  return result.text!;
}

/** The lines of a sheet that start with a word, trimmed. */
const lines = (text: string, word: string): string[] =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l === word || l.startsWith(`${word} `));

/** The start, and the last day (or instant) of a task, as the sheet's own rules resolve them. */
function spanOf(text: string, id: string): [string, string] {
  const task = compile(text).document.diagrams[0]!.elementsById.get(id)!.task!;
  const finish = task.finish!;
  return [
    formatDate(task.start!, task.start! % 86_400 !== 0),
    finish % 86_400 === 0 ? formatDate(finish - 1, false) : formatDate(finish, true),
  ];
}

const finding = (r: ImportResult, construct: string) =>
  r.findings.find((f) => f.construct === construct);

describe("mermaid gantt charts", () => {
  it("imports a gantt as a gantt chart", () => {
    const result = run("gantt\n    Task :a, 2026-06-01, 2d\n");
    expect(result.status).not.toBe("failed");
    expect(result.diagrams.map((d) => [d.id, d.type, d.source.kind])).toEqual([
      ["chart", "gantt", "gantt"],
    ]);
    expect(codes(result)).not.toContain("import.unsupported-diagram");
    expect(detectFormat("gantt\n  title x\n", "chart.txt")).toBe("mermaid");
  });

  it("still refuses the diagrams it does not know, and names gantt among the ones it reads", () => {
    const result = run('pie title Pets\n  "Dogs" : 386\n');
    expect(result.status).toBe("failed");
    expect(codes(result)).toEqual(["import.unsupported-diagram"]);
    expect(result.findings[0]!.hints![0]).toContain("gantt");
  });

  it("imports the owner's roadmap with no finding", () => {
    const result = importText(OWNER, { fileName: "gantt-roadmap.mmd", today: TODAY });
    expect(result.status).toBe("complete");
    expect(result.findings).toEqual([]);
    expect(result.diagrams.map((d) => [d.id, d.type])).toEqual([["hoja_de_ruta_genai", "gantt"]]);
    const text = result.text!;
    expect(text).toContain('section tecnologia "Tecnología" {');
    expect(text).toContain('section nuevo_flujo_genai_hub "Nuevo Flujo GenAI Hub" {');
    expect(text).toContain('section i_d "I+D" {');
    expect(text).toContain(
      'task tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0 for 10d',
    );
    // It is the chart of `corpus/valid/gantt`, but for the comment under the header.
    const body = (t: string) => t.slice(t.indexOf("diagram "));
    expect(body(text)).toBe(
      body(readFileSync(join(REPO, "corpus/valid/gantt/roadmap.meltemi"), "utf8")),
    );
    // It validates with no diagnostic, and exports an SVG.
    const compilation = compile(text);
    expect(compilation.diagnostics).toEqual([]);
    const layout = layoutDiagram(compilation, compilation.document.diagrams[0]!, { engine });
    expect(layout.scene).not.toBeNull();
    const svg = renderSvg(layout.scene!);
    expect(svg.startsWith("<svg")).toBe(true);
    for (const id of ["tec0", "flu3", "sdlc2", "tecnologia"])
      expect(svg).toContain(`data-id="${id}"`);
  });

  it("writes tags and a link as words and a url", () => {
    const text = sheet(
      chart("Deploy :crit, done, dep1, 2026-06-01, 2d", 'click dep1 href "https://ci.example.com"'),
    );
    expect(text).toContain(
      'task dep1 "Deploy" from 2026-06-01 for 2d done critical { url "https://ci.example.com" }',
    );
  });

  it("drops a callback and writes nothing of it", () => {
    const result = run(chart("Deploy :dep1, 2026-06-01, 2d", 'click dep1 call openTicket("dep1")'));
    const dropped = finding(result, "gantt.click")!;
    expect(dropped.code).toBe("import.unsupported-construct");
    expect(dropped.severity).toBe("warning");
    expect(dropped.status).toBe("dropped");
    expect(result.text).not.toContain("openTicket");
    expect(result.text).not.toContain("url");
    expect(result.status).toBe("complete");
  });

  it("keeps a link and drops the callback of the same click", () => {
    const result = run(
      chart("Deploy :dep1, 2026-06-01, 2d", 'click dep1 href "https://ci.example.com" call open()'),
    );
    expect(result.text).toContain('{ url "https://ci.example.com" }');
    expect(finding(result, "gantt.click")).toBeDefined();
  });

  it("drops a click that names no task, and a link the sheet cannot hold", () => {
    const result = run(
      chart(
        "Deploy :dep1, 2026-06-01, 2d",
        'click ghost href "https://example.com"',
        'click dep1 href "javascript:alert(1)"',
      ),
    );
    expect(result.findings.filter((f) => f.construct === "gantt.click")).toHaveLength(2);
    expect(result.text).not.toContain("url");
    expect(compile(result.text!).diagnostics).toEqual([]);
  });

  it("reports a predecessor the chart does not have, and follows the task before", () => {
    const result = run(chart("Build :b1, 2026-06-01, 2d", "Test :t1, after build, 3d"));
    const dropped = finding(result, "gantt.after")!;
    expect(dropped.code).toBe("import.unsupported-construct");
    expect(dropped.severity).toBe("warning");
    expect(dropped.message).toContain("`build`");
    expect(result.text).toContain('task t1 "Test" for 3d');
    expect(result.text).not.toContain("after build");
    expect(spanOf(result.text!, "t1")).toEqual(["2026-06-03", "2026-06-05"]);
    // One finding for the task: the dates differ because of it, and say nothing more.
    expect(finding(result, "gantt.schedule")).toBeUndefined();
  });

  it("starts on the day of the import a task that has nothing to follow", () => {
    const result = run(chart("Build :3d", "Test :t1, after nowhere, 1d"));
    expect(result.text).toContain('task task1 "Build" from 2026-10-29 for 3d');
    expect(finding(result, "gantt.start")!.message).toContain("2026-10-29");
    expect(result.status).toBe("complete");
    const alone = run(chart("Test :t1, after nowhere, 1d"));
    expect(alone.text).toContain('task t1 "Test" from 2026-10-29 for 1d');
  });

  it("uses the machine's day when no day is given", () => {
    const day = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const before = day(new Date());
    const result = importText(chart("Build :3d"), { fileName: "chart.mmd" });
    const after = day(new Date());
    expect([before, after]).toContain(/from (\d{4}-\d{2}-\d{2})/.exec(result.text!)![1]);
    // An invalid day is no day: the machine's is used.
    const invalid = importText(chart("Build :3d"), { fileName: "chart.mmd", today: "2026-02-30" });
    expect(invalid.text).toMatch(/from \d{4}-\d{2}-\d{2} for 3d/);
  });

  it("names every section from its text and keeps tasks before the first at the top", () => {
    const text = sheet(
      chart(
        "Kick-off :milestone, k, 2026-06-01, 0d",
        "section Build & Ship",
        "Code :c, 2026-06-02, 2d",
        "section Build & Ship",
        "More :m, after c, 1d",
        "section Año Nuevo",
        "Party :p, 2026-12-31, 1d",
      ),
    );
    expect(text).toContain('milestone k "Kick-off" at 2026-06-01');
    expect(text.indexOf("milestone k")).toBeLessThan(text.indexOf("section "));
    expect(lines(text, "section")).toEqual([
      'section build_ship "Build & Ship" {',
      'section build_ship_2 "Build & Ship" {',
      'section ano_nuevo "Año Nuevo" {',
    ]);
  });

  it("gives a task without an id Mermaid's own, and renames the ids the language reserves", () => {
    const result = run(
      chart(
        "First :2026-06-01, 1d",
        "Second :after task1, 1d",
        "Third :for, after task2, 1d",
        "Fourth :from, after for, 1d",
        "Fifth :a-b, after from, 1d",
        "Sixth :a_b, after a-b, 1d",
        "Seventh :1, after a_b, 1d",
      ),
    );
    const text = result.text!;
    expect(compile(text).diagnostics).toEqual([]);
    expect(lines(text, "task").map((l) => l.split(" ").slice(0, 2).join(" "))).toEqual([
      "task task1",
      "task task2",
      "task for_2",
      "task from_2",
      "task a_b",
      "task a_b_2",
      "task n1",
    ]);
    expect(text).toContain('task for_2 "Third" after task2 for 1d');
    expect(text).toContain('task from_2 "Fourth" after for_2 for 1d');
    expect(text).toContain('task a_b_2 "Sixth" after a_b for 1d');
    const renamed = result.findings.filter((f) => f.code === "import.renamed-id");
    expect(renamed.map((f) => f.message)).toEqual([
      "`for` is not a valid id; it is written as `for_2`.",
      "`from` is not a valid id; it is written as `from_2`.",
      "`a-b` is not a valid id; it is written as `a_b`.",
      "`a_b` is not a valid id; it is written as `a_b_2`.",
      "`1` is not a valid id; it is written as `n1`.",
    ]);
  });

  it("keeps the last of two tasks with one id for `after`, as Mermaid does, and apart in the sheet", () => {
    const result = run(
      chart("Old :t, 2026-06-01, 1d", "New :t, 2026-06-10, 1d", "Next :n, after t, 1d"),
    );
    expect(result.text).toContain('task t_2 "New" from 2026-06-10 for 1d');
    expect(result.text).toContain('task n "Next" after t_2 for 1d');
    expect(compile(result.text!).diagnostics).toEqual([]);
  });

  it("maps milestones to a milestone and `vert` to a marker", () => {
    const text = sheet(
      chart(
        "A :a, 2026-06-01, 4d",
        "Release :milestone, r, 2026-06-05, 2d",
        "Freeze :vert, f, 2026-06-03, 1d",
        "Done :milestone, done, d, after a, 0d",
        "Late :vert, l, after a, 1d",
      ),
    );
    // The middle of what Mermaid draws: 5 to 7 June is drawn around the 6th.
    expect(text).toContain('milestone r "Release" at 2026-06-06');
    expect(text).toContain('marker f "Freeze" at 2026-06-03');
    // `done` is a tag when it comes first, not an id.
    expect(text).toContain('milestone d "Done" after a done');
    expect(text).toContain('marker l "Late" after a');
  });

  it("writes a milestone with a duration that follows a task after it, and says so", () => {
    const result = run(
      chart("A :a, 2026-06-01, 4d", "Release :milestone, r, after a, 2d", "Next :n, after r, 1d"),
    );
    expect(result.text).toContain('milestone r "Release" after a');
    expect(finding(result, "gantt.milestone.duration")!.code).toBe("import.approximated");
    expect(compile(result.text!).diagnostics).toEqual([]);
    // The milestone is reported once, for its duration; the task after it moves earlier, and says so.
    const schedule = result.findings.filter((f) => f.construct === "gantt.schedule");
    expect(schedule.map((f) => f.message)).toEqual([
      "Mermaid draws `n` from 2026-06-07 to 2026-06-07; here it runs from 2026-06-05 to 2026-06-05.",
    ]);
  });

  it("drops the status a marker cannot have, and prefers active to done", () => {
    const result = run(
      chart("Freeze :vert, crit, done, f, 2026-06-03, 1d", "Both :done, active, b, 2026-06-01, 1d"),
    );
    expect(result.text).toContain('marker f "Freeze" at 2026-06-03\n');
    expect(result.text).toContain('task b "Both" from 2026-06-01 for 1d active');
    expect(finding(result, "gantt.vert.status")).toBeDefined();
  });

  it("never follows a marker: a task after one takes the date Mermaid draws", () => {
    const result = run(
      chart(
        "A :a, 2026-06-01, 2d",
        "Freeze :vert, f, 2026-06-10, 2d",
        "After the freeze :3d",
        "After it again :c, after f, 1d",
      ),
    );
    expect(result.text).toContain('task task1 "After the freeze" from 2026-06-12 for 3d');
    expect(result.text).toContain('task c "After it again" from 2026-06-12 for 1d');
    expect(finding(result, "gantt.after.marker")!.code).toBe("import.approximated");
    expect(compile(result.text!).diagnostics).toEqual([]);
  });

  it("writes `until` as the earliest start of its ids", () => {
    const text = sheet(
      chart(
        "A :a, 2026-06-01, until c",
        "B :b, 2026-06-02, 1d",
        "C :c, 2026-06-10, 1d",
        "E :e, 2026-06-01, until c b",
      ),
    );
    expect(text).toContain('task a "A" from 2026-06-01 until c');
    expect(text).toContain('task e "E" from 2026-06-01 until c, b');
    expect(spanOf(text, "a")).toEqual(["2026-06-01", "2026-06-09"]);
    expect(spanOf(text, "e")).toEqual(["2026-06-01", "2026-06-01"]);
  });

  it("drops an end that comes before the start, and says so", () => {
    const result = run(
      chart(
        "A :a, 2026-06-10, 2026-06-01",
        "B :b, 2026-06-05, until c",
        "C :c, 2026-06-01, 1d",
        "D :d, after c, until c",
      ),
    );
    expect(compile(result.text!).diagnostics).toEqual([]);
    expect(result.text).toContain('task a "A" from 2026-06-10\n');
    expect(result.text).toContain('task b "B" from 2026-06-05\n');
    expect(result.text).toContain('task d "D" after c\n');
    const dropped = result.findings.filter((f) => f.construct === "gantt.duration");
    expect(dropped).toHaveLength(3);
    for (const f of dropped) {
      expect(f.code).toBe("import.approximated");
      expect(f.message).toBe(
        "The end is not after the start; Mermaid draws nothing, and the task lasts one day.",
      );
    }
  });

  it("carries comments to the statement that follows, and leaves the others in the sheet", () => {
    const text = sheet(
      chart(
        "%% Calendar",
        "excludes weekends",
        "%% First part",
        "section One",
        "%% The first task",
        "Task :t, 2026-06-01, 1d",
        "%% Ends here",
      ),
    );
    expect(text).toContain("  // Calendar\n  // First part\n  section one");
    expect(text).toContain("    // The first task\n    task t");
    expect(text).toContain("  // Ends here\n}");
  });

  it("reads the accessibility title and description, and a title before them", () => {
    const text = sheet(
      chart("accTitle: Spoken title", "accDescr: One line.", "Task :t, 2026-06-01, 1d"),
    );
    expect(text).toContain('title "Spoken title"');
    expect(text).toContain('description "One line."');
    const both = sheet(
      "---\ntitle: Front\n---\n" +
        chart(
          "title Body",
          "accTitle: Spoken",
          "accDescr {",
          "  First line",
          "  second line",
          "}",
          "Task :t, 2026-06-01, 1d",
        ),
    );
    expect(both).toContain('title "Body"');
    expect(both).toContain('description "First line\\nsecond line"');
    expect(both).toContain("diagram body: gantt {");
    // The front matter's title stands between a title and accTitle.
    const front = sheet(
      "---\ntitle: Front\n---\n" + chart("accTitle: Spoken", "Task :t, 2026-06-01, 1d"),
    );
    expect(front).toContain('title "Front"');
  });

  it("reads a statement on the line of `gantt`, and the keywords in any case", () => {
    const text = sheet(
      "gantt title One line\n    DATEFORMAT YYYY-MM-DD\n    Task :t, 2026-06-01, 1d\n",
    );
    expect(text).toContain('title "One line"');
    expect(text).toContain("diagram one_line: gantt {");
  });

  it("reports the lines it cannot read and keeps them as comments", () => {
    const result = run(
      chart(
        "A :a, 2026-06-01, 1d",
        "this is not a task",
        "Too many :a, b, c, d",
        "click",
        "Empty :",
      ),
    );
    expect(result.status).toBe("partial");
    const syntax = result.findings.filter((f) => f.code === "import.syntax");
    expect(syntax.map((f) => [f.construct, f.range.start.line, f.essential])).toEqual([
      ["gantt.statement", 3, true],
      ["gantt.statement", 4, true],
      ["gantt.statement", 5, true],
      ["gantt.statement", 6, true],
    ]);
    expect(result.text).toContain("// Not imported: this is not a task");
    expect(result.text).toContain("// Not imported: Too many :a, b, c, d");
    expect(result.text).toContain("// Not imported: click");
    expect(compile(result.text!).diagnostics).toEqual([]);
  });

  it("mends an end that only the dates of the sheet put before the start", () => {
    // Mermaid draws `a` backwards, so `b` starts early and ends at `a` without trouble; the sheet
    // gives `a` a day, which starts `b` after the end it is asked for.
    const result = run(chart("A :a, 2026-06-10, 2026-06-01", "B :b, after a, until a"));
    expect(compile(result.text!).diagnostics).toEqual([]);
    expect(result.text).toContain('task a "A" from 2026-06-10\n');
    expect(result.text).toContain('task b "B" after a\n');
    const ends = result.findings.filter((f) => f.construct === "gantt.duration");
    expect(ends.map((f) => f.range.start.line)).toEqual([2, 3]);
    expect(result.status).toBe("complete");
  });

  it("cuts the references of tasks that wait for each other", () => {
    const result = run(
      chart(
        "A :a, after b, 1d",
        "B :b, after a, 1d",
        "C :c, 2026-06-01, until e",
        "D :d, after c, 1d",
        "E :e, after d, 1d",
      ),
    );
    const text = result.text!;
    expect(compile(text).diagnostics).toEqual([]);
    expect(result.status).toBe("complete");
    const cut = result.findings.filter((f) => f.construct === "gantt.after");
    expect(cut.map((f) => f.message)).toEqual([
      "`b` and this task wait for each other; `b` is dropped from `after` to open the loop.",
      "`e` and this task wait for each other; `e` is dropped from `until` to open the loop.",
    ]);
    // Cut of its only reference, the first task starts on the day of the import.
    expect(text).toContain('task a "A" from 2026-10-29 for 1d');
    expect(text).toContain('task b "B" after a for 1d');
    expect(text).toContain('task c "C" from 2026-06-01\n');
  });

  it("never writes a sheet that does not compile, whatever the source", () => {
    const sources = [
      chart("A :a, after a, 1d"),
      chart("A :a, 2026-06-10, 2026-06-01", "B :b, after a, until a"),
      chart("A :a, 2026-06-10, until b", "B :b, 2026-06-01, 1d"),
      chart(
        "excludes monday tuesday wednesday thursday friday saturday sunday",
        "A :a, 2026-06-01, 3d",
      ),
      chart("dateFormat x", "A :a, 0, 5ms", "B :b, after a, 99999999999999999999d"),
      chart("A :a, 2026-06-01, 9999y", "B :b, 2026-06-01, 0d", "C :c, 2026-06-01, 1.5M"),
      chart("A :milestone, a, after a, 1d"),
      chart("dateFormat HH:mm", "A :a, 25:00, 1h", "B :b, 10:00, 1h"),
    ];
    for (const source of sources) {
      const result = run(source);
      expect(result.text, source).not.toBeNull();
      expect(
        compile(result.text!).diagnostics.filter((d) => d.severity === "error"),
        source,
      ).toEqual([]);
    }
  });
});

describe("mermaid gantt schedules", () => {
  it("keeps the dates Mermaid draws for the owner's roadmap", () => {
    const text = importText(OWNER, { fileName: "gantt-roadmap.mmd", today: TODAY }).text!;
    const dates: [string, string, string][] = [
      ["tec0", "2026-06-01", "2026-06-05"],
      ["tec1", "2026-06-08", "2026-06-19"],
      ["tec2", "2026-06-22", "2026-06-22"],
      ["flu0", "2026-06-15", "2026-06-17"],
      ["flu1", "2026-06-18", "2026-07-01"],
      ["flu2", "2026-07-02", "2026-07-15"],
      ["flu3", "2026-07-16", "2026-07-29"],
      ["sdlc0", "2026-07-01", "2026-08-11"],
      ["sdlc1", "2026-08-03", "2026-08-07"],
      ["sdlc2", "2026-08-10", "2026-08-28"],
    ];
    expect(dates.map(([id]) => [id, ...spanOf(text, id)])).toEqual(dates);
  });

  it("writes another date format, and an exclusive end, as ISO dates and a last day", () => {
    const text = sheet(chart("dateFormat DD/MM/YYYY", "Design :d1, 01/06/2026, 06/06/2026"));
    expect(text).toContain('task d1 "Design" from 2026-06-01 to 2026-06-05');
    expect(spanOf(text, "d1")).toEqual(["2026-06-01", "2026-06-05"]);
  });

  it("writes an inclusive end date as it is", () => {
    const text = sheet(
      chart("inclusiveEndDates", "Design :d1, 2026-06-01, 2026-06-05", "Build :b1, after d1, 2d"),
    );
    expect(text).toContain('task d1 "Design" from 2026-06-01 to 2026-06-05');
    expect(text).toContain('task b1 "Build" after d1 for 2d');
    expect(spanOf(text, "b1")).toEqual(["2026-06-06", "2026-06-07"]);
  });

  it("writes weeks as days when the chart excludes days, with no finding", () => {
    const result = run(chart("excludes weekends", "Build :b1, 2026-06-01, 1w"));
    expect(result.text).toContain('task b1 "Build" from 2026-06-01 for 7d');
    expect(result.findings).toEqual([]);
    // Mermaid draws 1 to 9 June: seven working days.
    expect(spanOf(result.text!, "b1")).toEqual(["2026-06-01", "2026-06-09"]);
    const plain = run(chart("Build :b1, 2026-06-01, 1.5w", "Rest :r1, 2026-06-01, 2w"));
    expect(plain.text).toContain("for 1.5w");
    expect(plain.text).toContain("for 2w");
    const dated = run(chart("excludes 2026-06-03", "Build :b1, 2026-06-01, 1w"));
    expect(dated.text).toContain("for 1w");
  });

  it("writes a month as the days Mermaid draws for it, and says so", () => {
    const result = run(chart("Pilot :p1, 2026-01-31, 1M"));
    expect(result.text).toContain('task p1 "Pilot" from 2026-01-31 for 28d');
    const note = finding(result, "gantt.duration.month")!;
    expect(note.code).toBe("import.approximated");
    expect(note.message).toContain("`1M`");
    expect(note.message).toContain("`28d`");
    expect(run(chart("Year :y1, 2024-02-29, 1y")).text).toContain("for 365d");
    // Under excluded days the days count as working days, which is how Mermaid draws them.
    const weekends = run(chart("excludes weekends", "Pilot :p1, 2026-06-01, 1M"));
    expect(weekends.text).toContain("for 30d");
    expect(finding(weekends, "gantt.schedule")).toBeUndefined();
  });

  it("writes the other units, rounding milliseconds up", () => {
    const text = sheet(
      chart(
        "A :a, 2026-06-01, 30m",
        "B :b, after a, 1.5h",
        "C :c, after b, 90s",
        "D :d, after c, 2000ms",
        "E :e, after d, 36h",
      ),
    );
    expect(lines(text, "task").map((l) => l.replace(/^.*?(from|after)/, "$1"))).toEqual([
      "from 2026-06-01 for 30min",
      "after a for 1.5h",
      "after b for 90s",
      "after c for 2s",
      "after d for 36h",
    ]);
    const result = run(chart("A :a, 2026-06-01, 1500ms"));
    expect(result.text).toContain("for 2s");
    expect(finding(result, "gantt.duration.ms")!.message).toContain("`2s`");
    expect(finding(result, "gantt.schedule")).toBeUndefined();
  });

  it("writes a start on a day that does not work as the next one that does, and says so", () => {
    const result = run(chart("excludes weekends", "Kick-off :k1, 2026-06-06, 2d"));
    expect(result.text).toContain('task k1 "Kick-off" from 2026-06-08 for 2d');
    const note = finding(result, "gantt.schedule")!;
    expect(note.code).toBe("import.approximated");
    expect(note.status).toBe("approximated");
    expect(note.message).toContain("2026-06-06");
    expect(note.message).toContain("2026-06-08");
    expect(note.range.start.line).toBe(3);
    expect(compile(result.text!).diagnostics).toEqual([]);
    expect(result.status).toBe("complete");
  });

  it("reports a task once, and the tasks that follow it as they come out", () => {
    const result = run(
      chart("excludes weekends", "Kick-off :k1, 2026-06-06, 2d", "Next :n1, after k1, 1d"),
    );
    expect(result.findings.filter((f) => f.construct === "gantt.schedule")).toHaveLength(2);
  });

  it("writes a date range that holds a weekend to the day Mermaid ends it", () => {
    // Mermaid pushes an end that is not `YYYY-MM-DD` past the excluded days of its span.
    const result = run(
      chart("dateFormat DD/MM/YYYY", "excludes weekends", "Design :d1, 01/06/2026, 12/06/2026"),
    );
    expect(result.text).toContain("from 2026-06-01 to 2026-06-15");
    expect(finding(result, "gantt.schedule")).toBeUndefined();
    // An end written `YYYY-MM-DD` is kept as written, a weekend inside it or not.
    const kept = run(chart("excludes weekends", "Design :d1, 2026-06-01, 2026-06-12"));
    expect(kept.text).toContain("from 2026-06-01 to 2026-06-11");
  });

  it("moves an end that lands on a day that does not work, and says so", () => {
    const result = run(chart("excludes weekends", "Design :d1, 2026-06-01, 2026-06-08"));
    // Mermaid draws to Monday 8 June at midnight: 1 to 7 June, the weekend inside.
    expect(result.text).toContain("from 2026-06-01 to 2026-06-05");
    expect(finding(result, "gantt.schedule")!.message).toContain("2026-06-07");
  });

  it("reports an unreadable date on the task, and writes the task without it", () => {
    const result = run(chart("A :a1, 2026-06-01, 2d", "Fix :f1, 2026-13-45, 2d"));
    const syntax = finding(result, "gantt.date")!;
    expect(syntax.code).toBe("import.syntax");
    expect(syntax.essential).toBe(true);
    expect(syntax.range.start.line).toBe(3);
    expect(result.status).toBe("partial");
    expect(result.text).toContain('task f1 "Fix" for 2d');
    // It follows the task before it.
    expect(spanOf(result.text!, "f1")).toEqual(["2026-06-03", "2026-06-04"]);
  });

  it("reads a duration it cannot read as no end, and says so", () => {
    const result = run(
      chart("A :a, 2026-06-01, soon", "B :b, 2026-06-01, 0d", "C :c, 2026-06-01, 2026-13-45"),
    );
    expect(result.text).toContain('task a "A" from 2026-06-01\n');
    expect(result.text).toContain('task b "B" from 2026-06-01\n');
    expect(result.findings.filter((f) => f.construct === "gantt.duration")).toHaveLength(3);
    expect(result.status).toBe("complete");
  });

  it("writes the time of a date only when it is not midnight", () => {
    const text = sheet(
      chart(
        "dateFormat YYYY-MM-DD HH:mm",
        "A :a, 2026-06-01 00:00, 2026-06-01 09:30",
        "B :b, 2026-06-01 09:30, 2026-06-02 00:00",
        "C :c, after b, 2h",
      ),
    );
    expect(text).toContain('task a "A" from 2026-06-01 to 2026-06-01T09:30');
    expect(text).toContain('task b "B" from 2026-06-01T09:30 to 2026-06-01');
    expect(spanOf(text, "c")).toEqual(["2026-06-02", "2026-06-02T02:00"]);
  });

  it.each([
    ["DD/MM/YYYY", "01/06/2026", "2026-06-01"],
    ["D MMM YYYY", "1 Jun 2026", "2026-06-01"],
    ["MMMM Do YYYY", "June 1st 2026", "2026-06-01"],
    ["YY-MM-DD", "26-06-01", "2026-06-01"],
    ["YYYY-DDD", "2026-152", "2026-06-01"],
    ["YYYY-MM-DD h:mm a", "2026-06-01 9:30 pm", "2026-06-01T21:30"],
    ["X", "1780272000", "2026-06-01"],
    ["x", "1780272000000", "2026-06-01"],
  ])("reads dates written %s", (format, written, iso) => {
    const result = run(chart(`dateFormat ${format}`, `Task :t, ${written}, 1d`));
    expect(result.text, JSON.stringify(result.findings)).toContain(`from ${iso} for 1d`);
  });

  it("drops the zone and the fractions of a second of a date, once", () => {
    const result = run(
      chart(
        "dateFormat YYYY-MM-DD HH:mm:ss.SSS Z",
        "A :a, 2026-06-01 10:00:00.500 +02:00, 1h",
        "B :b, 2026-06-01 12:00:00.250 +02:00, 1h",
      ),
    );
    expect(result.text).toContain("from 2026-06-01T10:00 for 1h");
    expect(result.findings.filter((f) => f.construct === "gantt.dateFormat.zone")).toHaveLength(1);
    expect(
      result.findings.filter((f) => f.construct === "gantt.dateFormat.milliseconds"),
    ).toHaveLength(1);
    expect(finding(result, "gantt.schedule")).toBeUndefined();
  });

  it("places dates on the day of the import when the format has no year, once", () => {
    const result = run(
      chart("dateFormat HH:mm", "Stand-up :s, 09:00, 15m", "Review :r, after s, 1h"),
    );
    expect(result.text).toContain("from 2026-10-29T09:00 for 15min");
    const notes = result.findings.filter((f) => f.construct === "gantt.dateFormat.noYear");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toContain("2026-10-29");
    expect(notes[0]!.code).toBe("import.approximated");
  });

  it("reads an ISO date for a start whatever the format, as Mermaid's fallback does", () => {
    const result = run(chart("dateFormat DD/MM/YYYY", "A :a, 2026-06-01, 02/06/2026"));
    expect(result.text).toContain("from 2026-06-01");
    expect(finding(result, "gantt.date")).toBeUndefined();
  });
});

describe("mermaid gantt calendars and axes", () => {
  it("writes the owner's calendar before the first section, in order", () => {
    const text = importText(OWNER, { fileName: "gantt-roadmap.mmd", today: TODAY }).text!;
    const head = text.slice(text.indexOf("diagram "), text.indexOf("  section "));
    expect(head).toBe(
      'diagram hoja_de_ruta_genai: gantt {\n  title "Hoja de ruta GenAI"\n  axisFormat "%d %b"\n  exclude weekends\n  today\n\n',
    );
  });

  it("makes `weekends` Friday and Saturday with `weekend friday`", () => {
    const text = sheet(chart("excludes weekends", "weekend friday", "Task :t, 2026-06-01, 2d"));
    expect(lines(text, "exclude")).toEqual(["exclude friday, saturday"]);
    expect(lines(text, "weekStart")).toEqual([]);
    // A weekend that is not asked for is not written.
    expect(lines(sheet(chart("weekend friday", "Task :t, 2026-06-01, 2d")), "exclude")).toEqual([]);
  });

  it("adds up the lines of `excludes` and `includes`, with dates in the chart's format", () => {
    const text = sheet(
      chart(
        "dateFormat DD/MM/YYYY",
        "excludes weekends, 25/12/2026",
        "excludes thursday",
        "includes 26/12/2026, 27/12/2026, 05/01/2027",
        "Task :t, 21/12/2026, 2d",
      ),
    );
    expect(lines(text, "exclude")).toEqual(["exclude weekends, 2026-12-25, thursday"]);
    // The 5th of January works already: only the dates an exclusion covers are written.
    expect(lines(text, "include")).toEqual(["include 2026-12-26, 2026-12-27"]);
  });

  it("drops an exclusion that is no day", () => {
    const result = run(chart("excludes holidays", "Task :t, 2026-06-01, 2d"));
    const dropped = finding(result, "gantt.excludes")!;
    expect(dropped.code).toBe("import.unsupported-construct");
    expect(dropped.severity).toBe("warning");
    expect(dropped.status).toBe("dropped");
    expect(result.text).not.toContain("exclude");
    const mixed = run(chart("excludes weekends holidays 2026-13-45", "Task :t, 2026-06-01, 2d"));
    expect(mixed.findings.filter((f) => f.construct === "gantt.excludes")).toHaveLength(2);
    expect(mixed.text).toContain("exclude weekends\n");
    const included = run(
      chart("excludes weekends", "includes saturday", "Task :t, 2026-06-01, 1d"),
    );
    expect(finding(included, "gantt.includes")).toBeDefined();
    expect(included.text).not.toContain("include");
  });

  it("does not write a calendar that leaves no day to work", () => {
    const result = run(
      chart(
        "excludes weekends, monday, tuesday, wednesday, thursday, friday, 2026-12-25",
        "Task :t, 2026-06-01, 2d",
      ),
    );
    expect(finding(result, "gantt.excludes")!.message).toContain("Every day");
    expect(lines(result.text!, "exclude")).toEqual(["exclude 2026-12-25"]);
    expect(compile(result.text!).diagnostics).toEqual([]);
  });

  it("keeps the first day of the week, and the Sunday of Mermaid's weekly ticks", () => {
    expect(lines(sheet(chart("weekday monday", "Task :t, 2026-06-01, 2d")), "weekStart")).toEqual([
      "weekStart monday",
    ]);
    const weekly = sheet(chart("tickInterval 2week", "Task :t, 2026-06-01, 2d"));
    expect(lines(weekly, "ticks")).toEqual(["ticks 2w"]);
    expect(lines(weekly, "weekStart")).toEqual(["weekStart sunday"]);
    const set = sheet(chart("tickInterval 1week", "weekday friday", "Task :t, 2026-06-01, 2d"));
    expect(lines(set, "weekStart")).toEqual(["weekStart friday"]);
    const days = sheet(chart("tickInterval 3day", "Task :t, 2026-06-01, 2d"));
    expect(lines(days, "ticks")).toEqual(["ticks 3d"]);
    expect(lines(days, "weekStart")).toEqual([]);
  });

  it.each([
    ["1second", "1s"],
    ["15minute", "15min"],
    ["6hour", "6h"],
    ["1day", "1d"],
    ["2week", "2w"],
    ["3month", "3mo"],
  ])("writes the tick interval %s as `ticks %s`", (interval, ticks) => {
    expect(
      lines(sheet(chart(`tickInterval ${interval}`, "Task :t, 2026-06-01, 2d")), "ticks"),
    ).toEqual([`ticks ${ticks}`]);
  });

  it("approximates a millisecond tick and drops one that is no interval", () => {
    const milli = run(chart("tickInterval 100millisecond", "Task :t, 2026-06-01, 2d"));
    expect(lines(milli.text!, "ticks")).toEqual(["ticks 1s"]);
    expect(finding(milli, "gantt.tickInterval.millisecond")!.code).toBe("import.approximated");
    const bad = run(chart("tickInterval soon", "Task :t, 2026-06-01, 2d"));
    expect(finding(bad, "gantt.tickInterval.invalid")!.code).toBe("import.unsupported-construct");
    expect(bad.text).not.toContain("ticks");
  });

  it("writes the axis format, expanding the d3 directives it has a form for", () => {
    expect(
      lines(sheet(chart("axisFormat %Y-%m-%d", "Task :t, 2026-06-01, 2d")), "axisFormat"),
    ).toEqual(['axisFormat "%Y-%m-%d"']);
    const forms = sheet(chart("axisFormat %x | %X | %c", "Task :t, 2026-06-01, 2d"));
    expect(lines(forms, "axisFormat")).toEqual([
      'axisFormat "%-m/%-d/%Y | %-I:%M:%S %p | %-m/%-d/%Y, %-I:%M:%S %p"',
    ]);
    const dropped = run(chart("axisFormat %H:%M:%S.%L %Z", "Task :t, 2026-06-01, 2d"));
    expect(lines(dropped.text!, "axisFormat")).toEqual(['axisFormat "%H:%M:%S. "']);
    const note = finding(dropped, "gantt.axisFormat.directive")!;
    expect(note.code).toBe("import.approximated");
    expect(note.message).toContain("`%L`");
    expect(note.message).toContain("`%Z`");
    const nothing = run(chart("axisFormat %L", "Task :t, 2026-06-01, 2d"));
    expect(nothing.text).not.toContain("axisFormat");
    expect(compile(nothing.text!).diagnostics).toEqual([]);
  });

  it("writes `today` unless `todayMarker off`, and approximates a style", () => {
    const standard = run(chart("Task :t, 2026-06-01, 2d"));
    expect(lines(standard.text!, "today")).toEqual(["today"]);
    expect(standard.findings).toEqual([]);
    const off = run(chart("todayMarker off", "Task :t, 2026-06-01, 2d"));
    expect(lines(off.text!, "today")).toEqual([]);
    expect(off.findings).toEqual([]);
    const styled = run(
      chart("todayMarker stroke-width:5px,stroke:#0f0", "Task :t, 2026-06-01, 2d"),
    );
    expect(lines(styled.text!, "today")).toEqual(["today"]);
    const note = finding(styled, "gantt.todayMarker")!;
    expect(note.code).toBe("import.approximated");
    expect(note.status).toBe("approximated");
  });

  it("puts the axis on both sides for `topAxis`", () => {
    expect(lines(sheet(chart("topAxis", "Task :t, 2026-06-01, 2d")), "axis")).toEqual([
      "axis both",
    ]);
    expect(
      lines(
        sheet(
          "---\nconfig:\n  gantt:\n    topAxis: true\n---\n" + chart("Task :t, 2026-06-01, 2d"),
        ),
        "axis",
      ),
    ).toEqual(["axis both"]);
    expect(
      lines(
        sheet(
          "---\nconfig:\n  gantt:\n    topAxis: false\n---\n" + chart("Task :t, 2026-06-01, 2d"),
        ),
        "axis",
      ),
    ).toEqual([]);
  });

  it("reads the compact display mode from the front matter, and reports the other options", () => {
    const source =
      "---\nconfig:\n  gantt:\n    displayMode: compact\n    barGap: 6\n---\n" +
      chart("Task :t, 2026-06-01, 2d");
    const result = run(source);
    expect(lines(result.text!, "display")).toEqual(["display compact"]);
    const dropped = result.findings.filter((f) => f.construct === "mermaid.config");
    expect(dropped.map((f) => [f.code, f.range.start.line, f.message])).toEqual([
      [
        "import.unsupported-construct",
        5,
        "The configuration option `gantt.barGap` is not imported.",
      ],
    ]);
    expect(compile(result.text!).diagnostics).toEqual([]);
    const top = run("---\ndisplayMode: compact\n---\n" + chart("Task :t, 2026-06-01, 2d"));
    expect(lines(top.text!, "display")).toEqual(["display compact"]);
    expect(top.findings).toEqual([]);
  });

  it("reports a section of configuration once, and the options of another diagram not at all", () => {
    const result = run(
      "---\nconfig:\n  theme: forest\n  themeVariables:\n    primaryColor: red\n    lineColor: blue\n  gantt:\n    sectionFontSize: 12\n---\n" +
        chart("Task :t, 2026-06-01, 2d"),
    );
    expect(
      result.findings.filter((f) => f.construct === "mermaid.config").map((f) => f.message),
    ).toEqual([
      "The configuration option `theme` is not imported.",
      "The configuration option `themeVariables` is not imported.",
      "The configuration option `gantt.sectionFontSize` is not imported.",
    ]);
    // A flowchart's front matter keeps its single finding for the whole block.
    const flow = run(
      "---\nconfig:\n  theme: forest\n  flowchart:\n    curve: basis\n---\nflowchart LR\n  a --> b\n",
    );
    expect(flow.findings.filter((f) => f.construct === "mermaid.config")).toHaveLength(1);
  });

  it("writes the calendar of a time-based chart", () => {
    const text = sheet(
      chart(
        "dateFormat YYYY-MM-DD HH:mm",
        "axisFormat %H:%M",
        "tickInterval 30minute",
        "Stand-up :standup, 2026-06-01 09:00, 15m",
      ),
    );
    expect(lines(text, "ticks")).toEqual(["ticks 30min"]);
    expect(lines(text, "axisFormat")).toEqual(['axisFormat "%H:%M"']);
  });
});

describe("mermaid gantt re-import", () => {
  const imported = (source: string) =>
    importText(source, { fileName: "plan.mmd", today: TODAY }).text!;

  it("keeps what the chart was adjusted to, and takes what the source changed", () => {
    const v1 = imported(OWNER);
    const adjusted = v1
      .replace("  today\n", "  today\n  labels column\n  dayWidth 14\n  ticks 1w\n")
      .replace(/\n}\n$/, "\n  style tec1 { fill warning }\n}\n");
    const v2 = imported(
      OWNER.replace(":flu2, after flu1, 10d", ":flu2, after flu1, 12d").replace(
        "Presentar resultados al comité Arq :tec2, after tec1, 1d",
        "Presentar resultados al comité Arq :tec2, after tec1, 1d\n    Cierre :tec3, after tec2, 2d",
      ),
    );
    const merged = mergeImport(adjusted, v2);
    expect(merged.findings).toEqual([]);
    expect(lines(merged.text, "labels")).toEqual(["labels column"]);
    expect(lines(merged.text, "dayWidth")).toEqual(["dayWidth 14"]);
    expect(lines(merged.text, "ticks")).toEqual(["ticks 1w"]);
    expect(lines(merged.text, "style")).toEqual(["style tec1 { fill warning }"]);
    expect(merged.text).toContain('task tec3 "Cierre" after tec2 for 2d');
    expect(merged.text).toContain('task flu2 "Integración con LeanIX" after flu1 for 12d');
    expect(compile(merged.text).diagnostics).toEqual([]);
    // Merging again changes nothing.
    expect(mergeImport(merged.text, v2).text).toBe(merged.text);
  });

  it("replaces a view statement the source also writes, and keeps the schedule the source's", () => {
    const v1 = imported(chart("axisFormat %d %b", "excludes weekends", "Task :t, 2026-06-01, 5d"));
    const adjusted = v1
      .replace('axisFormat "%d %b"', 'axisFormat "%Y"')
      .replace("exclude weekends", "exclude friday")
      .replace("today\n", "today 2026-06-03\n")
      .replace("for 5d", "for 7d");
    const merged = mergeImport(adjusted, v1);
    expect(lines(merged.text, "axisFormat")).toEqual(['axisFormat "%Y"']);
    expect(lines(merged.text, "exclude")).toEqual(["exclude weekends"]);
    expect(lines(merged.text, "today")).toEqual(["today"]);
    expect(merged.text).toContain("for 5d");
  });

  it("drops the style of a task that is gone", () => {
    const v1 = imported(OWNER);
    const adjusted = v1.replace(/\n}\n$/, "\n  style tec2 { fill warning }\n}\n");
    const v2 = imported(
      OWNER.replace("    Presentar resultados al comité Arq :tec2, after tec1, 1d\n", ""),
    );
    const merged = mergeImport(adjusted, v2);
    expect(merged.text).not.toContain("tec2");
    expect(merged.findings.map((f) => f.code)).toEqual(["import.merge"]);
    expect(merged.findings[0]!.message).toContain("`tec2`");
    expect(compile(merged.text).diagnostics).toEqual([]);
  });
});
