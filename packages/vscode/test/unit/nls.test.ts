import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NO_BROWSER, NO_FFMPEG } from "@meltemi/diagrams-capture";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../../test-support/corpus.js";
import { en, es, messages } from "../../src/extension/messages/index.js";

const root = join(REPO_ROOT, "packages", "vscode");
const read = (name: string) => readFileSync(join(root, name), "utf8");
const json = (name: string) => JSON.parse(read(name)) as Record<string, unknown>;

/** Words that are rightly the same in both languages: the product, and languages by their names. */
const SAME = ["Meltemi Diagrams", "English", "Español"];

/** The `%key%` references of a manifest, in order. */
function references(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    const match = /^%(.+)%$/.exec(value);
    if (match) found.push(match[1]!);
  } else if (Array.isArray(value)) {
    for (const item of value) references(item, found);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) references(item, found);
  }
  return found;
}

/** The code spans of a text, sorted: what a translation must keep as written. */
const code = (text: string) => (text.match(/`[^`]*`/g) ?? []).sort();

interface Contributes {
  commands: { command: string; title: string; category: string }[];
  customEditors: { displayName: string }[];
  configuration: {
    title: string;
    properties: Record<
      string,
      {
        enum?: string[];
        enumDescriptions?: string[];
        default?: unknown;
        description?: string;
        markdownDescription?: string;
      }
    >;
  };
}

describe("translations of the manifest", () => {
  const manifest = json("package.json");
  const contributes = manifest.contributes as Contributes;
  const english = json("package.nls.json") as Record<string, string>;
  const spanish = json("package.nls.es.json") as Record<string, string>;

  it("have the same keys in English and Spanish", () => {
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
  });

  it("cover every reference of the manifest, and only those", () => {
    const used = [...new Set(references(manifest))].sort();
    expect(used.filter((key) => english[key] === undefined)).toEqual([]);
    expect(used.filter((key) => spanish[key] === undefined)).toEqual([]);
    expect(Object.keys(english).filter((key) => !used.includes(key))).toEqual([]);
  });

  it("use keys that vsce resolves", () => {
    expect(Object.keys(english).filter((key) => !/^[\w.]+$/.test(key))).toEqual([]);
  });

  it("leave no word of the contributions in the manifest", () => {
    const isReference = (text: string | undefined) => text === undefined || /^%.+%$/.test(text);
    const words = [
      manifest.description as string,
      contributes.configuration.title,
      ...contributes.customEditors.map((e) => e.displayName),
      ...contributes.commands.flatMap((c) => [c.title, c.category]),
      ...Object.values(contributes.configuration.properties).flatMap((p) => [
        p.description,
        p.markdownDescription,
        ...(p.enumDescriptions ?? []),
      ]),
    ];
    expect(words.filter((text) => !isReference(text))).toEqual([]);
  });

  it("translate every word, keeping the product's name and code", () => {
    const same = Object.keys(english).filter(
      (key) => spanish[key] === english[key] && !SAME.includes(english[key]!),
    );
    expect(same).toEqual([]);
    const changed = Object.keys(english).filter(
      (key) => code(spanish[key]!).join() !== code(english[key]!).join(),
    );
    expect(changed).toEqual([]);
    expect(spanish["category"]).toBe("Meltemi Diagrams");
    expect(spanish["configuration.title"]).toBe("Meltemi Diagrams");
  });

  it("give the commands their titles in each language", () => {
    expect(english["command.openCanvasToSide.title"]).toBe("Open Canvas to the Side");
    expect(spanish["command.openCanvasToSide.title"]).toBe("Abrir el lienzo al lado");
    expect(english["command.exportSvg.title"]).toBe("Export SVG");
    expect(spanish["command.exportSvg.title"]).toBe("Exportar SVG");
    // The setting that names a command uses the command's title in the same language.
    for (const words of [english, spanish]) {
      const title = words["command.setAssistKey.title"]!.replace(/…$/, "");
      expect(words["config.assist.provider.markdownDescription"]).toContain(
        `**Meltemi Diagrams: ${title}**`,
      );
    }
  });

  it("offer the interface language as a setting", () => {
    const setting = contributes.configuration.properties["meltemi.language"]!;
    expect(setting).toMatchObject({ type: "string", enum: ["auto", "en", "es"], default: "auto" });
    expect(setting.enumDescriptions).toEqual([
      "%config.language.enum.auto%",
      "%config.language.enum.en%",
      "%config.language.enum.es%",
    ]);
  });

  it("are packaged with the extension", () => {
    const ignore = read(".vscodeignore").split(/\r?\n/);
    expect(ignore).toEqual(expect.arrayContaining(["!package.nls.json", "!package.nls.*.json"]));
  });
});

describe("words of the extension at run time", () => {
  afterEach(() => setLocale("en"));

  it("are all translated", () => {
    expect(untranslated(en, es)).toEqual([]);
  });

  it("have the same entries in both languages", () => {
    const shape = (value: unknown): unknown =>
      value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
        : typeof value;
    expect(shape(es)).toEqual(shape(en));
  });

  it("keep code as written", () => {
    const changed: string[] = [];
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === "string" && typeof b === "string") {
        if (code(a).join() !== code(b).join()) changed.push(path);
      } else if (a !== null && typeof a === "object") {
        for (const [key, value] of Object.entries(a))
          walk(value, (b as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    walk(en, es, "");
    expect(changed).toEqual([]);
    expect(es.exports.cannotDraw("checkout")).toContain("`checkout`");
    expect(es.canvas.themeCreated("brand")).toContain("`brand`");
  });

  it("say in English what the extension always said", () => {
    expect(en.common.wrote(["a.svg", "b.svg"])).toBe("Wrote a.svg, b.svg.");
    expect(en.exports.notExported(["a"], ["b.svg"])).toBe(
      "Not exported, because of problems: a. Wrote b.svg.",
    );
    expect(en.catalog.written("catalog/index.html", 1, 2)).toBe(
      "Wrote catalog/index.html (1 diagram, 2 stories).",
    );
    expect(en.catalog.written("catalog/index.html", 2, 1)).toBe(
      "Wrote catalog/index.html (2 diagrams, 1 story).",
    );
    expect(en.exports.noBrowser).toBe(NO_BROWSER);
    expect(en.exports.noFfmpeg).toBe(NO_FFMPEG);
    expect(en.problems.hint("Use `layout manual`.")).toBe("Hint: Use `layout manual`.");
  });

  it("speak Spanish with its own grammar", () => {
    expect(es.common.wrote(["a.svg"])).toBe("Se escribió a.svg.");
    expect(es.common.wrote(["a.svg", "b.svg", "c.svg"])).toBe(
      "Se escribieron a.svg, b.svg y c.svg.",
    );
    expect(es.exports.notExported(["a", "b"], [])).toBe("No se exportaron por problemas: a y b.");
    expect(es.exports.notExported(["a"], ["b.svg"])).toBe(
      "No se exportó por problemas: a. Se escribió b.svg.",
    );
    expect(es.catalog.written("catalog/index.html", 1, 2)).toBe(
      "Se escribió catalog/index.html (1 diagrama, 2 historias).",
    );
    expect(es.importer.coverage("flujo", 1, 2, 0)).toBe(
      "flujo: 1 convertido, 2 aproximados, 0 descartados",
    );
    expect(es.assist.leftOut([2])).toBe("El punto 2 cambió desde la propuesta y se dejó fuera.");
    expect(es.assist.leftOut([2, 3])).toBe(
      "Los puntos 2 y 3 cambiaron desde la propuesta y se dejaron fuera.",
    );
    expect(es.problems.hint("Use `layout manual`.")).toBe("Pista: Use `layout manual`.");
  });

  it("follow the interface language", () => {
    expect(messages().canvas.title).toBe("Meltemi Canvas");
    setLocale("es");
    expect(messages().canvas.title).toBe("Lienzo de Meltemi");
    expect(messages().common.showProblems).toBe("Mostrar los problemas");
    expect(messages("en").common.showProblems).toBe("Show Problems");
  });
});
