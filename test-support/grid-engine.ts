// A relative import: the layout package itself type-checks this file with its tests.
import type { ArrangeRequest, Arrangement, LayoutEngine } from "../packages/layout/src/engine.js";

/**
 * A deterministic engine for tests: boxes in source order on one row, or one column for `TB` and
 * `BT`, 240 px apart. Edges get no points, so connectors follow the anchor rules.
 */
export const gridEngine: LayoutEngine = {
  name: "grid",
  arrange(request: ArrangeRequest): Arrangement {
    const vertical = request.direction === "TB" || request.direction === "BT";
    const centers = new Map(
      request.nodes.map((node, i) => [
        node.id,
        vertical ? { x: 100, y: 100 + i * 240 } : { x: 100 + i * 240, y: 100 },
      ]),
    );
    return { centers, routes: new Map() };
  },
};
