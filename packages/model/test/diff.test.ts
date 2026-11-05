import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../../../test-support/corpus.js";
import {
  compile,
  describeChange,
  describeFact,
  diffDocuments,
  type ModelChange,
} from "../src/index.js";

const BASE = `language "0.2"

diagram checkout: flow {
  title "Checkout"
  layout manual
  client["Client"]
  api["API Gateway"] { technology "Kotlin" }
  db[("Orders")]
  client -> api: "HTTPS"
  api -> db as save
  placement {
    place client at (80, 80)
    place api at (320, 80)
    place db at (560, 80)
  }
}

model shop {
  system store "Store" {
    container web "Web" { technology "React" }
    container api "API" { technology "Kotlin" }
  }
  store.web -> store.api: "Calls" as calls
}

story tour for checkout {
  title "Tour"
  scene first {
    reveal client, api
    hold 1s
  }
}
`;

const diff = (after: string): ModelChange[] =>
  diffDocuments(compile(BASE).document, compile(after).document);
const lines = (after: string) => diff(after).map((c) => describeChange(c));

describe("pens in the semantic diff", () => {
  const sheet = (points: string, id = "stroke") =>
    `diagram board: free {\n  pen ${id} [${points}]\n  box a "A"\n  placement { place a at (200, 100) }\n}\n`;
  const changes = (before: string, after: string) =>
    diffDocuments(compile(before).document, compile(after).document).map((c) => describeChange(c));

  it("compares a stroke's points as a place: moved when they change", () => {
    expect(changes(sheet("(0, 0), (10, 10)"), sheet("(0, 0), (10, 10)"))).toEqual([]);
    expect(changes(sheet("(0, 0), (10, 10)"), sheet("(5, 0), (15, 10.5)"))).toEqual([
      '~ element stroke "": moved',
    ]);
  });

  it("tells a renamed stroke by its points", () => {
    expect(changes(sheet("(0, 0), (10, 10)"), sheet("(0, 0), (10, 10)", "arrow"))).toEqual([
      '> element stroke → arrow ""',
    ]);
  });
});

describe("lists in the semantic diff", () => {
  const sheet = (block: string) =>
    `diagram board: free {\n  group todo "To do" {\n${block}\n    sticky a "A"\n  }\n}\n`;
  const changes = (before: string, after: string) =>
    diffDocuments(compile(before).document, compile(after).document).map((c) => describeChange(c));

  it("tells a group made a list, and a list arranged otherwise", () => {
    expect(changes(sheet(""), sheet("    layout column"))).toEqual([
      '~ element todo "To do": layout none → column',
    ]);
    expect(
      changes(sheet("    layout column"), sheet("    layout row\n    spacing 8\n    align end")),
    ).toEqual(['~ element todo "To do": layout column → row; spacing none → 8; align none → end']);
  });
});

describe("tags in the semantic diff", () => {
  const sheet = (block: string) =>
    `diagram pay: sequence {\n  participant api\n  participant bank\n  api -> bank: "Authorize" as authorize${block}\n}\n`;
  const changes = (before: string, after: string) =>
    diffDocuments(compile(before).document, compile(after).document).map((c) => describeChange(c));

  it("reports that the tags of a message changed when one is added, and nothing else", () => {
    const after = diffDocuments(
      compile(sheet("")).document,
      compile(sheet(' { tag "PKCE" }')).document,
    );
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: "changed", subject: "relation", id: "authorize" });
    expect(after[0]!.facts).toEqual([{ fact: "changed", part: "tags" }]);
    expect(after[0]!.details).toEqual(["tags changed"]);
    expect(changes(sheet(""), sheet(' { tag "PKCE" }'))).toEqual([
      "~ relation authorize (api → bank: Authorize): tags changed",
    ]);
    // Reordered tags are other tags; a participant's are compared as a message's.
    expect(changes(sheet(' { tag "A"; tag "B" }'), sheet(' { tag "B"; tag "A" }'))).toEqual([
      "~ relation authorize (api → bank: Authorize): tags changed",
    ]);
    expect(
      changes(
        sheet(""),
        sheet("").replace("participant bank", 'participant bank { tag "external" }'),
      ),
    ).toEqual(["~ element bank: tags changed"]);
  });

  it("lists nothing when only a comment beside a tag changes, or its statement is reformatted", () => {
    const before = sheet(' { tag "PKCE" // first\n  }');
    expect(changes(before, sheet(' { tag "PKCE" // second\n  }'))).toEqual([]);
    expect(changes(before, sheet(' {\n    tag "PKCE"\n  }'))).toEqual([]);
  });
});

