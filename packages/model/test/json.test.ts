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
