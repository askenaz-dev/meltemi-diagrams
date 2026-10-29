import { describe, expect, it } from "vitest";
import { applyTextEdits, diffLines, formatSource, parse } from "../src/index.js";

function format(text: string, indent?: number | "tab"): string {
  const result = formatSource(text, indent === undefined ? {} : { indent });
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(", "));
  return result.text;
}

/** The text of every token that is not a line break, in order. */
function significant(text: string): string[] {
  return parse(text)
    .tokens.filter((t) => t.kind !== "Newline" && t.kind !== "EOF")
    .map((t) => t.text);
}

/** Every comment of a text, in order. */
function comments(text: string): string[] {
  return parse(text).tokens.flatMap((t) =>
    t.leadingTrivia
      .filter((trivia) => trivia.kind === "LineComment" || trivia.kind === "BlockComment")
      .map((trivia) => trivia.text),
  );
}

/** Formats a text, checks the guarantees on the result and returns it. */
function formatChecked(text: string, indent?: number | "tab"): string {
  const once = format(text, indent);
  expect(parse(once).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(significant(once)).toEqual(significant(text));
  expect(comments(once)).toEqual(comments(text));
  expect(format(once, indent)).toBe(once);
  return once;
}

/** `count` tuples of varied widths, written without spaces. */
function tuples(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `(${i * 12.5},${100 + ((i * 37) % 250)})`);
}

/** The tuples in canonical spacing. */
function spaced(items: readonly string[]): string[] {
  return items.map((item) => item.replace(",", ", "));
}

