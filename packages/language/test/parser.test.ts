import { describe, expect, it } from "vitest";
import {
  parse,
  toText,
  walk,
  type Block,
  type CstNode,
  type DiagramBlock,
  type Header,
  type KeywordStatement,
  type List,
  type NodeKind,
  type RelationStatement,
  type ShorthandDeclaration,
  type Tuple,
} from "../src/index.js";

function nodesOfKind<T extends CstNode>(root: CstNode, kind: NodeKind): T[] {
  const found: T[] = [];
  walk(root, (node) => {
    if (node.kind === kind) found.push(node as T);
  });
  return found;
}

function diagramBlock(text: string): { block: Block; result: ReturnType<typeof parse> } {
  const result = parse(text);
  const diagram = result.root.items.find((i) => i.kind === "DiagramBlock") as DiagramBlock;
  return { block: diagram.block as Block, result };
}

const codes = (text: string) => parse(text).diagnostics.map((d) => d.code);

describe("parser: source file structure", () => {
  it("parses a minimal file", () => {
    const result = parse('language "0.2"\ndiagram example: flow { A -> B }\n');
    expect(result.diagnostics).toEqual([]);
    const [header, diagram] = result.root.items as [Header, DiagramBlock];
    expect(header.kind).toBe("Header");
    expect(header.version).toMatchObject({ kind: "String", value: "0.2" });
    expect(diagram.kind).toBe("DiagramBlock");
    expect(diagram.id).toMatchObject({ text: "example" });
    expect(diagram.type).toMatchObject({ text: "flow" });
    expect((diagram.block as Block).statements.map((s) => s.kind)).toEqual(["RelationStatement"]);
  });

  it("reports a header that is not first and keeps both nodes", () => {
    const result = parse('diagram a: flow {\n}\nlanguage "0.2"\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.header-not-first"]);
    expect(result.diagnostics[0]!.range.start.line).toBe(3);
    expect(result.root.items.map((i) => i.kind)).toEqual(["DiagramBlock", "Header"]);
  });

  it("reports an unknown top-level word and parses what follows", () => {
    const result = parse("widget x { }\ndiagram a: flow {\n  A -> B\n}\n");
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.code).toBe("syntax.unexpected-top-level");
    expect(d.range.start.offset).toBe(0);
    expect(d.range.end.offset).toBe(6);
    const diagram = result.root.items[1] as DiagramBlock;
    expect(diagram.kind).toBe("DiagramBlock");
    expect(diagram.hasError).toBe(false);
  });

  it("parses story, export, model and theme blocks", () => {
    const result = parse(
      "model m { }\ntheme t { }\nstory s for d { }\nexport e for s {\n  format mp4\n}\n",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.root.items.map((i) => i.kind)).toEqual([
      "ModelBlock",
      "ThemeBlock",
      "StoryBlock",
      "ExportBlock",
    ]);
  });

  it("parses `using` on diagrams", () => {
    const result = parse("diagram containers: c4 using commerce {\n  level container\n}\n");
    expect(result.diagnostics).toEqual([]);
    const diagram = result.root.items[0] as DiagramBlock;
    expect(diagram.usingRef).toMatchObject({ kind: "QualifiedRef", text: "commerce" });
  });

  it("recovers from a broken diagram header and still parses the body", () => {
    const { block, result } = diagramBlock("diagram checkout flow {\n  A -> B\n}\n");
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.expected-token"]);
    expect(result.diagnostics[0]!.message).toMatch(/`:`/);
    expect(block.statements.map((s) => s.kind)).toEqual(["RelationStatement"]);
  });

  it("requires a version string after `language`", () => {
    expect(codes("language 0.2\n")).toEqual(["syntax.expected-token"]);
  });
});

