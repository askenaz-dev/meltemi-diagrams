import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, untranslated, type Locale } from "@meltemi/diagrams-i18n";
import { CORPUS_ROOT } from "../../../test-support/corpus.js";
import {
  analyzeDocument,
  codeActions,
  completions,
  documentSymbols,
  hover,
  KEYWORD_DOCS,
  prepareRename,
  rename,
  type DocumentAnalysis,
} from "../src/index.js";
import { serviceMessages } from "../src/messages/services.js";
import { ProjectSessions } from "../src/node.js";

/** Analysis of a text with the cursor at `|`, and the offset of the cursor. */
function at(source: string) {
  const offset = source.indexOf("|");
  const text = source.replace("|", "");
  return { analysis: analyzeDocument({ text }), offset, text };
}

/** Analysis of a text with the cursor at the start of its first diagnostic with `code`. */
function atDiagnostic(text: string, code: string) {
  const analysis = analyzeDocument({ text });
  const found = analysis.diagnostics.find((d) => d.code === code);
  if (!found) throw new Error(`no ${code} in the text`);
  return { analysis, offset: found.range.start.offset, text };
}

/** Analysis of a file of the corpus inside its project, with `text` as its unsaved content. */
function inProject(relative: string, edit: (text: string) => string) {
  const path = join(CORPUS_ROOT, relative).replace(/\\/g, "/");
  const text = edit(readFileSync(join(CORPUS_ROOT, relative), "utf8"));
  // A project of its own each time, so no compilation made in another language is reused.
  const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
  const offset = text.indexOf("|");
  const analysis = sessions.analyze(path, text.replace("|", ""));
  sessions.close(path);
  return { analysis, offset, text: text.replace("|", "") };
}

const checkout = `diagram d: flow {
  layout manual
  api["API Gateway"]
  bus["Bus"] {
    port in west 30%
  }
  db[("DB")]
  cache["Cache"]
  api -> bus as publish
  api -> db: "save" as save
  placement {
    place api at (360, 180)
    place bus at (700, 180)
    place db at (700, 320)
    place cache at (360, 320)
    route publish from api.east to bus.in
    row api, bus
  }
  style api { fill accent }
}
`;

const commerce = readFileSync(join(CORPUS_ROOT, "valid", "c4", "commerce.meltemi"), "utf8");

/**
 * Every quick fix and refactor the services offer, each at a cursor where English offers it: the
 * scenarios of the other tests of the services, the C4 views, sequences and free diagrams.
 */
const SCENARIOS: Record<string, () => { analysis: DocumentAnalysis; offset: number }> = {
  "an unknown port": () => at(checkout.replace("to bus.in", "to bus.|inbox")),
  "an ignored placement": () =>
    at(checkout.replace("layout manual", "layout auto").replace("    place api", "    |place api")),
  "an element without a place": () => {
    const text = checkout.replace("    place cache at (360, 320)\n", "");
    return { analysis: analyzeDocument({ text }), offset: text.indexOf('cache["Cache"]') };
  },
  "an unknown property": () => at(checkout.replace("fill accent", "fil| accent")),
  "an unknown element of a flow": () =>
    at(checkout.replace("    row api, bus\n", "    place |ghost at (10, 20)\n")),
  "an unknown theme": () =>
    at(checkout.replace("  layout manual\n", '  layout manual\n  theme "|tecnical.light"\n')),
  "a text that overflows its box": () =>
    at(checkout.replace("    row api, bus\n", "    size |api (40, 60)\n")),
  "a relation without an id": () => at("diagram d: flow {\n  a -> b\n  |a -> c\n}\n"),
  "an assumed relation": () =>
    at('diagram d: flow {\n  |a -> b { assumption "Usual" }\n  b -> c\n}\n'),
  "an entity out of level": () =>
    atDiagnostic(
      commerce.replace(
        "  include customer, shop.web, shop.api, shop.db\n",
        "  include customer, shop.api.orders, shop.web\n",
      ),
      "c4.out-of-level",
    ),
  "a missing scope": () =>
    atDiagnostic(commerce.replace("  scope shop\n", ""), "c4.scope-required"),
  "an unknown entity": () =>
    atDiagnostic(
      commerce.replace(
        "  include customer, shop.web, shop.api, shop.db\n",
        "  include customer, shop.wbe, shop.api, shop.db\n",
      ),
      "ref.unknown-entity",
    ),
  "an unknown model": () =>
    atDiagnostic(
      commerce.replace("diagram context: c4 using commerce", "diagram context: c4 using comerce"),
      "ref.unknown-model",
    ),
  "a stray deactivate": () =>
    atDiagnostic(
      "diagram s: sequence {\n  a -> b\n  deactivate b\n  activate ghost\n}\n",
      "sequence.activation",
    ),
  "an unknown participant": () =>
    atDiagnostic(
      "diagram s: sequence {\n  a -> b\n  deactivate b\n  activate ghost\n}\n",
      "ref.unknown-element",
    ),
  "an unknown layer": () => at('diagram s: free {\n  box a "A" { layer fr|ont }\n}\n'),
  "an unknown link": () =>
    at('diagram f: flow {\n  api["API"]\n}\ndiagram s: free {\n  box a "A" { link f.ap|x }\n}\n'),
  "an unknown icon": () =>
    inProject("valid/checkout.meltemi", (text) =>
      text.replace('icon "tabler:server"', 'icon "tabler:serv|r"'),
    ),
  "an unknown class": () =>
    inProject("valid/checkout.meltemi", (text) =>
      text.replace(
        '    icon "tabler:server"\n',
        '    icon "tabler:server"\n    class hig|hligth\n',
      ),
    ),
};

