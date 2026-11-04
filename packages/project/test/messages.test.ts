import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import { createNodeIconPacks } from "@meltemi/diagrams-assets/node";
import { LANGUAGE_VERSION, type Diagnostic } from "@meltemi/diagrams-language";
import {
  MANIFEST_FIELDS,
  Workspace,
  createMemoryHost,
  parseJsonWithPositions,
  resolveImportPath,
  resolveReference,
} from "../src/index.js";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";

const builtInPacks = createNodeIconPacks();

/** A project with a problem of each kind: its manifest, a plugin, imports, classes and icons. */
const FILES = {
  "/p/project.json": JSON.stringify({
    name: "p",
    language: LANGUAGE_VERSION,
    locale: "fr",
    colour: "blue",
    plugins: {
      erd: { path: "plugins/erd", version: "1.0.0", permissions: ["diagram-types"] },
    },
  }),
  "/p/a.meltemi": [
    `language "${LANGUAGE_VERSION}"`,
    'import corporate from "./themes.meltemi"',
    "",
    "diagram d: flow {",
    "  layout manual",
    '  api["API"] { class hot }',
    '  db["DB"]',
    "  api -> db",
    "  style db {",
    '    icon "tabler:servr"',
    "  }",
    "  placement {",
    "    place api at (100, 100)",
    "    place db at (100, 300)",
    "  }",
    "}",
    "",
  ].join("\n"),
  "/p/assets/icons/brand/logo.svg":
    '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M4 4h16v16H4z"/></svg>',
  "/p/assets.lock.json": "{",
};

const workspace = () =>
  new Workspace(createMemoryHost(FILES), "/p", { toolVersion: "1.0.0", assets: { builtInPacks } });

/** Every problem of the project, by file, with the interface in `locale`. */
function problems(locale: Locale, ws = workspace()): Map<string, Diagnostic[]> {
  setLocale(locale);
  const found = new Map<string, Diagnostic[]>();
  const add = (path: string, list: readonly Diagnostic[]) =>
    found.set(path, [...(found.get(path) ?? []), ...list]);
  add(ws.manifest().path, ws.manifest().diagnostics);
  for (const [path, list] of ws.plugins().diagnostics) add(path, list);
  for (const [path, list] of ws.assets().diagnostics) add(path, list);
  for (const [path, file] of ws.compileProject().files) add(path, file.diagnostics);
  return found;
}

/** What a diagnostic says that must not depend on the language. */
const fixed = ({ code, severity, range, data }: Diagnostic) => ({ code, severity, range, data });

function find(found: Map<string, Diagnostic[]>, path: string, code: string): Diagnostic {
  const diagnostic = found.get(path)?.find((d) => d.code === code);
  expect(diagnostic, `${code} in ${path}`).toBeDefined();
  return diagnostic!;
}

