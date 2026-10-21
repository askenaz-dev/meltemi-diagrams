import { setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatSource,
  parse,
  tokenize,
  walk,
  type CstNode,
  type Diagnostic,
  type Missing,
} from "../src/index.js";
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

/** The diagnostics of one run in English and in Spanish, which differ only in their words. */
function both(run: () => readonly Diagnostic[]) {
  setLocale("en");
  const english = run();
  setLocale("es");
  const spanish = run();
  setLocale("en");
  expect(spanish.map(fixed)).toEqual(english.map(fixed));
  spanish.forEach((d, i) => {
    expect(d.message).not.toBe(english[i]!.message);
    d.hints?.forEach((hint, j) => expect(hint).not.toBe(english[i]!.hints![j]));
    d.related?.forEach((r, j) => expect(r.message).not.toBe(english[i]!.related![j]!.message));
  });
  return { english, spanish };
}

/**
 * The sentences of a Spanish catalog that read as the English ones for the same values. Every
 * value is a list of words, which stands for a word, a number or a list alike.
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

const missingNodes = (root: CstNode): string[] => {
  const found: string[] = [];
  walk(root, (node) => {
    if (node.kind === "Missing") found.push((node as Missing).expected);
  });
  return found;
};

const parseIn = (locale: Locale, text: string) => {
  setLocale(locale);
  return parse(text);
};

describe("the language's words", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
    expect(untranslatedSentences(en, es)).toEqual([]);
  });

  it("tell parse errors in Spanish with the same codes, ranges and related ranges", () => {
    const top = both(() => parse("widget x { }\n").diagnostics);
    expect(top.english.map((d) => d.message)).toEqual([
      "Unexpected `widget` at the top level of the file.",
    ]);
    expect(top.spanish[0]).toMatchObject({
      code: "syntax.unexpected-top-level",
      message: "No se esperaba `widget` en el nivel superior del archivo.",
      hints: [
        "Las instrucciones de nivel superior son `language`, `import`, `model`, `diagram`, `story`, `export` y `theme`.",
      ],
    });

    const unclosed = both(() => parse("diagram d: flow {\n  a -> b\n").diagnostics);
    expect(unclosed.spanish[0]).toMatchObject({
      code: "syntax.expected-token",
      message:
        "Se esperaba `}` para cerrar el bloque abierto en la línea 1, pero se encontró el final del archivo.",
      related: [{ message: "El bloque se abrió aquí." }],
    });

    const type = both(() => parse("diagram d: { }\n").diagnostics);
    expect(type.english[0]!.message).toBe(
      "Expected a diagram type (`flow`, `sequence`, `c4` or `free`) but found `{`.",
    );
    expect(type.spanish[0]!.message).toBe(
      "Se esperaba un tipo de diagrama (`flow`, `sequence`, `c4` o `free`), pero se encontró `{`.",
    );

    const statement = both(() => parse('diagram d: flow {\n  a -> b "x"\n}\n').diagnostics);
    expect(statement.spanish.map((d) => d.code)).toEqual(statement.english.map((d) => d.code));
  });

  it("tell lexical problems in Spanish with their severities", () => {
    const string = both(() => tokenize('api["API\nnext').diagnostics);
    expect(string.spanish[0]).toMatchObject({
      code: "syntax.unterminated-string",
      message: 'La cadena no se cierra con `"` antes del final de la línea.',
    });

    const endings = both(() => tokenize("a\r\nb\nc\n").diagnostics);
    expect(endings.spanish[0]).toMatchObject({
      code: "syntax.mixed-line-endings",
      severity: "warning",
      message: "Esta línea termina con LF, pero el archivo empezó con CRLF.",
    });

    const bom = both(() => tokenize("\uFEFFa").diagnostics);
    expect(bom.spanish[0]).toMatchObject({
      code: "syntax.bom",
      severity: "info",
      message: "El archivo empieza con una marca de orden de bytes; se conserva tal cual.",
    });

    const escape = both(() => tokenize('"C:\\icons"').diagnostics);
    expect(escape.spanish[0]!.message).toBe("Secuencia de escape desconocida `\\i` en la cadena.");

    const characters = both(() => tokenize("a => b ## c").diagnostics);
    expect(characters.spanish.map((d) => d.code)).toEqual([
      "syntax.unexpected-character",
      "syntax.unexpected-character",
    ]);
  });

  it("tell an invalid formatting option in Spanish", () => {
    const option = both(() => {
      const result = formatSource("a -> b\n", { indent: 9 });
      return result.ok ? [] : result.diagnostics;
    });
    expect(option.spanish[0]).toMatchObject({
      code: "format.invalid-option",
      message: 'La sangría debe ser de 1 a 8 espacios o "tab", no 9.',
    });
  });

  it("keep the tree the same in every language", () => {
    const text = "diagram d: { }\nmodel { }\n";
    const english = parseIn("en", text);
    const spanish = parseIn("es", text);
    expect(missingNodes(spanish.root)).toEqual(missingNodes(english.root));
    expect(missingNodes(spanish.root)).toContain(
      "a diagram type (`flow`, `sequence`, `c4` or `free`)",
    );
    expect(spanish.tokens).toEqual(english.tokens);
  });

  it("write each message when it is made, never when a module loads", () => {
    const text = 'widget x { }\ndiagram d: flow {\n  api["API\n';
    const before = parseIn("en", text).diagnostics;
    const spanish = parseIn("es", text).diagnostics;
    const after = parseIn("en", text).diagnostics;
    expect(spanish.map((d) => d.message)).not.toEqual(before.map((d) => d.message));
    expect(after).toEqual(before);
  });
});
