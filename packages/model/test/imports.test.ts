import { describe, expect, it } from "vitest";
import { compile, toJson } from "../src/index.js";

describe("imports in the model", () => {
  it("records both import forms with their bindings", () => {
    const compilation = compile(
      [
        'language "0.2"',
        'import "../themes/company.meltemi" as company',
        'import corporate as corp, base from "./themes.meltemi"',
        "",
      ].join("\n"),
    );
    expect(compilation.diagnostics).toEqual([]);
    const [namespace, members] = compilation.document.imports;
    expect(namespace).toMatchObject({
      form: "namespace",
      path: "../themes/company.meltemi",
      afterBlock: false,
    });
    expect(namespace!.bindings).toMatchObject([{ name: "company", member: null }]);
    expect(members!.bindings.map((b) => [b.name, b.member])).toEqual([
      ["corp", "corporate"],
      ["base", "base"],
    ]);
    expect(members!.bindings[0]!.range.start.column).toBe(21);
    expect(members!.bindings[0]!.memberRange!.start.column).toBe(8);
  });

  it("marks imports that follow a block", () => {
    const compilation = compile('diagram d: flow { a -> b }\nimport "./themes.meltemi" as t\n');
    expect(compilation.document.imports[0]!.afterBlock).toBe(true);
  });

  it("reports a binding that clashes with a local theme", () => {
    const compilation = compile(
      'import corporate from "./themes.meltemi"\ntheme corporate { accent "#000000" }\n',
    );
    const duplicate = compilation.diagnostics.find((d) => d.code === "ref.duplicate-id");
    expect(duplicate?.range.start.line).toBe(2);
    expect(duplicate?.related?.[0]?.range.start.line).toBe(1);
  });

  it("leaves imported theme bases to project compilation", () => {
    const compilation = compile(
      [
        'import "./company.meltemi" as company',
        'import corporate as corp from "./company.meltemi"',
        'theme a { extends "company.corporate" }',
        'theme b { extends "corp" }',
        'theme c { extends "missing" }',
        "",
      ].join("\n"),
    );
    const unknown = compilation.diagnostics.filter((d) => d.code === "theme.unknown-base");
    expect(unknown.map((d) => d.range.start.line)).toEqual([5]);
  });

  it("emits imports in the JSON", () => {
    const json = toJson(compile('import base as b from "./themes.meltemi"\n'));
    expect(json.imports).toEqual([
      {
        form: "members",
        path: "./themes.meltemi",
        bindings: [{ name: "b", member: "base" }],
        range: json.imports[0]!.range,
      },
    ]);
  });
});
