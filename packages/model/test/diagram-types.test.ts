import { describe, expect, it } from "vitest";
import {
  MODEL_API_VERSION,
  SOURCE_LIMITS,
  compile,
  readDiagramType,
  relationAllowed,
  toJson,
  type DiagramTypeDefinition,
} from "../src/index.js";

const ERD = {
  type: "erd",
  title: "Entity relationship",
  layout: { mode: "auto", algorithm: "layered", direction: "LR" },
  elements: {
    entity: {
      label: "Entity",
      style: { shape: "rectangle", stroke: "@accent", width: 2 },
      properties: { owner: "string", rows: "number", archived: "boolean" },
      required: ["owner"],
    },
    view: { label: "View", style: { line: "dashed" } },
  },
  relations: {
    allowed: [
      ["entity", "entity"],
      ["view", "entity"],
    ],
    properties: { cardinality: { kind: "enum", values: ["one_to_one", "one_to_many"] } },
  },
};

const erd = readDiagramType(ERD, { name: "erd", version: "1.0.0" }).definition!;
const types: DiagramTypeDefinition[] = [erd];

describe("declared diagram types", () => {
  it("read a definition and keep its provenance", () => {
    expect(MODEL_API_VERSION).toBe("1.0.0");
    expect(erd).toMatchObject({
      type: "erd",
      plugin: { name: "erd", version: "1.0.0" },
      layout: { mode: "auto", algorithm: "layered", direction: "LR" },
      tools: [
        { kind: "entity", label: "Entity" },
        { kind: "view", label: "View" },
      ],
    });
    expect(erd.elements.entity!.properties.archived).toEqual({
      kind: "boolean",
      values: [],
      description: null,
    });
    expect(relationAllowed(erd, "view", "entity")).toBe(true);
    expect(relationAllowed(erd, "entity", "view")).toBe(false);
  });

  it("refuse words of the language, unknown kinds and bad styles", () => {
    const problems = readDiagramType(
      {
        type: "flow",
        layout: { algorithm: "spiral" },
        elements: {
          story: {},
          table: {
            style: { shape: "blob", fill: "@nope", radius: 80 },
            properties: { url: "string" },
          },
        },
        relations: { allowed: [["table", "ghost"]] },
      },
      null,
    ).problems;
    expect(problems).toEqual([
      "diagram type `flow`: `type` must be a lower-case word that is not a word of the language.",
      "diagram type `flow`: layout `algorithm` takes layered, tree.",
      "diagram type `flow`, kind `story`: a kind must be a lower-case word that is not a word of the language.",
      "diagram type `flow`, kind `table`: `url` cannot name a property.",
      "diagram type `flow`, kind `table`: `shape` takes rounded, rectangle, square, ellipse, circle, diamond, cylinder, pill, triangle, parallelogram, trapezoid, pentagon, hexagon, octagon, star, cloud, document, callout, arrow, framed, flag, person, agent, icon.",
      'diagram type `flow`, kind `table`: `fill` takes a colour token such as "@accent" or a CSS colour.',
      "diagram type `flow`, kind `table`: `radius` takes a number in range.",
      'diagram type `flow`: relation pair ["table","ghost"] names an unknown kind.',
    ]);
  });

  it("take every shape and a corner radius in kind styles", () => {
    const { definition, problems } = readDiagramType(
      {
        type: "bpmn",
        elements: {
          task: { style: { shape: "hexagon", radius: 0 } },
          event: { style: { shape: "circle", radius: 64 } },
        },
      },
      null,
    );
    expect(problems).toEqual([]);
    expect(definition!.elements.task!.style).toEqual({ shape: "hexagon", radius: 0 });
    expect(definition!.elements.event!.style).toEqual({ shape: "circle", radius: 64 });
  });

  it("take the vertical alignment in kind styles, as the text alignment", () => {
    const read = (verticalAlign: string) =>
      readDiagramType(
        { type: "notes", elements: { card: { style: { verticalAlign, textAlign: "left" } } } },
        null,
      );
    const { definition, problems } = read("top");
    expect(problems).toEqual([]);
    expect(definition!.elements.card!.style).toEqual({ verticalAlign: "top", textAlign: "left" });
    expect(read("center").problems).toHaveLength(1);
  });

  it("compile kinds as boxes with their data, on the free profile", () => {
    const text = `diagram s: erd {
  entity customer "Customer" { owner "Sales"; archived true }
  entity orders "Orders" { owner "Sales"; rows 1200 }
  view open "Open orders"
  customer -> orders: "places" { cardinality one_to_many }
  open -> orders
  rule view { color muted }
}
`;
    const compilation = compile(text, { types });
    expect(compilation.diagnostics).toEqual([]);
    const diagram = compilation.document.diagrams[0]!;
    expect(diagram.type).toBe("free");
    expect(diagram.definition?.type).toBe("erd");
    expect(diagram.properties.layout).toBe("auto");
    expect(diagram.elements.map((e) => [e.id, e.kind, e.typeKind, e.data])).toEqual([
      ["customer", "box", "entity", { owner: "Sales", archived: true }],
      ["orders", "box", "entity", { owner: "Sales", rows: 1200 }],
      ["open", "box", "view", {}],
    ]);
    expect(diagram.relations[0]!.data).toEqual({ cardinality: "one_to_many" });
    const json = toJson(compilation) as {
      diagrams: { declaredType?: unknown; elements: { typeKind?: string }[] }[];
    };
    expect(json.diagrams[0]!.declaredType).toEqual({
      type: "erd",
      plugin: { name: "erd", version: "1.0.0" },
    });
    expect(json.diagrams[0]!.elements[0]!.typeKind).toBe("entity");
  });

  it("check required properties, allowed relations and property values", () => {
    const text = `diagram s: erd {
  entity a "A"
  view v "V"
  a -> v { cardinality many }
}
`;
    const codes = compile(text, { types }).diagnostics.map((d) => `${d.code}: ${d.message}`);
    expect(codes).toContain("type.missing-property: Entity `a` needs `owner`.");
    expect(codes).toContain(
      "type.relation-not-allowed: Entity relationship diagrams do not allow relations from `entity` to `view`.",
    );
    expect(codes.some((c) => c.startsWith("prop.invalid-value"))).toBe(true);
    expect(compile(text).diagnostics[0]!.message).toBe(
      "Unknown diagram type `erd`; expected one of flow, sequence, c4, free.",
    );
  });
});

describe("source limits", () => {
  it("refuse files and diagrams beyond their bounds", () => {
    const huge = compile(`// ${"x".repeat(SOURCE_LIMITS.characters)}`);
    expect(huge.diagnostics.map((d) => d.code)).toEqual(["limit.too-large"]);
    expect(huge.document.diagrams).toEqual([]);
    const many = Array.from({ length: SOURCE_LIMITS.elements + 1 }, (_, i) => `  e${i}["E"]`).join(
      "\n",
    );
    const compiled = compile(`diagram big: flow {\n${many}\n}\n`);
    expect(compiled.diagnostics.map((d) => d.code)).toEqual(["limit.too-complex"]);
    expect(compiled.document.diagrams[0]!.hasErrors).toBe(true);
  });
});
