import { describe, expect, it } from "vitest";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { setJsonField, setJsonObjectField } from "../src/index.js";

const CLOUD = { host: "https://diagrams.meltemi.dev", project: "k4c2w7x5q3y6m2n5r7d4" };
const WRITTEN = '{ "host": "https://diagrams.meltemi.dev", "project": "k4c2w7x5q3y6m2n5r7d4" }';

const set = (text: string, value: Readonly<Record<string, string>> = CLOUD) =>
  applyTextEdits(text, setJsonObjectField(text, "cloud", value));

describe("setJsonObjectField", () => {
  it("adds the field to a CRLF, four-space manifest and changes nothing else, byte for byte", () => {
    const text =
      '{\r\n    "$schema": "../schemas/project.schema.json",\r\n    "name": "shop",\r\n' +
      '    "language": "0.2",\r\n    "sources": [\r\n        "diagrams",\r\n        "models"\r\n    ],\r\n' +
      '    "catalog": { "title": "Shop" }\r\n}\r\n';
    const edits = setJsonObjectField(text, "cloud", CLOUD);
    expect(edits).toHaveLength(1);
    const after = applyTextEdits(text, edits);
    // The field is one line in the file's indentation and line endings.
    expect(after).toBe(
      text.replace(
        '    "catalog": { "title": "Shop" }\r\n}',
        `    "catalog": { "title": "Shop" },\r\n    "cloud": ${WRITTEN}\r\n}`,
      ),
    );
    // Nothing before the end of the last field moved or changed.
    const keep = text.indexOf('{ "title": "Shop" }') + '{ "title": "Shop" }'.length;
    expect(after.slice(0, keep)).toBe(text.slice(0, keep));
    expect(after.slice(keep)).toBe(`,\r\n    "cloud": ${WRITTEN}\r\n}\r\n`);
    expect(after.includes("\r\n")).toBe(true);
    expect(after.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(JSON.parse(after)).toMatchObject({ cloud: CLOUD, name: "shop" });
  });

  it("adds the field to an LF manifest in two spaces and to a tab-indented one in tabs", () => {
    expect(set('{\n  "name": "p",\n  "language": "0.2"\n}\n')).toBe(
      `{\n  "name": "p",\n  "language": "0.2",\n  "cloud": ${WRITTEN}\n}\n`,
    );
    expect(set('{\n\t"name": "p"\n}')).toBe(`{\n\t"name": "p",\n\t"cloud": ${WRITTEN}\n}`);
  });

  it("replaces an existing cloud, one-line or spread over lines, and leaves the rest alone", () => {
    const old = { host: "http://localhost:8788", project: "aaaaaaaaaaaaaaaaaaaa" };
    const oneLine =
      '{\n  "name": "p",\n  "cloud": { "host": "x", "project": "y" },\n  "theme": "t"\n}\n';
    expect(set(oneLine)).toBe(`{\n  "name": "p",\n  "cloud": ${WRITTEN},\n  "theme": "t"\n}\n`);
    const spread =
      '{\r\n    "cloud": {\r\n        "host": "x",\r\n        "project": "y"\r\n    },\r\n    "name": "p"\r\n}\r\n';
    expect(set(spread, old)).toBe(
      `{\r\n    "cloud": { "host": "http://localhost:8788", "project": "aaaaaaaaaaaaaaaaaaaa" },\r\n    "name": "p"\r\n}\r\n`,
    );
  });

  it("changes nothing when the same object is written already", () => {
    const text = `{\n  "name": "p",\n  "cloud": ${WRITTEN}\n}\n`;
    expect(setJsonObjectField(text, "cloud", CLOUD)).toEqual([]);
    // Another order of the members is another text, and is written.
    expect(
      setJsonObjectField(text, "cloud", { project: CLOUD.project, host: CLOUD.host }),
    ).toHaveLength(1);
  });

  it("writes into a manifest with no field at all, an empty object and a one-line object", () => {
    expect(set("{}")).toBe(`{\n  "cloud": ${WRITTEN}\n}`);
    expect(set("{ }")).toBe(`{\n  "cloud": ${WRITTEN}\n}`);
    expect(set("{\r\n}\r\n")).toBe(`{\r\n  "cloud": ${WRITTEN}\r\n}\r\n`);
    expect(set('{ "name": "p" }')).toBe(`{ "name": "p", "cloud": ${WRITTEN} }`);
  });

  it("writes an object with no members as {} and escapes what needs it", () => {
    expect(set('{ "name": "p" }', {})).toBe('{ "name": "p", "cloud": {} }');
    expect(set('{ "name": "p" }', { host: 'a"b\\c' })).toBe(
      '{ "name": "p", "cloud": { "host": "a\\"b\\\\c" } }',
    );
  });

  it("skips braces and the key's name inside strings and nested values", () => {
    const text = '{\n  "format": { "indent": 2 },\n  "name": "a } b, \\"cloud\\""\n}\n';
    const after = set(text);
    expect(JSON.parse(after)).toEqual({
      format: { indent: 2 },
      name: 'a } b, "cloud"',
      cloud: CLOUD,
    });
  });

  it("refuses text that is not a JSON object", () => {
    expect(() => setJsonObjectField("[1]", "cloud", CLOUD)).toThrow();
    expect(() => setJsonObjectField("{ broken", "cloud", CLOUD)).toThrow();
    expect(() => setJsonObjectField("", "cloud", CLOUD)).toThrow();
  });

  it("is applied after setJsonField without disturbing it", () => {
    const text = '{\n    "name": "p"\n}\n';
    const themed = applyTextEdits(text, setJsonField(text, "theme", "technical.light"));
    expect(set(themed)).toBe(
      `{\n    "name": "p",\n    "theme": "technical.light",\n    "cloud": ${WRITTEN}\n}\n`,
    );
  });
});
