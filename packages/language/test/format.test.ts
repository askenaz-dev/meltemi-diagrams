import { describe, expect, it } from "vitest";
import { applyTextEdits, diffLines, formatSource } from "../src/index.js";

function format(text: string, indent?: number | "tab"): string {
  const result = formatSource(text, indent === undefined ? {} : { indent });
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(", "));
  return result.text;
}

describe("formatter and a note's attachment", () => {
  it("keeps the `on` clause as one word and one space on each side", () => {
    expect(format('diagram d: flow {\n  note   n   "Text"   on   api\n}\n')).toBe(
      'diagram d: flow {\n  note n "Text" on api\n}\n',
    );
    expect(format('diagram d: free {\n  note n "Text" on api { layer front }\n}\n')).toContain(
      'note n "Text" on api {',
    );
  });
});

describe("formatter layout", () => {
  it("lays out a messy flow diagram", () => {
    const input =
      'diagram d:flow{\n    client[ "Client" ]\n  client->api :"HTTPS" as req\n\n\n  placement {place client at (120,60)}\n}';
    expect(format(input)).toBe(
      'diagram d: flow {\n  client["Client"]\n  client -> api: "HTTPS" as req\n\n  placement { place client at (120, 60) }\n}\n',
    );
  });

  it("keeps the space before a list and removes it inside", () => {
    const input = "diagram d: flow {\nroute r from a.east to b.west via [(1,2),(3,4)]\n}\n";
    expect(format(input)).toBe(
      "diagram d: flow {\n  route r from a.east to b.west via [(1, 2), (3, 4)]\n}\n",
    );
  });

  it("indents chained clauses and keeps them on the closing line", () => {
    const input = 'diagram p: sequence {\nalt "A" {\na -> b\n} else "B" {\nb -> a\n}\n}\n';
    expect(format(input)).toBe(
      'diagram p: sequence {\n  alt "A" {\n    a -> b\n  } else "B" {\n    b -> a\n  }\n}\n',
    );
  });

  it("puts one item per line in a multi-line list", () => {
    const input = "diagram d: flow {\n  route r from a to b via [(1, 2),\n(3, 4)]\n}\n";
    expect(format(input)).toBe(
      "diagram d: flow {\n  route r from a to b via [\n    (1, 2),\n    (3, 4)\n  ]\n}\n",
    );
  });

  it("lays out the line tokens as arrows and a line object as a keyword statement", () => {
    const input =
      'diagram d:free{\n  a--b\n  c---d\n  line l "L" from (0,0) to (100,0) via [(50,20),(60,20)]\n}';
    expect(format(input)).toBe(
      'diagram d: free {\n  a -- b\n  c --- d\n  line l "L" from (0, 0) to (100, 0) via [(50, 20), (60, 20)]\n}\n',
    );
  });

  it("puts one bend per line in a multi-line via of a line object", () => {
    const input =
      "diagram d: free {\n  line l from (0, 0) to (100, 0) via [(50, 20),\n(60, 20)]\n}\n";
    expect(format(input)).toBe(
      "diagram d: free {\n  line l from (0, 0) to (100, 0) via [\n    (50, 20),\n    (60, 20)\n  ]\n}\n",
    );
  });

  it("refuses a broken line token and leaves the text alone", () => {
    const result = formatSource("diagram d: flow {\n  a ---> b\n}\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((d) => d.code)).toContain("syntax.unexpected-character");
    }
  });

  it("separates top-level blocks by exactly one blank line", () => {
    const input =
      'theme a { ink "#000000" }\ntheme b { ink "#111111" }\n\n\n\ndiagram d: flow { x -> y }\n';
    expect(format(input)).toBe(
      'theme a { ink "#000000" }\n\ntheme b { ink "#111111" }\n\ndiagram d: flow { x -> y }\n',
    );
  });

  it("keeps the header and imports together", () => {
    const input =
      'language "0.2"\nimport a from "./a.meltemi"\nimport "./b.meltemi" as b\ndiagram d: flow { x -> y }\n';
    expect(format(input)).toBe(
      'language "0.2"\nimport a from "./a.meltemi"\nimport "./b.meltemi" as b\n\ndiagram d: flow { x -> y }\n',
    );
  });

  it("expands a block written over several lines", () => {
    expect(format("diagram d: flow { a -> b\n c -> d }")).toBe(
      "diagram d: flow {\n  a -> b\n  c -> d\n}\n",
    );
  });

  it("keeps statements joined by semicolons on one line", () => {
    expect(
      format("diagram d: flow {\n  placement {\n    place a at (1,2);size a (3,4)\n  }\n}\n"),
    ).toBe("diagram d: flow {\n  placement {\n    place a at (1, 2); size a (3, 4)\n  }\n}\n");
  });

  it("removes blank lines at the start and end of blocks", () => {
    expect(format("diagram d: flow {\n\n\n  a -> b\n\n\n}\n")).toBe(
      "diagram d: flow {\n  a -> b\n}\n",
    );
  });
});

