import { setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import type { Diagnostic } from "@meltemi/diagrams-language";
import { afterEach, describe, expect, it } from "vitest";
import { compile, readDiagramType, type CompileOptions } from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

/** What a diagnostic says that must not depend on the language. */
const fixed = ({ code, severity, range, data, hints, related }: Diagnostic) => ({
  code,
  severity,
  range,
  data,
  hints: hints?.length ?? 0,
  related: related?.map((r) => r.range) ?? [],
});

const compileIn = (locale: Locale, text: string, options?: CompileOptions) => {
  setLocale(locale);
  return compile(text, options).diagnostics;
};

/** The diagnostics of a text in English and in Spanish, which differ only in their words. */
function both(text: string, options?: CompileOptions) {
  const english = compileIn("en", text, options);
  const spanish = compileIn("es", text, options);
  setLocale("en");
  expect(english.length).toBeGreaterThan(0);
  expect(spanish.map(fixed)).toEqual(english.map(fixed));
  spanish.forEach((d, i) => {
    expect(d.message).not.toBe(english[i]!.message);
    d.hints?.forEach((hint, j) => expect(hint).not.toBe(english[i]!.hints![j]));
    d.related?.forEach((r, j) => expect(r.message).not.toBe(english[i]!.related![j]!.message));
  });
  return { english, spanish };
}

function find(list: readonly Diagnostic[], code: string): Diagnostic {
  const found = list.find((d) => d.code === code);
  expect(found, code).toBeDefined();
  return found!;
}

/**
 * The sentences of a Spanish catalog that read as the English ones for the same values. Every
 * value is a list of words, which stands for a word, a number, a list or a flag alike.
 */
function untranslatedSentences(english: object, spanish: object, path = ""): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(english)) {
    const at = path === "" ? key : `${path}.${key}`;
    const other = (spanish as Record<string, unknown>)[key];
    if (typeof value === "function" && typeof other === "function") {
      const args = Array.from({ length: value.length }, () => ["a", "b"]);
      if (value(...args) === other(...args)) found.push(at);
    } else if (value !== null && typeof value === "object") {
      found.push(...untranslatedSentences(value, other as object, at));
    }
  }
  return found;
}

const flow = (body: string) => `diagram d: flow {\n${body}\n}\n`;

const ERD = {
  type: "erd",
  title: "Entity relationship",
  elements: {
    entity: { label: "Entity", properties: { owner: "string" }, required: ["owner"] },
    view: { label: "View" },
  },
  relations: { allowed: [["view", "entity"]] },
};

