import { afterEach, describe, expect, it } from "vitest";
import { setLocale, untranslated } from "@meltemi/diagrams-i18n";
import {
  coverageMarkdown,
  coverageNotes,
  importText,
  MERMAID_COVERAGE,
  PLANTUML_COVERAGE,
  type ImportFinding,
  type ImportOptions,
  type ImportResult,
} from "@meltemi/diagrams-import";
import { en } from "../src/messages/en.js";
import { es } from "../src/messages/es.js";
import { messages } from "../src/messages/index.js";

afterEach(() => setLocale("en"));

/** What a finding says apart from its words; none of it depends on the language. */
const facts = (f: ImportFinding) => ({
  code: f.code,
  severity: f.severity,
  range: f.range,
  construct: f.construct,
  status: f.status,
  essential: f.essential,
  diagram: f.diagram,
  hints: f.hints?.length ?? 0,
});

/** The same import with the interface in English and in Spanish. */
function inBoth(text: string, options: ImportOptions = {}): { en: ImportResult; es: ImportResult } {
  setLocale("en");
  const english = importText(text, options);
  setLocale("es");
  const spanish = importText(text, options);
  setLocale("en");
  return { en: english, es: spanish };
}

/** A note that is only a finding code, such as "`import.syntax`.", reads the same in Spanish. */
const PURE_CODE = /^`[^`]+`\.$/;

describe("the import catalog", () => {
  it("has every English entry in Spanish", () => {
    // Coverage notes that are only a finding code are rightly the same in both languages.
    expect(untranslated(en, es, ["coverage.syntax", "coverage.unsupportedDiagram"])).toEqual([]);
  });

  it("keeps the English sentences as they were", () => {
    expect(en.mermaid.shape("lean_left", "parallelogram")).toBe(
      "The lean left shape is drawn as a parallelogram.",
    );
    expect(en.mermaid.shape("doublecircle", "circle")).toBe(
      "The double circle shape is drawn as a circle.",
    );
    expect(en.mermaid.shape("inv_trapezoid", "trapezoid")).toBe(
      "The inverted trapezoid shape is drawn as a trapezoid.",
    );
    expect(en.mermaid.shape("bolt", "ellipse")).toBe("The bolt shape is drawn as an ellipse.");
    expect(en.block.arrow).toBe("The block arrow is drawn pointing right.");
    expect(en.import.partial(1)).toBe(
      "1 essential construct was not imported; the sheet is incomplete.",
    );
    expect(en.import.partial(3)).toBe(
      "3 essential constructs were not imported; the sheet is incomplete.",
    );
    expect(en.c4.missingEnd("b", true)).toBe(
      "`b` is not an element of the diagram (boundaries that are not drawn cannot be related); the relation is not imported.",
    );
    expect(en.c4.nested("system")).toBe("A system inside a boundary is drawn at the top level.");
  });

  it("counts and names shapes in Spanish", () => {
    expect(es.mermaid.shape("lean_left", "parallelogram")).toBe(
      "La forma inclinada a la izquierda se dibuja como un paralelogramo.",
    );
    expect(es.mermaid.shape("doublecircle", "circle")).toBe(
      "La forma de círculo doble se dibuja como un círculo.",
    );
    expect(es.mermaid.shape("inv_trapezoid", "trapezoid")).toBe(
      "La forma de trapecio invertido se dibuja como un trapecio.",
    );
    expect(es.mermaid.shape("bolt", "star")).toBe("La forma `bolt` se dibuja como `shape star`.");
    expect(es.import.partial(1)).toBe(
      "1 construcción esencial no se importó; la hoja está incompleta.",
    );
    expect(es.preprocessor.arguments("$p", 1)).toBe("`$p` admite 1 argumento.");
    expect(es.preprocessor.arguments("$p", 2)).toBe("`$p` admite 2 argumentos.");
  });
});

describe("findings in the interface language", () => {
  it("reports an approximated mirrored shape in Spanish with the facts of English", () => {
    const source = "flowchart LR\n  a[\\Input\\] --> b[Box]";
    const english = importText(source);
    setLocale("es");
    const spanish = importText(source);
    const mirrored = (result: ImportResult) =>
      result.findings.find((f) => f.code === "import.approximated");
    const before = mirrored(english)!;
    const after = mirrored(spanish)!;
    expect(before.construct).toBe("flowchart.shape.lean_left");
    expect(before.severity).toBe("info");
    expect(before.status).toBe("approximated");
    expect(before.message).toBe(messages("en").mermaid.shape("lean_left", "parallelogram"));
    expect(before.message).toBe("The lean left shape is drawn as a parallelogram.");
    expect(facts(after)).toEqual(facts(before));
    expect(after.message).toBe(messages("es").mermaid.shape("lean_left", "parallelogram"));
    expect(after.message).not.toBe(before.message);
    expect(english.status).toBe("complete");
    expect(spanish.status).toBe("complete");
    expect(spanish.findings.map(facts)).toEqual(english.findings.map(facts));
    // The sheet's own words follow the import's locale, which is English by default.
    expect(spanish.text).toBe(english.text);
  });

  it("reports the other front-ends in Spanish", () => {
    const skin = inBoth("@startuml\nskinparam monochrome true\nA -> B\n@enduml");
    const skinparam = skin.es.findings.find((f) => f.construct === "plantuml.skinparam")!;
    expect(skinparam.code).toBe("import.unsupported-construct");
    expect(skinparam.status).toBe("dropped");
    expect(skinparam.message).toBe(messages("es").plantuml.skinparam);
    expect(skin.en.findings.find((f) => f.construct === "plantuml.skinparam")!.message).toBe(
      "`skinparam` styling is not imported.",
    );
    expect(skin.es.status).toBe(skin.en.status);

    const classes = inBoth("classDiagram\n  A <|-- B");
    expect(classes.es.status).toBe("failed");
    expect(classes.es.findings.map(facts)).toEqual(classes.en.findings.map(facts));
    const unsupported = classes.es.findings[0]!;
    expect(unsupported.code).toBe("import.unsupported-diagram");
    expect(unsupported.message).toBe(messages("es").mermaid.unsupported("classDiagram"));
    expect(unsupported.hints).toEqual([messages("es").mermaid.supportedHint]);
    expect(classes.en.findings[0]!.hints).toEqual([messages("en").mermaid.supportedHint]);

    const prose = inBoth("just prose");
    expect(prose.es.status).toBe("failed");
    expect(prose.es.findings.map(facts)).toEqual(prose.en.findings.map(facts));
    expect(prose.es.findings[0]!.code).toBe("import.unknown-format");
    expect(prose.es.findings[0]!.message).toBe(messages("es").import.unknownFormat);
    expect(prose.es.findings[0]!.hints).toEqual([messages("es").import.unknownFormatHint]);

    const database = inBoth('C4Context\n  SystemDb(db, "Database")');
    const approximated = database.es.findings.find((f) => f.construct === "mermaid.c4.SystemDb")!;
    expect(approximated.message).toBe(messages("es").coverage.databaseSystem);
    expect(database.en.findings.find((f) => f.construct === "mermaid.c4.SystemDb")!.message).toBe(
      "A database system is drawn as a system.",
    );
  });

  it.each([
    [
      "flowchart",
      "flowchart LR\n  a(((H))) --> b\n  click a cb\n  style a font-size:2px\n  a ?? b",
    ],
    ["sequence", "sequenceDiagram\n  A-xB: hi\n  Note left of A,B: x\n  autonumber 1 2\n  else"],
    ["architecture", "architecture-beta\n  service s(logos:aws)[S]\n  junction j\n  s:R -- L:x"],
    ["block", 'block-beta\n  a[\\hex/]\n  b<["arrow"]>(left)\n  class zz c\n  end'],
    ["c4", 'C4Container\n  Container(c, "C")\n  BiRel(c, d)\n  Container_Ext(d, "D")\n  }'],
    ["description", "@startuml\ncomponent A <<x>>\nA -left-> B\nusecase U\n}\n@enduml"],
    ["plantuml sequence", "@startuml\nparticipant A #red\nA -> B\nnote across : x\nend\n@enduml"],
    ["c4-plantuml", '@startuml\n!include <C4/C4_Container>\nContainer(c, "C")\nRel(c, x)\n@enduml'],
    ["include", "@startuml\n!include missing.puml\nA -> B\n@enduml"],
    ["preprocessor", "@startuml\n!if 1 ~ 2\nA -> B\n!endif\n@enduml"],
    ["unsupported", "@startmindmap\n* a\n@endmindmap"],
    ["markdown", "# Doc\n\n```mermaid\nflowchart LR\n  a --> b\n  a ?? b\n```\n"],
  ])("keeps every fact of the %s findings and changes only their words", (_, source) => {
    const result = inBoth(source, { fileName: "sheet" });
    expect(result.en.findings.length).toBeGreaterThan(0);
    expect(result.es.status).toBe(result.en.status);
    expect(result.es.text).toBe(result.en.text);
    expect(result.es.coverage).toEqual(result.en.coverage);
    expect(result.es.findings.map(facts)).toEqual(result.en.findings.map(facts));
    result.es.findings.forEach((finding, i) => {
      const english = result.en.findings[i]!;
      expect(finding.message, english.message).not.toBe(english.message);
      finding.hints?.forEach((hint, j) => expect(hint).not.toBe(english.hints![j]));
    });
  });
});

describe("words written into the sheet", () => {
  const source = "flowchart LR\n  a --> b\n  a ?? b";

  it("follow the locale of the import, not the interface", () => {
    const spanish = importText(source, { fileName: "checkout.mmd", locale: "es" });
    expect(spanish.text).toContain(
      `// ${messages("es").content.header("checkout.mmd (mermaid)")}\n`,
    );
    expect(spanish.text).toContain(`// ${messages("es").content.notImported("a ?? b")}\n`);
    // Findings stay in the interface language.
    const english = importText(source, { fileName: "checkout.mmd" });
    expect(spanish.findings).toEqual(english.findings);
    expect(english.text).toContain(
      "// Imported from checkout.mmd (mermaid) by meltemi-diagrams.\n",
    );
    expect(english.text).toContain("// Not imported: a ?? b\n");

    setLocale("es");
    const interfaceOnly = importText(source, { fileName: "checkout.mmd" });
    expect(interfaceOnly.text).toBe(english.text);
    expect(interfaceOnly.findings[0]!.message).not.toBe(english.findings[0]!.message);
  });

  it("name the systems and containers the importer adds in the import's language", () => {
    const c4 = 'C4Component\n  Component(k, "K")';
    setLocale("es");
    const english = importText(c4);
    expect(english.text).toContain(`system system "${messages("en").content.system}" {`);
    expect(english.text).toContain(`container components "${messages("en").content.components}"`);
    setLocale("en");
    const spanish = importText(c4, { locale: "es" });
    expect(spanish.text).toContain('system system "Sistema" {');
    expect(spanish.text).toContain('container components "Componentes" {');
    expect(spanish.status).toBe(english.status);
  });
});

