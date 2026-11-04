import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { applyTextEdits } from "@meltemi/diagrams-language";
import { BOX_SHAPES, THEME_TOKENS, compile, readDiagramType } from "@meltemi/diagrams-model";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  DEFAULT_LABELS,
  applyEdits,
  defaultLabel,
  planEdit,
  type EditOperation,
  type EditPlan,
  type EditRejection,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const sheet = 'diagram d: flow {\n  api["API"]\n}\n';

function apply(operation: EditOperation, text: string, options = {}): string {
  const result = planEdit(compile(text, options), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  return applyTextEdits(text, result.plan.edits);
}

describe("the labels of new elements", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish label for every kind", () => {
    expect(untranslated(en, es, ["Actor", "Control"])).toEqual([]);
    expect(Object.keys(es.labels)).toEqual(Object.keys(DEFAULT_LABELS));
  });

  it("follow the interface language, and DEFAULT_LABELS stays in English", () => {
    expect(defaultLabel("node")).toBe("Node");
    expect(defaultLabel("node", "es")).toBe("Nodo");
    setLocale("es");
    expect(defaultLabel("node")).toBe("Nodo");
    expect(defaultLabel("datastore")).toBe("Almacén de datos");
    expect(defaultLabel("node", "en")).toBe("Node");
    expect(DEFAULT_LABELS.node).toBe("Node");
  });

  it("leave the kinds of declared types to their definitions", () => {
    expect(defaultLabel("service")).toBeUndefined();
    expect(defaultLabel("constructor")).toBeUndefined();
  });

  it("are written in the interface language unless the operation gives one", () => {
    expect(apply({ kind: "createElement", diagram: "d", elementKind: "node" }, sheet)).toContain(
      '  node1["Node"]\n',
    );
    setLocale("es");
    expect(apply({ kind: "createElement", diagram: "d", elementKind: "node" }, sheet)).toContain(
      '  node1["Nodo"]\n',
    );
    expect(
      apply({ kind: "createElement", diagram: "d", elementKind: "decision" }, sheet),
    ).toContain('decision decision1 "Decisión"');
    expect(
      apply({ kind: "createElement", diagram: "d", elementKind: "node", label: "Cola" }, sheet),
    ).toContain('  node1["Cola"]\n');
  });

  it("keep the label a declared type gives its kind", () => {
    const manifest = JSON.parse(
      readFileSync(
        join(CORPUS_ROOT, "projects", "valid", "plugins", "plugins", "erd", "meltemi-plugin.json"),
        "utf8",
      ),
    );
    const types = manifest.diagramTypes.map(
      (t: unknown) => readDiagramType(t, { name: "erd", version: "1.0.0" }).definition!,
    );
    const text = 'diagram s: erd {\n  entity customer "Customer" { owner "Sales" }\n}\n';
    setLocale("es");
    const created = apply(
      { kind: "createElement", diagram: "s", elementKind: "view" as never, id: "recent" },
      text,
      { types },
    );
    expect(created).toContain('view recent "View"');
  });
});

/** One value for every parameter of a sentence: a word, a list, a number or a located object. */
const ANY = Object.assign(["x", "y"], {
  line: 3,
  message: "m",
  kind: "system",
  path: "p",
  toString: () => "x",
});

/** The paths of the sentences (functions) that write the same text in both languages. */
function sentencesLeftInEnglish(a: object, b: object, path = ""): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(a)) {
    const at = path === "" ? key : `${path}.${key}`;
    const other = (b as Record<string, unknown>)[key];
    if (typeof value === "function") {
      const args = Array.from({ length: value.length }, () => ANY);
      const write = (sentence: unknown) => (sentence as (...values: unknown[]) => string)(...args);
      if (write(value) === write(other)) found.push(at);
    } else if (value !== null && typeof value === "object") {
      found.push(...sentencesLeftInEnglish(value, other as object, at));
    }
  }
  return found;
}

const read = (...path: string[]) => readFileSync(join(CORPUS_ROOT, ...path), "utf8");

const checkout = `language "0.2"

diagram checkout: flow {
  layout manual
  // api serves the shop
  api["API"]
  orders["Orders"]
  db[("DB")]
  api -> orders as create
  orders -> db

  placement {
    place api at (360, 180)
    place db at (1000, 180)
  }
}
`;

const story = [
  'language "0.2"',
  "diagram one: flow {",
  "  node a",
  "  node b",
  "  a -> b as ab",
  "}",
  "",
  "story s for one {",
  "  scene first {",
  "    reveal a, b",
  "    hold 1s",
  "  }",
  "}",
  "",
].join("\n");

