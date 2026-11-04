import { describe, expect, it } from "vitest";
import { diagramView } from "../src/analysis.js";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasRender,
  type HostMessage,
} from "../src/index.js";
import { textPlaces } from "../src/text-places.js";

const PLAIN = 'theme plain {\n  extends "technical.light"\n  frame none\n}\n\n';

function rendered(text: string): CanvasRender {
  const session = new CanvasSession();
  const messages = session.update(analyzeDocument({ text, revision: 1 }));
  const render = messages.find((m): m is HostMessage & { type: "render" } => m.type === "render");
  if (!render) throw new Error(JSON.stringify(messages.filter((m) => m.type !== "inspector")));
  return render;
}

const FREE = `${PLAIN}diagram s: free {
  theme "plain"
  box hex ""
  box two "Planner\\nagent"
  box left "Left"
  text note "Heading"
  group g "Backend" {
    box inner "Inner"
  }
  box agent ""
  hex -> two: "calls"
  two -> left
  style hex { shape hexagon }
  style two { shape hexagon }
  style left { textAlign left }
  style agent { shape agent }
  placement {
    place hex at (120, 100)
    place two at (420, 100)
    place left at (720, 100)
    size left (200, 60)
    place note at (120, 300)
    place g at (500, 360)
    size g (300, 160)
    place inner at (150, 90)
    place agent at (120, 520)
  }
}
`;

