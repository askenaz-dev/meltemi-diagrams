import { describe, expect, it } from "vitest";
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
