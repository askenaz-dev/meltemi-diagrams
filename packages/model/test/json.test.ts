import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import { compile, diagnosticsToJson, stringifyJson, toJson } from "../src/index.js";

const checkout = readFileSync(join(CORPUS_ROOT, "valid", "checkout.meltemi"), "utf8");

describe("heads in JSON", () => {
  it("writes heads after twoWay: none for a line, both for a two-way arrow", () => {
    const json = toJson(compile("diagram d: flow {\n  api -- cache as link\n  api <--> db\n}\n"));
    const relations = json.diagrams[0]!.relations;
    expect(relations.map((r) => [r.key, r.line, r.twoWay, r.heads])).toEqual([
      ["link", "solid", false, "none"],
      ["api->db#1", "dashed", true, "both"],
    ]);
    const keys = Object.keys(relations[0]!);
    expect(keys.indexOf("heads")).toBe(keys.indexOf("twoWay") + 1);
    // The same compilation gives the same string twice.
    const text = "diagram d: flow {\n  a --- b\n}\n";
    expect(stringifyJson(toJson(compile(text)))).toBe(stringifyJson(toJson(compile(text))));
  });
});

describe("model JSON", () => {
  it("describes the checkout diagram", () => {
    const json = toJson(compile(checkout));
    expect(Object.keys(json)).toEqual([
      "format",
      "version",
      "language",
      "ok",
      "imports",
      "diagrams",
      "themes",
      "models",
      "stories",
      "exports",
      "diagnostics",
    ]);
    expect([json.format, json.version, json.language, json.ok]).toEqual([
      "model-json",
      "0.1",
      "0.2",
      true,
    ]);
    expect(json.diagrams).toHaveLength(1);
    const [diagram] = json.diagrams;
    expect(diagram!.id).toBe("checkout");
    expect(Object.keys(diagram!)).toEqual([
      "id",
      "type",
      "range",
      "properties",
      "classes",
      "rules",
      "elements",
      "relations",
      "placement",
      "constraints",
      "styles",
      "animations",
      "events",
      "scenarios",
      "c4",
    ]);
    expect(diagram!.elements.map((e) => e.id)).toEqual(["client", "api", "orders", "db"]);
    expect(diagram!.relations.map((r) => r.key)).toEqual(["request", "create", "save"]);
    expect(diagram!.placement.map((p) => p.statement)).toEqual([
      "place",
      "place",
      "route",
      "label",
    ]);
    for (const entry of [...diagram!.elements, ...diagram!.relations, ...diagram!.placement]) {
      expect(entry.range.start.line).toBeGreaterThan(0);
    }
  });

  it("serialises the same compilation identically", () => {
    const compilation = compile(checkout);
    expect(stringifyJson(toJson(compilation))).toBe(stringifyJson(toJson(compilation)));
    expect(stringifyJson(toJson(compile(checkout)))).toBe(stringifyJson(toJson(compilation)));
  });

  it("emits anonymous relations with their key and a null id", () => {
    const json = toJson(compile("diagram d: flow {\n  a -> b\n}\n"));
    expect(json.diagrams[0]!.relations[0]).toMatchObject({
      key: "a->b#1",
      id: null,
      idRange: null,
    });
  });

  it("omits broken diagrams and keeps their diagnostics", () => {
    const text =
      'language "0.2"\n\ndiagram broken: flow {\n  api["API"]\n  placement {\n    place gateway at (10, 20)\n  }\n}\n\ndiagram fine: flow {\n  a -> b\n}\n';
    const json = toJson(compile(text));
    expect(json.ok).toBe(false);
    expect(json.diagrams.map((d) => d.id)).toEqual(["fine"]);
    expect(json.diagnostics).toHaveLength(1);
    expect(json.diagnostics[0]).toMatchObject({
      code: "ref.unknown-element",
      severity: "error",
      range: { start: { line: 6, column: 11 }, end: { line: 6, column: 18 } },
    });
  });

  it("gives every diagnostic the same shape", () => {
    const [d] = diagnosticsToJson(compile("diagram d: flow { direction UP }").diagnostics);
    expect(Object.keys(d!)).toEqual(["code", "severity", "message", "range", "hints", "related"]);
    expect(Object.keys(d!.range.start)).toEqual(["offset", "line", "column"]);
  });
});

