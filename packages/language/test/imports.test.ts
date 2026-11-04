import { describe, expect, it } from "vitest";
import {
  isToken,
  parse,
  toText,
  type DiagramBlock,
  type Header,
  type ImportStatement,
  type Token,
} from "../src/index.js";

const imports = (text: string) =>
  parse(text).root.items.filter((i): i is ImportStatement => i.kind === "ImportStatement");

const textOf = (element: unknown) => (isToken(element as Token) ? (element as Token).text : null);

describe("parser: import statements", () => {
  it("parses a namespace import", () => {
    const result = parse('import "../themes/company.meltemi" as company\n');
    expect(result.diagnostics).toEqual([]);
    const [statement] = imports(result.text);
    expect(statement!.form).toBe("namespace");
    expect(statement!.path).toMatchObject({ kind: "String", value: "../themes/company.meltemi" });
    expect(textOf(statement!.namespace)).toBe("company");
    expect(statement!.members).toEqual([]);
  });

  it("parses member imports with aliases", () => {
    const result = parse('import corporate as corp, base from "./themes.meltemi"\n');
    expect(result.diagnostics).toEqual([]);
    const [statement] = imports(result.text);
    expect(statement!.form).toBe("members");
    expect(statement!.path).toMatchObject({ kind: "String", value: "./themes.meltemi" });
    expect(statement!.members.map((m) => [m.id.text, textOf(m.alias)])).toEqual([
      ["corporate", "corp"],
      ["base", null],
    ]);
  });

  it("reports a missing path after from and parses the next line", () => {
    const result = parse("import corporate from\ndiagram d: flow { a -> b }\n");
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.expected-token"]);
    expect(result.diagnostics[0]!.message).toContain("path string after `from`");
    expect(result.diagnostics[0]!.range.start.line).toBe(1);
    expect(result.root.items.map((i) => i.kind)).toEqual(["ImportStatement", "DiagramBlock"]);
  });

  it("reports a namespace import without as", () => {
    const result = parse('import "./a.meltemi"\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.expected-token"]);
    expect(result.diagnostics[0]!.message).toContain("`as` and a namespace");
  });

  it("reports an import with nothing to import", () => {
    const result = parse("import\n");
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.expected-token"]);
  });

  it("reports a dangling comma", () => {
    const result = parse('import a, from "./x.meltemi"\n');
    expect(result.diagnostics[0]!.code).toBe("syntax.expected-token");
  });

  it("keeps the order header, imports, blocks", () => {
    const text = 'language "0.2"\nimport "./themes.meltemi" as t\ndiagram d: flow { a -> b }\n';
    const result = parse(text);
    expect(result.diagnostics).toEqual([]);
    const [header, statement, diagram] = result.root.items as [
      Header,
      ImportStatement,
      DiagramBlock,
    ];
    expect([header.kind, statement.kind, diagram.kind]).toEqual([
      "Header",
      "ImportStatement",
      "DiagramBlock",
    ]);
    expect(toText(result.root)).toBe(text);
  });

  it("reports a header after an import", () => {
    const result = parse('import "./a.meltemi" as a\nlanguage "0.2"\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.header-not-first"]);
  });
});
