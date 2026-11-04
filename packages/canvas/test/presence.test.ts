import { describe, expect, it } from "vitest";
import {
  FALLBACK_COLOUR,
  LINE_WIDTH,
  MAX_LASER_MS,
  MAX_LASER_POINTS,
  MAX_MARKS,
  MAX_NAME,
  MAX_PEOPLE,
  MAX_SELECTED,
  RANK_STEP,
  TAG_GAP,
  TAG_HEIGHT,
  boundsOf,
  contrastRatio,
  lineWidth,
  luminance,
  outlineBox,
  parseColour,
  personKeys,
  presenceMarks,
  readLaser,
  readMe,
  readPeople,
  tagPlacement,
  tagTextColour,
  toHex,
  type PersonView,
  type PresenceShape,
} from "../src/presence.js";

/** The twelve colours of `PRESENCE_COLOURS` in `@meltemi/diagrams-project`, the ones hosts send. */
const PALETTE = [
  "#e03131",
  "#f08c00",
  "#2f9e44",
  "#1c7ed6",
  "#7048e8",
  "#c2255c",
  "#0c8599",
  "#d9480f",
  "#5f3dc4",
  "#099268",
  "#364fc7",
  "#a61e4d",
];

const person = (name: string, selection: string[], colour = "#1c7ed6"): PersonView => {
  const [person] = readPeople([{ name, colour, selection }]);
  return person!;
};

const box = (x: number, y: number, width = 100, height = 40): PresenceShape => ({
  kind: "box",
  box: { x, y, width, height },
});