const themed = `language "0.2"

theme brand {
  extends "editorial.light"
}

diagram d: flow {
  a -> b
}
`;

function refusal(text: string, operation: EditOperation): EditRejection {
  const result = planEdit(compile(text), operation);
  if (result.ok) throw new Error(`expected ${operation.kind} to be refused`);
  return result.rejection;
}

function planned(text: string, operation: EditOperation): EditPlan {
  const result = planEdit(compile(text), operation);
  if (!result.ok) throw new Error(`${result.rejection.code}: ${result.rejection.reason}`);
  return result.plan;
}

/** A rejection without its words: its fields, code, operation index and dependents. */
function shape(rejection: EditRejection) {
  return {
    fields: Object.keys(rejection),
    code: rejection.code,
    operationIndex: rejection.operationIndex,
    dependents: rejection.dependents?.map((d) => ({ kind: d.kind, name: d.name, range: d.range })),
  };
}

/** The rejection of an operation with an English and with a Spanish interface. */
function inBothLanguages(text: string, operation: EditOperation) {
  setLocale("en");
  const english = refusal(text, operation);
  setLocale("es");
  const spanish = refusal(text, operation);
  return { english, spanish };
}

describe("the reasons of refused edits", () => {
  afterEach(() => setLocale("en"));

  it("have Spanish words for every English one", () => {
    expect(untranslated(en, es, ["Actor", "Control"])).toEqual([]);
    expect(sentencesLeftInEnglish(en, es)).toEqual([]);
  });

  const cases: [string, string, EditOperation, string][] = [
    [
      "an unknown diagram",
      checkout,
      { kind: "setPosition", diagram: "shop", element: "api", x: 0, y: 0 },
      "No hay ningún diagrama `shop` en este documento.",
    ],
    [
      "an unknown element",
      checkout,
      { kind: "setPosition", diagram: "checkout", element: "cart", x: 0, y: 0 },
      "El elemento `cart` no existe en el diagrama `checkout`.",
    ],
    [
      "a duplicate id",
      checkout,
      { kind: "renameElement", diagram: "checkout", element: "api", newId: "db" },
      "`db` ya se usa en el diagrama `checkout`.",
    ],
    [
      "an invalid id",
      checkout,
      { kind: "renameElement", diagram: "checkout", element: "api", newId: "2api" },
      "`2api` no es un id válido; usa letras, dígitos y `_`, y empieza con una letra o `_`.",
    ],
    [
      "a sequence diagram",
      read("valid", "sequence", "payment.meltemi"),
      { kind: "setPosition", diagram: "payment", element: "api", x: 10, y: 10 },
      "`setPosition` no se aplica a los diagramas de secuencia, que conservan el orden de los eventos; usa reorderParticipant, moveEvent y setSpacing.",
    ],
    [
      "a C4 view",
      read("valid", "c4", "commerce.meltemi"),
      { kind: "renameElement", diagram: "containers", element: "customer", newId: "buyer" },
      "`renameElement` no se aplica a las vistas C4, que dibujan las entidades del modelo `commerce`; cambia el modelo con las operaciones de entidades, y la vista con includeEntity, excludeEntity, setLocalLabel, la colocación y los estilos.",
    ],
    [
      "a C4 model",
      read("valid", "c4", "commerce.meltemi"),
      { kind: "removeEntity", model: "commerce", entity: "shop.api", cascade: false },
      "La vista `components` abre `shop.api`; cambia su ámbito antes de quitar la entidad.",
    ],
    [
      "a story action",
      story,
      { kind: "insertStoryAction", story: "s", scene: "first", action: "trace", targets: ["a"] },
      "`trace` sigue una relación; `a` no lo es.",
    ],
    [
      "an unknown story",
      story,
      { kind: "insertScene", story: "tour", id: "next" },
      "No hay ninguna historia `tour`; historias: `s`.",
    ],
    [
      "an unknown theme",
      themed,
      { kind: "setThemeToken", theme: "corporate", token: "accent", value: "#ff0000" },
      "No hay ningún tema `corporate` en este archivo; los temas integrados no se pueden cambiar: crea un tema que extienda uno.",
    ],
    [
      "a group moved into its own subtree",
      'diagram s: free {\n  group outer "O" {\n    group inner "I" { }\n  }\n}\n',
      { kind: "moveElement", diagram: "s", element: "outer", parent: "inner" },
      "`outer` no se puede mover a `inner`, que está dentro de `outer`.",
    ],
    [
      "a move between groups of a sequence diagram",
      read("valid", "sequence", "payment.meltemi"),
      { kind: "moveElement", diagram: "payment", element: "api", parent: null },
      "Los participantes de los diagramas de secuencia no se mueven entre grupos; cambia su orden con reorderParticipant.",
    ],
    [
      "a move between groups of a C4 view",
      read("valid", "c4", "commerce.meltemi"),
      { kind: "moveElement", diagram: "containers", element: "customer", parent: null },
      "Los elementos de una vista C4 están donde sus entidades están en el modelo; no se mueven entre grupos.",
    ],
    [
      "a place for a card moved into a list",
      'diagram s: free {\n  group todo "To do" { layout column }\n  sticky c "C"\n}\n',
      { kind: "moveElement", diagram: "s", element: "c", parent: "todo", at: { x: 1, y: 2 } },
      "`todo` es una lista, que coloca a sus hijos: `c` entra en una posición, no en un punto.",
    ],
    [
      "an index that is not a position",
      'diagram s: free {\n  group todo "To do" { layout column }\n  sticky c "C"\n}\n',
      { kind: "moveElement", diagram: "s", element: "c", parent: "todo", index: -1 },
      "`-1` no es una posición entre las declaraciones de un bloque; las posiciones son números enteros desde 0.",
    ],
    [
      "a layout on a new box",
      'diagram s: free {\n  box a "A"\n}\n',
      { kind: "createElement", diagram: "s", elementKind: "box", layout: "column" },
      "Solo un grupo admite `layout`, no una caja.",
    ],
    [
      "spacing on a group that is not a list",
      'diagram s: free {\n  group g "G" { }\n}\n',
      {
        kind: "setElementProperty",
        diagram: "s",
        target: "g",
        targetKind: "element",
        property: "spacing",
        value: 8,
      },
      "`spacing` ordena los hijos de una lista; escribe `layout column` o `layout row` primero.",
    ],
    [
      "an unknown shape",
      checkout,
      { kind: "createElement", diagram: "checkout", elementKind: "node", shape: "blob" },
      `\`blob\` no es una forma; las formas son ${BOX_SHAPES.join(", ")}.`,
    ],
    [
      "a shape on a decision",
      checkout,
      { kind: "createElement", diagram: "checkout", elementKind: "decision", shape: "ellipse" },
      "Las formas son para las cajas libres y los nodos de flujo; una decisión no admite forma.",
    ],
    [
      "a two-way arrow in a C4 view",
      read("valid", "c4", "commerce.meltemi"),
      {
        kind: "createRelation",
        diagram: "context",
        from: "customer",
        to: "bank",
        line: "solid",
        heads: "both",
      },
      "Las relaciones de las vistas C4 van en un solo sentido: `->`.",
    ],
    [
      "a new diagram with a taken id",
      themed,
      { kind: "createDiagram", type: "flow", id: "brand" },
      "`brand` ya se usa en este archivo; elige otro id.",
    ],
    [
      "a theme token",
      themed,
      { kind: "setThemeToken", theme: "brand", token: "shade", value: "dark" },
      `\`shade\` no es un token de tema. Tokens de tema: ${Object.keys(THEME_TOKENS)
        .filter((t) => t !== "extends")
        .join(", ")}.`,
    ],
  ];

  it.each(cases)(
    "are written in the interface language for %s, with the same code",
    (_, text, operation, reason) => {
      const { english, spanish } = inBothLanguages(text, operation);
      expect(spanish.reason).toBe(reason);
      expect(spanish.reason).not.toBe(english.reason);
      expect(shape(spanish)).toEqual(shape(english));
    },
  );

  it("refuse an edit that would add errors with the new error in the interface language", () => {
    const operation: EditOperation = {
      kind: "setThemeToken",
      theme: "brand",
      token: "labelSize",
      value: 80,
    };
    const edited = themed.replace('  extends "editorial.light"\n', "$&  labelSize 80\n");
    const firstError = () =>
      compile(edited).diagnostics.find((d) => d.severity === "error")?.message;
    expect(compile(themed).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const { english, spanish } = inBothLanguages(themed, operation);
    expect(spanish.code).toBe("edit.invalid-value");
    expect(shape(spanish)).toEqual(shape(english));
    setLocale("en");
    expect(english.reason).toBe(firstError());
    setLocale("es");
    expect(spanish.reason).toBe(firstError());
    expect(spanish.reason).not.toBe(english.reason);
  });

  it("describe the dependents of a removal in the interface language", () => {
    const operation: EditOperation = {
      kind: "removeElement",
      diagram: "checkout",
      element: "db",
      cascade: false,
    };
    const { english, spanish } = inBothLanguages(checkout, operation);
    expect(shape(spanish)).toEqual(shape(english));
    expect(english.reason).toBe(
      "`db` is used by 2 statements; remove them first or remove with cascade.",
    );
    expect(spanish.reason).toBe(
      "`db` se usa en 2 instrucciones; quítalas primero o quítalo en cascada.",
    );
    expect(english.dependents?.map((d) => d.description)).toEqual([
      "relation `orders->db#1` on line 10",
      "place `db` on line 14",
    ]);
    expect(spanish.dependents?.map((d) => d.description)).toEqual([
      "relación `orders->db#1` en la línea 10",
      "`place` de `db` en la línea 14",
    ]);
  });

  it("describe the view statements and model relations that go with an entity", () => {
    const commerce = read("valid", "c4", "commerce.meltemi");
    const operation: EditOperation = {
      kind: "removeEntity",
      model: "commerce",
      entity: "shop.web",
      cascade: false,
    };
    const { english, spanish } = inBothLanguages(commerce, operation);
    expect(shape(spanish)).toEqual(shape(english));
    expect(spanish.reason).toBe(
      `Quitar \`shop.web\` también quita ${english.dependents!.length} instrucciones.`,
    );
    const descriptions = spanish.dependents!.map((d) => d.description);
    expect(descriptions).toContain("relación `visit` en la línea 24");
    expect(descriptions).toContain("`include` de la vista `containers` en la línea 39");
    expect(descriptions.every((d) => / en la línea \d+$/.test(d))).toBe(true);
  });

  it("write the notes of plans in the interface language", () => {
    const rename: EditOperation = {
      kind: "renameElement",
      diagram: "checkout",
      element: "api",
      newId: "gateway",
    };
    setLocale("es");
    const spanish = planned(checkout, rename);
    setLocale("en");
    const english = planned(checkout, rename);
    expect(spanish.edits).toEqual(english.edits);
    expect(english.notes).toEqual(["The comment on line 5 mentions `api` and was not changed."]);
    expect(spanish.notes).toEqual(["El comentario de la línea 5 menciona `api` y no se cambió."]);

    const styled =
      'diagram d: flow {\n  a["A"]\n  style a {\n    // brand color\n    fill "#f00"\n  }\n}\n';
    const remove: EditOperation = {
      kind: "removeElement",
      diagram: "d",
      element: "a",
      cascade: true,
    };
    expect(planned(styled, remove).notes).toEqual([
      "Removed the comment on line 4: // brand color",
    ]);
    setLocale("es");
    expect(planned(styled, remove).notes).toEqual([
      "Se quitó el comentario de la línea 4: // brand color",
    ]);
  });

  it("write the notes about implicit elements kept and links removed in the interface language", () => {
    const implicit = 'diagram d: flow {\n  a["A"]\n  a -> b\n}\n';
    const relation = refusal(implicit, {
      kind: "removeElement",
      diagram: "d",
      element: "a",
      cascade: false,
    }).dependents![0]!.name;
    setLocale("es");
    expect(
      planned(implicit, { kind: "removeElement", diagram: "d", element: "a", cascade: true }).notes,
    ).toEqual(["`b` solo estaba declarado por relaciones quitadas; se conserva como `node b`."]);
    expect(planned(implicit, { kind: "removeRelation", diagram: "d", relation }).notes).toEqual([
      "`b` solo estaba declarado por la relación quitada y se conserva declarado.",
    ]);
    const linked =
      'diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n}\ndiagram e: flow {\n  x["X"] { link d.g }\n}\n';
    expect(planned(linked, { kind: "ungroup", diagram: "d", group: "g" }).notes).toEqual([
      "Se quitó de otros diagramas el enlace a `g`.",
    ]);
    const told =
      'diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n}\nstory s for d {\n  scene one {\n    reveal g, a\n  }\n}\n';
    expect(planned(told, { kind: "ungroup", diagram: "d", group: "g" }).notes).toEqual([
      "Se quitó `g` de una acción de historia.",
    ]);
  });

  it("explain a stale revision in the interface language", () => {
    setLocale("es");
    const result = applyEdits({ text: checkout, revision: 2 }, { baseRevision: 1, edits: [] });
    expect(result.ok ? null : result.rejection).toEqual({
      code: "edit.stale-revision",
      reason:
        "El plan se hizo para la revisión 1, pero el documento está en la revisión 2. Vuelve a planificar a partir del texto actual.",
    });
  });
});