describe("semantic diff", () => {
  it("finds nothing between equal versions, whatever the comments and layout of the text", () => {
    expect(diff(BASE)).toEqual([]);
    expect(diff(`// A comment\n${BASE.replace('title "Checkout"', 'title   "Checkout"')}`)).toEqual(
      [],
    );
  });

  it("tells a new label from a removal and an addition", () => {
    expect(lines(BASE.replace('api["API Gateway"]', 'api["Gateway"]'))).toEqual([
      '~ element api "Gateway": label "API Gateway" → "Gateway"',
    ]);
  });

  it("tells a renamed id from a removal and an addition, and keeps its relations", () => {
    const renamed = BASE.replace('api["API Gateway"]', 'gateway["API Gateway"]')
      .replace("client -> api", "client -> gateway")
      .replace("api -> db", "gateway -> db")
      .replace("place api at", "place gateway at")
      .replace("reveal client, api", "reveal client, gateway");
    expect(lines(renamed)).toEqual(['> element api → gateway "API Gateway"']);
  });

  it("reports removals, additions, moves and relation changes", () => {
    const after = BASE.replace('  db[("Orders")]\n', '  cache[("Cache")]\n')
      .replace("api -> db as save", 'api -> cache: "Reads" as save')
      .replace("place db at (560, 80)", "place cache at (560, 200)")
      .replace("place client at (80, 80)", "place client at (80, 120)")
      .replace('client -> api: "HTTPS"', 'client -> api: "HTTP/2"');
    const changes = lines(after);
    expect(changes).toContain('~ element client "Client": moved');
    expect(changes).toContain('+ element cache "Cache": data');
    expect(changes).toContain('- element db "Orders": data');
    expect(changes).toContain('~ relation save (API Gateway → Cache: Reads): label none → "Reads"');
    expect(changes).toContain(
      '~ relation client->api#1 (Client → API Gateway: HTTP/2): label "HTTPS" → "HTTP/2"',
    );
  });

  it("follows renamed diagrams, entities and scenes", () => {
    const after = BASE.replace("diagram checkout: flow", "diagram purchase: flow")
      .replace("story tour for checkout", "story tour for purchase")
      .replace('system store "Store"', 'system shop "Store"')
      .replace("store.web -> store.api", "shop.web -> shop.api")
      .replace("scene first", "scene opening");
    const changes = diff(after);
    expect(
      changes.filter((c) => c.kind === "renamed").map((c) => `${c.subject} ${c.from} → ${c.id}`),
    ).toEqual([
      "diagram checkout → purchase",
      "entity store → shop",
      "entity store.web → shop.web",
      "entity store.api → shop.api",
      "scene first → opening",
    ]);
    expect(changes.filter((c) => c.kind !== "renamed").map((c) => describeChange(c))).toEqual([]);
  });

  it("describes story, entity, theme and profile changes", () => {
    const after = `${BASE.replace("hold 1s", "hold 2s").replace(
      'container api "API" { technology "Kotlin" }',
      'container api "API" { technology "Java" }',
    )}
theme brand { extends "technical.light"; accent "#ff0000" }
export slide for checkout { format png }
`;
    expect(lines(after)).toEqual([
      '~ entity store.api "API": technology "Kotlin" → "Java"',
      '~ story tour "Tour": duration 1600 ms → 2600 ms',
      "~ scene tour.first: actions changed; duration 1600 ms → 2600 ms".replace(
        "tour.first",
        "first",
      ),
      "+ theme brand",
      "+ export slide",
    ]);
  });

  it("describes the same changes in Spanish, keeping English details for machines", () => {
    const after = BASE.replace('  db[("Orders")]\n', '  cache[("Cache")]\n')
      .replace("api -> db as save", 'api -> cache: "Reads" as save')
      .replace("place db at (560, 80)", "place cache at (560, 200)")
      .replace("place client at (80, 80)", "place client at (80, 120)");
    const changes = diff(after);
    const spanish = changes.map((c) => describeChange(c, "es"));
    expect(spanish).toContain('~ elemento client "Client": movido');
    expect(spanish).toContain('+ elemento cache "Cache": data');
    expect(spanish).toContain(
      '~ relación save (API Gateway → Cache: Reads): label ninguno → "Reads"',
    );
    const moved = changes.find((c) => c.id === "client")!;
    expect(moved.facts).toEqual([{ fact: "state", state: "moved" }]);
    expect(moved.details).toEqual(["moved"]);
    expect(describeFact({ fact: "parent", to: null }, "es")).toBe("movido a la raíz del modelo");
    expect(describeFact({ fact: "duration", before: 800, after: 1200 }, "en")).toBe(
      "duration 800 ms → 1200 ms",
    );
  });
});