describe("coverage notes", () => {
  it.each([
    ["Mermaid", MERMAID_COVERAGE],
    ["PlantUML", PLANTUML_COVERAGE],
  ] as const)("give every %s note in English and in Spanish", (_, table) => {
    expect(table.some((entry) => entry.notes !== undefined)).toBe(true);
    for (const entry of table) {
      if (entry.notes === undefined) {
        expect(entry, entry.construct).not.toHaveProperty("notesEs");
        expect(coverageNotes(entry, "es")).toBeUndefined();
        continue;
      }
      expect(entry.notesEs, entry.construct).toBeTruthy();
      if (!PURE_CODE.test(entry.notes)) expect(entry.notesEs).not.toBe(entry.notes);
      expect(coverageNotes(entry, "es")).toBe(entry.notesEs);
      expect(coverageNotes(entry, "en")).toBe(entry.notes);
    }
  });

  it("are the notes C4 entity macros report as findings", () => {
    const entry = MERMAID_COVERAGE.find((e) => e.construct === "mermaid.c4.ContainerQueue_Ext")!;
    const source = 'C4Container\n  System_Boundary(s, "S") {\n    ContainerQueue_Ext(q, "Q")\n  }';
    const { en: english, es: spanish } = inBoth(source);
    const of = (result: ImportResult) =>
      result.findings.find((f) => f.construct === "mermaid.c4.ContainerQueue_Ext")!.message;
    expect(of(english)).toBe(entry.notes);
    expect(of(spanish)).toBe(entry.notesEs);
    const boundary = PLANTUML_COVERAGE.find((e) => e.construct === "plantuml.c4.Boundary")!;
    expect(boundary.notesEs).toBe(messages("es").coverage.boundaryType);
  });

  it("leave the generated coverage docs the same in any interface language", () => {
    const mermaid = coverageMarkdown("mermaid");
    const plantuml = coverageMarkdown("plantuml");
    setLocale("es");
    expect(coverageMarkdown("mermaid")).toBe(mermaid);
    expect(coverageMarkdown("plantuml")).toBe(plantuml);
  });
});
