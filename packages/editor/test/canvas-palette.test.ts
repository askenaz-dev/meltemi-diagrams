import {
  SHAPE_SIZES as LAYOUT_SHAPE_SIZES,
  shapeOutline as layoutOutline,
} from "@meltemi/diagrams-layout";
import { BOX_SHAPES } from "@meltemi/diagrams-model";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARROW_KINDS,
  SHAPES,
  SHAPE_SIZES,
  arrowKindIn,
  arrowKindLine,
  arrowKinds,
  findShapes,
  nextArrowKind,
  shapeOutline,
  shapeSize,
} from "../src/canvas/index.js";

/** The Spanish names the canvas gives the shapes, to search as a Spanish interface does. */
const SPANISH: Readonly<Record<string, string>> = {
  rounded: "redondeada",
  rectangle: "rectángulo",
  square: "cuadrado",
  ellipse: "elipse",
  circle: "círculo",
  diamond: "rombo",
  cylinder: "cilindro",
  pill: "píldora",
  triangle: "triángulo",
  parallelogram: "paralelogramo",
  trapezoid: "trapecio",
  pentagon: "pentágono",
  hexagon: "hexágono",
  octagon: "octágono",
  star: "estrella",
  cloud: "nube",
  document: "documento",
  callout: "bocadillo",
  arrow: "flecha",
  framed: "con marco",
  flag: "bandera",
  person: "persona",
  agent: "agente",
  icon: "icono",
};

describe("the shapes of the palette", () => {
  it("are the language's twenty-four, sized and drawn as the layout does", () => {
    expect(SHAPES).toHaveLength(24);
    expect([...SHAPES]).toEqual([...BOX_SHAPES]);
    // The canvas's ghosts and free cells take the layout's own default sizes: the one table.
    expect(SHAPE_SIZES).toEqual(LAYOUT_SHAPE_SIZES);
    for (const shape of SHAPES) {
      expect(shapeSize(shape), shape).toEqual(LAYOUT_SHAPE_SIZES[shape]);
      const box = { x: 10, y: 20, width: 160, height: 80 };
      expect(shapeOutline(shape, box).d, shape).toBe(layoutOutline(shape, box).d);
    }
    expect(shapeSize("square")).toEqual({ width: 120, height: 120 });
    expect(shapeSize("rounded")).toEqual({ width: 160, height: 56 });
  });

  it("come from the layout's pure shapes module, so the canvas page loads no engine or model", () => {
    const canvas = fileURLToPath(new URL("../src/canvas/", import.meta.url));
    for (const file of readdirSync(canvas)) {
      const text = readFileSync(join(canvas, file), "utf8");
      expect(text, file).not.toMatch(/from "@meltemi\/diagrams-layout"/);
      expect(text, file).not.toMatch(/^import (?!type )[^;]*from "@meltemi\/diagrams-model"/m);
    }
    const shapes = readFileSync(
      fileURLToPath(new URL("../../layout/src/shapes.ts", import.meta.url)),
      "utf8",
    );
    const imports = [...shapes.matchAll(/^import (type )?[^;]*?from "([^"]+)"/gm)].map(
      (m) => `${m[1] ?? ""}${m[2]}`,
    );
    expect(imports).toEqual(["type @meltemi/diagrams-model", "./geometry.js"]);
  });

  it("finds a shape by its English name as it is typed, best first", () => {
    const english = (shape: string) => shape;
    expect(findShapes("", english)).toEqual([...SHAPES]);
    expect(findShapes("   ", english)).toEqual([...SHAPES]);
    expect(findShapes("sta", english)).toEqual(["star"]);
    expect(findShapes("hex", english)).toEqual(["hexagon"]);
    expect(findShapes("HEX", english)).toEqual(["hexagon"]);
    // Names that start with it first, then names that contain it, each in palette order.
    expect(findShapes("p", english).slice(0, 4)).toEqual([
      "pill",
      "parallelogram",
      "pentagon",
      "person",
    ]);
    expect(findShapes("gon", english)).toEqual(["pentagon", "hexagon", "octagon"]);
    expect(findShapes("blob", english)).toEqual([]);
  });

  it("finds a shape by its name in the interface language, without accents, or in English", () => {
    const spanish = (shape: string) => SPANISH[shape]!;
    expect(findShapes("est", spanish)[0]).toBe("star");
    // English still works under a Spanish interface.
    expect(findShapes("sta", spanish)).toEqual(["star"]);
    expect(findShapes("triangulo", spanish)).toEqual(["triangle"]);
    expect(findShapes("Rómbo", spanish)).toEqual(["diamond"]);
    // A word of a name of several words.
    expect(findShapes("marco", spanish)).toEqual(["framed"]);
    // "flecha" in Spanish and "flag" in English, in palette order.
    expect(findShapes("fl", spanish)).toEqual(["arrow", "flag"]);
  });
});

describe("the kinds of arrow of the relation tool", () => {
  it("are the four arrows, cycled in order by R", () => {
    expect(ARROW_KINDS).toEqual(["->", "-->", "<->", "<-->"]);
    expect(arrowKinds("flow")).toEqual(ARROW_KINDS);
    expect(arrowKinds("free")).toEqual(ARROW_KINDS);
    const cycle = ["->"] as (typeof ARROW_KINDS)[number][];
    for (let i = 0; i < 4; i++) cycle.push(nextArrowKind(cycle[cycle.length - 1]!, "free"));
    expect(cycle).toEqual(["->", "-->", "<->", "<-->", "->"]);
  });

  it("leave the two-way kinds out of C4 views, and sequence diagrams have none", () => {
    expect(arrowKinds("c4")).toEqual(["->", "-->"]);
    expect(nextArrowKind("->", "c4")).toBe("-->");
    expect(nextArrowKind("-->", "c4")).toBe("->");
    // A two-way kind chosen elsewhere is drawn one way in a view, keeping its line.
    expect(arrowKindIn("<->", "c4")).toBe("->");
    expect(arrowKindIn("<-->", "c4")).toBe("-->");
    expect(nextArrowKind("<->", "c4")).toBe("-->");
    expect(arrowKindIn("<->", "flow")).toBe("<->");
    expect(arrowKinds("sequence")).toEqual([]);
    expect(nextArrowKind("-->", "sequence")).toBe("-->");
  });

  it("are written with a line and heads at one end or both; Shift swaps the line", () => {
    expect(arrowKindLine("->")).toEqual({ line: "solid", twoWay: false });
    expect(arrowKindLine("-->")).toEqual({ line: "dashed", twoWay: false });
    expect(arrowKindLine("<->")).toEqual({ line: "solid", twoWay: true });
    expect(arrowKindLine("<-->")).toEqual({ line: "dashed", twoWay: true });
    expect(arrowKindLine("->", true)).toEqual({ line: "dashed", twoWay: false });
    expect(arrowKindLine("-->", true)).toEqual({ line: "solid", twoWay: false });
    expect(arrowKindLine("<-->", true)).toEqual({ line: "solid", twoWay: true });
  });
});