describe("the words of projects", () => {
  afterEach(() => setLocale("en"));

  it("have a Spanish sentence for every English one", () => {
    expect(untranslated(en, es)).toEqual([]);
  });

  it("follow a change of the interface language in the same workspace", () => {
    const ws = workspace();
    const english = problems("en", ws);
    const compilations = ws.stats.compilations;
    expect(problems("en", ws)).toEqual(english);
    expect(ws.stats.compilations).toBe(compilations);
    expect(problems("es", ws)).toEqual(problems("es"));
    expect(ws.stats.compilations).toBeGreaterThan(compilations);
    expect(problems("en", ws)).toEqual(english);
  });

  it("are written in the interface language, with the same codes, ranges and data", () => {
    const english = problems("en");
    const spanish = problems("es");
    expect([...spanish.keys()]).toEqual([...english.keys()]);
    for (const [path, list] of english) {
      expect(spanish.get(path)!.map(fixed), path).toEqual(list.map(fixed));
      const words = new Set(list.map((d) => d.message));
      for (const diagnostic of spanish.get(path)!) {
        expect(words.has(diagnostic.message), diagnostic.message).toBe(false);
      }
    }
    expect([...english.values()].flat().map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "project.invalid-value",
        "project.unknown-field",
        "plugin.not-found",
        "module.not-found",
        "theme.unknown-class",
        "asset.unknown-icon",
        "asset.unsafe-svg",
        "asset.missing-license",
        "asset.invalid-file",
      ]),
    );
  });

  it("tell the fields of project.json in Spanish, `locale` included", () => {
    const found = problems("es");
    const locale = find(found, "/p/project.json", "project.invalid-value");
    expect(locale.message).toBe('`locale` debe ser "en" o "es".');
    expect(locale.hints).toEqual([
      "El idioma de las palabras que la herramienta agrega a los dibujos, reproductores y catálogos exportados.",
    ]);
    const unknown = find(found, "/p/project.json", "project.unknown-field");
    expect(unknown.message).toBe("Campo desconocido `colour` en `project.json`.");
    expect(unknown.hints).toEqual([`Campos: ${MANIFEST_FIELDS.join(", ")}.`]);
    expect(find(found, "/p/project.json", "plugin.not-found").message).toBe(
      "El plugin `erd` no tiene `meltemi-plugin.json` en `plugins/erd`.",
    );
  });

  it("tell imports, classes and icons in Spanish, with the candidates fixes read", () => {
    const english = problems("en");
    const found = problems("es");
    expect(find(found, "/p/a.meltemi", "module.not-found").message).toBe(
      "No hay ningún archivo en `themes.meltemi`.",
    );
    const hot = find(found, "/p/a.meltemi", "theme.unknown-class");
    expect(hot.message).toBe(
      "La clase `hot` no está declarada en el diagrama, en su tema ni en las clases integradas.",
    );
    expect(hot.hints).toEqual([
      "Clases disponibles: critical, deprecated, external, highlight, proposed.",
    ]);
    expect(hot.data).toEqual({
      candidates: ["critical", "deprecated", "external", "highlight", "proposed"],
    });
    const icon = find(found, "/p/a.meltemi", "asset.unknown-icon");
    expect(icon.message).toBe("El paquete `tabler` no tiene el icono `servr`.");
    expect(find(english, "/p/a.meltemi", "asset.unknown-icon").hints).toEqual([
      "Did you mean `tabler:server`?",
    ]);
    expect(icon.hints).toEqual(["¿Quisiste decir `tabler:server`?"]);
    expect(icon.data).toEqual({ candidates: ["tabler:server"] });
  });

  it("tell the problems of assets in Spanish, with the reasons of the assets package", () => {
    const found = problems("es");
    expect(find(found, "/p/assets/icons/brand/logo.svg", "asset.unsafe-svg").message).toBe(
      "No se puede usar el icono `brand:logo`: `<script>` no se permite en los iconos.",
    );
    const license = find(found, "/p/assets/icons/brand", "asset.missing-license");
    expect(license.message).toBe("El paquete de iconos `brand` no tiene licencia.");
    expect(find(found, "/p/assets.lock.json", "asset.invalid-file").message).toBe(
      "No es JSON válido: se esperaba un nombre de propiedad entre comillas, pero se encontró el final del archivo.",
    );
  });

  it("give the reasons of refused paths and references in Spanish", () => {
    setLocale("es");
    expect(resolveImportPath("/p/a.meltemi", "/abs.meltemi")).toEqual({
      ok: false,
      reason: "No se permiten rutas absolutas.",
    });
    expect(parseJsonWithPositions("[1,]")).toMatchObject({
      ok: false,
      message: "Sobra una coma antes de `]`.",
    });
    const ws = new Workspace(createMemoryHost(FILES), "/p", { toolVersion: "1.0.0" });
    const file = ws.file("/p/a.meltemi")!;
    expect(resolveReference(file, "nothing", ["diagram", "theme"])).toEqual({
      ok: false,
      message:
        "`nothing` no nombra un diagrama o un tema en este archivo ni en sus importaciones. Disponibles: d.",
    });
    expect(resolveReference(file, "d", ["story"])).toEqual({
      ok: false,
      message: "`d` es un diagrama, no una historia.",
    });
  });
});
