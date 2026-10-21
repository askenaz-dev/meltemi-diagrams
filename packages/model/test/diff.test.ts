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