describe("parser: statement forms", () => {
  it("parses a relation with label and id", () => {
    const { block, result } = diagramBlock(
      'diagram d: flow {\n  client -> api: "HTTPS" as request\n}\n',
    );
    expect(result.diagnostics).toEqual([]);
    const relation = block.statements[0] as RelationStatement;
    expect(relation.kind).toBe("RelationStatement");
    expect(relation.source.text).toBe("client");
    expect(relation.arrow.text).toBe("->");
    expect(relation.target).toMatchObject({ text: "api" });
    expect(relation.label).toMatchObject({ value: "HTTPS" });
    expect(relation.id).toMatchObject({ text: "request" });
  });

  it("parses dashed relations, qualified targets and relation blocks", () => {
    const { block, result } = diagramBlock(
      'diagram d: flow {\n  shop.web --> shop.api {\n    description "x"\n  }\n}\n',
    );
    expect(result.diagnostics).toEqual([]);
    const relation = block.statements[0] as RelationStatement;
    expect(relation.arrow.kind).toBe("DashedArrow");
    expect(relation.source.text).toBe("shop.web");
    expect(relation.block?.statements).toHaveLength(1);
  });

  it("splits statements joined by semicolons", () => {
    const { block, result } = diagramBlock(
      "diagram d: flow {\n  animate r { effect flow; duration 1200ms; repeat forever }\n}\n",
    );
    expect(result.diagnostics).toEqual([]);
    const animate = block.statements[0] as KeywordStatement;
    expect(animate.block!.statements.map((s) => s.kind)).toEqual([
      "KeywordStatement",
      "KeywordStatement",
      "KeywordStatement",
    ]);
    expect(animate.block!.statements.map((s) => (s as KeywordStatement).keyword.text)).toEqual([
      "effect",
      "duration",
      "repeat",
    ]);
  });

  it("continues a list across lines", () => {
    const { block, result } = diagramBlock(
      "diagram d: flow {\n  route r from a.east to b.west via [(520, 180),\n    (600, 180)]\n}\n",
    );
    expect(result.diagnostics).toEqual([]);
    expect(block.statements).toHaveLength(1);
    const route = block.statements[0] as KeywordStatement;
    const via = route.args.at(-1) as List;
    expect(via.kind).toBe("List");
    expect(via.items.map((i) => i.kind)).toEqual(["Tuple", "Tuple"]);
    expect(((via.items[1] as Tuple).items[0] as { value: number }).value).toBe(600);
  });

  it("continues when the next line starts with the closer", () => {
    const { result } = diagramBlock("diagram d: flow {\n  place a at (\n    1, 2\n  )\n}\n");
    expect(result.diagnostics).toEqual([]);
  });

  it("parses a block chain", () => {
    const { block, result } = diagramBlock(
      'diagram p: sequence {\n  alt "Approved" { a --> b } else "Declined" { a --> c }\n}\n',
    );
    expect(result.diagnostics).toEqual([]);
    const alt = block.statements[0] as KeywordStatement;
    expect(alt.chain?.clauses.map((c) => c.keyword.text)).toEqual(["alt", "else"]);
    expect(alt.chain?.clauses.map((c) => c.block.kind)).toEqual(["Block", "Block"]);
  });

  it("parses shorthand declarations", () => {
    const { block, result } = diagramBlock(
      'diagram d: flow {\n  client["Cliente"]\n  db[("PostgreSQL")]\n}\n',
    );
    expect(result.diagnostics).toEqual([]);
    const [client, db] = block.statements as ShorthandDeclaration[];
    expect([client!.id.text, client!.shape, client!.label]).toMatchObject([
      "client",
      "box",
      { value: "Cliente" },
    ]);
    expect([db!.id.text, db!.shape]).toEqual(["db", "data"]);
  });

  it("parses keyword statements with qualified references and commas", () => {
    const { block, result } = diagramBlock(
      "diagram v: c4 using m {\n  include customer, shop.web, shop.api\n}\n",
    );
    expect(result.diagnostics).toEqual([]);
    const include = block.statements[0] as KeywordStatement;
    expect(include.args.map((a) => (a as { text: string }).text)).toEqual([
      "customer",
      "shop.web",
      "shop.api",
    ]);
  });

  it("reports a missing closing brace at end of file", () => {
    const text = "diagram d: flow {\n  A -> B\n  C -> D\n";
    const { block, result } = diagramBlock(text);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.code).toBe("syntax.expected-token");
    expect(d.message).toMatch(/`}`/);
    expect(d.range.start.offset).toBe(text.length);
    expect(block.statements.filter((s) => s.kind === "RelationStatement")).toHaveLength(2);
    expect(block.close.kind).toBe("Missing");
  });

  it("reports chained relations", () => {
    expect(codes("diagram d: flow {\n  a -> b -> c\n}\n")).toEqual(["syntax.unexpected-token"]);
  });

  it("reports text after a complete statement", () => {
    const { result, block } = diagramBlock('diagram d: flow {\n  a -> b "x"\n}\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.unexpected-token"]);
    expect(block.statements[0]!.hasError).toBe(true);
  });

  it("closes an unfinished tuple at the end of its line", () => {
    const { result, block } = diagramBlock(
      "diagram d: flow {\n  place a at (1, 2\n  place b at (3, 4)\n}\n",
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.message).toMatch(/`\)`/);
    expect(result.diagnostics[0]!.range.start.line).toBe(2);
    expect(block.statements).toHaveLength(2);
    expect(block.statements[1]!.hasError).toBe(false);
  });

  it("reports statements that start with a string", () => {
    const result = parse('diagram d: flow {\n  "Label"\n}\n');
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.unexpected-token"]);
    expect(result.diagnostics[0]!.hints?.[0]).toMatch(/id\["Label"\]/);
  });

  it("stops descending at the nesting limit", () => {
    const text = `diagram d: flow {\n  x ${"a { ".repeat(150)}${"} ".repeat(150)}\n}\n`;
    const result = parse(text);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["syntax.nesting-too-deep"]);
    expect(toText(result.root)).toBe(text);
  });
});

