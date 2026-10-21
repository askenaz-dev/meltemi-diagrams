import type { IconChoiceInfo, IconGroupInfo } from "@meltemi/diagrams-editor/canvas";
import { describe, expect, it } from "vitest";
import {
  RECENT_LIMIT,
  SEARCH_DEBOUNCE,
  pickerGroups,
  pickerPlace,
  stepIn,
  withRecent,
  type Cell,
} from "../src/icon-picker.js";
import { menuPlace } from "../src/panels.js";
import { placementIn, placementsFor } from "../src/placement.js";
import { TOOLTIP_DELAY } from "../src/tooltip.js";

const icon = (reference: string, label = reference.slice(reference.indexOf(":") + 1)) =>
  ({ reference, label, svg: "<svg/>" }) satisfies IconChoiceInfo;

const server = icon("tabler:server");
const database = icon("tabler:database");
const lambda = icon("aws:lambda", "AWS Lambda");
const postgres = icon("logos:postgresql", "PostgreSQL");

const TABLER: IconGroupInfo = {
  id: "tabler",
  kind: "pack",
  title: "Tabler Icons",
  items: [server, database],
};
const TECH: IconGroupInfo = {
  id: "tech",
  kind: "library",
  title: "Technology",
  items: [postgres],
};

describe("the icon picker's recent icons", () => {
  it("puts the icon chosen first, once, and forgets the oldest beyond the limit", () => {
    expect(withRecent([], server)).toEqual([server]);
    expect(withRecent([server, database], lambda)).toEqual([lambda, server, database]);
    // Chosen again, it moves to the front instead of being listed twice.
    expect(withRecent([lambda, server, database], database)).toEqual([database, lambda, server]);
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => icon(`tabler:i${i}`));
    const kept = withRecent(many, lambda);
    expect(kept).toHaveLength(RECENT_LIMIT);
    expect(kept[0]).toBe(lambda);
    expect(kept.some((r) => r.reference === `tabler:i${RECENT_LIMIT - 1}`)).toBe(false);
  });

  it("lists the recent icons first for an empty query, each icon once", () => {
    const groups = pickerGroups([database, lambda], [TABLER, TECH], "", "Recent");
    expect(groups.map((g) => [g.title, g.items.map((i) => i.reference)])).toEqual([
      ["Recent", ["tabler:database", "aws:lambda"]],
      ["Tabler Icons", ["tabler:server"]],
      ["Technology", ["logos:postgresql"]],
    ]);
  });

  it("shows only the session's groups for a query, and leaves empty groups out", () => {
    expect(pickerGroups([database], [TABLER], "serv", "Recent").map((g) => g.title)).toEqual([
      "Tabler Icons",
    ]);
    // A group whose icons are all among the recent ones is not shown empty.
    const only = pickerGroups([postgres], [TECH], " ", "Recent");
    expect(only.map((g) => g.id)).toEqual(["recent"]);
    expect(pickerGroups([], [], "", "Recent")).toEqual([]);
  });
});

describe("the arrow keys among the results", () => {
  // Two groups of five columns, 60 wide: the first with seven results, the second with three,
  // under a heading 24 high.
  const cells: Cell[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      x: (i % 5) * 60,
      y: Math.floor(i / 5) * 56,
      width: 58,
      height: 54,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({ x: i * 60, y: 136, width: 58, height: 54 })),
  ];

  it("goes left and right through the rows, and stays at the ends", () => {
    expect(stepIn(cells, 4, "ArrowRight")).toBe(5);
    expect(stepIn(cells, 5, "ArrowLeft")).toBe(4);
    expect(stepIn(cells, 0, "ArrowLeft")).toBe(0);
    expect(stepIn(cells, 9, "ArrowRight")).toBe(9);
  });

  it("goes up and down a row at the nearest column, across the groups", () => {
    expect(stepIn(cells, 1, "ArrowDown")).toBe(6);
    // The second row of the first group has two results: the nearest column is taken.
    expect(stepIn(cells, 4, "ArrowDown")).toBe(6);
    // From the last row of a group to the first row of the next.
    expect(stepIn(cells, 6, "ArrowDown")).toBe(8);
    expect(stepIn(cells, 8, "ArrowUp")).toBe(6);
    expect(stepIn(cells, 2, "ArrowUp")).toBe(2);
    expect(stepIn(cells, 9, "ArrowDown")).toBe(9);
  });

  it("starts at the first result, and finds none without results", () => {
    expect(stepIn(cells, -1, "ArrowDown")).toBe(0);
    expect(stepIn([], -1, "ArrowRight")).toBe(-1);
  });
});

describe("where the picker and the context menu open", () => {
  it("keeps the picker inside a short canvas, as tall as the room there is", () => {
    // The I button sits in the toolbar, above the main area: the picker opens at its top.
    const short = pickerPlace({ x: 300, y: 4 }, { width: 900, height: 198 }, 372, -30);
    expect(short).toEqual({ left: 300, top: 4, maxHeight: 186, side: "bottom" });
    expect(short.top! + short.maxHeight).toBeLessThanOrEqual(198);
    // Near the bottom of a tall one, raised to keep the room it wants.
    const low = pickerPlace({ x: 20, y: 600 }, { width: 1200, height: 800 }, 372);
    expect(low).toEqual({ left: 20, top: 472, maxHeight: 320, side: "bottom" });
    // Under its anchor with room to spare, it grows down to the edge.
    expect(pickerPlace({ x: 20, y: 100 }, { width: 1200, height: 800 }, 372).maxHeight).toBe(692);
    // Kept inside on the right.
    expect(pickerPlace({ x: 1100, y: 100 }, { width: 1200, height: 800 }, 372).left).toBe(820);
  });

  it("opens the picker over its anchor when the room below is short and above is larger", () => {
    const over = pickerPlace({ x: 20, y: 700 }, { width: 1200, height: 800 }, 372, 670);
    expect(over).toEqual({ left: 20, bottom: 134, maxHeight: 662, side: "top" });
  });

  it("keeps a context menu taller than the canvas inside it, its items scrolling", () => {
    const menu = menuPlace(
      { x: 300, y: 128 },
      { width: 1100, height: 368 },
      {
        width: 210,
        height: 684,
      },
    );
    expect(menu).toEqual({ left: 300, top: 4, maxHeight: 360 });
    expect(menu.top + menu.maxHeight).toBeLessThanOrEqual(368);
    // A menu that fits opens at the point, moved up and left only as far as it must.
    expect(
      menuPlace({ x: 1000, y: 300 }, { width: 1100, height: 600 }, { width: 210, height: 200 }),
    ).toEqual({ left: 886, top: 300, maxHeight: 592 });
    expect(
      menuPlace({ x: 10, y: 500 }, { width: 1100, height: 600 }, { width: 210, height: 200 }),
    ).toEqual({ left: 10, top: 396, maxHeight: 592 });
  });
});

describe("the placement control", () => {
  it("offers the icon alone on free compositions only", () => {
    expect(placementsFor(true)).toEqual(["icon", "box", "only"]);
    expect(placementsFor(false)).toEqual(["icon", "box"]);
    expect(placementIn("only", true)).toBe("only");
    // A flow diagram has no icon objects: the icon as the shape takes its place.
    expect(placementIn("only", false)).toBe("icon");
    expect(placementIn("box", false)).toBe("box");
  });
});

describe("the timings of the picker and the tooltips", () => {
  it("searches 80 ms after the typing rests, and shows a tooltip after 400 ms", () => {
    expect(SEARCH_DEBOUNCE).toBe(80);
    expect(TOOLTIP_DELAY).toBe(400);
  });
});