describe("gantt schedules in the semantic diff", () => {
  const ROADMAP = readFileSync(join(REPO_ROOT, "corpus/valid/gantt/roadmap.meltemi"), "utf8");
  const compared = (before: string, after: string): ModelChange[] =>
    diffDocuments(compile(before).document, compile(after).document);
  const described = (before: string, after: string, locale?: "en" | "es") =>
    compared(before, after).map((c) => describeChange(c, locale));
  /** The owner's chart with one replacement; the replaced text must be there. */
  const edited = (from: string, to: string): string => {
    expect(ROADMAP).toContain(from);
    return ROADMAP.replace(from, to);
  };
  const chart = (body: string): string => `language "0.2"\ndiagram plan: gantt {\n${body}\n}\n`;

  it("finds nothing between equal versions, whatever the comments and layout of the text", () => {
    expect(compared(ROADMAP, ROADMAP)).toEqual([]);
    expect(compared(ROADMAP, `// A note\n${ROADMAP.replace("task tec0 ", "task  tec0 ")}`)).toEqual(
      [],
    );
  });

  it("reports a longer predecessor, and the tasks that follow it moved by it", () => {
    const changes = compared(ROADMAP, edited("from 2026-06-01 for 5d", "from 2026-06-01 for 7d"));
    expect(changes.map((c) => [c.kind, c.subject, c.id])).toEqual([
      ["changed", "element", "tec0"],
      ["changed", "element", "tec1"],
      ["changed", "element", "tec2"],
    ]);
    expect(changes[0]!.facts).toEqual([
      { fact: "value", field: "end", before: "for 5d", after: "for 7d" },
      { fact: "schedule", part: "end", before: "2026-06-05", after: "2026-06-09", by: [] },
    ]);
    expect(changes[1]!.facts).toEqual([
      {
        fact: "schedule",
        part: "start",
        before: "2026-06-08",
        after: "2026-06-10",
        by: [{ kind: "task", id: "tec0" }],
      },
      {
        fact: "schedule",
        part: "end",
        before: "2026-06-19",
        after: "2026-06-23",
        by: [{ kind: "task", id: "tec0" }],
      },
    ]);
    // tec2 follows tec1, whose own clauses did not change: tec0 is what moved it.
    expect(changes[2]!.facts.map((f) => f.fact === "schedule" && f.by)).toEqual([
      [{ kind: "task", id: "tec0" }],
      [{ kind: "task", id: "tec0" }],
    ]);
    expect(described(ROADMAP, edited("from 2026-06-01 for 5d", "from 2026-06-01 for 7d"))).toEqual([
      '~ element tec0 "Evaluar plataformas de agentes": end for 5d → for 7d; ends 2026-06-05 → 2026-06-09',
      '~ element tec1 "Prueba de concepto con el equipo de Arquitectura": starts 2026-06-08 → 2026-06-10 (moved by tec0); ends 2026-06-19 → 2026-06-23 (moved by tec0)',
      '~ element tec2 "Presentar resultados al comité Arq": starts 2026-06-22 → 2026-06-24 (moved by tec0); ends 2026-06-22 → 2026-06-24 (moved by tec0)',
    ]);
    // Nothing else of the chart moved: the other sections wait for no one.
    expect(changes.map((c) => c.details.length)).toEqual([2, 2, 2]);
  });

  it("reports a holiday as the chart's calendar, and the tasks it moved as moved by it", () => {
    const after = edited("exclude weekends\n", "exclude weekends, 2026-06-29\n");
    const changes = compared(ROADMAP, after);
    expect(changes.map((c) => [c.subject, c.id])).toEqual([
      ["diagram", "hoja_de_ruta_genai"],
      ["element", "flu1"],
      ["element", "flu2"],
      ["element", "flu3"],
    ]);
    expect(changes[0]!.facts).toEqual([
      { fact: "value", field: "exclude", before: "weekends", after: "weekends, 2026-06-29" },
    ]);
    // flu1 starts where it did and ends a working day later; the others start and end later.
    expect(changes[1]!.facts).toEqual([
      {
        fact: "schedule",
        part: "end",
        before: "2026-07-01",
        after: "2026-07-02",
        by: [{ kind: "calendar" }],
      },
    ]);
    for (const change of changes.slice(2)) {
      expect(change.facts.map((f) => f.fact === "schedule" && [f.part, f.by])).toEqual([
        ["start", [{ kind: "calendar" }]],
        ["end", [{ kind: "calendar" }]],
      ]);
    }
    expect(changes.map((c) => describeChange(c))).toEqual([
      '~ diagram hoja_de_ruta_genai "Hoja de ruta GenAI": exclude weekends → weekends, 2026-06-29',
      '~ element flu1 "Interfaz Evaluación y seguimiento (WebComponent)": ends 2026-07-01 → 2026-07-02 (moved by the calendar)',
      '~ element flu2 "Integración con LeanIX": starts 2026-07-02 → 2026-07-03 (moved by the calendar); ends 2026-07-15 → 2026-07-16 (moved by the calendar)',
      '~ element flu3 "Marcha Blanca primeros casos de uso": starts 2026-07-16 → 2026-07-17 (moved by the calendar); ends 2026-07-29 → 2026-07-30 (moved by the calendar)',
    ]);
  });

  it("reports the written changes, and no resolved date, when a version has a loop", () => {
    const after = edited(
      'task tec0 "Evaluar plataformas de agentes" from 2026-06-01 for 5d',
      'task tec0 "Evaluar plataformas de agentes" after tec2 for 5d',
    );
    expect(compile(after).diagnostics.some((d) => d.code === "gantt.cycle")).toBe(true);
    const changes = compared(ROADMAP, after);
    // The arrow that closes the loop is the `after` clause, which the task's facts already say.
    expect(changes.map((c) => [c.subject, c.id])).toEqual([["element", "tec0"]]);
    expect(changes[0]!.facts).toEqual([
      { fact: "value", field: "from", before: "2026-06-01", after: null },
      { fact: "value", field: "after", before: null, after: "tec2" },
    ]);
    expect(changes[0]!.details).toEqual(["from 2026-06-01 → none", "after none → tec2"]);
    // And the other way round, from the version with the loop.
    const back = compared(after, ROADMAP);
    expect(back.flatMap((c) => c.facts).some((f) => f.fact === "schedule")).toBe(false);
  });

  it("reports the clauses of a task one by one: start, dependencies, end, status, critical", () => {
    const before = chart(
      [
        "  task a from 2026-06-01 for 2d",
        "  task b from 2026-06-01 for 2d",
        "  task c after a for 3d",
      ].join("\n"),
    );
    const after = chart(
      [
        "  task a from 2026-06-08 for 2d done critical",
        "  task b from 2026-06-01 to 2026-06-05 active",
        "  task c after a, b until d for 3d",
        "  task d from 2026-06-20 for 1d",
      ].join("\n"),
    );
    // `until` and `for` together are an error: compare with one end clause.
    expect(compile(after).diagnostics.map((d) => d.code)).toEqual(["prop.duplicate"]);
    const fixed = after.replace("until d for 3d", "for 3d");
    expect(described(before, fixed)).toEqual([
      "~ element a: from 2026-06-01 → 2026-06-08; status none → done; now critical; starts 2026-06-01 → 2026-06-08; ends 2026-06-02 → 2026-06-09",
      "~ element b: end for 2d → to 2026-06-05; status none → active; ends 2026-06-02 → 2026-06-05",
      // b ends sooner than a does, so only a sets where c starts: a moved it.
      "~ element c: after a → a, b; starts 2026-06-03 → 2026-06-10 (moved by a); ends 2026-06-05 → 2026-06-12 (moved by a)",
      "+ element d: task",
    ]);
  });

  it("reports an `until` and the date of a milestone, which moves with what it follows", () => {
    const before = chart(
      [
        "  task a from 2026-06-01 for 2d",
        "  task b from 2026-06-01 until m",
        "  milestone m after a",
        "  marker x after m",
      ].join("\n"),
    );
    const after = before.replace("task a from 2026-06-01 for 2d", "task a from 2026-06-01 for 4d");
    expect(compile(before).diagnostics).toEqual([]);
    expect(described(before, after)).toEqual([
      "~ element a: end for 2d → for 4d; ends 2026-06-02 → 2026-06-04",
      "~ element b: ends 2026-06-02 → 2026-06-04 (moved by a)",
      "~ element m: date 2026-06-03 → 2026-06-05 (moved by a)",
      "~ element x: date 2026-06-03 → 2026-06-05 (moved by a)",
    ]);
    const details = (text: string, id: string) =>
      compared(before, text).find((c) => c.subject === "element" && c.id === id)!.details;
    expect(
      details(before.replace("milestone m after a", "milestone m at 2026-06-10"), "m"),
    ).toEqual(["at none → 2026-06-10", "after a → none", "date 2026-06-03 → 2026-06-10"]);
    expect(
      details(
        before.replace("task b from 2026-06-01 until m", "task b from 2026-06-01 for 1d"),
        "b",
      ),
    ).toEqual(["end until m → for 1d", "ends 2026-06-02 → 2026-06-01"]);
  });

  it("names every task that moved another, and the times it moved it to", () => {
    const before = chart(
      [
        "  task a from 2026-06-01T09:00 for 2h",
        "  task b from 2026-06-01T09:00 for 3h",
        "  task c after a, b for 1h",
      ].join("\n"),
    );
    const after = before
      .replace("for 2h", "for 4h")
      .replace("task b from 2026-06-01T09:00 for 3h", "task b from 2026-06-01T09:00 for 5h");
    expect(described(before, after)).toEqual([
      "~ element a: end for 2h → for 4h; ends 2026-06-01T11:00 → 2026-06-01T13:00",
      "~ element b: end for 3h → for 5h; ends 2026-06-01T12:00 → 2026-06-01T14:00",
      "~ element c: starts 2026-06-01T12:00 → 2026-06-01T14:00 (moved by b); ends 2026-06-01T13:00 → 2026-06-01T15:00 (moved by b)",
    ]);
    // When both predecessors end later, both moved the task that waits for the later one.
    const both = before
      .replace("for 2h", "for 6h")
      .replace("task b from 2026-06-01T09:00 for 3h", "task b from 2026-06-01T09:00 for 5h");
    const [, , c] = compared(before, both);
    expect(c!.facts[0]).toMatchObject({
      by: [
        { kind: "task", id: "a" },
        { kind: "task", id: "b" },
      ],
    });
    expect(describeChange(c!)).toContain("(moved by a and b)");
  });

  it("reports the order of the tasks as what moved a task that follows the previous one", () => {
    const before = chart(
      [
        "  task a from 2026-06-01 for 2d",
        "  task b from 2026-06-10 for 1d",
        "  task c for 3d",
      ].join("\n"),
    );
    // c follows the previous task: b, then a, once they swap places.
    const after = chart(
      [
        "  task b from 2026-06-10 for 1d",
        "  task a from 2026-06-01 for 2d",
        "  task c for 3d",
      ].join("\n"),
    );
    const changes = compared(before, after);
    const c = changes.find((x) => x.id === "c")!;
    expect(c.facts).toEqual([
      {
        fact: "schedule",
        part: "start",
        before: "2026-06-11",
        after: "2026-06-03",
        by: [{ kind: "order" }],
      },
      {
        fact: "schedule",
        part: "end",
        before: "2026-06-13",
        after: "2026-06-05",
        by: [{ kind: "order" }],
      },
    ]);
    expect(describeChange(c)).toBe(
      "~ element c: starts 2026-06-11 → 2026-06-03 (moved by the order of the tasks); ends 2026-06-13 → 2026-06-05 (moved by the order of the tasks)",
    );
  });

  it("keeps the dependencies of a renamed task: only the rename is reported", () => {
    const after = ROADMAP.replaceAll("tec0", "eval0");
    const changes = compared(ROADMAP, after);
    expect(changes.map((c) => [c.kind, c.subject, c.from, c.id])).toEqual([
      ["renamed", "element", "tec0", "eval0"],
    ]);
    expect(changes[0]!.details).toEqual([]);
  });

  it("reports the settings of the chart as the properties of the diagram", () => {
    const before = chart("  task a from 2026-06-01 for 2d");
    const after = chart(
      [
        '  axisFormat "%a %d"',
        "  weekStart sunday",
        "  ticks 1d",
        "  axis both",
        "  labels column",
        "  display compact",
        "  dependencies hidden",
        "  dayWidth 40",
        "  exclude friday, weekends, 2026-12-24",
        "  include 2026-12-24",
        "  today",
        "  task a from 2026-06-01 for 2d",
      ].join("\n"),
    );
    expect(compile(after).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const [change, ...rest] = compared(before, after);
    expect(rest).toEqual([]);
    expect(change!.details).toEqual([
      "exclude none → friday, weekends, 2026-12-24",
      "include none → 2026-12-24",
      "weekStart monday → sunday",
      'axisFormat none → "%a %d"',
      "ticks none → 1d",
      "axis bottom → both",
      "labels bar → column",
      "display normal → compact",
      "dependencies shown → hidden",
      "dayWidth none → 40",
      "today none → today",
    ]);
    const dated = after.replace("  today\n", "  today 2026-07-01\n");
    expect(compared(after, dated)[0]!.details).toEqual(["today today → 2026-07-01"]);
  });

  it("describes the same changes in Spanish, keeping English details for machines", () => {
    const after = edited("from 2026-06-01 for 5d", "from 2026-06-01 for 7d");
    const changes = compared(ROADMAP, after);
    expect(changes.map((c) => describeChange(c, "es"))).toEqual([
      '~ elemento tec0 "Evaluar plataformas de agentes": fin for 5d → for 7d; termina 2026-06-05 → 2026-06-09',
      '~ elemento tec1 "Prueba de concepto con el equipo de Arquitectura": empieza 2026-06-08 → 2026-06-10 (a causa de tec0); termina 2026-06-19 → 2026-06-23 (a causa de tec0)',
      '~ elemento tec2 "Presentar resultados al comité Arq": empieza 2026-06-22 → 2026-06-24 (a causa de tec0); termina 2026-06-22 → 2026-06-24 (a causa de tec0)',
    ]);
    expect(changes[1]!.details[0]).toBe("starts 2026-06-08 → 2026-06-10 (moved by tec0)");
    const holiday = compared(
      ROADMAP,
      edited("exclude weekends\n", "exclude weekends, 2026-06-29\n"),
    );
    expect(holiday.map((c) => describeChange(c, "es"))[1]).toBe(
      '~ elemento flu1 "Interfaz Evaluación y seguimiento (WebComponent)": termina 2026-07-01 → 2026-07-02 (a causa del calendario)',
    );
    expect(
      describeFact(
        {
          fact: "schedule",
          part: "date",
          before: "2026-07-14",
          after: "2026-07-16",
          by: [{ kind: "task", id: "tec0" }, { kind: "task", id: "tec1" }, { kind: "calendar" }],
        },
        "es",
      ),
    ).toBe("fecha 2026-07-14 → 2026-07-16 (a causa de tec0, de tec1 y del calendario)");
    expect(describeFact({ fact: "state", state: "critical" }, "es")).toBe("ahora es crítico");
    expect(describeFact({ fact: "state", state: "notCritical" }, "en")).toBe("no longer critical");
  });

  it("compares added and removed tasks without dates, and the tasks that follow them by their clauses", () => {
    const after = edited(
      '    task tec2 "Presentar resultados al comité Arq" after tec1 for 1d\n',
      '    task tec2 "Presentar resultados al comité Arq" after tec1 for 1d\n    task tec3 "Cierre" after tec2 for 2d\n',
    );
    // The arrow is the new task's `after` clause: it is not reported on its own.
    expect(described(ROADMAP, after)).toEqual(['+ element tec3 "Cierre": task']);
    expect(described(after, ROADMAP)).toEqual(['- element tec3 "Cierre": task']);
  });
});