describe("parser: lossless tree", () => {
  it("round-trips an invalid file and inserts Missing nodes", () => {
    const text = 'diagram d: flow {\n  api["API\n  a = b\n  c -> \n';
    const result = parse(text);
    expect(toText(result.root)).toBe(text);
    expect(nodesOfKind(result.root, "Missing").length).toBeGreaterThan(0);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "syntax.unterminated-string",
      "syntax.unexpected-character",
      "syntax.expected-token",
      "syntax.expected-token",
    ]);
  });

  it("keeps CRLF, tabs and comments byte for byte", () => {
    const text = 'language "0.2"\r\n/* head */\r\ndiagram d: flow {\r\n\tA -> B // x\r\n}\r\n';
    const result = parse(text);
    expect(result.diagnostics).toEqual([]);
    expect(toText(result.root)).toBe(text);
  });
});

describe("parser: error recovery", () => {
  it("reports one diagnostic for one bad statement between good ones", () => {
    const { block, result } = diagramBlock(
      'diagram d: flow {\n  a -> b\n  c -> : "x"\n  d -> e\n}\n',
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.range.start.line).toBe(3);
    const relations = block.statements.filter(
      (s): s is RelationStatement => s.kind === "RelationStatement" && !s.hasError,
    );
    expect(
      relations.map((r) => `${r.source.text}->${(r.target as { text: string }).text}`),
    ).toEqual(["a->b", "d->e"]);
  });

  it("isolates errors inside nested blocks", () => {
    const { block, result } = diagramBlock(
      "diagram d: flow {\n  placement {\n    place a (1, 2\n  }\n  a -> b\n}\n",
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(block.statements.map((s) => s.kind)).toEqual(["KeywordStatement", "RelationStatement"]);
    expect(block.statements[1]!.hasError).toBe(false);
  });
});

describe("parser: diagnostics contract", () => {
  it("positions a missing relation target at the end of the line", () => {
    const text = "diagram d: flow {\n  a -> b\n  foo -> \n}\n";
    const result = parse(text);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.range.start).toEqual({ offset: text.indexOf(" \n}") + 1, line: 3, column: 10 });
    expect(d.severity).toBe("error");
    expect(d.message).toMatch(/relation target/);
  });

  it.each([
    ["an empty string", ""],
    ["only closing braces", "}}}}}}"],
    ["only opening braces", "{{{{{{"],
    ["a lone arrow", "->"],
  ])("does not throw on %s", (_name, text) => {
    const result = parse(text);
    expect(toText(result.root)).toBe(text);
  });

  it("does not throw on 1 MB of random printable characters", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const alphabet = ' abcxyz_019{}()[]:;,."\\/*->=#%\n\n\t';
    let text = "";
    for (let i = 0; i < 1_000_000; i++) text += alphabet[Math.floor(random() * alphabet.length)];
    const result = parse(text);
    expect(toText(result.root)).toBe(text);
  });
});