/** The text in backticks of a sentence: code, which every language writes as it is. */
const code = (text: string) => (text.match(/`[^`]*`/g) ?? []).sort();

/** The actions offered at a scenario's cursor, analysed and asked for in a language. */
function actionsIn(locale: Locale, scenario: () => { analysis: DocumentAnalysis; offset: number }) {
  const previous = getLocale();
  setLocale(locale);
  try {
    const { analysis, offset } = scenario();
    return codeActions(analysis, { start: offset, end: offset });
  } finally {
    setLocale(previous);
  }
}

describe("the words of the language services", () => {
  it("are in both languages", () => {
    expect(untranslated(serviceMessages("en"), serviceMessages("es"))).toEqual([]);
  });

  it("keep every code sample of the documentation as written", () => {
    for (const group of ["keywords", "exportOptions", "storyWords"] as const) {
      const english: Readonly<Record<string, string>> = serviceMessages("en")[group];
      const spanish: Readonly<Record<string, string>> = serviceMessages("es")[group];
      expect(Object.keys(spanish)).toEqual(Object.keys(english));
      for (const [word, doc] of Object.entries(english)) {
        expect(code(spanish[word]!), `${group}.${word}`).toEqual(code(doc));
      }
    }
  });

  it("are in English by default, and the exported tables stay English", () => {
    expect(getLocale()).toBe("en");
    const keyword = at(checkout.replace("    place api at", "    |place api at"));
    expect(hover(keyword.analysis, keyword.offset)!.markdown).toBe(
      "**place** — The centre of a box: `place <element> at (x, y)`.",
    );
    setLocale("es");
    try {
      expect(KEYWORD_DOCS["place"]).toBe("The centre of a box: `place <element> at (x, y)`.");
    } finally {
      setLocale("en");
    }
  });
});

describe("services in a Spanish interface", () => {
  beforeEach(() => setLocale("es"));
  afterEach(() => setLocale("en"));

  it("describe a keyword in Spanish and keep its sample as written", () => {
    const { analysis, offset } = at(checkout.replace("    place api at", "    |place api at"));
    expect(hover(analysis, offset)!.markdown).toBe(
      "**place** — El centro de una caja: `place <element> at (x, y)`.",
    );
    const row = at(checkout.replace("    row api", "    |row api"));
    expect(hover(row.analysis, row.offset)!.markdown).toBe(
      "**row** — Los centros a la misma altura: `row a, b, c`.",
    );
  });

  it("describe elements and ports in Spanish", () => {
    const element = at(checkout.replace("api -> db", "|api -> db"));
    const markdown = hover(element.analysis, element.offset)!.markdown;
    expect(markdown).toContain("**nodo** `api` — API Gateway");
    expect(markdown).toContain("posición (360, 180)");
    expect(markdown).toContain("tamaño 160 × 56 (predeterminado)");
    const port = at(checkout.replace("to bus.in", "to bus.|in"));
    expect(hover(port.analysis, port.offset)!.markdown).toBe(
      "**puerto** `in` de `bus` — lado west, a un 30 % de su longitud",
    );
  });

  it("describe the actions of a story with Spanish times", () => {
    const { analysis, offset } = at(
      "diagram d: flow {\n  a -> b as r\n}\nstory tour for d {\n  scene one {\n    reveal a\n    |trace r over 1500ms\n  }\n}\n",
    );
    const markdown = hover(analysis, offset)!.markdown;
    expect(markdown).toContain("**trace** — Dibuja una relación de su origen a su destino");
    expect(markdown).toContain("`trace r [over <time>]`; 1,2 s de forma predeterminada.");
    expect(markdown).toContain("Desde 600 ms durante 1,5 s.");
  });

  it("detail completion items in Spanish", () => {
    const details = (source: string) => {
      const { analysis, offset } = at(source);
      return new Map(completions(analysis, offset).map((i) => [i.label, i.detail]));
    };
    expect(details(checkout.replace("layout manual", "layout |")).get("auto")).toBe(
      "Se elige automáticamente.",
    );
    const targets = details(checkout.replace("api -> db:", "api -> |db:"));
    expect(targets.get("bus")).toBe("nodo · Bus");
    expect(targets.get("db")).toBe("datos · DB");
    const ports = details(checkout.replace("to bus.in", "to bus.|"));
    expect(ports.get("in")).toBe("puerto en west al 30 %");
    expect(ports.get("north")).toBe("puerto cardinal");
    const style = details(checkout.replace("fill accent", "|"));
    expect(style.get("routing")).toBe("solo relaciones");
    expect(style.get("fill")).toBe('El color de fondo; `"none"` no dibuja fondo.');
  });

  it("detail the outline in Spanish", () => {
    const { analysis } = at(
      `diagram d: flow {\n  group g "G" {\n    a["A"]\n  }\n  b["B"]\n  a -> b as ab\n}\n|`,
    );
    const [diagram] = documentSymbols(analysis);
    expect(diagram!.children.map((c) => [c.name, c.detail])).toEqual([
      ["g", "grupo · G"],
      ["b", "nodo · B"],
      ["ab", ""],
    ]);
  });

  it("offer every quick fix with a Spanish title and the same edits", () => {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
      const english = actionsIn("en", scenario);
      const spanish = actionsIn("es", scenario);
      expect(english.length, `${name}: offered in English`).toBeGreaterThan(0);
      expect(
        spanish.map((a) => [a.kind, a.preferred, a.diagnostic?.code, a.edits]),
        name,
      ).toEqual(english.map((a) => [a.kind, a.preferred, a.diagnostic?.code, a.edits]));
      for (const [i, action] of spanish.entries()) {
        const title = english[i]!.title;
        expect(action.title, `${name}: ${title}`).not.toBe(title);
        expect(code(action.title), `${name}: ${title}`).toEqual(
          expect.arrayContaining(code(title)),
        );
      }
    }
  });

  it("titles fixes as commands", () => {
    const titles = (scenario: keyof typeof SCENARIOS) =>
      actionsIn("es", SCENARIOS[scenario]!).map((a) => a.title);
    expect(titles("an unknown property")).toContain("Cambiar a `fill`");
    expect(titles("an unknown element of a flow")).toContain("Declarar `ghost` como nodo");
    expect(titles("an unknown participant")).toContain("Declarar `ghost` como participante");
    expect(titles("an unknown port")).toEqual([
      "Declarar el puerto `inbox` en `bus`",
      "Usar `bus.in`",
    ]);
    expect(titles("a relation without an id")).toEqual([
      "Nombrar esta relación `a_c`",
      "Organizar el diagrama `d` (recalcular todas las posiciones)",
    ]);
    expect(titles("an ignored placement")).toEqual(
      expect.arrayContaining(["Cambiar a `layout assisted`", "Cambiar a `layout manual`"]),
    );
  });

  it("refuse renames in Spanish", () => {
    const anonymous = at(`diagram d: flow {\n  a -> b\n  |a -> c\n}\n`);
    expect(prepareRename(anonymous.analysis, anonymous.offset + 3)).toEqual({
      ok: false,
      reason:
        "Solo se puede cambiar el nombre de los ids de elementos, relaciones, notas y fragmentos.",
    });
    // A rename to an id in use names both ids.
    const { analysis, offset } = at(checkout.replace("place api at", "place |api at"));
    const refused = rename(analysis, offset, "bus");
    setLocale("en");
    const english = rename(analysis, offset, "bus");
    setLocale("es");
    if (refused.ok || english.ok) throw new Error("the rename should be refused");
    expect(refused.rejection.code).toBe(english.rejection.code);
    expect(refused.rejection.reason).not.toBe(english.rejection.reason);
    expect(refused.rejection.reason).toContain("`bus`");
    expect(refused.rejection.reason).toContain("`d`");
  });
});