describe("reading a colour", () => {
  it("reads hex in its four lengths", () => {
    expect(parseColour("#1c7ed6")).toEqual({ r: 28, g: 126, b: 214 });
    expect(parseColour("#FFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColour("#f008")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColour("#11223344")).toEqual({ r: 17, g: 34, b: 51 });
    expect(parseColour("  #000  ")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("reads rgb() and hsl() in the comma and the space forms, alpha ignored", () => {
    expect(parseColour("rgb(224, 49, 49)")).toEqual({ r: 224, g: 49, b: 49 });
    expect(parseColour("rgba(224 49 49 / 50%)")).toEqual({ r: 224, g: 49, b: 49 });
    expect(parseColour("rgb(100%, 0%, 50%)")).toEqual({ r: 255, g: 0, b: 128 });
    expect(parseColour("rgb(300, -5, 0)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColour("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColour("hsl(120deg 100% 25%)")).toEqual({ r: 0, g: 128, b: 0 });
    expect(parseColour("hsla(240, 100%, 50%, 0.4)")).toEqual({ r: 0, g: 0, b: 255 });
    expect(parseColour("hsl(-120, 100%, 50%)")).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("refuses everything else: names, variables, urls, short or odd hex, injected text", () => {
    for (const text of [
      "red",
      "var(--x)",
      "url(https://example.com/x.png)",
      "#12",
      "#12345",
      "#ggg",
      "rgb(1, 2)",
      "rgb(a, b, c)",
      "rgb(1, 2, 3, 4, 5)",
      "red; background: url(x)",
      "#fff; color: red",
      "rgb(0 0 0); x",
      "",
    ]) {
      expect(parseColour(text), text).toBeUndefined();
    }
  });

  it("writes colours as #rrggbb", () => {
    expect(toHex({ r: 28, g: 126, b: 214 })).toBe("#1c7ed6");
    expect(toHex({ r: 0, g: 5, b: 255 })).toBe("#0005ff");
  });
});

describe("the colour of a tag's text", () => {
  it("is black on light colours and white on dark ones", () => {
    expect(tagTextColour(parseColour("#ffffff")!)).toBe("#000000");
    expect(tagTextColour(parseColour("#ffd43b")!)).toBe("#000000");
    expect(tagTextColour(parseColour("#000000")!)).toBe("#ffffff");
    expect(tagTextColour(parseColour("#364fc7")!)).toBe("#ffffff");
    expect(tagTextColour(parseColour("#5f3dc4")!)).toBe("#ffffff");
  });

  it("picks the better of the two for the colours near the crossover", () => {
    // #e03131 has a luminance just above the crossover (0.179): black reads a little better.
    const red = parseColour("#e03131")!;
    expect(luminance(red)).toBeGreaterThan(0.179);
    expect(tagTextColour(red)).toBe("#000000");
    // A grey on the other side takes white.
    const grey = parseColour("#707070")!;
    expect(luminance(grey)).toBeLessThan(0.179);
    expect(tagTextColour(grey)).toBe("#ffffff");
  });

  it("reads at 4.5:1 or better on every colour of the palette and of the whole colour cube", () => {
    const ratio = (colour: string) => {
      const rgb = parseColour(colour)!;
      const text = tagTextColour(rgb);
      return contrastRatio(luminance(rgb), text === "#ffffff" ? 1 : 0);
    };
    for (const colour of [...PALETTE, FALLBACK_COLOUR]) {
      expect(ratio(colour), colour).toBeGreaterThanOrEqual(4.5);
    }
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          expect(ratio(toHex({ r, g, b })), `${r},${g},${b}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe("reading the people of a message", () => {
  it("keeps a person's name verbatim, markup included, and writes the colour out", () => {
    const [ben] = readPeople([
      { name: "<img src=x onerror=alert(1)>", colour: "rgb(28 126 214)", selection: ["api"] },
    ]);
    expect(ben).toEqual({
      name: "<img src=x onerror=alert(1)>",
      colour: "#1c7ed6",
      text: "#000000",
      selection: ["api"],
    });
  });

  it("takes anything that is not a list for nobody", () => {
    for (const value of [undefined, null, 3, "ben", {}, { length: 1 }]) {
      expect(readPeople(value), String(value)).toEqual([]);
    }
  });

  it("leaves out entries without a name or a selection list, and ids that are not text", () => {
    const people = readPeople([
      null,
      "Ben",
      { colour: "#fff", selection: [] },
      { name: 3, colour: "#fff", selection: [] },
      { name: "Ana", colour: "#fff" },
      { name: "Eve", colour: "#fff", selection: "api" },
      { name: "Li", colour: "#fff", selection: ["a", 3, null, { id: "b" }, "c"] },
    ]);
    expect(people.map((p) => p.name)).toEqual(["Li"]);
    expect(people[0]!.selection).toEqual(["a", "c"]);
  });

  it("gives a colour it cannot read the neutral one, and never passes the text on", () => {
    for (const colour of ["red", "var(--x)", "#fff; x: y", 7, undefined]) {
      const [p] = readPeople([{ name: "Ana", colour, selection: [] }]);
      expect(p!.colour, String(colour)).toBe(FALLBACK_COLOUR);
    }
  });

  it("cuts what is too long: people, ids per person and a name", () => {
    const many = Array.from({ length: MAX_PEOPLE + 10 }, (_, i) => ({
      name: `P${i}`,
      colour: "#fff",
      selection: [],
    }));
    expect(readPeople(many)).toHaveLength(MAX_PEOPLE);
    const [long] = readPeople([
      {
        name: "n".repeat(MAX_NAME + 50),
        colour: "#fff",
        selection: Array.from({ length: MAX_SELECTED + 5 }, (_, i) => `e${i}`),
      },
    ]);
    expect(long!.name).toHaveLength(MAX_NAME);
    expect(long!.selection).toHaveLength(MAX_SELECTED);
  });
});

describe("the marks of a message", () => {
  const scene = new Map<string, PresenceShape>([
    ["api", box(100, 100)],
    ["db", box(300, 100)],
    [
      "save",
      {
        kind: "line",
        points: [
          { x: 200, y: 120 },
          { x: 300, y: 120 },
        ],
      },
    ],
  ]);
  const resolve = (id: string) => scene.get(id);

  it("skips the ids the scene does not hold, without a trace", () => {
    const marks = presenceMarks([person("Ben", ["ghost", "api", "", "x\u0000"])], resolve);
    expect(marks.map((m) => m.target)).toEqual(["api"]);
    expect(presenceMarks([person("Ben", ["ghost"])], resolve)).toEqual([]);
    expect(presenceMarks([], resolve)).toEqual([]);
  });

  it("draws an id listed twice once", () => {
    expect(presenceMarks([person("Ben", ["api", "api", "api"])], resolve)).toHaveLength(1);
  });

  it("ranks the people on one target in the order of the message", () => {
    const marks = presenceMarks(
      [person("Ben", ["api", "db"]), person("Ana", ["api"]), person("Li", ["ghost", "api"])],
      resolve,
    );
    const on = (target: string) =>
      marks.filter((m) => m.target === target).map((m) => [m.person.name, m.rank, m.stack]);
    expect(on("api")).toEqual([
      ["Ben", 0, 3],
      ["Ana", 1, 3],
      ["Li", 2, 3],
    ]);
    // A person alone on a target is rank 0 of a stack of one, and ghosts take no place.
    expect(on("db")).toEqual([["Ben", 0, 1]]);
  });

  it("keeps the number of marks bounded", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `e${i}`);
    const everywhere = () => box(0, 0);
    const people = [0, 1, 2, 3].map((i) => person(`P${i}`, ids));
    expect(presenceMarks(people, everywhere)).toHaveLength(MAX_MARKS);
    expect(presenceMarks(people, everywhere, 5)).toHaveLength(5);
  });
});

describe("where the outlines and the tags go", () => {
  const tagBox = (at: { x: number; y: number }) => ({
    x: at.x,
    y: at.y,
    width: 60,
    height: TAG_HEIGHT,
  });
  const overlap = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  const stack = (n: number, shape: PresenceShape) =>
    presenceMarks(
      Array.from({ length: n }, (_, i) => person(`P${i}`, ["t"])),
      () => shape,
    );

  it("puts a lone tag above the top-left corner of the box", () => {
    const [mark] = stack(1, box(100, 100));
    expect(tagPlacement(mark!)).toEqual({ x: 100, y: 100 - TAG_GAP - TAG_HEIGHT });
  });

  it("stacks the tags of people on the same box in a column that overlaps nothing", () => {
    const rect = { x: 100, y: 200, width: 100, height: 40 };
    const marks = stack(4, { kind: "box", box: rect });
    const tags = marks.map((m) => tagBox(tagPlacement(m)));
    for (let i = 0; i < tags.length; i++) {
      expect(overlap(tags[i]!, rect)).toBe(false);
      for (let j = i + 1; j < tags.length; j++) {
        expect(overlap(tags[i]!, tags[j]!), `${i} and ${j}`).toBe(false);
      }
    }
    // The first person's tag is the nearest to the box, and the column rises.
    const ys = tags.map((t) => t.y);
    expect(ys).toEqual([...ys].sort((a, b) => b - a));
    expect(new Set(tags.map((t) => t.x)).size).toBe(1);
  });

  it("puts the column below the box when it would leave the stage at the top", () => {
    const shape = box(100, 30, 100, 40);
    const marks = stack(3, shape);
    const tags = marks.map((m) => tagBox(tagPlacement(m)));
    for (const tag of tags) expect(tag.y).toBeGreaterThan(70);
    for (let i = 1; i < tags.length; i++) expect(tags[i]!.y).toBeGreaterThan(tags[i - 1]!.y);
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) expect(overlap(tags[i]!, tags[j]!)).toBe(false);
    }
    // One person with room above keeps the tag above.
    expect(tagPlacement(stack(1, box(100, 30))[0]!).y).toBeGreaterThanOrEqual(0);
    expect(tagPlacement(stack(1, box(100, 10))[0]!).y).toBeGreaterThan(10);
  });

  it("nests the outlines of several people on one box, the first on its border", () => {
    const shape = { x: 100, y: 100, width: 100, height: 40 };
    expect(outlineBox(shape, 0)).toEqual(shape);
    expect(outlineBox(shape, 2)).toEqual({
      x: 100 - 2 * RANK_STEP,
      y: 100 - 2 * RANK_STEP,
      width: 100 + 4 * RANK_STEP,
      height: 40 + 4 * RANK_STEP,
    });
    // The tags rise above the outermost outline.
    const marks = stack(3, { kind: "box", box: shape });
    for (const mark of marks) {
      expect(tagPlacement(mark).y + TAG_HEIGHT).toBeLessThanOrEqual(100 - 2 * RANK_STEP);
      expect(tagPlacement(mark).x).toBe(100 - 2 * RANK_STEP);
    }
  });

  it("draws the first person's line the widest and every next one narrower, over it", () => {
    const line: PresenceShape = {
      kind: "line",
      points: [
        { x: 10, y: 50 },
        { x: 110, y: 90 },
      ],
    };
    const marks = stack(3, line);
    expect(marks.map(lineWidth)).toEqual([LINE_WIDTH + 4, LINE_WIDTH + 2, LINE_WIDTH]);
    expect(boundsOf(line)).toEqual({ x: 10, y: 50, width: 100, height: 40 });
    expect(stack(1, line).map(lineWidth)).toEqual([LINE_WIDTH]);
  });

  it("puts the tag of a line above its bounds", () => {
    const line: PresenceShape = {
      kind: "line",
      points: [
        { x: 40, y: 200 },
        { x: 240, y: 200 },
        { x: 240, y: 300 },
      ],
    };
    const at = tagPlacement(stack(1, line)[0]!);
    expect(at.y + TAG_HEIGHT).toBeLessThanOrEqual(200);
    expect(at.x).toBeLessThanOrEqual(40);
  });
});

describe("the trail batch of a person", () => {
  const batch = (points: unknown, extra: Record<string, unknown> = {}) => ({
    batch: 7,
    points,
    ...extra,
  });
  const ten = Array.from({ length: 10 }, (_, i) => ({ x: 120 + i * 10, y: 80, t: i * 20 }));

  it("reads a batch that fits", () => {
    expect(readLaser(batch(ten))).toEqual({ batch: 7, points: ten });
    expect(readLaser(batch([]))).toEqual({ batch: 7, points: [] });
  });

  it("takes the longest batch, and not one more", () => {
    const edge = Array.from({ length: MAX_LASER_POINTS }, (_, i) => ({ x: i, y: 0, t: 0 }));
    expect(readLaser(batch(edge))?.points).toHaveLength(MAX_LASER_POINTS);
    expect(readLaser(batch([...edge, { x: 0, y: 0, t: 0 }]))).toBeUndefined();
  });

  it("refuses a point that is not two finite coordinates and an integer moment in range", () => {
    const point = { x: 1, y: 2, t: 3 };
    for (const bad of [
      { ...point, x: Number.NaN },
      { ...point, y: Infinity },
      { ...point, x: "1" },
      { ...point, x: 2_000_000 },
      { ...point, t: MAX_LASER_MS + 1 },
      { ...point, t: 5000 },
      { ...point, t: -1 },
      { ...point, t: 1.5 },
      { x: 1, y: 2 },
      null,
      "point",
    ]) {
      expect(readLaser(batch([point, bad])), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it("refuses a batch number that is not an integer, and anything that is not a batch", () => {
    expect(readLaser({ batch: 1.5, points: [] })).toBeUndefined();
    expect(readLaser({ batch: "7", points: [] })).toBeUndefined();
    expect(readLaser({ batch: 7, points: "none" })).toBeUndefined();
    expect(readLaser(null)).toBeUndefined();
    expect(readLaser([])).toBeUndefined();
  });

  it("reads the pen part of a stroke, its colour as #rrggbb, its number and its cancel", () => {
    const pen = { width: 4, colour: "#e03131", opacity: 1, stroke: 3 };
    const RED = { width: 4, colour: "#e03131", opacity: 1 };
    expect(readLaser(batch(ten, { pen }))).toEqual({
      batch: 7,
      points: ten,
      pen: { look: RED, stroke: 3, cancel: false },
    });
    expect(
      readLaser(batch(ten, { pen: { width: 20, colour: "#FFE600", opacity: 0.35, stroke: 0 } })),
    ).toEqual({
      batch: 7,
      points: ten,
      pen: { look: { width: 20, colour: "#ffe600", opacity: 0.35 }, stroke: 0, cancel: false },
    });
    // Escape: the batch that ends a cancelled stroke, with no points.
    expect(readLaser(batch([], { pen: { ...pen, cancel: true } }))).toEqual({
      batch: 7,
      points: [],
      pen: { look: RED, stroke: 3, cancel: true },
    });
    // The edges of the bounds fit.
    for (const edge of [
      { width: 1, colour: "#000", opacity: 0, stroke: 0 },
      { width: 64, colour: "rgb(224, 49, 49)", opacity: 1, stroke: 2_147_483_647 },
    ]) {
      expect(readLaser(batch(ten, { pen: edge }))?.pen?.look.width, JSON.stringify(edge)).toBe(
        edge.width,
      );
    }
  });

  it("drops the whole batch when its pen part does not fit", () => {
    const pen = { width: 4, colour: "#e03131", opacity: 1, stroke: 3 };
    for (const bad of [
      { ...pen, width: 900 },
      { ...pen, width: 0 },
      { ...pen, width: 4.5 },
      { ...pen, width: "4" },
      { ...pen, colour: `#${"e".repeat(32)}` },
      { ...pen, colour: 7 },
      { ...pen, opacity: 2 },
      { ...pen, opacity: -0.1 },
      { ...pen, opacity: Number.NaN },
      { ...pen, stroke: -1 },
      { ...pen, stroke: 2_147_483_648 },
      { ...pen, stroke: 2.5 },
      { ...pen, stroke: "3" },
      { ...pen, cancel: false },
      { ...pen, cancel: "yes" },
      { width: 4, colour: "#e03131", opacity: 1 },
      { width: 4, colour: "#e03131" },
      null,
      "pen",
    ]) {
      expect(readLaser(batch(ten, { pen: bad })), JSON.stringify(bad)).toBeUndefined();
    }
    // The person and their pointer stay.
    const [ben] = readPeople([
      {
        name: "Ben",
        colour: "#e03131",
        selection: [],
        pointer: { x: 120, y: 80 },
        laser: batch(ten, { pen: { ...pen, width: 900 } }),
      },
    ]);
    expect(ben!.laser).toBeUndefined();
    expect(ben!.pointer).toEqual({ x: 120, y: 80 });
  });

  it("draws a stroke whose colour cannot be read in the person's colour", () => {
    const pen = { width: 4, colour: "var(--x)", opacity: 1, stroke: 1 };
    expect(readLaser(batch(ten, { pen }))?.pen?.look.colour).toBe(FALLBACK_COLOUR);
    expect(readLaser(batch(ten, { pen }), "#1971c2")?.pen?.look.colour).toBe("#1971c2");
    const [ben] = readPeople([
      {
        name: "Ben",
        colour: "#E03131",
        selection: [],
        pointer: { x: 120, y: 80 },
        laser: batch(ten, { pen }),
      },
    ]);
    expect(ben!.laser?.pen).toEqual({
      look: { width: 4, colour: "#e03131", opacity: 1 },
      stroke: 1,
      cancel: false,
    });
  });

  it("rides on the person, and a batch that does not fit leaves the person and their pointer", () => {
    const [ben, eve] = readPeople([
      {
        name: "Ben",
        colour: "#e03131",
        selection: [],
        pointer: { x: 120, y: 80 },
        laser: batch(ten),
      },
      {
        name: "Eve",
        colour: "#1971c2",
        selection: [],
        pointer: { x: 5, y: 6 },
        laser: batch([{ x: Number.NaN, y: 0, t: 0 }]),
      },
    ]);
    expect(ben!.laser).toEqual({ batch: 7, points: ten });
    expect(eve!.laser).toBeUndefined();
    expect(eve!.pointer).toEqual({ x: 5, y: 6 });
  });
});

describe("the key of each person, for the strokes they draw", () => {
  const person = (name: string, colour: string, pointer?: { x: number; y: number }) =>
    readPeople([{ name, colour, selection: [], ...(pointer ? { pointer } : {}) }])[0]!;

  it("is the same whether or not their pointer is shown", () => {
    const ben = person("Ben", "#1c7ed6", { x: 1, y: 2 });
    const lifted = person("Ben", "#1c7ed6");
    expect(personKeys([ben])).toEqual(personKeys([lifted]));
  });

  it("tells apart two people of one name and colour by their order, pointer or not", () => {
    const one = person("Ben", "#1c7ed6");
    const two = person("Ben", "#1c7ed6", { x: 1, y: 2 });
    const ana = person("Ana", "#e03131");
    const keys = personKeys([one, ana, two]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toBe(keys[2]);
    expect(personKeys([one, two])).toEqual([keys[0], keys[2]]);
  });
});

describe("the colour the host names for the person at this canvas", () => {
  it("reads a colour as #rrggbb", () => {
    expect(readMe({ colour: "#E03131" })).toBe("#e03131");
    expect(readMe({ colour: "rgb(224, 49, 49)" })).toBe("#e03131");
  });

  it("is none for anything that is not a colour", () => {
    for (const bad of [undefined, null, {}, { colour: "red" }, { colour: 5 }, "#e03131"]) {
      expect(readMe(bad), String(bad)).toBeUndefined();
    }
  });
});