describe("pens in JSON", () => {
  const SHEET =
    'diagram d: free {\n  box a "A"\n  line l from (0, 0) to (10, 0)\n  pen p [(0, 0), (12.5, -4)]\n}\n';
  const elements = (text: string) => toJson(compile(text)).diagrams[0]!.elements;

  it("writes a pen's points after line, and null on every other element", () => {
    const json = elements(SHEET);
    expect(json.map((e) => [e.id, e.kind, e.line === null, e.pen])).toEqual([
      ["a", "box", true, null],
      ["l", "line", false, null],
      [
        "p",
        "pen",
        true,
        {
          points: [
            { x: 0, y: 0 },
            { x: 12.5, y: -4 },
          ],
        },
      ],
    ]);
    for (const element of json) {
      const keys = Object.keys(element);
      expect(keys.indexOf("pen")).toBe(keys.indexOf("line") + 1);
    }
  });

  it("writes the same string twice, with opacity among the style properties", () => {
    const text = SHEET.replace("}\n", "  style p { opacity 0.35; width 20 }\n}\n");
    const json = toJson(compile(text));
    expect(json.diagrams[0]!.styles[0]!.properties).toEqual({ opacity: 0.35, width: 20 });
    expect(stringifyJson(toJson(compile(text)))).toBe(stringifyJson(json));
  });

  it("leaves out a flow diagram with a pen", () => {
    const json = toJson(compile("diagram d: flow {\n  pen p [(0, 0), (10, 10)]\n}\n"));
    expect(json.ok).toBe(false);
    expect(json.diagrams).toEqual([]);
    expect(json.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
  });
});

describe("whiteboard objects in JSON", () => {
  const SHEET =
    'language "0.2"\ntheme board { extends "sketch.light"; highlight "#fde68a"; sticky "#dbeafe"; stickyText "#111111" }\ndiagram w: free {\n  theme "board"\n  preset board\n  group todo "To do" {\n    layout column\n    spacing 12\n    sticky a "A"\n    sticky b "B"\n  }\n  group plain "Plain" {\n    box c "C"\n  }\n  pen p [(0, 0), (10, 10)]\n  style p { stroke highlight; opacity 0.35 }\n}\nstory tour for w {\n  scene one {\n    draw p over 2s\n  }\n}\n';

  it("writes kinds, lists after pens, the board preset, the tokens and draw", () => {
    const json = toJson(compile(SHEET));
    expect(json.ok).toBe(true);
    const diagram = json.diagrams[0]!;
    expect(diagram.properties.preset).toBe("board");
    expect(diagram.elements.map((e) => [e.id, e.kind, e.pen === null, e.list])).toEqual([
      ["todo", "group", true, { layout: "column", spacing: 12, align: null }],
      ["a", "sticky", true, null],
      ["b", "sticky", true, null],
      ["plain", "group", true, null],
      ["c", "box", true, null],
      ["p", "pen", false, null],
    ]);
    for (const element of diagram.elements) {
      const keys = Object.keys(element);
      expect(keys.indexOf("pen")).toBe(keys.indexOf("line") + 1);
      expect(keys.indexOf("list")).toBe(keys.indexOf("pen") + 1);
    }
    expect(diagram.styles[0]!.properties).toEqual({ opacity: 0.35, stroke: "@highlight" });
    expect(json.themes[0]!.tokens).toEqual({
      highlight: "#fde68a",
      sticky: "#dbeafe",
      stickyText: "#111111",
    });
    expect(json.stories[0]!.scenes[0]!.actions).toEqual([
      expect.objectContaining({ kind: "draw", targets: ["p"], startMs: 0, durationMs: 2000 }),
    ]);
    // The same string twice.
    expect(stringifyJson(toJson(compile(SHEET)))).toBe(stringifyJson(json));
  });

  it("leaves out a flow diagram with a sticky", () => {
    const json = toJson(compile('diagram d: flow {\n  sticky s "S"\n}\n'));
    expect(json.ok).toBe(false);
    expect(json.diagrams).toEqual([]);
    expect(json.diagnostics.map((d) => d.code)).toEqual(["prop.unknown"]);
  });
});

describe("note attachments in JSON", () => {
  const COMMERCE = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");
  const element = (json: ReturnType<typeof toJson>, diagram: string, id: string) =>
    json.diagrams.find((d) => d.id === diagram)!.elements.find((e) => e.id === id)!;

  it("writes attachedTo on every element, after shape and line and before entity", () => {
    const json = toJson(
      compile('diagram d: flow {\n  api["API"]\n  note limits "500 rps" on api\n}\n'),
    );
    expect(element(json, "d", "limits")).toMatchObject({ kind: "note", attachedTo: "api" });
    expect(element(json, "d", "api").attachedTo).toBeNull();
    for (const id of ["limits", "api"]) {
      const keys = Object.keys(element(json, "d", id));
      expect(keys.indexOf("attachedTo")).toBeGreaterThan(keys.indexOf("shape"));
      expect(keys.indexOf("attachedTo")).toBeLessThan(keys.indexOf("entity"));
    }
  });

  it("writes free and C4 notes, and the same string twice", () => {
    const free = toJson(compile('diagram d: free {\n  note hint "Draft"\n}\n'));
    expect(element(free, "d", "hint")).toMatchObject({ kind: "note", attachedTo: null });
    const c4 = toJson(compile(COMMERCE));
    expect(element(c4, "containers", "cache")).toMatchObject({
      kind: "note",
      entity: null,
      attachedTo: "shop.api",
    });
    expect(stringifyJson(toJson(compile(COMMERCE)))).toBe(stringifyJson(c4));
  });

  it("reports an unknown target as ref.unknown-element", () => {
    const json = toJson(compile('diagram d: flow {\n  note n "Text" on ghost\n}\n'));
    expect(json.ok).toBe(false);
    expect(json.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-element"]);
    expect(json.diagnostics[0]!.range.start).toMatchObject({ line: 2, column: 20 });
  });
});