describe("the words of compilation", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
    expect(untranslatedSentences(en, es)).toEqual([]);
  });

  it("tell an unknown element in Spanish, with the ids a fix reads", () => {
    const { english, spanish } = both(
      flow("  a -> b\n  placement {\n    place ghost at (10, 20)\n  }"),
    );
    expect(find(english, "ref.unknown-element").message).toBe("Unknown element `ghost`.");
    expect(find(spanish, "ref.unknown-element")).toMatchObject({
      message: "Elemento desconocido `ghost`.",
      hints: ['Decláralo primero, por ejemplo `ghost["Label"]`.'],
      data: { ids: ["ghost"] },
    });
  });

  it("tell an unknown property in Spanish, with the candidates a fix offers", () => {
    const { english, spanish } = both(flow('  a["A"] {\n    shade "red"\n  }'));
    expect(find(english, "prop.unknown").message).toBe(
      "Unknown property `shade` in an element block.",
    );
    const unknown = find(spanish, "prop.unknown");
    expect(unknown.message).toBe("Propiedad desconocida `shade` en un bloque de elemento.");
    expect(unknown.hints![0]).toMatch(
      /^Los bloques de elemento aceptan `description`, .* y `\w+`\.$/,
    );
    expect(unknown.data?.candidates).toContain("description");
  });

  it("tell duplicate ids in Spanish, with the first declaration", () => {
    const { spanish } = both(`${flow('  a["A"]\n  a["B"]')}${flow("  x -> y")}`);
    expect(spanish.map((d) => [d.code, d.message, d.related?.[0]?.message])).toEqual([
      [
        "ref.duplicate-id",
        "`a` ya está declarado en este diagrama.",
        "Se declaró por primera vez aquí.",
      ],
      [
        "ref.duplicate-id",
        "`d` ya lo usa otro bloque de nivel superior de este archivo.",
        "Se usó por primera vez aquí.",
      ],
    ]);
  });

  it("tell a bad value in Spanish", () => {
    const { english, spanish } = both(flow("  direction sideways\n  a -> b"));
    const invalid = find(spanish, "prop.invalid-value");
    expect(find(english, "prop.invalid-value").message).toMatch(
      /^Invalid value `sideways` for `direction`; expected one of /,
    );
    expect(invalid.message).toMatch(
      /^Valor no válido para `direction`: `sideways`; se esperaba uno de estos valores: [A-Z, ]+\.$/,
    );
  });

  it("tell an unknown entity of a C4 view in Spanish, with the candidates", () => {
    const { spanish } = both(
      'model m {\n  system shop "Shop" {\n    container api "API"\n  }\n}\n' +
        "diagram v: c4 using m {\n  level container\n  scope shop\n  include shop.apu\n}\n",
    );
    expect(find(spanish, "ref.unknown-entity")).toMatchObject({
      message: "Entidad desconocida `shop.apu` en el modelo `m`.",
      hints: ["¿Quisiste decir `shop.api`?"],
      data: { candidates: ["shop.api"] },
    });
  });

  it("tell a misplaced entity of a model in Spanish", () => {
    const { spanish } = both('model m {\n  container api "API"\n}\n');
    expect(find(spanish, "model.invalid-nesting")).toMatchObject({
      message:
        "No se puede declarar un contenedor en la raíz del modelo; los contenedores van en un sistema.",
      hints: ["Aquí puedes declarar `person` y `system`."],
    });
  });

  it("tell sequence errors in Spanish", () => {
    const { spanish } = both(
      "diagram s: sequence {\n  participant a\n  participant b\n  a -> b\n  deactivate b\n" +
        '  scenario happy {\n    choose ghost "OK"\n  }\n}\n',
    );
    expect(find(spanish, "sequence.activation")).toMatchObject({
      message: "`b` no está activo aquí.",
      hints: ["Agrega `activate b` antes o quita este `deactivate`."],
    });
    expect(find(spanish, "sequence.scenario").message).toBe("Fragmento desconocido `ghost`.");
  });

  it("tell story errors in Spanish, warnings included", () => {
    const { spanish } = both(
      `${flow("  api -> db")}story tour for d {\n  scene one {\n    reveal apu\n  }\n  scene two {\n  }\n}\n`,
    );
    expect(find(spanish, "ref.unknown-element")).toMatchObject({
      message: "`d` no tiene ningún elemento ni relación con nombre `apu`.",
      hints: ["¿Quisiste decir `api`?"],
      data: { ids: ["apu"], candidates: ["api"] },
    });
    expect(find(spanish, "story.empty-scene")).toMatchObject({
      severity: "warning",
      message: "La escena `two` no tiene acciones y no dura nada.",
    });
  });

  it("tell export profile errors in Spanish", () => {
    const { spanish } = both(`${flow("  a -> b")}export p for d {\n  format svg\n  fps 30\n}\n`);
    expect(find(spanish, "export.invalid-option").message).toMatch(/^`fps` /);
    expect(find(spanish, "export.invalid-option").message).not.toMatch(/\bapplies\b/);
  });

  it("tell theme block errors in Spanish", () => {
    const { spanish } = both('theme t {\n  extends "nope"\n  colour "#fff"\n}\n');
    expect(find(spanish, "prop.unknown").message).toBe("Token de tema desconocido `colour`.");
    expect(find(spanish, "theme.unknown-base").message).toBe(
      'El tema `t` extiende "nope", que no es un tema integrado ni está definido en este archivo.',
    );
  });

  it("tell the errors of declared types in Spanish, and their problems", () => {
    const erd = readDiagramType(ERD, null).definition!;
    const { spanish } = both(
      'diagram e: erd {\n  entity orders "Orders"\n  view report "Report"\n  orders -> report\n}\n',
      { types: [erd] },
    );
    expect(find(spanish, "type.missing-property")).toMatchObject({
      message: "Entity `orders` necesita `owner`.",
      hints: ["Los diagramas Entity relationship exigen `owner` en cada `entity`."],
    });
    expect(find(spanish, "type.relation-not-allowed")).toMatchObject({
      message: "Los diagramas Entity relationship no permiten relaciones de `entity` a `view`.",
      hints: ["Permitidas: view -> entity."],
    });

    const problems = (locale: Locale) => {
      setLocale(locale);
      return readDiagramType({ type: "flow", elements: {} }, null).problems;
    };
    expect(problems("es")).toEqual([
      "tipo de diagrama `flow`: `type` debe ser una palabra en minúsculas que no sea una palabra del lenguaje.",
      "tipo de diagrama `flow`: `elements` debe nombrar al menos un tipo.",
    ]);
    expect(problems("en")).toEqual([
      "diagram type `flow`: `type` must be a lower-case word that is not a word of the language.",
      "diagram type `flow`: `elements` must name at least one kind.",
    ]);
  });

  it("write each message when it is made, never when a module loads", () => {
    const text =
      `${flow('  a["A"]\n  a["B"]\n  direction sideways')}` +
      'story tour for d {\n  scene one {\n    reveal ghost\n  }\n}\ntheme t { colour "#fff" }\n';
    const before = compileIn("en", text);
    const spanish = compileIn("es", text);
    const after = compileIn("en", text);
    expect(spanish.map((d) => d.message)).not.toEqual(before.map((d) => d.message));
    expect(after).toEqual(before);
  });
});
