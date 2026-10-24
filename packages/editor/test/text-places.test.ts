import { describe, expect, it } from "vitest";
import {
  analyzeDocument,
  CanvasSession,
  type CanvasRender,
  type HostMessage,
} from "../src/index.js";

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