/** Items filled greedily on lines of at most `columns`, each line starting with `indent`. */
function filled(items: readonly string[], indent: string, columns = 100): string[] {
  const rows: string[] = [];
  let row = "";
  for (const item of items) {
    if (row === "") row = indent + item;
    else if (row.length + 1 + item.length <= columns) row += ` ${item}`;
    else {
      rows.push(row);
      row = indent + item;
    }
  }
  if (row !== "") rows.push(row);
  return rows;
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

describe("formatter and pen statements", () => {
  it("prints a short stroke on one line however it was written", () => {
    const input = "diagram d: free {\n  pen p [(0,0),\n(10,10),(20,0)]\n}\n";
    expect(formatChecked(input)).toBe(
      "diagram d: free {\n  pen p [(0, 0), (10, 10), (20, 0)]\n}\n",
    );
    expect(formatChecked("diagram d: free {\n  pen p [\n    (5, 5)\n  ]\n}\n")).toBe(
      "diagram d: free {\n  pen p [(5, 5)]\n}\n",
    );
  });

  it("fills a long stroke to 100 columns with a trailing comma on every line", () => {
    const items = tuples(60);
    // Some tuples one per line, the others several to a line, and a comma after the last one.
    const written = items.map((item, i) => (i % 7 === 3 ? `${item},\n` : `${item}, `)).join("");
    const input = `diagram d: free {\npen p [${written}]\n}\n`;
    const output = formatChecked(input);
    const rows = filled(
      spaced(items).map((item) => `${item},`),
      "    ",
    );
    expect(output).toBe(`diagram d: free {\n  pen p [\n${rows.join("\n")}\n  ]\n}\n`);
    expect(rows.length).toBeLessThan(15);
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(100);
      expect(row.endsWith(",")).toBe(true);
    }
  });

  it("keeps a last tuple without its comma, since only line breaks change", () => {
    const items = spaced(tuples(30));
    const input = `diagram d: free {\n  pen p [${items.join(",")}]\n}\n`;
    const rows = filled(
      items.map((item, i) => (i < items.length - 1 ? `${item},` : item)),
      "    ",
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(formatChecked(input)).toBe(`diagram d: free {\n  pen p [\n${rows.join("\n")}\n  ]\n}\n`);
  });

  it("fits the whole statement in 100 columns at its indentation, block included", () => {
    const sheet = (statement: string) => `diagram d: free {\n  ${statement}\n}\n`;
    const exact = `pen p [${[...Array<string>(8).fill("(10, 10)"), "(100, 100)"].join(", ")}]`;
    expect(`  ${exact}`.length).toBe(100);
    expect(formatChecked(sheet(exact))).toBe(sheet(exact));
    const over = exact.replace("(100, 100)", "(1000, 100)");
    expect(formatChecked(sheet(over))).toBe(
      `diagram d: free {\n  pen p [\n    ${Array<string>(8).fill("(10, 10),").join(" ")} (1000, 100)\n  ]\n}\n`,
    );
    // A block on the same line counts; a block over several lines ends the first line at `{`.
    const short = "pen p [(0, 0), (10, 10)]";
    const block = `{ description "${"x".repeat(70)}" }`;
    expect(formatChecked(sheet(`${short} ${block}`))).toBe(
      `diagram d: free {\n  pen p [\n    (0, 0), (10, 10)\n  ] ${block}\n}\n`,
    );
    expect(formatChecked(sheet(`${short} {\n    description "${"x".repeat(90)}"\n  }`))).toBe(
      sheet(`${short} {\n    description "${"x".repeat(90)}"\n  }`),
    );
  });

  it("puts the block after the closing bracket of a filled list", () => {
    const items = tuples(20);
    const input = `diagram d: free {\n  pen p [${items.join(", ")}] {\nstroke accent\n}\n  pen q [${items.join(", ")}] { width 8 }\n}\n`;
    const rows = filled(
      spaced(items).map((item, i) => (i < items.length - 1 ? `${item},` : item)),
      "    ",
    ).join("\n");
    expect(formatChecked(input)).toBe(
      `diagram d: free {\n  pen p [\n${rows}\n  ] {\n    stroke accent\n  }\n  pen q [\n${rows}\n  ] { width 8 }\n}\n`,
    );
  });

  it("fills a stroke inside a group one level deeper, and with tabs", () => {
    const items = tuples(24);
    const input = `diagram d: free {\n  group g {\n    pen p [${items.join(", ")}]\n  }\n}\n`;
    const spacedItems = spaced(items).map((item, i) => (i < items.length - 1 ? `${item},` : item));
    expect(formatChecked(input)).toBe(
      `diagram d: free {\n  group g {\n    pen p [\n${filled(spacedItems, "      ").join("\n")}\n    ]\n  }\n}\n`,
    );
    // A tab counts for four columns.
    const tabbed = formatChecked(input, "tab");
    const rows = filled(spacedItems, "            ").map((row) => row.replace(/^ {12}/, "\t\t\t"));
    expect(tabbed).toBe(
      `diagram d: free {\n\tgroup g {\n\t\tpen p [\n${rows.join("\n")}\n\t\t]\n\t}\n}\n`,
    );
  });

  it("expands a one-line block around a stroke that does not fit", () => {
    const items = tuples(12);
    const input = `diagram d: free { pen p [${items.join(", ")}] }\n`;
    const output = formatChecked(input);
    expect(output.startsWith("diagram d: free {\n  pen p [\n    (0, 100),")).toBe(true);
    expect(output.endsWith("\n  ]\n}\n")).toBe(true);
    // A short stroke keeps the block on one line.
    expect(formatChecked("diagram d: free { pen p [(0,0),(1,1)] }\n")).toBe(
      "diagram d: free { pen p [(0, 0), (1, 1)] }\n",
    );
  });

  it("keeps the comments inside a stroke, with a line break where one ends a line", () => {
    const items = spaced(tuples(16));
    const input =
      "diagram d: free {\n  pen p [\n    // start\n" +
      `    ${items.slice(0, 8).join(", ")}, // middle\n` +
      `    ${items.slice(8, 12).join(", ")}, /* inline */ ${items.slice(12).join(", ")}\n  ]\n}\n`;
    const output = formatChecked(input);
    expect(output).toContain("  pen p [\n    // start\n    (0, 100),");
    expect(output).toContain(`${items[7]}, // middle\n    ${items[8]},`);
    expect(output).toContain(`${items[11]}, /* inline */ ${items[12]},`);
    // A line comment cannot share a line with what follows it, so even a short list is filled.
    expect(formatChecked("diagram d: free {\n  pen p [(0,0), // a\n(1,1)]\n}\n")).toBe(
      "diagram d: free {\n  pen p [\n    (0, 0), // a\n    (1, 1)\n  ]\n}\n",
    );
    expect(formatChecked("diagram d: free {\n  pen p [(0,0),\n/* own */ (1,1)]\n}\n")).toBe(
      "diagram d: free {\n  pen p [\n    (0, 0),\n    /* own */ (1, 1)\n  ]\n}\n",
    );
    // A block comment within a line stays in it, and a comment after the statement ends it.
    expect(formatChecked("diagram d: free {\n  pen p [(0,0), /* a */ (1,1)] // end\n}\n")).toBe(
      "diagram d: free {\n  pen p [(0, 0), /* a */ (1, 1)] // end\n}\n",
    );
  });

  it("never breaks a line between tuples that no comma separates", () => {
    const items = spaced(tuples(20));
    const input = `diagram d: free {\n  pen p [${items.slice(0, 10).join(" ")}, ${items.slice(10).join(", ")}]\n}\n`;
    const output = formatChecked(input);
    expect(output).toContain(`    ${items.slice(0, 10).join(" ")},\n`);
  });

  it("keeps the rule of a via list", () => {
    const input =
      "diagram d: free {\n  line l from (0, 0) to (100, 0) via [(50, 20),\n(60, 20)]\n  pen p [(0, 0),\n(10, 10)]\n}\n";
    expect(formatChecked(input)).toBe(
      "diagram d: free {\n  line l from (0, 0) to (100, 0) via [\n    (50, 20),\n    (60, 20)\n  ]\n  pen p [(0, 0), (10, 10)]\n}\n",
    );
  });

  it("fills only the lists of pen statements", () => {
    const long = spaced(tuples(12)).join(", ");
    const input = `diagram d: free {\n  line l from (0, 0) to (1, 1) via [${long}]\n  pen -> api\n  rule pen { width 3 }\n}\n`;
    expect(formatChecked(input)).toBe(input);
    const joined = `diagram d: free {\n  pen a [(0, 0)]; pen b [${long}]\n}\n`;
    expect(formatChecked(joined)).toBe(
      `diagram d: free {\n  pen a [(0, 0)]; pen b [\n${filled(
        spaced(tuples(12)).map((item, i) => (i < 11 ? `${item},` : item)),
        "    ",
      ).join("\n")}\n  ]\n}\n`,
    );
  });

  it("keeps its guarantees on strokes written in any way", () => {
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (n: number) => Math.floor(next() * n);
    for (let round = 0; round < 120; round++) {
      const count = 1 + pick(70);
      let list = "";
      for (let i = 0; i < count; i++) {
        list += `(${pick(4000) / 10},${pick(900)})`;
        if (i === count - 1 && pick(2) === 0) break;
        list += ",";
        const roll = pick(12);
        if (roll === 0) list += " // c\n";
        else if (roll === 1) list += " /* b */ ";
        else if (roll === 2) list += "\n/* own */\n";
        else if (roll < 6) list += "\n";
        else list += " ";
      }
      const statement = `pen p${round} [${list}]${pick(3) === 0 ? " { width 3 }" : ""}`;
      const input =
        pick(2) === 0
          ? `diagram d: free {\n${statement}\n}\n`
          : `diagram d: free {\n  group g {\n    ${statement}\n  }\n}\n`;
      const indent = pick(4) === 0 ? "tab" : undefined;
      const output = formatChecked(input, indent);
      for (const row of output.split("\n")) {
        if (row.includes("/*") || row.includes("//")) continue;
        expect(row.replace(/\t/g, "    ").length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("keeps the line ending of the file in a filled list", () => {
    const input = `diagram d: free {\r\n  pen p [${spaced(tuples(12)).join(", ")}]\r\n}\r\n`;
    const output = formatChecked(input);
    expect(output.split("\r\n").length).toBeGreaterThan(4);
    expect(output.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("refuses a broken pen statement and leaves the text alone", () => {
    const input = "diagram d: free {\n  pen p [(0, 0), (10,]\n}\n";
    const result = formatSource(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
      for (const diagnostic of result.diagnostics) expect(diagnostic.code).toMatch(/^syntax\./);
    }
    expect("text" in result).toBe(false);
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