describe("where labels are drawn, for the inline editor", () => {
  const render = rendered(FREE);
  const element = (id: string) => render.elements.find((e) => e.id === id)!;
  const relation = (from: string, to: string) =>
    render.relations.find((r) => r.from === from && r.to === to)!;

  it("places an empty hexagon's text on its text centre, inside the hexagon, in the label font", () => {
    const hex = element("hex");
    const text = hex.text!;
    expect(text).toBeDefined();
    // One empty line at the box's middle, centred.
    expect(text.anchor.x).toBeCloseTo(hex.box.x + hex.box.width / 2, 1);
    expect(text.anchor.y).toBeCloseTo(hex.box.y + hex.box.height / 2, 1);
    expect(text).toMatchObject({ align: "center", size: 13, lines: true, line: 16 });
    expect(text.weight).toBeGreaterThanOrEqual(400);
    expect(text.color).toMatch(/^#/);
    expect(text.font).toMatch(/\S/);
    // The room is the hexagon's inscribed row inside the padding: narrower than the box.
    expect(text.area.x).toBeGreaterThan(hex.box.x);
    expect(text.area.x + text.area.width).toBeLessThan(hex.box.x + hex.box.width);
    expect(text.area.width).toBeGreaterThan(hex.box.width / 2);
  });

  it("centres a two-line label on the middle of its lines, 16 apart", () => {
    const two = element("two");
    const text = two.text!;
    expect(text.line).toBe(16);
    expect(text.anchor.y).toBeCloseTo(two.box.y + two.box.height / 2, 0);
    expect(text.lines).toBe(true);
  });

  it("aligns left-aligned text on its left end, and keeps a free text and a group title on their box", () => {
    const left = element("left");
    expect(left.text!.align).toBe("left");
    expect(left.text!.anchor.x).toBeLessThan(left.box.x + left.box.width / 4);
    const heading = element("note").text!;
    expect(heading.align).toBe("left");
    expect(heading.size).toBeGreaterThan(13);
    expect(heading.lines).toBe(true);
    const group = element("g").text!;
    expect(group).toMatchObject({ align: "left", lines: false });
    expect(group.anchor.y).toBeLessThan(element("g").box.y + 30);
  });

  it("types top and bottom aligned text in the band it is drawn in", () => {
    const aligned = rendered(`${PLAIN}diagram s: free {
  theme "plain"
  box up "Up"
  box down "Down"
  box oval "Oval"
  style up { verticalAlign top }
  style down { verticalAlign bottom }
  style oval { shape ellipse; verticalAlign bottom }
  placement {
    place up at (120, 100)
    size up (200, 120)
    place down at (420, 100)
    size down (200, 120)
    place oval at (720, 100)
    size oval (240, 120)
  }
}
`);
    for (const id of ["up", "down", "oval"]) {
      const shape = aligned.elements.find((e) => e.id === id)!;
      const text = shape.text!;
      const middle = shape.box.y + shape.box.height / 2;
      // The anchor is the drawn label; the area is the label's band, not the whole box.
      if (id === "up") expect(text.anchor.y).toBeCloseTo(shape.box.y + 16 + 6.5, 1);
      else expect(text.anchor.y).toBeGreaterThan(middle + 10);
      expect(text.area.height).toBeLessThan(shape.box.height / 2);
      expect(text.area.y).toBeLessThanOrEqual(text.anchor.y);
      expect(text.area.y + text.area.height).toBeGreaterThanOrEqual(text.anchor.y);
    }
  });

  it("puts an agent's text in its body, below the head", () => {
    const agent = element("agent");
    const text = agent.text!;
    expect(text.anchor.y).toBeGreaterThan(agent.box.y + agent.box.height / 2);
    // The body keeps the box's width, inside the padding.
    expect(text.area.width).toBeGreaterThan(agent.box.width * 0.7);
  });

  it("places a relation's label on its pill, and a new one at the middle of its line", () => {
    const calls = relation("hex", "two");
    expect(calls.text).toMatchObject({ align: "center", lines: false, weight: 500 });
    const pill = calls.labelBox!;
    expect(calls.text!.anchor.x).toBeCloseTo(pill.x + pill.width / 2, 0);
    expect(calls.text!.area).toEqual(pill);
    const bare = relation("two", "left");
    const line = bare.drawn;
    const a = line[0]!;
    const b = line[line.length - 1]!;
    expect(bare.text!.anchor.y).toBeCloseTo((a.y + b.y) / 2, 0);
    expect(bare.text!.area.width).toBe(0);
    expect(bare.text!.size).toBe(calls.text!.size);
  });

  it("places the texts of a sequence diagram's notes and dividers", () => {
    const sequence = rendered(`diagram p: sequence {
  participant a "A"
  participant b "B"
  a -> b: "hello"
  note over a, b "First\\nsecond"
  divider "Later"
}
`);
    const note = sequence.events.find((e) => e.kind === "note")!;
    expect(note.text).toMatchObject({ align: "left", lines: true });
    expect(note.text!.anchor.y).toBeCloseTo(note.box!.y + note.box!.height / 2, -1);
    const divider = sequence.events.find((e) => e.kind === "divider")!;
    expect(divider.text).toMatchObject({ align: "center", lines: false });
    const participant = sequence.elements.find((e) => e.id === "a")!;
    expect(participant.text!.lines).toBe(false);
  });

  it("edits a participant beside an actor on its drawn box", () => {
    const sequence = rendered(`diagram p: sequence {
  actor c "Customer"
  participant a "API"
  c -> a: "hello"
}
`);
    const participant = sequence.elements.find((e) => e.id === "a")!;
    const area = participant.text!.area;
    // The inline editor covers the drawn box, not the empty top of the head row.
    expect(area.y).toBeCloseTo(participant.box.y, 1);
    expect(area.height).toBeCloseTo(participant.box.height, 1);
    expect(participant.box.height).toBe(40);
    expect(participant.text!.anchor.y).toBeCloseTo(participant.box.y + 20, 0);
  });
});

describe("where a sequence message's label is drawn, for the inline editor", () => {
  // `bank` is pulled 80 closer to `api`: the label between them wraps. Nothing pulls `customer`
  // and `api`: theirs keeps its line and pushes them apart.
  const SHEET = `diagram p: sequence {
  theme "technical.light"
  actor c "Customer"
  participant a "API"
  participant b "Bank"
  a -> b: "Esto es una prueba de un texto Largo" as long
  c -> a: "Una etiqueta larga que nada acerca" as natural
  a -> a: "Validate\\nthe card" as self
  a -> b as bare
  placement {
    gap b -80
  }
}
`;
  const analysis = analyzeDocument({ text: SHEET, revision: 1 });
  const render = rendered(SHEET);
  const view = diagramView(analysis, "p")!;
  const layout = view.layout!;
  const relation = (key: string) => render.relations.find((r) => r.key === key)!;

  it("types a wrapped label in the room between its lifelines, growing down", () => {
    const wrapped = layout.messageTexts!.get("long")!;
    expect(wrapped.wraps).toBe(true);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    const text = relation("long").text!;
    // The room, from the top of the block of lines, and the anchor on the block's middle.
    expect(text.area).toEqual(wrapped.area);
    expect(text.anchor.x).toBeCloseTo(wrapped.area.x + wrapped.area.width / 2, 5);
    expect(text.anchor.y).toBeCloseTo(wrapped.area.y + wrapped.area.height / 2, 5);
    expect(text).toMatchObject({
      wrap: "grow",
      lines: true,
      align: "center",
      size: wrapped.size,
      line: wrapped.line,
      weight: 400,
    });
    // The room is wider than the block's widest line: the label wraps where it runs out of it.
    expect(text.area.width).toBeGreaterThan(layout.labels!.get("long")!.width - 8);
  });

  it("keeps a self-call's label beside its loop, without wrapping", () => {
    const text = relation("self").text!;
    expect(text.wrap).toBeUndefined();
    expect(text.lines).toBe(true);
    expect(text.area).toEqual(layout.messageTexts!.get("self")!.area);
    expect(text.area).toEqual(layout.labels!.get("self"));
  });

  it("types a label nothing pulls without wrapping, on its line", () => {
    // The editor wraps exactly where the layout does: only a label whose pair is pulled closer.
    for (const key of ["natural", "long", "bare"]) {
      const drawn = layout.messageTexts!.get(key)!;
      expect(relation(key).text!.wrap, key).toBe(drawn.wraps ? "grow" : undefined);
    }
    // A label the layout keeps on its line (`wraps` false) is typed without wrapping, in the
    // same place and font.
    const natural = layout.messageTexts!.get("natural")!;
    const kept = textPlaces(
      view.diagram,
      layout.scene!,
      layout.offset!,
      layout.theme!,
      layout.connectors!,
      layout.shapes,
      layout.stickies,
      new Map([["natural", { ...natural, wraps: false }]]),
    ).relations.get("natural")!;
    expect(kept.wrap).toBeUndefined();
    expect(kept).toMatchObject({ lines: true, area: natural.area, size: natural.size });
    expect({ ...kept, wrap: undefined }).toEqual({ ...relation("natural").text!, wrap: undefined });
  });

  it("places a new label where the drawing will put it", () => {
    const text = relation("bare").text!;
    const room = layout.messageTexts!.get("bare")!;
    expect(room.lines).toEqual([]);
    expect(text).toMatchObject({ area: room.area, size: room.size, lines: true });
    // Above its arrow.
    expect(text.anchor.y).toBeLessThan(relation("bare").points[0]!.y);
  });

  it("places the text of every tag pill on its pill", () => {
    const tagged = rendered(`diagram p: sequence {
  participant a "API" { tag "v2" }
  participant b "Bank"
  a -> b: "Ask" as ask {
    tag "PKCE"
    tag "idempotent"
  }
}
`);
    const ask = tagged.relations.find((r) => r.key === "ask")!;
    expect(ask.tags!.map((t) => t.text)).toEqual(["PKCE", "idempotent"]);
    for (const tag of [...ask.tags!, ...tagged.elements.find((e) => e.id === "a")!.tags!]) {
      expect(tag.place).toMatchObject({ align: "center", lines: false, weight: 500 });
      expect(tag.place!.area).toEqual(tag.box);
      expect(tag.place!.anchor.x).toBeCloseTo(tag.box.x + tag.box.width / 2, 0);
      expect(tag.place!.anchor.y).toBeCloseTo(tag.box.y + tag.box.height / 2, 0);
      expect(tag.place!.background).toMatch(/^#/);
    }
    // The two pills of `ask` in a row, the first nearer its source end.
    const [first, second] = ask.tags!;
    expect(first!.box.x).toBeLessThan(second!.box.x);
    expect(tagged.elements.find((e) => e.id === "b")!.tags).toBeUndefined();
  });
});

describe("where a sticky's text is drawn, for the inline editor", () => {
  const WORDS = "Cache the catalogue before the sale starts and warm it again";
  const sheet = (text: string, style = "") => `${PLAIN}diagram s: free {
  theme "plain"
  sticky card "${text}"
${style}  placement {
    place card at (200, 200)
  }
}
`;
  /** The canvas's place of the card's text, and how the layout wrapped it. */
  const placed = (text: string) => {
    const card = rendered(text).elements.find((e) => e.id === "card")!;
    const layout = diagramView(analyzeDocument({ text, revision: 1 }), "s")!.layout!;
    return { card, wrapped: layout.stickies!.get("card")! };
  };

  it("types in the room the text wraps in, at the size and line height it is drawn", () => {
    const { card, wrapped } = placed(sheet("Cache the catalogue"));
    const text = card.text!;
    // The card inside the padding, in diagram coordinates, as the layout wrapped it.
    expect(text.area).toEqual(wrapped.area);
    expect(text.area).toEqual({
      x: card.box.x + 16,
      y: card.box.y + 16,
      width: card.box.width - 32,
      height: card.box.height - 32,
    });
    // 1.2 times the label size, lines 1.25 times that apart, centred in the middle.
    expect(text).toMatchObject({
      size: 15.6,
      fullSize: 15.6,
      line: 19.5,
      weight: 400,
      align: "center",
      lines: true,
      color: "#1f2328",
      // Its text shrinks to the card.
      wrap: "shrink",
    });
    expect(text.anchor.x).toBeCloseTo(card.box.x + card.box.width / 2, 5);
    expect(text.anchor.y).toBeCloseTo(card.box.y + card.box.height / 2, 5);
  });

  it("takes the size a long text shrank to", () => {
    const long = Array.from({ length: 4 }, () => WORDS).join(" ");
    const { card, wrapped } = placed(sheet(long, "  style card { fontSize 14 }\n"));
    expect(wrapped).toMatchObject({ size: 10, fits: true });
    expect(card.text).toMatchObject({ size: 10, line: 12.5, area: wrapped.area });
    // The size it shrank from, which the editor starts from: the style's.
    expect(card.text!.fullSize).toBe(14);
    // Its block of lines is centred on the card.
    expect(card.text!.anchor.y).toBeCloseTo(card.box.y + card.box.height / 2, 5);
  });

  it("knows the theme's size a long text shrank from, when no style sets one", () => {
    const long = Array.from({ length: 4 }, () => WORDS).join(" ");
    const { card, wrapped } = placed(sheet(long));
    expect(wrapped.size).toBeLessThan(15.6);
    expect(card.text).toMatchObject({ size: wrapped.size, fullSize: 15.6 });
  });

  it("aligns on the left end of the lines and on the middle of a block at the top", () => {
    const { card, wrapped } = placed(
      sheet(WORDS, "  style card { textAlign left; verticalAlign top }\n"),
    );
    const text = card.text!;
    expect(text.align).toBe("left");
    expect(text.anchor.x).toBe(wrapped.area.x);
    expect(text.anchor.y).toBeCloseTo(
      wrapped.area.y + (wrapped.lines.length * wrapped.line) / 2,
      5,
    );
  });
});