describe("formatter comments", () => {
  it("keeps trailing and own-line comments", () => {
    expect(format("diagram d: flow {\n// first\n   a -> b    // keep\n}")).toBe(
      "diagram d: flow {\n  // first\n  a -> b // keep\n}\n",
    );
  });

  it("keeps a comment inside a multi-line list", () => {
    const input = "diagram d: flow {\n  route r from a to b via [(1, 2), // bend\n(3, 4)]\n}\n";
    expect(format(input)).toBe(
      "diagram d: flow {\n  route r from a to b via [\n    (1, 2), // bend\n    (3, 4)\n  ]\n}\n",
    );
  });

  it("keeps block comments verbatim and comments at file start and end", () => {
    const input = "// header\n/* multi\n   line */\ndiagram d: flow { a /* x */ -> b }\n// tail";
    expect(format(input)).toBe(
      "// header\n/* multi\n   line */\ndiagram d: flow { a /* x */ -> b }\n// tail\n",
    );
  });

  it("keeps a trailing comment after an opening brace", () => {
    expect(format("diagram d: flow { // main\n  a -> b\n}\n")).toBe(
      "diagram d: flow { // main\n  a -> b\n}\n",
    );
  });
});

describe("formatter guarantees", () => {
  it("refuses files with syntax errors", () => {
    const result = formatSource('diagram d: flow { a -> b: "open }\n');
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics.map((d) => d.code)).toContain("syntax.unterminated-string");
  });

  it("keeps the BOM and the first line ending", () => {
    const input = "﻿diagram d: flow {\r\n  a -> b\n  c -> d\r\n}\r\n";
    expect(format(input)).toBe("﻿diagram d: flow {\r\n  a -> b\r\n  c -> d\r\n}\r\n");
  });

  it("indents with tabs", () => {
    expect(format("diagram d: flow {\nplacement {\nplace a at (1, 2)\n}\n}\n", "tab")).toBe(
      "diagram d: flow {\n\tplacement {\n\t\tplace a at (1, 2)\n\t}\n}\n",
    );
  });

  it("rejects invalid options", () => {
    const result = formatSource("diagram d: flow { }\n", { indent: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.diagnostics.map((d) => d.code)).toEqual(["format.invalid-option"]);
  });

  it("is idempotent on its own output", () => {
    const once = format("diagram d:flow{a->b\nplacement{place a at (1,2)}}");
    expect(format(once)).toBe(once);
  });

  it("formats an empty file to an empty file", () => {
    expect(format("")).toBe("");
    expect(format("\n\n")).toBe("");
  });
});

describe("line edits", () => {
  it("touches only changed lines", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `  a${i} -> b${i}`);
    const canonical = `diagram d: flow {\n${lines.join("\n")}\n}\n`;
    const broken = canonical.replace("  a20 -> b20", "      a20 -> b20");
    const result = formatSource(broken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(canonical);
    expect(result.edits).toHaveLength(1);
    expect(applyTextEdits(broken, result.edits)).toBe(canonical);
  });

  it("gives no edits for identical texts and reproduces random targets", () => {
    expect(diffLines("a\nb\n", "a\nb\n")).toEqual([]);
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 200; round++) {
      const make = () =>
        Array.from({ length: Math.floor(next() * 12) }, () => `l${Math.floor(next() * 5)}\n`).join(
          "",
        );
      const before = make();
      const after = make();
      expect(applyTextEdits(before, diffLines(before, after))).toBe(after);
    }
  });
});
